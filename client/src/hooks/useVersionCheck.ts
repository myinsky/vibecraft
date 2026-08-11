import { useEffect, useRef } from "react";

/**
 * 주기적으로 /api/version을 폴링하여 새 배포(BUILD_HASH 변경)를 감지하면
 * 페이지를 자동으로 새로고침합니다.
 *
 * - 탭이 비활성화(hidden) 상태일 때는 폴링 중단
 * - 탭이 다시 활성화되면 즉시 1회 체크
 * - 개발 환경(dev-*)에서는 자동 새로고침 비활성화
 */
const POLL_INTERVAL_MS = 5 * 60 * 1000; // 5분마다 체크

export function useVersionCheck() {
  const initialHashRef = useRef<string | null>(null);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    let destroyed = false;

    async function fetchHash(): Promise<string | null> {
      try {
        const res = await fetch("/api/version", { cache: "no-store" });
        if (!res.ok) return null;
        const data = await res.json() as { hash: string };
        return data.hash ?? null;
      } catch {
        return null;
      }
    }

    async function checkVersion() {
      if (document.hidden) return; // 탭 비활성화 시 스킵

      const hash = await fetchHash();
      if (!hash || destroyed) return;

      // 개발 환경(dev-*)에서는 자동 새로고침 비활성화
      if (hash.startsWith("dev-")) return;

      if (initialHashRef.current === null) {
        // 최초 로드 시 해시 저장
        initialHashRef.current = hash;
        return;
      }

      if (hash !== initialHashRef.current) {
        // 해시 변경 감지 → 새 배포 → 강제 새로고침
        console.info("[VersionCheck] New deployment detected, reloading...");
        window.location.reload();
      }
    }

    // 초기 해시 수집 — requestIdleCallback으로 지연하여 초기 렌더링 차단 방지
    // 버전 체크는 비즈니스 크리티컬하지 않으므로 브라우저 유휴 시점에 처리
    let idleId: number | null = null;
    if (typeof requestIdleCallback !== 'undefined') {
      idleId = requestIdleCallback(() => { if (!destroyed) checkVersion(); }, { timeout: 10000 });
    } else {
      idleId = window.setTimeout(() => { if (!destroyed) checkVersion(); }, 3000);
    }

    // 주기적 폴링
    timerRef.current = setInterval(checkVersion, POLL_INTERVAL_MS);

    // 탭 활성화 시 즉시 체크
    const handleVisibilityChange = () => {
      if (!document.hidden) {
        checkVersion();
      }
    };
    document.addEventListener("visibilitychange", handleVisibilityChange);

    return () => {
      destroyed = true;
      if (timerRef.current) clearInterval(timerRef.current);
      document.removeEventListener("visibilitychange", handleVisibilityChange);
    };
  }, []);
}
