/**
 * CustomPageView - 커스텀 페이지 공개 렌더러
 * /page/:slug 경로로 접근 시 해당 페이지의 섹션을 렌더링
 */
import { useState, useEffect, useRef } from "react";
import { toast } from "sonner";
import { useParams, useSearch } from "wouter";
import { trpc } from "@/lib/trpc";
import { useAuth } from "@/_core/hooks/useAuth";
import { getLoginUrl } from "@/const";
import Header from "@/components/Header";
import Footer from "@/components/Footer";
import { getPostUrl } from "@/lib/postUrl";
import { useSEO } from "@/hooks/useSEO";
import { useJsonLd } from "@/hooks/useJsonLd";

// ─── 섹션 타입 ─────────────────────────────────────────────────────────────────
interface PageSection {
  id: string;
  type: "text" | "image" | "button" | "divider" | "html" | "hero" | "columns" | "vibe-apps" | "featured-developers";
  content: string;
  settings: {
    bgColor?: string;
    textAlign?: "left" | "center" | "right";
    padding?: "sm" | "md" | "lg";
    imageUrl?: string;
    imageAlt?: string;
    buttonText?: string;
    buttonUrl?: string;
    buttonStyle?: "primary" | "outline" | "ghost";
    columns?: string[];
    heroTitle?: string;
    heroSubtitle?: string;
    heroButtonText?: string;
    heroButtonUrl?: string;
    isAppMode?: boolean;  // HTML 섹션: JS 실행 앱 모드
    embedMode?: "html" | "url";  // HTML 소스 vs URL 임베드
    embedUrl?: string;  // URL 임베드 모드일 때 외부 URL
  };
}

const PADDING_MAP = { sm: "20px 24px", md: "40px 24px", lg: "70px 24px" };

/**
 * 관리자 전용 요소를 숨기는 CSS를 HTML에 주입한다.
 * data-admin-only 속성 또는 id="openSettings" 요소를 비관리자에게 숨긴다.
 */
function injectAdminHideStyle(html: string): string {
  const adminHideCss = `
<style id="__admin-hide-style">
  /* 관리자 전용 요소 - 비관리자에게 숨김 */
  #openSettings,
  [data-admin-only] {
    display: none !important;
    visibility: hidden !important;
    pointer-events: none !important;
  }
</style>`;

  // <head> 태그 안에 삽입 (있는 경우)
  if (/<\/head>/i.test(html)) {
    return html.replace(/<\/head>/i, `${adminHideCss}\n</head>`);
  }
  // <html> 태그 뒤에 삽입 (있는 경우)
  if (/<html[^>]*>/i.test(html)) {
    return html.replace(/<html[^>]*>/i, (match) => `${match}\n${adminHideCss}`);
  }
  // 그 외: 맨 앞에 삽입
  return adminHideCss + "\n" + html;
}

// ─── AES-256-GCM 복호화 (Web Crypto API) ─────────────────────────────────────
async function decryptHtml(encrypted: string, keyB64: string, ivB64: string, tagB64: string): Promise<string> {
  const b64ToBytes = (b64: string) => Uint8Array.from(atob(b64), c => c.charCodeAt(0));
  const keyBytes = b64ToBytes(keyB64);
  const iv = b64ToBytes(ivB64);
  const tag = b64ToBytes(tagB64);
  const encBytes = b64ToBytes(encrypted);
  // AES-GCM: ciphertext + tag를 합쳐서 decrypt
  const combined = new Uint8Array(encBytes.length + tag.length);
  combined.set(encBytes);
  combined.set(tag, encBytes.length);
  const cryptoKey = await crypto.subtle.importKey("raw", keyBytes, { name: "AES-GCM" }, false, ["decrypt"]);
  const decrypted = await crypto.subtle.decrypt({ name: "AES-GCM", iv }, cryptoKey, combined);
  return new TextDecoder().decode(decrypted);
}

// ─── HTML 앱 섹션 렌더러 (전체화면 지원) ───────────────────────────────────────
function HtmlAppSection({ section, fullWidth, isAdmin, user, pageId, contentWidth = 960, fullscreenDefault = false }: { section: PageSection; fullWidth: boolean; isAdmin: boolean; user: any; pageId: number; contentWidth?: number; fullscreenDefault?: boolean }) {
  const [isFullscreen, setIsFullscreen] = useState(fullscreenDefault);
  const iframeRef = useRef<HTMLIFrameElement>(null);
  const fsIframeRef = useRef<HTMLIFrameElement>(null);
  const maxHRef = useRef(600); // 최대 높이 추적 (줄어들지 않도록 보호)
  const bg = section.settings.bgColor || "#ffffff";
  const padding = PADDING_MAP[section.settings.padding || "md"];
  const [htmlContent, setHtmlContent] = useState<string | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);

  // 로그인 사용자의 앱 등록 여부 확인
  const { data: mySubmissions } = trpc.apps.mySubmissions.useQuery(undefined, {
    enabled: !!user,
    retry: false,
    refetchOnWindowFocus: false,
  });
  const hasRegisteredApp = !!(mySubmissions && mySubmissions.length > 0);

  // 마운트 시: 토큰 발급 → 암호화 데이터 수신 → 복호화
  useEffect(() => {
    let cancelled = false;
    // 토큰 발급 → HTML 수신 → 복호화 (최대 2회 재시도: 토큰 만료/경쟁 조건 대응)
    async function loadHtml(retryCount = 0): Promise<void> {
      try {
        // 1단계: 일회성 토큰 발급
        const tokenRes = await fetch(`/api/page-html-token/${pageId}/${section.id}`, { credentials: "include" });
        if (!tokenRes.ok) {
          const err = await tokenRes.json().catch(() => ({ error: tokenRes.statusText }));
          if (!cancelled) setLoadError(err.error || "로드 실패");
          return;
        }
        const { token } = await tokenRes.json();
        // 2단계: 암호화된 HTML 수신
        const htmlRes = await fetch(`/api/page-html/${pageId}/${section.id}?token=${token}`, { credentials: "include" });
        if (!htmlRes.ok) {
          const err = await htmlRes.json().catch(() => ({ error: htmlRes.statusText }));
          // 토큰 만료/무효 오류 시 1회 자동 재시도
          if (htmlRes.status === 403 && retryCount < 1) {
            if (!cancelled) return loadHtml(retryCount + 1);
          }
          if (!cancelled) setLoadError(err.error || "로드 실패");
          return;
        }
        if (htmlRes.status === 204) {
          if (!cancelled) setHtmlContent("");
          return;
        }
        const { encrypted, key, iv, tag } = await htmlRes.json();
        // 3단계: AES-256-GCM 복호화
        const html = await decryptHtml(encrypted, key, iv, tag);
        if (!cancelled) setHtmlContent(html);
      } catch (e: any) {
        if (!cancelled) setLoadError(e?.message || "복호화 오류");
      }
    }
    loadHtml();
    return () => { cancelled = true; };
  }, [pageId, section.id]);

  const openNewTab = () => {
    // 새 탭: 복호화된 HTML을 Blob URL로 열기
    if (htmlContent) {
      const blob = new Blob([htmlContent], { type: "text/html" });
      const url = URL.createObjectURL(blob);
      const w = window.open(url, "_blank");
      if (w) setTimeout(() => URL.revokeObjectURL(url), 5000);
    }
  };

  // iframe 내부에서 postMessage로 높이를 보내오면 반영
  // HTML 앱에서 postMessage로 높이/로그인/로그아웃 요청 수신
  useEffect(() => {
    const handleMessage = (e: MessageEvent) => {
      if (e.data?.type === "iframe-height" && typeof e.data.height === "number") {
        const h = e.data.height;
        if (iframeRef.current && h > 100) {
          maxHRef.current = Math.max(maxHRef.current, h);
          iframeRef.current.style.height = maxHRef.current + "px";
        }
      }
      // page21 HTML 앱에서 로그인 요청 → 사이트 본체 OAuth 로그인 페이지로 이동
      if (e.data?.type === "manus-request-login") {
        const returnPath = e.data.returnPath || window.location.pathname;
        window.location.href = getLoginUrl(returnPath);
      }
      // page21 HTML 앱에서 로그아웃 요청 → 사이트 본체 로그아웃 처리
      if (e.data?.type === "manus-request-logout") {
        // 로그아웃은 사이트 본체에서 처리 (쿠키 삭제 후 페이지 새로고침)
        fetch("/api/trpc/auth.logout", { method: "POST", credentials: "include" })
          .finally(() => window.location.reload());
      }
    };
    window.addEventListener("message", handleMessage);
    return () => window.removeEventListener("message", handleMessage);
  }, []);

  const handleIframeLoad = (e: React.SyntheticEvent<HTMLIFrameElement>) => {
    const iframe = e.currentTarget;
    const applyHeight = () => {
      try {
        const doc = iframe.contentDocument || iframe.contentWindow?.document;
        if (!doc) return;
        // scrollHeight 기반 높이 계산
        const h = Math.max(
          doc.documentElement.scrollHeight,
          doc.body?.scrollHeight ?? 0,
          600
        );
        // 높이는 오직 증가 방향으로만 적용 (내부 요소 숨김으로 인한 축소 방지)
        if (h > maxHRef.current) {
          maxHRef.current = h;
          iframe.style.height = h + "px";
        } else {
          // 이미 기록된 최대 높이 유지
          iframe.style.height = maxHRef.current + "px";
        }
      } catch { /* cross-origin */ }
    };

    applyHeight();

    // 관리자 여부 + 실제 인증 상태를 iframe 내부로 전달
    try {
      iframe.contentWindow?.postMessage({ type: "manus-admin-status", isAdmin }, "*");
      // 실제 로그인 사용자 정보 전달 (page21 HTML 앱의 가짜 로그인 대체)
      const loginUrl = getLoginUrl(window.location.pathname);
      iframe.contentWindow?.postMessage({
        type: "manus-auth-state",
        isLoggedIn: !!user,
        loginUrl,
        isDeveloper: !!(user as any)?.isDeveloper,
        hasRegisteredApp,
        user: user ? {
          nick: user.username || user.name || '',
          email: user.email || '',
          avatar: user.profileImage || '🧑‍💻',
          handle: user.username ? '@' + user.username : '',
          role: user.role || 'user',
          isDeveloper: !!(user as any)?.isDeveloper,
          hasRegisteredApp,
        } : null,
      }, "*");
    } catch { /* cross-origin */ }

    try {
      const doc = iframe.contentDocument || iframe.contentWindow?.document;
      if (doc?.documentElement) {
        // documentElement 전체를 감시하여 내부 레이아웃 변화 감지
        const ro = new ResizeObserver(() => applyHeight());
        ro.observe(doc.documentElement);
        iframe.addEventListener("pagehide", () => ro.disconnect(), { once: true });
      }
    } catch { /* cross-origin */ }
  };

  // 로딩/오류 상태 UI
  const iframeEl = (() => {
    if (loadError) {
      return (
        <div style={{ minHeight: 200, display: "flex", alignItems: "center", justifyContent: "center", color: "#ef4444", fontSize: 14, padding: 24 }}>
          ⚠️ {loadError}
        </div>
      );
    }
    if (htmlContent === null) {
      return (
        <div style={{ minHeight: 200, display: "flex", alignItems: "center", justifyContent: "center", color: "#6b7280", fontSize: 14 }}>
          <span style={{ display: "inline-block", width: 20, height: 20, border: "2px solid #6b7280", borderTopColor: "transparent", borderRadius: "50%", animation: "spin 0.8s linear infinite", marginRight: 8 }} />
          로딩 중...
        </div>
      );
    }
    return (
      <iframe
        ref={iframeRef}
        srcDoc={htmlContent}
        style={{ width: "100%", minHeight: 600, border: "none", display: "block" }}
        sandbox="allow-scripts allow-same-origin allow-forms allow-modals allow-popups"
        title="HTML 앱"
        onLoad={handleIframeLoad}
      />
    );
  })();

  // 전체화면 오버레이 모드
  if (isFullscreen) {
    return (
      <div style={{
        position: "fixed", inset: 0, zIndex: 9999, background: "#000",
        display: "flex", flexDirection: "column",
      }}>
        {/* 전체화면 iframe - 툴바 없이 앱만 표시 */}
        {htmlContent !== null ? (
          <iframe
            ref={fsIframeRef}
            srcDoc={htmlContent}
            style={{ flex: 1, width: "100%", border: "none", display: "block" }}
            sandbox="allow-scripts allow-same-origin allow-forms allow-modals allow-popups"
            title="HTML 앱 전체화면"
          />
        ) : (
          <div style={{ flex: 1, display: "flex", alignItems: "center", justifyContent: "center", color: "#fff" }}>로딩 중...</div>
        )}
      </div>
    );
  }

  return (
    <section style={{ background: bg, padding: fullWidth ? 0 : padding }}>
      <div style={{ maxWidth: fullWidth ? "100%" : contentWidth, margin: "0 auto" }}>
        {/* 앱 툴바 - 관리자에게만 표시 */}
        {isAdmin && (
          <div style={{
            display: "flex", alignItems: "center", justifyContent: "space-between",
            background: "#f8fafc", borderBottom: "1px solid #e5e7eb",
            padding: "4px 10px", fontSize: 11,
          }}>
            <span style={{ color: "#6b7280" }}>HTML 앱 (관리자)</span>
            <div style={{ display: "flex", gap: 6 }}>
              <button
                onClick={openNewTab}
                style={{ padding: "2px 8px", borderRadius: 5, border: "1px solid #6366f1", background: "#eef2ff", color: "#4338ca", fontSize: 11, fontWeight: 700, cursor: "pointer" }}
              >
                🔗 새 탭
              </button>
              <button
                onClick={() => setIsFullscreen(true)}
                style={{ padding: "2px 8px", borderRadius: 5, border: "1px solid #6b7280", background: "#f3f4f6", color: "#374151", fontSize: 11, fontWeight: 700, cursor: "pointer" }}
              >
                ⛶ 전체화면
              </button>
            </div>
          </div>
        )}
        {iframeEl}
      </div>
    </section>
  );
}

