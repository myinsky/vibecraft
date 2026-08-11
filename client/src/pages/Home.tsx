import React from "react";
import { getPostUrl } from "@/lib/postUrl";
import { Link } from "wouter";
import Header from "../components/Header";
import Footer from "../components/Footer";

// 서버에서 HTML에 주입된 초기 데이터 타입 (window.__INITIAL_DATA__)
declare global {
  interface Window {
    __INITIAL_DATA__?: {
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
        createdAt: string; // JSON 직렬화 후 string
      }>;
    };
  }
}
import Sidebar from "../components/Sidebar";
import VibeCodingSection from "../components/VibeCodingSection";
import AiToolsSection from "../components/AiToolsSection";
import { type Post } from "../data/blogData";
import { trpc } from "@/lib/trpc";
import { useSiteConfig } from "@/contexts/SiteConfigContext";
import { usePostPrefetch } from "@/hooks/usePostPrefetch";
import { useMemo, useState, useEffect, useRef, lazy, Suspense } from "react";
// lucide-react 아이콘을 SVG 인라인으로 교체 (초기 번들 경량화)
// Home.tsx는 lazy 청크이므로 lucide가 markdown-runtime 청크에 중복 포함되는 것을 방지
const PackageIcon = ({ size = 13 }: { size?: number }) => (
  <svg xmlns="http://www.w3.org/2000/svg" width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="m7.5 4.27 9 5.15"/><path d="M21 8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16Z"/><path d="m3.3 7 8.7 5 8.7-5"/><path d="M12 22V12"/>
  </svg>
);
const DownloadIcon = ({ size = 16, color, style }: { size?: number; color?: string; style?: React.CSSProperties }) => (
  <svg xmlns="http://www.w3.org/2000/svg" width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color || "currentColor"} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={style}>
    <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" x2="12" y1="3" y2="15"/>
  </svg>
);
const FileTextIcon = ({ size = 14, color }: { size?: number; color?: string }) => (
  <svg xmlns="http://www.w3.org/2000/svg" width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color || "currentColor"} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M15 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7Z"/><path d="M14 2v4a2 2 0 0 0 2 2h4"/><line x1="10" x2="16" y1="9" y2="9"/><line x1="10" x2="16" y1="13" y2="13"/><line x1="10" x2="14" y1="17" y2="17"/>
  </svg>
);
import { LazySectionWrapper } from "@/components/LazySectionWrapper";
import FeaturedDevelopersSection from "@/components/FeaturedDevelopersSection";
import { useSEO } from "@/hooks/useSEO";
import { useJsonLd } from "@/hooks/useJsonLd";
import { getCategoryPlaceholder } from "@/lib/categoryPlaceholder";
// StatBannerSection: 스크롤 아래에서만 사용되므로 lazy 분리 (Home 청크 경량화)
const StatBannerSection = lazy(() => import("@/components/StatBannerSection"));
import { makeSrcSet, CARD_SIZES } from "@/lib/imageUtils";
import LazyImage from "@/components/LazyImage";

