/**
 * Sidebar - DB 기반 동적 사이드바
 * 관리자 설정(/admin)에서 변경한 내용이 실시간으로 반영됩니다.
 * - 광고/슬롯/링크 항목이 없으면 아무것도 표시하지 않습니다.
 * - link 타입: menuStyle 10종 지원
 *   default / button / pill / underline / card / indent / neon / glass / floating / bold-border
 */
import { trpc } from "@/lib/trpc";
import { parseMenuLinks } from "@/lib/menuUtils";

interface SidebarProps {
  side: "left" | "right";
}

type MenuStyle =
  | "default"
  | "button"
  | "pill"
  | "underline"
  | "card"
  | "indent"
  | "neon"
  | "glass"
  | "floating"
  | "bold-border";

// 뱃지 색상 매핑
const BADGE_STYLES: Record<string, { bg: string; color: string }> = {
  HOT:  { bg: "#fee2e2", color: "#dc2626" },
  NEW:  { bg: "#dcfce7", color: "#16a34a" },
  FREE: { bg: "#fef9c3", color: "#ca8a04" },
  UP:   { bg: "#dbeafe", color: "#2563eb" },
  TOP:  { bg: "#f3e8ff", color: "#9333ea" },
};
const getBadgeStyle = (badge: string) =>
  BADGE_STYLES[badge.toUpperCase()] || { bg: "#f3f4f6", color: "#6b7280" };

/** 뱃지 렌더링 헬퍼 */
function BadgeTag({ badge }: { badge: string }) {
  const bs = getBadgeStyle(badge);
  return (
    <span style={{
      fontSize: 8, fontWeight: 800, padding: "2px 5px",
      borderRadius: 4, flexShrink: 0,
      background: bs.bg, color: bs.color,
      letterSpacing: "0.3px",
    }}>{badge.toUpperCase()}</span>
  );
}

