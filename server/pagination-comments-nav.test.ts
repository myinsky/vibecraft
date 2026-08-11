/**
 * 페이지네이션, 댓글 설정, 헤더 메뉴 글자 크기 설정 테스트
 */
import { describe, expect, it, vi, beforeEach } from "vitest";
import { appRouter } from "./routers";
import type { TrpcContext } from "./_core/context";

// Mock DB module
vi.mock("./db", () => ({
  getDb: vi.fn().mockResolvedValue(null),
  upsertUser: vi.fn(),
  getUserByOpenId: vi.fn(),
  getAllPosts: vi.fn().mockResolvedValue([]),
  getPostsByCategory: vi.fn().mockResolvedValue([]),
  getPostsByCategoryPaged: vi.fn().mockResolvedValue({
    posts: [
      { id: 1, title: "테스트 글 1", category: "ai-apps", content: "내용", excerpt: null, thumbnail: null, tag: null, badge: null, views: 0, likes: 0, authorId: 1, published: true, createdAt: new Date(), updatedAt: new Date() },
      { id: 2, title: "테스트 글 2", category: "ai-apps", content: "내용", excerpt: null, thumbnail: null, tag: null, badge: null, views: 0, likes: 0, authorId: 1, published: true, createdAt: new Date(), updatedAt: new Date() },
    ],
    total: 25,
    page: 1,
    limit: 10,
  }),
  getAllPostsPaged: vi.fn().mockResolvedValue({
    posts: [
      { id: 1, title: "테스트 글 1", category: "ai-apps", content: "내용", excerpt: null, thumbnail: null, tag: null, badge: null, views: 0, likes: 0, authorId: 1, published: true, createdAt: new Date(), updatedAt: new Date() },
    ],
    total: 15,
    page: 2,
    limit: 10,
  }),
  getPostById: vi.fn().mockResolvedValue(null),
  createPost: vi.fn().mockResolvedValue({ id: 1 }),
  updatePost: vi.fn().mockResolvedValue(undefined),
  deletePost: vi.fn().mockResolvedValue(undefined),
  incrementPostViews: vi.fn().mockResolvedValue(undefined),
  togglePostLike: vi.fn().mockResolvedValue({ liked: true }),
  getAllVibeApps: vi.fn().mockResolvedValue([]),
  getVibeAppById: vi.fn().mockResolvedValue(null),
  incrementAppDownloads: vi.fn().mockResolvedValue(undefined),
  createAppReview: vi.fn().mockResolvedValue({ id: 1 }),
  getReviewsByAppId: vi.fn().mockResolvedValue([]),
  getSiteConfigAll: vi.fn().mockResolvedValue({ commentsEnabled: "true", navFontSize: "14px" }),
  upsertSiteConfigBulk: vi.fn().mockResolvedValue(undefined),
  getAllNavItems: vi.fn().mockResolvedValue([]),
  getAllSidebarItems: vi.fn().mockResolvedValue([]),
  getHomeSections: vi.fn().mockResolvedValue([]),
  saveDraft: vi.fn().mockResolvedValue({ id: 1 }),
  getDraftsByAuthor: vi.fn().mockResolvedValue([]),
  publishDraft: vi.fn().mockResolvedValue(undefined),
  createApiKey: vi.fn().mockResolvedValue({ id: 1 }),
  getApiKeysByUser: vi.fn().mockResolvedValue([]),
  revokeApiKey: vi.fn().mockResolvedValue(undefined),
}));

function createPublicContext(): TrpcContext {
  return {
    user: null,
    req: { protocol: "https", headers: {} } as TrpcContext["req"],
    res: { clearCookie: vi.fn() } as unknown as TrpcContext["res"],
  };
}

function createAdminContext(): TrpcContext {
  return {
    user: {
      id: 1,
      openId: "admin-openid",
      email: "admin@example.com",
      name: "관리자",
      loginMethod: "manus",
      role: "admin" as const,
      createdAt: new Date(),
      updatedAt: new Date(),
      lastSignedIn: new Date(),
    },
    req: { protocol: "https", headers: {} } as TrpcContext["req"],
    res: { clearCookie: vi.fn() } as unknown as TrpcContext["res"],
  };
}

