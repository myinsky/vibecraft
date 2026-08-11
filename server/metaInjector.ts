/**
 * 서버 사이드 메타 태그 주입 (동적 렌더링)
 *
 * 네이버·다음·카카오톡 등 JavaScript를 실행하지 않는 봇/크롤러를 위해
 * Express 서버에서 URL 패턴별로 DB를 조회하여 완성된 <head> 메타 태그를
 * HTML에 직접 주입합니다.
 *
 * 적용 대상:
 *   - /p/:slug          게시물 상세
 *   - /post/:id         게시물 상세 (id 기반 구 URL)
 *   - /category/:key    카테고리 목록
 *   - /tag/:tag         태그 목록
 *   - /                 홈 (기본 사이트 메타)
 *   - 기타 모든 페이지  기본 사이트 메타
 */

import probe from "probe-image-size";
import { getPostBySlug, getPostById, getSiteConfigAll, getTagsByPost, getLatestPosts, getPostsByCategory, getPostsByTag, getHomeSections } from "./db";

// ===== 홈페이지 초기 데이터 캐시 (FCP/LCP 개선) =====
// 홈페이지 요청마다 DB 쿼리 3개를 실행하면 서버 응답 시간이 늘어나 FCP가 지연됨
// 30초 TTL 캐시로 DB 부하 및 응답 시간 감소
interface HomeInitialDataCache {
  data: {
    recentPosts: any[];
    firstCategoryKey: string;
    firstSectionPosts: any[];
  };
  expiresAt: number;
}
let homeDataCache: HomeInitialDataCache | null = null;
const HOME_CACHE_TTL_MS = 5 * 60_000; // 5분 (30초 → 5분: 캐시 미스 빈도 대폭 감소, TTFB 개선)

