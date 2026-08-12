/**
 * 게시물 발행 시 썸네일 이미지 자동 최적화 모듈
 *
 * 동작 방식:
 * 1. 썸네일 URL이 이미 /manus-storage/... 경로인 경우 → 이미 최적화됨, 건너뜀
 * 2. 외부 URL(CloudFront, 외부 CDN 등)인 경우 → 다운로드 → WebP 변환 + 리사이징 → S3 재업로드
 * 3. 실패 시 원본 URL 그대로 유지 (안전 폴백)
 */

import { storagePut } from "./storage";
import { getImageTransformer } from "./image-transform";

// ─── 최적화 설정 ──────────────────────────────────────────────────────────────
const THUMB_CONFIG = {
  /** 썸네일 최대 너비 (px). 이 이상이면 리사이징 */
  maxWidth: 1200,
  /** WebP 품질 (0~100) */
  webpQuality: 82,
  /** 변환 제외 MIME 타입 */
  skipMimeTypes: ["image/gif", "image/svg+xml"],
  /** fetch 타임아웃 (ms) */
  fetchTimeoutMs: 10_000,
  /** 최대 허용 파일 크기 (bytes). 이 이상이면 최적화 건너뜀 */
  maxFileSizeBytes: 20 * 1024 * 1024, // 20MB
};

/**
 * 이미 최적화된 이미지인지 확인
 * /manus-storage/ 경로로 시작하면 이미 S3에 저장된 최적화 이미지
 */
function isAlreadyOptimized(url: string): boolean {
  return url.startsWith("/manus-storage/") || url.includes("/manus-storage/");
}

/**
 * URL에서 MIME 타입 추론 (Content-Type 헤더 우선, 없으면 확장자로 추론)
 */
function guessMimeType(url: string, contentType?: string | null): string {
  if (contentType) {
    const mime = contentType.split(";")[0].trim().toLowerCase();
    if (mime.startsWith("image/")) return mime;
  }
  const ext = url.split("?")[0].split(".").pop()?.toLowerCase();
  const extMap: Record<string, string> = {
    jpg: "image/jpeg",
    jpeg: "image/jpeg",
    png: "image/png",
    webp: "image/webp",
    gif: "image/gif",
    svg: "image/svg+xml",
    avif: "image/avif",
  };
  return extMap[ext ?? ""] ?? "image/jpeg";
}

/**
 * 이미지 버퍼를 WebP로 변환 + 최대 너비 리사이징
 */
async function convertToWebP(
  buffer: Buffer,
  mimeType: string
): Promise<{ buffer: Buffer; mimeType: string }> {
  // 변환 제외 포맷은 원본 그대로
  if (THUMB_CONFIG.skipMimeTypes.includes(mimeType)) {
    return { buffer, mimeType };
  }
  // 이미 WebP이고 크기가 작으면 리사이징만 확인
  const transformer = getImageTransformer();
  const meta = await transformer.metadata(buffer);
  const needsResize = meta.width && meta.width > THUMB_CONFIG.maxWidth;

  const optimized = Buffer.from(await transformer.toWebP(buffer, {
    width: needsResize ? THUMB_CONFIG.maxWidth : undefined,
    quality: THUMB_CONFIG.webpQuality,
    withoutEnlargement: true,
  }));

  return { buffer: optimized, mimeType: "image/webp" };
}

/**
 * 썸네일 URL을 최적화하여 S3에 저장하고 새 URL 반환
 *
 * @param thumbnailUrl - 원본 썸네일 URL
 * @param postId - 게시물 ID (S3 키 생성에 사용)
 * @returns 최적화된 이미지의 /manus-storage/... URL, 실패 시 원본 URL
 */
