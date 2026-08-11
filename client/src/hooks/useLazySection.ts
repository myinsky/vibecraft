/**
 * useLazySection
 *
 * IntersectionObserver를 이용해 뷰포트에 가까워질 때까지 섹션 렌더링을 지연시킵니다.
 * - rootMargin: 뷰포트 아래 200px 전에 미리 렌더링 시작 (사용자가 스크롤하기 전에 준비)
 * - 한 번 visible이 되면 다시 false로 돌아가지 않음 (언마운트 방지)
 * - SSR 환경(window 없음)에서는 즉시 true 반환
 *
 * @param rootMargin 뷰포트 기준 여유 거리 (기본 "200px")
 * @returns [ref, isVisible] — ref를 placeholder div에 붙이고, isVisible이 true일 때 실제 컴포넌트를 렌더링
 */
import { useEffect, useRef, useState } from "react";

export function useLazySection(rootMargin = "200px") {
  const ref = useRef<HTMLDivElement>(null);
  const [isVisible, setIsVisible] = useState(false);

  useEffect(() => {
    // SSR 또는 IntersectionObserver 미지원 환경에서는 즉시 표시
    if (typeof window === "undefined" || !("IntersectionObserver" in window)) {
      setIsVisible(true);
      return;
    }

    const el = ref.current;
    if (!el) return;

    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          setIsVisible(true);
          observer.disconnect(); // 한 번 보이면 더 이상 관찰 불필요
        }
      },
      { rootMargin }
    );

    observer.observe(el);
    return () => observer.disconnect();
  }, [rootMargin]);

  return [ref, isVisible] as const;
}
