import { Toaster } from "@/components/ui/sonner";

// Google Analytics gtag 전역 함수 타입 선언
declare global {
  interface Window {
    gtag?: (...args: unknown[]) => void;
    dataLayer?: unknown[];
  }
}
import { TooltipProvider } from "@/components/ui/tooltip";
import NotFound from "@/pages/NotFound";
import { Route, Switch, useLocation } from "wouter";
import { useEffect, useRef, lazy, Suspense } from "react";
import ErrorBoundary from "./components/ErrorBoundary";
import { ThemeProvider } from "./contexts/ThemeContext";
import { trpc } from "@/lib/trpc";
const ScrollToTop = lazy(() => import("@/components/ScrollToTop"));
const CookieConsent = lazy(() => import("@/components/CookieConsent"));
import { useVisitTracker } from "@/hooks/useVisitTracker";
import { useVersionCheck } from "@/hooks/useVersionCheck";
import { SiteConfigProvider, useSiteConfig } from "@/contexts/SiteConfigContext";

// 지연 로드 — 방문자 핵심 경로 (코드 스플리팅으로 초기 번들 최소화)
const Home = lazy(() => import("./pages/Home"));
const CategoryPage = lazy(() => import("./pages/CategoryPage"));
const PostDetail = lazy(() => import("./pages/PostDetail"));
const TagPage = lazy(() => import("./pages/TagPage"));
const CustomPageView = lazy(() => import("./pages/CustomPageView"));
const LegalPage = lazy(() => import("./pages/LegalPage"));
const ContactPage = lazy(() => import("./pages/ContactPage"));
const AdvertisePage = lazy(() => import("./pages/AdvertisePage"));
const AboutPage = lazy(() => import("./pages/AboutPage"));

// 지연 로드 (로그인 사용자 전용 / 무거운 에디터 포함)
const WritePage = lazy(() => import("./pages/WritePage"));
const ApiKeysPage = lazy(() => import("./pages/ApiKeysPage"));
const DraftsPage = lazy(() => import("./pages/DraftsPage"));
const AdminPage = lazy(() => import("./pages/AdminPage"));
const AnalyticsPage = lazy(() => import("./pages/AnalyticsPage"));

// 지연 로드 (항상 표시되지만 초기 렌더에 불필요)
const TermsAgreementModal = lazy(() => import("@/components/TermsAgreementModal"));
const UsernameSetupModal = lazy(() => import("@/components/UsernameSetupModal"));
const SiteChatbot = lazy(() => import("@/components/SiteChatbot"));
const SearchPage = lazy(() => import("./pages/SearchPage"));
const SubmitAppPage = lazy(() => import("./pages/SubmitAppPage"));
const MyProfilePage = lazy(() => import("./pages/MyProfilePage"));

// 페이지 전환 시 최소한의 로딩 표시
function PageFallback() {
  return (
    <div style={{ minHeight: "100vh", background: "#ffffff" }} />
  );
}

/**
 * DB의 siteConfig.headScripts를 불러와 document.head에 동적으로 삽입합니다.
 * 애드센스 로더 스크립트, Google Analytics, 네이버 서치 콘솔 등을 지원합니다.
 */
// getSiteConfig 공유 옵션: 5분 staleTime으로 불필요한 재요청 방지 (TBT 개선)
const SITE_CONFIG_QUERY_OPTS = { staleTime: 5 * 60 * 1000, refetchOnWindowFocus: false } as const;

function useGoogleAnalytics() {
  const { siteConfig: config } = useSiteConfig();

  useEffect(() => {
    const gaId = config?.["googleAnalyticsId"];
    if (!gaId || !gaId.trim() || !gaId.startsWith("G-")) return;

    // 이미 같은 GA ID로 삽입된 스크립트가 있으면 중복 삽입 방지
    const existing = document.head.querySelector(`[data-ga-id="${gaId}"]`);
    if (existing) return;

    // 이전 GA 스크립트 제거 (ID가 바뀐 경우)
    document.head.querySelectorAll("[data-manus-ga]").forEach(el => el.remove());

    // GA 스크립트를 requestIdleCallback으로 완전 지연 로드 (LCP/FCP 개선)
    // 브라우저가 유휴 상태일 때 로드하여 초기 렌더링 차단 방지
    const loadGA = () => {
      // 이미 삽입된 경우 중복 방지 (idle callback 중 재확인)
      if (document.head.querySelector(`[data-ga-id="${gaId}"]`)) return;

      // gtag.js 로더 스크립트
      const loaderScript = document.createElement("script");
      loaderScript.async = true;
      loaderScript.src = `https://www.googletagmanager.com/gtag/js?id=${gaId}`;
      loaderScript.setAttribute("data-manus-ga", "true");
      loaderScript.setAttribute("data-ga-id", gaId);
      document.head.appendChild(loaderScript);

      // gtag 초기화 인라인 스크립트
      const initScript = document.createElement("script");
      initScript.setAttribute("data-manus-ga", "true");
      initScript.setAttribute("data-ga-id", gaId);
      initScript.textContent = [
        "window.dataLayer = window.dataLayer || [];",
        "function gtag(){dataLayer.push(arguments);}",
        "gtag('js', new Date());",
        `gtag('config', '${gaId}');`,
      ].join("\n");
      document.head.appendChild(initScript);
    };

    // requestIdleCallback 지원 여부에 따라 분기
    // timeout: 5000ms — 5초 후에는 강제 실행 (분석 누락 방지)
    let idleId: number | null = null;
    const hasIdleCallback = 'requestIdleCallback' in window;
    if (hasIdleCallback) {
      idleId = (window as Window & { requestIdleCallback: (cb: () => void, opts?: { timeout: number }) => number }).requestIdleCallback(loadGA, { timeout: 5000 });
    } else {
      // Safari 등 미지원 브라우저: setTimeout으로 폴백
      idleId = window.setTimeout(loadGA, 3000);
    }

    return () => {
      if (idleId !== null) {
        if (hasIdleCallback) {
          (window as Window & { cancelIdleCallback: (id: number) => void }).cancelIdleCallback(idleId);
        } else {
          window.clearTimeout(idleId);
        }
      }
      document.head.querySelectorAll("[data-manus-ga]").forEach(el => el.remove());
    };
  }, [config?.["googleAnalyticsId"]]);
}

