/**
 * RSS 피드 생성 테스트
 *
 * rss.ts 모듈의 핵심 로직을 단위 테스트합니다.
 * - RSS 2.0 XML 구조 검증
 * - 게시물 데이터 → RSS 아이템 변환 검증
 * - 캐시 무효화 함수 동작 검증
 */

import { describe, expect, it, vi, beforeEach } from "vitest";

// ─── DB 모듈 Mock ────────────────────────────────────────────────────────────
vi.mock("./db", () => ({
  getAllPosts: vi.fn().mockResolvedValue([
    {
      id: 1,
      slug: "test-post-20260521",
      title: "테스트 게시물",
      content: "<p>본문 내용입니다.</p>",
      excerpt: "요약 내용입니다.",
      thumbnail: "https://example.com/thumb.jpg",
      category: "ai-apps",
      published: true,
      createdAt: new Date("2026-05-21T00:00:00Z"),
      updatedAt: new Date("2026-05-21T00:00:00Z"),
    },
    {
      id: 2,
      slug: null,
      title: "두 번째 게시물",
      content: "<p>두 번째 본문입니다.</p>",
      excerpt: null,
      thumbnail: null,
      category: "ai-tools",
      published: true,
      createdAt: new Date("2026-05-20T00:00:00Z"),
      updatedAt: new Date("2026-05-20T00:00:00Z"),
    },
  ]),
  getSiteConfigAll: vi.fn().mockResolvedValue({
    siteTitle: "테스트 블로그",
    siteDescription: "테스트 블로그 설명",
    siteUrl: "https://vibecraftx.com",
  }),
}));

// ─── sitemap.ts purgeCache Mock ───────────────────────────────────────────────
vi.mock("./sitemap", () => ({
  purgeCache: vi.fn(),
}));

// ─── 테스트 대상 import (mock 이후) ─────────────────────────────────────────
import { purgeRssCache, purgeAllCaches } from "./rss";
import { purgeCache as mockPurgeSitemapCache } from "./sitemap";

// ─── Express mock 헬퍼 ───────────────────────────────────────────────────────
function createMockReqRes() {
  const headers: Record<string, string> = {};
  const res = {
    _body: "",
    _status: 200,
    _headers: headers,
    set: vi.fn((obj: Record<string, string>) => {
      Object.assign(headers, obj);
    }),
    setHeader: vi.fn((key: string, val: string) => {
      headers[key] = val;
    }),
    status: vi.fn(function (this: typeof res, code: number) {
      this._status = code;
      return this;
    }),
    send: vi.fn(function (this: typeof res, body: string) {
      this._body = body;
      return this;
    }),
  };
  const req = {
    protocol: "https",
    get: vi.fn((key: string) => (key === "host" ? "vibecraftx.com" : "")),
  };
  return { req, res };
}

// ─── 테스트 ──────────────────────────────────────────────────────────────────

describe("RSS 피드 생성", () => {
  beforeEach(() => {
    purgeRssCache(); // 각 테스트 전 캐시 초기화
  });

  it("purgeRssCache 호출 시 캐시가 초기화된다", () => {
    // 캐시 무효화 함수가 예외 없이 실행되어야 함
    expect(() => purgeRssCache()).not.toThrow();
  });

  it("purgeAllCaches 호출 시 RSS + Sitemap 캐시가 모두 초기화된다", () => {
    expect(() => purgeAllCaches()).not.toThrow();
    expect(mockPurgeSitemapCache).toHaveBeenCalled();
  });

  it("registerRssRoute가 /rss.xml 엔드포인트를 등록한다", async () => {
    const { registerRssRoute } = await import("./rss");
    const registeredRoutes: string[] = [];
    const mockApp = {
      get: vi.fn((path: string) => {
        registeredRoutes.push(path);
      }),
    };
    registerRssRoute(mockApp as any);
    expect(registeredRoutes).toContain("/rss.xml");
  });

  it("/rss.xml 요청 시 RSS 2.0 XML을 반환한다", async () => {
    const { registerRssRoute } = await import("./rss");
    let handler: ((req: any, res: any) => Promise<void>) | null = null;
    const mockApp = {
      get: vi.fn((path: string, fn: any) => {
        if (path === "/rss.xml") handler = fn;
      }),
    };
    registerRssRoute(mockApp as any);

    const { req, res } = createMockReqRes();
    await handler!(req, res);

    expect(res._status).toBe(200);
    expect(res._headers["Content-Type"]).toContain("application/rss+xml");
    expect(res._body).toContain('<?xml version="1.0" encoding="UTF-8"?>');
    expect(res._body).toContain('<rss version="2.0"');
    expect(res._body).toContain("<channel>");
    expect(res._body).toContain("</channel>");
    expect(res._body).toContain("</rss>");
  });

  it("RSS 피드에 게시물 제목과 링크가 포함된다", async () => {
    const { registerRssRoute } = await import("./rss");
    let handler: ((req: any, res: any) => Promise<void>) | null = null;
    const mockApp = {
      get: vi.fn((path: string, fn: any) => {
        if (path === "/rss.xml") handler = fn;
      }),
    };
    registerRssRoute(mockApp as any);

    const { req, res } = createMockReqRes();
    await handler!(req, res);

    expect(res._body).toContain("테스트 게시물");
    expect(res._body).toContain("/p/test-post-20260521");
    expect(res._body).toContain("두 번째 게시물");
    expect(res._body).toContain("/post/2"); // slug 없는 경우 /post/:id
  });

  it("RSS 피드에 채널 메타 정보가 포함된다", async () => {
    const { registerRssRoute } = await import("./rss");
    let handler: ((req: any, res: any) => Promise<void>) | null = null;
    const mockApp = {
      get: vi.fn((path: string, fn: any) => {
        if (path === "/rss.xml") handler = fn;
      }),
    };
    registerRssRoute(mockApp as any);

    const { req, res } = createMockReqRes();
    await handler!(req, res);

    expect(res._body).toContain("테스트 블로그");
    expect(res._body).toContain("테스트 블로그 설명");
    expect(res._body).toContain("<language>ko</language>");
    expect(res._body).toContain('type="application/rss+xml"');
  });

  it("RSS 피드에 X-Robots-Tag: noindex 헤더가 없다 (검색엔진이 피드를 수집할 수 있어야 함)", async () => {
    const { registerRssRoute } = await import("./rss");
    let handler: ((req: any, res: any) => Promise<void>) | null = null;
    const mockApp = {
      get: vi.fn((path: string, fn: any) => {
        if (path === "/rss.xml") handler = fn;
      }),
    };
    registerRssRoute(mockApp as any);

    const { req, res } = createMockReqRes();
    await handler!(req, res);

    expect(res._headers["X-Robots-Tag"]).toBeUndefined();
  });
});
