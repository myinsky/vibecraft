/**
 * analytics router - 방문자 통계 API (관리자 전용)
 */
import { z } from "zod";
import { router, protectedProcedure, publicProcedure } from "../_core/trpc";
import { TRPCError } from "@trpc/server";
import {
  getVisitTrend,
  getDeviceStats,
  getUserRoleStats,
  getHourlyStats,
  getReferrerStats,
  getSummaryStats,
  getTopPosts,
  getPostScrollStats,
  updateVisitStats,
  recordVisit,
  getSearchKeywordStats,
  getPopularCategories,
  getPopularTags,
  getEntryPages,
  getSearchEngineStats,
  getOsStats,
  getBrowserStats,
  getCumulativeStats,
  getDailyPageBreakdown,
  getDailyHourlyBreakdown,
  getDailyReferrerBreakdown,
  getRecentDailyTotals,
  type Period,
  type TrendGroupBy,
} from "../analytics";
import { getDb } from "../db";
import { posts } from "../../drizzle/schema";
import { eq, inArray } from "drizzle-orm";
import { invokeLLM } from "../_core/llm";

const periodSchema = z.enum(["day", "week", "month", "year"]).default("week");
const trendGroupBySchema = z.enum(["hour", "day", "week", "month", "year"]).optional();

function requireAdmin(role: string) {
  if (role !== "admin") {
    throw new TRPCError({ code: "FORBIDDEN", message: "관리자만 접근 가능합니다." });
  }
}

