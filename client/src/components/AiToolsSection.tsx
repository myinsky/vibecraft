import { useEffect, useRef } from "react";
import { getPostUrl } from "@/lib/postUrl";
import type { Post } from "../data/blogData";
import { ThumbsUp, ArrowRight, Clock } from "lucide-react";
import { trpc } from "@/lib/trpc";
import { useSiteConfig } from "@/contexts/SiteConfigContext";
import { usePostPrefetch } from "@/hooks/usePostPrefetch";
import { getCategoryPlaceholder } from "@/lib/categoryPlaceholder";
import { makeSrcSet, CARD_SIZES } from "@/lib/imageUtils";

interface Props {
  posts: Post[];
  categoryPath?: string;
  sectionNum?: string | number;
  title?: string;
  subtitle?: string;
  accentColor?: string;
  adSlotCode?: string;
  adScriptCode?: string;
  showAd?: boolean;
}

/** 날짜 포맷 헬퍼 */
function formatDate(dateStr?: string | number | null): string {
  if (!dateStr) return "";
  try {
    const d = new Date(typeof dateStr === "number" ? dateStr : dateStr);
    if (isNaN(d.getTime())) return "";
    return d.toLocaleDateString("ko-KR", { month: "short", day: "numeric" });
  } catch { return ""; }
}

/** 섹션 헤더 아래 인라인 광고 배너 */
function SectionAdBannerInline({ slotCode, scriptCode }: { slotCode: string; scriptCode: string }) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!ref.current || !slotCode.trim() || !scriptCode.trim()) return;
    const clientMatch = scriptCode.match(/data-ad-client="([^"]+)"/);
    const adClient = clientMatch ? clientMatch[1] : "";
    if (!adClient) return;
    const ins = document.createElement("ins");
    ins.className = "adsbygoogle";
    ins.style.cssText = "display:block;width:100%;";
    ins.setAttribute("data-ad-client", adClient);
    ins.setAttribute("data-ad-slot", slotCode.trim());
    ins.setAttribute("data-ad-format", "auto");
    ins.setAttribute("data-full-width-responsive", "true");
    ref.current.appendChild(ins);
    try { (window as any).adsbygoogle = (window as any).adsbygoogle || []; (window as any).adsbygoogle.push({}); } catch {}
  }, [slotCode, scriptCode]);
  if (!slotCode.trim() || !scriptCode.trim()) return null;
  return <div ref={ref} style={{ margin: "12px 0", minHeight: "clamp(90px, 20vw, 250px)", contain: "layout size" }} />;
}

