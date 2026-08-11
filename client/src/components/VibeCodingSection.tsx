import { useEffect, useRef } from "react";
import { getPostUrl } from "@/lib/postUrl";
import type { Post } from "../data/blogData";
import { ThumbsUp, ArrowRight, Clock } from "lucide-react";
import { trpc } from "@/lib/trpc";
import { useSiteConfig } from "@/contexts/SiteConfigContext";
import { usePostPrefetch } from "@/hooks/usePostPrefetch";
import { getCategoryPlaceholder } from "@/lib/categoryPlaceholder";
import { makeSrcSet, FEATURED_SIZES, CARD_SIZES } from "@/lib/imageUtils";

type HomeAdPosition = "between_sections" | "top" | "bottom" | "after_section_header" | "between_cards";

interface Props {
  sectionNum?: string | number;
  title: string;
  subtitle?: string;
  posts: Post[];
  categoryPath?: string;
  isLoading?: boolean;
  isFirst?: boolean;
  /** 메인 섹션 광고 삽입 설정 */
  adSlotCode?: string;
  adScriptCode?: string;
  adPosition?: HomeAdPosition;
  showAd?: boolean;
}

/** 날짜 포맷 헬퍼 */
function formatDate(dateStr?: string | number | null): string {
  if (!dateStr) return "";
  try {
    const d = new Date(typeof dateStr === "number" ? dateStr : dateStr);
    if (isNaN(d.getTime())) return "";
    return d.toLocaleDateString("ko-KR", { year: "numeric", month: "long", day: "numeric" });
  } catch { return ""; }
}

// ─── 프리미엄 섹션 헤더 ───────────────────────────────────────────────────
function SectionHeader({ sectionNum, title, subtitle, categoryPath }: {
  sectionNum?: string | number;
  title: string;
  subtitle?: string;
  categoryPath?: string;
}) {
  return (
    <div style={{
      display: "flex", alignItems: "flex-end", justifyContent: "space-between",
      marginBottom: 18, paddingBottom: 14,
      borderBottom: "1px solid #e5e7eb",
      position: "relative",
    }}>
      {/* 좌측 하단 강조 라인 */}
      <div style={{
        position: "absolute", bottom: -1, left: 0,
        width: sectionNum != null ? 48 : 36, height: 2,
        background: "linear-gradient(90deg, #6366f1, #8b5cf6)",
        borderRadius: 2,
      }} />
      <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
        {sectionNum != null && (
          <span style={{
            display: "flex", alignItems: "center", justifyContent: "center",
            width: 30, height: 30, borderRadius: 8, flexShrink: 0,
            background: "linear-gradient(135deg, #6366f1, #8b5cf6)",
            color: "#fff", fontSize: 13, fontWeight: 900,
            boxShadow: "0 4px 12px rgba(99,102,241,0.30)",
            letterSpacing: "-0.02em",
          }}>{sectionNum}</span>
        )}
        <div>
          <h2 style={{
            fontSize: 20, fontWeight: 800, color: "#111827", margin: 0,
            lineHeight: 1.2, letterSpacing: "-0.03em",
          }}>{title}</h2>
          {subtitle && (
            <p style={{ fontSize: 12, color: "#9ca3af", margin: "3px 0 0", fontWeight: 400 }}>{subtitle}</p>
          )}
        </div>
      </div>
      <a
        href={categoryPath || "#"}
        style={{
          display: "inline-flex", alignItems: "center", gap: 4,
          fontSize: 13, fontWeight: 600, color: "#6366f1",
          textDecoration: "none", padding: "5px 12px",
          border: "1px solid #e0e7ff", borderRadius: 999,
          background: "#f5f3ff",
          transition: "all 0.15s",
          whiteSpace: "nowrap",
        }}
        onMouseEnter={e => {
          const el = e.currentTarget as HTMLElement;
          el.style.background = "#6366f1";
          el.style.color = "#fff";
          el.style.borderColor = "#6366f1";
        }}
        onMouseLeave={e => {
          const el = e.currentTarget as HTMLElement;
          el.style.background = "#f5f3ff";
          el.style.color = "#6366f1";
          el.style.borderColor = "#e0e7ff";
        }}
      >
        더보기 <ArrowRight size={13} />
      </a>
    </div>
  );
}

