import { z } from "zod";
import { getRuntimeEnv } from "./runtime-env";
import { COOKIE_NAME } from "@shared/const";
import DOMPurify from "isomorphic-dompurify";
import { getSessionCookieOptions } from "./_core/cookies";
import { systemRouter } from "./_core/systemRouter";
import { analyticsRouter } from "./routers/analytics";
import { notifyOwner } from "./_core/notification";
import { TRPCError } from "@trpc/server";
import { publicProcedure, protectedProcedure, router } from "./_core/trpc";
import { purgeAllCaches } from "./rss";
import { cache, TTL } from "./cache";
import { invalidateHomeDataCache } from "./metaInjector";
import { invalidateMetaHtmlCache } from "./_core/vite";
import { notifyIndexNow } from "./indexnow";
import { notifyGoogleIndexing } from "./googleIndexing";
import { optimizeThumbnailAsync } from "./imageOptimizer";
import {
  createPost,
  updatePost,
  deletePost,
  getAllPosts,
  getPostsByCategory,
  getPostsByCategoryPaged,
  getAllPostsPaged,
  getPostById,
  incrementPostViews,
  togglePostLike,
  getPostLikeStatus,
  getAllVibeApps,
  getVibeAppById,
  incrementAppDownloads,
  createAppReview,
  getReviewsByAppId,
  createVibeApp,
  updateVibeApp,
  deleteVibeApp,
  getAllVibeAppsAdmin,
  createApiKey,
  getApiKeysByUser,
  revokeApiKey,
  deleteApiKey,
  reactivateApiKey,
  saveDraft,
  getDraftsByAuthor,
  publishDraft,
  // 관리자 설정
  getSiteConfigAll,
  upsertSiteConfigBulk,
  getAllSidebarItems,
  createSidebarItem,
  updateSidebarItem,
  deleteSidebarItem,
  reorderSidebarItems,
  getHomeSections,
  updateHomeSectionOrder,
  updateHomeSectionDetail,
  getNavItemsFromDb,
  updateNavItemsInDb,
  createNavItemInDb,
  deleteNavItemFromDb,
  updateNavItemIntroHtml,
  getAllPostsAdmin,
  adminUpdatePostStatus,
  adminDeletePost,
  adminRestorePost,
  adminHardDeletePost,
  getDeletedPostsAdmin,
  getSimilarPosts,
  getLegalPage,
  upsertLegalPage,
  agreeToTerms,
  setUsername,
  checkUsernameAvailable,
  getCommentsByPost,
  getCommentsByPage,
  addComment,
  addPageComment,
  toggleCommentVisibility,
  deleteComment,
  setAiReply,
  getAllComments,
  getChatSessions,
  getChatSession,
  upsertChatSession,
  deleteChatSession,
  logPostView,
  getPostViewStats,
  getCategoryCommentSettings,
  getCategoryCommentSetting,
  upsertCategoryCommentSetting,
  getPublishLogs,
  getPinnedPosts,
  getLatestPosts,
  getPopularPosts,
  togglePinnedPost,
  publishScheduledPosts,
  getAllUsers,
  getUserById,
  updateUserPermissions,
  getCategoryWritePermissions,
  setCategoryWritePermissions,
  getAllCategoryWritePermissions,
  getPostBySlug,
  getPostByCustomSlugOnly,
  getTagsByPost,
  upsertPostTags,
  getPostsByTag,
  getAllTags,
  getRelatedPostsByTags,
  getRelatedByCategory,
  getRelatedBySimilarity,
  searchPosts,
  getAllCustomPages,
  getPublishedCustomPages,
  getNavCustomPages,
  getCustomPageBySlug,
  getAllCustomPageSlugs,
  getCustomPageById,
  createCustomPage,
  updateCustomPage,
  deleteCustomPage,
  archiveCustomPage,
  getArchivedCustomPages,
  restoreCustomPage,
  permanentDeleteCustomPage,
  incrementCustomPageView,
  bulkUpdatePostStatus,
  bulkDeletePosts,
  bulkUpdatePostCategory,
  bulkRestorePosts,
  bulkHardDeletePosts,
  deleteAllDrafts,
  batchUpdatePostEmbedWidth,
  adminToggleShowInSection,
  adminToggleAllowComments,
  bulkToggleAllowComments,
  exportAllData,
  importAllData,
  type BackupData,
  saveBackupToS3,
  getBackupHistory,
  getBackupById,
  deleteBackupById,
  deleteBackupsByIds,
  importSelectedTables,
  toggleCommentLike,
  getCommentLikeStatuses,
  updatePostThumbnail,
  createDonation,
  listDonations,
  confirmDonation,
  updateDonationMemo,
  deleteDonation,
  getDonationSettings,
  updateDonationSettings,
  savePageUpgradeHistory,
  getPageUpgradeHistory,
  restorePageFromHistory,
  getTagSeoStats,
  getCategorySeoStats,
  getSeoOverview,
  getPostSeoAudit,
  cleanupProblemTags,
  createVibeAppSubmission,
  listPendingSubmissions,
  approveSubmission,
  rejectSubmission,
  getMySubmissions,
  registerAsDeveloper,
  updateUserProfile,
} from "./db";
import { invokeLLM } from "./_core/llm";
import { ENV } from "./_core/env";
import { uploadImageFromUrl } from "./upload";

/**
 * HTML content 안의 base64 이미지를 스토리지에 업로드하고 URL로 교체합니다.
 * createPost / updatePost 저장 직전에 호출하여 DB에 base64가 저장되지 않도록 합니다.
 */
async function normalizeBase64Images(html: string, userId: string): Promise<string> {
  const base64Pattern = /data:image\/[^;]+;base64,[A-Za-z0-9+/=]+/g;
  const matches = Array.from(new Set(html.match(base64Pattern) || []));
  if (matches.length === 0) return html;
  let result = html;
  for (const dataUrl of matches) {
    try {
      const { url } = await uploadImageFromUrl(dataUrl, userId);
      // 모든 동일한 base64 문자열을 스토리지 URL로 교체
      result = result.split(dataUrl).join(url);
      console.log(`[normalizeBase64Images] base64 → ${url}`);
    } catch (e) {
      console.warn(`[normalizeBase64Images] 업로드 실패, 원본 유지:`, e);
    }
  }
  return result;
}

// ─── Gemini API 프록시 rate limiter ───────────────────────────────────────────
// IP별 분당 최대 10회 호출 제한
const geminiRateLimitMap = new Map<string, { count: number; resetAt: number }>();
function checkGeminiRateLimit(ip: string): boolean {
  const now = Date.now();
  const entry = geminiRateLimitMap.get(ip);
  if (!entry || now > entry.resetAt) {
    geminiRateLimitMap.set(ip, { count: 1, resetAt: now + 60_000 });
    return true;
  }
  if (entry.count >= 10) return false;
  entry.count++;
  return true;
}
// 오래된 항목 주기적 정리 (메모리 누수 방지)
setInterval(() => {
  const now = Date.now();
  Array.from(geminiRateLimitMap.entries()).forEach(([ip, entry]) => {
    if (now > entry.resetAt) geminiRateLimitMap.delete(ip);
  });
}, 5 * 60_000);

