import { describe, it, expect, vi, beforeEach } from "vitest";
import { buildMetaTags, injectMetaTags, type MetaData } from "./metaInjector";

// probe-image-size mock (네트워크 요청 방지)
vi.mock("probe-image-size", () => ({
  default: vi.fn().mockResolvedValue({ width: 1200, height: 630 }),
}));

// DB 모듈 mock
vi.mock("./db", () => ({
  getPostBySlug: vi.fn(),
  getPostById: vi.fn(),
  getTagsByPost: vi.fn().mockResolvedValue([]),
  getLatestPosts: vi.fn().mockResolvedValue([]),
  getPostsByCategory: vi.fn().mockResolvedValue([]),
  getPostsByTag: vi.fn().mockResolvedValue([]),
  getHomeSections: vi.fn().mockResolvedValue([]),
  getSiteConfigAll: vi.fn().mockResolvedValue({
    siteTitle: "테스트 사이트",
    siteDescription: "테스트 설명입니다.",
    siteUrl: "https://example.com",
  }),
}));

import { getPostBySlug, getPostById, getSiteConfigAll } from "./db";
import { resolveMetaData } from "./metaInjector";

const SAMPLE_META: MetaData = {
  title: "테스트 게시물 | 테스트 사이트",
  description: "게시물 요약 설명입니다.",
  ogType: "article",
  ogUrl: "https://example.com/p/test-slug",
  ogImage: "https://example.com/manus-storage/thumb.webp",
  canonical: "https://example.com/p/test-slug",
  articlePublishedTime: "2026-01-01T00:00:00.000Z",
  articleAuthor: "홍길동",
  articleSection: "AI 앱 만들기",
};

const BASE_HTML = `<!doctype html>
<html lang="ko">
  <head>
    <meta charset="UTF-8" />
    <title>기본 제목</title>
    <meta name="description" content="기본 설명" />
    <link rel="canonical" href="https://example.com" />
    <meta property="og:type" content="website" />
    <meta property="og:url" content="https://example.com" />
    <meta property="og:title" content="기본 제목" />
    <meta property="og:description" content="기본 설명" />
    <meta property="og:image" content="https://example.com/default.png" />
    <meta name="twitter:card" content="summary_large_image" />
    <meta name="twitter:title" content="기본 제목" />
    <meta name="twitter:description" content="기본 설명" />
    <meta name="twitter:image" content="https://example.com/default.png" />
  </head>
  <body><div id="root"></div></body>
</html>`;

describe("buildMetaTags", () => {
  it("article 타입에 필수 메타 태그를 모두 포함해야 한다", () => {
    const result = buildMetaTags(SAMPLE_META);
    expect(result).toContain('<title>테스트 게시물 | 테스트 사이트</title>');
    expect(result).toContain('<meta name="description"');
    expect(result).toContain('<meta property="og:type" content="article"');
    expect(result).toContain('<meta property="og:url"');
    expect(result).toContain('<meta property="og:image"');
    expect(result).toContain('<meta name="twitter:card" content="summary_large_image"');
    expect(result).toContain('<meta property="article:published_time"');
    expect(result).toContain('<meta property="article:author"');
    expect(result).toContain('<meta property="article:section"');
  });

  it("website 타입에는 article 전용 태그가 없어야 한다", () => {
    const websiteMeta: MetaData = { ...SAMPLE_META, ogType: "website" };
    const result = buildMetaTags(websiteMeta);
    expect(result).not.toContain("article:published_time");
    expect(result).not.toContain("article:author");
  });
});

describe("injectMetaTags", () => {
  it("기존 <title>을 새 제목으로 교체해야 한다", () => {
    const result = injectMetaTags(BASE_HTML, SAMPLE_META);
    expect(result).toContain("<title>테스트 게시물 | 테스트 사이트</title>");
    expect(result).not.toContain("<title>기본 제목</title>");
  });

  it("og:title을 새 값으로 교체해야 한다", () => {
    const result = injectMetaTags(BASE_HTML, SAMPLE_META);
    expect(result).toContain('og:title" content="테스트 게시물 | 테스트 사이트"');
  });

  it("og:description을 새 값으로 교체해야 한다", () => {
    const result = injectMetaTags(BASE_HTML, SAMPLE_META);
    expect(result).toContain('og:description" content="게시물 요약 설명입니다."');
  });

  it("og:image를 새 이미지 URL로 교체해야 한다", () => {
    const result = injectMetaTags(BASE_HTML, SAMPLE_META);
    expect(result).toContain('og:image" content="https://example.com/manus-storage/thumb.webp"');
  });

  it("og:url을 새 URL로 교체해야 한다", () => {
    const result = injectMetaTags(BASE_HTML, SAMPLE_META);
    expect(result).toContain('og:url" content="https://example.com/p/test-slug"');
  });

  it("canonical을 새 URL로 교체해야 한다", () => {
    const result = injectMetaTags(BASE_HTML, SAMPLE_META);
    expect(result).toContain('rel="canonical" href="https://example.com/p/test-slug"');
  });

  it("article 타입이면 article:published_time 태그를 </head> 앞에 추가해야 한다", () => {
    const result = injectMetaTags(BASE_HTML, SAMPLE_META);
    expect(result).toContain("article:published_time");
    expect(result).toContain("article:author");
    expect(result).toContain("article:section");
  });

  it("website 타입이면 article 전용 태그가 없어야 한다", () => {
    const websiteMeta: MetaData = { ...SAMPLE_META, ogType: "website" };
    const result = injectMetaTags(BASE_HTML, websiteMeta);
    expect(result).not.toContain("article:published_time");
  });
});

