import type { Post } from "../data/blogData";
import { getPostUrl } from "@/lib/postUrl";
import { Clock, ArrowRight } from "lucide-react";
import { trpc } from "@/lib/trpc";
import { getCategoryPlaceholder } from "@/lib/categoryPlaceholder";
import { makeSrcSet, CARD_SIZES } from "@/lib/imageUtils";

interface Props { posts: Post[]; }

/** 날짜 포맷 헬퍼 */
function formatDate(dateStr?: string | number | null): string {
  if (!dateStr) return "";
  try {
    const d = new Date(typeof dateStr === "number" ? dateStr : dateStr);
    if (isNaN(d.getTime())) return "";
    return d.toLocaleDateString("ko-KR", { month: "short", day: "numeric" });
  } catch { return ""; }
}

function LatestCard({ post, borderColor = "#e0e7ff", borderWidth = "1px" }: {
  post: Post; borderColor?: string; borderWidth?: string
}) {
  const href = post.id ? getPostUrl(post) : "#";
  const dateStr = formatDate((post as any).publishedAt || (post as any).createdAt);
  return (
    <a
      href={href}
      style={{
        display: "flex", flexDirection: "column", textDecoration: "none",
        background: "#ffffff",
        border: `${borderWidth} solid ${borderColor}`,
        borderRadius: 12, overflow: "hidden",
        boxShadow: "0 1px 3px rgba(0,0,0,0.05), 0 2px 8px rgba(99,102,241,0.05)",
        transition: "transform 0.2s cubic-bezier(0.34,1.56,0.64,1), box-shadow 0.2s ease, border-color 0.2s ease",
      }}
      onMouseEnter={e => {
        const el = e.currentTarget as HTMLElement;
        el.style.transform = "translateY(-4px)";
        el.style.borderColor = "#a5b4fc";
        el.style.boxShadow = "0 4px 6px rgba(0,0,0,0.04), 0 12px 32px rgba(99,102,241,0.14)";
      }}
      onMouseLeave={e => {
        const el = e.currentTarget as HTMLElement;
        el.style.transform = "";
        el.style.borderColor = borderColor;
        el.style.boxShadow = "0 1px 3px rgba(0,0,0,0.05), 0 2px 8px rgba(99,102,241,0.05)";
      }}
    >
      <div className="latest-card-img" style={{ position: "relative", overflow: "hidden", height: 150, flexShrink: 0 }}>
        {post.image ? (
          <img
            loading="lazy"
            decoding="async"
            src={post.image}
            srcSet={makeSrcSet(post.image)}
            sizes={CARD_SIZES}
            alt={post.title}
            width={400}
            height={150}
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
              gap: 6,
            }}>
              <span style={{ fontSize: ph.iconSize * 0.7, lineHeight: 1 }}>{ph.icon}</span>
            </div>
          );
        })()}
        <div style={{ position: "absolute", inset: 0, background: "linear-gradient(to top, rgba(0,0,0,0.5) 0%, transparent 55%)" }} />
        {/* 카테고리 뱃지 */}
        {post.category && (
          <span style={{
            position: "absolute", top: 10, left: 10,
            background: "rgba(99,102,241,0.85)", color: "#fff",
            fontSize: 9.5, fontWeight: 700, padding: "2px 8px", borderRadius: 999,
            backdropFilter: "blur(4px)",
          }}>{post.category}</span>
        )}
        {post.badge && (
          <span style={{
            position: "absolute", top: 7, right: 7,
            background: "rgba(0,0,0,0.55)", color: "#fbbf24",
            fontSize: 9, fontWeight: 800, padding: "2px 6px", borderRadius: 3,
            border: "1px solid rgba(251,191,36,0.35)",
          }}>{post.badge}</span>
        )}
      </div>
      <div style={{ padding: "11px 14px 13px", flex: 1, display: "flex", flexDirection: "column" }}>
        <h3 className="latest-card-title" style={{
          fontSize: 14, fontWeight: 700, color: "#111827",
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

export default function LatestSection({ posts }: Props) {
  const { data: siteConfig } = trpc.admin.getSiteConfig.useQuery(undefined, { staleTime: 10 * 60 * 1000, refetchOnWindowFocus: false });
  if (!posts || posts.length === 0) return null;
  const cardBorderColor = siteConfig?.cardBorderColor || "#e0e7ff";
  const cardBorderWidth = siteConfig?.cardBorderWidth || "1px";
  const displayPosts = posts.slice(0, 6);

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
          background: "linear-gradient(90deg, #6366f1, #8b5cf6)",
          borderRadius: 2,
        }} />
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <div style={{
            width: 4, height: 24,
            background: "linear-gradient(180deg, #6366f1, #8b5cf6)",
            borderRadius: 2, flexShrink: 0,
          }} />
          <div>
            <h2 style={{
              fontSize: 20, fontWeight: 800, color: "#111827", margin: 0,
              letterSpacing: "-0.03em",
            }}>최신 글</h2>
            <p style={{ fontSize: 12, color: "#9ca3af", margin: "3px 0 0", fontWeight: 400 }}>가장 최근에 작성된 글들을 만나보세요</p>
          </div>
        </div>
        <a
          href="/category/latest"
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
      <div className="latest-grid" style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 16 }}>
        {displayPosts.map(post => (
          <LatestCard key={post.id} post={post} borderColor={cardBorderColor} borderWidth={cardBorderWidth} />
        ))}
      </div>
    </section>
  );
}
