/**
 * AdminPage - 관리자 비주얼 설정 모드 (라이트 테마)
 * 탭: 홈 레이아웃 | 사이드바 | 헤더 네비 | 사이트 설정 | 게시물 관리
 * 성능 최적화: 각 탭 컴포넌트를 lazy import로 분리하여 초기 번들 크기 감소
 */
import React, { useState, useEffect, useMemo, useRef, lazy, Suspense } from "react";
import { useLocation } from "wouter";
import { trpc } from "@/lib/trpc";
import { getPostUrl } from "@/lib/postUrl";
import { useSEO } from "@/hooks/useSEO";
import { useAuth } from "@/_core/hooks/useAuth";
import { toast } from "sonner";
import {
  Eye, EyeOff, GripVertical, Plus, Trash2, Edit2, Check, X,
  Settings, Layout, Sidebar, Navigation, FileText, ChevronUp, ChevronDown,
  Monitor, Palette, Globe, BarChart2, Save, RefreshCw, ExternalLink,
  MessageSquare, MessageCircleOff, Bot, Loader2, Zap, Key, BookOpen, Copy, AlertCircle, Send,
  Users, UserCheck, UserX, Shield, ShieldOff, Ban, Search, AlertTriangle, RotateCcw,
  Database, Download, Upload, HardDrive, Maximize2, Minimize2, Pin, PinOff,
  Heart, Coffee, CheckCircle, XCircle, ShoppingCart, TrendingUp, Package,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { adminSave, type TabKey, CATEGORY_LABELS, SECTION_ICONS, btnStyle, inputStyle, labelStyle, selectStyle, cardStyle } from "./adminShared";

// ─── 탭 컴포넌트 lazy import (초기 번들 크기 최소화) ─────────────────────────
const LayoutTab = lazy(() => import("./AdminLayoutTab").then(m => ({ default: m.LayoutTab })));
const SidebarTab = lazy(() => import("./AdminSidebarTab").then(m => ({ default: m.SidebarTab })));
const NavTab = lazy(() => import("./AdminNavTab").then(m => ({ default: m.NavTab })));
const SiteConfigTab = lazy(() => import("./AdminSiteConfigTab").then(m => ({ default: m.SiteConfigTab })));
const PostsTab = lazy(() => import("./AdminPostsTab").then(m => ({ default: m.PostsTab })));
const PolicyTab = lazy(() => import("./AdminPolicyTab").then(m => ({ default: m.PolicyTab })));
const CommentsTab = lazy(() => import("./AdminCommentsTab").then(m => ({ default: m.CommentsTab })));
const AutomationTab = lazy(() => import("./AdminAutomationTab").then(m => ({ default: m.AutomationTab })));
const UsersTab = lazy(() => import("./AdminUsersTab").then(m => ({ default: m.UsersTab })));
const DonationsTab = lazy(() => import("./AdminDonationsTab").then(m => ({ default: m.DonationsTab })));
const BackupTab = lazy(() => import("./AdminBackupTab").then(m => ({ default: m.BackupTab })));
const AnalyticsEmbed = lazy(() => import("./AdminAnalyticsEmbed").then(m => ({ default: m.AnalyticsEmbed })));
const TrashTab = lazy(() => import("./TrashTabContent").then(m => ({ default: m.TrashTab })));
const PagesTab = lazy(() => import("./AdminPagesTab").then(m => ({ default: m.PagesTab })));
const AdminAdsTab = lazy(() => import("./AdminAdsTab").then(m => ({ default: m.AdminAdsTab })));
const AdminAffiliateTab = lazy(() => import("./AdminAffiliateTab").then(m => ({ default: m.AdminAffiliateTab })));
const AdminApiKeysTab = lazy(() => import("./AdminApiKeysTab").then(m => ({ default: m.default })));
const AdminSeoTab = lazy(() => import("./AdminSeoTab").then(m => ({ default: m.default })));
const AdminAppsTabComp = lazy(() => import("./AdminAppsTab").then(m => ({ default: m.AdminAppsTab })));
const AdminPage21EditTabComp = lazy(() => import("./AdminPage21EditTab").then(m => ({ default: m.default })));

// ─── 탭 로딩 스켈레톤 ─────────────────────────────────────────────────────────
function TabLoadingFallback() {
  return (
    <div style={{ display: "flex", alignItems: "center", justifyContent: "center", padding: "60px 20px", color: "#9ca3af" }}>
      <Loader2 size={20} style={{ animation: "spin 1s linear infinite", marginRight: 8 }} />
      <span style={{ fontSize: 14 }}>로딩 중...</span>
    </div>
  );
}

// ─── 메인 컴포넌트 ─────────────────────────────────────────────────────────────
export default function AdminPage() {
  useSEO({ title: "관리자 설정 | 스마트 오토 가이드" });
  const [, navigate] = useLocation();
  const { user, isAuthenticated, loading } = useAuth();
  // 한 번이라도 admin으로 인증된 적 있으면 탭 전환 중 일시적 isAuthenticated=false로 redirect 방지
  const wasAdminRef = useRef(false);
  if (!loading && isAuthenticated && user?.role === "admin") {
    wasAdminRef.current = true;
  }
  const [editPageId, setEditPageId] = useState<number | undefined>(undefined);
  // URL 쿼리 파라미터로 초기 탭 결정 (e.g. /admin?tab=trash)
  const [activeTab, setActiveTab] = useState<TabKey>(() => {
    if (typeof window !== "undefined") {
      const params = new URLSearchParams(window.location.search);
      const tabParam = params.get("tab");
      const validTabs: TabKey[] = ["layout", "sidebar", "nav", "site", "posts", "apps", "trash", "policy", "comments", "automation", "users", "donations", "pages", "page21edit", "backup", "analytics", "ads", "affiliate", "apikeys", "seo"];
      if (tabParam && validTabs.includes(tabParam as TabKey)) {
        return tabParam as TabKey;
      }
    }
    return "layout";
  });

  useEffect(() => {
    // wasAdminRef가 true이면 한 번 인증된 상태이므로 일시적 false에도 redirect하지 않음
    if (!loading && !wasAdminRef.current && (!isAuthenticated || user?.role !== "admin")) {
      navigate("/");
    }
  }, [loading, isAuthenticated, user, navigate]);

  if (loading) {
    return (
      <div style={{ minHeight: "100vh", background: "#f9fafb", display: "flex", alignItems: "center", justifyContent: "center" }}>
        <RefreshCw size={24} color="#6366f1" className="animate-spin" />
      </div>
    );
  }

  if (!isAuthenticated || user?.role !== "admin") return null;

  // 카테고리별 탭 그룹 정의
  const tabGroups: {
    label: string;
    color: string;
    bg: string;
    border: string;
    tabs: { key: TabKey; label: string; icon: React.ReactNode }[];
  }[] = [
    {
      label: "디자인",
      color: "#4f46e5",
      bg: "#eef2ff",
      border: "#c7d2fe",
      tabs: [
        { key: "layout",  label: "홈 레이아웃",  icon: <Layout size={14} /> },
        { key: "sidebar", label: "사이드바",      icon: <Sidebar size={14} /> },
        { key: "nav",     label: "헤더 네비",     icon: <Navigation size={14} /> },
        { key: "site",    label: "사이트 설정",   icon: <Settings size={14} /> },
      ],
    },
    {
      label: "콘텐츠",
      color: "#0369a1",
      bg: "#e0f2fe",
      border: "#bae6fd",
      tabs: [
        { key: "posts",   label: "게시물 관리",   icon: <FileText size={14} /> },
        { key: "apps",    label: "앱 관리",       icon: <Package size={14} /> },
        { key: "pages",     label: "페이지 만들기",  icon: <FileText size={14} /> },
        { key: "page21edit", label: "APP쇼룸 편집", icon: <Package size={14} /> },
        { key: "trash",     label: "보관함",       icon: <Trash2 size={14} /> },
        { key: "policy",  label: "정책 편집",    icon: <Globe size={14} /> },
        { key: "comments", label: "댓글 관리",    icon: <MessageSquare size={14} /> },
      ],
    },
    {
      label: "수익",
      color: "#b45309",
      bg: "#fef3c7",
      border: "#fde68a",
      tabs: [
        { key: "ads",       label: "광고 설정",      icon: <Monitor size={14} /> },
        { key: "affiliate", label: "제휴 마케팅",   icon: <ShoppingCart size={14} /> },
        { key: "donations", label: "후원금 관리",   icon: <Heart size={14} /> },
      ],
    },
    {
      label: "운영",
      color: "#065f46",
      bg: "#d1fae5",
      border: "#6ee7b7",
      tabs: [
        { key: "users",      label: "회원 관리",     icon: <Users size={14} /> },
        { key: "automation", label: "자동화 설정",  icon: <Zap size={14} /> },
        { key: "analytics",  label: "방문자 분석",   icon: <BarChart2 size={14} /> },
        { key: "backup",     label: "백업/복원",      icon: <HardDrive size={14} /> },
        { key: "apikeys",    label: "API 키 관리",   icon: <Key size={14} /> },
        { key: "seo",        label: "SEO 현황",         icon: <Globe size={14} /> },
      ],
    },
  ];

  return (
    <div style={{ minHeight: "100vh", background: "#f3f4f6", color: "#111827", fontFamily: "'Noto Sans KR', sans-serif" }}>
      {/* 헤더 */}
      <div style={{ background: "#ffffff", borderBottom: "1px solid #e5e7eb", padding: "0 24px", position: "sticky", top: 0, zIndex: 100 }}>
        <div style={{ maxWidth: 1400, margin: "0 auto", display: "flex", alignItems: "center", justifyContent: "space-between", height: 56 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <div style={{ width: 28, height: 28, background: "linear-gradient(135deg, #6366f1, #8b5cf6)", borderRadius: 6, display: "flex", alignItems: "center", justifyContent: "center" }}>
              <Settings size={14} color="#fff" />
            </div>
            <span style={{ fontSize: 15, fontWeight: 700, color: "#111827" }}>관리자 설정</span>
            <Badge variant="outline" style={{ fontSize: 10, color: "#6366f1", borderColor: "#6366f1", padding: "1px 6px" }}>ADMIN</Badge>
          </div>
          <Button variant="ghost" size="sm" onClick={() => navigate("/")} style={{ fontSize: 12, color: "#6b7280" }}>
            <ExternalLink size={13} style={{ marginRight: 4 }} />사이트 보기
          </Button>
        </div>
      </div>

      {/* 탭 바 - sticky 고정 (헤더 56px 아래) */}
      <div style={{ position: "sticky", top: 56, zIndex: 99, background: "#f3f4f6", padding: "12px 24px 8px", borderBottom: "1px solid #e5e7eb" }}>
        <div style={{ maxWidth: 1400, margin: "0 auto" }}>
        {/* 카테고리별 탭 그룹 */}
        {((): React.ReactNode => {
          const renderBtn = (tab: { key: TabKey; label: string; icon: React.ReactNode }) => (
            <button
              key={tab.key}
              onClick={(e) => { setActiveTab(tab.key); window.scrollTo({ top: 0, behavior: "instant" }); (e.currentTarget as HTMLButtonElement).blur(); }}
              style={{
                display: "flex", alignItems: "center", gap: 5,
                padding: "6px 12px", borderRadius: 7, border: "none", cursor: "pointer", whiteSpace: "nowrap",
                fontSize: 12, fontWeight: activeTab === tab.key ? 700 : 500,
                background: activeTab === tab.key ? "linear-gradient(135deg, #6366f1, #8b5cf6)" : "#ffffff",
                color: activeTab === tab.key ? "#fff" : "#374151",
                boxShadow: activeTab === tab.key ? "0 2px 8px rgba(99,102,241,0.35)" : "0 1px 2px rgba(0,0,0,0.05)",
                transition: "all 0.15s",
                outline: "none",
              }}
            >
              {tab.icon}
              <span>{tab.label}</span>
            </button>
          );
          // 전체 너비를 2줄로 균등 분할: 상단 디자인+콘텐츠, 하단 수익+운영
          const row1Groups = tabGroups.slice(0, 2);
          const row2Groups = tabGroups.slice(2);
          const renderGroup = (group: typeof tabGroups[0]) => (
            <div
              key={group.label}
              style={{
                flex: "1 1 0", minWidth: 0,
                background: group.bg,
                border: `1.5px solid ${group.border}`,
                borderRadius: 10,
                padding: "7px 10px",
                display: "flex",
                alignItems: "center",
                gap: 6,
              }}
            >
              {/* 그룹 레이블 */}
              <span style={{
                fontSize: 11, fontWeight: 800, color: group.color,
                padding: "3px 9px", borderRadius: 6,
                background: "rgba(255,255,255,0.85)",
                border: `1.5px solid ${group.border}`,
                whiteSpace: "nowrap",
                letterSpacing: "0.04em",
                flexShrink: 0,
              }}>{group.label}</span>
              {/* 구분선 */}
              <div style={{ width: 1, height: 20, background: group.border, flexShrink: 0 }} />
              {/* 탭 버튼들 — 너비 균등 분할 */}
              <div style={{ display: "flex", gap: 4, flex: 1, minWidth: 0 }}>
                {group.tabs.map(tab => (
                  <button
                    key={tab.key}
                    onClick={(e) => { setActiveTab(tab.key); window.scrollTo({ top: 0, behavior: "instant" }); (e.currentTarget as HTMLButtonElement).blur(); }}
                    style={{
                      flex: "1 1 0", minWidth: 0,
                      display: "flex", alignItems: "center", justifyContent: "center", gap: 5,
                      padding: "8px 6px", borderRadius: 7, border: "none", cursor: "pointer",
                      fontSize: 12.5, fontWeight: activeTab === tab.key ? 700 : 500,
                      background: activeTab === tab.key ? "linear-gradient(135deg, #6366f1, #8b5cf6)" : "#ffffff",
                      color: activeTab === tab.key ? "#fff" : "#374151",
                      boxShadow: activeTab === tab.key ? "0 2px 8px rgba(99,102,241,0.35)" : "0 1px 2px rgba(0,0,0,0.05)",
                      transition: "all 0.15s",
                      outline: "none",
                      whiteSpace: "nowrap",
                      overflow: "hidden",
                    }}
                  >
                    {tab.icon}
                    <span style={{ overflow: "hidden", textOverflow: "ellipsis" }}>{tab.label}</span>
                  </button>
                ))}
              </div>
            </div>
          );
          return (
            <div style={{ marginBottom: 20, display: "flex", flexDirection: "column", gap: 6 }}>
              <div style={{ display: "flex", gap: 6 }}>{row1Groups.map(renderGroup)}</div>
              <div style={{ display: "flex", gap: 6 }}>{row2Groups.map(renderGroup)}</div>
            </div>
          );
        })()}
        </div>
      </div>

      {/* 탭 콘텐츠 영역 */}
      {activeTab === "analytics" ? (
        /* 방문자 분석은 자체 패딩/레이아웃을 사용하므로 별도 처리 */
        <div style={{ maxWidth: 1400, margin: "0 auto", padding: "16px 24px 24px" }}>
          <Suspense fallback={<TabLoadingFallback />}>
            <AnalyticsEmbed />
          </Suspense>
        </div>
      ) : (
        <div style={{ maxWidth: 1400, margin: "0 auto", padding: "24px" }}>
          {/* 탭 콘텐츠 - lazy import로 분리된 컴포넌트 */}
          <Suspense fallback={<TabLoadingFallback />}>
            {activeTab === "layout"  && <LayoutTab />}
            {activeTab === "sidebar" && <SidebarTab />}
            {activeTab === "nav"     && <NavTab />}
            {activeTab === "site"    && <SiteConfigTab />}
            {activeTab === "posts"   && <PostsTab onEditPage={(pageId) => { setEditPageId(pageId); setActiveTab("pages"); }} />}
            {activeTab === "trash"   && <TrashTab />}
            {activeTab === "policy"  && <PolicyTab />}
            {activeTab === "comments" && <CommentsTab />}
            {activeTab === "automation" && <AutomationTab />}
            {activeTab === "users" && <UsersTab />}
            {activeTab === "donations" && <DonationsTab />}
            {activeTab === "pages" && <PagesTab initialEditPageId={editPageId} />}
            {activeTab === "backup" && <BackupTab />}
            {activeTab === "ads" && <AdminAdsTab />}
            {activeTab === "affiliate" && <AdminAffiliateTab />}
            {activeTab === "apikeys" && <AdminApiKeysTab />}
            {activeTab === "seo" && <AdminSeoTab />}
            {activeTab === "apps" && <AdminAppsTabComp />}
            {activeTab === "page21edit" && <AdminPage21EditTabComp />}
          </Suspense>
        </div>
      )}
      {/* ─── 우측 고정 플로팅 저장 버튼 ─── */}
      <FloatingSaveButton activeTab={activeTab} />
    </div>
  );
}

// ─── 플로팅 저장 버튼 ─────────────────────────────────────────────────────────
function FloatingSaveButton({ activeTab }: { activeTab: TabKey }) {
  const [saving, setSaving] = React.useState(false);
  const [saved, setSaved] = React.useState(false);

  // 저장 이벤트 수신
  React.useEffect(() => {
    const onSaved = () => {
      setSaving(false);
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
    };
    const onSaving = () => { setSaving(true); setSaved(false); };
    window.addEventListener("admin-save-start", onSaving);
    window.addEventListener("admin-save-done", onSaved);
    return () => {
      window.removeEventListener("admin-save-start", onSaving);
      window.removeEventListener("admin-save-done", onSaved);
    };
  }, []);

  const handleClick = () => {
    window.dispatchEvent(new CustomEvent("admin-save-request", { detail: { tab: activeTab } }));
  };

  // 저장 버튼이 없는 탭은 숨김
  const noSaveTabs: TabKey[] = ["posts", "trash", "comments", "automation", "users", "donations", "pages", "page21edit", "backup", "analytics", "ads", "affiliate", "apikeys", "seo"];
  if (noSaveTabs.includes(activeTab)) return null;

  return (
    <div
      style={{
        position: "fixed",
        right: 24,
        bottom: 100,
        zIndex: 9999,
        display: "flex",
        flexDirection: "column",
        alignItems: "flex-end",
        gap: 8,
        pointerEvents: "none",
      }}
    >
      {/* 저장 완료 뱃지 */}
      <div
        style={{
          opacity: saved ? 1 : 0,
          transform: saved ? "translateY(0)" : "translateY(8px)",
          transition: "opacity 0.3s ease, transform 0.3s ease",
          background: "linear-gradient(135deg, #1e1b4b 0%, #312e81 100%)",
          color: "#e0e7ff",
          fontSize: 12,
          fontWeight: 700,
          padding: "6px 14px",
          borderRadius: 20,
          boxShadow: "0 4px 16px rgba(99,102,241,0.4)",
          border: "1px solid rgba(165,180,252,0.3)",
          whiteSpace: "nowrap",
          pointerEvents: "none",
        }}
      >
        ✅ 저장 완료
      </div>
      {/* 메인 플로팅 버튼 */}
      <button
        onClick={handleClick}
        disabled={saving}
        style={{
          pointerEvents: "all",
          display: "flex",
          alignItems: "center",
          gap: 8,
          padding: "12px 22px",
          background: saving
            ? "linear-gradient(135deg, #6b7280, #9ca3af)"
            : "linear-gradient(135deg, #4f46e5 0%, #7c3aed 50%, #6366f1 100%)",
          color: "#ffffff",
          border: "none",
          borderRadius: 14,
          fontSize: 14,
          fontWeight: 700,
          cursor: saving ? "not-allowed" : "pointer",
          boxShadow: saving
            ? "0 4px 12px rgba(0,0,0,0.15)"
            : "0 8px 24px rgba(99,102,241,0.45), 0 2px 8px rgba(0,0,0,0.15), inset 0 1px 0 rgba(255,255,255,0.15)",
          transition: "all 0.25s cubic-bezier(0.4, 0, 0.2, 1)",
          transform: saving ? "scale(0.97)" : "scale(1)",
          letterSpacing: "0.3px",
          backdropFilter: "blur(8px)",
          outline: "none",
          position: "relative",
          overflow: "hidden",
        }}
        onMouseEnter={e => {
          if (!saving) {
            (e.currentTarget as HTMLButtonElement).style.transform = "scale(1.04) translateY(-2px)";
            (e.currentTarget as HTMLButtonElement).style.boxShadow = "0 12px 32px rgba(99,102,241,0.55), 0 4px 12px rgba(0,0,0,0.2), inset 0 1px 0 rgba(255,255,255,0.2)";
          }
        }}
        onMouseLeave={e => {
          if (!saving) {
            (e.currentTarget as HTMLButtonElement).style.transform = "scale(1)";
            (e.currentTarget as HTMLButtonElement).style.boxShadow = "0 8px 24px rgba(99,102,241,0.45), 0 2px 8px rgba(0,0,0,0.15), inset 0 1px 0 rgba(255,255,255,0.15)";
          }
        }}
      >
        {saving ? (
          <>
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" style={{ animation: "spin 1s linear infinite" }}>
              <path d="M21 12a9 9 0 1 1-6.219-8.56" />
            </svg>
            저장 중...
          </>
        ) : (
          <>
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2z" />
              <polyline points="17 21 17 13 7 13 7 21" />
              <polyline points="7 3 7 8 15 8" />
            </svg>
            저장하기
          </>
        )}
      </button>
      <style>{`@keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }`}</style>
    </div>
  );
}

// ─── 홈 레이아웃 탭 ────────────────────────────────────────────────────────────