export default function Sidebar({ side }: SidebarProps) {
  const { data: allItems, isLoading } = trpc.admin.getSidebarItems.useQuery(
    undefined,
    { staleTime: 15 * 60 * 1000, refetchOnWindowFocus: false } // 15분 캐시
  );
  const items = (allItems || []).filter(item => item.side === side && item.visible);

  const adItems     = items.filter(i => i.itemType === "ad");
  const htmlAdItems = items.filter(i => i.itemType === "html-ad");
  const linkItems   = items.filter(i => i.itemType === "link");
  const slotItems   = items.filter(i => i.itemType === "slot");

  if (isLoading) return null;
  if (adItems.length === 0 && htmlAdItems.length === 0 && slotItems.length === 0 && linkItems.length === 0) {
    return null;
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>

      {/* ── 메뉴 추가 (link) 항목들 ─────────────────────────────────── */}
      {linkItems.map((item) => {
        const menuLinks = parseMenuLinks(item.htmlCode);
        if (menuLinks.length === 0) return null;

        const menuStyle    = ((item as any).menuStyle || "default") as MenuStyle;
        const fontWeight   = (item as any).menuFontWeight === "extrabold" ? 900
                           : (item as any).menuFontWeight === "bold"      ? 700 : 500;
        const fontSize     = (item as any).menuFontSize ?? 12;
        const borderRadius = (item as any).menuBorderRadius ?? 10;
        const menuBgColor  = (item as any).menuBgColor || "";
        const headerHidden = (item as any).menuHeaderHidden ?? false;
        const menuTextColor = (item as any).textColor || "";

        // 컨테이너 스타일 (스타일별 차이)
        const containerStyle: React.CSSProperties = (() => {
          switch (menuStyle) {
            case "neon":
              return {
                background: "#0d0d1a",
                border: "1px solid #6366f1",
                borderRadius,
                overflow: "hidden",
                boxShadow: "0 0 12px rgba(99,102,241,0.3), inset 0 0 20px rgba(99,102,241,0.05)",
              };
            case "glass":
              return {
                background: "rgba(255,255,255,0.65)",
                backdropFilter: "blur(12px)",
                WebkitBackdropFilter: "blur(12px)",
                border: "1px solid rgba(255,255,255,0.8)",
                borderRadius,
                overflow: "hidden",
                boxShadow: "0 4px 20px rgba(0,0,0,0.08)",
              };
            case "floating":
              return {
                background: "#ffffff",
                border: "none",
                borderRadius,
                overflow: "hidden",
                boxShadow: "0 8px 30px rgba(0,0,0,0.12), 0 2px 8px rgba(0,0,0,0.06)",
              };
            case "card":
              return {
                background: "#ffffff",
                border: "1px solid #e5e7eb",
                borderRadius,
                overflow: "hidden",
                boxShadow: "0 2px 8px rgba(0,0,0,0.06)",
              };
            case "bold-border":
              return {
                background: "#ffffff",
                border: "1px solid #e5e7eb",
                borderLeft: "4px solid #6366f1",
                borderRadius,
                overflow: "hidden",
                boxShadow: "0 1px 4px rgba(0,0,0,0.05)",
              };
            default:
              return {
                background: "#ffffff",
                border: "1px solid #e5e7eb",
                borderRadius,
                overflow: "hidden",
                boxShadow: "0 1px 4px rgba(0,0,0,0.06)",
              };
          }
        })();

        // 섹션 헤더 스타일
        const headerStyle: React.CSSProperties = (() => {
          switch (menuStyle) {
            case "neon":
              return {
                background: "linear-gradient(135deg, #1a1a3e 0%, #0d0d1a 100%)",
                borderBottom: "1px solid #6366f1",
                padding: "9px 14px",
                display: "flex", alignItems: "center", gap: 7,
              };
            case "glass":
              return {
                background: "rgba(99,102,241,0.12)",
                borderBottom: "1px solid rgba(255,255,255,0.5)",
                padding: "9px 14px",
                display: "flex", alignItems: "center", gap: 7,
              };
            case "floating":
              return {
                background: "linear-gradient(135deg, #6366f1 0%, #8b5cf6 100%)",
                padding: "10px 14px",
                display: "flex", alignItems: "center", gap: 7,
                boxShadow: "0 2px 8px rgba(99,102,241,0.3)",
              };
            case "card":
              return {
                background: "#f9fafb",
                borderBottom: "2px solid #e5e7eb",
                padding: "9px 14px",
                display: "flex", alignItems: "center", gap: 7,
              };
            case "bold-border":
              return {
                background: "linear-gradient(90deg, rgba(99,102,241,0.08) 0%, transparent 100%)",
                borderBottom: "1px solid #e5e7eb",
                padding: "9px 14px",
                display: "flex", alignItems: "center", gap: 7,
              };
            default:
              return {
                background: "linear-gradient(135deg, #6366f1 0%, #8b5cf6 100%)",
                padding: "9px 14px",
                display: "flex", alignItems: "center", gap: 7,
              };
          }
        })();

        const headerTextColor = menuStyle === "card" ? "#374151"
          : menuStyle === "glass" ? "#4338ca"
          : menuStyle === "bold-border" ? "#6366f1"
          : "#ffffff";

        return (
          <div key={item.id} style={containerStyle}>
            {/* 섹션 헤더 */}
            {item.title && !headerHidden && (
              <div style={headerStyle}>
                <span style={{ fontSize: 15 }}>📋</span>
                <span style={{
                  fontSize: 12, fontWeight: 800, color: headerTextColor,
                  letterSpacing: "0.3px", flex: 1,
                }}>{item.title}</span>
              </div>
            )}

            {/* 메뉴 링크 목록 */}
            <div style={{
              padding: (menuStyle === "button" || menuStyle === "pill" || menuStyle === "card" || menuStyle === "floating") ? "8px" : "4px 0",
            }}>
              {menuLinks.map((link, i) => (
                <SidebarMenuLink
                  key={i}
                  link={link}
                  index={i}
                  total={menuLinks.length}
                  menuStyle={menuStyle}
                  fontSize={fontSize}
                  fontWeight={fontWeight}
                  borderRadius={borderRadius}
                  menuBgColor={menuBgColor}
                  menuTextColor={menuTextColor}
                />
              ))}
            </div>
          </div>
        );
      })}

      {/* ── 광고 배너 항목들 ─────────────────────────────────────────── */}
      {adItems.map((item) => (
        <a
          key={item.id}
          href={item.url || "#"}
          target={item.url?.startsWith("http") ? "_blank" : undefined}
          rel="noopener noreferrer"
          style={{
            display: "block",
            background: item.bgColor || "#ede9fe",
            borderRadius: 10,
            padding: "12px 10px",
            textDecoration: "none",
            position: "relative",
            overflow: "hidden",
            border: "1px solid rgba(255,255,255,0.08)",
            boxShadow: "0 1px 4px rgba(0,0,0,0.08)",
            transition: "transform 0.15s, box-shadow 0.15s",
          }}
          onMouseEnter={e => {
            (e.currentTarget as HTMLElement).style.transform = "translateY(-1px)";
            (e.currentTarget as HTMLElement).style.boxShadow = "0 4px 16px rgba(0,0,0,0.15)";
          }}
          onMouseLeave={e => {
            (e.currentTarget as HTMLElement).style.transform = "";
            (e.currentTarget as HTMLElement).style.boxShadow = "0 1px 4px rgba(0,0,0,0.08)";
          }}
        >
          {item.badge && (
            <span style={{
              position: "absolute", top: 6, right: 6,
              background: "rgba(255,255,255,0.2)", color: "#fff",
              fontSize: 9, fontWeight: 800, padding: "2px 6px", borderRadius: 3,
              letterSpacing: "0.5px",
            }}>{item.badge}</span>
          )}
          <div style={{ fontSize: 12, fontWeight: 800, color: item.textColor || "#fff", marginBottom: 3 }}>
            {item.title}
          </div>
          {item.description && (
            <div style={{ fontSize: 10, color: item.textColor || "#fff", opacity: 0.8, lineHeight: 1.4, marginBottom: 6 }}>
              {item.description}
            </div>
          )}
          {item.price && (
            <div style={{ fontSize: 13, fontWeight: 900, color: "#fff", marginBottom: 6 }}>{item.price}</div>
          )}
          {item.btnText && (
            <div style={{
              background: item.btnColor || "rgba(255,255,255,0.2)",
              color: "#fff", fontSize: 10, fontWeight: 700,
              padding: "4px 0", borderRadius: 4, textAlign: "center",
            }}>{item.btnText}</div>
          )}
        </a>
      ))}

      {/* ── HTML 광고 코드 항목들 ─────────────────────────────────────── */}
      {htmlAdItems.map((item) => (
        <div
          key={item.id}
          style={{ overflow: "hidden", borderRadius: 8, minHeight: 100, contain: "layout" }}
          dangerouslySetInnerHTML={{ __html: item.htmlCode || "" }}
        />
      ))}

      {/* ── 광고 슬롯 항목들 ─────────────────────────────────────────── */}
      {slotItems.map((item) => (
        <div key={item.id} style={{
          background: "#ffffff",
          border: "1px dashed #d1d5db",
          borderRadius: 8, padding: "14px 10px",
          textAlign: "center",
        }}>
          <div style={{ fontSize: 9, color: "#6b7280", marginBottom: 4 }}>{item.title}</div>
          {item.description && <div style={{ fontSize: 9, color: "#374151" }}>{item.description}</div>}
          {item.url && (
            <a href={item.url} style={{ display: "block", marginTop: 6, fontSize: 9, color: "#6366f1" }}>
              광고 문의
            </a>
          )}
        </div>
      ))}
    </div>
  );
}