/** 메인 섹션 광고 배너 컴포넌트 */
function HomeAdBanner({ slotCode, scriptCode, position = "home_section" }: { slotCode: string; scriptCode: string; position?: string }) {
  const ref = useRef<HTMLDivElement>(null);
  const logClick = trpc.ads.logClick.useMutation();
  useEffect(() => {
    if (!ref.current || !slotCode.trim() || !scriptCode.trim()) return;
    // publisher ID 추출 (data-ad-client)
    const clientMatch = scriptCode.match(/data-ad-client=["']([^"']+)["']/) ||
      scriptCode.match(/adsbygoogle\.js\?client=([^"'&\s]+)/);
    const clientId = clientMatch?.[1] ?? "";
    if (!clientId) return;
    // 이미 렌더링된 경우 스킵
    if (ref.current.querySelector("ins")) return;
    const ins = document.createElement("ins");
    ins.className = "adsbygoogle";
    ins.style.cssText = "display:block;width:100%;";
    ins.setAttribute("data-ad-client", clientId);
    ins.setAttribute("data-ad-slot", slotCode.trim());
    ins.setAttribute("data-ad-format", "auto");
    ins.setAttribute("data-full-width-responsive", "true");
    ref.current.appendChild(ins);
    try { (window as any).adsbygoogle = (window as any).adsbygoogle || []; (window as any).adsbygoogle.push({}); } catch {}
  }, [slotCode, scriptCode]);
  return (
    <div
      ref={ref}
      style={{ width: "100%", minHeight: "clamp(90px, 20vw, 250px)", height: "clamp(90px, 20vw, 250px)", margin: "12px 0", background: "transparent", overflow: "hidden", contain: "layout size", contentVisibility: "auto", containIntrinsicSize: "0 250px" }}
      aria-label="광고"
      onClick={() => logClick.mutate({ position, slotNum: 1 })}
    />
  );
}

/** navItem path에서 카테고리 키 추출 */
function extractKey(path: string): string {
  const m = path.match(/\/category\/([^/?#]+)/);
  return m ? m[1] : path.replace(/^.*\//, "");
}

// 카테고리 색상 팔레트 (순환)
const COLOR_PALETTE = ["#7c3aed", "#e11d48", "#10b981", "#0ea5e9", "#f59e0b", "#6366f1", "#ec4899"];

function dbPostToPost(
  dbPost: {
    id: number;
    title: string;
    content: string;
    excerpt: string | null;
    thumbnail: string | null;
    category: string;
    tag: string | null;
    badge: string | null;
    views: number;
    likes: number;
    createdAt: Date;
    isPinned?: boolean;
    slug?: string | null;
    customSlug?: string | null;
  },
  categoryLabel: string,
  categoryColor: string
): Post {
  return {
    id: dbPost.id,
    title: dbPost.title,
    excerpt: dbPost.excerpt || dbPost.content
      .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, "")
      .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, "")
      .replace(/<[^>]*>/g, "")
      .replace(/\s+/g, " ")
      .trim()
      .slice(0, 120) + "...",
    image: dbPost.thumbnail || "",
    category: categoryLabel,
    categoryColor,
    date: new Date(dbPost.createdAt).toLocaleDateString("ko-KR", { year: "numeric", month: "2-digit", day: "2-digit" }),
    views: dbPost.views,
    likes: dbPost.likes,
    badge: dbPost.badge || undefined,
    isPinned: dbPost.isPinned ?? false,
    slug: dbPost.slug ?? undefined,
    customSlug: dbPost.customSlug ?? undefined,
  };
}

// ─── 동적 카테고리 섹션 컴포넌트 ───────────────────────────────────────────
// sectionStyle에 따라 다른 레이아웃으로 렌더링
function CategorySection({
  categoryKey,
  label,
  description,
  color,
  sectionStyle,
  displayRows,
  thumbSize,
  bgColor,
  isFirst,
  adSlotCode,
  adScriptCode,
  adPosition,
  showAd,
  sortMode,
  preloadedPosts,
  postCountOverride,
  queryEnabled,
}: {
  categoryKey: string;
  label: string;
  description: string;
  color: string;
  sectionStyle: "featured" | "grid" | "apps" | "overlay" | "list" | "list2" | "download-grid" | "download-row" | "download-card";
  displayRows?: number;
  thumbSize?: "sm" | "md" | "lg";
  bgColor?: string | null;
  isFirst?: boolean;
  adSlotCode?: string;
  adScriptCode?: string;
  adPosition?: string;
  showAd?: boolean;
  sortMode?: "latest" | "popular";
  preloadedPosts?: { posts: any[]; total: number; page: number; limit: number };
  postCountOverride?: number;
  /** 뷰포트 진입 여부 - false이면 API 요청을 보내지 않음 (지연 로딩) */
  queryEnabled?: boolean;
}) {
  const rows = Math.max(1, displayRows ?? 1);
  // featured: 1줄 = 5개(대하1+소햄4), list2: 1줄 = 2개, download-grid: 1줄 = 4개, grid/overlay/list: 1줄 = 3개
  const baseCount = postCountOverride ?? (sectionStyle === "featured" ? rows * 5 : sectionStyle === "list2" ? rows * 2 : sectionStyle === "download-grid" ? rows * 4 : rows * 3);

  // 서버 주입 초기 데이터: 첫 번째 섹션은 window.__INITIAL_DATA__를 즉시 사용하여 tRPC 응답 대기 없이 렌더링
  const serverInitialPosts = useMemo(() => {
    if (!isFirst) return undefined;
    const d = typeof window !== 'undefined' ? window.__INITIAL_DATA__ : undefined;
    if (!d || d.firstSectionKey !== categoryKey) return undefined;
    return d.firstSectionPosts;
  }, [isFirst, categoryKey]);

  // preloadedPosts: getHomeInitialData에서 서버가 미리 로드한 데이터 (N+1 API 호출 방지)
  // 있으면 initialData로 사용하여 즉시 렌더링, 백그라운드에서 갱신
  const initialData = useMemo(() => {
    if (preloadedPosts) return preloadedPosts;
    if (serverInitialPosts) return { posts: serverInitialPosts } as any;
    return undefined;
  }, [preloadedPosts, serverInitialPosts]);

  // initialData가 있으면 뷰포트 밖이어도 즉시 렌더링 (이미 데이터 있음)
  // initialData가 없으면 queryEnabled가 true일 때만 API 요청 (지연 로딩)
  const shouldFetch = initialData != null ? true : (queryEnabled !== false);

  const { data: posts, isLoading: _isLoading } = trpc.posts.list.useQuery(
    { category: categoryKey, limit: baseCount, sortMode: sortMode ?? 'latest' },
    { initialData: initialData, enabled: shouldFetch }
  );
  // 서버 주입 데이터가 있으면 로딩 상태를 false로 처리하여 즉시 콘텐츠 렌더링 (FCP 개선)
  const isLoading = _isLoading && !initialData;
  // 이 카테고리 섹션에 배치된 커스텀 페이지 조회
  const { data: sectionPages } = trpc.pages.getBySectionKey.useQuery(
    { sectionKey: categoryKey },
    { enabled: !!categoryKey && shouldFetch }
  );
  const postList = (posts && 'posts' in posts) ? posts.posts : (posts as any[] | undefined) ?? [];
  // 커스텀 페이지를 Post 형태로 변환하여 게시글 목록에 병합
  const customPagePosts: Post[] = (sectionPages ?? []).map((page: any) => ({
    id: -page.id, // 음수 ID로 게시글과 구분
    title: page.title,
    excerpt: page.description || page.title,
    image: page.thumbnail || "",
    category: label,
    categoryColor: color,
    date: "", // 썸네일에 날짜 표기 안 함
    views: page.viewCount ?? 0,
    likes: 0,
    badge: "페이지",
    isPinned: false,
    isCustomPage: true,
    customPageSlug: page.slug,
  }));
  const displayPosts: Post[] = isLoading
    ? []
    : [
        ...customPagePosts,
        ...postList.slice(0, Math.max(0, baseCount - customPagePosts.length)).map((p: any) =>
          dbPostToPost(p, label, color)
        ),
      ].slice(0, baseCount);
  // 로딩 완료 후 게시글이 0개인 섹션은 홈에서 숨김 처리
  if (!isLoading && displayPosts.length === 0) return null;
  // 더 보기 버튼 제거됨 - displayRows 설정값만큼만 표시
  if (sectionStyle === "featured") {
    return (
      <>
        <VibeCodingSection
          title={label}
          subtitle={description}
          posts={displayPosts}
          categoryPath={`/category/${categoryKey}`}
          isLoading={isLoading}
          isFirst={isFirst}
          adSlotCode={adSlotCode}
          adScriptCode={adScriptCode}
          adPosition={adPosition as any}
          showAd={showAd}
        />
      </>
    );
  }
  if (sectionStyle === "overlay") {
    return (
      <>
        <OverlaySection
          title={label}
          subtitle={description}
          posts={displayPosts}
          categoryPath={`/category/${categoryKey}`}
          color={color}
          isLoading={isLoading}
          bgColor={bgColor}
          adSlotCode={adSlotCode}
          adScriptCode={adScriptCode}
          showAd={showAd && adPosition === "after_section_header"}
        />
      </>
    );
  }
  if (sectionStyle === "list") {
    return (
      <>
        <ListSection
          title={label}
          subtitle={description}
          posts={displayPosts}
          categoryPath={`/category/${categoryKey}`}
          color={color}
          isLoading={isLoading}
          thumbSize={thumbSize}
          adSlotCode={adSlotCode}
          adScriptCode={adScriptCode}
          showAd={showAd && adPosition === "after_section_header"}
        />
      </>
    );
  }
  if (sectionStyle === "list2") {
    return (
      <>
        <List2Section
          title={label}
          subtitle={description}
          posts={displayPosts}
          categoryPath={`/category/${categoryKey}`}
          color={color}
          isLoading={isLoading}
          thumbSize={thumbSize}
          adSlotCode={adSlotCode}
          adScriptCode={adScriptCode}
          showAd={showAd && adPosition === "after_section_header"}
        />
      </>
    );
  }
  if (sectionStyle === "download-grid") {
    return (
      <>
        <DownloadGridSection
          title={label}
          subtitle={description}
          posts={displayPosts}
          categoryPath={`/category/${categoryKey}`}
          color={color}
          isLoading={isLoading}
        />
      </>
    );
  }
  if (sectionStyle === "download-row") {
    return (
      <>
        <DownloadRowSection
          title={label}
          subtitle={description}
          posts={displayPosts}
          categoryPath={`/category/${categoryKey}`}
          color={color}
          isLoading={isLoading}
        />
      </>
    );
  }
  if (sectionStyle === "download-card") {
    return (
      <>
        <DownloadCardSection
          title={label}
          subtitle={description}
          posts={displayPosts}
          categoryPath={`/category/${categoryKey}`}
          color={color}
          isLoading={isLoading}
        />
      </>
    );
  }
  return (
    <>
      <AiToolsSection
        title={label}
        subtitle={description}
        posts={displayPosts}
        categoryPath={`/category/${categoryKey}`}
        accentColor={color}
        adSlotCode={adSlotCode}
        adScriptCode={adScriptCode}
        showAd={showAd && adPosition === "after_section_header"}
      />
    </>
  );
}

// ─── overlay 섹션 컴포넌트 (이미지 오버레이 3열 카드) ─────────────────────────
// 1번 이미지 스타일: 이미지 전체 배경 + 텍스트 오버레이, 3열 균등 카드
/** 섹션 내부 인라인 광고 배너 (모든 섹션 공용) */
function SectionAdBannerInline({ slotCode, scriptCode, position = "after_section_header" }: { slotCode: string; scriptCode: string; position?: string }) {
  const ref = useRef<HTMLDivElement>(null);
  const logClick = trpc.ads.logClick.useMutation();
  useEffect(() => {
    if (!ref.current || !slotCode.trim() || !scriptCode.trim()) return;
    const clientMatch = scriptCode.match(/data-ad-client=["']([^"']+)["']/) ||
      scriptCode.match(/adsbygoogle\.js\?client=([^"'&\s]+)/);
    const clientId = clientMatch?.[1] ?? "";
    if (!clientId) return;
    if (ref.current.querySelector("ins")) return;
    const ins = document.createElement("ins");
    ins.className = "adsbygoogle";
    ins.style.cssText = "display:block;width:100%;";
    ins.setAttribute("data-ad-client", clientId);
    ins.setAttribute("data-ad-slot", slotCode.trim());
    ins.setAttribute("data-ad-format", "auto");
    ins.setAttribute("data-full-width-responsive", "true");
    ref.current.appendChild(ins);
    try { (window as any).adsbygoogle = (window as any).adsbygoogle || []; (window as any).adsbygoogle.push({}); } catch {}
  }, [slotCode, scriptCode]);
  return (
    <div
      ref={ref}
      style={{ width: "100%", minHeight: "clamp(90px, 20vw, 250px)", height: "clamp(90px, 20vw, 250px)", margin: "8px 0 12px", background: "transparent", overflow: "hidden", contain: "layout size", contentVisibility: "auto", containIntrinsicSize: "0 250px" }}
      aria-label="광고"
      onClick={() => logClick.mutate({ position, slotNum: 1 })}
    />
  );
}

function OverlaySection({
  title,
  subtitle,
  posts,
  categoryPath,
  color,
  isLoading,
  bgColor,
  adSlotCode,
  adScriptCode,
  showAd,
}: {
  title: string;
  subtitle?: string;
  categoryPath?: string;
  color: string;
  posts: Post[];
  isLoading?: boolean;
  bgColor?: string | null;
  adSlotCode?: string;
  adScriptCode?: string;
  showAd?: boolean;
}) {
  const { siteConfig } = useSiteConfig();
  const borderColor = siteConfig?.cardBorderColor || "#c7d2fe";
  const borderWidth = siteConfig?.cardBorderWidth || "1.5px";
  const prefetch = usePostPrefetch();
  return (
    <section style={{ marginBottom: 36 }}>
      <div style={{
        display: "flex", alignItems: "flex-start", justifyContent: "space-between",
        marginBottom: 14, paddingBottom: 10,
        borderBottom: "2px solid #e5e7eb",
      }}>
        <div>
          <h2 style={{ fontSize: 18, fontWeight: 800, color: "#111827", margin: 0 }}>{title}</h2>
          {subtitle && <p style={{ fontSize: 12, color: "#6b7280", margin: "4px 0 0" }}>{subtitle}</p>}
        </div>
        {categoryPath && (
          <a href={categoryPath} style={{ fontSize: 13, color: color, fontWeight: 600, textDecoration: "none", whiteSpace: "nowrap" }}>
            더보기 →
          </a>
        )}
      </div>
      {/* 섹션 헤더 아래 광고 */}
      {showAd && adSlotCode && adScriptCode && (
        <SectionAdBannerInline slotCode={adSlotCode} scriptCode={adScriptCode} />
      )}
      <div className="overlay-section-grid" style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 14 }}>
        {isLoading
          ? Array.from({ length: 3 }).map((_, i) => (
              <div key={i} style={{ height: 280, background: "#f3f4f6", borderRadius: 10, animation: "pulse 1.5s infinite" }} />
            ))
          : posts.slice(0, 3).map((post, idx) => {
              const ph = getCategoryPlaceholder(post.category);
              const isFirst = idx === 0;
              return (
                <a
                  key={post.id}
                  href={getPostUrl(post)}
                  className="overlay-card"
                  style={{
                    display: "block", borderRadius: 10, overflow: "hidden",
                    border: `${borderWidth} solid ${borderColor}`,
                    textDecoration: "none", position: "relative",
                    height: 280,
                    boxShadow: "0 2px 8px rgba(0,0,0,0.08)",
                    transition: "transform 0.15s, box-shadow 0.15s",
                  }}
                  onPointerEnter={() => prefetch(post)}
                  onMouseEnter={e => { (e.currentTarget as HTMLElement).style.transform = "translateY(-3px)"; (e.currentTarget as HTMLElement).style.boxShadow = "0 8px 24px rgba(0,0,0,0.14)"; }}
                  onMouseLeave={e => { (e.currentTarget as HTMLElement).style.transform = ""; (e.currentTarget as HTMLElement).style.boxShadow = "0 2px 8px rgba(0,0,0,0.08)"; }}
                >
                  {/* 배경 이미지 */}
                  <div style={{ position: "absolute", inset: 0 }}>
                    {post.image ? (
                      <img
                        loading={isFirst ? "eager" : "lazy"}
                        fetchPriority={isFirst ? "high" : "auto"}
                        src={post.image}
                        srcSet={makeSrcSet(post.image)}
                        sizes={CARD_SIZES}
                        alt={post.title}
                        style={{ width: "100%", height: "100%", objectFit: "cover" }}
                      />
                    ) : (
                      <div style={{ width: "100%", height: "100%", background: ph.gradient, display: "flex", alignItems: "center", justifyContent: "center" }}>
                        <span style={{ fontSize: 48 }}>{ph.icon}</span>
                      </div>
                    )}
                  </div>
                  {/* 그라데이션 오버레이 - bgColor가 있으면 해당 색상 기반 그라데이션 */}
                  <div style={{ position: "absolute", inset: 0, background: bgColor
                    ? `linear-gradient(to top, ${bgColor}ee 0%, ${bgColor}55 45%, transparent 100%)`
                    : "linear-gradient(to top, rgba(0,0,0,0.75) 0%, rgba(0,0,0,0.1) 50%, transparent 100%)" }} />
                  {/* 텍스트 오버레이 (하단) */}
                  <div style={{ position: "absolute", bottom: 0, left: 0, right: 0, padding: "16px 14px" }}>
                    <h3 style={{
                      fontSize: 15, fontWeight: 800, color: "#ffffff",
                      margin: "0 0 8px", lineHeight: 1.4,
                      display: "-webkit-box",
                      WebkitLineClamp: 3,
                      WebkitBoxOrient: "vertical" as const,
                      overflow: "hidden",
                      textShadow: "0 1px 3px rgba(0,0,0,0.5)",
                    }}>{post.title}</h3>
                    {/* 날짜 표기 제거 */}
                  </div>
                </a>
              );
            })
        }
      </div>
    </section>
  );
}

// ─── list 섹션 컴포넌트 (좌측 썸네일 + 우측 텍스트, 3열 그리드) ───────────────
// 2번 이미지 스타일: 좌측 썸네일 + 우측 제목/날짜, 3열 × N행
function ListSection({
  title,
  subtitle,
  posts,
  categoryPath,
  color,
  isLoading,
  thumbSize = "md",
  adSlotCode,
  adScriptCode,
  showAd,
}: {
  title: string;
  subtitle?: string;
  categoryPath?: string;
  color: string;
  posts: Post[];
  isLoading?: boolean;
  thumbSize?: "sm" | "md" | "lg";
  adSlotCode?: string;
  adScriptCode?: string;
  showAd?: boolean;
}) {
  // 썸네일 크기 맵핑: sm→중(100px), md→대(140px), lg→대+20%(168px)
  const thumbW = thumbSize === "sm" ? 100 : thumbSize === "lg" ? 168 : 140;
  const thumbH = thumbSize === "sm" ? 72 : thumbSize === "lg" ? 120 : 100;
  const { siteConfig } = useSiteConfig();
  const borderColor = siteConfig?.cardBorderColor || "#e5e7eb";
  const borderWidth = siteConfig?.cardBorderWidth || "1px";
  const prefetch = usePostPrefetch();
  return (
    <section style={{ marginBottom: 36 }}>
      <div style={{
        display: "flex", alignItems: "flex-start", justifyContent: "space-between",
        marginBottom: 14, paddingBottom: 10,
        borderBottom: "2px solid #e5e7eb",
      }}>
        <div>
          <h2 style={{ fontSize: 18, fontWeight: 800, color: "#111827", margin: 0 }}>{title}</h2>
          {subtitle && <p style={{ fontSize: 12, color: "#6b7280", margin: "4px 0 0" }}>{subtitle}</p>}
        </div>
        {categoryPath && (
          <a href={categoryPath} style={{ fontSize: 13, color: color, fontWeight: 600, textDecoration: "none", whiteSpace: "nowrap" }}>
            더보기 →
          </a>
        )}
      </div>
      {/* 섹션 헤더 아래 광고 */}
      {showAd && adSlotCode && adScriptCode && (
        <SectionAdBannerInline slotCode={adSlotCode} scriptCode={adScriptCode} />
      )}
      <div className="list-section-grid" style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 10 }}>
        {isLoading
          ? Array.from({ length: 6 }).map((_, i) => (
              <div key={i} style={{ height: 90, background: "#f3f4f6", borderRadius: 8, animation: "pulse 1.5s infinite" }} />
            ))
          : posts.map(post => {
              const ph = getCategoryPlaceholder(post.category);
              return (
                <a
                  key={post.id}
                  href={getPostUrl(post)}
                  style={{
                    display: "flex", alignItems: "flex-start", gap: 12,
                    padding: "12px 14px",
                    background: "#ffffff",
                    border: `${borderWidth} solid ${borderColor}`,
                    borderRadius: 8,
                    textDecoration: "none",
                    transition: "box-shadow 0.15s, transform 0.15s",
                    boxShadow: "0 1px 3px rgba(0,0,0,0.05)",
                  }}
                  onPointerEnter={() => prefetch(post)}
                  onMouseEnter={e => { (e.currentTarget as HTMLElement).style.boxShadow = "0 4px 16px rgba(0,0,0,0.1)"; (e.currentTarget as HTMLElement).style.transform = "translateY(-2px)"; }}
                  onMouseLeave={e => { (e.currentTarget as HTMLElement).style.boxShadow = "0 1px 3px rgba(0,0,0,0.05)"; (e.currentTarget as HTMLElement).style.transform = ""; }}
                >
                  {/* 좌측 썸네일 - thumbSize에 따라 크기 변경 */}
                  <div style={{ position: "relative", width: thumbW, height: thumbH, flexShrink: 0, borderRadius: 6, overflow: "hidden" }}>
                    {post.image ? (
                      <LazyImage src={post.image} alt={post.title} sizes="(max-width: 640px) 45vw, 140px" style={{ width: "100%", height: "100%" }} />
                    ) : (
                      <div style={{ width: "100%", height: "100%", background: ph.gradient, display: "flex", alignItems: "center", justifyContent: "center" }}>
                        <span style={{ fontSize: 24 }}>{ph.icon}</span>
                      </div>
                    )}
                  </div>
                  {/* 우측 텍스트 */}
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <h3 style={{
                      fontSize: 13, fontWeight: 700, color: "#1f2937",
                      margin: "0 0 6px", lineHeight: 1.45,
                      display: "-webkit-box",
                      WebkitLineClamp: 2,
                      WebkitBoxOrient: "vertical" as const,
                      overflow: "hidden",
                    }}>{post.title}</h3>
                    {/* 날짜 표기 제거 */}
                  </div>
                </a>
              );
            })
        }
      </div>
    </section>
  );
}

// ─── list2 섹션 컴포넌트 (좌측 썸네일 + 우측 텍스트, 2열 그리드) ──────────────────
function List2Section({
  title,
  subtitle,
  posts,
  categoryPath,
  color,
  isLoading,
  thumbSize = "md",
  adSlotCode,
  adScriptCode,
  showAd,
}: {
  title: string;
  subtitle?: string;
  categoryPath?: string;
  color: string;
  posts: Post[];
  isLoading?: boolean;
  thumbSize?: "sm" | "md" | "lg";
  adSlotCode?: string;
  adScriptCode?: string;
  showAd?: boolean;
}) {
  // 2열 리스트: 썸네일 더 크게 (sm→중+20%, md→대+20%, lg→대+40%)
  const thumbW = thumbSize === "sm" ? 120 : thumbSize === "lg" ? 200 : 160;
  const thumbH = thumbSize === "sm" ? 88 : thumbSize === "lg" ? 144 : 116;
  const { siteConfig } = useSiteConfig();
  const borderColor = siteConfig?.cardBorderColor || "#e5e7eb";
  const borderWidth = siteConfig?.cardBorderWidth || "1px";
  const prefetch = usePostPrefetch();
  return (
    <section style={{ marginBottom: 36 }}>
      <div style={{
        display: "flex", alignItems: "flex-start", justifyContent: "space-between",
        marginBottom: 14, paddingBottom: 10,
        borderBottom: "2px solid #e5e7eb",
      }}>
        <div>
          <h2 style={{ fontSize: 18, fontWeight: 800, color: "#111827", margin: 0 }}>{title}</h2>
          {subtitle && <p style={{ fontSize: 12, color: "#6b7280", margin: "4px 0 0" }}>{subtitle}</p>}
        </div>
        {categoryPath && (
          <a href={categoryPath} style={{ fontSize: 13, color: color, fontWeight: 600, textDecoration: "none", whiteSpace: "nowrap" }}>
            더보기 →
          </a>
        )}
      </div>
      {/* 섹션 헤더 아래 광고 */}
      {showAd && adSlotCode && adScriptCode && (
        <SectionAdBannerInline slotCode={adSlotCode} scriptCode={adScriptCode} />
      )}
      <div className="list2-section-grid" style={{ display: "grid", gridTemplateColumns: "repeat(2, 1fr)", gap: 12 }}>
        {isLoading
          ? Array.from({ length: 4 }).map((_, i) => (
              <div key={i} style={{ height: 120, background: "#f3f4f6", borderRadius: 8, animation: "pulse 1.5s infinite" }} />
            ))
          : posts.map(post => {
              const ph = getCategoryPlaceholder(post.category);
              return (
                <a
                  key={post.id}
                  href={getPostUrl(post)}
                  style={{
                    display: "flex", alignItems: "flex-start", gap: 14,
                    padding: "14px 16px",
                    background: "#ffffff",
                    border: `${borderWidth} solid ${borderColor}`,
                    borderRadius: 10,
                    textDecoration: "none",
                    transition: "box-shadow 0.15s, transform 0.15s",
                    boxShadow: "0 1px 4px rgba(0,0,0,0.06)",
                  }}
                  onPointerEnter={() => prefetch(post)}
                  onMouseEnter={e => { (e.currentTarget as HTMLElement).style.boxShadow = "0 6px 20px rgba(0,0,0,0.12)"; (e.currentTarget as HTMLElement).style.transform = "translateY(-2px)"; }}
                  onMouseLeave={e => { (e.currentTarget as HTMLElement).style.boxShadow = "0 1px 4px rgba(0,0,0,0.06)"; (e.currentTarget as HTMLElement).style.transform = ""; }}
                >
                  {/* 좌측 썸네일 */}
                  <div style={{ position: "relative", width: thumbW, height: thumbH, flexShrink: 0, borderRadius: 8, overflow: "hidden" }}>
                    {post.image ? (
                      <LazyImage src={post.image} alt={post.title} sizes="(max-width: 640px) 45vw, 160px" style={{ width: "100%", height: "100%" }} />
                    ) : (
                      <div style={{ width: "100%", height: "100%", background: ph.gradient, display: "flex", alignItems: "center", justifyContent: "center" }}>
                        <span style={{ fontSize: 30 }}>{ph.icon}</span>
                      </div>
                    )}
                  </div>
                  {/* 우측 텍스트 */}
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <h3 style={{
                      fontSize: 14, fontWeight: 700, color: "#1f2937",
                      margin: "0 0 8px", lineHeight: 1.5,
                      display: "-webkit-box",
                      WebkitLineClamp: 3,
                      WebkitBoxOrient: "vertical" as const,
                      overflow: "hidden",
                    }}>{post.title}</h3>
                    {post.excerpt && (
                      <p style={{
                        fontSize: 12, color: "#6b7280", margin: 0, lineHeight: 1.5,
                        display: "-webkit-box",
                        WebkitLineClamp: 2,
                        WebkitBoxOrient: "vertical" as const,
                        overflow: "hidden",
                      }}>{post.excerpt}</p>
                    )}
                  </div>
                </a>
              );
            })
        }
      </div>
    </section>
  );
}

// ─── apps 섹션 컴포넌트 ───────────────────────────────────────────
// 앱 목록 + 해당 카테고리 게시글을 함께 표시
function AppsSection({
  categoryKey,
  label,
  description,
  color,
  displayRows,
  adSlotCode,
  adScriptCode,
  showAd,
  queryEnabled,
}: {
  categoryKey: string;
  label: string;
  description: string;
  color: string;
  displayRows?: number;
  adSlotCode?: string;
  adScriptCode?: string;
  showAd?: boolean;
  /** 뷰포트 진입 여부 - false이면 API 요청을 보내지 않음 (지연 로딩) */
  queryEnabled?: boolean;
}) {
  const rows = Math.max(1, displayRows ?? 1);
  // apps: 1줄 = 2개 (2열 그리드)
  const baseCount = rows * 2;
  const { data: posts, isLoading: postsLoading } = trpc.posts.list.useQuery(
    { category: categoryKey, limit: baseCount },
    { enabled: queryEnabled !== false }
  );
  // 이 카테고리 섹션에 배치된 커스텀 페이지 조회
  const { data: sectionPages } = trpc.pages.getBySectionKey.useQuery(
    { sectionKey: categoryKey },
    { enabled: !!categoryKey && queryEnabled !== false }
  );
  const postList2 = (posts && 'posts' in posts) ? posts.posts : (posts as any[] | undefined) ?? [];
  // 커스텀 페이지를 Post 형태로 변환하여 앉부분에 배치
  const customPagePosts: Post[] = (sectionPages ?? []).map((page: any) => ({
    id: -page.id,
    title: page.title,
    excerpt: page.description || page.title,
    image: page.thumbnail || "",
    category: label,
    categoryColor: color,
    date: "", // 썸네일에 날짜 표기 안 함
    views: page.viewCount ?? 0,
    likes: 0,
    badge: "페이지",
    isPinned: false,
    isCustomPage: true,
    customPageSlug: page.slug,
  }));
  const displayPosts: Post[] = postsLoading
    ? customPagePosts // 로딩 중에도 커스텀 페이지는 즉시 표시
    : [
        ...customPagePosts,
        ...postList2.slice(0, Math.max(0, baseCount - customPagePosts.length)).map((p: any) => dbPostToPost(p, label, color)),
      ].slice(0, baseCount);
  // 더 보기 버튼 제거됨 - 앱 목록은 카테고리 페이지에서 보여주고, 메인에는 설정값만큼만 표시
  // 로딩 중: 스켈레튼 표시 (null 반환 시 레이아웃 점프 방지)
  if (postsLoading && displayPosts.length === 0) {
    return (
      <section style={{ marginBottom: 36 }}>
        <div style={{ height: 24, width: 180, background: '#f3f4f6', borderRadius: 6, marginBottom: 16, animation: 'pulse 1.5s infinite' }} />
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 12 }}>
          {Array.from({ length: baseCount }).map((_, i) => (
            <div key={i} style={{ height: 120, background: '#f3f4f6', borderRadius: 10, animation: 'pulse 1.5s infinite' }} />
          ))}
        </div>
      </section>
    );
  }
  if (displayPosts.length === 0) return null;
  return (
    <>
      <AiToolsSection
        title={label}
        subtitle={description}
        posts={displayPosts}
        categoryPath={`/category/${categoryKey}`}
        accentColor={color}
        adSlotCode={adSlotCode}
        adScriptCode={adScriptCode}
        showAd={showAd}
      />
    </>
  );
}

// ─── 최신글 섹션 컴포넌트 ────────────────────────────────────────────────────
function LatestSection({
  label,
  description,
  color,
  displayRows,
  sectionStyle,
  thumbSize,
  bgColor,
  sortMode,
  preloadedPosts,
  queryEnabled,
}: {
  label: string;
  description: string;
  color: string;
  displayRows?: number;
  sectionStyle?: "featured" | "grid" | "apps" | "latest" | "overlay" | "list" | "list2";
  thumbSize?: "sm" | "md" | "lg";
  bgColor?: string | null;
  sortMode?: "latest" | "popular";
  preloadedPosts?: { posts: any[]; total: number; page: number; limit: number };
  /** 뷰포트 진입 여부 - false이면 API 요청을 보내지 않음 (지연 로딩) */
  queryEnabled?: boolean;
}) {
  const rows = Math.max(1, displayRows ?? 1);
  const baseCount = sectionStyle === "featured" ? rows * 5 : sectionStyle === "list2" ? rows * 2 : rows * 3;
  // preloadedPosts가 있으면 즉시 렌더링, 없으면 queryEnabled가 true일 때만 API 요청
  const shouldFetch = preloadedPosts != null ? true : (queryEnabled !== false);
  const { data: latestPosts, isLoading: _isLoading } = trpc.posts.getLatest.useQuery(
    { limit: baseCount, sortMode: sortMode ?? 'latest' },
    { initialData: preloadedPosts?.posts, enabled: shouldFetch }
  );
  const isLoading = _isLoading && !preloadedPosts;
  const postList = (latestPosts as any[] | undefined) ?? [];
  const displayPosts: Post[] = isLoading
    ? []
    : postList.slice(0, baseCount).map((p: any) => dbPostToPost(p, label, color));
  if (isLoading) return null;
  if (displayPosts.length === 0) return null;
  const style = sectionStyle ?? "latest";
  if (style === "featured") {
    return (
      <>
        <VibeCodingSection
          title={label}
          subtitle={description || "모든 카테고리의 최신 글을 모아서 보여드립니다"}
          posts={displayPosts}
          categoryPath="/category/__latest__"
          isLoading={isLoading}
        />
      </>
    );
  }
  if (style === "overlay") {
    return (
      <>
        <OverlaySection
          title={label}
          subtitle={description || "모든 카테고리의 최신 글을 모아서 보여드립니다"}
          posts={displayPosts}
          categoryPath="/category/__latest__"
          color={color}
          isLoading={isLoading}
          bgColor={bgColor ?? null}
        />
      </>
    );
  }
  if (style === "list") {
    return (
      <>
        <ListSection
          title={label}
          subtitle={description || "모든 카테고리의 최신 글을 모아서 보여드립니다"}
          posts={displayPosts}
          categoryPath="/category/__latest__"
          color={color}
          isLoading={isLoading}
          thumbSize={thumbSize ?? "md"}
        />
      </>
    );
  }
  if (style === "list2") {
    return (
      <>
        <List2Section
          title={label}
          subtitle={description || "모든 카테고리의 최신 글을 모아서 보여드립니다"}
          posts={displayPosts}
          categoryPath="/category/__latest__"
          color={color}
          isLoading={isLoading}
          thumbSize={thumbSize ?? "md"}
        />
      </>
    );
  }
  // latest, grid, apps 기본
  return (
    <>
      <AiToolsSection
        title={label}
        subtitle={description || "모든 카테고리의 최신 글을 모아서 보여드립니다"}
        posts={displayPosts}
        categoryPath="/category/__latest__"
        accentColor={color}
      />
    </>
  );
}
// ─── 다운로드 공통 파일타입 색상 팔레트 ──────────────────────────────────────────
const FILE_TYPE_COLORS: Record<string, { bg: string; text: string }> = {
  ZIP:  { bg: "#f59e0b", text: "#fff" },
  PDF:  { bg: "#e11d48", text: "#fff" },
  CSV:  { bg: "#10b981", text: "#fff" },
  JSON: { bg: "#0ea5e9", text: "#fff" },
  TXT:  { bg: "#6366f1", text: "#fff" },
  MP4:  { bg: "#7c3aed", text: "#fff" },
  PNG:  { bg: "#ec4899", text: "#fff" },
  XLSX: { bg: "#10b981", text: "#fff" },
  MD:   { bg: "#64748b", text: "#fff" },
  HWP:  { bg: "#0369a1", text: "#fff" },
  DOCX: { bg: "#1d4ed8", text: "#fff" },
  PPTX: { bg: "#dc2626", text: "#fff" },
  EXE:  { bg: "#374151", text: "#fff" },
};

function getFileType(post: Post): string {
  if (post.fileType) return post.fileType.toUpperCase();
  if (post.badge) return post.badge.toUpperCase();
  return "FILE";
}

interface DownloadSectionProps {
  title: string;
  subtitle?: string;
  posts: Post[];
  categoryPath?: string;
  color: string;
  isLoading?: boolean;
}

// ─── 다운로드 섹션 스타일 1: download-grid (4열 파일 카드 그리드) ─────────────────
// 3번 이미지 스타일: 파일 타입 색상 헤더 + 제목/설명/메타 + 다운로드 버튼
function DownloadGridSection({ title, subtitle, posts, categoryPath, color, isLoading }: DownloadSectionProps) {
  const { siteConfig } = useSiteConfig();
  if (isLoading) return null;
  if (posts.length === 0) return null;
  const cardBorderColor = siteConfig?.cardBorderColor || "#d1d5db";
  const cardBorderWidth = siteConfig?.cardBorderWidth || "1.5px";
  const cardBorderRadius = siteConfig?.cardBorderRadius ? parseInt(siteConfig.cardBorderRadius, 10) : 10;
  return (
    <section style={{ marginBottom: 28 }}>
      {/* 섹션 헤더 */}
      <div style={{
        display: "flex", alignItems: "center", justifyContent: "space-between",
        marginBottom: 14, paddingBottom: 10, borderBottom: `2px solid ${color}22`,
      }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <span style={{
            background: color, color: "#fff", fontSize: 12, fontWeight: 900,
            width: 26, height: 26, borderRadius: 6,
            display: "flex", alignItems: "center", justifyContent: "center",
            flexShrink: 0,
          }}><PackageIcon size={13} /></span>
          <div>
            <h2 style={{ fontSize: 17, fontWeight: 800, color: "#111827", margin: 0, lineHeight: 1.2 }}>{title}</h2>
            {subtitle && <p style={{ fontSize: 11, color: "#6b7280", margin: 0, marginTop: 2 }}>{subtitle}</p>}
          </div>
        </div>
        {categoryPath && (
          <a href={categoryPath} style={{
            fontSize: 12, color, textDecoration: "none",
            padding: "5px 12px", borderRadius: 5,
            border: `1px solid ${color}44`, background: "#fff",
            whiteSpace: "nowrap",
          }}>전체 보기 →</a>
        )}
      </div>
      {/* 4열 그리드 */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 12 }}>
        {posts.map(post => {
          const ft = getFileType(post);
          const ftColors = FILE_TYPE_COLORS[ft] || { bg: "#6b7280", text: "#fff" };
          return (
            <a
              key={post.id}
              href={getPostUrl(post)}
              style={{
                display: "flex", flexDirection: "column",
                background: "#fff",
                border: `${cardBorderWidth} solid ${cardBorderColor}`,
                boxShadow: `0 2px 8px ${cardBorderColor}55`,
                borderRadius: cardBorderRadius, overflow: "hidden", textDecoration: "none",
                transition: "transform 0.18s, border-color 0.18s, box-shadow 0.18s",
              }}
              onMouseEnter={e => {
                const el = e.currentTarget as HTMLElement;
                el.style.transform = "translateY(-3px)";
                el.style.borderColor = color;
                el.style.boxShadow = `0 8px 24px ${color}33`;
              }}
              onMouseLeave={e => {
                const el = e.currentTarget as HTMLElement;
                el.style.transform = "";
                el.style.borderColor = cardBorderColor;
                el.style.boxShadow = `0 2px 8px ${cardBorderColor}55`;
              }}
            >
              {/* 파일 타입 헤더 */}
              <div style={{
                background: ftColors.bg,
                padding: "14px 14px 10px",
                display: "flex", alignItems: "center", justifyContent: "space-between",
              }}>
                <span style={{ fontSize: 18, fontWeight: 900, color: ftColors.text, letterSpacing: "-0.5px" }}>{ft}</span>
                <DownloadIcon size={16} color={ftColors.text} style={{ opacity: 0.8 }} />
              </div>
              {/* 콘텐츠 */}
              <div style={{ padding: "10px 12px 12px", flex: 1, display: "flex", flexDirection: "column" }}>
                <div style={{
                  fontSize: 13, fontWeight: 700, color: "#111827",
                  lineHeight: 1.4, marginBottom: 5,
                  display: "-webkit-box",
                  WebkitLineClamp: 2,
                  WebkitBoxOrient: "vertical" as const,
                  overflow: "hidden",
                }}>{post.title}</div>
                <div style={{
                  fontSize: 11, color: "#6b7280", lineHeight: 1.45, marginBottom: 8, flex: 1,
                  display: "-webkit-box",
                  WebkitLineClamp: 2,
                  WebkitBoxOrient: "vertical" as const,
                  overflow: "hidden",
                }}>{post.excerpt}</div>
                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 4 }}>
                  {post.fileSize && <span style={{ fontSize: 10, color: "#9ca3af" }}>{post.fileSize}</span>}
                  {post.downloads && <span style={{ fontSize: 10, color: "#9ca3af" }}>{(post.downloads / 1000).toFixed(1)}K 다운</span>}
                </div>
                <div style={{ fontSize: 10, color: "#9ca3af", marginBottom: 8 }}>{post.date}</div>
                <div style={{
                  background: `linear-gradient(135deg, ${color}22, ${color}11)`,
                  border: `1px solid ${color}33`,
                  borderRadius: 6, padding: "5px 0",
                  textAlign: "center",
                  fontSize: 11, fontWeight: 700, color,
                  display: "flex", alignItems: "center", justifyContent: "center", gap: 4,
                }}>
                  <DownloadIcon size={11} />
                  다운로드
                </div>
              </div>
            </a>
          );
        })}
      </div>
    </section>
  );
}

