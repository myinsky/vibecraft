/**
 * 글 링크 URL 생성 유틸
 * - 커스텀 페이지: /page/:slug
 * - customSlug(직접 입력 SEO 슬러그)가 있으면 우선 사용 (/p/:customSlug)
 * - slug(자동 생성 슬러그)가 있으면 SEO URL (/p/:slug)
 * - 없으면 기본 URL (/post/:id)
 */
export function getPostUrl(post: {
  id: number;
  slug?: string | null;
  customSlug?: string | null;
  isCustomPage?: boolean;
  customPageSlug?: string;
}): string {
  if (post.isCustomPage && post.customPageSlug) {
    return `/page/${post.customPageSlug}`;
  }
  // customSlug(직접 입력) 우선
  if (post.customSlug) {
    return `/p/${post.customSlug}`;
  }
  if (post.slug) {
    return `/p/${post.slug}`;
  }
  return `/post/${post.id}`;
}
