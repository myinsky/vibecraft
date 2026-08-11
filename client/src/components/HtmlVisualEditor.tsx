/**
 * HtmlVisualEditor v3
 *
 * HTML 소스를 원본 레이아웃 그대로 렌더링하면서 다양한 편집 기능 제공:
 * - 텍스트 클릭 → 인라인 편집 + 컨텍스트 패널 표시
 * - 텍스트 선택 → 플로팅 서식 툴바 (굵기/기울임/취소선/밑줄/크기/폰트/글자색/배경색/링크)
 * - 이미지 클릭 → 이미지 편집 패널 (교체/크기/정렬/삭제)
 * - 컨텍스트 패널: 삭제, 위/아래에 텍스트 삽입, 이미지 삽입, 여백 조절, 버튼 생성, 링크 걸기
 */

import { useRef, useEffect, useCallback, useState } from "react";
import { createPortal } from "react-dom";

interface HtmlVisualEditorProps {
  htmlSource: string;
  onChange: (newHtml: string) => void;
  contentWidth?: number; // 편집 영역 최소 폭 (px), 기본값 900
}

// ─── 플로팅 서식 툴바 (텍스트 선택 시) ──────────────────────────────────────
interface FormatToolbarProps {
  x: number;
  y: number;
  onCommand: (cmd: string, value?: string) => void;
  onClose: () => void;
  onInsertLink: () => void;
}

function FormatToolbar({ x, y, onCommand, onClose, onInsertLink }: FormatToolbarProps) {
  const FONT_SIZES = [3,4,5,6,7,8,9,10,11,12,13,14,15,16,17,18,20,22,24,26,28,30,32,36,40,44,48,52,56,60,64,72,80,90,100,120,140,160,180,200].map(n => `${n}px`);
  const FONTS = [
    { label: "기본", value: "" },
    { label: "나눔고딕", value: "'Nanum Gothic', sans-serif" },
    { label: "나눔명조", value: "'Nanum Myeongjo', serif" },
    { label: "Noto Sans", value: "'Noto Sans KR', sans-serif" },
    { label: "Pretendard", value: "'Pretendard', sans-serif" },
    { label: "고딕A1", value: "'Gothic A1', sans-serif" },
    { label: "Arial", value: "Arial, sans-serif" },
    { label: "Georgia", value: "Georgia, serif" },
    { label: "Courier", value: "'Courier New', monospace" },
  ];
  const TEXT_COLORS = [
    "#000000","#1f2937","#374151","#6b7280","#9ca3af","#ffffff",
    "#ef4444","#f97316","#f59e0b","#eab308","#84cc16","#22c55e",
    "#10b981","#14b8a6","#06b6d4","#3b82f6","#6366f1","#8b5cf6",
    "#a855f7","#d946ef","#ec4899","#f43f5e",
  ];
  const BG_COLORS = [
    "transparent",
    "#fef9c3","#fef08a","#fde047",
    "#dcfce7","#bbf7d0","#86efac",
    "#dbeafe","#bfdbfe","#93c5fd",
    "#fce7f3","#fbcfe8","#f9a8d4",
    "#ede9fe","#ddd6fe","#c4b5fd",
    "#ffedd5","#fed7aa","#fdba74",
    "#fee2e2","#fecaca","#fca5a5",
    "#f1f5f9","#e2e8f0","#cbd5e1",
    "#1e293b","#0f172a","#000000",
  ];

  const [showFontPicker, setShowFontPicker] = useState(false);
  const [showBgPicker, setShowBgPicker] = useState(false);
  const [showColorPicker, setShowColorPicker] = useState(false);
  const [lastTextColor, setLastTextColor] = useState("#ef4444");
  const [lastBgColor, setLastBgColor] = useState("#fef9c3");

  const btn: React.CSSProperties = {
    background: "none", border: "none", color: "#fff",
    cursor: "pointer", padding: "4px 7px", borderRadius: 4,
    fontSize: 13, fontWeight: 700, display: "flex", alignItems: "center",
    whiteSpace: "nowrap",
  };

  return createPortal(
    <div
      style={{
        position: "fixed",
        left: Math.min(Math.max(x, 4), window.innerWidth - 520),
        top: Math.max(y - 56, 4),
        zIndex: 99999,
        background: "#1e1e2e",
        borderRadius: 8,
        boxShadow: "0 4px 24px rgba(0,0,0,0.5)",
        display: "flex", alignItems: "center", gap: 2,
        padding: "4px 8px", flexWrap: "nowrap", userSelect: "none",
      }}
      onMouseDown={e => e.preventDefault()}
    >
      {/* 기본 서식 */}
      <button type="button" style={btn} title="굵게 (Ctrl+B)" onMouseDown={() => onCommand("bold")}><b>B</b></button>
      <button type="button" style={btn} title="기울임 (Ctrl+I)" onMouseDown={() => onCommand("italic")}><i>I</i></button>
      <button type="button" style={btn} title="취소선" onMouseDown={() => onCommand("strikeThrough")}><s>S</s></button>
      <button type="button" style={btn} title="밑줄 (Ctrl+U)" onMouseDown={() => onCommand("underline")}><u>U</u></button>

      <div style={{ width: 1, height: 20, background: "#444", margin: "0 3px" }} />

      {/* 정렬 */}
      <button type="button" style={{ ...btn, padding: '3px 6px', minWidth: 28 }} title="왼쪽 정렬" onMouseDown={() => onCommand("justifyLeft")}>
        <svg width="14" height="14" viewBox="0 0 14 14" fill="none" xmlns="http://www.w3.org/2000/svg">
          <line x1="1" y1="3" x2="13" y2="3" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
          <line x1="1" y1="6" x2="9" y2="6" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
          <line x1="1" y1="9" x2="13" y2="9" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
          <line x1="1" y1="12" x2="7" y2="12" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
        </svg>
      </button>
      <button type="button" style={{ ...btn, padding: '3px 6px', minWidth: 28 }} title="가운데 정렬" onMouseDown={() => onCommand("justifyCenter")}>
        <svg width="14" height="14" viewBox="0 0 14 14" fill="none" xmlns="http://www.w3.org/2000/svg">
          <line x1="1" y1="3" x2="13" y2="3" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
          <line x1="3" y1="6" x2="11" y2="6" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
          <line x1="1" y1="9" x2="13" y2="9" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
          <line x1="3" y1="12" x2="11" y2="12" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
        </svg>
      </button>
      <button type="button" style={{ ...btn, padding: '3px 6px', minWidth: 28 }} title="오른쪽 정렬" onMouseDown={() => onCommand("justifyRight")}>
        <svg width="14" height="14" viewBox="0 0 14 14" fill="none" xmlns="http://www.w3.org/2000/svg">
          <line x1="1" y1="3" x2="13" y2="3" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
          <line x1="5" y1="6" x2="13" y2="6" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
          <line x1="1" y1="9" x2="13" y2="9" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
          <line x1="7" y1="12" x2="13" y2="12" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
        </svg>
      </button>

      <div style={{ width: 1, height: 20, background: "#444", margin: "0 3px" }} />

      {/* 글자 크기 */}
      <select
        style={{
          background: "#2d2d44", color: "#fff", border: "1px solid #555",
          borderRadius: 4, fontSize: 12, padding: "2px 4px", cursor: "pointer", maxWidth: 70,
        }}
        value=""
        onChange={e => { if (e.target.value) onCommand("fontSize_custom", e.target.value); }}
        title="글자 크기"
      >
        <option value="" disabled>크기</option>
        {FONT_SIZES.map(s => <option key={s} value={s}>{s}</option>)}
      </select>

      {/* 폰트 선택 */}
      <div style={{ position: "relative" }}>
        <button type="button"
          style={{ ...btn, fontSize: 11, padding: "4px 6px" }}
          title="폰트 선택"
          onMouseDown={e => { e.preventDefault(); setShowFontPicker(v => !v); setShowBgPicker(false); setShowColorPicker(false); }}
        >
          폰트▾
        </button>
        {showFontPicker && (
          <div style={{
            position: "absolute", top: "100%", left: 0, zIndex: 100001,
            background: "#2d2d44", borderRadius: 6, boxShadow: "0 4px 16px rgba(0,0,0,0.4)",
            padding: 4, minWidth: 140, marginTop: 2,
          }}>
            {FONTS.map(f => (
              <button type="button"
                key={f.value}
                style={{
                  display: "block", width: "100%", textAlign: "left",
                  padding: "5px 10px", background: "none", border: "none",
                  color: "#fff", cursor: "pointer", fontSize: 12,
                  fontFamily: f.value || "inherit",
                  borderRadius: 4,
                }}
                onMouseDown={e => { e.preventDefault(); onCommand("fontFamily", f.value); setShowFontPicker(false); }}
              >
                {f.label}
              </button>
            ))}
          </div>
        )}
      </div>

      <div style={{ width: 1, height: 20, background: "#444", margin: "0 3px" }} />

      {/* 글자 색상 */}
      <div style={{ position: "relative", display: "flex", alignItems: "center", borderRadius: 4, overflow: "hidden", border: "1px solid #444" }}>
        <button type="button"
          style={{ ...btn, padding: "3px 5px", display: "flex", flexDirection: "column", alignItems: "center", gap: 1, borderRadius: 0 }}
          title={`텍스트 색상 즉시 적용 (${lastTextColor})`}
          onMouseDown={e => { e.preventDefault(); onCommand("foreColor", lastTextColor); }}
        >
          <span style={{ fontSize: 12, fontWeight: 900, color: "#fff", lineHeight: 1 }}>A</span>
          <span style={{ display: "block", width: 14, height: 3, borderRadius: 1, background: lastTextColor }} />
        </button>
        <button type="button"
          style={{ ...btn, padding: "2px 3px", fontSize: 9, background: showColorPicker ? '#3b3b5c' : 'none',
            borderLeft: "1px solid #444", borderRadius: 0 }}
          title="텍스트 색상 선택"
          onMouseDown={e => { e.preventDefault(); setShowColorPicker(v => !v); setShowBgPicker(false); setShowFontPicker(false); }}
        >▾</button>
        {showColorPicker && (
          <div style={{
            position: "absolute", top: "100%", left: 0, zIndex: 100001,
            background: "#2d2d44", borderRadius: 6, boxShadow: "0 4px 16px rgba(0,0,0,0.4)",
            padding: 8, display: "flex", flexWrap: "wrap", gap: 4, width: 168, marginTop: 2,
          }}>
            {TEXT_COLORS.map(c => (
              <button type="button"
                key={c}
                title={c}
                onMouseDown={e => { e.preventDefault(); onCommand("foreColor", c); setLastTextColor(c); setShowColorPicker(false); }}
                style={{
                  width: 20, height: 20, borderRadius: "50%",
                  background: c, border: c === "#ffffff" ? "2px solid #666" : "1px solid rgba(255,255,255,0.1)",
                  cursor: "pointer", padding: 0, flexShrink: 0,
                  outline: c === lastTextColor ? "2px solid #6366f1" : "none",
                  outlineOffset: 1,
                }}
              />
            ))}
            <input
              type="color"
              title="직접 선택"
              style={{ width: 20, height: 20, borderRadius: "50%", border: "1px solid #666", cursor: "pointer", padding: 0 }}
              onMouseDown={e => e.stopPropagation()}
              onChange={e => { onCommand("foreColor", e.target.value); setLastTextColor(e.target.value); }}
            />
          </div>
        )}
      </div>

      {/* 배경 색상 (하이라이트) */}
      <div style={{ position: "relative", display: "flex", alignItems: "center", borderRadius: 4, overflow: "hidden", border: "1px solid #444" }}>
        <button type="button"
          style={{ ...btn, padding: "3px 5px", display: "flex", flexDirection: "column", alignItems: "center", gap: 1, borderRadius: 0 }}
          title={`배경 색상 즉시 적용 (${lastBgColor === 'transparent' ? '없음' : lastBgColor})`}
          onMouseDown={e => {
            e.preventDefault();
            onCommand("hiliteColor", lastBgColor === 'transparent' ? 'transparent' : lastBgColor);
          }}
        >
          <span style={{ fontSize: 11, fontWeight: 700, color: "#fff", lineHeight: 1 }}>ab</span>
          <span style={{ display: "block", width: 14, height: 3, borderRadius: 1,
            background: lastBgColor === 'transparent'
              ? 'repeating-linear-gradient(45deg,#aaa 0,#aaa 2px,#fff 0,#fff 4px)'
              : lastBgColor,
            border: "1px solid #666" }} />
        </button>
        <button type="button"
          style={{ ...btn, padding: "2px 3px", fontSize: 9, background: showBgPicker ? '#3b3b5c' : 'none',
            borderLeft: "1px solid #444", borderRadius: 0 }}
          title="배경 색상 선택"
          onMouseDown={e => { e.preventDefault(); setShowBgPicker(v => !v); setShowColorPicker(false); setShowFontPicker(false); }}
        >▾</button>
        {showBgPicker && (
          <div style={{
            position: "absolute", top: "100%", left: 0, zIndex: 100001,
            background: "#2d2d44", borderRadius: 6, boxShadow: "0 4px 16px rgba(0,0,0,0.4)",
            padding: 8, display: "flex", flexWrap: "wrap", gap: 4, width: 168, marginTop: 2,
          }}>
            {BG_COLORS.map(c => (
              <button type="button"
                key={c}
                title={c === "transparent" ? "배경 없음" : c}
                onMouseDown={e => {
                  e.preventDefault();
                  onCommand("hiliteColor", c === "transparent" ? "transparent" : c);
                  setLastBgColor(c);
                  setShowBgPicker(false);
                }}
                style={{
                  width: 20, height: 20, borderRadius: 4,
                  background: c === "transparent" ? "repeating-conic-gradient(#ccc 0% 25%, #fff 0% 50%) 0 0 / 8px 8px" : c,
                  border: "1px solid rgba(255,255,255,0.2)",
                  cursor: "pointer", padding: 0, flexShrink: 0,
                  outline: c === lastBgColor ? "2px solid #6366f1" : "none",
                  outlineOffset: 1,
                }}
              />
            ))}
            <input
              type="color"
              title="직접 선택"
              style={{ width: 20, height: 20, borderRadius: 4, border: "1px solid #666", cursor: "pointer", padding: 0 }}
              onMouseDown={e => e.stopPropagation()}
              onChange={e => { onCommand("hiliteColor", e.target.value); setLastBgColor(e.target.value); }}
            />
          </div>
        )}
      </div>

      <div style={{ width: 1, height: 20, background: "#444", margin: "0 3px" }} />

      <button type="button" style={btn} title="링크 삽입" onMouseDown={onInsertLink}>🔗</button>
      <button type="button" style={{ ...btn, color: "#aaa" }} title="닫기" onMouseDown={onClose}>✕</button>
    </div>,
    document.body
  );
}