// ─── 피처드(대형) 카드 ────────────────────────────────────────────────────
function FeaturedCard({ post, borderColor = "#e0e7ff", borderWidth = "1px", isFirst = false, onPrefetch }: {
  post: Post; borderColor?: string; borderWidth?: string; isFirst?: boolean; onPrefetch?: (post: Post) => void
}) {
  const href = post.id ? getPostUrl(post) : "#";
  const dateStr = formatDate((post as any).publishedAt || (post as any).createdAt);
  return (
    <a
      href={href}
      className="vibe-featured-card"
      style={{
        display: "flex", flexDirection: "column", textDecoration: "none",
        background: "#ffffff",
        border: `${borderWidth} solid ${borderColor}`,
        borderRadius: 14,
        overflow: "hidden", height: "100%",
        boxShadow: "0 1px 3px rgba(0,0,0,0.06), 0 4px 16px rgba(99,102,241,0.06)",
        transition: "transform 0.2s cubic-bezier(0.34,1.56,0.64,1), box-shadow 0.2s ease, border-color 0.2s ease",
      }}
      onPointerEnter={() => onPrefetch?.(post)}
      onMouseEnter={e => {
        const el = e.currentTarget as HTMLElement;
        el.style.transform = "translateY(-4px)";
        el.style.borderColor = "#a5b4fc";
        el.style.boxShadow = "0 4px 6px rgba(0,0,0,0.04), 0 16px 40px rgba(99,102,241,0.16)";
      }}
      onMouseLeave={e => {
        const el = e.currentTarget as HTMLElement;
        el.style.transform = "";
        el.style.borderColor = borderColor;
        el.style.boxShadow = "0 1px 3px rgba(0,0,0,0.06), 0 4px 16px rgba(99,102,241,0.06)";
      }}
    >
      {/* 이미지 */}
      <div className="vibe-featured-card-img" style={{ position: "relative", overflow: "hidden", height: 240, flexShrink: 0 }}>
        {post.image ? (
          <img
            src={post.image}
            srcSet={makeSrcSet(post.image)}
            sizes={FEATURED_SIZES}
            alt={post.title}
            loading={isFirst ? "eager" : "lazy"}
            fetchPriority={isFirst ? "high" : "auto"}
            decoding={isFirst ? "sync" : "async"}
            width={600}
            height={240}
            style={{ width: "100%", height: "100%", objectFit: "cover", transition: "transform 0.4s ease" }}
            onMouseEnter={e => (e.currentTarget as HTMLElement).style.transform = "scale(1.04)"}
            onMouseLeave={e => (e.currentTarget as HTMLElement).style.transform = ""}
          />
        ) : (() => {
          const ph = getCategoryPlaceholder(post.category);
          return (
            <div style={{
              width: "100%", height: "100%",
              background: ph.gradient,
              display: "flex", flexDirection: "column",
              alignItems: "center", justifyContent: "center",
              gap: 8,
            }}>
              <span style={{ fontSize: ph.iconSize, lineHeight: 1 }}>{ph.icon}</span>
            </div>
          );
        })()}
        {/* 하단 그라디언트 오버레이 */}
        <div style={{ position: "absolute", inset: 0, background: "linear-gradient(to top, rgba(0,0,0,0.55) 0%, rgba(0,0,0,0.1) 40%, transparent 70%)" }} />
        {/* 카테고리 뱃지 */}
        {post.category && (
          <span style={{
            position: "absolute", top: 12, left: 12,
            background: "rgba(99,102,241,0.9)", color: "#fff",
            fontSize: 10, fontWeight: 700, padding: "3px 9px", borderRadius: 999,
            backdropFilter: "blur(4px)",
            letterSpacing: "0.02em",
          }}>{post.category}</span>
        )}
        {post.badge && (
          <span style={{
            position: "absolute", top: 12, right: 12,
            background: "rgba(0,0,0,0.6)", color: "#fbbf24",
            fontSize: 9, fontWeight: 800, padding: "3px 8px", borderRadius: 4,
            border: "1px solid rgba(251,191,36,0.5)",
            backdropFilter: "blur(4px)",
          }}>{post.badge}</span>
        )}
      </div>
      {/* 텍스트 */}
      <div style={{ padding: "16px 20px 18px", flex: 1, display: "flex", flexDirection: "column" }}>
        <h3 style={{
          fontSize: 19, fontWeight: 800, color: "#111827",
          lineHeight: 1.4, margin: "0 0 8px",
          letterSpacing: "-0.02em",
          display: "-webkit-box",
          WebkitLineClamp: 2,
          WebkitBoxOrient: "vertical" as const,
          overflow: "hidden",
        }}>{post.title}</h3>
        {post.excerpt && (
          <p style={{
            fontSize: 13.5, color: "#6b7280", lineHeight: 1.7,
            margin: "0 0 12px", flex: 1,
            display: "-webkit-box",
            WebkitLineClamp: 3,
            WebkitBoxOrient: "vertical" as const,
            overflow: "hidden",
          }}>{post.excerpt}</p>
        )}
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginTop: "auto" }}>
          {dateStr && (
            <span style={{ display: "flex", alignItems: "center", gap: 4, fontSize: 11, color: "#9ca3af" }}>
              <Clock size={11} />{dateStr}
            </span>
          )}
          {post.likes != null && post.likes > 0 && (
            <span style={{ display: "flex", alignItems: "center", gap: 3, fontSize: 11, color: "#9ca3af" }}>
              <ThumbsUp size={11} />{post.likes}
            </span>
          )}
        </div>
      </div>
    </a>
  );
}

