/**
 * Image generation helper using internal ImageService
 *
 * Example usage:
 *   const { url: imageUrl } = await generateImage({
 *     prompt: "A serene landscape with mountains"
 *   });
 *
 * For editing:
 *   const { url: imageUrl } = await generateImage({
 *     prompt: "Add a rainbow to this landscape",
 *     originalImages: [{
 *       url: "https://example.com/original.jpg",
 *       mimeType: "image/jpeg"
 *     }]
 *   });
 */
import { storagePut } from "server/storage";
import { getImageTransformer } from "server/image-transform";
import { ENV } from "./env";

export type GenerateImageOptions = {
  prompt: string;
  originalImages?: Array<{
    url?: string;
    b64Json?: string;
    mimeType?: string;
  }>;
};

export type GenerateImageResponse = {
  url?: string;
};

/** WebP 변환 품질 (0~100). 82면 육안 차이 거의 없음 */
const WEBP_QUALITY = 82;
/** 생성 이미지 최대 너비 (px). 이 이상이면 리사이징 */
const MAX_WIDTH = 1200;

/**
 * AI 생성 이미지 버퍼를 WebP로 변환 + 최대 너비 리사이징
 * PNG/JPEG 등 모든 래스터 포맷을 WebP로 변환
 */
async function convertGeneratedImageToWebP(
  buffer: Buffer,
  mimeType: string
): Promise<{ buffer: Buffer; mimeType: string; ext: string }> {
  // GIF/SVG는 변환 제외 (애니메이션 보존, 벡터 유지)
  if (mimeType === "image/gif" || mimeType === "image/svg+xml") {
    const ext = mimeType.split("/")[1] || "bin";
    return { buffer, mimeType, ext };
  }

  try {
    const transformer = getImageTransformer();
    const meta = await transformer.metadata(buffer);
    const needsResize = meta.width && meta.width > MAX_WIDTH;

    const optimized = Buffer.from(await transformer.toWebP(buffer, {
      width: needsResize ? MAX_WIDTH : undefined,
      quality: WEBP_QUALITY,
      withoutEnlargement: true,
    }));

    return { buffer: optimized, mimeType: "image/webp", ext: "webp" };
  } catch (err) {
    // Sharp 처리 실패 시 원본 그대로 저장 (안전 폴백)
    console.warn("[ImageGen] WebP conversion failed, using original:", err);
    const ext = mimeType.split("/")[1]?.replace("jpeg", "jpg") || "png";
    return { buffer, mimeType, ext };
  }
}

export async function generateImage(
  options: GenerateImageOptions
): Promise<GenerateImageResponse> {
  if (!ENV.forgeApiUrl) {
    throw new Error("BUILT_IN_FORGE_API_URL is not configured");
  }
  if (!ENV.forgeApiKey) {
    throw new Error("BUILT_IN_FORGE_API_KEY is not configured");
  }

  // Build the full URL by appending the service path to the base URL
  const baseUrl = ENV.forgeApiUrl.endsWith("/")
    ? ENV.forgeApiUrl
    : `${ENV.forgeApiUrl}/`;
  const fullUrl = new URL(
    "images.v1.ImageService/GenerateImage",
    baseUrl
  ).toString();

  const response = await fetch(fullUrl, {
    method: "POST",
    headers: {
      accept: "application/json",
      "content-type": "application/json",
      "connect-protocol-version": "1",
      authorization: `Bearer ${ENV.forgeApiKey}`,
    },
    body: JSON.stringify({
      prompt: options.prompt,
      original_images: options.originalImages || [],
    }),
  });

  if (!response.ok) {
    const detail = await response.text().catch(() => "");
    throw new Error(
      `Image generation request failed (${response.status} ${response.statusText})${detail ? `: ${detail}` : ""}`
    );
  }

  const result = (await response.json()) as {
    image: {
      b64Json: string;
      mimeType: string;
    };
  };
  const base64Data = result.image.b64Json;
  const rawBuffer = Buffer.from(base64Data, "base64");

  // WebP 변환 + 최대 너비 리사이징 적용
  const { buffer, mimeType: outMime, ext } = await convertGeneratedImageToWebP(
    rawBuffer,
    result.image.mimeType
  );

  // Save to S3 as WebP
  const { url } = await storagePut(
    `generated/${Date.now()}.${ext}`,
    buffer,
    outMime
  );

  return { url };
}
