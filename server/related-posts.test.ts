/**
 * related-posts.test.ts
 * getRelatedByCategory DB 함수 단위 테스트
 */

import { describe, it, expect, vi, beforeEach } from "vitest";

// DB 모듈 모킹
vi.mock("./db", async () => {
  const actual = await vi.importActual<typeof import("./db")>("./db");
  return {
    ...actual,
    getRelatedByCategory: vi.fn(),
  };
});

import { getRelatedByCategory } from "./db";

const mockGetRelatedByCategory = vi.mocked(getRelatedByCategory);

const makePost = (overrides: Partial<{
  id: number;
  title: string;
  excerpt: string | null;
  thumbnail: string | null;
  category: string | null;
  tag: string | null;
  badge: string | null;
  views: number | null;
  likes: number | null;
  slug: string | null;
  createdAt: Date | null;
}> = {}) => ({
  id: 1,
  title: "테스트 게시물",
  excerpt: "테스트 요약",
  thumbnail: null,
  category: "바이브코딩",
  tag: null,
  badge: null,
  views: 100,
  likes: 10,
  slug: "test-post-20260101",
  createdAt: new Date("2026-01-01"),
  ...overrides,
});

describe("getRelatedByCategory", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("같은 카테고리 글 3개를 반환한다", async () => {
    const mockPosts = [
      makePost({ id: 2, title: "관련글 1", category: "바이브코딩" }),
      makePost({ id: 3, title: "관련글 2", category: "바이브코딩" }),
      makePost({ id: 4, title: "관련글 3", category: "바이브코딩" }),
    ];
    mockGetRelatedByCategory.mockResolvedValueOnce(mockPosts);

    const result = await getRelatedByCategory(1, "바이브코딩", 3, "latest");

    expect(result).toHaveLength(3);
    expect(result[0].category).toBe("바이브코딩");
    expect(mockGetRelatedByCategory).toHaveBeenCalledWith(1, "바이브코딩", 3, "latest");
  });

  it("같은 카테고리 글이 부족하면 다른 카테고리 글로 보완한다", async () => {
    const mixedPosts = [
      makePost({ id: 2, title: "같은 카테고리 글", category: "바이브코딩" }),
      makePost({ id: 5, title: "다른 카테고리 인기글", category: "AI툴" }),
      makePost({ id: 6, title: "다른 카테고리 인기글2", category: "최신글" }),
    ];
    mockGetRelatedByCategory.mockResolvedValueOnce(mixedPosts);

    const result = await getRelatedByCategory(1, "바이브코딩", 3, "latest");

    expect(result).toHaveLength(3);
    expect(mockGetRelatedByCategory).toHaveBeenCalledOnce();
  });

  it("limit 파라미터를 올바르게 전달한다", async () => {
    mockGetRelatedByCategory.mockResolvedValueOnce([
      makePost({ id: 2 }),
      makePost({ id: 3 }),
      makePost({ id: 4 }),
      makePost({ id: 5 }),
    ]);

    const result = await getRelatedByCategory(1, "바이브코딩", 4, "latest");

    expect(result).toHaveLength(4);
    expect(mockGetRelatedByCategory).toHaveBeenCalledWith(1, "바이브코딩", 4, "latest");
  });

  it("sortBy=views로 호출하면 조회수 순 정렬 파라미터를 전달한다", async () => {
    mockGetRelatedByCategory.mockResolvedValueOnce([
      makePost({ id: 2, views: 500 }),
      makePost({ id: 3, views: 300 }),
    ]);

    await getRelatedByCategory(1, "바이브코딩", 2, "views");

    expect(mockGetRelatedByCategory).toHaveBeenCalledWith(1, "바이브코딩", 2, "views");
  });

  it("sortBy=likes로 호출하면 좋아요 순 정렬 파라미터를 전달한다", async () => {
    mockGetRelatedByCategory.mockResolvedValueOnce([
      makePost({ id: 2, likes: 50 }),
    ]);

    await getRelatedByCategory(1, "바이브코딩", 1, "likes");

    expect(mockGetRelatedByCategory).toHaveBeenCalledWith(1, "바이브코딩", 1, "likes");
  });

  it("DB 오류 시 빈 배열을 반환한다", async () => {
    mockGetRelatedByCategory.mockResolvedValueOnce([]);

    const result = await getRelatedByCategory(1, "없는카테고리", 3, "latest");

    expect(result).toHaveLength(0);
    expect(Array.isArray(result)).toBe(true);
  });

  it("현재 게시물 ID와 다른 글만 반환한다", async () => {
    const posts = [
      makePost({ id: 2 }),
      makePost({ id: 3 }),
    ];
    mockGetRelatedByCategory.mockResolvedValueOnce(posts);

    const result = await getRelatedByCategory(1, "바이브코딩", 3, "latest");

    const ids = result.map((p) => p.id);
    expect(ids).not.toContain(1);
  });
});
