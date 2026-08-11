/**
 * RelatedPosts.tsx
 * 관련 게시물 추천 섹션 컴포넌트
 * - layout: "card" (카드 그리드) | "list" (가로 리스트)
 * - 같은 카테고리 우선, 부족 시 인기글로 보완 (서버 쿼리)
 * - Intersection Observer 기반 지연 로딩 + decoding="async" + 블러 페이드인
 */

import { useRef, useState, useEffect, useCallback } from "react";
import { useLocation } from "wouter";
import { Eye, Heart, ArrowRight } from "lucide-react";
import { makeSrcSet } from "@/lib/imageUtils";
import { getPostUrl as getSharedPostUrl } from "@/lib/postUrl";

// ─── 타입 ────────────────────────────────────────────────────────────────────

interface RelatedPost {
  id: number;
  title: string;
  excerpt?: string | null;
  thumbnail?: string | null;
  category?: string | null;
  tag?: string | null;
  badge?: string | null;
  views?: number | null;
  likes?: number | null;
  slug?: string | null;
  createdAt?: Date | string | null;
}

interface RelatedPostsProps {
  posts: RelatedPost[];
  isLoading?: boolean;
  currentCategory?: string | null;
  /** 섹션 제목 (기본: "관련 게시물") */
  title?: string;
  /** 섹션 부제목 */
  subtitle?: string;
  /** 레이아웃: "card" = 카드 그리드(기본), "list" = 가로 리스트 */
  layout?: "card" | "list";
}

// ─── 헬퍼 ────────────────────────────────────────────────────────────────────

function getPostUrl(post: RelatedPost): string {
  return getSharedPostUrl({ id: post.id, slug: post.slug });
}

function formatDate(date: Date | string | null | undefined): string {
  if (!date) return "";
  return new Date(date).toLocaleDateString("ko-KR", {
    year: "numeric",
    month: "long",
    day: "numeric",
  });
}

// ─── 지연 로딩 훅 ─────────────────────────────────────────────────────────────
function useIntersectionObserver(rootMargin = "200px 0px") {
  const ref = useRef<HTMLDivElement | null>(null);
  const [isVisible, setIsVisible] = useState(false);

  const setRef = useCallback((node: HTMLDivElement | null) => {
    ref.current = node;
  }, []);

  useEffect(() => {
    const el = ref.current;
    if (!el || isVisible) return;

    if (typeof IntersectionObserver === "undefined") {
      setIsVisible(true);
      return;
    }

    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          setIsVisible(true);
          observer.disconnect();
        }
      },
      { rootMargin, threshold: 0 }
    );

    observer.observe(el);
    return () => observer.disconnect();
  }, [isVisible, rootMargin]);

  return { setRef, isVisible };
}

// ─── 지연 로딩 썸네일 컴포넌트 ───────────────────────────────────────────────
function LazyThumbnail({
  src,
  alt,
  srcSet,
}: {
  src: string;
  alt: string;
  srcSet?: string;
}) {
  const { setRef, isVisible } = useIntersectionObserver("200px 0px");
  const [loaded, setLoaded] = useState(false);
  const [error, setError] = useState(false);

  return (
    <div
      ref={setRef}
      style={{
        position: "absolute",
        inset: 0,
        width: "100%",
        height: "100%",
        overflow: "hidden",
      }}
    >
      {!loaded && !error && (
        <div
          style={{
            position: "absolute",
            inset: 0,
            background:
              "linear-gradient(90deg, #ede9fe 25%, #ddd6fe 50%, #ede9fe 75%)",
            backgroundSize: "200% 100%",
            animation: "shimmer 1.5s infinite",
          }}
        />
      )}

      {isVisible && !error && (
        <img
          src={src}
          srcSet={srcSet}
          sizes="(max-width: 640px) 100vw, (max-width: 1100px) 50vw, 33vw"
          alt={alt}
          decoding="async"
          loading="lazy"
          onLoad={() => setLoaded(true)}
          onError={() => setError(true)}
          style={{
            position: "absolute",
            inset: 0,
            width: "100%",
            height: "100%",
            objectFit: "cover",
            opacity: loaded ? 1 : 0,
            filter: loaded ? "blur(0px)" : "blur(8px)",
            transition: "opacity 0.4s ease, filter 0.4s ease",
            transform: "scale(1)",
          }}
          className="related-lazy-img"
        />
      )}

      {error && (
        <div
          style={{
            position: "absolute",
            inset: 0,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            background: "linear-gradient(135deg, #ede9fe, #ddd6fe)",
            fontSize: 36,
          }}
        >
          📄
        </div>
      )}
    </div>
  );
}