export async function optimizeThumbnail(
  thumbnailUrl: string,
  postId: number | string
): Promise<string> {
  // 빈 URL 처리
  if (!thumbnailUrl || !thumbnailUrl.trim()) return thumbnailUrl;

  // 이미 최적화된 이미지는 건너뜀
  if (isAlreadyOptimized(thumbnailUrl)) {
    return thumbnailUrl;
  }

  // 상대 경로 처리 (외부 URL이 아닌 경우 건너뜀)
  if (!thumbnailUrl.startsWith("http://") && !thumbnailUrl.startsWith("https://")) {
    return thumbnailUrl;
  }

  try {
    // 타임아웃 적용하여 이미지 다운로드
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), THUMB_CONFIG.fetchTimeoutMs);

    let response: Response;
    try {
      response = await fetch(thumbnailUrl, {
        signal: controller.signal,
        headers: {
          "User-Agent": "Mozilla/5.0 (compatible; SmartAutoGuide/1.0)",
        },
      });
    } finally {
      clearTimeout(timeoutId);
    }

    if (!response.ok) {
      console.warn(`[ImageOptimizer] Failed to fetch thumbnail (${response.status}): ${thumbnailUrl}`);
      return thumbnailUrl;
    }

    // 파일 크기 확인 (Content-Length 헤더)
    const contentLength = response.headers.get("content-length");
    if (contentLength && parseInt(contentLength) > THUMB_CONFIG.maxFileSizeBytes) {
      console.warn(`[ImageOptimizer] Thumbnail too large (${contentLength} bytes), skipping: ${thumbnailUrl}`);
      return thumbnailUrl;
    }

    const contentType = response.headers.get("content-type");
    const mimeType = guessMimeType(thumbnailUrl, contentType);

    const arrayBuffer = await response.arrayBuffer();
    const originalBuffer = Buffer.from(arrayBuffer);
    const originalSize = originalBuffer.length;

    // 버퍼 크기 재확인
    if (originalSize > THUMB_CONFIG.maxFileSizeBytes) {
      console.warn(`[ImageOptimizer] Thumbnail buffer too large (${originalSize} bytes), skipping`);
      return thumbnailUrl;
    }

    // WebP 변환 + 리사이징
    const { buffer: optimizedBuffer, mimeType: outMime } = await convertToWebP(originalBuffer, mimeType);

    // S3 업로드
    const key = `thumbnails/post-${postId}-${Date.now()}.webp`;
    const { url } = await storagePut(key, optimizedBuffer, outMime);

    const savedPercent = Math.round((1 - optimizedBuffer.length / originalSize) * 100);
    console.log(
      `[ImageOptimizer] Thumbnail optimized for post ${postId}: ` +
      `${originalSize}B → ${optimizedBuffer.length}B (${savedPercent}% saved) → ${url}`
    );

    return url;
  } catch (err) {
    // 최적화 실패 시 원본 URL 유지 (안전 폴백)
    if (err instanceof Error && err.name === "AbortError") {
      console.warn(`[ImageOptimizer] Thumbnail fetch timed out: ${thumbnailUrl}`);
    } else {
      console.warn(`[ImageOptimizer] Thumbnail optimization failed, using original:`, err);
    }
    return thumbnailUrl;
  }
}

/**
 * DB에 저장된 게시물의 썸네일을 비동기로 최적화하고 DB를 업데이트
 * 발행 프로시저에서 fire-and-forget 방식으로 호출
 *
 * @param postId - 게시물 ID
 * @param thumbnailUrl - 현재 썸네일 URL
 * @param updateFn - DB 업데이트 함수 (postId, newUrl) => Promise<void>
 */
export async function optimizeThumbnailAsync(
  postId: number,
  thumbnailUrl: string | null | undefined,
  updateFn: (postId: number, newUrl: string) => Promise<void>
): Promise<void> {
  if (!thumbnailUrl) return;
  if (isAlreadyOptimized(thumbnailUrl)) return;

  try {
    const optimizedUrl = await optimizeThumbnail(thumbnailUrl, postId);
    if (optimizedUrl !== thumbnailUrl) {
      await updateFn(postId, optimizedUrl);
    }
  } catch (err) {
    console.warn(`[ImageOptimizer] Async optimization failed for post ${postId}:`, err);
  }
}

// ─── 반응형 이미지 일괄 생성 ──────────────────────────────────────────────────

