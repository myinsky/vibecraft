import { useState, useRef, useEffect, useMemo } from "react";
// lucide-react 아이콘을 인라인 SVG로 교체 (원래 ui-vendor 칠크에 lucide 포함 안 해도 됨)
const SearchIcon = ({ size = 13, style }: { size?: number; style?: React.CSSProperties }) => (
  <svg xmlns="http://www.w3.org/2000/svg" width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={style}>
    <circle cx="11" cy="11" r="8"/><path d="m21 21-4.3-4.3"/>
  </svg>
);
const PenSquareIcon = ({ size = 15 }: { size?: number }) => (
  <svg xmlns="http://www.w3.org/2000/svg" width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/>
  </svg>
);
const XIcon = ({ size = 18 }: { size?: number }) => (
  <svg xmlns="http://www.w3.org/2000/svg" width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M18 6 6 18"/><path d="m6 6 12 12"/>
  </svg>
);
const LogInIcon = ({ size = 14 }: { size?: number }) => (
  <svg xmlns="http://www.w3.org/2000/svg" width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M15 3h4a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2h-4"/><polyline points="10 17 15 12 10 7"/><line x1="15" x2="3" y1="12" y2="12"/>
  </svg>
);
const LogOutIcon = ({ size = 14 }: { size?: number }) => (
  <svg xmlns="http://www.w3.org/2000/svg" width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/><polyline points="16 17 21 12 16 7"/><line x1="21" x2="9" y1="12" y2="12"/>
  </svg>
);
const UserIcon = ({ size = 14 }: { size?: number }) => (
  <svg xmlns="http://www.w3.org/2000/svg" width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M19 21v-2a4 4 0 0 0-4-4H9a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/>
  </svg>
);
const KeyIcon = ({ size = 14 }: { size?: number }) => (
  <svg xmlns="http://www.w3.org/2000/svg" width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <circle cx="7.5" cy="15.5" r="5.5"/><path d="m21 2-9.6 9.6"/><path d="m15.5 7.5 3 3L22 7l-3-3"/>
  </svg>
);
const FileTextIcon2 = ({ size = 14 }: { size?: number }) => (
  <svg xmlns="http://www.w3.org/2000/svg" width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M15 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7Z"/><path d="M14 2v4a2 2 0 0 0 2 2h4"/><line x1="10" x2="16" y1="9" y2="9"/><line x1="10" x2="16" y1="13" y2="13"/><line x1="10" x2="14" y1="17" y2="17"/>
  </svg>
);
const SettingsIcon = ({ size = 14 }: { size?: number }) => (
  <svg xmlns="http://www.w3.org/2000/svg" width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M12.22 2h-.44a2 2 0 0 0-2 2v.18a2 2 0 0 1-1 1.73l-.43.25a2 2 0 0 1-2 0l-.15-.08a2 2 0 0 0-2.73.73l-.22.38a2 2 0 0 0 .73 2.73l.15.1a2 2 0 0 1 1 1.72v.51a2 2 0 0 1-1 1.74l-.15.09a2 2 0 0 0-.73 2.73l.22.38a2 2 0 0 0 2.73.73l.15-.08a2 2 0 0 1 2 0l.43.25a2 2 0 0 1 1 1.73V20a2 2 0 0 0 2 2h.44a2 2 0 0 0 2-2v-.18a2 2 0 0 1 1-1.73l.43-.25a2 2 0 0 1 2 0l.15.08a2 2 0 0 0 2.73-.73l.22-.39a2 2 0 0 0-.73-2.73l-.15-.08a2 2 0 0 1-1-1.74v-.5a2 2 0 0 1 1-1.74l.15-.09a2 2 0 0 0 .73-2.73l-.22-.38a2 2 0 0 0-2.73-.73l-.15.08a2 2 0 0 1-2 0l-.43-.25a2 2 0 0 1-1-1.73V4a2 2 0 0 0-2-2z"/><circle cx="12" cy="12" r="3"/>
  </svg>
);
const MenuIcon = ({ size = 20 }: { size?: number }) => (
  <svg xmlns="http://www.w3.org/2000/svg" width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <line x1="4" x2="20" y1="12" y2="12"/><line x1="4" x2="20" y1="6" y2="6"/><line x1="4" x2="20" y1="18" y2="18"/>
  </svg>
);
const Trash2Icon = ({ size = 14 }: { size?: number }) => (
  <svg xmlns="http://www.w3.org/2000/svg" width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M3 6h18"/><path d="M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6"/><path d="M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2"/><line x1="10" x2="10" y1="11" y2="17"/><line x1="14" x2="14" y1="11" y2="17"/>
  </svg>
);
import { useLocation } from "wouter";
import { useAuth } from "@/_core/hooks/useAuth";
import { getLoginUrl } from "@/const";
import { trpc } from "@/lib/trpc";
import { useSiteConfig } from "@/contexts/SiteConfigContext";

// 하드코딩 제거 - DB navItems에서 동적으로 로드
// const navItems = [...] // 삭제됨

interface HeaderProps {
  onWriteClick?: () => void;
}