export const appRouter = router({
  system: systemRouter,
  analytics: analyticsRouter,

  auth: router({
    me: publicProcedure.query((opts) => opts.ctx.user),
    logout: publicProcedure.mutation(({ ctx }) => {
      const cookieOptions = getSessionCookieOptions(ctx.req);
      ctx.res.clearCookie(COOKIE_NAME, { ...cookieOptions, maxAge: -1 });
      return { success: true } as const;
    }),
    agreeToTerms: protectedProcedure.mutation(async ({ ctx }) => {
      await agreeToTerms(ctx.user.id);
      return { success: true } as const;
    }),
    setUsername: protectedProcedure
      .input(z.object({
        username: z.string()
          .min(2, '닉네임은 2자 이상이어야 합니다.')
          .max(20, '닉네임은 20자 이하여야 합니다.')
          .regex(/^[가-힣a-zA-Z0-9_]+$/, '닉네임은 한글, 영문, 숫자, 언더스코어(_)만 사용 가능합니다.'),
      }))
      .mutation(async ({ ctx, input }) => {
        const available = await checkUsernameAvailable(input.username, ctx.user.id);
        if (!available) {
          throw new TRPCError({ code: 'CONFLICT', message: '이미 사용 중인 닉네임입니다.' });
        }
        await setUsername(ctx.user.id, input.username);
        return { success: true } as const;
      }),
    checkUsername: publicProcedure
      .input(z.object({ username: z.string().min(1) }))
      .query(async ({ input, ctx }) => {
        const userId = ctx.user?.id;
        const available = await checkUsernameAvailable(input.username, userId);
        return { available };
      }),
    // 개발자 등록: 로그인한 사용자를 개발자로 등록합니다.
    registerDeveloper: protectedProcedure
      .input(z.object({
        bio: z.string().max(500).optional(),
        profileImage: z.string().url().optional().or(z.literal('')),
      }))
      .mutation(async ({ ctx, input }) => {
        await registerAsDeveloper(ctx.user.id, {
          bio: input.bio,
          profileImage: input.profileImage || undefined,
        });
        return { success: true } as const;
      }),
    // 프로필 업데이트: bio, profileImage를 수정합니다.
    updateProfile: protectedProcedure
      .input(z.object({
        bio: z.string().max(500).nullable().optional(),
        profileImage: z.string().nullable().optional(),
      }))
      .mutation(async ({ ctx, input }) => {
        await updateUserProfile(ctx.user.id, {
          bio: input.bio,
          profileImage: input.profileImage,
        });
        return { success: true } as const;
      }),
  }),

  posts: router({
    list: publicProcedure
      .input(z.object({
        category: z.string().optional(),
        page: z.number().min(1).default(1),
        limit: z.number().min(1).max(50).default(10),
        cursor: z.number().optional(), // useInfiniteQuery 지원: cursor = 다음 페이지 번호
        sortMode: z.enum(["latest", "popular"]).default("latest").optional(),
      }))
      .query(async ({ input }) => {
        // cursor가 있으면 cursor를 page로 사용 (useInfiniteQuery 지원)
        const page = input.cursor ?? input.page ?? 1;
        const limit = input.limit ?? 10;
        const sortMode = input.sortMode ?? 'latest';
        if (input.category && input.category !== '__latest__') {
          return getPostsByCategoryPaged(input.category, page, limit, sortMode);
        }
        return getAllPostsPaged(page, limit, sortMode);
      }),

    get: publicProcedure
      .input(z.object({ id: z.number() }))
      .query(async ({ input, ctx }) => {
        const post = await getPostById(input.id);
        if (!post) return null;
        // draft 게시물은 작성자 본인만 접근 가능
        if ((post as any).status === 'draft') {
          const user = (ctx as any).user;
          if (!user || user.id !== (post as any).authorId) {
            throw new TRPCError({ code: 'NOT_FOUND', message: '게시물을 찾을 수 없습니다.' });
          }
          return post;
        }
        // 상세 조회 로그 기록 (비동기 - 응답 지연 없이)
        const ctxUser = (ctx as any).user;
        const visitorType: "admin" | "author" | "logged_in" | "guest" = !ctxUser
          ? "guest"
          : ctxUser.role === "admin"
          ? "admin"
          : ctxUser.id === (post as any).authorId
          ? "author"
          : "logged_in";
        // 관리자 방문은 조회수에서 제외
        if (visitorType !== "admin") {
          await incrementPostViews(input.id);
        }
        const referrer = (ctx.req.headers["referer"] as string) || "";
        const userAgent = (ctx.req.headers["user-agent"] as string) || "";
        const origin = (ctx.req.headers["origin"] as string) || "";
        setImmediate(() => {
          logPostView({ postId: input.id, visitorType, referrer, userAgent, siteOrigins: origin ? [origin] : [] }).catch(() => {});
        });
        return post;
      }),

    create: protectedProcedure
      .input(z.object({
        title: z.string().min(1).max(200),
        content: z.string().min(1),
        excerpt: z.string().optional(),
        thumbnail: z.string().optional(),
        category: z.string().min(1), // navItems에서 동적으로 관리되는 카테고리 키
        tag: z.string().optional(),
        badge: z.string().optional(),
        isHtmlSource: z.boolean().optional(), // HTML 소스 탭으로 작성된 글 여부
        isAppMode: z.boolean().optional(), // JS가 동작하는 HTML 앱 모드
        appEmbedUrl: z.string().optional().nullable(), // URL 임베드 모드일 때 외부 URL
        embedWidth: z.enum(["content", "full"]).optional(), // 임베드 표시 너비
        showInSection: z.boolean().optional(), // 홈 메인 섹션/최신 글 표시 여부
        allowComments: z.boolean().optional(), // 댓글 사용 여부
        disableAds: z.boolean().optional(), // 광고 비활성화 여부
        coupangKeywords: z.array(z.string()).optional().nullable(), // 글별 쿠팡 키워드 오버라이드
        enableToc: z.boolean().optional(), // 목차 자동 생성 여부
        customSlug: z.string().max(255).regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, 'SEO 슬러그는 영소문자, 숫자, 하이픈만 허용됩니다').optional().nullable(), // SEO 슬러그
      }))
      .mutation(async ({ input, ctx }) => {
        // HTML 소스 모드일 때는 완전한 HTML 문서 구조를 그대로 보존
        // FORCE_BODY: true 사용 시 <html>/<head>/<body> 태그가 제거되므로 isHtmlSource일 때는 사용하지 않음
        const isFullDoc = input.isHtmlSource && (/^\s*<!DOCTYPE/i.test(input.content) || /^\s*<html/i.test(input.content));
        const sanitizedContent = DOMPurify.sanitize(input.content, {
          ALLOWED_TAGS: input.isHtmlSource ? false : [
            'p', 'br', 'strong', 'em', 'u', 's', 'code', 'pre', 'blockquote',
            'h1', 'h2', 'h3', 'h4', 'h5', 'h6',
            'ul', 'ol', 'li', 'a', 'img', 'hr', 'mark', 'del',
            'table', 'thead', 'tbody', 'tr', 'th', 'td',
            'div', 'span', 'label', 'input',
          ],
          ALLOWED_ATTR: input.isHtmlSource ? false : [
            'href', 'src', 'alt', 'title', 'target', 'rel',
            'class', 'style', 'data-type', 'type', 'checked',
            'colspan', 'rowspan',
          ],
          ALLOW_DATA_ATTR: true,
          WHOLE_DOCUMENT: isFullDoc,
          FORCE_BODY: !isFullDoc,
        } as Parameters<typeof DOMPurify.sanitize>[1]);
        // base64 이미지를 스토리지에 업로드하고 URL로 교체 (DB에 base64가 저장되지 않도록)
        const normalizedContent = await normalizeBase64Images(sanitizedContent, ctx.user.openId);
        const plainText = normalizedContent
          .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, "")
          .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, "")
          .replace(/<[^>]+>/g, "")
          .replace(/\s+/g, " ")
          .trim();
        const excerpt = input.excerpt || plainText.slice(0, 120) + (plainText.length > 120 ? "..." : "");
        const newPost = await createPost({
          ...input,
          content: normalizedContent,
          excerpt,
          thumbnail: input.thumbnail || null,
          tag: input.tag || null,
          badge: input.badge || null,
          isHtmlSource: input.isHtmlSource ?? false,
          isAppMode: input.isAppMode ?? false,
          appEmbedUrl: input.appEmbedUrl ?? null,
          embedWidth: input.embedWidth ?? "content",
          showInSection: input.showInSection ?? true,
          allowComments: input.allowComments ?? true,
          disableAds: input.disableAds ?? false,
          coupangKeywords: input.coupangKeywords ? JSON.stringify(input.coupangKeywords) : null,
          enableToc: input.enableToc ?? false,
          customSlug: input.customSlug || null,
          authorId: ctx.user.id,
          published: true,
        });
        // 발행 시 사이트맵 + RSS 캐시 무효화 + IndexNow 알림 + 홈 초기 데이터 캐시 무효화
        purgeAllCaches();
        invalidateHomeDataCache();
        invalidateMetaHtmlCache(); // 메타 HTML 캐시 전체 무효화 (새 게시물 반영)
        const _config = await getSiteConfigAll();
        const _baseUrl = (_config.siteUrl || "https://vibecraftx.com").replace(/\/$/, "");
        const _canonicalSlug = (newPost as any)?.customSlug || (newPost as any)?.slug;
        const _postPath = _canonicalSlug ? `/p/${encodeURIComponent(_canonicalSlug)}` : `/post/${(newPost as any)?.id}`;
        notifyIndexNow(`${_baseUrl}${_postPath}`).catch(() => {});
        notifyGoogleIndexing(`${_baseUrl}${_postPath}`).catch(() => {});
        // 썸네일 자동 최적화 (fire-and-forget: 응답 지연 없이 백그라운드 처리)
        if (input.thumbnail && (newPost as any)?.id) {
          optimizeThumbnailAsync(
            (newPost as any).id,
            input.thumbnail,
            updatePostThumbnail
          ).catch(() => {});
        }
        return newPost;
      }),

    update: protectedProcedure
      .input(z.object({
        id: z.number(),
        title: z.string().min(1).max(200),
        content: z.string().min(1),
        excerpt: z.string().optional().nullable(),
        thumbnail: z.string().optional().nullable(),
        category: z.string().min(1), // navItems에서 동적으로 관리되는 카테고리 키
        tag: z.string().optional().nullable(),
        badge: z.string().optional().nullable(),
        status: z.enum(["published", "draft"]).optional(), // 수정 시 임시저장/발행 선택
        isHtmlSource: z.boolean().optional(), // HTML 소스 탭으로 작성된 글 여부
        isAppMode: z.boolean().optional(), // JS가 동작하는 HTML 앱 모드
        appEmbedUrl: z.string().optional().nullable(), // URL 임베드 모드일 때 외부 URL
        embedWidth: z.enum(["content", "full"]).optional(), // 임베드 표시 너비
        showInSection: z.boolean().optional(), // 홈 메인 섹션/최신 글 표시 여부
        allowComments: z.boolean().optional(), // 댓글 사용 여부
        disableAds: z.boolean().optional(), // 광고 비활성화 여부
        coupangKeywords: z.array(z.string()).optional().nullable(), // 글별 쿠팡 키워드 오버라이드
        enableToc: z.boolean().optional(), // 목차 자동 생성 여부
        customSlug: z.string().max(255).regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, 'SEO 슬러그는 영소문자, 숫자, 하이픈만 허용됩니다').optional().nullable(), // SEO 슬러그
      }))
      .mutation(async ({ input, ctx }) => {
        const { id, ...data } = input;
        // HTML 소스 모드일 때는 완전한 HTML 문서 구조를 그대로 보존
        const isFullDocUpdate = data.isHtmlSource && (/^\s*<!DOCTYPE/i.test(data.content) || /^\s*<html/i.test(data.content));
        const sanitizedContent = DOMPurify.sanitize(data.content, {
          ALLOWED_TAGS: data.isHtmlSource ? false : [
            'p', 'br', 'strong', 'em', 'u', 's', 'code', 'pre', 'blockquote',
            'h1', 'h2', 'h3', 'h4', 'h5', 'h6',
            'ul', 'ol', 'li', 'a', 'img', 'hr', 'mark', 'del',
            'table', 'thead', 'tbody', 'tr', 'th', 'td',
            'div', 'span', 'label', 'input',
          ],
          ALLOWED_ATTR: data.isHtmlSource ? false : [
            'href', 'src', 'alt', 'title', 'target', 'rel',
            'class', 'style', 'data-type', 'type', 'checked',
            'colspan', 'rowspan',
          ],
          ALLOW_DATA_ATTR: true,
          WHOLE_DOCUMENT: isFullDocUpdate,
          FORCE_BODY: !isFullDocUpdate,
        } as Parameters<typeof DOMPurify.sanitize>[1]);
        // base64 이미지를 스토리지에 업로드하고 URL로 교체 (DB에 base64가 저장되지 않도록)
        const normalizedContentUpdate = await normalizeBase64Images(sanitizedContent, ctx.user.openId);
        const plainText = normalizedContentUpdate
          .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, "")
          .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, "")
          .replace(/<[^>]+>/g, "")
          .replace(/\s+/g, " ")
          .trim();
        const excerpt = data.excerpt || plainText.slice(0, 120) + (plainText.length > 120 ? "..." : "");
        const updatedPost = await updatePost(id, ctx.user.id, {
          ...data,
          content: normalizedContentUpdate,
          excerpt,
          isHtmlSource: data.isHtmlSource ?? false,
          isAppMode: data.isAppMode ?? false,
          appEmbedUrl: data.appEmbedUrl ?? null,
          embedWidth: data.embedWidth ?? "content",
          allowComments: data.allowComments ?? true,
          disableAds: data.disableAds ?? false,
          coupangKeywords: data.coupangKeywords !== undefined ? (data.coupangKeywords ? JSON.stringify(data.coupangKeywords) : null) : undefined,
          enableToc: data.enableToc ?? false,
          customSlug: data.customSlug !== undefined ? (data.customSlug || null) : undefined,
        });
        // 수정 시 사이트맵 + RSS 캐시 무효화 + IndexNow 알림 (발행 상태일 때만)
        invalidateHomeDataCache();
        invalidateMetaHtmlCache(); // 메타 HTML 캐시 무효화 (수정 반영)
        if (!data.status || data.status === "published") {
          purgeAllCaches();
          const _uc = await getSiteConfigAll();
          const _ub = (_uc.siteUrl || "https://vibecraftx.com").replace(/\/$/, "");
          const _ucSlug = (updatedPost as any)?.customSlug || (updatedPost as any)?.slug;
          const _up = _ucSlug ? `/p/${encodeURIComponent(_ucSlug)}` : `/post/${id}`;
          notifyIndexNow(`${_ub}${_up}`).catch(() => {});
          notifyGoogleIndexing(`${_ub}${_up}`).catch(() => {});
        }
        // 썸네일 자동 최적화 (fire-and-forget)
        if (data.thumbnail) {
          optimizeThumbnailAsync(id, data.thumbnail, updatePostThumbnail).catch(() => {});
        }
        return updatedPost;
      }),

    delete: protectedProcedure
      .input(z.object({ id: z.number() }))
      .mutation(async ({ input, ctx }) => {
        const result = await deletePost(input.id, ctx.user.id);
        purgeAllCaches();
        invalidateHomeDataCache();
        invalidateMetaHtmlCache(); // 메타 HTML 캐시 무효화 (삭제 반영)
        return result;
      }),

    getLikeStatus: publicProcedure
      .input(z.object({ postId: z.number() }))
      .query(async ({ input, ctx }) => {
        if (!ctx.user || !input.postId) return { liked: false };
        const liked = await getPostLikeStatus(input.postId, ctx.user.id);
        return { liked };
      }),

    like: protectedProcedure
      .input(z.object({ postId: z.number() }))
      .mutation(async ({ input, ctx }) => {
        if (!input.postId) throw new TRPCError({ code: 'BAD_REQUEST', message: '게시글 ID가 올바르지 않습니다.' });
        return togglePostLike(input.postId, ctx.user.id);
      }),

    // ─── 임시저장 프로시저 ──────────────────────────────────────
    saveDraft: protectedProcedure
      .input(z.object({
        title: z.string().max(200).default(""),
        content: z.string().default(""),
        excerpt: z.string().optional().nullable(),
        thumbnail: z.string().optional().nullable(),
        category: z.string().min(1), // navItems에서 동적으로 관리되는 카테고리 키
        tag: z.string().optional().nullable(),
        badge: z.string().optional().nullable(),
        draftId: z.number().optional(), // 기존 임시저장 덮어쓰기
      }))
      .mutation(async ({ input, ctx }) => {
        const sanitizedContent = DOMPurify.sanitize(input.content || "", {
          ALLOWED_TAGS: [
            'p', 'br', 'strong', 'em', 'u', 's', 'code', 'pre', 'blockquote',
            'h1', 'h2', 'h3', 'h4', 'h5', 'h6',
            'ul', 'ol', 'li', 'a', 'img', 'hr', 'mark', 'del',
            'table', 'thead', 'tbody', 'tr', 'th', 'td',
            'div', 'span', 'label', 'input',
          ],
          ALLOWED_ATTR: [
            'href', 'src', 'alt', 'title', 'target', 'rel',
            'class', 'style', 'data-type', 'type', 'checked',
            'colspan', 'rowspan',
          ],
          ALLOW_DATA_ATTR: true,
        });
        return saveDraft(ctx.user.id, {
          title: input.title,
          content: sanitizedContent,
          excerpt: input.excerpt ?? null,
          thumbnail: input.thumbnail ?? null,
          category: input.category,
          tag: input.tag ?? null,
          badge: input.badge ?? null,
          draftId: input.draftId,
        });
      }),

    listDrafts: protectedProcedure
      .query(async ({ ctx }) => {
        return getDraftsByAuthor(ctx.user.id);
      }),

    publishDraft: protectedProcedure
      .input(z.object({ id: z.number() }))
      .mutation(async ({ input, ctx }) => {
        const published = await publishDraft(input.id, ctx.user.id);
        // 임시저장 발행 시 사이트맵 + RSS 캐시 무효화 + IndexNow 알림
        purgeAllCaches();
        invalidateHomeDataCache();
        invalidateMetaHtmlCache(); // 메타 HTML 캐시 무효화 (임시저장 발행 반영)
        const _pc = await getSiteConfigAll();
        const _pb = (_pc.siteUrl || "https://vibecraftx.com").replace(/\/$/, "");
        const _ppSlug = (published as any)?.customSlug || (published as any)?.slug;
        const _pp = _ppSlug ? `/p/${encodeURIComponent(_ppSlug)}` : `/post/${input.id}`;
        notifyIndexNow(`${_pb}${_pp}`).catch(() => {});
        notifyGoogleIndexing(`${_pb}${_pp}`).catch(() => {});
        // 썸네일 자동 최적화 (fire-and-forget)
        const _pubThumb = (published as any)?.thumbnail;
        if (_pubThumb) {
          optimizeThumbnailAsync(input.id, _pubThumb, updatePostThumbnail).catch(() => {});
        }
        return published;
      }),

    // ─── 유사 글 추천 ──────────────────────────────────────────
    getSimilar: publicProcedure
      .input(z.object({
        postId: z.number(),
        category: z.string(),
        limit: z.number().min(1).max(6).default(2),
      }))
      .query(async ({ input }) => {
        return getSimilarPosts(input.postId, input.category, input.limit);
      }),

    // 메인 고정글 목록 (공개)
    getPinned: publicProcedure.query(async () => {
      return getPinnedPosts();
    }),
    // 최신글 목록 (모든 카테고리 또는 특정 카테고리, 최신순 또는 인기순)
    getLatest: publicProcedure
      .input(z.object({
        limit: z.number().min(1).max(20).optional(),
        sortMode: z.enum(["latest", "popular"]).default("latest").optional(),
        category: z.string().optional(), // 특정 카테고리 필터
      }))
      .query(async ({ input }) => {
        if (input.category) {
          // 카테고리 내에서 최신글/인기글
          const result = await getPostsByCategoryPaged(input.category, 1, input.limit ?? 20, input.sortMode === 'popular' ? 'popular' : 'latest');
          return result.posts;
        }
        if (input.sortMode === 'popular') {
          return getPopularPosts(input.limit ?? 20, 'all');
        }
        return getLatestPosts(input.limit ?? 20);
      }),

    // 인기글 목록 (조회수 순, 특정 카테고리 또는 전체)
    getPopular: publicProcedure
      .input(z.object({
        limit: z.number().min(1).max(20).default(6),
        period: z.enum(["today", "week", "month", "all"]).default("all"),
        category: z.string().optional(), // 특정 카테고리 필터
      }))
      .query(async ({ input }) => {
        if (input.category) {
          // 카테고리 내에서 인기글 (period 무시하고 조회수 순)
          const result = await getPostsByCategoryPaged(input.category, 1, input.limit, 'popular');
          return result.posts;
        }
        return getPopularPosts(input.limit, input.period);
      }),

    // 슬러그로 글 조회 (SEO URL)
    getBySlug: publicProcedure
      .input(z.object({ slug: z.string() }))
      .query(async ({ input, ctx }) => {
        const post = await getPostBySlug(input.slug);
        if (!post) return null;
        if ((post as any).status === 'draft') {
          const user = (ctx as any).user;
          if (!user || user.id !== (post as any).authorId) {
            throw new TRPCError({ code: 'NOT_FOUND', message: '게시물을 찾을 수 없습니다.' });
          }
          return post;
        }
        // 관리자 방문은 조회수에서 제외
        const slugCtxUser = (ctx as any).user;
        if (!slugCtxUser || slugCtxUser.role !== "admin") {
          await incrementPostViews(post.id);
        }
        return post;
      }),
    // customSlug 중복 검사
    checkSlug: protectedProcedure
      .input(z.object({
        slug: z.string().min(1).max(255),
        excludePostId: z.number().optional(), // 수정 시 자신 제외
      }))
      .query(async ({ input }) => {
        // customSlug만 체크 (slug 컬럼은 자동 생성이므로 중복 체크 불필요)
        // getPostBySlug는 slug OR customSlug 둘 다 검색하여 오탐 발생 가능
        const existing = await getPostByCustomSlugOnly(input.slug, input.excludePostId);
        if (!existing) return { available: true };
        return { available: false };
      }),
    // 게시물 태그 조회
    getTags: publicProcedure
      .input(z.object({ postId: z.number() }))
      .query(async ({ input }) => {
        return getTagsByPost(input.postId);
      }),
    // 태그별 게시물 목록
    getByTag: publicProcedure
      .input(z.object({ tag: z.string() }))
      .query(async ({ input }) => {
        return getPostsByTag(input.tag);
      }),
    // 전체 태그 목록 (사용 빈도 순)
    getAllTags: publicProcedure.query(async () => {
      return getAllTags();
    }),
    // 게시물 태그 저장 (작성자 전용)
    setTags: protectedProcedure
      .input(z.object({
        postId: z.number(),
        tags: z.array(
          z.string().min(1).max(100)
            // 이메일 형식 태그 차단
            .refine(t => !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(t), { message: '이메일 형식은 태그로 사용할 수 없습니다.' })
            // # 기호로 시작하는 태그 차단
            .refine(t => !t.startsWith('#'), { message: '# 기호로 시작하는 태그는 허용되지 않습니다.' })
            // 특수문자만으로 구성된 태그 차단
            .refine(t => !/^[$%^*=<>|\\]+$/.test(t), { message: '특수문자만으로 구성된 태그는 허용되지 않습니다.' })
        ).max(20),
      }))
      .mutation(async ({ input, ctx }) => {
        const post = await getPostById(input.postId);
        if (!post) throw new TRPCError({ code: 'NOT_FOUND', message: '게시물을 찾을 수 없습니다.' });
        if (post.authorId !== ctx.user.id && ctx.user.role !== 'admin') {
          throw new TRPCError({ code: 'FORBIDDEN', message: '권한이 없습니다.' });
        }
        await upsertPostTags(input.postId, input.tags);
        return { success: true };
      }),
    // 카테고리 기반 관련 글 추천 (무조건 3개)
    getRelatedByCategory: publicProcedure
      .input(z.object({
        postId: z.number(),
        category: z.string(),
        limit: z.number().min(1).max(6).default(3),
        sortBy: z.enum(['latest', 'views', 'likes']).default('latest'),
      }))
      .query(async ({ input }) => {
        return getRelatedByCategory(input.postId, input.category, input.limit, input.sortBy);
      }),

    // 키워드 유사도 기반 관련 글 추천 (POST mutation으로 URL 길이 제한 회피)
    getRelatedBySimilarity: publicProcedure
      .input(z.object({
        postId: z.number(),
        category: z.string(),
        title: z.string(),
        content: z.string().max(10000),
        excerpt: z.string().nullable().optional(),
        limit: z.number().min(1).max(6).default(3),
      }))
      .mutation(async ({ input }) => {
        return getRelatedBySimilarity(
          input.postId,
          input.category,
          input.title,
          input.content,
          input.excerpt ?? null,
          input.limit
        );
      }),
    // 태그 기반 관련 글 추천
    getRelatedByTags: publicProcedure
      .input(z.object({
        postId: z.number(),
        tags: z.array(z.string()).min(1).max(20),
        limit: z.number().min(1).max(8).default(4),
      }))
      .query(async ({ input }) => {
        return getRelatedPostsByTags(input.postId, input.tags, input.limit);
      }),

    generateExcerpt: protectedProcedure
      .input(z.object({
        title: z.string(),
        content: z.string(),
      }))
      .mutation(async ({ input }) => {
        // style/script 태그 제거 후 텍스트 추출
        const plainText = input.content
          .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, "")
          .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, "")
          .replace(/<[^>]+>/g, " ")
          .replace(/&[a-z]+;/gi, " ")
          .replace(/\s+/g, " ")
          .trim()
          .slice(0, 3000);

        const response = await invokeLLM({
          messages: [
            {
              role: "system",
              content: "당신은 블로그 글의 요약을 작성하는 전문가입니다. 주어진 글의 제목과 본문을 분석하여 독자의 관심을 끌 수 있는 자연스러운 요약 문장을 2~3문장으로 작성해주세요. 요약은 본문의 핵심 내용을 담되, 독자가 글을 읽고 싶어지도록 작성해주세요. 반드시 JSON 형식으로만 응답하세요.",
            },
            {
              role: "user",
              content: `제목: ${input.title}\n\n본문: ${plainText}`,
            },
          ],
          response_format: {
            type: "json_schema",
            json_schema: {
              name: "excerpt_result",
              strict: true,
              schema: {
                type: "object",
                properties: {
                  excerpt: {
                    type: "string",
                    description: "블로그 글 요약 (2~3문장)",
                  },
                },
                required: ["excerpt"],
                additionalProperties: false,
              },
            },
          },
        });

        try {
          const rawContent = response.choices[0]?.message?.content;
          const raw = (typeof rawContent === "string" ? rawContent : JSON.stringify(rawContent)) || "{}";
          const parsed = JSON.parse(raw);
          return { excerpt: parsed.excerpt || "" };
        } catch {
          return { excerpt: "" };
        }
      }),

    generateTags: protectedProcedure
      .input(z.object({
        title: z.string(),
        content: z.string(),
      }))
      .mutation(async ({ input }) => {
        const plainText = input.content
          .replace(/<[^>]+>/g, " ")
          .replace(/&[a-z]+;/gi, " ")
          .replace(/\s+/g, " ")
          .trim()
          .slice(0, 2000);

        const response = await invokeLLM({
          messages: [
            {
              role: "system",
              content: "당신은 블로그 글의 태그를 추출하는 전문가입니다. 주어진 글의 제목과 본문을 분석하여 핵심 키워드 5개를 추출해주세요. 태그는 한국어 또는 영어로 작성하고, 각 태그는 1~3단어로 간결하게 작성해주세요. 반드시 JSON 형식으로만 응답하세요.",
            },
            {
              role: "user",
              content: `제목: ${input.title}\n\n본문: ${plainText}`,
            },
          ],
          response_format: {
            type: "json_schema",
            json_schema: {
              name: "tags_result",
              strict: true,
              schema: {
                type: "object",
                properties: {
                  tags: {
                    type: "array",
                    items: { type: "string" },
                    description: "추출된 태그 5개",
                  },
                },
                required: ["tags"],
                additionalProperties: false,
              },
            },
          },
        });

        try {
          const rawContent = response.choices[0]?.message?.content;
          const raw = (typeof rawContent === "string" ? rawContent : JSON.stringify(rawContent)) || "{}";
          const parsed = JSON.parse(raw);
          const tags: string[] = (parsed.tags || [])
            .slice(0, 5)
            .map((t: string) => t.trim().replace(/^#/, ""))
            .filter((t: string) => t.length > 0);
          return { tags };
        } catch {
          return { tags: [] };
        }
      }),

    search: publicProcedure
      .input(z.object({
        query: z.string().min(1).max(200),
        page: z.number().min(1).default(1),
        limit: z.number().min(1).max(30).default(10),
      }))
      .query(async ({ input }) => {
        return searchPosts(input.query, input.page, input.limit);
      }),

  }),

  apps: router({
    list: publicProcedure.query(async () => getAllVibeApps()),

    get: publicProcedure
      .input(z.object({ id: z.number() }))
      .query(async ({ input }) => getVibeAppById(input.id)),

    download: protectedProcedure
      .input(z.object({ appId: z.number() }))
      .mutation(async ({ input }) => {
        await incrementAppDownloads(input.appId);
        const app = await getVibeAppById(input.appId);
        return {
          downloadUrl: app?.downloadUrl || null,
          originalFilename: app?.originalFilename || null,
        };
      }),

    // 관리자: 전체 앱 목록 (비공개 포함)
    adminList: protectedProcedure.query(async ({ ctx }) => {
      if (ctx.user.role !== 'admin') throw new TRPCError({ code: 'FORBIDDEN' });
      return getAllVibeAppsAdmin();
    }),

    // 관리자: 앱 생성
    create: protectedProcedure
      .input(z.object({
        name: z.string().min(1).max(100),
        description: z.string().min(1),
        longDescription: z.string().optional(),
        category: z.string().optional(),
        techStack: z.string().optional(),
        features: z.string().optional(),
        howToUse: z.string().optional(),
        appUrl: z.string().url().optional().or(z.literal('')),
        downloadUrl: z.string().optional(),
        originalFilename: z.string().optional(),
        thumbnail: z.string().optional(),
        gradient: z.string().optional(),
        published: z.boolean().default(true),
      }))
      .mutation(async ({ input, ctx }) => {
        if (ctx.user.role !== 'admin') throw new TRPCError({ code: 'FORBIDDEN' });
        return createVibeApp({
          ...input,
          appUrl: input.appUrl || null,
          authorId: ctx.user.id,
        });
      }),

    // 관리자: 앱 수정
    update: protectedProcedure
      .input(z.object({
        id: z.number(),
        name: z.string().min(1).max(100).optional(),
        description: z.string().optional(),
        longDescription: z.string().optional(),
        category: z.string().optional(),
        techStack: z.string().optional(),
        features: z.string().optional(),
        howToUse: z.string().optional(),
        appUrl: z.string().optional().nullable(),
        downloadUrl: z.string().optional().nullable(),
        originalFilename: z.string().optional().nullable(),
        thumbnail: z.string().optional().nullable(),
        gradient: z.string().optional().nullable(),
        published: z.boolean().optional(),
      }))
      .mutation(async ({ input, ctx }) => {
        if (ctx.user.role !== 'admin') throw new TRPCError({ code: 'FORBIDDEN' });
        const { id, ...data } = input;
        await updateVibeApp(id, data);
        return { success: true };
      }),

    // 관리자: 앱 삭제
    delete: protectedProcedure
      .input(z.object({ id: z.number() }))
      .mutation(async ({ input, ctx }) => {
        if (ctx.user.role !== 'admin') throw new TRPCError({ code: 'FORBIDDEN' });
        await deleteVibeApp(input.id);
        return { success: true };
      }),

    // 일반 사용자: 앱 등록 신청
    submit: protectedProcedure
      .input(z.object({
        name: z.string().min(1).max(100),
        description: z.string().min(1),
        longDescription: z.string().optional(),
        category: z.string().optional(),
        techStack: z.string().optional(),
        features: z.string().optional(),
        howToUse: z.string().optional(),
        appUrl: z.string().url().optional().or(z.literal('')),
        thumbnail: z.string().optional(),
        // PC 앱 파일
        pcDownloadUrl: z.string().optional().nullable(),
        pcOriginalFilename: z.string().optional().nullable(),
        // 모바일 앱 파일
        mobileDownloadUrl: z.string().optional().nullable(),
        mobileOriginalFilename: z.string().optional().nullable(),
      }))
      .mutation(async ({ input, ctx }) => {
        await createVibeAppSubmission({
          ...input,
          appUrl: input.appUrl || null,
          authorId: ctx.user.id,
          submittedBy: ctx.user.id,
        });
        // 소유자에게 알림
        await notifyOwner({
          title: `새 앱 등록 신청: ${input.name}`,
          content: `${ctx.user.name || ctx.user.openId}님이 앱 "${input.name}"을 등록 신청했습니다.`,
        });
        return { success: true };
      }),

    // 내가 신청한 앱 목록
    mySubmissions: protectedProcedure.query(async ({ ctx }) => {
      return getMySubmissions(ctx.user.id);
    }),

    // 관리자: 신청 목록 (pending)
    listSubmissions: protectedProcedure.query(async ({ ctx }) => {
      if (ctx.user.role !== 'admin' && !ctx.user.isOwner) throw new TRPCError({ code: 'FORBIDDEN' });
      return listPendingSubmissions();
    }),

    // 관리자: 신청 승인
    approveSubmission: protectedProcedure
      .input(z.object({ id: z.number() }))
      .mutation(async ({ input, ctx }) => {
        if (ctx.user.role !== 'admin' && !ctx.user.isOwner) throw new TRPCError({ code: 'FORBIDDEN' });
        await approveSubmission(input.id);
        return { success: true };
      }),

    // 관리자: 신청 거절
    rejectSubmission: protectedProcedure
      .input(z.object({ id: z.number(), reason: z.string().optional() }))
      .mutation(async ({ input, ctx }) => {
        if (ctx.user.role !== 'admin' && !ctx.user.isOwner) throw new TRPCError({ code: 'FORBIDDEN' });
        await rejectSubmission(input.id, input.reason || '');
        return { success: true };
      }),

    reviews: router({
      list: publicProcedure
        .input(z.object({ appId: z.number() }))
        .query(async ({ input }) => getReviewsByAppId(input.appId)),

      create: protectedProcedure
        .input(z.object({
          appId: z.number(),
          rating: z.number().min(1).max(5),
          content: z.string().min(1).max(1000),
        }))
        .mutation(async ({ input, ctx }) => {
          return createAppReview({
            appId: input.appId,
            userId: ctx.user.id,
            rating: input.rating,
            content: input.content,
          });
        }),
    }),
  }),

  apiKeys: router({
    list: protectedProcedure.query(async ({ ctx }) => {
      return getApiKeysByUser(ctx.user.id);
    }),

    create: protectedProcedure
      .input(z.object({ name: z.string().min(1).max(100) }))
      .mutation(async ({ input, ctx }) => {
        return createApiKey(ctx.user.id, input.name);
      }),

    revoke: protectedProcedure
      .input(z.object({ id: z.number() }))
      .mutation(async ({ input, ctx }) => {
        await revokeApiKey(input.id, ctx.user.id);
        return { success: true };
      }),
    delete: protectedProcedure
      .input(z.object({ id: z.number() }))
      .mutation(async ({ input, ctx }) => {
        await deleteApiKey(input.id, ctx.user.id);
        return { success: true };
      }),
    reactivate: protectedProcedure
      .input(z.object({ id: z.number() }))
      .mutation(async ({ input, ctx }) => {
        await reactivateApiKey(input.id, ctx.user.id);
        return { success: true };
      }),
  }),

  // 관리자 전용 라우터
  admin: router({
    // 관리자 권한 확인 미들웨어
    _check: protectedProcedure.query(({ ctx }) => {
      if (ctx.user.role !== 'admin') throw new TRPCError({ code: 'FORBIDDEN', message: '관리자만 접근 가능합니다.' });
      return { isAdmin: true };
    }),

    // SEO 현황: 태그 목록 + 글 수 + noindex 여부
    getTagSeoStats: protectedProcedure.query(async ({ ctx }) => {
      if (ctx.user.role !== 'admin') throw new TRPCError({ code: 'FORBIDDEN' });
      return getTagSeoStats();
    }),

    // SEO 현황: 카테고리 목록 + 글 수 + noindex 여부
    getCategorySeoStats: protectedProcedure.query(async ({ ctx }) => {
      if (ctx.user.role !== 'admin') throw new TRPCError({ code: 'FORBIDDEN' });
      return getCategorySeoStats();
    }),

    // SEO 전체 개요 통계
    getSeoOverview: protectedProcedure.query(async ({ ctx }) => {
      if (ctx.user.role !== 'admin') throw new TRPCError({ code: 'FORBIDDEN' });
      return getSeoOverview();
    }),

    // 글 SEO 감사 (제목 길이, customSlug 미설정 등)
    getPostSeoAudit: protectedProcedure.query(async ({ ctx }) => {
      if (ctx.user.role !== 'admin') throw new TRPCError({ code: 'FORBIDDEN' });
      return getPostSeoAudit();
    }),

    // 문제 태그 일괄 삭제 (이메일, 특수문자, 글 없는 태그)
    cleanupProblemTags: protectedProcedure
      .input(z.object({ dryRun: z.boolean().default(true) }))
      .mutation(async ({ ctx, input }) => {
        if (ctx.user.role !== 'admin') throw new TRPCError({ code: 'FORBIDDEN' });
        return cleanupProblemTags(input.dryRun);
      }),

    // 사이트 설정
    getSiteConfig: publicProcedure.query(async () =>
      cache.get('admin:siteConfig', () => getSiteConfigAll(), TTL.LONG)
    ),

    // 홈페이지 초기 데이터 통합 엔드포인트 (FCP/LCP 개선)
    // 기존: getSiteConfig → getNavItems (폭포수 2단) → 각 섹션 쿼리
    // 개선: 한 번의 요청으로 siteConfig + navItems 동시 반환 + 서버 캐시 적용
    getHomeInitialData: publicProcedure.query(async () => {
      return cache.get('home:initial', async () => {
        const [siteConfig, navItemsList] = await Promise.all([
        getSiteConfigAll(),
        getNavItemsFromDb(),
      ]);
      // showOnHome 섹션만 필터링하여 섹션별 게시물 미리 로드 (N+1 API 호출 방지)
      const homeNavItems = navItemsList.filter((item: any) => item.showOnHome !== false);
      // heroSectionMode: 첫 번째 카테고리의 정렬 방식을 오버라이드
      const heroSectionMode = (siteConfig as any)?.heroSectionMode || 'current';
      const sectionPostsEntries = await Promise.all(
        homeNavItems.map(async (item: any, itemIdx: number) => {
          const categoryKey = (item.path || '').replace(/^\/category\//, '').replace(/^\//, '') || item.path;
          const sectionStyle = item.sectionStyle || 'grid';
          // 첫 번째 카테고리에 heroSectionMode 오버라이드 적용
          let sortMode: 'latest' | 'popular' = (item.sectionSortMode as 'latest' | 'popular') || 'latest';
          if (itemIdx === 0 && heroSectionMode === 'popular') sortMode = 'popular';
          else if (itemIdx === 0 && heroSectionMode === 'latest') sortMode = 'latest';
          const displayRows = item.displayRows ?? 1;
          // sectionStyle별 기본 표시 개수 계산
          let limit: number;
          if (sectionStyle === 'apps') limit = displayRows * 2;
          else if (sectionStyle === 'list' || sectionStyle === 'list2') limit = displayRows * 4;
          else if (sectionStyle === 'featured') limit = 1 + displayRows * 4; // 대형 1개 + 소형 4개
          else limit = displayRows * 3; // grid, overlay 등
          limit = Math.min(limit, 20);
          // stat-banner는 게시물 없음
          if (sectionStyle === 'stat-banner') {
            return [categoryKey, { posts: [], total: 0, page: 1, limit: 0 }] as const;
          }
          // download 계열은 limit 재계산 (1줄 = 4개)
          if (['download-grid', 'download-row', 'download-card'].includes(sectionStyle)) {
            const dlLimit = Math.min(displayRows * 4, 20);
            const result = await getPostsByCategoryPaged(categoryKey, 1, dlLimit, sortMode);
            return [categoryKey, result] as const;
          }
          // latest 스타일은 전체 최신글/인기글
          if (sectionStyle === 'latest') {
            const posts = sortMode === 'popular'
              ? await getPopularPosts(limit)
              : await getLatestPosts(limit);
            return [categoryKey, { posts, total: posts.length, page: 1, limit }] as const;
          }
          // __latest__ 카테고리 또는 list2 스타일은 전체 최신글
          if (categoryKey === '__latest__' || (sectionStyle === 'list2' && categoryKey === '__latest__')) {
            const result = await getAllPostsPaged(1, limit, sortMode);
            return [categoryKey, result] as const;
          }
          // 카테고리별 게시물
          const result = await getPostsByCategoryPaged(categoryKey, 1, limit, sortMode);
          return [categoryKey, result] as const;
        })
      );
        const sectionPosts = Object.fromEntries(sectionPostsEntries);
        return { siteConfig, navItems: navItemsList, sectionPosts };
      }, TTL.LONG); // 15분 캐시 - 홈 데이터 서버 캐싱 (성능 최적화)
    }),

    updateSiteConfig: protectedProcedure
      .input(z.record(z.string(), z.string().nullable().optional()))
      .mutation(async ({ input, ctx }) => {
        if (ctx.user.role !== 'admin') throw new TRPCError({ code: 'FORBIDDEN' });
        // null/undefined 값 필터링 후 저장
        const sanitized = Object.fromEntries(
          Object.entries(input).filter(([, v]) => v !== null && v !== undefined)
        ) as Record<string, string>;
        return upsertSiteConfigBulk(sanitized);
      }),

    // 사이드바 항목
    getSidebarItems: publicProcedure.query(async () =>
      cache.get('admin:sidebarItems', () => getAllSidebarItems(), TTL.LONG)
    ),

    createSidebarItem: protectedProcedure
      .input(z.object({
        side: z.enum(["left", "right"]),
        itemType: z.enum(["ad", "link", "slot", "html-ad"]).default("ad"),
        title: z.string().max(100).default(''),
        description: z.string().optional().nullable(),
        url: z.string().optional().nullable(),
        bgColor: z.string().optional().nullable(),
        textColor: z.string().optional().nullable(),
        btnText: z.string().optional().nullable(),
        btnColor: z.string().optional().nullable(),
        badge: z.string().optional().nullable(),
        price: z.string().optional().nullable(),
        htmlCode: z.string().optional().nullable(),
        sortOrder: z.number().default(0),
        visible: z.boolean().default(true),
        // 메뉴 스타일 옵션 (link 타입 전용)
        menuStyle: z.enum(["default", "button", "pill", "underline", "card", "indent", "neon", "glass", "floating", "bold-border"]).optional().nullable(),
        menuFontWeight: z.enum(["normal", "bold", "extrabold"]).optional().nullable(),
        menuBgColor: z.string().optional().nullable(),
        menuBorderRadius: z.number().optional().nullable(),
        menuFontSize: z.number().optional().nullable(),
        menuHeaderHidden: z.boolean().optional().nullable(),
      }))
      .mutation(async ({ input, ctx }) => {
        if (ctx.user.role !== 'admin') throw new TRPCError({ code: 'FORBIDDEN' });
        return createSidebarItem(input);
      }),

    updateSidebarItem: protectedProcedure
      .input(z.object({
        id: z.number(),
        side: z.enum(["left", "right"]).optional(),
        itemType: z.enum(["ad", "link", "slot", "html-ad"]).optional(),
        title: z.string().max(100).optional(),  // min(1) 제거: link 타입은 제목 없이도 저장 가능
        description: z.string().optional().nullable(),
        url: z.string().optional().nullable(),
        bgColor: z.string().optional().nullable(),
        textColor: z.string().optional().nullable(),
        btnText: z.string().optional().nullable(),
        btnColor: z.string().optional().nullable(),
        badge: z.string().optional().nullable(),
        price: z.string().optional().nullable(),
        htmlCode: z.string().optional().nullable(),
        sortOrder: z.number().optional(),
        visible: z.boolean().optional(),
        // 메뉴 스타일 옵션 (link 타입 전용)
        menuStyle: z.enum(["default", "button", "pill", "underline", "card", "indent", "neon", "glass", "floating", "bold-border"]).optional().nullable(),
        menuFontWeight: z.enum(["normal", "bold", "extrabold"]).optional().nullable(),
        menuBgColor: z.string().optional().nullable(),
        menuBorderRadius: z.number().optional().nullable(),
        menuFontSize: z.number().optional().nullable(),
        menuHeaderHidden: z.boolean().optional().nullable(),
      }))
      .mutation(async ({ input, ctx }) => {
        if (ctx.user.role !== 'admin') throw new TRPCError({ code: 'FORBIDDEN' });
        const { id, ...data } = input;
        return updateSidebarItem(id, data);
      }),

    deleteSidebarItem: protectedProcedure
      .input(z.object({ id: z.number() }))
      .mutation(async ({ input, ctx }) => {
        if (ctx.user.role !== 'admin') throw new TRPCError({ code: 'FORBIDDEN' });
        return deleteSidebarItem(input.id);
      }),

    reorderSidebarItems: protectedProcedure
      .input(z.array(z.object({ id: z.number(), sortOrder: z.number() })))
      .mutation(async ({ input, ctx }) => {
        if (ctx.user.role !== 'admin') throw new TRPCError({ code: 'FORBIDDEN' });
        return reorderSidebarItems(input);
      }),

    // 홈 섹션
    getHomeSections: publicProcedure.query(async () => getHomeSections()),

    updateHomeSections: protectedProcedure
      .input(z.array(z.object({ id: z.number(), sortOrder: z.number(), visible: z.boolean() })))
      .mutation(async ({ input, ctx }) => {
        if (ctx.user.role !== 'admin') throw new TRPCError({ code: 'FORBIDDEN' });
        const result = await updateHomeSectionOrder(input);
        cache.invalidate('admin:navItems'); // 관리자 네비 목록 캐시 무효화
        cache.invalidate('home:initial');
        invalidateHomeDataCache();
        invalidateMetaHtmlCache();
        return result;
      }),

    updateHomeSectionDetail: protectedProcedure
      .input(z.object({
        id: z.number(),
        title: z.string().optional(),
        subtitle: z.string().optional().nullable(),
        categoryPath: z.string().optional().nullable(),
      }))
      .mutation(async ({ input, ctx }) => {
        if (ctx.user.role !== 'admin') throw new TRPCError({ code: 'FORBIDDEN' });
        const { id, ...data } = input;
        const result = await updateHomeSectionDetail(id, {
          ...data,
          subtitle: data.subtitle ?? undefined,
        });
        invalidateHomeDataCache();   // 섹션 상세 변경 즉시 반영
        invalidateMetaHtmlCache();   // 메타 HTML 캐시 무효화
        return result;
      }),

    // 네비게이션
    getNavItems: publicProcedure.query(async () => getNavItemsFromDb()),

    updateNavItems: protectedProcedure
      .input(z.array(z.object({
        id: z.number(),
        label: z.string(),
        path: z.string(),
        sortOrder: z.number(),
        visible: z.boolean(),
        sectionStyle: z.enum(["featured", "grid", "apps", "latest", "overlay", "list", "list2", "stat-banner", "download-grid", "download-row", "download-card", "developers"]).optional(),
        description: z.string().nullable().optional(),
        bgColor: z.string().nullable().optional(),
        textColor: z.string().nullable().optional(),
        displayRows: z.number().min(1).max(5).optional(),
        sectionMarginBottom: z.number().min(0).max(500).optional(),
        showOnHome: z.boolean().optional(),
        thumbSize: z.enum(["sm", "md", "lg"]).optional(),
        statBannerData: z.string().nullable().optional(),
        sectionSortMode: z.enum(["latest", "popular"]).optional(),
      }))
    )
      .mutation(async ({ input, ctx }) => {
        if (ctx.user.role !== 'admin') throw new TRPCError({ code: 'FORBIDDEN' });
        const result = await updateNavItemsInDb(input);
        cache.invalidate('home:initial');    // 홈 초기 데이터 캐시 무효화
        cache.invalidate('admin:navItems'); // 관리자 네비 목록 캐시 무효화
        invalidateHomeDataCache();
        invalidateMetaHtmlCache();
        return result;
      }),

    createNavItem: protectedProcedure
      .input(z.object({
        label: z.string(),
        path: z.string(),
        sortOrder: z.number().default(99),
        visible: z.boolean().default(true),
        showOnHome: z.boolean().default(true),
        sectionStyle: z.enum(["featured", "grid", "apps", "latest", "overlay", "list", "list2", "stat-banner", "download-grid", "download-row", "download-card", "developers"]).default("grid"),
        description: z.string().optional(),
        displayRows: z.number().min(1).max(5).default(1),
        thumbSize: z.enum(["sm", "md", "lg"]).default("md").optional(),
      }))
      .mutation(async ({ input, ctx }) => {
        console.log('[createNavItem] called, user role:', ctx.user.role, 'input:', JSON.stringify(input));
        if (ctx.user.role !== 'admin') throw new TRPCError({ code: 'FORBIDDEN' });
        const result = await createNavItemInDb(input);
        console.log('[createNavItem] DB insert result:', JSON.stringify(result));
        cache.invalidate('home:initial');    // 홈 초기 데이터 캐시 무효화
        cache.invalidate('admin:navItems'); // 관리자 네비 목록 캐시 무효화
        invalidateHomeDataCache();
        invalidateMetaHtmlCache();
        return result;
      }),

    deleteNavItem: protectedProcedure
      .input(z.object({ id: z.number() }))
      .mutation(async ({ input, ctx }) => {
        if (ctx.user.role !== 'admin') throw new TRPCError({ code: 'FORBIDDEN' });
        const result = await deleteNavItemFromDb(input.id);
        cache.invalidate('home:initial');    // 홈 초기 데이터 캐시 무효화
        cache.invalidate('admin:navItems'); // 관리자 네비 목록 캐시 무효화
        invalidateHomeDataCache();
        invalidateMetaHtmlCache();
        return result;
      }),

    // 카테고리 소개 HTML 업데이트
    updateCategoryIntroHtml: protectedProcedure
      .input(z.object({ id: z.number(), introHtml: z.string() }))
      .mutation(async ({ input, ctx }) => {
        if (ctx.user.role !== 'admin') throw new TRPCError({ code: 'FORBIDDEN' });
        return updateNavItemIntroHtml(input.id, input.introHtml);
      }),

    // 게시물 관리
    listAllPosts: protectedProcedure.query(async ({ ctx }) => {
      if (ctx.user.role !== 'admin') throw new TRPCError({ code: 'FORBIDDEN' });
      return getAllPostsAdmin();
    }),

    updatePostStatus: protectedProcedure
      .input(z.object({ id: z.number(), status: z.enum(["draft", "published"]) }))
      .mutation(async ({ input, ctx }) => {
        if (ctx.user.role !== 'admin') throw new TRPCError({ code: 'FORBIDDEN' });
        const statusResult = await adminUpdatePostStatus(input.id, input.status);
        // 발행 상태로 변경 시 사이트맵 + RSS 캐시 무효화 + IndexNow 알림
        if (input.status === "published") {
          purgeAllCaches();
          const _asc = await getSiteConfigAll();
          const _asb = (_asc.siteUrl || "https://vibecraftx.com").replace(/\/$/, "");
          const _asSlug = (statusResult as any)?.customSlug || (statusResult as any)?.slug;
          const _asp = _asSlug ? `/p/${encodeURIComponent(_asSlug)}` : `/post/${input.id}`;
          notifyIndexNow(`${_asb}${_asp}`).catch(() => {});
          notifyGoogleIndexing(`${_asb}${_asp}`).catch(() => {});
        }
        return statusResult;
      }),

    deletePost: protectedProcedure
      .input(z.object({ id: z.number() }))
      .mutation(async ({ input, ctx }) => {
        if (ctx.user.role !== 'admin') throw new TRPCError({ code: 'FORBIDDEN' });
        return adminDeletePost(input.id);
      }),
    restorePost: protectedProcedure
      .input(z.object({ id: z.number() }))
      .mutation(async ({ input, ctx }) => {
        if (ctx.user.role !== 'admin') throw new TRPCError({ code: 'FORBIDDEN' });
        return adminRestorePost(input.id);
      }),
    hardDeletePost: protectedProcedure
      .input(z.object({ id: z.number() }))
      .mutation(async ({ input, ctx }) => {
        if (ctx.user.role !== 'admin') throw new TRPCError({ code: 'FORBIDDEN' });
        return adminHardDeletePost(input.id);
      }),
    getDeletedPosts: protectedProcedure
      .query(async ({ ctx }) => {
        if (ctx.user.role !== 'admin') throw new TRPCError({ code: 'FORBIDDEN' });
        return getDeletedPostsAdmin();
      }),
    getLegalPage: publicProcedure
      .input(z.object({ slug: z.string() }))
      .query(async ({ input }) => {
        return getLegalPage(input.slug);
      }),
    upsertLegalPage: protectedProcedure
      .input(z.object({
        slug: z.enum(["privacy", "terms"]),
        title: z.string().min(1).max(200),
        content: z.string(),
      }))
      .mutation(async ({ input, ctx }) => {
        if (ctx.user.role !== 'admin') throw new TRPCError({ code: 'FORBIDDEN' });
        return upsertLegalPage(input.slug, input.title, input.content);
      }),

    // 조회수 상세 통계 (관리자)
    getPostViewStats: protectedProcedure
      .input(z.object({ postId: z.number() }))
      .query(async ({ input, ctx }) => {
        if (ctx.user.role !== 'admin') throw new TRPCError({ code: 'FORBIDDEN' });
        return getPostViewStats(input.postId);
      }),

    // 카테고리별 댓글 설정 (공개 - 게시글 페이지에서 댓글 허용 여부 확인용)
    getCategoryCommentSettings: publicProcedure
      .query(async () =>
        cache.get('admin:categoryCommentSettings', () => getCategoryCommentSettings(), TTL.LONG)
      ),

    updateCategoryCommentSetting: protectedProcedure
      .input(z.object({ categoryKey: z.string(), commentsEnabled: z.boolean() }))
      .mutation(async ({ input, ctx }) => {
        if (ctx.user.role !== 'admin') throw new TRPCError({ code: 'FORBIDDEN' });
        return upsertCategoryCommentSetting(input.categoryKey, input.commentsEnabled);
      }),

    // 댓글 관리 (관리자)
    listAllComments: protectedProcedure.query(async ({ ctx }) => {
      if (ctx.user.role !== 'admin') throw new TRPCError({ code: 'FORBIDDEN' });
      return getAllComments();
    }),

    toggleCommentVisibility: protectedProcedure
      .input(z.object({ id: z.number(), isHidden: z.boolean() }))
      .mutation(async ({ input, ctx }) => {
        if (ctx.user.role !== 'admin') throw new TRPCError({ code: 'FORBIDDEN' });
        return toggleCommentVisibility(input.id, input.isHidden);
      }),

    deleteComment: protectedProcedure
      .input(z.object({ id: z.number() }))
      .mutation(async ({ input, ctx }) => {
        if (ctx.user.role !== 'admin') throw new TRPCError({ code: 'FORBIDDEN' });
        return deleteComment(input.id);
      }),

    // 자동화 발행 로그 (관리자)
    getPublishLogs: protectedProcedure
      .input(z.object({ limit: z.number().min(1).max(200).default(100) }).optional())
      .query(async ({ input, ctx }) => {
        if (ctx.user.role !== 'admin') throw new TRPCError({ code: 'FORBIDDEN' });
        return getPublishLogs(input?.limit ?? 100);
      }),

    // 고정글 토글 (관리자)
    togglePinPost: protectedProcedure
      .input(z.object({ postId: z.number(), pin: z.boolean() }))
      .mutation(async ({ input, ctx }) => {
        if (ctx.user.role !== 'admin') throw new TRPCError({ code: 'FORBIDDEN' });
        return togglePinnedPost(input.postId, input.pin);
      }),

    // 일괄 작업 (게시물 관리 다중 선택)
    bulkUpdatePostStatus: protectedProcedure
      .input(z.object({ ids: z.array(z.number()).min(1), status: z.enum(["draft", "published"]) }))
      .mutation(async ({ input, ctx }) => {
        if (ctx.user.role !== 'admin') throw new TRPCError({ code: 'FORBIDDEN' });
        const result = await bulkUpdatePostStatus(input.ids, input.status);
        purgeAllCaches();
        return result;
      }),

    bulkDeletePosts: protectedProcedure
      .input(z.object({ ids: z.array(z.number()).min(1) }))
      .mutation(async ({ input, ctx }) => {
        if (ctx.user.role !== 'admin') throw new TRPCError({ code: 'FORBIDDEN' });
        const result = await bulkDeletePosts(input.ids);
        purgeAllCaches();
        return result;
      }),

    bulkUpdateCategory: protectedProcedure
      .input(z.object({ ids: z.array(z.number()).min(1), category: z.string().min(1) }))
      .mutation(async ({ input, ctx }) => {
        if (ctx.user.role !== 'admin') throw new TRPCError({ code: 'FORBIDDEN' });
        return bulkUpdatePostCategory(input.ids, input.category);
      }),

    bulkRestorePosts: protectedProcedure
      .input(z.object({ ids: z.array(z.number()).min(1) }))
      .mutation(async ({ input, ctx }) => {
        if (ctx.user.role !== 'admin') throw new TRPCError({ code: 'FORBIDDEN' });
        const result = await bulkRestorePosts(input.ids);
        purgeAllCaches();
        return result;
      }),

    bulkHardDeletePosts: protectedProcedure
      .input(z.object({ ids: z.array(z.number()).min(1) }))
      .mutation(async ({ input, ctx }) => {
        if (ctx.user.role !== 'admin') throw new TRPCError({ code: 'FORBIDDEN' });
        const result = await bulkHardDeletePosts(input.ids);
        purgeAllCaches();
        return result;
      }),
    // 임시저장 전체 삭제
    deleteAllDrafts: protectedProcedure
      .mutation(async ({ ctx }) => {
        if (ctx.user.role !== 'admin') throw new TRPCError({ code: 'FORBIDDEN' });
        const result = await deleteAllDrafts();
        purgeAllCaches();
        return result;
      }),
    // 앱 모드 글 embedWidth 일괄 변경
    batchUpdateEmbedWidth: protectedProcedure
      .input(z.object({
        ids: z.array(z.number()).min(1),
        embedWidth: z.enum(["content", "full"]),
      }))
      .mutation(async ({ input, ctx }) => {
        if (ctx.user.role !== 'admin') throw new TRPCError({ code: 'FORBIDDEN' });
        return batchUpdatePostEmbedWidth(input.ids, input.embedWidth);
      }),

    toggleShowInSection: protectedProcedure
      .input(z.object({
        id: z.number(),
        showInSection: z.boolean(),
      }))
      .mutation(async ({ input, ctx }) => {
        if (ctx.user.role !== 'admin') throw new TRPCError({ code: 'FORBIDDEN' });
        return adminToggleShowInSection(input.id, input.showInSection);
      }),

    toggleAllowComments: protectedProcedure
      .input(z.object({
        id: z.number(),
        allowComments: z.boolean(),
      }))
      .mutation(async ({ input, ctx }) => {
        if (ctx.user.role !== 'admin') throw new TRPCError({ code: 'FORBIDDEN' });
        return adminToggleAllowComments(input.id, input.allowComments);
      }),

    bulkToggleAllowComments: protectedProcedure
      .input(z.object({
        ids: z.array(z.number()).min(1),
        allowComments: z.boolean(),
      }))
      .mutation(async ({ input, ctx }) => {
        if (ctx.user.role !== 'admin') throw new TRPCError({ code: 'FORBIDDEN' });
        return bulkToggleAllowComments(input.ids, input.allowComments);
      }),

    // 관리자 전용: 게시글 customSlug 직접 편집 (301 리디렉션 이력 자동 저장)
    updatePostCustomSlug: protectedProcedure
      .input(z.object({
        id: z.number(),
        customSlug: z.string().nullable(),
      }))
      .mutation(async ({ input, ctx }) => {
        if (ctx.user.role !== 'admin') throw new TRPCError({ code: 'FORBIDDEN' });
        // updatePost를 사용하면 slug_history 자동 저장 + 중복 검사가 이미 적용됨
        const post = await getPostById(input.id);
        if (!post) throw new TRPCError({ code: 'NOT_FOUND' });
        const result = await updatePost(input.id, post.authorId, { customSlug: input.customSlug || null });
        purgeAllCaches();
        return result;
      }),

    // 예약 발행 수동 실행 (관리자 요청 또는 스케줄러)
    runScheduledPublish: protectedProcedure
      .mutation(async ({ ctx }) => {
        if (ctx.user.role !== 'admin') throw new TRPCError({ code: 'FORBIDDEN' });
        const count = await publishScheduledPosts();
        return { published: count };
      }),

    // ─── 이미지 일괄 최적화 ─────────────────────────────────────────────────────
    /** 외부 URL 썸네일을 WebP로 일괄 최적화 (관리자 전용) */
    bulkOptimizeThumbnails: protectedProcedure
      .mutation(async ({ ctx }) => {
        if (ctx.user.role !== 'admin') throw new TRPCError({ code: 'FORBIDDEN' });
        const db = await (await import('./db')).getDb();
        if (!db) throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR', message: 'DB 연결 실패' });
        const { posts: postsTable } = await import('../drizzle/schema');
        const { isNull } = await import('drizzle-orm');
        // 외부 URL 썸네일만 조회 (이미 /manus-storage/ 경로는 제외)
        const allPostRows = await db
          .select({ id: postsTable.id, thumbnail: postsTable.thumbnail })
          .from(postsTable)
          .where(isNull(postsTable.deletedAt));
        const targets = allPostRows.filter(
          p => p.thumbnail &&
          !p.thumbnail.startsWith('/manus-storage/') &&
          (p.thumbnail.startsWith('http://') || p.thumbnail.startsWith('https://'))
        );
        if (targets.length === 0) return { optimized: 0, skipped: 0, failed: 0, total: 0 };
        const { optimizeThumbnail } = await import('./imageOptimizer');
        const { updatePostThumbnail } = await import('./db');
        let optimized = 0, failed = 0;
        // 순차 처리 (서버 부하 방지)
        for (const post of targets) {
          try {
            const newUrl = await optimizeThumbnail(post.thumbnail!, post.id);
            if (newUrl !== post.thumbnail) {
              await updatePostThumbnail(post.id, newUrl);
              optimized++;
            }
          } catch {
            failed++;
          }
        }
        return { optimized, skipped: targets.length - optimized - failed, failed, total: targets.length };
      }),
    /**
     * 기존 단일 해상도 썸네일을 320w/640w/1200w 반응형 WebP로 일괄 변환
     * /manus-storage/ 경로이지만 _1200w.webp 형식이 아닌 이미지를 대상으로 함
     */
    bulkGenerateResponsiveThumbnails: protectedProcedure
      .mutation(async ({ ctx }) => {
        if (ctx.user.role !== 'admin') throw new TRPCError({ code: 'FORBIDDEN' });
        const db = await (await import('./db')).getDb();
        if (!db) throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR', message: 'DB 연결 실패' });
        const { posts: postsTable } = await import('../drizzle/schema');
        const { isNull } = await import('drizzle-orm');
        const allPostRows = await db
          .select({ id: postsTable.id, thumbnail: postsTable.thumbnail })
          .from(postsTable)
          .where(isNull(postsTable.deletedAt));
        // /manus-storage/ 경로이지만 반응형 형식이 아닌 이미지만 대상
        const targets = allPostRows.filter(p => {
          if (!p.thumbnail) return false;
          if (!p.thumbnail.startsWith('/manus-storage/')) return false;
          if (p.thumbnail.includes('_1200w.webp') || p.thumbnail.includes('_640w.webp') || p.thumbnail.includes('_320w.webp')) return false;
          if (p.thumbnail.endsWith('.gif') || p.thumbnail.endsWith('.svg')) return false;
          return true;
        });
        if (targets.length === 0) return { optimized: 0, skipped: 0, failed: 0, total: 0 };
        const { generateResponsiveThumbnail } = await import('./imageOptimizer');
        const { updatePostThumbnail } = await import('./db');
        // 서버 내부에서 스토리지 접근 (localhost)
      const port = getRuntimeEnv("PORT") || 3000;
        const storageBaseUrl = `http://localhost:${port}`;
        let optimized = 0, failed = 0;
        for (const post of targets) {
          try {
            const newUrl = await generateResponsiveThumbnail(post.thumbnail!, storageBaseUrl);
            if (newUrl !== post.thumbnail) {
              await updatePostThumbnail(post.id, newUrl);
              optimized++;
            } else {
              failed++;
            }
          } catch {
            failed++;
          }
        }
        return { optimized, skipped: targets.length - optimized - failed, failed, total: targets.length };
      }),
    /** 게시물 다운로드 링크 URL 일괄 정규화 (구버전 &amp; 엔티티, 중복 파라미터 수정) */
    fixDownloadUrls: protectedProcedure
      .mutation(async ({ ctx }) => {
        if (ctx.user.role !== 'admin') throw new TRPCError({ code: 'FORBIDDEN' });
        const db = await (await import('./db')).getDb();
        if (!db) throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR', message: 'DB 연결 실패' });
        const { posts: postsTable } = await import('../drizzle/schema');
        const { isNull, sql } = await import('drizzle-orm');
        // 다운로드 링크가 있는 게시물 조회
        const rows = await db
          .select({ id: postsTable.id, title: postsTable.title, content: postsTable.content })
          .from(postsTable)
          .where(isNull(postsTable.deletedAt));
        const targets = rows.filter(r => r.content && r.content.includes('manus-storage') && r.content.includes('download'));

        function extractMeaningfulFilenameLocal(basename: string): string {
          const lastDot = basename.lastIndexOf('.');
          const ext = lastDot >= 0 ? basename.slice(lastDot) : '';
          const nameWithoutExt = lastDot >= 0 ? basename.slice(0, lastDot) : basename;
          const parts = nameWithoutExt.split('_');
          const isTimestamp = parts.length >= 2 && /^\d{13}$/.test(parts[0]);
          if (isTimestamp) {
            const isHash = parts.length >= 4 && /^[a-f0-9]{8}$/.test(parts[parts.length - 1]);
            const slugParts = isHash ? parts.slice(2, parts.length - 1) : parts.length >= 3 ? parts.slice(2) : [];
            if (slugParts.length > 0) {
              const fileSlug = slugParts.join('_');
              const slugWithoutEmbeddedExt = fileSlug.replace(/\.[a-zA-Z0-9]{2,5}$/, '');
              const meaningfulChars = slugWithoutEmbeddedExt.replace(/[^a-zA-Z0-9.-]/g, '');
              if (meaningfulChars.length >= 2) {
                const cleaned = slugWithoutEmbeddedExt.replace(/_+/g, '_').replace(/^[_-]+|[_-]+$/g, '');
                if (cleaned.length > 0) return cleaned + ext;
              }
            }
            return 'file' + ext;
          }
          return basename;
        }

        function normalizeDownloadUrlLocal(rawUrl: string): string {
          let url = rawUrl.replace(/&amp;/g, '&');
          const qIdx = url.indexOf('?');
          if (qIdx === -1) {
            const key = url.replace('/manus-storage/', '');
            const basename = key.split('/').pop() || key;
            const filename = extractMeaningfulFilenameLocal(basename);
            return `${url}?download=1&filename=${encodeURIComponent(filename)}`;
          }
          const basePath = url.slice(0, qIdx);
          const queryString = url.slice(qIdx + 1);
          const cleanedQuery = queryString.replace(/\?download=.*$/, '');
          const params = new URLSearchParams(cleanedQuery);
          const filename = params.get('filename');
          if (filename && filename.length > 0) {
            return `${basePath}?download=1&filename=${encodeURIComponent(filename)}`;
          } else {
            const key = basePath.replace('/manus-storage/', '');
            const basename = key.split('/').pop() || key;
            const extractedFilename = extractMeaningfulFilenameLocal(basename);
            return `${basePath}?download=1&filename=${encodeURIComponent(extractedFilename)}`;
          }
        }

        let fixed = 0;
        for (const row of targets) {
          const content = row.content!;
          let changed = false;
          const newContent = content.replace(
            /href="([^"]*manus-storage[^"]*download[^"]*)"/g,
            (_match: string, rawUrl: string) => {
              const normalized = normalizeDownloadUrlLocal(rawUrl);
              if (normalized !== rawUrl) changed = true;
              return `href="${normalized}"`;
            }
          );
          if (changed) {
            await db.update(postsTable).set({ content: newContent }).where(sql`${postsTable.id} = ${row.id}`);
            fixed++;
          }
        }
        return { fixed, total: targets.length };
      }),

    // ─── 회원 관리 ────────────────────────────────────────────────────────────
    /** 전체 회원 목록 조회 */
    listUsers: protectedProcedure
      .query(async ({ ctx }) => {
        if (ctx.user.role !== 'admin') throw new TRPCError({ code: 'FORBIDDEN' });
        return getAllUsers();
      }),

    /** 회원 권한 업데이트 (role, canWrite, canDownload, memo, isBanned) */
    updateUserPermissions: protectedProcedure
      .input(z.object({
        userId: z.number(),
        role: z.enum(['user', 'admin', 'sub_admin']).optional(),
        canWrite: z.boolean().optional(),
        canDownload: z.boolean().optional(),
        memo: z.string().nullable().optional(),
        isBanned: z.boolean().optional(),
        isFeaturedDeveloper: z.boolean().optional(),
        featuredOrder: z.number().optional(),
        bio: z.string().nullable().optional(),
        profileImage: z.string().nullable().optional(),
      }))
      .mutation(async ({ input, ctx }) => {
        if (ctx.user.role !== 'admin') throw new TRPCError({ code: 'FORBIDDEN' });
        // owner는 role 변경 불가 (자기 자신 보호)
        const targetUser = await getUserById(input.userId);
        if (targetUser?.isOwner) throw new TRPCError({ code: 'FORBIDDEN', message: '최고 관리자의 역할은 변경할 수 없습니다.' });
        const { userId, ...data } = input;
        return updateUserPermissions(userId, data);
      }),

    /** 카테고리별 글쓰기 권한 조회 */
    getCategoryWritePermissions: protectedProcedure
      .input(z.object({ userId: z.number() }))
      .query(async ({ input, ctx }) => {
        if (ctx.user.role !== 'admin') throw new TRPCError({ code: 'FORBIDDEN' });
        return getCategoryWritePermissions(input.userId);
      }),

    /** 카테고리별 글쓰기 권한 저장 */
    setCategoryWritePermissions: protectedProcedure
      .input(z.object({
        userId: z.number(),
        categoryKeys: z.array(z.string()),
      }))
      .mutation(async ({ input, ctx }) => {
        if (ctx.user.role !== 'admin') throw new TRPCError({ code: 'FORBIDDEN' });
        await setCategoryWritePermissions(input.userId, input.categoryKeys);
        return { ok: true };
      }),

    /** 모든 사용자의 카테고리별 글쓰기 권한 조회 */
    getAllCategoryWritePermissions: protectedProcedure
      .query(async ({ ctx }) => {
        if (ctx.user.role !== 'admin') throw new TRPCError({ code: 'FORBIDDEN' });
        return getAllCategoryWritePermissions();
      }),

    // ─── 쿠팡 파트너스 API ────────────────────────────────────────────────────
    /** 쿠팡 API 연결 테스트 */
    testCoupangApi: protectedProcedure
      .input(z.object({
        accessKey: z.string().min(1),
        secretKey: z.string().min(1),
      }))
      .mutation(async ({ input, ctx }) => {
        if (ctx.user.role !== 'admin') throw new TRPCError({ code: 'FORBIDDEN' });
        const { testCoupangApiConnection } = await import('./coupang');
        return testCoupangApiConnection(input.accessKey, input.secretKey);
      }),

    /** 키워드로 쿠팡 상품 검색 (캐시 우선) */
    searchCoupangProducts: protectedProcedure
      .input(z.object({
        keyword: z.string().min(1).max(100),
        limit: z.number().min(1).max(5).default(3),
        forceRefresh: z.boolean().default(false),
      }))
      .query(async ({ input, ctx }) => {
        if (ctx.user.role !== 'admin') throw new TRPCError({ code: 'FORBIDDEN' });
        const { getCachedProducts, setCachedProducts, searchCoupangProducts } = await import('./coupang');
        const config = await getSiteConfigAll();
        const accessKey = (config['coupang_access_key'] ?? '').trim();
        const secretKey = (config['coupang_secret_key'] ?? '').trim();
        if (!accessKey || !secretKey) throw new TRPCError({ code: 'BAD_REQUEST', message: 'API 키가 설정되지 않았습니다.' });
        if (!input.forceRefresh) {
          const cached = await getCachedProducts(input.keyword);
          if (cached) return { products: cached, fromCache: true };
        }
        const products = await searchCoupangProducts(accessKey, secretKey, input.keyword, input.limit);
        await setCachedProducts(input.keyword, products);
                return { products, fromCache: false };
      }),
    // ─── Google Indexing API 키 등록 여부 확인 ───────────────────────────────────────
    checkGoogleIndexingKey: protectedProcedure
      .query(async ({ ctx }) => {
        if (ctx.user.role !== 'admin') throw new TRPCError({ code: 'FORBIDDEN' });
      const key = getRuntimeEnv("GOOGLE_INDEXING_SERVICE_ACCOUNT_KEY");
        if (!key) return { configured: false };
        try {
          const parsed = JSON.parse(key);
          const configured = !!(parsed.type === 'service_account' && parsed.client_email && parsed.private_key);
          return { configured, email: configured ? parsed.client_email : undefined };
        } catch {
          return { configured: false };
        }
      }),
    // ─── 구글 일괄 크롤링 요청 ───────────────────────────────────────────────────────
    requestIndexing: protectedProcedure
      .input(z.object({
        mode: z.enum(['sitemap_ping', 'indexing_api']).default('sitemap_ping'),
      }).optional())
      .mutation(async ({ ctx, input }) => {
        if (ctx.user.role !== 'admin') throw new TRPCError({ code: 'FORBIDDEN' });

        const mode = input?.mode ?? 'sitemap_ping';
        const config = await getSiteConfigAll();
        // siteUrl을 그대로 사용 (www 제거하지 않음) - Cloudflare www canonical 유지
        const baseUrl = (config.siteUrl || '').replace(/\/$/, '') || 'https://vibecraftx.com';
        const sitemapUrl = `${baseUrl}/sitemap.xml`;

        const results: { url: string; status: string; method: string }[] = [];

        // ── 방법 1: IndexNow API (Google/Bing sitemap ping은 2023년 이후 폐지됨) ──────
        // IndexNow는 Bing, Naver, Yandex 등 파트너 엔진에 즉시 색인 요청
        // Google은 IndexNow 미지원 → Google Search Console API 또는 자연 크롤링 대기
        if (mode === 'sitemap_ping') {
          // IndexNow 키 조회 (없으면 자동 생성)
          let indexNowKey = config.indexNowKey || '';
          if (!indexNowKey || indexNowKey.length < 8) {
            const crypto = await import('crypto');
            indexNowKey = crypto.randomBytes(16).toString('hex');
            await upsertSiteConfigBulk({ indexNowKey });
          }
          const host = new URL(baseUrl).hostname;
          const keyLocation = `${baseUrl}/${indexNowKey}.txt`;
          // 사이트 전체 URL 목록 수집 (최대 100개)
          const allPosts = await getAllPosts();
          const urlList: string[] = [baseUrl + '/'];
          for (const post of allPosts.slice(0, 99)) {
            const path = (post as any).slug ? `/p/${(post as any).slug}` : `/post/${post.id}`;
            urlList.push(baseUrl + path);
          }
          const indexNowEndpoints = [
            { url: 'https://api.indexnow.org/indexnow', name: 'IndexNow (공통)' },
            { url: 'https://www.bing.com/indexnow', name: 'Bing IndexNow' },
            { url: 'https://searchadvisor.naver.com/indexnow', name: '네이버 IndexNow' },
          ];
          const body = JSON.stringify({ host, key: indexNowKey, keyLocation, urlList });
          const endpointResults = await Promise.allSettled(
            indexNowEndpoints.map(ep =>
              fetch(ep.url, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json; charset=utf-8' },
                body,
                signal: AbortSignal.timeout(10000),
              })
            )
          );
          endpointResults.forEach((result, i) => {
            if (result.status === 'fulfilled') {
              const ok = result.value.ok || result.value.status === 202;
              results.push({ url: sitemapUrl, status: ok ? 'success' : `error(${result.value.status})`, method: indexNowEndpoints[i].name });
            } else {
              results.push({ url: sitemapUrl, status: 'network_error', method: indexNowEndpoints[i].name });
            }
          });
          return { ok: true, method: 'sitemap_ping', sitemapUrl, results, total: results.length };
        }

        // ── 방법 2: Google Indexing API (서비스 계정 키 필요) ─────────────────
        if (mode === 'indexing_api') {
      const serviceAccountKey = getRuntimeEnv("GOOGLE_INDEXING_SERVICE_ACCOUNT_KEY");
          if (!serviceAccountKey) {
            throw new TRPCError({
              code: 'PRECONDITION_FAILED',
              message: 'GOOGLE_INDEXING_SERVICE_ACCOUNT_KEY 환경변수가 설정되지 않았습니다. 관리자 설정에서 서비스 계정 JSON 키를 등록해 주세요.',
            });
          }

          const allPosts = await getAllPosts();
          const urlsToIndex: string[] = [];
          urlsToIndex.push(baseUrl + '/');
          urlsToIndex.push(baseUrl + '/privacy');
          urlsToIndex.push(baseUrl + '/terms');
          for (const post of allPosts) {
            const path = (post as any).slug ? `/p/${(post as any).slug}` : `/post/${post.id}`;
            urlsToIndex.push(baseUrl + path);
          }

          let serviceAccount: any;
          try {
            serviceAccount = JSON.parse(serviceAccountKey);
          } catch {
            throw new TRPCError({ code: 'BAD_REQUEST', message: '서비스 계정 JSON 키 형식이 올바르지 않습니다.' });
          }

          const { SignJWT, importPKCS8 } = await import('jose');
          const now = Math.floor(Date.now() / 1000);
          const privateKey = await importPKCS8(serviceAccount.private_key, 'RS256');
          const jwt = await new SignJWT({
            iss: serviceAccount.client_email,
            sub: serviceAccount.client_email,
            scope: 'https://www.googleapis.com/auth/indexing',
            aud: 'https://oauth2.googleapis.com/token',
            iat: now,
            exp: now + 3600,
          })
            .setProtectedHeader({ alg: 'RS256' })
            .sign(privateKey);

          const tokenRes = await fetch('https://oauth2.googleapis.com/token', {
            method: 'POST',
            headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
            body: new URLSearchParams({
              grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer',
              assertion: jwt,
            }),
          });
          if (!tokenRes.ok) {
            throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR', message: 'Google OAuth 토큰 발급 실패. 서비스 계정 키를 확인해 주세요.' });
          }
          const { access_token } = await tokenRes.json() as { access_token: string };

          const urlsSlice = urlsToIndex.slice(0, 200);
          for (const url of urlsSlice) {
            try {
              const res = await fetch('https://indexing.googleapis.com/v3/urlNotifications:publish', {
                method: 'POST',
                headers: {
                  'Authorization': `Bearer ${access_token}`,
                  'Content-Type': 'application/json',
                },
                body: JSON.stringify({ url, type: 'URL_UPDATED' }),
              });
              const data = await res.json() as any;
              results.push({ url, status: res.ok ? 'success' : `error(${res.status}): ${data?.error?.message ?? ''}`, method: 'Google Indexing API' });
            } catch (e) {
              results.push({ url, status: 'network_error', method: 'Google Indexing API' });
            }
          }
          return { ok: true, method: 'indexing_api', sitemapUrl, results, total: urlsSlice.length };
        }

        return { ok: false, method: mode, sitemapUrl, results: [], total: 0 };
      }),
  }),
  // 쿠팡 상품 조회 (게시글 본문용 - 공개)
  coupang: router({
    /** 게시글 본문용 쿠팡 상품 조회 (캐시 우선, 공개 API)
     * 키워드 우선순위: 글별 키워드 > 카테고리별 키워드 > 전역 키워드
     */
    getProductsForPost: publicProcedure
      .input(z.object({
        keywords: z.array(z.string()).max(3),   // 글별 키워드 (비어있으면 카테고리/전역 키워드 사용)
        categoryKey: z.string().optional(),      // 카테고리 키 (예: "vibe-coding")
        limit: z.number().min(1).max(3).default(1),
      }))
      .query(async ({ input }) => {
        const { getCachedProducts, setCachedProducts, searchCoupangProducts } = await import('./coupang');
        const config = await getSiteConfigAll();
        if (config['coupang_api_enabled'] !== 'true') return { products: [] };
        const accessKey = (config['coupang_access_key'] ?? '').trim();
        const secretKey = (config['coupang_secret_key'] ?? '').trim();
        if (!accessKey || !secretKey) return { products: [] };
        const cacheHours = Number(config['coupang_cache_hours'] ?? '6');
        const cacheTtlMs = (isNaN(cacheHours) ? 6 : cacheHours) * 60 * 60 * 1000;

        // ── 키워드 우선순위 결정 ──────────────────────────────────────
        // 1순위: 글별 키워드 (input.keywords가 비어있지 않으면 사용)
        let resolvedKeywords: string[] = input.keywords;

        if (resolvedKeywords.length === 0 && input.categoryKey) {
          // 2순위: 카테고리별 키워드
          try {
            const catKwRaw = config['coupang_category_keywords'];
            if (catKwRaw) {
              const catKwMap = JSON.parse(catKwRaw) as Record<string, string[]>;
              const catKws = catKwMap[input.categoryKey];
              if (Array.isArray(catKws) && catKws.length > 0) {
                resolvedKeywords = catKws.slice(0, 3);
              }
            }
          } catch { /* ignore parse error */ }
        }

        if (resolvedKeywords.length === 0) {
          // 3순위: 전역 키워드
          try {
            const globalKwRaw = config['coupang_keywords'];
            if (globalKwRaw) {
              const globalKws = JSON.parse(globalKwRaw) as string[];
              if (Array.isArray(globalKws) && globalKws.length > 0) {
                resolvedKeywords = globalKws.slice(0, 3);
              }
            }
          } catch { /* ignore parse error */ }
        }

        // 최종 폴백: 하드코딩 기본값
        if (resolvedKeywords.length === 0) {
          resolvedKeywords = ['개발자 노트북', '듀얼 모니터', '기계식 키보드'];
        }

        const results: import('./coupang').CoupangProduct[] = [];
        for (const keyword of resolvedKeywords) {
          if (results.length >= input.limit) break;
          let products = await getCachedProducts(keyword, cacheTtlMs);
          if (!products) {
            try {
              products = await searchCoupangProducts(accessKey, secretKey, keyword, 3);
              await setCachedProducts(keyword, products);
            } catch { continue; }
          }
          if (products.length > 0) results.push(products[0]);
        }
        return { products: results.slice(0, input.limit) };
      }),

    /** 쿠팡 상품 캐시 전체 초기화 (관리자 전용) */
    clearCache: protectedProcedure
      .mutation(async ({ ctx }) => {
        if ((ctx.user as any).role !== 'admin') {
          throw new TRPCError({ code: 'FORBIDDEN', message: '관리자만 사용할 수 있습니다.' });
        }
        const { clearAllCoupangCaches } = await import('./coupang');
        const result = await clearAllCoupangCaches();
        return { success: true, deletedCount: result.deletedCount };
      }),

    /** 쿠팡 버튼 클릭 기록 (공개 API) */
    trackClick: publicProcedure
      .input(z.object({
        btnText: z.string().max(200),
        productId: z.string().max(100).optional(),
        postId: z.number().int().optional(),
      }))
      .mutation(async ({ input }) => {
        const { getDb } = await import('./db');
        const { coupangClickLogs } = await import('../drizzle/schema');
        const db = await getDb();
        if (!db) return { success: false };
        await db.insert(coupangClickLogs).values({
          btnText: input.btnText,
          productId: input.productId ?? null,
          postId: input.postId ?? null,
          clickedAt: Date.now(),
        });
        return { success: true };
      }),

    /** 버튼 문구별 클릭 통계 (관리자 전용) */
    getClickStats: protectedProcedure
      .input(z.object({
        days: z.number().int().min(1).max(90).default(30),
      }))
      .query(async ({ ctx, input }) => {
        if ((ctx.user as any).role !== 'admin') {
          throw new TRPCError({ code: 'FORBIDDEN', message: '관리자만 사용할 수 있습니다.' });
        }
        const { getDb } = await import('./db');
        const { coupangClickLogs } = await import('../drizzle/schema');
        const { sql, gte } = await import('drizzle-orm');
        const db = await getDb();
        if (!db) return { stats: [], total: 0, days: input.days };
        const since = Date.now() - input.days * 24 * 60 * 60 * 1000;
        const rows = await db
          .select({
            btnText: coupangClickLogs.btnText,
            count: sql<number>`count(*)`.as('count'),
          })
          .from(coupangClickLogs)
          .where(gte(coupangClickLogs.clickedAt, since))
          .groupBy(coupangClickLogs.btnText)
          .orderBy(sql`count(*) desc`);
        const total = (rows as Array<{btnText: string; count: number}>).reduce((s: number, r: {count: number}) => s + Number(r.count), 0);
        return {
          stats: (rows as Array<{btnText: string; count: number}>).map((r: {btnText: string; count: number}) => ({
            btnText: r.btnText,
            count: Number(r.count),
            pct: total > 0 ? Math.round((Number(r.count) / total) * 100) : 0,
          })),
          total,
          days: input.days,
        };
      }),
  }),

  // 사이트 AI 챗봇 라우터
  chatbot: router({
    chat: publicProcedure
      .input(z.object({
        messages: z.array(z.object({
          role: z.enum(['system', 'user', 'assistant']),
          content: z.string(),
        })),
      }))
      .mutation(async ({ input }) => {
        // 서버 측 시스템 프롬프트 강제 주입
        const systemMessage = {
          role: 'system' as const,
          content: `당신은 Smart Auto Guide 블로그의 AI 어시스턴트입니다. 이 블로그는 AI 자동화 프로그램(바이브 코딩), 진행중인 자동화 프로그램, AI 툴 추천, 자료실 등의 콘텐츠를 제공합니다. 방문자의 질문에 친절하고 전문적으로 답변해 주세요. 블로그 관련 질문이 아닌 경우에도 도움이 되도록 노력하세요.`,
        };
        const userMessages = input.messages.filter(m => m.role !== 'system');
        const response = await invokeLLM({
          messages: [systemMessage, ...userMessages],
        });
        const rawContent = response?.choices?.[0]?.message?.content;
        return typeof rawContent === 'string' ? rawContent : '죄송합니다. 일시적인 오류가 발생했습니다.';
      }),

    listSessions: protectedProcedure
      .query(async ({ ctx }) => {
        return getChatSessions(String(ctx.user.id));
      }),

    getSession: protectedProcedure
      .input(z.object({ id: z.number() }))
      .query(async ({ input, ctx }) => {
        const session = await getChatSession(input.id, String(ctx.user.id));
        if (!session) throw new TRPCError({ code: 'NOT_FOUND' });
        return session;
      }),

    saveSession: protectedProcedure
      .input(z.object({
        id: z.number().optional(),
        title: z.string().min(1).max(200),
        messages: z.string(), // JSON string
      }))
      .mutation(async ({ input, ctx }) => {
        return upsertChatSession({
          id: input.id,
          userId: String(ctx.user.id),
          title: input.title,
          messages: input.messages,
        });
      }),

    deleteSession: protectedProcedure
      .input(z.object({ id: z.number() }))
      .mutation(async ({ input, ctx }) => {
        return deleteChatSession(input.id, String(ctx.user.id));
      }),
  }),

  // 댓글 라우터 (공개/로그인 사용자)
  comments: router({
    list: publicProcedure
      .input(z.object({
        postId: z.number(),
        cursor: z.number().optional(),
        limit: z.number().min(1).max(50).optional(),
      }))
      .query(async ({ input }) => {
        return getCommentsByPost(input.postId, false, {
          limit: input.limit ?? 5,
          cursor: input.cursor,
        });
      }),

    add: protectedProcedure
      .input(z.object({
        postId: z.number(),
        content: z.string().min(1).max(2000),
      }))
      .mutation(async ({ input, ctx }) => {
        const sanitized = DOMPurify.sanitize(input.content, { ALLOWED_TAGS: [] });
        const result = await addComment({
          postId: input.postId,
          userId: String(ctx.user.id),
          userName: ctx.user.name || '익명',
          content: sanitized,
        });

        // AI 자동 답변 생성 (비동기 - 응답 지연 없이)
        // 관리자가 작성한 댓글에는 AI 답변 생성 안 함
        const commentId = result.id;
        const postId = input.postId;
        if (ctx.user.role === 'admin') return result;
        setImmediate(async () => {
          try {
            const post = await getPostById(postId);
            const postContext = post
              ? `제목: ${post.title}\n내용 요약: ${(post.excerpt || post.content.replace(/<[^>]+>/g, '')).slice(0, 500)}`
              : '블로그 포스트';

            const aiResponse = await invokeLLM({
              messages: [
                {
                  role: 'system',
                  content: `당신은 Smart Auto Guide 블로그의 AI 어시스턴트입니다. 독자의 댓글에 친절하고 전문적으로 답변해 주세요. 답변은 2-4문장으로 간결하게 작성하세요.\n\n포스트 정보:\n${postContext}`,
                },
                {
                  role: 'user',
                  content: `독자 댓글: "${sanitized}"\n\n이 댓글에 대한 답변을 작성해 주세요.`,
                },
              ],
            });
            const rawReply = aiResponse?.choices?.[0]?.message?.content;
            const aiReply = typeof rawReply === 'string' ? rawReply : '';
            if (aiReply) await setAiReply(commentId, aiReply);
          } catch (err) {
            console.error('[AI Reply Error]', err);
          }
        });

        return result;
      }),

    delete: protectedProcedure
      .input(z.object({ id: z.number(), postId: z.number() }))
      .mutation(async ({ input, ctx }) => {
        // 본인 댓글 또는 관리자만 삭제 가능
        const allComments = await getCommentsByPost(input.postId, true, { limit: 9999 });
        const comment = allComments.items.find((c: { id: number }) => c.id === input.id);
        if (!comment) throw new TRPCError({ code: 'NOT_FOUND' });
        if (comment.userId !== String(ctx.user.id) && ctx.user.role !== 'admin') {
          throw new TRPCError({ code: 'FORBIDDEN' });
        }
        return deleteComment(input.id);
      }),

    // 페이지 댓글 목록 조회
    listByPage: publicProcedure
      .input(z.object({
        pageId: z.number(),
        cursor: z.number().optional(),
        limit: z.number().min(1).max(50).optional(),
      }))
      .query(async ({ input }) => {
        return getCommentsByPage(input.pageId, false, {
          limit: input.limit ?? 5,
          cursor: input.cursor,
        });
      }),

    // 페이지 댓글 추가
    addToPage: protectedProcedure
      .input(z.object({
        pageId: z.number(),
        content: z.string().min(1).max(2000),
      }))
      .mutation(async ({ input, ctx }) => {
        const sanitized = DOMPurify.sanitize(input.content, { ALLOWED_TAGS: [] });
        const result = await addPageComment({
          pageId: input.pageId,
          userId: String(ctx.user.id),
          userName: ctx.user.name || '익명',
          content: sanitized,
        });

        // AI 자동 답변 생성 (비동기)
        // 관리자가 작성한 댓글에는 AI 답변 생성 안 함
        const commentId = result.id;
        const pageId = input.pageId;
        if (ctx.user.role === 'admin') return result;
        setImmediate(async () => {
          try {
            const aiResponse = await invokeLLM({
              messages: [
                {
                  role: 'system',
                  content: '당신은 블로그의 AI 어시스턴트입니다. 독자의 댓글에 친절하고 전문적으로 답변해 주세요. 답변은 2-4문장으로 간결하게 작성하세요.',
                },
                {
                  role: 'user',
                  content: `독자 댓글: "${sanitized}"\n\n이 댓글에 대한 답변을 작성해 주세요.`,
                },
              ],
            });
            const rawReply = aiResponse?.choices?.[0]?.message?.content;
            const aiReply = typeof rawReply === 'string' ? rawReply : '';
            if (aiReply) await setAiReply(commentId, aiReply);
          } catch (err) {
            console.error('[AI Reply Error - Page]', err);
          }
        });

        return result;
      }),

    // 페이지 댓글 삭제
    deletePage: protectedProcedure
      .input(z.object({ id: z.number(), pageId: z.number() }))
      .mutation(async ({ input, ctx }) => {
        const allComments = await getCommentsByPage(input.pageId, true, { limit: 9999 });
        const comment = allComments.items.find((c: { id: number }) => c.id === input.id);
        if (!comment) throw new TRPCError({ code: 'NOT_FOUND' });
        if (comment.userId !== String(ctx.user.id) && ctx.user.role !== 'admin') {
          throw new TRPCError({ code: 'FORBIDDEN' });
        }
        return deleteComment(input.id);
      }),

    // 댓글/AI 답변 좋아요 토글
    toggleLike: protectedProcedure
      .input(z.object({
        commentId: z.number(),
        targetType: z.enum(['comment', 'ai_reply']),
      }))
      .mutation(async ({ input, ctx }) => {
        return toggleCommentLike(input.commentId, String(ctx.user.id), input.targetType);
      }),

    // 사용자의 좋아요 상태 일괄 조회 (비로그인 시 빈 배열)
    getLikeStatuses: publicProcedure
      .input(z.object({ commentIds: z.array(z.number()) }))
      .query(async ({ input, ctx }) => {
        if (!ctx.user) return [];
        return getCommentLikeStatuses(input.commentIds, String(ctx.user.id));
      }),
    // AI 답변 수정 (관리자 전용)
    updateAiReply: protectedProcedure
      .input(z.object({
        commentId: z.number(),
        content: z.string().min(1).max(5000),
      }))
      .mutation(async ({ input, ctx }) => {
        if (ctx.user.role !== 'admin') throw new TRPCError({ code: 'FORBIDDEN' });
        return setAiReply(input.commentId, input.content);
      }),
  }),

  // ─── 커스텀 페이지 라우터 ─────────────────────────────────────
  pages: router({
    // 공개: 발행된 페이지 목록
    list: publicProcedure.query(async () => {
      return getPublishedCustomPages();
    }),
    // 공개: 네비게이션에 표시할 페이지 목록 (show_in_nav=true)
    getNavList: publicProcedure.query(async () =>
      cache.get('pages:navList', () => getNavCustomPages(), TTL.LONG)
    ),
    // 공개: slug로 페이지 조회
    getBySlug: publicProcedure
      .input(z.object({ slug: z.string() }))
      .query(async ({ input }) => {
        const page = await getCustomPageBySlug(input.slug);
        if (!page) throw new TRPCError({ code: 'NOT_FOUND', message: '페이지를 찾을 수 없습니다.' });
        if (!page.published) throw new TRPCError({ code: 'NOT_FOUND', message: '페이지를 찾을 수 없습니다.' });
        // HTML 섹션 content 제거 (소스 노출 방지 - /api/page-html/:pageId/:sectionId 엔드포인트로 서빙)
        let sections: Array<Record<string, unknown>> = [];
        try { sections = JSON.parse(page.sectionsJson || '[]'); } catch { sections = []; }
        const sanitizedSections = sections.map((s) => {
          if (s.type === 'html') return { ...s, content: '' };
          return s;
        });
        return { ...page, sectionsJson: JSON.stringify(sanitizedSections) };
      }),
    // 공개: ID로 발행된 페이지 조회 (첫화면 교체용)
    getById: publicProcedure
      .input(z.object({ id: z.number() }))
      .query(async ({ input }) => {
        const page = await getCustomPageById(input.id);
        if (!page) throw new TRPCError({ code: 'NOT_FOUND', message: '페이지를 찾을 수 없습니다.' });
        if (!page.published) throw new TRPCError({ code: 'NOT_FOUND', message: '페이지를 찾을 수 없습니다.' });
        // HTML 섹션 content 제거 (소스 노출 방지)
        let sections: Array<Record<string, unknown>> = [];
        try { sections = JSON.parse(page.sectionsJson || '[]'); } catch { sections = []; }
        const sanitizedSections = sections.map((s) => {
          if (s.type === 'html') return { ...s, content: '' };
          return s;
        });
        return { ...page, sectionsJson: JSON.stringify(sanitizedSections) };
      }),
    // 공개: 페이지 조회수 증가
    incrementView: publicProcedure
      .input(z.object({ id: z.number() }))
      .mutation(async ({ input }) => {
        await incrementCustomPageView(input.id);
        return { ok: true };
      }),
    // 관리자: 전체 페이지 목록
    adminList: protectedProcedure.query(async ({ ctx }) => {
      if (ctx.user.role !== 'admin') throw new TRPCError({ code: 'FORBIDDEN' });
      return getAllCustomPages();
    }),
    // 관리자: 보관 포함 전체 슬러그 목록 (클라이언트 중복 체크용)
    allSlugs: protectedProcedure.query(async ({ ctx }) => {
      if (ctx.user.role !== 'admin') throw new TRPCError({ code: 'FORBIDDEN' });
      return getAllCustomPageSlugs();
    }),
    // 관리자: ID로 페이지 조회
    adminGet: protectedProcedure
      .input(z.object({ id: z.number() }))
      .query(async ({ input, ctx }) => {
        if (ctx.user.role !== 'admin') throw new TRPCError({ code: 'FORBIDDEN' });
        const page = await getCustomPageById(input.id);
        if (!page) throw new TRPCError({ code: 'NOT_FOUND' });
        return page;
      }),
    // 관리자: slug로 페이지 조회 (비공개 포함 - 미리보기용)
    adminGetBySlug: protectedProcedure
      .input(z.object({ slug: z.string() }))
      .query(async ({ input, ctx }) => {
        if (ctx.user.role !== 'admin') throw new TRPCError({ code: 'FORBIDDEN' });
        const page = await getCustomPageBySlug(input.slug);
        if (!page) throw new TRPCError({ code: 'NOT_FOUND', message: '페이지를 찾을 수 없습니다.' });
        return page;
      }),
    // 관리자: 페이지 댓글 토글
    toggleComments: protectedProcedure
      .input(z.object({ id: z.number(), commentsEnabled: z.boolean() }))
      .mutation(async ({ input, ctx }) => {
        if (ctx.user.role !== 'admin') throw new TRPCError({ code: 'FORBIDDEN' });
        await updateCustomPage(input.id, { commentsEnabled: input.commentsEnabled });
        return { ok: true, commentsEnabled: input.commentsEnabled };
      }),
    // 관리자: 페이지 생성
    create: protectedProcedure
      .input(z.object({
        slug: z.string().min(1).max(200).regex(/^[a-z0-9-]+$/, 'slug는 영소문자, 숫자, 하이픈만 허용됩니다'),
        title: z.string().min(1).max(300),
        description: z.string().max(500).optional().default(''),
        sectionsJson: z.string().optional().default('[]'),
        published: z.boolean().optional().default(false),
        showInNav: z.boolean().optional().default(false),
        hideSidebar: z.boolean().optional().default(false),
        hideChrome: z.boolean().optional().default(false),
        contentWidth: z.number().min(600).max(2400).nullable().optional(),
        fullscreenDefault: z.boolean().optional().default(false),
        showTitle: z.boolean().optional().default(true),
        showDescription: z.boolean().optional().default(true),
        titleAlign: z.enum(["left", "center", "right"]).optional().default("left"),
        membersOnly: z.boolean().optional().default(false),
        postListCategory: z.string().nullable().optional(),
        commentsEnabled: z.boolean().optional().default(true),
        sortOrder: z.number().optional().default(0),
        thumbnail: z.string().nullable().optional(),
      }))
      .mutation(async ({ input, ctx }) => {
        if (ctx.user.role !== 'admin') throw new TRPCError({ code: 'FORBIDDEN' });
        // slug 중복 시 자동으로 고유 slug 생성 (-2, -3, ... suffix)
        const usedSlugs = new Set(await getAllCustomPageSlugs());
        let finalSlug = input.slug;
        if (usedSlugs.has(finalSlug)) {
          let counter = 2;
          while (usedSlugs.has(`${input.slug}-${counter}`)) counter++;
          finalSlug = `${input.slug}-${counter}`;
        }
        return createCustomPage({ ...input, slug: finalSlug });
      }),
    // 관리자: 페이지 수정
    update: protectedProcedure
      .input(z.object({
        id: z.number(),
        slug: z.string().min(1).max(200).regex(/^[a-z0-9-]+$/).optional(),
        title: z.string().min(1).max(300).optional(),
        description: z.string().max(500).optional(),
        sectionsJson: z.string().optional(),
        published: z.boolean().optional(),
        showInNav: z.boolean().optional(),
        hideSidebar: z.boolean().optional(),
        hideChrome: z.boolean().optional(),
        contentWidth: z.number().min(600).max(2400).nullable().optional(),
        fullscreenDefault: z.boolean().optional(),
        showTitle: z.boolean().optional(),
        showDescription: z.boolean().optional(),
        titleAlign: z.enum(["left", "center", "right"]).optional(),
        membersOnly: z.boolean().optional(),
        postListCategory: z.string().nullable().optional(),
        commentsEnabled: z.boolean().optional(),
        sortOrder: z.number().optional(),
        mainSectionKey: z.string().nullable().optional(),
        thumbnail: z.string().nullable().optional(),
      }))
      .mutation(async ({ input, ctx }) => {
        if (ctx.user.role !== 'admin') throw new TRPCError({ code: 'FORBIDDEN' });
        const { id, ...data } = input;
        return updateCustomPage(id, data);
      }),
    // 관리자: 페이지 공개/비공개 토글
    togglePublish: protectedProcedure
      .input(z.object({ id: z.number(), published: z.boolean() }))
      .mutation(async ({ input, ctx }) => {
        if (ctx.user.role !== 'admin') throw new TRPCError({ code: 'FORBIDDEN' });
        await updateCustomPage(input.id, { published: input.published });
        return { ok: true, published: input.published };
      }),
    // 관리자: 페이지 삭제 (완전 삭제 - 보관함 복원 불가)
    delete: protectedProcedure
      .input(z.object({ id: z.number() }))
      .mutation(async ({ input, ctx }) => {
        if (ctx.user.role !== 'admin') throw new TRPCError({ code: 'FORBIDDEN' });
        return deleteCustomPage(input.id);
      }),
    // 관리자: 페이지 보관함으로 이동 (삭제 대신 archived_status=1로 변경)
    archive: protectedProcedure
      .input(z.object({ id: z.number(), memo: z.string().optional() }))
      .mutation(async ({ input, ctx }) => {
        if (ctx.user.role !== 'admin') throw new TRPCError({ code: 'FORBIDDEN' });
        return archiveCustomPage(input.id, input.memo);
      }),
    // 관리자: 보관함 페이지 목록 조회
    archivedList: protectedProcedure
      .query(async ({ ctx }) => {
        if (ctx.user.role !== 'admin') throw new TRPCError({ code: 'FORBIDDEN' });
        return getArchivedCustomPages();
      }),
    // 관리자: 보관함에서 페이지 복원 (archived_status=0으로 변경)
    restore: protectedProcedure
      .input(z.object({ id: z.number() }))
      .mutation(async ({ input, ctx }) => {
        if (ctx.user.role !== 'admin') throw new TRPCError({ code: 'FORBIDDEN' });
        return restoreCustomPage(input.id);
      }),
    // 관리자: 보관함에서 페이지 영구 삭제 (DB에서 완전 제거)
    permanentDelete: protectedProcedure
      .input(z.object({ id: z.number() }))
      .mutation(async ({ input, ctx }) => {
        if (ctx.user.role !== 'admin') throw new TRPCError({ code: 'FORBIDDEN' });
        return permanentDeleteCustomPage(input.id);
      }),
    // 관리자: 메인 섹션 배치 설정 (null이면 배치 해제)
    setMainSection: protectedProcedure
      .input(z.object({
        id: z.number(),
        mainSectionKey: z.string().nullable(),
      }))
      .mutation(async ({ input, ctx }) => {
        if (ctx.user.role !== 'admin') throw new TRPCError({ code: 'FORBIDDEN' });
        await updateCustomPage(input.id, { mainSectionKey: input.mainSectionKey });
        return { ok: true, mainSectionKey: input.mainSectionKey };
      }),
    // 공개: 특정 섹션에 배치된 발행된 페이지 조회
    getBySectionKey: publicProcedure
      .input(z.object({ sectionKey: z.string() }))
      .query(async ({ input }) => {
        const { and, eq, asc } = await import('drizzle-orm');
        const { getDb } = await import('./db');
        const { customPages } = await import('../drizzle/schema');
        const db = await getDb();
        if (!db) return [];
        const pages = await db
          .select()
          .from(customPages)
          .where(
            and(
              eq(customPages.mainSectionKey, input.sectionKey),
              eq(customPages.published, true)
            )
          )
          .orderBy(asc(customPages.sortOrder));
        return pages;
      }),
    // 관리자: 기존 페이지를 새 HTML 파일로 업그레이드
    upgradeHtml: protectedProcedure
      .input(z.object({
        id: z.number(),
        htmlContent: z.string().min(1),
        force: z.boolean().optional().default(false), // 오류가 있어도 강제 진행
        memo: z.string().max(500).optional(), // 업그레이드 메모 (수정 내용 메모)
      }))
      .mutation(async ({ input, ctx }) => {
        if (ctx.user.role !== 'admin') throw new TRPCError({ code: 'FORBIDDEN' });

        const page = await getCustomPageById(input.id);
        if (!page) throw new TRPCError({ code: 'NOT_FOUND', message: '페이지를 찾을 수 없습니다.' });

        // ── HTML 유효성 검사 ──────────────────────────────────────
        const warnings: string[] = [];
        const errors: string[] = [];
        const html = input.htmlContent;

        // 1. 기본 HTML 구조 확인
        const hasDoctype = /<!DOCTYPE\s+html/i.test(html);
        const hasHtmlTag = /<html[\s>]/i.test(html);
        const hasBodyTag = /<body[\s>]/i.test(html);

        if (!hasDoctype) warnings.push('DOCTYPE 선언이 없습니다. 브라우저 렌더링에 영향을 줄 수 있습니다.');
        if (!hasHtmlTag) warnings.push('<html> 태그가 없습니다.');
        if (!hasBodyTag) warnings.push('<body> 태그가 없습니다.');

        // 2. 태그 짝 검사 (주요 블록 태그)
        const blockTags = ['div', 'section', 'article', 'main', 'header', 'footer', 'nav', 'aside', 'ul', 'ol', 'table', 'thead', 'tbody', 'tr', 'form', 'select', 'script', 'style'];
        for (const tag of blockTags) {
          const openCount = (html.match(new RegExp(`<${tag}[\\s>]`, 'gi')) || []).length;
          const closeCount = (html.match(new RegExp(`</${tag}>`, 'gi')) || []).length;
          if (openCount !== closeCount) {
            errors.push(`<${tag}> 태그 짝이 맞지 않습니다. (열기: ${openCount}개, 닫기: ${closeCount}개)`);
          }
        }

        // 3. 인라인 스크립트 감지 (보안 경고)
        const hasInlineScript = /<script[^>]*>([\s\S]*?)<\/script>/gi.test(html);
        const hasExternalScript = /<script[^>]+src=/i.test(html);
        if (hasInlineScript || hasExternalScript) {
          warnings.push('스크립트 태그가 포함되어 있습니다. 앱 모드로 렌더링됩니다.');
        }

        // 4. 이미지 alt 속성 누락 확인
        const imgTags = html.match(/<img[^>]*>/gi) || [];
        const imgWithoutAlt = imgTags.filter(t => !/alt=/i.test(t));
        if (imgWithoutAlt.length > 0) {
          warnings.push(`이미지 ${imgWithoutAlt.length}개에 alt 속성이 없습니다. (접근성 권장)`);
        }

        // 5. 빈 href 링크 확인
        const emptyHrefs = (html.match(/href=["'](["']|\s*#\s*["'])/gi) || []).length;
        if (emptyHrefs > 0) {
          warnings.push(`빈 href 링크가 ${emptyHrefs}개 있습니다.`);
        }

        // 오류가 있고 force=false이면 검사 결과 반환 (프론트에서 확인 후 재시도)
        if (errors.length > 0 && !input.force) {
          return {
            ok: false,
            requiresConfirm: true,
            errors,
            warnings,
            pageTitle: page.title,
          };
        }

        // ── 업그레이드 실행: HTML 전체를 단일 html 섹션으로 교체 ──
        const hasScript = /<script[\s>]/i.test(html);
        const newSection = {
          id: `html-upgrade-${Date.now()}`,
          type: 'html',
          content: html,
          settings: {
            isAppMode: hasScript,
            embedMode: 'html',
          },
        };
        const newSectionsJson = JSON.stringify([newSection]);

        // 업그레이드 전 현재 콘텐츠 백업
        await savePageUpgradeHistory(input.id, page.title, page.sectionsJson, '업그레이드 전 자동 백업', input.memo);

        await updateCustomPage(input.id, { sectionsJson: newSectionsJson });

        return {
          ok: true,
          requiresConfirm: false,
          errors,
          warnings,
          pageTitle: page.title,
        };
      }),

    // 페이지 업그레이드 이력 조회
    getUpgradeHistory: protectedProcedure
      .input(z.object({ pageId: z.number() }))
      .query(async ({ input, ctx }) => {
        if (ctx.user.role !== 'admin') throw new TRPCError({ code: 'FORBIDDEN' });
        const history = await getPageUpgradeHistory(input.pageId);
        return (history || []).map(h => ({
          id: h.id,
          pageId: h.pageId,
          pageTitle: h.pageTitle,
          createdAt: h.createdAt,
          note: h.note || '',
          memo: h.memo || '',
        }));
      }),

    // 이력에서 페이지 복원
    restoreFromHistory: protectedProcedure
      .input(z.object({ historyId: z.number() }))
      .mutation(async ({ input, ctx }) => {
        if (ctx.user.role !== 'admin') throw new TRPCError({ code: 'FORBIDDEN' });
        return await restorePageFromHistory(input.historyId);
      }),

    // HTML 자동 수정 (AI)
    autoFixHtml: protectedProcedure
      .input(z.object({
        htmlContent: z.string().min(1),
        errors: z.array(z.string()),
        warnings: z.array(z.string()),
      }))
      .mutation(async ({ input, ctx }) => {
        if (ctx.user.role !== 'admin') throw new TRPCError({ code: 'FORBIDDEN' });

        const issueList = [
          ...input.errors.map(e => `[오류] ${e}`),
          ...input.warnings.map(w => `[경고] ${w}`),
        ].join('\n');

        const response = await invokeLLM({
          messages: [
            {
              role: 'system',
              content: `당신은 HTML 코드 수정 전문가입니다. 주어진 HTML의 오류와 경고를 수정하여 완전한 HTML을 반환하세요.

규칙:
1. 태그 짝 불일치 수정 (누락된 닫는 태그 추가)
2. 이미지 alt 속성 누락 시 alt="" 추가
3. 빈 href는 href="#"로 변경
4. DOCTYPE/html/body 태그 누락 시 추가
5. 원본 콘텐츠와 스타일은 절대 변경하지 말 것`,
            },
            {
              role: 'user',
              content: `다음 HTML을 수정해주세요.

[발견된 문제점]
${issueList}

[HTML 코드]
${input.htmlContent}`,
            },
          ],
          response_format: {
            type: 'json_schema',
            json_schema: {
              name: 'html_fix_result',
              strict: true,
              schema: {
                type: 'object',
                properties: {
                  fixedHtml: { type: 'string', description: '수정된 HTML 전체' },
                  changes: { type: 'array', items: { type: 'string' }, description: '수정 내용 요약 목록' },
                },
                required: ['fixedHtml', 'changes'],
                additionalProperties: false,
              },
            },
          },
        });

        const raw = response?.choices?.[0]?.message?.content;
        if (!raw) throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR', message: 'AI 응답이 비어 있습니다.' });
        const result = JSON.parse(typeof raw === 'string' ? raw : JSON.stringify(raw)) as { fixedHtml: string; changes: string[] };
        return { fixedHtml: result.fixedHtml, changes: result.changes };
      }),

    // 페이지 HTML 다운로드 (sectionsJson → HTML 재조립)
    downloadPage: protectedProcedure
      .input(z.object({ pageId: z.number() }))
      .query(async ({ input, ctx }) => {
        if (ctx.user.role !== 'admin') throw new TRPCError({ code: 'FORBIDDEN' });
        const page = await getCustomPageById(input.pageId);
        if (!page) throw new TRPCError({ code: 'NOT_FOUND', message: '페이지를 찾을 수 없습니다.' });

        // sectionsJson 파싱 후 HTML 조립
        let sections: Array<{ id: string; type: string; content?: string; settings?: Record<string, unknown> }> = [];
        try { sections = JSON.parse(page.sectionsJson || '[]'); } catch { sections = []; }

        // 섹션에서 HTML 콘텐츠 추출
        const bodyParts: string[] = [];
        for (const section of sections) {
          if (section.type === 'html' && section.content) {
            // 이미 완전한 HTML 문서인 경우 그대로 반환
            if (/<!DOCTYPE/i.test(section.content) || /<html/i.test(section.content)) {
              return { html: section.content, filename: `${page.slug}.html` };
            }
            bodyParts.push(section.content);
          } else if (section.type === 'text' && section.content) {
            bodyParts.push(`<div class="section-text">${section.content}</div>`);
          } else if (section.type === 'image' && section.content) {
            bodyParts.push(`<div class="section-image"><img src="${section.content}" alt="" style="max-width:100%" /></div>`);
          }
        }

        // 완전한 HTML 문서로 래핑
        const fullHtml = `<!DOCTYPE html>
<html lang="ko">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${page.title}</title>
</head>
<body>
${bodyParts.join('\n')}
</body>
</html>`;

        return { html: fullHtml, filename: `${page.slug}.html` };
      }),
  }),

  // ─── 이미지 AI 분석 라우터 ─────────────────────────────────────
  image: router({
    /**
     * 이미지 URL을 AI가 분석하여 한국어 alt 텍스트 생성
     * SEO 및 웹 접근성 향상을 위해 사용
     */
    generateAlt: protectedProcedure
      .input(z.object({
        imageUrl: z.string(),
        context: z.string().optional(), // 블로그 포스트 제목 등 컨텍스트 힌트
      }))
      .mutation(async ({ input }) => {
        const { imageUrl, context } = input;

        const systemPrompt = [
          '당신은 웹 접근성 전문가입니다.',
          '이미지를 분석하여 시각 장애인이 스크린 리더로 들었을 때 이해할 수 있는 짧고 명확한 alt 텍스트를 한국어로 작성하세요.',
          '요구사항:',
          '- 20~60자 이내로 작성',
          '- 이미지의 핵심 내용과 주제를 명확히 설명',
          '- "이미지", "사진", "그림" 등의 접두어 불필요',
          '- 장식적 이미지이면 isEmpty를 true로 설정하고 alt는 빈 문자열 반환',
          '- JSON 형식으로만 응답: { "alt": "...", "isEmpty": false }',
        ].join('\n');

        const userContent: Array<{ type: string; text?: string; image_url?: { url: string; detail: string } }> = [
          {
            type: 'image_url',
            image_url: { url: imageUrl, detail: 'low' },
          },
        ];
        if (context) {
          userContent.unshift({ type: 'text', text: `블로그 포스트 컨텍스트: ${context}` });
        }

        try {
          const response = await invokeLLM({
            messages: [
              { role: 'system', content: systemPrompt },
              { role: 'user', content: userContent as any },
            ],
            response_format: {
              type: 'json_schema',
              json_schema: {
                name: 'alt_text_result',
                strict: true,
                schema: {
                  type: 'object',
                  properties: {
                    alt: { type: 'string', description: 'alt 텍스트 (장식적 이미지면 빈 문자열)' },
                    isEmpty: { type: 'boolean', description: '장식적/배경 이미지 여부' },
                  },
                  required: ['alt', 'isEmpty'],
                  additionalProperties: false,
                },
              },
            },
          });

          const raw = response?.choices?.[0]?.message?.content;
          if (!raw) throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR', message: 'AI 응답 없음' });

          const parsed = typeof raw === 'string' ? JSON.parse(raw) : raw;
          return { alt: parsed.alt as string, isEmpty: parsed.isEmpty as boolean };
        } catch (err) {
          console.error('[image.generateAlt] 오류:', err);
          throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR', message: 'alt 텍스트 생성 실패' });
        }
      }),
  }),

  // ─── 백업 / 복원 ────────────────────────────────────────────────────────────────────────────────────
  backup: router({
    /** 전체 데이터를 JSON으로 내보내기 (관리자 전용) */
    export: protectedProcedure.mutation(async ({ ctx }) => {
      if (ctx.user.role !== 'admin') throw new TRPCError({ code: 'FORBIDDEN', message: '관리자만 접근 가능합니다.' });
      return exportAllData();
    }),

    /** JSON 백업 데이터를 DB에 복원 (관리자 전용, 기존 데이터 모두 덧쓰기) */
    import: protectedProcedure
      .input(z.object({ data: z.any() }))
      .mutation(async ({ ctx, input }) => {
        if (ctx.user.role !== 'admin') throw new TRPCError({ code: 'FORBIDDEN', message: '관리자만 접근 가능합니다.' });
        const backup = input.data as BackupData;
        if (!backup?.version || !backup?.tables) {
          throw new TRPCError({ code: 'BAD_REQUEST', message: '유효하지 않은 백업 파일입니다.' });
        }
        return importAllData(backup);
      }),

    /** S3에 백업 저장 및 이력 기록 */
    saveToS3: protectedProcedure.mutation(async ({ ctx }) => {
      if (ctx.user.role !== 'admin') throw new TRPCError({ code: 'FORBIDDEN', message: '관리자만 접근 가능합니다.' });
      return saveBackupToS3(false);
    }),

    /** 백업 이력 목록 조회 */
    listHistory: protectedProcedure.query(async ({ ctx }) => {
      if (ctx.user.role !== 'admin') throw new TRPCError({ code: 'FORBIDDEN', message: '관리자만 접근 가능합니다.' });
      return getBackupHistory();
    }),

    /** 특정 백업 다운로드 URL 반환 - S3 presign URL을 직접 발급하여 리다이렉트 없이 빠른 다운로드 */
    getDownloadUrl: protectedProcedure
      .input(z.object({ id: z.number() }))
      .query(async ({ ctx, input }) => {
        if (ctx.user.role !== 'admin') throw new TRPCError({ code: 'FORBIDDEN', message: '관리자만 접근 가능합니다.' });
        const row = await getBackupById(input.id);
        if (!row) throw new TRPCError({ code: 'NOT_FOUND', message: '백업 이력을 찾을 수 없습니다.' });
        // S3 presign GET URL을 서버에서 직접 발급 - 클라이언트가 리다이렉트 없이 S3에서 직접 다운로드
        const { storageGetSignedUrl } = await import('./storage');
        const signedUrl = await storageGetSignedUrl(row.fileKey);
        return { url: signedUrl, fileKey: row.fileKey, createdAt: row.createdAt, fileSize: row.fileSize };
      }),

    /** 선택적 복원: 파일에서 선택한 테이블만 복원 */
    importSelected: protectedProcedure
      .input(z.object({
        data: z.any(),
        tables: z.array(z.string()),
      }))
      .mutation(async ({ ctx, input }) => {
        if (ctx.user.role !== 'admin') throw new TRPCError({ code: 'FORBIDDEN', message: '관리자만 접근 가능합니다.' });
        const backup = input.data as BackupData;
        if (!backup?.version || !backup?.tables) {
          throw new TRPCError({ code: 'BAD_REQUEST', message: '유효하지 않은 백업 파일입니다.' });
        }
        if (!input.tables.length) {
          throw new TRPCError({ code: 'BAD_REQUEST', message: '복원할 테이블을 하나 이상 선택해주세요.' });
        }
        return importSelectedTables(backup, input.tables);
      }),
    /** 진행률 추적 백업 시작 - jobId 반환 */
    startBackupJob: protectedProcedure.mutation(async ({ ctx }) => {
      if (ctx.user.role !== 'admin') throw new TRPCError({ code: 'FORBIDDEN' });
      const jobId = `backup-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
      // DB에 초기 레코드 삽입 (서버 재시작 후에도 폴링 가능)
      const db = await (await import('./db')).getDb();
      if (!db) throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR', message: 'DB 연결 실패' });
      const { backupJobs: backupJobsTable } = await import('../drizzle/schema');
      await db.insert(backupJobsTable).values({ id: jobId, progress: 0, step: '백업 시작 중...', done: false });
      // 비동기로 백업 실행
      runBackupWithProgress(jobId).catch(() => {});
      return { jobId };
    }),
    /** 백업 진행률 조회 */
    getBackupProgress: protectedProcedure
      .input(z.object({ jobId: z.string() }))
      .query(async ({ ctx, input }) => {
        if (ctx.user.role !== 'admin') throw new TRPCError({ code: 'FORBIDDEN' });
        const db = await (await import('./db')).getDb();
        if (!db) throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR', message: 'DB 연결 실패' });
        const { backupJobs: backupJobsTable } = await import('../drizzle/schema');
        const { eq } = await import('drizzle-orm');
        const [job] = await db.select().from(backupJobsTable).where(eq(backupJobsTable.id, input.jobId));
        if (!job) throw new TRPCError({ code: 'NOT_FOUND', message: '백업 작업을 찾을 수 없습니다.' });
        return {
          progress: job.progress,
          step: job.step,
          done: job.done,
          error: job.error ?? null,
          result: job.resultFileKey ? { fileKey: job.resultFileKey, fileUrl: job.resultFileUrl ?? '', fileSize: job.resultFileSize ?? 0 } : null,
        };
      }),
    /** 백업 이력 단건 삭제 (관리자) */
    delete: protectedProcedure
      .input(z.object({ id: z.number() }))
      .mutation(async ({ ctx, input }) => {
        if (ctx.user.role !== 'admin') throw new TRPCError({ code: 'FORBIDDEN' });
        await deleteBackupById(input.id);
        return { success: true };
      }),
    /** 백업 이력 다건 삭제 (관리자) */
    deleteMany: protectedProcedure
      .input(z.object({ ids: z.array(z.number()).min(1) }))
      .mutation(async ({ ctx, input }) => {
        if (ctx.user.role !== 'admin') throw new TRPCError({ code: 'FORBIDDEN' });
        await deleteBackupsByIds(input.ids);
        return { success: true };
      }),

    /** 자동 백업 스케줄 조회 */
    getAutoBackupSchedule: protectedProcedure.query(async ({ ctx }) => {
      if (ctx.user.role !== 'admin') throw new TRPCError({ code: 'FORBIDDEN' });
      const { getSiteConfigAll } = await import('./db');
      const config = await getSiteConfigAll();
      return {
        enabled: config['autoBackup.enabled'] === 'true',
        cronHourKST: config['autoBackup.cronHourKST'] ?? '0',  // KST 기준 시(0-23)
        taskUid: config['autoBackup.taskUid'] ?? null,
        nextExecutionAt: config['autoBackup.nextExecutionAt'] ?? null,
      };
    }),

    /** 자동 백업 스케줄 설정 (생성/수정/삭제) */
    setAutoBackupSchedule: protectedProcedure
      .input(z.object({
        enabled: z.boolean(),
        cronHourKST: z.number().int().min(0).max(23).optional(), // KST 기준 시각 (0-23)
      }))
      .mutation(async ({ ctx, input }) => {
        if (ctx.user.role !== 'admin') throw new TRPCError({ code: 'FORBIDDEN' });
        const { parse: parseCookie } = await import('cookie');
        const { createHeartbeatJob, updateHeartbeatJob, deleteHeartbeatJob } = await import('./_core/heartbeat');
        const { getSiteConfigAll, upsertSiteConfig } = await import('./db');

        const sessionToken = parseCookie(ctx.req.headers.cookie ?? '')[COOKIE_NAME] ?? '';
        const config = await getSiteConfigAll();
        const existingTaskUid = config['autoBackup.taskUid'] ?? null;

        if (!input.enabled) {
          // 스케줄 비활성화: 기존 heartbeat 삭제
          if (existingTaskUid) {
            try { await deleteHeartbeatJob(existingTaskUid, sessionToken); } catch {}
          }
          await upsertSiteConfig('autoBackup.enabled', 'false');
          await upsertSiteConfig('autoBackup.taskUid', '');
          await upsertSiteConfig('autoBackup.nextExecutionAt', '');
          return { success: true, enabled: false, taskUid: null, nextExecutionAt: null };
        }

        // KST 시각 → UTC 시각 변환 (KST = UTC+9)
        const kstHour = input.cronHourKST ?? 0;
        const utcHour = ((kstHour - 9) + 24) % 24;
        const cronExpr = `0 0 ${utcHour} * * *`; // 6-field cron

        let taskUid: string;
        let nextExecutionAt: string | null | undefined;

        if (existingTaskUid) {
          // 기존 스케줄 수정
          const result = await updateHeartbeatJob(existingTaskUid, {
            cron: cronExpr,
            description: `매일 KST ${kstHour}:00 자동 백업`,
            enable: true,
          }, sessionToken);
          taskUid = existingTaskUid;
          nextExecutionAt = result.nextExecutionAt;
        } else {
          // 새 스케줄 생성
          const result = await createHeartbeatJob({
            name: 'auto-backup',
            cron: cronExpr,
            path: '/api/scheduled/auto-backup',
            description: `매일 KST ${kstHour}:00 자동 백업`,
          }, sessionToken);
          taskUid = result.taskUid;
          nextExecutionAt = result.nextExecutionAt;
        }

        await upsertSiteConfig('autoBackup.enabled', 'true');
        await upsertSiteConfig('autoBackup.cronHourKST', String(kstHour));
        await upsertSiteConfig('autoBackup.taskUid', taskUid);
        await upsertSiteConfig('autoBackup.nextExecutionAt', nextExecutionAt ?? '');

        return { success: true, enabled: true, taskUid, nextExecutionAt };
      }),
  }),

  // ─── 후원(커피 한 잔 쏘기) 라우터 ───────────────────────────────────────────
  donations: router({
    /** 후원 설정 조회 (공개) */
    getSettings: publicProcedure.query(async () => {
      return getDonationSettings();
    }),

    /** 후원 등록 (공개 - 비로그인도 가능) */
    create: publicProcedure
      .input(z.object({
        donorName: z.string().min(1).max(100),
        amount: z.number().int().min(0).max(10000000),
        message: z.string().max(500).optional(),
      }))
      .mutation(async ({ input, ctx }) => {
        await createDonation({
          donorName: input.donorName,
          amount: input.amount,
          message: input.message,
          userId: (ctx as any).user?.id ?? null,
        });
        return { success: true };
      }),

    /** 후원 목록 조회 (관리자) */
    list: protectedProcedure
      .input(z.object({ limit: z.number().default(50), offset: z.number().default(0) }))
      .query(async ({ ctx, input }) => {
        if (ctx.user.role !== 'admin') throw new TRPCError({ code: 'FORBIDDEN' });
        return listDonations({ limit: input.limit, offset: input.offset });
      }),

    /** 후원 확인 처리 (관리자) */
    confirm: protectedProcedure
      .input(z.object({ id: z.number(), adminMemo: z.string().optional() }))
      .mutation(async ({ ctx, input }) => {
        if (ctx.user.role !== 'admin') throw new TRPCError({ code: 'FORBIDDEN' });
        await confirmDonation(input.id, input.adminMemo);
        return { success: true };
      }),

    /** 후원 메모 업데이트 (관리자) */
    updateMemo: protectedProcedure
      .input(z.object({ id: z.number(), adminMemo: z.string() }))
      .mutation(async ({ ctx, input }) => {
        if (ctx.user.role !== 'admin') throw new TRPCError({ code: 'FORBIDDEN' });
        await updateDonationMemo(input.id, input.adminMemo);
        return { success: true };
      }),

    /** 후원 삭제 (관리자) */
    delete: protectedProcedure
      .input(z.object({ id: z.number() }))
      .mutation(async ({ ctx, input }) => {
        if (ctx.user.role !== 'admin') throw new TRPCError({ code: 'FORBIDDEN' });
        await deleteDonation(input.id);
        return { success: true };
      }),

    /** 후원 설정 업데이트 (관리자) */
    updateSettings: protectedProcedure
      .input(z.object({
        enabled: z.boolean().optional(),
        bankName: z.string().max(50).optional(),
        accountNumber: z.string().max(50).optional(),
        accountHolder: z.string().max(50).optional(),
        description: z.string().max(200).optional(),
        kakaoId: z.string().max(100).optional(),
      }))
      .mutation(async ({ ctx, input }) => {
        if (ctx.user.role !== 'admin') throw new TRPCError({ code: 'FORBIDDEN' });
        await updateDonationSettings(input);
        return { success: true };
      }),
  }),

  // ─── 광고 문의 ───────────────────────────────────────────────────────────────
  adInquiry: router({
    // 광고 문의 제출 (누구나 가능)
    submit: publicProcedure
      .input(z.object({
        name: z.string().min(1).max(100),
        email: z.string().email().max(320),
        company: z.string().max(200).optional(),
        adType: z.enum(["banner", "sponsored", "newsletter", "other"]),
        period: z.string().max(100).optional(),
        budget: z.string().max(100).optional(),
        message: z.string().min(10).max(2000),
      }))
      .mutation(async ({ ctx, input }) => {
        const db = await (await import('./db')).getDb();
        if (!db) throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR' });
        const { adInquiries } = await import('../drizzle/schema');
        await db.insert(adInquiries).values({
          name: input.name,
          email: input.email,
          company: input.company ?? null,
          adType: input.adType,
          period: input.period ?? null,
          budget: input.budget ?? null,
          message: input.message,
          userId: ctx.user?.id ?? null,
        });
        // 관리자에게 알림 발송
        try {
          const { notifyOwner } = await import('./_core/notification');
          await notifyOwner({
            title: `[광고 문의] ${input.name} (${input.company ?? '개인'})`,
            content: `광고 유형: ${input.adType}\n이메일: ${input.email}\n기간: ${input.period ?? '-'}\n예산: ${input.budget ?? '-'}\n\n${input.message}`,
          });
        } catch {}
        return { success: true };
      }),

    // 관리자 전용 - 광고 문의 목록 조회
    list: protectedProcedure
      .input(z.object({
        page: z.number().min(1).default(1),
        limit: z.number().min(1).max(50).default(20),
        confirmed: z.boolean().optional(),
      }))
      .query(async ({ ctx, input }) => {
        if (ctx.user.role !== 'admin') throw new TRPCError({ code: 'FORBIDDEN' });
        const db = await (await import('./db')).getDb();
        if (!db) return { items: [], total: 0 };
        const { adInquiries } = await import('../drizzle/schema');
        const { desc, eq, and, count } = await import('drizzle-orm');
        const conditions = input.confirmed !== undefined
          ? [eq(adInquiries.confirmed, input.confirmed)]
          : [];
        const where = conditions.length > 0 ? and(...conditions) : undefined;
        const offset = (input.page - 1) * input.limit;
        const [items, totalRows] = await Promise.all([
          db.select().from(adInquiries)
            .where(where)
            .orderBy(desc(adInquiries.createdAt))
            .limit(input.limit)
            .offset(offset),
          db.select({ count: count() }).from(adInquiries).where(where),
        ]);
        return { items, total: totalRows[0]?.count ?? 0 };
      }),

    // 관리자 전용 - 확인 처리
    confirm: protectedProcedure
      .input(z.object({ id: z.number(), adminMemo: z.string().max(500).optional() }))
      .mutation(async ({ ctx, input }) => {
        if (ctx.user.role !== 'admin') throw new TRPCError({ code: 'FORBIDDEN' });
        const db = await (await import('./db')).getDb();
        if (!db) throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR' });
        const { adInquiries } = await import('../drizzle/schema');
        const { eq } = await import('drizzle-orm');
        await db.update(adInquiries)
          .set({ confirmed: true, adminMemo: input.adminMemo ?? null })
          .where(eq(adInquiries.id, input.id));
        return { success: true };
      }),
  }),

  // ─── 프록시 API 키 관리 (관리자 전용) ─────────────────────────────────────────
  proxyApiKeys: router({
    /** 모든 프록시 API 키 목록 조회 (연결 페이지 포함) */
    list: protectedProcedure
      .query(async ({ ctx }) => {
        if (ctx.user.role !== 'admin') throw new TRPCError({ code: 'FORBIDDEN' });
        const { listAllProxyApiKeys } = await import('./db');
        return listAllProxyApiKeys();
      }),
    /** 신규 API 키 등록 */
    create: protectedProcedure
      .input(z.object({
        keyType: z.enum(['gemini', 'google', 'youtube']),
        label: z.string().min(1).max(200),
        keyValue: z.string().min(1).max(500),
      }))
      .mutation(async ({ ctx, input }) => {
        if (ctx.user.role !== 'admin') throw new TRPCError({ code: 'FORBIDDEN' });
        const { createProxyApiKey } = await import('./db');
        const id = await createProxyApiKey({
          keyType: input.keyType,
          label: input.label.trim(),
          keyValue: input.keyValue.trim(),
        });
        return { success: true, id };
      }),
    /** API 키 수정 (레이블, 키 값 변경) */
    update: protectedProcedure
      .input(z.object({
        id: z.number().int(),
        label: z.string().min(1).max(200).optional(),
        keyValue: z.string().min(1).max(500).optional(),
      }))
      .mutation(async ({ ctx, input }) => {
        if (ctx.user.role !== 'admin') throw new TRPCError({ code: 'FORBIDDEN' });
        const { updateProxyApiKey } = await import('./db');
        await updateProxyApiKey(input.id, {
          label: input.label?.trim(),
          keyValue: input.keyValue?.trim(),
        });
        return { success: true };
      }),
    /** API 키 삭제 (ID 기반) */
    delete: protectedProcedure
      .input(z.object({ id: z.number().int() }))
      .mutation(async ({ ctx, input }) => {
        if (ctx.user.role !== 'admin') throw new TRPCError({ code: 'FORBIDDEN' });
        const { deleteProxyApiKeyById } = await import('./db');
        await deleteProxyApiKeyById(input.id);
        return { success: true };
      }),
    /** 페이지에 API 키 연결 */
    linkPage: protectedProcedure
      .input(z.object({ keyId: z.number().int(), pageId: z.number().int() }))
      .mutation(async ({ ctx, input }) => {
        if (ctx.user.role !== 'admin') throw new TRPCError({ code: 'FORBIDDEN' });
        const { linkProxyKeyToPage } = await import('./db');
        await linkProxyKeyToPage(input.keyId, input.pageId);
        return { success: true };
      }),
    /** 페이지에서 API 키 연결 해제 */
    unlinkPage: protectedProcedure
      .input(z.object({ keyId: z.number().int(), pageId: z.number().int() }))
      .mutation(async ({ ctx, input }) => {
        if (ctx.user.role !== 'admin') throw new TRPCError({ code: 'FORBIDDEN' });
        const { unlinkProxyKeyFromPage } = await import('./db');
        await unlinkProxyKeyFromPage(input.keyId, input.pageId);
        return { success: true };
      }),
    /** 페이지 목록 조회 (연결 대상 선택용) */
    listPages: protectedProcedure
      .query(async ({ ctx }) => {
        if (ctx.user.role !== 'admin') throw new TRPCError({ code: 'FORBIDDEN' });
        const { getDb } = await import('./db');
        const db = await getDb();
        if (!db) return [];
        const { customPages: customPagesTable } = await import('../drizzle/schema');
        const { eq: eqOp, desc: descOp } = await import('drizzle-orm');
        return db.select({ id: customPagesTable.id, title: customPagesTable.title, slug: customPagesTable.slug })
          .from(customPagesTable)
          .where(eqOp(customPagesTable.archivedStatus, 0))
          .orderBy(descOp(customPagesTable.createdAt));
      }),
    /** 프록시 API 키 연결 테스트 (ID 기반) */
    test: protectedProcedure
      .input(z.object({ id: z.number().int() }))
      .mutation(async ({ ctx, input }) => {
        if (ctx.user.role !== 'admin') throw new TRPCError({ code: 'FORBIDDEN' });
        const { getDb } = await import('./db');
        const db = await getDb();
        if (!db) return { ok: false, message: 'DB 연결 실패' };
        const { proxyApiKeys } = await import('../drizzle/schema');
        const { eq: eqOp } = await import('drizzle-orm');
        const rows = await db.select({ keyType: proxyApiKeys.keyType, keyValue: proxyApiKeys.keyValue })
          .from(proxyApiKeys).where(eqOp(proxyApiKeys.id, input.id)).limit(1);
        if (!rows[0]) return { ok: false, message: '키를 찾을 수 없습니다.' };
        const { keyType, keyValue: key } = rows[0];
        try {
          if (keyType === 'gemini') {
            const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${encodeURIComponent(key)}`;
            const res = await fetch(url, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ contents: [{ parts: [{ text: 'hi' }] }] }),
            });
            const data = await res.json() as any;
            if (!res.ok) return { ok: false, message: data?.error?.message ?? `HTTP ${res.status}` };
            return { ok: true, message: 'Gemini API 연결 성공' };
          } else if (keyType === 'youtube') {
            // YouTube Data API v3 테스트: 간단한 검색 요청
            const url = `https://www.googleapis.com/youtube/v3/search?part=snippet&q=test&maxResults=1&key=${encodeURIComponent(key)}`;
            const res = await fetch(url);
            const data = await res.json() as any;
            if (!res.ok) return { ok: false, message: data?.error?.message ?? `HTTP ${res.status}` };
            return { ok: true, message: 'YouTube Data API 연결 성공' };
          } else {
            const url = `https://www.googleapis.com/pagespeedonline/v5/runPagespeed?url=https://example.com&key=${encodeURIComponent(key)}`;
            const res = await fetch(url);
            if (!res.ok) { const d = await res.json() as any; return { ok: false, message: d?.error?.message ?? `HTTP ${res.status}` }; }
            return { ok: true, message: 'Google API 연결 성공' };
          }
        } catch (e: any) {
          return { ok: false, message: e.message };
        }
      }),
  }),
  // ─── Gemini API 프록시 ───────────────────────────────────────────
  // 클라이언트 HTML에서 Gemini API를 직접 호출하지 않고 서버를 거쳐 호출
  // ─── 광고 클릭 로그 ─────────────────────────────────────────────────────────
  ads: router({
    /** 광고 클릭 기록 (공개 - 인증 불필요) */
    logClick: publicProcedure
      .input(z.object({
        position: z.string(),
        slotNum: z.number().int().min(1).max(5).default(1),
        postId: z.number().int().optional(),
      }))
      .mutation(async ({ input }) => {
        const { logAdClick } = await import('./db');
        await logAdClick({
          position: input.position,
          slotNum: input.slotNum,
          postId: input.postId ?? null,
        });
        return { ok: true };
      }),
    /** 광고 위치별 클릭 통계 조회 (관리자 전용) */
    getClickStats: protectedProcedure
      .query(async ({ ctx }) => {
        if (ctx.user.role !== 'admin') {
          throw new TRPCError({ code: 'FORBIDDEN', message: '관리자만 조회할 수 있습니다.' });
        }
        const { getAdClickStats } = await import('./db');
        return getAdClickStats();
      }),
    /** 카테고리별 광고 슬롯 전체 조회 (관리자 전용) */
    getCategorySlots: protectedProcedure
      .query(async ({ ctx }) => {
        if (ctx.user.role !== 'admin') {
          throw new TRPCError({ code: 'FORBIDDEN', message: '관리자만 조회할 수 있습니다.' });
        }
        const { getCategoryAdSlots } = await import('./db');
        return getCategoryAdSlots();
      }),
    /** 특정 카테고리 광고 슬롯 조회 (공개 — CategoryPage에서 사용) */
    getCategorySlot: publicProcedure
      .input(z.object({ categoryKey: z.string() }))
      .query(async ({ input }) => {
        const { getCategoryAdSlot } = await import('./db');
        return getCategoryAdSlot(input.categoryKey);
      }),
    /** 카테고리별 광고 슬롯 저장 (관리자 전용) */
    upsertCategorySlot: protectedProcedure
      .input(z.object({
        categoryKey: z.string().min(1),
        slot1Code: z.string().optional().nullable(),
        slot2Code: z.string().optional().nullable(),
        slot3Code: z.string().optional().nullable(),
        disabled: z.boolean().optional(),
      }))
      .mutation(async ({ ctx, input }) => {
        if (ctx.user.role !== 'admin') {
          throw new TRPCError({ code: 'FORBIDDEN', message: '관리자만 수정할 수 있습니다.' });
        }
        const { upsertCategoryAdSlot } = await import('./db');
        await upsertCategoryAdSlot(input);
        return { ok: true };
      }),
  }),

  // ─── 문의하기 (공개 접근 가능) ────────────────────────────────────────────────
  contact: router({
    submit: publicProcedure
      .input(z.object({
        name: z.string().min(1).max(100),
        email: z.string().email(),
        subject: z.string().min(1).max(200),
        message: z.string().min(10).max(5000),
      }))
      .mutation(async ({ input }) => {
        const content = `**이름:** ${input.name}\n**이메일:** ${input.email}\n**제목:** ${input.subject}\n\n**내용:**\n${input.message}`;
        const delivered = await notifyOwner({
          title: `[문의] ${input.subject}`,
          content,
        });
        return { success: delivered };
      }),
  }),

  gemini: router({
    proxy: publicProcedure
      .input(z.object({
        model: z.string().default("gemini-1.5-flash"),
        contents: z.array(z.object({
          parts: z.array(z.object({
            text: z.string(),
          })),
        })),
        generationConfig: z.object({
          temperature: z.number().min(0).max(2).optional(),
          maxOutputTokens: z.number().min(1).max(8192).optional(),
          responseMimeType: z.string().optional(),
        }).optional(),
      }))
      .mutation(async ({ input, ctx }) => {
        const apiKey = ENV.geminiApiKey;
        if (!apiKey) {
          throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR', message: 'Gemini API key not configured' });
        }
        // IP 기반 rate limiting
        const ip = (ctx.req.headers['x-forwarded-for'] as string)?.split(',')[0]?.trim()
          || ctx.req.socket?.remoteAddress
          || 'unknown';
        if (!checkGeminiRateLimit(ip)) {
          throw new TRPCError({
            code: 'TOO_MANY_REQUESTS',
            message: '요청이 너무 많습니다. 1분 후 다시 시도해주세요.',
          });
        }
        const url = `https://generativelanguage.googleapis.com/v1beta/models/${input.model}:generateContent?key=${apiKey}`;
        const body = {
          contents: input.contents,
          ...(input.generationConfig ? { generationConfig: input.generationConfig } : {}),
        };
        const resp = await fetch(url, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(body),

        });
        if (!resp.ok) {
          const errText = await resp.text().catch(() => '');
          throw new TRPCError({
            code: 'INTERNAL_SERVER_ERROR',
            message: `Gemini API error: ${resp.status} ${errText.slice(0, 200)}`,
          });
        }
        const data = await resp.json();
        return data;
      }),
  }),

  // ─── 에디터 스타일 저장/불러오기 ────────────────────────────────────────────────
  // ─── 주목 개발자 ─────────────────────────────────────────────────────────────
  developers: router({
    /** 주목 개발자 목록 조회 (공개) */
    getFeatured: publicProcedure.query(async () => {
      const { getDb } = await import('./db');
      const db = await getDb();
      if (!db) return [];
      const { users, vibeApps } = await import('../drizzle/schema');
      const { eq, asc, count } = await import('drizzle-orm');
      const devs = await db
        .select({
          id: users.id,
          name: users.name,
          username: users.username,
          bio: users.bio,
          profileImage: users.profileImage,
          featuredOrder: users.featuredOrder,
        })
        .from(users)
        .where(eq(users.isFeaturedDeveloper, true))
        .orderBy(asc(users.featuredOrder));
      // 각 개발자의 앱 수 집계
      const appCounts = await db
        .select({ authorId: vibeApps.authorId, cnt: count() })
        .from(vibeApps)
        .where(eq(vibeApps.published, true))
        .groupBy(vibeApps.authorId);
      const countMap = new Map(appCounts.map(r => [r.authorId, r.cnt]));
      return devs.map(d => ({ ...d, appCount: countMap.get(d.id) ?? 0 }));
    }),
  }),

  editorStyles: router({
    list: protectedProcedure.query(async () => {
      const db = await (await import('./db')).getDb();
      if (!db) throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR', message: 'DB 연결 실패' });
      const { editorStyles } = await import('../drizzle/schema');
      const { desc } = await import('drizzle-orm');
      return db.select().from(editorStyles).orderBy(desc(editorStyles.updatedAt));
    }),
    save: protectedProcedure
      .input(z.object({ name: z.string().min(1).max(100), styleData: z.string() }))
      .mutation(async ({ input }) => {
        const db = await (await import('./db')).getDb();
        if (!db) throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR', message: 'DB 연결 실패' });
        const { editorStyles } = await import('../drizzle/schema');
        const { eq } = await import('drizzle-orm');
        const now = Date.now();
        const existing = await db.select().from(editorStyles).where(eq(editorStyles.name, input.name)).limit(1);
        if (existing.length > 0) {
          await db.update(editorStyles).set({ styleData: input.styleData, updatedAt: now }).where(eq(editorStyles.id, existing[0].id));
          return { id: existing[0].id, updated: true };
        }
        const result = await db.insert(editorStyles).values({ name: input.name, styleData: input.styleData, createdAt: now, updatedAt: now });
        return { id: (result as any).insertId, updated: false };
      }),
    delete: protectedProcedure
      .input(z.object({ id: z.number() }))
      .mutation(async ({ input }) => {
        const db = await (await import('./db')).getDb();
        if (!db) throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR', message: 'DB 연결 실패' });
        const { editorStyles } = await import('../drizzle/schema');
        const { eq } = await import('drizzle-orm');
        await db.delete(editorStyles).where(eq(editorStyles.id, input.id));
        return { success: true };
      }),
  }),

  // ─── vibecraftx.com 바이브코딩 인사이트 스크래핑 ───────────────────────────────
  vibecraftInsights: publicProcedure.query(async () => {
    return cache.get(
      'vibecraftx:insights',
      async () => {
        try {
          // vibecraftx.com tRPC API를 통해 ai-apps 카테고리 글 목록 조회
          const apiUrl = 'https://www.vibecraftx.com/api/trpc/posts.list?input=' +
            encodeURIComponent(JSON.stringify({ json: { categoryKey: 'ai-apps', limit: 20 } }));
          const res = await fetch(apiUrl, {
            headers: {
              'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
              'Accept': 'application/json',
            },
            signal: AbortSignal.timeout(10_000),
          });
          if (!res.ok) {
            console.warn('[vibecraftInsights] API fetch failed:', res.status);
            return [];
          }
          const json = await res.json() as any;
          const posts: any[] = json?.result?.data?.json?.posts ?? [];

          return posts
            .filter((p: any) => p.title && p.slug)
            .map((p: any) => {
              // 썸네일: /manus-storage/... 경로를 절대 URL로 변환
              const rawThumb: string = p.thumbnail || '';
              const thumbnail = rawThumb
                ? (rawThumb.startsWith('http') ? rawThumb : `https://www.vibecraftx.com${rawThumb}`)
                : '';

              // 요약: excerpt 우선 사용, 없으면 content에서 HTML 태그 제거 후 앞 120자
              const rawExcerpt: string = p.excerpt || '';
              const rawContent: string = p.content || p.summary || '';
              const summary = rawExcerpt
                ? rawExcerpt.replace(/&nbsp;/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 120)
                : rawContent
                  .replace(/<[^>]+>/g, '')
                  .replace(/&nbsp;/g, ' ')
                  .replace(/\s+/g, ' ')
                  .trim()
                  .slice(0, 120);

              // 날짜: createdAt ISO 문자열에서 월/일 추출
              const createdAt: string = p.createdAt || '';
              const dateObj = createdAt ? new Date(createdAt) : null;
              const date = dateObj
                ? `${dateObj.getMonth() + 1}월 ${dateObj.getDate()}일`
                : '';

              // URL: slug로 구성
              const url = `https://www.vibecraftx.com/p/${p.slug}`;

              // 카테고리
              const category: string = p.tag || p.badge || p.category || '바이브코딩';

              return {
                title: p.title as string,
                summary,
                thumbnail,
                date,
                url,
                category,
              };
            });
        } catch (err) {
          console.error('[vibecraftInsights] API 오류:', err);
          return [];
        }
      },
      60 * 60_000, // 1시간 캐시
    );
  }),
});

