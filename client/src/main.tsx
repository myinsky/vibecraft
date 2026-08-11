import { trpc } from "@/lib/trpc";
import { UNAUTHED_ERR_MSG } from '@shared/const';
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { httpBatchLink, httpLink, splitLink, TRPCClientError } from "@trpc/client";
import { createRoot } from "react-dom/client";
import superjson from "superjson";
import App from "./App";
import { getLoginUrl } from "./const";
import "./index.css";

// 일시적 네트워크 오류 패턴 (재시도 가능한 오류 - 콘솔에 찍지 않음)
const TRANSIENT_ERROR_PATTERNS = ['Failed to fetch', 'NetworkError', 'Load failed', 'net::ERR', 'fetch failed'];

// 조용히 무시할 쿼리/뮤테이션 키 (analytics 백그라운드 작업)
const SILENT_KEYS = ['analytics', 'trackVisit', 'updateStats'];

function isTransientError(error: unknown): boolean {
  if (!(error instanceof Error)) return false;
  return TRANSIENT_ERROR_PATTERNS.some(p => error.message.includes(p));
}

function isSilentQueryKey(queryKey: unknown): boolean {
  if (!queryKey) return false;
  const keyStr = JSON.stringify(queryKey);
  return SILENT_KEYS.some(k => keyStr.includes(k));
}

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      // 공개 데이터는 5분 동안 신선한 상태로 간주 → 리페치 요청 감소
      staleTime: 5 * 60 * 1000,
      // 일시적 네트워크 오류는 1회 재시도, 그 외 오류는 재시도 안 함
      retry: (failureCount, error) => {
        if (failureCount >= 1) return false;
        return isTransientError(error);
      },
      retryDelay: 2000,
    },
  },
});

const redirectToLoginIfUnauthorized = (error: unknown, queryKey?: unknown) => {
  if (!(error instanceof TRPCClientError)) return;
  if (typeof window === "undefined") return;

  const isUnauthorized = error.message === UNAUTHED_ERR_MSG;
  if (!isUnauthorized) return;

  // analytics/background 쿼리는 리다이렉트 없이 조용히 무시
  if (queryKey && isSilentQueryKey(queryKey)) return;

  window.location.href = getLoginUrl(window.location.pathname);
};

queryClient.getQueryCache().subscribe(event => {
  if (event.type === "updated" && event.action.type === "error") {
    const error = event.query.state.error;
    redirectToLoginIfUnauthorized(error, event.query.queryKey);
    // analytics 백그라운드 쿼리 오류 또는 일시적 네트워크 오류는 콘솔에 찍지 않음
    const isSilent = isSilentQueryKey(event.query.queryKey) || isTransientError(error);
    if (!isSilent) {
      console.error("[API Query Error]", error);
    }
  }
});

function isSilentMutation(mutation: { options?: { mutationKey?: unknown } }): boolean {
  const key = mutation.options?.mutationKey;
  if (!key) return false;
  const keyStr = JSON.stringify(key);
  return SILENT_KEYS.some(k => keyStr.includes(k));
}

queryClient.getMutationCache().subscribe(event => {
  if (event.type === "updated" && event.action.type === "error") {
    const error = event.mutation.state.error;
    redirectToLoginIfUnauthorized(error);
    // analytics 백그라운드 작업 오류 또는 일시적 네트워크 오류는 콘솔에 찍지 않음
    const isSilent = isSilentMutation(event.mutation) || isTransientError(error);
    if (!isSilent) {
      console.error("[API Mutation Error]", error);
    }
  }
});

const fetchWithCredentials: typeof globalThis.fetch = (input, init) =>
  globalThis.fetch(input, { ...(init ?? {}), credentials: "include" });

const trpcClient = trpc.createClient({
  links: [
    // 게시글 본문 조회(getBySlug, posts.get)는 단독 요청 → batch 지연 없이 즉시 처리
    splitLink({
      condition: (op) => {
        const path = op.path;
        return path === "posts.getBySlug" || path === "posts.get";
      },
      true: httpLink({
        url: "/api/trpc",
        transformer: superjson,
        fetch: fetchWithCredentials,
      }),
      false: httpBatchLink({
        url: "/api/trpc",
        transformer: superjson,
        fetch: fetchWithCredentials,
      }),
    }),
  ],
});

// React 마운트 완료 시 로딩 스크린 페이드아웃
createRoot(document.getElementById("root")!).render(
  <trpc.Provider client={trpcClient} queryClient={queryClient}>
    <QueryClientProvider client={queryClient}>
      <App />
    </QueryClientProvider>
  </trpc.Provider>
);

// 로딩 스크린 제거: React가 마운트되고 #root에 콘텐츠가 렌더링되면 페이드아웃
requestAnimationFrame(() => {
  const el = document.getElementById('app-loading-screen');
  if (el) {
    el.style.opacity = '0';
    setTimeout(() => {
      el.style.display = 'none';
    }, 400);
  }
});
