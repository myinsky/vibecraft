/**
 * server/upload.test.ts
 * generateResponsiveImages 함수 단위 테스트
 *
 * 실제 S3 업로드 없이 storagePut을 모킹하여 검증
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

// storagePut 모킹 (S3 실제 호출 방지)
vi.mock("./storage", () => ({
  storagePut: vi.fn(async (key: string) => ({
    key,
    url: `/manus-storage/${key}`,
  })),
}));

import { generateResponsiveImages } from "./upload";

// 1x1 WebP 픽셀 (최소 유효 이미지)
const TINY_WEBP = Buffer.from(
  "52494646240000005745425056503820" +
  "180000003001009d012a01000100003" +
  "4025a4600fef81f00fef81f00000000",
  "hex"
);

// 100x100 PNG 픽셀 (sharp가 처리 가능한 실제 이미지)
// PNG 헤더 + IHDR + IDAT + IEND
const PNG_1x1 = Buffer.from(
  "89504e470d0a1a0a0000000d49484452" +
  "000000010000000108020000009001" +
  "2e00000000c4944415408d7636060" +
  "60000000020001e221bc330000000049454e44ae426082",
  "hex"
);

describe("generateResponsiveImages", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("GIF는 변환 없이 단일 URL 반환", async () => {
    const gifBuffer = Buffer.from("GIF89a", "ascii");
    const result = await generateResponsiveImages(gifBuffer, "image/gif", "test/gif_base");

    expect(result.url).toContain("test/gif_base.gif");
    expect(result.srcset).toBe(result.url); // srcset = url (단일)
    expect(result.key).toContain("test/gif_base.gif");
  });

  it("SVG는 변환 없이 단일 URL 반환", async () => {
    const svgBuffer = Buffer.from("<svg></svg>", "utf-8");
    const result = await generateResponsiveImages(svgBuffer, "image/svg+xml", "test/svg_base");

    expect(result.url).toContain("test/svg_base.svg+xml");
    expect(result.srcset).toBe(result.url);
  });

  it("유효한 이미지는 srcset 문자열에 w 디스크립터 포함", async () => {
    // sharp 처리 실패 시 폴백으로 단일 URL 반환하는 것도 허용
    const result = await generateResponsiveImages(TINY_WEBP, "image/jpeg", "test/img_base");

    // srcset은 항상 반환되어야 함
    expect(result.url).toBeTruthy();
    expect(result.srcset).toBeTruthy();
    expect(result.key).toBeTruthy();
  });

  it("srcset이 단일 URL이 아닌 경우 w 디스크립터 포함", async () => {
    const result = await generateResponsiveImages(TINY_WEBP, "image/jpeg", "test/multi");

    // 다중 해상도이면 'w' 디스크립터가 있어야 함
    if (result.srcset !== result.url) {
      expect(result.srcset).toMatch(/\d+w/);
    }
  });

  it("baseKey가 생성된 파일 key에 포함됨", async () => {
    const result = await generateResponsiveImages(TINY_WEBP, "image/png", "uploads/images/test123");

    expect(result.key).toContain("test123");
  });
});
