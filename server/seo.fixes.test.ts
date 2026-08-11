/**
 * SEO 버그 수정 테스트
 * 1. 이메일/특수문자 태그 필터링
 * 2. 태그/카테고리 noindex 로직
 * 3. 스크래퍼 파라미터 URL 감지
 */
import { describe, it, expect } from "vitest";

// ─── 1. 이메일/특수문자 태그 필터링 로직 ─────────────────────────────────────
function isProblematicTag(tag: string): { blocked: boolean; reason: string } {
  const isEmail = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(tag);
  if (isEmail) return { blocked: true, reason: "이메일 형식" };

  const isSpecialOnly = /^[$@%^*=<>|\\!~`]+$/.test(tag);
  if (isSpecialOnly) return { blocked: true, reason: "특수문자만" };

  const startsWithHash = tag.startsWith("#");
  if (startsWithHash) return { blocked: true, reason: "#으로 시작" };

  return { blocked: false, reason: "" };
}

describe("이메일/특수문자 태그 필터링", () => {
  it("이메일 형식 태그는 차단된다", () => {
    expect(isProblematicTag("ikiki072000@gmail.com").blocked).toBe(true);
    expect(isProblematicTag("user@naver.com").blocked).toBe(true);
    expect(isProblematicTag("test.user+tag@example.co.kr").blocked).toBe(true);
  });

  it("정상 태그는 허용된다", () => {
    expect(isProblematicTag("바이브코딩").blocked).toBe(false);
    expect(isProblematicTag("AI 도구").blocked).toBe(false);
    expect(isProblematicTag("ci/cd").blocked).toBe(false);
    expect(isProblematicTag("GPT-4").blocked).toBe(false);
  });

  it("특수문자만으로 구성된 태그는 차단된다", () => {
    expect(isProblematicTag("$$$").blocked).toBe(true);
    expect(isProblematicTag("@@@").blocked).toBe(true);
    expect(isProblematicTag("!~`").blocked).toBe(true);
  });

  it("# 기호로 시작하는 태그는 차단된다", () => {
    expect(isProblematicTag("#바이브 코딩앱에 결제 연결하기").blocked).toBe(true);
    expect(isProblematicTag("#클로드 오푸스 4.8 출시").blocked).toBe(true);
  });

  it("이메일이 아닌 @ 포함 태그는 허용된다", () => {
    // 단순 @ 포함이지만 이메일 형식이 아닌 경우
    expect(isProblematicTag("@mention").blocked).toBe(false); // 이메일 형식 아님
  });
});