// ─── 섹션 렌더러 ───────────────────────────────────────────────────────────────
function RenderSection({ section, fullWidth, isAdmin, user, pageId, contentWidth = 960, fullscreenDefault = false }: { section: PageSection; fullWidth: boolean; isAdmin: boolean; user: any; pageId: number; contentWidth?: number; fullscreenDefault?: boolean }) {
  const bg = section.settings.bgColor || "#ffffff";
  const align = section.settings.textAlign || "left";
  const padding = PADDING_MAP[section.settings.padding || "md"];

  const wrapStyle: React.CSSProperties = {
    background: bg,
    padding: fullWidth ? padding : padding,
    textAlign: align as "left" | "center" | "right",
  };

  if (section.type === "hero") {
    const { heroTitle, heroSubtitle, heroButtonText, heroButtonUrl, imageUrl } = section.settings;
    return (
      <section style={{
        ...wrapStyle,
        backgroundImage: imageUrl ? `linear-gradient(rgba(0,0,0,0.5), rgba(0,0,0,0.5)), url(${imageUrl})` : undefined,
        backgroundSize: "cover",
        backgroundPosition: "center",
        color: imageUrl ? "#fff" : "#111827",
        padding: "80px 24px",
        textAlign: "center",
      }}>
        <div style={{ maxWidth: fullWidth ? "100%" : Math.min(contentWidth, 800), margin: "0 auto" }}>
          {heroTitle && <h1 style={{ fontSize: "clamp(28px, 5vw, 48px)", fontWeight: 800, marginBottom: 16, lineHeight: 1.2 }}>{heroTitle}</h1>}
          {heroSubtitle && <p style={{ fontSize: "clamp(15px, 2.5vw, 20px)", opacity: 0.85, marginBottom: 28, lineHeight: 1.6 }}>{heroSubtitle}</p>}
          {heroButtonText && heroButtonUrl && (
            <a href={heroButtonUrl}
              style={{ display: "inline-block", padding: "12px 28px", background: "#6366f1", color: "#fff", borderRadius: 8, fontWeight: 700, fontSize: 15, textDecoration: "none" }}>
              {heroButtonText}
            </a>
          )}
        </div>
      </section>
    );
  }

  if (section.type === "text") {
    return (
      <section style={wrapStyle}>
        <div style={{ maxWidth: fullWidth ? "100%" : contentWidth, margin: "0 auto", padding: fullWidth ? "0 24px" : undefined }}>
          <div className="rich-preview" dangerouslySetInnerHTML={{ __html: section.content }} />
        </div>
      </section>
    );
  }

  if (section.type === "image") {
    const { imageUrl, imageAlt } = section.settings;
    return (
      <section style={wrapStyle}>
        <div style={{ maxWidth: fullWidth ? "100%" : contentWidth, margin: "0 auto" }}>
          {imageUrl && (
            <img loading="lazy" src={imageUrl} alt={imageAlt || ""} style={{ maxWidth: "100%", borderRadius: 12, display: "block", margin: align === "center" ? "0 auto" : undefined }} />
          )}
          {section.content && (
            <p style={{ fontSize: 13, color: "#6b7280", marginTop: 8, textAlign: "center" }}>{section.content}</p>
          )}
        </div>
      </section>
    );
  }

  if (section.type === "columns") {
    const [left = "", right = ""] = section.settings.columns || [];
    return (
      <section style={wrapStyle}>
        <div style={{ maxWidth: fullWidth ? "100%" : contentWidth, margin: "0 auto", display: "grid", gridTemplateColumns: "1fr 1fr", gap: 32 }}>
          <div className="rich-preview" dangerouslySetInnerHTML={{ __html: left }} />
          <div className="rich-preview" dangerouslySetInnerHTML={{ __html: right }} />
        </div>
      </section>
    );
  }

  if (section.type === "button") {
    const { buttonText, buttonUrl, buttonStyle = "primary" } = section.settings;
    const btnStyles: Record<string, React.CSSProperties> = {
      primary: { background: "#6366f1", color: "#fff", border: "none" },
      outline: { background: "transparent", color: "#6366f1", border: "2px solid #6366f1" },
      ghost: { background: "transparent", color: "#6366f1", border: "none", textDecoration: "underline" },
    };
    return (
      <section style={wrapStyle}>
        {buttonText && buttonUrl && (
          <a href={buttonUrl}
            style={{ display: "inline-block", padding: "12px 28px", borderRadius: 8, fontWeight: 700, fontSize: 15, textDecoration: "none", cursor: "pointer", ...btnStyles[buttonStyle] }}>
            {buttonText}
          </a>
        )}
      </section>
    );
  }

  if (section.type === "divider") {
    return (
      <div style={{ padding: "8px 24px", background: bg }}>
        <hr style={{ border: "none", borderTop: "1px solid #e5e7eb", maxWidth: fullWidth ? "100%" : contentWidth, margin: "0 auto" }} />
      </div>
    );
  }

  if (section.type === "html") {
    // URL 임베드 모드
    if (section.settings.embedMode === "url" && section.settings.embedUrl) {
      return (
        <section style={wrapStyle}>
          <div style={{ maxWidth: fullWidth ? "100%" : contentWidth, margin: "0 auto" }}>
            <iframe
              src={section.settings.embedUrl}
              style={{ width: "100%", minHeight: 400, border: "none", display: "block" }}
              allowFullScreen
              title="URL 임베드"
              onLoad={(e) => {
                const iframe = e.currentTarget;
                try {
                  const doc = iframe.contentDocument || iframe.contentWindow?.document;
                  if (doc?.body) {
                    const ro = new ResizeObserver(() => {
                      const h = doc.documentElement.scrollHeight || doc.body?.scrollHeight || 400;
                      if (h > 100) iframe.style.height = h + "px";
                    });
                    ro.observe(doc.body);
                    iframe.addEventListener("pagehide", () => ro.disconnect(), { once: true });
                  }
                } catch { /* cross-origin */ }
              }}
            />
          </div>
        </section>
      );
    }
    // HTML 소스 + 앱 모드 OR 전체 HTML 문서 감지 → 전체화면 지원 컴포넌트 사용
    // isAppMode이면 content가 비어 있어도 서버 엔드포인트(/api/page-html/:pageId/:sectionId)로 렌더링
    const isFullHtmlDoc = /^\s*(<!DOCTYPE|<html)/i.test(section.content.trim());
    if (section.settings.isAppMode || (isFullHtmlDoc && section.content.trim())) {
      return <HtmlAppSection section={section} fullWidth={fullWidth} isAdmin={isAdmin} user={user} pageId={pageId} contentWidth={contentWidth} fullscreenDefault={fullscreenDefault} />;
    }
    // 일반 HTML (dangerouslySetInnerHTML)
    return (
      <section style={wrapStyle}>
        <div style={{ maxWidth: fullWidth ? "100%" : contentWidth, margin: "0 auto" }} dangerouslySetInnerHTML={{ __html: section.content }} />
      </section>
    );
  }

  if (section.type === "vibe-apps") {
    return <VibeAppsSection bgColor={bg} padding={padding} />;
  }

  if (section.type === "featured-developers") {
    return <FeaturedDevelopersSection bgColor={bg} padding={padding} />;
  }

  return null;
}