// ─── 스켈레톤 (카드형) ────────────────────────────────────────────────────────
function PostCardSkeleton() {
  return (
    <div
      style={{
        background: "#fff",
        borderRadius: 14,
        overflow: "hidden",
        border: "1.5px solid #f3f4f6",
        boxShadow: "0 2px 8px rgba(0,0,0,0.04)",
      }}
    >
      <div
        style={{
          width: "100%",
          paddingTop: "56.25%",
          background:
            "linear-gradient(90deg, #f3f4f6 25%, #e5e7eb 50%, #f3f4f6 75%)",
          backgroundSize: "200% 100%",
          animation: "shimmer 1.5s infinite",
        }}
      />
      <div style={{ padding: "16px 18px 18px" }}>
        <div
          style={{
            height: 14,
            background: "#f3f4f6",
            borderRadius: 6,
            marginBottom: 10,
            width: "40%",
          }}
        />
        <div
          style={{ height: 18, background: "#f3f4f6", borderRadius: 6, marginBottom: 6 }}
        />
        <div
          style={{ height: 18, background: "#f3f4f6", borderRadius: 6, width: "75%" }}
        />
      </div>
    </div>
  );
}

// ─── 스켈레톤 (리스트형) ─────────────────────────────────────────────────────
function PostListSkeleton() {
  return (
    <div
      style={{
        display: "flex",
        gap: 16,
        padding: "14px 0",
        borderBottom: "1px solid #f3f4f6",
        alignItems: "center",
      }}
    >
      <div
        style={{
          width: 120,
          height: 80,
          borderRadius: 8,
          flexShrink: 0,
          background: "linear-gradient(90deg, #f3f4f6 25%, #e5e7eb 50%, #f3f4f6 75%)",
          backgroundSize: "200% 100%",
          animation: "shimmer 1.5s infinite",
        }}
      />
      <div style={{ flex: 1 }}>
        <div style={{ height: 18, background: "#f3f4f6", borderRadius: 6, marginBottom: 8, width: "70%" }} />
        <div style={{ height: 14, background: "#f3f4f6", borderRadius: 6, marginBottom: 6 }} />
        <div style={{ height: 14, background: "#f3f4f6", borderRadius: 6, width: "50%" }} />
      </div>
    </div>
  );
}

// ─── 메인 컴포넌트 ────────────────────────────────────────────────────────────