// ─── 버튼 배경 생성 다이얼로그 ──────────────────────────────────────────────
function ButtonGeneratorDialog({ defaultText, onConfirm, onCancel }: {
  defaultText: string;
  onConfirm: (html: string) => void;
  onCancel: () => void;
}) {
  const [text, setText] = useState(defaultText || "버튼 텍스트");
  const [url, setUrl] = useState("https://");
  const [bgColor, setBgColor] = useState("#6366f1");
  const [textColor, setTextColor] = useState("#ffffff");
  const [borderRadius, setBorderRadius] = useState(8);
  const [fontSize, setFontSize] = useState(15);
  const [paddingV, setPaddingV] = useState(10);
  const [paddingH, setPaddingH] = useState(24);
  const [align, setAlign] = useState<"left" | "center" | "right">("center");
  const [fullWidth, setFullWidth] = useState(false);

  const PRESET_COLORS = [
    { bg: "#6366f1", text: "#fff", label: "인디고" },
    { bg: "#3b82f6", text: "#fff", label: "블루" },
    { bg: "#10b981", text: "#fff", label: "그린" },
    { bg: "#ef4444", text: "#fff", label: "레드" },
    { bg: "#f59e0b", text: "#fff", label: "오렌지" },
    { bg: "#8b5cf6", text: "#fff", label: "퍼플" },
    { bg: "#ec4899", text: "#fff", label: "핑크" },
    { bg: "#1e293b", text: "#fff", label: "다크" },
    { bg: "#f1f5f9", text: "#1e293b", label: "라이트" },
    { bg: "linear-gradient(135deg,#6366f1,#ec4899)", text: "#fff", label: "그라디언트" },
  ];

  const btnStyle = `display:inline-block;padding:${paddingV}px ${paddingH}px;background:${bgColor};color:${textColor};font-size:${fontSize}px;font-weight:700;border-radius:${borderRadius}px;text-decoration:none;border:none;cursor:pointer;${fullWidth ? "width:100%;text-align:center;box-sizing:border-box;" : ""}`;

  const generateHtml = () => {
    const wrapAlign = align === "center" ? "text-align:center;" : align === "right" ? "text-align:right;" : "text-align:left;";
    if (url && url !== "https://") {
      return `<p style="${wrapAlign}"><a href="${url}" target="_blank" rel="noopener noreferrer" style="${btnStyle}">${text}</a></p>`;
    }
    return `<p style="${wrapAlign}"><span style="${btnStyle}">${text}</span></p>`;
  };

  return createPortal(
    <div style={{ position: "fixed", inset: 0, zIndex: 100000, background: "rgba(0,0,0,0.5)", display: "flex", alignItems: "center", justifyContent: "center" }}
      onMouseDown={e => { if (e.target === e.currentTarget) onCancel(); }}>
      <div style={{ background: "#fff", borderRadius: 12, padding: 24, width: 440, boxShadow: "0 8px 32px rgba(0,0,0,0.2)", maxHeight: "90vh", overflowY: "auto" }}>
        <h3 style={{ margin: "0 0 16px", fontSize: 16, fontWeight: 700 }}>🎨 버튼 생성</h3>

        {/* 프리셋 */}
        <div style={{ marginBottom: 14 }}>
          <label style={{ fontSize: 12, color: "#64748b", fontWeight: 600, display: "block", marginBottom: 6 }}>색상 프리셋</label>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
            {PRESET_COLORS.map(p => (
              <button type="button"
                key={p.label}
                onClick={() => { setBgColor(p.bg); setTextColor(p.text); }}
                style={{
                  padding: "5px 12px", borderRadius: 20, border: bgColor === p.bg ? "2px solid #6366f1" : "1px solid #e2e8f0",
                  background: p.bg, color: p.text, fontSize: 11, fontWeight: 700, cursor: "pointer",
                }}
              >
                {p.label}
              </button>
            ))}
          </div>
        </div>

        {/* 버튼 텍스트 */}
        <div style={{ marginBottom: 12 }}>
          <label style={{ fontSize: 13, color: "#555", display: "block", marginBottom: 4 }}>버튼 텍스트</label>
          <input value={text} onChange={e => setText(e.target.value)}
            style={{ width: "100%", padding: "8px 10px", border: "1px solid #ddd", borderRadius: 6, fontSize: 14, boxSizing: "border-box" }} />
        </div>

        {/* URL */}
        <div style={{ marginBottom: 12 }}>
          <label style={{ fontSize: 13, color: "#555", display: "block", marginBottom: 4 }}>링크 URL (선택)</label>
          <input value={url} onChange={e => setUrl(e.target.value)} placeholder="https://..."
            style={{ width: "100%", padding: "8px 10px", border: "1px solid #ddd", borderRadius: 6, fontSize: 14, boxSizing: "border-box" }} />
        </div>

        {/* 색상 */}
        <div style={{ display: "flex", gap: 12, marginBottom: 12 }}>
          <div style={{ flex: 1 }}>
            <label style={{ fontSize: 13, color: "#555", display: "block", marginBottom: 4 }}>배경색</label>
            <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
              <input type="color" value={bgColor.startsWith("linear") ? "#6366f1" : bgColor} onChange={e => setBgColor(e.target.value)}
                style={{ width: 36, height: 32, border: "1px solid #ddd", borderRadius: 4, cursor: "pointer", padding: 2 }} />
              <input value={bgColor} onChange={e => setBgColor(e.target.value)} placeholder="#6366f1 또는 gradient"
                style={{ flex: 1, padding: "6px 8px", border: "1px solid #ddd", borderRadius: 4, fontSize: 12, boxSizing: "border-box" }} />
            </div>
          </div>
          <div style={{ flex: 1 }}>
            <label style={{ fontSize: 13, color: "#555", display: "block", marginBottom: 4 }}>글자색</label>
            <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
              <input type="color" value={textColor} onChange={e => setTextColor(e.target.value)}
                style={{ width: 36, height: 32, border: "1px solid #ddd", borderRadius: 4, cursor: "pointer", padding: 2 }} />
              <input value={textColor} onChange={e => setTextColor(e.target.value)}
                style={{ flex: 1, padding: "6px 8px", border: "1px solid #ddd", borderRadius: 4, fontSize: 12, boxSizing: "border-box" }} />
            </div>
          </div>
        </div>

        {/* 크기/모양 */}
        <div style={{ display: "flex", gap: 12, marginBottom: 12 }}>
          <div style={{ flex: 1 }}>
            <label style={{ fontSize: 12, color: "#555", display: "block", marginBottom: 4 }}>글자 크기 ({fontSize}px)</label>
            <input type="range" min={11} max={28} value={fontSize} onChange={e => setFontSize(Number(e.target.value))}
              style={{ width: "100%", accentColor: "#6366f1" }} />
          </div>
          <div style={{ flex: 1 }}>
            <label style={{ fontSize: 12, color: "#555", display: "block", marginBottom: 4 }}>모서리 ({borderRadius}px)</label>
            <input type="range" min={0} max={40} value={borderRadius} onChange={e => setBorderRadius(Number(e.target.value))}
              style={{ width: "100%", accentColor: "#6366f1" }} />
          </div>
        </div>
        <div style={{ display: "flex", gap: 12, marginBottom: 14 }}>
          <div style={{ flex: 1 }}>
            <label style={{ fontSize: 12, color: "#555", display: "block", marginBottom: 4 }}>상하 패딩 ({paddingV}px)</label>
            <input type="range" min={4} max={24} value={paddingV} onChange={e => setPaddingV(Number(e.target.value))}
              style={{ width: "100%", accentColor: "#6366f1" }} />
          </div>
          <div style={{ flex: 1 }}>
            <label style={{ fontSize: 12, color: "#555", display: "block", marginBottom: 4 }}>좌우 패딩 ({paddingH}px)</label>
            <input type="range" min={8} max={60} value={paddingH} onChange={e => setPaddingH(Number(e.target.value))}
              style={{ width: "100%", accentColor: "#6366f1" }} />
          </div>
        </div>

        {/* 정렬 & 전체 너비 */}
        <div style={{ display: "flex", gap: 12, marginBottom: 16, alignItems: "center" }}>
          <div>
            <label style={{ fontSize: 12, color: "#555", display: "block", marginBottom: 4 }}>정렬</label>
            <div style={{ display: "flex", gap: 4 }}>
              {(["left","center","right"] as const).map(a => (
                <button type="button" key={a} onClick={() => setAlign(a)}
                  style={{ padding: "4px 10px", borderRadius: 4, border: align === a ? "2px solid #6366f1" : "1px solid #ddd", background: align === a ? "#eef2ff" : "#fff", cursor: "pointer", fontSize: 12, color: align === a ? "#6366f1" : "#374151" }}>
                  {a === "left" ? "⬅" : a === "center" ? "⬌" : "➡"}
                </button>
              ))}
            </div>
          </div>
          <label style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 12, color: "#555", cursor: "pointer" }}>
            <input type="checkbox" checked={fullWidth} onChange={e => setFullWidth(e.target.checked)} />
            전체 너비
          </label>
        </div>

        {/* 미리보기 */}
        <div style={{ background: "#f8fafc", borderRadius: 8, padding: 16, marginBottom: 16, textAlign: align }}>
          <span style={{
            display: "inline-block",
            padding: `${paddingV}px ${paddingH}px`,
            background: bgColor,
            color: textColor,
            fontSize: fontSize,
            fontWeight: 700,
            borderRadius: borderRadius,
            width: fullWidth ? "100%" : "auto",
            boxSizing: "border-box",
          }}>
            {text}
          </span>
        </div>

        <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
          <button type="button" onClick={onCancel} style={{ padding: "8px 16px", borderRadius: 6, border: "1px solid #ddd", background: "#fff", cursor: "pointer", fontSize: 14 }}>취소</button>
          <button type="button" onClick={() => onConfirm(generateHtml())}
            style={{ padding: "8px 16px", borderRadius: 6, border: "none", background: "#6366f1", color: "#fff", cursor: "pointer", fontSize: 14, fontWeight: 700 }}>삽입</button>
        </div>
      </div>
    </div>,
    document.body
  );
}

// ─── 컨텍스트 편집 패널 (요소 클릭 시) ──────────────────────────────────────
interface ContextPanelProps {
  x: number;
  y: number;
  targetType: "text" | "image" | "button";
  onDelete: () => void;
  onInsertBefore: () => void;
  onInsertAfter: () => void;
  onInsertImage: () => void;
  onAddSpacerBefore: () => void;
  onAddSpacerAfter: () => void;
  onMoveUp: () => void;
  onMoveDown: () => void;
  onInsertHeading: (level: 1 | 2 | 3) => void;
  onInsertDivider: () => void;
  onInsertBlockquote: () => void;
  onInsertTable: () => void;
  onImageReplace: () => void;
  onImageResize: () => void;
  onInsertButton: () => void;
  onInsertLink: () => void;
  onClose: () => void;
  marginBottom: number;
  onMarginChange: (v: number) => void;
  lineHeight: number;
  onLineHeightChange: (v: number) => void;
}

function ContextPanel({
  x, y, targetType, onDelete, onInsertBefore, onInsertAfter,
  onInsertImage, onAddSpacerBefore, onAddSpacerAfter, onMoveUp, onMoveDown,
  onInsertHeading, onInsertDivider, onInsertBlockquote, onInsertTable,
  onImageReplace, onImageResize, onInsertButton, onInsertLink, onClose, marginBottom, onMarginChange,
  lineHeight, onLineHeightChange,
}: ContextPanelProps) {
  const panelWidth = 220;
  const estimatedPanelHeight = targetType === "button" ? 260 : targetType === "image" ? 340 : 480;
  // 클릭 위치 기준으로 패널 위치 계산 (블록 근처에 표시)
  const gap = 12; // 블록과 패널 사이 간격
  // 우측에 충분한 공간이 있으면 우측에, 없으면 좌측에 표시
  const spaceRight = window.innerWidth - x;
  const spaceLeft = x;
  let left: number;
  if (spaceRight >= panelWidth + gap + 8) {
    left = x + gap; // 클릭 위치 우측
  } else if (spaceLeft >= panelWidth + gap + 8) {
    left = x - panelWidth - gap; // 클릭 위치 좌측
  } else {
    // 양수에 공간이 없으면 화면 안에서 우측 정렬
    left = Math.max(8, window.innerWidth - panelWidth - 16);
  }
  // 수직 위치: 클릭 Y 기준으로 정렬, 화면 밖으로 나가지 않도록
  const spaceBelow = window.innerHeight - y;
  const top = spaceBelow >= estimatedPanelHeight + 16
    ? Math.max(y - 8, 60)
    : Math.max(y - estimatedPanelHeight - 8, 60);

  const btn: React.CSSProperties = {
    display: "flex", alignItems: "center", gap: 6,
    padding: "6px 10px", borderRadius: 6, border: "none",
    cursor: "pointer", fontSize: 12, fontWeight: 600, width: "100%",
    textAlign: "left", background: "none", color: "#1e293b",
    transition: "background 0.1s",
  };

  return createPortal(
    <div
      style={{
        position: "fixed", left, top,
        zIndex: 99998,
        background: "#fff", borderRadius: 10,
        boxShadow: "0 8px 32px rgba(0,0,0,0.18)",
        padding: "8px 6px",
        width: panelWidth,
        userSelect: "none",
        border: "1px solid #e2e8f0",
      }}
      onMouseDown={e => e.stopPropagation()}
    >
      {/* 헤더 */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "2px 6px 6px", borderBottom: "1px solid #f1f5f9", marginBottom: 4 }}>
        <span style={{ fontSize: 11, fontWeight: 700, color: "#64748b" }}>
          {targetType === "image" ? "🖼️ 이미지 편집" : "✏️ 블록 편집"}
        </span>
        <button type="button" onMouseDown={onClose} style={{ background: "none", border: "none", cursor: "pointer", color: "#94a3b8", fontSize: 14, padding: 2 }}>✕</button>
      </div>

      {/* 이미지 전용 버튼 */}
      {targetType === "image" && (
        <>
          <button type="button" style={{ ...btn, color: "#6366f1" }} onMouseDown={onImageReplace}>🖼️ 이미지 교체</button>
          <button type="button" style={{ ...btn, color: "#0ea5e9" }} onMouseDown={onImageResize}>↔ 크기 / 정렬</button>
          <div style={{ height: 1, background: "#f1f5f9", margin: "4px 0" }} />
        </>
      )}

      {/* 버튼 전용 편집 메뉴 */}
      {targetType === "button" && (
        <>
          <button type="button" style={{ ...btn, color: "#8b5cf6" }} onMouseDown={onInsertButton}>🎨 버튼 스타일 편집</button>
          <button type="button" style={{ ...btn, color: "#0891b2" }} onMouseDown={onInsertLink}>🔗 링크 변경</button>
          <div style={{ height: 1, background: "#f1f5f9", margin: "4px 0" }} />
        </>
      )}

      {/* 공통 버튼 (버튼 타입일 때는 일부 숨김) */}
      {targetType !== "button" && <button type="button" style={{ ...btn, color: "#6366f1" }} onMouseDown={onInsertBefore}>⬆ 위에 텍스트 삽입</button>}
      {targetType !== "button" && <button type="button" style={{ ...btn, color: "#6366f1" }} onMouseDown={onInsertAfter}>⬇ 아래에 텍스트 삽입</button>}
      {targetType !== "button" && <button type="button" style={{ ...btn, color: "#0ea5e9" }} onMouseDown={onInsertImage}>🖼️ 이미지 삽입</button>}
      {targetType !== "button" && <button type="button" style={{ ...btn, color: "#374151" }} onMouseDown={() => onInsertHeading(1)}>H1 제목 삽입</button>}
      {targetType !== "button" && <button type="button" style={{ ...btn, color: "#374151" }} onMouseDown={() => onInsertHeading(2)}>H2 제목 삽입</button>}
      {targetType !== "button" && <button type="button" style={{ ...btn, color: "#374151" }} onMouseDown={() => onInsertHeading(3)}>H3 제목 삽입</button>}
      {targetType !== "button" && <button type="button" style={{ ...btn, color: "#64748b" }} onMouseDown={onInsertDivider}>— 구분선 삽입</button>}
      {targetType !== "button" && <button type="button" style={{ ...btn, color: "#6b7280" }} onMouseDown={onInsertBlockquote}>" 인용구 삽입</button>}
      {targetType !== "button" && <button type="button" style={{ ...btn, color: "#0891b2" }} onMouseDown={onInsertTable}>표 삽입</button>}
      {targetType !== "button" && <button type="button" style={{ ...btn, color: "#8b5cf6" }} onMouseDown={onInsertButton}>🎨 버튼 생성</button>}
      {targetType !== "button" && <button type="button" style={{ ...btn, color: "#0891b2" }} onMouseDown={onInsertLink}>🔗 링크 걸기</button>}
      {targetType !== "button" && <button type="button" style={{ ...btn, color: "#0ea5e9" }} onMouseDown={onMoveUp}>⬆ 위로 이동</button>}
      {targetType !== "button" && <button type="button" style={{ ...btn, color: "#0ea5e9" }} onMouseDown={onMoveDown}>⬇ 아래로 이동</button>}
      {targetType !== "button" && <button type="button" style={{ ...btn, color: "#059669" }} onMouseDown={onAddSpacerBefore}>↑ 위에 여백 추가</button>}
      {targetType !== "button" && <button type="button" style={{ ...btn, color: "#059669" }} onMouseDown={onAddSpacerAfter}>↓ 아래에 여백 추가</button>}

      <div style={{ height: 1, background: "#f1f5f9", margin: "4px 0" }} />

      {/* 아래 여백 슬라이더 */}
      <div style={{ padding: "4px 6px" }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 4 }}>
          <span style={{ fontSize: 11, color: "#64748b" }}>↕ 아래 여백</span>
          <span style={{ fontSize: 11, color: "#6366f1", fontWeight: 700 }}>{marginBottom}px</span>
        </div>
        <input
          type="range" min={0} max={80} step={4} value={marginBottom}
          onChange={e => onMarginChange(Number(e.target.value))}
          style={{ width: "100%", accentColor: "#6366f1", cursor: "pointer" }}
        />
      </div>

      {/* 줄 간격 슬라이더 */}
      {targetType === "text" && (
        <div style={{ padding: "4px 6px" }}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 4 }}>
            <span style={{ fontSize: 11, color: "#64748b" }}>↔ 줄 간격</span>
            <span style={{ fontSize: 11, color: "#0ea5e9", fontWeight: 700 }}>{lineHeight === 0 ? "기본" : lineHeight.toFixed(1)}</span>
          </div>
          <input
            type="range" min={0} max={30} step={1} value={Math.round(lineHeight * 10)}
            onChange={e => onLineHeightChange(Number(e.target.value) / 10)}
            style={{ width: "100%", accentColor: "#0ea5e9", cursor: "pointer" }}
          />
          <div style={{ display: "flex", justifyContent: "space-between", fontSize: 10, color: "#94a3b8", marginTop: 2 }}>
            <span>기본</span><span>1.2</span><span>1.5</span><span>2.0</span><span>3.0</span>
          </div>
        </div>
      )}

      <div style={{ height: 1, background: "#f1f5f9", margin: "4px 0" }} />

      <button type="button"
        style={{ ...btn, color: "#ef4444" }}
        onMouseDown={onDelete}
      >
        🗑️ 삭제
      </button>
    </div>,
    document.body
  );
}

// ─── 링크 다이얼로그 ──────────────────────────────────────────────────────────
function LinkDialog({ onConfirm, onCancel, defaultText = "" }: {
  onConfirm: (url: string, text: string) => void;
  onCancel: () => void;
  defaultText?: string;
}) {
  const [url, setUrl] = useState("https://");
  const [text, setText] = useState(defaultText);

  return createPortal(
    <div style={{ position: "fixed", inset: 0, zIndex: 100000, background: "rgba(0,0,0,0.5)", display: "flex", alignItems: "center", justifyContent: "center" }}
      onMouseDown={e => { if (e.target === e.currentTarget) onCancel(); }}>
      <div style={{ background: "#fff", borderRadius: 12, padding: 24, width: 380, boxShadow: "0 8px 32px rgba(0,0,0,0.2)" }}>
        <h3 style={{ margin: "0 0 16px", fontSize: 16, fontWeight: 700 }}>🔗 링크 삽입</h3>
        <div style={{ marginBottom: 12 }}>
          <label style={{ fontSize: 13, color: "#555", display: "block", marginBottom: 4 }}>링크 텍스트</label>
          <input value={text} onChange={e => setText(e.target.value)} placeholder="표시할 텍스트"
            style={{ width: "100%", padding: "8px 10px", border: "1px solid #ddd", borderRadius: 6, fontSize: 14, boxSizing: "border-box" }} />
        </div>
        <div style={{ marginBottom: 20 }}>
          <label style={{ fontSize: 13, color: "#555", display: "block", marginBottom: 4 }}>URL</label>
          <input value={url} onChange={e => setUrl(e.target.value)} placeholder="https://..."
            style={{ width: "100%", padding: "8px 10px", border: "1px solid #ddd", borderRadius: 6, fontSize: 14, boxSizing: "border-box" }} autoFocus />
        </div>
        <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
          <button type="button" onClick={onCancel} style={{ padding: "8px 16px", borderRadius: 6, border: "1px solid #ddd", background: "#fff", cursor: "pointer", fontSize: 14 }}>취소</button>
          <button type="button" onClick={() => { if (url.trim()) onConfirm(url.trim(), text.trim()); }}
            style={{ padding: "8px 16px", borderRadius: 6, border: "none", background: "#6366f1", color: "#fff", cursor: "pointer", fontSize: 14, fontWeight: 700 }}>삽입</button>
        </div>
      </div>
    </div>,
    document.body
  );
}

