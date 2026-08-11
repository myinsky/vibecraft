import { useState, useEffect, useRef } from "react";
import { Download, Star, ChevronRight, ArrowRight } from "lucide-react";
import type { VibeApp } from "../data/blogData";
import AppDetailModal from "./AppDetailModal";
import { trpc } from "@/lib/trpc";
import { getCategoryPlaceholder } from "@/lib/categoryPlaceholder";

interface Props {
  apps: VibeApp[];
  sectionNum?: string | number;
  title?: string;
  subtitle?: string;
  categoryPath?: string;
  hideHeader?: boolean; // CategoryPage에서 사용 시 헤더 중복 방지
  // 섹션 내부 광고 지원
  adSlotCode?: string;
  adScriptCode?: string;
  showAd?: boolean;
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
    try { (window as any).adsbygoogle = (window as any).adsbygoogle || []; (window as any).adsbygoogle.push({}); } catch {};
  }, [slotCode, scriptCode]);
  if (!slotCode.trim() || !scriptCode.trim()) return null;
  return <div ref={ref} style={{ margin: "12px 0", minHeight: "clamp(90px, 20vw, 250px)", contain: "layout size" }} />;
}

export default function MyAppsSection({
  apps,
  sectionNum,
  title = "진행중인 자동화 프로그램",
  subtitle = "직접 개발한 자동화 프로그램을 무료로 다운로드하세요",
  categoryPath = "/category/my-apps",
  hideHeader = false,
  adSlotCode,
  adScriptCode,
  showAd,
}: Props) {
  const [selectedApp, setSelectedApp] = useState<VibeApp | null>(null);
  const { data: siteConfig } = trpc.admin.getSiteConfig.useQuery(undefined, { staleTime: 10 * 60 * 1000, refetchOnWindowFocus: false });
  const cardBorderColor = siteConfig?.cardBorderColor || "#c7d2fe";
  const cardBorderWidth = siteConfig?.cardBorderWidth || "1.5px";
  const injected = useRef(false);
  useEffect(() => {
    if (injected.current) return;
    injected.current = true;
    const style = document.createElement("style");
    style.textContent = `
      .myapps-grid {
        display: grid;
        grid-template-columns: repeat(auto-fill, minmax(200px, 1fr));
        gap: 12px;
      }
      @media (max-width: 768px) {
        .myapps-grid {
          grid-template-columns: repeat(2, 1fr);
          gap: 10px;
        }
      }
      @media (max-width: 480px) {
        .myapps-grid {
          grid-template-columns: 1fr;
          gap: 10px;
        }
      }
    `;
    document.head.appendChild(style);
  }, []);

  return (
    <section style={{ marginBottom: 40 }}>
      {/* Section header - hideHeader=true일 때 숨김 (CategoryPage에서 이미 헤더 렌더링) */}
      {!hideHeader && (
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
            background: "linear-gradient(90deg, #10b981, #059669)",
            borderRadius: 2,
          }} />
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            {sectionNum != null && (
              <span style={{
                display: "flex", alignItems: "center", justifyContent: "center",
                width: 30, height: 30, borderRadius: 8, flexShrink: 0,
                background: "linear-gradient(135deg, #10b981, #059669)",
                color: "#fff", fontSize: 13, fontWeight: 900,
                boxShadow: "0 4px 12px rgba(16,185,129,0.30)",
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
            href={categoryPath}
            style={{
              display: "inline-flex", alignItems: "center", gap: 4,
              fontSize: 13, fontWeight: 600, color: "#10b981",
              textDecoration: "none", padding: "5px 12px",
              border: "1px solid #a7f3d0", borderRadius: 999,
              background: "#ecfdf5",
              transition: "all 0.15s",
              whiteSpace: "nowrap",
            }}
            onMouseEnter={e => {
              const el = e.currentTarget as HTMLElement;
              el.style.background = "#10b981";
              el.style.color = "#fff";
              el.style.borderColor = "#10b981";
            }}
            onMouseLeave={e => {
              const el = e.currentTarget as HTMLElement;
              el.style.background = "#ecfdf5";
              el.style.color = "#10b981";
              el.style.borderColor = "#a7f3d0";
            }}
          >
            전체 앱 보기 <ArrowRight size={13} />
          </a>
        </div>
      )}

      {/* 섹션 헤더 아래 광고 */}
      {showAd && adSlotCode && adScriptCode && !hideHeader && (
        <SectionAdBannerInline slotCode={adSlotCode} scriptCode={adScriptCode} />
      )}

      {/* 앱이 없을 때 빈 상태 메시지 */}
      {apps.length === 0 ? (
        <div style={{
          padding: "36px 0", textAlign: "center",
          color: "#9ca3af", fontSize: 13,
          border: "1.5px dashed #e5e7eb", borderRadius: 14, background: "#fafafa",
        }}>
          등록된 프로그램이 없습니다.
        </div>
      ) : (
        /* App cards grid */
        <div className="myapps-grid">
          {apps.map(app => (
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
                transition: "transform 0.18s, border-color 0.18s, box-shadow 0.18s",
                display: "flex",
                flexDirection: "column",
              }}
              onMouseEnter={e => {
                const el = e.currentTarget as HTMLElement;
                el.style.transform = "translateY(-4px)";
                el.style.borderColor = cardBorderColor;
                el.style.boxShadow = "0 10px 28px rgba(99,102,241,0.22)";
              }}
              onMouseLeave={e => {
                const el = e.currentTarget as HTMLElement;
                el.style.transform = "";
                el.style.borderColor = cardBorderColor;
                el.style.boxShadow = "0 2px 8px rgba(99,102,241,0.07)";
              }}
            >
              {/* Thumbnail */}
              <div style={{ position: "relative", height: 110, overflow: "hidden" }}>
                {app.image ? (
                  <img
                    src={app.image}
                    alt={app.name}
                    loading="lazy"
                    decoding="async"
                    width={400}
                    height={110}
                    style={{ width: "100%", height: "100%", objectFit: "cover" }}
                  />
                ) : (() => {
                  const ph = getCategoryPlaceholder(app.category);
                  return (
                    <div style={{
                      width: "100%", height: "100%",
                      background: ph.gradient,
                      display: "flex", flexDirection: "column",
                      alignItems: "center", justifyContent: "center",
                      gap: 4,
                    }}>
                      <span style={{ fontSize: Math.round(ph.iconSize * 0.75), lineHeight: 1 }}>{ph.icon}</span>
                      {app.category && (
                        <span style={{
                          fontSize: 9, fontWeight: 700, color: "rgba(255,255,255,0.85)",
                          background: "rgba(0,0,0,0.2)", borderRadius: 999,
                          padding: "1px 7px",
                        }}>{app.category}</span>
                      )}
                    </div>
                  );
                })()}
                <div style={{
                  position: "absolute", inset: 0,
                  background: "linear-gradient(to bottom, rgba(13,13,26,0.1) 0%, rgba(13,13,26,0.7) 100%)",
                }} />
                {/* Badge */}
                {app.badge && (
                  <span style={{
                    position: "absolute", top: 8, left: 8,
                    background: app.categoryColor,
                    color: "#fff", fontSize: 9, fontWeight: 800,
                    padding: "2px 7px", borderRadius: 3,
                  }}>{app.badge}</span>
                )}
                {/* Icon */}
                <div style={{
                  position: "absolute", bottom: 8, left: 10,
                  width: 34, height: 34, borderRadius: 8,
                  background: "linear-gradient(135deg, #1e1b4b, #3730a3)",
                  border: "1.5px solid rgba(99,102,241,0.4)",
                  display: "flex", alignItems: "center", justifyContent: "center",
                  fontSize: 18,
                  boxShadow: "0 2px 8px rgba(0,0,0,0.5)",
                }}>{app.icon}</div>
              </div>

              {/* Content */}
              <div style={{ padding: "10px 12px 12px", flex: 1, display: "flex", flexDirection: "column" }}>
                {/* Category */}
                <span style={{
                  fontSize: 9, fontWeight: 700,
                  color: app.categoryColor,
                  background: app.categoryColor + "18",
                  padding: "2px 7px", borderRadius: 3,
                  display: "inline-block", marginBottom: 6, alignSelf: "flex-start",
                }}>{app.category}</span>

                {/* Name */}
                <div style={{
                  fontSize: 13, fontWeight: 800, color: "#111827",
                  lineHeight: 1.3, marginBottom: 4,
                }}>{app.name}</div>

                {/* Tagline */}
                <div style={{
                  fontSize: 11, color: "#6b7280", lineHeight: 1.5, marginBottom: 10,
                  flex: 1,
                  display: "-webkit-box",
                  WebkitLineClamp: 2,
                  WebkitBoxOrient: "vertical" as const,
                  overflow: "hidden",
                }}>{app.tagline}</div>

                {/* Stats row */}
                <div style={{
                  display: "flex", alignItems: "center", justifyContent: "space-between",
                  paddingTop: 8, borderTop: "1px solid #e5e7eb",
                }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 4 }}>
                    <Star size={11} fill="#f59e0b" color="#f59e0b" />
                    <span style={{ fontSize: 11, fontWeight: 700, color: "#f59e0b" }}>{app.rating}</span>
                    <span style={{ fontSize: 10, color: "#6b7280" }}>({app.reviewCount})</span>
                  </div>
                  <div style={{ display: "flex", alignItems: "center", gap: 4, color: "#6b7280" }}>
                    <Download size={10} />
                    <span style={{ fontSize: 10 }}>{(app.downloads / 1000).toFixed(1)}K</span>
                  </div>
                </div>

                {/* CTA */}
                <div style={{
                  marginTop: 10,
                  background: "linear-gradient(135deg, rgba(99,102,241,0.15), rgba(139,92,246,0.1))",
                  border: "1px solid rgba(99,102,241,0.3)",
                  borderRadius: 7, padding: "6px 0",
                  textAlign: "center",
                  fontSize: 11, fontWeight: 700, color: "#6366f1",
                  display: "flex", alignItems: "center", justifyContent: "center", gap: 5,
                }}>
                  자세히 보기 <ChevronRight size={11} />
                </div>
              </div>
            </button>
          ))}
        </div>
      )}

      {/* App Detail Modal */}
      <AppDetailModal app={selectedApp} onClose={() => setSelectedApp(null)} />
    </section>
  );
}