export default function Header({ onWriteClick }: HeaderProps) {
  const [mobileOpen, setMobileOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [userMenuOpen, setUserMenuOpen] = useState(false);
  const [location, setLocation] = useLocation();
  const { user, isAuthenticated } = useAuth();
  const mobileMenuRef = useRef<HTMLDivElement>(null);
  const logoutMutation = trpc.auth.logout.useMutation({
    onSuccess: () => {
      window.location.href = "/";
    },
  });

  // SiteConfigContext에서 공유 데이터 읽기 (중복 네트워크 요청 방지)
  const { siteConfig, navItemsData, navCustomPages } = useSiteConfig();
  const navItems = useMemo(() => {
    const baseItems = (!navItemsData || navItemsData.length === 0)
      ? [
          { label: "AI로 만드는 자동화 프로그램", path: "/category/ai-apps", bgColor: null, textColor: null },
          { label: "진행중인 자동화 프로그램", path: "/category/my-apps", bgColor: null, textColor: null },
          { label: "AI 툴 추천", path: "/category/ai-tools", bgColor: null, textColor: null },
          { label: "자료실", path: "/category/resources", bgColor: null, textColor: null },
        ]
      : [...navItemsData]
          .filter(item => item.visible !== false && !(item.path || "").includes("__latest__"))
          .sort((a, b) => (a.sortOrder ?? 0) - (b.sortOrder ?? 0))
          .map(item => {
            const rawPath = item.path || "";
            // 바이브코딩 인사이트 특수 섹션: __vibecraft_insight__ 경로 또는 vibecraftx.com 링크 모두 홈 내 스크롤 처리
            if (
              rawPath.includes("__vibecraft_insight__") ||
              rawPath.includes("vibecraftx.com/category/ai-apps") ||
              rawPath.includes("vibecraftx.com/category")
            ) {
              return { label: item.label, path: "/__vibecraft_insight__", bgColor: (item as any).bgColor || null, textColor: (item as any).textColor || null, isVibecraftInsight: true };
            }
            // 절대 URL이 저장된 경우 상대 경로로 변환 (cross-origin pushState 오류 방지)
            let path = rawPath || "/";
            try {
              const u = new URL(path);
              // vibecraftx.com 외부 링크는 그대로 유지 (새 탭 열기)
              if (u.hostname === 'www.vibecraftx.com' || u.hostname === 'vibecraftx.com') {
                return { label: item.label, path: rawPath, bgColor: (item as any).bgColor || null, textColor: (item as any).textColor || null, isVibecraftInsight: false };
              }
              path = u.pathname + u.search + u.hash;
            } catch { /* 이미 상대 경로 */ }
            return { label: item.label, path, bgColor: (item as any).bgColor || null, textColor: (item as any).textColor || null, isVibecraftInsight: false };
          });
    // 커스텀 페이지 (show_in_nav=true) 를 메뉴 뒤에 추가
    const customPageItems = (navCustomPages ?? []).map(p => ({
      label: p.title,
      path: `/page/${p.slug}`,
      bgColor: null,
      textColor: null,
    }));
    return [...baseItems, ...customPageItems];
  }, [navItemsData, navCustomPages]);

  const isActive = (path: string) => location === path;
  // 글쓰기/다운로드 권한: 관리자는 항상 허용, 일반 회원은 canWrite/canDownload 필드 기준
  const canWrite = isAuthenticated && !user?.isBanned && (user?.role === "admin" || user?.canWrite === true);
  const canDownload = isAuthenticated && !user?.isBanned && (user?.role === "admin" || user?.canDownload !== false);

  const handleLoginClick = () => {
    window.location.href = getLoginUrl();
  };

  // 외부 클릭 시 모바일 메뉴 닫힘
  useEffect(() => {
    if (!mobileOpen) return;
    const handleClick = (e: MouseEvent) => {
      if (mobileMenuRef.current && !mobileMenuRef.current.contains(e.target as Node)) {
        setMobileOpen(false);
      }
    };
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, [mobileOpen]);

  // 모바일 메뉴 열릴 때 스크롤 방지
  useEffect(() => {
    if (mobileOpen) {
      document.body.style.overflow = "hidden";
    } else {
      document.body.style.overflow = "";
    }
    return () => { document.body.style.overflow = ""; };
  }, [mobileOpen]);

  return (
    <>
      <header style={{
        background: "#ffffff",
        borderBottom: "1px solid #e5e7eb",
        position: "sticky", top: 0, zIndex: 200,
      }}>
        <div style={{
          maxWidth: 1400, margin: "0 auto",
          padding: "0 12px",
          display: "flex", alignItems: "center",
          height: 56, gap: 0,
        }}>

          {/* Logo */}
          <a
            href="/"
            onClick={e => { e.preventDefault(); setLocation("/"); setMobileOpen(false); }}
            style={{ display: "flex", alignItems: "center", gap: 9, textDecoration: "none", marginRight: 24, flexShrink: 0 }}
          >
            <div style={{
              width: 34, height: 34,
              background: "linear-gradient(135deg, #6366f1 0%, #8b5cf6 100%)",
              borderRadius: 8,
              display: "flex", alignItems: "center", justifyContent: "center",
              fontSize: 14, fontWeight: 900, color: "white",
              boxShadow: "0 2px 8px rgba(99,102,241,0.3)",
              flexShrink: 0,
            }}>{siteConfig?.logoText ? siteConfig.logoText.slice(0, 2) : "S"}</div>
            <div>
              {/* 홈(/)에서만 H1으로 렌더링 — 시각적 스타일은 동일, SEO용 */}
              {location === "/" ? (
                <h1 style={{ fontSize: 13, fontWeight: 800, color: "#111827", lineHeight: 1.2, letterSpacing: "-0.3px", whiteSpace: "nowrap", margin: 0, padding: 0 }}>
                  {siteConfig?.siteTitle ?? "Smart Auto Guide"}
                </h1>
              ) : (
                <div style={{ fontSize: 13, fontWeight: 800, color: "#111827", lineHeight: 1.2, letterSpacing: "-0.3px", whiteSpace: "nowrap" }}>
                  {siteConfig?.siteTitle ?? "Smart Auto Guide"}
                </div>
              )}
              <div style={{ fontSize: 10, color: "#6366f1", letterSpacing: "0.3px" }}>{siteConfig?.siteSubtitle ?? "+ Vibe Coding"}</div>
            </div>
          </a>

          {/* Nav items (데스크탑) */}
          <nav style={{ display: "flex", alignItems: "center" }} className="hdr-nav">
            {navItems.map(item => {
              const navStyle = siteConfig?.navStyle || "underline";
              const activeColor = siteConfig?.navActiveColor || "#6366f1";
              const hoverColor = siteConfig?.navHoverColor || siteConfig?.navActiveColor || "#6366f1";
              const textColor = (item as any).textColor || siteConfig?.navTextColor || "#374151";
              const fontWeight = Number(siteConfig?.navFontWeight || 600);
              const fontFamily = siteConfig?.navFontFamily || undefined;
              const active = isActive(item.path);
              const hasBgColor = (item as any).bgColor && !active;

              // 스타일별 스타일 계산
              const getNavItemStyle = (): React.CSSProperties => {
                const base: React.CSSProperties = {
                  padding: "0 13px", height: 56,
                  fontSize: siteConfig?.navFontSize || "13px",
                  fontWeight,
                  fontFamily,
                  color: active ? activeColor : textColor,
                  textDecoration: "none",
                  display: "flex", alignItems: "center",
                  transition: "color 0.15s, border-color 0.15s, background 0.15s, box-shadow 0.15s",
                  whiteSpace: "nowrap",
                  position: "relative",
                };
                if (hasBgColor) {
                  return { ...base, background: (item as any).bgColor, borderRadius: 6, padding: "0 10px", height: 32, margin: "0 2px" };
                }
                switch (navStyle) {
                  // 1. 하단 밑줄 (가장 보편적 탭 스타일)
                  case "underline":
                    return { ...base, borderBottom: active ? `2px solid ${activeColor}` : "2px solid transparent" };
                  // 2. 두꺼운 하단 라인
                  case "bold-line":
                    return { ...base, borderBottom: active ? `3px solid ${activeColor}` : "3px solid transparent" };
                  // 3. 둥근 배지형 (Pill)
                  case "pill":
                    return { ...base, height: 34, padding: "0 16px", margin: "0 2px",
                      background: active ? activeColor : "transparent",
                      color: active ? "#fff" : textColor,
                      borderRadius: 20,
                      border: active ? `1.5px solid ${activeColor}` : "1.5px solid transparent" };
                  // 4. 떠오르는 카드형 (Floating)
                  case "floating":
                    return { ...base, height: 34, padding: "0 14px", margin: "0 3px",
                      background: active ? "#fff" : "transparent",
                      color: active ? activeColor : textColor,
                      borderRadius: 8,
                      boxShadow: active ? `0 4px 14px rgba(0,0,0,0.12), 0 0 0 1px ${activeColor}22` : "none",
                      border: "none",
                      transform: active ? "translateY(-1px)" : "none" };
                  // 5. 네온 글로우 (Neon)
                  case "neon":
                    return { ...base,
                      color: active ? activeColor : textColor,
                      borderBottom: active ? `2px solid ${activeColor}` : "2px solid transparent",
                      textShadow: active ? `0 0 8px ${activeColor}88, 0 0 16px ${activeColor}44` : "none",
                      filter: active ? `drop-shadow(0 0 4px ${activeColor}66)` : "none" };
                  // 6. 칩형 (Chip) — 비활성도 테두리 표시
                  case "chip":
                    return { ...base, height: 30, padding: "0 14px", margin: "0 3px",
                      background: active ? `${activeColor}15` : "transparent",
                      color: active ? activeColor : textColor,
                      borderRadius: 6,
                      border: active ? `1.5px solid ${activeColor}` : `1.5px solid #d1d5db` };
                  // 7. 사선 강조 (Slash)
                  case "slash":
                    return { ...base,
                      color: active ? activeColor : textColor,
                      borderBottom: active ? `2px solid ${activeColor}` : "2px solid transparent",
                      paddingLeft: active ? "16px" : "13px",
                      paddingRight: active ? "16px" : "13px",
                      background: active
                        ? `linear-gradient(135deg, ${activeColor}12 0%, transparent 60%)`
                        : "transparent" };
                  // 8. 유리 반투명 (Glass)
                  case "glass":
                    return { ...base, height: 34, padding: "0 14px", margin: "0 2px",
                      background: active
                        ? `rgba(255,255,255,0.25)`
                        : "transparent",
                      backdropFilter: active ? "blur(8px)" : "none",
                      color: active ? activeColor : textColor,
                      borderRadius: 8,
                      border: active ? `1px solid rgba(255,255,255,0.5)` : "1px solid transparent",
                      boxShadow: active ? `0 2px 8px rgba(0,0,0,0.08), inset 0 1px 0 rgba(255,255,255,0.6)` : "none" };
                  case "plain":
                  default:
                    return { ...base };
                }
              };

              return (
<a
                  key={item.path}
                  href={item.path}
                  onClick={e => {
                    e.preventDefault();
                    if ((item as any).isVibecraftInsight) {
                      // 바이브코딩 인사이트: 홈으로 이동 후 해당 섹션으로 스크롤
                      if (window.location.pathname !== '/') {
                        setLocation('/');
                        setTimeout(() => {
                          const el = document.getElementById('vibecraft-insight-section');
                          if (el) el.scrollIntoView({ behavior: 'smooth', block: 'start' });
                        }, 400);
                      } else {
                        const el = document.getElementById('vibecraft-insight-section');
                        if (el) el.scrollIntoView({ behavior: 'smooth', block: 'start' });
                      }
                    } else if (item.path.startsWith('http://') || item.path.startsWith('https://')) {
                      window.location.href = item.path;
                    } else {
                      setLocation(item.path);
                    }
                  }}
                  style={getNavItemStyle()}
                  onMouseEnter={e => {
                    if (!active) {
                      const el = e.currentTarget as HTMLElement;
                      el.style.color = hoverColor;
                      if (navStyle === "underline" || navStyle === "bold-line" || navStyle === "neon" || navStyle === "slash")
                        el.style.borderBottomColor = hoverColor;
                      if (navStyle === "pill")
                        { el.style.background = `${hoverColor}18`; el.style.borderColor = hoverColor; }
                      if (navStyle === "chip")
                        { el.style.background = `${hoverColor}10`; el.style.borderColor = hoverColor; }
                      if (navStyle === "floating")
                        { el.style.background = "#f9fafb"; el.style.boxShadow = "0 2px 8px rgba(0,0,0,0.08)"; }
                      if (navStyle === "glass")
                        { el.style.background = "rgba(255,255,255,0.15)"; el.style.borderColor = "rgba(255,255,255,0.3)"; }
                      if (navStyle === "slash")
                        el.style.background = `linear-gradient(135deg, ${hoverColor}0d 0%, transparent 60%)`;
                    }
                  }}
                  onMouseLeave={e => {
                    if (!active) {
                      const el = e.currentTarget as HTMLElement;
                      el.style.color = (item as any).textColor || textColor;
                      if (navStyle === "underline" || navStyle === "bold-line" || navStyle === "neon" || navStyle === "slash")
                        el.style.borderBottomColor = "transparent";
                      if (navStyle === "pill" || navStyle === "chip")
                        { el.style.background = "transparent"; el.style.borderColor = navStyle === "chip" ? "#d1d5db" : "transparent"; }
                      if (navStyle === "floating")
                        { el.style.background = "transparent"; el.style.boxShadow = "none"; }
                      if (navStyle === "glass")
                        { el.style.background = "transparent"; el.style.borderColor = "transparent"; }
                      if (navStyle === "slash")
                        el.style.background = "transparent";
                    }
                  }}
                >
                  {item.label}
                </a>
              );
            })}
          </nav>

          {/* Right side */}
          <div style={{ display: "flex", alignItems: "center", gap: 8, marginLeft: "auto", flexShrink: 0 }}>

            {/* Inline search bar (데스크탑) */}
            <div
              className="hdr-search-wrap"
              style={{
                display: "flex", alignItems: "center",
                background: "#f9fafb",
                border: "1px solid #e5e7eb",
                borderRadius: 8,
                overflow: "hidden",
                height: 34,
                transition: "border-color 0.15s",
              }}
              onMouseEnter={e => (e.currentTarget as HTMLElement).style.borderColor = "#6366f1"}
              onMouseLeave={e => (e.currentTarget as HTMLElement).style.borderColor = "#e5e7eb"}
            >
              <SearchIcon size={13} style={{ marginLeft: 10, color: "#6b7280", flexShrink: 0 }} />
              <input
                type="text"
                value={searchQuery}
                onChange={e => setSearchQuery(e.target.value)}
                placeholder="게시물 검색..."
                className="hdr-search-input"
                style={{
                  background: "none", border: "none", outline: "none",
                  padding: "0 10px 0 7px",
                  fontSize: 12, color: "#111827",
                  width: 160,
                }}
                onKeyDown={e => {
                  if (e.key === "Enter" && searchQuery.trim()) {
                    setLocation(`/search?q=${encodeURIComponent(searchQuery.trim())}`);
                    setSearchQuery("");
                  }
                }}
              />
              {searchQuery && (
                <button
                  onClick={() => setSearchQuery("")}
                  aria-label="검색어 지우기"
                  style={{
                    background: "none", border: "none", cursor: "pointer",
                    padding: "0 8px 0 0", color: "#4b5563",
                    display: "flex", alignItems: "center",
                  }}
                >
                  <XIcon size={12} />
                </button>
              )}
            </div>

            {/* Write button — 로그인 회원은 글쓰기, 비로그인은 로그인 유도 */}
            {(!isAuthenticated || canWrite) && (
              <button
                onClick={() => {
                  if (!isAuthenticated) {
                    window.location.href = getLoginUrl(window.location.pathname);
                    return;
                  }
                  if (onWriteClick) onWriteClick();
                  else setLocation("/write");
                  setMobileOpen(false);
                }}
                className="hdr-write-btn"
                style={{
                  display: "flex", alignItems: "center", gap: 6,
                  padding: "6px 14px", borderRadius: 7,
                  background: isAuthenticated
                    ? "linear-gradient(135deg, #6366f1, #8b5cf6)"
                    : "#f3f4f6",
                  border: isAuthenticated ? "none" : "1px solid #e5e7eb",
                  fontSize: 12, fontWeight: 700,
                  color: isAuthenticated ? "#fff" : "#6366f1",
                  cursor: "pointer",
                  boxShadow: isAuthenticated ? "0 2px 8px rgba(99,102,241,0.2)" : "none",
                  whiteSpace: "nowrap",
                }}
              >
                <PenSquareIcon size={13} /> 글쓰기
              </button>
            )}

            {/* Login / User menu (데스크탑) */}
            <div className="hdr-user-area">
              {isAuthenticated ? (
                <div style={{ position: "relative" }}>
                  <button
                    onClick={() => setUserMenuOpen(!userMenuOpen)}
                    aria-label="사용자 메뉴 열기"
                    aria-expanded={userMenuOpen}
                    aria-haspopup="menu"
                    style={{
                      display: "flex", alignItems: "center", gap: 7,
                      padding: "5px 12px", borderRadius: 7,
                      background: "#f3f4f6",
                      border: "1px solid #e5e7eb",
                      fontSize: 12, fontWeight: 600, color: "#374151",
                      cursor: "pointer",
                      whiteSpace: "nowrap",
                    }}
                  >
                    <div style={{
                      width: 22, height: 22, borderRadius: "50%",
                      background: "linear-gradient(135deg, #6366f1, #8b5cf6)",
                      display: "flex", alignItems: "center", justifyContent: "center",
                    }}>
                      <UserIcon size={12} />
                    </div>
                    <span className="hdr-username">{(user as any)?.username || user?.name || "사용자"}</span>
                  </button>

                  {userMenuOpen && (
                    <>
                      <div
                        style={{ position: "fixed", inset: 0, zIndex: 299 }}
                        onClick={() => setUserMenuOpen(false)}
                      />
                      <div style={{
                        position: "absolute", top: "calc(100% + 8px)", right: 0,
                        background: "#ffffff", border: "1px solid #e5e7eb",
                        borderRadius: 10, padding: "6px 0", minWidth: 160,
                        boxShadow: "0 8px 24px rgba(0,0,0,0.10)",
                        zIndex: 300,
                      }}>
                        <div style={{
                          padding: "10px 16px 8px",
                          borderBottom: "1px solid #e5e7eb",
                        }}>
                          <div style={{ fontSize: 13, fontWeight: 700, color: "#111827" }}>{(user as any)?.username || user?.name}</div>
                          <div style={{ fontSize: 11, color: "#6b7280", marginTop: 2 }}>{user?.email ?? ""}</div>
                        </div>
                        {user?.role === "admin" && (
                          <button
                            onClick={() => { setUserMenuOpen(false); setLocation("/admin"); }}
                            style={{
                              display: "flex", alignItems: "center", gap: 8,
                              width: "100%", padding: "9px 16px",
                              background: "none", border: "none",
                              fontSize: 12, fontWeight: 600, color: "#6366f1",
                              cursor: "pointer", textAlign: "left",
                              transition: "background 0.1s",
                            }}
                            onMouseEnter={e => (e.currentTarget as HTMLElement).style.background = "#f5f3ff"}
                            onMouseLeave={e => (e.currentTarget as HTMLElement).style.background = "none"}
                          >
                            <SettingsIcon size={13} /> 관리자 설정
                          </button>
                        )}
                        {user?.role === "admin" && (
                          <button
                            onClick={() => { setUserMenuOpen(false); setLocation("/admin?tab=pages"); }}
                            style={{
                              display: "flex", alignItems: "center", gap: 8,
                              width: "100%", padding: "9px 16px",
                              background: "none", border: "none",
                              fontSize: 12, fontWeight: 600, color: "#0891b2",
                              cursor: "pointer", textAlign: "left",
                              transition: "background 0.1s",
                            }}
                            onMouseEnter={e => (e.currentTarget as HTMLElement).style.background = "#ecfeff"}
                            onMouseLeave={e => (e.currentTarget as HTMLElement).style.background = "none"}
                          >
                            <FileTextIcon2 size={13} /> 페이지 글쓰기
                          </button>
                        )}
                        {canWrite && (
                        <button
                          onClick={() => { setUserMenuOpen(false); setLocation("/write"); }}
                          style={{
                            display: "flex", alignItems: "center", gap: 8,
                            width: "100%", padding: "9px 16px",
                            background: "none", border: "none",
                            fontSize: 12, fontWeight: 600, color: "#374151",
                            cursor: "pointer", textAlign: "left",
                            transition: "background 0.1s",
                          }}
                          onMouseEnter={e => (e.currentTarget as HTMLElement).style.background = "#f9fafb"}
                          onMouseLeave={e => (e.currentTarget as HTMLElement).style.background = "none"}
                        >
                          <PenSquareIcon size={13} /> 글쓰기
                        </button>
                        )}
                        <button
                          onClick={() => { setUserMenuOpen(false); setLocation("/drafts"); }}
                          style={{
                            display: "flex", alignItems: "center", gap: 8,
                            width: "100%", padding: "9px 16px",
                            background: "none", border: "none",
                            fontSize: 12, fontWeight: 600, color: "#374151",
                            cursor: "pointer", textAlign: "left",
                            transition: "background 0.1s",
                          }}
                          onMouseEnter={e => (e.currentTarget as HTMLElement).style.background = "#f9fafb"}
                          onMouseLeave={e => (e.currentTarget as HTMLElement).style.background = "none"}
                        >
                          <FileTextIcon2 size={13} /> 임시저장
                        </button>
                        {user?.role === "admin" && (
                        <button
                          onClick={() => { setUserMenuOpen(false); setLocation("/admin?tab=trash"); }}
                          style={{
                            display: "flex", alignItems: "center", gap: 8,
                            width: "100%", padding: "9px 16px",
                            background: "none", border: "none",
                            fontSize: 12, fontWeight: 600, color: "#374151",
                            cursor: "pointer", textAlign: "left",
                            transition: "background 0.1s",
                          }}
                          onMouseEnter={e => (e.currentTarget as HTMLElement).style.background = "#f9fafb"}
                          onMouseLeave={e => (e.currentTarget as HTMLElement).style.background = "none"}
                        >
                          <Trash2Icon size={13} /> 보관함
                        </button>
                        )}
                        <button
                          onClick={() => { setUserMenuOpen(false); setLocation("/my-profile"); }}
                          style={{
                            display: "flex", alignItems: "center", gap: 8,
                            width: "100%", padding: "9px 16px",
                            background: "none", border: "none",
                            fontSize: 12, fontWeight: 600, color: "#374151",
                            cursor: "pointer", textAlign: "left",
                            transition: "background 0.1s",
                          }}
                          onMouseEnter={e => (e.currentTarget as HTMLElement).style.background = "#f9fafb"}
                          onMouseLeave={e => (e.currentTarget as HTMLElement).style.background = "none"}
                        >
                          <UserIcon size={13} /> 내 정보 수정
                        </button>
                        <div style={{ borderTop: "1px solid #e5e7eb", margin: "4px 0" }} />
                        <button
                          onClick={() => { setUserMenuOpen(false); logoutMutation.mutate(); }}
                          style={{
                            display: "flex", alignItems: "center", gap: 8,
                            width: "100%", padding: "9px 16px",
                            background: "none", border: "none",
                            fontSize: 12, fontWeight: 600, color: "#ef4444",
                            cursor: "pointer", textAlign: "left",
                            transition: "background 0.1s",
                          }}
                          onMouseEnter={e => (e.currentTarget as HTMLElement).style.background = "#fff5f5"}
                          onMouseLeave={e => (e.currentTarget as HTMLElement).style.background = "none"}
                        >
                          <LogOutIcon size={13} /> 로그아웃
                        </button>
                      </div>
                    </>
                  )}
                </div>
              ) : (
                <button
                  onClick={handleLoginClick}
                  style={{
                    display: "flex", alignItems: "center", gap: 6,
                    padding: "6px 14px", borderRadius: 7,
                    background: "#f3f4f6",
                    border: "1px solid #e5e7eb",
                    fontSize: 12, fontWeight: 600, color: "#374151",
                    cursor: "pointer",
                    whiteSpace: "nowrap",
                    transition: "all 0.15s",
                  }}
                  onMouseEnter={e => {
                    (e.currentTarget as HTMLElement).style.background = "#6366f1";
                    (e.currentTarget as HTMLElement).style.color = "#fff";
                    (e.currentTarget as HTMLElement).style.borderColor = "#6366f1";
                  }}
                  onMouseLeave={e => {
                    (e.currentTarget as HTMLElement).style.background = "#f3f4f6";
                    (e.currentTarget as HTMLElement).style.color = "#374151";
                    (e.currentTarget as HTMLElement).style.borderColor = "#e5e7eb";
                  }}
                >
                  <LogInIcon size={13} /> 로그인
                </button>
              )}
            </div>

            {/* 햄버거 버튼 (모바일) */}
            <button
              className="mobile-btn"
              onClick={() => setMobileOpen(!mobileOpen)}
              aria-label={mobileOpen ? "메뉴 닫기" : "메뉴 열기"}
              aria-expanded={mobileOpen}
              aria-controls="mobile-menu"
              style={{
                display: "none",
                alignItems: "center", justifyContent: "center",
                width: 36, height: 36,
                background: "none", border: "1px solid #e5e7eb",
                borderRadius: 8, cursor: "pointer",
                color: "#374151",
                transition: "all 0.15s",
              }}
              onMouseEnter={e => {
                (e.currentTarget as HTMLElement).style.background = "#f3f4f6";
                (e.currentTarget as HTMLElement).style.borderColor = "#6366f1";
              }}
              onMouseLeave={e => {
                (e.currentTarget as HTMLElement).style.background = "none";
                (e.currentTarget as HTMLElement).style.borderColor = "#e5e7eb";
              }}
            >
              {mobileOpen ? <XIcon size={18} /> : <MenuIcon size={18} />}
            </button>
          </div>

        </div>

        <style>{`
          /* 860px 이하: 데스크탑 nav 숨김, 햄버거 표시 */
          @media (max-width: 860px) {
            .hdr-nav { display: none !important; }
            .mobile-btn { display: flex !important; }
            .hdr-search-input { width: 100px !important; }
            .hdr-username { display: none !important; }
          }
          @media (max-width: 600px) {
            .hdr-search-wrap { display: none !important; }
            .hdr-write-btn span { display: none; }
          }
          @media (max-width: 480px) {
            .hdr-user-area { display: none !important; }
          }
        `}</style>
      </header>

      {/* 모바일 드롭다운 메뉴 오버레이 */}
      {mobileOpen && (
        <>
          {/* 반투명 배경 오버레이 */}
          <div
            style={{
              position: "fixed", inset: 0, zIndex: 198,
              background: "rgba(0,0,0,0.35)",
            }}
            onClick={() => setMobileOpen(false)}
          />
          {/* 드롭다운 패널 */}
          <div
            id="mobile-menu"
            ref={mobileMenuRef}
            role="navigation"
            aria-label="모바일 내비게이션"
            style={{
              position: "fixed", top: 56, left: 0, right: 0,
              zIndex: 199,
              background: "#ffffff",
              borderBottom: "1px solid #e5e7eb",
              boxShadow: "0 8px 32px rgba(0,0,0,0.12)",
              animation: "slideDown 0.2s ease-out",
            }}
          >
            {/* 모바일 검색 */}
            <div style={{ padding: "12px 16px", borderBottom: "1px solid #f3f4f6" }}>
              <div style={{
                display: "flex", alignItems: "center",
                background: "#f9fafb", border: "1px solid #e5e7eb",
                borderRadius: 8, padding: "8px 12px", gap: 8,
              }}>
                <SearchIcon size={14} style={{ color: "#6b7280" }} />
                <input
                  type="text"
                  placeholder="게시물 검색..."
                  style={{
                    background: "none", border: "none", outline: "none",
                    fontSize: 13, color: "#111827", flex: 1,
                  }}
                  onKeyDown={e => {
                    if (e.key === "Enter") {
                      const val = (e.target as HTMLInputElement).value.trim();
                      if (val) {
                        setLocation(`/search?q=${encodeURIComponent(val)}`);
                        setMobileOpen(false);
                      }
                    }
                  }}
                />
              </div>
            </div>

            {/* 메뉴 항목 */}
            {navItems.map((item, idx) => {
              const mActiveColor = siteConfig?.navActiveColor || "#6366f1";
              const mTextColor = (item as any).textColor || siteConfig?.navTextColor || "#111827";
              const mFontWeight = Number(siteConfig?.navFontWeight || 600);
              const mFontFamily = siteConfig?.navFontFamily || undefined;
              const mActive = isActive(item.path);
              return (
<a
                  key={item.path}
                  href={item.path}
                  onClick={e => {
                    e.preventDefault();
                    setMobileOpen(false);
                    if ((item as any).isVibecraftInsight) {
                      // 바이브코딩 인사이트: 홈으로 이동 후 해당 섹션으로 스크롤
                      if (window.location.pathname !== '/') {
                        setLocation('/');
                        setTimeout(() => {
                          const el = document.getElementById('vibecraft-insight-section');
                          if (el) el.scrollIntoView({ behavior: 'smooth', block: 'start' });
                        }, 400);
                      } else {
                        const el = document.getElementById('vibecraft-insight-section');
                        if (el) el.scrollIntoView({ behavior: 'smooth', block: 'start' });
                      }
                    } else if (item.path.startsWith('http://') || item.path.startsWith('https://')) {
                      window.location.href = item.path;
                    } else {
                      setLocation(item.path);
                    }
                  }}
                  style={{
                    display: "flex", alignItems: "center", justifyContent: "space-between",
                    padding: "14px 20px",
                    fontSize: siteConfig?.navFontSize || "14px",
                    fontWeight: mActive ? Math.min(mFontWeight + 100, 900) : mFontWeight,
                    fontFamily: mFontFamily,
                    color: mActive ? mActiveColor : mTextColor,
                    textDecoration: "none",
                    borderBottom: idx < navItems.length - 1 ? "1px solid #f3f4f6" : "none",
                    background: mActive ? `${mActiveColor}12` : ((item as any).bgColor || "transparent"),
                    transition: "background 0.1s",
                    borderLeft: mActive ? `3px solid ${mActiveColor}` : "3px solid transparent",
                  }}
                  onMouseEnter={e => {
                    if (!mActive)
                      (e.currentTarget as HTMLElement).style.background = (item as any).bgColor
                        ? (item as any).bgColor + "cc"
                        : "#f9fafb";
                  }}
                  onMouseLeave={e => {
                    if (!mActive)
                      (e.currentTarget as HTMLElement).style.background = (item as any).bgColor || "transparent";
                  }}
                >
                  <span>{item.label}</span>
                  {mActive && (
                    <span style={{
                      width: 6, height: 6, borderRadius: "50%",
                      background: mActiveColor, flexShrink: 0,
                    }} />
                  )}
                </a>
              );
            })}

            {/* 모바일 하단 액션 */}
            <div style={{
              padding: "12px 16px 16px",
              borderTop: "1px solid #f3f4f6",
              display: "flex", flexDirection: "column", gap: 8,
            }}>
              {isAuthenticated ? (
                <>
                  {/* 사용자 정보 */}
                  <div style={{
                    display: "flex", alignItems: "center", gap: 10,
                    padding: "10px 14px",
                    background: "#f9fafb", borderRadius: 8,
                    border: "1px solid #e5e7eb",
                  }}>
                    <div style={{
                      width: 32, height: 32, borderRadius: "50%",
                      background: "linear-gradient(135deg, #6366f1, #8b5cf6)",
                      display: "flex", alignItems: "center", justifyContent: "center",
                      flexShrink: 0,
                    }}>
                      <UserIcon size={15} />
                    </div>
                    <div>
                      <div style={{ fontSize: 13, fontWeight: 700, color: "#111827" }}>{(user as any)?.username || user?.name || "사용자"}</div>
                      <div style={{ fontSize: 11, color: "#6b7280" }}>{user?.email ?? ""}</div>
                    </div>
                  </div>
                  {/* 글쓰기 — canWrite 권한 있는 회원만 표시 */}
                  {canWrite && (
                  <button
                    onClick={() => {
                      if (onWriteClick) onWriteClick();
                      else setLocation("/write");
                      setMobileOpen(false);
                    }}
                    style={{
                      display: "flex", alignItems: "center", justifyContent: "center", gap: 8,
                      width: "100%", padding: "11px 14px",
                      background: "linear-gradient(135deg, #6366f1, #8b5cf6)",
                      border: "none", borderRadius: 8,
                      fontSize: 13, color: "#fff", cursor: "pointer", fontWeight: 700,
                    }}
                  >
                    <PenSquareIcon size={14} /> 글쓰기
                  </button>
                  )}
                  {user?.role === "admin" && (
                    <button
                      onClick={() => { setLocation("/admin"); setMobileOpen(false); }}
                      style={{
                        display: "flex", alignItems: "center", justifyContent: "center", gap: 8,
                        width: "100%", padding: "10px 14px",
                        background: "#f5f3ff", border: "1px solid #e0e7ff",
                        borderRadius: 8, fontSize: 13, color: "#6366f1",
                        cursor: "pointer", fontWeight: 700,
                      }}
                    >
                      <SettingsIcon size={14} /> 관리자 설정
                    </button>
                  )}
                  {user?.role === "admin" && (
                    <button
                      onClick={() => { setLocation("/admin?tab=pages"); setMobileOpen(false); }}
                      style={{
                        display: "flex", alignItems: "center", justifyContent: "center", gap: 8,
                        width: "100%", padding: "10px 14px",
                        background: "#ecfeff", border: "1px solid #a5f3fc",
                        borderRadius: 8, fontSize: 13, color: "#0891b2",
                        cursor: "pointer", fontWeight: 700,
                      }}
                    >
                      <FileTextIcon2 size={14} /> 페이지 글쓰기
                    </button>
                  )}
                  <button
                    onClick={() => { setLocation("/my-profile"); setMobileOpen(false); }}
                    style={{
                      display: "flex", alignItems: "center", justifyContent: "center", gap: 8,
                      width: "100%", padding: "10px 14px",
                      background: "#f9fafb", border: "1px solid #e5e7eb",
                      borderRadius: 8, fontSize: 13, color: "#374151",
                      cursor: "pointer", fontWeight: 600,
                    }}
                  >
                    <UserIcon size={14} /> 내 정보 수정
                  </button>
                  <button
                    onClick={() => { logoutMutation.mutate(); setMobileOpen(false); }}
                    style={{
                      display: "flex", alignItems: "center", justifyContent: "center", gap: 8,
                      width: "100%", padding: "10px 14px",
                      background: "#fff5f5", border: "1px solid #fecaca",
                      borderRadius: 8, fontSize: 13, color: "#ef4444",
                      cursor: "pointer", fontWeight: 600,
                    }}
                  >
                    <LogOutIcon size={14} /> 로그아웃
                  </button>
                </>
              ) : (
                <button
                  onClick={() => { handleLoginClick(); setMobileOpen(false); }}
                  style={{
                    display: "flex", alignItems: "center", justifyContent: "center", gap: 8,
                    width: "100%", padding: "12px 14px",
                    background: "linear-gradient(135deg, #6366f1, #8b5cf6)",
                    border: "none", borderRadius: 8,
                    fontSize: 14, color: "#fff", cursor: "pointer", fontWeight: 700,
                  }}
                >
                  <LogInIcon size={15} /> 로그인
                </button>
              )}
            </div>
          </div>
        </>
      )}

      <style>{`
        @keyframes slideDown {
          from { opacity: 0; transform: translateY(-8px); }
          to   { opacity: 1; transform: translateY(0); }
        }
      `}</style>
    </>
  );
}