async function getHomeInitialDataCached() {
  const now = Date.now();
  if (homeDataCache && homeDataCache.expiresAt > now) {
    return homeDataCache.data;
  }
  const [recentPosts, homeSections] = await Promise.all([
    getLatestPosts(10),
    getHomeSections(),
  ]);
  const firstVisibleSection = homeSections.find((s: any) => s.visible !== false);
  const firstCategoryKey = firstVisibleSection
    ? (firstVisibleSection.sectionKey || firstVisibleSection.categoryPath?.replace(/^\/category\//, '') || 'ai-apps')
    : 'ai-apps';
  const firstSectionPosts = await getPostsByCategory(firstCategoryKey, 5);
  const result = { recentPosts, firstCategoryKey, firstSectionPosts };
  homeDataCache = { data: result, expiresAt: now + HOME_CACHE_TTL_MS };
  return result;
}

/** 홈 초기 데이터 캐시 무효화 (게시물 등록/수정/삭제 시 호출) */
export function invalidateHomeDataCache() {
  homeDataCache = null;
}

/**
 * DB에 저장된 headScripts를 HTML </head> 직전에 주입합니다.
 * 관리자 > 사이트 전역 설정 > 헤더 공통 스크립트에서 관리됩니다.
 */
export async function injectHeadScripts(html: string): Promise<string> {
  try {
    const config = await getSiteConfigAll();
    const headScripts = config.headScripts || "";
    const googleVerification = (config.googleSiteVerification || "").trim();
    const naverVerification = (config.naverSiteVerification || "").trim();

    let result = html;

    // Google Search Console 소유권 확인 메타 태그 동적 주입
    if (googleVerification) {
      const googleMetaTag = `<meta name="google-site-verification" content="${googleVerification}" />`;
      if (result.includes('name="google-site-verification"')) {
        result = result.replace(
          /<meta\s+name="google-site-verification"[^>]*>/,
          googleMetaTag
        );
      } else {
        result = result.replace("</head>", `  ${googleMetaTag}\n  </head>`);
      }
    }

    // 네이버 서치어드바이저 소유권 확인 메타 태그 동적 주입
    if (naverVerification) {
      const naverMetaTag = `<meta name="naver-site-verification" content="${naverVerification}" />`;
      if (result.includes('name="naver-site-verification"')) {
        result = result.replace(
          /<meta\s+name="naver-site-verification"[^>]*>/,
          naverMetaTag
        );
      } else {
        result = result.replace("</head>", `  ${naverMetaTag}\n  </head>`);
      }
    }

    // Bing Webmaster Tools 소유권 확인 메타 태그 동적 주입
    const bingVerification = (config.bingSiteVerification || "").trim();
    if (bingVerification) {
      const bingMetaTag = `<meta name="msvalidate.01" content="${bingVerification}" />`;
      if (result.includes('name="msvalidate.01"')) {
        result = result.replace(/<meta\s+name="msvalidate\.01"[^>]*>/, bingMetaTag);
      } else {
        result = result.replace("</head>", `  ${bingMetaTag}\n  </head>`);
      }
    }

    // 커스텀 검색사이트 소유권 확인 메타 태그 주입
    // customSearchSites: JSON 배열 [{ name, metaName, content }]
    const customSitesRaw = (config.customSearchSites || "").trim();
    if (customSitesRaw) {
      try {
        const customSites = JSON.parse(customSitesRaw);
        if (Array.isArray(customSites)) {
          for (const site of customSites) {
            const metaName = (site.metaName || "").trim();
            const content = (site.content || "").trim();
            if (!metaName || !content) continue;
            // XSS 방지: metaName에는 영문자/하이픈/점만 허용
            if (!/^[a-zA-Z0-9\-_.]+$/.test(metaName)) continue;
            const safeContent = content.replace(/"/g, '&quot;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
            const metaTag = `<meta name="${metaName}" content="${safeContent}" />`;
            const escapedName = metaName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
            const existingPattern = new RegExp(`<meta\\s+name="${escapedName}"[^>]*>`);
            if (existingPattern.test(result)) {
              result = result.replace(existingPattern, metaTag);
            } else {
              result = result.replace("</head>", `  ${metaTag}\n  </head>`);
            }
          }
        }
      } catch {
        // JSON 파싱 실패 시 조용히 무시
      }
    }

    // 헤더 공통 스크립트 주입
    // <script> 태그는 렌더 블로킹을 방지하기 위해 </body> 직전으로 이동
    // <meta>, <link> 등 비스크립트 태그는 </head> 직전에 유지
    if (headScripts.trim()) {
      // script 태그와 비스크립트 태그 분리
      const scriptTagRegex = /<script[\s\S]*?<\/script>/gi;
      const scriptTags: string[] = [];
      const nonScriptContent = headScripts.replace(scriptTagRegex, (match) => {
        scriptTags.push(match);
        return '';
      }).trim();

      // 비스크립트 태그(meta, link 등)는 </head> 직전에 삽입
      // headScripts의 naver-site-verification 태그는 기존 태그를 교체하지 않고 모두 추가
      // (여러 개의 naver 소유권 확인 코드를 동시에 지원)
      if (nonScriptContent) {
        // naver-site-verification 태그들을 추출
        const naverTagRegex = /<meta\s+name="naver-site-verification"[^>]*\/>/gi;
        const naverTagsInScript = nonScriptContent.match(naverTagRegex) || [];
        const nonNaverContent = nonScriptContent.replace(naverTagRegex, '').trim();

        // naver 태그가 아닌 나머지 태그들은 기존 방식으로 삽입
        if (nonNaverContent) {
          result = result.replace("</head>", `  ${nonNaverContent}\n  </head>`);
        }

        // naver 태그들은 중복 없이 모두 </head> 직전에 추가 (기존 태그 교체 안 함)
        for (const naverTag of naverTagsInScript) {
          const contentMatch = naverTag.match(/content="([^"]+)"/);
          const tagContent = contentMatch ? contentMatch[1] : '';
          // 이미 동일한 content의 naver 태그가 있으면 건너뜀
          if (tagContent && result.includes(`content="${tagContent}"`)) continue;
          result = result.replace("</head>", `  ${naverTag}\n  </head>`);
        }
      }

      // script 태그는 </body> 직전에 삽입 (렌더 블로킹 방지)
      // AdSense/Google 광고 스크립트는 requestIdleCallback으로 래핑하여 완전 지연 로드
      if (scriptTags.length > 0) {
        // AdSense 스크립트 감지 (pagead2.googlesyndication.com)
        const adSenseScripts: string[] = [];
        const otherScripts: string[] = [];
        for (const tag of scriptTags) {
          if (tag.includes('pagead2.googlesyndication.com') || tag.includes('adsbygoogle')) {
            adSenseScripts.push(tag);
          } else {
            otherScripts.push(tag);
          }
        }

        // 일반 스크립트는 body 끝에 직접 삽입
        if (otherScripts.length > 0) {
          result = result.replace("</body>", `  ${otherScripts.join('\n  ')}\n  </body>`);
        }

        // AdSense 스크립트는 requestIdleCallback으로 완전 지연 로드
        // index.html에 이미 동일한 스크립트가 있으면 중복 로드 방지
        if (adSenseScripts.length > 0) {
          // 이미 index.html에 AdSense requestIdleCallback이 있으면 headScripts의 중복 제거
          const hasExistingAdSense = result.includes('pagead2.googlesyndication.com');
          if (!hasExistingAdSense) {
            // index.html에 AdSense가 없는 경우만 삽입 (requestIdleCallback 래핑)
            const adSenseWrapped = `<script>\n(function() {\n  function loadAdSenseFromHeadScripts() {\n    ${adSenseScripts.join('\n    ')}\n  }\n  if ('requestIdleCallback' in window) {\n    requestIdleCallback(loadAdSenseFromHeadScripts, { timeout: 8000 });\n  } else {\n    window.addEventListener('load', function() { setTimeout(loadAdSenseFromHeadScripts, 4000); });\n  }\n})();\n</script>`;
            result = result.replace("</body>", `  ${adSenseWrapped}\n  </body>`);
          }
          // 이미 AdSense가 있으면 headScripts의 중복 스크립트는 삽입하지 않음
        }
      }
    }

    return result;
  } catch {
    return html;
  }
}

/** 메타 태그 데이터 구조 */
export interface MetaData {
  /** @deprecated 사용 안 함 - noscript H1 방식 제거됨 (애드센스 정책 위반) */
  homeH1?: string;
  title: string;
  description: string;
  ogType: "website" | "article";
  ogUrl: string;
  ogImage: string;
  ogImageWidth?: string;
  ogImageHeight?: string;
  canonical: string;
  articlePublishedTime?: string;
  articleModifiedTime?: string;
  articleAuthor?: string;
  articleSection?: string;
  /** @deprecated 사용 안 함 - noscript/display:none 방식 제거됨 (애드센스 정책 위반) */
  bodyContent?: string;
  /** 홈페이지 게시글 목록 HTML (크롤러가 JS 없이 읽을 수 있는 visible 콘텐츠) */
  homePostsHtml?: string;
  /** SEO 키워드 메타 태그 (글 태그 + 카테고리 기반 자동 생성) */
  keywords?: string;
  /** JSON-LD 구조화 데이터 (BlogPosting / WebSite / BreadcrumbList 스키마) — 크롤러가 JS 없이 읽도록 서버사이드 주입 */
  jsonLd?: Record<string, unknown> | Record<string, unknown>[];
  /** robots 메타 태그 값 (기본값: 'index, follow') — 내부 시스템 페이지에만 'noindex, follow' 사용 */
  robots?: string;
  /** HTTP 응답 상태 코드 오버라이드 (404 등) — 지정시 vite.ts가 해당 코드로 응답 */
  statusCode?: number;
  /** LCP 이미지 URL — 홈페이지 첫 번째 섹션 첫 번째 게시물 썸네일 (preload 태그 삽입용) */
  lcpImageUrl?: string;
  /** LCP 이미지 sizes 속성 (responsive preload 지원) */
  lcpImageSizes?: string;
  /** 홈페이지 첫 번째 섹션 초기 데이터 (window.__INITIAL_DATA__로 주입하여 tRPC 응답 대기 없이 즉시 렌더링) */
  initialData?: {
    firstSectionKey: string;
    firstSectionPosts: Array<{
      id: number;
      title: string;
      thumbnail: string | null;
      excerpt: string | null;
      categoryKey: string;
      slug: string | null;
      viewCount: number;
      likeCount: number;
      createdAt: Date;
    }>;
  };
}

/** HTML 이스케이프 (XSS 방지) */
function escapeHtml(str: string): string {
  return str
    .replace(/&/g, "&amp;")
    .replace(/"/g, "&quot;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

/** 절대 URL 변환 (상대 경로 → 절대 URL) */
function toAbsoluteUrl(url: string, siteUrl: string): string {
  if (!url) return "";
  if (url.startsWith("http://") || url.startsWith("https://")) return url;
  const base = siteUrl.replace(/\/$/, "");
  return `${base}${url.startsWith("/") ? url : `/${url}`}`;
}

/** 텍스트에서 HTML 태그 제거
 * <style>, <script> 블록 내용을 먼저 제거하여 CSS/JS 코드가 텍스트로 남지 않도록 처리
 */
function stripHtml(html: string): string {
  return html
    // 1) <style>...</style> 블록 전체 제거 (CSS 코드 크롤링 방지)
    .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, '')
    // 2) <script>...</script> 블록 전체 제거
    .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, '')
    // 3) HTML 주석 제거
    .replace(/<!--[\s\S]*?-->/g, '')
    // 4) 나머지 HTML 태그 제거
    .replace(/<[^>]*>/g, '')
    // 5) HTML 엔티티 디코딩 (기본적인 것만)
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&nbsp;/g, ' ')
    // 6) 연속 공백/줄바꿈 정리
    .replace(/\s+/g, ' ')
    .trim();
}

/** 설명 텍스트 160자 제한 */
function truncate(text: string, maxLen = 160): string {
  if (text.length <= maxLen) return text;
  return text.slice(0, maxLen - 3) + "...";
}

/**
 * 게시글 HTML 본문에서 첫 번째 의미있는 문단 텍스트를 추출합니다.
 * 우선순위: excerpt → 본문 첫 <p> 태그 → 첫 <li> 태그 → 전체 본문 앞부분
 * 추출된 텍스트는 HTML 태그 제거 후 160자로 자릅니다.
 */
function extractFirstParagraph(html: string, fallback: string, maxLen = 160): string {
  if (!html) return truncate(fallback, maxLen);

  // 1) <style>, <script> 블록 먼저 제거
  const cleaned = html
    .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, '')
    .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, '')
    .replace(/<!--[\s\S]*?-->/g, '');

  // 2) 첫 번째 <p> 태그 내용 추출 (최소 20자 이상인 것)
  const pRe = /<p(?:\s[^>]*)?>(.*?)<\/p>/gi;
  let pM: RegExpExecArray | null;
  while ((pM = pRe.exec(cleaned)) !== null) {
    const text = stripHtml(pM[1]).trim();
    if (text.length >= 20) return truncate(text, maxLen);
  }

  // 3) 첫 번째 <li> 태그 내용 추출 (최소 20자 이상인 것)
  const liRe = /<li(?:\s[^>]*)?>(.*?)<\/li>/gi;
  let liM: RegExpExecArray | null;
  while ((liM = liRe.exec(cleaned)) !== null) {
    const text = stripHtml(liM[1]).trim();
    if (text.length >= 20) return truncate(text, maxLen);
  }

  // 4) 전체 본문 앞부분 사용
  const fullText = stripHtml(cleaned);
  return truncate(fullText, maxLen);
}

