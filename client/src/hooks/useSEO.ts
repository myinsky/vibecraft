/**
 * useSEO — 페이지별 SEO 메타 태그 동적 갱신 훅
 *
 * 지원 태그:
 *  - <title>
 *  - <meta name="description">
 *  - <meta property="og:title">
 *  - <meta property="og:description">
 *  - <meta property="og:image">
 *  - <meta property="og:url">
 *  - <meta property="og:type">
 *  - <meta name="twitter:card">
 *  - <meta name="twitter:title">
 *  - <meta name="twitter:description">
 *  - <meta name="twitter:image">
 *  - <link rel="canonical"> (서버사이드에서 이미 주입 — 클라이언트는 업데이트만)
 *
 * 사용법:
 *   useSEO({ title: "포스트 제목", description: "요약 문장", image: "/manus-storage/..." });
 *
 * 페이지 언마운트 시 기본값(index.html 원본)으로 자동 복원됩니다.
 */

import { useEffect } from "react";

export interface SEOOptions {
  /** <title> 및 og:title / twitter:title 에 사용될 텍스트 */
  title?: string;
  /** meta description, og:description, twitter:description 에 사용될 텍스트 */
  description?: string;
  /** og:image, twitter:image 에 사용될 절대 URL 또는 /manus-storage/... 경로 */
  image?: string;
  /** og:type (기본값: "website") */
  type?: "website" | "article";
  /** LCP 이미지 preload 힌트 추가 여부 (true면 <link rel="preload" as="image"> 삽입) */
  preloadImage?: boolean;
}

/** 사이트 기본 제목 (index.html 초기값 유지용) */
const DEFAULT_TITLE = document.title || "스마트 오토 가이드";

/** meta 태그를 선택하거나 없으면 생성하여 반환 */
function getOrCreateMeta(selector: string, attrs: Record<string, string>): HTMLMetaElement {
  let el = document.head.querySelector<HTMLMetaElement>(selector);
  if (!el) {
    el = document.createElement("meta");
    Object.entries(attrs).forEach(([k, v]) => el!.setAttribute(k, v));
    el.setAttribute("data-seo-dynamic", "true");
    document.head.appendChild(el);
  }
  return el;
}

/** <link rel="canonical"> 를 선택하여 반환 (서버사이드에서 이미 주입됨 — 없으면 null) */
function getCanonical(): HTMLLinkElement | null {
  return document.head.querySelector<HTMLLinkElement>('link[rel="canonical"]');
}

