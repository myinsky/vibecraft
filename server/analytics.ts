/**
 * analytics.ts - 방문자 추적 및 통계 집계 헬퍼
 */
import { getDb } from "./db";
import { visitLogs, postScrollStats, posts, postTags, navItems } from "../drizzle/schema";
import { eq, sql, and, gte, ne, desc, count, isNotNull, inArray } from "drizzle-orm";
import type { Request } from "express";

// ─── 디바이스/브라우저 파싱 ───────────────────────────────────────────────────

export function parseUserAgent(ua: string): {
  deviceType: "desktop" | "mobile" | "tablet" | "other";
  browser: string;
  os: string;
} {
  const lower = ua.toLowerCase();

  let deviceType: "desktop" | "mobile" | "tablet" | "other" = "desktop";
  if (/tablet|ipad|playbook|silk/.test(lower)) {
    deviceType = "tablet";
  } else if (/mobile|android|iphone|ipod|blackberry|windows phone/.test(lower)) {
    deviceType = "mobile";
  } else if (/bot|crawler|spider|crawl|slurp|googlebot/.test(lower)) {
    deviceType = "other";
  }

  let browser = "other";
  if (/edg\//.test(lower)) browser = "Edge";
  else if (/opr\/|opera/.test(lower)) browser = "Opera";
  else if (/chrome\//.test(lower)) browser = "Chrome";
  else if (/safari\//.test(lower) && !/chrome/.test(lower)) browser = "Safari";
  else if (/firefox\//.test(lower)) browser = "Firefox";
  else if (/msie|trident/.test(lower)) browser = "IE";

  let os = "other";
  if (/windows/.test(lower)) os = "Windows";
  else if (/mac os x|macos/.test(lower)) os = "macOS";
  else if (/android/.test(lower)) os = "Android";
  else if (/iphone|ipad|ipod/.test(lower)) os = "iOS";
  else if (/linux/.test(lower)) os = "Linux";

  return { deviceType, browser, os };
}

export function parseReferrer(referrer: string): "direct" | "search" | "social" | "referral" | "other" {
  if (!referrer) return "direct";
  const lower = referrer.toLowerCase();
  if (/google|bing|naver|daum|yahoo|baidu|duckduckgo/.test(lower)) return "search";
  if (/facebook|twitter|instagram|youtube|tiktok|linkedin|threads|kakao/.test(lower)) return "social";
  return "referral";
}

/**
 * 검색엔진 referrer URL에서 검색 키워드를 추출합니다.
 * Google: q=, Naver: query=, Bing: q=, Daum: q=, Yahoo: p=, Baidu: wd=, DuckDuckGo: q=
 */
export function parseSearchKeyword(referrer: string): string | null {
  if (!referrer) return null;
  try {
    const url = new URL(referrer);
    const hostname = url.hostname.toLowerCase();
    const isSearchEngine = /google\.|bing\.|naver\.|daum\.|yahoo\.|baidu\.|duckduckgo\./.test(hostname);
    if (!isSearchEngine) return null;

    // 검색엔진별 쿼리 파라미터
    const paramNames = ["q", "query", "p", "wd", "text", "keyword"];
    for (const param of paramNames) {
      const val = url.searchParams.get(param);
      if (val && val.trim()) {
        return val.trim().slice(0, 300);
      }
    }
    return null;
  } catch {
    return null;
  }
}

// ─── 방문 로그 기록 ───────────────────────────────────────────────────────────

export async function recordVisit(params: {
  sessionId: string;
  path: string;
  postId?: number;
  userId?: number;
  userRole: "guest" | "user" | "admin";
  req: Request;
}) {
  const ua = params.req.headers["user-agent"] || "";
  const referrer = params.req.headers["referer"] || "";
  const { deviceType, browser, os } = parseUserAgent(ua);
  const referrerType = parseReferrer(referrer);
  const searchKeyword = parseSearchKeyword(referrer);

  try {
    const d = await getDb();
    if (!d) return;
    await d.insert(visitLogs).values({
      sessionId: params.sessionId,
      path: params.path,
      postId: params.postId ?? null,
      userId: params.userId ?? null,
      userRole: params.userRole,
      deviceType,
      browser,
      os,
      referrer: referrer.slice(0, 500) || null,
      referrerType,
      searchKeyword: searchKeyword ?? null,
      duration: 0,
      scrollDepth: 0,
    });
  } catch {
    // 방문 기록 실패는 무시 (서비스 중단 방지)
  }
}

// ─── 체류 시간 + 스크롤 깊이 업데이트 ───────────────────────────────────────

export async function updateVisitStats(params: {
  sessionId: string;
  path: string;
  duration: number;
  scrollDepth: number;
  postId?: number;
}) {
  try {
    const d = await getDb();
    if (!d) return;
    await d
      .update(visitLogs)
      .set({ duration: params.duration, scrollDepth: params.scrollDepth })
      .where(
        and(
          eq(visitLogs.sessionId, params.sessionId),
          eq(visitLogs.path, params.path)
        )
      );
    if (params.postId && params.scrollDepth > 0) {
      await upsertScrollStats(params.postId, params.scrollDepth);
    }
  } catch {
    // 무시
  }
}

// ─── 스크롤 통계 upsert ──────────────────────────────────────────────────────

export async function upsertScrollStats(postId: number, scrollDepth: number) {
  const depthCols: Record<number, string> = {
    10: "depth10", 20: "depth20", 30: "depth30", 40: "depth40",
    50: "depth50", 60: "depth60", 70: "depth70", 80: "depth80",
    90: "depth90", 100: "depth100",
  };

  const d = await getDb();
  if (!d) return;

  const updates: Record<string, unknown> = { totalVisits: sql`totalVisits + 1` };
  for (const [threshold, col] of Object.entries(depthCols)) {
    if (scrollDepth >= Number(threshold)) {
      updates[col] = sql.raw(`${col} + 1`);
    }
  }

  const existing = await d
    .select({ id: postScrollStats.id })
    .from(postScrollStats)
    .where(eq(postScrollStats.postId, postId))
    .limit(1);

  if (existing.length > 0) {
    await d.update(postScrollStats).set(updates).where(eq(postScrollStats.postId, postId));
  } else {
    const insertValues: Record<string, number> = { postId, totalVisits: 1 };
    for (const [threshold, col] of Object.entries(depthCols)) {
      insertValues[col] = scrollDepth >= Number(threshold) ? 1 : 0;
    }
    await d.insert(postScrollStats).values(insertValues as unknown as typeof postScrollStats.$inferInsert);
  }
}

// ─── 통계 집계 함수들 ─────────────────────────────────────────────────────────

export type Period = "day" | "week" | "month" | "year";
export type TrendGroupBy = "hour" | "day" | "week" | "month" | "year";

function getPeriodStart(period: Period): Date {
  const now = new Date();
  switch (period) {
    case "day": return new Date(now.getFullYear(), now.getMonth(), now.getDate());
    case "week": {
      const d = new Date(now);
      d.setDate(d.getDate() - 6);
      d.setHours(0, 0, 0, 0);
      return d;
    }
    case "month": return new Date(now.getFullYear(), now.getMonth(), 1);
    case "year": return new Date(now.getFullYear(), 0, 1);
  }
}

/**
 * trendGroupBy에 따라 기간 범위 시작일을 반환
 */
function getTrendRangeStart(groupBy: TrendGroupBy): Date {
  const now = new Date();
  switch (groupBy) {
    case "hour": {
      const d = new Date(now);
      d.setHours(d.getHours() - 23);
      d.setMinutes(0, 0, 0);
      return d;
    }
    case "day": {
      const d = new Date(now);
      d.setDate(d.getDate() - 29);
      d.setHours(0, 0, 0, 0);
      return d;
    }
    case "week": {
      const d = new Date(now);
      d.setDate(d.getDate() - 7 * 11);
      d.setHours(0, 0, 0, 0);
      return d;
    }
    case "month": {
      const d = new Date(now);
      d.setMonth(d.getMonth() - 11);
      d.setDate(1);
      d.setHours(0, 0, 0, 0);
      return d;
    }
    case "year": {
      const d = new Date(now);
      d.setFullYear(d.getFullYear() - 4);
      d.setMonth(0, 1);
      d.setHours(0, 0, 0, 0);
      return d;
    }
  }
}

// 관리자 제외 공통 조건 헬퍼
function excludeAdminCondition(start: Date) {
  return and(gte(visitLogs.createdAt, start), ne(visitLogs.userRole, 'admin'));
}

export async function getVisitTrend(period: Period, groupBy?: TrendGroupBy) {
  const d = await getDb();
  if (!d) return [];

  const start = groupBy ? getTrendRangeStart(groupBy) : getPeriodStart(period);
  const gb = groupBy ?? "day";

  const dateFormats: Record<TrendGroupBy, string> = {
    hour: `DATE_FORMAT(createdAt, '%Y-%m-%d %H:00')`,
    week: `DATE_FORMAT(DATE_SUB(createdAt, INTERVAL WEEKDAY(createdAt) DAY), '%Y-%m-%d')`,
    month: `DATE_FORMAT(createdAt, '%Y-%m')`,
    year: `CAST(YEAR(createdAt) AS CHAR)`,
    day: `DATE(createdAt)`,
  };

  const fmt = dateFormats[gb];

  return d
    .select({
      date: sql<string>`${sql.raw(fmt)}`.as("date"),
      total: count(),
      unique: sql<number>`COUNT(DISTINCT sessionId)`.as("unique"),
    })
    .from(visitLogs)
    .where(excludeAdminCondition(start))
    .groupBy(sql.raw(fmt))
    .orderBy(sql.raw(fmt));
}

export async function getDeviceStats(period: Period) {
  const d = await getDb();
  if (!d) return [];
  const start = getPeriodStart(period);
  return d
    .select({ deviceType: visitLogs.deviceType, count: count() })
    .from(visitLogs)
    .where(excludeAdminCondition(start))
    .groupBy(visitLogs.deviceType);
}

export async function getUserRoleStats(period: Period) {
  const d = await getDb();
  if (!d) return [];
  const start = getPeriodStart(period);
  return d
    .select({ userRole: visitLogs.userRole, count: count() })
    .from(visitLogs)
    .where(excludeAdminCondition(start))
    .groupBy(visitLogs.userRole);
}

export async function getHourlyStats(period: Period) {
  const d = await getDb();
  if (!d) return [];
  const start = getPeriodStart(period);
  return d
    .select({
      hour: sql<number>`HOUR(createdAt)`.as("hour"),
      count: count(),
    })
    .from(visitLogs)
    .where(excludeAdminCondition(start))
    .groupBy(sql`HOUR(createdAt)`)
    .orderBy(sql`HOUR(createdAt)`);
}

export async function getReferrerStats(period: Period) {
  const d = await getDb();
  if (!d) return [];
  const start = getPeriodStart(period);
  return d
    .select({ referrerType: visitLogs.referrerType, count: count() })
    .from(visitLogs)
    .where(excludeAdminCondition(start))
    .groupBy(visitLogs.referrerType);
}

export async function getSummaryStats(period: Period) {
  const d = await getDb();
  if (!d) return { total: 0, unique: 0, avgDuration: 0, avgScrollDepth: 0 };
  const start = getPeriodStart(period);
  const [row] = await d
    .select({
      total: count(),
      unique: sql<number>`COUNT(DISTINCT sessionId)`.as("unique"),
      avgDuration: sql<number>`ROUND(AVG(duration), 1)`.as("avgDuration"),
      avgScrollDepth: sql<number>`ROUND(AVG(scrollDepth), 1)`.as("avgScrollDepth"),
    })
    .from(visitLogs)
    .where(excludeAdminCondition(start));
  return row ?? { total: 0, unique: 0, avgDuration: 0, avgScrollDepth: 0 };
}

export async function getTopPosts(period: Period, limit = 10) {
  const d = await getDb();
  if (!d) return [];
  const start = getPeriodStart(period);
  return d
    .select({
      postId: visitLogs.postId,
      views: count(),
      avgDuration: sql<number>`ROUND(AVG(duration), 1)`.as("avgDuration"),
      avgScrollDepth: sql<number>`ROUND(AVG(scrollDepth), 1)`.as("avgScrollDepth"),
    })
    .from(visitLogs)
    .where(and(excludeAdminCondition(start), sql`postId IS NOT NULL`))
    .groupBy(visitLogs.postId)
    .orderBy(desc(count()))
    .limit(limit);
}

export async function getPostScrollStats(postId: number) {
  const d = await getDb();
  if (!d) return null;
  const [row] = await d
    .select()
    .from(postScrollStats)
    .where(eq(postScrollStats.postId, postId))
    .limit(1);
  return row ?? null;
}

// ─── 신규: 검색 키워드 통계 ──────────────────────────────────────────────────

/**
 * 검색엔진에서 유입된 키워드 빈도 TOP N
 */
export async function getSearchKeywordStats(period: Period, limit = 30) {
  const d = await getDb();
  if (!d) return [];
  const start = getPeriodStart(period);
  return d
    .select({
      keyword: visitLogs.searchKeyword,
      count: count(),
    })
    .from(visitLogs)
    .where(
      and(
        excludeAdminCondition(start),
        isNotNull(visitLogs.searchKeyword),
        ne(visitLogs.searchKeyword, '')
      )
    )
    .groupBy(visitLogs.searchKeyword)
    .orderBy(desc(count()))
    .limit(limit);
}

// ─── 신규: 인기 카테고리 통계 ────────────────────────────────────────────────

/**
 * 방문한 게시물 기준 카테고리별 방문 빈도
 */
export async function getPopularCategories(period: Period, limit = 10) {
  const d = await getDb();
  if (!d) return [];
  const start = getPeriodStart(period);

  // visitLogs에서 postId가 있는 행만 집계 후 posts + navItems 테이블과 JOIN
  const rows = await d
    .select({
      category: posts.category,
      label: navItems.label,
      count: count(),
    })
    .from(visitLogs)
    .innerJoin(posts, eq(visitLogs.postId, posts.id))
    .leftJoin(navItems, sql`CONCAT('/category/', ${posts.category}) = ${navItems.path}`)
    .where(
      and(
        excludeAdminCondition(start),
        isNotNull(visitLogs.postId)
      )
    )
    .groupBy(posts.category, navItems.label)
    .orderBy(desc(count()))
    .limit(limit);

  return rows;
}

// ─── 신규: 인기 태그 통계 ────────────────────────────────────────────────────

/**
 * 방문한 게시물의 태그 기준 인기 태그 TOP N
 */
export async function getPopularTags(period: Period, limit = 20) {
  const d = await getDb();
  if (!d) return [];
  const start = getPeriodStart(period);

  // 기간 내 방문한 postId 목록 먼저 조회
  const visitedPosts = await d
    .select({ postId: visitLogs.postId })
    .from(visitLogs)
    .where(
      and(
        excludeAdminCondition(start),
        isNotNull(visitLogs.postId)
      )
    )
    .groupBy(visitLogs.postId);

  const postIds = visitedPosts
    .map(r => r.postId)
    .filter((id): id is number => id !== null);

  if (postIds.length === 0) return [];

  // 해당 postId들의 태그 집계
  const rows = await d
    .select({
      tag: postTags.tag,
      count: count(),
    })
    .from(postTags)
    .where(inArray(postTags.postId, postIds))
    .groupBy(postTags.tag)
    .orderBy(desc(count()))
    .limit(limit);

  return rows;
}

// ─── 신규: 유입 경로(진입 페이지) 통계 ──────────────────────────────────────

/**
 * 방문자가 처음 진입한 페이지(경로) TOP N
 */
export async function getEntryPages(period: Period, limit = 15) {
  const d = await getDb();
  if (!d) return [];
  const start = getPeriodStart(period);

  // 각 세션의 첫 번째 방문 경로를 집계
  const rows = await d
    .select({
      path: visitLogs.path,
      sessions: sql<number>`COUNT(DISTINCT sessionId)`.as("sessions"),
      totalVisits: count(),
    })
    .from(visitLogs)
    .where(excludeAdminCondition(start))
    .groupBy(visitLogs.path)
    .orderBy(desc(sql`COUNT(DISTINCT sessionId)`))
    .limit(limit);

  return rows;
}

// ─── 신규: 검색엔진별 유입 통계 ──────────────────────────────────────────────

/**
 * 검색엔진별 유입 수 (Google/Naver/Bing/Daum 등)
 */
export async function getSearchEngineStats(period: Period) {
  const d = await getDb();
  if (!d) return [];
  const start = getPeriodStart(period);

  const rows = await d
    .select({
      referrer: visitLogs.referrer,
      count: count(),
    })
    .from(visitLogs)
    .where(
      and(
        excludeAdminCondition(start),
        eq(visitLogs.referrerType, 'search')
      )
    )
    .groupBy(visitLogs.referrer)
    .orderBy(desc(count()))
    .limit(100);

  // 검색엔진 도메인별 집계
  const engineMap: Record<string, number> = {};
  for (const row of rows) {
    if (!row.referrer) continue;
    try {
      const hostname = new URL(row.referrer).hostname.toLowerCase();
      let engine = "기타";
      if (hostname.includes("google")) engine = "Google";
      else if (hostname.includes("naver")) engine = "Naver";
      else if (hostname.includes("bing")) engine = "Bing";
      else if (hostname.includes("daum") || hostname.includes("kakao")) engine = "Daum";
      else if (hostname.includes("yahoo")) engine = "Yahoo";
      else if (hostname.includes("duckduckgo")) engine = "DuckDuckGo";
      else if (hostname.includes("baidu")) engine = "Baidu";
      engineMap[engine] = (engineMap[engine] ?? 0) + row.count;
    } catch {
      engineMap["기타"] = (engineMap["기타"] ?? 0) + row.count;
    }
  }

  return Object.entries(engineMap)
    .map(([engine, count]) => ({ engine, count }))
    .sort((a, b) => b.count - a.count);
}

// ─── 신규: OS 통계 ───────────────────────────────────────────────────────────

export async function getOsStats(period: Period) {
  const d = await getDb();
  if (!d) return [];
  const start = getPeriodStart(period);
  return d
    .select({ os: visitLogs.os, count: count() })
    .from(visitLogs)
    .where(excludeAdminCondition(start))
    .groupBy(visitLogs.os)
    .orderBy(desc(count()));
}

// ─── 신규: 브라우저 통계 ─────────────────────────────────────────────────────

export async function getBrowserStats(period: Period) {
  const d = await getDb();
  if (!d) return [];
  const start = getPeriodStart(period);
  return d
    .select({ browser: visitLogs.browser, count: count() })
    .from(visitLogs)
    .where(excludeAdminCondition(start))
    .groupBy(visitLogs.browser)
    .orderBy(desc(count()));
}

// ─── 누적 통계 (이번 달 / 올해 / 전체) ──────────────────────────────────────

/**
 * 이번 달 / 올해 / 전체 누계 방문자 통계를 한 번에 반환
 * - 관리자 방문은 제외
 */
export async function getCumulativeStats() {
  const d = await getDb();
  if (!d) {
    return {
      thisMonth: { total: 0, unique: 0 },
      thisYear: { total: 0, unique: 0 },
      allTime: { total: 0, unique: 0 },
    };
  }

  const now = new Date();
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
  const yearStart = new Date(now.getFullYear(), 0, 1);

  const [monthRow] = await d
    .select({
      total: count(),
      unique: sql<number>`COUNT(DISTINCT sessionId)`.as("unique"),
    })
    .from(visitLogs)
    .where(and(gte(visitLogs.createdAt, monthStart), ne(visitLogs.userRole, "admin")));

  const [yearRow] = await d
    .select({
      total: count(),
      unique: sql<number>`COUNT(DISTINCT sessionId)`.as("unique"),
    })
    .from(visitLogs)
    .where(and(gte(visitLogs.createdAt, yearStart), ne(visitLogs.userRole, "admin")));

  const [allRow] = await d
    .select({
      total: count(),
      unique: sql<number>`COUNT(DISTINCT sessionId)`.as("unique"),
    })
    .from(visitLogs)
    .where(ne(visitLogs.userRole, "admin"));

  return {
    thisMonth: { total: monthRow?.total ?? 0, unique: monthRow?.unique ?? 0 },
    thisYear: { total: yearRow?.total ?? 0, unique: yearRow?.unique ?? 0 },
    allTime: { total: allRow?.total ?? 0, unique: allRow?.unique ?? 0 },
  };
}

// ─── 일자별 페이지별 조회수 분석 ─────────────────────────────────────────────

/**
 * 특정 날짜의 페이지별 조회수 상위 N개
 * - path, views, uniqueSessions, referrerType 분포 포함
 */
export async function getDailyPageBreakdown(date: string, limit = 30) {
  const d = await getDb();
  if (!d) return [];

  // date: 'YYYY-MM-DD' 형식
  const start = new Date(`${date}T00:00:00`);
  const end = new Date(`${date}T23:59:59`);

  return d
    .select({
      path: visitLogs.path,
      views: count(),
      uniqueSessions: sql<number>`COUNT(DISTINCT sessionId)`.as("uniqueSessions"),
      avgDuration: sql<number>`ROUND(AVG(duration), 0)`.as("avgDuration"),
    })
    .from(visitLogs)
    .where(
      and(
        gte(visitLogs.createdAt, start),
        sql`createdAt <= ${end}`,
        ne(visitLogs.userRole, "admin")
      )
    )
    .groupBy(visitLogs.path)
    .orderBy(desc(count()))
    .limit(limit);
}

/**
 * 특정 날짜의 시간대별 조회수 (0~23시)
 */
export async function getDailyHourlyBreakdown(date: string) {
  const d = await getDb();
  if (!d) return [];

  const start = new Date(`${date}T00:00:00`);
  const end = new Date(`${date}T23:59:59`);

  return d
    .select({
      hour: sql<string>`DATE_FORMAT(createdAt, '%H')`.as("hour"),
      views: count(),
    })
    .from(visitLogs)
    .where(
      and(
        gte(visitLogs.createdAt, start),
        sql`createdAt <= ${end}`,
        ne(visitLogs.userRole, "admin")
      )
    )
    .groupBy(sql`DATE_FORMAT(createdAt, '%H')`)
    .orderBy(sql`DATE_FORMAT(createdAt, '%H')`);
}

/**
 * 특정 날짜의 유입 소스별 조회수 분포
 */
export async function getDailyReferrerBreakdown(date: string) {
  const d = await getDb();
  if (!d) return [];

  const start = new Date(`${date}T00:00:00`);
  const end = new Date(`${date}T23:59:59`);

  return d
    .select({
      referrerType: visitLogs.referrerType,
      views: count(),
    })
    .from(visitLogs)
    .where(
      and(
        gte(visitLogs.createdAt, start),
        sql`createdAt <= ${end}`,
        ne(visitLogs.userRole, "admin")
      )
    )
    .groupBy(visitLogs.referrerType)
    .orderBy(desc(count()));
}

/**
 * 최근 N일간 일별 총 조회수 (날짜 선택 캘린더용)
 */
export async function getRecentDailyTotals(days = 30) {
  const d = await getDb();
  if (!d) return [];

  const start = new Date();
  start.setDate(start.getDate() - (days - 1));
  start.setHours(0, 0, 0, 0);

  return d
    .select({
      date: sql<string>`DATE_FORMAT(createdAt, '%Y-%m-%d')`.as("date"),
      views: count(),
    })
    .from(visitLogs)
    .where(and(gte(visitLogs.createdAt, start), ne(visitLogs.userRole, "admin")))
    .groupBy(sql`DATE_FORMAT(createdAt, '%Y-%m-%d')`)
    .orderBy(sql`DATE_FORMAT(createdAt, '%Y-%m-%d')`);
}