export const analyticsRouter = router({
  /** 요약 통계 */
  summary: protectedProcedure
    .input(z.object({ period: periodSchema }))
    .query(async ({ ctx, input }) => {
      requireAdmin(ctx.user.role);
      return getSummaryStats(input.period as Period);
    }),

  /** 방문 추이 (시간별/일별/주간별/월별/년도별 라인 차트) */
  trend: protectedProcedure
    .input(z.object({ period: periodSchema, groupBy: trendGroupBySchema }))
    .query(async ({ ctx, input }) => {
      requireAdmin(ctx.user.role);
      return getVisitTrend(input.period as Period, input.groupBy as TrendGroupBy | undefined);
    }),

  /** 디바이스 분포 */
  devices: protectedProcedure
    .input(z.object({ period: periodSchema }))
    .query(async ({ ctx, input }) => {
      requireAdmin(ctx.user.role);
      return getDeviceStats(input.period as Period);
    }),

  /** 사용자 역할 분포 */
  userRoles: protectedProcedure
    .input(z.object({ period: periodSchema }))
    .query(async ({ ctx, input }) => {
      requireAdmin(ctx.user.role);
      return getUserRoleStats(input.period as Period);
    }),

  /** 인기 시간대 */
  hourly: protectedProcedure
    .input(z.object({ period: periodSchema }))
    .query(async ({ ctx, input }) => {
      requireAdmin(ctx.user.role);
      return getHourlyStats(input.period as Period);
    }),

  /** 유입 소스 */
  referrers: protectedProcedure
    .input(z.object({ period: periodSchema }))
    .query(async ({ ctx, input }) => {
      requireAdmin(ctx.user.role);
      return getReferrerStats(input.period as Period);
    }),

  /** 인기 게시물 TOP 10 */
  topPosts: protectedProcedure
    .input(z.object({ period: periodSchema, limit: z.number().min(1).max(50).default(10) }))
    .query(async ({ ctx, input }) => {
      requireAdmin(ctx.user.role);
      const rows = await getTopPosts(input.period as Period, input.limit);
      const postIds = rows.map(r => r.postId).filter((id): id is number => id !== null);
      if (postIds.length === 0) return [];
      const d = await getDb();
      if (!d) return rows.map(r => ({ ...r, title: "(DB 오류)", slug: null }));
      const postList = await d
        .select({ id: posts.id, title: posts.title, slug: posts.slug })
        .from(posts)
        .where(inArray(posts.id, postIds));
      const postMap = new Map(postList.map(p => [p.id, p]));
      return rows.map(r => ({
        ...r,
        title: postMap.get(r.postId!)?.title ?? "(삭제된 글)",
        slug: postMap.get(r.postId!)?.slug ?? null,
      }));
    }),

  /** 게시물 스크롤 깊이 통계 */
  postScrollStats: protectedProcedure
    .input(z.object({ postId: z.number() }))
    .query(async ({ ctx, input }) => {
      requireAdmin(ctx.user.role);
      return getPostScrollStats(input.postId);
    }),

  // ─── 신규: 키워드/주제 분석 ─────────────────────────────────────────────────

  /** 검색 키워드 TOP 랭킹 */
  searchKeywords: protectedProcedure
    .input(z.object({ period: periodSchema, limit: z.number().min(1).max(100).default(30) }))
    .query(async ({ ctx, input }) => {
      requireAdmin(ctx.user.role);
      return getSearchKeywordStats(input.period as Period, input.limit);
    }),

  /** 인기 카테고리 (방문 기반) */
  popularCategories: protectedProcedure
    .input(z.object({ period: periodSchema }))
    .query(async ({ ctx, input }) => {
      requireAdmin(ctx.user.role);
      return getPopularCategories(input.period as Period);
    }),

  /** 인기 태그 (방문 기반) */
  popularTags: protectedProcedure
    .input(z.object({ period: periodSchema, limit: z.number().min(1).max(50).default(20) }))
    .query(async ({ ctx, input }) => {
      requireAdmin(ctx.user.role);
      return getPopularTags(input.period as Period, input.limit);
    }),

  /** 유입 경로 상세 (진입 페이지 TOP) */
  entryPages: protectedProcedure
    .input(z.object({ period: periodSchema, limit: z.number().min(1).max(50).default(15) }))
    .query(async ({ ctx, input }) => {
      requireAdmin(ctx.user.role);
      return getEntryPages(input.period as Period, input.limit);
    }),

  /** 검색엔진별 유입 통계 */
  searchEngines: protectedProcedure
    .input(z.object({ period: periodSchema }))
    .query(async ({ ctx, input }) => {
      requireAdmin(ctx.user.role);
      return getSearchEngineStats(input.period as Period);
    }),

  /** OS 통계 */
  osStats: protectedProcedure
    .input(z.object({ period: periodSchema }))
    .query(async ({ ctx, input }) => {
      requireAdmin(ctx.user.role);
      return getOsStats(input.period as Period);
    }),

  /** 브라우저 통계 */
  browserStats: protectedProcedure
    .input(z.object({ period: periodSchema }))
    .query(async ({ ctx, input }) => {
      requireAdmin(ctx.user.role);
      return getBrowserStats(input.period as Period);
    }),

  /** AI 방문자 인사이트 (전체 통계 기반 LLM 분석) */
  aiInsight: protectedProcedure
    .input(z.object({ period: periodSchema }))
    .mutation(async ({ ctx, input }) => {
      requireAdmin(ctx.user.role);

      const period = input.period as Period;
      const [summary, keywords, categories, tags, engines, entryPgs] = await Promise.all([
        getSummaryStats(period),
        getSearchKeywordStats(period, 10),
        getPopularCategories(period, 5),
        getPopularTags(period, 10),
        getSearchEngineStats(period),
        getEntryPages(period, 5),
      ]);

      const periodLabel: Record<Period, string> = {
        day: "오늘", week: "최근 7일", month: "이번 달", year: "올해"
      };

      const keywordList = keywords.map(k => `"${k.keyword}" (${k.count}회)`).join(", ") || "없음";
      const categoryList = categories.map(c => `${c.category} (${c.count}회)`).join(", ") || "없음";
      const tagList = tags.map(t => `#${t.tag} (${t.count}회)`).join(", ") || "없음";
      const engineList = engines.map(e => `${e.engine} (${e.count}회)`).join(", ") || "없음";
      const entryList = entryPgs.map(e => `${e.path} (${e.sessions}세션)`).join(", ") || "없음";

      // 1단계: 방문자 인사이트 + 콘텐츠 주제 추천을 구조화된 JSON으로 생성
      const response = await invokeLLM({
        messages: [
          {
            role: "system",
            content: `당신은 블로그 방문자 데이터 분석 전문가이자 콘텐츠 전략가입니다. 주어진 방문자 통계를 바탕으로 두 가지를 한국어로 제공하세요:
1) 방문자 행동 분석 인사이트 (마크다운 형식)
2) 앞으로 작성하면 좋을 블로그 포스트 주제 5~7개 (구체적인 제목, 작성 이유, 예상 독자, SEO 키워드 포함)

반드시 아래 JSON 스키마를 엄격히 따르세요.`,
          },
          {
            role: "user",
            content: `분석 기간: ${periodLabel[period]}

[요약 통계]
- 총 방문: ${summary.total}회, 순 방문자: ${summary.unique}명
- 평균 체류시간: ${summary.avgDuration}초, 평균 스크롤: ${summary.avgScrollDepth}%

[검색 키워드 TOP 10]
${keywordList}

[인기 카테고리 TOP 5]
${categoryList}

[인기 태그 TOP 10]
${tagList}

[검색엔진 유입]
${engineList}

[주요 진입 페이지 TOP 5]
${entryList}

위 데이터를 분석하여 JSON 형식으로 응답해주세요.`,
          },
        ],
        response_format: {
          type: "json_schema",
          json_schema: {
            name: "analytics_insight",
            strict: true,
            schema: {
              type: "object",
              properties: {
                insight: {
                  type: "string",
                  description: "방문자 행동 분석 인사이트 (마크다운 형식, ## 🔍 방문자 행동 요약 / ## 🎯 핵심 키워드 인사이트 / ## 📂 인기 주제 분석 / ## 🚀 콘텐츠 전략 제안 / ## ⚡ 즉시 실행 가능한 액션 섹션 포함)"
                },
                recommendations: {
                  type: "array",
                  description: "앞으로 작성하면 좋을 블로그 포스트 주제 5~7개",
                  items: {
                    type: "object",
                    properties: {
                      title: {
                        type: "string",
                        description: "구체적이고 매력적인 블로그 포스트 제목 (독자가 클릭하고 싶은 제목)"
                      },
                      reason: {
                        type: "string",
                        description: "이 주제를 작성해야 하는 이유 (키워드 데이터 근거 포함, 1~2문장)"
                      },
                      targetAudience: {
                        type: "string",
                        description: "예상 독자층 (예: AI 자동화에 관심 있는 직장인, 바이브 코딩 입문자 등)"
                      },
                      seoKeywords: {
                        type: "array",
                        description: "이 포스트에 포함하면 좋을 SEO 키워드 3~5개",
                        items: { type: "string" }
                      },
                      category: {
                        type: "string",
                        description: "추천 카테고리 (인기 카테고리 중 하나 또는 새 카테고리 제안)"
                      },
                      priority: {
                        type: "string",
                        description: "작성 우선순위: high(즉시 작성 권장) / medium(이번 주 내) / low(다음 달)"
                      }
                    },
                    required: ["title", "reason", "targetAudience", "seoKeywords", "category", "priority"],
                    additionalProperties: false
                  }
                }
              },
              required: ["insight", "recommendations"],
              additionalProperties: false
            }
          }
        }
      });

      const rawContent = response.choices[0]?.message?.content;
      const raw: string = typeof rawContent === "string" ? rawContent : "{}";
      let parsed: { insight: string; recommendations: Array<{ title: string; reason: string; targetAudience: string; seoKeywords: string[]; category: string; priority: string }> };
      try {
        parsed = JSON.parse(raw);
      } catch {
        parsed = { insight: raw, recommendations: [] };
      }

      return {
        insight: parsed.insight ?? "분석 데이터가 부족합니다.",
        recommendations: parsed.recommendations ?? [],
        period: periodLabel[period],
      };
    }),

  /** 방문 기록 (공개 - 모든 방문자) */
  trackVisit: publicProcedure
    .input(z.object({
      sessionId: z.string().max(64),
      path: z.string().max(500),
      postId: z.number().optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      const user = ctx.user;
      const userRole: "guest" | "user" | "admin" = user?.role === "admin" ? "admin" : user ? "user" : "guest";
      // 3초 타임아웃 - DB 연결 풀 고갈 시 무한 대기 방지
      const timeout = new Promise<void>((resolve) => setTimeout(resolve, 3000));
      await Promise.race([
        recordVisit({
          sessionId: input.sessionId,
          path: input.path,
          postId: input.postId,
          userId: user?.id,
          userRole,
          req: ctx.req,
        }),
        timeout,
      ]);
      return { ok: true };
    }),

  /** 체류시간 + 스크롤 깊이 업데이트 (공개) */
  updateStats: publicProcedure
    .input(z.object({
      sessionId: z.string().max(64),
      path: z.string().max(500),
      duration: z.number().min(0).max(86400),
      scrollDepth: z.number().min(0).max(100),
      postId: z.number().optional(),
    }))
    .mutation(({ input }) => {
      // fire-and-forget: DB 업데이트를 기다리지 않고 즉시 200 반환 (응답 지연 제로)
      setImmediate(() => {
        updateVisitStats(input).catch(() => {});
      });
      return { ok: true };
    }),

  /** 누적 통계 (이번 달 / 올해 / 전체) - 기간 선택 없이 항상 표시 */
  cumulativeStats: protectedProcedure
    .query(async ({ ctx }) => {
      requireAdmin(ctx.user.role);
      return getCumulativeStats();
    }),

  /** LLM 기반 글쓰기 개선 제안 */
  writingAdvice: protectedProcedure
    .input(z.object({ postId: z.number() }))
    .mutation(async ({ ctx, input }) => {
      requireAdmin(ctx.user.role);
      const d = await getDb();
      if (!d) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
      const [post] = await d
        .select({ title: posts.title, excerpt: posts.excerpt, views: posts.views })
        .from(posts)
        .where(eq(posts.id, input.postId))
        .limit(1);
      if (!post) throw new TRPCError({ code: "NOT_FOUND" });

      const scrollStats = await getPostScrollStats(input.postId);
      const scrollInfo = scrollStats
        ? `총 방문: ${scrollStats.totalVisits}명, 10%까지: ${scrollStats.depth10}명, 30%까지: ${scrollStats.depth30}명, 50%까지: ${scrollStats.depth50}명, 70%까지: ${scrollStats.depth70}명, 100%까지: ${scrollStats.depth100}명`
        : "스크롤 데이터 없음 (방문 데이터 수집 중)";

      const response = await invokeLLM({
        messages: [
          {
            role: "system",
            content: `당신은 블로그 콘텐츠 전략가입니다. 게시물의 스크롤 이탈 데이터를 분석하여 구체적인 글쓰기 개선 제안을 한국어로 제공하세요.
다음 형식으로 작성하세요:

## 📊 이탈 구간 분석
(어디서 독자가 이탈하는지 분석)

## 🔧 개선이 필요한 항목
1. (첫 번째 개선 항목)
2. (두 번째 개선 항목)  
3. (세 번째 개선 항목)

## ✅ 실행 방법
(구체적인 실행 가능한 개선 방법)`,
          },
          {
            role: "user",
            content: `게시물 제목: "${post.title}"
총 조회수: ${post.views}
스크롤 깊이 데이터: ${scrollInfo}

이 데이터를 바탕으로 글쓰기 개선 제안을 해주세요.`,
          },
        ],
      });

      const advice = response.choices[0]?.message?.content ?? "분석 데이터가 부족합니다.";
      return { advice, postTitle: post.title };
    }),

  /** 최근 N일간 일별 총 조회수 (날짜 선택 캘린더용) */
  recentDailyTotals: protectedProcedure
    .input(z.object({ days: z.number().min(1).max(90).default(30) }))
    .query(async ({ ctx, input }) => {
      requireAdmin(ctx.user.role);
      return getRecentDailyTotals(input.days);
    }),

  /** 특정 날짜의 페이지별 조회수 상위 N개 */
  dailyPageBreakdown: protectedProcedure
    .input(z.object({
      date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "YYYY-MM-DD 형식이어야 합니다"),
      limit: z.number().min(1).max(100).default(30),
    }))
    .query(async ({ ctx, input }) => {
      requireAdmin(ctx.user.role);
      return getDailyPageBreakdown(input.date, input.limit);
    }),

  /** 특정 날짜의 시간대별 조회수 */
  dailyHourlyBreakdown: protectedProcedure
    .input(z.object({
      date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "YYYY-MM-DD 형식이어야 합니다"),
    }))
    .query(async ({ ctx, input }) => {
      requireAdmin(ctx.user.role);
      return getDailyHourlyBreakdown(input.date);
    }),

  /** 특정 날짜의 유입 소스별 분포 */
  dailyReferrerBreakdown: protectedProcedure
    .input(z.object({
      date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "YYYY-MM-DD 형식이어야 합니다"),
    }))
    .query(async ({ ctx, input }) => {
      requireAdmin(ctx.user.role);
      return getDailyReferrerBreakdown(input.date);
    }),
});