// ─── 다운로드 섹션 스타일 2: download-row (가로 리스트형 다운로드 카드) ───────────
// 4번 이미지 스타일: 좌측 파일타입 배지 + 제목/설명/메타 가로 배열
function DownloadRowSection({ title, subtitle, posts, categoryPath, color, isLoading }: DownloadSectionProps) {
  const { siteConfig } = useSiteConfig();
  if (isLoading) return null;
  if (posts.length === 0) return null;
  const cardBorderColor = siteConfig?.cardBorderColor || "#d1d5db";
  const cardBorderWidth = siteConfig?.cardBorderWidth || "1.5px";
  const cardBorderRadius = siteConfig?.cardBorderRadius ? parseInt(siteConfig.cardBorderRadius, 10) : 10;
  return (
    <section style={{ marginBottom: 28 }}>
      {/* 섹션 헤더 */}
      <div style={{
        display: "flex", alignItems: "center", justifyContent: "space-between",
        marginBottom: 14, paddingBottom: 10, borderBottom: `2px solid ${color}22`,
      }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <span style={{
            background: color, color: "#fff", fontSize: 12, fontWeight: 900,
            width: 26, height: 26, borderRadius: 6,
            display: "flex", alignItems: "center", justifyContent: "center",
            flexShrink: 0,
          }}><FileTextIcon size={13} /></span>
          <div>
            <h2 style={{ fontSize: 17, fontWeight: 800, color: "#111827", margin: 0, lineHeight: 1.2 }}>{title}</h2>
            {subtitle && <p style={{ fontSize: 11, color: "#6b7280", margin: 0, marginTop: 2 }}>{subtitle}</p>}
          </div>
        </div>
        {categoryPath && (
          <a href={categoryPath} style={{
            fontSize: 12, color, textDecoration: "none",
            padding: "5px 12px", borderRadius: 5,
            border: `1px solid ${color}44`, background: "#fff",
            whiteSpace: "nowrap",
          }}>전체 보기 →</a>
        )}
      </div>
      {/* 가로 리스트 */}
      <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
        {posts.map(post => {
          const ft = getFileType(post);
          const ftColors = FILE_TYPE_COLORS[ft] || { bg: "#6b7280", text: "#fff" };
          return (
            <a
              key={post.id}
              href={getPostUrl(post)}
              style={{
                display: "flex", alignItems: "center", gap: 14,
                background: "#fff",
                border: `${cardBorderWidth} solid ${cardBorderColor}`,
                boxShadow: `0 2px 8px ${cardBorderColor}55`,
                borderRadius: cardBorderRadius, padding: "12px 16px", textDecoration: "none",
                transition: "border-color 0.18s, box-shadow 0.18s, background 0.18s",
              }}
              onMouseEnter={e => {
                const el = e.currentTarget as HTMLElement;
                el.style.borderColor = color;
                el.style.boxShadow = `0 4px 16px ${color}33`;
                el.style.background = `${color}06`;
              }}
              onMouseLeave={e => {
                const el = e.currentTarget as HTMLElement;
                el.style.borderColor = cardBorderColor;
                el.style.boxShadow = `0 2px 8px ${cardBorderColor}55`;
                el.style.background = "#fff";
              }}
            >
              {/* 파일 타입 배지 */}
              <div style={{
                width: 52, height: 52, borderRadius: 10, flexShrink: 0,
                background: ftColors.bg,
                display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center",
                gap: 2,
              }}>
                <DownloadIcon size={14} color={ftColors.text} />
                <span style={{ fontSize: 9, fontWeight: 900, color: ftColors.text, letterSpacing: "-0.3px" }}>{ft}</span>
              </div>
              {/* 텍스트 정보 */}
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{
                  fontSize: 14, fontWeight: 700, color: "#111827",
                  marginBottom: 3, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
                }}>{post.title}</div>
                <div style={{
                  fontSize: 12, color: "#6b7280", lineHeight: 1.4,
                  overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
                }}>{post.excerpt}</div>
                <div style={{ display: "flex", gap: 12, marginTop: 4 }}>
                  {post.fileSize && <span style={{ fontSize: 10, color: "#9ca3af" }}>📦 {post.fileSize}</span>}
                  {post.downloads && <span style={{ fontSize: 10, color: "#9ca3af" }}>⬇ {(post.downloads / 1000).toFixed(1)}K</span>}
                  <span style={{ fontSize: 10, color: "#9ca3af" }}>{post.date}</span>
                </div>
              </div>
              {/* 다운로드 버튼 */}
              <div style={{
                flexShrink: 0,
                background: color,
                color: "#fff",
                borderRadius: 8, padding: "7px 14px",
                fontSize: 12, fontWeight: 700,
                display: "flex", alignItems: "center", gap: 5,
              }}>
                <DownloadIcon size={12} />
                받기
              </div>
            </a>
          );
        })}
      </div>
    </section>
  );
}

