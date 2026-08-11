/**
 * SeoPreview 유틸 함수 단위 테스트
 *
 * SeoPreview 컴포넌트 내부의 순수 유틸 함수들을
 * 서버 사이드 Vitest 환경에서 검증합니다.
 */

import { describe, expect, it } from "vitest";

// ─── 테스트 대상 함수 인라인 재현 ────────────────────────────────────────────
// (client/src/components/SeoPreview.tsx 에서 export된 함수와 동일 로직)

function formatBreadcrumb(url: string): string {
  try {
    const u = new URL(url);
    const parts = [u.hostname, ...u.pathname.split("/").filter(Boolean)];
    return parts.join(" › ");
  } catch {
    return url;
  }
}

function evaluateTitle(title: string): {
  status: "good" | "warn" | "error";
  message: string;
} {
  const len = title.length;
  if (len === 0) return { status: "error", message: "제목을 입력해 주세요." };
  if (len < 10) return { status: "warn", message: `제목이 너무 짧습니다 (${len}자). 10자 이상 권장합니다.` };
  if (len > 60) return { status: "warn", message: `제목이 너무 깁니다 (${len}자). 60자 이하 권장합니다.` };
  return { status: "good", message: `제목 길이 적절 (${len}자)` };
}

function evaluateDescription(desc: string): {
  status: "good" | "warn" | "error";
  message: string;
} {
  const len = desc.length;
  if (len === 0) return { status: "warn", message: "설명이 없으면 Google이 본문에서 자동 추출합니다." };
  if (len < 50) return { status: "warn", message: `설명이 너무 짧습니다 (${len}자). 50자 이상 권장합니다.` };
  if (len > 160) return { status: "warn", message: `설명이 너무 깁니다 (${len}자). 160자 이하 권장합니다.` };
  return { status: "good", message: `설명 길이 적절 (${len}자)` };
}

function truncate(text: string, maxLen: number): string {
  if (text.length <= maxLen) return text;
  return text.slice(0, maxLen - 1) + "…";
}

// ─── 테스트 ──────────────────────────────────────────────────────────────────

describe("formatBreadcrumb", () => {
  it("도메인 + 경로를 › 구분자로 반환한다", () => {
    expect(formatBreadcrumb("https://vibecraftx.com/post/123")).toBe("vibecraftx.com › post › 123");
  });

  it("루트 경로는 도메인만 반환한다", () => {
    expect(formatBreadcrumb("https://vibecraftx.com/")).toBe("vibecraftx.com");
  });

  it("유효하지 않은 URL은 원본 문자열을 반환한다", () => {
    expect(formatBreadcrumb("not-a-url")).toBe("not-a-url");
  });

  it("카테고리 경로를 올바르게 분리한다", () => {
    expect(formatBreadcrumb("https://vibecraftx.com/category/ai-apps")).toBe(
      "vibecraftx.com › category › ai-apps"
    );
  });
});

describe("evaluateTitle", () => {
  it("빈 제목은 error 상태를 반환한다", () => {
    const result = evaluateTitle("");
    expect(result.status).toBe("error");
  });

  it("10자 미만 제목은 warn 상태를 반환한다", () => {
    const result = evaluateTitle("짧은제목");
    expect(result.status).toBe("warn");
    expect(result.message).toContain("짧습니다");
  });

  it("60자 초과 제목은 warn 상태를 반환한다", () => {
    const longTitle = "가".repeat(61);
    const result = evaluateTitle(longTitle);
    expect(result.status).toBe("warn");
    expect(result.message).toContain("깁니다");
  });

  it("10~60자 제목은 good 상태를 반환한다", () => {
    const result = evaluateTitle("AI 자동화 프로그램으로 업무 효율을 높이는 방법");
    expect(result.status).toBe("good");
    expect(result.message).toContain("적절");
  });

  it("정확히 10자 제목은 good 상태를 반환한다", () => {
    expect(evaluateTitle("가".repeat(10)).status).toBe("good");
  });

  it("정확히 60자 제목은 good 상태를 반환한다", () => {
    expect(evaluateTitle("가".repeat(60)).status).toBe("good");
  });
});

describe("evaluateDescription", () => {
  it("빈 설명은 warn 상태를 반환한다", () => {
    const result = evaluateDescription("");
    expect(result.status).toBe("warn");
    expect(result.message).toContain("자동 추출");
  });

  it("50자 미만 설명은 warn 상태를 반환한다", () => {
    const result = evaluateDescription("짧은 설명");
    expect(result.status).toBe("warn");
    expect(result.message).toContain("짧습니다");
  });

  it("160자 초과 설명은 warn 상태를 반환한다", () => {
    const longDesc = "가".repeat(161);
    const result = evaluateDescription(longDesc);
    expect(result.status).toBe("warn");
    expect(result.message).toContain("깁니다");
  });

  it("50~160자 설명은 good 상태를 반환한다", () => {
    const goodDesc = "AI를 활용한 자동화 프로그램 개발 방법을 소개합니다. 코딩 없이도 강력한 자동화 도구를 만들 수 있습니다.";
    const result = evaluateDescription(goodDesc);
    expect(result.status).toBe("good");
  });
});

describe("truncate", () => {
  it("maxLen 이하 텍스트는 그대로 반환한다", () => {
    expect(truncate("hello", 10)).toBe("hello");
  });

  it("maxLen 초과 텍스트는 말줄임표로 자른다", () => {
    expect(truncate("hello world", 8)).toBe("hello w…");
  });

  it("정확히 maxLen과 같은 길이는 그대로 반환한다", () => {
    expect(truncate("hello", 5)).toBe("hello");
  });

  it("빈 문자열은 그대로 반환한다", () => {
    expect(truncate("", 10)).toBe("");
  });

  it("60자 제목 truncate 동작 확인", () => {
    const title = "가".repeat(65);
    const result = truncate(title, 60);
    expect(result.length).toBe(60);
    expect(result.endsWith("…")).toBe(true);
  });
});
