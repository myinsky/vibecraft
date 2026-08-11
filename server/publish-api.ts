/**
 * 자동화 발행 API
 * POST /api/publish            - API 키 인증으로 게시물 발행 (즉시 또는 예약)
 * GET  /api/publish/ping       - API 키 유효성 확인
 * GET  /api/publish/categories - 사용 가능한 카테고리 목록 조회
 * GET  /api/publish/logs       - 최근 자동 발행 로그 조회 (API 키 인증)
 *
 * 인증: Authorization: Bearer <api_key>  또는  X-API-Key: <api_key>
 */

import type { Express, Request, Response } from "express";
import DOMPurify from "isomorphic-dompurify";
import { verifyApiKey, createPost, getNavItemsFromDb, getDb, getSiteConfigAll, getPostById } from "./db";
import { publishLogs } from "../drizzle/schema";
import { eq, desc } from "drizzle-orm";
import { notifyGoogleIndexing } from "./googleIndexing";
import { notifyIndexNow } from "./indexnow";
import { purgeAllCaches } from "./rss";
import { invalidateHomeDataCache } from "./metaInjector";
import { invalidateMetaHtmlCache } from "./_core/vite";

function extractApiKey(req: Request): string | null {
  const auth = req.headers["authorization"];
  if (auth?.startsWith("Bearer ")) return auth.slice(7).trim();
  const xKey = req.headers["x-api-key"];
  if (typeof xKey === "string") return xKey.trim();
  return null;
}

async function getAllowedCategories(): Promise<string[]> {
  try {
    const items = await getNavItemsFromDb();
    const keys = items
      .filter(i => i.visible && i.path.startsWith("/category/"))
      .map(i => i.path.replace("/category/", "").trim())
      .filter(Boolean);
    return keys.length > 0 ? keys : ["ai-apps", "ai-tools", "my-apps", "resources"];
  } catch {
    return ["ai-apps", "ai-tools", "my-apps", "resources"];
  }
}