describe("resolveMetaData", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    (getSiteConfigAll as any).mockResolvedValue({
      siteTitle: "테스트 사이트",
      siteDescription: "테스트 설명입니다.",
      siteUrl: "https://example.com",
    });
  });

  it("/p/:slug 경로에서 발행된 게시물 메타를 반환해야 한다", async () => {
    (getPostBySlug as any).mockResolvedValue({
      id: 1,
      title: "테스트 글 제목",
      excerpt: "테스트 요약",
      content: "본문 내용",
      thumbnail: "/manus-storage/thumb.webp",
      category: "AI 앱 만들기",
      published: true,
      authorName: "홍길동",
      createdAt: new Date("2026-01-01"),
      updatedAt: new Date("2026-01-02"),
    });

    const meta = await resolveMetaData("/p/test-slug");
    expect(meta).not.toBeNull();
    expect(meta!.ogType).toBe("article");
    expect(meta!.title).toContain("테스트 글 제목");
    expect(meta!.articleSection).toBe("AI 앱 만들기");
  });

  it("/p/:slug 경로에서 미발행 게시물은 null을 반환해야 한다", async () => {
    (getPostBySlug as any).mockResolvedValue({
      id: 2,
      title: "임시저장 글",
      published: false,
    });

    const meta = await resolveMetaData("/p/draft-slug");
    expect(meta).toBeNull();
  });

  it("/category/:key 경로에서 카테고리 메타를 반환해야 한다", async () => {
    const meta = await resolveMetaData("/category/ai-apps");
    expect(meta).not.toBeNull();
    expect(meta!.ogType).toBe("website");
    expect(meta!.title).toContain("ai-apps");
  });

  it("/tag/:tag 경로에서 글이 3개 이상이면 태그 메타를 반환해야 한다", async () => {
    const { getPostsByTag } = await import("./db");
    (getPostsByTag as any).mockResolvedValueOnce([
      { id: 1, title: "테스트 글 1" },
      { id: 2, title: "테스트 글 2" },
      { id: 3, title: "테스트 글 3" },
    ]);
    const meta = await resolveMetaData("/tag/바이브코딩");
    expect(meta).not.toBeNull();
    expect(meta!.title).toContain("바이브코딩");
    expect(meta!.statusCode).toBeUndefined();
  });

  it("/tag/:tag 경로에서 글이 1~2개이면 noindex 처리해야 한다", async () => {
    const { getPostsByTag } = await import("./db");
    (getPostsByTag as any).mockResolvedValueOnce([{ id: 1, title: "테스트 글" }]);
    const meta = await resolveMetaData("/tag/바이브코딩");
    expect(meta).not.toBeNull();
    expect(meta!.robots).toBe("noindex, nofollow");
    expect(meta!.statusCode).toBe(200); // 글 1~2개는 noindex이지만 404는 아님
  });

  it("/tag/:tag 경로에서 글이 0개이면 statusCode 404를 반환해야 한다", async () => {
    // getPostsByTag default mock은 빈 배열 반환
    const meta = await resolveMetaData("/tag/없는태그");
    expect(meta).not.toBeNull();
    expect(meta!.statusCode).toBe(404);
    expect(meta!.robots).toBe("noindex, nofollow");
  });

  it("/ 경로에서 홈 메타를 반환해야 한다", async () => {
    const meta = await resolveMetaData("/");
    expect(meta).not.toBeNull();
    expect(meta!.ogType).toBe("website");
    expect(meta!.ogUrl).toBe("https://example.com");
  });

  it("알 수 없는 경로에서 기본 사이트 메타를 반환해야 한다", async () => {
    const meta = await resolveMetaData("/unknown-page");
    expect(meta).not.toBeNull();
    expect(meta!.ogType).toBe("website");
    expect(meta!.title).toContain("테스트 사이트");
  });
});