// ─── 소형 카드 ────────────────────────────────────────────────────────────
function SmallCard({ post, borderColor = "#e0e7ff", borderWidth = "1px", onPrefetch }: {
  post: Post; borderColor?: string; borderWidth?: string; onPrefetch?: (post: Post) => void
}) {
  const href = post.id ? getPostUrl(post) : "#";
  const dateStr = formatDate((post as any).publishedAt || (post as any).createdAt);
  return (
    <a
      href={href}
      className="vibe-small-card"
      style={{
        display: "flex", flexDirection: "column", textDecoration: "none",
        background: "#ffffff",
        border: `${borderWidth} solid ${borderColor}`,
        borderRadius: 12,
        overflow: "hidden",
        boxShadow: "0 1px 3px rgba(0,0,0,0.05), 0 2px 8px rgba(99,102,241,0.05)",
        transition: "transform 0.2s cubic-bezier(0.34,1.56,0.64,1), box-shadow 0.2s ease, border-color 0.2s ease",
      }}
      onPointerEnter={() => onPrefetch?.(post)}
      onMouseEnter={e => {
        const el = e.currentTarget as HTMLElement;
        el.style.transform = "translateY(-3px)";
        el.style.borderColor = "#a5b4fc";
        el.style.boxShadow = "0 4px 6px rgba(0,0,0,0.04), 0 10px 28px rgba(99,102,241,0.14)";
      }}
      onMouseLeave={e => {
        const el = e.currentTarget as HTMLElement;
        el.style.transform = "";
        el.style.borderColor = borderColor;
        el.style.boxShadow = "0 1px 3px rgba(0,0,0,0.05), 0 2px 8px rgba(99,102,241,0.05)";
      }}
    >
      {/* 이미지 */}
      <div style={{ position: "relative", overflow: "hidden", flexShrink: 0 }} className="vibe-small-card-img">
        {post.image ? (
          <img
            loading="lazy"
            src={post.image}
            srcSet={makeSrcSet(post.image)}
            sizes={CARD_SIZES}
            alt={post.title}
            width={300}
            height={130}
            style={{ width: "100%", height: "100%", objectFit: "cover", transition: "transform 0.4s ease" }}
            onMouseEnter={e => (e.currentTarget as HTMLElement).style.transform = "scale(1.05)"}
            onMouseLeave={e => (e.currentTarget as HTMLElement).style.transform = ""}
          />
        ) : (() => {
          const ph = getCategoryPlaceholder(post.category);
          return (
            <div style={{
              width: "100%", height: "100%",
              background: ph.gradient,
              display: "flex", flexDirection: "column",
              alignItems: "center", justifyContent: "center",
              gap: 4,
            }}>
              <span style={{ fontSize: Math.round(ph.iconSize * 0.6), lineHeight: 1 }}>{ph.icon}</span>
            </div>
          );
        })()}
        <div style={{ position: "absolute", inset: 0, background: "linear-gradient(to top, rgba(0,0,0,0.45) 0%, transparent 60%)" }} />
        {post.badge && (
          <span style={{
            position: "absolute", top: 7, right: 7,
            background: "rgba(0,0,0,0.6)", color: "#fbbf24",
            fontSize: 8, fontWeight: 800, padding: "2px 6px", borderRadius: 3,
            border: "1px solid rgba(251,191,36,0.4)",
          }}>{post.badge}</span>
        )}
      </div>
      {/* 텍스트 */}
      <div style={{ padding: "10px 13px 12px", flex: 1, display: "flex", flexDirection: "column" }}>
        <h3 style={{
          fontSize: 13.5, fontWeight: 700, color: "#111827",
          lineHeight: 1.45, margin: "0 0 6px",
          letterSpacing: "-0.01em",
          display: "-webkit-box",
          WebkitLineClamp: 2,
          WebkitBoxOrient: "vertical" as const,
          overflow: "hidden",
        }}>{post.title}</h3>
        {dateStr && (
          <span style={{ display: "flex", alignItems: "center", gap: 3, fontSize: 10.5, color: "#9ca3af", marginTop: "auto" }}>
            <Clock size={10} />{dateStr}
          </span>
        )}
      </div>
    </a>
  );
}