/**
 * 이미지 크기 인메모리 캐시 (URL → {width, height})
 * 동일 이미지 URL에 대한 반복 네트워크 요청 방지 (TTFB 개선)
 * 최대 500개 항목, 24시간 TTL
 */
const imageSizeCache = new Map<string, { width: string; height: string; ts: number }>();
const IMAGE_SIZE_CACHE_MAX = 500;
const IMAGE_SIZE_CACHE_TTL = 24 * 60 * 60_000; // 24시간

/**
 * 이미지 URL에서 크기 정보를 읽어 { width, height } 반환.
 * 실패 시 기본값 { width: "1200", height: "630" } 반환.
 * 인메모리 캐시로 동일 URL 재요청 방지 (TTFB 개선)
 */
async function probeImageSize(url: string): Promise<{ width: string; height: string }> {
  const now = Date.now();
  const cached = imageSizeCache.get(url);
  if (cached && now - cached.ts < IMAGE_SIZE_CACHE_TTL) {
    return { width: cached.width, height: cached.height };
  }
  try {
    const result = await probe(url, { timeout: 5000 });
    if (result && result.width && result.height) {
      const entry = { width: String(result.width), height: String(result.height), ts: now };
      // LRU: 최대 크기 초과 시 가장 오래된 항목 제거
      if (imageSizeCache.size >= IMAGE_SIZE_CACHE_MAX) {
        const oldestKey = imageSizeCache.keys().next().value;
        if (oldestKey) imageSizeCache.delete(oldestKey);
      }
      imageSizeCache.set(url, entry);
      return { width: entry.width, height: entry.height };
    }
  } catch {
    // 이미지 크기 조회 실패 시 기본값 사용 (OG 이미지 표준 크기)
    // 실패한 URL도 짧은 TTL로 캐시하여 반복 요청 방지 (1분 후 재시도)
    imageSizeCache.set(url, { width: "1200", height: "630", ts: now - IMAGE_SIZE_CACHE_TTL + 60_000 });
  }
  return { width: "1200", height: "630" };
}

/**
 * 게시글 본문 HTML에서 FAQ 패턴을 파싱하여 FAQPage JSON-LD 스키마를 생성합니다.
 *
 * 지원 패턴:
 *   1) <h3>Q. 질문</h3> ... <p>답변</p> 또는 <h4>A. 답변</h4>
 *   2) <details><summary>질문</summary>답변</details>
 *
 * FAQ 항목이 2개 이상일 때만 FAQPage 스키마를 반환합니다.
 */
function parseFaqJsonLd(html: string): Record<string, unknown> | null {
  const items: Array<{ question: string; answer: string }> = [];

  // 패턴 1: <h3>Q. 질문</h3> 다음에 오는 텍스트를 답변으로 파싱
  // Q. 또는 Q: 또는 질문: 로 시작하는 h3 태그
  const h3QPattern = /<h[23][^>]*>\s*(?:Q[.:：]|질문[.:：])\s*([\s\S]*?)<\/h[23]>([\s\S]*?)(?=<h[123]|$)/gi;
  let h3Match;
  while ((h3Match = h3QPattern.exec(html)) !== null) {
    const question = stripHtml(h3Match[1]).trim();
    // 답변: 다음 h1/h2/h3 전까지의 텍스트 (p, h4 등에서 추출)
    const answerBlock = h3Match[2] || '';
    // A. 또는 A: 로 시작하는 h4 태그가 있으면 그것을 답변으로
    const h4AMatch = answerBlock.match(/<h4[^>]*>\s*(?:A[.:：]|답변[.:：])\s*([\s\S]*?)<\/h4>/i);
    let answer = '';
    if (h4AMatch) {
      answer = stripHtml(h4AMatch[1]).trim();
    } else {
      // 첫 번째 <p> 태그 내용을 답변으로
      const pMatch = answerBlock.match(/<p[^>]*>([\s\S]*?)<\/p>/i);
      if (pMatch) {
        answer = stripHtml(pMatch[1]).trim();
      }
    }
    if (question && answer) {
      items.push({ question, answer });
    }
  }

  // 패턴 2: <details><summary>질문</summary>답변</details>
  const detailsPattern = /<details[^>]*>\s*<summary[^>]*>([\s\S]*?)<\/summary>([\s\S]*?)<\/details>/gi;
  let detailsMatch;
  while ((detailsMatch = detailsPattern.exec(html)) !== null) {
    const question = stripHtml(detailsMatch[1]).trim();
    const answer = stripHtml(detailsMatch[2]).trim();
    if (question && answer) {
      items.push({ question, answer });
    }
  }

  if (items.length < 2) return null;

  return {
    "@context": "https://schema.org",
    "@type": "FAQPage",
    mainEntity: items.map(({ question, answer }) => ({
      "@type": "Question",
      name: question,
      acceptedAnswer: {
        "@type": "Answer",
        text: answer.slice(0, 1000), // 답변 1000자 제한
      },
    })),
  };
}

/**
 * URL 패턴에 따라 DB를 조회하고 MetaData를 반환합니다.
 */
