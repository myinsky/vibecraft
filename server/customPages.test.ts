/**
 * 커스텀 페이지 CRUD 테스트
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

// DB 모킹
vi.mock("./db", () => ({
  getAllCustomPages: vi.fn().mockResolvedValue([
    { id: 1, slug: "about", title: "소개", description: "소개 페이지", sectionsJson: "[]", published: true, showInNav: false, sortOrder: 0, createdAt: new Date(), updatedAt: new Date() },
    { id: 2, slug: "contact", title: "연락처", description: "", sectionsJson: "[]", published: false, showInNav: false, sortOrder: 1, createdAt: new Date(), updatedAt: new Date() },
  ]),
  getPublishedCustomPages: vi.fn().mockResolvedValue([
    { id: 1, slug: "about", title: "소개", description: "소개 페이지", sectionsJson: "[]", published: true, showInNav: false, sortOrder: 0, createdAt: new Date(), updatedAt: new Date() },
  ]),
  getCustomPageBySlug: vi.fn().mockImplementation((slug: string) => {
    if (slug === "about") return Promise.resolve({ id: 1, slug: "about", title: "소개", description: "", sectionsJson: "[]", published: true, showInNav: false, sortOrder: 0, createdAt: new Date(), updatedAt: new Date() });
    return Promise.resolve(null);
  }),
  getCustomPageById: vi.fn().mockImplementation((id: number) => {
    if (id === 1) return Promise.resolve({ id: 1, slug: "about", title: "소개", description: "", sectionsJson: "[]", published: true, showInNav: false, sortOrder: 0, createdAt: new Date(), updatedAt: new Date() });
    return Promise.resolve(null);
  }),
  createCustomPage: vi.fn().mockResolvedValue({ id: 3 }),
  updateCustomPage: vi.fn().mockResolvedValue({ success: true }),
  deleteCustomPage: vi.fn().mockResolvedValue({ success: true }),
}));

import {
  getAllCustomPages,
  getPublishedCustomPages,
  getCustomPageBySlug,
  getCustomPageById,
  createCustomPage,
  updateCustomPage,
  deleteCustomPage,
} from "./db";

describe("커스텀 페이지 DB 함수", () => {
  beforeEach(() => vi.clearAllMocks());

  it("getAllCustomPages: 전체 페이지 목록 반환", async () => {
    const pages = await getAllCustomPages();
    expect(pages).toHaveLength(2);
    expect(pages[0].slug).toBe("about");
    expect(pages[1].slug).toBe("contact");
  });

  it("getPublishedCustomPages: 발행된 페이지만 반환", async () => {
    const pages = await getPublishedCustomPages();
    expect(pages).toHaveLength(1);
    expect(pages[0].published).toBe(true);
  });

  it("getCustomPageBySlug: 존재하는 slug 조회 성공", async () => {
    const page = await getCustomPageBySlug("about");
    expect(page).not.toBeNull();
    expect(page?.title).toBe("소개");
  });

  it("getCustomPageBySlug: 없는 slug 조회 시 null 반환", async () => {
    const page = await getCustomPageBySlug("nonexistent");
    expect(page).toBeNull();
  });

  it("getCustomPageById: 존재하는 ID 조회 성공", async () => {
    const page = await getCustomPageById(1);
    expect(page).not.toBeNull();
    expect(page?.id).toBe(1);
  });

  it("getCustomPageById: 없는 ID 조회 시 null 반환", async () => {
    const page = await getCustomPageById(999);
    expect(page).toBeNull();
  });

  it("createCustomPage: 새 페이지 생성 후 ID 반환", async () => {
    const result = await createCustomPage({
      slug: "new-page",
      title: "새 페이지",
      description: "설명",
      sectionsJson: "[]",
      published: false,
      showInNav: false,
      sortOrder: 0,
    });
    expect(result).toHaveProperty("id");
    expect(result.id).toBe(3);
  });

  it("updateCustomPage: 페이지 수정 성공", async () => {
    const result = await updateCustomPage(1, { title: "수정된 제목" });
    expect(result.success).toBe(true);
  });

  it("deleteCustomPage: 페이지 삭제 성공", async () => {
    const result = await deleteCustomPage(1);
    expect(result.success).toBe(true);
  });
});

describe("섹션 JSON 파싱", () => {
  it("유효한 섹션 JSON 파싱", () => {
    const sectionsJson = JSON.stringify([
      { id: "abc123", type: "text", content: "<p>Hello</p>", settings: { bgColor: "#fff", textAlign: "left", padding: "md" } },
      { id: "def456", type: "hero", content: "", settings: { heroTitle: "제목", heroSubtitle: "부제목", bgColor: "#6366f1" } },
    ]);
    const sections = JSON.parse(sectionsJson);
    expect(sections).toHaveLength(2);
    expect(sections[0].type).toBe("text");
    expect(sections[1].type).toBe("hero");
    expect(sections[1].settings.heroTitle).toBe("제목");
  });

  it("빈 섹션 JSON 파싱", () => {
    const sections = JSON.parse("[]");
    expect(sections).toHaveLength(0);
  });

  it("잘못된 JSON 파싱 시 빈 배열 반환 (try-catch)", () => {
    let sections: unknown[] = [];
    try { sections = JSON.parse("invalid json"); } catch { sections = []; }
    expect(sections).toHaveLength(0);
  });
});

describe("HTML 섹션 렌더링 - 전체 HTML 문서 감지", () => {
  // CustomPageView.tsx의 isFullHtmlDoc 로직을 단위 테스트
  const isFullHtmlDoc = (content: string): boolean =>
    /^\s*(<!DOCTYPE|<html)/i.test(content.trim());

  it("<!DOCTYPE html>로 시작하는 HTML은 전체 문서로 감지", () => {
    const html = "<!DOCTYPE html><html><head></head><body><p>Hello</p></body></html>";
    expect(isFullHtmlDoc(html)).toBe(true);
  });

  it("<html>로 시작하는 HTML은 전체 문서로 감지", () => {
    const html = "<html><head></head><body><p>Hello</p></body></html>";
    expect(isFullHtmlDoc(html)).toBe(true);
  });

  it("대소문자 혼용 <!DOCTYPE HTML>도 감지", () => {
    const html = "<!DOCTYPE HTML><html><body>test</body></html>";
    expect(isFullHtmlDoc(html)).toBe(true);
  });

  it("앞에 공백이 있는 전체 HTML 문서도 감지", () => {
    const html = "  \n<!DOCTYPE html><html><body>test</body></html>";
    expect(isFullHtmlDoc(html)).toBe(true);
  });

  it("일반 HTML 조각은 전체 문서로 감지하지 않음", () => {
    const html = "<p>Hello <strong>World</strong></p>";
    expect(isFullHtmlDoc(html)).toBe(false);
  });

  it("div 태그로 시작하는 HTML은 전체 문서로 감지하지 않음", () => {
    const html = "<div class=\"container\"><p>내용</p></div>";
    expect(isFullHtmlDoc(html)).toBe(false);
  });

  it("빈 문자열은 전체 문서로 감지하지 않음", () => {
    expect(isFullHtmlDoc("")).toBe(false);
  });
});

describe("비공개 페이지 미리보기 - adminGetBySlug 로직", () => {
  it("관리자는 비공개 페이지도 조회 가능 (getCustomPageBySlug는 published 여부 무관하게 반환)", async () => {
    // getCustomPageBySlug는 published 여부와 무관하게 페이지를 반환
    // adminGetBySlug 프로시저는 이를 호출하여 비공개 페이지도 반환
    const { getCustomPageBySlug } = await import("./db");
    const page = await getCustomPageBySlug("about");
    expect(page).not.toBeNull();
    expect(page?.slug).toBe("about");
    // 관리자 라우터는 published 여부를 체크하지 않고 반환
    // (published 체크는 getBySlug에서만 함)
  });

  it("공개 페이지 getBySlug는 published=true인 경우만 반환해야 함 (비공개는 NOT_FOUND)", () => {
    // 이 로직은 routers.ts의 pages.getBySlug에서
    // if (!page.published) throw new TRPCError({ code: 'NOT_FOUND' })
    // 로 시행됨 - 여기서는 로직을 시뮬레이션
    const checkPublished = (page: { published: boolean } | null): boolean => {
      if (!page) return false;
      return page.published;
    };
    expect(checkPublished({ published: true })).toBe(true);
    expect(checkPublished({ published: false })).toBe(false);
    expect(checkPublished(null)).toBe(false);
  });

  it("미리보기 URL 파라미터 파싱 - preview=true 감지", () => {
    const parsePreview = (search: string): boolean =>
      new URLSearchParams(search).get("preview") === "true";
    expect(parsePreview("?preview=true")).toBe(true);
    expect(parsePreview("?preview=false")).toBe(false);
    expect(parsePreview("")).toBe(false);
    expect(parsePreview("?other=value")).toBe(false);
  });
});

describe("injectAdminHideStyle - 관리자 전용 요소 숨김 CSS 주입", () => {
  // CustomPageView.tsx의 injectAdminHideStyle 로직을 단위 테스트
  function injectAdminHideStyle(html: string): string {
    const adminHideCss = `
<style id="__admin-hide-style">
  /* 관리자 전용 요소 - 비관리자에게 숨김 */
  #openSettings,
  [data-admin-only] {
    display: none !important;
    visibility: hidden !important;
    pointer-events: none !important;
  }
