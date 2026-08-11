/**
 * 반응형 이미지(srcset) 유틸리티
 *
 * 새로 업로드된 이미지: /manus-storage/uploads/images/{baseKey}_320w.webp 패턴
 * 기존 이미지: /manus-storage/uploads/images/{key}.webp 패턴 (srcset 없음)
 *
 * makeSrcSet()은 URL 패턴을 분석하여 srcset 문자열을 반환합니다.
 * - 새 이미지(_1200w.webp로 끝나는 경우): 320w/640w/1200w 세 가지 URL 조합
 * - 기존 이미지: 단일 URL 그대로 반환 (폴백)
 */

const RESPONSIVE_WIDTHS = [320, 640, 1200] as const;

/**
 * 이미지 URL에서 srcset 문자열 생성
 *
 * @param url - 이미지 URL (/manus-storage/... 또는 외부 URL)
 * @param providedSrcset - 업로드 API가 반환한 srcset 문자열 (있으면 우선 사용)
 * @returns srcset 문자열 또는 undefined (단일 URL인 경우)
 */
export function makeSrcSet(url: string, providedSrcset?: string): string | undefined {
  // 업로드 시 생성된 srcset 정보가 있으면 그대로 사용
  if (providedSrcset && providedSrcset !== url) {
    return providedSrcset;
  }

  // 새 형식 이미지: _1200w.webp 로 끝나는 경우 → 320w/640w URL 추론
  const match = url.match(/^(.+)_1200w\.webp$/);
  if (match) {
    const base = match[1];
    const parts = RESPONSIVE_WIDTHS.map(w => `${base}_${w}w.webp ${w}w`);
    return parts.join(", ");
  }

  // 기존 이미지 (/manus-storage/ 경로): ?w=N 파라미터로 리사이즈 srcset 생성
  // storageProxy에서 ?w=N 파라미터를 지원하므로 기존 이미지도 적절한 크기로 요청 가능
  if (url.startsWith('/manus-storage/') && (url.endsWith('.webp') || url.endsWith('.jpg') || url.endsWith('.jpeg') || url.endsWith('.png'))) {
    // ?w= 파라미터가 이미 있는 경우 그대로 사용
    if (url.includes('?w=')) return undefined;
    const LEGACY_WIDTHS = [320, 640, 960] as const;
    const parts = LEGACY_WIDTHS.map(w => `${url}?w=${w} ${w}w`);
    return parts.join(", ");
  }

  // 외부 URL: srcset 없음 (단일 URL 사용)
  return undefined;
}

/**
 * 이미지 URL이 반응형 이미지(다중 해상도)인지 확인
 */
export function isResponsiveImage(url: string): boolean {
  return url.includes("_1200w.webp") || url.includes("_640w.webp") || url.includes("_320w.webp");
}

/**
 * 소형 카드 sizes:
 * - 모바일(640px 이하): 카드가 2열 → 각 카드 약 45vw
 * - 태블릿(1024px 이하): 카드가 3열 → 약 30vw
 * - 데스크탑: 카드 고정 300px
 */
export const CARD_SIZES = "(max-width: 640px) 45vw, (max-width: 1024px) 30vw, 300px";

/**
 * 게시글 썸네일용 sizes 속성
 * - 모바일: 100vw
 * - 데스크톱: 960px (최대 콘텐츠 폭)
 */
export const THUMBNAIL_SIZES = "(max-width: 960px) 100vw, 960px";

/**
 * 피처드(대형) 카드 sizes:
 * - 모바일(640px 이하): 전체 너비 → 100vw
 * - 태블릿(1024px 이하): 60vw
 * - 데스크탑: 600px
 */
export const FEATURED_SIZES = "(max-width: 640px) 100vw, (max-width: 1024px) 60vw, 600px";
