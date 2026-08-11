/**
 * RSS 2.0 피드 자동 생성 라우트
 *
 * GET /rss.xml
 *  - 최근 발행된 게시물 50개를 RSS 2.0 형식으로 제공
 *  - 구글 피드버너, Feedly, 네이버 블로그 이웃 등 RSS 리더 지원
 *  - 검색엔진 콘텐츠 수집 가속화 및 구독자 유입 채널 확보
 *
 * 캐시: 1시간 (Cache-Control: public, max-age=3600)
 * 캐시 무효화: purgeRssCache() 호출 또는 게시물 발행/수정 시 자동 연동
 */

import type { Express, Request, Response } from "express";
import { getAllPosts, getSiteConfigAll } from "./db";
import { purgeCache as purgeSitemapCache } from "./sitemap";

// ─── RSS 전용 인메모리 캐시 ──────────────────────────────────────────────────
const RSS_CACHE_TTL_MS = 60 * 60 * 1000; // 1시간

interface RssCache {
  xml: string;
  builtAt: number;
}

let rssCache: RssCache | null = null;

/** RSS 캐시 무효화 (다음 요청 시 재생성) */
export function purgeRssCache(): void {
  rssCache = null;
}

/** RSS + Sitemap + DB 캐시 동시 무효화 (발행 이벤트에서 호출) */
export function purgeAllCaches(): void {
  rssCache = null;
  purgeSitemapCache();
  // 게시글 관련 DB 캐시도 무효화 (카테고리별 포스트 목록, 최신글, 고정글)
  try {
    const { cache } = require('./cache');
    cache.invalidate('posts:cat');
    cache.invalidate('posts:all');
    cache.invalidate('posts:latest');
    cache.invalidate('posts:pinned');
    cache.invalidate('post:slug:');  // 슬러그 캐시 전체 무효화
    cache.invalidate('post:id:');    // id 캐시 전체 무효화
  } catch {
    // cache 모듈 로드 실패 시 무시
  }
}

// ─── XML 유틸리티 ────────────────────────────────────────────────────────────

/** XML 특수문자 이스케이프 */
function escapeXml(str: string): string {
  if (!str) return "";
  return str
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

/** HTML 태그 제거 (description 텍스트 추출용) */
function stripHtml(html: string): string {
  if (!html) return "";
  return html
    .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, "")
    .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, "")
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/** RFC 822 날짜 형식 (RSS 2.0 표준) */
function toRfc822(date: Date | string | number | null | undefined): string {
  if (!date) return new Date().toUTCString();
  return new Date(date).toUTCString();
}

// ─── RSS 2.0 XML 빌더 ────────────────────────────────────────────────────────

interface RssItem {
  title: string;
  link: string;
  description: string;
  pubDate: string;
  guid: string;
  category?: string;
  thumbnail?: string | null;
}

interface RssChannelMeta {
  title: string;
  link: string;
  description: string;
  language: string;
  lastBuildDate: string;
  rssLink: string;
}

function buildRssXml(channel: RssChannelMeta, items: RssItem[]): string {
  const itemsXml = items
    .map(item => {
      const lines = [
        `    <item>`,
        `      <title>${escapeXml(item.title)}</title>`,
        `      <link>${escapeXml(item.link)}</link>`,
        `      <description>${escapeXml(item.description)}</description>`,
        `      <pubDate>${item.pubDate}</pubDate>`,
        `      <guid isPermaLink="true">${escapeXml(item.guid)}</guid>`,
      ];
      if (item.category) {
        lines.push(`      <category>${escapeXml(item.category)}</category>`);
      }
      if (item.thumbnail) {
        lines.push(`      <enclosure url="${escapeXml(item.thumbnail)}" type="image/jpeg" length="0" />`);
        // media:thumbnail (Google, Feedly 등 지원)
        lines.push(`      <media:thumbnail xmlns:media="http://search.yahoo.com/mrss/" url="${escapeXml(item.thumbnail)}" />`);
      }
      lines.push(`    </item>`);
      return lines.join("\n");
    })
    .join("\n");

  return [
    `<?xml version="1.0" encoding="UTF-8"?>`,
    `<rss version="2.0"`,
    `  xmlns:atom="http://www.w3.org/2005/Atom"`,
    `  xmlns:media="http://search.yahoo.com/mrss/"`,
    `  xmlns:content="http://purl.org/rss/1.0/modules/content/">`,
    `  <channel>`,
    `    <title>${escapeXml(channel.title)}</title>`,
    `    <link>${escapeXml(channel.link)}</link>`,
    `    <description>${escapeXml(channel.description)}</description>`,
    `    <language>${channel.language}</language>`,
    `    <lastBuildDate>${channel.lastBuildDate}</lastBuildDate>`,
    `    <atom:link href="${escapeXml(channel.rssLink)}" rel="self" type="application/rss+xml" />`,
    `    <generator>WordCracker Blog RSS Generator</generator>`,
    itemsXml,
    `  </channel>`,
    `</rss>`,
  ].join("\n");
}

