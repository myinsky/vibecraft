/**
 * usePostPrefetch
 *
 * 게시글 카드에 마우스/포인터를 올렸을 때 PostDetail에서 필요한 쿼리를
 * 미리 prefetch하여 클릭 후 로딩 시간을 단축합니다.
 *
 * - slug가 있으면 posts.getBySlug 를 prefetch
 * - id만 있으면 posts.get 을 prefetch
 * - 추가로 getSidebarItems, getCategoryCommentSettings도 prefetch
 * - 이미 캐시에 있으면 (staleTime 이내) 네트워크 요청을 보내지 않습니다
 */

import { useCallback } from "react";
import { trpc } from "@/lib/trpc";

interface PrefetchTarget {
  id?: number | null;
  slug?: string | null;
  customSlug?: string | null;
}

const PREFETCH_STALE = 5 * 60 * 1000;   // 5분
const SIDEBAR_STALE  = 10 * 60 * 1000;  // 10분

export function usePostPrefetch() {
  const utils = trpc.useUtils();

  const prefetch = useCallback(
    (post: PrefetchTarget) => {
      const slug = post.customSlug || post.slug;

      // 1. 게시글 본문 prefetch
      if (slug) {
        utils.posts.getBySlug.prefetch(
          { slug },
          { staleTime: PREFETCH_STALE }
        );
      } else if (post.id && post.id > 0) {
        utils.posts.get.prefetch(
          { id: post.id },
          { staleTime: PREFETCH_STALE }
        );
      }

      // 2. PostDetail에서 필요한 공통 데이터 prefetch (캐시에 있으면 스킵)
      utils.admin.getSidebarItems.prefetch(
        undefined,
        { staleTime: SIDEBAR_STALE }
      );
      utils.admin.getCategoryCommentSettings.prefetch(
        undefined,
        { staleTime: SIDEBAR_STALE }
      );
    },
    [utils]
  );

  return prefetch;
}