export default function RelatedPosts({
  posts,
  isLoading = false,
  currentCategory,
  title = "관련 게시물",
  subtitle,
  layout = "card",
}: RelatedPostsProps) {
  const [, navigate] = useLocation();

  const defaultSubtitle = currentCategory
    ? `'${currentCategory}' 카테고리의 다른 글도 읽어보세요`
    : "비슷한 주제의 글을 더 읽어보세요";

  const displaySubtitle = subtitle ?? defaultSubtitle;

  if (!isLoading && (!posts || posts.length === 0)) return null;

  return (
    <section
      style={{
        maxWidth: 960,
        margin: "0 auto",
        padding: "0 10px 40px",
      }}
    >
      {/* 전역 스타일 */}
      <style>{`
        @keyframes shimmer {
          0%   { background-position: -200% 0; }
          100% { background-position:  200% 0; }
        }
        /* ── 카드형 ── */
        .related-card {
          background: #fff;
          border-radius: 10px;
          overflow: hidden;
          border: 1.5px solid #f3f4f6;
          box-shadow: 0 2px 6px rgba(0,0,0,0.04);
          cursor: pointer;
          transition: transform 0.22s ease, box-shadow 0.22s ease, border-color 0.22s ease;
          display: flex;
          flex-direction: column;
        }
        .related-card:hover {
          transform: translateY(-4px);
          box-shadow: 0 12px 32px rgba(99,102,241,0.13);
          border-color: #c7d2fe;
        }
        .related-card:hover .related-lazy-img {
          transform: scale(1.06) !important;
        }
        .related-grid {
          display: grid;
          grid-template-columns: repeat(3, minmax(0, 1fr));
          gap: 14px;
          justify-content: center;
        }
        @media (max-width: 900px) {
          .related-grid { grid-template-columns: repeat(2, 1fr); }
        }
        @media (max-width: 560px) {
          .related-grid { grid-template-columns: 1fr; }
        }
        /* ── 리스트형 ── */
        .related-list-item {
          display: flex;
          gap: 16px;
          padding: 14px 0;
          border-bottom: 1px solid #f3f4f6;
          cursor: pointer;
          transition: background 0.15s;
          border-radius: 6px;
        }
        .related-list-item:last-child {
          border-bottom: none;
        }
        .related-list-item:hover {
          background: #f9fafb;
        }
        .related-list-item:hover .related-lazy-img {
          transform: scale(1.04) !important;
        }
        .related-list-thumb {
          width: 140px;
          height: 94px;
          border-radius: 8px;
          overflow: hidden;
          position: relative;
          flex-shrink: 0;
          background: linear-gradient(135deg, #ede9fe, #ddd6fe);
        }
        @media (max-width: 560px) {
          .related-list-thumb { width: 96px; height: 64px; }
        }
        /* ── 공통 버튼 ── */
        .related-read-btn {
          display: inline-flex;
          align-items: center;
          gap: 4px;
          font-size: 12px;
          font-weight: 700;
          color: #6366f1;
          background: #ede9fe;
          border: none;
          border-radius: 6px;
          padding: 5px 12px;
          cursor: pointer;
          transition: background 0.15s, color 0.15s;
          white-space: nowrap;
        }
        .related-read-btn:hover {
          background: #6366f1;
          color: #fff;
        }
      `}</style>

      {/* 섹션 헤더 */}
      <div
        style={{
          borderTop: "2px solid #e5e7eb",
          paddingTop: 22,
          marginBottom: 16,
        }}
      >
        <h3
          style={{
            fontSize: 16,
            fontWeight: 800,
            color: "#111827",
            marginBottom: 4,
            display: "flex",
            alignItems: "center",
            gap: 8,
          }}
        >
          <span
            style={{
              display: "inline-block",
              width: 3,
              height: 17,
              background: "linear-gradient(180deg, #6366f1, #8b5cf6)",
              borderRadius: 2,
            }}
          />
          {title}
        </h3>
        <p style={{ fontSize: 11, color: "#9ca3af", margin: 0 }}>
          {displaySubtitle}
        </p>
      </div>

      {/* ── 카드 그리드 레이아웃 ── */}
      {layout === "card" && (
        <div className="related-grid">
          {isLoading
            ? Array.from({ length: 3 }).map((_, i) => (
                <PostCardSkeleton key={i} />
              ))
            : posts.map((post) => (
                <article
                  key={post.id}
                  className="related-card"
                  onClick={() => navigate(getPostUrl(post))}
                  role="link"
                  tabIndex={0}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" || e.key === " ") navigate(getPostUrl(post));
                  }}
                  aria-label={`관련 게시물: ${post.title}`}
                >
                  {/* 썸네일 */}
                  <div
                    style={{
                      width: "100%",
                      paddingTop: "56.25%",
                      position: "relative",
                      background: "linear-gradient(135deg, #ede9fe, #ddd6fe)",
                      overflow: "hidden",
                      flexShrink: 0,
                    }}
                  >
                    {post.thumbnail ? (
                      <LazyThumbnail src={post.thumbnail} srcSet={makeSrcSet(post.thumbnail)} alt={post.title} />
                    ) : (
                      <div
                        style={{
                          position: "absolute",
                          inset: 0,
                          display: "flex",
                          alignItems: "center",
                          justifyContent: "center",
                          fontSize: 36,
                        }}
                      >
                        📄
                      </div>
                    )}
                    {post.category && (
                      <span
                        style={{
                          position: "absolute",
                          top: 10,
                          left: 10,
                          fontSize: 10,
                          fontWeight: 800,
                          background: "rgba(99,102,241,0.9)",
                          color: "#fff",
                          padding: "3px 8px",
                          borderRadius: 4,
                          backdropFilter: "blur(4px)",
                          zIndex: 1,
                        }}
                      >
                        {post.category}
                      </span>
                    )}
                    {post.badge && (
                      <span
                        style={{
                          position: "absolute",
                          top: 10,
                          right: 10,
                          fontSize: 9,
                          fontWeight: 800,
                          background: "#f59e0b",
                          color: "#fff",
                          padding: "3px 7px",
                          borderRadius: 4,
                          zIndex: 1,
                        }}
                      >
                        {post.badge}
                      </span>
                    )}
                  </div>

                  {/* 텍스트 */}
                  <div
                    style={{
                      padding: "11px 13px 13px",
                      flex: 1,
                      display: "flex",
                      flexDirection: "column",
                      justifyContent: "space-between",
                      gap: 7,
                    }}
                  >
                    <div>
                      <h4
                        style={{
                          fontSize: 13,
                          fontWeight: 700,
                          color: "#111827",
                          lineHeight: 1.4,
                          margin: "0 0 5px",
                          display: "-webkit-box",
                          WebkitLineClamp: 2,
                          WebkitBoxOrient: "vertical" as const,
                          overflow: "hidden",
                        }}
                      >
                        {post.title}
                      </h4>
                      {post.excerpt && (
                        <p
                          style={{
                            fontSize: 11,
                            color: "#6b7280",
                            lineHeight: 1.55,
                            margin: 0,
                            display: "-webkit-box",
                            WebkitLineClamp: 2,
                            WebkitBoxOrient: "vertical" as const,
                            overflow: "hidden",
                          }}
                        >
                          {post.excerpt}
                        </p>
                      )}
                    </div>
                    <div
                      style={{
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "space-between",
                        marginTop: 4,
                      }}
                    >
                      <div
                        style={{
                          display: "flex",
                          alignItems: "center",
                          gap: 7,
                          fontSize: 10,
                          color: "#9ca3af",
                        }}
                      >
                        <span style={{ display: "flex", alignItems: "center", gap: 3 }}>
                          <Eye size={11} />
                          {post.views ?? 0}
                        </span>
                        <span style={{ display: "flex", alignItems: "center", gap: 3 }}>
                          <Heart size={11} />
                          {post.likes ?? 0}
                        </span>
                      </div>
                      <button
                        type="button"
                        className="related-read-btn"
                        onClick={(e) => {
                          e.stopPropagation();
                          navigate(getPostUrl(post));
                        }}
                        aria-label={`${post.title} 읽기`}
                      >
                        읽기 <ArrowRight size={11} />
                      </button>
                    </div>
                  </div>
                </article>
              ))}
        </div>
      )}

      {/* ── 가로 리스트 레이아웃 ── */}
      {layout === "list" && (
        <div>
          {isLoading
            ? Array.from({ length: 3 }).map((_, i) => (
                <PostListSkeleton key={i} />
              ))
            : posts.map((post) => (
                <article
                  key={post.id}
                  className="related-list-item"
                  onClick={() => navigate(getPostUrl(post))}
                  role="link"
                  tabIndex={0}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" || e.key === " ") navigate(getPostUrl(post));
                  }}
                  aria-label={`관련 게시물: ${post.title}`}
                >
                  {/* 썸네일 */}
                  <div className="related-list-thumb">
                    {post.thumbnail ? (
                      <LazyThumbnail src={post.thumbnail} srcSet={makeSrcSet(post.thumbnail)} alt={post.title} />
                    ) : (
                      <div
                        style={{
                          position: "absolute",
                          inset: 0,
                          display: "flex",
                          alignItems: "center",
                          justifyContent: "center",
                          fontSize: 28,
                        }}
                      >
                        📄
                      </div>
                    )}
                    {post.category && (
                      <span
                        style={{
                          position: "absolute",
                          top: 6,
                          left: 6,
                          fontSize: 9,
                          fontWeight: 800,
                          background: "rgba(99,102,241,0.9)",
                          color: "#fff",
                          padding: "2px 6px",
                          borderRadius: 3,
                          backdropFilter: "blur(4px)",
                          zIndex: 1,
                        }}
                      >
                        {post.category}
                      </span>
                    )}
                  </div>

                  {/* 텍스트 */}
                  <div
                    style={{
                      flex: 1,
                      minWidth: 0,
                      display: "flex",
                      flexDirection: "column",
                      justifyContent: "space-between",
                      padding: "2px 0",
                    }}
                  >
                    <div>
                      <h4
                        style={{
                          fontSize: 15,
                          fontWeight: 700,
                          color: "#111827",
                          lineHeight: 1.45,
                          margin: "0 0 6px",
                          display: "-webkit-box",
                          WebkitLineClamp: 2,
                          WebkitBoxOrient: "vertical" as const,
                          overflow: "hidden",
                        }}
                      >
                        {post.title}
                      </h4>
                      {post.excerpt && (
                        <p
                          style={{
                            fontSize: 12.5,
                            color: "#6b7280",
                            lineHeight: 1.6,
                            margin: 0,
                            display: "-webkit-box",
                            WebkitLineClamp: 2,
                            WebkitBoxOrient: "vertical" as const,
                            overflow: "hidden",
                          }}
                        >
                          {post.excerpt}
                        </p>
                      )}
                    </div>
                    <div
                      style={{
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "space-between",
                        marginTop: 8,
                      }}
                    >
                      <div
                        style={{
                          display: "flex",
                          alignItems: "center",
                          gap: 10,
                          fontSize: 11,
                          color: "#9ca3af",
                        }}
                      >
                        {post.createdAt && (
                          <span>{formatDate(post.createdAt)}</span>
                        )}
                        <span style={{ display: "flex", alignItems: "center", gap: 3 }}>
                          <Eye size={12} />
                          {post.views ?? 0}
                        </span>
                        <span style={{ display: "flex", alignItems: "center", gap: 3 }}>
                          <Heart size={12} />
                          {post.likes ?? 0}
                        </span>
                      </div>
                      <button
                        type="button"
                        className="related-read-btn"
                        onClick={(e) => {
                          e.stopPropagation();
                          navigate(getPostUrl(post));
                        }}
                        aria-label={`${post.title} 읽기`}
                      >
                        더 읽기 <ArrowRight size={11} />
                      </button>
                    </div>
                  </div>
                </article>
              ))}
        </div>
      )}
    </section>
  );
}