// ─── 스켈레톤 카드 ────────────────────────────────────────────────────────
function SkeletonCard({ large = false }: { large?: boolean }) {
  return (
    <div style={{
      background: "#ffffff",
      border: "1px solid #f3f4f6",
      borderRadius: large ? 14 : 12,
      overflow: "hidden", height: "100%",
    }}>
      <div style={{
        height: large ? 240 : 130,
        background: "linear-gradient(90deg, #f9fafb 25%, #f3f4f6 50%, #f9fafb 75%)",
        backgroundSize: "200% 100%",
        animation: "shimmer 1.5s infinite",
      }} />
      <div style={{ padding: large ? "16px 20px" : "10px 13px" }}>
        <div style={{ height: large ? 22 : 14, background: "#f3f4f6", borderRadius: 6, marginBottom: 8, width: "90%" }} />
        {large && <div style={{ height: 14, background: "#f3f4f6", borderRadius: 6, marginBottom: 6, width: "75%" }} />}
        <div style={{ height: 10, background: "#f3f4f6", borderRadius: 6, width: "40%" }} />
      </div>
    </div>
  );
}

/** 인라인 섹션 광고 배너 */
function HomeAdBannerInline({ slotCode, scriptCode, position = "after_section_header" }: { slotCode: string; scriptCode: string; position?: string }) {
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

export default function VibeCodingSection({ sectionNum, title, subtitle, posts, categoryPath, isLoading, isFirst = false, adSlotCode, adScriptCode, adPosition, showAd }: Props) {
  const { siteConfig } = useSiteConfig();
  const cardBorderColor = siteConfig?.cardBorderColor || "#e0e7ff";
  const cardBorderWidth = siteConfig?.cardBorderWidth || "1px";
  const prefetch = usePostPrefetch();

  const featured = posts[0];
  const smallCards = posts.slice(1, 5);
  const isEmpty = !isLoading && (!posts || posts.length === 0);

  const sectionAdBanner = showAd && adSlotCode && adScriptCode ? (
    <HomeAdBannerInline slotCode={adSlotCode} scriptCode={adScriptCode} />
  ) : null;

  return (
    <section style={{ marginBottom: 40 }}>
      <SectionHeader
        sectionNum={sectionNum}
        title={title}
        subtitle={subtitle}
        categoryPath={categoryPath}
      />
      {adPosition === "after_section_header" && sectionAdBanner}
      {isEmpty ? (
        <div style={{
          padding: "36px 0", textAlign: "center",
          color: "#9ca3af", fontSize: 14,
          border: "1.5px dashed #e5e7eb", borderRadius: 14,
          background: "#fafafa",
        }}>
          아직 등록된 게시글이 없습니다. 첫 번째 글을 작성해 보세요!
        </div>
      ) : (
        <>
          <div className="vibe-layout">
            {isLoading ? <SkeletonCard large /> : featured ? <FeaturedCard post={featured} borderColor={cardBorderColor} borderWidth={cardBorderWidth} isFirst={isFirst} onPrefetch={prefetch} /> : null}
            {adPosition === "between_cards" && sectionAdBanner}
            <div className="vibe-small-grid">
              {isLoading
                ? Array.from({ length: 4 }).map((_, i) => <SkeletonCard key={i} />)
                : (
                  <>
                    {smallCards.map(post => (
                      <SmallCard key={post.id} post={post} borderColor={cardBorderColor} borderWidth={cardBorderWidth} onPrefetch={prefetch} />
                    ))}
                    {smallCards.length < 4 && Array.from({ length: 4 - smallCards.length }).map((_, i) => (
                      <div key={`empty-${i}`} className="vibe-empty-slot" style={{
                        background: "#f9fafb", border: "1px dashed #e5e7eb",
                        borderRadius: 12, minHeight: 130,
                      }} />
                    ))}
                  </>
                )
              }
            </div>
          </div>
          <style>{`
            @media (max-width: 480px) {
              .vibe-empty-slot { display: none; }
            }
          `}</style>
        </>
      )}
    </section>
  );
}
