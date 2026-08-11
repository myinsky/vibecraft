/**
 * page-html-serve.ts
 * HTML 앱 섹션 콘텐츠를 AES-256-GCM으로 암호화하여 서빙.
 * 일회성 토큰 방식으로 URL 직접 접근 및 재사용 차단.
 *
 * 흐름:
 *  1. GET /api/page-html-token/:pageId/:sectionId
 *     → 일회성 토큰 발급 (DB 저장, 5분 TTL)
 *  2. GET /api/page-html/:pageId/:sectionId?token=xxx
 *     → AES-256-GCM 암호화된 HTML + IV + key 반환 (JSON)
 *     → 토큰 즉시 무효화 (1회 사용)
 *  3. 클라이언트 iframe: Web Crypto API로 복호화 후 srcdoc 렌더링
 */
import type { Express, Request, Response } from "express";
import { createCipheriv, randomBytes } from "crypto";
import { getCustomPageById } from "./db";
import { sdk } from "./_core/sdk";
import { COOKIE_NAME } from "@shared/const";
import { parse as parseCookies } from "cookie";
import { getDb } from "./db";
import { htmlTokens } from "../drizzle/schema";
import { eq, lt } from "drizzle-orm";

// ─── AES-256-GCM 암호화 ──────────────────────────────────────────────────────
function aesEncrypt(plaintext: string): { encrypted: string; key: string; iv: string; tag: string } {
  const key = randomBytes(32); // 256-bit key
  const iv = randomBytes(12);  // 96-bit IV (GCM 권장)
  const cipher = createCipheriv("aes-256-gcm", key, iv);
  const enc1 = cipher.update(plaintext, "utf8");
  const enc2 = cipher.final();
  const encrypted = Buffer.concat([enc1, enc2]);
  const tag = cipher.getAuthTag();
  return {
    encrypted: encrypted.toString("base64"),
    key: key.toString("base64"),
    iv: iv.toString("base64"),
    tag: tag.toString("base64"),
  };
}

// ─── 페이지 슬러그 주입 ─────────────────────────────────────────────────────
function injectPageSlug(html: string, slug: string): string {
  const script = `<script id="__page-slug-inject">window.__PAGE_SLUG__=${JSON.stringify(slug)};</script>`;
  if (/<\/head>/i.test(html)) return html.replace(/<\/head>/i, `${script}\n</head>`);
  if (/<html[^>]*>/i.test(html)) return html.replace(/<html[^>]*>/i, (m) => `${m}\n${script}`);
  return script + "\n" + html;
}

// ─── 이전 서버 주입 키 초기화 스크립트 삽입 ────────────────────────────────────
/**
 * 이전에 서버가 localStorage에 자동 주입했던 키를 제거합니다.
 * 단, 사용자가 직접 입력·저장한 키는 유지됩니다.
 * 구분 방법: 서버 주입 키는 '__admin_injected__' 마커와 함께 저장됩니다.
 * 마커가 없는 키(사용자 직접 입력)는 건드리지 않습니다.
 *
 * 또한, 과거 버전에서 마커 없이 주입된 키를 한 번만 정리합니다.
 * 정리 여부는 '__admin_inject_cleared_v1' 플래그로 추적합니다.
 */
function injectClearOldAdminKeys(html: string): string {
  // 과거 서버가 주입했던 키를 한 번만 강제 제거
  // '__admin_inject_cleared_v2' 플래그가 없으면 제거 후 플래그 설정
  // 이후 사용자가 직접 저장한 키는 플래그와 무관하게 유지됨
  const script = `<script id="__admin-key-clear">
(function(){
  var FLAG='__admin_inject_cleared_v2';
  if(localStorage.getItem(FLAG)) return;
  ['yt_v2_yt','yt_v2_yt2','yt_v2_gm'].forEach(function(k){
    localStorage.removeItem(k);
  });
  localStorage.setItem(FLAG,'1');
})();
</script>`;
  if (/<\/head>/i.test(html)) return html.replace(/<\/head>/i, `${script}\n</head>`);
  if (/<html[^>]*>/i.test(html)) return html.replace(/<html[^>]*>/i, (m) => `${m}\n${script}`);
  return script + '\n' + html;
}

// ─── 관리자 전용 요소 숨김 CSS 주입 ─────────────────────────────────────────
function injectAdminHideStyle(html: string): string {
  const css = `<style id="__admin-hide-style">
  #openSettings,[data-admin-only]{display:none!important;visibility:hidden!important;pointer-events:none!important;}
</style>`;
  if (/<\/head>/i.test(html)) return html.replace(/<\/head>/i, `${css}\n</head>`);
  if (/<html[^>]*>/i.test(html)) return html.replace(/<html[^>]*>/i, (m) => `${m}\n${css}`);
  return css + "\n" + html;
}