const RESPONSIVE_WIDTHS_MIGRATE = [320, 640, 1200] as const;

/**
 * 이미 /manus-storage/ 경로에 있는 단일 해상도 이미지를
 * 320w/640w/1200w 다중 해상도 WebP로 변환하여 S3에 저장
 *
 * @param thumbnailUrl - /manus-storage/... 경로의 썸네일 URL
 * @param storageBaseUrl - 스토리지 접근 기본 URL (서버 사이드에서 직접 접근)
 * @returns 새 1200w URL (실패 시 원본 URL)
 */
export async function generateResponsiveThumbnail(
  thumbnailUrl: string,
  storageBaseUrl: string
): Promise<string> {
  // 이미 반응형 형식인 경우 건너뜀
  if (thumbnailUrl.includes('_1200w.webp') || thumbnailUrl.includes('_640w.webp') || thumbnailUrl.includes('_320w.webp')) {
    return thumbnailUrl;
  }
  // GIF/SVG는 건너뜀
  if (thumbnailUrl.endsWith('.gif') || thumbnailUrl.endsWith('.svg')) {
    return thumbnailUrl;
  }
  // /manus-storage/ 경로만 처리
  if (!thumbnailUrl.startsWith('/manus-storage/')) {
    return thumbnailUrl;
  }

  try {
    // 스토리지에서 이미지 다운로드 (서버 내부 접근)
    const fetchUrl = `${storageBaseUrl}${thumbnailUrl}`;
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), THUMB_CONFIG.fetchTimeoutMs);
    let resp: Response;
    try {
      resp = await fetch(fetchUrl, { signal: controller.signal });
    } finally {
      clearTimeout(timeoutId);
    }
    if (!resp.ok) {
      console.warn(`[ResponsiveGen] Failed to fetch ${thumbnailUrl}: ${resp.status}`);
      return thumbnailUrl;
    }
    const contentType = resp.headers.get('content-type') ?? 'image/jpeg';
    // GIF/SVG 건너뜀
    if (THUMB_CONFIG.skipMimeTypes.includes(contentType.split(';')[0].trim())) {
      return thumbnailUrl;
    }
    const arrayBuffer = await resp.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);
    if (buffer.length > THUMB_CONFIG.maxFileSizeBytes) {
      console.warn(`[ResponsiveGen] File too large: ${buffer.length} bytes`);
      return thumbnailUrl;
    }

    // 기존 파일명에서 baseKey 추출
    // /manus-storage/uploads/images/1234_abc.webp → uploads/images/1234_abc
    const storageKey = thumbnailUrl.replace('/manus-storage/', '');
    const baseKey = storageKey.replace(/\.[^.]+$/, ''); // 확장자 제거

    // 병렬로 각 해상도 WebP 생성 + S3 업로드
    const transformer = getImageTransformer();
    const imgMeta = await transformer.metadata(buffer);
    const originalWidth = imgMeta.width ?? 1200;
    const widthsToGenerate = (RESPONSIVE_WIDTHS_MIGRATE as readonly number[]).filter(w => w <= originalWidth) as number[];
    if (widthsToGenerate.length === 0) widthsToGenerate.push(originalWidth);

    const results = await Promise.all(
      widthsToGenerate.map(async (w) => {
        const resized = await transformer.toWebP(buffer, {
          width: w,
          quality: THUMB_CONFIG.webpQuality,
          withoutEnlargement: true,
        });
        const key = `${baseKey}_${w}w.webp`;
        const { url } = await storagePut(key, resized, 'image/webp');
        return { width: w, url, key };
      })
    );

    // 가장 큰 해상도 URL 반환 (1200w 또는 원본 너비)
    const largest = results[results.length - 1];
    console.log(`[ResponsiveGen] Generated ${results.length} sizes for ${thumbnailUrl} → ${largest.url}`);
    return largest.url;
  } catch (err) {
    console.warn(`[ResponsiveGen] Failed for ${thumbnailUrl}:`, err);
    return thumbnailUrl;
  }
}