export function registerPublishApiRoutes(app: Express) {
  // ── CORS: 외부 자동화 도구(로컬 HTML 앱 등)에서 호출 허용 ──
  const publishCors = (_req: Request, res: Response, next: () => void) => {
    res.setHeader("Access-Control-Allow-Origin", "*");
    res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
    res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization, X-API-Key");
    next();
  };
  // OPTIONS preflight 처리
  app.options("/api/ping", publishCors, (_req, res) => res.sendStatus(204));
  app.options("/api/post", publishCors, (_req, res) => res.sendStatus(204));
  app.options("/api/publish/ping", publishCors, (_req, res) => res.sendStatus(204));
  app.options("/api/publish", publishCors, (_req, res) => res.sendStatus(204));
  app.options("/api/publish/categories", publishCors, (_req, res) => res.sendStatus(204));

  // ── 카테고리 목록 조회 ─────────────────────────────────────
  app.get("/api/publish/categories", publishCors, async (_req: Request, res: Response) => {
    const categories = await getAllowedCategories();
    res.json({ ok: true, categories });
  });

  // ── 단축 경로: /api/ping, /api/post (외부 자동화 도구 호환) ──────────────
  app.get("/api/ping", publishCors, async (req: Request, res: Response) => {
    const rawKey = extractApiKey(req);
    if (!rawKey) { res.status(401).json({ ok: false, error: "API 키가 없습니다." }); return; }
    const user = await verifyApiKey(rawKey);
    if (!user) { res.status(401).json({ ok: false, error: "유효하지 않은 API 키입니다." }); return; }
    const categories = await getAllowedCategories();
    res.json({ ok: true, user: { id: user.id, name: user.name }, categories });
  });
  // /api/post 단축 경로: 내부적으로 /api/publish로 리다이렉트 (307 = 메서드 유지)
  app.post("/api/post", publishCors, (_req: Request, res: Response) => {
    res.redirect(307, "/api/publish");
  });

  // ── Ping / 키 유효성 확인 ──────────────────────────────────
  app.get("/api/publish/ping", publishCors, async (req: Request, res: Response) => {
    const rawKey = extractApiKey(req);
    if (!rawKey) {
      res.status(401).json({ ok: false, error: "API 키가 없습니다. Authorization: Bearer <key> 헤더를 사용하세요." });
      return;
    }
    const user = await verifyApiKey(rawKey);
    if (!user) {
      res.status(401).json({ ok: false, error: "유효하지 않거나 만료된 API 키입니다." });
      return;
    }
    const categories = await getAllowedCategories();
    res.json({ ok: true, user: { id: user.id, name: user.name }, categories });
  });

  // ── 최근 발행 로그 조회 ────────────────────────────────────
  app.get("/api/publish/logs", publishCors, async (req: Request, res: Response) => {
    const rawKey = extractApiKey(req);
    if (!rawKey) {
      res.status(401).json({ ok: false, error: "API 키가 없습니다." });
      return;
    }
    const user = await verifyApiKey(rawKey);
    if (!user) {
      res.status(401).json({ ok: false, error: "유효하지 않거나 만료된 API 키입니다." });
      return;
    }
    try {
      const db = await getDb();
      if (!db) { res.json({ ok: true, logs: [] }); return; }
      const logs = await db
        .select()
        .from(publishLogs)
        .where(eq(publishLogs.userId, user.id))
        .orderBy(desc(publishLogs.createdAt))
        .limit(50);
      res.json({ ok: true, logs });
    } catch (err) {
      console.error("[PublishAPI] logs error:", err);
      res.status(500).json({ ok: false, error: "로그 조회 중 오류가 발생했습니다." });
    }
  });

  // ── 게시물 발행 ────────────────────────────────────────────
  app.post("/api/publish", publishCors, async (req: Request, res: Response) => {
    // 1. API 키 인증
    const rawKey = extractApiKey(req);
    if (!rawKey) {
      res.status(401).json({ ok: false, error: "API 키가 없습니다. Authorization: Bearer <key> 헤더를 사용하세요." });
      return;
    }
    const user = await verifyApiKey(rawKey);
    if (!user) {
      res.status(401).json({ ok: false, error: "유효하지 않거나 만료된 API 키입니다." });
      return;
    }

    // 2. 입력 검증
    const {
      title, content, category, excerpt, thumbnail,
      tag, badge, published, scheduledAt, coupangKeywords,
    } = req.body as Record<string, string | boolean | string[] | undefined>;

    if (!title || typeof title !== "string" || title.trim().length === 0) {
      res.status(400).json({ ok: false, error: "title 필드는 필수입니다." });
      return;
    }
    if (!content || typeof content !== "string" || content.trim().length === 0) {
      res.status(400).json({ ok: false, error: "content 필드는 필수입니다." });
      return;
    }

    const allowedCategories = await getAllowedCategories();
    if (!category || !allowedCategories.includes(category as string)) {
      res.status(400).json({
        ok: false,
        error: `category 필드는 필수이며 다음 중 하나여야 합니다: ${allowedCategories.join(", ")}`,
      });
      return;
    }

    // 3. 예약 발행 시각 파싱
    let parsedScheduledAt: Date | null = null;
    let isScheduled = false;
    if (typeof scheduledAt === "string" && scheduledAt.trim()) {
      const d = new Date(scheduledAt);
      if (isNaN(d.getTime())) {
        res.status(400).json({
          ok: false,
          error: "scheduledAt 형식이 잘못되었습니다. ISO 8601 형식을 사용하세요. 예: 2026-05-15T09:00:00Z",
        });
        return;
      }
      parsedScheduledAt = d;
      isScheduled = d.getTime() > Date.now();
    }

    // 4. HTML sanitize
    // HTML 소스 글(완전한 HTML 문서)인지 확인
    const isFullHtmlDoc = /^\s*<!DOCTYPE/i.test(content as string) || /^\s*<html/i.test(content as string);
    let sanitizedContent: string;
    if (isFullHtmlDoc) {
      // 완전한 HTML 문서: 구조를 그대로 보존하되 스크립트만 제거
      sanitizedContent = DOMPurify.sanitize(content as string, {
        WHOLE_DOCUMENT: true,
        FORCE_BODY: false,
        ADD_TAGS: ["html", "head", "body", "meta", "title", "link", "style"],
        ADD_ATTR: ["charset", "name", "content", "http-equiv", "property",
          "href", "src", "alt", "title", "target", "rel",
          "class", "style", "id", "type", "checked",
          "colspan", "rowspan", "data-type",
          "border", "cellpadding", "cellspacing", "width", "height",
          "align", "valign", "bgcolor"],
        ALLOW_DATA_ATTR: true,
        FORBID_TAGS: ["script", "iframe", "object", "embed"],
        FORBID_ATTR: ["onerror", "onload", "onclick", "onmouseover"],
      });
    } else {
      // 일반 HTML 조각: 기존 방식
      sanitizedContent = DOMPurify.sanitize(content as string, {
        ALLOWED_TAGS: [
          "p", "br", "strong", "em", "u", "s", "code", "pre", "blockquote",
          "h1", "h2", "h3", "h4", "h5", "h6",
          "ul", "ol", "li", "a", "img", "hr", "mark", "del",
          "table", "thead", "tbody", "tr", "th", "td",
          "div", "span", "label", "input", "section", "article",
          "figure", "figcaption", "caption", "header", "footer",
        ],
        ALLOWED_ATTR: [
          "href", "src", "alt", "title", "target", "rel",
          "class", "style", "id", "data-type", "type", "checked",
          "colspan", "rowspan", "border", "cellpadding", "cellspacing",
          "width", "height", "align", "valign",
        ],
        ALLOW_DATA_ATTR: true,
      });
    }

    const plainText = sanitizedContent.replace(/<[^>]+>/g, "");
    const autoExcerpt = typeof excerpt === "string" && excerpt.trim()
      ? excerpt.trim()
      : plainText.slice(0, 120) + (plainText.length > 120 ? "..." : "");

    // 5. 썸네일 자동 추출 (본문 첫 이미지)
    let finalThumbnail: string | null = null;
    if (typeof thumbnail === "string" && thumbnail.trim()) {
      finalThumbnail = thumbnail.trim();
    } else {
      const imgMatch = sanitizedContent.match(/<img[^>]+src=["']([^"']+)["']/i);
      if (imgMatch) finalThumbnail = imgMatch[1];
    }

    // 6. DB 저장
    try {
      const shouldPublish = isScheduled ? false : (published === false ? false : true);
      // coupangKeywords 파싱: 배열 또는 쉼표 구분 문자열 모두 허용
      let parsedCoupangKeywords: string[] | null = null;
      if (Array.isArray(coupangKeywords) && coupangKeywords.length > 0) {
        parsedCoupangKeywords = (coupangKeywords as string[])
          .map((k: string) => String(k).trim())
          .filter(Boolean)
          .slice(0, 3);
      } else if (typeof coupangKeywords === "string" && coupangKeywords.trim()) {
        parsedCoupangKeywords = coupangKeywords
          .split(",")
          .map((k: string) => k.trim())
          .filter(Boolean)
          .slice(0, 3);
      }

      const result = await createPost({
        title: (title as string).trim().slice(0, 200),
        content: sanitizedContent,
        excerpt: autoExcerpt,
        thumbnail: finalThumbnail,
        category: category as string,
        tag: typeof tag === "string" ? tag.trim().slice(0, 50) || null : null,
        badge: typeof badge === "string" ? badge.trim().slice(0, 30) || null : null,
        authorId: user.id,
        published: shouldPublish,
        status: shouldPublish ? "published" : "draft",
        scheduledAt: parsedScheduledAt,
        coupangKeywords: parsedCoupangKeywords ? JSON.stringify(parsedCoupangKeywords) : null,
      } as any);

      const postId = (result as any).insertId ?? null;
      const finalStatus = isScheduled ? "scheduled" : (shouldPublish ? "published" : "draft");

      // 8. 즉시 발행 시 캐시 무효화 + IndexNow + Google Indexing API 알림
      if (shouldPublish && !isScheduled && postId) {
        purgeAllCaches();
        invalidateHomeDataCache();
        invalidateMetaHtmlCache();
        try {
          const _pac = await getSiteConfigAll();
          const _pab = (_pac.siteUrl || "https://vibecraftx.com").replace(/\/$/, "");
          // 생성된 게시물의 slug 조회 (createPost는 id만 반환하므로 별도 조회)
          const _createdPost = await getPostById(postId);
          const _papSlug = _createdPost?.customSlug || _createdPost?.slug;
          const _pap = _papSlug ? `/p/${encodeURIComponent(_papSlug)}` : `/post/${postId}`;
          notifyIndexNow(`${_pab}${_pap}`).catch(() => {});
          notifyGoogleIndexing(`${_pab}${_pap}`).catch(() => {});
        } catch {
          // 알림 실패는 무시
        }
      }

      // 7. 발행 로그 기록
      try {
        const db = await getDb();
        if (db) {
          await db.insert(publishLogs).values({
            userId: user.id,
            postId,
            title: (title as string).trim().slice(0, 200),
            category: category as string,
            status: finalStatus,
            scheduledAt: parsedScheduledAt,
            keyName: "",
          });
        }
      } catch (logErr) {
        console.warn("[PublishAPI] 로그 기록 실패:", logErr);
      }

      res.status(201).json({
        ok: true,
        postId,
        status: finalStatus,
        scheduledAt: parsedScheduledAt?.toISOString() ?? null,
        message: isScheduled
          ? `게시물이 ${parsedScheduledAt!.toISOString()} 에 발행 예약되었습니다.`
          : "게시물이 성공적으로 발행되었습니다.",
      });
    } catch (err: unknown) {
      console.error("[PublishAPI] DB error:", err);
      res.status(500).json({ ok: false, error: "게시물 저장 중 오류가 발생했습니다." });
    }
  });
}
