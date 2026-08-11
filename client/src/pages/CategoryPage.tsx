import { useLocation } from "wouter";
import { getPostUrl } from "@/lib/postUrl";
import { PenSquare, Eye, Heart, ChevronRight, Loader2, Edit2, X, Save } from "lucide-react";
import Header from "../components/Header";
import Footer from "../components/Footer";
import Sidebar from "../components/Sidebar";
import { useMemo, useState, useEffect, useCallback, useRef, lazy, Suspense } from "react";

import { trpc } from "@/lib/trpc";
import { useSiteConfig } from "@/contexts/SiteConfigContext";
import { useSEO } from "@/hooks/useSEO";
import { useAuth } from "@/_core/hooks/useAuth";
// HtmlSourceEditor(CodeMirror)는 관리자만 사용 → lazy import로 일반 방문자 번들에서 제외
const HtmlSourceEditor = lazy(() => import("@/components/HtmlSourceEditor"));
import { makeSrcSet } from "@/lib/imageUtils";
import LazyImage from "@/components/LazyImage";
import { usePostPrefetch } from "@/hooks/usePostPrefetch";

// 컨스탄트 팔레트 (순환)
const COLOR_PALETTE = ["#7c3aed", "#e11d48", "#10b981", "#0ea5e9", "#f59e0b", "#6366f1", "#ec4899"];

/** 페이지 번호 점프 UI 공통 컴포넌트 */
function PageJumpNav({
  totalPageCount,
  loadedPageCount,
  hasNextPage,
  jumpTargetPage,
  color,
  onJump,
  compact = false,
}: {
  totalPageCount: number;
  loadedPageCount: number;
  hasNextPage: boolean;
  jumpTargetPage: number | null;
  color: string;
  onJump: (page: number) => void;
  compact?: boolean;
}) {
  if (totalPageCount <= 1) return null;
  const pages: number[] = [];
  const delta = compact ? 1 : 2;
  const left = Math.max(1, loadedPageCount - delta);
  const right = Math.min(totalPageCount, loadedPageCount + delta);
  if (left > 1) { pages.push(1); if (left > 2) pages.push(-1); }
  for (let i = left; i <= right; i++) pages.push(i);
  if (right < totalPageCount) { if (right < totalPageCount - 1) pages.push(-2); pages.push(totalPageCount); }

  return (
    <div style={{
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      gap: 5, padding: compact ? '8px 0' : '20px 0 8px', flexWrap: 'wrap',
    }}>
      {/* 이전 */}
      <button
        onClick={() => onJump(Math.max(1, loadedPageCount - 1))}
        disabled={loadedPageCount <= 1}
        style={{
          width: 30, height: 30, borderRadius: 7,
          border: '1px solid #e5e7eb',
          background: loadedPageCount <= 1 ? '#f3f4f6' : '#fff',
          color: loadedPageCount <= 1 ? '#d1d5db' : '#374151',
          cursor: loadedPageCount <= 1 ? 'not-allowed' : 'pointer',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          fontSize: 15, fontWeight: 700, transition: 'all 0.15s',
        }}
        aria-label="이전 페이지"
      >‹</button>

      {/* 페이지 번호 */}
      {pages.map((p, i) =>
        p < 0 ? (
          <span key={`ellipsis-${i}`} style={{ padding: '0 2px', color: '#9ca3af', fontSize: 13 }}>…</span>
        ) : (
          <button
            key={p}
            onClick={() => onJump(p)}
            style={{
              width: 30, height: 30, borderRadius: 7,
              border: p === loadedPageCount ? `2px solid ${color}` : '1px solid #e5e7eb',
              background: p === loadedPageCount ? color : p < loadedPageCount ? '#f0fdf4' : '#fff',
              color: p === loadedPageCount ? '#fff' : p < loadedPageCount ? '#16a34a' : '#374151',
              cursor: 'pointer',
              fontSize: 12, fontWeight: p === loadedPageCount ? 700 : 400,
              transition: 'all 0.15s',
              position: 'relative',
            }}
            title={p <= loadedPageCount ? `${p}페이지로 이동` : `${p}페이지 로드 후 이동`}
          >
            {p}
            {p > loadedPageCount && (
              <span style={{
                position: 'absolute', top: -3, right: -3,
                width: 6, height: 6, borderRadius: '50%',
                background: '#d1d5db', border: '1px solid #fff',
              }} />
            )}
          </button>
        )
      )}

      {/* 다음 */}
      <button
        onClick={() => onJump(Math.min(totalPageCount, loadedPageCount + 1))}
        disabled={!hasNextPage}
        style={{
          width: 30, height: 30, borderRadius: 7,
          border: '1px solid #e5e7eb',
          background: !hasNextPage ? '#f3f4f6' : '#fff',
          color: !hasNextPage ? '#d1d5db' : '#374151',
          cursor: !hasNextPage ? 'not-allowed' : 'pointer',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          fontSize: 15, fontWeight: 700, transition: 'all 0.15s',
        }}
        aria-label="다음 페이지"
      >›</button>

      {/* 로딩 표시 */}
      {jumpTargetPage !== null && (
        <span style={{ fontSize: 11, color, marginLeft: 4, display: 'flex', alignItems: 'center', gap: 3 }}>
          <Loader2 size={11} style={{ animation: 'spin 1s linear infinite' }} />
          {jumpTargetPage}p 로딩 중
        </span>
      )}

      {!compact && (
        <span style={{ fontSize: 11, color: '#9ca3af', marginLeft: 4 }}>
          {loadedPageCount} / {totalPageCount} 페이지 로드됨
        </span>
      )}
    </div>
  );
}

