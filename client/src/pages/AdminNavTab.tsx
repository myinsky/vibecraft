import React, { useState, useEffect, useMemo, useRef, useCallback } from "react";
import { trpc } from "@/lib/trpc";
import { toast } from "sonner";
import { adminSave, btnStyle, inputStyle, labelStyle, selectStyle, cardStyle, CATEGORY_LABELS, SECTION_ICONS, EMPTY_SIDEBAR_ITEM, type SidebarItemForm } from "./adminShared";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import {
  Eye, EyeOff, GripVertical, Plus, Trash2, Edit2, Check, X,
  Settings, Layout, Sidebar, Navigation, FileText, ChevronUp, ChevronDown,
  Monitor, Palette, Globe, BarChart2, Save, RefreshCw, ExternalLink,
  MessageSquare, MessageCircleOff, Bot, Loader2, Zap, Key, BookOpen, Copy, AlertCircle, Send,
  Users, UserCheck, UserX, Shield, ShieldOff, Ban, Search, AlertTriangle, RotateCcw,
  Database, Download, Upload, HardDrive, Maximize2, Minimize2, Pin, PinOff,
  Heart, Coffee, CheckCircle, XCircle, ShoppingCart, TrendingUp,
} from "lucide-react";

export function NavTab() {
  const { data: navItems, refetch } = trpc.admin.getNavItems.useQuery(undefined, { staleTime: 0 });
  const { data: publishedPages } = trpc.pages.list.useQuery();
  const utils = trpc.useUtils();
  const updateNav = trpc.admin.updateNavItems.useMutation({ onSuccess: () => { adminSave.success("네비게이션이 저장되었습니다."); utils.admin.getNavItems.invalidate(); refetch(); utils.admin.getHomeInitialData.invalidate(); }, onError: (e) => { window.dispatchEvent(new CustomEvent("admin-save-done")); toast.error("저장 실패: " + e.message, { duration: 5000 }); console.error('[updateNav error]', e); } });
  const createNav = trpc.admin.createNavItem.useMutation({ onSuccess: () => { toast.success("항목이 추가되었습니다."); utils.admin.getNavItems.invalidate(); refetch(); utils.admin.getHomeInitialData.invalidate(); setShowAddForm(false); setNewItem({ label: "", path: "", sortOrder: 99, visible: true, showOnHome: true, sectionStyle: "grid", description: "" }); }, onError: (e) => { toast.error("추가 실패: " + e.message, { duration: 5000 }); console.error('[createNav error]', e); } });
  const deleteNav = trpc.admin.deleteNavItem.useMutation({ onSuccess: () => { toast.success("항목이 삭제되었습니다."); utils.admin.getNavItems.invalidate(); refetch(); utils.admin.getHomeInitialData.invalidate(); } });
  const [localItems, setLocalItems] = useState<typeof navItems>([]);
  const localItemsRef = useRef<typeof navItems>([]);
  const [showAddForm, setShowAddForm] = useState(false);
  const addFormRef = useRef<HTMLDivElement>(null);
  const [newItem, setNewItem] = useState({ label: "", path: "", sortOrder: 99, visible: true, showOnHome: true, sectionStyle: "grid" as "featured" | "grid" | "apps" | "latest" | "overlay" | "list" | "list2" | "download-grid" | "download-row" | "download-card" | "developers", description: "" });
  // 경로 입력 방식: 'category'(직접 입력), 'page'(페이지 선택), 'external'(외부 URL)
  const [pathType, setPathType] = useState<'category' | 'page' | 'external'>('category');
  // 네비 항목 카드 접기/펼치기 상태
  const [collapsedNavItems, setCollapsedNavItems] = useState<Record<number, boolean>>({});
  const toggleNavItem = (id: number) => setCollapsedNavItems(prev => ({ ...prev, [id]: !prev[id] }));
  const isNavItemCollapsed = (id: number) => !!collapsedNavItems[id];
  // 스탯 배너 칸 접기/펼치기 상태
  const [collapsedBannerCards, setCollapsedBannerCards] = useState<Record<string, boolean>>({});
  const toggleBannerCard = (sectionId: number, cardIdx: number) => {
    const key = `${sectionId}-${cardIdx}`;
    setCollapsedBannerCards(prev => ({ ...prev, [key]: !prev[key] }));
  };
  const isBannerCardCollapsed = (sectionId: number, cardIdx: number) => {
    const key = `${sectionId}-${cardIdx}`;
    return !!collapsedBannerCards[key];
  };

  useEffect(() => { if (navItems) { setLocalItems([...navItems]); localItemsRef.current = [...navItems]; } }, [navItems]);
  // 플로팅 버튼 이벤트 리스너 - useRef로 stale 클로저 방지
  useEffect(() => {
    const handler = () => saveAllRef.current();
    window.addEventListener("admin-save-request", handler);
    return () => window.removeEventListener("admin-save-request", handler);
  }, []);

  const moveItem = (idx: number, dir: -1 | 1) => {
    const arr = [...(localItemsRef.current || [])];
    const swapIdx = idx + dir;
    if (swapIdx < 0 || swapIdx >= arr.length) return;
    [arr[idx], arr[swapIdx]] = [arr[swapIdx], arr[idx]];
    localItemsRef.current = arr;
    setLocalItems(arr);
  };

  const saveAllRef = useRef<() => void>(() => {});
  // saveAll 정의 후 ref 업데이트 (항상 최신 함수 참조)
  const saveAll = () => {
    console.log('[NavTab] saveAll called, localItemsRef.current:', localItemsRef.current?.length, 'navItems:', navItems?.length);
    // localItemsRef가 비어있으면 navItems에서 직접 가져옴
    let items = localItemsRef.current;
    if (!items || items.length === 0) {
      if (!navItems || navItems.length === 0) {
        toast.error('저장할 항목이 없습니다. 페이지를 새로고침 후 다시 시도해주세요.');
        return;
      }
      items = [...navItems];
      localItemsRef.current = items;
    }
    window.dispatchEvent(new CustomEvent("admin-save-start"));
    updateNav.mutate(items.map((item, i) => {
      // 절대 URL도 그대로 허용 (외부 링크, 특정 페이지 연결 지원)
      let path = item.path || "/";
      return {
        id: item.id,
        label: item.label,
        path,
        sortOrder: i + 1,
        visible: item.visible ?? true,
        sectionStyle: (item as any).sectionStyle ?? "grid",
        description: (item as any).description ?? "",
        bgColor: (item as any).bgColor ?? null,
        textColor: (item as any).textColor ?? null,
        displayRows: (item as any).displayRows ?? 1,
        sectionMarginBottom: (item as any).sectionMarginBottom ?? 36,
        showOnHome: (item as any).showOnHome !== undefined ? (item as any).showOnHome : true,
        thumbSize: (item as any).thumbSize ?? "md",
        statBannerData: (item as any).statBannerData ?? null,
        sectionSortMode: (item as any).sectionSortMode ?? "latest",
      };
    }));
  };
  // ref를 항상 최신 saveAll로 갱신
  saveAllRef.current = saveAll;

  // localItems 변경 시 ref도 동기화
  const updateLocal = (id: number, field: string, value: any) => {
    setLocalItems(prev => {
      const next = prev?.map(item => item.id === id ? { ...item, [field]: value } : item);
      localItemsRef.current = next;
      return next;
    });
  };

  return (
    <div>
      {/* 상단 헤더: 제목 + 카테고리 추가 버튼 */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 14 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          <div style={{ fontSize: 15, fontWeight: 700, color: "#1f2937" }}>헤더 네비게이션 관리</div>
          <Button
            type="button"
            onClick={() => saveAll()}
            disabled={updateNav.isPending}
            style={{ background: "#6366f1", fontSize: 12, height: 30, padding: "0 12px" }}
          >
            <Save size={12} style={{ marginRight: 4 }} />
            {updateNav.isPending ? "저장 중..." : "변경사항 저장"}
          </Button>
        </div>
        <Button
          onClick={() => {
            const next = !showAddForm;
            setShowAddForm(next);
            if (next) {
              setTimeout(() => {
                addFormRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
              }, 50);
            }
          }}
          style={{
            background: showAddForm ? "#e0e7ff" : "linear-gradient(135deg, #6366f1, #8b5cf6)",
            color: showAddForm ? "#6366f1" : "#fff",
            fontWeight: 700,
            fontSize: 13,
            border: "none",
            boxShadow: showAddForm ? "none" : "0 2px 8px rgba(99,102,241,0.35)",
            padding: "8px 18px",
          }}
        >
          <Plus size={15} style={{ marginRight: 6 }} />{showAddForm ? "추가 취소" : "카테고리 추가"}
        </Button>
      </div>

      {/* 안내 */}
      <div style={{ ...cardStyle, borderLeft: "4px solid #6366f1", marginBottom: 16 }}>
        <div style={{ fontSize: 12, color: "#6b7280", lineHeight: 1.7 }}>
          <div style={{ marginBottom: 4 }}>
            현재 메인 화면 섹션: <strong>{(localItems || []).filter(i => (i as any).showOnHome !== false).map(i => i.label).join(' → ')}</strong>
          </div>
          <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap' }}>
            <span><span style={{ color: '#6366f1', fontWeight: 700 }}>헤더(눈 아이콘)</span> — 사이트 상단 네비게이션 메뉴 표시 여부</span>
            <span><span style={{ color: '#10b981', fontWeight: 700 }}>홈✓/홈✗</span> — 메인 화면 섹션 표시 여부 (독립적으로 작동)</span>
          </div>
        </div>
      </div>

      {/* 헤더 미리보기 */}
      <div style={{ ...cardStyle }}>
        <div style={{ fontSize: 12, color: "#6366f1", fontWeight: 700, marginBottom: 10 }}>📐 헤더 미리보기</div>
        <div style={{ background: "#f9fafb", borderRadius: 8, padding: "10px 16px", display: "flex", alignItems: "center", gap: 16, border: "1px solid #e5e7eb" }}>
          <div style={{ fontSize: 13, fontWeight: 800, color: "#6366f1", marginRight: 8 }}>S</div>
          <div style={{ display: "flex", gap: 4, flex: 1, flexWrap: "wrap" }}>
            {(localItems || []).filter(i => i.visible).map(item => (
              <div key={item.id} style={{
                fontSize: 12,
                color: (item as any).textColor || "#374151",
                padding: "4px 10px",
                borderRadius: 6,
                background: (item as any).bgColor || "#ffffff",
                border: (item as any).bgColor ? "none" : "1px solid #e5e7eb",
              }}>
                {item.label}
              </div>
            ))}
          </div>
          <div style={{ fontSize: 12, color: "#6366f1", background: "rgba(99,102,241,0.1)", padding: "4px 12px", borderRadius: 6 }}>글쓰기</div>
        </div>
      </div>

      {/* 네비 항목 목록 */}
      <div style={{ display: "flex", flexDirection: "column", gap: 8, marginBottom: 16 }}>
        {(localItems || []).map((item, idx) => (
          <div key={item.id} style={{
            background: "#ffffff",
            border: `2px solid ${
              (item as any).sectionStyle === "featured" ? "#7c3aed" :
              (item as any).sectionStyle === "stat-banner" ? "#f59e0b" :
              (item as any).sectionStyle === "latest" ? "#d97706" :
              (item as any).sectionStyle === "list" || (item as any).sectionStyle === "list2" ? "#0284c7" :
              (item as any).sectionStyle === "apps" ? "#16a34a" :
              (item as any).sectionStyle === "overlay" ? "#db2777" :
              (item as any).sectionStyle?.startsWith("download") ? "#ea580c" :
              "#6366f1"
            }`,
            borderRadius: 10,
            overflow: "hidden",
            display: "flex", alignItems: "stretch", gap: 0,
            opacity: (!item.visible && !Boolean((item as any).showOnHome)) ? 0.4 : 1,
            boxShadow: `0 2px 8px ${
              (item as any).sectionStyle === "featured" ? "#7c3aed22" :
              (item as any).sectionStyle === "stat-banner" ? "#f59e0b22" :
              "#6366f122"
            }`,
            marginBottom: 2,
          }}>
            {/* 좌측 색상 바 + 번호 배지 */}
            <div style={{
              width: 36, flexShrink: 0,
              background: `${
                (item as any).sectionStyle === "featured" ? "#7c3aed" :
                (item as any).sectionStyle === "stat-banner" ? "#f59e0b" :
                (item as any).sectionStyle === "latest" ? "#d97706" :
                (item as any).sectionStyle === "list" || (item as any).sectionStyle === "list2" ? "#0284c7" :
                (item as any).sectionStyle === "apps" ? "#16a34a" :
                (item as any).sectionStyle === "overlay" ? "#db2777" :
                (item as any).sectionStyle?.startsWith("download") ? "#ea580c" :
                "#6366f1"
              }`,
              display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "flex-start",
              paddingTop: 14, gap: 6,
            }}>
              <span style={{ fontSize: 11, fontWeight: 900, color: "#fff", lineHeight: 1 }}>{idx + 1}</span>
              <GripVertical size={12} color="rgba(255,255,255,0.6)" />
              {/* 접기/펼치기 버튼 */}
              <button
                onClick={() => toggleNavItem(item.id)}
                style={{ background: "none", border: "none", cursor: "pointer", padding: "3px 0", color: "rgba(255,255,255,0.95)", marginTop: 4, display: "flex", flexDirection: "column", alignItems: "center", gap: 1 }}
                title={isNavItemCollapsed(item.id) ? "펼치기" : "접기"}
              >
                {isNavItemCollapsed(item.id) ? (
                  <><ChevronDown size={13} /><span style={{ fontSize: 9, fontWeight: 800, letterSpacing: "-0.3px", lineHeight: 1 }}>펼치기</span></>
                ) : (
                  <><ChevronUp size={13} /><span style={{ fontSize: 9, fontWeight: 800, letterSpacing: "-0.3px", lineHeight: 1 }}>접기</span></>
                )}
              </button>
            </div>
            {/* 카드 내용 */}
            <div style={{ flex: 1, display: "flex", flexDirection: "column" }}>
              {/* 항상 보이는 요약 헤더 */}
              <div
                onClick={() => toggleNavItem(item.id)}
                style={{ display: "flex", alignItems: "center", gap: 8, padding: "10px 12px", cursor: "pointer", userSelect: "none", background: isNavItemCollapsed(item.id) ? "#f9fafb" : "transparent", borderBottom: isNavItemCollapsed(item.id) ? "none" : "1px solid #f3f4f6" }}
              >
                <span style={{ fontWeight: 700, fontSize: 13, color: "#111827", flex: 1 }}>{item.label || "(이름 없음)"}</span>
                <span style={{ fontSize: 11, color: "#6b7280" }}>{item.path}</span>
                <span style={{ fontSize: 10, color: "#9ca3af", background: "#f3f4f6", borderRadius: 4, padding: "2px 6px" }}>{(item as any).sectionStyle || "grid"}</span>
              </div>
              {/* 접힌 상태에서는 숨김 */}
              {!isNavItemCollapsed(item.id) && <div style={{ padding: "10px 12px", display: "flex", flexDirection: "column", gap: 6 }}>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr 1fr", gap: 8 }}>
                <Input value={item.label} onChange={e => updateLocal(item.id, "label", e.target.value)} placeholder="메뉴 이름" style={inputStyle} />
                <Input value={item.path}  onChange={e => updateLocal(item.id, "path",  e.target.value)} placeholder="/category/..." style={inputStyle} />
                <Input value={(item as any).description || ""} onChange={e => updateLocal(item.id, "description", e.target.value)} placeholder="섹션 설명 (선택)" style={inputStyle} />
                <select
                  value={(item as any).sectionStyle || "grid"}
                  onChange={e => updateLocal(item.id, "sectionStyle", e.target.value)}
                  style={{ ...inputStyle, cursor: "pointer" }}
                >
                  <option value="featured">🖼 피처드 (대형+소형)</option>
                  <option value="latest">🕐 최신글</option>
                  <option value="grid">📋 그리드 (3열 카드)</option>
                  <option value="overlay">🎨 오버레이 (이미지 배경 3열)</option>
                  <option value="list">📰 리스트 (썸네일+텍스트 3열)</option>
                  <option value="list2">📰 리스트2 (썸네일+텍스트 2열)</option>
                  <option value="apps">📦 앱 목록</option>
                  <option value="stat-banner">📊 스탯 배너 (3열)</option>
                  <option value="download-grid">⬇ 다운그리드 (4열 파일카드)</option>
                  <option value="download-row">⬇ 다운로우 (가로 리스트)</option>
                  <option value="download-card">⬇ 다운카드 (3열 이미지+파일)</option>
                  <option value="developers">⭐ 주목 개발자 섹션</option>
                </select>
              </div>
              {/* 정렬 방식 설정 (최신글 스타일에서만 표시) */}
              {((item as any).sectionStyle === "latest" || (item as any).sectionStyle === "featured" || (item as any).sectionStyle === "grid" || (item as any).sectionStyle === "overlay" || (item as any).sectionStyle === "list" || (item as any).sectionStyle === "list2") && (
                <div style={{ display: "flex", alignItems: "center", gap: 8, marginTop: 4 }}>
                  <label style={{ ...labelStyle, marginBottom: 0, whiteSpace: "nowrap", fontSize: 11, color: "#6b7280" }}>🔃 정렬 방식:</label>
                  <div style={{ display: "flex", gap: 4 }}>
                    {(["latest", "popular"] as const).map(mode => {
                      const active = ((item as any).sectionSortMode ?? "latest") === mode;
                      return (
                        <button
                          key={mode}
                          onClick={() => updateLocal(item.id, "sectionSortMode", mode)}
                          style={{
                            padding: "3px 12px",
                            borderRadius: 6,
                            border: `1px solid ${active ? "#f59e0b" : "#e5e7eb"}`,
                            fontSize: 12,
                            cursor: "pointer",
                            fontWeight: active ? 700 : 400,
                            background: active ? "#f59e0b" : "#f9fafb",
                            color: active ? "#fff" : "#374151",
                            transition: "all 0.15s",
                          }}
                        >
                          {mode === "latest" ? "🕐 최신순" : "🔥 인기순"}
                        </button>
                      );
                    })}
                  </div>
                  <span style={{ fontSize: 11, color: "#9ca3af" }}>
                    {((item as any).sectionSortMode ?? "latest") === "popular" ? "조회수 많은 글 순서로 표시" : "최근 발행된 글 순서로 표시"}
                  </span>
                </div>
              )}
              {/* 표시 줄 수 설정 */}
              <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                <label style={{ ...labelStyle, marginBottom: 0, whiteSpace: "nowrap", fontSize: 11, color: "#6b7280" }}>📏 표시 줄 수:</label>
                <div style={{ display: "flex", gap: 4 }}>
                  {[1, 2, 3, 4, 5].map(row => {
                    const active = ((item as any).displayRows ?? 1) === row;
                    return (
                      <button
                        key={row}
                        onClick={() => updateLocal(item.id, "displayRows", row)}
                        style={{
                          padding: "3px 10px",
                          borderRadius: 6,
                          border: `1px solid ${active ? "#6366f1" : "#e5e7eb"}`,
                          fontSize: 12,
                          cursor: "pointer",
                          fontWeight: active ? 700 : 400,
                          background: active ? "#6366f1" : "#f9fafb",
                          color: active ? "#fff" : "#374151",
                          transition: "all 0.15s",
                        }}
                      >{row}줄</button>
                    );
                  })}
                </div>
                <span style={{ fontSize: 11, color: "#9ca3af" }}>
                  {(() => {
                    const rows = (item as any).displayRows ?? 1;
                    const style = (item as any).sectionStyle ?? "grid";
                    const perRow = style === "apps" ? 2 : style === "list2" ? 2 : 3;
                    return `(최대 ${rows * perRow}개 표시)`;
                  })()}
                </span>
              </div>
              {/* 섹션 하단 여백 설정 */}
              <div style={{ display: "flex", alignItems: "center", gap: 8, marginTop: 6 }}>
                <label style={{ ...labelStyle, marginBottom: 0, whiteSpace: "nowrap", fontSize: 11, color: "#6b7280" }}>↕ 섹션 여백:</label>
                <input
                  type="range"
                  min={0}
                  max={500}
                  step={4}
                  value={(item as any).sectionMarginBottom ?? 36}
                  onChange={e => updateLocal(item.id, "sectionMarginBottom", Number(e.target.value))}
                  style={{ flex: 1, maxWidth: 160, accentColor: "#6366f1" }}
                />
                <span style={{ fontSize: 12, color: "#374151", minWidth: 36, textAlign: "right", fontWeight: 600 }}>
                  {(item as any).sectionMarginBottom ?? 36}px
                </span>
                <div style={{ display: "flex", gap: 4, flexWrap: "wrap" }}>
                  {[0, 16, 36, 60, 96, 150, 200, 300, 400, 500].map(v => (
                    <button
                      key={v}
                      onClick={() => updateLocal(item.id, "sectionMarginBottom", v)}
                      style={{
                        padding: "2px 7px",
                        borderRadius: 5,
                        border: `1px solid ${((item as any).sectionMarginBottom ?? 36) === v ? "#6366f1" : "#e5e7eb"}`,
                        fontSize: 11,
                        cursor: "pointer",
                        background: ((item as any).sectionMarginBottom ?? 36) === v ? "#6366f1" : "#f9fafb",
                        color: ((item as any).sectionMarginBottom ?? 36) === v ? "#fff" : "#6b7280",
                      }}
                    >{v === 0 ? "없음" : v === 16 ? "좋게" : v === 36 ? "기본" : v === 60 ? "넓게" : v === 96 ? "매우 넓게" : `${v}`}</button>
                  ))}
                </div>
              </div>
              {/* 스탯 배너 편집 UI */}
              {(item as any).sectionStyle === "stat-banner" && (() => {
                // ── 스탯 배너 설정 파싱 ──────────────────────────────────────────────
                let bannerCfg: any = {};
                try { bannerCfg = JSON.parse((item as any).statBannerData || "{}"); } catch { bannerCfg = {}; }
                // 하위 호환: 이전 배열 포맷이면 cards 키로 감싸기
                if (Array.isArray(bannerCfg)) bannerCfg = { cards: bannerCfg };
                const bannerMode: "split" | "single" = bannerCfg.mode ?? "split";
                const singleLink: string = bannerCfg.singleLink ?? "";
                const bannerCards: any[] = bannerCfg.cards ?? [{}, {}, {}];

                const paddingTop: number = bannerCfg.paddingTop ?? 32;
                const paddingBottom: number = bannerCfg.paddingBottom ?? 32;
                const marginBottom: number = bannerCfg.marginBottom ?? 0;
                const cardRadius: number = bannerCfg.cardRadius ?? 12;
                const sectionRadius: number = bannerCfg.sectionRadius ?? 0;
                const titleFontSize: number = bannerCfg.titleFontSize ?? 20;
                const titleColor: string = bannerCfg.titleColor ?? "#ffffff";
                const subtitleFontSize: number = bannerCfg.subtitleFontSize ?? 14;
                const subtitleColor: string = bannerCfg.subtitleColor ?? "#94a3b8";

                const saveBanner = (patch: Partial<{ mode: string; singleLink: string; cards: any[]; paddingTop: number; paddingBottom: number; marginBottom: number; cardRadius: number; sectionRadius: number; titleFontSize: number; titleColor: string; subtitleFontSize: number; subtitleColor: string }>, saveImmediately = false) => {
                  const next = { mode: bannerMode, singleLink, cards: bannerCards, paddingTop, paddingBottom, marginBottom, cardRadius, sectionRadius, titleFontSize, titleColor, subtitleFontSize, subtitleColor, ...patch };
                  const newStatBannerData = JSON.stringify(next);
                  updateLocal(item.id, "statBannerData", newStatBannerData);
                  // saveImmediately=true일 때만 즉시 DB 저장 (카드 순서 변경 시만 사용)
                  if (saveImmediately) {
                    window.dispatchEvent(new CustomEvent("admin-save-start"));
                    updateNav.mutate((localItems || []).map((navItem, i) => {
                      let path = navItem.path || "/";
                      return {
                        id: navItem.id,
                        label: navItem.label,
                        path,
                        sortOrder: i + 1,
                        visible: navItem.visible ?? true,
                        sectionStyle: (navItem as any).sectionStyle ?? "grid",
                        description: (navItem as any).description ?? "",
                        bgColor: (navItem as any).bgColor ?? null,
                        textColor: (navItem as any).textColor ?? null,
                        displayRows: (navItem as any).displayRows ?? 1,
                        sectionMarginBottom: (navItem as any).sectionMarginBottom ?? 36,
                        showOnHome: (navItem as any).showOnHome !== undefined ? (navItem as any).showOnHome : true,
                        thumbSize: (navItem as any).thumbSize ?? "md",
                        statBannerData: navItem.id === item.id ? newStatBannerData : ((navItem as any).statBannerData ?? null),
                      };
                    }));
                  }
                };
                const updateCard = (cardIdx: number, field: string, val: string) => {
                  const newCards = [0, 1, 2].map(i => ({ ...(bannerCards[i] || {}) }));
                  newCards[cardIdx] = { ...newCards[cardIdx], [field]: val };
                  saveBanner({ cards: newCards });
                };
                const EMPTY_CARD = { line1: "", line2: "", line3: "", line1Size: 48, line2Size: 15, line3Size: 13, textAlign: "left" as "left"|"center"|"right", bgColor: "#2a2f45", bgImage: "", linkUrl: "", imageUrl: "" };
                const getCard = (i: number) => ({ ...EMPTY_CARD, ...(bannerCards[i] || {}) });

                return (
                  <div style={{ background: "#f8fafc", border: "1px solid #e2e8f0", borderRadius: 8, padding: 12, marginTop: 4 }}>
                    {/* 섹션 여백 + 카드 둥글기 */}
                    <div style={{ background: "#fff", border: "1px solid #e5e7eb", borderRadius: 6, padding: 8, marginBottom: 8 }}>
                      <div style={{ fontSize: 10, color: "#6b7280", marginBottom: 6, fontWeight: 600 }}>📐 섹션 여백 (px) &amp; 카드 모양</div>
                      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 8, marginBottom: 6 }}>
                        <div>
                          <div style={{ fontSize: 10, color: "#9ca3af", marginBottom: 2 }}>내부 위 여백</div>
                          <Input type="number" value={paddingTop} onChange={e => saveBanner({ paddingTop: Number(e.target.value) })} placeholder="32" style={{ ...inputStyle, fontSize: 12 }} />
                        </div>
                        <div>
                          <div style={{ fontSize: 10, color: "#9ca3af", marginBottom: 2 }}>내부 아래 여백</div>
                          <Input type="number" value={paddingBottom} onChange={e => saveBanner({ paddingBottom: Number(e.target.value) })} placeholder="32" style={{ ...inputStyle, fontSize: 12 }} />
                        </div>
                        <div>
                          <div style={{ fontSize: 10, color: "#9ca3af", marginBottom: 2 }}>다음 섹션 여백</div>
                          <Input type="number" value={marginBottom} onChange={e => saveBanner({ marginBottom: Number(e.target.value) })} placeholder="0" style={{ ...inputStyle, fontSize: 12 }} />
                        </div>
                      </div>
                      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
                        <div>
                          <div style={{ fontSize: 10, color: "#9ca3af", marginBottom: 2 }}>카드 둥글기(px) <span style={{ fontSize: 9, color: "#c4b5fd" }}>카드 내부</span></div>
                          <Input type="number" value={cardRadius} onChange={e => saveBanner({ cardRadius: Number(e.target.value) })} placeholder="12" style={{ ...inputStyle, fontSize: 12 }} />
                        </div>
                        <div>
                          <div style={{ fontSize: 10, color: "#9ca3af", marginBottom: 2 }}>섹션 둥글기(px) <span style={{ fontSize: 9, color: "#6ee7b7" }}>외부 전체</span></div>
                          <Input type="number" value={sectionRadius} onChange={e => saveBanner({ sectionRadius: Number(e.target.value) })} placeholder="0" style={{ ...inputStyle, fontSize: 12 }} />
                        </div>
                      </div>
                    </div>

                    {/* 상단 제목/부제목 스타일 */}
                    <div style={{ background: "#fff", border: "1px solid #e5e7eb", borderRadius: 6, padding: 8, marginBottom: 8 }}>
                      <div style={{ fontSize: 10, color: "#6b7280", marginBottom: 6, fontWeight: 600 }}>🔤 상단 제목 / 부제목 스타일 <span style={{ fontSize: 9, color: "#9ca3af", fontWeight: 400 }}>(미입력 시 해당 줄 숨김)</span></div>
                      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
                        {/* 제목 */}
                        <div style={{ background: "#f8fafc", border: "1px solid #e5e7eb", borderRadius: 5, padding: 6 }}>
                          <div style={{ fontSize: 9, color: "#6366f1", fontWeight: 700, marginBottom: 4 }}>제목 (item.title)</div>
                          <div style={{ display: "grid", gridTemplateColumns: "60px 1fr", gap: 4 }}>
                            <div>
                              <div style={{ fontSize: 9, color: "#9ca3af", marginBottom: 2 }}>크기(px)</div>
                              <Input type="number" value={titleFontSize} onChange={e => saveBanner({ titleFontSize: Number(e.target.value) })} placeholder="20" style={{ ...inputStyle, fontSize: 11 }} />
                            </div>
                            <div>
                              <div style={{ fontSize: 9, color: "#9ca3af", marginBottom: 2 }}>색상</div>
                              <div style={{ display: "flex", gap: 4, alignItems: "center" }}>
                                <input type="color" value={titleColor} onChange={e => saveBanner({ titleColor: e.target.value })} style={{ width: 26, height: 26, border: "1px solid #e5e7eb", borderRadius: 4, padding: 1, cursor: "pointer", flexShrink: 0 }} />
                                <Input value={titleColor} onChange={e => saveBanner({ titleColor: e.target.value })} placeholder="#ffffff" style={{ ...inputStyle, fontSize: 10 }} />
                              </div>
                            </div>
                          </div>
                        </div>
                        {/* 부제목 */}
                        <div style={{ background: "#f8fafc", border: "1px solid #e5e7eb", borderRadius: 5, padding: 6 }}>
                          <div style={{ fontSize: 9, color: "#0ea5e9", fontWeight: 700, marginBottom: 4 }}>부제목 (item.description)</div>
                          <div style={{ display: "grid", gridTemplateColumns: "60px 1fr", gap: 4 }}>
                            <div>
                              <div style={{ fontSize: 9, color: "#9ca3af", marginBottom: 2 }}>크기(px)</div>
                              <Input type="number" value={subtitleFontSize} onChange={e => saveBanner({ subtitleFontSize: Number(e.target.value) })} placeholder="14" style={{ ...inputStyle, fontSize: 11 }} />
                            </div>
                            <div>
                              <div style={{ fontSize: 9, color: "#9ca3af", marginBottom: 2 }}>색상</div>
                              <div style={{ display: "flex", gap: 4, alignItems: "center" }}>
                                <input type="color" value={subtitleColor} onChange={e => saveBanner({ subtitleColor: e.target.value })} style={{ width: 26, height: 26, border: "1px solid #e5e7eb", borderRadius: 4, padding: 1, cursor: "pointer", flexShrink: 0 }} />
                                <Input value={subtitleColor} onChange={e => saveBanner({ subtitleColor: e.target.value })} placeholder="#94a3b8" style={{ ...inputStyle, fontSize: 10 }} />
                              </div>
                            </div>
                          </div>
                        </div>
                      </div>
                    </div>

                    {/* 헤더 + 모드 토글 */}
                    <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 10 }}>
                      <div style={{ fontSize: 12, fontWeight: 700, color: "#374151" }}>📊 스탯 배너 카드 설정</div>
                      <div style={{ display: "flex", gap: 4 }}>
                        {(["split", "single"] as const).map(mode => (
                          <button key={mode} onClick={() => saveBanner({ mode })}
                            style={{ padding: "3px 10px", borderRadius: 6, border: `1px solid ${bannerMode === mode ? "#6366f1" : "#e5e7eb"}`, fontSize: 11, fontWeight: bannerMode === mode ? 700 : 400, background: bannerMode === mode ? "#ede9fe" : "#fff", color: bannerMode === mode ? "#4f46e5" : "#6b7280", cursor: "pointer" }}>
                            {mode === "split" ? "🔲 3칸 분리" : "⬛ 1칸 통합"}
                          </button>
                        ))}
                      </div>
                    </div>

                    {/* 1칸 통합 모드: 전체 공통 링크 */}
                    {bannerMode === "single" && (
                      <div style={{ background: "#fff", border: "1px solid #e5e7eb", borderRadius: 6, padding: 8, marginBottom: 8 }}>
                        <div style={{ fontSize: 10, color: "#6b7280", marginBottom: 4 }}>🔗 전체 클릭 링크 URL (통합 모드)</div>
                        <Input value={singleLink} onChange={e => saveBanner({ singleLink: e.target.value })} placeholder="https://... 또는 /category/..." style={{ ...inputStyle, fontSize: 12 }} />
                      </div>
                    )}

                    {/* 카드 3개 설정 */}
                    {[0, 1, 2].map(cardIdx => {
                      const card = getCard(cardIdx);
                      const isCollapsed = isBannerCardCollapsed(item.id, cardIdx);
                      const moveCard = (fromIdx: number, toIdx: number, e: React.MouseEvent) => {
                        e.stopPropagation();
                        if (toIdx < 0 || toIdx > 2) return;
                        const newCards = [0, 1, 2].map(i => ({ ...(bannerCards[i] || {}) }));
                        const temp = newCards[fromIdx];
                        newCards[fromIdx] = newCards[toIdx];
                        newCards[toIdx] = temp;
                        saveBanner({ cards: newCards }, true); // 순서 변경은 즉시 DB 저장
                      };
                      return (
                        <div key={cardIdx} style={{ border: `2px solid ${["#6366f1","#0ea5e9","#10b981"][cardIdx]}`, borderRadius: 10, overflow: "hidden", marginBottom: cardIdx < 2 ? 14 : 0, boxShadow: `0 2px 8px ${["#6366f1","#0ea5e9","#10b981"][cardIdx]}22` }}>
                          {/* 칸 헤더 - 클릭으로 접기/펼치기 */}
                          <div
                            onClick={() => toggleBannerCard(item.id, cardIdx)}
                            style={{ background: ["#ede9fe","#e0f2fe","#d1fae5"][cardIdx], borderBottom: isCollapsed ? "none" : `1px solid ${["#6366f1","#0ea5e9","#10b981"][cardIdx]}55`, padding: "8px 12px", display: "flex", alignItems: "center", gap: 8, cursor: "pointer", userSelect: "none" }}
                          >
                            <div style={{ width: 24, height: 24, borderRadius: "50%", background: ["#6366f1","#0ea5e9","#10b981"][cardIdx], display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
                              <span style={{ fontSize: 12, fontWeight: 900, color: "#fff" }}>{cardIdx + 1}</span>
                            </div>
                            <span style={{ fontSize: 13, fontWeight: 700, color: ["#4f46e5","#0369a1","#047857"][cardIdx] }}>칸 {cardIdx + 1}</span>
                            <span style={{ fontSize: 10, color: ["#4f46e5","#0369a1","#047857"][cardIdx], opacity: 0.65 }}>
                              {card.line1 ? `"${card.line1.slice(0,12)}${card.line1.length > 12 ? "..." : ""}"` : "(비어있음)"}
                            </span>
                            {/* 순서 이동 버튼 (▲▼) */}
                            <div style={{ marginLeft: "auto", display: "flex", gap: 3, alignItems: "center" }} onClick={e => e.stopPropagation()}>
                              <button
                                onClick={e => moveCard(cardIdx, cardIdx - 1, e)}
                                disabled={cardIdx === 0}
                                title="위로 이동 (순서 앞으로)"
                                style={{
                                  width: 24, height: 24, borderRadius: 5, padding: 0,
                                  border: `1px solid ${cardIdx === 0 ? "#e5e7eb" : ["#6366f1","#0ea5e9","#10b981"][cardIdx]}`,
                                  background: cardIdx === 0 ? "#f9fafb" : "#fff",
                                  color: cardIdx === 0 ? "#d1d5db" : ["#4f46e5","#0369a1","#047857"][cardIdx],
                                  cursor: cardIdx === 0 ? "not-allowed" : "pointer",
                                  fontSize: 12, fontWeight: 700,
                                  display: "flex", alignItems: "center", justifyContent: "center", lineHeight: 1,
                                  flexShrink: 0,
                                }}
                              >▲</button>
                              <button
                                onClick={e => moveCard(cardIdx, cardIdx + 1, e)}
                                disabled={cardIdx === 2}
                                title="아래로 이동 (순서 뒤로)"
                                style={{
                                  width: 24, height: 24, borderRadius: 5, padding: 0,
                                  border: `1px solid ${cardIdx === 2 ? "#e5e7eb" : ["#6366f1","#0ea5e9","#10b981"][cardIdx]}`,
                                  background: cardIdx === 2 ? "#f9fafb" : "#fff",
                                  color: cardIdx === 2 ? "#d1d5db" : ["#4f46e5","#0369a1","#047857"][cardIdx],
                                  cursor: cardIdx === 2 ? "not-allowed" : "pointer",
                                  fontSize: 12, fontWeight: 700,
                                  display: "flex", alignItems: "center", justifyContent: "center", lineHeight: 1,
                                  flexShrink: 0,
                                }}
                              >▼</button>
                            </div>
                            <span style={{ fontSize: 14, color: ["#4f46e5","#0369a1","#047857"][cardIdx], opacity: 0.7, lineHeight: 1 }}>
                              {isCollapsed ? "▼" : "▲"}
                            </span>
                          </div>
                          {/* 칸 내용 - 접힌 상태면 숨김 */}
                          {!isCollapsed && <div style={{ background: ["#f5f3ff","#f0f9ff","#f0fdf4"][cardIdx], padding: 10 }}>

                          {/* 텍스트 정렬 */}
                          <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 8 }}>
                            <div style={{ fontSize: 10, color: "#6b7280", whiteSpace: "nowrap" }}>텍스트 정렬</div>
                            {(["left", "center", "right"] as const).map(align => (
                              <button key={align} onClick={() => updateCard(cardIdx, "textAlign", align)}
                                style={{ padding: "3px 10px", borderRadius: 5, border: `1px solid ${(card.textAlign || "left") === align ? "#6366f1" : "#e5e7eb"}`, fontSize: 11, fontWeight: (card.textAlign || "left") === align ? 700 : 400, background: (card.textAlign || "left") === align ? "#ede9fe" : "#fff", color: (card.textAlign || "left") === align ? "#4f46e5" : "#6b7280", cursor: "pointer" }}>
                                {align === "left" ? "◀ 좌" : align === "center" ? "▣ 중앙" : "우 ▶"}
                              </button>
                            ))}
                          </div>

                          {/* 3줄 텍스트 + 글자크기 + 굵기 + 색상 + 폰트 */}
                          {(["line1", "line2", "line3"] as const).map((lineKey, li) => {
                            const sizeKey = (lineKey + "Size") as "line1Size" | "line2Size" | "line3Size";
                            const weightKey = (lineKey + "Weight") as "line1Weight" | "line2Weight" | "line3Weight";
                            const colorKey = (lineKey + "Color") as "line1Color" | "line2Color" | "line3Color";
                            const fontKey = (lineKey + "Font") as "line1Font" | "line2Font" | "line3Font";
                            const defaultSizes = [48, 15, 13];
                            const defaultWeights = ["900", "600", "400"];
                            const defaultColors = ["#5ba3f5", "#cbd5e1", "#94a3b8"];
                            const FONT_OPTIONS = [
                              { label: "기본", value: "" },
                              { label: "Noto Sans KR", value: "'Noto Sans KR', sans-serif" },
                              { label: "Nanum Gothic", value: "'Nanum Gothic', sans-serif" },
                              { label: "Nanum Myeongjo", value: "'Nanum Myeongjo', serif" },
                              { label: "Black Han Sans", value: "'Black Han Sans', sans-serif" },
                              { label: "Gmarket Sans", value: "'GmarketSans', sans-serif" },
                              { label: "Roboto", value: "'Roboto', sans-serif" },
                              { label: "Oswald", value: "'Oswald', sans-serif" },
                            ];
                            const WEIGHT_OPTIONS = [
                              { label: "Thin", value: "100" },
                              { label: "Light", value: "300" },
                              { label: "Regular", value: "400" },
                              { label: "Medium", value: "500" },
                              { label: "Bold", value: "700" },
                              { label: "ExtraBold", value: "800" },
                              { label: "Black", value: "900" },
                            ];
                            return (
                              <div key={lineKey} style={{ background: "#f8fafc", border: "1px solid #e5e7eb", borderRadius: 6, padding: 8, marginBottom: 6 }}>
                                <div style={{ fontSize: 10, color: "#6366f1", fontWeight: 700, marginBottom: 6 }}>{li + 1}줄 텍스트</div>
                                {/* 텍스트 입력 */}
                                <div style={{ marginBottom: 5 }}>
                                  <Input value={card[lineKey] || ""} onChange={e => updateCard(cardIdx, lineKey, e.target.value)} placeholder={li === 0 ? "5배" : li === 1 ? "투자수익률(ROI)" : "부가 설명"} style={{ ...inputStyle, fontSize: 12 }} />
                                </div>
                                {/* 크기 + 굵기 + 색상 */}
                                <div style={{ display: "grid", gridTemplateColumns: "70px 1fr 90px", gap: 5, marginBottom: 5 }}>
                                  <div>
                                    <div style={{ fontSize: 9, color: "#9ca3af", marginBottom: 2 }}>크기(px)</div>
                                    <Input type="number" value={card[sizeKey] ?? defaultSizes[li]} onChange={e => updateCard(cardIdx, sizeKey, e.target.value)} placeholder={String(defaultSizes[li])} style={{ ...inputStyle, fontSize: 11 }} />
                                  </div>
                                  <div>
                                    <div style={{ fontSize: 9, color: "#9ca3af", marginBottom: 2 }}>굵기</div>
                                    <select value={card[weightKey] ?? defaultWeights[li]} onChange={e => updateCard(cardIdx, weightKey, e.target.value)}
                                      style={{ width: "100%", height: 32, border: "1px solid #e5e7eb", borderRadius: 5, fontSize: 11, padding: "0 4px", background: "#fff", color: "#374151" }}>
                                      {WEIGHT_OPTIONS.map(w => <option key={w.value} value={w.value}>{w.label} ({w.value})</option>)}
                                    </select>
                                  </div>
                                  <div>
                                    <div style={{ fontSize: 9, color: "#9ca3af", marginBottom: 2 }}>색상</div>
                                    <div style={{ display: "flex", alignItems: "center", gap: 4 }}>
                                      <input type="color" value={card[colorKey] ?? defaultColors[li]} onChange={e => updateCard(cardIdx, colorKey, e.target.value)}
                                        style={{ width: 28, height: 28, border: "1px solid #e5e7eb", borderRadius: 4, padding: 1, cursor: "pointer", flexShrink: 0 }} />
                                      <Input value={card[colorKey] ?? defaultColors[li]} onChange={e => updateCard(cardIdx, colorKey, e.target.value)}
                                        placeholder={defaultColors[li]} style={{ ...inputStyle, fontSize: 10 }} />
                                    </div>
                                  </div>
                                </div>
                                {/* 폰트 */}
                                <div>
                                  <div style={{ fontSize: 9, color: "#9ca3af", marginBottom: 2 }}>폰트</div>
                                  <select value={card[fontKey] ?? ""} onChange={e => updateCard(cardIdx, fontKey, e.target.value)}
                                    style={{ width: "100%", height: 32, border: "1px solid #e5e7eb", borderRadius: 5, fontSize: 11, padding: "0 4px", background: "#fff", color: "#374151" }}>
                                    {FONT_OPTIONS.map(f => <option key={f.value} value={f.value}>{f.label}</option>)}
                                  </select>
                                </div>
                              </div>
                            );
                          })}

                          {/* 배경 이미지 업로드 */}
                          <div style={{ marginBottom: 6 }}>
                            <div style={{ fontSize: 10, color: "#6b7280", marginBottom: 2 }}>배경 이미지 (선택)</div>
                            <div style={{ display: "flex", gap: 4, alignItems: "center" }}>
                              <label style={{ display: "inline-flex", alignItems: "center", gap: 4, padding: "5px 10px", borderRadius: 6, cursor: "pointer", background: "#f0fdf4", border: "1px solid #bbf7d0", fontSize: 11, color: "#16a34a", fontWeight: 600, whiteSpace: "nowrap", flexShrink: 0 }}>
                                <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="8.5" cy="8.5" r="1.5"/><polyline points="21 15 16 10 5 21"/></svg>
                                배경 업로드
                                <input type="file" accept="image/*" style={{ display: "none" }}
                                  onChange={async (e) => {
                                    const file = e.target.files?.[0]; if (!file) return;
                                    const fd = new FormData(); fd.append("image", file);
                                    try { const res = await fetch("/api/upload/image", { method: "POST", body: fd, credentials: "include" }); const d = await res.json(); if (d.url) updateCard(cardIdx, "bgImage", d.url); } catch { /**/ }
                                    e.target.value = "";
                                  }}
                                />
                              </label>
                              {card.bgImage ? (
                                <div style={{ position: "relative", flexShrink: 0 }}>
                                  <img src={card.bgImage} alt="bg" loading="lazy" decoding="async" style={{ width: 36, height: 36, objectFit: "cover", borderRadius: 5, border: "1px solid #e5e7eb" }} />
                                  <button onClick={() => updateCard(cardIdx, "bgImage", "")} style={{ position: "absolute", top: -5, right: -5, width: 16, height: 16, borderRadius: "50%", background: "#ef4444", border: "none", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", padding: 0 }}>
                                    <svg width="8" height="8" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="3"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
                                  </button>
                                </div>
                              ) : <span style={{ fontSize: 10, color: "#9ca3af" }}>미선택</span>}
                            </div>
                          </div>

                          {/* 아이콘 이미지 + 링크 (3칸 분리 모드에서만 링크 표시) */}
                          <div style={{ display: "grid", gridTemplateColumns: bannerMode === "split" ? "1fr 1fr" : "1fr", gap: 6, marginBottom: 6 }}>
                            <div>
                              <div style={{ fontSize: 10, color: "#6b7280", marginBottom: 2 }}>이미지 (선택)</div>
                              <div style={{ display: "flex", gap: 4, alignItems: "center" }}>
                                <label style={{ display: "inline-flex", alignItems: "center", gap: 4, padding: "5px 10px", borderRadius: 6, cursor: "pointer", background: "#f0f4ff", border: "1px solid #c7d2fe", fontSize: 11, color: "#4f46e5", fontWeight: 600, whiteSpace: "nowrap", flexShrink: 0 }}>
                                  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4"/><polyline points="17 8 12 3 7 8"/><line x1="12" y1="3" x2="12" y2="15"/></svg>
                                  업로드
                                  <input type="file" accept="image/*" style={{ display: "none" }}
                                    onChange={async (e) => {
                                      const file = e.target.files?.[0]; if (!file) return;
                                      const fd = new FormData(); fd.append("image", file);
                                      try { const res = await fetch("/api/upload/image", { method: "POST", body: fd, credentials: "include" }); const d = await res.json(); if (d.url) updateCard(cardIdx, "imageUrl", d.url); } catch { /**/ }
                                      e.target.value = "";
                                    }}
                                  />
                                </label>
                                {card.imageUrl ? (
                                  <div style={{ position: "relative", flexShrink: 0 }}>
                                    <img src={card.imageUrl} alt="" loading="lazy" decoding="async" style={{ width: 36, height: 36, objectFit: "cover", borderRadius: 5, border: "1px solid #e5e7eb" }} />
                                    <button onClick={() => updateCard(cardIdx, "imageUrl", "")} style={{ position: "absolute", top: -5, right: -5, width: 16, height: 16, borderRadius: "50%", background: "#ef4444", border: "none", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", padding: 0 }}>
                                      <svg width="8" height="8" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="3"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
                                    </button>
                                  </div>
                                ) : <span style={{ fontSize: 10, color: "#9ca3af" }}>미선택</span>}
                              </div>
                            </div>
                            {bannerMode === "split" && (
                              <div>
                                <div style={{ fontSize: 10, color: "#6b7280", marginBottom: 2 }}>링크 URL (선택)</div>
                                <Input value={card.linkUrl || ""} onChange={e => updateCard(cardIdx, "linkUrl", e.target.value)} placeholder="/category/..." style={{ ...inputStyle, fontSize: 12 }} />
                              </div>
                            )}
                          </div>

                          {/* 배경색 */}
                          <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                            <div style={{ fontSize: 10, color: "#6b7280", whiteSpace: "nowrap" }}>카드 배경색</div>
                            <input type="color" value={card.bgColor || "#2a2f45"} onChange={e => updateCard(cardIdx, "bgColor", e.target.value)} style={{ width: 28, height: 24, borderRadius: 4, border: "1px solid #e5e7eb", cursor: "pointer", padding: 1 }} />
                            <Input value={card.bgColor || ""} onChange={e => updateCard(cardIdx, "bgColor", e.target.value)} placeholder="#2a2f45" style={{ ...inputStyle, flex: 1, fontSize: 11 }} />
                          </div>
                          </div>}
                        </div>
                      );
                    })}
                  </div>
                );
              })()}
              {/* 리스트 스타일 썸네일 크기 설정 */}
              {((item as any).sectionStyle === "list" || (item as any).sectionStyle === "list2") && (
                <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                  <label style={{ ...labelStyle, marginBottom: 0, whiteSpace: "nowrap", fontSize: 11, color: "#6b7280" }}>🖼 썸네일 크기:</label>
                  <div style={{ display: "flex", gap: 4 }}>
                    {([["sm", "소형"], ["md", "중형"], ["lg", "대형"]] as const).map(([val, label]) => {
                      const active = ((item as any).thumbSize ?? "md") === val;
                      return (
                        <button
                          key={val}
                          onClick={() => updateLocal(item.id, "thumbSize", val)}
                          style={{
                            padding: "3px 10px",
                            borderRadius: 6,
                            border: `1px solid ${active ? "#0284c7" : "#e5e7eb"}`,
                            fontSize: 12,
                            cursor: "pointer",
                            fontWeight: active ? 700 : 400,
                            background: active ? "#0284c7" : "#f9fafb",
                            color: active ? "#fff" : "#374151",
                            transition: "all 0.15s",
                          }}
                        >{label}</button>
                      );
                    })}
                  </div>
                  <span style={{ fontSize: 11, color: "#9ca3af" }}>
                    {(item as any).thumbSize === "sm" ? "(64×52px)" : (item as any).thumbSize === "lg" ? "(140×100px)" : "(100×72px)"}
                  </span>
                </div>
              )}
              {/* 배경색 / 글자색 */}
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
                <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                  <label style={{ ...labelStyle, whiteSpace: "nowrap", marginBottom: 0 }}>배경색</label>
                  <input
                    type="color"
                    value={(item as any).bgColor || "#ffffff"}
                    onChange={e => updateLocal(item.id, "bgColor", e.target.value)}
                    style={{ width: 32, height: 28, borderRadius: 4, border: "1px solid #e5e7eb", cursor: "pointer", padding: 2 }}
                    title="배경색 선택"
                  />
                  <Input
                    value={(item as any).bgColor || ""}
                    onChange={e => updateLocal(item.id, "bgColor", e.target.value)}
                    placeholder="#ffffff (없으면 투명)"
                    style={{ ...inputStyle, flex: 1, fontSize: 11 }}
                  />
                  {(item as any).bgColor && (
                    <button onClick={() => updateLocal(item.id, "bgColor", "")} style={{ ...btnStyle, color: "#9ca3af", fontSize: 10, padding: "2px 4px" }} title="배경색 제거">✕</button>
                  )}
                </div>
                <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                  <label style={{ ...labelStyle, whiteSpace: "nowrap", marginBottom: 0 }}>글자색</label>
                  <input
                    type="color"
                    value={(item as any).textColor || "#374151"}
                    onChange={e => updateLocal(item.id, "textColor", e.target.value)}
                    style={{ width: 32, height: 28, borderRadius: 4, border: "1px solid #e5e7eb", cursor: "pointer", padding: 2 }}
                    title="글자색 선택"
                  />
                  <Input
                    value={(item as any).textColor || ""}
                    onChange={e => updateLocal(item.id, "textColor", e.target.value)}
                    placeholder="#374151 (기본)"
                    style={{ ...inputStyle, flex: 1, fontSize: 11 }}
                  />
                  {(item as any).textColor && (
                    <button onClick={() => updateLocal(item.id, "textColor", "")} style={{ ...btnStyle, color: "#9ca3af", fontSize: 10, padding: "2px 4px" }} title="글자색 제거">✕</button>
                  )}
                </div>
              </div>
            </div>}{/* 접힌 상태 조건부 끝 */}
            </div>{/* 카드 내용 end */}
            {/* 우측 버튼 영역 */}
            <div style={{ display: "flex", flexDirection: "column", gap: 3, padding: "10px 8px", borderLeft: "1px solid #f3f4f6", background: "#fafafa", justifyContent: "flex-start" }}>
              <button onClick={() => moveItem(idx, -1)} disabled={idx === 0} style={{ ...btnStyle, opacity: idx === 0 ? 0.3 : 1 }}><ChevronUp size={13} /></button>
              <button onClick={() => moveItem(idx, 1)} disabled={idx === (localItems?.length ?? 0) - 1} style={{ ...btnStyle, opacity: idx === (localItems?.length ?? 0) - 1 ? 0.3 : 1 }}><ChevronDown size={13} /></button>
              {/* 헤더 메뉴 표시 여부 (visible) */}
              <button
                onClick={() => updateLocal(item.id, "visible", !item.visible)}
                style={{ ...btnStyle, color: item.visible ? "#6366f1" : "#9ca3af" }}
                title={item.visible ? "헤더 메뉴에서 숨기기" : "헤더 메뉴에 표시"}
              >
                {item.visible ? <Eye size={13} /> : <EyeOff size={13} />}
              </button>
              {/* 메인 섹션 표시 여부 (showOnHome) — 모든 항목에 공통 적용 */}
              <button
                onClick={() => updateLocal(item.id, "showOnHome", !Boolean((item as any).showOnHome))}
                style={{ ...btnStyle, color: Boolean((item as any).showOnHome) ? "#10b981" : "#9ca3af", background: Boolean((item as any).showOnHome) ? "rgba(16,185,129,0.08)" : undefined }}
                title={Boolean((item as any).showOnHome) ? "메인 섹션에서 숨기기" : "메인 섹션에 표시"}
              >
                <span style={{ fontSize: 10, fontWeight: 700 }}>{Boolean((item as any).showOnHome) ? "홈✓" : "홈✗"}</span>
              </button>
              <button onClick={() => { if (confirm(`"${item.label}" 항목을 삭제할까요?`)) deleteNav.mutate({ id: item.id }); }} style={{ ...btnStyle, color: "#ef4444" }}>
                <Trash2 size={13} />
              </button>
            </div>
          </div>
        ))}
      </div>

      {showAddForm && (
        <div ref={addFormRef} style={{ background: "#ffffff", border: "1px solid #e5e7eb", borderRadius: 8, padding: 16, marginTop: 12, boxShadow: "0 2px 8px rgba(0,0,0,0.06)" }}>
          <div style={{ fontSize: 13, fontWeight: 700, color: "#374151", marginBottom: 12 }}>새 섹션/카테고리 추가</div>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10, marginBottom: 10 }}>
            <div>
              <label style={labelStyle}>메뉴 이름</label>
              <Input value={newItem.label} onChange={e => setNewItem(n => ({ ...n, label: e.target.value }))} placeholder="예: AI 툴 추천" style={inputStyle} />
            </div>
            <div style={{ gridColumn: "1 / -1" }}>
              <label style={labelStyle}>연결 경로</label>
              {/* 경로 타입 선택 탭 */}
              <div style={{ display: "flex", gap: 4, marginBottom: 6 }}>
                {([
                  { key: 'category', label: '📂 카테고리 직접 입력' },
                  { key: 'page', label: '📄 페이지 선택' },
                  { key: 'external', label: '🌐 외부 URL' },
                ] as { key: 'category' | 'page' | 'external', label: string }[]).map(opt => (
                  <button
                    key={opt.key}
                    type="button"
                    onClick={() => { setPathType(opt.key); setNewItem(n => ({ ...n, path: '' })); }}
                    style={{
                      padding: '4px 10px',
                      borderRadius: 6,
                      border: `1.5px solid ${pathType === opt.key ? '#6366f1' : '#e5e7eb'}`,
                      fontSize: 11,
                      cursor: 'pointer',
                      fontWeight: pathType === opt.key ? 700 : 400,
                      background: pathType === opt.key ? 'rgba(99,102,241,0.08)' : '#f9fafb',
                      color: pathType === opt.key ? '#6366f1' : '#6b7280',
                    }}
                  >{opt.label}</button>
                ))}
              </div>
              {/* 카테고리 직접 입력 */}
              {pathType === 'category' && (
                <Input
                  value={newItem.path}
                  onChange={e => setNewItem(n => ({ ...n, path: e.target.value }))}
                  placeholder="/category/ai-tools 또는 ai-tools"
                  style={inputStyle}
                />
              )}
              {/* 페이지 선택 */}
              {pathType === 'page' && (
                <select
                  value={newItem.path}
                  onChange={e => {
                    const slug = e.target.value;
                    const page = (publishedPages || []).find((p: any) => p.slug === slug);
                    setNewItem(n => ({
                      ...n,
                      path: slug ? `/page/${slug}` : '',
                      label: n.label || (page?.title ?? ''),
                    }));
                  }}
                  style={{ ...inputStyle, cursor: 'pointer', width: '100%' }}
                >
                  <option value="">페이지를 선택하세요...</option>
                  {(publishedPages || []).map((p: any) => (
                    <option key={p.id} value={`/page/${p.slug}`}>{p.title} ({p.slug})</option>
                  ))}
                </select>
              )}
              {/* 외부 URL */}
              {pathType === 'external' && (
                <Input
                  value={newItem.path}
                  onChange={e => setNewItem(n => ({ ...n, path: e.target.value }))}
                  placeholder="https://example.com"
                  style={inputStyle}
                />
              )}
              {newItem.path && (
                <div style={{ fontSize: 11, color: '#6b7280', marginTop: 3 }}>
                  연결 대상: <code style={{ background: '#f3f4f6', padding: '1px 5px', borderRadius: 3 }}>{newItem.path}</code>
                </div>
              )}
            </div>
            <div>
              <label style={labelStyle}>섹션 설명 (선택)</label>
              <Input value={newItem.description} onChange={e => setNewItem(n => ({ ...n, description: e.target.value }))} placeholder="이 카테고리에 대한 설명" style={inputStyle} />
            </div>
            <div>
              <label style={labelStyle}>메인 섹션 스타일</label>
              <select
                value={newItem.sectionStyle}
                onChange={e => setNewItem(n => ({ ...n, sectionStyle: e.target.value as "featured" | "grid" | "apps" | "latest" | "overlay" | "list" | "download-grid" | "download-row" | "download-card" | "developers" }))}
                style={{ ...inputStyle, cursor: "pointer", width: "100%" }}
              >
                <option value="featured">🖼 피처드 — 대형 카드 + 소형 카드 그리드 (첫 번째 섹션 권장)</option>
                <option value="grid">📋 그리드 — 3열 소형 카드 목록</option>
                <option value="overlay">🎨 오버레이 — 이미지 전체 배경 + 텍스트 오버레이 3열</option>
                <option value="list">📰 리스트 — 좌측 썸네일 + 우측 텍스트 3열 목록</option>
                <option value="apps">📦 앱 목록 — 프로그램/앱 카드 목록</option>
                <option value="latest">🕐 최신글 — 모든 카테고리 최신 순 목록</option>
                <option value="download-grid">⬇ 다운그리드 — 4열 파일타입 카드 (다운로드 전용)</option>
                <option value="download-row">⬇ 다운로우 — 가로 리스트형 다운로드 목록</option>
                <option value="download-card">⬇ 다운카드 — 3열 이미지+파일 카드 (다운로드 전용)</option>
                <option value="developers">⭐ 주목 개발자 — 주목 개발자 섹션 (DB 연동)</option>
              </select>
            </div>
            <div>
              <label style={labelStyle}>표시 줄 수 (1~5줄)</label>
              <div style={{ display: "flex", gap: 4 }}>
                {[1, 2, 3, 4, 5].map(row => {
                  const active = (newItem as any).displayRows === row || (!(newItem as any).displayRows && row === 1);
                  return (
                    <button
                      key={row}
                      type="button"
                      onClick={() => setNewItem(n => ({ ...n, displayRows: row }))}
                      style={{
                        padding: "5px 12px",
                        borderRadius: 6,
                        border: `1px solid ${active ? "#6366f1" : "#e5e7eb"}`,
                        fontSize: 13,
                        cursor: "pointer",
                        fontWeight: active ? 700 : 400,
                        background: active ? "#6366f1" : "#f9fafb",
                        color: active ? "#fff" : "#374151",
                      }}
                    >{row}줄</button>
                  );
                })}
              </div>
            </div>
          </div>
          {/* 표시 위치 선택 */}
          <div style={{ marginBottom: 10 }}>
            <label style={labelStyle}>표시 위치</label>
            <div style={{ display: "flex", gap: 8 }}>
              {[
                { label: "상단 메뉴 + 메인 섹션", value: "both", desc: "헤더 메뉴와 홈 화면 섹션 모두에 표시" },
                { label: "상단 메뉴만", value: "nav-only", desc: "헤더 메뉴에만 표시, 홈 화면 섹션에는 미표시" },
                { label: "메인 섹션만", value: "home-only", desc: "홈 화면 섹션에만 표시, 헤더 메뉴에는 미표시" },
              ].map(opt => {
                const currentVal = newItem.visible && newItem.showOnHome ? "both" : newItem.visible && !newItem.showOnHome ? "nav-only" : "home-only";
                const active = currentVal === opt.value;
                return (
                  <button
                    key={opt.value}
                    type="button"
                    onClick={() => {
                      if (opt.value === "both") setNewItem(n => ({ ...n, visible: true, showOnHome: true }));
                      else if (opt.value === "nav-only") setNewItem(n => ({ ...n, visible: true, showOnHome: false }));
                      else setNewItem(n => ({ ...n, visible: false, showOnHome: true }));
                    }}
                    title={opt.desc}
                    style={{
                      padding: "6px 12px",
                      borderRadius: 6,
                      border: `1.5px solid ${active ? "#6366f1" : "#e5e7eb"}`,
                      fontSize: 12,
                      cursor: "pointer",
                      fontWeight: active ? 700 : 400,
                      background: active ? "rgba(99,102,241,0.08)" : "#f9fafb",
                      color: active ? "#6366f1" : "#6b7280",
                    }}
                  >{opt.label}</button>
                );
              })}
            </div>
            <div style={{ fontSize: 11, color: "#9ca3af", marginTop: 4 }}>
              {newItem.visible && newItem.showOnHome && "헤더 메뉴 + 홈 화면 섹션 모두에 표시됩니다."}
              {newItem.visible && !newItem.showOnHome && "헤더 메뉴에만 표시됩니다. 홈 화면 섹션에는 나타나지 않습니다."}
              {!newItem.visible && newItem.showOnHome && "홈 화면 섹션에만 표시됩니다. 상단 메뉴에는 나타나지 않습니다."}
            </div>
          </div>
          <div style={{ background: "#f0f9ff", borderRadius: 6, padding: "8px 12px", marginBottom: 10, fontSize: 11, color: "#0369a1" }}>
            💡 <strong>카테고리</strong>: <code>/category/키이름</code> 형식으로 입력하면 글 작성 시 카테고리를 선택할 수 있습니다.
              <strong>페이지</strong>: 에디터로 만든 정적 페이지를 선택하면 자동으로 <code>/page/슬러그</code>로 연결됩니다.
              <strong>외부 URL</strong>: 외부 사이트 주소를 직접 입력하세요.
          </div>
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            <Button type="button" onClick={() => {
              if (!newItem.label || !newItem.path) { toast.error("이름과 경로를 입력하세요."); return; }
              let rawPath = newItem.path;
              let path: string;
              if (pathType === 'page') {
                // 페이지 선택: 이미 /page/슬러그 형식으로 저장됨
                path = rawPath;
              } else if (pathType === 'external') {
                // 외부 URL: 그대로 저장
                path = rawPath;
              } else {
                // 카테고리: /로 시작하면 그대로, 아니면 /category/ 접두사 추가
                if (rawPath.startsWith("/")) {
                  path = rawPath;
                } else {
                  path = `/category/${rawPath}`;
                }
              }
              console.log('[createNav] mutate called with:', { ...newItem, path, pathType });
              createNav.mutate({ ...newItem, path });
            }} disabled={createNav.isPending} style={{ background: "#6366f1", fontSize: 13 }}>
              <Plus size={14} style={{ marginRight: 4 }} />섹션 추가
            </Button>
            <Button
              variant="outline"
              onClick={() => {
                createNav.mutate({ label: "최신글", path: "/category/__latest__", sortOrder: 99, visible: true, sectionStyle: "latest", description: "모든 카테고리 최신 글 모음", displayRows: 1 });
              }}
              style={{ fontSize: 13, borderColor: "#6366f1", color: "#6366f1" }}
              title="모든 카테고리 최신 글을 보여주는 특수 섹션을 추가합니다"
            >
              <Plus size={14} style={{ marginRight: 4 }} />최신글 섹션 빠른 추가
            </Button>
            <Button
              variant="outline"
              onClick={() => {
                createNav.mutate({ label: "바이브코딩 인사이트", path: "/category/__vibecraft_insight__", sortOrder: 99, visible: true, sectionStyle: "grid", description: "vibecraftx.com 바이브코딩 인사이트 모음", displayRows: 2 });
              }}
              style={{ fontSize: 13, borderColor: "#7c3aed", color: "#7c3aed" }}
              title="vibecraftx.com 바이브코딩 인사이트 섹션을 네비게이션에 추가합니다"
            >
              <Plus size={14} style={{ marginRight: 4 }} />바이브코딩 인사이트 빠른 추가
            </Button>
            <Button variant="ghost" onClick={() => { setShowAddForm(false); setPathType('category'); }} style={{ fontSize: 13, color: "#6b7280" }}>취소</Button>
          </div>
        </div>
      )}
    </div>
  );
}