export async function resolveMetaData(pathname: string): Promise<MetaData | null> {
  try {
    const config = await getSiteConfigAll();
    const siteUrl = (config.siteUrl || "https://www.vibecraftx.com").replace(/\/$/, "");
    const siteTitle = config.siteTitle || "Smart Auto Guide";
    const siteSubtitle = (config.siteSubtitle || "").trim();
    const siteDescription = config.siteDescription || "AI 앱 만들기, 바이브 코딩, AI 툴 추천 블로그";
    const defaultOgImage = toAbsoluteUrl("/manus-storage/og-image-512_6486f54d.webp", siteUrl);

    const fullUrl = `${siteUrl}${pathname}`;

    // /p/:slug — 게시물 상세 (slug 기반)
    const slugMatch = pathname.match(/^\/p\/([^/?#]+)/);
    if (slugMatch) {
      const slug = decodeURIComponent(slugMatch[1]);
      const post = await getPostBySlug(slug);
      if (post && post.published) {
        // excerpt가 있으면 우선 사용, 없으면 본문 첫 문단 추출
        const description = post.excerpt
          ? truncate(stripHtml(post.excerpt))
          : extractFirstParagraph(post.content || '', siteDescription);
        const ogImageRaw = post.thumbnail
          ? toAbsoluteUrl(post.thumbnail, siteUrl)
          : defaultOgImage;

        const bodyText = stripHtml(post.content || '').slice(0, 5000);
        // OG 이미지 크기 조회와 태그 조회를 병렬 실행 (TTFB 개선)
        const [{ width: ogImageWidth, height: ogImageHeight }, postTagsList] = await Promise.all([
          probeImageSize(ogImageRaw),
          getTagsByPost(post.id),
        ]);
        const keywordParts: string[] = [];
        if (postTagsList.length > 0) keywordParts.push(...postTagsList);
        if (post.tag) keywordParts.push(post.tag);
        if (post.category) keywordParts.push(post.category);
        keywordParts.push(siteTitle);
        const keywords = Array.from(new Set(keywordParts)).join(', ');

        // canonical URL 선제선언: customSlug 우선, 없으면 slug, 둘 다 없으면 fullUrl
        const canonicalSlug = (post as any).customSlug || post.slug;
        const canonicalUrl = canonicalSlug
          ? `${siteUrl}/p/${encodeURIComponent(canonicalSlug)}`
          : fullUrl;

        // JSON-LD BlogPosting 스키마 (크롤러가 JS 없이 읽도록 서버사이드 주입)
        const jsonLdBlogPosting: Record<string, unknown> = {
          "@context": "https://schema.org",
          "@type": "BlogPosting",
          headline: post.title,
          description: description,
          // articleBody: 크롤러가 본문을 구조화 데이터로 읽을 수 있도록 JSON-LD에 포함
          // (noscript/display:none 대신 이 방식이 애드센스 정책에 안전함)
          articleBody: bodyText.slice(0, 3000),
          url: canonicalUrl,
          datePublished: post.createdAt ? new Date(post.createdAt).toISOString() : undefined,
          dateModified: post.updatedAt ? new Date(post.updatedAt).toISOString() : undefined,
          author: {
            "@type": "Person",
            name: post.authorName || siteTitle,
            url: siteUrl,
          },
          publisher: {
            "@type": "Organization",
            name: siteTitle,
            logo: {
              "@type": "ImageObject",
              url: toAbsoluteUrl("/manus-storage/og-image-512_6486f54d.webp", siteUrl),
            },
          },
          ...(ogImageRaw ? {
            image: {
              "@type": "ImageObject",
              url: ogImageRaw,
              width: parseInt(ogImageWidth, 10),
              height: parseInt(ogImageHeight, 10),
            }
          } : {}),
          ...(post.category ? { articleSection: post.category } : {}),
          ...(keywords ? { keywords } : {}),
          mainEntityOfPage: {
            "@type": "WebPage",
            "@id": canonicalUrl,
          },
        };

        // BreadcrumbList 스키마: 홈 > 카테고리 > 글제목
        const breadcrumbItems: Record<string, unknown>[] = [
          { "@type": "ListItem", position: 1, name: "홈", item: siteUrl },
        ];
        if (post.category) {
          breadcrumbItems.push({
            "@type": "ListItem",
            position: 2,
            name: post.category,
            item: `${siteUrl}/category/${encodeURIComponent(post.category)}`,
          });
          breadcrumbItems.push({ "@type": "ListItem", position: 3, name: post.title, item: fullUrl });
        } else {
          breadcrumbItems.push({ "@type": "ListItem", position: 2, name: post.title, item: fullUrl });
        }
        const jsonLdBreadcrumb: Record<string, unknown> = {
          "@context": "https://schema.org",
          "@type": "BreadcrumbList",
          itemListElement: breadcrumbItems,
        };

        // FAQ JSON-LD: 본문에서 FAQ 패턴 파싱
        const jsonLdSchemas: Record<string, unknown>[] = [jsonLdBlogPosting, jsonLdBreadcrumb];
        const faqJsonLd = parseFaqJsonLd(post.content || '');
        if (faqJsonLd) {
          jsonLdSchemas.push(faqJsonLd);
        }

        return {
          title: `${escapeHtml(post.title)} | ${escapeHtml(siteTitle)}`,
          description: escapeHtml(description),
          ogType: "article",
          ogUrl: canonicalUrl,
          ogImage: ogImageRaw,
          ogImageWidth,
          ogImageHeight,
          canonical: canonicalUrl,
          articlePublishedTime: post.createdAt ? new Date(post.createdAt).toISOString() : undefined,
          articleModifiedTime: post.updatedAt ? new Date(post.updatedAt).toISOString() : undefined,
          articleAuthor: post.authorName || undefined,
          articleSection: post.category || undefined,
          bodyContent: bodyText,
          keywords: keywords || undefined,
          jsonLd: jsonLdSchemas,
        };
      }
      return null; // 게시물 없음 → 기본 처리
    }

    // /post/:id — 게시물 상세 (id 기반 구 URL)
    const idMatch = pathname.match(/^\/post\/(\d+)/);
    if (idMatch) {
      const id = parseInt(idMatch[1], 10);
      const post = await getPostById(id);
      if (post && post.published) {
        // excerpt가 있으면 우선 사용, 없으면 본문 첫 문단 추출
        const description = post.excerpt
          ? truncate(stripHtml(post.excerpt))
          : extractFirstParagraph(post.content || '', siteDescription);
        const ogImageRawId = post.thumbnail
          ? toAbsoluteUrl(post.thumbnail, siteUrl)
          : defaultOgImage;

        const bodyTextId = stripHtml(post.content || '').slice(0, 5000);
        // OG 이미지 크기 조회와 태그 조회를 병렬 실행 (TTFB 개선)
        const [{ width: ogImageWidthId, height: ogImageHeightId }, postTagsListId] = await Promise.all([
          probeImageSize(ogImageRawId),
          getTagsByPost(post.id),
        ]);
        const keywordPartsId: string[] = [];
        if (postTagsListId.length > 0) keywordPartsId.push(...postTagsListId);
        if (post.tag) keywordPartsId.push(post.tag);
        if (post.category) keywordPartsId.push(post.category);
        keywordPartsId.push(siteTitle);
        const keywordsId = Array.from(new Set(keywordPartsId)).join(', ');

        // canonical URL 선제선언 (id 기반 구 URL에서도 customSlug 우선 적용)
        const canonicalSlugId = (post as any).customSlug || post.slug;
        const canonicalUrlId = canonicalSlugId
          ? `${siteUrl}/p/${encodeURIComponent(canonicalSlugId)}`
          : fullUrl;

        // JSON-LD BlogPosting 스키마 (id 기반 구 URL)
        const jsonLdBlogPostingId: Record<string, unknown> = {
          "@context": "https://schema.org",
          "@type": "BlogPosting",
          headline: post.title,
          description: description,
          articleBody: bodyTextId.slice(0, 3000),
          url: canonicalUrlId,
          datePublished: post.createdAt ? new Date(post.createdAt).toISOString() : undefined,
          dateModified: post.updatedAt ? new Date(post.updatedAt).toISOString() : undefined,
          author: {
            "@type": "Person",
            name: post.authorName || siteTitle,
            url: siteUrl,
          },
          publisher: {
            "@type": "Organization",
            name: siteTitle,
            logo: {
              "@type": "ImageObject",
              url: toAbsoluteUrl("/manus-storage/og-image-512_6486f54d.webp", siteUrl),
            },
          },
          ...(ogImageRawId ? {
            image: {
              "@type": "ImageObject",
              url: ogImageRawId,
              width: parseInt(ogImageWidthId, 10),
              height: parseInt(ogImageHeightId, 10),
            }
          } : {}),
          ...(post.category ? { articleSection: post.category } : {}),
          ...(keywordsId ? { keywords: keywordsId } : {}),
          mainEntityOfPage: {
            "@type": "WebPage",
            "@id": canonicalUrlId,
          },
        };

        // BreadcrumbList 스키마 (id 기반 구 URL)
        const breadcrumbItemsId: Record<string, unknown>[] = [
          { "@type": "ListItem", position: 1, name: "홈", item: siteUrl },
        ];
        if (post.category) {
          breadcrumbItemsId.push({
            "@type": "ListItem",
            position: 2,
            name: post.category,
            item: `${siteUrl}/category/${encodeURIComponent(post.category)}`,
          });
          breadcrumbItemsId.push({ "@type": "ListItem", position: 3, name: post.title, item: fullUrl });
        } else {
          breadcrumbItemsId.push({ "@type": "ListItem", position: 2, name: post.title, item: fullUrl });
        }
        const jsonLdBreadcrumbId: Record<string, unknown> = {
          "@context": "https://schema.org",
          "@type": "BreadcrumbList",
          itemListElement: breadcrumbItemsId,
        };

        // FAQ JSON-LD: 본문에서 FAQ 패턴 파싱
        const jsonLdSchemasId: Record<string, unknown>[] = [jsonLdBlogPostingId, jsonLdBreadcrumbId];
        const faqJsonLdId = parseFaqJsonLd(post.content || '');
        if (faqJsonLdId) {
          jsonLdSchemasId.push(faqJsonLdId);
        }

        return {
          title: `${escapeHtml(post.title)} | ${escapeHtml(siteTitle)}`,
          description: escapeHtml(description),
          ogType: "article",
          ogUrl: canonicalUrlId,
          ogImage: ogImageRawId,
          ogImageWidth: ogImageWidthId,
          ogImageHeight: ogImageHeightId,
          canonical: canonicalUrlId,
          articlePublishedTime: post.createdAt ? new Date(post.createdAt).toISOString() : undefined,
          articleModifiedTime: post.updatedAt ? new Date(post.updatedAt).toISOString() : undefined,
          articleAuthor: post.authorName || undefined,
          articleSection: post.category || undefined,
          bodyContent: bodyTextId,
          keywords: keywordsId || undefined,
          jsonLd: jsonLdSchemasId,
        };
      }
      return null;
    }

    // /category/:key — 카테고리 목록
    const categoryMatch = pathname.match(/^\/category\/([^/?#]+)/);
    if (categoryMatch) {
      const key = decodeURIComponent(categoryMatch[1]);
      // __latest__ 등 내부 시스템 코드는 noindex 처리
      if (key === '__latest__' || key.startsWith('__')) {
        return {
          title: escapeHtml(siteTitle),
          description: escapeHtml(truncate(siteDescription)),
          ogType: 'website',
          ogUrl: fullUrl,
          ogImage: defaultOgImage,
          canonical: siteUrl, // canonical을 홈으로 지정
          robots: 'noindex, follow', // 내부 코드 페이지는 색인 제외
        };
      }
      // 이메일 형식 또는 특수문자만으로 구성된 카테고리 키 noindex 처리
      if (/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(key) || /^[$@%^*=<>|\\!~`]+$/.test(key)) {
        return {
          title: escapeHtml(siteTitle),
          description: escapeHtml(truncate(siteDescription)),
          ogType: 'website',
          ogUrl: fullUrl,
          ogImage: defaultOgImage,
          canonical: siteUrl,
          robots: 'noindex, nofollow',
        };
      }
      // 글이 0개인 카테고리 페이지 noindex 처리 (구글 애드센스 정책 준수)
      try {
        const categoryPosts = await getPostsByCategory(key, 1);
        if (!categoryPosts || categoryPosts.length === 0) {
          return {
            title: `${escapeHtml(key)} | ${escapeHtml(siteTitle)}`,
            description: escapeHtml(truncate(`${key} 카테고리의 글 목록 — ${siteDescription}`)),
            ogType: 'website',
            ogUrl: fullUrl,
            ogImage: defaultOgImage,
            canonical: fullUrl,
            robots: 'noindex, follow', // 글 0개 카테고리는 색인 제외
          };
        }
      } catch (_e) { /* DB 오류 시 기본 처리 (index 유지) */ }
      const categoryLabel = key;
      const jsonLdCollection = {
        "@context": "https://schema.org",
        "@type": "CollectionPage",
        name: `${categoryLabel} | ${siteTitle}`,
        description: `${categoryLabel} 카테고리의 글 목록 — ${siteDescription}`,
        url: fullUrl,
        isPartOf: {
          "@type": "WebSite",
          name: siteTitle,
          url: siteUrl,
        },
        breadcrumb: {
          "@type": "BreadcrumbList",
          itemListElement: [
            { "@type": "ListItem", position: 1, name: "홈", item: siteUrl },
            { "@type": "ListItem", position: 2, name: categoryLabel, item: fullUrl },
          ],
        },
      };
      return {
        title: `${escapeHtml(categoryLabel)} | ${escapeHtml(siteTitle)}`,
        description: escapeHtml(truncate(`${categoryLabel} 카테고리의 글 목록 — ${siteDescription}`)),
        ogType: "website",
        ogUrl: fullUrl,
        ogImage: defaultOgImage,
        canonical: fullUrl,
        jsonLd: jsonLdCollection,
      };
    }

    // /tag/:tag — 태그 목록
    const tagMatch = pathname.match(/^\/tag\/([^/?#]+)/);
    if (tagMatch) {
      const tag = decodeURIComponent(tagMatch[1]);
      // 이메일 형식 또는 특수문자만으로 구성된 태그 noindex 처리
      if (/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(tag) || /^[$@%^*=<>|\\!~`]+$/.test(tag) || tag.startsWith('#')) {
        return {
          title: escapeHtml(siteTitle),
          description: escapeHtml(truncate(siteDescription)),
          ogType: 'website',
          ogUrl: fullUrl,
          ogImage: defaultOgImage,
          canonical: siteUrl,
          robots: 'noindex, nofollow',
        };
      }
      // 글이 3개 미만인 태그 페이지는 noindex 처리 (애드센스 품질 개선)
      try {
        const tagPosts = await getPostsByTag(tag);
        if (!tagPosts || tagPosts.length < 3) {
          return {
            title: `페이지를 찾을 수 없습니다 | ${escapeHtml(siteTitle)}`,
            description: escapeHtml(truncate(siteDescription)),
            ogType: 'website',
            ogUrl: fullUrl,
            ogImage: defaultOgImage,
            canonical: siteUrl,
            robots: 'noindex, nofollow',
            statusCode: tagPosts && tagPosts.length > 0 ? 200 : 404, // 글 0개는 404, 1~2개는 noindex로 처리
          };
        }
      } catch (_e) { /* DB 오류 시 기본 처리 (index 유지) */ }
      const jsonLdTag = {
        "@context": "https://schema.org",
        "@type": "CollectionPage",
        name: `#${tag} | ${siteTitle}`,
        description: `'${tag}' 태그가 붙은 글 목록 — ${siteDescription}`,
        url: fullUrl,
        isPartOf: {
          "@type": "WebSite",
          name: siteTitle,
          url: siteUrl,
        },
        breadcrumb: {
          "@type": "BreadcrumbList",
          itemListElement: [
            { "@type": "ListItem", position: 1, name: "홈", item: siteUrl },
            { "@type": "ListItem", position: 2, name: `#${tag}`, item: fullUrl },
          ],
        },
      };
      return {
        title: `#${escapeHtml(tag)} | ${escapeHtml(siteTitle)}`,
        description: escapeHtml(truncate(`'${tag}' 태그가 붙은 글 목록 — ${siteDescription}`)),
        ogType: "website",
        ogUrl: fullUrl,
        ogImage: defaultOgImage,
        canonical: fullUrl,
        jsonLd: jsonLdTag,
      };
    }

    // / — 홈
    if (pathname === "/" || pathname === "") {
      // 최신 게시글 제목 목록을 bodyContent로 주입 (크롤러가 JS 없이 읽을 수 있는 텍스트 확보)
      let homeBodyContent = `${siteTitle}\n${siteDescription}\n\n`;
      // LCP 이미지 preload: 첫 번째 섹션 첫 번째 게시물 썸네일 URL 조회
      let lcpImageUrl: string | undefined;
      const lcpImageSizes = '(max-width: 640px) 100vw, (max-width: 1024px) 60vw, 600px';
      let initialData: MetaData['initialData'] | undefined;
      try {
        // 캐시된 홈 초기 데이터 사용 (30초 TTL) — DB 쿼리 직렬 실행 대신 병렬+캐시로 FCP 개선
        const homeData = await getHomeInitialDataCached();
        const { recentPosts, firstCategoryKey, firstSectionPosts } = homeData;
        if (recentPosts.length > 0) {
          homeBodyContent += recentPosts
            .map((p: { title: string; excerpt?: string | null }) => {
              const excerpt = p.excerpt ? ` - ${stripHtml(p.excerpt).slice(0, 100)}` : '';
              return `${p.title}${excerpt}`;
            })
            .join('\n');
        }
        if (firstSectionPosts.length > 0 && firstSectionPosts[0].thumbnail) {
          // 상대 URL 그대로 사용 (img src와 일치시켜야 preload가 유효함)
          lcpImageUrl = firstSectionPosts[0].thumbnail;
        }
        // window.__INITIAL_DATA__로 주입할 첫 번째 섹션 게시물 데이터
        initialData = {
          firstSectionKey: firstCategoryKey,
          firstSectionPosts: firstSectionPosts.slice(0, 5).map((p: any) => ({
            id: p.id,
            title: p.title,
            thumbnail: p.thumbnail ?? null,
            excerpt: p.excerpt ?? null,
            categoryKey: firstCategoryKey,
            slug: p.slug ?? null,
            viewCount: p.viewCount ?? 0,
            likeCount: p.likeCount ?? 0,
            createdAt: p.createdAt,
          })),
        };
      } catch { /* DB 오류 시 기본 텍스트만 사용 */ }

      // JSON-LD WebSite 스키마 (구글 Sitelinks 검색창 + 사이트 정보 구조화)
      const jsonLdWebSite: Record<string, unknown> = {
        "@context": "https://schema.org",
        "@type": "WebSite",
        name: siteTitle,
        url: siteUrl,
        description: siteDescription,
        potentialAction: {
          "@type": "SearchAction",
          target: {
            "@type": "EntryPoint",
            urlTemplate: `${siteUrl}/search?q={search_term_string}`,
          },
          "query-input": "required name=search_term_string",
        },
      };
      // JSON-LD Organization 스키마 (사이트 운영 주체 정보 — AI 인용 가능성 향상)
      const jsonLdOrganization: Record<string, unknown> = {
        "@context": "https://schema.org",
        "@type": "Organization",
        name: siteTitle,
        url: siteUrl,
        logo: {
          "@type": "ImageObject",
          url: defaultOgImage,
          width: 512,
          height: 512,
        },
        description: siteDescription,
        sameAs: [
          siteUrl,
        ],
      };
      // JSON-LD ItemList 스키마: 홈페이지 최신 게시글 목록을 구조화 데이터로 제공
      // (크롤러가 숨겨진 콘텐츠 없이도 게시글 목록을 인식할 수 있도록)
      const jsonLdSchemas: Record<string, unknown>[] = [jsonLdWebSite, jsonLdOrganization];
      const cachedHomeData = homeDataCache?.data;
      if (cachedHomeData && cachedHomeData.recentPosts.length > 0) {
        const jsonLdItemList: Record<string, unknown> = {
          "@context": "https://schema.org",
          "@type": "ItemList",
          name: `${siteTitle} 최신 게시글`,
          url: siteUrl,
          itemListElement: cachedHomeData.recentPosts.slice(0, 10).map((p: any, idx: number) => {
            const postSlug = (p as any).customSlug || p.slug;
            const postUrl = postSlug ? `${siteUrl}/p/${encodeURIComponent(postSlug)}` : siteUrl;
            return {
              "@type": "ListItem",
              position: idx + 1,
              name: p.title,
              url: postUrl,
            };
          }),
        };
        jsonLdSchemas.push(jsonLdItemList);
      }

      return {
        title: escapeHtml(siteSubtitle ? `${siteTitle} ${siteSubtitle}` : siteTitle),
        description: escapeHtml(truncate(siteDescription)),
        ogType: "website",
        ogUrl: siteUrl,
        ogImage: defaultOgImage,
        canonical: siteUrl,
        jsonLd: jsonLdSchemas,
        lcpImageUrl,
        lcpImageSizes,
        initialData,
      };
    }

    // 내부 관리 페이지 — noindex 처리 (구글 색인 방지)
    const noindexPaths = [
      '/write', '/admin', '/analytics', '/drafts', '/settings/api-keys',
    ];
    const isNoindexPath = noindexPaths.includes(pathname)
      || pathname.startsWith('/write/')
      || pathname.startsWith('/settings/');
    if (isNoindexPath) {
      return {
        title: escapeHtml(siteTitle),
        description: escapeHtml(truncate(siteDescription)),
        ogType: 'website',
        ogUrl: siteUrl,
        ogImage: defaultOgImage,
        canonical: siteUrl, // canonical을 홈으로 지정하여 중복 방지
        robots: 'noindex, nofollow',
      };
    }

    // 정적 공개 페이지 — 애드센스 심사관이 명확히 인식할 수 있도록 페이지별 title 지정
    const staticPageTitles: Record<string, string> = {
      "/privacy": `개인정보처리방침 | ${siteTitle}`,
      "/terms": `이용약관 | ${siteTitle}`,
      "/contact": `문의하기 | ${siteTitle}`,
      "/about": `소개 | ${siteTitle}`,
      "/advertise": `광고 문의 | ${siteTitle}`,
    };
    const staticPageDescs: Record<string, string> = {
      "/privacy": `${siteTitle}의 개인정보 수집 및 이용 방침에 대한 안내입니다.`,
      "/terms": `${siteTitle} 서비스 이용약관입니다.`,
      "/contact": `${siteTitle}에 문의하세요. 의견이나 제안을 환영합니다.`,
      "/about": `${siteTitle}에 대해 소개합니다.`,
      "/advertise": `${siteTitle}에 광고를 게재하세요. 광고 문의 및 협찬 안내입니다.`,
    };
    if (staticPageTitles[pathname]) {
      return {
        title: escapeHtml(staticPageTitles[pathname]),
        description: escapeHtml(staticPageDescs[pathname] || siteDescription),
        ogType: "website",
        ogUrl: fullUrl,
        ogImage: defaultOgImage,
        canonical: fullUrl,
      };
    }

    // 기타 페이지 — 기본 사이트 메타
    return {
      title: escapeHtml(siteTitle),
      description: escapeHtml(truncate(siteDescription)),
      ogType: "website",
      ogUrl: fullUrl,
      ogImage: defaultOgImage,
      canonical: fullUrl,
    };
  } catch (err) {
    console.error("[metaInjector] resolveMetaData error:", err);
    return null;
  }
}

/**
 * MetaData를 HTML <head> 태그 문자열로 변환합니다.
 */
export function buildMetaTags(meta: MetaData): string {
  const tags: string[] = [];

  // 기본 메타
  tags.push(`<title>${meta.title}</title>`);
  tags.push(`<meta name="description" content="${meta.description}" />`);
  tags.push(`<link rel="canonical" href="${meta.canonical}" />`);
  // SEO 키워드 메타 태그 (글 태그 + 카테고리 기반 자동 생성)
  if (meta.keywords) {
    tags.push(`<meta name="keywords" content="${escapeHtml(meta.keywords)}" />`);
  }

  // Open Graph
  tags.push(`<meta property="og:type" content="${meta.ogType}" />`);
  tags.push(`<meta property="og:url" content="${meta.ogUrl}" />`);
  tags.push(`<meta property="og:title" content="${meta.title}" />`);
  tags.push(`<meta property="og:description" content="${meta.description}" />`);
  if (meta.ogImage) {
    tags.push(`<meta property="og:image" content="${meta.ogImage}" />`);
    if (meta.ogImageWidth) tags.push(`<meta property="og:image:width" content="${meta.ogImageWidth}" />`);
    if (meta.ogImageHeight) tags.push(`<meta property="og:image:height" content="${meta.ogImageHeight}" />`);
  }

  // Twitter Card
  tags.push(`<meta name="twitter:card" content="summary_large_image" />`);
  tags.push(`<meta name="twitter:title" content="${meta.title}" />`);
  tags.push(`<meta name="twitter:description" content="${meta.description}" />`);
  if (meta.ogImage) {
    tags.push(`<meta name="twitter:image" content="${meta.ogImage}" />`);
  }

  // Article 전용 태그
  if (meta.ogType === "article") {
    if (meta.articlePublishedTime) {
      tags.push(`<meta property="article:published_time" content="${meta.articlePublishedTime}" />`);
    }
    if (meta.articleModifiedTime) {
      tags.push(`<meta property="article:modified_time" content="${meta.articleModifiedTime}" />`);
    }
    if (meta.articleAuthor) {
      tags.push(`<meta property="article:author" content="${escapeHtml(meta.articleAuthor)}" />`);
    }
    if (meta.articleSection) {
      tags.push(`<meta property="article:section" content="${escapeHtml(meta.articleSection)}" />`);
    }
  }

  return tags.join("\n    ");
}

/**
 * HTML 문자열에서 기존 동적 메타 태그를 제거하고 새 메타 태그를 주입합니다.
 * index.html의 기본 메타 태그를 서버에서 조회한 값으로 교체합니다.
 */
export function injectMetaTags(html: string, meta: MetaData): string {
  const newTags = buildMetaTags(meta);

  // <title> 교체
  let result = html.replace(/<title>[^<]*<\/title>/, `<title>${meta.title}</title>`);

  // <meta name="description"> 교체
  result = result.replace(
    /<meta\s+name="description"[^>]*>/,
    `<meta name="description" content="${meta.description}" />`
  );

  // <link rel="canonical"> 삽입 (기존 canonical이 있으면 교체, 없으면 </head> 앞에 삽입)
  // 정규식으로 </head> 앞 공백 포함 매칭하여 중복 방지
  if (/<link\s+rel="canonical"[^>]*>/.test(result)) {
    result = result.replace(
      /<link\s+rel="canonical"[^>]*>/,
      `<link rel="canonical" href="${meta.canonical}" />`
    );
  } else {
    result = result.replace(/\s*<\/head>/, `\n  <link rel="canonical" href="${meta.canonical}" />\n</head>`);
  }

  // og:title 교체
  result = result.replace(
    /<meta\s+property="og:title"[^>]*>/,
    `<meta property="og:title" content="${meta.title}" />`
  );

  // og:description 교체
  result = result.replace(
    /<meta\s+property="og:description"[^>]*>/,
    `<meta property="og:description" content="${meta.description}" />`
  );

  // og:url 교체
  result = result.replace(
    /<meta\s+property="og:url"[^>]*>/,
    `<meta property="og:url" content="${meta.ogUrl}" />`
  );

  // og:type 교체
  result = result.replace(
    /<meta\s+property="og:type"[^>]*>/,
    `<meta property="og:type" content="${meta.ogType}" />`
  );

  // og:image 교체
  if (meta.ogImage) {
    result = result.replace(
      /<meta\s+property="og:image"[^>]*>/,
      `<meta property="og:image" content="${meta.ogImage}" />`
    );
  }

  // twitter:title 교체
  result = result.replace(
    /<meta\s+name="twitter:title"[^>]*>/,
    `<meta name="twitter:title" content="${meta.title}" />`
  );

  // twitter:description 교체
  result = result.replace(
    /<meta\s+name="twitter:description"[^>]*>/,
    `<meta name="twitter:description" content="${meta.description}" />`
  );

  // twitter:image 교체
  if (meta.ogImage) {
    result = result.replace(
      /<meta\s+name="twitter:image"[^>]*>/,
      `<meta name="twitter:image" content="${meta.ogImage}" />`
    );
  }

  // robots 메타 태그 교체 (meta.robots가 있으면 교체, 없으면 기본값 'index, follow' 유지)
  if (meta.robots) {
    result = result.replace(
      /<meta\s+name="robots"[^>]*>/,
      `<meta name="robots" content="${meta.robots}" />`
    );
  }

  // article 전용 태그 + JSON-LD 구조화 데이터를 한 번에 </head> 직전에 주입
  // (여러 번 replace 시 </head> 위치가 바뀌어 canonical 중복 발생하는 것을 방지)
  const headInserts: string[] = [];

  if (meta.ogType === "article") {
    if (meta.articlePublishedTime) {
      headInserts.push(`  <meta property="article:published_time" content="${meta.articlePublishedTime}" />`);
    }
    if (meta.articleModifiedTime) {
      headInserts.push(`  <meta property="article:modified_time" content="${meta.articleModifiedTime}" />`);
    }
    if (meta.articleAuthor) {
      headInserts.push(`  <meta property="article:author" content="${escapeHtml(meta.articleAuthor)}" />`);
    }
    if (meta.articleSection) {
      headInserts.push(`  <meta property="article:section" content="${escapeHtml(meta.articleSection)}" />`);
    }
  }

  // og:image:width / og:image:height 주입 (article + website 모두 적용)
  if (meta.ogImage && meta.ogImageWidth && meta.ogImageHeight) {
    headInserts.push(`  <meta property="og:image:width" content="${meta.ogImageWidth}" />`);
    headInserts.push(`  <meta property="og:image:height" content="${meta.ogImageHeight}" />`);
  }

  if (meta.jsonLd) {
    const schemas = Array.isArray(meta.jsonLd) ? meta.jsonLd : [meta.jsonLd];
    schemas.forEach((schema) => {
      headInserts.push(`  <script type="application/ld+json">${JSON.stringify(schema)}</script>`);
    });
  }

  if (headInserts.length > 0) {
    result = result.replace(/\s*<\/head>/, `\n${headInserts.join('\n')}\n</head>`);
  }

  // LCP 이미지 preload 태그 삽입 (홈페이지 전용)
  // 브라우저가 HTML 파싱 시점에 LCP 이미지 URL을 인식하여 조기 다운로드 시작
  if (meta.lcpImageUrl) {
    const sizesAttr = meta.lcpImageSizes ? ` imagesizes="${meta.lcpImageSizes}"` : '';
    // 반응형 이미지(_1200w.webp 패턴)인 경우 imagesrcset 추가 (브라우저가 적절한 해상도 선택)
    let srcsetAttr = '';
    const responsiveMatch = meta.lcpImageUrl.match(/^(.+)_1200w\.webp$/);
    if (responsiveMatch) {
      const base = responsiveMatch[1];
      const srcset = `${base}_320w.webp 320w, ${base}_640w.webp 640w, ${base}_1200w.webp 1200w`;
      srcsetAttr = ` imagesrcset="${srcset}"`;
    } else if (meta.lcpImageUrl.startsWith('/manus-storage/') && !meta.lcpImageUrl.includes('?w=')) {
      // 기존 이미지 (/manus-storage/ 경로): ?w= 파라미터로 반응형 srcset 생성
      // storageProxy가 ?w= 파라미터를 지원하므로 preload에도 동일하게 적용
      const legacySrcset = `${meta.lcpImageUrl}?w=320 320w, ${meta.lcpImageUrl}?w=640 640w, ${meta.lcpImageUrl}?w=960 960w`;
      srcsetAttr = ` imagesrcset="${legacySrcset}"`;
    }
    const lcpPreloadTag = `  <link rel="preload" as="image" href="${meta.lcpImageUrl}" fetchpriority="high"${srcsetAttr}${sizesAttr} />`;
    // 주의: preload href는 img src와 정확히 일치해야 캐시 히트 발생
    // img srcSet의 첫 번째 URL이 아닌 img src와 동일한 URL을 href로 사용해야 함
    // </head> 바로 앞에 삽입 (가장 이른 시점에 다운로드 시작하도록)
    result = result.replace(/<\/head>/, `${lcpPreloadTag}\n</head>`);
  }
  // window.__INITIAL_DATA__ 주입: 홈페이지 첫 번째 섹션 게시물 데이터를 HTML에 직접 포함
  // 프론트엔드가 tRPC 응답 대기 없이 즉시 렌더링 가능 (네트워크 체인 2,777ms 제거)
  if (meta.initialData) {
    // XSS 방지: JSON.stringify는 안전하지만 </script> 태그 삽입 방지를 위해 이스케이프
    const safeJson = JSON.stringify(meta.initialData).replace(/<\/script>/gi, '<\\/script>');
    const initialDataScript = `<script>window.__INITIAL_DATA__=${safeJson};</script>`;
    result = result.replace('</body>', `${initialDataScript}\n</body>`);
  }
  // ⚠️ 숨겨진 콘텐츠 삽입 방식 완전 제거
  // 이전 방식(noscript+display:none, sr-only clip)은 구글 애드센스 정책 위반으로 제거됨
  // 크롤러 콘텐츠 인식은 아래 방식으로 충분함:
  //   1) <head>의 JSON-LD BlogPosting 스키마 (headline, description, articleBody)
  //   2) <meta name="description"> 태그
  //   3) window.__INITIAL_DATA__ 스크립트 (홈페이지 초기 데이터)
  return result;
}