// ── 개별 메뉴 링크 컴포넌트 ────────────────────────────────────────────────
interface MenuLinkProps {
  link: { label: string; url?: string; icon?: string; badge?: string; description?: string };
  index: number;
  total: number;
  menuStyle: MenuStyle;
  fontSize: number;
  fontWeight: number;
  borderRadius: number;
  menuBgColor: string;
  menuTextColor: string;
}

function SidebarMenuLink({
  link, index, total,
  menuStyle, fontSize, fontWeight, borderRadius,
  menuBgColor, menuTextColor,
}: MenuLinkProps) {
  const isLast = index === total - 1;
  const href = link.url || "#";
  const isExternal = link.url?.startsWith("http");

  // ── 1. 기본형 (default) ─────────────────────────────────────────────
  if (menuStyle === "default") {
    return (
      <a
        href={href}
        target={isExternal ? "_blank" : undefined}
        rel="noopener noreferrer"
        style={{
          display: "flex", alignItems: "center", gap: 8,
          padding: "8px 14px",
          textDecoration: "none",
          borderBottom: !isLast ? "1px solid #f3f4f6" : "none",
          background: menuBgColor || "transparent",
          transition: "background 0.2s ease, padding-left 0.15s ease",
        }}
        onMouseEnter={e => {
          const el = e.currentTarget as HTMLElement;
          el.style.background = menuBgColor ? menuBgColor + "cc" : "#f5f3ff";
          el.style.paddingLeft = "18px";
        }}
        onMouseLeave={e => {
          const el = e.currentTarget as HTMLElement;
          el.style.background = menuBgColor || "transparent";
          el.style.paddingLeft = "14px";
        }}
      >
        {link.icon ? (
          <span style={{ fontSize: fontSize + 2, flexShrink: 0, lineHeight: 1 }}>{link.icon}</span>
        ) : (
          <span style={{ width: 5, height: 5, borderRadius: "50%", background: "#c4b5fd", flexShrink: 0 }} />
        )}
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize, fontWeight, color: menuTextColor || "#1f2937", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", lineHeight: 1.3 }}>
            {link.label}
          </div>
          {link.description && (
            <div style={{ fontSize: Math.max(fontSize - 2, 9), color: "#9ca3af", marginTop: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
              {link.description}
            </div>
          )}
        </div>
        {link.badge && <BadgeTag badge={link.badge} />}
        <span style={{ fontSize: 10, color: "#c4b5fd", flexShrink: 0 }}>›</span>
      </a>
    );
  }

  // ── 2. 버튼형 (button) ──────────────────────────────────────────────
  if (menuStyle === "button") {
    const baseBg = menuBgColor || "#6366f1";
    return (
      <a
        href={href}
        target={isExternal ? "_blank" : undefined}
        rel="noopener noreferrer"
        style={{
          display: "flex", alignItems: "center", gap: 8,
          margin: "3px 0", padding: "7px 12px",
          background: baseBg, borderRadius,
          textDecoration: "none",
          transition: "transform 0.18s ease, box-shadow 0.18s ease, filter 0.18s ease",
          boxShadow: "0 1px 3px rgba(0,0,0,0.1)",
        }}
        onMouseEnter={e => {
          const el = e.currentTarget as HTMLElement;
          el.style.transform = "translateY(-2px) scale(1.01)";
          el.style.boxShadow = "0 4px 12px rgba(99,102,241,0.3)";
          el.style.filter = "brightness(1.1)";
        }}
        onMouseLeave={e => {
          const el = e.currentTarget as HTMLElement;
          el.style.transform = "";
          el.style.boxShadow = "0 1px 3px rgba(0,0,0,0.1)";
          el.style.filter = "";
        }}
      >
        {link.icon && <span style={{ fontSize: fontSize + 2, flexShrink: 0, lineHeight: 1 }}>{link.icon}</span>}
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize, fontWeight, color: menuTextColor || "#ffffff", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", lineHeight: 1.3 }}>
            {link.label}
          </div>
          {link.description && (
            <div style={{ fontSize: Math.max(fontSize - 2, 9), color: "rgba(255,255,255,0.7)", marginTop: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
              {link.description}
            </div>
          )}
        </div>
        {link.badge && <BadgeTag badge={link.badge} />}
      </a>
    );
  }

  // ── 3. 알약형 (pill) ────────────────────────────────────────────────
  if (menuStyle === "pill") {
    const baseBg = menuBgColor || "#f0f0ff";
    return (
      <a
        href={href}
        target={isExternal ? "_blank" : undefined}
        rel="noopener noreferrer"
        style={{
          display: "flex", alignItems: "center", gap: 8,
          margin: "3px 0", padding: "6px 14px",
          background: baseBg, borderRadius: 20,
          textDecoration: "none",
          transition: "transform 0.18s ease, box-shadow 0.18s ease, filter 0.18s ease",
          boxShadow: "0 1px 3px rgba(0,0,0,0.06)",
        }}
        onMouseEnter={e => {
          const el = e.currentTarget as HTMLElement;
          el.style.transform = "translateY(-1px)";
          el.style.boxShadow = "0 3px 10px rgba(99,102,241,0.2)";
          el.style.filter = "brightness(1.06)";
        }}
        onMouseLeave={e => {
          const el = e.currentTarget as HTMLElement;
          el.style.transform = "";
          el.style.boxShadow = "0 1px 3px rgba(0,0,0,0.06)";
          el.style.filter = "";
        }}
      >
        {link.icon && <span style={{ fontSize: fontSize + 2, flexShrink: 0, lineHeight: 1 }}>{link.icon}</span>}
        <span style={{ fontSize, fontWeight, color: menuTextColor || "#374151", flex: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
          {link.label}
        </span>
        {link.badge && <BadgeTag badge={link.badge} />}
      </a>
    );
  }

  // ── 4. 밑줄형 (underline) ───────────────────────────────────────────
  if (menuStyle === "underline") {
    return (
      <a
        href={href}
        target={isExternal ? "_blank" : undefined}
        rel="noopener noreferrer"
        style={{
          display: "flex", alignItems: "center", gap: 8,
          padding: "8px 14px",
          textDecoration: "none",
          borderBottom: "1px solid #e5e7eb",
          background: "transparent",
          position: "relative",
          transition: "color 0.18s ease",
          overflow: "hidden",
        }}
        onMouseEnter={e => {
          const el = e.currentTarget as HTMLElement;
          el.style.color = "#6366f1";
          const line = el.querySelector(".underline-bar") as HTMLElement;
          if (line) { line.style.width = "100%"; line.style.opacity = "1"; }
        }}
        onMouseLeave={e => {
          const el = e.currentTarget as HTMLElement;
          el.style.color = "";
          const line = el.querySelector(".underline-bar") as HTMLElement;
          if (line) { line.style.width = "0%"; line.style.opacity = "0"; }
        }}
      >
        {link.icon && <span style={{ fontSize: fontSize + 2, flexShrink: 0, lineHeight: 1 }}>{link.icon}</span>}
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize, fontWeight, color: menuTextColor || "#1f2937", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", lineHeight: 1.3 }}>
            {link.label}
          </div>
          {link.description && (
            <div style={{ fontSize: Math.max(fontSize - 2, 9), color: "#9ca3af", marginTop: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
              {link.description}
            </div>
          )}
        </div>
        {link.badge && <BadgeTag badge={link.badge} />}
        {/* 호버 시 나타나는 하단 밑줄 바 */}
        <span
          className="underline-bar"
          style={{
            position: "absolute", bottom: 0, left: 0,
            height: 2, width: "0%", opacity: 0,
            background: "linear-gradient(90deg, #6366f1, #8b5cf6)",
            transition: "width 0.25s ease, opacity 0.2s ease",
            borderRadius: 1,
          }}
        />
      </a>
    );
  }

  // ── 5. 카드형 (card) ────────────────────────────────────────────────
  if (menuStyle === "card") {
    return (
      <a
        href={href}
        target={isExternal ? "_blank" : undefined}
        rel="noopener noreferrer"
        style={{
          display: "flex", alignItems: "center", gap: 8,
          margin: "4px 8px",
          padding: "8px 12px",
          background: menuBgColor || "#f9fafb",
          border: "1px solid #e5e7eb",
          borderRadius: Math.max(borderRadius - 2, 4),
          textDecoration: "none",
          transition: "background 0.18s ease, border-color 0.18s ease, box-shadow 0.18s ease",
          boxShadow: "0 1px 2px rgba(0,0,0,0.04)",
        }}
        onMouseEnter={e => {
          const el = e.currentTarget as HTMLElement;
          el.style.background = menuBgColor ? menuBgColor + "dd" : "#f0f0ff";
          el.style.borderColor = "#a5b4fc";
          el.style.boxShadow = "0 3px 10px rgba(99,102,241,0.15)";
        }}
        onMouseLeave={e => {
          const el = e.currentTarget as HTMLElement;
          el.style.background = menuBgColor || "#f9fafb";
          el.style.borderColor = "#e5e7eb";
          el.style.boxShadow = "0 1px 2px rgba(0,0,0,0.04)";
        }}
      >
        {link.icon ? (
          <span style={{ fontSize: fontSize + 4, flexShrink: 0, lineHeight: 1 }}>{link.icon}</span>
        ) : (
          <span style={{ width: 6, height: 6, borderRadius: 2, background: "#a5b4fc", flexShrink: 0 }} />
        )}
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize, fontWeight, color: menuTextColor || "#1f2937", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", lineHeight: 1.3 }}>
            {link.label}
          </div>
          {link.description && (
            <div style={{ fontSize: Math.max(fontSize - 2, 9), color: "#6b7280", marginTop: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
              {link.description}
            </div>
          )}
        </div>
        {link.badge && <BadgeTag badge={link.badge} />}
      </a>
    );
  }

  // ── 6. 들여쓰기형 (indent) ──────────────────────────────────────────
  if (menuStyle === "indent") {
    return (
      <a
        href={href}
        target={isExternal ? "_blank" : undefined}
        rel="noopener noreferrer"
        style={{
          display: "flex", alignItems: "center", gap: 8,
          padding: "7px 14px 7px 18px",
          textDecoration: "none",
          borderBottom: !isLast ? "1px solid #f3f4f6" : "none",
          background: menuBgColor || "transparent",
          transition: "background 0.18s ease, padding-left 0.15s ease",
          borderLeft: "3px solid transparent",
        }}
        onMouseEnter={e => {
          const el = e.currentTarget as HTMLElement;
          el.style.background = menuBgColor ? menuBgColor + "bb" : "#f5f3ff";
          el.style.paddingLeft = "24px";
          el.style.borderLeftColor = "#6366f1";
        }}
        onMouseLeave={e => {
          const el = e.currentTarget as HTMLElement;
          el.style.background = menuBgColor || "transparent";
          el.style.paddingLeft = "18px";
          el.style.borderLeftColor = "transparent";
        }}
      >
        {link.icon ? (
          <span style={{ fontSize: fontSize + 2, flexShrink: 0, lineHeight: 1 }}>{link.icon}</span>
        ) : (
          <span style={{ fontSize: 10, color: "#a5b4fc", flexShrink: 0 }}>▸</span>
        )}
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize, fontWeight, color: menuTextColor || "#1f2937", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", lineHeight: 1.3 }}>
            {link.label}
          </div>
          {link.description && (
            <div style={{ fontSize: Math.max(fontSize - 2, 9), color: "#9ca3af", marginTop: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
              {link.description}
            </div>
          )}
        </div>
        {link.badge && <BadgeTag badge={link.badge} />}
      </a>
    );
  }

  // ── 7. 네온 글로우 (neon) ───────────────────────────────────────────
  if (menuStyle === "neon") {
    return (
      <a
        href={href}
        target={isExternal ? "_blank" : undefined}
        rel="noopener noreferrer"
        style={{
          display: "flex", alignItems: "center", gap: 8,
          padding: "8px 14px",
          textDecoration: "none",
          borderBottom: !isLast ? "1px solid rgba(99,102,241,0.2)" : "none",
          background: menuBgColor || "transparent",
          transition: "background 0.2s ease, text-shadow 0.2s ease",
        }}
        onMouseEnter={e => {
          const el = e.currentTarget as HTMLElement;
          el.style.background = menuBgColor ? menuBgColor + "33" : "rgba(99,102,241,0.12)";
          const label = el.querySelector(".neon-label") as HTMLElement;
          if (label) label.style.textShadow = "0 0 8px #a5b4fc, 0 0 16px #6366f1";
        }}
        onMouseLeave={e => {
          const el = e.currentTarget as HTMLElement;
          el.style.background = menuBgColor || "transparent";
          const label = el.querySelector(".neon-label") as HTMLElement;
          if (label) label.style.textShadow = "none";
        }}
      >
        {link.icon && <span style={{ fontSize: fontSize + 2, flexShrink: 0, lineHeight: 1 }}>{link.icon}</span>}
        <div style={{ flex: 1, minWidth: 0 }}>
          <div
            className="neon-label"
            style={{
              fontSize, fontWeight,
              color: menuTextColor || "#c4b5fd",
              overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", lineHeight: 1.3,
              transition: "text-shadow 0.2s ease",
            }}
          >
            {link.label}
          </div>
          {link.description && (
            <div style={{ fontSize: Math.max(fontSize - 2, 9), color: "#6b7280", marginTop: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
              {link.description}
            </div>
          )}
        </div>
        {link.badge && <BadgeTag badge={link.badge} />}
        <span style={{ fontSize: 10, color: "#6366f1", flexShrink: 0 }}>›</span>
      </a>
    );
  }

  // ── 8. 유리 반투명 (glass) ──────────────────────────────────────────
  if (menuStyle === "glass") {
    return (
      <a
        href={href}
        target={isExternal ? "_blank" : undefined}
        rel="noopener noreferrer"
        style={{
          display: "flex", alignItems: "center", gap: 8,
          margin: "3px 6px",
          padding: "7px 12px",
          background: menuBgColor || "rgba(255,255,255,0.4)",
          backdropFilter: "blur(6px)",
          WebkitBackdropFilter: "blur(6px)",
          border: "1px solid rgba(255,255,255,0.7)",
          borderRadius: Math.max(borderRadius - 2, 4),
          textDecoration: "none",
          transition: "background 0.2s ease, box-shadow 0.2s ease",
          boxShadow: "0 1px 4px rgba(0,0,0,0.06)",
        }}
        onMouseEnter={e => {
          const el = e.currentTarget as HTMLElement;
          el.style.background = menuBgColor ? menuBgColor + "aa" : "rgba(99,102,241,0.15)";
          el.style.boxShadow = "0 4px 14px rgba(99,102,241,0.2)";
        }}
        onMouseLeave={e => {
          const el = e.currentTarget as HTMLElement;
          el.style.background = menuBgColor || "rgba(255,255,255,0.4)";
          el.style.boxShadow = "0 1px 4px rgba(0,0,0,0.06)";
        }}
      >
        {link.icon && <span style={{ fontSize: fontSize + 2, flexShrink: 0, lineHeight: 1 }}>{link.icon}</span>}
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize, fontWeight, color: menuTextColor || "#1f2937", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", lineHeight: 1.3 }}>
            {link.label}
          </div>
          {link.description && (
            <div style={{ fontSize: Math.max(fontSize - 2, 9), color: "#6b7280", marginTop: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
              {link.description}
            </div>
          )}
        </div>
        {link.badge && <BadgeTag badge={link.badge} />}
      </a>
    );
  }

  // ── 9. 플로팅 카드 (floating) ───────────────────────────────────────
  if (menuStyle === "floating") {
    return (
      <a
        href={href}
        target={isExternal ? "_blank" : undefined}
        rel="noopener noreferrer"
        style={{
          display: "flex", alignItems: "center", gap: 8,
          margin: "4px 6px",
          padding: "8px 12px",
          background: menuBgColor || "#ffffff",
          border: "1px solid #f3f4f6",
          borderRadius: Math.max(borderRadius - 2, 4),
          textDecoration: "none",
          transition: "transform 0.2s ease, box-shadow 0.2s ease",
          boxShadow: "0 2px 6px rgba(0,0,0,0.06)",
        }}
        onMouseEnter={e => {
          const el = e.currentTarget as HTMLElement;
          el.style.transform = "translateY(-3px)";
          el.style.boxShadow = "0 8px 20px rgba(99,102,241,0.18)";
        }}
        onMouseLeave={e => {
          const el = e.currentTarget as HTMLElement;
          el.style.transform = "";
          el.style.boxShadow = "0 2px 6px rgba(0,0,0,0.06)";
        }}
      >
        {link.icon ? (
          <span style={{ fontSize: fontSize + 4, flexShrink: 0, lineHeight: 1 }}>{link.icon}</span>
        ) : (
          <span style={{
            width: 28, height: 28, borderRadius: 8, flexShrink: 0,
            background: "linear-gradient(135deg, #ede9fe, #ddd6fe)",
            display: "flex", alignItems: "center", justifyContent: "center",
            fontSize: 12,
          }}>→</span>
        )}
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize, fontWeight, color: menuTextColor || "#1f2937", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", lineHeight: 1.3 }}>
            {link.label}
          </div>
          {link.description && (
            <div style={{ fontSize: Math.max(fontSize - 2, 9), color: "#6b7280", marginTop: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
              {link.description}
            </div>
          )}
        </div>
        {link.badge && <BadgeTag badge={link.badge} />}
      </a>
    );
  }

  // ── 10. 굵은 보더형 (bold-border) ──────────────────────────────────
  if (menuStyle === "bold-border") {
    return (
      <a
        href={href}
        target={isExternal ? "_blank" : undefined}
        rel="noopener noreferrer"
        style={{
          display: "flex", alignItems: "center", gap: 8,
          padding: "8px 14px 8px 16px",
          textDecoration: "none",
          borderBottom: !isLast ? "1px solid #f3f4f6" : "none",
          borderLeft: "3px solid transparent",
          background: menuBgColor || "transparent",
          transition: "background 0.18s ease, border-left-color 0.18s ease, padding-left 0.15s ease",
        }}
        onMouseEnter={e => {
          const el = e.currentTarget as HTMLElement;
          el.style.background = menuBgColor ? menuBgColor + "bb" : "#f5f3ff";
          el.style.borderLeftColor = "#6366f1";
          el.style.paddingLeft = "20px";
        }}
        onMouseLeave={e => {
          const el = e.currentTarget as HTMLElement;
          el.style.background = menuBgColor || "transparent";
          el.style.borderLeftColor = "transparent";
          el.style.paddingLeft = "16px";
        }}
      >
        {link.icon ? (
          <span style={{ fontSize: fontSize + 2, flexShrink: 0, lineHeight: 1 }}>{link.icon}</span>
        ) : (
          <span style={{ width: 5, height: 5, borderRadius: "50%", background: "#a5b4fc", flexShrink: 0 }} />
        )}
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize, fontWeight, color: menuTextColor || "#1f2937", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", lineHeight: 1.3 }}>
            {link.label}
          </div>
          {link.description && (
            <div style={{ fontSize: Math.max(fontSize - 2, 9), color: "#9ca3af", marginTop: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
              {link.description}
            </div>
          )}
        </div>
        {link.badge && <BadgeTag badge={link.badge} />}
        <span style={{ fontSize: 10, color: "#c4b5fd", flexShrink: 0 }}>›</span>
      </a>
    );
  }

  // fallback: default 스타일
  return null;
}