// ─── vibe-apps 섹션: DB에서 앱 목록을 동적으로 불러와 카드 그리드 렌더링 ─────────
function VibeAppsSection({ bgColor, padding }: { bgColor: string; padding: string }) {
  const { data: apps, isLoading } = trpc.apps.list.useQuery(undefined, { staleTime: 5 * 60 * 1000 });
  const [selectedApp, setSelectedApp] = useState<any | null>(null);
  const { data: siteConfig } = trpc.admin.getSiteConfig.useQuery(undefined, { staleTime: 10 * 60 * 1000, refetchOnWindowFocus: false });
  const cardBorderColor = siteConfig?.cardBorderColor || "#c7d2fe";
  const cardBorderWidth = siteConfig?.cardBorderWidth || "1.5px";

  if (isLoading) {
    return (
      <section style={{ background: bgColor, padding }}>
        <div style={{ maxWidth: 960, margin: "0 auto", display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(200px, 1fr))", gap: 12 }}>
          {Array.from({ length: 6 }).map((_, i) => (
            <div key={i} style={{ height: 220, background: "#f3f4f6", borderRadius: 12, animation: "pulse 1.5s infinite" }} />
          ))}
        </div>
      </section>
    );
  }

  const publishedApps = (apps ?? []).filter((a: any) => a.published !== false);

  if (publishedApps.length === 0) {
    return (
      <section style={{ background: bgColor, padding }}>
        <div style={{ maxWidth: 960, margin: "0 auto", textAlign: "center", color: "#6b7280", padding: "40px 0" }}>
          등록된 앱이 없습니다.
        </div>
      </section>
    );
  }

  return (
    <section style={{ background: bgColor, padding }}>
      <div style={{ maxWidth: 960, margin: "0 auto" }}>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(200px, 1fr))", gap: 12 }}>
          {publishedApps.map((app: any) => (
            <button
              key={app.id}
              onClick={() => setSelectedApp(app)}
              style={{
                background: "#ffffff",
                border: `${cardBorderWidth} solid ${cardBorderColor}`,
                borderRadius: 12,
                overflow: "hidden",
                textAlign: "left",
                cursor: "pointer",
                padding: 0,
                boxShadow: "0 2px 8px rgba(99,102,241,0.07)",
                transition: "transform 0.18s, box-shadow 0.18s",
                display: "flex",
                flexDirection: "column",
              }}
              onMouseEnter={e => {
                (e.currentTarget as HTMLElement).style.transform = "translateY(-4px)";
                (e.currentTarget as HTMLElement).style.boxShadow = "0 10px 28px rgba(99,102,241,0.22)";
              }}
              onMouseLeave={e => {
                (e.currentTarget as HTMLElement).style.transform = "";
                (e.currentTarget as HTMLElement).style.boxShadow = "0 2px 8px rgba(99,102,241,0.07)";
              }}
            >
              {/* 썸네일 */}
              <div style={{ position: "relative", height: 110, overflow: "hidden", background: app.gradient || "linear-gradient(135deg, #6366f1, #8b5cf6)" }}>
                {app.thumbnail && (
                  <img src={app.thumbnail} alt={app.name} loading="lazy" style={{ width: "100%", height: "100%", objectFit: "cover" }} />
                )}
                {app.category && (
                  <span style={{
                    position: "absolute", top: 8, left: 8,
                    background: "rgba(99,102,241,0.85)",
                    color: "#fff", fontSize: 9, fontWeight: 800,
                    padding: "2px 7px", borderRadius: 3,
                  }}>{app.category}</span>
                )}
                {/* 🔥 주목 배지: likeCount 20 이상 */}
                {(app.likeCount ?? 0) >= 20 && (
                  <span style={{
                    position: "absolute", top: 8, right: 8,
                    background: "rgba(239,68,68,0.9)",
                    color: "#fff", fontSize: 9, fontWeight: 800,
                    padding: "2px 6px", borderRadius: 3,
                  }}>🔥주목</span>
                )}
              </div>
              {/* 내용 */}
              <div style={{ padding: "10px 12px 12px", flex: 1, display: "flex", flexDirection: "column" }}>
                <div style={{ fontSize: 13, fontWeight: 800, color: "#111827", lineHeight: 1.3, marginBottom: 2 }}>{app.name}</div>
                {app.authorUsername && (
                  <div style={{ fontSize: 10, color: "#8b5cf6", fontWeight: 600, marginBottom: 4 }}>@{app.authorUsername}</div>
                )}
                <div style={{
                  fontSize: 11, color: "#6b7280", lineHeight: 1.5, flex: 1,
                  display: "-webkit-box", WebkitLineClamp: 2, WebkitBoxOrient: "vertical" as const, overflow: "hidden",
                }}>{app.description}</div>
                {/* 좋아요/조회수 */}
                <div style={{ marginTop: 6, display: "flex", gap: 8, fontSize: 10, color: "#9ca3af" }}>
                  <span>♥ {app.likeCount ?? 0}</span>
                  <span>👁 {app.viewCount ?? 0}</span>
                </div>
                <div style={{ marginTop: 6, fontSize: 11, fontWeight: 700, color: "#6366f1", textAlign: "center", padding: "5px 0", borderTop: "1px solid #e5e7eb" }}>
                  자세히 보기 &rsaquo;
                </div>
              </div>
            </button>
          ))}
        </div>
      </div>
      {selectedApp && (
        <VibeAppDetailOverlay app={selectedApp} onClose={() => setSelectedApp(null)} />
      )}
    </section>
  );
}

// ─── vibe-apps 상세 오버레이 ────────────────────────────────────────────────────
function VibeAppDetailOverlay({ app, onClose }: { app: any; onClose: () => void }) {
  useEffect(() => {
    const handler = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    document.addEventListener("keydown", handler);
    return () => document.removeEventListener("keydown", handler);
  }, [onClose]);
  return (
    <div
      style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.6)", zIndex: 9999, display: "flex", alignItems: "center", justifyContent: "center", padding: 16 }}
      onClick={onClose}
    >
      <div
        style={{ background: "#fff", borderRadius: 16, maxWidth: 520, width: "100%", maxHeight: "80vh", overflow: "auto", padding: 24, position: "relative" }}
        onClick={e => e.stopPropagation()}
      >
        <button onClick={onClose} style={{ position: "absolute", top: 12, right: 12, background: "none", border: "none", cursor: "pointer", fontSize: 20, color: "#6b7280" }}>✕</button>
        <div style={{ display: "flex", gap: 12, alignItems: "flex-start", marginBottom: 16 }}>
          <div style={{ width: 56, height: 56, borderRadius: 12, background: app.gradient || "linear-gradient(135deg, #6366f1, #8b5cf6)", flexShrink: 0, overflow: "hidden" }}>
            {app.thumbnail && <img src={app.thumbnail} alt={app.name} style={{ width: "100%", height: "100%", objectFit: "cover" }} />}
          </div>
          <div>
            <div style={{ fontSize: 18, fontWeight: 800, color: "#111827" }}>{app.name}</div>
            {app.authorUsername && (
              <div style={{ fontSize: 12, color: "#8b5cf6", fontWeight: 600 }}>@{app.authorUsername}</div>
            )}
            {app.category && (
              <span style={{ fontSize: 10, background: "#ede9fe", color: "#6366f1", padding: "2px 8px", borderRadius: 4, fontWeight: 700 }}>{app.category}</span>
            )}
          </div>
        </div>
        <p style={{ fontSize: 13, color: "#374151", lineHeight: 1.7, marginBottom: 16 }}>{app.longDescription || app.description}</p>
        {app.appUrl && (
          <a href={app.appUrl} target="_blank" rel="noopener noreferrer" style={{ display: "inline-block", background: "linear-gradient(135deg, #6366f1, #8b5cf6)", color: "#fff", padding: "8px 20px", borderRadius: 8, fontSize: 13, fontWeight: 700, textDecoration: "none" }}>
            앱 열기
          </a>
        )}
      </div>
    </div>
  );
}