// ─── 이미지 삽입 다이얼로그 ──────────────────────────────────────────────────
function ImageInsertDialog({ onConfirm, onCancel, onUpload }: {
  onConfirm: (src: string, alt: string, width: string) => void;
  onCancel: () => void;
  onUpload: (file: File) => Promise<string>;
}) {
  const [src, setSrc] = useState("");
  const [alt, setAlt] = useState("");
  const [width, setWidth] = useState("100%");
  const [uploading, setUploading] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  const handleFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploading(true);
    try { setSrc(await onUpload(file)); } catch { alert("업로드 실패"); } finally { setUploading(false); }
  };

  return createPortal(
    <div style={{ position: "fixed", inset: 0, zIndex: 100000, background: "rgba(0,0,0,0.5)", display: "flex", alignItems: "center", justifyContent: "center" }}
      onMouseDown={e => { if (e.target === e.currentTarget) onCancel(); }}>
      <div style={{ background: "#fff", borderRadius: 12, padding: 24, width: 400, boxShadow: "0 8px 32px rgba(0,0,0,0.2)" }}>
        <h3 style={{ margin: "0 0 16px", fontSize: 16, fontWeight: 700 }}>이미지 삽입</h3>
        <div style={{ marginBottom: 12 }}>
          <label style={{ fontSize: 13, color: "#555", display: "block", marginBottom: 4 }}>파일 업로드</label>
          <input ref={fileRef} type="file" accept="image/*" onChange={handleFile} style={{ display: "none" }} />
          <button type="button" onClick={() => fileRef.current?.click()} disabled={uploading}
            style={{ padding: "7px 14px", borderRadius: 6, border: "1px solid #ddd", background: uploading ? "#f3f4f6" : "#fff", cursor: "pointer", fontSize: 13 }}>
            {uploading ? "업로드 중..." : "📁 파일 선택"}
          </button>
        </div>
        <div style={{ marginBottom: 12 }}>
          <label style={{ fontSize: 13, color: "#555", display: "block", marginBottom: 4 }}>이미지 URL</label>
          <input value={src} onChange={e => setSrc(e.target.value)} placeholder="https://... 또는 /manus-storage/..."
            style={{ width: "100%", padding: "8px 10px", border: "1px solid #ddd", borderRadius: 6, fontSize: 13, boxSizing: "border-box" }} />
        </div>
        {src && <div style={{ marginBottom: 12, textAlign: "center" }}>
          <img src={src} alt="미리보기" loading="lazy" decoding="async" style={{ maxWidth: "100%", maxHeight: 120, borderRadius: 6, border: "1px solid #eee" }} />
        </div>}
        <div style={{ display: "flex", gap: 12, marginBottom: 16 }}>
          <div style={{ flex: 1 }}>
            <label style={{ fontSize: 13, color: "#555", display: "block", marginBottom: 4 }}>alt 텍스트</label>
            <input value={alt} onChange={e => setAlt(e.target.value)} placeholder="이미지 설명"
              style={{ width: "100%", padding: "7px 10px", border: "1px solid #ddd", borderRadius: 6, fontSize: 13, boxSizing: "border-box" }} />
          </div>
          <div style={{ width: 90 }}>
            <label style={{ fontSize: 13, color: "#555", display: "block", marginBottom: 4 }}>너비</label>
            <input value={width} onChange={e => setWidth(e.target.value)} placeholder="100%"
              style={{ width: "100%", padding: "7px 10px", border: "1px solid #ddd", borderRadius: 6, fontSize: 13, boxSizing: "border-box" }} />
          </div>
        </div>
        <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
          <button type="button" onClick={onCancel} style={{ padding: "8px 16px", borderRadius: 6, border: "1px solid #ddd", background: "#fff", cursor: "pointer", fontSize: 14 }}>취소</button>
          <button type="button" onClick={() => { if (src.trim()) onConfirm(src.trim(), alt, width); }} disabled={!src.trim() || uploading}
            style={{ padding: "8px 16px", borderRadius: 6, border: "none", background: src.trim() && !uploading ? "#6366f1" : "#c7d2fe", color: "#fff", cursor: src.trim() && !uploading ? "pointer" : "not-allowed", fontSize: 14, fontWeight: 700 }}>삽입</button>
        </div>
      </div>
    </div>,
    document.body
  );
}

// ─── 이미지 크기/정렬 다이얼로그 ─────────────────────────────────────────────
function ImageResizeDialog({ imgEl, onConfirm, onCancel }: {
  imgEl: HTMLImageElement;
  onConfirm: (width: string, align: string) => void;
  onCancel: () => void;
}) {
  const [width, setWidth] = useState(imgEl.style.width || imgEl.getAttribute("width") || "100%");
  const [align, setAlign] = useState(
    imgEl.style.display === "block" && imgEl.style.margin === "0 auto" ? "center"
      : imgEl.style.float === "right" ? "right" : "left"
  );

  return createPortal(
    <div style={{ position: "fixed", inset: 0, zIndex: 100000, background: "rgba(0,0,0,0.5)", display: "flex", alignItems: "center", justifyContent: "center" }}
      onMouseDown={e => { if (e.target === e.currentTarget) onCancel(); }}>
      <div style={{ background: "#fff", borderRadius: 12, padding: 24, width: 320, boxShadow: "0 8px 32px rgba(0,0,0,0.2)" }}>
        <h3 style={{ margin: "0 0 16px", fontSize: 16, fontWeight: 700 }}>이미지 크기 / 정렬</h3>
        <div style={{ marginBottom: 16 }}>
          <label style={{ fontSize: 13, color: "#555", display: "block", marginBottom: 4 }}>너비 (px 또는 %)</label>
          <input value={width} onChange={e => setWidth(e.target.value)} placeholder="100% 또는 400px"
            style={{ width: "100%", padding: "8px 10px", border: "1px solid #ddd", borderRadius: 6, fontSize: 14, boxSizing: "border-box" }} autoFocus />
        </div>
        <div style={{ marginBottom: 20 }}>
          <label style={{ fontSize: 13, color: "#555", display: "block", marginBottom: 8 }}>정렬</label>
          <div style={{ display: "flex", gap: 8 }}>
            {(["left", "center", "right"] as const).map(a => (
              <button type="button" key={a} onClick={() => setAlign(a)}
                style={{ flex: 1, padding: "7px 0", borderRadius: 6, border: align === a ? "2px solid #6366f1" : "1px solid #ddd", background: align === a ? "#eef2ff" : "#fff", cursor: "pointer", fontSize: 13, fontWeight: align === a ? 700 : 400, color: align === a ? "#6366f1" : "#374151" }}>
                {a === "left" ? "⬅ 왼쪽" : a === "center" ? "⬌ 중앙" : "➡ 오른쪽"}
              </button>
            ))}
          </div>
        </div>
        <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
          <button type="button" onClick={onCancel} style={{ padding: "8px 16px", borderRadius: 6, border: "1px solid #ddd", background: "#fff", cursor: "pointer", fontSize: 14 }}>취소</button>
          <button type="button" onClick={() => onConfirm(width, align)}
            style={{ padding: "8px 16px", borderRadius: 6, border: "none", background: "#6366f1", color: "#fff", cursor: "pointer", fontSize: 14, fontWeight: 700 }}>적용</button>
        </div>
      </div>
    </div>,
    document.body
  );
}