export default function AiToolsSection({
  posts,
  categoryPath,
  sectionNum,
  title = "AI 툴 추천",
  subtitle = "실제로 써본 AI 도구들을 솔직하게 비교합니다",
  accentColor = "#e11d48",
  adSlotCode,
  adScriptCode,
  showAd,
}: Props) {
  const injected = useRef(false);
  const { siteConfig } = useSiteConfig();
  const cardBorderColor = siteConfig?.cardBorderColor || "#ffe4e6";
  const cardBorderWidth = siteConfig?.cardBorderWidth || "1px";
  const prefetch = usePostPrefetch();

  useEffect(() => {
    if (injected.current) return;
    injected.current = true;
    const style = document.createElement("style");
    style.textContent = `
      .aitools-grid {
        display: grid;
        grid-template-columns: repeat(3, 1fr);
        gap: 18px;
      }
      @media (max-width: 768px) {
        .aitools-grid {
          grid-template-columns: repeat(2, 1fr);
          gap: 14px;
        }
      }
      @media (max-width: 480px) {
        .aitools-grid {
          grid-template-columns: 1fr;
          gap: 12px;
        }
      }
    `;
    document.head.appendChild(style);
  }, []);

  const displayPosts = (posts || []).slice(0, 6);

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
          width: sectionNum != null ? 48 : 36, height: 2,
          background: `linear-gradient(90deg, ${accentColor}, ${accentColor}99)`,
          borderRadius: 2,
        }} />
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          {sectionNum != null && (
            <span style={{
              display: "flex", alignItems: "center", justifyContent: "center",
              width: 30, height: 30, borderRadius: 8, flexShrink: 0,
              background: `linear-gradient(135deg, ${accentColor}, ${accentColor}cc)`,
              color: "#fff", fontSize: 13, fontWeight: 900,
              boxShadow: `0 4px 12px ${accentColor}40`,
              letterSpacing: "-0.02em",
            }}>{sectionNum}</span>
          )}
          <div>
            <h2 style={{
              fontSize: 20, fontWeight: 800, color: "#111827", margin: 0,
              lineHeight: 1.2, letterSpacing: "-0.03em",
            }}>{title}</h2>
            <p style={{ fontSize: 12, color: "#9ca3af", margin: "3px 0 0", fontWeight: 400 }}>{subtitle}</p>
          </div>
        </div>
        <a
          href={categoryPath || "#"}
          style={{
            display: "inline-flex", alignItems: "center", gap: 4,
            fontSize: 13, fontWeight: 600, color: accentColor,
            textDecoration: "none", padding: "5px 12px",
            border: `1px solid ${accentColor}33`, borderRadius: 999,
            background: `${accentColor}0d`,
            transition: "all 0.15s",
            whiteSpace: "nowrap",
          }}
          onMouseEnter={e => {
            const el = e.currentTarget as HTMLElement;
            el.style.background = accentColor;
            el.style.color = "#fff";
            el.style.borderColor = accentColor;
          }}
          onMouseLeave={e => {
            const el = e.currentTarget as HTMLElement;
            el.style.background = `${accentColor}0d`;
            el.style.color = accentColor;
            el.style.borderColor = `${accentColor}33`;
          }}
        >
          더보기 <ArrowRight size={13} />
        </a>
      </div>

      {showAd && adSlotCode && adScriptCode && (
        <SectionAdBannerInline slotCode={adSlotCode} scriptCode={adScriptCode} />
      )}

      {displayPosts.length === 0 && (
        <div style={{
          padding: "36px 0", textAlign: "center",
          color: "#9ca3af", fontSize: 14,
          border: "1.5px dashed #e5e7eb", borderRadius: 14,
          background: "#fafafa",
        }}>
          아직 등록된 게시글이 없습니다. 첫 번째 글을 작성해 보세요!
        </div>
      )}
      {displayPosts.length > 0 && (
        <div className="aitools-grid">
          {displayPosts.map(post => {
            const href = post.id ? getPostUrl(post) : "#";
            const dateStr = formatDate((post as any).publishedAt || (post as any).createdAt);
            return (
              <a
                key={post.id}
                href={href}
                style={{
                  display: "flex", flexDirection: "column", textDecoration: "none",
                  background: "#ffffff",
                  border: `${cardBorderWidth} solid ${cardBorderColor}`,
                  borderRadius: 14,
                  overflow: "hidden",
                  boxShadow: `0 1px 3px rgba(0,0,0,0.05), 0 2px 8px ${accentColor}10`,
                  transition: "transform 0.2s cubic-bezier(0.34,1.56,0.64,1), box-shadow 0.2s ease, border-color 0.2s ease",
                }}
                onPointerEnter={() => prefetch(post)}
                onMouseEnter={e => {
                  const el = e.currentTarget as HTMLElement;
                  el.style.transform = "translateY(-4px)";
                  el.style.borderColor = `${accentColor}66`;
                  el.style.boxShadow = `0 4px 6px rgba(0,0,0,0.04), 0 12px 32px ${accentColor}22`;
                }}
                onMouseLeave={e => {
                  const el = e.currentTarget as HTMLElement;
                  el.style.transform = "";
                  el.style.borderColor = cardBorderColor;
                  el.style.boxShadow = `0 1px 3px rgba(0,0,0,0.05), 0 2px 8px ${accentColor}10`;
                }}
              >
                <div style={{ position: "relative", overflow: "hidden", height: 180, flexShrink: 0 }}>
                  {post.image ? (
                    <img
                      src={post.image}
                      srcSet={makeSrcSet(post.image)}
                      sizes={CARD_SIZES}
                      alt={post.title}
                      loading="lazy"
                      decoding="async"
                      width={400}
                      height={180}
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
                        gap: 8,
                      }}>
                        <span style={{ fontSize: ph.iconSize, lineHeight: 1 }}>{ph.icon}</span>
                      </div>
                    );
                  })()}
                  <div style={{ position: "absolute", inset: 0, background: "linear-gradient(to top, rgba(0,0,0,0.45) 0%, transparent 60%)" }} />
                  {/* 카테고리 뱃지 */}
                  {post.category && (
                    <span style={{
                      position: "absolute", top: 10, left: 10,
                      background: `${accentColor}dd`, color: "#fff",
                      fontSize: 9.5, fontWeight: 700, padding: "2px 8px", borderRadius: 999,
                      backdropFilter: "blur(4px)",
                    }}>{post.category}</span>
                  )}
                  {post.badge && (
                    <span style={{
                      position: "absolute", top: 10, right: 10,
                      background: "rgba(0,0,0,0.55)", color: "#fbbf24",
                      fontSize: 9, fontWeight: 800, padding: "3px 8px", borderRadius: 4,
                      border: "1px solid rgba(251,191,36,0.5)",
                    }}>{post.badge}</span>
                  )}
                </div>

                <div style={{ padding: "13px 16px 14px", flex: 1, display: "flex", flexDirection: "column" }}>
                  <h3 style={{
                    fontSize: 15, fontWeight: 700, color: "#111827",
                    lineHeight: 1.45, margin: "0 0 7px",
                    letterSpacing: "-0.01em",
                    display: "-webkit-box",
                    WebkitLineClamp: 2,
                    WebkitBoxOrient: "vertical" as const,
                    overflow: "hidden",
                  }}>{post.title}</h3>

                  {post.excerpt && (
                    <p style={{
                      fontSize: 12.5, color: "#6b7280", lineHeight: 1.65,
                      margin: "0 0 10px", flex: 1,
                      display: "-webkit-box",
                      WebkitLineClamp: 2,
                      WebkitBoxOrient: "vertical" as const,
                      overflow: "hidden",
                    }}>{post.excerpt}</p>
                  )}

                  <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginTop: "auto" }}>
                    {dateStr && (
                      <span style={{ display: "flex", alignItems: "center", gap: 3, fontSize: 10.5, color: "#9ca3af" }}>
                        <Clock size={10} />{dateStr}
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
          })}
        </div>
      )}
    </section>
  );
}
