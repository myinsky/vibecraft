/**
 * useVisitTracker - 방문 기록 및 스크롤 깊이 추적 훅
 *
 * 사용법:
 *   - 모든 페이지: useVisitTracker()  → 방문 기록 + 체류시간
 *   - 게시물 페이지: useVisitTracker({ postId: 123 })  → 스크롤 깊이 추적 추가
 *
 * TBT 최적화: trackVisit API 호출을 requestIdleCallback으로 지연하여
 * 초기 렌더링 차단 없이 백그라운드에서 처리
 */
import { useEffect, useRef, useCallback } from "react";
import { useLocation } from "wouter";
import { trpc } from "@/lib/trpc";

function getOrCreateSessionId(): string {
  const KEY = "_vsid";
  let id = sessionStorage.getItem(KEY);
  if (!id) {
    id = Math.random().toString(36).slice(2) + Date.now().toString(36);
    sessionStorage.setItem(KEY, id);
  }
  return id;
}

export function useVisitTracker(options?: { postId?: number }) {
  const [location] = useLocation();
  const sessionId = useRef(getOrCreateSessionId());
  const startTime = useRef(Date.now());
  const maxScrollDepth = useRef(0);
  const tracked = useRef(false);

  // analytics 는 백그라운드 작업이므로 오류 시 콘솔 에러 없이 조용히 무시
  const trackVisit = trpc.analytics.trackVisit.useMutation({
    onError: () => {}, // 조용히 무시 (504, 네트워크 오류 등)
  });
  const updateStats = trpc.analytics.updateStats.useMutation({
    onError: () => {}, // 조용히 무시 (504, 네트워크 오류 등)
  });

  // stale closure 방지: ref로 최신 mutate 함수 참조 유지
  const updateStatsMutateRef = useRef(updateStats.mutate);
  updateStatsMutateRef.current = updateStats.mutate;

  const trackVisitMutateRef = useRef(trackVisit.mutate);
  trackVisitMutateRef.current = trackVisit.mutate;

  // 스크롤 깊이 계산
  const handleScroll = useCallback(() => {
    const el = document.documentElement;
    const scrolled = el.scrollTop + el.clientHeight;
    const total = el.scrollHeight;
    if (total <= 0) return;
    const depth = Math.round((scrolled / total) * 100);
    if (depth > maxScrollDepth.current) {
      maxScrollDepth.current = Math.min(depth, 100);
    }
  }, []);

  // 체류시간 + 스크롤 깊이 저장 (ref 사용으로 stale closure 방지)
  const flush = useCallback(() => {
    try {
      const duration = Math.round((Date.now() - startTime.current) / 1000);
      updateStatsMutateRef.current({
        sessionId: sessionId.current,
        path: location,
        duration,
        scrollDepth: maxScrollDepth.current,
        postId: options?.postId,
      });
    } catch {
      // 렌더링 외부에서 호출될 수 있으므로 예외를 조용히 무시
    }
  }, [location, options?.postId]);

  useEffect(() => {
    // 방문 기록 (페이지당 1회) — requestIdleCallback으로 지연하여 TBT 개선
    // 분석 데이터는 비즈니스 크리티컬하지 않으므로 브라우저 유휴 시점에 처리
    if (!tracked.current) {
      tracked.current = true;
      const doTrack = () => {
        try {
          trackVisitMutateRef.current({
            sessionId: sessionId.current,
            path: location,
            postId: options?.postId,
          });
        } catch {
          // 조용히 무시
        }
      };

      if (typeof requestIdleCallback !== "undefined") {
        requestIdleCallback(doTrack, { timeout: 5000 });
      } else {
        // Safari 등 미지원: 1초 지연
        setTimeout(doTrack, 1000);
      }
    }

    // 스크롤 이벤트 등록
    window.addEventListener("scroll", handleScroll, { passive: true });

    // 페이지 이탈 시 체류시간 저장
    const handleVisibilityChange = () => {
      if (document.visibilityState === "hidden") flush();
    };
    document.addEventListener("visibilitychange", handleVisibilityChange);

    // 주기적 저장 (30초마다)
    const interval = setInterval(flush, 30_000);

    return () => {
      window.removeEventListener("scroll", handleScroll);
      document.removeEventListener("visibilitychange", handleVisibilityChange);
      clearInterval(interval);
      flush(); // 언마운트 시 최종 저장
    };
  }, [location, options?.postId]);
}