// ─── 세션 쿠키에서 admin 여부 확인 ──────────────────────────────────────────
async function resolveIsAdmin(cookieHeader: string): Promise<boolean> {
  const cookies = parseCookies(cookieHeader);
  const sessionToken = cookies[COOKIE_NAME];
  if (!sessionToken) return false;
  try {
    const session = await sdk.verifySession(sessionToken);
    if (!session) return false;
    const { getUserByOpenId } = await import("./db");
    const user = await getUserByOpenId(session.openId);
    return user?.role === "admin";
  } catch {
    return false;
  }
}

// ─── 세션 쿠키 유효성 확인 ───────────────────────────────────────────────────
async function resolveIsLoggedIn(cookieHeader: string): Promise<boolean> {
  const cookies = parseCookies(cookieHeader);
  const sessionToken = cookies[COOKIE_NAME];
  if (!sessionToken) return false;
  try {
    const session = await sdk.verifySession(sessionToken).catch(() => null);
    return !!session;
  } catch {
    return false;
  }
}

// ─── VCX 공개 데이터 API (page21 HTML 앱용) ─────────────────────────────────
// GET /api/vcx-data
// 응답: { developers: [...], apps: [...] }
// 개발자: isDeveloper=true인 사용자 (username, bio, profileImage, appCount, activityPoints)
// 앱: published=true + (approved or direct) 인 앱 목록
export async function registerVcxDataRoute(app: Express) {
  app.get('/api/vcx-data', async (_req: Request, res: Response) => {
    try {
      const db = await getDb();
      if (!db) { res.status(500).json({ error: 'DB not available' }); return; }
      const { users, vibeApps } = await import('../drizzle/schema');
      const { eq, and, or, count, desc } = await import('drizzle-orm');

      // 개발자 목록 (isDeveloper=true)
      const devRows = await db
        .select({
          id: users.id,
          username: users.username,
          name: users.name,
          bio: users.bio,
          profileImage: users.profileImage,
          isFeaturedDeveloper: users.isFeaturedDeveloper,
          featuredOrder: users.featuredOrder,
          createdAt: users.createdAt,
        })
        .from(users)
        .where(eq(users.isDeveloper, true))
        .orderBy(desc(users.isFeaturedDeveloper), users.featuredOrder, users.createdAt);

      // 개발자별 앱 수
      const appCounts = await db
        .select({ authorId: vibeApps.authorId, cnt: count() })
        .from(vibeApps)
        .where(and(
          eq(vibeApps.published, true),
          or(eq(vibeApps.submissionStatus, 'approved'), eq(vibeApps.submissionStatus, 'direct'))
        ))
        .groupBy(vibeApps.authorId);
      const countMap = new Map(appCounts.map(r => [r.authorId, r.cnt]));

      const developers = devRows.map(d => ({
        nick: d.username || d.name || '익명',
        bio: d.bio || '',
        avatar: d.profileImage || null,
        badge: d.isFeaturedDeveloper ? 'PRO' : 'DEV',
        apps: countMap.get(d.id) ?? 0,
        isFeatured: d.isFeaturedDeveloper,
        featuredOrder: d.featuredOrder,
      }));

      // 앱 목록 (published=true, approved or direct)
      const appRows = await db
        .select({
          id: vibeApps.id,
          name: vibeApps.name,
          description: vibeApps.description,
          category: vibeApps.category,
          thumbnail: vibeApps.thumbnail,
          gradient: vibeApps.gradient,
          appUrl: vibeApps.appUrl,
          likeCount: vibeApps.likeCount,
          viewCount: vibeApps.viewCount,
          authorId: vibeApps.authorId,
          createdAt: vibeApps.createdAt,
        })
        .from(vibeApps)
        .where(and(
          eq(vibeApps.published, true),
          or(eq(vibeApps.submissionStatus, 'approved'), eq(vibeApps.submissionStatus, 'direct'))
        ))
        .orderBy(desc(vibeApps.likeCount), desc(vibeApps.viewCount));

      // authorId → username 매핑
      const devMap = new Map(devRows.map(d => [d.id, d.username || d.name || '익명']));

      const apps = appRows.map(a => ({
        id: a.id,
        name: a.name,
        desc: a.description,
        category: a.category || 'AI',
        thumb: a.thumbnail || null,
        bg: a.gradient || 'linear-gradient(135deg,#667eea,#764ba2)',
        appUrl: a.appUrl || null,
        likes: a.likeCount,
        views: a.viewCount,
        devName: devMap.get(a.authorId) || '익명',
        devHandle: '@' + (devMap.get(a.authorId) || '익명'),
      }));

      res.set('Cache-Control', 'public, max-age=30, stale-while-revalidate=120');
      res.json({ developers, apps });
    } catch (err) {
      console.error('[vcx-data] Error:', err);
      res.status(500).json({ error: 'Internal Server Error' });
    }
  });
}

