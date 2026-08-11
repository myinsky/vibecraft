/**
 * API Proxy for HTML apps (page02, page04, etc.)
 * Proxies PageSpeed, SafeBrowsing, and Gemini API calls server-side
 * so that API keys are never exposed to the client.
 *
 * Key priority:
 *   1. 페이지에 연결된 키 (proxy_key_page_links 기반)
 *   2. 전역 DB 키 (proxy_api_keys에서 keyType 일치하는 첫 번째)
 *   3. ENV 환경변수 키 (GEMINI_API_KEY, GOOGLE_API_KEY)
 *
 * Endpoints:
 *   GET  /api/proxy/pagespeed?url=...&strategy=...&pageSlug=...
 *   POST /api/proxy/safebrowsing?pageSlug=...  { body: {...} }
 *   POST /api/proxy/gemini?model=...&pageSlug=...  { body: {...} }
 *   GET  /api/proxy/gemini-models?pageSlug=...
 *   GET  /api/proxy/key-status  → { gemini: boolean, google: boolean }
 */

import { Router, Request, Response } from "express";
import { ENV } from "./_core/env.js";
import { getProxyApiKey, hasProxyApiKey, getProxyApiKeyForPage } from "./db.js";

/**
 * Referer 헤더에서 /page/:slug 패턴을 추출한다.
 * iframe 내부 앱이 pageSlug를 명시하지 않아도 자동으로 페이지 연결 키를 사용할 수 있다.
 */
function extractSlugFromReferer(referer?: string): string | undefined {
  if (!referer) return undefined;
  try {
    const url = new URL(referer);
    const match = url.pathname.match(/^\/page\/([^/?#]+)/);
    return match?.[1];
  } catch {
    return undefined;
  }
}

/**
 * 페이지 slug가 주어지면 해당 페이지에 연결된 키를 우선 사용
 * 연결된 키 없으면 전역 DB 키, 그것도 없으면 ENV 키 폴백
 */
export async function resolveProxyKey(
  keyName: "gemini" | "google",
  pageSlug?: string
): Promise<string | null> {
  return resolveKey(keyName, pageSlug);
}

async function resolveKey(keyName: "gemini" | "google", pageSlug?: string): Promise<string | null> {
  // 1. 페이지 연결 키 우선
  if (pageSlug) {
    const pageKey = await getProxyApiKeyForPage(pageSlug, keyName);
    if (pageKey && pageKey.length > 0) return pageKey;
  }
  // 2. 전역 DB 키 (keyType 일치하는 첫 번째)
  const dbKey = await getProxyApiKey(keyName);
  if (dbKey && dbKey.length > 0) return dbKey;
  // 3. ENV 키 폴백
  if (keyName === "gemini") return ENV.geminiApiKey || null;
  if (keyName === "google") return ENV.googleApiKey || null;
  return null;
}

/** 요청이 관리자인지 확인 (JWT 쿠키 기반) */
async function isAdminRequest(req: Request): Promise<boolean> {
  try {
    const { sdk } = await import("./_core/sdk.js");
    const user = await sdk.authenticateRequest(req);
    return user?.role === "admin";
  } catch {
    return false;
  }
}

export function registerApiProxyRoutes(app: Router) {
  // ── API 키 존재 여부 확인 (값은 반환하지 않음) ──────────────────────────────────
  app.get("/api/proxy/key-status", async (_req: Request, res: Response) => {
    const [hasGemini, hasGoogle] = await Promise.all([
      hasProxyApiKey("gemini"),
      hasProxyApiKey("google"),
    ]);
    const geminiOk = hasGemini || !!(ENV.geminiApiKey);
    const googleOk = hasGoogle || !!(ENV.googleApiKey);
    res.json({ gemini: geminiOk, google: googleOk });
  });

  // ── PageSpeed Insights ──────────────────────────────────────────────────────
  app.get("/api/proxy/pagespeed", async (req: Request, res: Response) => {
    const { url, strategy, locale, pageSlug: qsPageSlug } = req.query as Record<string, string>;
    if (!url) {
      res.status(400).json({ error: "url parameter required" });
      return;
    }
    const pageSlug = qsPageSlug || extractSlugFromReferer(req.headers.referer);
    const key = await resolveKey("google", pageSlug);
    if (!key) {
      res.status(503).json({ error: "PageSpeed API key not configured. Please set it in API settings." });
      return;
    }
    try {
      const params = new URLSearchParams({ url });
      if (strategy) params.set("strategy", strategy);
      if (locale) params.set("locale", locale);
      const categories = req.query.category;
      if (Array.isArray(categories)) {
        categories.forEach((cat) => params.append("category", cat as string));
      } else if (typeof categories === "string") {
        params.append("category", categories);
      }
      params.set("key", key);
      const upstream = `https://www.googleapis.com/pagespeedonline/v5/runPagespeed?${params.toString()}`;
      const response = await fetch(upstream);
      const data = await response.json();
      res.status(response.status).json(data);
    } catch (e: any) {
      res.status(502).json({ error: e.message });
    }
  });

  // ── Safe Browsing ───────────────────────────────────────────────────────────
  app.post("/api/proxy/safebrowsing", async (req: Request, res: Response) => {
    const { pageSlug: qsPageSlug } = req.query as Record<string, string>;
    const pageSlug = qsPageSlug || extractSlugFromReferer(req.headers.referer);
    const key = await resolveKey("google", pageSlug);
    if (!key) {
      res.status(503).json({ error: "Safe Browsing API key not configured. Please set it in API settings." });
      return;
    }
    try {
      const upstream = `https://safebrowsing.googleapis.com/v4/threatMatches:find?key=${encodeURIComponent(key)}`;
      const response = await fetch(upstream, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(req.body),
      });
      const data = await response.json();
      res.status(response.status).json(data);
    } catch (e: any) {
      res.status(502).json({ error: e.message });
    }
  });

  // ── Gemini generateContent ──────────────────────────────────────────────────
  app.post("/api/proxy/gemini", async (req: Request, res: Response) => {
    const { model, pageSlug: qsPageSlug } = req.query as Record<string, string>;
    const pageSlug = qsPageSlug || extractSlugFromReferer(req.headers.referer);
    const key = await resolveKey("gemini", pageSlug);
    if (!key) {
      res.status(503).json({ error: "Gemini API key not configured. Please set it in API settings." });
      return;
    }
    if (!model) {
      res.status(400).json({ error: "model parameter required" });
      return;
    }
    try {
      const upstream = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent?key=${encodeURIComponent(key)}`;
      const response = await fetch(upstream, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(req.body),
      });
      const data = await response.json();
      res.status(response.status).json(data);
    } catch (e: any) {
      res.status(502).json({ error: e.message });
    }
  });

  // ── Gemini model list ───────────────────────────────────────────────────────
  app.get("/api/proxy/gemini-models", async (req: Request, res: Response) => {
    const { pageSlug: qsPageSlug } = req.query as Record<string, string>;
    const pageSlug = qsPageSlug || extractSlugFromReferer(req.headers.referer);
    const key = await resolveKey("gemini", pageSlug);
    if (!key) {
      res.status(503).json({ error: "Gemini API key not configured. Please set it in API settings." });
      return;
    }
    try {
      const upstream = `https://generativelanguage.googleapis.com/v1beta/models?key=${encodeURIComponent(key)}`;
      const response = await fetch(upstream);
      const data = await response.json();
      res.status(response.status).json(data);
    } catch (e: any) {
      res.status(502).json({ error: e.message });
    }
  });
}