// ─── 다운로드 섹션 스타일 3: download-card (3열 이미지+파일 정보 카드) ─────────────
// 5번 이미지 스타일: 썸네일 이미지 + 파일타입 오버레이 배지 + 제목/메타 3열 카드
function DownloadCardSection({ title, subtitle, posts, categoryPath, color, isLoading }: DownloadSectionProps) {
  const { siteConfig } = useSiteConfig();
  if (isLoading) return null;
  if (posts.length === 0) return null;
  const cardBorderColor = siteConfig?.cardBorderColor || "#d1d5db";
  const cardBorderWidth = siteConfig?.cardBorderWidth || "1.5px";
  const cardBorderRadius = siteConfig?.cardBorderRadius ? parseInt(siteConfig.cardBorderRadius, 10) : 12;
  return (
    <section style={{ marginBottom: 28 }}>
      {/* 섹션 헤더 */}
      <div style={{
        display: "flex", alignItems: "center", justifyContent: "space-between",
        marginBottom: 14, paddingBottom: 10, borderBottom: `2px solid ${color}22`,
      }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <span style={{
            background: color, color: "#fff", fontSize: 12, fontWeight: 900,
            width: 26, height: 26, borderRadius: 6,
            display: "flex", alignItems: "center", justifyContent: "center",
            flexShrink: 0,
          }}><DownloadIcon size={13} /></span>
          <div>
            <h2 style={{ fontSize: 17, fontWeight: 800, color: "#111827", margin: 0, lineHeight: 1.2 }}>{title}</h2>
            {subtitle && <p style={{ fontSize: 11, color: "#6b7280", margin: 0, marginTop: 2 }}>{subtitle}</p>}
          </div>
        </div>
        {categoryPath && (
          <a href={categoryPath} style={{
            fontSize: 12, color, textDecoration: "none",
            padding: "5px 12px", borderRadius: 5,
            border: `1px solid ${color}44`, background: "#fff",
            whiteSpace: "nowrap",
          }}>전체 보기 →</a>
        )}
      </div>
      {/* 3열 카드 */}
      <div className="download-grid-section" style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 14 }}>
        {posts.map(post => {
          const ft = getFileType(post);
          const ftColors = FILE_TYPE_COLORS[ft] || { bg: "#6b7280", text: "#fff" };
          const placeholder = getCategoryPlaceholder(post.category);
          return (
            <a
              key={post.id}
              href={getPostUrl(post)}
              style={{
                display: "flex", flexDirection: "column",
                background: "#fff",
                border: `${cardBorderWidth} solid ${cardBorderColor}`,
                boxShadow: `0 2px 8px ${cardBorderColor}55`,
                borderRadius: cardBorderRadius, overflow: "hidden", textDecoration: "none",
                transition: "transform 0.18s, border-color 0.18s, box-shadow 0.18s",
              }}
              onMouseEnter={e => {
                const el = e.currentTarget as HTMLElement;
                el.style.transform = "translateY(-3px)";
                el.style.borderColor = color;
                el.style.boxShadow = `0 8px 24px ${color}33`;
              }}
              onMouseLeave={e => {
                const el = e.currentTarget as HTMLElement;
                el.style.transform = "";
                el.style.borderColor = cardBorderColor;
                el.style.boxShadow = `0 2px 8px ${cardBorderColor}55`;
              }}
            >
              {/* 썸네일 + 파일타입 오버레이 */}
              <div style={{ position: "relative", height: 140, overflow: "hidden" }}>
                {post.image ? (
                  <img
                    src={post.image}
                    srcSet={makeSrcSet(post.image)}
                    sizes={CARD_SIZES}
                    alt={post.title}
                    loading="lazy"
                    decoding="async"
                    width={300}
                    height={140}
                    style={{ width: "100%", height: "100%", objectFit: "cover" }}
                  />
                ) : (
                  <div style={{
                    width: "100%", height: "100%",
                    background: `linear-gradient(135deg, ${color}22, ${color}44)`,
                    display: "flex", alignItems: "center", justifyContent: "center",
                  }}>
                    <span style={{ fontSize: 40 }}>{placeholder.icon}</span>
                  </div>
                )}
                {/* 파일타입 배지 오버레이 */}
                <div style={{
                  position: "absolute", top: 10, right: 10,
                  background: ftColors.bg, color: ftColors.text,
                  fontSize: 10, fontWeight: 900, padding: "3px 8px",
                  borderRadius: 5, letterSpacing: "0.5px",
                }}>{ft}</div>
                {/* 다운로드 아이콘 오버레이 */}
                <div style={{
                  position: "absolute", bottom: 10, right: 10,
                  background: "rgba(0,0,0,0.55)", borderRadius: 6,
                  width: 28, height: 28,
                  display: "flex", alignItems: "center", justifyContent: "center",
                }}>
                  <DownloadIcon size={14} color="#fff" />
                </div>
              </div>
              {/* 콘텐츠 */}
              <div style={{ padding: "12px 14px 14px", flex: 1, display: "flex", flexDirection: "column" }}>
                <div style={{
                  fontSize: 14, fontWeight: 700, color: "#111827",
                  lineHeight: 1.4, marginBottom: 5,
                  display: "-webkit-box",
                  WebkitLineClamp: 2,
                  WebkitBoxOrient: "vertical" as const,
                  overflow: "hidden",
                }}>{post.title}</div>
                <div style={{
                  fontSize: 12, color: "#6b7280", lineHeight: 1.45, flex: 1,
                  display: "-webkit-box",
                  WebkitLineClamp: 2,
                  WebkitBoxOrient: "vertical" as const,
                  overflow: "hidden",
                  marginBottom: 8,
                }}>{post.excerpt}</div>
                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                  <div style={{ display: "flex", gap: 8 }}>
                    {post.fileSize && <span style={{ fontSize: 10, color: "#9ca3af" }}>📦 {post.fileSize}</span>}
                    {post.downloads && <span style={{ fontSize: 10, color: "#9ca3af" }}>⬇ {(post.downloads / 1000).toFixed(1)}K</span>}
                  </div>
                  <span style={{ fontSize: 10, color: "#9ca3af" }}>{post.date}</span>
                </div>
              </div>
            </a>
          );
        })}
      </div>
    </section>
  );
}

