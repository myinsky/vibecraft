import { describe, expect, it, vi, beforeEach } from "vitest";
import { appRouter } from "./routers";
import type { TrpcContext } from "./_core/context";

// Mock RSS 모듈 (purgeAllCaches)
vi.mock("./rss", () => ({
  purgeAllCaches: vi.fn(),
  purgeRssCache: vi.fn(),
}));

// Mock IndexNow 모듈
vi.mock("./indexnow", () => ({
  notifyIndexNow: vi.fn().mockResolvedValue(undefined),
  registerIndexNowKeyRoute: vi.fn(),
}));

// Mock DB module
vi.mock("./db", () => ({
  getDb: vi.fn().mockResolvedValue(null),
  upsertUser: vi.fn(),
  getUserByOpenId: vi.fn(),
  getAllPosts: vi.fn().mockResolvedValue([]),
  getPostsByCategory: vi.fn().mockResolvedValue([]),
  getPostsByCategoryPaged: vi.fn().mockResolvedValue({ posts: [], total: 0, page: 1, limit: 20 }),
  getAllPostsPaged: vi.fn().mockResolvedValue({ posts: [], total: 0, page: 1, limit: 20 }),
  getPostById: vi.fn().mockResolvedValue(null),
  createPost: vi.fn().mockResolvedValue({ id: 1, slug: "test-post-20260521", title: "Test Post", category: "ai-apps", content: "내용", excerpt: null, thumbnail: null, tag: null, badge: null, views: 0, likes: 0, authorId: 1, published: true, createdAt: new Date(), updatedAt: new Date() }),
  getSiteConfigAll: vi.fn().mockResolvedValue({ siteUrl: "https://vibecraftx.com" }),
  incrementPostViews: vi.fn().mockResolvedValue(undefined),
  togglePostLike: vi.fn().mockResolvedValue({ liked: true }),
  getAllVibeApps: vi.fn().mockResolvedValue([]),
  getVibeAppById: vi.fn().mockResolvedValue(null),
  incrementAppDownloads: vi.fn().mockResolvedValue(undefined),
  createAppReview: vi.fn().mockResolvedValue({ id: 1 }),
  getReviewsByAppId: vi.fn().mockResolvedValue([]),
}));

function createPublicContext(): TrpcContext {
  return {
    user: null,
    req: { protocol: "https", headers: {} } as TrpcContext["req"],
    res: { clearCookie: vi.fn() } as unknown as TrpcContext["res"],
  };
}

function createAuthContext(): TrpcContext {
  return {
    user: {
      id: 1,
      openId: "test-user-openid",
      email: "test@example.com",
      name: "테스트 유저",
      loginMethod: "manus",
      role: "user" as const,
      createdAt: new Date(),
      updatedAt: new Date(),
      lastSignedIn: new Date(),
    },
    req: { protocol: "https", headers: {} } as TrpcContext["req"],
    res: { clearCookie: vi.fn() } as unknown as TrpcContext["res"],
  };
}

describe("posts router", () => {
  it("비로그인 사용자도 게시물 목록 조회 가능", async () => {
    const ctx = createPublicContext();
    const caller = appRouter.createCaller(ctx);
    const result = await caller.posts.list({});
    expect(result).toHaveProperty("posts");
    expect(result).toHaveProperty("total");
    expect(Array.isArray(result.posts)).toBe(true);
  });

  it("비로그인 사용자도 카테고리별 게시물 조회 가능", async () => {
    const ctx = createPublicContext();
    const caller = appRouter.createCaller(ctx);
    const result = await caller.posts.list({ category: "ai-apps" });
    expect(result).toHaveProperty("posts");
    expect(result).toHaveProperty("total");
    expect(Array.isArray(result.posts)).toBe(true);
  });

  it("로그인 사용자는 게시물 작성 가능", async () => {
    const ctx = createAuthContext();
    const caller = appRouter.createCaller(ctx);
    const result = await caller.posts.create({
      title: "테스트 게시물",
      content: "테스트 내용입니다.",
      category: "ai-apps",
    });
    expect(result).toBeDefined();
  });

  it("비로그인 사용자는 게시물 작성 불가", async () => {
    const ctx = createPublicContext();
    const caller = appRouter.createCaller(ctx);
    await expect(
      caller.posts.create({
        title: "테스트 게시물",
        content: "테스트 내용입니다.",
        category: "ai-apps",
      })
    ).rejects.toThrow();
  });
});

describe("auth router", () => {
  it("로그인한 사용자 정보 반환", async () => {
    const ctx = createAuthContext();
    const caller = appRouter.createCaller(ctx);
    const user = await caller.auth.me();
    expect(user).not.toBeNull();
    expect(user?.name).toBe("테스트 유저");
  });

  it("비로그인 시 null 반환", async () => {
    const ctx = createPublicContext();
    const caller = appRouter.createCaller(ctx);
    const user = await caller.auth.me();
    expect(user).toBeNull();
  });
});