function useHeadScripts() {
  const { siteConfig: config } = useSiteConfig();

  useEffect(() => {
    const headScripts = config?.["headScripts"];
    if (!headScripts || !headScripts.trim()) return;

    // 이전에 삽입한 스크립트 제거
    const prev = document.head.querySelectorAll("[data-manus-head-scripts]");
    prev.forEach(el => el.remove());

    // HTML 파싱 후 삽입
    const wrapper = document.createElement("div");
    wrapper.innerHTML = headScripts;

    Array.from(wrapper.childNodes).forEach(node => {
      if (node.nodeType === Node.ELEMENT_NODE) {
        const el = node as Element;
        if (el.tagName === "SCRIPT") {
          // script 태그는 innerHTML 삽입으로는 실행되지 않으므로 createElement로 생성
          const script = document.createElement("script");
          script.setAttribute("data-manus-head-scripts", "true");
          Array.from(el.attributes).forEach(attr => {
            if (attr.name !== "data-manus-head-scripts") {
              script.setAttribute(attr.name, attr.value);
            }
          });
          if (el.textContent) script.textContent = el.textContent;
          document.head.appendChild(script);
        } else {
          (el as HTMLElement).setAttribute("data-manus-head-scripts", "true");
          document.head.appendChild(el.cloneNode(true));
        }
      }
    });

    return () => {
      document.head.querySelectorAll("[data-manus-head-scripts]").forEach(el => el.remove());
    };
  }, [config]);
}

function Router() {
  // make sure to consider if you need authentication for certain routes
  return (
    <Switch>
      <Route path={"/"}>{() => <Suspense fallback={<PageFallback />}><Home /></Suspense>}</Route>
      <Route path={"/post/:id"}>{() => <Suspense fallback={<PageFallback />}><PostDetail /></Suspense>}</Route>
      <Route path={"/p/:slug"}>{(params) => <Suspense fallback={<PageFallback />}><PostDetail slug={(params as any).slug} /></Suspense>}</Route>
      <Route path={"/category/:key"}>
        {(params) => <Suspense fallback={<PageFallback />}><CategoryPage categoryKey={(params as any).key || "latest"} /></Suspense>}
      </Route>
      <Route path={"/write"}>
        {() => (
          <Suspense fallback={<PageFallback />}>
            <WritePage />
          </Suspense>
        )}
      </Route>
      <Route path={"/write/edit/:id"}>
        {() => (
          <Suspense fallback={<PageFallback />}>
            <WritePage />
          </Suspense>
        )}
      </Route>
      <Route path={"/write/:category"}>
        {() => (
          <Suspense fallback={<PageFallback />}>
            <WritePage />
          </Suspense>
        )}
      </Route>
      <Route path={"/settings/api-keys"}>
        {() => (
          <Suspense fallback={<PageFallback />}>
            <ApiKeysPage />
          </Suspense>
        )}
      </Route>
      <Route path={"/drafts"}>
        {() => (
          <Suspense fallback={<PageFallback />}>
            <DraftsPage />
          </Suspense>
        )}
      </Route>
      <Route path={"/admin"}>
        {() => (
          <Suspense fallback={<PageFallback />}>
            <AdminPage />
          </Suspense>
        )}
      </Route>
      <Route path={"/analytics"}>
        {() => (
          <Suspense fallback={<PageFallback />}>
            <AnalyticsPage />
          </Suspense>
        )}
      </Route>
      <Route path={"/privacy"}>{() => <Suspense fallback={<PageFallback />}><LegalPage slug="privacy" /></Suspense>}</Route>
      <Route path={"/terms"}>{() => <Suspense fallback={<PageFallback />}><LegalPage slug="terms" /></Suspense>}</Route>
      <Route path={"/contact"}>{() => <Suspense fallback={<PageFallback />}><ContactPage /></Suspense>}</Route>
      <Route path={"/advertise"}>{() => <Suspense fallback={<PageFallback />}><AdvertisePage /></Suspense>}</Route>
      <Route path={"/about"}>{() => <Suspense fallback={<PageFallback />}><AboutPage /></Suspense>}</Route>
      <Route path={"/search"}>{() => <Suspense fallback={<PageFallback />}><SearchPage /></Suspense>}</Route>
      <Route path={"/submit-app"}>{() => <Suspense fallback={<PageFallback />}><SubmitAppPage /></Suspense>}</Route>
      <Route path={"/my-profile"}>{() => <Suspense fallback={<PageFallback />}><MyProfilePage /></Suspense>}</Route>
      <Route path={"/page/:slug"}>
        {(params) => <Suspense fallback={<PageFallback />}><CustomPageView /></Suspense>}
      </Route>
      <Route path={"/tag/:tag"}>
        {(params) => <Suspense fallback={<PageFallback />}><TagPage tag={(params as any).tag || ""} /></Suspense>}
      </Route>
      <Route path={"/404"} component={NotFound} />
      <Route component={NotFound} />
    </Switch>
  );
}

