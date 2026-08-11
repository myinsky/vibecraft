/**
 * sitemap.xml 자동 생성 라우트
 *
 * GET /sitemap.xml
 *  - 게시된 포스트 (published=true) 전체 URL
 *  - 카테고리 페이지 URL (navItems 기반)
 *  - 정적 페이지 (홈, 최신글)
 *
 * 우선순위(priority) 및 변경 빈도(changefreq) 기준:
 *  - 홈: 1.0 / daily
 *  - 카테고리: 0.8 / weekly
 *  - 포스트: 0.6 / monthly
 *
 * 캐시: 1시간 (Cache-Control: public, max-age=3600)
 */

import type { Express, Request, Response } from "express";
import { getAllPosts, getSiteConfigAll, getNavItemsFromDb, getPublishedCustomPages, getPostsByCategory, getAllTags, getPostsByTag } from "./db";

/** XML 특수문자 이스케이프 */
function escapeXml(str: string): string {
  return str
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

/** ISO 8601 날짜 문자열 반환 (YYYY-MM-DD) */
function toISODate(date: Date | string | number): string {
  return new Date(date).toISOString().split("T")[0];
}

interface SitemapImage {
  loc: string;
  title?: string;
  caption?: string;
}
interface SitemapEntry {
  loc: string;
  lastmod?: string;
  changefreq?: "always" | "hourly" | "daily" | "weekly" | "monthly" | "yearly" | "never";
  priority?: number;
  images?: SitemapImage[];
}

function buildSitemapXml(entries: SitemapEntry[]): string {
  const urls = entries
    .map(entry => {
      const lines = [`  <url>`, `    <loc>${escapeXml(entry.loc)}</loc>`];
      if (entry.lastmod) lines.push(`    <lastmod>${entry.lastmod}</lastmod>`);
      if (entry.changefreq) lines.push(`    <changefreq>${entry.changefreq}</changefreq>`);
      if (entry.priority !== undefined) lines.push(`    <priority>${entry.priority.toFixed(1)}</priority>`);
      // 이미지 태그 (Google Image Sitemap 확장)
      if (entry.images && entry.images.length > 0) {
        for (const img of entry.images) {
          lines.push(`    <image:image>`);
          lines.push(`      <image:loc>${escapeXml(img.loc)}</image:loc>`);
          if (img.title) lines.push(`      <image:title>${escapeXml(img.title)}</image:title>`);
          if (img.caption) lines.push(`      <image:caption>${escapeXml(img.caption)}</image:caption>`);
          lines.push(`    </image:image>`);
        }
      }
      lines.push(`  </url>`);
      return lines.join("\n");
    })
    .join("\n");

  return [
    `<?xml version="1.0" encoding="UTF-8"?>`,
    `<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9"
        xmlns:image="http://www.google.com/schemas/sitemap-image/1.1">`,
    urls,
    `</urlset>`,
  ].join("\n");
}

// ─── 인메모리 사이트맵 캐시 ─────────────────────────────────────────────────
const CACHE_TTL_MS = 60 * 60 * 1000; // 1시간

interface SitemapCache {
  xml: string;
  builtAt: number; // Date.now()
}

let sitemapCache: SitemapCache | null = null;

/** 캐시 무효화 (다음 요청 시 재생성) */
export function purgeCache(): void {
  sitemapCache = null;
}

/** 캐시 상태 반환 (관리자 UI 표시용) */
export function getCacheStatus(): { cached: boolean; builtAt: number | null; ageMs: number | null } {
  if (!sitemapCache) return { cached: false, builtAt: null, ageMs: null };
  return {
    cached: true,
    builtAt: sitemapCache.builtAt,
    ageMs: Date.now() - sitemapCache.builtAt,
  };
}

/** robots.txt 내용 생성 */
function buildRobotsTxt(sitemapUrl: string, rssUrl: string): string {
  return [
    "User-agent: *",
    "Allow: /",
    "",
    "# 관리자 및 인증 필요 페이지 크롤링 제외",
    "Disallow: /admin",
    "Disallow: /admin/",
    "Disallow: /write",
    "Disallow: /write/",
    "Disallow: /drafts",
    "Disallow: /settings/",
    "Disallow: /analytics",
    "Disallow: /analytics/",
    "Disallow: /api/",
    "Disallow: /404",
    "Disallow: /component-showcase",
    "",
    `# sitemap 위치`,
    `Sitemap: ${sitemapUrl}`,
    "",
    `# RSS 피드`,
    `# ${rssUrl}`,
    "",
  ].join("\n");
}

export function registerRobotsRoute(app: Express) {
  app.get("/robots.txt", async (req: Request, res: Response) => {
    try {
      const config = await getSiteConfigAll();
      const baseUrl = (config.siteUrl || "").replace(/\/$/, "") ||
        `${req.protocol}://${req.get("host")}`;
      const sitemapUrl = `${baseUrl}/sitemap.xml`;
      const rssUrl = `${baseUrl}/rss.xml`;
      const content = buildRobotsTxt(sitemapUrl, rssUrl);
      res.setHeader("Content-Type", "text/plain; charset=utf-8");
      res.setHeader("Cache-Control", "public, max-age=3600");
      res.status(200).send(content);
    } catch (err) {
      console.error("[robots.txt] 생성 오류:", err);
      res.status(500).send("Internal Server Error");
    }
  });
}

export function registerSitemapPurgeRoute(app: Express) {
  // POST /api/sitemap/purge — 사이트맵 캐시 무효화 (관리자 전용)
  app.post("/api/sitemap/purge", async (req: Request, res: Response) => {
    try {
      purgeCache();
      console.log("[sitemap] 캐시 무효화 완료");
      res.json({ ok: true, message: "사이트맵 캐시가 초기화되었습니다. 다음 요청 시 재생성됩니다." });
    } catch (err) {
      console.error("[sitemap] purge 오류:", err);
      res.status(500).json({ ok: false, message: "캐시 초기화 중 오류가 발생했습니다." });
    }
  });

  // GET /api/sitemap/status — 캐시 상태 조회 (관리자 UI용)
  app.get("/api/sitemap/status", (_req: Request, res: Response) => {
    res.json(getCacheStatus());
  });
}

export function registerSitemapRoute(app: Express) {
  app.get("/sitemap.xml", async (req: Request, res: Response) => {
    try {
      // 캐시 히트 시 즉시 반환
      if (sitemapCache && Date.now() - sitemapCache.builtAt < CACHE_TTL_MS) {
        res.set({
          "Content-Type": "application/xml; charset=utf-8",
          "Cache-Control": "public, max-age=3600",
          "X-Cache": "HIT",
        });
        return res.status(200).send(sitemapCache.xml);
      }

      // 사이트 베이스 URL 결정
      // 1순위: DB siteConfig의 siteUrl
      // 2순위: 요청 헤더에서 추론 (프록시 환경 대응)
      const config = await getSiteConfigAll();
      const baseUrl = (config.siteUrl || "").replace(/\/$/, "") ||
        `${req.protocol}://${req.get("host")}`;

      const entries: SitemapEntry[] = [];

      // ── 1. 정적 페이지 ─────────────────────────────────────────────────────
      entries.push({
        loc: baseUrl + "/",
        changefreq: "daily",
        priority: 1.0,
        lastmod: toISODate(new Date()),
      });

      // ── 1-1. 정책 페이지 (애드센스 승인 필수 페이지) ──────────────────────────
      const policyPages = [
        { path: "/about", priority: 0.7 },
        { path: "/privacy", priority: 0.5 },
        { path: "/terms", priority: 0.5 },
        { path: "/contact", priority: 0.6 },
      ];
      for (const page of policyPages) {
        entries.push({
          loc: baseUrl + page.path,
          changefreq: "monthly",
          priority: page.priority,
          lastmod: toISODate(new Date()),
        });
      }

      // ── 2. 카테고리 페이지 (navItems 기반) ────────────────────────────────
      // 글이 0개인 카테고리는 noindex 처리되므로 사이트맵에서도 제외
      try {
        const navItems = await getNavItemsFromDb();
        // __latest__, /drafts, /admin, /write, /settings 등 색인 불필요 경로 제외
        const EXCLUDED_PATH_KEYWORDS = ['__latest__', '/drafts', '/admin', '/write', '/settings', '/404', '/component-showcase'];
        const visibleNavItems = navItems.filter(item => {
          if (item.visible === false || !item.path) return false;
          const p = item.path!;
          if (EXCLUDED_PATH_KEYWORDS.some(ex => p.includes(ex))) return false;
          return true;
        });
        for (const item of visibleNavItems) {
          const path = item.path!;
          let loc: string;
          if (path.startsWith("http")) {
            // 절대 URL인 경우: 같은 사이트 도메인이면 포함, 외부 도메인이면 제외
            try {
              const url = new URL(path);
              const base = new URL(baseUrl);
              if (url.hostname !== base.hostname) continue;
              loc = path;
            } catch {
              continue;
            }
          } else {
            loc = baseUrl + path;
          }

          // /category/:key 경로인 경우 글 수 확인 — 0개이면 사이트맵 제외
          const categoryKeyMatch = path.match(/^\/category\/([^/?#]+)/);
          if (categoryKeyMatch) {
            const categoryKey = decodeURIComponent(categoryKeyMatch[1]);
            // 이메일/특수문자 카테고리 제외
            const isEmail = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(categoryKey);
            const isSpecialOnly = /^[$@%^*=<>|\\!~`]+$/.test(categoryKey);
            if (isEmail || isSpecialOnly) continue;
            try {
              const catPosts = await getPostsByCategory(categoryKey, 1);
              if (!catPosts || catPosts.length === 0) {
                // 글 0개 카테고리 → 사이트맵 제외 (noindex와 일관성 유지)
                continue;
              }
            } catch {
              // DB 오류 시 포함 유지 (보수적 처리)
            }
          }

          entries.push({
            loc,
            changefreq: "weekly",
            priority: 0.8,
            lastmod: toISODate(new Date()),
          });
        }
      } catch {
        // navItems 조회 실패 시 무시하고 계속 진행
      }

      // ── 2-1. 태그 페이지 (/tag/:tag) — 글이 1개 이상인 태그만 포함 ────────────
      // 이메일/특수문자 태그 및 글 0개 태그는 noindex이므로 사이트맵에서도 제외
      try {
        const allTags = await getAllTags(); // { tag: string; count: number }[]
        for (const { tag, count } of allTags) {
          if (count < 3) continue; // 글 3개 미만 태그 제외 (애드센스 품질 개선)
          // 이메일 형식 태그 제외
          if (/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(tag)) continue;
          // 특수문자만으로 구성된 태그 제외
          if (/^[$@%^*=<>|\\!~`]+$/.test(tag) || tag.startsWith('#')) continue;
          entries.push({
            loc: `${baseUrl}/tag/${encodeURIComponent(tag)}`,
            changefreq: "weekly",
            priority: 0.5,
            lastmod: toISODate(new Date()),
          });
        }
      } catch {
        // 태그 조회 실패 시 무시하고 계속 진행
      }
      // ── 3. 커스텀 페이지 (/page/:slug) ───────────────────────────────────────
      try {
        const customPageList = await getPublishedCustomPages();
        for (const cp of customPageList) {
          entries.push({
            loc: baseUrl + `/page/${cp.slug}`,
            lastmod: toISODate((cp as any).updatedAt || (cp as any).createdAt || new Date()),
            changefreq: "weekly",
            priority: 0.7,
          });
        }
      } catch {
        // 커스텀 페이지 조회 실패 시 무시하고 계속 진행
      }

      // ── 4. 게시된 포스트 ─────────────────────────────────────────────────────
      const posts = await getAllPosts();

      /**
       * 조회수 기반 priority 자동 계산
       *
       * 전체 게시글의 조회수 분포를 기준으로 4단계 priority를 부여합니다.
       *  - 상위 10% (조회수 ≥ p90) → 0.9  (인기 글)
       *  - 상위 10~30% (p70 ≤ v < p90) → 0.8  (준인기 글)
       *  - 상위 30~70% (p30 ≤ v < p70) → 0.7  (일반 글)
       *  - 하위 30% (v < p30)           → 0.6  (신규/저조회수 글)
       *
       * 게시글이 1개 이하이거나 조회수가 모두 0이면 일괄 0.6 적용
       */
      const calcPostPriority = (viewCount: number, p30: number, p70: number, p90: number): number => {
        if (viewCount >= p90) return 0.9;
        if (viewCount >= p70) return 0.8;
        if (viewCount >= p30) return 0.7;
        return 0.6;
      };

      // 퍼센타일 계산 (정렬 후 인덱스 기반)
      const viewCounts = posts
        .map(p => (p as any).viewCount as number ?? 0)
        .sort((a, b) => a - b);

      const percentile = (sorted: number[], pct: number): number => {
        if (sorted.length === 0) return 0;
        const idx = Math.floor(sorted.length * pct);
        return sorted[Math.min(idx, sorted.length - 1)];
      };

      const p30 = percentile(viewCounts, 0.3);
      const p70 = percentile(viewCounts, 0.7);
      const p90 = percentile(viewCounts, 0.9);
      // 모든 조회수가 동일하면 구분 불가 → 일괄 0.6
      const allSame = viewCounts.every(v => v === viewCounts[0]);

      // changefreq 결정: 최근 30일 이내 수정된 글은 weekly, 그 외 monthly
      const thirtyDaysAgo = Date.now() - 30 * 24 * 60 * 60 * 1000;

      for (const post of posts) {
        // customSlug(직접 입력 SEO 슬러그) 우선, 없으면 자동 slug, 둘 다 없으면 /post/:id
        const rawCustomSlug = (post as any).customSlug as string | undefined;
        const rawSlug = (post as any).slug as string | undefined;
        const canonicalSlug = rawCustomSlug || rawSlug;
        const encodedSlug = canonicalSlug
          ? canonicalSlug.split('/').map((seg: string) => encodeURIComponent(seg)).join('/')
          : null;
        const postPath = encodedSlug ? `/p/${encodedSlug}` : `/post/${post.id}`;

        // 조회수 기반 priority
        const vc = (post as any).viewCount as number ?? 0;
        const priority = allSame ? 0.6 : calcPostPriority(vc, p30, p70, p90);

        // changefreq: 최근 30일 수정 여부
        const lastModTs = post.updatedAt ? new Date(post.updatedAt).getTime() : 0;
        const changefreq: SitemapEntry["changefreq"] = lastModTs >= thirtyDaysAgo ? "weekly" : "monthly";

        // 썸네일 이미지가 있으면 image 태그 포함
        const thumbnail = (post as any).thumbnail as string | undefined;
        const imageEntry: SitemapImage[] = [];
        if (thumbnail) {
          const imgLoc = thumbnail.startsWith('http') ? thumbnail : `${baseUrl}${thumbnail}`;
          imageEntry.push({
            loc: imgLoc,
            title: (post as any).title || undefined,
          });
        }
        entries.push({
          loc: baseUrl + postPath,
          lastmod: toISODate(post.updatedAt || post.createdAt),
          changefreq,
          priority,
          ...(imageEntry.length > 0 ? { images: imageEntry } : {}),
        });
      }

      // 중복 URL 제거 (같은 loc가 여러 번 등장하면 첫 번째만 유지)
      const seen = new Set<string>();
      const uniqueEntries = entries.filter(e => {
        if (seen.has(e.loc)) return false;
        seen.add(e.loc);
        return true;
      });

      const xml = buildSitemapXml(uniqueEntries);

      // 인메모리 캐시에 저장
      sitemapCache = { xml, builtAt: Date.now() };

      res.set({
        "Content-Type": "application/xml; charset=utf-8",
        "Cache-Control": "public, max-age=3600",
        "X-Cache": "MISS",
      });
      res.status(200).send(xml);
    } catch (err) {
      console.error("[sitemap] 생성 오류:", err);
      res.status(500).send("sitemap.xml 생성 중 오류가 발생했습니다.");
    }
  });
}