/** navItem path에서 카테고리 키 추출 */
function extractCategoryKey(path: string): string {
  const m = path.match(/\/category\/([^/?#]+)/);
  return m ? m[1] : path.replace(/^.*\//, "");
}

interface Props {
  categoryKey: string;
}

interface DBPost {
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
  authorId: number;
  published: boolean;
  createdAt: Date;
  updatedAt: Date;
}

function PostListItem({ post, categoryColor, categoryLabel }: { post: DBPost; categoryColor: string; categoryLabel?: string }) {
  const [, navigate] = useLocation();
  const prefetch = usePostPrefetch();
  const dateStr = new Date(post.createdAt).toLocaleDateString("ko-KR", {
    year: "numeric", month: "long", day: "numeric",
  });

  return (
    <article
      className="post-list-item"
      style={{
        display: "flex", gap: 18,
        padding: "20px 0",
        borderBottom: "1px solid #1e2040",
        cursor: "pointer",
      }}
      onClick={() => navigate(getPostUrl(post))}
      onPointerEnter={() => prefetch({ id: post.id, slug: (post as any).slug, customSlug: (post as any).customSlug })}
      onMouseEnter={e => (e.currentTarget as HTMLElement).style.background = "rgba(99,102,241,0.03)"}
      onMouseLeave={e => (e.currentTarget as HTMLElement).style.background = ""}
    >
      {/* Thumbnail */}
      <div className="post-list-thumb" style={{
        width: 160, height: 105,
        borderRadius: 8, overflow: "hidden",
        flexShrink: 0, background: "#e5e7eb",
      }}>
        {post.thumbnail ? (
          <LazyImage
            src={post.thumbnail}
            alt={post.title}
            sizes="(max-width: 640px) 100vw, 160px"
            width={160}
            height={105}
            style={{ width: "100%", height: "100%" }}
          />
        ) : (
          <div style={{
            width: "100%", height: "100%",
            background: "linear-gradient(135deg, #ede9fe, #ddd6fe)",
            display: "flex", alignItems: "center", justifyContent: "center",
            fontSize: 28,
          }}>📄</div>
        )}
      </div>

      {/* Content */}
      <div style={{ flex: 1, minWidth: 0, display: "flex", flexDirection: "column", justifyContent: "space-between" }}>
        <div>
          <div style={{ display: "flex", alignItems: "center", gap: 7, marginBottom: 7 }}>
            {post.badge && (
              <span style={{
                fontSize: 9, fontWeight: 800,
                background: "#6366f1", color: "#fff",
                padding: "2px 7px", borderRadius: 3,
              }}>{post.badge}</span>
            )}
          </div>

          <h3 className="post-list-title" style={{
            fontSize: 18, fontWeight: 800, color: "#111827",
            lineHeight: 1.4, margin: "0 0 8px",
            display: "-webkit-box",
            WebkitLineClamp: 2,
            WebkitBoxOrient: "vertical" as const,
            overflow: "hidden",
          }}>{post.title}</h3>

          <p style={{
            fontSize: 14.5, color: "#6b7280", lineHeight: 1.7, margin: 0,
            display: "-webkit-box",
            WebkitLineClamp: 2,
            WebkitBoxOrient: "vertical" as const,
            overflow: "hidden",
          }}>{post.excerpt || post.content
            .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, "")
            .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, "")
            .replace(/<[^>]*>/g, "")
            .replace(/\s+/g, " ")
            .trim()
            .slice(0, 120) + "..."}</p>
        </div>

        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginTop: 12 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
            <span style={{ fontSize: 11, color: "#6b7280" }}>{dateStr}</span>
            <span style={{ display: "flex", alignItems: "center", gap: 4, fontSize: 11, color: "#6b7280" }}>
              <Eye size={11} />{post.views}
            </span>
            <span style={{ display: "flex", alignItems: "center", gap: 4, fontSize: 11, color: "#6b7280" }}>
              <Heart size={11} />{post.likes}
            </span>
          </div>
          <button style={{
            display: "flex", alignItems: "center", gap: 4,
            background: "#e5e7eb", border: "1px solid #2a2a45",
            borderRadius: 6, padding: "5px 12px",
            fontSize: 11, fontWeight: 700, color: "#6366f1",
            cursor: "pointer",
            transition: "background 0.15s",
          }}
            onMouseEnter={e => (e.currentTarget as HTMLElement).style.background = "#f3f4f6"}
            onMouseLeave={e => (e.currentTarget as HTMLElement).style.background = "#e5e7eb"}
            onClick={e => { e.stopPropagation(); navigate(getPostUrl(post)); }}
          >
            더 읽기 <ChevronRight size={11} />
          </button>
        </div>
      </div>
    </article>
  );
}

export default function CategoryPage({ categoryKey }: Props) {
  const [, setLocation] = useLocation();
  const { user } = useAuth();
  const isAdmin = user?.role === "admin";
  const prefetch = usePostPrefetch();

  // SiteConfigContext에서 공유 navItems 읽기 (중복 네트워크 요청 방지)
  const { navItemsData } = useSiteConfig();
  const utils = trpc.useUtils();
  const refetchNavItems = () => utils.admin.getNavItems.invalidate();

  const config = useMemo(() => {
    const isLatest = categoryKey === "latest" || categoryKey === "__latest__";
    if (isLatest) return { title: "최신글", subtitle: "가장 최근에 작성된 글들을 모아보세요", color: "#6366f1", isLatest: true, navItemId: null, introHtml: null };
    if (navItemsData && navItemsData.length > 0) {
      const sorted = [...navItemsData].sort((a, b) => (a.sortOrder ?? 0) - (b.sortOrder ?? 0));
      const idx = sorted.findIndex(n => extractCategoryKey(n.path || "") === categoryKey);
      const navItem = sorted[idx];
      if (navItem) {
        return {
          title: navItem.label,
          subtitle: (navItem as any).description || "",
          color: COLOR_PALETTE[idx % COLOR_PALETTE.length],
          isLatest: false,
          navItemId: navItem.id,
          introHtml: (navItem as any).introHtml || null,
        };
      }
    }
    // fallback
    return { title: categoryKey, subtitle: "", color: "#6366f1", isLatest: false, navItemId: null, introHtml: null };
  }, [navItemsData, categoryKey]);

  // navItems 기반 카테고리 키 → 레이블 맵 (카드 배지용)
  const navLabelMap = useMemo(() => {
    const map: Record<string, string> = {};
    if (navItemsData) {
      navItemsData.forEach(item => {
        const key = extractCategoryKey(item.path || "");
        if (key) map[key] = item.label;
      });
    }
    return map;
  }, [navItemsData]);

  // SEO 메타 태그 동적 적용
  useSEO({
    title: config.title
      ? `${config.title} | 스마트 오토 가이드`
      : undefined,
    description: config.subtitle || undefined,
  });

  // SiteConfigContext에서 공유 데이터 읽기 (중복 네트워크 요청 방지)
  const { siteConfig } = useSiteConfig();
  // 카테고리별 광고 슬롯 조회
  const { data: catAdSlot } = trpc.ads.getCategorySlot.useQuery(
    { categoryKey },
    { enabled: !!categoryKey && categoryKey !== "latest" && categoryKey !== "__latest__" }
  );
  // siteConfig에서 직접 postsPerPage 읽기 (이중 쿼리 방지)
  // SiteConfigContext로 미리 로드되므로 useState 업데이트 불필요
  const POSTS_PER_PAGE = useMemo(() => {
    if (siteConfig?.postsPerPage) {
      const parsed = parseInt(siteConfig.postsPerPage, 10);
      if (!isNaN(parsed) && parsed > 0) return parsed;
    }
    return 15;
  }, [siteConfig?.postsPerPage]);
  const TABLE_PAGE_SIZE = 20;
  const [tableCurrentPage, setTableCurrentPage] = useState(1);

  // 무한 스크롤용 Sentinel ref
  const sentinelRef = useRef<HTMLDivElement>(null);

  // 카테고리 변경 시 테이블 페이지 초기화
  useEffect(() => {
    setTableCurrentPage(1);
  }, [categoryKey]);

  // 페이지 점프 상태
  const [jumpTargetPage, setJumpTargetPage] = useState<number | null>(null);

  // useInfiniteQuery로 무한 스크롤 구현 (tRPC v11 패턴)
  const {
    data: infiniteData,
    isLoading,
    isFetchingNextPage,
    fetchNextPage,
    hasNextPage,
    fetchStatus,
  } = trpc.posts.list.useInfiniteQuery(
    config.isLatest
      ? { limit: POSTS_PER_PAGE }
      : { category: categoryKey, limit: POSTS_PER_PAGE },
    {
      getNextPageParam: (lastPage) => {
        const { page, limit, total } = lastPage as { page: number; limit: number; total: number };
        const nextPage = page + 1;
        return nextPage * limit <= total + limit ? nextPage : undefined;
      },
      initialCursor: 1,
    }
  );

  // 모든 페이지의 게시물을 평탄화
  const posts = infiniteData?.pages.flatMap((p) => (p as any).posts) ?? [];
  const totalPosts = (infiniteData?.pages[0] as any)?.total ?? 0;
  const loadedPageCount = infiniteData?.pages.length ?? 0;
  const totalPageCount = totalPosts > 0 ? Math.ceil(totalPosts / POSTS_PER_PAGE) : 0;

  // 페이지 점프: 목표 페이지까지 순차 fetchNextPage
  useEffect(() => {
    if (jumpTargetPage === null) return;
    if (isFetchingNextPage || fetchStatus === 'fetching') return;
    if (loadedPageCount >= jumpTargetPage) {
      // 목표 페이지 도달 → 해당 페이지 첫 글로 스크롤
      const targetPostIndex = (jumpTargetPage - 1) * POSTS_PER_PAGE;
      const postEls = document.querySelectorAll('[data-post-index]');
      const targetEl = postEls[targetPostIndex] as HTMLElement | undefined;
      if (targetEl) {
        targetEl.scrollIntoView({ behavior: 'smooth', block: 'start' });
      }
      setJumpTargetPage(null);
      return;
    }
    if (hasNextPage) {
      fetchNextPage();
    } else {
      setJumpTargetPage(null);
    }
  }, [jumpTargetPage, loadedPageCount, isFetchingNextPage, fetchStatus, hasNextPage, fetchNextPage, POSTS_PER_PAGE]);

  const handlePageJump = useCallback((page: number) => {
    if (page <= loadedPageCount) {
      // 이미 로드된 페이지 → 바로 스크롤
      const targetPostIndex = (page - 1) * POSTS_PER_PAGE;
      const postEls = document.querySelectorAll('[data-post-index]');
      const targetEl = postEls[targetPostIndex] as HTMLElement | undefined;
      if (targetEl) {
        targetEl.scrollIntoView({ behavior: 'smooth', block: 'start' });
      }
    } else {
      // 아직 로드 안 된 페이지 → 순차 로드 후 스크롤
      setJumpTargetPage(page);
    }
  }, [loadedPageCount, POSTS_PER_PAGE]);

  // Intersection Observer로 스크롤 끝 감지 → 다음 페이지 로드
  useEffect(() => {
    const el = sentinelRef.current;
    if (!el) return;
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0].isIntersecting && hasNextPage && !isFetchingNextPage) {
          fetchNextPage();
        }
      },
      { rootMargin: "300px 0px" }
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, [hasNextPage, isFetchingNextPage, fetchNextPage]);

  // ─── 카테고리 소개 HTML 편집 상태 ──────────────────────────────────────
  const [isEditingIntro, setIsEditingIntro] = useState(false);
  const [editingIntroHtml, setEditingIntroHtml] = useState("");
  const [isSavingIntro, setIsSavingIntro] = useState(false);
  const [introSaveMsg, setIntroSaveMsg] = useState<string | null>(null);

  const updateCategoryIntroHtml = trpc.admin.updateCategoryIntroHtml.useMutation({
    onSuccess: () => {
      setIsEditingIntro(false);
      setIntroSaveMsg("저장되었습니다!");
      refetchNavItems();
      setTimeout(() => setIntroSaveMsg(null), 2500);
    },
    onError: (err) => {
      setIntroSaveMsg(`저장 실패: ${err.message}`);
      setTimeout(() => setIntroSaveMsg(null), 3000);
    },
    onSettled: () => setIsSavingIntro(false),
  });

  const handleEditIntroClick = useCallback(() => {
    setEditingIntroHtml(config.introHtml || "");
    setIsEditingIntro(true);
  }, [config.introHtml]);

  const handleSaveIntro = useCallback(() => {
    if (!config.navItemId) return;
    setIsSavingIntro(true);
    updateCategoryIntroHtml.mutate({ id: config.navItemId, introHtml: editingIntroHtml });
  }, [config.navItemId, editingIntroHtml, updateCategoryIntroHtml]);

  const handleCancelIntro = useCallback(() => {
    setIsEditingIntro(false);
    setEditingIntroHtml("");
  }, []);

  return (
    <div style={{
      minHeight: "100vh",
      background: "#f9fafb",
      fontFamily: "'Noto Sans KR', 'Apple SD Gothic Neo', sans-serif",
    }}>
      <Header onWriteClick={() => setLocation(`/write/${categoryKey}`)} />

      <div style={{
        maxWidth: 1310,
        margin: "0 auto",
        padding: "16px 10px",
        display: "flex",
        gap: 12,
        alignItems: "flex-start",
      }}>
        {/* Left Sidebar */}
        <div className="sidebar-col" style={{ width: 160, flexShrink: 0 }}>
          <Sidebar side="left" />
        </div>

        {/* Main Content */}
        <main style={{ flex: 1, minWidth: 0 }}>
          {/* Page header */}
          <div style={{
            display: "flex", alignItems: "center", justifyContent: "space-between",
            marginBottom: 20, paddingBottom: 14,
            borderBottom: `3px solid ${config.color}`,
          }}>
            <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
              <div style={{
                width: 6, height: 32, borderRadius: 3,
                background: config.color,
                boxShadow: `0 0 10px ${config.color}88`,
              }} />
              <div>
                <h1 style={{ fontSize: 20, fontWeight: 900, color: "#111827", margin: 0, lineHeight: 1.2 }}>
                  {config.title}
                </h1>
                <p style={{ fontSize: 12, color: "#6b7280", margin: 0, marginTop: 3 }}>{config.subtitle}</p>
              </div>
            </div>
            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
              {/* 관리자 전용: 소개 편집 버튼 */}
              {isAdmin && !config.isLatest && config.navItemId && !isEditingIntro && (
                <button
                  onClick={handleEditIntroClick}
                  title="카테고리 소개 편집"
                  style={{
                    display: "flex", alignItems: "center", gap: 6,
                    padding: "7px 14px", borderRadius: 8,
                    background: "#fff", border: "1.5px solid #e5e7eb",
                    fontSize: 12, fontWeight: 600, color: "#6b7280",
                    cursor: "pointer",
                    transition: "all 0.15s",
                  }}
                  onMouseEnter={e => {
                    (e.currentTarget as HTMLElement).style.borderColor = config.color;
                    (e.currentTarget as HTMLElement).style.color = config.color;
                  }}
                  onMouseLeave={e => {
                    (e.currentTarget as HTMLElement).style.borderColor = "#e5e7eb";
                    (e.currentTarget as HTMLElement).style.color = "#6b7280";
                  }}
                >
                  <Edit2 size={13} /> 소개 편집
                </button>
              )}
              <button
                onClick={() => setLocation(`/write/${categoryKey}`)}
                style={{
                  display: "flex", alignItems: "center", gap: 7,
                  padding: "8px 18px", borderRadius: 8,
                  background: "linear-gradient(135deg, #6366f1, #8b5cf6)",
                  border: "none", fontSize: 13, fontWeight: 700, color: "#fff",
                  cursor: "pointer",
                  boxShadow: "0 3px 12px rgba(99,102,241,0.35)",
                }}
              >
                <PenSquare size={14} /> 글쓰기
              </button>
            </div>
          </div>

          {/* 저장 메시지 */}
          {introSaveMsg && (
            <div style={{
              marginBottom: 12, padding: "10px 16px",
              borderRadius: 8, fontSize: 13, fontWeight: 600,
              background: introSaveMsg.startsWith("저장 실패") ? "#fee2e2" : "#d1fae5",
              color: introSaveMsg.startsWith("저장 실패") ? "#b91c1c" : "#065f46",
              border: `1px solid ${introSaveMsg.startsWith("저장 실패") ? "#fca5a5" : "#6ee7b7"}`,
            }}>
              {introSaveMsg}
            </div>
          )}

          {/* 카테고리 소개 HTML 편집 영역 (관리자) */}
          {isAdmin && isEditingIntro && (
            <div style={{
              marginBottom: 24,
              border: "2px solid #6366f1",
              borderRadius: 12,
              overflow: "hidden",
              background: "#fff",
              boxShadow: "0 4px 20px rgba(99,102,241,0.15)",
            }}>
              {/* 편집 헤더 */}
              <div style={{
                display: "flex", alignItems: "center", justifyContent: "space-between",
                padding: "10px 16px",
                background: "linear-gradient(135deg, #6366f1, #8b5cf6)",
                color: "#fff",
              }}>
                <span style={{ fontSize: 13, fontWeight: 700 }}>
                  📝 카테고리 소개 편집 — {config.title}
                </span>
                <div style={{ display: "flex", gap: 8 }}>
                  <button
                    onClick={handleSaveIntro}
                    disabled={isSavingIntro}
                    style={{
                      display: "flex", alignItems: "center", gap: 5,
                      padding: "6px 14px", borderRadius: 6,
                      background: "#fff", border: "none",
                      fontSize: 12, fontWeight: 700, color: "#6366f1",
                      cursor: isSavingIntro ? "not-allowed" : "pointer",
                      opacity: isSavingIntro ? 0.7 : 1,
                    }}
                  >
                    {isSavingIntro ? <Loader2 size={12} style={{ animation: "spin 1s linear infinite" }} /> : <Save size={12} />}
                    저장
                  </button>
                  <button
                    onClick={handleCancelIntro}
                    style={{
                      display: "flex", alignItems: "center", gap: 5,
                      padding: "6px 14px", borderRadius: 6,
                      background: "rgba(255,255,255,0.2)", border: "1px solid rgba(255,255,255,0.4)",
                      fontSize: 12, fontWeight: 700, color: "#fff",
                      cursor: "pointer",
                    }}
                  >
                    <X size={12} /> 취소
                  </button>
                </div>
              </div>
              {/* HTML 소스 에디터 - CodeMirror lazy load */}
              <div style={{ minHeight: 400 }}>
                <Suspense fallback={<div style={{ minHeight: 400, display: "flex", alignItems: "center", justifyContent: "center", color: "#9ca3af" }}><Loader2 size={24} className="animate-spin" /></div>}>
                  <HtmlSourceEditor
                    value={editingIntroHtml}
                    onChange={setEditingIntroHtml}
                    contentWidth={parseInt(siteConfig?.postContentWidth || "960", 10)}
                    minHeight={400}
                  />
                </Suspense>
              </div>
            </div>
          )}

          {/* 카테고리 소개 HTML 표시 영역 (introHtml이 있을 때) */}
          {!isEditingIntro && config.introHtml && (
            <div
              style={{
                marginBottom: 24,
                padding: "20px 24px",
                background: "#fff",
                borderRadius: 12,
                border: "1px solid #e5e7eb",
                boxShadow: "0 1px 4px rgba(0,0,0,0.05)",
                lineHeight: 1.8,
                fontSize: 14.5,
                color: "#374151",
              }}
              dangerouslySetInnerHTML={{ __html: config.introHtml }}
            />
          )}

          {/* 게시물 목록 테이블 (번호/제목/날짜/조회수) - 숨김 처리 */}
          {false && !isLoading && posts && posts.length > 0 && (() => {
            const tableTotalPages = Math.ceil(posts.length / TABLE_PAGE_SIZE);
            const tableStart = (tableCurrentPage - 1) * TABLE_PAGE_SIZE;
            const tableEnd = tableStart + TABLE_PAGE_SIZE;
            const tablePosts = posts.slice(tableStart, tableEnd);
            const serverOffset = 0; // 무한 스크롤 전환 후 단순화
            return (
              <div style={{ marginBottom: 20, border: "1px solid #e5e7eb", borderRadius: 10, overflow: "hidden", background: "#fff", boxShadow: "0 1px 3px rgba(0,0,0,0.05)" }}>
                {/* 테이블 헤더 */}
                <div style={{ display: "grid", gridTemplateColumns: "48px 1fr 100px 70px", background: "#f9fafb", padding: "8px 16px", fontSize: 11, fontWeight: 700, color: "#6b7280", borderBottom: "1px solid #e5e7eb" }}>
                  <div style={{ textAlign: "center" }}>#</div>
                  <div>제목</div>
                  <div>작성일</div>
                  <div style={{ textAlign: "center" }}>조회수</div>
                </div>
                {/* 테이블 행 */}
                {tablePosts.map((post, idx) => {
                  const rowNum = serverOffset + tableStart + idx + 1;
                  return (
                    <div
                      key={post.id}
                      style={{ display: "grid", gridTemplateColumns: "48px 1fr 100px 70px", padding: "8px 16px", fontSize: 12, borderTop: idx > 0 ? "1px solid #f3f4f6" : "none", alignItems: "center", cursor: "pointer", transition: "background 0.1s" }}
                      onClick={() => setLocation(getPostUrl(post as DBPost))}
                      onPointerEnter={() => prefetch({ id: (post as DBPost).id, slug: (post as any).slug, customSlug: (post as any).customSlug })}
                      onMouseEnter={e => (e.currentTarget as HTMLElement).style.background = "#f9fafb"}
                      onMouseLeave={e => (e.currentTarget as HTMLElement).style.background = ""}
                    >
                      <div style={{ textAlign: "center", color: "#9ca3af", fontSize: 11, fontWeight: 600 }}>{rowNum}</div>
                      <div style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", color: "#111827", fontWeight: 700, fontSize: 18, paddingRight: 8 }}>{(post as DBPost).title}</div>
                      <div style={{ color: "#9ca3af", fontSize: 11 }}>{new Date((post as DBPost).createdAt).toLocaleDateString("ko-KR", { year: "2-digit", month: "2-digit", day: "2-digit" })}</div>
                      <div style={{ textAlign: "center", color: "#6b7280", fontSize: 11, display: "flex", alignItems: "center", justifyContent: "center", gap: 3 }}><Eye size={10} />{(post as DBPost).views}</div>
                    </div>
                  );
                })}
                {/* 테이블 페이지네이션 */}
                {tableTotalPages > 1 && (
                  <div style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 4, padding: "10px 16px", borderTop: "1px solid #f3f4f6", background: "#fafafa" }}>
                    {/* 이전 */}
                    <button
                      onClick={() => setTableCurrentPage(p => Math.max(1, p - 1))}
                      disabled={tableCurrentPage === 1}
                      style={{
                        width: 30, height: 30, borderRadius: 6,
                        border: "1px solid #e5e7eb",
                        background: tableCurrentPage === 1 ? "#f3f4f6" : "#fff",
                        color: tableCurrentPage === 1 ? "#d1d5db" : "#374151",
                        cursor: tableCurrentPage === 1 ? "not-allowed" : "pointer",
                        display: "flex", alignItems: "center", justifyContent: "center",
                        fontSize: 14, fontWeight: 700,
                      }}
                      aria-label="이전 페이지"
                    >‹</button>
                    {/* 페이지 번호 */}
                    {(() => {
                      const pages: number[] = [];
                      const delta = 2;
                      const left = Math.max(1, tableCurrentPage - delta);
                      const right = Math.min(tableTotalPages, tableCurrentPage + delta);
                      if (left > 1) { pages.push(1); if (left > 2) pages.push(-1); }
                      for (let i = left; i <= right; i++) pages.push(i);
                      if (right < tableTotalPages) { if (right < tableTotalPages - 1) pages.push(-2); pages.push(tableTotalPages); }
                      return pages.map((p, i) =>
                        p < 0 ? (
                          <span key={`ellipsis-${i}`} style={{ padding: "0 4px", color: "#9ca3af", fontSize: 12 }}>…</span>
                        ) : (
                          <button
                            key={p}
                            onClick={() => setTableCurrentPage(p)}
                            style={{
                              width: 30, height: 30, borderRadius: 6,
                              border: p === tableCurrentPage ? `2px solid ${config.color}` : "1px solid #e5e7eb",
                              background: p === tableCurrentPage ? config.color : "#fff",
                              color: p === tableCurrentPage ? "#fff" : "#374151",
                              cursor: "pointer",
                              fontSize: 12, fontWeight: p === tableCurrentPage ? 700 : 400,
                              transition: "all 0.15s",
                            }}
                          >{p}</button>
                        )
                      );
                    })()}
                    {/* 다음 */}
                    <button
                      onClick={() => setTableCurrentPage(p => Math.min(tableTotalPages, p + 1))}
                      disabled={tableCurrentPage === tableTotalPages}
                      style={{
                        width: 30, height: 30, borderRadius: 6,
                        border: "1px solid #e5e7eb",
                        background: tableCurrentPage === tableTotalPages ? "#f3f4f6" : "#fff",
                        color: tableCurrentPage === tableTotalPages ? "#d1d5db" : "#374151",
                        cursor: tableCurrentPage === tableTotalPages ? "not-allowed" : "pointer",
                        display: "flex", alignItems: "center", justifyContent: "center",
                        fontSize: 14, fontWeight: 700,
                      }}
                      aria-label="다음 페이지"
                    >›</button>
                    <span style={{ marginLeft: 8, fontSize: 11, color: "#9ca3af" }}>{tableCurrentPage} / {tableTotalPages} 페이지</span>
                  </div>
                )}
              </div>
            );
          })()}

          {/* Content */}
          {isLoading ? (
            <div style={{ textAlign: "center", padding: "60px 20px", color: "#6b7280" }}>
              <Loader2 size={32} style={{ animation: "spin 1s linear infinite", margin: "0 auto 12px" }} />
              <div>게시물을 불러오는 중...</div>
            </div>
          ) : !posts || posts.length === 0 ? (
            <div style={{
              textAlign: "center", padding: "60px 20px",
              color: "#6b7280", fontSize: 14,
            }}>
              <div style={{ fontSize: 40, marginBottom: 16 }}>📝</div>
              <div style={{ fontWeight: 700, color: "#6b7280", marginBottom: 8 }}>아직 게시물이 없습니다</div>
              <div style={{ fontSize: 12 }}>첫 번째 글을 작성해보세요!</div>
              <button
                onClick={() => setLocation(`/write/${categoryKey}`)}
                style={{
                  marginTop: 20, padding: "10px 24px",
                  background: "linear-gradient(135deg, #6366f1, #8b5cf6)",
                  border: "none", borderRadius: 8,
                  fontSize: 13, fontWeight: 700, color: "#fff",
                  cursor: "pointer",
                }}
              >글쓰기 시작하기</button>
            </div>
          ) : (
            <div>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 4, marginBottom: 4 }}>
                <div style={{ fontSize: 12, color: "#6b7280" }}>
                  총 <span style={{ color: config.color, fontWeight: 700 }}>{totalPosts}</span>개의 게시물
                </div>
                {/* 상단 페이지 번호 점프 UI (compact 모드) */}
                <PageJumpNav
                  totalPageCount={totalPageCount}
                  loadedPageCount={loadedPageCount}
                  hasNextPage={hasNextPage}
                  jumpTargetPage={jumpTargetPage}
                  color={config.color}
                  onJump={handlePageJump}
                  compact={true}
                />
              </div>

              {/* 상단 반응형 광고 (728×90 / 스마트폰 전체 너비) */}
              {siteConfig && siteConfig["adsense_enabled"] === "true" &&
               siteConfig["ads_master_enabled"] !== "false" &&
               !catAdSlot?.disabled && (() => {
                // 카테고리별 슬롯1이 있으면 우선 사용, 없으면 전역 슬롯1 폴백
                const slot1Code = catAdSlot?.slot1Code?.trim()
                  || siteConfig["adsense_slot1_code"]?.trim()
                  || siteConfig["adsense_slot_code"]?.trim();
                if (!slot1Code) return null;
                const pushScript = `<script>(adsbygoogle = window.adsbygoogle || []).push({});<\/script>`;
                return (
                  <div
                    className="adsense-block"
                    style={{ margin: "0 0 16px", textAlign: "center", clear: "both" }}
                    dangerouslySetInnerHTML={{ __html: slot1Code + pushScript }}
                  />
                );
              })()}

              <div>
                {posts.map((post, idx) => (
                  <>
                    <div key={post.id} data-post-index={idx}>
                    <PostListItem post={post as DBPost} categoryColor={config.color} categoryLabel={navLabelMap[post.category] || post.category} /></div>
                    {/* 목록 중간 광고: 5번째·10번째·15번째 글 이후 (slot2 인피드, 5개 간격 반복) */}
                    {(idx + 1) % 5 === 0 && siteConfig && siteConfig["adsense_enabled"] === "true" &&
                     siteConfig["ads_master_enabled"] !== "false" &&
                     !catAdSlot?.disabled && (() => {
                      // 카테고리별 슬롯2가 있으면 우선 사용, 없으면 전역 슬롯2 폴백
                      const slot2Code = catAdSlot?.slot2Code?.trim()
                        || siteConfig["adsense_slot2_code"]?.trim();
                      if (!slot2Code) return null;
                      const pushScript = `<script>(adsbygoogle = window.adsbygoogle || []).push({});<\/script>`;
                      return (
                        <div
                          key={`ad-mid-${post.id}-${idx}`}
                          className="adsense-block"
                          style={{ margin: "12px 0", textAlign: "center", clear: "both" }}
                          dangerouslySetInnerHTML={{ __html: slot2Code + pushScript }}
                        />
                      );
                    })()}
                  </>
                ))}
              </div>
              {/* 하단 페이지 번호 점프 UI */}
              <PageJumpNav
                totalPageCount={totalPageCount}
                loadedPageCount={loadedPageCount}
                hasNextPage={hasNextPage}
                jumpTargetPage={jumpTargetPage}
                color={config.color}
                onJump={handlePageJump}
              />

              {/* 무한 스크롤 Sentinel */}
              <div ref={sentinelRef} style={{ height: 1 }} />
              {/* 다음 페이지 로딩 인디케이터 */}
              {isFetchingNextPage && (
                <div style={{ display: "flex", justifyContent: "center", padding: "24px 0" }}>
                  <Loader2 size={28} style={{ animation: "spin 1s linear infinite", color: config.color }} />
                </div>
              )}
              {/* 하단 멀티플렉스 광고 (모든 글 로드 완료 후, 댓글창 바로 위) */}
              {!hasNextPage && posts.length > 0 &&
               siteConfig && siteConfig["adsense_enabled"] === "true" &&
               siteConfig["ads_master_enabled"] !== "false" &&
               !catAdSlot?.disabled && (() => {
                // 카테고리별 슬롯3이 있으면 우선 사용, 없으면 전역 슬롯3 폴백
                const slot3Code = catAdSlot?.slot3Code?.trim()
                  || siteConfig["adsense_slot3_code"]?.trim();
                if (!slot3Code) return null;
                const pushScript = `<script>(adsbygoogle = window.adsbygoogle || []).push({});<\/script>`;
                return (
                  <div
                    className="adsense-block"
                    style={{ margin: "16px 0 8px", textAlign: "center", clear: "both" }}
                    dangerouslySetInnerHTML={{ __html: slot3Code + pushScript }}
                  />
                );
              })()}
              {/* 모든 게시물 로드 완료 메시지 */}
              {!hasNextPage && posts.length > 0 && (
                <div style={{ textAlign: "center", padding: "24px 0", color: "#9ca3af", fontSize: 13 }}>
                  총 {totalPosts}개의 글을 모두 불러왔습니다.
                </div>
              )}
            </div>
          )}
        </main>

        {/* Right Sidebar */}
        <div className="sidebar-col" style={{ width: 160, flexShrink: 0 }}>
          <Sidebar side="right" />
        </div>
      </div>

      <Footer />

      <style>{`
        @media (max-width: 1100px) {
          .sidebar-col { display: none !important; }
        }
        @keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }

        /* ─── 카테고리 페이지 모바일 반응형 ─── */
        @media (max-width: 640px) {
          /* 게시물 리스트 아이템: 세로 스택 */
          .post-list-item {
            flex-direction: column !important;
            gap: 10px !important;
            padding: 14px 0 !important;
          }
          /* 썸네일: 가로 전체 너비, 높이 축소 */
          .post-list-thumb {
            width: 100% !important;
            height: 180px !important;
          }
          /* 제목 폰트 크기 축소 */
          .post-list-title {
            font-size: 15px !important;
            margin-bottom: 5px !important;
          }
        }
      `}</style>
    </div>
  );
}