// ─── 고정글 섹션 컴포넌트트 ────────────────────────────────────────────────────
function PinnedSection() {
  const { data: pinnedPosts, isLoading } = trpc.posts.getPinned.useQuery();
  const { siteConfig: siteConfigData } = useSiteConfig();
  const limit = Math.max(1, parseInt(siteConfigData?.pinnedPostsLimit || "3", 10) || 3);
  const displayPosts = pinnedPosts ? pinnedPosts.slice(0, limit) : [];
  if (isLoading || displayPosts.length === 0) return null;
  return (
    <div style={{
      background: "linear-gradient(135deg, #ede9fe 0%, #fdf4ff 100%)",
      border: "1px solid #ddd6fe",
      borderRadius: 12,
      padding: "16px 20px",
      marginBottom: 20,
    }}>
      <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 14 }}>
        <span style={{ display: "inline-block", background: "#6d28d9", color: "#fff", fontSize: 11, fontWeight: 700, borderRadius: 4, padding: "2px 7px", letterSpacing: 0.5 }}>고정글</span>
        <span style={{ fontSize: 14, fontWeight: 700, color: "#6d28d9" }}>추천 글</span>
        <span style={{ fontSize: 11, color: "#a78bfa", marginLeft: 4 }}>관리자가 선택한 추천 글</span>
      </div>
      <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
        {displayPosts.map((post) => (
          <a
            key={post.id}
            href={getPostUrl(post)}
            style={{
              display: "flex", alignItems: "center", gap: 12,
              padding: "10px 14px", borderRadius: 8,
              background: "rgba(255,255,255,0.8)",
              border: "1px solid #ede9fe",
              textDecoration: "none",
              transition: "box-shadow 0.15s",
            }}
            onMouseEnter={e => (e.currentTarget.style.boxShadow = "0 2px 8px rgba(109,40,217,0.12)")}
            onMouseLeave={e => (e.currentTarget.style.boxShadow = "none")}
          >
            {post.thumbnail && (
              <LazyImage
                src={post.thumbnail}
                alt={post.title}
                sizes="56px"
                style={{ width: 56, height: 42, borderRadius: 6, flexShrink: 0 }}
              />
            )}
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontSize: 13, fontWeight: 600, color: "#1f2937", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                {post.title}
              </div>
              <div style={{ fontSize: 11, color: "#9ca3af", marginTop: 2 }}>
                {post.excerpt ? post.excerpt.replace(/<[^>]*>/g, "").slice(0, 80) + "..." : ""}
              </div>
            </div>
            <div style={{ fontSize: 11, color: "#a78bfa", flexShrink: 0 }}>
              조회 {post.views.toLocaleString()}
            </div>
          </a>
        ))}
      </div>
    </div>
  );
}

// ─── 첫화면 교체용 커스텀 페이지 렌더러 ─────────────────────────────────────────
type CustomPageData = {
  id: number; slug: string; title: string; description: string | null;
  sectionsJson: string; published: boolean; hideSidebar: boolean;
  postListCategory?: string | null;
  titleAlign?: string | null;
};

type PageSectionType = "text" | "image" | "button" | "divider" | "html" | "hero" | "columns";
interface HomePageSection {
  id: string; type: PageSectionType; content: string;
  settings: {
    bgColor?: string; textAlign?: "left" | "center" | "right"; padding?: "sm" | "md" | "lg";
    imageUrl?: string; imageAlt?: string; buttonText?: string; buttonUrl?: string;
    buttonStyle?: "primary" | "outline" | "ghost"; columns?: string[];
    heroTitle?: string; heroSubtitle?: string; heroButtonText?: string; heroButtonUrl?: string;
    isAppMode?: boolean; embedMode?: "html" | "url"; embedUrl?: string;
  };
}

const HP_PADDING_MAP = { sm: "20px 24px", md: "40px 24px", lg: "70px 24px" };