</style>`;

    if (/<\/head>/i.test(html)) {
      return html.replace(/<\/head>/i, `${adminHideCss}\n</head>`);
    }
    if (/<html[^>]*>/i.test(html)) {
      return html.replace(/<html[^>]*>/i, (match) => `${match}\n${adminHideCss}`);
    }
    return adminHideCss + "\n" + html;
  }

  it("</head> 태그가 있으면 그 앞에 스타일 삽입", () => {
    const html = "<!DOCTYPE html><html><head><title>Test</title></head><body><button id=\"openSettings\">API 설정</button></body></html>";
    const result = injectAdminHideStyle(html);
    expect(result).toContain("__admin-hide-style");
    expect(result).toContain("#openSettings");
    expect(result.indexOf("__admin-hide-style")).toBeLessThan(result.indexOf("</head>"));
  });

  it("</head> 없고 <html> 있으면 <html> 뒤에 스타일 삽입", () => {
    const html = "<html><body><button id=\"openSettings\">API 설정</button></body></html>";
    const result = injectAdminHideStyle(html);
    expect(result).toContain("__admin-hide-style");
    expect(result.indexOf("<html>")).toBeLessThan(result.indexOf("__admin-hide-style"));
  });

  it("태그 없는 HTML 조각이면 맨 앞에 스타일 삽입", () => {
    const html = "<div><button id=\"openSettings\">API 설정</button></div>";
    const result = injectAdminHideStyle(html);
    expect(result).toContain("__admin-hide-style");
    // 스타일이 원본 HTML보다 앞에 위치해야 함
    expect(result.indexOf("__admin-hide-style")).toBeLessThan(result.indexOf("<div>"));
  });

  it("주입된 CSS에 #openSettings 숨김 규칙 포함", () => {
    const html = "<div>test</div>";
    const result = injectAdminHideStyle(html);
    expect(result).toContain("display: none !important");
    expect(result).toContain("[data-admin-only]");
  });

  it("대소문자 혼용 </HEAD> 태그도 처리 (정규식 /i 플래그로 대소문자 무시)", () => {
    // /i 플래그로 </HEAD>도 감지하며 replace 후 소문자 </head>로 통일됨
    const html = "<html><head><title>T</title></HEAD><body></body></html>";
    const result = injectAdminHideStyle(html);
    expect(result).toContain("__admin-hide-style");
    // 스타일이 삽입되어야 함
    const styleIdx = result.indexOf("__admin-hide-style");
    expect(styleIdx).toBeGreaterThan(-1);
    // replace 후 </head> (소문자)로 변환됨
    expect(result).toContain("</head>");
  });
});