// ─── 하단 글 목록 컴포넌트 ────────────────────────────────────────────────────
function PagePostList({ categoryKey, fullWidth }: { categoryKey: string; fullWidth: boolean }) {
  const { data: postsData } = trpc.posts.list.useQuery({ category: categoryKey, page: 1, limit: 20 });
  const posts = postsData?.posts ?? [];

  if (posts.length === 0) return null;

  return (
    <div style={{ background: "#f9fafb", borderTop: "2px solid #e5e7eb", padding: "40px 24px" }}>
      <div style={{ maxWidth: fullWidth ? "100%" : 960, margin: "0 auto" }}>
        <h2 style={{ fontSize: 20, fontWeight: 800, color: "#111827", marginBottom: 20, display: "flex", alignItems: "center", gap: 8 }}>
          <span style={{ display: "inline-block", width: 4, height: 20, background: "#6366f1", borderRadius: 2 }} />
          관련 글 목록
        </h2>
        <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
          <thead>
            <tr style={{ borderBottom: "2px solid #e5e7eb", background: "#f3f4f6" }}>
              <th style={{ padding: "10px 12px", textAlign: "center", width: 48, color: "#6b7280", fontWeight: 700 }}>번호</th>
              <th style={{ padding: "10px 12px", textAlign: "left", color: "#6b7280", fontWeight: 700 }}>제목</th>
              <th style={{ padding: "10px 12px", textAlign: "center", width: 100, color: "#6b7280", fontWeight: 700 }}>작성일</th>
              <th style={{ padding: "10px 12px", textAlign: "center", width: 70, color: "#6b7280", fontWeight: 700 }}>조회수</th>
            </tr>
          </thead>
          <tbody>
            {posts.map((post, idx) => (
              <tr key={post.id} style={{ borderBottom: "1px solid #f3f4f6", transition: "background 0.15s" }}
                onMouseEnter={e => (e.currentTarget.style.background = "#ede9fe")}
                onMouseLeave={e => (e.currentTarget.style.background = "")}>
                <td style={{ padding: "10px 12px", textAlign: "center", color: "#9ca3af" }}>{idx + 1}</td>
                <td style={{ padding: "10px 12px" }}>
                  <a href={getPostUrl(post)} style={{ color: "#111827", textDecoration: "none", fontWeight: 500 }}
                    onMouseEnter={e => (e.currentTarget.style.color = "#6366f1")}
                    onMouseLeave={e => (e.currentTarget.style.color = "#111827")}>
                    {post.title}
                  </a>
                </td>
                <td style={{ padding: "10px 12px", textAlign: "center", color: "#9ca3af" }}>
                  {new Date(post.createdAt).toLocaleDateString("ko-KR", { year: "2-digit", month: "2-digit", day: "2-digit" })}
                </td>
                <td style={{ padding: "10px 12px", textAlign: "center", color: "#9ca3af" }}>{post.views.toLocaleString()}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// ─── 페이지 댓글 섹션 컴포넌트 ─────────────────────────────────────────────────
function PageCommentsSection({ pageId, currentUserId, isAuthenticated, inputRef, onCommentCountChange }: {
  pageId: number;
  currentUserId?: string;
  isAuthenticated: boolean;
  inputRef?: React.RefObject<HTMLTextAreaElement | null>;
  onCommentCountChange?: (count: number) => void;
}) {
  const utils = trpc.useUtils();
  const [commentText, setCommentText] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [allItems, setAllItems] = useState<any[]>([]);
  const [nextCursor, setNextCursor] = useState<number | null>(null);
  const [isLoadingMore, setIsLoadingMore] = useState(false);
  // inputRef가 외부에서 전달되면 그것을 사용, 아니면 내부 ref 사용
  const internalTextareaRef = useRef<HTMLTextAreaElement>(null);
  const textareaRef = inputRef ?? internalTextareaRef;
  // 좋아요 로컈 상태: { [commentId_targetType]: boolean }
  const [likedMap, setLikedMap] = useState<Record<string, boolean>>({});
  // 좋아요 카운트 로컈 상태
  const [likeCountMap, setLikeCountMap] = useState<Record<string, number>>({});

  const { data: commentsData, isLoading } = trpc.comments.listByPage.useQuery(
    { pageId, cursor: undefined, limit: 5 },
    { enabled: !!pageId, refetchInterval: 15000 }
  );

  // 좋아요 상태 조회 (commentIds 목록 기반)
  const commentIds = allItems.map((c: any) => c.id);
  const { data: likeStatuses } = trpc.comments.getLikeStatuses.useQuery(
    { commentIds },
    { enabled: isAuthenticated && commentIds.length > 0 }
  );

  useEffect(() => {
    if (commentsData) {
      setAllItems(commentsData.items);
      setNextCursor(commentsData.nextCursor);
      // 카운트 초기화
      const newCountMap: Record<string, number> = {};
      for (const c of commentsData.items) {
        newCountMap[`${c.id}_comment`] = (c as any).likeCount ?? 0;
        newCountMap[`${c.id}_ai_reply`] = (c as any).aiReplyLikeCount ?? 0;
      }
      setLikeCountMap(newCountMap);
      // 댓글 수 업데이트 (nextCursor가 있으면 더 많을 수 있음)
      onCommentCountChange?.(commentsData.items.length + (commentsData.nextCursor ? 1 : 0));
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [commentsData]);

  useEffect(() => {
    if (likeStatuses) {
      const newMap: Record<string, boolean> = {};
      for (const s of likeStatuses) {
        newMap[`${s.commentId}_${s.targetType}`] = true;
      }
      setLikedMap(newMap);
    }
  }, [likeStatuses]);

  const refreshComments = async () => {
    const fresh = await utils.comments.listByPage.fetch({ pageId, cursor: undefined, limit: 5 });
    setAllItems(fresh.items);
    setNextCursor(fresh.nextCursor);
    const newCountMap: Record<string, number> = {};
    for (const c of fresh.items) {
      newCountMap[`${c.id}_comment`] = (c as any).likeCount ?? 0;
      newCountMap[`${c.id}_ai_reply`] = (c as any).aiReplyLikeCount ?? 0;
    }
    setLikeCountMap(newCountMap);
    onCommentCountChange?.(fresh.items.length + (fresh.nextCursor ? 1 : 0));
  };

  const addCommentMutation = trpc.comments.addToPage.useMutation({
    onSuccess: () => {
      setCommentText("");
      refreshComments();
      toast.success("댓글이 등록되었습니다.");
    },
    onError: (err) => toast.error("댓글 등록 실패: " + err.message),
    onSettled: () => setIsSubmitting(false),
  });

  const deleteCommentMutation = trpc.comments.deletePage.useMutation({
    onSuccess: () => {
      refreshComments();
      toast.success("댓글이 삭제되었습니다.");
    },
    onError: (err) => toast.error("삭제 실패: " + err.message),
  });

  const toggleLikeMutation = trpc.comments.toggleLike.useMutation({
    onMutate: ({ commentId, targetType }) => {
      // 낙관적 업데이트
      const key = `${commentId}_${targetType}`;
      const wasLiked = !!likedMap[key];
      setLikedMap(prev => ({ ...prev, [key]: !wasLiked }));
      setLikeCountMap(prev => ({
        ...prev,
        [key]: Math.max(0, (prev[key] ?? 0) + (wasLiked ? -1 : 1)),
      }));
    },
    onSuccess: (data, { commentId, targetType }) => {
      const key = `${commentId}_${targetType}`;
      setLikedMap(prev => ({ ...prev, [key]: data.liked }));
      if (targetType === "comment") {
        setLikeCountMap(prev => ({ ...prev, [key]: data.likeCount }));
      } else {
        setLikeCountMap(prev => ({ ...prev, [key]: data.aiReplyLikeCount }));
      }
    },
    onError: (err, { commentId, targetType }) => {
      // 롤백
      const key = `${commentId}_${targetType}`;
      const wasLiked = !likedMap[key];
      setLikedMap(prev => ({ ...prev, [key]: wasLiked }));
      setLikeCountMap(prev => ({
        ...prev,
        [key]: Math.max(0, (prev[key] ?? 0) + (wasLiked ? 1 : -1)),
      }));
      toast.error("좋아요 실패: " + err.message);
    },
  });

  const handleLike = (commentId: number, targetType: "comment" | "ai_reply") => {
    if (!isAuthenticated) {
      toast.error("좋아요를 누르려면 로그인이 필요합니다.");
      return;
    }
    toggleLikeMutation.mutate({ commentId, targetType });
  };

  const handleLoadMore = async () => {
    if (!nextCursor || isLoadingMore) return;
    setIsLoadingMore(true);
    try {
      const more = await utils.comments.listByPage.fetch({ pageId, cursor: nextCursor, limit: 5 });
      setAllItems(prev => [...prev, ...more.items]);
      setNextCursor(more.nextCursor);
    } finally {
      setIsLoadingMore(false);
    }
  };

  const handleSubmit = () => {
    const trimmed = commentText.trim();
    if (!trimmed) return;
    if (trimmed.length > 2000) {
      toast.error("댓글은 2000자 이내로 작성해주세요.");
      return;
    }
    setIsSubmitting(true);
    addCommentMutation.mutate({ pageId, content: trimmed });
  };

  return (
    <div style={{ maxWidth: 960, margin: "0 auto", padding: "40px 24px 60px", fontFamily: "'Noto Sans KR', sans-serif" }}>
      <h3 style={{ fontSize: 18, fontWeight: 700, color: "#111827", marginBottom: 20, paddingBottom: 12, borderBottom: "2px solid #e5e7eb" }}>
        댓글 {allItems.length > 0 ? `(${allItems.length})` : ""}
      </h3>

      {/* 댓글 입력 */}
      {isAuthenticated ? (
        <div style={{ marginBottom: 28 }}>
          <textarea
            ref={textareaRef}
            value={commentText}
            onChange={e => setCommentText(e.target.value)}
            onKeyDown={e => { if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) handleSubmit(); }}
            placeholder="댓글을 입력하세요... (Ctrl+Enter로 등록)"
            rows={3}
            style={{
              width: "100%", padding: "12px 14px", border: "1.5px solid #e5e7eb",
              borderRadius: 10, fontSize: 14, resize: "vertical", outline: "none",
              fontFamily: "inherit", color: "#374151", lineHeight: 1.6,
              boxSizing: "border-box",
            }}
            onFocus={e => (e.target.style.borderColor = "#6366f1")}
            onBlur={e => (e.target.style.borderColor = "#e5e7eb")}
          />
          <div style={{ display: "flex", justifyContent: "flex-end", marginTop: 8, gap: 8 }}>
            <span style={{ fontSize: 12, color: commentText.length > 1800 ? "#ef4444" : "#9ca3af", alignSelf: "center" }}>
              {commentText.length}/2000
            </span>
            <button
              onClick={handleSubmit}
              disabled={isSubmitting || !commentText.trim()}
              style={{
                padding: "8px 20px", background: isSubmitting || !commentText.trim() ? "#d1d5db" : "#6366f1",
                color: "#fff", border: "none", borderRadius: 8, fontSize: 14, fontWeight: 600,
                cursor: isSubmitting || !commentText.trim() ? "not-allowed" : "pointer",
                transition: "background 0.2s",
              }}
            >
              {isSubmitting ? "등록 중..." : "댓글 등록"}
            </button>
          </div>
        </div>
      ) : (
        <div style={{
          padding: "16px 20px", background: "#f9fafb", border: "1px solid #e5e7eb",
          borderRadius: 10, marginBottom: 24, textAlign: "center", color: "#6b7280", fontSize: 14,
        }}>
          댓글을 작성하려면 <a href="/login" style={{ color: "#6366f1", fontWeight: 600, textDecoration: "none" }}>로그인</a>이 필요합니다.
        </div>
      )}

      {/* 댓글 목록 */}
      {isLoading ? (
        <div style={{ textAlign: "center", padding: "24px 0", color: "#9ca3af" }}>댓글을 불러오는 중...</div>
      ) : allItems.length === 0 ? (
        <div style={{ textAlign: "center", padding: "32px 0", color: "#9ca3af", fontSize: 14 }}>첫 번째 댓글을 남겨보세요!</div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
          {allItems.map((comment: any) => (
            <div key={comment.id} style={{ padding: "16px 18px", background: "#f9fafb", borderRadius: 12, border: "1px solid #e5e7eb" }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 8 }}>
                <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                  <div style={{
                    width: 32, height: 32, borderRadius: "50%", background: "#6366f1",
                    display: "flex", alignItems: "center", justifyContent: "center",
                    color: "#fff", fontSize: 13, fontWeight: 700, flexShrink: 0,
                  }}>
                    {(comment.userName || "?")[0].toUpperCase()}
                  </div>
                  <div>
                    <div style={{ fontSize: 14, fontWeight: 600, color: "#111827" }}>{comment.userName}</div>
                    <div style={{ fontSize: 12, color: "#9ca3af" }}>
                      {new Date(comment.createdAt).toLocaleString("ko-KR", { year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit" })}
                    </div>
                  </div>
                </div>
                {(comment.userId === currentUserId) && (
                  <button
                    onClick={() => deleteCommentMutation.mutate({ id: comment.id, pageId })}
                    style={{ fontSize: 12, color: "#ef4444", background: "none", border: "none", cursor: "pointer", padding: "2px 6px" }}
                  >
                    삭제
                  </button>
                )}
              </div>
              <p style={{ fontSize: 14, color: "#374151", lineHeight: 1.7, margin: 0, whiteSpace: "pre-wrap" }}>{comment.content}</p>
              {/* 댓글 좋아요 버튼 */}
              <div style={{ marginTop: 10, display: "flex", alignItems: "center", gap: 6 }}>
                <button
                  onClick={() => handleLike(comment.id, "comment")}
                  title={likedMap[`${comment.id}_comment`] ? "좋아요 취소" : "좋아요"}
                  style={{
                    display: "flex", alignItems: "center", gap: 4,
                    padding: "4px 10px", borderRadius: 20,
                    border: `1.5px solid ${likedMap[`${comment.id}_comment`] ? "#6366f1" : "#e5e7eb"}`,
                    background: likedMap[`${comment.id}_comment`] ? "#eef2ff" : "transparent",
                    color: likedMap[`${comment.id}_comment`] ? "#6366f1" : "#9ca3af",
                    fontSize: 13, cursor: "pointer", transition: "all 0.15s",
                    fontWeight: likedMap[`${comment.id}_comment`] ? 600 : 400,
                  }}
                >
                  <span style={{ fontSize: 15 }}>{likedMap[`${comment.id}_comment`] ? "♥️" : "♡"}</span>
                  <span>{likeCountMap[`${comment.id}_comment`] ?? 0}</span>
                </button>
              </div>
              {/* AI 답변 */}
              {comment.aiReply && (
                <div style={{
                  marginTop: 12, padding: "12px 14px", background: "#eef2ff",
                  borderRadius: 8, borderLeft: "3px solid #6366f1",
                }}
                >
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 6 }}>
                    <div style={{ fontSize: 12, fontWeight: 700, color: "#6366f1" }}>🤖 AI 답변</div>
                    {/* AI 답변 좋아요 버튼 */}
                    <button
                      onClick={() => handleLike(comment.id, "ai_reply")}
                      title={likedMap[`${comment.id}_ai_reply`] ? "좋아요 취소" : "도움이 되었어요"}
                      style={{
                        display: "flex", alignItems: "center", gap: 3,
                        padding: "3px 8px", borderRadius: 16,
                        border: `1px solid ${likedMap[`${comment.id}_ai_reply`] ? "#6366f1" : "#c7d2fe"}`,
                        background: likedMap[`${comment.id}_ai_reply`] ? "#6366f1" : "transparent",
                        color: likedMap[`${comment.id}_ai_reply`] ? "#fff" : "#6366f1",
                        fontSize: 12, cursor: "pointer", transition: "all 0.15s",
                      }}
                    >
                      <span style={{ fontSize: 13 }}>{likedMap[`${comment.id}_ai_reply`] ? "👍" : "👍"}</span>
                      <span style={{ fontWeight: 600 }}>{likeCountMap[`${comment.id}_ai_reply`] ?? 0}</span>
                      <span style={{ fontSize: 11 }}>도움이 됨</span>
                    </button>
                  </div>
                  <p style={{ fontSize: 13, color: "#374151", lineHeight: 1.7, margin: 0, whiteSpace: "pre-wrap" }}>{comment.aiReply}</p>
                </div>
              )}
            </div>
          ))}
          {nextCursor && (
            <button
              onClick={handleLoadMore}
              disabled={isLoadingMore}
              style={{
                padding: "10px 0", background: "none", border: "1.5px solid #e5e7eb",
                borderRadius: 8, fontSize: 14, color: "#6b7280", cursor: "pointer", fontWeight: 500,
              }}
            >
              {isLoadingMore ? "불러오는 중..." : "댓글 더 보기"}
            </button>
          )}
        </div>
      )}
    </div>
  );
}

// ─── 왼쪽 고정 플로팅 댓글 버튼 컴포넌트 ──────────────────────────────────────
function FloatingCommentButton({ commentCount, onClick }: { commentCount: number; onClick: () => void }) {
  const [hovered, setHovered] = useState(false);
  return (
    <>
      {/* 데스크탑: 화면 왼쪽 고정 세로형 버튼 */}
      <div
        style={{
          position: "fixed",
          left: 0,
          top: "50%",
          transform: "translateY(-50%)",
          zIndex: 100,
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
        }}
        className="floating-comment-desktop"
      >
        {/* 폄광 후광 폄리 (pulse ring) */}
        <div className="fcb-pulse-ring" />
        <button
          onClick={onClick}
          onMouseEnter={() => setHovered(true)}
          onMouseLeave={() => setHovered(false)}
          title="댓글 달기"
          className={hovered ? "fcb-btn fcb-btn-hovered" : "fcb-btn"}
        >
          {/* 말풍선 아이콘 */}
          <span className="fcb-icon">
            <svg width="26" height="26" viewBox="0 0 24 24" fill="currentColor" stroke="none">
              <path d="M20 2H4a2 2 0 0 0-2 2v18l4-4h14a2 2 0 0 0 2-2V4a2 2 0 0 0-2-2z" />
              <path d="M8 10h8M8 14h5" stroke="#fff" strokeWidth="1.8" strokeLinecap="round" fill="none" />
            </svg>
          </span>
          {/* 세로 텍스트 */}
          <span className="fcb-text">사용후기를<br />적어보세요!</span>
          {/* 댓글 수 배지 */}
          {commentCount > 0 && (
            <span className="fcb-badge">
              {commentCount > 99 ? "99+" : commentCount}
            </span>
          )}
        </button>
      </div>
      {/* 모바일: 하단 왼쪽 고정 가로형 버튼 */}
      <div
        style={{
          position: "fixed",
          bottom: 80,
          left: 12,
          zIndex: 100,
        }}
        className="floating-comment-mobile"
      >
        <button
          onClick={onClick}
          className="fcb-mobile-btn"
        >
          <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor" stroke="none">
            <path d="M20 2H4a2 2 0 0 0-2 2v18l4-4h14a2 2 0 0 0 2-2V4a2 2 0 0 0-2-2z" />
            <path d="M8 10h8M8 14h5" stroke="#fff" strokeWidth="1.8" strokeLinecap="round" fill="none" />
          </svg>
          사용후기
          {commentCount > 0 && (
            <span className="fcb-badge-mobile">{commentCount > 99 ? "99+" : commentCount}</span>
          )}
        </button>
      </div>
    </>
  );
}

// ─── 메인 컴포넌트 ─────────────────────────────────────────────────────────────
export default function CustomPageView() {
  const params = useParams<{ slug: string }>();
  const slug = params.slug || "";
  const search = useSearch();
  const isPreview = new URLSearchParams(search).get("preview") === "true";
  const { user, loading: authLoading, isAuthenticated } = useAuth();
  const isAdmin = user?.role === "admin";
  // authLoading이 완료된 후에만 isAdmin 상태를 확정
  const authResolved = !authLoading;
  const commentSectionRef = useRef<HTMLDivElement>(null);
  const commentInputRef = useRef<HTMLTextAreaElement | null>(null);
  const [pageCommentCount, setPageCommentCount] = useState(0);
  // 회원 전용 모달 상태 - early return 이전에 선언해야 React Hooks 규칙 준수
  const [showMembersOnlyModal, setShowMembersOnlyModal] = useState(false);

  const scrollToComments = () => {
    commentSectionRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
    // 스크롤 후 입력상자 포커스 (300ms 지연)
    setTimeout(() => {
      commentInputRef.current?.focus();
    }, 400);
  };

  // 미리보기 모드(preview=true)이고 관리자인 경우 비공개 페이지도 조회
  // 일반 공개 페이지: auth 대기 없이 즉시 쿼리 실행 (auth와 병렬 로딩으로 속도 개선)
  // 미리보기 모드: authResolved 후 isAdmin 확정된 후에만 쿼리 실행 (경쟁 조건 방지)
  const { data: publicPage, isLoading: publicLoading, error: publicError } = trpc.pages.getBySlug.useQuery(
    { slug },
    { enabled: !!slug && !isPreview, retry: false }
  );
  const { data: adminPage, isLoading: adminLoading, error: adminError } = trpc.pages.adminGetBySlug.useQuery(
    { slug },
    { enabled: !!slug && isPreview && authResolved && isAdmin, retry: false }
  );

  const page = isPreview && isAdmin ? adminPage : publicPage;
  // 미리보기 모드: auth 확정 + adminPage 로딩 완료까지 대기
  // 일반 모드: publicPage 로딩만 대기 (auth와 병렬 실행)
  const isLoading = isPreview ? (adminLoading || !authResolved) : publicLoading;
  const error = isPreview && isAdmin ? adminError : publicError;

  const incrementView = trpc.pages.incrementView.useMutation();

  // OG 이미지 메타태그 연동 (썸네일 우선, 없으면 빈 값)
  const pageThumbnail = (page as any)?.thumbnail || "";
  useSEO({
    title: page ? `${page.title} | 스마트 오토 가이드` : undefined,
    description: page?.description || undefined,
    image: pageThumbnail || undefined,
    type: "article",
  });

  // JSON-LD WebPage 구조화 데이터
  useJsonLd(page ? {
    type: "WebPage",
    name: `${page.title} | 스마트 오토 가이드`,
    url: window.location.href,
    description: page.description || undefined,
    dateModified: new Date((page as any).updatedAt || (page as any).createdAt).toISOString(),
    isPartOf: window.location.origin,
  } : null);

  // 회원 전용 페이지 접근 제어 - early return 이전에 선언해야 Hooks 규칙 준수
  const isMembersOnly = !!(page as any)?.membersOnly;
  useEffect(() => {
    if (isMembersOnly && !user && !isPreview) {
      setShowMembersOnlyModal(true);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isMembersOnly, isPreview]);

  useEffect(() => {
    // 미리보기 모드에서는 조회수 증가 안 함
    if (page?.id && !isPreview) {
      incrementView.mutate({ id: page.id });
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [page?.id]);

  // 미리보기 모드에서 authLoading 완료 후 관리자가 아닌 경우 공개 페이지로 폴백
  const isPreviewNotAdmin = isPreview && authResolved && !isAdmin;

  if (isLoading) {
    return (
      <div style={{ minHeight: "100vh", background: "#0a0a14", display: "flex", alignItems: "center", justifyContent: "center" }}>
        <div style={{ width: 32, height: 32, border: "3px solid #6366f1", borderTopColor: "transparent", borderRadius: "50%", animation: "spin 0.8s linear infinite" }} />
        <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
      </div>
    );
  }

  // 미리보기 모드에서 관리자가 아닌 경우: 로그인 안내 화면 표시
  if (isPreviewNotAdmin) {
    return (
      <div style={{ minHeight: "100vh", background: "#0a0a14", fontFamily: "'Noto Sans KR', sans-serif" }}>
        <Header />
        <div style={{ maxWidth: 600, margin: "120px auto", textAlign: "center", color: "#fff" }}>
          <div style={{ fontSize: 48, marginBottom: 16 }}>🔒</div>
          <h1 style={{ fontSize: 24, fontWeight: 700, marginBottom: 12 }}>관리자 전용 미리보기</h1>
          <p style={{ color: "#9ca3af", marginBottom: 24 }}>비공개 페이지 미리보기는 관리자만 이용할 수 있습니다.<br/>관리자 계정으로 로그인하세요.</p>
          <a href="/" style={{ display: "inline-block", padding: "10px 24px", background: "#6366f1", color: "#fff", borderRadius: 8, textDecoration: "none", fontWeight: 600 }}>
            홈으로 돌아가기
          </a>
        </div>
        <Footer />
      </div>
    );
  }

  if (error || !page) {
    return (
      <div style={{ minHeight: "100vh", background: "#0a0a14", fontFamily: "'Noto Sans KR', sans-serif" }}>
        <Header />
        <div style={{ maxWidth: 600, margin: "120px auto", textAlign: "center", color: "#fff" }}>
          <div style={{ fontSize: 64, marginBottom: 16 }}>404</div>
          <h1 style={{ fontSize: 24, fontWeight: 700, marginBottom: 12 }}>페이지를 찾을 수 없습니다</h1>
          <p style={{ color: "#9ca3af", marginBottom: 24 }}>요청하신 페이지가 존재하지 않거나 비공개 상태입니다.</p>
          <a href="/" style={{ display: "inline-block", padding: "10px 24px", background: "#6366f1", color: "#fff", borderRadius: 8, textDecoration: "none", fontWeight: 600 }}>
            홈으로 돌아가기
          </a>
        </div>
        <Footer />
      </div>
    );
  }

  // isMembersOnly와 showMembersOnlyModal useEffect는 위(early return 이전)로 이동됨

  let sections: PageSection[] = [];
  try { sections = JSON.parse(page.sectionsJson); } catch { sections = []; }

  // hideSidebar: true이면 Header/Footer만 유지하고 본문이 전체 너비를 차지
  const fullWidth = !!(page as any).hideSidebar;
  const hideChrome = !!(page as any).hideChrome; // 헤더/카테고리/푸터 완전 숨김
  const contentWidth = (page as any).contentWidth || 960;
  const fullscreenDefault = !!(page as any).fullscreenDefault;
  const showTitle = (page as any).showTitle !== false; // 기본 true
  const showDescription = (page as any).showDescription !== false; // 기본 true
  const titleAlign: "left" | "center" | "right" = ((page as any).titleAlign as "left" | "center" | "right") || "left";

  return (
    <div style={{ minHeight: "100vh", background: "#fff", fontFamily: "'Noto Sans KR', 'Apple SD Gothic Neo', sans-serif" }}>
      {/* 회원 전용 팝업 모달 */}
      {showMembersOnlyModal && (
        <div
          onClick={() => setShowMembersOnlyModal(false)}
          style={{
            position: "fixed", inset: 0, zIndex: 9999,
            background: "rgba(0,0,0,0.55)",
            display: "flex", alignItems: "center", justifyContent: "center",
            padding: "16px",
            backdropFilter: "blur(4px)",
          }}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            style={{
              background: "#fff",
              borderRadius: 20,
              padding: "48px 40px",
              maxWidth: 440,
              width: "100%",
              textAlign: "center",
              boxShadow: "0 20px 60px rgba(0,0,0,0.25)",
              position: "relative",
              animation: "modalIn 0.2s ease",
            }}
          >
            <style>{`@keyframes modalIn { from { opacity:0; transform:scale(0.93) translateY(12px); } to { opacity:1; transform:scale(1) translateY(0); } }`}</style>
            {/* 닫기 버튼 */}
            <button
              onClick={() => setShowMembersOnlyModal(false)}
              style={{
                position: "absolute", top: 16, right: 16,
                width: 32, height: 32, borderRadius: "50%",
                border: "1px solid #e5e7eb", background: "#f9fafb",
                cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center",
                color: "#9ca3af", fontSize: 18, lineHeight: 1,
              }}
            >×</button>
            {/* 자물솠 아이콘 */}
            <div style={{
              width: 72, height: 72,
              background: "linear-gradient(135deg, #6366f1, #818cf8)",
              borderRadius: "50%",
              display: "flex", alignItems: "center", justifyContent: "center",
              margin: "0 auto 20px",
              boxShadow: "0 8px 24px rgba(99,102,241,0.35)",
            }}>
              <svg width="32" height="32" viewBox="0 0 36 36" fill="none">
                <rect x="8" y="16" width="20" height="14" rx="3" fill="white" opacity="0.9"/>
                <path d="M12 16V12C12 8.686 14.686 6 18 6C21.314 6 24 8.686 24 12V16" stroke="white" strokeWidth="2.5" strokeLinecap="round"/>
                <circle cx="18" cy="23" r="2" fill="#6366f1"/>
              </svg>
            </div>
            <h2 style={{ fontSize: 20, fontWeight: 800, color: "#111827", margin: "0 0 10px" }}>
              회원 전용 서비스입니다
            </h2>
            <p style={{ fontSize: 14, color: "#6b7280", lineHeight: 1.75, margin: "0 0 6px" }}>
              <strong style={{ color: "#4f46e5" }}>{page.title}</strong>은
            </p>
            <p style={{ fontSize: 14, color: "#6b7280", lineHeight: 1.75, margin: "0 0 28px" }}>
              로그인한 회원에게만 제공되는 서비스입니다.<br />
              로그인 후 무료로 이용하실 수 있습니다.
            </p>
            <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
              <a
                href={getLoginUrl(window.location.pathname)}
                style={{
                  display: "block", padding: "13px 24px",
                  background: "#6366f1", color: "#fff",
                  borderRadius: 10, textDecoration: "none",
                  fontSize: 15, fontWeight: 700,
                }}
                onMouseEnter={(e) => (e.currentTarget.style.background = "#4f46e5")}
                onMouseLeave={(e) => (e.currentTarget.style.background = "#6366f1")}
              >
                회원 로그인하고 이용하기
              </a>
              <button
                onClick={() => setShowMembersOnlyModal(false)}
                style={{
                  display: "block", padding: "11px 24px",
                  background: "#f3f4f6", color: "#374151",
                  borderRadius: 10, border: "none",
                  fontSize: 14, fontWeight: 600, cursor: "pointer",
                }}
              >
                닫기
              </button>
            </div>
            {/* 회원가입 유도 */}
            <div style={{ marginTop: 20, paddingTop: 18, borderTop: "1px solid #f3f4f6" }}>
              <p style={{ fontSize: 13, color: "#9ca3af", margin: "0 0 6px" }}>아직 회원이 아니신가요?</p>
              <a
                href={(() => {
                  const oauthPortalUrl = import.meta.env.VITE_OAUTH_PORTAL_URL;
                  const appId = import.meta.env.VITE_APP_ID;
                  const redirectUri = `${window.location.origin}/api/oauth/callback`;
                  const statePayload = JSON.stringify({ redirectUri, returnPath: window.location.pathname });
                  const state = btoa(statePayload);
                  const url = new URL(`${oauthPortalUrl}/app-auth`);
                  url.searchParams.set("appId", appId);
                  url.searchParams.set("redirectUri", redirectUri);
                  url.searchParams.set("state", state);
                  url.searchParams.set("type", "signUp");
                  return url.toString();
                })()}
                style={{
                  fontSize: 14, fontWeight: 700,
                  color: "#6366f1", textDecoration: "none",
                  borderBottom: "1.5px solid #c7d2fe",
                  paddingBottom: 1,
                  transition: "color 0.15s",
                }}
                onMouseEnter={(e) => (e.currentTarget.style.color = "#4f46e5")}
                onMouseLeave={(e) => (e.currentTarget.style.color = "#6366f1")}
              >
                무료로 가입하기 →
              </a>
            </div>
          </div>
        </div>
      )}
      {!hideChrome && <Header />}
      {/* 비공개 미리보기 모드 안내 배너 */}
      {isPreview && isAdmin && !page.published && (
        <div style={{
          background: "#fffbeb", borderBottom: "2px solid #fbbf24",
          padding: "10px 24px", display: "flex", alignItems: "center", justifyContent: "space-between",
          gap: 12, fontSize: 13,
        }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8, color: "#92400e", fontWeight: 600 }}>
            <span style={{ fontSize: 16 }}>🔒</span>
            <span>관리자 전용 미리보기 — 이 페이지는 현재 <strong>비공개</strong> 상태입니다. 일반 방문자에게는 표시되지 않습니다.</span>
          </div>
          <a href="/admin" style={{ fontSize: 12, color: "#6366f1", textDecoration: "none", fontWeight: 600, padding: "4px 10px", border: "1px solid #c7d2fe", borderRadius: 6, background: "#eef2ff" }}>
            관리자로 돌아가기
          </a>
        </div>
      )}
      {/* 페이지 제목 영역 (섹션이 hero로 시작하지 않는 경우, showTitle 또는 showDescription이 true인 경우에만 표시) */}
      {sections.length > 0 && sections[0].type !== "hero" && (showTitle || showDescription) && (
        <div style={{ background: "#f9fafb", borderBottom: "1px solid #e5e7eb", padding: "32px 24px" }}>
          <div style={{ maxWidth: fullWidth ? "100%" : contentWidth, margin: "0 auto" }}>
            {showTitle && <h1 style={{ fontSize: "clamp(22px, 4vw, 36px)", fontWeight: 800, color: "#111827", marginBottom: 8, textAlign: titleAlign }}>{page.title}</h1>}
            {showDescription && page.description && <p style={{ fontSize: 15, color: "#6b7280", textAlign: titleAlign }}>{page.description}</p>}
          </div>
        </div>
      )}
      {/* 섹션 렌더링 */}
      {sections.map(section => (
        <RenderSection key={section.id} section={section} fullWidth={fullWidth} isAdmin={isAdmin} user={user} pageId={page.id} contentWidth={contentWidth} fullscreenDefault={fullscreenDefault} />
      ))}
      {sections.length === 0 && (
        <div style={{ maxWidth: 960, margin: "80px auto", textAlign: "center", color: "#9ca3af", padding: "0 24px" }}>
          <p style={{ fontSize: 16 }}>이 페이지는 아직 내용이 없습니다.</p>
        </div>
      )}
      {/* 하단 글 목록 (postListCategory 설정 시) */}
      {(page as any).postListCategory && (
        <PagePostList categoryKey={(page as any).postListCategory} fullWidth={fullWidth} />
      )}
      {/* 댓글 섹션 (commentsEnabled가 true인 경우) */}
      {page.commentsEnabled && (
        <div ref={commentSectionRef} style={{ borderTop: "1px solid #e5e7eb", background: "#fff" }}>
          <PageCommentsSection
            pageId={page.id}
            currentUserId={user?.id ? String(user.id) : undefined}
            isAuthenticated={!!user}
            inputRef={commentInputRef}
            onCommentCountChange={setPageCommentCount}
          />
        </div>
      )}
      {/* 왼쪽 고정 플로팅 댓글 버튼 (commentsEnabled일 때만 표시) */}
      {page.commentsEnabled && (
        <FloatingCommentButton
          commentCount={pageCommentCount}
          onClick={scrollToComments}
        />
      )}
      {!hideChrome && <Footer />}
      <style>{`
        .rich-preview p { margin: 0.8em 0; line-height: 1.8; color: #374151; }
        .rich-preview h1, .rich-preview h2, .rich-preview h3 { font-weight: 700; color: #111827; margin: 1.2em 0 0.5em; }
        .rich-preview h1 { font-size: 1.8em; }
        .rich-preview h2 { font-size: 1.4em; }
        .rich-preview h3 { font-size: 1.15em; }
        .rich-preview ul, .rich-preview ol { padding-left: 1.6em; margin: 0.7em 0; }
        .rich-preview li { margin: 0.3em 0; line-height: 1.7; }
        .rich-preview a { color: #6366f1; text-decoration: underline; }
        .rich-preview img { max-width: 100%; border-radius: 10px; margin: 1em 0; display: block; }
        .rich-preview blockquote { border-left: 4px solid #6366f1; padding: 10px 18px; margin: 1.2em 0; background: rgba(99,102,241,0.06); border-radius: 0 8px 8px 0; color: #6b7280; font-style: italic; }
        .rich-preview code { background: #f3f4f6; color: #6366f1; padding: 2px 7px; border-radius: 4px; font-size: 0.88em; }
        .rich-preview pre { background: #f8fafc; border: 1px solid #e5e7eb; border-radius: 10px; padding: 18px 20px; overflow-x: auto; margin: 1.2em 0; }
        .rich-preview table { border-collapse: collapse; width: 100%; margin: 1.2em 0; }
        .rich-preview td, .rich-preview th { border: 1px solid #e5e7eb; padding: 10px 14px; text-align: left; }
        .rich-preview th { background: #f3f4f6; font-weight: 700; }
        @media (max-width: 640px) {
          section[style*="grid-template-columns"] { grid-template-columns: 1fr !important; }
        }
        /* ─── 플로팅 댓글 버튼 스타일 ─── */

        /* 폄광 후광 폄리 애니메이션 */
        @keyframes fcb-pulse {
          0%   { box-shadow: 0 0 0 0 rgba(99,102,241,0.55); opacity: 1; }
          60%  { box-shadow: 0 0 0 14px rgba(99,102,241,0); opacity: 0.6; }
          100% { box-shadow: 0 0 0 0 rgba(99,102,241,0); opacity: 1; }
        }
        /* 전체 버튼 가시성 강조 깜박임 */
        @keyframes fcb-glow {
          0%, 100% { opacity: 1; filter: brightness(1); }
          50%       { opacity: 0.82; filter: brightness(1.18); }
        }
        /* 모바일 버튼 가시성 깜박임 */
        @keyframes fcb-mobile-glow {
          0%, 100% { box-shadow: 0 4px 16px rgba(99,102,241,0.45); }
          50%       { box-shadow: 0 4px 28px rgba(99,102,241,0.85); }
        }

        /* 폄광 후광 폄리 */
        .fcb-pulse-ring {
          position: absolute;
          width: 56px;
          height: 56px;
          border-radius: 50%;
          background: rgba(99,102,241,0.18);
          animation: fcb-pulse 2.4s ease-in-out infinite;
          pointer-events: none;
          left: 0;
          top: 50%;
          transform: translateY(-50%);
          z-index: -1;
        }

        /* 데스크탑 버튼 */
        .fcb-btn {
          position: relative;
          display: flex;
          flex-direction: column;
          align-items: center;
          gap: 8px;
          padding: 18px 13px;
          background: linear-gradient(180deg, #818cf8 0%, #6366f1 40%, #4f46e5 100%);
          color: #fff;
          border: none;
          border-radius: 0 16px 16px 0;
          cursor: pointer;
          min-width: 54px;
          box-shadow: 3px 0 20px rgba(99,102,241,0.5), inset 0 1px 0 rgba(255,255,255,0.25);
          transition: transform 0.2s, box-shadow 0.2s, filter 0.2s;
          animation: fcb-glow 2.4s ease-in-out infinite;
          outline: none;
        }
        .fcb-btn:focus-visible {
          outline: 3px solid #818cf8;
          outline-offset: 2px;
        }
        .fcb-btn-hovered {
          transform: translateX(5px) !important;
          box-shadow: 5px 0 28px rgba(99,102,241,0.7), inset 0 1px 0 rgba(255,255,255,0.3) !important;
          filter: brightness(1.1) !important;
          animation: none !important;
        }

        /* 아이콘 래퍼 */
        .fcb-icon {
          display: flex;
          align-items: center;
          justify-content: center;
          width: 36px;
          height: 36px;
          background: rgba(255,255,255,0.18);
          border-radius: 50%;
          flex-shrink: 0;
        }

        /* 세로 텍스트 */
        .fcb-text {
          font-size: 12px;
          font-weight: 800;
          writing-mode: vertical-rl;
          text-orientation: mixed;
          letter-spacing: 1.5px;
          line-height: 1.5;
          font-family: 'Noto Sans KR', sans-serif;
          text-shadow: 0 1px 3px rgba(0,0,0,0.25);
          white-space: nowrap;
        }

        /* 댓글 수 배지 */
        .fcb-badge {
          background: #fff;
          color: #4f46e5;
          border-radius: 50%;
          width: 24px;
          height: 24px;
          display: flex;
          align-items: center;
          justify-content: center;
          font-size: 11px;
          font-weight: 900;
          line-height: 1;
          box-shadow: 0 1px 4px rgba(0,0,0,0.18);
          flex-shrink: 0;
        }

        /* 모바일 버튼 */
        .fcb-mobile-btn {
          display: flex;
          align-items: center;
          gap: 7px;
          padding: 12px 18px;
          background: linear-gradient(135deg, #818cf8 0%, #6366f1 60%, #4f46e5 100%);
          color: #fff;
          border: none;
          border-radius: 28px;
          cursor: pointer;
          font-size: 14px;
          font-weight: 800;
          font-family: 'Noto Sans KR', sans-serif;
          text-shadow: 0 1px 2px rgba(0,0,0,0.2);
          animation: fcb-mobile-glow 2.4s ease-in-out infinite;
          outline: none;
        }
        .fcb-badge-mobile {
          background: #fff;
          color: #4f46e5;
          border-radius: 12px;
          padding: 2px 7px;
          font-size: 11px;
          font-weight: 900;
        }

        /* 반응형 */
        .floating-comment-desktop { display: flex !important; }
        .floating-comment-mobile { display: none !important; }
        @media (max-width: 768px) {
          .floating-comment-desktop { display: none !important; }
          .floating-comment-mobile { display: block !important; }
        }
      `}</style>
    </div>
  );
}

// ─── featured-developers 섹션: DB에서 주목 개발자 목록을 불러와 카드 그리드 렌더링 ─────
function FeaturedDevelopersSection({ bgColor, padding }: { bgColor: string; padding: string }) {
  const { data: developers, isLoading } = trpc.developers.getFeatured.useQuery(undefined, { staleTime: 5 * 60 * 1000 });

  if (isLoading) {
    return (
      <section style={{ background: bgColor, padding }}>
        <div style={{ maxWidth: 960, margin: "0 auto", textAlign: "center", color: "#9ca3af", fontSize: 13 }}>
          개발자 정보를 불러오는 중...
        </div>
      </section>
    );
  }

  if (!developers || developers.length === 0) return null;

  return (
    <section style={{ background: bgColor, padding }}>
      <div style={{ maxWidth: 960, margin: "0 auto" }}>
        {/* 섹션 헤더 */}
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 20 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <span style={{ display: "inline-block", width: 4, height: 22, background: "linear-gradient(180deg, #f59e0b, #ef4444)", borderRadius: 2 }} />
            <h2 style={{ fontSize: 18, fontWeight: 800, color: "#111827", margin: 0 }}>주목 개발자</h2>
            <span style={{ fontSize: 12, color: "#f59e0b", fontWeight: 700, background: "#fef3c7", padding: "2px 8px", borderRadius: 10 }}>
              ⭐ 이달의 바이브 코더
            </span>
          </div>
        </div>

        {/* 개발자 카드 그리드 */}
        <div style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fill, minmax(200px, 1fr))",
          gap: 16,
        }}>
          {developers.map((dev: any) => (
            <div
              key={dev.id}
              style={{
                background: "#fff",
                borderRadius: 14,
                border: "1px solid #e5e7eb",
                padding: "20px 16px",
                display: "flex",
                flexDirection: "column",
                alignItems: "center",
                textAlign: "center",
                boxShadow: "0 2px 8px rgba(245,158,11,0.07)",
                transition: "transform 0.18s, box-shadow 0.18s",
                cursor: "default",
              }}
              onMouseEnter={e => {
                (e.currentTarget as HTMLElement).style.transform = "translateY(-3px)";
                (e.currentTarget as HTMLElement).style.boxShadow = "0 8px 24px rgba(245,158,11,0.18)";
              }}
              onMouseLeave={e => {
                (e.currentTarget as HTMLElement).style.transform = "";
                (e.currentTarget as HTMLElement).style.boxShadow = "0 2px 8px rgba(245,158,11,0.07)";
              }}
            >
              {/* 프로필 이미지 */}
              <div style={{
                width: 64, height: 64, borderRadius: "50%",
                background: "linear-gradient(135deg, #f59e0b, #ef4444)",
                display: "flex", alignItems: "center", justifyContent: "center",
                fontSize: 26, fontWeight: 800, color: "#fff",
                marginBottom: 12, overflow: "hidden",
                border: "3px solid #fef3c7",
              }}>
                {dev.profileImage
                  ? <img src={dev.profileImage} alt={dev.name} style={{ width: "100%", height: "100%", objectFit: "cover" }} />
                  : (dev.name ? dev.name[0] : "?")
                }
              </div>

              {/* 이름 */}
              <div style={{ fontSize: 14, fontWeight: 800, color: "#111827", marginBottom: 2 }}>{dev.name}</div>
              {/* 유저네임 */}
              {dev.username && (
                <div style={{ fontSize: 11, color: "#8b5cf6", fontWeight: 600, marginBottom: 6 }}>@{dev.username}</div>
              )}
              {/* 자기소개 */}
              {dev.bio && (
                <div style={{
                  fontSize: 11, color: "#6b7280", lineHeight: 1.5,
                  display: "-webkit-box", WebkitLineClamp: 2, WebkitBoxOrient: "vertical" as const, overflow: "hidden",
                  marginBottom: 10,
                }}>{dev.bio}</div>
              )}

              {/* 앱 수 배지 */}
              {(dev.appCount ?? 0) > 0 && (
                <div style={{
                  fontSize: 10, fontWeight: 700,
                  background: "#ede9fe", color: "#6366f1",
                  padding: "3px 10px", borderRadius: 10,
                }}>
                  앱 {dev.appCount}개 등록
                </div>
              )}
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