// ─── 백업 진행률 추적 (메모리 저장) ───────────────────────────────────────────
// 백업 작업 진행 상태를 DB에 저장 (서버 재시작 후에도 유지)
// backupDb를 전달하면 백업 전용 연결을 사용하여 메인 풀 점유 방지
async function updateBackupJob(
  jobId: string,
  data: { progress?: number; step?: string; done?: boolean; error?: string | null; resultFileKey?: string; resultFileUrl?: string; resultFileSize?: number },
  backupDb?: any
) {
  try {
    const db = backupDb ?? await (await import('./db')).getDb();
    if (!db) return;
    const { backupJobs: backupJobsTable } = await import('../drizzle/schema');
    await (db as any).update(backupJobsTable).set({ ...data, updatedAt: new Date() }).where((await import('drizzle-orm')).eq(backupJobsTable.id, jobId));
  } catch (e) {
    // DB 업데이트 실패 시 실러스 무시
  }
}
async function runBackupWithProgress(jobId: string) {
  // 백업 전용 별도 DB 연결 생성 (메인 풀과 완전 분리)
  // 메인 풀(connectionLimit=3)을 점유하지 않아 폴링 요청이 연결을 얻을 수 있음
  const { createConnection } = await import('mysql2/promise');
  const backupConn = await createConnection({
          uri: getRuntimeEnv("DATABASE_URL")!,
    connectTimeout: 15000,
  });
  const { drizzle: drizzleConn } = await import('drizzle-orm/mysql2');
  const db = drizzleConn(backupConn);
  // update는 백업 전용 연결(db)을 사용하여 메인 풀 점유 방지
  const update = async (progress: number, step: string) => {
    await updateBackupJob(jobId, { progress, step }, db);
  };
  try {
    await update(5, '데이터베이스 연결 중...');
    // 이벤트 루프 양보 - 폴링 응답 가능하도록
    await new Promise(r => setTimeout(r, 50));

    await update(15, '포스트 데이터 수집 중...');
    const schema = await import('../drizzle/schema');

    // posts는 content 컨럼이 크어 한 번에 가져오면 2.7초 소요 -> 5개씩 페이지네이션으로 분할
    const { asc } = await import('drizzle-orm');
    const PAGE_SIZE = 5;
    let postsData: typeof schema.posts.$inferSelect[] = [];
    let page = 0;
    while (true) {
      const chunk = await db.select().from(schema.posts)
        .orderBy(asc(schema.posts.id))
        .limit(PAGE_SIZE)
        .offset(page * PAGE_SIZE);
      postsData = postsData.concat(chunk);
      if (chunk.length < PAGE_SIZE) break;
      page++;
      // 페이지마다 이벤트 루프 양보 - 폴링 응답 가능
      const pct = Math.min(15 + Math.round(page * 2), 20);
      await update(pct, `포스트 데이터 수집 중... (${postsData.length}개)`);
      await new Promise(r => setTimeout(r, 50));
    }
    await update(22, '태그 데이터 수집 중...');

    const postTagsData = await db.select().from(schema.postTags);
    await new Promise(r => setTimeout(r, 100));
    await update(30, '앱 데이터 수집 중...');

    const vibeAppsData = await db.select().from(schema.vibeApps);
    const appReviewsData = await db.select().from(schema.appReviews);
    await new Promise(r => setTimeout(r, 100));
    await update(38, '좋아요 데이터 수집 중...');

    const postLikesData = await db.select().from(schema.postLikes);
    await new Promise(r => setTimeout(r, 100));
    await update(46, '댓글 데이터 수집 중...');

    const commentsData = await db.select().from(schema.comments);
    const categoryCommentSettingsData = await db.select().from(schema.categoryCommentSettings);
    await new Promise(r => setTimeout(r, 100));
    await update(54, '사이트 설정 수집 중...');

    const siteConfigData = await db.select().from(schema.siteConfig);
    await new Promise(r => setTimeout(r, 100));
    await update(60, '사이드바 설정 수집 중...');

    const sidebarItemsData = await db.select().from(schema.sidebarItems);
    await new Promise(r => setTimeout(r, 100));
    await update(65, '홈 섹션 설정 수집 중...');

    const homeSectionsData = await db.select().from(schema.homeSections);
    const navItemsData = await db.select().from(schema.navItems);
    await new Promise(r => setTimeout(r, 100));
    await update(70, '페이지 데이터 수집 중...');

    const legalPagesData = await db.select().from(schema.legalPages);
    const customPagesData = await db.select().from(schema.customPages);
    await new Promise(r => setTimeout(r, 100));
    await update(75, '데이터 직렬화 및 S3 업로드 준비 중...');

    const data = {
      version: '1.0',
      exportedAt: new Date().toISOString(),
      tables: {
        posts: postsData,
        postTags: postTagsData,
        vibeApps: vibeAppsData,
        appReviews: appReviewsData,
        postLikes: postLikesData,
        siteConfig: siteConfigData,
        sidebarItems: sidebarItemsData,
        homeSections: homeSectionsData,
        navItems: navItemsData,
        legalPages: legalPagesData,
        comments: commentsData,
        categoryCommentSettings: categoryCommentSettingsData,
        customPages: customPagesData,
      },
    };
    // JSON 직렬화 후 이벤트 루프 양보
    const json = JSON.stringify(data);
    await new Promise(r => setTimeout(r, 10));
    const buffer = Buffer.from(json, 'utf-8');

    await update(80, 'S3 업로드 준비 중 (presign 요청)...');
    const { storagePut } = await import('./storage');
    const now = new Date();
    const dateStr = now.toISOString().slice(0, 10);
    const timeStr = now.toISOString().slice(11, 19).replace(/:/g, '-');
    const fileKey = `backups/blog-backup-${dateStr}-${timeStr}.json`;
    // S3 업로드 중 주기적으로 진행률 업데이트 (업로드가 오래 걸려도 멈춘 것처럼 보이지 않도록)
    let uploadDone = false;
    let uploadStep = 80;
    const uploadProgressTimer = setInterval(() => {
      if (!uploadDone && uploadStep < 87) {
        uploadStep++;
        updateBackupJob(jobId, { progress: uploadStep, step: 'S3에 백업 파일 업로드 중...' }, db).catch(() => {});
      }
    }, 1000);
    let key: string, url: string;
    try {
      const result = await storagePut(fileKey, buffer, 'application/json');
      key = result.key;
      url = result.url;
    } finally {
      uploadDone = true;
      clearInterval(uploadProgressTimer);
    }
    await new Promise(r => setTimeout(r, 10));

    await update(90, '백업 이력 저장 중...');
    const { backupHistory } = schema;
    const { desc, eq } = await import('drizzle-orm');
    const counts: Record<string, number> = {};
    for (const [k, v] of Object.entries(data.tables)) {
      counts[k] = Array.isArray(v) ? v.length : 0;
    }
    await db.insert(backupHistory).values({
      fileKey: key, fileUrl: url, fileSize: buffer.byteLength,
      countsJson: JSON.stringify(counts), isAuto: false,

    });
    // 최근 7개만 유지
    const allHistory = await db.select().from(backupHistory).orderBy(desc(backupHistory.createdAt));
    if (allHistory.length > 7) {
      for (const row of allHistory.slice(7)) {
        await db.delete(backupHistory).where(eq(backupHistory.id, row.id));
      }
    }
    await updateBackupJob(jobId, { progress: 100, step: '백업 완료!', done: true, resultFileKey: key, resultFileUrl: url, resultFileSize: buffer.byteLength }, db);
    // 30분 후 DB에서 제거 (오래된 완료 작업 정리)
    setTimeout(async () => {
      try {
        const db = await (await import('./db')).getDb();
        if (!db) return;
        const { backupJobs: backupJobsTable } = await import('../drizzle/schema');
        const { eq } = await import('drizzle-orm');
        await db.delete(backupJobsTable).where(eq(backupJobsTable.id, jobId));
      } catch {}
    }, 30 * 60 * 1000);
  } catch (err: any) {
    await updateBackupJob(jobId, { done: true, error: err?.message ?? '알 수 없는 오류', step: '백업 실패' }, db).catch(() => {});
  } finally {
    // 백업 전용 연결 정리
    try { await backupConn.end(); } catch {}
  }
}

export type AppRouter = typeof appRouter;