// ─── 2. noindex 판단 로직 ─────────────────────────────────────────────────────
function shouldNoindex(postCount: number, tag: string): { noindex: boolean; reason: string } {
  const isEmail = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(tag);
  if (isEmail) return { noindex: true, reason: "이메일 형식" };

  const isSpecialOnly = /^[$@%^*=<>|\\!~`]+$/.test(tag) || tag.startsWith("#");
  if (isSpecialOnly) return { noindex: true, reason: "특수문자 태그" };

  if (postCount === 0) return { noindex: true, reason: "글 없음" };

  return { noindex: false, reason: "" };
}

describe("태그 noindex 판단 로직", () => {
  it("글이 0개인 태그는 noindex 처리된다", () => {
    expect(shouldNoindex(0, "코딩 오류").noindex).toBe(true);
    expect(shouldNoindex(0, "AI 도구").noindex).toBe(true);
  });

  it("글이 1개 이상인 정상 태그는 index 허용된다", () => {
    expect(shouldNoindex(1, "바이브코딩").noindex).toBe(false);
    expect(shouldNoindex(10, "AI 도구").noindex).toBe(false);
  });

  it("이메일 형식 태그는 글 수와 무관하게 noindex 처리된다", () => {
    expect(shouldNoindex(5, "user@gmail.com").noindex).toBe(true);
    expect(shouldNoindex(0, "user@gmail.com").noindex).toBe(true);
  });
});

// ─── 3. 스크래퍼 파라미터 감지 로직 ─────────────────────────────────────────
function hasScraperParam(rawUrl: string): boolean {
  const queryString = rawUrl.includes("?") ? rawUrl.slice(rawUrl.indexOf("?") + 1) : "";
  return queryString.split("&").some((p) => p.startsWith("manus_scraper="));
}

function removeScraperParam(rawUrl: string): string {
  const pathname = rawUrl.split("?")[0];
  const queryString = rawUrl.includes("?") ? rawUrl.slice(rawUrl.indexOf("?") + 1) : "";
  const remainingQuery = queryString
    .split("&")
    .filter((p) => !p.startsWith("manus_scraper="))
    .join("&");
  return remainingQuery ? `${pathname}?${remainingQuery}` : pathname;
}

describe("스크래퍼 파라미터 처리", () => {
  it("manus_scraper 파라미터가 있는 URL을 감지한다", () => {
    expect(hasScraperParam("/p/some-post?manus_scraper=1")).toBe(true);
    expect(hasScraperParam("/category/ai?manus_scraper=1&page=2")).toBe(true);
  });

  it("일반 URL은 스크래퍼 파라미터 없음으로 판단한다", () => {
    expect(hasScraperParam("/p/some-post")).toBe(false);
    expect(hasScraperParam("/category/ai?page=2")).toBe(false);
    expect(hasScraperParam("/")).toBe(false);
  });

  it("스크래퍼 파라미터를 제거한 clean URL을 반환한다", () => {
    expect(removeScraperParam("/p/some-post?manus_scraper=1")).toBe("/p/some-post");
    expect(removeScraperParam("/category/ai?manus_scraper=1&page=2")).toBe("/category/ai?page=2");
    expect(removeScraperParam("/category/ai?page=2&manus_scraper=1")).toBe("/category/ai?page=2");
  });

  it("스크래퍼 파라미터가 없는 URL은 그대로 반환한다", () => {
    expect(removeScraperParam("/p/some-post")).toBe("/p/some-post");
    expect(removeScraperParam("/category/ai?page=2")).toBe("/category/ai?page=2");
  });
});

// ─── 4. 카테고리 noindex 판단 로직 ───────────────────────────────────────────
function shouldCategoryNoindex(postCount: number, category: string): { noindex: boolean; reason: string } {
  const isEmail = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(category);
  if (isEmail) return { noindex: true, reason: "이메일 형식" };

  const isSpecialOnly = /^[$@%^*=<>|\\!~`]+$/.test(category);
  if (isSpecialOnly) return { noindex: true, reason: "특수문자 카테고리" };

  const isInternal = category === "__latest__" || category.startsWith("__");
  if (isInternal) return { noindex: true, reason: "내부 시스템 코드" };

  if (postCount === 0) return { noindex: true, reason: "글 없음" };

  return { noindex: false, reason: "" };
}

describe("카테고리 noindex 판단 로직", () => {
  it("글이 0개인 카테고리는 noindex 처리된다", () => {
    expect(shouldCategoryNoindex(0, "ai-tools").noindex).toBe(true);
  });

  it("글이 있는 정상 카테고리는 index 허용된다", () => {
    expect(shouldCategoryNoindex(5, "ai-tools").noindex).toBe(false);
    expect(shouldCategoryNoindex(1, "vibe-coding").noindex).toBe(false);
  });

  it("이메일 형식 카테고리는 noindex 처리된다", () => {
    expect(shouldCategoryNoindex(3, "user@gmail.com").noindex).toBe(true);
  });

  it("내부 시스템 코드 카테고리는 noindex 처리된다", () => {
    expect(shouldCategoryNoindex(10, "__latest__").noindex).toBe(true);
    expect(shouldCategoryNoindex(0, "__internal__").noindex).toBe(true);
  });
});