// ─── RSS 라우트 등록 ─────────────────────────────────────────────────────────

const RSS_MAX_ITEMS = 50; // 최대 게시물 수

export function registerRssRoute(app: Express) {
  app.get("/rss.xml", async (req: Request, res: Response) => {
    try {
      // 캐시 히트 시 즉시 반환
      if (rssCache && Date.now() - rssCache.builtAt < RSS_CACHE_TTL_MS) {
        res.set({
          "Content-Type": "application/rss+xml; charset=utf-8",
          "Cache-Control": "public, max-age=3600",
          "X-Cache": "HIT",
        });
        return res.status(200).send(rssCache.xml);
      }

      // 사이트 설정 및 게시물 조회
      const [config, allPosts] = await Promise.all([
        getSiteConfigAll(),
        getAllPosts(),
      ]);

      const baseUrl = (config.siteUrl || "").replace(/\/$/, "") ||
        `${req.protocol}://${req.get("host")}`;
      const rssUrl = `${baseUrl}/rss.xml`;

      // 채널 메타 정보
      const channel: RssChannelMeta = {
        title: config.siteTitle || "블로그",
        link: baseUrl,
        description: config.siteDescription || "",
        language: "ko",
        lastBuildDate: toRfc822(new Date()),
        rssLink: rssUrl,
      };

      // 최신 게시물 최대 50개를 RSS 아이템으로 변환
      const recentPosts = allPosts.slice(0, RSS_MAX_ITEMS);
      const items: RssItem[] = recentPosts.map(post => {
        const postPath = (post as any).customSlug
          ? `/p/${(post as any).customSlug}`
          : (post as any).slug
          ? `/p/${(post as any).slug}`
          : `/post/${post.id}`;
        const postUrl = `${baseUrl}${postPath}`;

        // description: excerpt 우선, 없으면 본문 텍스트 앞 200자
        const rawDescription = post.excerpt
          ? post.excerpt
          : stripHtml(post.content || "").slice(0, 200) +
            (stripHtml(post.content || "").length > 200 ? "..." : "");

        // 썸네일 URL 절대경로 변환: 네이버 등 RSS 유효성 검사를 위해 https://로 시작하는 절대 URL 필수
        const rawThumbnail = post.thumbnail || null;
        const thumbnail = rawThumbnail
          ? (rawThumbnail.startsWith("http://") || rawThumbnail.startsWith("https://")
            ? rawThumbnail
            : `${baseUrl}${rawThumbnail.startsWith("/") ? rawThumbnail : "/" + rawThumbnail}`)
          : null;

        return {
          title: post.title || "(제목 없음)",
          link: postUrl,
          description: rawDescription,
          pubDate: toRfc822(post.createdAt),
          guid: postUrl,
          category: (post as any).category || undefined,
          thumbnail,
        };
      });

      const xml = buildRssXml(channel, items);

      // 캐시 저장
      rssCache = { xml, builtAt: Date.now() };

      res.set({
        "Content-Type": "application/rss+xml; charset=utf-8",
        "Cache-Control": "public, max-age=3600",
        "X-Cache": "MISS",
      });
      return res.status(200).send(xml);
    } catch (err) {
      console.error("[rss] 생성 오류:", err);
      res.status(500).send("rss.xml 생성 중 오류가 발생했습니다.");
    }
  });
}
