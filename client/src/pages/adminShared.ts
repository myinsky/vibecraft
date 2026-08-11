/**
 * adminShared.ts - 관리자 탭 컴포넌트 공통 헬퍼/타입/스타일
 * AdminPage.tsx에서 분리된 공통 모듈
 */
import React from "react";
import { toast } from "sonner";
import type { MenuLinkItem } from "@/lib/menuUtils";

// ─── 관리자 저장 토스트 헬퍼 ────────────────────────────────────────────────────
export const adminSave = {
  success: (message: string) => {
    window.dispatchEvent(new CustomEvent("admin-save-done"));
    return toast.success(message, {
      position: "top-center",
      duration: 2800,
      style: {
        background: "linear-gradient(135deg, #1e1b4b 0%, #312e81 100%)",
        color: "#e0e7ff",
        border: "1px solid rgba(165,180,252,0.3)",
        borderRadius: "12px",
        boxShadow: "0 8px 32px rgba(99,102,241,0.35), 0 0 0 1px rgba(165,180,252,0.1)",
        fontSize: "14px",
        fontWeight: "600",
        padding: "14px 20px",
        backdropFilter: "blur(12px)",
      },
      icon: "✅",
    });
  },
  error: (message: string) =>
    toast.error(message, {
      position: "top-center",
      duration: 3500,
      style: {
        background: "linear-gradient(135deg, #450a0a 0%, #7f1d1d 100%)",
        color: "#fecaca",
        border: "1px solid rgba(252,165,165,0.3)",
        borderRadius: "12px",
        boxShadow: "0 8px 32px rgba(239,68,68,0.35)",
        fontSize: "14px",
        fontWeight: "600",
        padding: "14px 20px",
      },
      icon: "❌",
    }),
};

// ─── 타입 ─────────────────────────────────────────────────────────────────────
export type TabKey =
  | "layout"
  | "sidebar"
  | "nav"
  | "site"
  | "posts"
  | "trash"
  | "policy"
  | "comments"
  | "automation"
  | "users"
  | "donations"
  | "pages"
  | "backup"
  | "analytics"
  | "ads"
  | "affiliate"
  | "apikeys"
  | "seo"
  | "apps"
  | "page21edit";

// MenuLinkItem, parseMenuLinks, serializeMenuLinks는 menuUtils.ts로 이동
// 하위 호환성을 위해 re-export
export type { MenuLinkItem } from "@/lib/menuUtils";
export { parseMenuLinks, serializeMenuLinks } from "@/lib/menuUtils";

export interface SidebarItemForm {
  id?: number;
  side: "left" | "right";
  itemType: "ad" | "link" | "slot" | "html-ad";
  title: string;
  description: string;
  url: string;
  bgColor: string;
  textColor: string;
  btnText: string;
  btnColor: string;
  badge: string;
  price: string;
  htmlCode: string;
  sortOrder: number;
  visible: boolean;
  // link 타입 전용: 여러 메뉴 링크 (JSON 직렬화하여 htmlCode에 저장)
  menuLinks?: MenuLinkItem[];
  // 메뉴 스타일 옵션 (link 타입 전용)
  menuStyle: "default" | "button" | "pill" | "underline" | "card" | "indent" | "neon" | "glass" | "floating" | "bold-border";
  menuFontWeight: "normal" | "bold" | "extrabold";
  menuBgColor: string;
  menuBorderRadius: number;
  menuFontSize: number;
  menuHeaderHidden: boolean;
}

export const EMPTY_SIDEBAR_ITEM: SidebarItemForm = {
  side: "left",
  itemType: "ad",
  title: "",
  description: "",
  url: "",
  bgColor: "#ede9fe",
  textColor: "#ffffff",
  btnText: "",
  btnColor: "#6366f1",
  badge: "",
  price: "",
  htmlCode: "",
  sortOrder: 99,
  visible: true,
  menuLinks: [],
  // 메뉴 스타일 기본값
  menuStyle: "default" as const,
  menuFontWeight: "normal",
  menuBgColor: "",
  menuBorderRadius: 8,
  menuFontSize: 12,
  menuHeaderHidden: false,
};

// parseMenuLinks, serializeMenuLinks는 위에서 re-export됨

// 메인 화면 카테고리 경로와 레이블 매핑 (Header.tsx navItems와 동일)
export const CATEGORY_LABELS: Record<string, string> = {
  "ai-apps": "AI로 만드는 자동화 프로그램",
  "my-apps": "진행중인 자동화 프로그램",
  "ai-tools": "AI 툴 추천",
  resources: "자료실",
};

export const SECTION_ICONS: Record<string, string> = {
  "ai-apps": "🤖",
  "my-apps": "⚡",
  "ai-tools": "🛠️",
  resources: "📦",
  __latest__: "🕐",
  latest: "🕐",
};

// ─── 공통 스타일 (라이트 테마) ─────────────────────────────────────────────────
export const btnStyle: React.CSSProperties = {
  height: 24,
  borderRadius: 4,
  border: "1px solid #e5e7eb",
  background: "#f9fafb",
  color: "#6b7280",
  cursor: "pointer",
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  gap: 3,
  padding: "0 5px",
  fontSize: 10,
  fontWeight: 600,
  whiteSpace: "nowrap" as const,
  transition: "all 0.1s",
  flexShrink: 0,
};

export const inputStyle: React.CSSProperties = {
  background: "#ffffff",
  border: "1px solid #d1d5db",
  color: "#111827",
  fontSize: 13,
  borderRadius: 6,
};

export const labelStyle: React.CSSProperties = {
  display: "block",
  fontSize: 11,
  fontWeight: 600,
  color: "#6b7280",
  marginBottom: 4,
  textTransform: "uppercase" as const,
  letterSpacing: "0.5px",
};

export const selectStyle: React.CSSProperties = {
  width: "100%",
  background: "#ffffff",
  border: "1px solid #d1d5db",
  color: "#111827",
  fontSize: 13,
  borderRadius: 6,
  padding: "8px 10px",
};

export const cardStyle: React.CSSProperties = {
  background: "#ffffff",
  border: "1px solid #e5e7eb",
  borderRadius: 10,
  padding: "16px 20px",
  marginBottom: 16,
};