// ─── 카드 테두리 설정 패널 (홈 레이아웃 탭에서 사용) ─────────────────────────────
export function CardBorderSettingsPanel() {
  const { data: config, refetch } = trpc.admin.getSiteConfig.useQuery();
  const updateConfig = trpc.admin.updateSiteConfig.useMutation({ onSuccess: () => { adminSave.success("카드 테두리 설정이 저장되었습니다."); refetch(); } });
  const [cardBorderColor, setCardBorderColor] = useState("#c7d2fe");
  const [cardBorderWidth, setCardBorderWidth] = useState("1.5px");
  useEffect(() => {
    if (config) {
      if (config.cardBorderColor) setCardBorderColor(config.cardBorderColor);
      if (config.cardBorderWidth) setCardBorderWidth(config.cardBorderWidth);
    }
  }, [config]);
  const save = () => updateConfig.mutate({ cardBorderColor, cardBorderWidth });
  return (
    <div style={cardStyle}>
      <div style={{ fontSize: 13, fontWeight: 700, color: "#6366f1", marginBottom: 12, display: "flex", alignItems: "center", gap: 8 }}>
        <Palette size={15} />다운로드 카드 테두리 설정
      </div>
      <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
        {/* 테두리 색상 */}
        <div>
          <label style={{ ...labelStyle, marginBottom: 8 }}>테두리 색상</label>
          <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
            <input
              type="color"
              value={cardBorderColor}
              onChange={e => setCardBorderColor(e.target.value)}
              style={{ width: 40, height: 36, borderRadius: 6, border: "none", cursor: "pointer" }}
            />
            <Input
              value={cardBorderColor}
              onChange={e => setCardBorderColor(e.target.value)}
              placeholder="#c7d2fe"
              style={{ ...inputStyle, flex: 1 }}
            />
            <div style={{ width: 36, height: 36, borderRadius: 6, background: cardBorderColor, border: "1px solid #e5e7eb" }} />
          </div>
          <div style={{ display: "flex", gap: 6, marginTop: 8, flexWrap: "wrap" }}>
            {[
              { color: "#c7d2fe", label: "인디고 연한" },
              { color: "#a5b4fc", label: "인디고" },
              { color: "#6366f1", label: "인디고 진한" },
              { color: "#e5e7eb", label: "회색" },
              { color: "#d1d5db", label: "진한 회색" },
              { color: "#fca5a5", label: "빨강" },
              { color: "#86efac", label: "녹색" },
              { color: "#93c5fd", label: "파란" },
            ].map(({ color, label }) => (
              <button
                key={color}
                type="button"
                title={label}
                onClick={() => setCardBorderColor(color)}
                style={{
                  width: 28, height: 28, borderRadius: 6, cursor: "pointer",
                  background: color,
                  border: cardBorderColor === color ? "3px solid #6366f1" : "1px solid #e5e7eb",
                  outline: "none",
                }}
              />
            ))}
          </div>
        </div>
        {/* 테두리 두께 */}
        <div>
          <label style={{ ...labelStyle, marginBottom: 8 }}>테두리 두께</label>
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            {["0.5px", "1px", "1.5px", "2px", "2.5px", "3px"].map(w => (
              <button
                key={w}
                type="button"
                onClick={() => setCardBorderWidth(w)}
                style={{
                  padding: "6px 14px", borderRadius: 8,
                  border: cardBorderWidth === w ? "2px solid #6366f1" : "1px solid #e5e7eb",
                  background: cardBorderWidth === w ? "#eef2ff" : "#fff",
                  color: cardBorderWidth === w ? "#6366f1" : "#374151",
                  fontWeight: cardBorderWidth === w ? 700 : 400,
                  fontSize: 13, cursor: "pointer", transition: "all 0.15s",
                }}
              >{w}</button>
            ))}
          </div>
          <div style={{ fontSize: 11, color: "#6b7280", marginTop: 8 }}>현재 선택: <strong>{cardBorderWidth}</strong></div>
        </div>
        {/* 미리보기 */}
        <div>
          <label style={{ ...labelStyle, marginBottom: 8 }}>카드 미리보기</label>
          <div style={{
            background: "#f9fafb", borderRadius: 10, padding: "16px",
            border: `${cardBorderWidth} solid ${cardBorderColor}`,
            boxShadow: `0 2px 8px ${cardBorderColor}44`,
            maxWidth: 260,
          }}>
            <div style={{ width: "100%", height: 80, background: "#e5e7eb", borderRadius: 6, marginBottom: 10 }} />
            <div style={{ fontSize: 13, fontWeight: 700, color: "#111827", marginBottom: 4 }}>예시 파일 제목</div>
            <div style={{ fontSize: 11, color: "#6b7280" }}>파일 설명 텍스트가 여기에 표시됩니다</div>
          </div>
        </div>
        {/* 저장 버튼 */}
        <div style={{ display: "flex", justifyContent: "flex-end" }}>
          <Button onClick={save} disabled={updateConfig.isPending} style={{ background: "#6366f1", fontSize: 13 }}>
            <Save size={13} style={{ marginRight: 5 }} />
            {updateConfig.isPending ? "저장 중..." : "테두리 설정 저장"}
          </Button>
        </div>
      </div>
    </div>
  );
}

