import React, { useState } from "react";
import { trpc } from "@/lib/trpc";
import { toast } from "sonner";
import {
  adminSave, btnStyle, inputStyle, labelStyle, selectStyle, cardStyle,
  EMPTY_SIDEBAR_ITEM, type SidebarItemForm, type MenuLinkItem,
  serializeMenuLinks, parseMenuLinks,
} from "./adminShared";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Eye, EyeOff, Plus, Trash2, Edit2, Save, ExternalLink,
  GripVertical, Link2, ChevronDown, ChevronUp,
} from "lucide-react";

// 빈 메뉴 링크 항목
const EMPTY_MENU_LINK: MenuLinkItem = { label: "", url: "", icon: "", badge: "", description: "" };

export function SidebarTab() {
  const { data: items, refetch } = trpc.admin.getSidebarItems.useQuery();
  const createItem = trpc.admin.createSidebarItem.useMutation({
    onSuccess: () => {
      adminSave.success("항목이 추가되었습니다.");
      refetch();
      setShowForm(false);
      setForm({ ...EMPTY_SIDEBAR_ITEM });
      setMenuLinks([]);
    },
    onError: (err) => adminSave.error(`저장 실패: ${err.message}`),
  });
  const updateItem = trpc.admin.updateSidebarItem.useMutation({
    onSuccess: () => {
      adminSave.success("항목이 수정되었습니다.");
      refetch();
      setEditingId(null);
      setShowForm(false);
      setMenuLinks([]);
    },
    onError: (err) => adminSave.error(`수정 실패: ${err.message}`),
  });
  const deleteItem = trpc.admin.deleteSidebarItem.useMutation({
    onSuccess: () => {
      adminSave.success("항목이 삭제되었습니다.");
      setDeleteConfirm(null);
      refetch();
    },
    onError: (err) => {
      adminSave.error(`삭제 실패: ${err.message}`);
      setDeleteConfirm(null);
    },
  });

  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [form, setForm] = useState<SidebarItemForm>({ ...EMPTY_SIDEBAR_ITEM });
  const [activeSide, setActiveSide] = useState<"left" | "right">("left");
  // link 타입 전용: 여러 메뉴 링크 관리
  const [menuLinks, setMenuLinks] = useState<MenuLinkItem[]>([]);
  // 삭제 확인 다이얼로그
  const [deleteConfirm, setDeleteConfirm] = useState<{ id: number; title: string } | null>(null);

  const leftItems  = (items || []).filter(i => i.side === "left");
  const rightItems = (items || []).filter(i => i.side === "right");
  const displayItems = activeSide === "left" ? leftItems : rightItems;

  const handleSubmit = () => {
    // link 타입은 제목이 선택사항 (없어도 저장 가능)
    if (form.itemType !== "link" && !form.title.trim()) { adminSave.error("제목을 입력해주세요."); return; }
    if (form.itemType === "link" && menuLinks.length === 0) {
      adminSave.error("메뉴 링크를 1개 이상 추가해주세요."); return;
    }
    if (form.itemType === "link" && menuLinks.some(l => !l.label.trim() || !l.url.trim())) {
      adminSave.error("모든 메뉴 링크의 이름과 URL을 입력해주세요."); return;
    }

    // link 타입은 menuLinks를 JSON으로 htmlCode에 저장
    const finalForm = form.itemType === "link"
      ? { ...form, htmlCode: serializeMenuLinks(menuLinks) }
      : form;

    if (editingId) {
      updateItem.mutate({ id: editingId, ...finalForm });
    } else {
      createItem.mutate({ ...finalForm, side: activeSide });
    }
  };

  const startEdit = (item: NonNullable<typeof items>[0]) => {
    setEditingId(item.id);
    const parsedLinks = item.itemType === "link" ? parseMenuLinks(item.htmlCode) : [];
    setMenuLinks(parsedLinks.length > 0 ? parsedLinks : [{ ...EMPTY_MENU_LINK }]);
    setForm({
      id: item.id, side: item.side, itemType: item.itemType,
      title: item.title, description: item.description || "",
      url: item.url || "", bgColor: item.bgColor || "#ede9fe",
      textColor: item.textColor || "#ffffff", btnText: item.btnText || "",
      btnColor: item.btnColor || "#6366f1", badge: item.badge || "",
      price: item.price || "", htmlCode: item.htmlCode || "", sortOrder: item.sortOrder, visible: item.visible,
      // 메뉴 스타일 옵션 (DB에서 로드)
      menuStyle: (item as any).menuStyle || "default",
      menuFontWeight: (item as any).menuFontWeight || "normal",
      menuBgColor: (item as any).menuBgColor || "",
      menuBorderRadius: (item as any).menuBorderRadius ?? 8,
      menuFontSize: (item as any).menuFontSize ?? 12,
      menuHeaderHidden: (item as any).menuHeaderHidden ?? false,
    });
    setShowForm(true);
  };

  const addMenuLink = () => setMenuLinks(prev => [...prev, { ...EMPTY_MENU_LINK }]);
  const removeMenuLink = (idx: number) => setMenuLinks(prev => prev.filter((_, i) => i !== idx));
  const updateMenuLink = (idx: number, field: keyof MenuLinkItem, value: string) => {
    setMenuLinks(prev => prev.map((l, i) => i === idx ? { ...l, [field]: value } : l));
  };
  const moveMenuLink = (idx: number, dir: -1 | 1) => {
    setMenuLinks(prev => {
      const arr = [...prev];
      const target = idx + dir;
      if (target < 0 || target >= arr.length) return arr;
      [arr[idx], arr[target]] = [arr[target], arr[idx]];
      return arr;
    });
  };

  const getItemTypeLabel = (type: string) => {
    if (type === "ad") return "광고배너";
    if (type === "html-ad") return "HTML광고";
    if (type === "link") return "메뉴";
    return "슬롯";
  };

  // 미리보기용 스타일 계산
  const getMenuLinkPreviewStyle = () => {
    const fw = form.menuFontWeight === "extrabold" ? 900 : form.menuFontWeight === "bold" ? 700 : 500;
    const fs = form.menuFontSize || 12;
    const br = form.menuBorderRadius ?? 8;
    const bg = form.menuBgColor || "transparent";
    return { fw, fs, br, bg };
  };

  return (
    <div>
      {/* 좌/우 사이드바 선택 */}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, marginBottom: 20 }}>
        {(["left", "right"] as const).map(side => (
          <button
            key={side}
            onClick={() => { setActiveSide(side); setShowForm(false); setEditingId(null); }}
            style={{
              padding: "16px", borderRadius: 10,
              border: `2px solid ${activeSide === side ? "#6366f1" : "#e5e7eb"}`,
              background: activeSide === side ? "rgba(99,102,241,0.06)" : "#ffffff",
              cursor: "pointer", transition: "all 0.15s",
            }}
          >
            <div style={{ display: "flex", gap: 8, alignItems: "flex-start" }}>
              <div style={{ fontSize: 20 }}>{side === "left" ? "◀" : "▶"}</div>
              <div style={{ textAlign: "left" }}>
                <div style={{ fontSize: 13, fontWeight: 700, color: activeSide === side ? "#6366f1" : "#374151" }}>
                  {side === "left" ? "좌측 사이드바" : "우측 사이드바"}
                </div>
                <div style={{ fontSize: 11, color: "#6b7280", marginTop: 2 }}>
                  {side === "left" ? leftItems.length : rightItems.length}개 항목
                </div>
              </div>
            </div>
          </button>
        ))}
      </div>

      {/* 레이아웃 미리보기 미니맵 */}
      <div style={{ ...cardStyle }}>
        <div style={{ fontSize: 12, color: "#6366f1", fontWeight: 700, marginBottom: 10 }}>
          📐 레이아웃 미리보기 ({activeSide === "left" ? "좌측" : "우측"} 사이드바 편집 중)
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "80px 1fr 80px", gap: 6, height: 120 }}>
          <div style={{
            borderRadius: 6, border: `2px solid ${activeSide === "left" ? "#6366f1" : "#e5e7eb"}`,
            background: activeSide === "left" ? "rgba(99,102,241,0.08)" : "#f9fafb",
            display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 4,
          }}>
            {(activeSide === "left" ? leftItems : []).slice(0, 3).map((_, i) => (
              <div key={i} style={{ width: "80%", height: 16, background: "#e5e7eb", borderRadius: 3 }} />
            ))}
            {(activeSide === "left" ? leftItems : []).length === 0 && (
              <div style={{ fontSize: 9, color: "#9ca3af" }}>비어있음</div>
            )}
          </div>
          <div style={{ background: "#f9fafb", borderRadius: 6, border: "1px solid #e5e7eb", display: "flex", alignItems: "center", justifyContent: "center" }}>
            <span style={{ fontSize: 11, color: "#6b7280" }}>메인 콘텐츠</span>
          </div>
          <div style={{
            borderRadius: 6, border: `2px solid ${activeSide === "right" ? "#6366f1" : "#e5e7eb"}`,
            background: activeSide === "right" ? "rgba(99,102,241,0.08)" : "#f9fafb",
            display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 4,
          }}>
            {(activeSide === "right" ? rightItems : []).slice(0, 3).map((_, i) => (
              <div key={i} style={{ width: "80%", height: 16, background: "#e5e7eb", borderRadius: 3 }} />
            ))}
            {(activeSide === "right" ? rightItems : []).length === 0 && (
              <div style={{ fontSize: 9, color: "#9ca3af" }}>비어있음</div>
            )}
          </div>
        </div>
      </div>

      {/* 항목 목록 */}
      <div style={{ display: "flex", flexDirection: "column", gap: 8, marginBottom: 16 }}>
        {displayItems.map(item => (
          <div key={item.id} style={{
            background: "#ffffff", border: "1px solid #e5e7eb", borderRadius: 8, padding: "12px 14px",
            display: "flex", alignItems: "center", gap: 10, opacity: item.visible ? 1 : 0.5,
            boxShadow: "0 1px 2px rgba(0,0,0,0.04)",
          }}>
            <div style={{
              width: 36, height: 36, borderRadius: 6, flexShrink: 0,
              background: item.itemType === "link" ? "#f0fdf4" : (item.bgColor || "#ede9fe"),
              border: item.itemType === "link" ? "1px solid #bbf7d0" : "none",
              display: "flex", alignItems: "center", justifyContent: "center",
              fontSize: 10, color: item.itemType === "link" ? "#16a34a" : (item.textColor || "#fff"), fontWeight: 700,
            }}>
              {item.itemType === "link" ? <Link2 size={14} /> : getItemTypeLabel(item.itemType)}
            </div>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontSize: 13, fontWeight: 600, color: "#111827", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                {item.title || <span style={{ color: "#9ca3af", fontStyle: "italic" }}>(제목 없음)</span>}
                {item.itemType === "link" && (
                  <span style={{ marginLeft: 6, fontSize: 9, background: "#dcfce7", color: "#16a34a", padding: "1px 5px", borderRadius: 3, fontWeight: 700 }}>
                    메뉴 {parseMenuLinks(item.htmlCode).length}개
                  </span>
                )}
              </div>
              {item.description && (
                <div style={{ fontSize: 11, color: "#6b7280", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{item.description}</div>
              )}
              <div style={{ fontSize: 10, color: "#9ca3af" }}>순서: {item.sortOrder} · {item.visible ? "표시" : "숨김"}</div>
            </div>
            <div style={{ display: "flex", gap: 4, flexShrink: 0 }}>
              <button onClick={() => startEdit(item)} style={btnStyle} title="편집"><Edit2 size={13} /></button>
              <button onClick={() => updateItem.mutate({ id: item.id, visible: !item.visible })} style={{ ...btnStyle, color: item.visible ? "#6366f1" : "#9ca3af" }} title={item.visible ? "숨기기" : "표시"}>
                {item.visible ? <Eye size={13} /> : <EyeOff size={13} />}
              </button>
              <button onClick={() => setDeleteConfirm({ id: item.id, title: item.title || '이 항목' })} style={{ ...btnStyle, color: "#ef4444" }} title="삭제">
                <Trash2 size={13} />
              </button>
            </div>
          </div>
        ))}
        {displayItems.length === 0 && (
          <div style={{ textAlign: "center", padding: "32px", color: "#9ca3af", fontSize: 13, background: "#ffffff", borderRadius: 8, border: "1px dashed #e5e7eb" }}>
            {activeSide === "left" ? "좌측" : "우측"} 사이드바에 항목이 없습니다.
          </div>
        )}
      </div>

      {!showForm && (
        <Button
          onClick={() => {
            setShowForm(true); setEditingId(null);
            setForm({ ...EMPTY_SIDEBAR_ITEM, side: activeSide });
            setMenuLinks([{ ...EMPTY_MENU_LINK }]);
          }}
          style={{ background: "linear-gradient(135deg, #6366f1, #8b5cf6)", fontSize: 13 }}
        >
          <Plus size={14} style={{ marginRight: 6 }} />새 메뉴 추가
        </Button>
      )}

      {showForm && (
        <div style={{ background: "#ffffff", border: "1px solid #e5e7eb", borderRadius: 10, padding: 20, marginTop: 12, boxShadow: "0 2px 8px rgba(0,0,0,0.06)" }}>
          <div style={{ fontSize: 14, fontWeight: 700, color: "#6366f1", marginBottom: 16 }}>
            {editingId ? "✏️ 메뉴 편집" : `➕ ${activeSide === "left" ? "좌측" : "우측"} 사이드바 새 메뉴 추가`}
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
            <div>
              <label style={labelStyle}>유형</label>
              <select
                value={form.itemType}
                onChange={e => {
                  const t = e.target.value as SidebarItemForm["itemType"];
                  setForm(f => ({ ...f, itemType: t }));
                  if (t === "link" && menuLinks.length === 0) setMenuLinks([{ ...EMPTY_MENU_LINK }]);
                }}
                style={selectStyle}
              >
                <option value="ad">광고 배너 (커스텀 디자인)</option>
                <option value="html-ad">HTML 광고 코드 (애드센스/쿠팡)</option>
                <option value="link">메뉴 추가</option>
                <option value="slot">광고 슬롯</option>
              </select>
            </div>
            <div>
              <label style={labelStyle}>표시 순서</label>
              <Input type="number" value={form.sortOrder} onChange={e => setForm(f => ({ ...f, sortOrder: Number(e.target.value) }))} style={inputStyle} />
            </div>
            <div style={{ gridColumn: "1 / -1" }}>
              <label style={labelStyle}>{form.itemType === "html-ad" ? "광고 이름 (관리용) *" : form.itemType === "link" ? "메뉴 섹션 제목 (선택사항)" : "제목 *"}</label>
              <Input
                value={form.title}
                onChange={e => setForm(f => ({ ...f, title: e.target.value }))}
                placeholder={form.itemType === "link" ? "예: 카테고리, 유용한 링크, 추천 사이트 (비워두면 헤더 숨김)" : form.itemType === "html-ad" ? "예: 애드센스 상단 배너" : "항목 제목"}
                style={inputStyle}
              />
            </div>

            {/* 메뉴 추가 타입 전용 UI */}
            {form.itemType === "link" && (
              <>
                {/* ── 메뉴 스타일 옵션 ── */}
                <div style={{ gridColumn: "1 / -1", background: "#f8faff", border: "1px solid #e0e7ff", borderRadius: 8, padding: "14px 16px" }}>
                  <div style={{ fontSize: 12, fontWeight: 700, color: "#6366f1", marginBottom: 12 }}>🎨 메뉴 스타일 옵션</div>
                  <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 10 }}>
                    {/* 메뉴 스타일 프리셋 10종 */}
                    <div style={{ gridColumn: "1 / -1" }}>
                      <label style={labelStyle}>메뉴 스타일 (10종)</label>
                      <div style={{ display: "grid", gridTemplateColumns: "repeat(5, 1fr)", gap: 6 }}>
                        {([
                          { value: "default",     label: "기본형",     desc: "텍스트 목록",   icon: "☰" },
                          { value: "button",      label: "버튼형",     desc: "채워진 버튼",   icon: "▬" },
                          { value: "pill",        label: "알약형",     desc: "둥근 태그",    icon: "⬭" },
                          { value: "underline",   label: "밑줄형",     desc: "호버 밑줄",    icon: "_" },
                          { value: "card",        label: "카드형",     desc: "테두리 카드",   icon: "▭" },
                          { value: "indent",      label: "들여쓰기형", desc: "좌측 강조",    icon: "≡" },
                          { value: "neon",        label: "네온형",     desc: "글로우 효과",   icon: "✦" },
                          { value: "glass",       label: "유리형",     desc: "반투명 블러",   icon: "◈" },
                          { value: "floating",    label: "플로팅형",   desc: "떠오르는 카드", icon: "◻" },
                          { value: "bold-border", label: "굵은보더형", desc: "좌측 굵은선",   icon: "▏" },
                        ] as const).map(opt => (
                          <button
                            key={opt.value}
                            type="button"
                            onClick={() => setForm(f => ({ ...f, menuStyle: opt.value }))}
                            style={{
                              padding: "8px 4px",
                              borderRadius: 7,
                              border: `2px solid ${form.menuStyle === opt.value ? "#6366f1" : "#e5e7eb"}`,
                              background: form.menuStyle === opt.value ? "rgba(99,102,241,0.08)" : "#ffffff",
                              cursor: "pointer",
                              transition: "all 0.15s",
                              textAlign: "center" as const,
                            }}
                          >
                            <div style={{ fontSize: 16, marginBottom: 2 }}>{opt.icon}</div>
                            <div style={{ fontSize: 10, fontWeight: 700, color: form.menuStyle === opt.value ? "#6366f1" : "#374151" }}>{opt.label}</div>
                            <div style={{ fontSize: 9, color: "#9ca3af", marginTop: 1 }}>{opt.desc}</div>
                          </button>
                        ))}
                      </div>
                    </div>
                    {/* 글자 굵기 */}
                    <div>
                      <label style={labelStyle}>글자 굵기</label>
                      <select
                        value={form.menuFontWeight}
                        onChange={e => setForm(f => ({ ...f, menuFontWeight: e.target.value as SidebarItemForm["menuFontWeight"] }))}
                        style={selectStyle}
                      >
                        <option value="normal">보통 (400)</option>
                        <option value="bold">굵게 (700)</option>
                        <option value="extrabold">매우 굵게 (900)</option>
                      </select>
                    </div>
                    {/* 글자 크기 */}
                    <div>
                      <label style={labelStyle}>글자 크기 (px)</label>
                      <Input
                        type="number"
                        min={10} max={18}
                        value={form.menuFontSize}
                        onChange={e => setForm(f => ({ ...f, menuFontSize: Number(e.target.value) }))}
                        style={inputStyle}
                      />
                    </div>
                    {/* 배경색 */}
                    <div>
                      <label style={labelStyle}>메뉴 배경색</label>
                      <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
                        <input
                          type="color"
                          value={form.menuBgColor || "#f5f3ff"}
                          onChange={e => setForm(f => ({ ...f, menuBgColor: e.target.value }))}
                          style={{ width: 36, height: 32, borderRadius: 5, border: "none", cursor: "pointer" }}
                        />
                        <Input
                          value={form.menuBgColor}
                          onChange={e => setForm(f => ({ ...f, menuBgColor: e.target.value }))}
                          placeholder="없음"
                          style={{ ...inputStyle, flex: 1 }}
                        />
                        {form.menuBgColor && (
                          <button onClick={() => setForm(f => ({ ...f, menuBgColor: "" }))} style={{ ...btnStyle, color: "#ef4444" }} title="배경색 제거">✕</button>
                        )}
                      </div>
                    </div>
                    {/* 메뉴 텍스트 색상 */}
                    <div>
                      <label style={labelStyle}>메뉴 글자 색상</label>
                      <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
                        <input
                          type="color"
                          value={form.textColor || "#1f2937"}
                          onChange={e => setForm(f => ({ ...f, textColor: e.target.value }))}
                          style={{ width: 36, height: 32, borderRadius: 5, border: "none", cursor: "pointer" }}
                        />
                        <Input
                          value={form.textColor || ""}
                          onChange={e => setForm(f => ({ ...f, textColor: e.target.value }))}
                          placeholder="기본값 (#1f2937)"
                          style={{ ...inputStyle, flex: 1 }}
                        />
                        {form.textColor && (
                          <button onClick={() => setForm(f => ({ ...f, textColor: "" }))} style={{ ...btnStyle, color: "#ef4444" }} title="색상 초기화">✕</button>
                        )}
                      </div>
                      <div style={{ fontSize: 10, color: "#9ca3af", marginTop: 3 }}>버튼형 기본: #ffffff, 일반형 기본: #1f2937</div>
                    </div>
                    {/* 둥근 모서리 */}
                    <div>
                      <label style={labelStyle}>둥근 모서리 (px)</label>
                      <Input
                        type="number"
                        min={0} max={24}
                        value={form.menuBorderRadius}
                        onChange={e => setForm(f => ({ ...f, menuBorderRadius: Number(e.target.value) }))}
                        style={inputStyle}
                      />
                    </div>
                    {/* 헤더 숨기기 */}
                    <div style={{ display: "flex", flexDirection: "column", justifyContent: "flex-end" }}>
                      <label style={labelStyle}>헤더 숨기기</label>
                      <label style={{ display: "flex", alignItems: "center", gap: 8, cursor: "pointer", fontSize: 13, color: "#374151" }}>
                        <input
                          type="checkbox"
                          checked={form.menuHeaderHidden}
                          onChange={e => setForm(f => ({ ...f, menuHeaderHidden: e.target.checked }))}
                          style={{ width: 16, height: 16, cursor: "pointer" }}
                        />
                        섹션 제목 숨기기
                      </label>
                    </div>
                  </div>
                </div>

                {/* 메뉴 링크 목록 */}
                <div style={{ gridColumn: "1 / -1" }}>
                  <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 10 }}>
                    <label style={{ ...labelStyle, marginBottom: 0 }}>메뉴 링크 목록 *</label>
                    <button
                      onClick={addMenuLink}
                      style={{
                        display: "flex", alignItems: "center", gap: 4,
                        background: "linear-gradient(135deg, #10b981, #059669)",
                        color: "#fff", border: "none", borderRadius: 6,
                        padding: "6px 12px", fontSize: 12, fontWeight: 700, cursor: "pointer",
                      }}
                    >
                      <Plus size={13} /> 메뉴 항목 추가하기
                    </button>
                  </div>

                  <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                    {menuLinks.map((link, idx) => (
                      <div key={idx} style={{
                        background: "#f9fafb", border: "1px solid #e5e7eb", borderRadius: 8,
                        padding: "12px 14px", position: "relative",
                      }}>
                        {/* 순서 이동 + 삭제 버튼 */}
                        <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 10 }}>
                          <div style={{ display: "flex", gap: 3 }}>
                            <button onClick={() => moveMenuLink(idx, -1)} disabled={idx === 0} style={{ ...btnStyle, opacity: idx === 0 ? 0.3 : 1 }} title="위로">
                              <ChevronUp size={12} />
                            </button>
                            <button onClick={() => moveMenuLink(idx, 1)} disabled={idx === menuLinks.length - 1} style={{ ...btnStyle, opacity: idx === menuLinks.length - 1 ? 0.3 : 1 }} title="아래로">
                              <ChevronDown size={12} />
                            </button>
                          </div>
                          <span style={{ fontSize: 11, color: "#6b7280", fontWeight: 600 }}>링크 {idx + 1}</span>
                          <button
                            onClick={() => removeMenuLink(idx)}
                            style={{ ...btnStyle, color: "#ef4444", marginLeft: "auto" }}
                            title="삭제"
                          >
                            <Trash2 size={12} />
                          </button>
                        </div>

                        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
                          <div>
                            <label style={labelStyle}>메뉴 이름 *</label>
                            <Input
                              value={link.label}
                              onChange={e => updateMenuLink(idx, "label", e.target.value)}
                              placeholder="예: AI 앱 만들기"
                              style={inputStyle}
                            />
                          </div>
                          <div>
                            <label style={labelStyle}>URL *</label>
                            <Input
                              value={link.url}
                              onChange={e => updateMenuLink(idx, "url", e.target.value)}
                              placeholder="예: /category/ai-apps"
                              style={inputStyle}
                            />
                          </div>
                          <div>
                            <label style={labelStyle}>아이콘 (이모지)</label>
                            <Input
                              value={link.icon || ""}
                              onChange={e => updateMenuLink(idx, "icon", e.target.value)}
                              placeholder="예: 🤖 ⚡ 📦 🛠️"
                              style={inputStyle}
                            />
                          </div>
                          <div>
                            <label style={labelStyle}>뱃지 (선택)</label>
                            <Input
                              value={link.badge || ""}
                              onChange={e => updateMenuLink(idx, "badge", e.target.value)}
                              placeholder="예: HOT, NEW, FREE"
                              style={inputStyle}
                            />
                          </div>
                          <div style={{ gridColumn: "1 / -1" }}>
                            <label style={labelStyle}>설명 (선택)</label>
                            <Input
                              value={link.description || ""}
                              onChange={e => updateMenuLink(idx, "description", e.target.value)}
                              placeholder="예: 코딩 없이 AI 자동화 앱 만들기"
                              style={inputStyle}
                            />
                          </div>
                        </div>
                      </div>
                    ))}

                    {menuLinks.length === 0 && (
                      <div style={{ textAlign: "center", padding: "20px", color: "#9ca3af", fontSize: 12, background: "#fff", borderRadius: 8, border: "1px dashed #e5e7eb" }}>
                        위의 "링크 추가" 버튼을 눌러 메뉴 항목을 추가하세요.
                      </div>
                    )}
                  </div>

                  {/* 미리보기 */}
                  {menuLinks.some(l => l.label) && (() => {
                    const { fw, fs, br, bg } = getMenuLinkPreviewStyle();
                    const ms = form.menuStyle;
                    const tc = form.textColor || (ms === "button" ? "#ffffff" : ms === "neon" ? "#c4b5fd" : "#1f2937");
                    // 스타일별 컨테이너 배경
                    const containerBg = ms === "neon" ? "#0d0d1a"
                      : ms === "glass" ? "rgba(255,255,255,0.65)"
                      : "#ffffff";
                    const containerBorder = ms === "neon" ? "1px solid #6366f1"
                      : ms === "bold-border" ? `1px solid #e5e7eb`
                      : "1px solid #e5e7eb";
                    const containerBorderLeft = ms === "bold-border" ? "4px solid #6366f1" : undefined;
                    const containerShadow = ms === "floating" ? "0 8px 24px rgba(0,0,0,0.12)" : "none";
                    // 헤더 배경
                    const headerBg = ms === "neon" ? "#1a1a3e"
                      : ms === "glass" ? "rgba(99,102,241,0.12)"
                      : ms === "card" ? "#f9fafb"
                      : ms === "bold-border" ? "rgba(99,102,241,0.06)"
                      : "linear-gradient(135deg, #6366f1, #8b5cf6)";
                    const headerTc = ms === "card" ? "#374151" : ms === "glass" ? "#4338ca" : ms === "bold-border" ? "#6366f1" : "#fff";
                    // 내부 패딩
                    const innerPad = (ms === "button" || ms === "pill" || ms === "card" || ms === "floating") ? "8px" : "4px 0";
                    return (
                      <div style={{ marginTop: 16 }}>
                        <div style={{ fontSize: 11, color: "#6b7280", marginBottom: 8, fontWeight: 600 }}>📱 사이드바 미리보기 ({ms}):</div>
                        <div style={{
                          background: containerBg,
                          border: containerBorder,
                          borderLeft: containerBorderLeft,
                          borderRadius: br,
                          overflow: "hidden",
                          maxWidth: 180,
                          boxShadow: containerShadow,
                        }}>
                          {!form.menuHeaderHidden && (
                            <div style={{
                              background: headerBg,
                              padding: "8px 12px", fontSize: 11, fontWeight: 700, color: headerTc,
                              display: "flex", alignItems: "center", gap: 6,
                              borderBottom: ms === "neon" ? "1px solid #6366f1" : ms === "card" ? "2px solid #e5e7eb" : "none",
                            }}>
                              <span style={{ fontSize: 14 }}>📋</span>
                              {form.title || "메뉴"}
                            </div>
                          )}
                          <div style={{ padding: innerPad }}>
                            {menuLinks.filter(l => l.label).map((link, i) => {
                              const isLast = i === menuLinks.filter(l => l.label).length - 1;
                              // 스타일별 아이템 렌더
                              if (ms === "button") return (
                                <div key={i} style={{ margin: "3px 0", padding: "6px 10px", background: bg || "#6366f1", borderRadius: br, display: "flex", alignItems: "center", gap: 6 }}>
                                  {link.icon && <span style={{ fontSize: 13 }}>{link.icon}</span>}
                                  <span style={{ fontSize: fs, fontWeight: fw, color: tc, flex: 1 }}>{link.label}</span>
                                </div>
                              );
                              if (ms === "pill") return (
                                <div key={i} style={{ margin: "3px 0", padding: "5px 12px", background: bg || "#f0f0ff", borderRadius: 20, display: "flex", alignItems: "center", gap: 6 }}>
                                  {link.icon && <span style={{ fontSize: 13 }}>{link.icon}</span>}
                                  <span style={{ fontSize: fs, fontWeight: fw, color: tc, flex: 1 }}>{link.label}</span>
                                </div>
                              );
                              if (ms === "card") return (
                                <div key={i} style={{ margin: "4px 6px", padding: "7px 10px", background: bg || "#f9fafb", border: "1px solid #e5e7eb", borderRadius: Math.max(br - 2, 4), display: "flex", alignItems: "center", gap: 6 }}>
                                  {link.icon && <span style={{ fontSize: 13 }}>{link.icon}</span>}
                                  <span style={{ fontSize: fs, fontWeight: fw, color: tc, flex: 1 }}>{link.label}</span>
                                </div>
                              );
                              if (ms === "floating") return (
                                <div key={i} style={{ margin: "4px 6px", padding: "7px 10px", background: bg || "#ffffff", border: "1px solid #f3f4f6", borderRadius: Math.max(br - 2, 4), display: "flex", alignItems: "center", gap: 6, boxShadow: "0 2px 6px rgba(0,0,0,0.06)" }}>
                                  {link.icon && <span style={{ fontSize: 13 }}>{link.icon}</span>}
                                  <span style={{ fontSize: fs, fontWeight: fw, color: tc, flex: 1 }}>{link.label}</span>
                                </div>
                              );
                              if (ms === "neon") return (
                                <div key={i} style={{ padding: "7px 12px", borderBottom: !isLast ? "1px solid rgba(99,102,241,0.2)" : "none", display: "flex", alignItems: "center", gap: 6 }}>
                                  {link.icon && <span style={{ fontSize: 13 }}>{link.icon}</span>}
                                  <span style={{ fontSize: fs, fontWeight: fw, color: tc, flex: 1 }}>{link.label}</span>
                                </div>
                              );
                              if (ms === "glass") return (
                                <div key={i} style={{ margin: "3px 5px", padding: "6px 10px", background: bg || "rgba(255,255,255,0.4)", border: "1px solid rgba(255,255,255,0.7)", borderRadius: Math.max(br - 2, 4), display: "flex", alignItems: "center", gap: 6 }}>
                                  {link.icon && <span style={{ fontSize: 13 }}>{link.icon}</span>}
                                  <span style={{ fontSize: fs, fontWeight: fw, color: tc, flex: 1 }}>{link.label}</span>
                                </div>
                              );
                              if (ms === "indent") return (
                                <div key={i} style={{ padding: "7px 12px 7px 18px", borderBottom: !isLast ? "1px solid #f3f4f6" : "none", display: "flex", alignItems: "center", gap: 6 }}>
                                  {link.icon ? <span style={{ fontSize: 13 }}>{link.icon}</span> : <span style={{ fontSize: 10, color: "#a5b4fc" }}>▸</span>}
                                  <span style={{ fontSize: fs, fontWeight: fw, color: tc, flex: 1 }}>{link.label}</span>
                                </div>
                              );
                              if (ms === "bold-border") return (
                                <div key={i} style={{ padding: "7px 12px 7px 14px", borderBottom: !isLast ? "1px solid #f3f4f6" : "none", borderLeft: "3px solid transparent", display: "flex", alignItems: "center", gap: 6 }}>
                                  {link.icon && <span style={{ fontSize: 13 }}>{link.icon}</span>}
                                  <span style={{ fontSize: fs, fontWeight: fw, color: tc, flex: 1 }}>{link.label}</span>
                                  <span style={{ fontSize: 10, color: "#c4b5fd" }}>›</span>
                                </div>
                              );
                              // default / underline
                              return (
                                <div key={i} style={{ padding: "7px 12px", borderBottom: !isLast ? "1px solid #f3f4f6" : "none", display: "flex", alignItems: "center", gap: 6, background: bg || "transparent" }}>
                                  {link.icon ? <span style={{ fontSize: 13 }}>{link.icon}</span> : <span style={{ width: 5, height: 5, borderRadius: "50%", background: "#c4b5fd", flexShrink: 0, display: "inline-block" }} />}
                                  <span style={{ fontSize: fs, fontWeight: fw, color: tc, flex: 1 }}>{link.label}</span>
                                  <span style={{ fontSize: 10, color: "#c4b5fd" }}>›</span>
                                </div>
                              );
                            })}
                          </div>
                        </div>
                      </div>
                    );
                  })()}
                </div>
              </>
            )}

            {/* HTML 광고 코드 타입 */}
            {form.itemType === "html-ad" && (
              <div style={{ gridColumn: "1 / -1" }}>
                <label style={labelStyle}>HTML 광고 코드 *</label>
                <div style={{ fontSize: 11, color: "#6b7280", marginBottom: 6 }}>
                  애드센스, 쿠팡 파트너스 등의 광고 코드를 붙여넣으세요.
                </div>
                <textarea
                  value={form.htmlCode}
                  onChange={e => setForm(f => ({ ...f, htmlCode: e.target.value }))}
                  placeholder={`<!-- 애드센스 코드 -->\n<ins class="adsbygoogle"\n  style="display:block"\n  data-ad-client="ca-pub-XXXXXXXX"\n  data-ad-slot="XXXXXXXX"\n  data-ad-format="auto">\n</ins>`}
                  rows={8}
                  style={{
                    ...inputStyle, width: "100%", resize: "vertical",
                    fontFamily: "'Fira Code', 'Consolas', monospace",
                    fontSize: 12, lineHeight: 1.6, padding: "10px 12px",
                  }}
                />
              </div>
            )}

            {/* 광고 배너 타입 */}
            {form.itemType !== "html-ad" && form.itemType !== "link" && (
              <>
                <div style={{ gridColumn: "1 / -1" }}>
                  <label style={labelStyle}>설명</label>
                  <Input value={form.description} onChange={e => setForm(f => ({ ...f, description: e.target.value }))} placeholder="설명 텍스트" style={inputStyle} />
                </div>
                <div style={{ gridColumn: "1 / -1" }}>
                  <label style={labelStyle}>링크 URL</label>
                  <Input value={form.url} onChange={e => setForm(f => ({ ...f, url: e.target.value }))} placeholder="https://..." style={inputStyle} />
                </div>
              </>
            )}
            {form.itemType === "ad" && (
              <>
                <div>
                  <label style={labelStyle}>배경 색상</label>
                  <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                    <input type="color" value={form.bgColor} onChange={e => setForm(f => ({ ...f, bgColor: e.target.value }))} style={{ width: 40, height: 36, borderRadius: 6, border: "none", cursor: "pointer" }} />
                    <Input value={form.bgColor} onChange={e => setForm(f => ({ ...f, bgColor: e.target.value }))} style={{ ...inputStyle, flex: 1 }} />
                  </div>
                </div>
                <div>
                  <label style={labelStyle}>텍스트 색상</label>
                  <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                    <input type="color" value={form.textColor} onChange={e => setForm(f => ({ ...f, textColor: e.target.value }))} style={{ width: 40, height: 36, borderRadius: 6, border: "none", cursor: "pointer" }} />
                    <Input value={form.textColor} onChange={e => setForm(f => ({ ...f, textColor: e.target.value }))} style={{ ...inputStyle, flex: 1 }} />
                  </div>
                </div>
                <div>
                  <label style={labelStyle}>버튼 텍스트</label>
                  <Input value={form.btnText} onChange={e => setForm(f => ({ ...f, btnText: e.target.value }))} placeholder="예: 구매하기" style={inputStyle} />
                </div>
                <div>
                  <label style={labelStyle}>버튼 색상</label>
                  <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                    <input type="color" value={form.btnColor} onChange={e => setForm(f => ({ ...f, btnColor: e.target.value }))} style={{ width: 40, height: 36, borderRadius: 6, border: "none", cursor: "pointer" }} />
                    <Input value={form.btnColor} onChange={e => setForm(f => ({ ...f, btnColor: e.target.value }))} style={{ ...inputStyle, flex: 1 }} />
                  </div>
                </div>
                <div>
                  <label style={labelStyle}>배지 텍스트</label>
                  <Input value={form.badge} onChange={e => setForm(f => ({ ...f, badge: e.target.value }))} placeholder="예: HOT, NEW, FREE" style={inputStyle} />
                </div>
                <div>
                  <label style={labelStyle}>가격 표시</label>
                  <Input value={form.price} onChange={e => setForm(f => ({ ...f, price: e.target.value }))} placeholder="예: ₩29,500" style={inputStyle} />
                </div>
              </>
            )}
          </div>

          {/* 광고 배너 미리보기 */}
          {form.itemType === "ad" && form.title && (
            <div style={{ marginTop: 16 }}>
              <div style={{ fontSize: 11, color: "#6b7280", marginBottom: 8 }}>미리보기:</div>
              <div style={{ background: form.bgColor, borderRadius: 8, padding: "12px 10px", maxWidth: 160, position: "relative", overflow: "hidden", border: "1px solid rgba(0,0,0,0.08)" }}>
                {form.badge && <span style={{ position: "absolute", top: 6, right: 6, background: "rgba(255,255,255,0.2)", color: "#fff", fontSize: 9, fontWeight: 800, padding: "2px 6px", borderRadius: 3 }}>{form.badge}</span>}
                <div style={{ fontSize: 12, fontWeight: 800, color: form.textColor, marginBottom: 3 }}>{form.title}</div>
                {form.description && <div style={{ fontSize: 10, color: form.textColor, opacity: 0.8, marginBottom: 6 }}>{form.description}</div>}
                {form.price && <div style={{ fontSize: 13, fontWeight: 900, color: "#fff", marginBottom: 6 }}>{form.price}</div>}
                {form.btnText && <div style={{ background: form.btnColor, color: "#fff", fontSize: 10, fontWeight: 700, padding: "4px 0", borderRadius: 4, textAlign: "center" }}>{form.btnText}</div>}
              </div>
            </div>
          )}

          {/* 저장 전 안내 배너 - link 타입이고 menuLinks가 없을 때 */}
          {form.itemType === "link" && menuLinks.length === 0 && (
            <div style={{
              marginTop: 14, padding: "10px 14px",
              background: "#fffbeb", border: "1px solid #fbbf24",
              borderRadius: 8, fontSize: 12, color: "#92400e",
              display: "flex", alignItems: "center", gap: 8,
            }}>
              <span style={{ fontSize: 16 }}>⚠️</span>
              <span>메뉴 항목을 1개 이상 추가한 후 <strong>저장하기</strong>를 클릭하세요.</span>
            </div>
          )}
          {form.itemType === "link" && menuLinks.length > 0 && (
            <div style={{
              marginTop: 14, padding: "10px 14px",
              background: "#f0fdf4", border: "1px solid #86efac",
              borderRadius: 8, fontSize: 12, color: "#166534",
              display: "flex", alignItems: "center", gap: 8,
            }}>
              <span style={{ fontSize: 16 }}>✅</span>
              <span>메뉴 항목 <strong>{menuLinks.length}개</strong> 구성 완료 — 아래 <strong>저장하기</strong>를 클릭하면 사이드바에 반영됩니다.</span>
            </div>
          )}
          <div style={{ display: "flex", gap: 8, marginTop: 16 }}>
            <Button
              onClick={handleSubmit}
              disabled={createItem.isPending || updateItem.isPending}
              style={{
                background: form.itemType === "link" && menuLinks.length === 0
                  ? "#d1d5db"
                  : "linear-gradient(135deg, #6366f1, #8b5cf6)",
                fontSize: 13, fontWeight: 700,
                padding: "8px 20px",
              }}
            >
              <Save size={14} style={{ marginRight: 6 }} />{editingId ? "수정 저장하기" : "저장하기"}
            </Button>
            <Button variant="outline" onClick={() => { setShowForm(false); setEditingId(null); setMenuLinks([]); }} style={{ fontSize: 13 }}>취소</Button>
          </div>
        </div>
      )}

      {/* ── 삭제 확인 다이얼로그 ─────────────────────────────────── */}
      {deleteConfirm && (
        <div style={{
          position: "fixed", inset: 0, zIndex: 9999,
          background: "rgba(0,0,0,0.45)",
          display: "flex", alignItems: "center", justifyContent: "center",
        }}>
          <div style={{
            background: "#ffffff", borderRadius: 14, padding: "28px 28px 22px",
            boxShadow: "0 8px 40px rgba(0,0,0,0.18)",
            maxWidth: 360, width: "90%",
          }}>
            <div style={{ fontSize: 22, marginBottom: 10, textAlign: "center" }}>🗑️</div>
            <div style={{ fontSize: 15, fontWeight: 700, color: "#111827", marginBottom: 8, textAlign: "center" }}>항목을 삭제할까요?</div>
            <div style={{
              fontSize: 13, color: "#6b7280", marginBottom: 22,
              textAlign: "center", lineHeight: 1.5,
            }}>
              <span style={{ fontWeight: 600, color: "#374151" }}>"{ deleteConfirm.title }"</span><br />
              삭제하면 복구할 수 없습니다.
            </div>
            <div style={{ display: "flex", gap: 10 }}>
              <Button
                onClick={() => setDeleteConfirm(null)}
                variant="outline"
                style={{ flex: 1, fontSize: 13 }}
              >취소</Button>
              <Button
                onClick={() => deleteItem.mutate({ id: deleteConfirm.id })}
                disabled={deleteItem.isPending}
                style={{ flex: 1, fontSize: 13, background: "#ef4444", color: "#fff" }}
              >
                {deleteItem.isPending ? "삭제 중..." : "삭제"}
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