// ─── 삭제 확인 다이얼로그 ─────────────────────────────────────────────────────
function DeleteConfirmDialog({ message, onConfirm, onCancel }: {
  message: string;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  return createPortal(
    <div style={{ position: "fixed", inset: 0, zIndex: 100001, background: "rgba(0,0,0,0.5)", display: "flex", alignItems: "center", justifyContent: "center" }}
      onMouseDown={e => { if (e.target === e.currentTarget) onCancel(); }}>
      <div style={{ background: "#fff", borderRadius: 12, padding: 24, width: 340, boxShadow: "0 8px 32px rgba(0,0,0,0.2)" }}>
        <h3 style={{ margin: "0 0 10px", fontSize: 16, fontWeight: 700 }}>삭제 확인</h3>
        <p style={{ fontSize: 14, color: "#555", margin: "0 0 20px", lineHeight: 1.5 }}>{message}</p>
        <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
          <button type="button" onClick={onCancel} style={{ padding: "8px 16px", borderRadius: 6, border: "1px solid #ddd", background: "#fff", cursor: "pointer", fontSize: 14 }}>유지</button>
          <button type="button" onClick={onConfirm} style={{ padding: "8px 16px", borderRadius: 6, border: "none", background: "#ef4444", color: "#fff", cursor: "pointer", fontSize: 14, fontWeight: 700 }}>삭제</button>
        </div>
      </div>
    </div>,
    document.body
  );
}

// ─── 메인 컴포넌트 ────────────────────────────────────────────────────────────
export default function HtmlVisualEditor({ htmlSource, onChange, contentWidth = 900 }: HtmlVisualEditorProps) {
    const containerRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  // extractAndNotify 함수 ref (이벤트 핸들러 클로저에서 사용)
  const extractAndNotifyRef = useRef<((skipUndo?: boolean) => void) | null>(null);
  // 선택 영역 저장 (서식 툴바용)
  const savedRangeRef = useRef<Range | null>(null);
  // 현재 포커스/선택된 DOM 요소
  const activeElRef = useRef<HTMLElement | null>(null);
  const activeImgElRef = useRef<HTMLImageElement | null>(null);

  // 편집 모드: 'visual' = 비주얼 편집, 'source' = HTML 소스 직접 편집
  const [editorMode, setEditorMode] = useState<'visual' | 'source'>('visual');
  // HTML 소스 직접 편집 시 textarea 값
  const [sourceText, setSourceText] = useState<string>('');

  // 서식 툴바 (텍스트 선택 시)
  const [formatToolbar, setFormatToolbar] = useState<{ x: number; y: number } | null>(null);
  // 컨텍스트 패널 (요소 클릭 시)
  const [contextPanel, setContextPanel] = useState<{ x: number; y: number; type: "text" | "image" | "button" } | null>(null);
  // 아래 여백
  const [marginBottom, setMarginBottom] = useState(0);
  // 줄 간격 (0 = 기본)
  const [lineHeight, setLineHeight] = useState(0);

  // 다이얼로그
  const [showLinkDialog, setShowLinkDialog] = useState(false);
  const [linkDefaultText, setLinkDefaultText] = useState("");
  const [linkInsertMode, setLinkInsertMode] = useState<"selection" | "block" | "button">("selection");
  const [showButtonDialog, setShowButtonDialog] = useState(false);
  const [buttonDefaultText, setButtonDefaultText] = useState("");
  const [showImageInsertDialog, setShowImageInsertDialog] = useState(false);
  const [insertImageAnchorEl, setInsertImageAnchorEl] = useState<HTMLElement | null>(null);
  const [insertImagePosition, setInsertImagePosition] = useState<"before" | "after" | "replace">("after");
  const [resizingImg, setResizingImg] = useState<HTMLImageElement | null>(null);
  const [isUploading, setIsUploading] = useState(false);
  const [uploadingImgEl, setUploadingImgEl] = useState<HTMLImageElement | null>(null);

  // 삭제 확인
  type DeleteTarget = { type: "text"; el: HTMLElement } | { type: "image"; wrapper: HTMLElement; imgEl: HTMLImageElement };
  const [deleteTarget, setDeleteTarget] = useState<DeleteTarget | null>(null);

  // 특수 블록 삭제 패널 (iframe, pre, blockquote 등)
  const [specialBlockTarget, setSpecialBlockTarget] = useState<{ el: HTMLElement; label: string; x: number; y: number } | null>(null);
  // 표 편집 패널 (행/열 추가·삭제)
  const [tableEditTarget, setTableEditTarget] = useState<{ tableEl: HTMLElement; cellEl: HTMLElement; x: number; y: number } | null>(null);
  // 표 헤더 스타일 편집 상태
  const [tableHeaderStyle, setTableHeaderStyle] = useState({ bg: "#1e3a5f", borderWidth: "1px", borderColor: "#334155" });
  // 표 편집 패널 탭
  const [tableEditTab, setTableEditTab] = useState<"rowcol" | "merge" | "header">("rowcol");

  // Undo/Redo 스택
  const undoStackRef = useRef<string[]>([]);
  const redoStackRef = useRef<string[]>([]);

  // 현재 contentWrapper HTML을 스냅샷으로 추출하는 헬퍼
  const getContentSnapshot = useCallback((): string | null => {
    if (!containerRef.current) return null;
    const contentWrapper = containerRef.current.querySelector("[data-visual-content]");
    if (!contentWrapper) return null;
    const clone = contentWrapper.cloneNode(true) as HTMLElement;
    clone.querySelectorAll("[data-editable]").forEach(el => {
      const htmlEl = el as HTMLElement;
      htmlEl.removeAttribute("contenteditable");
      htmlEl.removeAttribute("data-editable");
      htmlEl.style.outline = "";
      htmlEl.style.cursor = "";
    });
    clone.querySelectorAll("[data-img-wrapper]").forEach(wrapper => {
      const img = wrapper.querySelector("img");
      if (img) {
        const imgClone = img.cloneNode(true) as HTMLImageElement;
        imgClone.removeAttribute("data-img-bound");
        wrapper.parentNode?.replaceChild(imgClone, wrapper);
      } else {
        wrapper.parentNode?.removeChild(wrapper);
      }
    });
    // 컨테이너 블록 오버레이 제거
    clone.querySelectorAll("[data-container-overlay]").forEach(el => el.remove());
    clone.querySelectorAll("[data-special-bound]").forEach(el => el.removeAttribute("data-special-bound"));
    let styleBlock = "";
    // document.head에 주입된 편집기 스타일 태그 포함 (CSS 격리를 위해 head에 주입된 것)
    document.querySelectorAll("style[data-visual-editor-head]").forEach(s => {
      styleBlock += `<style>${s.textContent}</style>\n`;
    });
    // contentWrapper 내부의 일반 style 태그도 포함 (원본 HTML에서 직접 삽입된 것)
    clone.querySelectorAll("style").forEach(s => {
      styleBlock += `<style>${s.textContent}</style>\n`;
      s.remove();
    });
    return styleBlock + clone.innerHTML;
  }, []);

  // Undo 스택에 현재 상태 저장 (변경 직전에 호출)
  const pushUndo = useCallback(() => {
    const snapshot = getContentSnapshot();
    if (snapshot === null) return;
    // 마지막 스냅샷과 동일하면 중복 저장 방지
    const stack = undoStackRef.current;
    if (stack.length > 0 && stack[stack.length - 1] === snapshot) return;
    stack.push(snapshot);
    if (stack.length > 50) stack.shift(); // 최대 50단계
    redoStackRef.current = []; // 새 변경 시 redo 초기화
  }, [getContentSnapshot]);

  // 초기 마운트 / 외부 소스 변경 시에만 렌더링
  const initialHtmlRef = useRef<string | null>(null);
  useEffect(() => {
    if (!containerRef.current) return;
    if (initialHtmlRef.current === htmlSource) return;
    initialHtmlRef.current = htmlSource;
    // renderHtml은 useCallback으로 htmlSource에 의존하므로 여기서 직접 호출
    // eslint-disable-next-line react-hooks/exhaustive-deps
    setTimeout(() => renderHtml(), 0);
  }, [htmlSource]);

  // 편집기 언마운트 시 head에 주입된 스타일 태그 제거 (CSS 격리 cleanup)
  useEffect(() => {
    return () => {
      document.querySelectorAll("style[data-visual-editor-head]").forEach(s => s.remove());
    };
  }, []);

  // 패널 외부 클릭 시 닫기
  useEffect(() => {
    const handleDocClick = (e: MouseEvent) => {
      const target = e.target as HTMLElement;
      if (target.closest("[data-visual-content]")) return;
      setContextPanel(null);
      const sel = window.getSelection();
      if (!sel || !sel.toString().trim()) setFormatToolbar(null);
    };
    document.addEventListener("mousedown", handleDocClick);
    return () => document.removeEventListener("mousedown", handleDocClick);
  }, []);

  // ─── Undo/Redo HTML 적용 함수 ─────────────────────────────────────────────
  const applySnapshot = useCallback((html: string) => {
    if (!containerRef.current) return;
    const container = containerRef.current;
    const existing = container.querySelector("div[data-visual-content]");
    if (existing) existing.remove();
    const parser = new DOMParser();
    const doc = parser.parseFromString(html, "text/html");
    // 기존 head에 주입된 편집기 스타일 제거
    document.querySelectorAll("style[data-visual-editor-head]").forEach(s => s.remove());
    // 표 폴백 CSS 주입 (applySnapshot)
    const fallbackStyleSnap = document.createElement("style");
    fallbackStyleSnap.setAttribute("data-visual-editor-head", "true");
    fallbackStyleSnap.textContent = `
      .html-source-content table { border-collapse: collapse !important; width: 100% !important; margin: 1.2em 0 !important; }
      .html-source-content th { background-color: #1e3a5f; color: #ffffff; font-weight: 700; padding: 10px 14px; border: 1px solid #1e3a5f; text-align: left; }
      .html-source-content td { padding: 9px 14px !important; border: 1px solid #cbd5e1 !important; vertical-align: top !important; }
      .html-source-content tbody tr:nth-child(even) td { background-color: #f8fafc; }
      .html-source-content tbody tr:nth-child(odd) td { background-color: #ffffff; }
      .html-source-content td:first-child { font-weight: 700; color: #1e3a5f; }
      .html-source-content .warn-box, .html-source-content [class*="warn"] { background: #fffbeb !important; border-left: 4px solid #f59e0b !important; padding: 12px 16px !important; margin: 1em 0 !important; border-radius: 0 6px 6px 0 !important; }
      .html-source-content .tip-box, .html-source-content [class*="tip"] { background: #eff6ff !important; border-left: 4px solid #3b82f6 !important; padding: 12px 16px !important; margin: 1em 0 !important; border-radius: 0 6px 6px 0 !important; }
      .html-source-content .toc-box, .html-source-content [class*="toc"] { background: #f8fafc !important; border: 1px solid #e2e8f0 !important; padding: 16px 20px !important; margin: 1em 0 !important; border-radius: 6px !important; }
    `;
    document.head.appendChild(fallbackStyleSnap);
    // head style 태그를 document.head에 주입 (body/html 선택자 스코핑 + 폭 제거)
    // 주의: border-width 등 다른 -width 속성을 손상시키지 않도록 lookbehind 사용
    doc.querySelectorAll("head style").forEach(styleEl => {
      const clone = document.createElement("style");
      clone.setAttribute("data-visual-editor-head", "true");
      let css = styleEl.textContent || "";
      // body/html 블록에서만 width/max-width/min-width/margin:auto 제거
      css = css.replace(
        /(?:^|[^\w.#:])(?:body|html)\s*(?:,\s*(?:body|html)\s*)*\{([^}]*)\}/gm,
        (fullMatch: string, declarations: string) => {
          // body/html 블록에서는 폭/마진만 제거 — color, background, opacity 등은 보존
          const cleaned = declarations
            .replace(/(?<![a-zA-Z-])(?:max-width|min-width|width)\s*:[^;]+;?/gi, "")
            .replace(/\bmargin\s*:\s*(?:0\s+auto|auto\s+0|auto)\s*;?/gi, "");
          return fullMatch.replace(declarations, cleaned);
        }
      );
      // body/html 선택자를 .html-source-content 로 치환 (CSS 스코핑)
      css = css
        .replace(/(?<![\w.#-])html(?![\w-])/g, ".html-source-content")
        .replace(/(?<![\w.#-])body(?![\w-])/g, ".html-source-content");
      clone.textContent = css;
      document.head.appendChild(clone);
    });
    // body 인라인 style에서도 폭 속성 제거
    // body 인라인 style에서 폭/마진만 제거 — color, opacity 등은 보존
    doc.body.style.removeProperty("width");
    doc.body.style.removeProperty("max-width");
    doc.body.style.removeProperty("min-width");
    doc.body.style.removeProperty("margin");
    const contentWrapper = document.createElement("div");
    contentWrapper.setAttribute("data-visual-content", "true");
    // html-source-content 클래스 추가: PostDetail과 동일한 CSS 환경 적용
    contentWrapper.className = "html-source-content";
    // contentWidth prop 기반으로 폭 강제 고정 (HTML 내부 설정 무시)
    contentWrapper.style.width = `${contentWidth}px`;
    contentWrapper.style.maxWidth = `${contentWidth}px`;
    contentWrapper.style.minWidth = "0";
    contentWrapper.style.boxSizing = "border-box";
    contentWrapper.style.overflowX = "hidden";
    Array.from(doc.body.childNodes).forEach(node => {
      contentWrapper.appendChild(node.cloneNode(true));
    });
    makeTextEditable(contentWrapper);
    bindEditEvents(contentWrapper);
    bindImageEvents(contentWrapper);
    bindButtonEvents(contentWrapper);
    bindSpecialBlockEvents(contentWrapper);
    container.insertBefore(contentWrapper, container.firstChild);
    // Undo 복원 시에는 스택에 다시 저장하지 않고 직접 onChange 호출
    const cloneForNotify = contentWrapper.cloneNode(true) as HTMLElement;
    cloneForNotify.querySelectorAll("[data-editable]").forEach(el => {
      const htmlEl = el as HTMLElement;
      htmlEl.removeAttribute("contenteditable");
      htmlEl.removeAttribute("data-editable");
      htmlEl.style.outline = "";
      htmlEl.style.cursor = "";
    });
    cloneForNotify.querySelectorAll("[data-img-wrapper]").forEach(wrapper => {
      const img = wrapper.querySelector("img");
      if (img) {
        const imgClone = img.cloneNode(true) as HTMLImageElement;
        imgClone.removeAttribute("data-img-bound");
        wrapper.parentNode?.replaceChild(imgClone, wrapper);
      } else {
        wrapper.parentNode?.removeChild(wrapper);
      }
    });
    // 컨테이너 블록 오버레이 제거
    cloneForNotify.querySelectorAll("[data-container-overlay]").forEach(el => el.remove());
    cloneForNotify.querySelectorAll("[data-special-bound]").forEach(el => el.removeAttribute("data-special-bound"));
    let styleBlock = "";
    // document.head에 주입된 편집기 스타일 태그 포함
    document.querySelectorAll("style[data-visual-editor-head]").forEach(s => {
      styleBlock += `<style>${s.textContent}</style>\n`;
    });
    // contentWrapper 내부의 일반 style 태그도 포함
    cloneForNotify.querySelectorAll("style").forEach(s => {
      styleBlock += `<style>${s.textContent}</style>\n`;
      s.remove();
    });
    const restoredHtml = styleBlock + cloneForNotify.innerHTML;
    initialHtmlRef.current = restoredHtml;
    onChange(restoredHtml);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [onChange]);

  // ─── Ctrl+Z / Ctrl+Y 키보드 이벤트 ─────────────────────────────────────────
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      const isCtrl = e.ctrlKey || e.metaKey;
      if (!isCtrl) return;
      // 비주얼 편집기 컨테이너가 없으면 무시
      if (!containerRef.current) return;
      // 에디터 영역 내부 또는 에디터 자체가 포커스를 가지고 있을 때만 처리
      const activeEl = document.activeElement;
      const isInsideEditor = containerRef.current.contains(activeEl) || activeEl === document.body;
      if (!isInsideEditor) return;

      if (e.key === "z" && !e.shiftKey) {
        // Ctrl+Z: Undo
        const stack = undoStackRef.current;
        if (stack.length === 0) return;
        e.preventDefault();
        e.stopPropagation();
        const current = getContentSnapshot();
        if (current !== null) {
          redoStackRef.current.push(current);
          if (redoStackRef.current.length > 50) redoStackRef.current.shift();
        }
        const prev = stack.pop()!;
        applySnapshot(prev);
      } else if ((e.key === "y") || (e.key === "z" && e.shiftKey)) {
        // Ctrl+Y / Ctrl+Shift+Z: Redo
        const stack = redoStackRef.current;
        if (stack.length === 0) return;
        e.preventDefault();
        e.stopPropagation();
        const current = getContentSnapshot();
        if (current !== null) {
          undoStackRef.current.push(current);
          if (undoStackRef.current.length > 50) undoStackRef.current.shift();
        }
        const next = stack.pop()!;
        applySnapshot(next);
      }
    };
    window.addEventListener("keydown", handleKeyDown, true);
    return () => window.removeEventListener("keydown", handleKeyDown, true);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [applySnapshot, getContentSnapshot]);

  const renderHtml = useCallback(() => {
    if (!containerRef.current) return;
    const container = containerRef.current;

    const parser = new DOMParser();
    const doc = parser.parseFromString(htmlSource, "text/html");

    const existing = container.querySelector("div[data-visual-content]");
    if (existing) existing.remove();

    // 기존 head에 주입된 편집기 스타일 제거
    document.querySelectorAll("style[data-visual-editor-head]").forEach(s => s.remove());

    // 표 폴백 CSS 주입: DB에 저장된 게시물의 <style> 태그가 없어도 표가 올바르게 보이도록
    // PostDetail.tsx와 동일한 폴백 스타일을 에디터에도 적용
    const fallbackStyle = document.createElement("style");
    fallbackStyle.setAttribute("data-visual-editor-head", "true");
    fallbackStyle.textContent = `
      .html-source-content table { border-collapse: collapse !important; width: 100% !important; margin: 1.2em 0 !important; }
      .html-source-content th { background-color: #1e3a5f; color: #ffffff; font-weight: 700; padding: 10px 14px; border: 1px solid #1e3a5f; text-align: left; }
      .html-source-content td { padding: 9px 14px !important; border: 1px solid #cbd5e1 !important; vertical-align: top !important; }
      .html-source-content tbody tr:nth-child(even) td { background-color: #f8fafc; }
      .html-source-content tbody tr:nth-child(odd) td { background-color: #ffffff; }
      .html-source-content td:first-child { font-weight: 700; color: #1e3a5f; }
      .html-source-content .warn-box, .html-source-content [class*="warn"] { background: #fffbeb !important; border-left: 4px solid #f59e0b !important; padding: 12px 16px !important; margin: 1em 0 !important; border-radius: 0 6px 6px 0 !important; }
      .html-source-content .tip-box, .html-source-content [class*="tip"] { background: #eff6ff !important; border-left: 4px solid #3b82f6 !important; padding: 12px 16px !important; margin: 1em 0 !important; border-radius: 0 6px 6px 0 !important; }
      .html-source-content .toc-box, .html-source-content [class*="toc"] { background: #f8fafc !important; border: 1px solid #e2e8f0 !important; padding: 16px 20px !important; margin: 1em 0 !important; border-radius: 6px !important; }
    `;
    document.head.appendChild(fallbackStyle);

    // head style 태그를 document.head에 주입 (body/html 선택자 스코핑 + 폭 제거)
    // 주의: border-width 등 다른 -width 속성을 손상시키지 않도록 lookbehind 사용
    doc.querySelectorAll("head style").forEach(styleEl => {
      const clone = document.createElement("style");
      clone.setAttribute("data-visual-editor-head", "true");
      // body/html 선택자 블록에서만 폭 속성 제거 (border-width 등 보호)
      let css = styleEl.textContent || "";
      // body/html 블록에서 width/max-width/min-width/margin:auto 제거
      css = css.replace(
        /(?:^|[^\w.#:])(?:body|html)\s*(?:,\s*(?:body|html)\s*)*\{([^}]*)\}/gm,
        (fullMatch: string, declarations: string) => {
          // body/html 블록에서는 폭/마진만 제거 — color, background, opacity 등은 보존
          const cleaned = declarations
            .replace(/(?<![a-zA-Z-])(?:max-width|min-width|width)\s*:[^;]+;?/gi, "")
            .replace(/\bmargin\s*:\s*(?:0\s+auto|auto\s+0|auto)\s*;?/gi, "");
          return fullMatch.replace(declarations, cleaned);
        }
      );
      // body/html 선택자를 .html-source-content 로 치환 (CSS 스코핑)
      css = css
        .replace(/(?<![\w.#-])html(?![\w-])/g, ".html-source-content")
        .replace(/(?<![\w.#-])body(?![\w-])/g, ".html-source-content");
      clone.textContent = css;
      document.head.appendChild(clone);
    });

    // body 인라인 style에서도 폭 속성 제거
    const bodyEl = doc.body;
    // body 인라인 style에서 폭/마진만 제거 — color, opacity 등은 보존
    bodyEl.style.removeProperty("width");
    bodyEl.style.removeProperty("max-width");
    bodyEl.style.removeProperty("min-width");
    bodyEl.style.removeProperty("margin");

    const contentWrapper = document.createElement("div");
    contentWrapper.setAttribute("data-visual-content", "true");
    // html-source-content 클래스 추가: PostDetail과 동일한 CSS 환경 적용
    // 편집 중 보이는 것과 발행 후 보이는 것이 일치하도록
    contentWrapper.className = "html-source-content";
    // contentWidth prop 기반으로 폭 강제 고정 (HTML 내부 설정 무시)
    contentWrapper.style.width = `${contentWidth}px`;
    contentWrapper.style.maxWidth = `${contentWidth}px`;
    contentWrapper.style.minWidth = "0";
    contentWrapper.style.boxSizing = "border-box";
    contentWrapper.style.overflowX = "hidden";

    // body 내용 복사 (head의 style 태그는 이미 document.head에 주입됨)
    Array.from(doc.body.childNodes).forEach(node => {
      contentWrapper.appendChild(node.cloneNode(true));
    });

    makeTextEditable(contentWrapper);
    bindEditEvents(contentWrapper);
    bindImageEvents(contentWrapper);
    bindButtonEvents(contentWrapper);
    bindSpecialBlockEvents(contentWrapper);
    container.insertBefore(contentWrapper, container.firstChild);
    // ── 초기 스냅샷 저장: 새 HTML 로드 시 Undo 스택 완전 초기화 ──
    setTimeout(() => {
      undoStackRef.current = [];
      redoStackRef.current = [];
    }, 50);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [htmlSource]);

  const makeTextEditable = (root: HTMLElement) => {
    const NON_EDITABLE = new Set(["SCRIPT","STYLE","NOSCRIPT","IFRAME","OBJECT","EMBED","INPUT","TEXTAREA","SELECT","BUTTON","CANVAS","SVG","IMG"]);
    const LIST_TAGS = new Set(["OL","UL","LI"]);
    const isLayoutContainer = (el: HTMLElement): boolean => {
      const d = el.style.display;
      if (d === "grid" || d === "flex" || d === "inline-flex" || d === "inline-grid") return true;
      if (/\bgrid\b|\bflex\b/i.test(el.className || "")) return true;
      if (["TABLE","THEAD","TBODY","TR","TH","TD"].includes(el.tagName)) return true;
      return false;
    };

    const walk = (node: Node, parentIsLayout = false) => {
      if (node.nodeType !== Node.ELEMENT_NODE) return;
      const el = node as HTMLElement;
      if (NON_EDITABLE.has(el.tagName)) return;
      if (LIST_TAGS.has(el.tagName)) {
        el.childNodes.forEach(child => walk(child, false));
        return;
      }
      const currentIsLayout = isLayoutContainer(el);
      const hasDirectText = !parentIsLayout && Array.from(el.childNodes).some(
        child => child.nodeType === Node.TEXT_NODE && child.textContent?.trim()
      );
      if (hasDirectText) {
        el.setAttribute("contenteditable", "true");
        el.setAttribute("data-editable", "true");
        el.style.outline = "none";
        el.style.cursor = "text";
      }
      el.childNodes.forEach(child => walk(child, currentIsLayout));
    };

    root.childNodes.forEach(child => walk(child, false));
  };

  const bindEditEvents = (root: HTMLElement) => {
    root.querySelectorAll("[data-editable]").forEach(el => {
      const htmlEl = el as HTMLElement;

      htmlEl.addEventListener("click", (e: Event) => {
        const me = e as MouseEvent;
        me.stopPropagation();
        activeElRef.current = htmlEl;
        const mb = parseFloat(htmlEl.style.marginBottom) || 0;
        setMarginBottom(mb);
        const lh = parseFloat(htmlEl.style.lineHeight) || 0;
        setLineHeight(lh);
        // 더블클릭이면 직접 편집 모드 (포커스 유지, 패널 닫기)
        if (me.detail >= 2) {
          setContextPanel(null);
          setFormatToolbar(null);
          return; // 더블클릭은 포커스만 유지
        }
        const rect = htmlEl.getBoundingClientRect();
        setContextPanel({ x: rect.right, y: rect.top + 8, type: "text" });
        setFormatToolbar(null);
      });

      htmlEl.addEventListener("focus", () => {
        activeElRef.current = htmlEl;
        htmlEl.style.outline = "2px solid #6366f1";
        htmlEl.style.outlineOffset = "2px";
        htmlEl.style.borderRadius = "2px";
        const mb = parseFloat(htmlEl.style.marginBottom) || 0;
        setMarginBottom(mb);
        const lh = parseFloat(htmlEl.style.lineHeight) || 0;
        setLineHeight(lh);
      });

      htmlEl.addEventListener("blur", () => {
        htmlEl.style.outline = "none";
        htmlEl.style.outlineOffset = "";
        htmlEl.style.borderRadius = "";
        setTimeout(() => {
          extractAndNotify();
        }, 300);
      });

      htmlEl.addEventListener("keydown", (e: Event) => {
        const ke = e as KeyboardEvent;
        if (ke.key === "Enter" && ke.shiftKey) {
          ke.preventDefault();
          const sel = window.getSelection();
          if (sel && sel.rangeCount > 0) {
            const range = sel.getRangeAt(0);
            range.deleteContents();
            const br = document.createElement("br");
            range.insertNode(br);
            const newRange = document.createRange();
            newRange.setStartAfter(br);
            newRange.collapse(true);
            sel.removeAllRanges();
            sel.addRange(newRange);
          }
          return;
        }
        if (ke.key === "Enter" && !ke.shiftKey) {
          ke.preventDefault();
          const newP = document.createElement("p");
          newP.setAttribute("contenteditable", "true");
          newP.setAttribute("data-editable", "true");
          newP.style.outline = "none";
          newP.style.cursor = "text";
          if (!htmlEl.style.marginBottom) htmlEl.style.marginBottom = "0.8em";
          newP.innerHTML = "<br>";
          htmlEl.parentNode?.insertBefore(newP, htmlEl.nextSibling);
          htmlEl.blur();
          setTimeout(() => {
            newP.focus();
            const range = document.createRange();
            range.setStart(newP, 0);
            range.collapse(true);
            const sel = window.getSelection();
            sel?.removeAllRanges();
            sel?.addRange(range);
            bindEditEvents(newP.parentElement || root);
          }, 0);
          return;
        }
        if (ke.key === "Escape") {
          ke.preventDefault();
          setContextPanel(null);
          setFormatToolbar(null);
          htmlEl.blur();
        }
      });

      htmlEl.addEventListener("paste", (e: Event) => {
        const pe = e as ClipboardEvent;
        pe.preventDefault();
        // 이미지 클립보드 지원: items 중 image/* 타입 파일 감지
        const items = pe.clipboardData?.items;
        if (items) {
          for (let i = 0; i < items.length; i++) {
            if (items[i].type.startsWith("image/")) {
              const file = items[i].getAsFile();
              if (file) {
                // 비동기 업로드 후 이미지 삽입
                (async () => {
                  try {
                    const url = await uploadImageFile(file);
                    const img = document.createElement("img");
                    img.src = url;
                    img.style.maxWidth = "100%";
                    const p = document.createElement("p");
                    p.style.textAlign = "center";
                    p.appendChild(img);
                    const sel = window.getSelection();
                    if (sel && !sel.isCollapsed) {
                      sel.deleteFromDocument();
                    }
                    const range = sel?.getRangeAt(0);
                    if (range) {
                      range.insertNode(p);
                      range.setStartAfter(p);
                      range.collapse(true);
                      sel?.removeAllRanges();
                      sel?.addRange(range);
                    } else {
                      htmlEl.appendChild(p);
                    }
                    extractAndNotifyRef.current?.();
                  } catch {
                    // 업로드 실패 시 무시
                  }
                })();
                return; // 이미지 처리 완료
              }
            }
          }
        }
        // 일반 텍스트 입력
        const text = pe.clipboardData?.getData("text/plain") ?? "";
        document.execCommand("insertText", false, text);
      });

      // 드래그앤드롭 이미지 업로드 지원
      htmlEl.addEventListener("dragover", (e: Event) => {
        const de = e as DragEvent;
        if (de.dataTransfer?.types.includes("Files")) {
          de.preventDefault();
          de.dataTransfer.dropEffect = "copy";
          (e.currentTarget as HTMLElement).style.outline = "2px dashed #6366f1";
        }
      });
      htmlEl.addEventListener("dragleave", (e: Event) => {
        (e.currentTarget as HTMLElement).style.outline = "";
      });
      htmlEl.addEventListener("drop", (e: Event) => {
        const de = e as DragEvent;
        (e.currentTarget as HTMLElement).style.outline = "";
        const files = de.dataTransfer?.files;
        if (files && files.length > 0) {
          const imageFiles = Array.from(files).filter(f => f.type.startsWith("image/"));
          if (imageFiles.length > 0) {
            de.preventDefault();
            imageFiles.forEach(async (file) => {
              try {
                const url = await uploadImageFile(file);
                const img = document.createElement("img");
                img.src = url;
                img.style.maxWidth = "100%";
                const p = document.createElement("p");
                p.style.textAlign = "center";
                p.appendChild(img);
                htmlEl.appendChild(p);
                extractAndNotifyRef.current?.();
              } catch {
                // 업로드 실패 시 무시
              }
            });
          }
        }
      });
      // 텍스트 선택 시 서식 툴바 표시
      htmlEl.addEventListener("mouseup", (e: Event) => {
        const me = e as MouseEvent;
        me.stopPropagation();
        const sel = window.getSelection();
        if (sel && sel.toString().trim()) {
          savedRangeRef.current = sel.getRangeAt(0).cloneRange();
          const rect = sel.getRangeAt(0).getBoundingClientRect();
          setFormatToolbar({ x: rect.left + rect.width / 2 - 260, y: rect.top });
          setContextPanel(null);
        }
      });
    });
  };

  // ─── 서식 툴바 명령 ──────────────────────────────────────────────────────────
  const handleFormatCommand = useCallback((cmd: string, value?: string) => {
    const restoreSelection = () => {
      if (savedRangeRef.current) {
        const sel = window.getSelection();
        if (sel) {
          sel.removeAllRanges();
          sel.addRange(savedRangeRef.current.cloneRange());
        }
      }
    };

    restoreSelection();

    if (cmd === "fontSize_custom" && value) {
      const sel = window.getSelection();
      if (!sel || sel.isCollapsed) restoreSelection();
      const currentSel = window.getSelection();
      if (currentSel && !currentSel.isCollapsed) {
        const range = currentSel.getRangeAt(0);
        const span = document.createElement("span");
        span.style.fontSize = value;
        try {
          range.surroundContents(span);
        } catch {
          const fragment = range.extractContents();
          const wrapper = document.createElement("span");
          wrapper.style.fontSize = value;
          wrapper.appendChild(fragment);
          range.insertNode(wrapper);
        }
        currentSel.removeAllRanges();
        savedRangeRef.current = null;
      }
    } else if (cmd === "fontFamily" && value !== undefined) {
      restoreSelection();
      const currentSel = window.getSelection();
      if (currentSel && !currentSel.isCollapsed) {
        const range = currentSel.getRangeAt(0);
        const span = document.createElement("span");
        if (value) span.style.fontFamily = value;
        try {
          range.surroundContents(span);
        } catch {
          const fragment = range.extractContents();
          const wrapper = document.createElement("span");
          if (value) wrapper.style.fontFamily = value;
          wrapper.appendChild(fragment);
          range.insertNode(wrapper);
        }
        currentSel.removeAllRanges();
        savedRangeRef.current = null;
      }
    } else if (cmd === "hiliteColor" && value) {
      restoreSelection();
      const currentSel = window.getSelection();
      if (currentSel && !currentSel.isCollapsed) {
        const range = currentSel.getRangeAt(0);
        const span = document.createElement("span");
        span.style.backgroundColor = value === "transparent" ? "" : value;
        if (value === "transparent") {
          // 배경 제거: 선택 영역 내 span의 background 제거
          try {
            range.surroundContents(span);
          } catch {
            const fragment = range.extractContents();
            const wrapper = document.createElement("span");
            wrapper.appendChild(fragment);
            range.insertNode(wrapper);
          }
        } else {
          try {
            range.surroundContents(span);
          } catch {
            const fragment = range.extractContents();
            const wrapper = document.createElement("span");
            wrapper.style.backgroundColor = value;
            wrapper.appendChild(fragment);
            range.insertNode(wrapper);
          }
        }
        currentSel.removeAllRanges();
        savedRangeRef.current = null;
      }
    } else if (cmd === "foreColor" && value) {
      restoreSelection();
      document.execCommand("foreColor", false, value);
    } else {
      restoreSelection();
      document.execCommand(cmd, false, value);
    }

    extractAndNotify();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ─── 링크 삽입 (선택 영역 기반) ─────────────────────────────────────────────
  const handleInsertLink = useCallback(() => {
    const sel = window.getSelection();
    setLinkDefaultText(sel?.toString().trim() || "");
    setLinkInsertMode("selection");
    setFormatToolbar(null);
    setShowLinkDialog(true);
  }, []);

  // ─── 링크 삽입 (블록 기반 - 컨텍스트 패널에서) ──────────────────────────────
  const handleInsertLinkFromPanel = useCallback(() => {
    const el = activeElRef.current;
    setLinkDefaultText(el?.textContent?.trim() || "");
    // 버튼 타입이면 href만 교체하는 button 모드
    const isButtonEl = el && (
      el.tagName === "A" ||
      (el.style.borderRadius && el.style.padding && (el.style.backgroundColor || el.style.background))
    );
    setLinkInsertMode(isButtonEl ? "button" : "block");
    setContextPanel(null);
    setShowLinkDialog(true);
  }, []);

  const confirmLink = useCallback((url: string, text: string) => {
    if (linkInsertMode === "button") {
      // 버튼 모드: 기존 버튼의 href만 교체 (DOM 구조 유지)
      const el = activeElRef.current;
      if (el) {
        if (el.tagName === "A") {
          (el as HTMLAnchorElement).href = url;
          (el as HTMLAnchorElement).target = "_blank";
          (el as HTMLAnchorElement).rel = "noopener noreferrer";
        } else {
          // div/p 스타일 버튼일 때: 내부 a 태그 찾아서 href 교체, 없으면 전체를 a로 감싸기
          const innerA = el.querySelector("a");
          if (innerA) {
            innerA.href = url;
            innerA.target = "_blank";
            innerA.rel = "noopener noreferrer";
          } else {
            // 버튼 요소를 a 태그로 감싸기
            const wrapper = document.createElement("a");
            wrapper.href = url;
            wrapper.target = "_blank";
            wrapper.rel = "noopener noreferrer";
            wrapper.style.cssText = "text-decoration:none;display:block;";
            el.parentNode?.insertBefore(wrapper, el);
            wrapper.appendChild(el);
          }
        }
      }
    } else if (linkInsertMode === "selection") {
      // 선택 영역에 링크 삽입
      if (savedRangeRef.current) {
        const sel = window.getSelection();
        sel?.removeAllRanges();
        sel?.addRange(savedRangeRef.current);
      }
      const a = document.createElement("a");
      a.href = url;
      a.target = "_blank";
      a.rel = "noopener noreferrer";
      a.textContent = text || url;
      const sel = window.getSelection();
      if (sel && !sel.isCollapsed) {
        const range = sel.getRangeAt(0);
        range.deleteContents();
        range.insertNode(a);
      } else if (savedRangeRef.current) {
        savedRangeRef.current.insertNode(a);
      }
    } else {
      // 블록 뒤에 링크 블록 삽입
      const el = activeElRef.current;
      const a = document.createElement("a");
      a.href = url;
      a.target = "_blank";
      a.rel = "noopener noreferrer";
      a.textContent = text || url;
      a.style.color = "#6366f1";
      const p = document.createElement("p");
      p.appendChild(a);
      if (el && el.parentNode) {
        el.parentNode.insertBefore(p, el.nextSibling);
        bindEditEvents(p.parentElement as HTMLElement);
      } else {
        const contentWrapper = containerRef.current?.querySelector("[data-visual-content]");
        contentWrapper?.appendChild(p);
      }
    }
    setShowLinkDialog(false);
    extractAndNotify();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [linkInsertMode]);

    // 버튼 편집 모드 ref
  const buttonEditModeRef = useRef(false);

  // ─── 버튼 생성 ──────────────────────────────────────────────────────────────────────────
  const handleInsertButton = useCallback((editMode = false) => {
    const el = activeElRef.current;
    buttonEditModeRef.current = editMode;
    setButtonDefaultText(el?.textContent?.trim() || "");
    setContextPanel(null);
    setShowButtonDialog(true);
  }, []);
  const confirmButtonInsert = useCallback((html: string) => {
    const el = activeElRef.current;
    const parser = new DOMParser();
    const doc = parser.parseFromString(html, "text/html");
    const newEl = doc.body.firstChild as HTMLElement;
    if (!newEl) return;
    const contentWrapper = containerRef.current?.querySelector("[data-visual-content]");
    if (!contentWrapper) return;
    if (buttonEditModeRef.current && el && el.parentNode) {
      // 편집 모드: 기존 버튼을 새 버튼으로 교체
      el.parentNode.replaceChild(newEl, el);
    } else if (el && el.parentNode) {
      el.parentNode.insertBefore(newEl, el.nextSibling);
    } else {
      contentWrapper.appendChild(newEl);
    }

    bindEditEvents(newEl.parentElement as HTMLElement);
    bindImageEvents(newEl.parentElement as HTMLElement);
    bindButtonEvents(newEl.parentElement as HTMLElement);
    setShowButtonDialog(false);
    extractAndNotify();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ─── 이미지 업로드 ──────────────────────────────────────────────────────────
  const uploadImageFile = useCallback(async (file: File): Promise<string> => {
    const formData = new FormData();
    formData.append("file", file);
    const res = await fetch("/api/upload/image", { method: "POST", body: formData, credentials: "include" });
    if (!res.ok) throw new Error("업로드 실패");
    const { url } = await res.json() as { url: string };
    return url;
  }, []);

  // ─── 이미지 삽입 ────────────────────────────────────────────────────────────
  const handleInsertImage = useCallback((anchorEl: HTMLElement | null, position: "before" | "after" | "replace") => {
    setInsertImageAnchorEl(anchorEl);
    setInsertImagePosition(position);
    setContextPanel(null);
    setShowImageInsertDialog(true);
  }, []);

  const confirmImageInsert = useCallback((src: string, alt: string, width: string) => {
    const img = document.createElement("img");
    img.src = src;
    img.alt = alt;
    img.style.width = width;
    img.style.maxWidth = "100%";

    const p = document.createElement("p");
    p.style.textAlign = "center";
    p.appendChild(img);

    const contentWrapper = containerRef.current?.querySelector("[data-visual-content]");
    if (!contentWrapper) return;

    if (insertImageAnchorEl && insertImageAnchorEl.parentNode) {
      if (insertImagePosition === "before") {
        insertImageAnchorEl.parentNode.insertBefore(p, insertImageAnchorEl);
      } else if (insertImagePosition === "after") {
        insertImageAnchorEl.parentNode.insertBefore(p, insertImageAnchorEl.nextSibling);
      } else {
        insertImageAnchorEl.parentNode.replaceChild(p, insertImageAnchorEl);
      }
    } else {
      contentWrapper.appendChild(p);
    }

    bindImageEvents(contentWrapper as HTMLElement);
    setShowImageInsertDialog(false);
    extractAndNotify();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [insertImageAnchorEl, insertImagePosition]);

  // ─── 이미지 크기/정렬 적용 ──────────────────────────────────────────────────
  const confirmImageResize = useCallback((width: string, align: string) => {
    if (!resizingImg) return;
    resizingImg.style.width = width;
    resizingImg.style.maxWidth = "100%";
    resizingImg.style.height = "auto";
    if (align === "center") {
      resizingImg.style.display = "block";
      resizingImg.style.margin = "0 auto";
      resizingImg.style.float = "none";
    } else if (align === "right") {
      resizingImg.style.float = "right";
      resizingImg.style.margin = "0 0 8px 16px";
      resizingImg.style.display = "";
    } else {
      resizingImg.style.float = "none";
      resizingImg.style.margin = "0 16px 8px 0";
      resizingImg.style.display = "";
    }
    setResizingImg(null);
    extractAndNotify();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [resizingImg]);

  // ─── 버튼 이벤트 바인딩 ────────────────────────────────────────────────────
  const bindButtonEvents = (root: HTMLElement) => {
    // data-visual-button 속성이 없는 버튼/링크 요소 탐색
    root.querySelectorAll("a[style*='border-radius']:not([data-btn-bound]), a[class]:not([data-btn-bound])").forEach(el => {
      const btnEl = el as HTMLElement;
      // 이미 오버레이 내부 버튼이면 스킵
      if (btnEl.closest("[data-img-overlay]")) return;
      btnEl.setAttribute("data-btn-bound", "true");
      btnEl.style.cursor = "pointer";

      btnEl.addEventListener("click", (e: Event) => {
        const me = e as MouseEvent;
        me.preventDefault();
        me.stopPropagation();
        activeElRef.current = btnEl;
        const rect = btnEl.getBoundingClientRect();
        setContextPanel({ x: rect.right, y: rect.top + 8, type: "button" });
        setFormatToolbar(null);
      });

      btnEl.addEventListener("mouseenter", () => {
        btnEl.style.outline = "2px solid #8b5cf6";
        btnEl.style.outlineOffset = "2px";
      });
      btnEl.addEventListener("mouseleave", () => {
        btnEl.style.outline = "";
        btnEl.style.outlineOffset = "";
      });
    });

    // div/p 안에 있는 버튼 스타일 요소 (background-color + padding + border-radius 조합)
    root.querySelectorAll("div[style*='border-radius'][style*='padding']:not([data-btn-bound]), p[style*='border-radius'][style*='padding']:not([data-btn-bound])").forEach(el => {
      const btnEl = el as HTMLElement;
      if (btnEl.closest("[data-img-overlay]")) return;
      if (!btnEl.style.backgroundColor && !btnEl.style.background) return;
      btnEl.setAttribute("data-btn-bound", "true");
      btnEl.style.cursor = "pointer";

      btnEl.addEventListener("click", (e: Event) => {
        const me = e as MouseEvent;
        me.stopPropagation();
        activeElRef.current = btnEl;
        const rect = btnEl.getBoundingClientRect();
        setContextPanel({ x: rect.right, y: rect.top + 8, type: "button" });
        setFormatToolbar(null);
      });

      btnEl.addEventListener("mouseenter", () => {
        btnEl.style.outline = "2px solid #8b5cf6";
        btnEl.style.outlineOffset = "2px";
      });
      btnEl.addEventListener("mouseleave", () => {
        btnEl.style.outline = "";
        btnEl.style.outlineOffset = "";
      });
    });
  };

  // ─── 이미지 이벤트 바인딩 ───────────────────────────────────────────────────
  const bindImageEvents = (root: HTMLElement) => {
    root.querySelectorAll("img:not([data-img-bound])").forEach(img => {
      const imgEl = img as HTMLImageElement;
      imgEl.setAttribute("data-img-bound", "true");

      const wrapper = document.createElement("span");
      wrapper.setAttribute("data-img-wrapper", "true");
      // display:block 이미지는 block으로, 인라인 이미지는 inline-block으로 처리
      const isBlockImg = imgEl.style.display === "block" || imgEl.parentElement?.tagName === "P" || imgEl.parentElement?.tagName === "DIV";
      wrapper.style.cssText = `position:relative;display:${isBlockImg ? "block" : "inline-block"};cursor:pointer;max-width:100%;`;
      imgEl.parentNode?.insertBefore(wrapper, imgEl);
      wrapper.appendChild(imgEl);

      const overlay = document.createElement("span");
      overlay.setAttribute("data-img-overlay", "true");
      overlay.style.cssText = "position:absolute;inset:0;z-index:10;pointer-events:none;top:0;left:0;right:0;bottom:0;";
      overlay.innerHTML = `
        <span style="position:absolute;inset:0;background:rgba(0,0,0,0.45);display:flex;flex-direction:column;align-items:center;justify-content:center;gap:6px;border-radius:inherit;opacity:0;transition:opacity 0.18s;pointer-events:none;" data-overlay-bg>
          <span style="display:flex;gap:6px;">
            <span data-btn-replace style="background:#6366f1;color:#fff;font-size:11px;font-weight:700;padding:5px 10px;border-radius:16px;display:flex;align-items:center;gap:4px;box-shadow:0 2px 8px rgba(0,0,0,0.3);pointer-events:auto;cursor:pointer;">🖼️ 교체</span>
            <span data-btn-resize style="background:#0ea5e9;color:#fff;font-size:11px;font-weight:700;padding:5px 10px;border-radius:16px;display:flex;align-items:center;gap:4px;box-shadow:0 2px 8px rgba(0,0,0,0.3);pointer-events:auto;cursor:pointer;">↔ 크기</span>
            <span data-btn-delete-img style="background:#ef4444;color:#fff;font-size:11px;font-weight:700;padding:5px 10px;border-radius:16px;display:flex;align-items:center;gap:4px;box-shadow:0 2px 8px rgba(0,0,0,0.3);pointer-events:auto;cursor:pointer;">🗑️ 삭제</span>
          </span>
          <span style="display:flex;gap:4px;">
            <span data-btn-align="left" style="background:rgba(255,255,255,0.9);color:#374151;font-size:11px;font-weight:700;padding:4px 10px;border-radius:12px;pointer-events:auto;cursor:pointer;box-shadow:0 1px 4px rgba(0,0,0,0.2);">⬅ 왼쪽</span>
            <span data-btn-align="center" style="background:rgba(255,255,255,0.9);color:#374151;font-size:11px;font-weight:700;padding:4px 10px;border-radius:12px;pointer-events:auto;cursor:pointer;box-shadow:0 1px 4px rgba(0,0,0,0.2);">⬌ 중앙</span>
            <span data-btn-align="right" style="background:rgba(255,255,255,0.9);color:#374151;font-size:11px;font-weight:700;padding:4px 10px;border-radius:12px;pointer-events:auto;cursor:pointer;box-shadow:0 1px 4px rgba(0,0,0,0.2);">➡ 오른쪽</span>
          </span>
        </span>
        <span data-resize-handle="nw" style="position:absolute;top:-5px;left:-5px;width:10px;height:10px;background:#6366f1;border-radius:50%;cursor:nw-resize;pointer-events:auto;opacity:0;transition:opacity 0.18s;"></span>
        <span data-resize-handle="n" style="position:absolute;top:-5px;left:50%;transform:translateX(-50%);width:10px;height:10px;background:#6366f1;border-radius:50%;cursor:n-resize;pointer-events:auto;opacity:0;transition:opacity 0.18s;"></span>
        <span data-resize-handle="ne" style="position:absolute;top:-5px;right:-5px;width:10px;height:10px;background:#6366f1;border-radius:50%;cursor:ne-resize;pointer-events:auto;opacity:0;transition:opacity 0.18s;"></span>
        <span data-resize-handle="w" style="position:absolute;top:50%;left:-5px;transform:translateY(-50%);width:10px;height:10px;background:#6366f1;border-radius:50%;cursor:w-resize;pointer-events:auto;opacity:0;transition:opacity 0.18s;"></span>
        <span data-resize-handle="e" style="position:absolute;top:50%;right:-5px;transform:translateY(-50%);width:10px;height:10px;background:#6366f1;border-radius:50%;cursor:e-resize;pointer-events:auto;opacity:0;transition:opacity 0.18s;"></span>
        <span data-resize-handle="sw" style="position:absolute;bottom:-5px;left:-5px;width:10px;height:10px;background:#6366f1;border-radius:50%;cursor:sw-resize;pointer-events:auto;opacity:0;transition:opacity 0.18s;"></span>
        <span data-resize-handle="s" style="position:absolute;bottom:-5px;left:50%;transform:translateX(-50%);width:10px;height:10px;background:#6366f1;border-radius:50%;cursor:s-resize;pointer-events:auto;opacity:0;transition:opacity 0.18s;"></span>
        <span data-resize-handle="se" style="position:absolute;bottom:-5px;right:-5px;width:10px;height:10px;background:#6366f1;border-radius:50%;cursor:se-resize;pointer-events:auto;opacity:0;transition:opacity 0.18s;"></span>
      `;
      wrapper.appendChild(overlay);

      const overlayBg = overlay.querySelector("[data-overlay-bg]") as HTMLElement;
      const btnReplace = overlay.querySelector("[data-btn-replace]") as HTMLElement;
      const btnResize = overlay.querySelector("[data-btn-resize]") as HTMLElement;
      const btnDeleteImg = overlay.querySelector("[data-btn-delete-img]") as HTMLElement;
      const resizeHandles = Array.from(overlay.querySelectorAll("[data-resize-handle]")) as HTMLElement[];

      // 정렬 버튼들
      const applyAlign = (align: string) => {
        if (align === "center") {
          imgEl.style.display = "block";
          imgEl.style.margin = "0 auto";
          imgEl.style.float = "none";
          wrapper.style.display = "block";
        } else if (align === "right") {
          imgEl.style.float = "right";
          imgEl.style.margin = "0 0 8px 16px";
          imgEl.style.display = "";
          wrapper.style.display = "inline-block";
        } else {
          imgEl.style.float = "none";
          imgEl.style.margin = "0 16px 8px 0";
          imgEl.style.display = "";
          wrapper.style.display = "inline-block";
        }
        extractAndNotify();
      };
      overlay.querySelectorAll("[data-btn-align]").forEach(btn => {
        (btn as HTMLElement).addEventListener("click", (e) => {
          e.stopPropagation();
          const align = (btn as HTMLElement).getAttribute("data-btn-align") || "left";
          applyAlign(align);
        });
      });

      wrapper.addEventListener("mouseenter", () => {
        if (overlayBg) {
          overlayBg.style.opacity = "1";
          overlayBg.style.pointerEvents = "auto";
        }
        resizeHandles.forEach(h => h.style.opacity = "1");
      });
      wrapper.addEventListener("mouseleave", (e: Event) => {
        const me = e as MouseEvent;
        const related = me.relatedTarget as HTMLElement | null;
        if (related && wrapper.contains(related)) return;
        if (overlayBg) {
          overlayBg.style.opacity = "0";
          overlayBg.style.pointerEvents = "none";
        }
        resizeHandles.forEach(h => h.style.opacity = "0");
      });

      wrapper.addEventListener("click", (e: Event) => {
        const me = e as MouseEvent;
        if ((me.target as HTMLElement).closest("[data-btn-replace],[data-btn-resize],[data-btn-delete-img],[data-btn-align],[data-resize-handle]")) return;
        me.stopPropagation();
        activeImgElRef.current = imgEl;
        activeElRef.current = wrapper as HTMLElement;
        const rect = (wrapper as HTMLElement).getBoundingClientRect();
        setContextPanel({ x: rect.right, y: rect.top + 8, type: "image" });
        setFormatToolbar(null);
      });

      btnReplace?.addEventListener("click", (e) => {
        e.stopPropagation();
        setUploadingImgEl(imgEl);
        setTimeout(() => fileInputRef.current?.click(), 0);
      });

      btnResize?.addEventListener("click", (e) => {
        e.stopPropagation();
        setResizingImg(imgEl);
        setContextPanel(null);
      });

      btnDeleteImg?.addEventListener("click", (e) => {
        e.stopPropagation();
        activeImgElRef.current = imgEl;
        setDeleteTarget({ type: "image", wrapper: wrapper as HTMLElement, imgEl });
        setContextPanel(null);
      });

      // 8방향 리사이즈 핸들 이벤트 바인딩
      resizeHandles.forEach(handle => {
        const dir = handle.getAttribute("data-resize-handle") || "se";
        let startX = 0, startY = 0, startWidth = 0, startHeight = 0;
        const onMouseMove = (e: MouseEvent) => {
          const dx = e.clientX - startX;
          const dy = e.clientY - startY;
          let newWidth = startWidth;
          let newHeight = startHeight;
          // 가로 방향 쪼기 조절
          if (dir.includes("e")) newWidth = Math.max(40, startWidth + dx);
          if (dir.includes("w")) newWidth = Math.max(40, startWidth - dx);
          // 세로 방향 높이 조절
          if (dir.includes("s")) newHeight = Math.max(20, startHeight + dy);
          if (dir.includes("n")) newHeight = Math.max(20, startHeight - dy);
          // 만약 가로만 조절하면 비율 유지
          if ((dir === "e" || dir === "w") && startWidth > 0) {
            imgEl.style.width = newWidth + "px";
            imgEl.style.height = "auto";
          } else if ((dir === "n" || dir === "s") && startHeight > 0) {
            imgEl.style.height = newHeight + "px";
            imgEl.style.width = "auto";
          } else {
            imgEl.style.width = newWidth + "px";
            imgEl.style.height = newHeight + "px";
          }
          imgEl.style.maxWidth = "100%";
        };
        const onMouseUp = () => {
          document.removeEventListener("mousemove", onMouseMove);
          document.removeEventListener("mouseup", onMouseUp);
          document.body.style.cursor = "";
          document.body.style.userSelect = "";
          extractAndNotify();
        };
        handle.addEventListener("mousedown", (e) => {
          e.preventDefault();
          e.stopPropagation();
          startX = e.clientX;
          startY = e.clientY;
          startWidth = imgEl.offsetWidth || imgEl.naturalWidth || 200;
          startHeight = imgEl.offsetHeight || imgEl.naturalHeight || 150;
          document.body.style.cursor = dir + "-resize";
          document.body.style.userSelect = "none";
          document.addEventListener("mousemove", onMouseMove);
          document.addEventListener("mouseup", onMouseUp);
        });
      });
    });
  };

  // ─── 특수 블록 이벤트 바인딩 (iframe, pre, blockquote, table 등) ──────────────
  const bindSpecialBlockEvents = (root: HTMLElement) => {
    const SPECIAL_SELECTORS = [
      "iframe:not([data-special-bound])",
      "pre:not([data-special-bound])",
      "blockquote:not([data-special-bound])",
      "table:not([data-special-bound])",
      "video:not([data-special-bound])",
      "audio:not([data-special-bound])",
      "object:not([data-special-bound])",
      "embed:not([data-special-bound])",
    ];
    root.querySelectorAll(SPECIAL_SELECTORS.join(",")).forEach(el => {
      const htmlEl = el as HTMLElement;
      htmlEl.setAttribute("data-special-bound", "true");
      htmlEl.style.cursor = "pointer";
      htmlEl.style.outline = "";

      const getLabel = () => {
        const tag = htmlEl.tagName.toLowerCase();
        if (tag === "iframe") return "임베드";
        if (tag === "pre") return "코드 블록";
        if (tag === "blockquote") return "인용구";
        if (tag === "table") return "표";
        if (tag === "video") return "동영상";
        if (tag === "audio") return "오디오";
        return "특수 블록";
      };

      htmlEl.addEventListener("mouseenter", () => {
        htmlEl.style.outline = "2px dashed #f59e0b";
        htmlEl.style.outlineOffset = "3px";
      });
      htmlEl.addEventListener("mouseleave", () => {
        htmlEl.style.outline = "";
        htmlEl.style.outlineOffset = "";
      });

      htmlEl.addEventListener("click", (e: Event) => {
        const me = e as MouseEvent;
        me.stopPropagation();
        activeElRef.current = htmlEl;
        // 표는 행/열 편집 패널 표시
        if (htmlEl.tagName.toLowerCase() === "table") {
          const cellEl = (me.target as HTMLElement).closest("td,th") as HTMLElement | null;
          setTableEditTarget({ tableEl: htmlEl, cellEl: cellEl || htmlEl, x: me.clientX, y: me.clientY });
          setSpecialBlockTarget(null);
        } else {
          setSpecialBlockTarget({ el: htmlEl, label: getLabel(), x: me.clientX, y: me.clientY });
          setTableEditTarget(null);
        }
        setContextPanel(null);
        setFormatToolbar(null);
      });
    });

    // ─── 배경색/테두리가 있는 컨테이너 블록 (div, section, header, footer, article 등)
    // HTML 붙여넣기 시 검은 블록 등 배경이 있는 컨테이너를 감지하여 삭제 버튼 표시
    const CONTAINER_TAGS = ["div", "section", "header", "footer", "article", "aside", "nav", "main"];
    const containerSelector = CONTAINER_TAGS
      .map(t => `${t}:not([data-special-bound]):not([data-visual-content]):not([data-editable]):not([data-img-wrapper])`)
      .join(",");
    root.querySelectorAll(containerSelector).forEach(el => {
      const htmlEl = el as HTMLElement;
      // 이미 처리된 요소 건너뜀
      if (htmlEl.getAttribute("data-special-bound")) return;
      // 배경색 또는 테두리가 있는 경우만 처리
      const style = window.getComputedStyle(htmlEl);
      const bg = style.backgroundColor;
      const border = style.border;
      const hasBackground = bg && bg !== "rgba(0, 0, 0, 0)" && bg !== "transparent";
      const hasBorder = border && border !== "none" && border !== "0px none rgb(0, 0, 0)";
      if (!hasBackground && !hasBorder) return;
      // 내부에 텍스트가 없고 자식이 없거나, 배경만 있는 빈 블록
      htmlEl.setAttribute("data-special-bound", "true");

      // 마우스 오버 시 삭제 버튼 오버레이 표시
      const overlay = document.createElement("span");
      overlay.setAttribute("data-container-overlay", "true");
      overlay.style.cssText = [
        "position:absolute",
        "top:4px",
        "right:4px",
        "z-index:9999",
        "opacity:0",
        "transition:opacity 0.15s",
        "pointer-events:none",
      ].join(";");
      overlay.innerHTML = `<span data-del-btn style="background:#ef4444;color:#fff;font-size:11px;font-weight:700;padding:4px 8px;border-radius:12px;cursor:pointer;pointer-events:auto;box-shadow:0 2px 8px rgba(0,0,0,0.3);">🗑️ 블록 삭제</span>`;
      // position:relative가 없으면 추가
      const pos = window.getComputedStyle(htmlEl).position;
      if (pos === "static") htmlEl.style.position = "relative";
      htmlEl.appendChild(overlay);

      htmlEl.addEventListener("mouseenter", () => {
        overlay.style.opacity = "1";
        overlay.style.pointerEvents = "auto";
        htmlEl.style.outline = "2px dashed #ef4444";
        htmlEl.style.outlineOffset = "2px";
      });
      htmlEl.addEventListener("mouseleave", (e: Event) => {
        const me = e as MouseEvent;
        const related = me.relatedTarget as HTMLElement | null;
        if (related && htmlEl.contains(related)) return;
        overlay.style.opacity = "0";
        overlay.style.pointerEvents = "none";
        htmlEl.style.outline = "";
        htmlEl.style.outlineOffset = "";
      });

      const delBtn = overlay.querySelector("[data-del-btn]") as HTMLElement;
      delBtn?.addEventListener("click", (e) => {
        e.stopPropagation();
        setSpecialBlockTarget({ el: htmlEl, label: "컨테이너 블록", x: htmlEl.getBoundingClientRect().right, y: htmlEl.getBoundingClientRect().top + 8 });
        setContextPanel(null);
        setFormatToolbar(null);
      });
    });
  };

  // ─── 파일 선택 후 업로드 ────────────────────────────────────────────────────
  const handleFileChange = useCallback(async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !uploadingImgEl) return;
    e.target.value = "";
    setIsUploading(true);
    const previewUrl = URL.createObjectURL(file);
    const originalSrc = uploadingImgEl.src;
    uploadingImgEl.src = previewUrl;

    const wrapper = uploadingImgEl.closest("[data-img-wrapper]") as HTMLElement | null;
    const overlayBg = wrapper?.querySelector("[data-overlay-bg]") as HTMLElement | null;
    if (overlayBg) {
      overlayBg.style.opacity = "1";
      overlayBg.innerHTML = `<span style="background:rgba(99,102,241,0.9);color:#fff;font-size:12px;font-weight:700;padding:8px 16px;border-radius:20px;display:flex;align-items:center;gap:8px;"><span style="width:14px;height:14px;border:2px solid #fff;border-top-color:transparent;border-radius:50%;animation:spin 0.7s linear infinite;display:inline-block;"></span>업로드 중...</span>`;
    }

    try {
      const url = await uploadImageFile(file);
      uploadingImgEl.src = url;
      URL.revokeObjectURL(previewUrl);
      extractAndNotify();
    } catch {
      uploadingImgEl.src = originalSrc;
      URL.revokeObjectURL(previewUrl);
      alert("이미지 업로드에 실패했습니다.");
    } finally {
      setIsUploading(false);
      setUploadingImgEl(null);
      if (overlayBg) {
        overlayBg.style.opacity = "0";
        overlayBg.innerHTML = `<span data-btn-replace style="background:#6366f1;color:#fff;font-size:11px;font-weight:700;padding:5px 10px;border-radius:16px;pointer-events:auto;cursor:pointer;">🖼️ 교체</span><span data-btn-resize style="background:#0ea5e9;color:#fff;font-size:11px;font-weight:700;padding:5px 10px;border-radius:16px;pointer-events:auto;cursor:pointer;">↔ 크기/정렬</span>`;
      }
    }
  }, [uploadingImgEl, uploadImageFile]); // eslint-disable-line react-hooks/exhaustive-deps

  // ─── 컨텍스트 패널 액션 ──────────────────────────────────────────────────────
  const handleContextDelete = useCallback(() => {
    const el = activeElRef.current;
    const imgEl = activeImgElRef.current;
    if (!el) return;
    setContextPanel(null);
    if (contextPanel?.type === "image" && imgEl) {
      const wrapper = imgEl.closest("[data-img-wrapper]") as HTMLElement | null;
      if (wrapper) {
        setDeleteTarget({ type: "image", wrapper, imgEl });
      }
    } else {
      setDeleteTarget({ type: "text", el });
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [contextPanel]);

  const insertBlockAt = useCallback((position: "before" | "after") => {
    const el = activeElRef.current;
    if (!el || !el.parentNode) return;
    const newP = document.createElement("p");
    newP.setAttribute("contenteditable", "true");
    newP.setAttribute("data-editable", "true");
    newP.style.cssText = "outline:none;cursor:text;min-height:1.5em;padding:4px 0;";
    newP.innerHTML = "<br>";
    if (position === "before") {
      el.parentNode.insertBefore(newP, el);
    } else {
      el.parentNode.insertBefore(newP, el.nextSibling);
    }
    bindEditEvents(newP.parentElement as HTMLElement);
    setContextPanel(null);
    setTimeout(() => {
      newP.focus();
      const range = document.createRange();
      range.setStart(newP, 0);
      range.collapse(true);
      const sel = window.getSelection();
      sel?.removeAllRanges();
      sel?.addRange(range);
    }, 0);
    extractAndNotify();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const addSpacerAt = useCallback((position: "before" | "after") => {
    const el = activeElRef.current;
    if (!el || !el.parentNode) return;
    const spacer = document.createElement("p");
    spacer.setAttribute("contenteditable", "true");
    spacer.setAttribute("data-editable", "true");
    spacer.style.cssText = "outline:none;cursor:text;min-height:2em;padding:0;margin:0.5em 0;";
    spacer.innerHTML = "<br>";
    if (position === "before") {
      el.parentNode.insertBefore(spacer, el);
    } else {
      el.parentNode.insertBefore(spacer, el.nextSibling);
    }
    bindEditEvents(spacer.parentElement as HTMLElement);
    setContextPanel(null);
    extractAndNotify();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ─── 제목/구분선/인용구/표 블록 삽입 ───────────────────────────────────────────────
  const insertHeadingAt = useCallback((level: 1 | 2 | 3) => {
    const el = activeElRef.current;
    if (!el || !el.parentNode) return;
    const heading = document.createElement(`h${level}`);
    heading.setAttribute("contenteditable", "true");
    heading.setAttribute("data-editable", "true");
    heading.style.cssText = "outline:none;cursor:text;";
    heading.textContent = `제목 ${level}`;
    el.parentNode.insertBefore(heading, el.nextSibling);
    bindEditEvents(heading.parentElement as HTMLElement);
    setContextPanel(null);
    setTimeout(() => {
      heading.focus();
      const range = document.createRange();
      range.selectNodeContents(heading);
      const sel = window.getSelection();
      sel?.removeAllRanges();
      sel?.addRange(range);
    }, 0);
    extractAndNotify();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const insertDividerAt = useCallback(() => {
    const el = activeElRef.current;
    if (!el || !el.parentNode) return;
    const hr = document.createElement("hr");
    hr.style.cssText = "border:none;border-top:2px solid #e2e8f0;margin:1.5em 0;";
    el.parentNode.insertBefore(hr, el.nextSibling);
    setContextPanel(null);
    extractAndNotify();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const insertBlockquoteAt = useCallback(() => {
    const el = activeElRef.current;
    if (!el || !el.parentNode) return;
    const bq = document.createElement("blockquote");
    bq.setAttribute("contenteditable", "true");
    bq.setAttribute("data-editable", "true");
    bq.style.cssText = "outline:none;cursor:text;border-left:4px solid #6366f1;padding:8px 16px;margin:1em 0;background:#f8f7ff;border-radius:0 6px 6px 0;color:#374151;";
    bq.textContent = "인용구 내용을 입력하세요";
    el.parentNode.insertBefore(bq, el.nextSibling);
    bindEditEvents(bq.parentElement as HTMLElement);
    setContextPanel(null);
    setTimeout(() => {
      bq.focus();
      const range = document.createRange();
      range.selectNodeContents(bq);
      const sel = window.getSelection();
      sel?.removeAllRanges();
      sel?.addRange(range);
    }, 0);
    extractAndNotify();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const insertTableAt = useCallback(() => {
    const el = activeElRef.current;
    if (!el || !el.parentNode) return;
    const table = document.createElement("table");
    table.style.cssText = "border-collapse:collapse;width:100%;margin:1em 0;";
    table.innerHTML = `
      <thead><tr>
        <th style="border:1px solid #cbd5e1;padding:8px 12px;background:#1e3a5f;color:#fff;font-weight:700;">열 1</th>
        <th style="border:1px solid #cbd5e1;padding:8px 12px;background:#1e3a5f;color:#fff;font-weight:700;">열 2</th>
        <th style="border:1px solid #cbd5e1;padding:8px 12px;background:#1e3a5f;color:#fff;font-weight:700;">열 3</th>
      </tr></thead>
      <tbody>
        <tr>
          <td style="border:1px solid #cbd5e1;padding:8px 12px;">내용 1</td>
          <td style="border:1px solid #cbd5e1;padding:8px 12px;">내용 2</td>
          <td style="border:1px solid #cbd5e1;padding:8px 12px;">내용 3</td>
        </tr>
        <tr>
          <td style="border:1px solid #cbd5e1;padding:8px 12px;">내용 4</td>
          <td style="border:1px solid #cbd5e1;padding:8px 12px;">내용 5</td>
          <td style="border:1px solid #cbd5e1;padding:8px 12px;">내용 6</td>
        </tr>
      </tbody>
    `;
    el.parentNode.insertBefore(table, el.nextSibling);
    bindEditEvents(table.parentElement as HTMLElement);
    setContextPanel(null);
    extractAndNotify();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ─── 블록 위로/아래로 이동 ─────────────────────────────────────────────────
  const moveBlockInEditor = useCallback((direction: "up" | "down") => {
    const el = activeElRef.current;
    if (!el || !el.parentNode) return;
    const parent = el.parentNode as HTMLElement;
    if (direction === "up") {
      const prev = el.previousElementSibling;
      if (prev) {
        parent.insertBefore(el, prev);
        extractAndNotify();
      }
    } else {
      const next = el.nextElementSibling;
      if (next) {
        parent.insertBefore(next, el);
        extractAndNotify();
      }
    }
    setContextPanel(null);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleMarginChange = useCallback((value: number) => {
    setMarginBottom(value);
    const el = activeElRef.current;
    if (!el) return;
    el.style.marginBottom = value === 0 ? "" : `${value}px`;
    extractAndNotify();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleLineHeightChange = useCallback((value: number) => {
    setLineHeight(value);
    const el = activeElRef.current;
    if (!el) return;
    el.style.lineHeight = value === 0 ? "" : String(value);
    extractAndNotify();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ─── 삭제 확인 ──────────────────────────────────────────────────────────────
  const handleConfirmDelete = useCallback(() => {
    if (!deleteTarget) return;
    if (deleteTarget.type === "text") {
      deleteTarget.el.remove();
    } else {
      const { wrapper } = deleteTarget;
      const parentEl = wrapper.parentElement;
      if (parentEl && ["P","DIV","FIGURE","SECTION"].includes(parentEl.tagName)) {
        const otherContent = Array.from(parentEl.childNodes).filter(
          n => n !== wrapper && (n.nodeType !== Node.TEXT_NODE || (n.textContent?.trim() || "").length > 0)
        );
        if (otherContent.length === 0) { parentEl.remove(); } else { wrapper.remove(); }
      } else {
        wrapper.remove();
      }
    }
    setDeleteTarget(null);
    activeElRef.current = null;
    activeImgElRef.current = null;
    extractAndNotify();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [deleteTarget]);

  // ─── 새 텍스트 블록 추가 (하단) ─────────────────────────────────────────────
  const addNewTextBlock = useCallback(() => {
    const contentWrapper = containerRef.current?.querySelector("[data-visual-content]");
    if (!contentWrapper) return;
    const newP = document.createElement("p");
    newP.setAttribute("contenteditable", "true");
    newP.setAttribute("data-editable", "true");
    newP.style.cssText = "outline:none;cursor:text;min-height:1.5em;padding:4px 0;";
    newP.innerHTML = "<br>";
    contentWrapper.appendChild(newP);
    bindEditEvents(newP.parentElement as HTMLElement);
    setTimeout(() => {
      newP.focus();
      const range = document.createRange();
      range.setStart(newP, 0);
      range.collapse(true);
      const sel = window.getSelection();
      sel?.removeAllRanges();
      sel?.addRange(range);
    }, 0);
    extractAndNotify();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ─── extractAndNotify ───────────────────────────────────────────────────────
  const extractAndNotify = useCallback((skipUndo = false) => {
    if (!containerRef.current) return;
    if (!skipUndo) pushUndo();
    const contentWrapper = containerRef.current.querySelector("[data-visual-content]");
    if (!contentWrapper) return;

    const clone = contentWrapper.cloneNode(true) as HTMLElement;

    clone.querySelectorAll("[data-editable]").forEach(el => {
      const htmlEl = el as HTMLElement;
      htmlEl.removeAttribute("contenteditable");
      htmlEl.removeAttribute("data-editable");
      htmlEl.style.outline = "";
      htmlEl.style.cursor = "";
    });

    clone.querySelectorAll("[data-img-wrapper]").forEach(wrapper => {
      const img = wrapper.querySelector("img");
      if (img) {
        const imgClone = img.cloneNode(true) as HTMLImageElement;
        imgClone.removeAttribute("data-img-bound");
        wrapper.parentNode?.replaceChild(imgClone, wrapper);
      } else {
        wrapper.parentNode?.removeChild(wrapper);
      }
    });

    // 컨테이너 블록 오버레이 제거 (data-container-overlay)
    clone.querySelectorAll("[data-container-overlay]").forEach(el => el.remove());
    // special-bound 속성 제거 (편집기 전용 마커)
    clone.querySelectorAll("[data-special-bound]").forEach(el => {
      el.removeAttribute("data-special-bound");
    });
    // 하단 빈 p 블록 제거: 내용이 <br>만 있고 min-height/padding 스타일만 있는 편집기 전용 빈 블록
    // 단, 마지막 하나는 남겨두어 편집 가능성 유지
    const allPs = Array.from(clone.querySelectorAll("p[style]"));
    const emptyPs = allPs.filter(el => {
      const htmlEl = el as HTMLElement;
      const text = htmlEl.textContent?.trim() || "";
      const inner = htmlEl.innerHTML.trim();
      // 내용이 없거나 <br>만 있는 경우
      if (text !== "" || (inner !== "" && inner !== "<br>" && inner !== "<BR>")) return false;
      // min-height 또는 padding 스타일만 있는 편집기 추가 블록
      const style = htmlEl.getAttribute("style") || "";
      return style.includes("min-height") || style.includes("cursor:text") || style.includes("cursor: text");
    });
    // 마지막 빈 p는 남기고 나머지 제거 (단, 전체가 빈 p만인 경우 하나 유지)
    const totalContent = clone.textContent?.trim() || "";
    if (totalContent === "" && emptyPs.length > 0) {
      // 내용이 전혀 없으면 하나만 남김
      emptyPs.slice(1).forEach(el => el.remove());
    } else {
      // 내용이 있으면 빈 p 모두 제거
      emptyPs.forEach(el => el.remove());
    }

    let styleBlock = "";
    // document.head에 주입된 편집기 스타일 태그 포함
    document.querySelectorAll("style[data-visual-editor-head]").forEach(s => {
      styleBlock += `<style>${s.textContent}</style>\n`;
    });
    // contentWrapper 내부의 일반 style 태그도 포함
    clone.querySelectorAll("style").forEach(s => {
      styleBlock += `<style>${s.textContent}</style>\n`;
      s.remove();
    });

        const newHtml = styleBlock + clone.innerHTML;
    initialHtmlRef.current = newHtml;
    onChange(newHtml);
  }, [onChange, pushUndo]);
  // extractAndNotifyRef 업데이트 (이벤트 핸들러 클로저에서 사용)
  extractAndNotifyRef.current = extractAndNotify;
  return (
    <div style={{ position: "relative" }}>
      {/* 숨겨진 파일 인풋 */}
      <input ref={fileInputRef} type="file" accept="image/*" style={{ display: "none" }} onChange={handleFileChange} />

      {/* 업로드 중 오버레이 */}
      {isUploading && (
        <div style={{ position: "absolute", inset: 0, zIndex: 50, background: "rgba(255,255,255,0.6)", display: "flex", alignItems: "center", justifyContent: "center", borderRadius: 8 }}>
          <div style={{ background: "#6366f1", color: "#fff", padding: "10px 20px", borderRadius: 20, fontSize: 13, fontWeight: 700, display: "flex", alignItems: "center", gap: 8 }}>
            <span style={{ width: 16, height: 16, border: "2px solid #fff", borderTopColor: "transparent", borderRadius: "50%", animation: "spin 0.7s linear infinite", display: "inline-block" }} />
            이미지 업로드 중...
          </div>
        </div>
      )}

      {/* 상단 툴바 */}
      <div style={{ background: "#f8fafc", border: "1px solid #e2e8f0", borderRadius: 8, padding: "8px 12px", marginBottom: 12, display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
        {/* 모드 탭 */}
        <div style={{ display: "flex", gap: 2, background: "#e2e8f0", borderRadius: 6, padding: 2 }}>
          <button type="button"
            onClick={() => {
              if (editorMode === 'source') {
                // 소스 모드에서 비주얼로 전환: sourceText를 onChange로 저장
                onChange(sourceText);
                // initialHtmlRef를 초기화하여 renderHtml이 다시 실행되도록 강제
                initialHtmlRef.current = null;
              }
              setEditorMode('visual');
              // 비주얼 모드 전환 후 renderHtml 강제 실행 (DOM이 준비된 후)
              setTimeout(() => { renderHtml(); }, 50);
            }}
            style={{
              padding: "4px 10px", borderRadius: 5, border: "none", fontSize: 12, cursor: "pointer", fontWeight: 600,
              background: editorMode === 'visual' ? "#fff" : "transparent",
              color: editorMode === 'visual' ? "#4338ca" : "#64748b",
              boxShadow: editorMode === 'visual' ? "0 1px 3px rgba(0,0,0,0.1)" : "none",
            }}
          >✏️ 비주얼</button>
          <button type="button"
            onClick={() => {
              if (editorMode === 'visual') {
                // 비주얼에서 소스로 전환: 현재 DOM에서 HTML 추출
                const snapshot = getContentSnapshot();
                setSourceText(snapshot ?? htmlSource);
              }
              setEditorMode('source');
            }}
            style={{
              padding: "4px 10px", borderRadius: 5, border: "none", fontSize: 12, cursor: "pointer", fontWeight: 600,
              background: editorMode === 'source' ? "#fff" : "transparent",
              color: editorMode === 'source' ? "#0369a1" : "#64748b",
              boxShadow: editorMode === 'source' ? "0 1px 3px rgba(0,0,0,0.1)" : "none",
            }}
          >📝 HTML 소스</button>
        </div>
        {editorMode === 'visual' && (<>
          <div style={{ width: 1, height: 16, background: "#e2e8f0" }} />
          {/* Undo/Redo 버튼 */}
          <button
            type="button"
            title="실행 취소 (Ctrl+Z)"
            onClick={() => {
              const stack = undoStackRef.current;
              if (stack.length === 0) return;
              const current = getContentSnapshot();
              if (current !== null) {
                redoStackRef.current.push(current);
                if (redoStackRef.current.length > 50) redoStackRef.current.shift();
              }
              const prev = stack.pop()!;
              applySnapshot(prev);
            }}
            style={{ padding: "4px 8px", borderRadius: 6, border: "1px solid #e2e8f0", background: "#f8fafc", color: "#475569", fontSize: 14, cursor: "pointer", fontWeight: 700, lineHeight: 1 }}
          >↩</button>
          <button
            type="button"
            title="다시 실행 (Ctrl+Y)"
            onClick={() => {
              const stack = redoStackRef.current;
              if (stack.length === 0) return;
              const current = getContentSnapshot();
              if (current !== null) {
                undoStackRef.current.push(current);
                if (undoStackRef.current.length > 50) undoStackRef.current.shift();
              }
              const next = stack.pop()!;
              applySnapshot(next);
            }}
            style={{ padding: "4px 8px", borderRadius: 6, border: "1px solid #e2e8f0", background: "#f8fafc", color: "#475569", fontSize: 14, cursor: "pointer", fontWeight: 700, lineHeight: 1 }}
          >↪</button>
          <div style={{ width: 1, height: 16, background: "#e2e8f0" }} />
          <button type="button" onClick={addNewTextBlock}
            style={{ padding: "4px 10px", borderRadius: 6, border: "1px solid #c7d2fe", background: "#eef2ff", color: "#4338ca", fontSize: 12, cursor: "pointer", fontWeight: 600 }}>
            + 텍스트 추가
          </button>
          <button type="button" onClick={() => handleInsertImage(null, "after")}
            style={{ padding: "4px 10px", borderRadius: 6, border: "1px solid #bae6fd", background: "#f0f9ff", color: "#0369a1", fontSize: 12, cursor: "pointer", fontWeight: 600 }}>
            🖼️ 이미지 삽입
          </button>
          <button type="button" onClick={() => { setButtonDefaultText(""); setShowButtonDialog(true); }}
            style={{ padding: "4px 10px", borderRadius: 6, border: "1px solid #ddd6fe", background: "#f5f3ff", color: "#7c3aed", fontSize: 12, cursor: "pointer", fontWeight: 600 }}>
            🎨 버튼 생성
          </button>
          <div style={{ width: 1, height: 16, background: "#e2e8f0" }} />
          <span style={{ fontSize: 11, color: "#94a3b8" }}>
            클릭 → 편집 패널 | <b style={{color:"#6366f1"}}>더블클릭 → 직접 타이핑</b> | 드래그 → 서식 툴바 | <b style={{color:"#059669"}}>Ctrl+Z → 실행취소</b>
          </span>
        </>)}
        {editorMode === 'source' && (
          <span style={{ fontSize: 11, color: "#94a3b8" }}>
            HTML 태그를 직접 수정한 후 <b style={{color:"#0369a1"}}>"비주얼" 탭으로 돌아가면 적용</b>됩니다.
          </span>
        )}
      </div>

      {/* 서식 툴바 (텍스트 선택 시) */}
      {formatToolbar && (
        <FormatToolbar
          x={formatToolbar.x}
          y={formatToolbar.y}
          onCommand={handleFormatCommand}
          onClose={() => setFormatToolbar(null)}
          onInsertLink={handleInsertLink}
        />
      )}

      {/* 컨텍스트 편집 패널 (요소 클릭 시) */}
      {contextPanel && (
        <ContextPanel
          x={contextPanel.x}
          y={contextPanel.y}
          targetType={contextPanel.type}
          onDelete={handleContextDelete}
          onInsertBefore={() => insertBlockAt("before")}
          onInsertAfter={() => insertBlockAt("after")}
          onInsertImage={() => handleInsertImage(activeElRef.current, "after")}
          onAddSpacerBefore={() => addSpacerAt("before")}
          onAddSpacerAfter={() => addSpacerAt("after")}
          onMoveUp={() => moveBlockInEditor("up")}
          onMoveDown={() => moveBlockInEditor("down")}
          onInsertHeading={(level) => insertHeadingAt(level)}
          onInsertDivider={() => insertDividerAt()}
          onInsertBlockquote={() => insertBlockquoteAt()}
          onInsertTable={() => insertTableAt()}
          onInsertButton={() => handleInsertButton(contextPanel?.type === "button")}
          onInsertLink={handleInsertLinkFromPanel}
          onImageReplace={() => {
            if (activeImgElRef.current) {
              setUploadingImgEl(activeImgElRef.current);
              setContextPanel(null);
              setTimeout(() => fileInputRef.current?.click(), 0);
            }
          }}
          onImageResize={() => {
            if (activeImgElRef.current) {
              setResizingImg(activeImgElRef.current);
              setContextPanel(null);
            }
          }}
          onClose={() => setContextPanel(null)}
          marginBottom={marginBottom}
          onMarginChange={handleMarginChange}
          lineHeight={lineHeight}
          onLineHeightChange={handleLineHeightChange}
        />
      )}

      {/* 링크 다이얼로그 */}
      {showLinkDialog && (
        <LinkDialog defaultText={linkDefaultText} onConfirm={confirmLink} onCancel={() => setShowLinkDialog(false)} />
      )}

      {/* 버튼 생성 다이얼로그 */}
      {showButtonDialog && (
        <ButtonGeneratorDialog
          defaultText={buttonDefaultText}
          onConfirm={confirmButtonInsert}
          onCancel={() => setShowButtonDialog(false)}
        />
      )}

      {/* 이미지 삽입 다이얼로그 */}
      {showImageInsertDialog && (
        <ImageInsertDialog onConfirm={confirmImageInsert} onCancel={() => setShowImageInsertDialog(false)} onUpload={uploadImageFile} />
      )}

      {/* 이미지 크기/정렬 다이얼로그 */}
      {resizingImg && (
        <ImageResizeDialog imgEl={resizingImg} onConfirm={confirmImageResize} onCancel={() => setResizingImg(null)} />
      )}

      {/* 삭제 확인 다이얼로그 */}
      {deleteTarget && (
        <DeleteConfirmDialog
          message={deleteTarget.type === "image"
            ? "이 이미지를 본문에서 제거합니다. 되돌릴 수 없습니다."
            : "이 텍스트 블록을 본문에서 제거합니다. 되돌릴 수 없습니다."}
          onConfirm={handleConfirmDelete}
          onCancel={() => setDeleteTarget(null)}
        />
      )}

      {/* 표 편집 패널 (행/열 추가·삭제 + 셀 병합/분할 + 헤더 스타일) */}
      {tableEditTarget && createPortal(
        <div
          style={{
            position: "fixed",
            left: Math.min(Math.max(tableEditTarget.x, 4), window.innerWidth - 320),
            top: Math.max(tableEditTarget.y - 8, 60),
            zIndex: 99998,
            background: "#fff",
            borderRadius: 12,
            boxShadow: "0 8px 32px rgba(0,0,0,0.18)",
            padding: "10px 8px",
            width: 310,
            border: "1px solid #c7d2fe",
            userSelect: "none",
          }}
          onMouseDown={e => e.stopPropagation()}
        >
          {/* 헤더 */}
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "2px 6px 8px", borderBottom: "1px solid #f1f5f9", marginBottom: 6 }}>
            <span style={{ fontSize: 11, fontWeight: 700, color: "#3730a3" }}>🗂️ 표 편집</span>
            <button type="button" onMouseDown={() => { setTableEditTarget(null); setTableEditTab("rowcol"); }} style={{ background: "none", border: "none", cursor: "pointer", color: "#94a3b8", fontSize: 14, padding: 2 }}>✕</button>
          </div>
          {/* 탭 */}
          <div style={{ display: "flex", gap: 4, padding: "0 4px", marginBottom: 8 }}>
            {([
              { id: "rowcol", label: "행/열" },
              { id: "merge", label: "셀 병합" },
              { id: "header", label: "헤더 스타일" },
            ] as Array<{id: "rowcol"|"merge"|"header"; label: string}>).map(tab => (
              <button type="button" key={tab.id} onMouseDown={() => setTableEditTab(tab.id)}
                style={{ flex: 1, padding: "5px 4px", borderRadius: 6, border: "none", cursor: "pointer", fontSize: 11, fontWeight: 700,
                  background: tableEditTab === tab.id ? "#6366f1" : "#f1f5f9",
                  color: tableEditTab === tab.id ? "#fff" : "#475569" }}>
                {tab.label}
              </button>
            ))}
          </div>

          {/* 탭 1: 행/열 추가·삭제 */}
          {tableEditTab === "rowcol" && (<>
            <div style={{ fontSize: 11, fontWeight: 700, color: "#64748b", padding: "2px 6px 4px" }}>행(Row)</div>
            <div style={{ display: "flex", gap: 4, padding: "0 4px", marginBottom: 6, flexWrap: "wrap" }}>
              {([
                { label: "▲ 위에 행 추가", action: "insertRowAbove" },
                { label: "▼ 아래 행 추가", action: "insertRowBelow" },
                { label: "🗑 현재 행 삭제", action: "deleteRow", danger: true },
              ] as Array<{label:string;action:string;danger?:boolean}>).map(({ label, action, danger }) => (
                <button type="button" key={action}
                  style={{ flex: 1, minWidth: 90, padding: "6px 6px", borderRadius: 6, border: "none", cursor: "pointer", fontSize: 11, fontWeight: 600,
                    background: danger ? "#fee2e2" : "#eef2ff", color: danger ? "#dc2626" : "#3730a3" }}
                  onMouseDown={() => {
                    const { tableEl, cellEl } = tableEditTarget;
                    const cell = cellEl.closest("td,th") as HTMLTableCellElement | null;
                    const row = cell?.closest("tr") as HTMLTableRowElement | null;
                    if (action === "insertRowAbove" && row) {
                      const cols = row.cells.length;
                      const newRow = document.createElement("tr");
                      for (let i = 0; i < cols; i++) { const td = document.createElement("td"); td.innerHTML = "&nbsp;"; newRow.appendChild(td); }
                      row.parentElement!.insertBefore(newRow, row);
                    } else if (action === "insertRowBelow" && row) {
                      const cols = row.cells.length;
                      const newRow = document.createElement("tr");
                      for (let i = 0; i < cols; i++) { const td = document.createElement("td"); td.innerHTML = "&nbsp;"; newRow.appendChild(td); }
                      row.parentElement!.insertBefore(newRow, row.nextSibling);
                    } else if (action === "deleteRow" && row) {
                      const allRows = tableEl.querySelectorAll("tr");
                      if (allRows.length > 1) row.remove();
                    }
                    extractAndNotify();
                    setTableEditTarget(null);
                  }}>{label}</button>
              ))}
            </div>
            <div style={{ fontSize: 11, fontWeight: 700, color: "#64748b", padding: "2px 6px 4px" }}>열(Column)</div>
            <div style={{ display: "flex", gap: 4, padding: "0 4px", marginBottom: 6, flexWrap: "wrap" }}>
              {([
                { label: "◀ 왼쪽 열 추가", action: "insertColLeft" },
                { label: "▶ 오른쪽 열 추가", action: "insertColRight" },
                { label: "🗑 현재 열 삭제", action: "deleteCol", danger: true },
              ] as Array<{label:string;action:string;danger?:boolean}>).map(({ label, action, danger }) => (
                <button type="button" key={action}
                  style={{ flex: 1, minWidth: 90, padding: "6px 6px", borderRadius: 6, border: "none", cursor: "pointer", fontSize: 11, fontWeight: 600,
                    background: danger ? "#fee2e2" : "#ecfdf5", color: danger ? "#dc2626" : "#065f46" }}
                  onMouseDown={() => {
                    const { tableEl, cellEl } = tableEditTarget;
                    const cell = cellEl.closest("td,th") as HTMLTableCellElement | null;
                    if (!cell) return;
                    const colIndex = cell.cellIndex;
                    const rows = Array.from(tableEl.querySelectorAll("tr")) as HTMLTableRowElement[];
                    if (action === "insertColLeft") {
                      rows.forEach(r => { const ref = r.cells[colIndex]; const nc = document.createElement(ref?.tagName.toLowerCase() || "td") as HTMLTableCellElement; nc.innerHTML = "&nbsp;"; if (ref) r.insertBefore(nc, ref); });
                    } else if (action === "insertColRight") {
                      rows.forEach(r => { const ref = r.cells[colIndex]; const nc = document.createElement(ref?.tagName.toLowerCase() || "td") as HTMLTableCellElement; nc.innerHTML = "&nbsp;"; if (ref) r.insertBefore(nc, ref.nextSibling); });
                    } else if (action === "deleteCol") {
                      const totalCols = rows[0]?.cells.length || 0;
                      if (totalCols > 1) rows.forEach(r => { if (r.cells[colIndex]) r.deleteCell(colIndex); });
                    }
                    extractAndNotify();
                    setTableEditTarget(null);
                  }}>{label}</button>
              ))}
            </div>
            <div style={{ borderTop: "1px solid #f1f5f9", paddingTop: 6, padding: "6px 4px 0" }}>
              <button type="button"
                style={{ display: "flex", alignItems: "center", gap: 6, width: "100%", padding: "7px 12px", borderRadius: 6, border: "none", cursor: "pointer", fontSize: 12, fontWeight: 700, background: "#fee2e2", color: "#dc2626" }}
                onMouseDown={() => { const el = tableEditTarget.tableEl; setTableEditTarget(null); el.remove(); extractAndNotify(); }}>
                🗑️ 표 전체 제거
              </button>
            </div>
          </>)}

          {/* 탭 2: 셀 병합/분할 */}
          {tableEditTab === "merge" && (<>
            <div style={{ fontSize: 11, color: "#64748b", padding: "2px 6px 8px", lineHeight: 1.5 }}>
              셀을 선택한 후 병합 방향을 선택하세요.<br/>
              <span style={{ color: "#f59e0b", fontWeight: 600 }}>⚠ colspan/rowspan 직접 적용</span>
            </div>
            <div style={{ display: "flex", gap: 4, padding: "0 4px", marginBottom: 6, flexWrap: "wrap" }}>
              {([
                { label: "→ 오른쪽 셀 병합", action: "mergeRight" },
                { label: "↓ 아래 셀 병합", action: "mergeDown" },
                { label: "✂ 셀 분할(colspan)", action: "splitColspan" },
                { label: "✂ 셀 분할(rowspan)", action: "splitRowspan" },
              ] as Array<{label:string;action:string}>).map(({ label, action }) => (
                <button type="button" key={action}
                  style={{ flex: "1 1 130px", padding: "7px 8px", borderRadius: 6, border: "none", cursor: "pointer", fontSize: 11, fontWeight: 600,
                    background: action.startsWith("split") ? "#fff7ed" : "#f0fdf4",
                    color: action.startsWith("split") ? "#c2410c" : "#166534" }}
                  onMouseDown={() => {
                    const { tableEl, cellEl } = tableEditTarget;
                    const cell = cellEl.closest("td,th") as HTMLTableCellElement | null;
                    if (!cell) return;
                    if (action === "mergeRight") {
                      const nextCell = cell.nextElementSibling as HTMLTableCellElement | null;
                      if (nextCell) {
                        cell.colSpan = (cell.colSpan || 1) + (nextCell.colSpan || 1);
                        cell.innerHTML += " " + nextCell.innerHTML;
                        nextCell.remove();
                      }
                    } else if (action === "mergeDown") {
                      const row = cell.closest("tr") as HTMLTableRowElement | null;
                      const nextRow = row?.nextElementSibling as HTMLTableRowElement | null;
                      if (nextRow) {
                        const colIndex = cell.cellIndex;
                        const nextCell = nextRow.cells[colIndex] as HTMLTableCellElement | null;
                        if (nextCell) {
                          cell.rowSpan = (cell.rowSpan || 1) + (nextCell.rowSpan || 1);
                          cell.innerHTML += " " + nextCell.innerHTML;
                          nextCell.remove();
                        }
                      }
                    } else if (action === "splitColspan") {
                      const span = cell.colSpan || 1;
                      if (span > 1) {
                        cell.colSpan = span - 1;
                        const newCell = document.createElement(cell.tagName.toLowerCase()) as HTMLTableCellElement;
                        newCell.innerHTML = "&nbsp;";
                        cell.parentElement!.insertBefore(newCell, cell.nextSibling);
                      }
                    } else if (action === "splitRowspan") {
                      const span = cell.rowSpan || 1;
                      if (span > 1) {
                        cell.rowSpan = span - 1;
                        const row = cell.closest("tr") as HTMLTableRowElement | null;
                        const nextRow = row?.nextElementSibling as HTMLTableRowElement | null;
                        if (nextRow) {
                          const newCell = document.createElement(cell.tagName.toLowerCase()) as HTMLTableCellElement;
                          newCell.innerHTML = "&nbsp;";
                          const colIndex = cell.cellIndex;
                          const refCell = nextRow.cells[colIndex] as HTMLTableCellElement | null;
                          nextRow.insertBefore(newCell, refCell || null);
                        }
                      }
                    }
                    extractAndNotify();
                    setTableEditTarget(null);
                  }}>{label}</button>
              ))}
            </div>
          </>)}

          {/* 탭 3: 헤더 스타일 */}
          {tableEditTab === "header" && (<>
            <div style={{ fontSize: 11, color: "#64748b", padding: "2px 6px 6px" }}>
              표 헤더(th) 행의 배경색, 테두리를 편집합니다.
            </div>
            <div style={{ padding: "0 4px" }}>
              <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 8 }}>
                <span style={{ fontSize: 11, fontWeight: 600, color: "#475569", minWidth: 60 }}>배경색</span>
                <input type="color" value={tableHeaderStyle.bg}
                  onChange={e => setTableHeaderStyle(s => ({ ...s, bg: e.target.value }))}
                  style={{ width: 36, height: 28, borderRadius: 4, border: "1px solid #e2e8f0", cursor: "pointer" }} />
                <div style={{ display: "flex", gap: 4, flexWrap: "wrap" }}>
                  {["#1e3a5f","#1e40af","#0f766e","#7c3aed","#be185d","#374151","#ffffff"].map(c => (
                    <div key={c} onMouseDown={() => setTableHeaderStyle(s => ({ ...s, bg: c }))}
                      style={{ width: 20, height: 20, borderRadius: 4, background: c, cursor: "pointer", border: tableHeaderStyle.bg === c ? "2px solid #6366f1" : "1px solid #e2e8f0" }} />
                  ))}
                </div>
              </div>
              <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 8 }}>
                <span style={{ fontSize: 11, fontWeight: 600, color: "#475569", minWidth: 60 }}>테두리 색</span>
                <input type="color" value={tableHeaderStyle.borderColor}
                  onChange={e => setTableHeaderStyle(s => ({ ...s, borderColor: e.target.value }))}
                  style={{ width: 36, height: 28, borderRadius: 4, border: "1px solid #e2e8f0", cursor: "pointer" }} />
              </div>
              <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 10 }}>
                <span style={{ fontSize: 11, fontWeight: 600, color: "#475569", minWidth: 60 }}>테두리 굵기</span>
                <select value={tableHeaderStyle.borderWidth}
                  onChange={e => setTableHeaderStyle(s => ({ ...s, borderWidth: e.target.value }))}
                  style={{ flex: 1, padding: "4px 6px", borderRadius: 6, border: "1px solid #e2e8f0", fontSize: 11 }}>
                  <option value="0px">없음</option>
                  <option value="1px">1px (얇게)</option>
                  <option value="2px">2px (보통)</option>
                  <option value="3px">3px (굵게)</option>
                  <option value="4px">4px (매우 굵게)</option>
                </select>
              </div>
              <button type="button"
                style={{ width: "100%", padding: "8px 12px", borderRadius: 8, border: "none", cursor: "pointer", fontSize: 12, fontWeight: 700, background: "#6366f1", color: "#fff" }}
                onMouseDown={() => {
                  const { tableEl } = tableEditTarget;
                  const thCells = Array.from(tableEl.querySelectorAll("th")) as HTMLTableCellElement[];
                  thCells.forEach(th => {
                    th.style.backgroundColor = tableHeaderStyle.bg;
                    th.style.borderWidth = tableHeaderStyle.borderWidth;
                    th.style.borderColor = tableHeaderStyle.borderColor;
                    th.style.borderStyle = tableHeaderStyle.borderWidth === "0px" ? "none" : "solid";
                    // 배경색에 따라 글자색 자동 조정
                    const hex = tableHeaderStyle.bg.replace("#", "");
                    const r = parseInt(hex.substring(0,2),16), g = parseInt(hex.substring(2,4),16), b = parseInt(hex.substring(4,6),16);
                    const luminance = (0.299*r + 0.587*g + 0.114*b) / 255;
                    th.style.color = luminance > 0.5 ? "#1e293b" : "#ffffff";
                  });
                  // 표 전체 테두리도 적용
                  tableEl.style.borderCollapse = "collapse";
                  const allCells = Array.from(tableEl.querySelectorAll("td,th")) as HTMLTableCellElement[];
                  allCells.forEach(c => {
                    if (!c.tagName || c.tagName === "TH") return;
                    c.style.borderWidth = tableHeaderStyle.borderWidth;
                    c.style.borderColor = tableHeaderStyle.borderColor;
                    c.style.borderStyle = tableHeaderStyle.borderWidth === "0px" ? "none" : "solid";
                  });
                  extractAndNotify();
                  setTableEditTarget(null);
                }}>
                ✅ 헤더 스타일 적용
              </button>
            </div>
          </>)}
        </div>,
        document.body
      )}
            {/* 특수 블록 삭제 패널 (iframe, pre, blockquote, table 등) */}
      {specialBlockTarget && createPortal(
        <div
          style={{
            position: "fixed",
            left: Math.min(Math.max(specialBlockTarget.x, 4), window.innerWidth - 240),
            top: Math.max(specialBlockTarget.y - 8, 60),
            zIndex: 99998,
            background: "#fff",
            borderRadius: 10,
            boxShadow: "0 8px 32px rgba(0,0,0,0.18)",
            padding: "10px 8px",
            width: 230,
            border: "1px solid #fde68a",
            userSelect: "none",
          }}
          onMouseDown={e => e.stopPropagation()}
        >
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "2px 6px 8px", borderBottom: "1px solid #f1f5f9", marginBottom: 6 }}>
            <span style={{ fontSize: 11, fontWeight: 700, color: "#92400e" }}>
              📦 {specialBlockTarget.label} 선택됨
            </span>
            <button type="button" onMouseDown={() => setSpecialBlockTarget(null)} style={{ background: "none", border: "none", cursor: "pointer", color: "#94a3b8", fontSize: 14, padding: 2 }}>✕</button>
          </div>
          <div style={{ padding: "4px 6px", fontSize: 12, color: "#64748b", marginBottom: 6 }}>
            이 {specialBlockTarget.label}을(를) 본문에서 제거하시겠습니까?
          </div>
          <button type="button"
            style={{
              display: "flex", alignItems: "center", gap: 6,
              padding: "7px 12px", borderRadius: 6, border: "none",
              cursor: "pointer", fontSize: 12, fontWeight: 700, width: "100%",
              background: "#fee2e2", color: "#dc2626",
            }}
            onMouseDown={() => {
              const el = specialBlockTarget.el;
              setSpecialBlockTarget(null);
              // 데이터 저장 후 삭제
              const parent = el.parentElement;
              if (parent) {
                el.remove();
                extractAndNotify();
              }
            }}
          >
            🗑️ {specialBlockTarget.label} 제거
          </button>
        </div>,
        document.body
      )}

      {/* HTML 소스 직접 편집 모드 */}
      {editorMode === 'source' && (
        <div style={{ marginBottom: 8 }}>
          <textarea
            value={sourceText}
            onChange={e => setSourceText(e.target.value)}
            style={{
              width: "100%",
              minHeight: 400,
              fontFamily: "'Courier New', Consolas, monospace",
              fontSize: 13,
              lineHeight: 1.6,
              padding: "12px 14px",
              border: "1px solid #cbd5e1",
              borderRadius: 8,
              background: "#0f172a",
              color: "#e2e8f0",
              resize: "vertical",
              boxSizing: "border-box",
              outline: "none",
            }}
            spellCheck={false}
            placeholder="HTML 코드를 직접 입력하세요..."
          />
          <div style={{ display: "flex", gap: 8, marginTop: 8 }}>
            <button type="button"
              onClick={() => {
                onChange(sourceText);
                setEditorMode('visual');
              }}
              style={{
                padding: "7px 18px", borderRadius: 7, border: "none",
                background: "#0369a1", color: "#fff", fontSize: 13, fontWeight: 700, cursor: "pointer",
              }}
            >
              ✔ 비주얼에 적용
            </button>
            <button type="button"
              onClick={() => setEditorMode('visual')}
              style={{
                padding: "7px 14px", borderRadius: 7, border: "1px solid #e2e8f0",
                background: "#fff", color: "#64748b", fontSize: 13, cursor: "pointer",
              }}
            >
              취소
            </button>
          </div>
        </div>
      )}

      {/* 렌더링 컨테이너 - 비주얼 모드에서만 표시 */}
      <div ref={containerRef} style={{ position: "relative", width: "100%", maxWidth: contentWidth, boxSizing: "border-box", overflowX: "hidden", display: editorMode === 'source' ? 'none' : 'block', margin: "0 auto" }} />

      <style>{`
        @keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }
        [data-visual-content] [data-editable]:hover { outline: 1px dashed #a5b4fc !important; outline-offset: 2px; border-radius: 2px; }
        [data-visual-content] [data-img-wrapper]:hover { outline: 2px solid #6366f1; outline-offset: 2px; border-radius: 4px; }
        /* 원본 line-height 보존: contenteditable 속성이 브라우저 기본 line-height를 변경하지 않도록 */
        [data-visual-content] [data-editable] { line-height: inherit !important; }
        /* 편집기 내 p, h1~h6 등 블록 요소의 margin도 원본 유지 */
        [data-visual-content] [data-editable][style*="margin"] { margin: revert; }
        /* 편집기 전용 빈 p 블록(내용 없음): 시각적 공간 최소화 */
        [data-visual-content] p[style*="min-height"]:empty,
        [data-visual-content] p[style*="min-height"]:has(> br:only-child) {
          min-height: 0 !important;
          padding-top: 0 !important;
          padding-bottom: 0 !important;
          margin-top: 0 !important;
          margin-bottom: 0 !important;
          height: 0 !important;
          overflow: hidden !important;
        }
      `}</style>
    </div>
  );
}