/**
 * SPA 라우트 변경 시 window.__prevPath에 이전 경로를 저장합니다.
 * WritePage의 뒤로가기 버튼에서 사용합니다.
 */
function usePrevPathTracker() {
  const [location] = useLocation();
  const prevRef = useRef<string>('/');
  useEffect(() => {
    // 현재 경로가 /write로 시작하지 않을 때만 이전 경로로 저장
    if (!location.startsWith('/write')) {
      (window as any).__prevPath = location;
      prevRef.current = location;
    }
  }, [location]);
}

/**
 * SPA 라우트 변경 시 GA page_view 이벤트를 전송합니다.
 * GA ID가 설정된 경우에만 동작합니다.
 */
function useGaPageView() {
  const [location] = useLocation();
  const prevLocationRef = useRef<string | null>(null);
    const { siteConfig: config } = useSiteConfig();
  useEffect(() => {
    const gaId = config?.["googleAnalyticsId"];
    if (!gaId || !gaId.trim() || !gaId.startsWith("G-")) return;
    if (typeof window.gtag !== "function") return;
    // 최초 로드는 gtag('config') 초기화 시 자동 전송되므로 중복 방지
    if (prevLocationRef.current === null) {
      prevLocationRef.current = location;
      return;
    }
    if (prevLocationRef.current === location) return;
    prevLocationRef.current = location;
    window.gtag("event", "page_view", {
      page_path: location,
      page_location: window.location.href,
      page_title: document.title,
    });
  }, [location, config?.["googleAnalyticsId"]]);
}

function AppInner() {
  useHeadScripts();
  useGoogleAnalytics();
  useGaPageView(); // GA SPA 페이지뷰 추적 (라우트 변경 시)
  usePrevPathTracker(); // 뒤로가기용 이전 경로 추적
  useVisitTracker(); // 방문자 추적 (모든 페이지)
  useVersionCheck(); // 새 배포 감지 → 자동 새로고침 (청크 불일치 방지)

  // PostDetail 번들을 유휴 시간에 미리 로드 (첫 게시글 클릭 시 번들 다운로드 지연 제거)
  useEffect(() => {
    const preload = () => import("./pages/PostDetail");
    if ('requestIdleCallback' in window) {
      const id = (window as any).requestIdleCallback(preload, { timeout: 3000 });
      return () => (window as any).cancelIdleCallback(id);
    } else {
      const t = setTimeout(preload, 2000);
      return () => clearTimeout(t);
    }
  }, []);

  return (
    <>
      <Toaster position="top-right" richColors closeButton />
      <Router />
      <Suspense fallback={null}>
        <TermsAgreementModal />
      </Suspense>
      <Suspense fallback={null}>
        <UsernameSetupModal />
      </Suspense>
      {/* AI 질문 버튼 숨김 처리 - 필요 시 false를 true로 변경하세요 */}
      {false && (
        <Suspense fallback={null}>
          <SiteChatbot />
        </Suspense>
      )}
      <Suspense fallback={null}><ScrollToTop /></Suspense>
      <Suspense fallback={null}><CookieConsent /></Suspense>
    </>
  );
}

function App() {
  return (
    <ErrorBoundary>
      <ThemeProvider defaultTheme="light">
        <TooltipProvider>
          <SiteConfigProvider>
            <AppInner />
          </SiteConfigProvider>
        </TooltipProvider>
      </ThemeProvider>
    </ErrorBoundary>
  );
}

export default App;