export function useSEO({ title, description, image, type = "website", preloadImage = false }: SEOOptions) {
  useEffect(() => {
    const prevTitle = document.title;

    // ── <title> ──────────────────────────────────────────────────────────────
    if (title) document.title = title;

    // ── <meta name="description"> ────────────────────────────────────────────
    const metaDesc = getOrCreateMeta('meta[name="description"]', { name: "description", content: "" });
    const prevDesc = metaDesc.getAttribute("content") ?? "";
    if (description) metaDesc.setAttribute("content", description);

    // ── Open Graph ───────────────────────────────────────────────────────────
    const ogTitle = getOrCreateMeta('meta[property="og:title"]', { property: "og:title", content: "" });
    const prevOgTitle = ogTitle.getAttribute("content") ?? "";
    if (title) ogTitle.setAttribute("content", title);

    const ogDesc = getOrCreateMeta('meta[property="og:description"]', { property: "og:description", content: "" });
    const prevOgDesc = ogDesc.getAttribute("content") ?? "";
    if (description) ogDesc.setAttribute("content", description);

    const ogType = getOrCreateMeta('meta[property="og:type"]', { property: "og:type", content: "website" });
    const prevOgType = ogType.getAttribute("content") ?? "website";
    ogType.setAttribute("content", type);

    const ogUrl = getOrCreateMeta('meta[property="og:url"]', { property: "og:url", content: "" });
    const prevOgUrl = ogUrl.getAttribute("content") ?? "";
    ogUrl.setAttribute("content", window.location.href);

    const ogImage = getOrCreateMeta('meta[property="og:image"]', { property: "og:image", content: "" });
    const prevOgImage = ogImage.getAttribute("content") ?? "";
    if (image) {
      const absImage = image.startsWith("http") ? image : `${window.location.origin}${image}`;
      ogImage.setAttribute("content", absImage);
    }

    // ── Twitter Card ─────────────────────────────────────────────────────────
    const twCard = getOrCreateMeta('meta[name="twitter:card"]', { name: "twitter:card", content: "summary_large_image" });
    const prevTwCard = twCard.getAttribute("content") ?? "";
    twCard.setAttribute("content", image ? "summary_large_image" : "summary");

    const twTitle = getOrCreateMeta('meta[name="twitter:title"]', { name: "twitter:title", content: "" });
    const prevTwTitle = twTitle.getAttribute("content") ?? "";
    if (title) twTitle.setAttribute("content", title);

    const twDesc = getOrCreateMeta('meta[name="twitter:description"]', { name: "twitter:description", content: "" });
    const prevTwDesc = twDesc.getAttribute("content") ?? "";
    if (description) twDesc.setAttribute("content", description);

    const twImage = getOrCreateMeta('meta[name="twitter:image"]', { name: "twitter:image", content: "" });
    const prevTwImage = twImage.getAttribute("content") ?? "";
    if (image) {
      const absImage = image.startsWith("http") ? image : `${window.location.origin}${image}`;
      twImage.setAttribute("content", absImage);
    }

    // ── Canonical ─────────────────────────────────────────────────────────────
    // 서버사이드에서 이미 올바른 canonical을 주입하므로 클라이언트는 SPA 내비게이션 시
    // href만 현재 URL로 업데이트합니다. 새 태그를 생성하지 않아 중복을 방지합니다.
    const canonical = getCanonical();
    const prevCanonical = canonical?.getAttribute("href") ?? "";
    if (canonical) canonical.setAttribute("href", window.location.href);

    // ── LCP 이미지 preload 힌트 ──────────────────────────────────────────────
    // preloadImage=true이고 image가 있을 때 <link rel="preload" as="image"> 삽입
    let preloadLink: HTMLLinkElement | null = null;
    if (preloadImage && image) {
      const absImage = image.startsWith("http") ? image : `${window.location.origin}${image}`;
      // 이미 동일한 href로 preload가 있으면 중복 삽입 방지
      const existing = document.head.querySelector<HTMLLinkElement>(`link[rel="preload"][as="image"][data-seo-preload]`);
      if (!existing) {
        preloadLink = document.createElement("link");
        preloadLink.rel = "preload";
        preloadLink.as = "image";
        preloadLink.href = absImage;
        preloadLink.setAttribute("fetchpriority", "high");
        preloadLink.setAttribute("data-seo-preload", "true");
        document.head.appendChild(preloadLink);
      } else {
        existing.href = absImage;
      }
    }

    // ── 언마운트 시 이전 값 복원 ──────────────────────────────────────────────
    return () => {
      document.title = prevTitle || DEFAULT_TITLE;
      metaDesc.setAttribute("content", prevDesc);
      ogTitle.setAttribute("content", prevOgTitle);
      ogDesc.setAttribute("content", prevOgDesc);
      ogType.setAttribute("content", prevOgType);
      ogUrl.setAttribute("content", prevOgUrl);
      ogImage.setAttribute("content", prevOgImage);
      twCard.setAttribute("content", prevTwCard);
      twTitle.setAttribute("content", prevTwTitle);
      twDesc.setAttribute("content", prevTwDesc);
      twImage.setAttribute("content", prevTwImage);
      if (canonical) canonical.setAttribute("href", prevCanonical);
      // preload 링크 제거
      if (preloadLink) preloadLink.remove();
      document.head.querySelectorAll('link[data-seo-preload]').forEach(el => el.remove());
    };
  }, [title, description, image, type, preloadImage]);
}