export function registerPageHtmlServeRoute(app: Express) {
  // VCX 데이터 API 등록
  registerVcxDataRoute(app);

  // ── 1단계: 일회성 토큰 발급 ────────────────────────────────────────────────
  app.get("/api/page-html-token/:pageId/:sectionId", async (req: Request, res: Response) => {
    try {
      const pageId = parseInt(req.params.pageId, 10);
      const sectionId = req.params.sectionId;
      if (isNaN(pageId) || !sectionId) { res.status(400).json({ error: "Bad Request" }); return; }

      const page = await getCustomPageById(pageId);
      if (!page) { res.status(404).json({ error: "Not Found" }); return; }

      const cookieHeader = req.headers.cookie || "";
      const isAdmin = await resolveIsAdmin(cookieHeader);

      // 미발행 페이지는 관리자만 접근 가능
      if (!page.published && !isAdmin) { res.status(404).json({ error: "Not Found" }); return; }

      // membersOnly 체크
      if (page.membersOnly) {
        const loggedIn = await resolveIsLoggedIn(cookieHeader);
        if (!loggedIn) { res.status(403).json({ error: "로그인이 필요합니다." }); return; }
      }

      // 일회성 토큰 생성 (32바이트 랜덤, 5분 TTL)
      const token = randomBytes(32).toString("hex");
      const expiresAt = Date.now() + 5 * 60 * 1000; // 5분

      // DB에 저장 (다중 인스턴스 환경에서도 공유 가능)
      const db = await getDb();
      if (!db) throw new Error("DB not available");
      await db.insert(htmlTokens).values({
        token,
        pageId,
        sectionId,
        isAdmin: isAdmin ? 1 : 0,
        expiresAt,
      });

      // 만료된 토큰 비동기 정리 (fire-and-forget)
      db.delete(htmlTokens).where(lt(htmlTokens.expiresAt, Date.now())).catch(() => {});

      res.json({ token });
    } catch (err) {
      console.error("[page-html-token] Error:", err);
      res.status(500).json({ error: "Internal Server Error" });
    }
  });

  // ── 2단계: 암호화된 HTML 반환 (토큰 1회 사용) ────────────────────────────
  app.get("/api/page-html/:pageId/:sectionId", async (req: Request, res: Response) => {
    try {
      const pageId = parseInt(req.params.pageId, 10);
      const sectionId = req.params.sectionId;
      const token = req.query.token as string | undefined;
      if (isNaN(pageId) || !sectionId) { res.status(400).json({ error: "Bad Request" }); return; }

      // 토큰 검증
      if (!token) {
        res.status(403).json({ error: "토큰이 필요합니다." });
        return;
      }

      // DB에서 토큰 조회
      const db = await getDb();
      if (!db) { res.status(500).json({ error: "DB not available" }); return; }
      const [entry] = await db.select().from(htmlTokens).where(eq(htmlTokens.token, token)).limit(1);

      if (!entry || entry.expiresAt < Date.now() || entry.pageId !== pageId || entry.sectionId !== sectionId) {
        res.status(403).json({ error: "유효하지 않거나 만료된 토큰입니다." });
        return;
      }

      // 토큰 즉시 무효화 (1회 사용)
      await db.delete(htmlTokens).where(eq(htmlTokens.token, token));

      const isAdmin = entry.isAdmin === 1;

      const page = await getCustomPageById(pageId);
      if (!page) { res.status(404).json({ error: "Not Found" }); return; }
      // 미발행 페이지는 관리자만 접근 가능
      if (!page.published && !isAdmin) { res.status(404).json({ error: "Not Found" }); return; }

      // sectionsJson 파싱
      let sections: any[] = [];
      try { sections = JSON.parse(page.sectionsJson || "[]"); } catch {
        res.status(500).json({ error: "Invalid page data" }); return;
      }
      const section = sections.find((s: any) => s.id === sectionId);
      if (!section || section.type !== "html") {
        res.status(404).json({ error: "Section not found" }); return;
      }

      let html: string = section.content || "";
      if (!html.trim()) { res.status(204).send(""); return; }

      // 비관리자에게 관리자 전용 요소 숨김 CSS 주입
      if (!isAdmin) html = injectAdminHideStyle(html);

      // 페이지 슬러그를 window.__PAGE_SLUG__로 주입 (API 프록시 키 연결에 사용)
      html = injectPageSlug(html, page.slug);

      // 과거 서버가 localStorage에 자동 주입했던 키를 한 번만 정리
      // (사용자가 직접 저장한 키는 이후에도 유지됨)
      html = injectClearOldAdminKeys(html);

      // AES-256-GCM 암호화
      const { encrypted, key, iv, tag } = aesEncrypt(html);

      // 캐시 금지 (일회성 토큰이므로 캐시 불가)
      res.set({
        "Content-Type": "application/json; charset=utf-8",
        "Cache-Control": "no-store, no-cache, must-revalidate",
        "X-Content-Type-Options": "nosniff",
      });
      res.json({ encrypted, key, iv, tag });
    } catch (err) {
      console.error("[page-html-serve] Error:", err);
      res.status(500).json({ error: "Internal Server Error" });
    }
  });
}