// HTML 앱 섹션 렌더러 (토큰 기반 서버 로드) - CustomPageView의 HtmlAppSection과 동일한 방식
function HomeHtmlAppSection({ section, fullWidth, pageId }: { section: HomePageSection; fullWidth: boolean; pageId: number }) {
  const [htmlContent, setHtmlContent] = useState<string | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const iframeRef = useRef<HTMLIFrameElement>(null);
  const maxHRef = useRef(600);
  const bg = section.settings.bgColor || "#ffffff";
  const padding = HP_PADDING_MAP[section.settings.padding || "md"];

  useEffect(() => {
    let cancelled = false;
    async function loadHtml(retryCount = 0): Promise<void> {
      try {
        const tokenRes = await fetch(`/api/page-html-token/${pageId}/${section.id}`, { credentials: "include" });
        if (!tokenRes.ok) {
          const err = await tokenRes.json().catch(() => ({ error: tokenRes.statusText }));
          if (!cancelled) setLoadError(err.error || "로드 실패");
          return;
        }
        const { token } = await tokenRes.json();
        const htmlRes = await fetch(`/api/page-html/${pageId}/${section.id}?token=${token}`, { credentials: "include" });
        if (!htmlRes.ok) {
          if (htmlRes.status === 403 && retryCount < 1) {
            if (!cancelled) return loadHtml(retryCount + 1);
          }
          const err = await htmlRes.json().catch(() => ({ error: htmlRes.statusText }));
          if (!cancelled) setLoadError(err.error || "로드 실패");
          return;
        }
        if (htmlRes.status === 204) { if (!cancelled) setHtmlContent(""); return; }
        const { encrypted, key, iv, tag } = await htmlRes.json();
        // AES-256-GCM 복호화
        const b64ToBytes = (b64: string) => Uint8Array.from(atob(b64), c => c.charCodeAt(0));
        const keyBytes = b64ToBytes(key);
        const ivBytes = b64ToBytes(iv);
        const tagBytes = b64ToBytes(tag);
        const encBytes = b64ToBytes(encrypted);
        const combined = new Uint8Array(encBytes.length + tagBytes.length);
        combined.set(encBytes); combined.set(tagBytes, encBytes.length);
        const cryptoKey = await crypto.subtle.importKey("raw", keyBytes, { name: "AES-GCM" }, false, ["decrypt"]);
        const decrypted = await crypto.subtle.decrypt({ name: "AES-GCM", iv: ivBytes }, cryptoKey, combined);
        const html = new TextDecoder().decode(decrypted);
        if (!cancelled) setHtmlContent(html);
      } catch (e: any) {
        if (!cancelled) setLoadError(e?.message || "복호화 오류");
      }
    }
    loadHtml();
    return () => { cancelled = true; };
  }, [pageId, section.id]);

  useEffect(() => {
    const handleMessage = (e: MessageEvent) => {
      if (e.data?.type === "iframe-height" && typeof e.data.height === "number") {
        const h = e.data.height;
        if (iframeRef.current && h > 100) {
          maxHRef.current = Math.max(maxHRef.current, h);
          iframeRef.current.style.height = maxHRef.current + "px";
        }
      }
    };
    window.addEventListener("message", handleMessage);
    return () => window.removeEventListener("message", handleMessage);
  }, []);

  const handleIframeLoad = (e: React.SyntheticEvent<HTMLIFrameElement>) => {
    const iframe = e.currentTarget;
    try {
      const doc = iframe.contentDocument || iframe.contentWindow?.document;
      if (!doc) return;
      const h = Math.max(doc.documentElement.scrollHeight, doc.body?.scrollHeight ?? 0, 600);
      if (h > maxHRef.current) { maxHRef.current = h; iframe.style.height = h + "px"; }
      else { iframe.style.height = maxHRef.current + "px"; }
      const ro = new ResizeObserver(() => {
        const nh = Math.max(doc.documentElement.scrollHeight, doc.body?.scrollHeight ?? 0, 600);
        if (nh > maxHRef.current) { maxHRef.current = nh; iframe.style.height = nh + "px"; }
      });
      ro.observe(doc.documentElement);
      iframe.addEventListener("pagehide", () => ro.disconnect(), { once: true });
    } catch { /* cross-origin */ }
  };

  if (loadError) {
    return <section style={{ background: bg, padding }}><div style={{ minHeight: 200, display: "flex", alignItems: "center", justifyContent: "center", color: "#ef4444", fontSize: 14 }}>⚠️ {loadError}</div></section>;
  }
  if (htmlContent === null) {
    return <section style={{ background: bg, padding }}><div style={{ minHeight: 200, display: "flex", alignItems: "center", justifyContent: "center", color: "#6b7280", fontSize: 14 }}><span style={{ display: "inline-block", width: 20, height: 20, border: "2px solid #6b7280", borderTopColor: "transparent", borderRadius: "50%", animation: "spin 0.8s linear infinite", marginRight: 8 }} />로딩 중...</div></section>;
  }
  return (
    <section style={{ background: bg, padding: fullWidth ? 0 : padding }}>
      <div style={{ maxWidth: fullWidth ? "100%" : 960, margin: "0 auto" }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", background: "#f8fafc", borderBottom: "1px solid #e5e7eb", padding: "4px 10px", fontSize: 11 }}>
          <span style={{ color: "#6b7280" }}>HTML 앱</span>
        </div>
        <iframe ref={iframeRef} srcDoc={htmlContent} style={{ width: "100%", minHeight: 600, border: "none", display: "block" }} sandbox="allow-scripts allow-same-origin allow-forms allow-modals allow-popups" title="HTML 앱" onLoad={handleIframeLoad} />
      </div>
    </section>
  );
}

function HomeRenderSection({ section, fullWidth, pageId }: { section: HomePageSection; fullWidth: boolean; pageId: number }) {
  const bg = section.settings.bgColor || "#ffffff";
  const align = section.settings.textAlign || "left";
  const padding = HP_PADDING_MAP[section.settings.padding || "md"];
  const wrapStyle = { background: bg, padding };

  if (section.type === "hero") {
    return (
      <section style={{ ...wrapStyle, textAlign: "center" }}>
        <div style={{ maxWidth: fullWidth ? "100%" : 960, margin: "0 auto" }}>
          {section.settings.heroTitle && <h1 style={{ fontSize: "clamp(28px,5vw,56px)", fontWeight: 900, color: "#111827", marginBottom: 16 }}>{section.settings.heroTitle}</h1>}
          {section.settings.heroSubtitle && <p style={{ fontSize: "clamp(15px,2vw,22px)", color: "#6b7280", marginBottom: 28 }}>{section.settings.heroSubtitle}</p>}
          {section.settings.heroButtonText && section.settings.heroButtonUrl && (
            <a href={section.settings.heroButtonUrl} style={{ display: "inline-block", padding: "14px 36px", background: "#6366f1", color: "#fff", borderRadius: 10, textDecoration: "none", fontWeight: 700, fontSize: 16 }}>{section.settings.heroButtonText}</a>
          )}
        </div>
      </section>
    );
  }
  if (section.type === "text") {
    return (
      <section style={wrapStyle}>
        <div style={{ maxWidth: fullWidth ? "100%" : 960, margin: "0 auto", textAlign: align }} className="rich-preview" dangerouslySetInnerHTML={{ __html: section.content }} />
      </section>
    );
  }
  if (section.type === "image") {
    return (
      <section style={wrapStyle}>
        <div style={{ maxWidth: fullWidth ? "100%" : 960, margin: "0 auto", textAlign: align }}>
          {section.settings.imageUrl && <img src={section.settings.imageUrl} alt={section.settings.imageAlt || ""} loading="lazy" decoding="async" style={{ maxWidth: "100%", borderRadius: 10 }} />}
          {section.content && <p style={{ fontSize: 13, color: "#9ca3af", marginTop: 8 }}>{section.content}</p>}
        </div>
      </section>
    );
  }
  if (section.type === "button") {
    const btnStyle = section.settings.buttonStyle || "primary";
    const btnCss = btnStyle === "primary" ? { background: "#6366f1", color: "#fff", border: "none" } :
      btnStyle === "outline" ? { background: "transparent", color: "#6366f1", border: "2px solid #6366f1" } :
      { background: "transparent", color: "#6366f1", border: "none" };
    return (
      <section style={{ ...wrapStyle, textAlign: align }}>
        {section.settings.buttonUrl && section.settings.buttonText && (
          <a href={section.settings.buttonUrl} style={{ display: "inline-block", padding: "12px 32px", borderRadius: 8, textDecoration: "none", fontWeight: 700, fontSize: 15, cursor: "pointer", ...btnCss }}>{section.settings.buttonText}</a>
        )}
      </section>
    );
  }
  if (section.type === "divider") {
    return <section style={wrapStyle}><hr style={{ border: "none", borderTop: "1px solid #e5e7eb", margin: "0 auto", maxWidth: fullWidth ? "100%" : 960 }} /></section>;
  }
  if (section.type === "html") {
    // URL 임베드 모드
    if (section.settings.embedMode === "url" && section.settings.embedUrl) {
      return <section style={wrapStyle}><iframe src={section.settings.embedUrl} style={{ width: "100%", minHeight: 400, border: "none" }} allowFullScreen title="URL 임베드" /></section>;
    }
    // HTML 앱 모드 또는 일반 HTML: 서버에서 content를 비워서 내려보내므로 토큰 기반 로드 필수
    return <HomeHtmlAppSection section={section} fullWidth={fullWidth} pageId={pageId} />;
  }
  if (section.type === "columns") {
    const cols = section.settings.columns || [];
    return (
      <section style={wrapStyle}>
        <div style={{ maxWidth: fullWidth ? "100%" : 960, margin: "0 auto", display: "grid", gridTemplateColumns: `repeat(${Math.max(cols.length, 1)}, 1fr)`, gap: 20 }}>
          {cols.map((col, i) => <div key={i} className="rich-preview" dangerouslySetInnerHTML={{ __html: col }} />)}
        </div>
      </section>
    );
  }
  return null;
}

function HomePostList({ categoryKey, fullWidth }: { categoryKey: string; fullWidth: boolean }) {
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
              <tr key={post.id} style={{ borderBottom: "1px solid #f3f4f6" }}
                onMouseEnter={e => (e.currentTarget.style.background = "#ede9fe")}
                onMouseLeave={e => (e.currentTarget.style.background = "")}>
                <td style={{ padding: "10px 12px", textAlign: "center", color: "#9ca3af" }}>{idx + 1}</td>
                <td style={{ padding: "10px 12px" }}>
                  <a href={getPostUrl(post)} style={{ color: "#111827", textDecoration: "none", fontWeight: 500 }}
                    onMouseEnter={e => (e.currentTarget.style.color = "#6366f1")}
                    onMouseLeave={e => (e.currentTarget.style.color = "#111827")}>{post.title}</a>
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

function HomeCustomPageRenderer({ page }: { page: CustomPageData }) {
  let sections: HomePageSection[] = [];
  try { sections = JSON.parse(page.sectionsJson); } catch { sections = []; }
  const fullWidth = !!page.hideSidebar;
  const titleAlign: "left" | "center" | "right" = ((page.titleAlign as "left" | "center" | "right") || "left");

  // 커스텀 페이지 제목/설명으로 브라우저 탭 및 SEO 메타 태그 업데이트
  useSEO({
    title: page.title,
    description: page.description ?? undefined,
  });

  // WebPage JSON-LD 구조화 데이터 (구글 리치 결과 노출 용)
  useJsonLd({
    type: "WebPage",
    name: page.title,
    url: window.location.origin + "/",
    description: page.description ?? undefined,
    isPartOf: window.location.origin,
  });
  return (
    <div style={{ minHeight: "100vh", background: "#fff", fontFamily: "'Noto Sans KR', 'Apple SD Gothic Neo', sans-serif" }}>
      <Header />
      {sections.length > 0 && sections[0].type !== "hero" && (
        <div style={{ background: "#f9fafb", borderBottom: "1px solid #e5e7eb", padding: "32px 24px" }}>
          <div style={{ maxWidth: fullWidth ? "100%" : 960, margin: "0 auto" }}>
            <h1 style={{ fontSize: "clamp(22px,4vw,36px)", fontWeight: 800, color: "#111827", marginBottom: 8, textAlign: titleAlign }}>{page.title}</h1>
            {page.description && <p style={{ fontSize: 15, color: "#6b7280", textAlign: titleAlign }}>{page.description}</p>}
          </div>
        </div>
      )}
      {sections.map(section => <HomeRenderSection key={section.id} section={section} fullWidth={fullWidth} pageId={page.id} />)}
      {sections.length === 0 && (
        <div style={{ maxWidth: 960, margin: "80px auto", textAlign: "center", color: "#9ca3af", padding: "0 24px" }}>
          <p style={{ fontSize: 16 }}>이 페이지는 아직 내용이 없습니다.</p>
        </div>
      )}
      {page.postListCategory && <HomePostList categoryKey={page.postListCategory} fullWidth={fullWidth} />}
      <Footer />
      <style>{`
        .rich-preview p { margin: 0.8em 0; line-height: 1.8; color: #374151; }
        .rich-preview h1, .rich-preview h2, .rich-preview h3 { font-weight: 700; color: #111827; margin: 1.2em 0 0.5em; }
        .rich-preview a { color: #6366f1; text-decoration: underline; }
        .rich-preview img { max-width: 100%; border-radius: 10px; margin: 1em 0; display: block; }
        @keyframes spin { to { transform: rotate(360deg); } }
      `}</style>
    </div>
  );
}

// ─── vibecraftx.com 바이브코딩 인사이트 섹션 ─────────────────────────────────
function VibecraftInsightsSection({ insightRows = 2, label, color }: { insightRows?: number; label?: string; color?: string }) {
  const { data: insights, isLoading } = trpc.vibecraftInsights.useQuery();

  // 로딩 스켈레톤
  if (isLoading) {
    return (
      <section style={{ marginBottom: 40 }}>
        <div style={{
          display: "flex", alignItems: "flex-end", justifyContent: "space-between",
          marginBottom: 18, paddingBottom: 14,
          borderBottom: "1px solid #e5e7eb",
          position: "relative",
        }}>
          <div style={{ position: "absolute", bottom: -1, left: 0, width: 36, height: 2, background: "linear-gradient(90deg, #7c3aed, #6366f1)", borderRadius: 2 }} />
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <div style={{ width: 4, height: 24, background: "linear-gradient(180deg, #7c3aed, #6366f1)", borderRadius: 2 }} />
            <div>
              <div style={{ height: 22, width: 180, background: "linear-gradient(90deg, #f3f4f6 25%, #e9eaf0 50%, #f3f4f6 75%)", backgroundSize: "200% 100%", animation: "shimmer 1.5s infinite", borderRadius: 6 }} />
              <div style={{ height: 12, width: 260, background: "linear-gradient(90deg, #f9fafb 25%, #f3f4f6 50%, #f9fafb 75%)", backgroundSize: "200% 100%", animation: "shimmer 1.5s infinite", borderRadius: 4, marginTop: 6 }} />
            </div>
          </div>
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(2, 1fr)", gap: 16 }}>
          {Array.from({ length: 6 }).map((_, i) => (
            <div key={i} style={{ background: "#fff", border: "1px solid #e0e7ff", borderRadius: 14, overflow: "hidden", boxShadow: "0 1px 3px rgba(0,0,0,0.05)" }}>
              <div style={{ height: 150, background: "linear-gradient(90deg, #f9fafb 25%, #f3f4f6 50%, #f9fafb 75%)", backgroundSize: "200% 100%", animation: "shimmer 1.5s infinite" }} />
              <div style={{ padding: "12px 14px" }}>
                <div style={{ height: 15, background: "linear-gradient(90deg, #f3f4f6 25%, #e9eaf0 50%, #f3f4f6 75%)", backgroundSize: "200% 100%", animation: "shimmer 1.5s infinite", borderRadius: 5, marginBottom: 8 }} />
                <div style={{ height: 12, width: "80%", background: "linear-gradient(90deg, #f9fafb 25%, #f3f4f6 50%, #f9fafb 75%)", backgroundSize: "200% 100%", animation: "shimmer 1.5s infinite", borderRadius: 4, marginBottom: 4 }} />
                <div style={{ height: 10, width: "40%", background: "linear-gradient(90deg, #f9fafb 25%, #f3f4f6 50%, #f9fafb 75%)", backgroundSize: "200% 100%", animation: "shimmer 1.5s infinite", borderRadius: 4, marginTop: 8 }} />
              </div>
            </div>
          ))}
        </div>
      </section>
    );
  }

  // 데이터 없거나 빈 배열이면 렌더링 안 함
  if (!insights || insights.length === 0) return null;

  return (
    <section style={{ marginBottom: 40 }}>
      {/* 프리미엄 섹션 헤더 */}
      <div style={{
        display: "flex", alignItems: "flex-end", justifyContent: "space-between",
        marginBottom: 18, paddingBottom: 14,
        borderBottom: "1px solid #e5e7eb",
        position: "relative",
      }}>
        {/* 강조 라인 */}
        <div style={{
          position: "absolute", bottom: -1, left: 0,
          width: 36, height: 2,
          background: "linear-gradient(90deg, #7c3aed, #6366f1)",
          borderRadius: 2,
        }} />
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          {/* 외부 소스 뱃지 */}
          <div style={{
            display: "flex", alignItems: "center", justifyContent: "center",
            width: 30, height: 30, borderRadius: 8, flexShrink: 0,
            background: "linear-gradient(135deg, #7c3aed, #6366f1)",
            boxShadow: "0 4px 12px rgba(124,58,237,0.30)",
          }}>
            <span style={{ fontSize: 14 }}>⚡</span>
          </div>
          <div>
            <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
              <h2 style={{
                fontSize: 20, fontWeight: 800, color: "#111827", margin: 0,
                lineHeight: 1.2, letterSpacing: "-0.03em",
              }}>{label || "바이브코딩 인사이트"}</h2>
              <span style={{
                fontSize: 9.5, fontWeight: 700, color: "#7c3aed",
                background: "#f5f3ff", border: "1px solid #ddd6fe",
                padding: "1px 7px", borderRadius: 999,
                letterSpacing: "0.02em",
              }}>vibecraftx.com</span>
            </div>
            <p style={{ fontSize: 12, color: "#9ca3af", margin: "3px 0 0", fontWeight: 400 }}>코딩 없이 AI 자동화 앱을 만드는 방법을 배워보세요</p>
          </div>
        </div>
        <a
          href="https://www.vibecraftx.com/category/ai-apps"
          target="_blank"
          rel="noopener noreferrer"
          style={{
            display: "inline-flex", alignItems: "center", gap: 4,
            fontSize: 13, fontWeight: 600, color: "#7c3aed",
            textDecoration: "none", padding: "5px 12px",
            border: "1px solid #ddd6fe", borderRadius: 999,
            background: "#f5f3ff",
            transition: "all 0.15s",
            whiteSpace: "nowrap",
          }}
          onMouseEnter={e => {
            const el = e.currentTarget as HTMLElement;
            el.style.background = "#7c3aed";
            el.style.color = "#fff";
            el.style.borderColor = "#7c3aed";
          }}
          onMouseLeave={e => {
            const el = e.currentTarget as HTMLElement;
            el.style.background = "#f5f3ff";
            el.style.color = "#7c3aed";
            el.style.borderColor = "#ddd6fe";
          }}
        >
          더보기 →
        </a>
      </div>

      {/* 2열 카드 그리드 - 2번 스타일 (좌측 썸네일 + 우측 텍스트) */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(2, 1fr)", gap: 16 }}>
        {insights.slice(0, insightRows * 2).map((item, i) => {
          const palettes = [
            { bg: "linear-gradient(135deg, #e0e7ff 0%, #c7d2fe 100%)", emoji: "🤖" },
            { bg: "linear-gradient(135deg, #d1fae5 0%, #a7f3d0 100%)", emoji: "⚡" },
            { bg: "linear-gradient(135deg, #fef3c7 0%, #fde68a 100%)", emoji: "🚀" },
            { bg: "linear-gradient(135deg, #fce7f3 0%, #fbcfe8 100%)", emoji: "💡" },
            { bg: "linear-gradient(135deg, #ede9fe 0%, #ddd6fe 100%)", emoji: "✨" },
            { bg: "linear-gradient(135deg, #e0f2fe 0%, #bae6fd 100%)", emoji: "🧠" },
          ];
          const p = palettes[i % palettes.length];
          return (
            <a
              key={i}
              href={item.url}
              target="_blank"
              rel="noopener noreferrer"
              style={{
                display: "flex",
                flexDirection: "row",
                background: "#ffffff",
                border: "1px solid #e8e8f0",
                borderRadius: 14,
                overflow: "hidden",
                textDecoration: "none",
                boxShadow: "0 1px 4px rgba(0,0,0,0.06)",
                transition: "transform 0.2s cubic-bezier(0.34,1.56,0.64,1), box-shadow 0.2s ease",
                minHeight: 120,
              }}
              onMouseEnter={e => {
                const el = e.currentTarget as HTMLElement;
                el.style.transform = "translateY(-3px)";
                el.style.boxShadow = "0 6px 24px rgba(124,58,237,0.12)";
              }}
              onMouseLeave={e => {
                const el = e.currentTarget as HTMLElement;
                el.style.transform = "";
                el.style.boxShadow = "0 1px 4px rgba(0,0,0,0.06)";
              }}
            >
              {/* 좌측 썸네일 영역 (160x고정) */}
              <div style={{ width: 160, minWidth: 160, flexShrink: 0, overflow: "hidden", background: "#f0f0f8" }}>
                {item.thumbnail ? (
                  <img
                    src={item.thumbnail ? `/api/vibecraft-img?url=${encodeURIComponent(item.thumbnail)}` : ""}
                    alt={item.title}
                    loading="lazy"
                    style={{ width: "100%", height: "100%", objectFit: "cover", display: "block", transition: "transform 0.4s ease" }}
                    onMouseEnter={e => (e.currentTarget as HTMLElement).style.transform = "scale(1.05)"}
                    onMouseLeave={e => (e.currentTarget as HTMLElement).style.transform = ""}
                    onError={e => {
                      const img = e.currentTarget as HTMLImageElement;
                      img.style.display = "none";
                      const parent = img.parentElement;
                      if (parent) {
                        parent.style.background = p.bg;
                        parent.style.display = "flex";
                        parent.style.alignItems = "center";
                        parent.style.justifyContent = "center";
                        const span = document.createElement("span");
                        span.style.fontSize = "36px";
                        span.textContent = p.emoji;
                        parent.appendChild(span);
                      }
                    }}
                  />
                ) : (
                  <div style={{
                    width: "100%", height: "100%",
                    background: p.bg,
                    display: "flex", alignItems: "center", justifyContent: "center",
                  }}>
                    <span style={{ fontSize: 36 }}>{p.emoji}</span>
                  </div>
                )}
              </div>

              {/* 우측 텍스트 영역 */}
              <div style={{ padding: "14px 16px", flex: 1, display: "flex", flexDirection: "column", minWidth: 0 }}>
                {/* 카테고리 태그 */}
                {item.category && (
                  <span style={{
                    display: "inline-block",
                    fontSize: 10.5, fontWeight: 600, color: "#7c3aed",
                    background: "#f5f3ff", border: "1px solid #ede9fe",
                    padding: "1px 8px", borderRadius: 999,
                    marginBottom: 7, alignSelf: "flex-start",
                  }}>{item.category}</span>
                )}
                {/* 제목 */}
                <h3 style={{
                  fontSize: 14.5, fontWeight: 800, color: "#111827",
                  margin: "0 0 6px", lineHeight: 1.45,
                  letterSpacing: "-0.02em",
                  display: "-webkit-box",
                  WebkitLineClamp: 2,
                  WebkitBoxOrient: "vertical" as const,
                  overflow: "hidden",
                }}>{item.title}</h3>
                {/* 요약 */}
                {item.summary && (
                  <p style={{
                    fontSize: 12.5, color: "#6b7280",
                    margin: "0 0 8px", lineHeight: 1.6,
                    display: "-webkit-box",
                    WebkitLineClamp: 2,
                    WebkitBoxOrient: "vertical" as const,
                    overflow: "hidden",
                    flex: 1,
                  }}>{item.summary}</p>
                )}
                {/* 읽기 버튼 */}
                <div style={{ display: "flex", alignItems: "center", justifyContent: "flex-end", marginTop: "auto" }}>
                  <span style={{
                    display: "inline-flex", alignItems: "center", gap: 3,
                    fontSize: 12, fontWeight: 600, color: "#7c3aed",
                  }}>
                    읽기 →
                  </span>
                </div>
              </div>
            </a>
          );
        })}
      </div>
    </section>
  );
}

export default function Home() {
  // 홈페이지 초기 데이터 통합 쿼리 (FCP/LCP 개선)
  // 기존: getSiteConfig + getNavItems 2개 별도 쿼리 → 1개 통합 쿼리
  const { data: homeInitialData, isLoading: homeInitialLoading } = trpc.admin.getHomeInitialData.useQuery(
    undefined,
    { staleTime: 0, refetchOnWindowFocus: true } // 항상 최신 데이터 반영 (서버 캐시는 별도 관리)
  );
  const siteConfig = homeInitialData?.siteConfig;
  const navItemsData = homeInitialData?.navItems;
  // 서버에서 미리 로드된 섹션별 게시물 (N+1 API 호출 방지)
  const sectionPosts = (homeInitialData as any)?.sectionPosts as Record<string, { posts: any[]; total: number; page: number; limit: number }> | undefined;
  const homePageId = siteConfig?.homePageId ? parseInt(siteConfig.homePageId, 10) : null;
  const { data: customHomePage, isLoading: customHomeLoading } = trpc.pages.getById.useQuery(
    { id: homePageId! },
    { enabled: !!homePageId && !isNaN(homePageId!) }
  );
  useSEO({
    title: siteConfig
      ? `${siteConfig.siteTitle ?? "Smart Auto Guide"} - ${siteConfig.siteDescription ?? "AI 자동화 프로그램 블로그"}`
      : undefined,
    description: siteConfig?.siteDescription ?? undefined,
  });
  // JSON-LD 구조화 데이터 (WebSite + SearchAction 스키마)
  useJsonLd(siteConfig ? {
    type: "WebSite",
    name: siteConfig.siteTitle ?? "스마트 오토 가이드",
    url: window.location.origin,
    description: siteConfig.siteDescription ?? undefined,
  } : null);

  // 메인 상단 섹션 표시 방식
  const heroSectionMode = siteConfig?.heroSectionMode || "current";
  const heroPostCount = Math.max(1, Math.min(20, Number(siteConfig?.heroPostCount || "6")));
  const heroPopularPeriod = (siteConfig?.heroPopularPeriod as "today" | "week" | "month" | "all") || "all";
  // heroSectionMode에 따라 첫 번째 카테고리의 sortMode를 오버라이드
  // popular: 첫 번째 카테고리 내에서 조회수 순, latest: 첫 번째 카테고리 내에서 최신순, current: DB 설정값 그대로
  const firstCatSortModeOverride: "latest" | "popular" | null =
    heroSectionMode === "popular" ? "popular" :
    heroSectionMode === "latest" ? "latest" :
    null;

  // 메인 섹션 광고 설정 파싱
  const homeAdEnabled = siteConfig?.home_ad_enabled === "true";
  const homeAdSlotCode = siteConfig?.home_ad_slot_code ?? "";
  const homeAdPosition = (siteConfig?.home_ad_position as "between_sections" | "top" | "bottom" | "after_section_header" | "between_cards") ?? "between_sections";
  const homeAdMaxCount = Number(siteConfig?.home_ad_max_count ?? 2);
  const adsenseScriptCode = siteConfig?.adsense_script_code ?? "";
  const adsMasterEnabled = siteConfig?.ads_master_enabled !== "false";
  const showHomeAd = !!(homeAdEnabled && adsMasterEnabled && homeAdSlotCode.trim() && adsenseScriptCode.trim());

  // navItems에서 카테고리 목록 생성 (showOnHome 항목만, 순서대로)
  const navCategories = useMemo(() => {
    if (!navItemsData) return [];
    const seen = new Set<string>();
    return [...navItemsData]
      .filter(item => Boolean((item as any).showOnHome))
      .sort((a, b) => (a.sortOrder ?? 0) - (b.sortOrder ?? 0))
      .map((item, idx) => {
        const rawKey = extractKey(item.path || "");
        const uniqueKey = seen.has(rawKey) ? `${rawKey}_${idx}` : rawKey;
        seen.add(rawKey);
        return {
        key: uniqueKey,
        label: item.label,
        description: (item as any).description || "",
        color: COLOR_PALETTE[idx % COLOR_PALETTE.length],
        // DB의 sectionStyle 사용, 없으면 my-apps는 apps, 나머지는 grid
        sectionStyle: ((item as any).sectionStyle as "featured" | "grid" | "apps" | "latest" | "overlay" | "list" | "list2" | "stat-banner" | "download-grid" | "download-row" | "download-card" | "developers") ||
          (extractKey(item.path || "") === "my-apps" ? "apps" : "grid"),
        displayRows: (item as any).displayRows ?? 1,
        sectionMarginBottom: (item as any).sectionMarginBottom ?? 36,
        thumbSize: ((item as any).thumbSize as "sm" | "md" | "lg") ?? "md",
        bgColor: (item as any).bgColor || null,
        statBannerData: (item as any).statBannerData || null,
        sectionSortMode: ((item as any).sectionSortMode as "latest" | "popular") ?? "latest",
        };
      })
      .filter(c => c.key);
  }, [navItemsData]);

  // 첫화면 교체: homePageId가 category: 접두사인 경우 카테고리 페이지로 리다이렉트
  const categoryHomeOverride = siteConfig?.homePageId?.startsWith("category:") ? siteConfig.homePageId.replace("category:", "") : null;
  // 주의: useEffect는 훅 규칙상 조건문 밖에 선언해야 하므로, 여기서는 사용하지 않고 렌더 시점에 window.location을 직접 조작
  if (categoryHomeOverride) {
    // siteConfig 로딩 완료 후 리다이렉트 (로딩 전에는 표시 안 함)
    if (!homeInitialLoading) {
      window.location.replace(categoryHomeOverride);
    }
    return (
      <div style={{ minHeight: "100vh", background: "#fff", fontFamily: "'Noto Sans KR', sans-serif" }}>
        <Header />
        <div style={{ display: "flex", alignItems: "center", justifyContent: "center", minHeight: 300 }}>
          <div style={{ width: 28, height: 28, border: "3px solid #6366f1", borderTopColor: "transparent", borderRadius: "50%", animation: "spin 0.8s linear infinite" }} />
          <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
        </div>
      </div>
    );
  }

  // 첫화면 교체: homePageId가 설정된 경우 커스텀 페이지 콘텐츠를 렌더링
  if (homePageId && !customHomeLoading && customHomePage) {
    return <HomeCustomPageRenderer page={customHomePage} />;
  }
  // homePageId가 설정되었지만 로딩 중인 경우 짧은 로딩 표시
  if (homePageId && customHomeLoading) {
    return (
      <div style={{ minHeight: "100vh", background: "#fff", fontFamily: "'Noto Sans KR', sans-serif" }}>
        <Header />
        <div style={{ display: "flex", alignItems: "center", justifyContent: "center", minHeight: 300 }}>
          <div style={{ width: 28, height: 28, border: "3px solid #6366f1", borderTopColor: "transparent", borderRadius: "50%", animation: "spin 0.8s linear infinite" }} />
          <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
        </div>
      </div>
    );
  }

  // 홈 데이터 로딩 중 스켈레톤 표시 (빈 화면 방지)
  if (homeInitialLoading) {
    return (
      <div style={{ minHeight: "100vh", background: "#f9fafb", fontFamily: "'Noto Sans KR', sans-serif" }}>
        <Header />
        <div style={{ maxWidth: 1100, margin: "0 auto", padding: "20px 10px" }}>
          {/* 스켈레톤 카드 열 */}
          {[0, 1].map(row => (
            <div key={row} style={{ marginBottom: 32 }}>
              <div style={{ height: 20, width: 180, background: "#e5e7eb", borderRadius: 6, marginBottom: 16, animation: "pulse 1.5s ease-in-out infinite" }} />
              <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(220px, 1fr))", gap: 12 }}>
                {[0, 1, 2, 3].map(i => (
                  <div key={i} style={{ background: "#fff", border: "1px solid #e5e7eb", borderRadius: 10, overflow: "hidden", boxShadow: "0 1px 4px rgba(0,0,0,0.06)" }}>
                    <div style={{ height: 120, background: "#e5e7eb", animation: "pulse 1.5s ease-in-out infinite" }} />
                    <div style={{ padding: "10px 12px" }}>
                      <div style={{ height: 14, background: "#e5e7eb", borderRadius: 4, marginBottom: 8, animation: "pulse 1.5s ease-in-out infinite" }} />
                      <div style={{ height: 12, width: "70%", background: "#f3f4f6", borderRadius: 4, animation: "pulse 1.5s ease-in-out infinite" }} />
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
        <style>{`@keyframes pulse { 0%,100%{opacity:1} 50%{opacity:.5} }`}</style>
      </div>
    );
  }

  return (
    <div style={{
      minHeight: "100vh",
      background: "#f9fafb",
      fontFamily: "'Noto Sans KR', 'Apple SD Gothic Neo', sans-serif",
    }}>
      <Header />
      {/* mainLayoutWidth = 본문(main) 영역 폭. 전체 컨테이너는 사이드바+간격을 포함한 크기로 자동 계산 */}
      {(() => {
        const mainW = Number(siteConfig?.mainLayoutWidth) || 860;
        const leftW = Number(siteConfig?.leftSidebarWidth) || 200;
        const rightW = Number(siteConfig?.rightSidebarWidth) || 200;
        const gap = Number(siteConfig?.sidebarGap) || 28;
        const totalW = mainW + leftW + rightW + gap * 2 + 20; // 20 = padding
        return (
      <div style={{
        maxWidth: totalW,
        margin: "0 auto",
        padding: "16px 10px",
        display: "flex",
        gap: 0,
        alignItems: "flex-start",
      }}>
        {/* 좌측 사이드바 */}
        <div className="sidebar-col" style={{
          width: Number(siteConfig?.leftSidebarWidth) || 200,
          flexShrink: 0,
          marginRight: Number(siteConfig?.sidebarGap) || 28,
        }}>
          <Sidebar side="left" />
        </div>

        {/* 메인 콘텐츠 */}
        <main style={{ flex: 1, minWidth: 0 }}>
          {/* 카테고리 섹션 - heroSectionMode에 따라 첫 번째 카테고리의 sortMode 오버라이드 */}
          {navCategories.length === 0 && heroSectionMode === "current" ? (
            // navItems 로딩 중 기본 섹션
            <CategorySection
              categoryKey="ai-apps"
              label="AI로 만드는 자동화 프로그램"
              description="코딩 없이 AI 자동화 앱을 만드는 방법을 배워보세요"
              color="#7c3aed"
              sectionStyle="featured"
              isFirst={heroSectionMode === "current"}
            />
          ) : navCategories.length === 0 ? null : (
            navCategories.map((cat, catIdx) => {
              // 메인 섹션 광고 삽입 로직
              const totalSections = navCategories.length;
              // 섹션 사이 광고: 지정한 개수를 섹션 수에 고르게 분산
              const adInterval = homeAdMaxCount > 0 ? Math.max(1, Math.floor(totalSections / (homeAdMaxCount + 1))) : 0;
              const showAdAfterThisSection =
                showHomeAd &&
                homeAdPosition === "between_sections" &&
                adInterval > 0 &&
                catIdx < totalSections - 1 &&
                (catIdx + 1) % adInterval === 0 &&
                Math.floor((catIdx + 1) / adInterval) <= homeAdMaxCount;

              // 섹션 상단 광고 (첫 번째 섹션 앞)
              const topAd = showHomeAd && homeAdPosition === "top" && catIdx === 0 ? (
                <HomeAdBanner key="home-ad-top" slotCode={homeAdSlotCode} scriptCode={adsenseScriptCode} />
              ) : null;
              // 섹션 하단 광고 (마지막 섹션 아래)
              const bottomAd = showHomeAd && homeAdPosition === "bottom" && catIdx === totalSections - 1 ? (
                <HomeAdBanner key="home-ad-bottom" slotCode={homeAdSlotCode} scriptCode={adsenseScriptCode} />
              ) : null;
              // 섹션 사이 광고
              const betweenAd = showAdAfterThisSection ? (
                <HomeAdBanner key={`home-ad-${catIdx}`} slotCode={homeAdSlotCode} scriptCode={adsenseScriptCode} />
              ) : null;

                            // 첫 번째 섹션(catIdx===0)은 즉시 렌더링, 나머지는 LazySectionWrapper로 지연 렌더링
              const sectionMarginBottom = (cat as any).sectionMarginBottom ?? 36;
              // 바이브코딩 인사이트 특수 섹션: vibecraftx.com 스크래핑 데이터 표시
              if (cat.key === "__vibecraft_insight__") {
                const vibecraftContent = (
                  <div id="vibecraft-insight-section" style={{ marginBottom: sectionMarginBottom }}>
                    {topAd}
                    <VibecraftInsightsSection
                      insightRows={cat.displayRows ?? Number(siteConfig?.vibecraftInsightRows ?? 2)}
                      label={cat.label}
                      color={cat.color}
                    />
                    {betweenAd}
                    {bottomAd}
                  </div>
                );
                // 첫 번째 섹션은 즉시 렌더링 (LCP 개선)
                if (catIdx === 0) {
                  return <React.Fragment key={cat.key}>{vibecraftContent}</React.Fragment>;
                }
                return (
                  <LazySectionWrapper key={cat.key} minHeight={sectionMarginBottom + 200}>
                    {() => vibecraftContent}
                  </LazySectionWrapper>
                );
              }
              if (cat.sectionStyle === "latest" || cat.key === "__latest__") {
                if (catIdx === 0) {
                  return (
                    <div key={cat.key} style={{ marginBottom: sectionMarginBottom }}>
                      {topAd}
                      <LatestSection
                        label={cat.label}
                        description={cat.description}
                        color={cat.color}
                        displayRows={cat.displayRows}
                        sectionStyle={cat.sectionStyle as any}
                        thumbSize={(cat as any).thumbSize ?? "md"}
                        bgColor={(cat as any).bgColor ?? null}
                        sortMode={(cat as any).sectionSortMode ?? 'latest'}
                        preloadedPosts={sectionPosts?.[cat.key]}
                        queryEnabled={true}
                      />
                      {betweenAd}
                      {bottomAd}
                    </div>
                  );
                }
                return (
                  <LazySectionWrapper key={cat.key} minHeight={sectionMarginBottom + 200} hasPreloadedData={!!sectionPosts?.[cat.key]}>
                    {(isVisible) => (
                      <div style={{ marginBottom: sectionMarginBottom }}>
                        {topAd}
                        <LatestSection
                          label={cat.label}
                          description={cat.description}
                          color={cat.color}
                          displayRows={cat.displayRows}
                          sectionStyle={cat.sectionStyle as any}
                          thumbSize={(cat as any).thumbSize ?? "md"}
                          bgColor={(cat as any).bgColor ?? null}
                          sortMode={(cat as any).sectionSortMode ?? 'latest'}
                          preloadedPosts={sectionPosts?.[cat.key]}
                          queryEnabled={isVisible}
                        />
                        {betweenAd}
                        {bottomAd}
                      </div>
                    )}
                  </LazySectionWrapper>
                );
              }
              if (cat.sectionStyle === "apps") {
                if (catIdx === 0) {
                  return (
                    <div key={cat.key} style={{ marginBottom: sectionMarginBottom }}>
                      {topAd}
                      <AppsSection
                        categoryKey={cat.key}
                        label={cat.label}
                        description={cat.description}
                        color={cat.color}
                        displayRows={cat.displayRows}
                        adSlotCode={showHomeAd && homeAdPosition === "after_section_header" ? homeAdSlotCode : undefined}
                        adScriptCode={showHomeAd && homeAdPosition === "after_section_header" ? adsenseScriptCode : undefined}
                        showAd={showHomeAd && homeAdPosition === "after_section_header"}
                        queryEnabled={true}
                      />
                      {betweenAd}
                      {bottomAd}
                    </div>
                  );
                }
                return (
                  <LazySectionWrapper key={cat.key} minHeight={sectionMarginBottom + 200} hasPreloadedData={!!sectionPosts?.[cat.key]}>
                    {(isVisible) => (
                      <div style={{ marginBottom: sectionMarginBottom }}>
                        {topAd}
                        <AppsSection
                          categoryKey={cat.key}
                          label={cat.label}
                          description={cat.description}
                          color={cat.color}
                          displayRows={cat.displayRows}
                          adSlotCode={showHomeAd && homeAdPosition === "after_section_header" ? homeAdSlotCode : undefined}
                          adScriptCode={showHomeAd && homeAdPosition === "after_section_header" ? adsenseScriptCode : undefined}
                          showAd={showHomeAd && homeAdPosition === "after_section_header"}
                          queryEnabled={isVisible}
                        />
                        {betweenAd}
                        {bottomAd}
                      </div>
                    )}
                  </LazySectionWrapper>
                );
              }
              if (cat.sectionStyle === "stat-banner") {
                // 새 포맷(객체) 또는 이전 포맷(배열) 모두 지원
                let bannerConfig: any = null;
                let legacyCards: any[] = [];
                try {
                  const parsed = JSON.parse((cat as any).statBannerData || "[]");
                  if (Array.isArray(parsed)) {
                    // 이전 배열 포맷 — 하위 호환
                    legacyCards = parsed;
                  } else {
                    bannerConfig = parsed;
                  }
                } catch { legacyCards = []; }
                const content = (
                  <div key={cat.key} style={{ marginBottom: sectionMarginBottom }}>
                    {topAd}
                    <Suspense fallback={<div style={{ height: 200 }} />}>
                      <StatBannerSection
                        title={cat.label || undefined}
                        subtitle={cat.description || undefined}
                        cards={legacyCards}
                        config={bannerConfig ?? undefined}
                        outerBgColor={(cat as any).bgColor || "#1a1f35"}
                      />
                    </Suspense>
                    {betweenAd}
                    {bottomAd}
                  </div>
                );
                return catIdx === 0 ? content : (
                  <LazySectionWrapper key={cat.key} minHeight={sectionMarginBottom + 200}>
                    {content}
                  </LazySectionWrapper>
                );
              }
              if (cat.sectionStyle === "developers") {
                const content = (
                  <div key={cat.key} style={{ marginBottom: sectionMarginBottom }}>
                    {topAd}
                    <FeaturedDevelopersSection
                      title={cat.label || "주목 개발자"}
                      description={cat.description || undefined}
                      color={cat.color || null}
                    />
                    {betweenAd}
                    {bottomAd}
                  </div>
                );
                return catIdx === 0 ? content : (
                  <LazySectionWrapper key={cat.key} minHeight={sectionMarginBottom + 200}>
                    {content}
                  </LazySectionWrapper>
                );
              }
              // after_section_header / between_cards 위치일 때 섹션 내부에 광고 삽입
              const isInternalAdPosition = showHomeAd &&
                (homeAdPosition === "after_section_header" || homeAdPosition === "between_cards");
              // 첫 번째 카테고리: heroSectionMode에 따라 sortMode 오버라이드
              const effectiveSortMode = catIdx === 0 && firstCatSortModeOverride
                ? firstCatSortModeOverride
                : ((cat as any).sectionSortMode ?? 'latest');
              // 첫 번째 카테고리: heroSectionMode가 popular/latest일 때 heroPostCount로 표시 개수 오버라이드
              const effectivePostCount = catIdx === 0 && firstCatSortModeOverride
                ? heroPostCount
                : undefined;
              if (catIdx === 0) {
                return (
                  <div key={cat.key} style={{ marginBottom: sectionMarginBottom }}>
                    {topAd}
                    <CategorySection
                      categoryKey={cat.key}
                      label={cat.label}
                      description={cat.description}
                      color={cat.color}
                      sectionStyle={cat.sectionStyle as "featured" | "grid" | "apps" | "overlay" | "list" | "list2" | "download-grid" | "download-row" | "download-card"}
                      displayRows={cat.displayRows}
                      thumbSize={(cat as any).thumbSize ?? "md"}
                      bgColor={(cat as any).bgColor ?? null}
                      isFirst={true}
                      adSlotCode={isInternalAdPosition ? homeAdSlotCode : undefined}
                      adScriptCode={isInternalAdPosition ? adsenseScriptCode : undefined}
                      adPosition={isInternalAdPosition ? homeAdPosition : undefined}
                      showAd={isInternalAdPosition}
                      sortMode={effectiveSortMode}
                      preloadedPosts={sectionPosts?.[cat.key]}
                      postCountOverride={effectivePostCount}
                      queryEnabled={true}
                    />
                    {betweenAd}
                    {bottomAd}
                  </div>
                );
              }
              return (
                <LazySectionWrapper key={cat.key} minHeight={sectionMarginBottom + 200} hasPreloadedData={!!sectionPosts?.[cat.key]}>
                  {(isVisible) => (
                    <div style={{ marginBottom: sectionMarginBottom }}>
                      {topAd}
                      <CategorySection
                        categoryKey={cat.key}
                        label={cat.label}
                        description={cat.description}
                        color={cat.color}
                        sectionStyle={cat.sectionStyle as "featured" | "grid" | "apps" | "overlay" | "list" | "list2" | "download-grid" | "download-row" | "download-card"}
                        displayRows={cat.displayRows}
                        thumbSize={(cat as any).thumbSize ?? "md"}
                        bgColor={(cat as any).bgColor ?? null}
                        isFirst={false}
                        adSlotCode={isInternalAdPosition ? homeAdSlotCode : undefined}
                        adScriptCode={isInternalAdPosition ? adsenseScriptCode : undefined}
                        adPosition={isInternalAdPosition ? homeAdPosition : undefined}
                        showAd={isInternalAdPosition}
                        sortMode={effectiveSortMode}
                        preloadedPosts={sectionPosts?.[cat.key]}
                        postCountOverride={effectivePostCount}
                        queryEnabled={isVisible}
                      />
                      {betweenAd}
                      {bottomAd}
                    </div>
                  )}
                </LazySectionWrapper>
              );
            })
          )}

          {/* vibecraftx.com 바이브코딩 인사이트 섹션은 navCategories에서 __vibecraft_insight__ 키로 렌더링됨 */}
        </main>

        {/* 우측 사이드바 */}
        <div className="sidebar-col" style={{
          width: Number(siteConfig?.rightSidebarWidth) || 200,
          flexShrink: 0,
          marginLeft: Number(siteConfig?.sidebarGap) || 28,
        }}>
          <Sidebar side="right" />
        </div>
      </div>
        );
      })()}
      <Footer />
      <style>{`
        @media (max-width: 1100px) {
          .sidebar-col { display: none !important; }
        }
      `}</style>
    </div>
  );
}
