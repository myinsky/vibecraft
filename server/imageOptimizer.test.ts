/**
 * imageOptimizer.ts 단위 테스트
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

// ─── Mock: storagePut ─────────────────────────────────────────────────────────
vi.mock("./storage", () => ({
  storagePut: vi.fn().mockResolvedValue({ key: "thumbnails/post-1-123.webp", url: "/manus-storage/thumbnails/post-1-123.webp" }),
}));

// ─── Mock: sharp ──────────────────────────────────────────────────────────────
vi.mock("sharp", () => {
  const mockSharp = vi.fn(() => ({
    metadata: vi.fn().mockResolvedValue({ width: 2000, height: 1000, format: "jpeg" }),
    resize: vi.fn().mockReturnThis(),
    webp: vi.fn().mockReturnThis(),
    toBuffer: vi.fn().mockResolvedValue(Buffer.from("optimized-webp-data")),
  }));
  return { default: mockSharp };
});

// ─── Mock: fetch ──────────────────────────────────────────────────────────────
const mockFetch = vi.fn();
global.fetch = mockFetch;

import { optimizeThumbnail, optimizeThumbnailAsync } from "./imageOptimizer";

describe("optimizeThumbnail", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockFetch.mockResolvedValue({
      ok: true,
      headers: {
        get: (key: string) => {
          if (key === "content-type") return "image/jpeg";
          if (key === "content-length") return "500000";
          return null;
        },
      },
      arrayBuffer: vi.fn().mockResolvedValue(new ArrayBuffer(500000)),
    });
  });

  it("빈 URL은 그대로 반환한다", async () => {
    const result = await optimizeThumbnail("", 1);
    expect(result).toBe("");
  });

  it("이미 /manus-storage/ 경로인 경우 건너뛴다", async () => {
    const url = "/manus-storage/thumbnails/existing.webp";
    const result = await optimizeThumbnail(url, 1);
    expect(result).toBe(url);
    expect(mockFetch).not.toHaveBeenCalled();
  });

  it("상대 경로는 건너뛴다", async () => {
    const url = "/images/local-image.png";
    const result = await optimizeThumbnail(url, 1);
    expect(result).toBe(url);
    expect(mockFetch).not.toHaveBeenCalled();
  });

  it("외부 URL을 다운로드하여 WebP로 변환 후 S3 URL을 반환한다", async () => {
    const url = "https://example.com/image.jpg";
    const result = await optimizeThumbnail(url, 1);
    expect(result).toBe("/manus-storage/thumbnails/post-1-123.webp");
    expect(mockFetch).toHaveBeenCalledWith(url, expect.any(Object));
  });

  it("fetch 실패 시 원본 URL을 반환한다 (안전 폴백)", async () => {
    mockFetch.mockResolvedValue({ ok: false, status: 404 });
    const url = "https://example.com/missing.jpg";
    const result = await optimizeThumbnail(url, 1);
    expect(result).toBe(url);
  });

  it("fetch 예외 발생 시 원본 URL을 반환한다 (안전 폴백)", async () => {
    mockFetch.mockRejectedValue(new Error("Network error"));
    const url = "https://example.com/error.jpg";
    const result = await optimizeThumbnail(url, 1);
    expect(result).toBe(url);
  });
});

describe("optimizeThumbnailAsync", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockFetch.mockResolvedValue({
      ok: true,
      headers: {
        get: (key: string) => {
          if (key === "content-type") return "image/jpeg";
          if (key === "content-length") return "500000";
          return null;
        },
      },
      arrayBuffer: vi.fn().mockResolvedValue(new ArrayBuffer(500000)),
    });
  });

  it("null 썸네일은 updateFn을 호출하지 않는다", async () => {
    const updateFn = vi.fn();
    await optimizeThumbnailAsync(1, null, updateFn);
    expect(updateFn).not.toHaveBeenCalled();
  });

  it("이미 최적화된 URL은 updateFn을 호출하지 않는다", async () => {
    const updateFn = vi.fn();
    await optimizeThumbnailAsync(1, "/manus-storage/existing.webp", updateFn);
    expect(updateFn).not.toHaveBeenCalled();
  });

  it("외부 URL 최적화 성공 시 updateFn을 새 URL로 호출한다", async () => {
    const updateFn = vi.fn().mockResolvedValue(undefined);
    await optimizeThumbnailAsync(1, "https://example.com/image.jpg", updateFn);
    expect(updateFn).toHaveBeenCalledWith(1, "/manus-storage/thumbnails/post-1-123.webp");
  });

  it("최적화 실패 시 updateFn을 호출하지 않는다 (안전 폴백)", async () => {
    mockFetch.mockRejectedValue(new Error("Network error"));
    const updateFn = vi.fn();
    await optimizeThumbnailAsync(1, "https://example.com/error.jpg", updateFn);
    expect(updateFn).not.toHaveBeenCalled();
  });
});
