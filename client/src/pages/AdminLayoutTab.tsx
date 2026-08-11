import React, { useState, useEffect, useMemo, useRef, useCallback } from "react";
import { trpc } from "@/lib/trpc";
import { toast } from "sonner";
import { CardBorderSettingsPanel } from "./AdminNavTab";
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

export function LayoutTab() {
  const utils = trpc.useUtils();
  const { data: sections, refetch } = trpc.admin.getHomeSections.useQuery();
  const updateOrder  = trpc.admin.updateHomeSections.useMutation({ onSuccess: () => { adminSave.success("섹션 순서가 저장되었습니다."); refetch(); } });
  const updateDetail = trpc.admin.updateHomeSectionDetail.useMutation({ onSuccess: () => { adminSave.success("섹션 정보가 수정되었습니다."); refetch(); } });

  // 첫화면 교체 설정
  const { data: siteConfig, refetch: refetchConfig } = trpc.admin.getSiteConfig.useQuery();
  const { data: customPages } = trpc.pages.adminList.useQuery();
  const { data: navItemsRaw } = trpc.admin.getNavItems.useQuery();
  const updateConfig = trpc.admin.updateSiteConfig.useMutation({ onSuccess: () => { adminSave.success("첫화면 설정이 저장되었습니다."); refetchConfig(); utils.admin.getSiteConfig.invalidate(); utils.admin.getHomeInitialData.invalidate(); } });
  const [homePageId, setHomePageId] = useState<string>("");
  useEffect(() => { if (siteConfig?.homePageId !== undefined) setHomePageId(siteConfig.homePageId); }, [siteConfig]);
  const saveHomePageId = () => updateConfig.mutate({ homePageId });
  // 카테고리 목록 (visible 여부 무관하게 모두 표시)
  const navCategoryOptions = useMemo(() => {
    if (!navItemsRaw) return [];
    return [...navItemsRaw]
      .sort((a, b) => (a.sortOrder ?? 0) - (b.sortOrder ?? 0))
      .filter(item => item.path && item.path.startsWith("/category/"))
      .map(item => ({ label: item.label, path: item.path }));
  }, [navItemsRaw]);

  const [localSections, setLocalSections] = useState<typeof sections>([]);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [editForm, setEditForm] = useState({ title: "", subtitle: "", categoryPath: "" });
  // 스탯 배너 칸 접기/펼치기 상태 (key: "sectionId-cardIdx", value: boolean)
  const [collapsedBannerCards, setCollapsedBannerCards] = useState<Record<string, boolean>>({});
  const toggleBannerCard = (sectionId: number, cardIdx: number) => {
    const key = `${sectionId}-${cardIdx}`;
    setCollapsedBannerCards(prev => ({ ...prev, [key]: !prev[key] }));
  };
  const isBannerCardCollapsed = (sectionId: number, cardIdx: number) => {
    const key = `${sectionId}-${cardIdx}`;
    return !!collapsedBannerCards[key];
  };

  useEffect(() => { if (sections) setLocalSections([...sections]); }, [sections]);

  const moveSection = (idx: number, dir: -1 | 1) => {
    const arr = [...(localSections || [])];
    const swapIdx = idx + dir;
    if (swapIdx < 0 || swapIdx >= arr.length) return;
    [arr[idx], arr[swapIdx]] = [arr[swapIdx], arr[idx]];
    setLocalSections(arr);
  };

  const toggleVisible = (id: number) => {
    setLocalSections(prev => prev?.map(s => s.id === id ? { ...s, visible: !s.visible } : s));
  };

  const saveOrder = () => {
    if (!localSections) return;
    window.dispatchEvent(new CustomEvent("admin-save-start"));
    updateOrder.mutate(localSections.map((s, i) => ({ id: s.id, sortOrder: i + 1, visible: s.visible ?? true })));
  };
  // 플로팅 버튼 이벤트 리스너
  React.useEffect(() => {
    const handler = () => saveOrder();
    window.addEventListener("admin-save-request", handler);
    return () => window.removeEventListener("admin-save-request", handler);
  }, [localSections]);

  const startEdit = (s: NonNullable<typeof sections>[0]) => {
    setEditingId(s.id);
    setEditForm({ title: s.title, subtitle: s.subtitle || "", categoryPath: s.categoryPath || "" });
  };

  const saveEdit = () => {
    if (!editingId) return;
    updateDetail.mutate({ id: editingId, ...editForm });
    setEditingId(null);
  };

  return (
    <div>
      {/* 안내 */}
      <div style={{ ...cardStyle, borderLeft: "4px solid #6366f1" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 6 }}>
          <Monitor size={15} color="#6366f1" />
          <span style={{ fontSize: 13, fontWeight: 700, color: "#6366f1" }}>홈 페이지 레이아웃 설계도</span>
        </div>
        <p style={{ fontSize: 12, color: "#6b7280", margin: 0 }}>
          섹션 카드를 위/아래 버튼으로 순서를 바꾸고, 눈 아이콘으로 표시/숨김을 설정합니다. 변경 후 "순서 저장" 버튼을 클릭하세요.
        </p>
      </div>

      {/* 홈 레이아웃 시각화 */}
      <div style={{ display: "grid", gridTemplateColumns: "160px 1fr 160px", gap: 12, marginBottom: 20 }}>
        {/* 왼쪽 사이드바 미리보기 */}
        <div style={{ background: "#f9fafb", border: "1px dashed #d1d5db", borderRadius: 8, padding: 12, minHeight: 400 }}>
          <div style={{ fontSize: 11, fontWeight: 700, color: "#6366f1", marginBottom: 8, textAlign: "center" }}>← 좌측 사이드바</div>
          <div style={{ fontSize: 10, color: "#9ca3af", textAlign: "center" }}>사이드바 탭에서 편집</div>
        </div>

        {/* 메인 섹션 */}
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          {(localSections || []).map((section, idx) => (
            <div key={section.id} style={{
              background: section.visible ? "#ffffff" : "#f9fafb",
              border: `1px solid ${section.visible ? "#e5e7eb" : "#f3f4f6"}`,
              borderRadius: 10, padding: "14px 16px",
              opacity: section.visible ? 1 : 0.5,
              transition: "all 0.2s",
              boxShadow: section.visible ? "0 1px 3px rgba(0,0,0,0.05)" : "none",
            }}>
              {editingId === section.id ? (
                <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                  <div style={{ display: "flex", gap: 8 }}>
                    <Input
                      value={editForm.title}
                      onChange={e => setEditForm(f => ({ ...f, title: e.target.value }))}
                      placeholder="섹션 제목"
                      style={inputStyle}
                    />
                    <Button size="sm" onClick={saveEdit} style={{ background: "#6366f1" }}><Check size={14} /></Button>
                    <Button size="sm" variant="ghost" onClick={() => setEditingId(null)}><X size={14} /></Button>
                  </div>
                  <Input
                    value={editForm.subtitle}
                    onChange={e => setEditForm(f => ({ ...f, subtitle: e.target.value }))}
                    placeholder="부제목 (선택)"
                    style={inputStyle}
                  />
                  <Input
                    value={editForm.categoryPath}
                    onChange={e => setEditForm(f => ({ ...f, categoryPath: e.target.value }))}
                    placeholder="카테고리 경로 (예: /category/ai-apps)"
                    style={inputStyle}
                  />
                </div>
              ) : (
                <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                  <div style={{
                    width: 32, height: 32, borderRadius: 8,
                    background: section.visible ? "linear-gradient(135deg, #6366f1, #8b5cf6)" : "#e5e7eb",
                    display: "flex", alignItems: "center", justifyContent: "center",
                    fontSize: 16, flexShrink: 0,
                  }}>
                    {SECTION_ICONS[section.sectionKey] || "📄"}
                  </div>

                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 13, fontWeight: 700, color: section.visible ? "#111827" : "#9ca3af" }}>{section.title}</div>
                    {section.subtitle && (
                      <div style={{ fontSize: 11, color: "#6b7280", marginTop: 2, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{section.subtitle}</div>
                    )}
                    {section.categoryPath && (
                      <div style={{ fontSize: 10, color: "#9ca3af", marginTop: 1 }}>{section.categoryPath}</div>
                    )}
                    {(section as any).sectionStyle && (
                      <div style={{ marginTop: 3 }}>
                        <span style={{
                          fontSize: 9, fontWeight: 700, padding: "1px 7px", borderRadius: 99,
                          background: (section as any).sectionStyle === "featured" ? "#ede9fe" :
                                      (section as any).sectionStyle === "overlay" ? "#fce7f3" :
                                      (section as any).sectionStyle === "list" ? "#e0f2fe" :
                                      (section as any).sectionStyle === "list2" ? "#dbeafe" :
                                      (section as any).sectionStyle === "latest" ? "#fef3c7" :
                                      (section as any).sectionStyle === "apps" ? "#dcfce7" :
                                      (section as any).sectionStyle === "download-grid" ? "#fff7ed" :
                                      (section as any).sectionStyle === "download-row" ? "#fef3c7" :
                                      (section as any).sectionStyle === "download-card" ? "#ecfdf5" : "#f3f4f6",
                          color: (section as any).sectionStyle === "featured" ? "#7c3aed" :
                                 (section as any).sectionStyle === "overlay" ? "#db2777" :
                                 (section as any).sectionStyle === "list" ? "#0284c7" :
                                 (section as any).sectionStyle === "list2" ? "#1d4ed8" :
                                 (section as any).sectionStyle === "latest" ? "#d97706" :
                                 (section as any).sectionStyle === "apps" ? "#16a34a" :
                                 (section as any).sectionStyle === "download-grid" ? "#ea580c" :
                                 (section as any).sectionStyle === "download-row" ? "#b45309" :
                                 (section as any).sectionStyle === "download-card" ? "#059669" : "#6b7280",
                        }}>{
                          (section as any).sectionStyle === "featured" ? "🖼 피처드" :
                          (section as any).sectionStyle === "overlay" ? "🎨 오버레이" :
                          (section as any).sectionStyle === "list" ? "📰 리스트" :
                          (section as any).sectionStyle === "list2" ? "📰 리스트2" :
                          (section as any).sectionStyle === "latest" ? "🕐 최신글" :
                          (section as any).sectionStyle === "apps" ? "📦 앱 목록" :
                          (section as any).sectionStyle === "download-grid" ? "⬇ 다운그리드" :
                          (section as any).sectionStyle === "download-row" ? "⬇ 다운로우" :
                          (section as any).sectionStyle === "download-card" ? "⬇ 다운카드" : "📋 그리드"
                        }</span>
                      </div>
                    )}
                  </div>

                  <div style={{ display: "flex", gap: 4, flexShrink: 0 }}>
                    <button onClick={() => moveSection(idx, -1)} disabled={idx === 0} style={{ ...btnStyle, opacity: idx === 0 ? 0.3 : 1 }} title="위로">
                      <ChevronUp size={13} />
                    </button>
                    <button onClick={() => moveSection(idx, 1)} disabled={idx === (localSections?.length ?? 0) - 1} style={{ ...btnStyle, opacity: idx === (localSections?.length ?? 0) - 1 ? 0.3 : 1 }} title="아래로">
                      <ChevronDown size={13} />
                    </button>
                    <button onClick={() => toggleVisible(section.id)} style={{ ...btnStyle, color: section.visible ? "#6366f1" : "#9ca3af" }} title={section.visible ? "숨기기" : "표시"}>
                      {section.visible ? <Eye size={13} /> : <EyeOff size={13} />}
                    </button>
                    <button onClick={() => startEdit(section)} style={btnStyle} title="편집">
                      <Edit2 size={13} />
                    </button>
                  </div>
                </div>
              )}
            </div>
          ))}
        </div>

        {/* 오른쪽 사이드바 미리보기 */}
        <div style={{ background: "#f9fafb", border: "1px dashed #d1d5db", borderRadius: 8, padding: 12, minHeight: 400 }}>
          <div style={{ fontSize: 11, fontWeight: 700, color: "#6366f1", marginBottom: 8, textAlign: "center" }}>우측 사이드바 →</div>
          <div style={{ fontSize: 10, color: "#9ca3af", textAlign: "center" }}>사이드바 탭에서 편집</div>
        </div>
      </div>

      <Button onClick={saveOrder} disabled={updateOrder.isPending} style={{ background: "linear-gradient(135deg, #6366f1, #8b5cf6)", fontSize: 13 }}>
        <Save size={14} style={{ marginRight: 6 }} />
        {updateOrder.isPending ? "저장 중..." : "섹션 순서 저장"}
      </Button>

      {/* 첫화면 교체 설정 */}
      <div style={{ ...cardStyle, borderLeft: "4px solid #10b981", marginTop: 24 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 10 }}>
          <Monitor size={15} color="#10b981" />
          <span style={{ fontSize: 13, fontWeight: 700, color: "#10b981" }}>첫화면 교체 설정</span>
        </div>
        <p style={{ fontSize: 12, color: "#6b7280", margin: "0 0 12px" }}>
          특정 커스텀 페이지 또는 카테고리 페이지를 첫화면(/)으로 설정할 수 있습니다. 기본 홈 선택 시 현재의 세션 기반 홈 화면이 표시됩니다.
        </p>
        <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
          <select
            value={homePageId}
            onChange={e => setHomePageId(e.target.value)}
            style={{ flex: 1, padding: "7px 10px", border: "1px solid #d1d5db", borderRadius: 6, fontSize: 13, color: "#374151", background: "#fff" }}
          >
            <option value="">기본 홈 (세션 기반 홈 화면)</option>
            {/* 카테고리 그룹 */}
            {navCategoryOptions.length > 0 && (
              <optgroup label="── 카테고리 페이지 ──">
                {navCategoryOptions.map(cat => (
                  <option key={cat.path} value={`category:${cat.path}`}>
                    {cat.label} ({cat.path})
                  </option>
                ))}
              </optgroup>
            )}
            {/* 커스텀 페이지 그룹 */}
            {(customPages || []).filter(p => p.published).length > 0 && (
              <optgroup label="── 커스텀 페이지 ──">
                {(customPages || []).filter(p => p.published).map(p => (
                  <option key={p.id} value={String(p.id)}>{p.title} (/{p.slug})</option>
                ))}
              </optgroup>
            )}
          </select>
          <Button onClick={saveHomePageId} disabled={updateConfig.isPending} style={{ background: "#10b981", fontSize: 12, whiteSpace: "nowrap" }}>
            <Save size={13} style={{ marginRight: 5 }} />
            {updateConfig.isPending ? "저장 중..." : "첫화면 저장"}
          </Button>
        </div>
        {homePageId && (
          <div style={{ marginTop: 8, fontSize: 11, color: "#059669", display: "flex", alignItems: "center", gap: 5 }}>
            <Globe size={11} />
            {homePageId.startsWith("category:")
              ? `선택된 카테고리 페이지(${homePageId.replace("category:", "")})가 첫화면으로 표시됩니다.`
              : "선택된 커스텀 페이지가 첫화면으로 표시됩니다. 페이지 관리에서 해당 페이지를 수정하세요."
            }
          </div>
        )}
      </div>

      {/* ─── 다운로드 카드 테두리 설정 ─── */}
      <CardBorderSettingsPanel />
    </div>
  );
}