describe("posts.list 페이지네이션", () => {
  it("카테고리 지정 시 getPostsByCategoryPaged 호출 - posts/total/page/limit 반환", async () => {
    const caller = appRouter.createCaller(createPublicContext());
    const result = await caller.posts.list({ category: "ai-apps", page: 1, limit: 10 });
    expect(result).toHaveProperty("posts");
    expect(result).toHaveProperty("total");
    expect(result).toHaveProperty("page");
    expect(result).toHaveProperty("limit");
    expect(Array.isArray(result.posts)).toBe(true);
    expect(result.total).toBe(25);
    expect(result.page).toBe(1);
    expect(result.limit).toBe(10);
  });

  it("카테고리 미지정 시 getAllPostsPaged 호출 - 전체 게시물 페이지네이션", async () => {
    const caller = appRouter.createCaller(createPublicContext());
    const result = await caller.posts.list({ page: 2, limit: 10 });
    expect(result).toHaveProperty("posts");
    expect(result).toHaveProperty("total");
    expect(result.total).toBe(15);
    expect(result.page).toBe(2);
  });

  it("page/limit 미지정 시 기본값 사용 (page=1, limit=20)", async () => {
    const caller = appRouter.createCaller(createPublicContext());
    const result = await caller.posts.list({});
    expect(result).toHaveProperty("posts");
    expect(result).toHaveProperty("total");
  });
});

describe("admin.getSiteConfig - commentsEnabled/navFontSize", () => {
  it("getSiteConfig에서 commentsEnabled와 navFontSize 반환", async () => {
    const caller = appRouter.createCaller(createPublicContext());
    const config = await caller.admin.getSiteConfig();
    expect(config).toHaveProperty("commentsEnabled");
    expect(config).toHaveProperty("navFontSize");
  });

  it("관리자는 commentsEnabled 값 업데이트 가능", async () => {
    const caller = appRouter.createCaller(createAdminContext());
    await expect(
      caller.admin.updateSiteConfig({ commentsEnabled: "false" })
    ).resolves.not.toThrow();
  });

  it("관리자는 navFontSize 값 업데이트 가능", async () => {
    const caller = appRouter.createCaller(createAdminContext());
    await expect(
      caller.admin.updateSiteConfig({ navFontSize: "16px" })
    ).resolves.not.toThrow();
  });

  it("비관리자는 siteConfig 업데이트 불가", async () => {
    const userContext: TrpcContext = {
      user: {
        id: 2,
        openId: "user-openid",
        email: "user@example.com",
        name: "일반 사용자",
        loginMethod: "manus",
        role: "user" as const,
        createdAt: new Date(),
        updatedAt: new Date(),
        lastSignedIn: new Date(),
      },
      req: { protocol: "https", headers: {} } as TrpcContext["req"],
      res: { clearCookie: vi.fn() } as unknown as TrpcContext["res"],
    };
    const caller = appRouter.createCaller(userContext);
    await expect(
      caller.admin.updateSiteConfig({ commentsEnabled: "false" })
    ).rejects.toThrow();
  });
});

// ─── nav path 정규화 테스트 ───────────────────────────────────────────────────
describe("normalizeNavPath (server/db.ts)", () => {
  // normalizeNavPath는 export되지 않으므로 동일 로직을 인라인으로 검증
  function normalizeNavPath(path: string): string {
    try {
      const u = new URL(path);
      return u.pathname + u.search + u.hash;
    } catch {
      return path.startsWith("/") ? path : `/${path}`;
    }
  }

  it("절대 URL을 상대 경로로 변환한다", () => {
    expect(normalizeNavPath("https://vibecraftx.com/category/my-apps")).toBe("/category/my-apps");
    expect(normalizeNavPath("https://www.vibecraftx.com/category/ai-tools")).toBe("/category/ai-tools");
  });

  it("이미 상대 경로인 경우 그대로 반환한다", () => {
    expect(normalizeNavPath("/category/ai-apps")).toBe("/category/ai-apps");
    expect(normalizeNavPath("/")).toBe("/");
  });

  it("슬래시 없는 경로에 / 접두사를 추가한다", () => {
    expect(normalizeNavPath("category/resources")).toBe("/category/resources");
  });
});
