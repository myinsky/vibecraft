/**
 * IframeVisualEditor
 *
 * HTML 파일을 불러온 경우 원본 CSS/레이아웃을 100% 보존하면서
 * 워드프레스 방식으로 텍스트, 이미지, 블록을 비주얼 편집할 수 있는 편집기.
 *
 * 동작 방식:
 * - iframe 안에 HTML을 로드하고 contentEditable="true"를 설정
 * - 텍스트 선택 시 플로팅 툴바 (굵게/기울임/밑줄/취소선/색상/링크)
 * - 텍스트 선택 → 버튼 변환 (ButtonGeneratorDialog)
 * - 이미지 클릭 시 교체/크기/삭제 오버레이
 * - 블록(div/section 등) 마우스 오버 시 삭제 버튼 표시
 * - 툴바: 텍스트 추가, 이미지 삽입, 버튼 생성, 줄간격, 단락간격
 * - Ctrl+Z / Ctrl+Y 실행 취소/되돌리기 지원 (iframe 내부 execCommand)
 * - 변경 시 onChange 콜백으로 최신 HTML 전달
 */

import React, { useEffect, useRef, useCallback, useState } from "react";
import { createPortal } from "react-dom";
import { Upload, Trash2, X, AlertTriangle, Plus, Image as ImageIcon } from "lucide-react";

interface IframeVisualEditorProps {
  /** 편집할 HTML 소스 (전체 HTML 문서 또는 body 조각) */
  value?: string;
  /** html prop 도 지원 (value와 동일) */
  html?: string;
  /** 변경 시 호출 - 최신 HTML 전달 */
  onChange: (html: string) => void;
  /** 이미지 업로드 함수 (파일 → URL) */
  onUploadImage?: (file: File) => Promise<string>;
  /** 최소 높이 */
  minHeight?: number;
  /** 앱 모드 (스크립트 포함 HTML) */
  isAppMode?: boolean;
  /** 애드센스 슬롯 코드 (+ 버튼 메뉴에서 삽입 시 사용) */
  adsenseSlotCode?: string;
  /** 쿠팡 파트너스 위젯 코드 (+ 버튼 메뉴에서 삽입 시 사용) */
  coupangWidgetCode?: string;
  /** 쇼핑 커넥트 위젯 코드 (+ 버튼 메뉴에서 삽입 시 사용) */
  shopConnectWidgetCode?: string;
  /** 파일 다운로드 버튼 삽입 요청: 파일 업로드 후 삽입할 HTML을 반환하는 콜백 */
  onRequestFileInsert?: (afterEl: Element | null, insertHtml: (html: string) => void) => void;
  /** 외부 팝업이 열릴 때 true로 설정 - 에디터 오버레이(삽입패널, 툴바) 숨김 */
  hideOverlay?: boolean;
}

interface ImageOverlay {
  visible: boolean;
  x: number;       // 이미지 중앙 x
  y: number;       // 이미지 상단 y
  imgRight?: number; // 이미지 우측 끝 x (팝업 우측 배치용)
  imgEl: HTMLImageElement | null;
  currentAlign?: 'left' | 'center' | 'right';
  currentWidth?: string;
  currentAlt?: string;        // alt 텍스트
  currentCaption?: string;   // 하단 캐션 (figcaption)
  aspectRatio?: number;      // 원본 비율 (width/height)
  keepAspect?: boolean;      // 비율 유지 여부
}

interface BlockOverlay {
  visible: boolean;
  x: number;
  y: number;
  width: number;
  blockEl: HTMLElement | null;
}

interface FloatToolbar {
  visible: boolean;
  x: number;
  y: number;
  popupX?: number;   // 블록 클릭 시 팝업 x (viewport 기준)
  popupY?: number;   // 블록 클릭 시 팝업 y (viewport 기준)
  popupBottom?: number; // 블록 하단 y (viewport 기준, 팝업 위치 결정용)
  popupRight?: number; // 블록 우측 끝 x (viewport 기준, 팝업 우측 배치용)
  mode?: 'selection' | 'block'; // 텍스트 선택 또는 블록 클릭
  blockEl?: HTMLElement | null;  // 블록 클릭 시 해당 요소
  tableEl?: HTMLElement | null;  // 표 셀 클릭 시 해당 table 요소
  cellEl?: HTMLElement | null;   // 표 셀 클릭 시 해당 td/th 요소
  currentBlockType?: string;     // 현재 블록 태그 (P, H2, BLOCKQUOTE 등)
}

// 워드프레스식 + 버튼 (줄 사이 삽입)
interface PlusButton {
  visible: boolean;
  x: number; // 화면 좌표
  y: number; // 화면 좌표
  afterEl: HTMLElement | null; // 이 요소 뒤에 삽입 (insertBeforeMode가 true면 이 요소 앞에 삽입)
  insertBeforeMode?: boolean; // true면 afterEl 앞에 삽입 (첫 번째 블록 앞 삽입 시)
  showMenu: boolean; // 메뉴 펼침 여부
}

const PLACEHOLDER_HTML = `<!DOCTYPE html><html><head><meta charset="utf-8"></head><body style="padding:32px;font-family:sans-serif;color:#9ca3af;font-size:14px">
  HTML 파일을 불러오면 여기서 직접 편집할 수 있습니다.
</body></html>`;

/**
 * HTML 소스를 완전한 문서로 래핑하여 Blob URL 생성
 * - 원본 구조(CSS, 표, 목록, 번호) 완전 보존
 * - 외부 CSS 영향 완전 차단 (iframe 독립 문서로 로드)
 */
function buildBlobUrl(html: string): string {
  let fullHtml: string;
  // data-original-src 속성 제거 (저장 시 남아있을 수 있음)
  const cleanedHtml = html.replace(/\s*data-original-src=(["'])[^"']*?\1/gi, '');
  const isFullDoc = /^\s*<!DOCTYPE/i.test(cleanedHtml) || /^\s*<html/i.test(cleanedHtml);
  if (isFullDoc) {
    // 이미 완전한 HTML 문서 - /manus-storage/ 상대 경로를 절대 URL로 교체하여 blob URL에서도 이미지가 올바르게 표시되도록
    const origin = window.location.origin;
    fullHtml = cleanedHtml
      .replace(/src=(["'])(\/manus-storage\/)/gi, `src=$1${origin}/manus-storage/`)
      .replace(/href=(["'])(\/manus-storage\/)/gi, `href=$1${origin}/manus-storage/`)
      .replace(/url\((["']?)(\/manus-storage\/)/gi, `url($1${origin}/manus-storage/`);
  } else {
    // body 조각을 완전한 HTML 문서로 래핑
    // 브라우저 기본 스타일시트(user agent stylesheet)를 유지하도로
    // 최소한의 리셋만 적용
    // 원본 HTML에서 <style> 태그를 추출하여 fallback CSS 다음에 배치
    // → 원본 스타일이 fallback보다 나중에 선언되어 우선 적용됨
    const styleTagRegex = /<style[\s>][\s\S]*?<\/style>/gi;
    const styleTagMatches = cleanedHtml.match(styleTagRegex) || [];
    const htmlWithoutStyles = cleanedHtml.replace(styleTagRegex, '');
    const originalStyleTags = styleTagMatches.join('\n');

    const origin = window.location.origin;
    const htmlWithAbsoluteUrls = htmlWithoutStyles
      .replace(/src=(["'])(\/manus-storage\/)/gi, `src=$1${origin}/manus-storage/`)
      .replace(/href=(["'])(\/manus-storage\/)/gi, `href=$1${origin}/manus-storage/`)
      .replace(/url\((["']?)(\/manus-storage\/)/gi, `url($1${origin}/manus-storage/`);

    fullHtml = `<!DOCTYPE html>
<html>
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<style id="fallback-css">
  /* ─── 편집창 기본값 (PostDetail BlobIframe 미리보기와 동일) ─── */
  /* 원본 <style> 태그가 이 아래에 오므로 원본 CSS가 항상 우선 적용됨 */
  html, body { margin: 0; padding: 0; box-sizing: border-box; }
  body {
    padding: 16px;
    font-family: 'Noto Sans KR', 'Malgun Gothic', 'Apple SD Gothic Neo', sans-serif;
    font-size: 16px;
    line-height: 1.8;
    color: #374151;
    background: #fff;
    word-break: keep-all;
    overflow-wrap: break-word;
  }
  /* 블록 요소 기본 폭 제한 */
  *, *::before, *::after { box-sizing: border-box; }
  img, video, iframe, pre, table {
    max-width: 100%;
    height: auto;
  }
  /* p 태그 마진 - PostDetail html-source-content와 동일하게 */
  p { margin-top: 0; margin-bottom: 0; }
  /* 제목 태그 기본 마진 */
  h1, h2, h3, h4, h5, h6 { margin-top: 0.5em; margin-bottom: 0.3em; }
  /* 표 스타일 - 너비 완전 고정 + 선 진하게 */
  table { border-collapse: collapse !important; width: 100% !important; margin: 1.5em 0 2em; font-size: 15px; line-height: 1.6; color: #000; word-break: break-word; table-layout: fixed !important; }
  /* 모든 td/th에 진한 선 기본 적용 */
  td, th { border: 2px solid #64748b !important; overflow: hidden !important; word-break: break-word !important; overflow-wrap: break-word !important; max-width: 0; }
  table th:not([style*="background"]) {
    background: #1e3a5f;
    color: #ffffff;
    font-weight: 700;
  }
  table th:not([style*="padding"]) {
    padding: 11px 14px;
  }
  table th:not([style*="text-align"]) {
    text-align: left;
  }
  table td:not([style*="padding"]) {
    padding: 8px 12px;
    vertical-align: top;
  }
  /* tbody 행 배경: tr에 인라인 스타일 있으면 원본 배경색 유지 */
  table tbody tr:not([style]):nth-child(odd) td:not([style*="background"]) { background-color: #f8fafc; }
  table tbody tr:not([style]):nth-child(even) td:not([style*="background"]) { background-color: #ffffff; }
  /* thead th 헤더 */
  table thead th:not([style*="background"]) {
    background: #1e3a5f;
    color: #ffffff;
    font-weight: 700;
    text-align: center;
  }
  /* callout 박스 - 원본 style 태그가 없는 경우 fallback */
  .warn-box {
    border-left: 4px solid #f97316;
    background: #fff7ed;
    padding: 12px 16px;
    margin: 1em 0;
    border-radius: 0 6px 6px 0;
    font-size: 0.95em;
    color: #431407;
  }
  .tip-box {
    border-left: 4px solid #3b82f6;
    background: #eff6ff;
    padding: 12px 16px;
    margin: 1em 0;
    border-radius: 0 6px 6px 0;
    font-size: 0.95em;
    color: #1e3a5f;
  }
  .toc-box {
    border: 1px solid #e2e8f0;
    background: #f8fafc;
    padding: 12px 16px;
    margin: 1em 0;
    border-radius: 6px;
  }
  /* 목록 기본 스타일 */
  ul { list-style-type: disc; padding-left: 2em; margin: 0.5em 0; }
  ol { list-style-type: decimal; padding-left: 2em; margin: 0.5em 0; }
  li { display: list-item; }
  /* 이미지 */
  img { max-width: 100%; height: auto; }
  /* 원형 번호/배지 요소: 찌그러짐 방지 */
  [style*="border-radius: 50%"],
  [style*="border-radius:50%"],
  [style*="border-radius: 9999px"],
  [style*="border-radius:9999px"],
  .step-num, .toc-num, .num, .circle-num, .circle,
  .number-badge, .plugin-num, .badge-num {
    max-width: none !important;
    flex-shrink: 0 !important;
    display: inline-flex !important;
    align-items: center !important;
    justify-content: center !important;
  }
</style>
${originalStyleTags}
</head>
<body>${htmlWithAbsoluteUrls}</body>
</html>`;
  }
  const blob = new Blob([fullHtml], { type: 'text/html; charset=utf-8' });
  return URL.createObjectURL(blob);
}

/** Blob URL 리소스 해제 */
function revokeBlobUrl(url: string) {
  if (url && url.startsWith('blob:')) URL.revokeObjectURL(url);
}

// ─── 플로팅 서식 툴바 (텍스트 선택 / 블록 클릭 시) ──────────────────────────
interface FloatToolbarProps {
  mode?: 'selection' | 'block';
  blockEl?: HTMLElement | null;
  onCommand: (cmd: string, value?: string) => void;
  onClose: () => void;
  onInsertLink: () => void;
  onInsertButton: () => void;
  onConvertToTable: () => void;
  onBlockStyle?: (prop: string, value: string) => void;
  onUndo?: () => void;
  onRedo?: () => void;
  canUndo?: boolean;
  canRedo?: boolean;
  // 표 편집 통합: td/th 클릭 시 전달
  tableEl?: HTMLElement | null;
  cellEl?: HTMLElement | null;
  onTableAction?: (action: string) => void;
  onTableHeaderStyle?: (bg: string, borderWidth: string, borderColor: string) => void;
  // 블록 클릭 시 팝업 위치 (viewport 기준 fixed)
  popupX?: number;
  popupY?: number;
  popupBottom?: number;
  popupRight?: number; // 블록 우측 끝 x (viewport 기준)
  currentBlockType?: string; // 현재 블록 태그 (P, H2, BLOCKQUOTE 등)
  onChangeBlockType?: (newTag: string) => void; // 블록 유형 변경 콜백
}

function FloatToolbarUI({ mode = 'selection', blockEl, onCommand, onClose, onInsertLink, onInsertButton, onConvertToTable, onBlockStyle, onUndo, onRedo, canUndo, canRedo, tableEl, cellEl, onTableAction, onTableHeaderStyle, popupX, popupY, popupBottom, popupRight, currentBlockType, onChangeBlockType }: FloatToolbarProps) {
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
  const [showColorPicker, setShowColorPicker] = useState(false);
  const [showBgPicker, setShowBgPicker] = useState(false);
  const [showAlignMenu, setShowAlignMenu] = useState(false);
  const [showBlockBgPicker, setShowBlockBgPicker] = useState(false);
  const [lastTextColor, setLastTextColor] = useState("#ef4444");
  const [lastBgColor, setLastBgColor] = useState("#fef9c3");
  // 표 편집 탭 (통합)
  const [showTablePanel, setShowTablePanel] = useState(false);
  const [tableTab, setTableTab] = useState<"rowcol" | "merge" | "header">("rowcol");
  const [tblHeaderBg, setTblHeaderBg] = useState("#1e3a5f");
  const [tblHeaderBorderWidth, setTblHeaderBorderWidth] = useState("1px");
  const [tblHeaderBorderColor, setTblHeaderBorderColor] = useState("#334155");
  // 다운로드 버튼 블록 편집 패널
  const [showDlBtnPanel, setShowDlBtnPanel] = useState(false);
  // HR 속성 편집 패널
  const [showHrPanel, setShowHrPanel] = useState(false);
  const [localHrColor, setLocalHrColor] = useState('#e2e8f0');
  const [localHrHeight, setLocalHrHeight] = useState(2);
  const [localHrStyle, setLocalHrStyle] = useState<'solid'|'dashed'|'dotted'>('solid');
  const [localHrMargin, setLocalHrMargin] = useState(24);
  // BLOCKQUOTE 속성 편집 패널
  const [showBqPanel, setShowBqPanel] = useState(false);
  const [localBqBorderColor, setLocalBqBorderColor] = useState('#6366f1');
  const [localBqBg, setLocalBqBg] = useState('#f8f7ff');
  // DIV 블록(정보박스/경고박스) 속성 편집 패널
  const [showDivPanel, setShowDivPanel] = useState(false);
  const [localDivBorderColor, setLocalDivBorderColor] = useState('#3b82f6');
  const [localDivBg, setLocalDivBg] = useState('#eff6ff');
  // 다운로드 버튼 로컬 편집 상태 (슬라이더 실시간 반영용)
  const [localDlFontSize, setLocalDlFontSize] = useState(14);
  const [localDlPaddingV, setLocalDlPaddingV] = useState(10);
  const [localDlPaddingH, setLocalDlPaddingH] = useState(22);
  const [localDlBorderRadius, setLocalDlBorderRadius] = useState(8);
  const [localDlBtnText, setLocalDlBtnText] = useState('');
  const prevBlockElRef = useRef<HTMLElement | null>(null);

  // blockEl이 다운로드 버튼 블록으로 변경될 때 패널 자동 열기 + 로컬 상태 초기화
  useEffect(() => {
    if (blockEl === prevBlockElRef.current) return;
    prevBlockElRef.current = blockEl || null;
    // 다운로드 버튼 블록 감지
    const anchor: HTMLAnchorElement | null = (() => {
      if (!blockEl) return null;
      if (blockEl.tagName === 'A' && (blockEl.hasAttribute('download') || (blockEl as HTMLAnchorElement).href?.includes('/manus-storage/'))) return blockEl as HTMLAnchorElement;
      return blockEl.querySelector('a[download], a[href*="/manus-storage/"]') as HTMLAnchorElement | null;
    })();
    if (anchor) {
      const cs = window.getComputedStyle(anchor);
      setLocalDlFontSize(parseInt(anchor.style.fontSize || cs.fontSize || '14') || 14);
      setLocalDlPaddingV(parseInt(anchor.style.paddingTop || cs.paddingTop || '10') || 10);
      setLocalDlPaddingH(parseInt(anchor.style.paddingLeft || cs.paddingLeft || '22') || 22);
      setLocalDlBorderRadius(parseInt(anchor.style.borderRadius || cs.borderRadius || '8') || 8);
      setLocalDlBtnText(anchor.innerText || '');
      setShowDlBtnPanel(true);
      setShowHrPanel(false); setShowBqPanel(false); setShowDivPanel(false);
    } else {
      setShowDlBtnPanel(false);
    }

    // HR 블록 감지 시 패널 자동 열기
    if (!anchor && blockEl) {
      const tag = blockEl.tagName;
      if (tag === 'HR') {
        const borderColor = blockEl.style.borderTopColor || blockEl.style.borderColor || '#e2e8f0';
        const height = parseInt(blockEl.style.borderTopWidth || blockEl.style.height || '2') || 2;
        const bStyle = (blockEl.style.borderTopStyle || blockEl.style.borderStyle || 'solid') as 'solid'|'dashed'|'dotted';
        const margin = parseInt(blockEl.style.marginTop || '24') || 24;
        setLocalHrColor(borderColor.startsWith('rgb') || borderColor === '' ? '#e2e8f0' : borderColor);
        setLocalHrHeight(height);
        setLocalHrStyle(bStyle === 'dashed' ? 'dashed' : bStyle === 'dotted' ? 'dotted' : 'solid');
        setLocalHrMargin(margin);
        setShowHrPanel(true); setShowBqPanel(false); setShowDivPanel(false);
      } else if (tag === 'BLOCKQUOTE') {
        const borderColor = blockEl.style.borderLeftColor || '#6366f1';
        const bg = blockEl.style.backgroundColor || '#f8f7ff';
        setLocalBqBorderColor(borderColor.startsWith('rgb') || borderColor === '' ? '#6366f1' : borderColor);
        setLocalBqBg(bg.startsWith('rgb') || bg === '' ? '#f8f7ff' : bg);
        setShowBqPanel(true); setShowHrPanel(false); setShowDivPanel(false);
      } else if (tag === 'DIV') {
        const borderColor = blockEl.style.borderLeftColor || blockEl.style.borderColor || '#3b82f6';
        const bg = blockEl.style.backgroundColor || '#eff6ff';
        setLocalDivBorderColor(borderColor.startsWith('rgb') || borderColor === '' ? '#3b82f6' : borderColor);
        setLocalDivBg(bg.startsWith('rgb') || bg === '' ? '#eff6ff' : bg);
        setShowDivPanel(true); setShowHrPanel(false); setShowBqPanel(false);
      } else {
        setShowHrPanel(false); setShowBqPanel(false); setShowDivPanel(false);
      }
    }
  }, [blockEl]);

  const btn: React.CSSProperties = {
    background: "none", border: "none", color: "#fff",
    cursor: "pointer", padding: "4px 7px", borderRadius: 4,
    fontSize: 13, fontWeight: 700, display: "flex", alignItems: "center",
    whiteSpace: "nowrap",
  };
  const sep = <div style={{ width: 1, height: 20, background: "#444", margin: "0 3px" }} />;
  // 블록 현재 스타일 읽기
  const blockStyle = blockEl ? window.getComputedStyle(blockEl) : null;
  const currentAlign = blockEl?.style.textAlign || blockStyle?.textAlign || 'left';
  const currentBg = blockEl?.style.backgroundColor || '';
  const anyColorOpen = showColorPicker || showBgPicker || showBlockBgPicker;
  // 다운로드 버튼 블록 감지: <a> 태그이며 download 속성 또는 /manus-storage/ href를 가진 경우
  const dlAnchorEl: HTMLAnchorElement | null = (() => {
    if (!blockEl) return null;
    if (blockEl.tagName === 'A' && (blockEl.hasAttribute('download') || (blockEl as HTMLAnchorElement).href?.includes('/manus-storage/'))) {
      return blockEl as HTMLAnchorElement;
    }
    // 래퍼 <div> 안의 <a> 감지
    const inner = blockEl.querySelector('a[download], a[href*="/manus-storage/"]') as HTMLAnchorElement | null;
    return inner;
  })();
  const isDlBtnBlock = !!dlAnchorEl;
  // 다운로드 버튼 현재 스타일 읽기
  const dlAnchorStyle = dlAnchorEl ? window.getComputedStyle(dlAnchorEl) : null;
  const dlFontSizePx = dlAnchorEl ? (parseInt(dlAnchorEl.style.fontSize || dlAnchorStyle?.fontSize || '14') || 14) : 14;
  const dlPaddingVPx = dlAnchorEl ? (parseInt(dlAnchorEl.style.paddingTop || dlAnchorStyle?.paddingTop || '10') || 10) : 10;
  const dlPaddingHPx = dlAnchorEl ? (parseInt(dlAnchorEl.style.paddingLeft || dlAnchorStyle?.paddingLeft || '22') || 22) : 22;
  const dlBorderRadiusPx = dlAnchorEl ? (parseInt(dlAnchorEl.style.borderRadius || dlAnchorStyle?.borderRadius || '8') || 8) : 8;
  const dlBgColor = dlAnchorEl ? (dlAnchorEl.style.background || dlAnchorEl.style.backgroundColor || dlAnchorStyle?.backgroundColor || '#3b82f6') : '#3b82f6';
  const dlTextColor = dlAnchorEl ? (dlAnchorEl.style.color || dlAnchorStyle?.color || '#ffffff') : '#ffffff';
  // 래퍼 블록(div) 정렬
  const dlWrapperEl: HTMLElement | null = dlAnchorEl ? (dlAnchorEl.parentElement?.tagName === 'DIV' ? dlAnchorEl.parentElement : null) : null;
  const dlAlign = dlWrapperEl ? (dlWrapperEl.style.textAlign || 'center') : 'center';
  // 다운로드 버튼 텍스트 (현재 innerText 기준)
  const dlBtnText = dlAnchorEl ? dlAnchorEl.innerText : '';
  // 팝업 모드 사용 안 함 - 툴바는 항상 sticky 바에 표시
  // popupX, popupY, popupBottom, popupRight는 현재 사용되지 않지만 향후 확장을 위해 props로 유지
  void popupX; void popupY; void popupBottom; void popupRight;
  const popupStyle: React.CSSProperties | undefined = undefined;

  const toolbarInner = (
    <div
      style={popupStyle ?? {
        background: "#1e1e2e",
        borderBottom: "1px solid #2d2d44",
        display: "flex", flexDirection: "column", userSelect: "none",
        width: "100%",
      }}
      onMouseDown={e => e.preventDefault()}
    >
    {/* 블록 팝업 모드: 헤더 + 닫기 버튼 */}
    {mode === 'block' && popupStyle && (
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "6px 10px 4px", borderBottom: "1px solid #3d3d5c" }}>
        <span style={{ fontSize: 11, fontWeight: 700, color: "#a5b4fc" }}>✏️ 블록 편집</span>
        <button type="button"
          onMouseDown={e => { e.preventDefault(); onClose(); }}
          style={{ background: "none", border: "none", color: "#94a3b8", cursor: "pointer", fontSize: 16, padding: "0 4px", lineHeight: 1 }}
          title="닫기">✕</button>
      </div>
    )}
    {/* ── 1행: 버튼들 ── */}
    <div style={{ display: "flex", alignItems: "center", gap: 2, padding: "4px 8px", flexWrap: "wrap", overflowX: "auto" }}>

      {/* ── 실행 취소 / 다시 실행 ── */}
      {onUndo && (
        <button type="button"
          style={{ ...btn, opacity: canUndo ? 1 : 0.35, cursor: canUndo ? 'pointer' : 'not-allowed', fontSize: 15 }}
          title="실행 취소 (Ctrl+Z)"
          onMouseDown={e => { e.preventDefault(); if (canUndo) onUndo(); }}
        >↩</button>
      )}
      {onRedo && (
        <button type="button"
          style={{ ...btn, opacity: canRedo ? 1 : 0.35, cursor: canRedo ? 'pointer' : 'not-allowed', fontSize: 15 }}
          title="다시 실행 (Ctrl+Y)"
          onMouseDown={e => { e.preventDefault(); if (canRedo) onRedo(); }}
        >↪</button>
      )}
      {(onUndo || onRedo) && sep}

      {/* ── 텍스트 서식 (선택 모드 + 블록 모드 공통) ── */}
      <button type="button" style={btn} title="굵게 (Ctrl+B)" onMouseDown={() => onCommand("bold")}><b>B</b></button>
      <button type="button" style={btn} title="기울임 (Ctrl+I)" onMouseDown={() => onCommand("italic")}><i>I</i></button>
      <button type="button" style={btn} title="밑줄 (Ctrl+U)" onMouseDown={() => onCommand("underline")}><u>U</u></button>
      <button type="button" style={btn} title="취소선" onMouseDown={() => onCommand("strikeThrough")}><s>S</s></button>
      {sep}

      {/* ── 정렬 ── */}
      {/* 왼쪽 정렬 */}
      <button type="button"
        style={{ ...btn, background: currentAlign === 'left' || currentAlign === 'start' ? '#4f46e5' : 'none',
          border: currentAlign === 'left' || currentAlign === 'start' ? '1px solid #6366f1' : '1px solid transparent',
          borderRadius: 4, padding: '3px 6px', minWidth: 28 }}
        title="왼쪽 정렬" onMouseDown={() => {
          onCommand("justifyLeft");
          if (mode === 'block' && blockEl && onBlockStyle) onBlockStyle('textAlign', 'left');
        }}>
        <svg width="14" height="14" viewBox="0 0 14 14" fill="none" xmlns="http://www.w3.org/2000/svg">
          <line x1="1" y1="3" x2="13" y2="3" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
          <line x1="1" y1="6" x2="9" y2="6" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
          <line x1="1" y1="9" x2="13" y2="9" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
          <line x1="1" y1="12" x2="7" y2="12" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
        </svg>
      </button>
      {/* 가운데 정렬 */}
      <button type="button"
        style={{ ...btn, background: currentAlign === 'center' ? '#4f46e5' : 'none',
          border: currentAlign === 'center' ? '1px solid #6366f1' : '1px solid transparent',
          borderRadius: 4, padding: '3px 6px', minWidth: 28 }}
        title="가운데 정렬" onMouseDown={() => {
          onCommand("justifyCenter");
          if (mode === 'block' && blockEl && onBlockStyle) onBlockStyle('textAlign', 'center');
        }}>
        <svg width="14" height="14" viewBox="0 0 14 14" fill="none" xmlns="http://www.w3.org/2000/svg">
          <line x1="1" y1="3" x2="13" y2="3" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
          <line x1="3" y1="6" x2="11" y2="6" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
          <line x1="1" y1="9" x2="13" y2="9" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
          <line x1="3" y1="12" x2="11" y2="12" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
        </svg>
      </button>
      {/* 오른쪽 정렬 */}
      <button type="button"
        style={{ ...btn, background: currentAlign === 'right' ? '#4f46e5' : 'none',
          border: currentAlign === 'right' ? '1px solid #6366f1' : '1px solid transparent',
          borderRadius: 4, padding: '3px 6px', minWidth: 28 }}
        title="오른쪽 정렬" onMouseDown={() => {
          onCommand("justifyRight");
          if (mode === 'block' && blockEl && onBlockStyle) onBlockStyle('textAlign', 'right');
        }}>
        <svg width="14" height="14" viewBox="0 0 14 14" fill="none" xmlns="http://www.w3.org/2000/svg">
          <line x1="1" y1="3" x2="13" y2="3" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
          <line x1="5" y1="6" x2="13" y2="6" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
          <line x1="1" y1="9" x2="13" y2="9" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
          <line x1="7" y1="12" x2="13" y2="12" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
        </svg>
      </button>
      {/* 양쪽 정렬 */}
      <button type="button"
        style={{ ...btn, background: currentAlign === 'justify' ? '#4f46e5' : 'none',
          border: currentAlign === 'justify' ? '1px solid #6366f1' : '1px solid transparent',
          borderRadius: 4, padding: '3px 6px', minWidth: 28 }}
        title="양쪽 정렬" onMouseDown={() => {
          onCommand("justifyFull");
          if (mode === 'block' && blockEl && onBlockStyle) onBlockStyle('textAlign', 'justify');
        }}>
        <svg width="14" height="14" viewBox="0 0 14 14" fill="none" xmlns="http://www.w3.org/2000/svg">
          <line x1="1" y1="3" x2="13" y2="3" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
          <line x1="1" y1="6" x2="13" y2="6" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
          <line x1="1" y1="9" x2="13" y2="9" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
          <line x1="1" y1="12" x2="13" y2="12" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
        </svg>
      </button>
      {sep}

      {/* ── 들여쓰기 ── */}
      <button type="button" style={btn} title="들여쓰기" onMouseDown={() => onCommand("indent")}>→|</button>
      <button type="button" style={btn} title="내어쓰기" onMouseDown={() => onCommand("outdent")}>|←</button>
      {sep}

      {/* ── 블록 유형 (본문/소제목/인용구) ── */}
      {onChangeBlockType && (
        <>
          <select
            style={{
              background: "#2d2d44", color: "#fff", border: "1px solid #555",
              borderRadius: 4, fontSize: 12, padding: "2px 4px", cursor: "pointer", maxWidth: 80,
            }}
            value={currentBlockType === 'H2' ? 'H2' : currentBlockType === 'BLOCKQUOTE' ? 'BLOCKQUOTE' : 'P'}
            onMouseDown={e => e.stopPropagation()}
            onChange={e => {
              if (e.target.value && onChangeBlockType) {
                onChangeBlockType(e.target.value);
              }
            }}
            title="블록 유형 변경"
          >
            <option value="P">본문</option>
            <option value="H2">소제목(H2)</option>
            <option value="BLOCKQUOTE">인용구</option>
          </select>
          {sep}
        </>
      )}

      {/* ── 글자 크기 ── */}
      <select
        style={{
          background: "#2d2d44", color: "#fff", border: "1px solid #555",
          borderRadius: 4, fontSize: 12, padding: "2px 4px", cursor: "pointer", maxWidth: 68,
        }}
        defaultValue=""
        onMouseDown={e => e.stopPropagation()}
        onChange={e => {
          if (e.target.value) {
            onCommand("fontSize_custom", e.target.value);
            e.target.value = "";
          }
        }}
        title="글자 크기"
      >
        <option value="" disabled>크기</option>
        {[10,11,12,13,14,15,16,17,18,20,22,24,26,28,30,32,36,40,44,48,52,56,60,64,72,80,96].map(s => (
          <option key={s} value={`${s}px`}>{s}</option>
        ))}
      </select>
      {sep}

      {/* ── 글자 색상 ── */}
      <div style={{ display: "flex", alignItems: "center", borderRadius: 4, overflow: "hidden", border: "1px solid #444" }}>
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
          onMouseDown={e => { e.preventDefault(); setShowColorPicker(v => !v); setShowBgPicker(false); setShowBlockBgPicker(false); }}
        >▾</button>
      </div>

      {/* ── 텍스트 배경색 (하이라이트) ── */}
      <div style={{ display: "flex", alignItems: "center", borderRadius: 4, overflow: "hidden", border: "1px solid #444" }}>
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
          onMouseDown={e => { e.preventDefault(); setShowBgPicker(v => !v); setShowColorPicker(false); setShowBlockBgPicker(false); }}
        >▾</button>
      </div>
      {sep}

      {/* ── 블록 배경색 (블록 클릭 모드에서만) ── */}
      {mode === 'block' && onBlockStyle && (
        <button type="button"
          style={{ ...btn, fontSize: 11, padding: "4px 6px", background: showBlockBgPicker ? '#3b3b5c' : 'none' }}
          title="블록 배경색"
          onMouseDown={e => { e.preventDefault(); setShowBlockBgPicker(v => !v); setShowColorPicker(false); setShowBgPicker(false); }}
        >
          <span style={{ display: "inline-block", width: 12, height: 12, borderRadius: 2,
            background: currentBg || '#3b3b5c', border: "1px solid #aaa", marginRight: 3 }} />
          블록배경{showBlockBgPicker ? '▲' : '▼'}
        </button>
      )}
      {mode === 'block' && onBlockStyle && sep}

      {/* ── 블록 패딩 (블록 클릭 모드에서만) ── */}
      {mode === 'block' && onBlockStyle && (
        <>
          <button type="button" style={{ ...btn, fontSize: 11 }} title="위 여백 추가" onMouseDown={() => {
            if (blockEl) {
              const cur = parseInt(blockEl.style.paddingTop || '0') || 0;
              onBlockStyle('paddingTop', `${cur + 8}px`);
            }
          }}>↑여백</button>
          <button type="button" style={{ ...btn, fontSize: 11 }} title="아래 여백 추가" onMouseDown={() => {
            if (blockEl) {
              const cur = parseInt(blockEl.style.paddingBottom || '0') || 0;
              onBlockStyle('paddingBottom', `${cur + 8}px`);
            }
          }}>↓여백</button>
          {sep}
        </>
      )}

      {/* ── 다운로드 버튼 편집 패널 토글 (다운로드 버튼 블록 클릭 시에만) ── */}
      {mode === 'block' && isDlBtnBlock && (
        <>
          {sep}
          <button type="button"
            style={{ ...btn, fontSize: 11, background: showDlBtnPanel ? '#3b3b5c' : 'none', border: showDlBtnPanel ? '1px solid #6366f1' : '1px solid transparent', borderRadius: 4 }}
            title="다운로드 버튼 스타일 편집"
            onMouseDown={e => { e.preventDefault(); setShowDlBtnPanel(v => !v); setShowTablePanel(false); setShowColorPicker(false); setShowBgPicker(false); setShowBlockBgPicker(false); }}
          >⬇️ 버튼 편집{showDlBtnPanel ? '▲' : '▼'}</button>
          {sep}
        </>
      )}

      {/* ── 링크/버튼/표 ── */}
      <button type="button" style={{ ...btn, fontSize: 11 }} title="링크 삽입" onMouseDown={onInsertLink}>🔗 링크</button>
      <button type="button" style={{ ...btn, fontSize: 11 }} title="버튼으로 변환" onMouseDown={onInsertButton}>🎨 버튼</button>
      <button type="button" style={{ ...btn, fontSize: 11 }} title="선택 텍스트를 표로 변환" onMouseDown={onConvertToTable}>📊 표 삽입</button>
      {/* 표 편집 버튼: 표 셀 클릭 시에만 표시 */}
      {tableEl && cellEl && (
        <button type="button"
          style={{ ...btn, fontSize: 11, background: showTablePanel ? '#3b3b5c' : 'none', border: showTablePanel ? '1px solid #6366f1' : '1px solid transparent', borderRadius: 4 }}
          title="표 편집"
          onMouseDown={e => { e.preventDefault(); setShowTablePanel(v => !v); setShowColorPicker(false); setShowBgPicker(false); setShowBlockBgPicker(false); }}
        >🗂️ 표 편집{showTablePanel ? '▲' : '▼'}</button>
      )}
      <button type="button" style={{ ...btn, color: "#aaa" }} title="닫기" onMouseDown={onClose}>✕</button>
    </div>

    {/* ── 2행: 색상 팔레트 (열린 경우에만 표시) ── */}
    {anyColorOpen && (
      <div style={{
        borderTop: "1px solid #333",
        padding: "6px 8px",
        display: "flex", alignItems: "center", gap: 6, flexWrap: "wrap",
        background: "#2d2d44",
        borderRadius: "0 0 8px 8px",
      }}>
        {showColorPicker && (
          <>
            <span style={{ color: "#aaa", fontSize: 11, marginRight: 2, flexShrink: 0 }}>텍스트 색상</span>
            {TEXT_COLORS.map(c => (
              <button type="button" key={c} title={c}
                onMouseDown={e => {
                  e.preventDefault();
                  onCommand("foreColor", c);
                  setLastTextColor(c);
                  setShowColorPicker(false);
                }}
                style={{ width: 20, height: 20, borderRadius: "50%", background: c,
                  border: c === "#ffffff" ? "2px solid #999" : "1px solid rgba(255,255,255,0.15)",
                  cursor: "pointer", padding: 0, flexShrink: 0,
                  outline: c === lastTextColor ? "2px solid #6366f1" : "none",
                  outlineOffset: 1 }} />
            ))}
            <input type="color" title="직접 선택"
              style={{ width: 20, height: 20, borderRadius: "50%", border: "1px solid #666", cursor: "pointer", padding: 0, flexShrink: 0 }}
              onMouseDown={e => e.stopPropagation()}
              onChange={e => { onCommand("foreColor", e.target.value); setLastTextColor(e.target.value); }} />
          </>
        )}
        {showBgPicker && (
          <>
            <span style={{ color: "#aaa", fontSize: 11, marginRight: 2, flexShrink: 0 }}>배경 색상</span>
            {BG_COLORS.map(c => (
              <button type="button" key={c} title={c === 'transparent' ? '없음' : c}
                onMouseDown={e => {
                  e.preventDefault();
                  onCommand("hiliteColor", c === 'transparent' ? 'transparent' : c);
                  setLastBgColor(c);
                  setShowBgPicker(false);
                }}
                style={{ width: 20, height: 20, borderRadius: 3,
                  background: c === 'transparent' ? 'repeating-linear-gradient(45deg,#aaa 0,#aaa 2px,#fff 0,#fff 6px)' : c,
                  border: "1px solid #666", cursor: "pointer", padding: 0, flexShrink: 0,
                  outline: c === lastBgColor ? "2px solid #6366f1" : "none",
                  outlineOffset: 1 }} />
            ))}
            <input type="color" title="직접 선택"
              style={{ width: 20, height: 20, borderRadius: 3, border: "1px solid #666", cursor: "pointer", padding: 0, flexShrink: 0 }}
              onMouseDown={e => e.stopPropagation()}
              onChange={e => { onCommand("hiliteColor", e.target.value); setLastBgColor(e.target.value); }} />
          </>
        )}
        {showBlockBgPicker && mode === 'block' && onBlockStyle && (
          <>
            <span style={{ color: "#aaa", fontSize: 11, marginRight: 2 }}>블록배경</span>
            {[...BG_COLORS, "#fff3cd","#d1ecf1","#d4edda","#f8d7da"].map(c => (
              <button type="button" key={c} title={c === 'transparent' ? '없음' : c}
                onMouseDown={e => {
                  e.preventDefault();
                  onBlockStyle('backgroundColor', c === 'transparent' ? '' : c);
                  setShowBlockBgPicker(false);
                }}
                style={{ width: 22, height: 22, borderRadius: 3,
                  background: c === 'transparent' ? 'repeating-linear-gradient(45deg,#aaa 0,#aaa 2px,#fff 0,#fff 6px)' : c,
                  border: "1px solid #666", cursor: "pointer", padding: 0, flexShrink: 0 }} />
            ))}
            <input type="color" title="직접 선택"
              style={{ width: 22, height: 22, borderRadius: 3, border: "none", cursor: "pointer", padding: 0, flexShrink: 0 }}
              onMouseDown={e => e.stopPropagation()}
              onChange={e => { onBlockStyle('backgroundColor', e.target.value); }} />
          </>
        )}
      </div>
    )}
    {/* ── 3행: 다운로드 버튼 편집 패널 ── */}
    {showDlBtnPanel && isDlBtnBlock && dlAnchorEl && (
      <div style={{
        borderTop: "1px solid #333",
        background: "#2d2d44",
        borderRadius: "0 0 8px 8px",
        padding: "8px 12px",
        display: "flex", flexDirection: "column", gap: 8,
      }}>
        <div style={{ color: '#93c5fd', fontSize: 11, fontWeight: 700, marginBottom: 2 }}>⬇️ 다운로드 버튼 스타일</div>
        {/* 글자 크기 + 모서리 */}
        <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap' }}>
          <div style={{ flex: 1, minWidth: 140 }}>
            <label style={{ color: '#aaa', fontSize: 11, display: 'block', marginBottom: 3 }}>글자 크기: {localDlFontSize}px</label>
            <input type="range" min={10} max={28} value={localDlFontSize}
              style={{ width: '100%', accentColor: '#6366f1' }}
              onMouseDown={e => e.stopPropagation()}
              onChange={e => {
                const v = Number(e.target.value);
                setLocalDlFontSize(v);
                dlAnchorEl.style.fontSize = `${v}px`;
                if (onBlockStyle) onBlockStyle('_noop', '');
              }} />
          </div>
          <div style={{ flex: 1, minWidth: 140 }}>
            <label style={{ color: '#aaa', fontSize: 11, display: 'block', marginBottom: 3 }}>모서리: {localDlBorderRadius}px</label>
            <input type="range" min={0} max={40} value={localDlBorderRadius}
              style={{ width: '100%', accentColor: '#6366f1' }}
              onMouseDown={e => e.stopPropagation()}
              onChange={e => {
                const v = Number(e.target.value);
                setLocalDlBorderRadius(v);
                dlAnchorEl.style.borderRadius = `${v}px`;
                if (onBlockStyle) onBlockStyle('_noop', '');
              }} />
          </div>
        </div>
        {/* 상하 패딩 + 좌우 패딩 */}
        <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap' }}>
          <div style={{ flex: 1, minWidth: 140 }}>
            <label style={{ color: '#aaa', fontSize: 11, display: 'block', marginBottom: 3 }}>상하 패딩: {localDlPaddingV}px</label>
            <input type="range" min={4} max={24} value={localDlPaddingV}
              style={{ width: '100%', accentColor: '#6366f1' }}
              onMouseDown={e => e.stopPropagation()}
              onChange={e => {
                const v = Number(e.target.value);
                setLocalDlPaddingV(v);
                dlAnchorEl.style.paddingTop = `${v}px`;
                dlAnchorEl.style.paddingBottom = `${v}px`;
                if (onBlockStyle) onBlockStyle('_noop', '');
              }} />
          </div>
          <div style={{ flex: 1, minWidth: 140 }}>
            <label style={{ color: '#aaa', fontSize: 11, display: 'block', marginBottom: 3 }}>좌우 패딩: {localDlPaddingH}px</label>
            <input type="range" min={8} max={60} value={localDlPaddingH}
              style={{ width: '100%', accentColor: '#6366f1' }}
              onMouseDown={e => e.stopPropagation()}
              onChange={e => {
                const v = Number(e.target.value);
                setLocalDlPaddingH(v);
                dlAnchorEl.style.paddingLeft = `${v}px`;
                dlAnchorEl.style.paddingRight = `${v}px`;
                if (onBlockStyle) onBlockStyle('_noop', '');
              }} />
          </div>
        </div>
        {/* 버튼 텍스트 편집 */}
        <div>
          <label style={{ color: '#aaa', fontSize: 11, display: 'block', marginBottom: 3 }}>버튼 텍스트</label>
          <input
            type="text"
            value={localDlBtnText}
            style={{ width: '100%', padding: '5px 8px', borderRadius: 5, border: '1px solid #4b5563', background: '#1e1e2e', color: '#fff', fontSize: 12 }}
            onMouseDown={e => e.stopPropagation()}
            onChange={e => {
              const v = e.target.value;
              setLocalDlBtnText(v);
              if (dlAnchorEl) {
                dlAnchorEl.innerText = v;
                if (onBlockStyle) onBlockStyle('_noop', '');
              }
            }}
          />
        </div>
        {/* 정렬 + 배경색 + 글자색 */}
        <div style={{ display: 'flex', gap: 12, alignItems: 'flex-start', flexWrap: 'wrap' }}>
          <div>
            <label style={{ color: '#aaa', fontSize: 11, display: 'block', marginBottom: 3 }}>정렬</label>
            <div style={{ display: 'flex', gap: 4 }}>
              {(['left','center','right'] as const).map(a => (
                <button type="button" key={a}
                  style={{ ...btn, fontSize: 12, padding: '3px 8px',
                    background: dlAlign === a ? '#4f46e5' : '#3b3b5c',
                    border: dlAlign === a ? '1px solid #6366f1' : '1px solid #555',
                    borderRadius: 4 }}
                  onMouseDown={e => {
                    e.preventDefault();
                    if (dlWrapperEl) {
                      dlWrapperEl.style.textAlign = a;
                      if (onBlockStyle) onBlockStyle('_noop', '');
                    }
                  }}
                >{a === 'left' ? '⬅' : a === 'center' ? '⬌' : '➡'}</button>
              ))}
            </div>
          </div>
          <div>
            <label style={{ color: '#aaa', fontSize: 11, display: 'block', marginBottom: 3 }}>배경색</label>
            <div style={{ display: 'flex', gap: 4, alignItems: 'center' }}>
              {['#3b82f6','#10b981','#ef4444','#6b7280','#8b5cf6','#f59e0b','#ec4899','#1e293b'].map(c => (
                <button type="button" key={c}
                  style={{ width: 22, height: 22, borderRadius: 4, background: c,
                    border: dlBgColor === c ? '2px solid #fff' : '1px solid rgba(255,255,255,0.2)',
                    cursor: 'pointer', padding: 0, flexShrink: 0 }}
                  onMouseDown={e => {
                    e.preventDefault();
                    dlAnchorEl.style.background = c;
                    dlAnchorEl.style.backgroundColor = c;
                    if (onBlockStyle) onBlockStyle('_noop', '');
                  }} />
              ))}
              <input type="color" value={dlBgColor.startsWith('#') ? dlBgColor : '#3b82f6'} title="직접 선택"
                style={{ width: 22, height: 22, borderRadius: 4, border: '1px solid #666', cursor: 'pointer', padding: 0, flexShrink: 0 }}
                onMouseDown={e => e.stopPropagation()}
                onChange={e => {
                  dlAnchorEl.style.background = e.target.value;
                  dlAnchorEl.style.backgroundColor = e.target.value;
                  if (onBlockStyle) onBlockStyle('_noop', '');
                }} />
            </div>
          </div>
          {/* 글자 색상 */}
          <div>
            <label style={{ color: '#aaa', fontSize: 11, display: 'block', marginBottom: 3 }}>글자 색상</label>
            <div style={{ display: 'flex', gap: 4, alignItems: 'center' }}>
              {['#ffffff','#000000','#fef08a','#bbf7d0','#fecaca','#bfdbfe','#e9d5ff','#fed7aa'].map(c => (
                <button type="button" key={c}
                  style={{ width: 22, height: 22, borderRadius: 4, background: c,
                    border: dlTextColor === c ? '2px solid #6366f1' : '1px solid rgba(255,255,255,0.2)',
                    cursor: 'pointer', padding: 0, flexShrink: 0 }}
                  onMouseDown={e => {
                    e.preventDefault();
                    dlAnchorEl.style.color = c;
                    if (onBlockStyle) onBlockStyle('_noop', '');
                  }} />
              ))}
              <input type="color" value={dlTextColor.startsWith('#') ? dlTextColor : '#ffffff'} title="글자색 직접 선택"
                style={{ width: 22, height: 22, borderRadius: 4, border: '1px solid #666', cursor: 'pointer', padding: 0, flexShrink: 0 }}
                onMouseDown={e => e.stopPropagation()}
                onChange={e => {
                  dlAnchorEl.style.color = e.target.value;
                  if (onBlockStyle) onBlockStyle('_noop', '');
                }} />
            </div>
          </div>
        </div>
      </div>
    )}

    {/* ── 4행: 표 편집 패널 (표 셀 클릭 시에만 표시) ── */}
    {showTablePanel && tableEl && cellEl && (
      <div style={{
        borderTop: "1px solid #333",
        background: "#2d2d44",
        borderRadius: "0 0 8px 8px",
        padding: "6px 8px",
      }}>
        {/* 탭 선택 */}
        <div style={{ display: "flex", gap: 4, marginBottom: 6 }}>
          {(["rowcol", "merge", "header"] as const).map(tab => (
            <button type="button" key={tab}
              style={{ ...btn, fontSize: 11, padding: "3px 8px",
                background: tableTab === tab ? '#4f46e5' : '#3b3b5c',
                border: tableTab === tab ? '1px solid #6366f1' : '1px solid #555',
                borderRadius: 4 }}
              onMouseDown={e => { e.preventDefault(); setTableTab(tab); }}
            >{tab === 'rowcol' ? '행/열' : tab === 'merge' ? '병합' : '헤더 스타일'}</button>
          ))}
        </div>
        {/* 행/열 탭 */}
        {tableTab === 'rowcol' && (
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
            <button type="button" style={{ ...btn, fontSize: 11, background: '#3b3b5c', border: '1px solid #555', borderRadius: 4 }}
              onMouseDown={e => { e.preventDefault(); onTableAction?.('insertRowAbove'); }}>↑ 위에 행 추가</button>
            <button type="button" style={{ ...btn, fontSize: 11, background: '#3b3b5c', border: '1px solid #555', borderRadius: 4 }}
              onMouseDown={e => { e.preventDefault(); onTableAction?.('insertRowBelow'); }}>↓ 아래에 행 추가</button>
            <button type="button" style={{ ...btn, fontSize: 11, background: '#3b3b5c', border: '1px solid #555', borderRadius: 4 }}
              onMouseDown={e => { e.preventDefault(); onTableAction?.('deleteRow'); }}>✕ 행 삭제</button>
            <button type="button" style={{ ...btn, fontSize: 11, background: '#3b3b5c', border: '1px solid #555', borderRadius: 4 }}
              onMouseDown={e => { e.preventDefault(); onTableAction?.('insertColLeft'); }}>← 왼쪽에 열 추가</button>
            <button type="button" style={{ ...btn, fontSize: 11, background: '#3b3b5c', border: '1px solid #555', borderRadius: 4 }}
              onMouseDown={e => { e.preventDefault(); onTableAction?.('insertColRight'); }}>→ 오른쪽에 열 추가</button>
            <button type="button" style={{ ...btn, fontSize: 11, background: '#3b3b5c', border: '1px solid #555', borderRadius: 4 }}
              onMouseDown={e => { e.preventDefault(); onTableAction?.('deleteCol'); }}>✕ 열 삭제</button>
            <button type="button" style={{ ...btn, fontSize: 11, background: '#c0392b', border: '1px solid #e74c3c', borderRadius: 4 }}
              onMouseDown={e => { e.preventDefault(); onTableAction?.('deleteTable'); }}>🗑 표 삭제</button>
          </div>
        )}
        {/* 병합 탭 */}
        {tableTab === 'merge' && (
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
            <button type="button" style={{ ...btn, fontSize: 11, background: '#3b3b5c', border: '1px solid #555', borderRadius: 4 }}
              onMouseDown={e => { e.preventDefault(); onTableAction?.('mergeRight'); }}>→ 오른쪽 셀과 병합</button>
            <button type="button" style={{ ...btn, fontSize: 11, background: '#3b3b5c', border: '1px solid #555', borderRadius: 4 }}
              onMouseDown={e => { e.preventDefault(); onTableAction?.('mergeDown'); }}>↓ 아래 셀과 병합</button>
            <button type="button" style={{ ...btn, fontSize: 11, background: '#3b3b5c', border: '1px solid #555', borderRadius: 4 }}
              onMouseDown={e => { e.preventDefault(); onTableAction?.('splitCell'); }}>✂ 셀 분리</button>
          </div>
        )}
        {/* 헤더 스타일 탭 */}
        {tableTab === 'header' && (
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, alignItems: 'center' }}>
            <label style={{ color: '#aaa', fontSize: 11 }}>헤더 배경</label>
            <input type="color" value={tblHeaderBg}
              style={{ width: 24, height: 24, borderRadius: 4, border: '1px solid #666', cursor: 'pointer', padding: 0 }}
              onMouseDown={e => e.stopPropagation()}
              onChange={e => setTblHeaderBg(e.target.value)} />
            <label style={{ color: '#aaa', fontSize: 11 }}>테두리 두께</label>
            <select value={tblHeaderBorderWidth}
              style={{ background: '#2d2d44', color: '#fff', border: '1px solid #555', borderRadius: 4, fontSize: 11, padding: '2px 4px' }}
              onMouseDown={e => e.stopPropagation()}
              onChange={e => setTblHeaderBorderWidth(e.target.value)}>
              {['0px','1px','2px','3px'].map(w => <option key={w} value={w}>{w}</option>)}
            </select>
            <label style={{ color: '#aaa', fontSize: 11 }}>테두리 색상</label>
            <input type="color" value={tblHeaderBorderColor}
              style={{ width: 24, height: 24, borderRadius: 4, border: '1px solid #666', cursor: 'pointer', padding: 0 }}
              onMouseDown={e => e.stopPropagation()}
              onChange={e => setTblHeaderBorderColor(e.target.value)} />
            <button type="button" style={{ ...btn, fontSize: 11, background: '#4f46e5', border: '1px solid #6366f1', borderRadius: 4 }}
              onMouseDown={e => { e.preventDefault(); onTableHeaderStyle?.(tblHeaderBg, tblHeaderBorderWidth, tblHeaderBorderColor); }}>적용</button>
          </div>
        )}
      </div>
    )}

    {/* ── HR 속성 편집 패널 ── */}
    {showHrPanel && mode === 'block' && blockEl?.tagName === 'HR' && onBlockStyle && (
      <div style={{
        borderTop: '1px solid #333',
        background: '#2d2d44',
        padding: '8px 12px',
        display: 'flex', flexDirection: 'column', gap: 8,
      }}>
        <div style={{ color: '#a5b4fc', fontSize: 11, fontWeight: 700, marginBottom: 2 }}>─ 구분선 스타일</div>
        <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap', alignItems: 'flex-start' }}>
          <div>
            <label style={{ color: '#aaa', fontSize: 11, display: 'block', marginBottom: 3 }}>색상</label>
            <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap', alignItems: 'center' }}>
              {['#e2e8f0','#94a3b8','#475569','#1e293b','#ef4444','#f97316','#eab308','#22c55e','#3b82f6','#8b5cf6','#ec4899'].map(c => (
                <button type="button" key={c}
                  style={{ width: 22, height: 22, borderRadius: 4, background: c,
                    border: localHrColor === c ? '2px solid #fff' : '1px solid rgba(255,255,255,0.2)',
                    cursor: 'pointer', padding: 0, flexShrink: 0 }}
                  onMouseDown={e => {
                    e.preventDefault();
                    setLocalHrColor(c);
                    blockEl.style.borderTopColor = c;
                    blockEl.style.borderColor = c;
                    onBlockStyle('_noop', '');
                  }} />
              ))}
              <input type="color" value={localHrColor}
                style={{ width: 22, height: 22, borderRadius: 4, border: '1px solid #666', cursor: 'pointer', padding: 0 }}
                onMouseDown={e => e.stopPropagation()}
                onChange={e => {
                  setLocalHrColor(e.target.value);
                  blockEl.style.borderTopColor = e.target.value;
                  blockEl.style.borderColor = e.target.value;
                  onBlockStyle('_noop', '');
                }} />
            </div>
          </div>
          <div style={{ flex: 1, minWidth: 120 }}>
            <label style={{ color: '#aaa', fontSize: 11, display: 'block', marginBottom: 3 }}>굵기: {localHrHeight}px</label>
            <input type="range" min={1} max={10} value={localHrHeight}
              style={{ width: '100%', accentColor: '#6366f1' }}
              onMouseDown={e => e.stopPropagation()}
              onChange={e => {
                const v = Number(e.target.value);
                setLocalHrHeight(v);
                blockEl.style.borderTopWidth = `${v}px`;
                onBlockStyle('_noop', '');
              }} />
          </div>
          <div>
            <label style={{ color: '#aaa', fontSize: 11, display: 'block', marginBottom: 3 }}>스타일</label>
            <div style={{ display: 'flex', gap: 4 }}>
              {(['solid','dashed','dotted'] as const).map(s => (
                <button type="button" key={s}
                  style={{ ...btn, fontSize: 11, padding: '3px 8px',
                    background: localHrStyle === s ? '#4f46e5' : '#3b3b5c',
                    border: localHrStyle === s ? '1px solid #6366f1' : '1px solid #555',
                    borderRadius: 4 }}
                  onMouseDown={e => {
                    e.preventDefault();
                    setLocalHrStyle(s);
                    blockEl.style.borderTopStyle = s;
                    blockEl.style.borderStyle = s;
                    onBlockStyle('_noop', '');
                  }}>{s === 'solid' ? '실선' : s === 'dashed' ? '대시' : '점선'}</button>
              ))}
            </div>
          </div>
          <div style={{ flex: 1, minWidth: 120 }}>
            <label style={{ color: '#aaa', fontSize: 11, display: 'block', marginBottom: 3 }}>상하 여백: {localHrMargin}px</label>
            <input type="range" min={4} max={60} value={localHrMargin}
              style={{ width: '100%', accentColor: '#6366f1' }}
              onMouseDown={e => e.stopPropagation()}
              onChange={e => {
                const v = Number(e.target.value);
                setLocalHrMargin(v);
                blockEl.style.marginTop = `${v}px`;
                blockEl.style.marginBottom = `${v}px`;
                onBlockStyle('_noop', '');
              }} />
          </div>
        </div>
      </div>
    )}

    {/* ── BLOCKQUOTE 속성 편집 패널 ── */}
    {showBqPanel && mode === 'block' && blockEl?.tagName === 'BLOCKQUOTE' && onBlockStyle && (
      <div style={{
        borderTop: '1px solid #333',
        background: '#2d2d44',
        padding: '8px 12px',
        display: 'flex', flexDirection: 'column', gap: 8,
      }}>
        <div style={{ color: '#a5b4fc', fontSize: 11, fontWeight: 700, marginBottom: 2 }}>❝ 인용구 스타일</div>
        <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap', alignItems: 'flex-start' }}>
          <div>
            <label style={{ color: '#aaa', fontSize: 11, display: 'block', marginBottom: 3 }}>좌측 테두리 색상</label>
            <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap', alignItems: 'center' }}>
              {['#6366f1','#3b82f6','#10b981','#f59e0b','#ef4444','#8b5cf6','#ec4899','#64748b'].map(c => (
                <button type="button" key={c}
                  style={{ width: 22, height: 22, borderRadius: 4, background: c,
                    border: localBqBorderColor === c ? '2px solid #fff' : '1px solid rgba(255,255,255,0.2)',
                    cursor: 'pointer', padding: 0, flexShrink: 0 }}
                  onMouseDown={e => {
                    e.preventDefault();
                    setLocalBqBorderColor(c);
                    blockEl.style.borderLeftColor = c;
                    onBlockStyle('_noop', '');
                  }} />
              ))}
              <input type="color" value={localBqBorderColor}
                style={{ width: 22, height: 22, borderRadius: 4, border: '1px solid #666', cursor: 'pointer', padding: 0 }}
                onMouseDown={e => e.stopPropagation()}
                onChange={e => {
                  setLocalBqBorderColor(e.target.value);
                  blockEl.style.borderLeftColor = e.target.value;
                  onBlockStyle('_noop', '');
                }} />
            </div>
          </div>
          <div>
            <label style={{ color: '#aaa', fontSize: 11, display: 'block', marginBottom: 3 }}>배경 색상</label>
            <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap', alignItems: 'center' }}>
              {['#f8f7ff','#eff6ff','#f0fdf4','#fffbeb','#fff1f2','#fdf4ff','transparent'].map(c => (
                <button type="button" key={c}
                  style={{ width: 22, height: 22, borderRadius: 4,
                    background: c === 'transparent' ? 'repeating-linear-gradient(45deg,#aaa 0,#aaa 2px,#fff 0,#fff 6px)' : c,
                    border: localBqBg === c ? '2px solid #6366f1' : '1px solid #666',
                    cursor: 'pointer', padding: 0, flexShrink: 0 }}
                  onMouseDown={e => {
                    e.preventDefault();
                    setLocalBqBg(c);
                    blockEl.style.backgroundColor = c === 'transparent' ? '' : c;
                    onBlockStyle('_noop', '');
                  }} />
              ))}
              <input type="color" value={localBqBg.startsWith('#') ? localBqBg : '#f8f7ff'}
                style={{ width: 22, height: 22, borderRadius: 4, border: '1px solid #666', cursor: 'pointer', padding: 0 }}
                onMouseDown={e => e.stopPropagation()}
                onChange={e => {
                  setLocalBqBg(e.target.value);
                  blockEl.style.backgroundColor = e.target.value;
                  onBlockStyle('_noop', '');
                }} />
            </div>
          </div>
        </div>
      </div>
    )}

    {/* ── DIV 블록(정보박스/경고박스) 속성 편집 패널 ── */}
    {showDivPanel && mode === 'block' && blockEl?.tagName === 'DIV' && onBlockStyle && (
      <div style={{
        borderTop: '1px solid #333',
        background: '#2d2d44',
        padding: '8px 12px',
        display: 'flex', flexDirection: 'column', gap: 8,
      }}>
        <div style={{ color: '#a5b4fc', fontSize: 11, fontWeight: 700, marginBottom: 2 }}>📦 블록 스타일</div>
        <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap', alignItems: 'flex-start' }}>
          <div>
            <label style={{ color: '#aaa', fontSize: 11, display: 'block', marginBottom: 3 }}>테두리 색상</label>
            <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap', alignItems: 'center' }}>
              {['#3b82f6','#10b981','#f59e0b','#ef4444','#8b5cf6','#ec4899','#64748b','#1e293b'].map(c => (
                <button type="button" key={c}
                  style={{ width: 22, height: 22, borderRadius: 4, background: c,
                    border: localDivBorderColor === c ? '2px solid #fff' : '1px solid rgba(255,255,255,0.2)',
                    cursor: 'pointer', padding: 0, flexShrink: 0 }}
                  onMouseDown={e => {
                    e.preventDefault();
                    setLocalDivBorderColor(c);
                    blockEl.style.borderLeftColor = c;
                    blockEl.style.borderColor = c;
                    onBlockStyle('_noop', '');
                  }} />
              ))}
              <input type="color" value={localDivBorderColor}
                style={{ width: 22, height: 22, borderRadius: 4, border: '1px solid #666', cursor: 'pointer', padding: 0 }}
                onMouseDown={e => e.stopPropagation()}
                onChange={e => {
                  setLocalDivBorderColor(e.target.value);
                  blockEl.style.borderLeftColor = e.target.value;
                  blockEl.style.borderColor = e.target.value;
                  onBlockStyle('_noop', '');
                }} />
            </div>
          </div>
          <div>
            <label style={{ color: '#aaa', fontSize: 11, display: 'block', marginBottom: 3 }}>배경 색상</label>
            <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap', alignItems: 'center' }}>
              {['#eff6ff','#f0fdf4','#fffbeb','#fff1f2','#fdf4ff','#f8fafc','transparent'].map(c => (
                <button type="button" key={c}
                  style={{ width: 22, height: 22, borderRadius: 4,
                    background: c === 'transparent' ? 'repeating-linear-gradient(45deg,#aaa 0,#aaa 2px,#fff 0,#fff 6px)' : c,
                    border: localDivBg === c ? '2px solid #6366f1' : '1px solid #666',
                    cursor: 'pointer', padding: 0, flexShrink: 0 }}
                  onMouseDown={e => {
                    e.preventDefault();
                    setLocalDivBg(c);
                    blockEl.style.backgroundColor = c === 'transparent' ? '' : c;
                    onBlockStyle('_noop', '');
                  }} />
              ))}
              <input type="color" value={localDivBg.startsWith('#') ? localDivBg : '#eff6ff'}
                style={{ width: 22, height: 22, borderRadius: 4, border: '1px solid #666', cursor: 'pointer', padding: 0 }}
                onMouseDown={e => e.stopPropagation()}
                onChange={e => {
                  setLocalDivBg(e.target.value);
                  blockEl.style.backgroundColor = e.target.value;
                  onBlockStyle('_noop', '');
                }} />
            </div>
          </div>
        </div>
      </div>
    )}
    </div>
  );

  // 팝업 모드일 때 createPortal로 document.body에 렌더링 (스키 콘테이너 영향 회피)
  if (popupStyle) {
    return createPortal(toolbarInner, document.body);
  }
  return toolbarInner;
}

// ─── 버튼 생성 다이얼로그 ──────────────────────────────────────────────
function ButtonGeneratorDialog({ defaultText, editingEl, onConfirm, onCancel }: {
  defaultText: string;
  editingEl?: HTMLElement | null;
  onConfirm: (html: string) => void;
  onCancel: () => void;
}) {
  // 편집 모드일 때 기존 버튼 스타일 파싱
  const parseNum = (v: string) => parseInt(v) || 0;
  const parsed = editingEl ? {
    text: editingEl.textContent || '버튼 텍스트',
    url: (editingEl.tagName === 'A' ? (editingEl as HTMLAnchorElement).href : '') || 'https://',
    bgColor: editingEl.style.background || editingEl.style.backgroundColor || '#6366f1',
    textColor: editingEl.style.color || '#ffffff',
    borderRadius: parseNum(editingEl.style.borderRadius),
    fontSize: parseNum(editingEl.style.fontSize) || 15,
    paddingV: parseNum(editingEl.style.paddingTop) || 10,
    paddingH: parseNum(editingEl.style.paddingLeft) || 24,
    fullWidth: editingEl.style.width === '100%',
  } : null;
  const isEditMode = !!editingEl;
  const [text, setText] = useState(parsed?.text || defaultText || "버튼 텍스트");
  const [url, setUrl] = useState(parsed?.url || "https://");
  const [bgColor, setBgColor] = useState(parsed?.bgColor || "#6366f1");
  const [textColor, setTextColor] = useState(parsed?.textColor || "#ffffff");
  const [borderRadius, setBorderRadius] = useState(parsed?.borderRadius ?? 8);
  const [fontSize, setFontSize] = useState(parsed?.fontSize || 15);
  const [paddingV, setPaddingV] = useState(parsed?.paddingV || 10);
  const [paddingH, setPaddingH] = useState(parsed?.paddingH || 24);
  const [align, setAlign] = useState<"left" | "center" | "right">("center");
  const [fullWidth, setFullWidth] = useState(parsed?.fullWidth || false);

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
  ];

  const btnStyle = `display:inline-block;padding:${paddingV}px ${paddingH}px;background:${bgColor};color:${textColor};font-size:${fontSize}px;font-weight:700;border-radius:${borderRadius}px;text-decoration:none;border:none;cursor:pointer;${fullWidth ? "width:100%;text-align:center;box-sizing:border-box;" : ""}`;
  const wrapAlign = align === "center" ? "text-align:center;" : align === "right" ? "text-align:right;" : "text-align:left;";

  const generateHtml = () => {
    if (url && url !== "https://") {
      return `<p style="${wrapAlign}"><a href="${url}" target="_blank" rel="noopener noreferrer" style="${btnStyle}">${text}</a></p>`;
    }
    return `<p style="${wrapAlign}"><span style="${btnStyle}">${text}</span></p>`;
  };

  return createPortal(
    <div style={{ position: "fixed", inset: 0, zIndex: 100000, background: "rgba(0,0,0,0.5)", display: "flex", alignItems: "center", justifyContent: "center" }}
      onMouseDown={e => { if (e.target === e.currentTarget) onCancel(); }}>
      <div style={{ background: "#fff", borderRadius: 12, padding: 20, width: 440, boxShadow: "0 8px 32px rgba(0,0,0,0.2)" }}>
        <h3 style={{ margin: "0 0 10px", fontSize: 16, fontWeight: 700 }}>{isEditMode ? '🎨 버튼 편집' : '🎨 버튼 생성'}</h3>

        <div style={{ marginBottom: 8 }}>
          <label style={{ fontSize: 12, color: "#64748b", fontWeight: 600, display: "block", marginBottom: 4 }}>색상 프리셋</label>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
            {PRESET_COLORS.map(p => (
              <button type="button" key={p.label} onClick={() => { setBgColor(p.bg); setTextColor(p.text); }}
                style={{ padding: "5px 12px", borderRadius: 20, border: bgColor === p.bg ? "2px solid #6366f1" : "1px solid #e2e8f0", background: p.bg, color: p.text, fontSize: 11, fontWeight: 700, cursor: "pointer" }}>
                {p.label}
              </button>
            ))}
          </div>
        </div>

        <div style={{ marginBottom: 8 }}>
          <label style={{ fontSize: 13, color: "#555", display: "block", marginBottom: 4 }}>버튼 텍스트</label>
          <input value={text} onChange={e => setText(e.target.value)}
            style={{ width: "100%", padding: "6px 10px", border: "1px solid #ddd", borderRadius: 6, fontSize: 14, boxSizing: "border-box" }} />
        </div>

        <div style={{ marginBottom: 8 }}>
          <label style={{ fontSize: 13, color: "#555", display: "block", marginBottom: 4 }}>링크 URL (선택)</label>
          <input value={url} onChange={e => setUrl(e.target.value)} placeholder="https://..."
            style={{ width: "100%", padding: "6px 10px", border: "1px solid #ddd", borderRadius: 6, fontSize: 14, boxSizing: "border-box" }} />
        </div>

        <div style={{ display: "flex", gap: 12, marginBottom: 8 }}>
          <div style={{ flex: 1 }}>
            <label style={{ fontSize: 13, color: "#555", display: "block", marginBottom: 4 }}>배경색</label>
            <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
              <input type="color" value={bgColor.startsWith("linear") ? "#6366f1" : bgColor} onChange={e => setBgColor(e.target.value)}
                style={{ width: 36, height: 32, border: "1px solid #ddd", borderRadius: 4, cursor: "pointer", padding: 2 }} />
              <input value={bgColor} onChange={e => setBgColor(e.target.value)}
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

        <div style={{ display: "flex", gap: 12, marginBottom: 8 }}>
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
        <div style={{ display: "flex", gap: 12, marginBottom: 8 }}>
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

        <div style={{ display: "flex", gap: 12, marginBottom: 10, alignItems: "center" }}>
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

        <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
          <button type="button" onClick={onCancel} style={{ padding: "8px 16px", borderRadius: 6, border: "1px solid #ddd", background: "#fff", cursor: "pointer", fontSize: 14 }}>취소</button>
          <button type="button" onClick={() => onConfirm(generateHtml())}
            style={{ padding: "8px 16px", borderRadius: 6, border: "none", background: "#6366f1", color: "#fff", cursor: "pointer", fontSize: 14, fontWeight: 700 }}>{isEditMode ? '수정' : '삽입'}</button>
        </div>
      </div>
    </div>,
    document.body
  );
}

// ─── 표 삽입/변환 다이얼로그 ──────────────────────────────────────────────────
function TableDialog({ defaultText = "", onConfirm, onCancel }: {
  defaultText?: string;
  onConfirm: (html: string) => void;
  onCancel: () => void;
}) {
  const [rows, setRows] = useState(3);
  const [cols, setCols] = useState(3);
  const [hasHeader, setHasHeader] = useState(true);
  const [borderStyle, setBorderStyle] = useState<"solid" | "none" | "striped">("solid");

  // 선택 텍스트를 줄/탭 구분으로 파싱해서 표 데이터 만들기
  const parsedData = React.useMemo(() => {
    if (!defaultText.trim()) return null;
    const lines = defaultText.split(/\n/).map(l => l.trim()).filter(Boolean);
    if (lines.length < 1) return null;
    const parsed = lines.map(l => l.split(/\t|,/).map(c => c.trim()));
    return parsed;
  }, [defaultText]);

  const generateHtml = () => {
    const borderAttr = borderStyle === "none" ? "" : 'border="1" cellpadding="8" cellspacing="0"';
    const tableStyle = 'style="border-collapse:collapse;width:100%;table-layout:fixed;word-break:break-word;"';
    // 셀 경계선 스타일: 진하게
    const BORDER_SOLID = 'border:1.5px solid #94a3b8';
    const BORDER_NONE = 'border:none';

    if (parsedData && parsedData.length > 0) {
      // 선택 텍스트 기반 표 생성
      const actualCols = Math.max(...parsedData.map(r => r.length));
      const colPct = (100 / actualCols).toFixed(2);
      let html = `<table ${borderAttr} ${tableStyle}>`;
      html += `<colgroup>${Array.from({length: actualCols}).map(() => `<col style="width:${colPct}%">`).join('')}</colgroup>`;
      parsedData.forEach((row, ri) => {
        html += "<tr>";
        for (let ci = 0; ci < actualCols; ci++) {
          const cell = row[ci] || "";
          const isHeader = hasHeader && ri === 0;
          const tag = isHeader ? "th" : "td";
          const bdr = borderStyle === "none" ? BORDER_NONE : BORDER_SOLID;
          const cellStyle = isHeader
            ? `style="background:#1e3a5f;color:#fff;font-weight:700;padding:10px 14px;${bdr};word-break:break-word;"`
            : borderStyle === "striped" && ri % 2 === 0
              ? `style="background:#f8fafc;padding:8px 12px;${bdr};word-break:break-word;"`
              : `style="padding:8px 12px;${bdr};word-break:break-word;"`;
          html += `<${tag} ${cellStyle}>${cell}</${tag}>`;
        }
        html += "</tr>";
      });
      html += "</table>";
      return html;
    } else {
      // 빈 표 생성
      const colPct = (100 / cols).toFixed(2);
      let html = `<table ${borderAttr} ${tableStyle}>`;
      html += `<colgroup>${Array.from({length: cols}).map(() => `<col style="width:${colPct}%">`).join('')}</colgroup>`;
      for (let r = 0; r < rows; r++) {
        html += "<tr>";
        for (let c = 0; c < cols; c++) {
          const isHeader = hasHeader && r === 0;
          const tag = isHeader ? "th" : "td";
          const bdr = borderStyle === "none" ? BORDER_NONE : BORDER_SOLID;
          const cellStyle = isHeader
            ? `style="background:#1e3a5f;color:#fff;font-weight:700;padding:10px 14px;${bdr};word-break:break-word;"`
            : borderStyle === "striped" && r % 2 === 0
              ? `style="background:#f8fafc;padding:8px 12px;${bdr};word-break:break-word;"`
              : `style="padding:8px 12px;${bdr};word-break:break-word;"`;
          html += `<${tag} ${cellStyle}>&nbsp;</${tag}>`;
        }
        html += "</tr>";
      }
      html += "</table>";
      return html;
    }
  };

  return createPortal(
    <div style={{ position: "fixed", inset: 0, zIndex: 100000, background: "rgba(0,0,0,0.5)", display: "flex", alignItems: "center", justifyContent: "center" }}
      onMouseDown={e => { if (e.target === e.currentTarget) onCancel(); }}>
      <div style={{ background: "#fff", borderRadius: 12, padding: 24, width: 420, boxShadow: "0 8px 32px rgba(0,0,0,0.2)" }}>
        <h3 style={{ margin: "0 0 16px", fontSize: 16, fontWeight: 700 }}>📊 표 {parsedData ? "변환" : "삽입"}</h3>

        {parsedData ? (
          <div style={{ marginBottom: 14, padding: "10px 14px", background: "#f0fdf4", borderRadius: 8, fontSize: 12, color: "#166534" }}>
            선택한 텍스트 {parsedData.length}행 × {Math.max(...parsedData.map(r => r.length))}열 표로 변환합니다.
            (줄바꿈 = 행, 탭/쉼표 = 열 구분)
          </div>
        ) : (
          <div style={{ display: "flex", gap: 12, marginBottom: 14 }}>
            <div style={{ flex: 1 }}>
              <label style={{ fontSize: 13, color: "#555", display: "block", marginBottom: 4 }}>행 수</label>
              <input type="number" min={1} max={20} value={rows} onChange={e => setRows(Number(e.target.value))}
                style={{ width: "100%", padding: "7px 10px", border: "1px solid #ddd", borderRadius: 6, fontSize: 14, boxSizing: "border-box" }} />
            </div>
            <div style={{ flex: 1 }}>
              <label style={{ fontSize: 13, color: "#555", display: "block", marginBottom: 4 }}>열 수</label>
              <input type="number" min={1} max={10} value={cols} onChange={e => setCols(Number(e.target.value))}
                style={{ width: "100%", padding: "7px 10px", border: "1px solid #ddd", borderRadius: 6, fontSize: 14, boxSizing: "border-box" }} />
            </div>
          </div>
        )}

        <div style={{ marginBottom: 12 }}>
          <label style={{ fontSize: 13, color: "#555", display: "block", marginBottom: 6 }}>스타일</label>
          <div style={{ display: "flex", gap: 8 }}>
            {(["solid", "none", "striped"] as const).map(s => (
              <button type="button" key={s} onClick={() => setBorderStyle(s)}
                style={{ flex: 1, padding: "7px 0", borderRadius: 6, border: borderStyle === s ? "2px solid #6366f1" : "1px solid #ddd", background: borderStyle === s ? "#eef2ff" : "#fff", cursor: "pointer", fontSize: 12, color: borderStyle === s ? "#6366f1" : "#374151", fontWeight: borderStyle === s ? 700 : 400 }}>
                {s === "solid" ? "테두리" : s === "none" ? "테두리 없음" : "줄무늬"}
              </button>
            ))}
          </div>
        </div>

        <label style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 13, color: "#555", cursor: "pointer", marginBottom: 20 }}>
          <input type="checkbox" checked={hasHeader} onChange={e => setHasHeader(e.target.checked)} />
          첫 행을 헤더로 설정
        </label>

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
  onUpload?: (file: File) => Promise<string>;
}) {
  const [src, setSrc] = useState("");
  const [alt, setAlt] = useState("");
  const [width, setWidth] = useState("100%");
  const [uploading, setUploading] = useState(false);
  const [dragOver, setDragOver] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  const handleFileUpload = async (file: File) => {
    if (!onUpload) return;
    setUploading(true);
    try {
      const uploadedSrc = await onUpload(file);
      // 파일 이름에서 alt 텍스트 자동 설정 후 바로 삽입
      const autoAlt = file.name.replace(/\.[^.]+$/, '').replace(/[-_]/g, ' ');
      onConfirm(uploadedSrc, autoAlt, "100%");
    } catch {
      alert("업로드 실패. 다시 시도해 주세요.");
      setUploading(false);
    }
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) handleFileUpload(file);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setDragOver(false);
    const file = e.dataTransfer.files?.[0];
    if (file && file.type.startsWith('image/')) handleFileUpload(file);
  };

  return createPortal(
    <div style={{ position: "fixed", inset: 0, zIndex: 100000, background: "rgba(0,0,0,0.5)", display: "flex", alignItems: "center", justifyContent: "center" }}
      onMouseDown={e => { if (e.target === e.currentTarget) onCancel(); }}>
      <div style={{ background: "#fff", borderRadius: 12, padding: 24, width: 420, boxShadow: "0 8px 32px rgba(0,0,0,0.2)" }}>
        <h3 style={{ margin: "0 0 16px", fontSize: 16, fontWeight: 700 }}>🖼️ 이미지 삽입</h3>
        {onUpload && (
          <div
            style={{
              marginBottom: 16,
              border: `2px dashed ${dragOver ? '#6366f1' : '#d1d5db'}`,
              borderRadius: 8,
              padding: "20px 16px",
              textAlign: "center",
              background: dragOver ? '#f0f0ff' : '#fafafa',
              cursor: uploading ? 'not-allowed' : 'pointer',
              transition: "all 0.15s",
            }}
            onClick={() => { if (!uploading) fileRef.current?.click(); }}
            onDragOver={e => { e.preventDefault(); setDragOver(true); }}
            onDragLeave={() => setDragOver(false)}
            onDrop={handleDrop}
          >
            <input ref={fileRef} type="file" accept="image/*" onChange={handleFileChange} style={{ display: "none" }} />
            {uploading ? (
              <div style={{ color: '#6366f1', fontSize: 13, fontWeight: 600 }}>⏳ 업로드 중... 잠시 기다려 주세요</div>
            ) : (
              <>
                <div style={{ fontSize: 28, marginBottom: 6 }}>📁</div>
                <div style={{ fontSize: 13, color: '#374151', fontWeight: 600 }}>파일을 여기에 드래그하거나 클릭하여 선택</div>
                <div style={{ fontSize: 11, color: '#9ca3af', marginTop: 4 }}>JPG, PNG, GIF, WebP 지원 · 선택 즉시 자동 삽입</div>
              </>
            )}
          </div>
        )}
        <div style={{ marginBottom: 4, fontSize: 12, color: '#6b7280', textAlign: 'center' }}>— 또는 URL로 직접 입력 후 삽입 버튼 클릭 —</div>
        <div style={{ marginBottom: 12, marginTop: 8 }}>
          <input value={src} onChange={e => setSrc(e.target.value)} placeholder="https://example.com/image.jpg"
            onKeyDown={e => { if (e.key === 'Enter' && src.trim()) onConfirm(src.trim(), alt, width); }}
            style={{ width: "100%", padding: "8px 10px", border: "1px solid #ddd", borderRadius: 6, fontSize: 13, boxSizing: "border-box" }} />
        </div>
        {src && <div style={{ marginBottom: 12, textAlign: "center" }}>
          <img src={src} alt="미리보기" loading="lazy" decoding="async" style={{ maxWidth: "100%", maxHeight: 120, borderRadius: 6, border: "1px solid #eee" }} />
        </div>}
        <div style={{ display: "flex", gap: 12, marginBottom: 16 }}>
          <div style={{ flex: 1 }}>
            <label style={{ fontSize: 13, color: "#555", display: "block", marginBottom: 4 }}>alt 텍스트 (SEO)</label>
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
            style={{ padding: "8px 16px", borderRadius: 6, border: "none", background: src.trim() && !uploading ? "#6366f1" : "#c7d2fe", color: "#fff", cursor: src.trim() && !uploading ? "pointer" : "not-allowed", fontSize: 14, fontWeight: 700 }}>URL로 삽입</button>
        </div>
      </div>
    </div>,
    document.body
  );
}

// ─── 동영상 URL 파싱 ──────────────────────────────────────────────────────────
function parseVideoUrl(url: string): { embedUrl: string; type: 'youtube' | 'vimeo' | null; videoId: string } | null {
  const trimmed = url.trim();
  // YouTube: youtube.com/watch?v=ID, youtu.be/ID, youtube.com/shorts/ID, youtube.com/embed/ID
  const ytPattern = /(?:youtube\.com\/watch\?(?:.*&)?v=|youtu\.be\/|youtube\.com\/shorts\/|youtube\.com\/embed\/|youtube\.com\/v\/)([\w-]{11})/;
  const ytMatch = trimmed.match(ytPattern);
  if (ytMatch) {
    const videoId = ytMatch[1];
    return { embedUrl: `https://www.youtube.com/embed/${videoId}?rel=0&modestbranding=1`, type: 'youtube', videoId };
  }
  // Vimeo: vimeo.com/ID, vimeo.com/channels/xxx/ID, player.vimeo.com/video/ID
  const vimeoPattern = /(?:(?:www\.)?vimeo\.com\/(?:channels\/[^/]+\/|groups\/[^/]+\/videos\/|video\/)?|player\.vimeo\.com\/video\/)(\d+)/;
  const vimeoMatch = trimmed.match(vimeoPattern);
  if (vimeoMatch) {
    const videoId = vimeoMatch[1];
    return { embedUrl: `https://player.vimeo.com/video/${videoId}?byline=0&portrait=0`, type: 'vimeo', videoId };
  }
  return null;
}

// ─── 동영상 삽입 다이얼로그 ──────────────────────────────────────────────────
function VideoInsertDialog({ onConfirm, onCancel }: {
  onConfirm: (embedUrl: string, type: string, caption: string, width: string) => void;
  onCancel: () => void;
}) {
  const [url, setUrl] = useState('');
  const [caption, setCaption] = useState('');
  const [width, setWidth] = useState('100%');
  const parsed = parseVideoUrl(url);
  const isValid = parsed !== null;

  return createPortal(
    <div
      style={{ position: 'fixed', inset: 0, zIndex: 100000, background: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
      onMouseDown={e => { if (e.target === e.currentTarget) onCancel(); }}
    >
      <div style={{ background: '#fff', borderRadius: 12, padding: 24, width: 480, boxShadow: '0 8px 32px rgba(0,0,0,0.2)' }}>
        <h3 style={{ margin: '0 0 4px', fontSize: 16, fontWeight: 700 }}>🎬 동영상 삽입</h3>
        <p style={{ margin: '0 0 16px', fontSize: 12, color: '#6b7280' }}>유튜브(YouTube), 비메오(Vimeo) URL을 붙여넣으세요.</p>
        <div style={{ marginBottom: 12 }}>
          <label style={{ fontSize: 13, color: '#555', display: 'block', marginBottom: 4 }}>동영상 URL <span style={{ color: '#ef4444' }}>*</span></label>
          <input
            value={url}
            onChange={e => setUrl(e.target.value)}
            placeholder="https://www.youtube.com/watch?v=... 또는 https://vimeo.com/..."
            autoFocus
            style={{ width: '100%', padding: '8px 10px', border: `1px solid ${isValid ? '#22c55e' : url ? '#f87171' : '#ddd'}`, borderRadius: 6, fontSize: 13, boxSizing: 'border-box' }}
          />
          {url && !isValid && <p style={{ margin: '4px 0 0', fontSize: 11, color: '#ef4444' }}>유튜브 또는 비메오 URL을 입력해주세요.</p>}
          {isValid && <p style={{ margin: '4px 0 0', fontSize: 11, color: '#16a34a' }}>✓ {parsed.type === 'youtube' ? '유튜브' : '비메오'} 동영상 감지됨 (ID: {parsed.videoId})</p>}
        </div>
        {isValid && (
          <div style={{ marginBottom: 12, borderRadius: 8, overflow: 'hidden', background: '#000', aspectRatio: '16/9' }}>
            <iframe
              src={parsed.embedUrl}
              style={{ width: '100%', height: '100%', border: 'none' }}
              allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
              allowFullScreen
              title="동영상 미리보기"
            />
          </div>
        )}
        <div style={{ display: 'flex', gap: 12, marginBottom: 16 }}>
          <div style={{ flex: 1 }}>
            <label style={{ fontSize: 13, color: '#555', display: 'block', marginBottom: 4 }}>캡션 (선택)</label>
            <input
              value={caption}
              onChange={e => setCaption(e.target.value)}
              placeholder="동영상 설명 캡션"
              style={{ width: '100%', padding: '7px 10px', border: '1px solid #ddd', borderRadius: 6, fontSize: 13, boxSizing: 'border-box' }}
            />
          </div>
          <div style={{ width: 90 }}>
            <label style={{ fontSize: 13, color: '#555', display: 'block', marginBottom: 4 }}>너비</label>
            <input
              value={width}
              onChange={e => setWidth(e.target.value)}
              placeholder="100%"
              style={{ width: '100%', padding: '7px 10px', border: '1px solid #ddd', borderRadius: 6, fontSize: 13, boxSizing: 'border-box' }}
            />
          </div>
        </div>
        <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
          <button type="button" onClick={onCancel} style={{ padding: '8px 16px', borderRadius: 6, border: '1px solid #ddd', background: '#fff', cursor: 'pointer', fontSize: 14 }}>취소</button>
          <button type="button"
            onClick={() => { if (isValid) onConfirm(parsed!.embedUrl, parsed!.type!, caption, width); }}
            disabled={!isValid}
            style={{ padding: '8px 16px', borderRadius: 6, border: 'none', background: isValid ? '#6366f1' : '#c7d2fe', color: '#fff', cursor: isValid ? 'pointer' : 'not-allowed', fontSize: 14, fontWeight: 700 }}
          >삽입</button>
        </div>
      </div>
    </div>,
    document.body
  );
}

// ─── 메인 컴포넌트 ────────────────────────────────────────────────────────────
export default function IframeVisualEditor({
  value: valueProp,
  html: htmlProp,
  onChange,
  onUploadImage,
  minHeight = 200,
  isAppMode = false,
  adsenseSlotCode = '',
  coupangWidgetCode = '',
  shopConnectWidgetCode = '',
  onRequestFileInsert,
  hideOverlay = false,
}: IframeVisualEditorProps) {
  const value = valueProp ?? htmlProp ?? '';
  const iframeRef = useRef<HTMLIFrameElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const changeTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [iframeHeight, setIframeHeight] = useState(minHeight);
  const [imageOverlay, setImageOverlay] = useState<ImageOverlay>({ visible: false, x: 0, y: 0, imgEl: null });
  // imageOverlay.visible 변경 시 ref 동기화 (bindEvents 클로저에서 stale 없이 사용)
  useEffect(() => { imageOverlayVisibleRef.current = imageOverlay.visible; }, [imageOverlay.visible]);
  const [blockOverlay, setBlockOverlay] = useState<BlockOverlay>({ visible: false, x: 0, y: 0, width: 0, blockEl: null });
  const [floatToolbar, setFloatToolbar] = useState<FloatToolbar>({ visible: true, x: 0, y: 0, mode: 'selection', blockEl: null, tableEl: null, cellEl: null });
  // 표 편집 패널 (행/열 추가·삭제)
  const [tableEditMenu, setTableEditMenu] = useState<{ tableEl: HTMLElement; cellEl: HTMLElement; x: number; y: number } | null>(null);
  // 표 헤더 스타일 편집 상태
  const [tableHeaderStyle, setTableHeaderStyle] = useState({ bg: "#1e3a5f", borderWidth: "1px", borderColor: "#334155" });
  // 표 편집 패널 탭
  const [tableEditTab, setTableEditTab] = useState<"rowcol" | "merge" | "header" | "cellbg" | "rowbg" | "border" | "padding" | "preset">("rowcol");
  const [imageUploading, setImageUploading] = useState(false);
  const imageFileRef = useRef<HTMLInputElement>(null);
  const replaceImageFileRef = useRef<HTMLInputElement>(null);
  // 외부에서 로드된 HTML (파일 불러오기 등으로 크게 바뀔 때만 iframe 재로드)
  const loadedHtmlRef = useRef<string>('');
  // 편집 중 변경 여부 추적
  const isEditingRef = useRef(false);
  // Undo/Redo 실행 중 여부 추적 (handleIframeLoad에서 스택 초기화 방지용)
  const isUndoRedoRef = useRef(false);
  // 이미지 편집 팝업 표시 여부 ref (bindEvents에서 stale closure 없이 상태 참조용)
  const imageOverlayVisibleRef = useRef(false);
  // 현재 Blob URL (리소스 해제용)
  const blobUrlRef = useRef<string>('');
  // iframe 내부 selection 저장 (플로팅 툴바용)
  const savedIframeSelectionRef = useRef<{ range: Range; win: Window } | null>(null);
  // 선택한 텍스트 (버튼/링크 생성용)
  const selectedTextRef = useRef<string>('');

  // 다이얼로그 상태
  const [showButtonDialog, setShowButtonDialog] = useState(false);
  const [buttonDefaultText, setButtonDefaultText] = useState('');
  // 버튼 편집 모드: 기존 버튼 클릭 시 편집할 엘리먼트 참조
  const editingButtonElRef = useRef<HTMLElement | null>(null);
  const [showLinkDialog, setShowLinkDialog] = useState(false);
  const [linkDefaultText, setLinkDefaultText] = useState('');
  const [showImageInsertDialog, setShowImageInsertDialog] = useState(false);
  const [showVideoInsertDialog, setShowVideoInsertDialog] = useState(false);
  const [showTableDialog, setShowTableDialog] = useState(false);
  const [tableDefaultText, setTableDefaultText] = useState('');

  // 워드프레스식 + 버튼 상태
  const [plusButton, setPlusButton] = useState<PlusButton>({
    visible: false, x: 0, y: 0, afterEl: null, showMenu: false
  });
  // + 버튼 afterEl ref (클로저 문제 방지)
  const plusAfterElRef = useRef<HTMLElement | null>(null);
  // + 버튼 insertBeforeMode ref (afterEl 앞에 삽입 여부)
  const plusInsertBeforeModeRef = useRef<boolean>(false);
  // + 버튼 showMenu 상태 ref (bindEvents 클로저 stale 방지)
  const plusShowMenuRef = useRef(false);
  // 블록 삭제 ref (클로저 문제 방지)
  const blockElRef = useRef<HTMLElement | null>(null);
  // 클릭으로 선택된 블록 ref (hover와 분리 - 선택 유지용)
  const selectedBlockRef = useRef<HTMLElement | null>(null);
  // 이미지 오버레이 ref (클로저 문제 방지)
  const imgElRef = useRef<HTMLImageElement | null>(null);
  // 마우스 위치 (+ 버튼 메뉴 위치용)
  const [mousePos, setMousePos] = useState({ x: 0, y: 0 });
  const [insertPanelRect, setInsertPanelRect] = useState({ left: 16, top: 80, width: 0 });
  const plusHideTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  // 블록 삭제 오버레이 숨김 타이머 ref (React 이벤트에서도 취소 가능하도록 ref로 관리)
  const blockHideTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // hideOverlay prop이 true일 때 (외부 팝업 열릴 때) 에디터 오버레이 숨김
  useEffect(() => {
    if (hideOverlay) {
      setPlusButton(prev => ({ ...prev, visible: false, showMenu: false }));
      setFloatToolbar(prev => ({ ...prev, visible: false, blockEl: null, tableEl: null, cellEl: null }));
      setBlockOverlay(prev => ({ ...prev, visible: false }));
      setImageOverlay(prev => ({ ...prev, visible: false }));
    }
  }, [hideOverlay]);

  // undo/redo 히스토리 스택
  const undoStackRef = useRef<string[]>([]);
  const redoStackRef = useRef<string[]>([]);
  const [canUndo, setCanUndo] = useState(false);
  const [canRedo, setCanRedo] = useState(false);
  // handleUndo/handleRedo의 최신 참조를 저장하는 ref (클로저 stale 방지)
  const undoHandlerRef = useRef<() => void>(() => {});
  const redoHandlerRef = useRef<() => void>(() => {});
  // 마지막으로 히스토리에 저장된 HTML (중복 저장 방지)
  const lastHistoryHtmlRef = useRef<string>('');
  // 새 표 삽입 후 드래그 핸들 초기화 함수 ref
  const initAllTablesRef = useRef<((doc: Document) => void) | null>(null);
  // + 버튼 닫기 후 더블클릭 재활성화 관련 ref
  const plusClosedRef = useRef(false); // 닫기 버튼으로 닫혔는지 여부
  const plusClickCountRef = useRef(0); // 닫힌 후 클릭 횟수
  const plusClickTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null); // 더블클릭 감지 타이머
  // 삽입 패널 위에 마우스가 있는지 추적 (패널 사라짐 방지)
  const panelHoverRef = useRef(false);
  // 블록 드래그 앤 드롭 상태
  const dragBlockRef = useRef<HTMLElement | null>(null); // 드래그 중인 블록
  const dragDropIndicatorRef = useRef<HTMLElement | null>(null); // 드롭 위치 인디케이터
  const [isDraggingBlock, setIsDraggingBlock] = useState(false);

  // iframe 높이 자동 조절
  const adjustHeight = useCallback(() => {
    const iframe = iframeRef.current;
    if (!iframe) return;
    try {
      const doc = iframe.contentDocument || iframe.contentWindow?.document;
      if (!doc?.body) return;
      // offsetTop + offsetHeight 기준으로 높이 계산 (뷰포트 좌표가 아닌 iframe 내부 좌표)
      const children = Array.from(doc.body.children) as HTMLElement[];
      let contentHeight = 0;
      if (children.length > 0) {
        const lastChild = children[children.length - 1];
        contentHeight = lastChild.offsetTop + lastChild.offsetHeight;
      } else {
        contentHeight = doc.body.scrollHeight;
      }
      // body padding 고려 (buildBlobUrl에서 16px padding 설정)
      const bodyStyle = doc.defaultView?.getComputedStyle(doc.body);
      const paddingTop = parseFloat(bodyStyle?.paddingTop || '0');
      const paddingBottom = parseFloat(bodyStyle?.paddingBottom || '0');
      // 내용 높이 + 여유 공간 32px (너무 많은 빈 공간 방지)
      const computed = paddingTop + contentHeight + paddingBottom + 32;
      const h = Math.max(minHeight, computed);
      setIframeHeight(h);
    } catch { /* cross-origin */ }
  }, [minHeight]);

  // onChange 디바운스 (300ms - 더 빠른 스냅샷 저장)
  const scheduleChange = useCallback(() => {
    if (changeTimerRef.current) clearTimeout(changeTimerRef.current);
    changeTimerRef.current = setTimeout(() => {
      const iframe = iframeRef.current;
      if (!iframe) return;
      try {
        const doc = iframe.contentDocument || iframe.contentWindow?.document;
        if (!doc) return;

                // 편집기 주입 요소들을 완전히 제거한 후 HTML 추출
        const clone = doc.documentElement.cloneNode(true) as HTMLElement;
        // 0) buildBlobUrl이 주입한 <base> 태그 제거 (저장 시 포함되지 않도록)
        clone.querySelectorAll('base[href]').forEach(el => {
          const href = (el as HTMLBaseElement).href;
          // window.location.origin으로 시작하는 base 태그만 제거 (원본 HTML에 있던 base 태그는 유지)
          if (href && href.startsWith(window.location.origin + '/') && href === window.location.origin + '/') {
            el.remove();
          }
        });
        // 1) 편집기 주입 스타일태그 제거
        clone.querySelectorAll("[data-editor-style]").forEach(el => el.remove());

        // 2) contentEditable 속성 및 편집기 주입 스타일 제거
        clone.querySelectorAll("[data-iframe-editor-init]").forEach(el => {
          el.removeAttribute("data-iframe-editor-init");
          el.removeAttribute("contenteditable");
          const htmlEl = el as HTMLElement;
          // outline, cursor 제거 (편집기가 주입한 것만)
          if (htmlEl.style.outline === "none") htmlEl.style.outline = "";
          if (htmlEl.style.cursor === "default") htmlEl.style.cursor = "";
        });
        // 2-1) 개별 요소에 적용된 contenteditable 제거 (구조 보호 방식)
        clone.querySelectorAll("[contenteditable='true']").forEach(el => {
          el.removeAttribute("contenteditable");
          const htmlEl = el as HTMLElement;
          if (htmlEl.style.cursor === "text") htmlEl.style.cursor = "";
        });

        // 3) 이미지 오버레이 버튼 제거
        clone.querySelectorAll("[data-img-overlay-btn]").forEach(el => el.remove());

        // 4) 리사이즈 핸들 제거
        clone.querySelectorAll("[data-iframe-resize-handle]").forEach(el => el.remove());
        // 4-1) 이미지 선택 테두리 제거 (data-img-selected, outline)
        clone.querySelectorAll("[data-img-selected]").forEach(el => {
          const imgEl = el as HTMLElement;
          imgEl.removeAttribute('data-img-selected');
          if (imgEl.style.outline && imgEl.style.outline.includes('#6366f1')) {
            imgEl.style.outline = '';
          }
          if (imgEl.style.outlineOffset) imgEl.style.outlineOffset = '';
        });
        // 4-2) 표 열 너비 드래그 핸들 제거
        clone.querySelectorAll('.col-resize-handle').forEach(el => el.remove());
        clone.querySelectorAll('.table-width-handle').forEach(el => el.remove());
        // table-resize-wrapper 언래핑 (직렬화 시 wrapper 제거)
        clone.querySelectorAll('.table-resize-wrapper').forEach(wrapper => {
          const tbl = wrapper.querySelector('table');
          if (tbl) wrapper.parentNode?.insertBefore(tbl, wrapper);
          wrapper.remove();
        });
        // 4-3) 표 열 드래그 관련 속성 제거
        clone.querySelectorAll('[data-col-resize-init]').forEach(el => el.removeAttribute('data-col-resize-init'));
        clone.querySelectorAll('[data-col-resizable]').forEach(el => el.removeAttribute('data-col-resizable'));
        // 4-4) 표 셀 선택 클래스 제거 (드래그 다중 선택 시 추가된 클래스)
        clone.querySelectorAll('.cell-selected').forEach(el => el.classList.remove('cell-selected'));
        clone.querySelectorAll('.cell-drag-start').forEach(el => el.classList.remove('cell-drag-start'));
        // 4-5) 표 col-resizing 클래스 제거
        clone.querySelectorAll('.col-resizing').forEach(el => el.classList.remove('col-resizing'));
        clone.querySelectorAll('table.col-resizing').forEach(el => el.classList.remove('col-resizing'));

        // 5) 편집기가 주입한 position:relative 스타일 제거 (img 부모에 주입한 것)
        // 원본 HTML에 없던 position:relative는 제거하지 않음 (style 속성 유지)

        // 원본 HTML이 완전한 문서인지 조각인지 판단
        // (value가 아니라 loadedHtmlRef를 기준으로 - 실제 로드된 HTML)
        const originalHtml = loadedHtmlRef.current;
        const isFullDoc = /^\s*<!DOCTYPE/i.test(originalHtml) || /^\s*<html/i.test(originalHtml);
        let result: string;
        if (isFullDoc) {
          result = "<!DOCTYPE html>\n" + clone.outerHTML;
        } else {
          // body 조각이었던 경우: body innerHTML만 추출
          // Blob URL로 로드된 경우 body에 래핑 스타일이 포함되어 있으므로 innerHTML만 추출
          // 단, 브라우저가 <body> 안의 <style>을 <head>로 자동 이동시키므로
          // fallback-css(id="fallback-css")를 제외한 head의 <style> 태그도 함께 복원한다
          const bodyHtml = clone.querySelector("body")?.innerHTML ?? doc.body.innerHTML;
          const headStyleTags = Array.from(clone.querySelectorAll("head style"))
            .filter(s => s.id !== "fallback-css")
            .map(s => s.outerHTML)
            .join("\n");
          result = headStyleTags ? headStyleTags + "\n" + bodyHtml : bodyHtml;
        }
        // 절대 URL로 변환된 /manus-storage/ 경로를 상대 경로로 역변환하여 저장
        // 1) data-original-src 속성이 있으면 src를 원본 상대 경로로 복원
        result = result.replace(
          /src=(["'])[^"']*?\/manus-storage\/[^"']*?([^>]*?)data-original-src=(["'])([^"']+)/gi,
          (match, q1, between, q2, orig) => `src=${q1}${orig}${q1}${between}data-original-src=${q2}${orig}${q2}`
        );
        // data-original-src 속성 제거 (저장 시 불필요)
        result = result.replace(/\s*data-original-src=(["'])[^"']*?/gi, '');
        // 2) 남아있는 절대 URL을 상대 경로로 역변환 (fallback)
        const originEscape = window.location.origin.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
        result = result
          .replace(new RegExp(`src=(["'])${originEscape}(/manus-storage/)`, 'gi'), 'src=$1$2')
          .replace(new RegExp(`href=(["'])${originEscape}(/manus-storage/)`, 'gi'), 'href=$1$2')
          .replace(new RegExp(`url\\((["']?)${originEscape}(/manus-storage/)`, 'gi'), 'url($1$2');
        // undo 히스토리에 저장 (중복 방지)
        if (result !== lastHistoryHtmlRef.current) {
          undoStackRef.current.push(lastHistoryHtmlRef.current || result);
          // 스택 최대 100개 유지
          if (undoStackRef.current.length > 100) undoStackRef.current.shift();
          redoStackRef.current = []; // 새 변경 시 redo 스택 초기화
          lastHistoryHtmlRef.current = result;
          setCanUndo(undoStackRef.current.length > 1);
          setCanRedo(false);
        }

        isEditingRef.current = true;
        loadedHtmlRef.current = result;
        onChange(result);
        // isEditingRef를 2초 후 자동 리셋 (편집 중 외부 value 변경 방어)
        // 단, 다음 scheduleChange 호출 전에 외부 재로드가 발생하는 경우 대비
        setTimeout(() => { isEditingRef.current = false; }, 2000);
      } catch { /* cross-origin */ }
    }, 300);
  }, [onChange]);

  // iframe 내부에 편집 스크립트 주입
  const injectEditingScript = useCallback((doc: Document) => {
    if (doc.body.getAttribute("data-iframe-editor-init")) return;
    doc.body.setAttribute("data-iframe-editor-init", "true");

    // 구조 보호: body 전체 contentEditable 대신 개별 요소 클릭 시에만 적용
    // body.contentEditable = "true" 제거 → 브라우저가 구조를 재구성하는 문제 방지
    doc.body.style.outline = "none";
    doc.body.style.cursor = "default";

    // 편집기 스타일 주입 - 표/목록/번호 원본 보존 강화
    const style = doc.createElement("style");
    style.setAttribute("data-editor-style", "true");
    style.textContent = `
      /* 편집기 기본 */
      [contenteditable]:focus { outline: none !important; }
      /* 편집 가능 요소: 클릭 시 contenteditable이 적용된 요소 강조 */
      [contenteditable="true"]:not(body) {
        outline: 1px dashed rgba(99, 102, 241, 0.4) !important;
        outline-offset: 2px;
        cursor: text !important;
      }
      [contenteditable="true"]:not(body):focus {
        outline: 2px solid rgba(99, 102, 241, 0.6) !important;
      }
      img { cursor: pointer !important; }
      img:hover { outline: 2px solid #6366f1 !important; outline-offset: 2px; }
      .iframe-block-hover { outline: 2px dashed #f59e0b !important; outline-offset: 2px; }
      .iframe-block-selected { outline: 2px solid #f59e0b !important; outline-offset: 2px; background-color: rgba(245, 158, 11, 0.04) !important; }
      a[href] { cursor: pointer; }

      /* 표 원본 구조 보존 - contentEditable이 표 스타일을 제거하지 못하도록 */
      /* ── 표 기본 구조 ── */
      table { border-collapse: collapse !important; table-layout: fixed !important; word-break: break-word !important; width: 100% !important; }
      /* 표 선 진하게 - border 속성 유무와 무관하게 모든 td/th에 적용 */
      td, th { border: 2px solid #64748b !important; }
      /* td/th 패딩: 인라인 스타일 없는 경우에만 기본값 적용 */
      td:not([style*="padding"]), th:not([style*="padding"]) { padding: 8px 12px; }
      /* 표 셀 크기 완전 고정 - contenteditable 상태에서도 너비 확장 방지 */
      td, th {
        overflow: hidden !important;
        word-break: break-word !important;
        overflow-wrap: break-word !important;
        white-space: normal !important;
        vertical-align: top;
      }
      /* 선택된 셀 하이라이트 */
      td.cell-selected, th.cell-selected {
        outline: 2.5px solid #6366f1 !important;
        outline-offset: -2px;
        background-color: rgba(99,102,241,0.10) !important;
      }
      /* 열 너비 드래그 중 표 하이라이트 */
      table.col-resizing td, table.col-resizing th {
        border-color: #6366f1 !important;
        border-width: 2.5px !important;
      }

      /* 목록 원본 구조 보존 - list-style:none 인라인 스타일이 있으면 덮어쓰지 않음 */
      ul:not([style*="list-style"]) { list-style-type: disc !important; padding-left: 2em !important; margin: 0.5em 0 !important; }
      ol:not([style*="list-style"]):not([class]) { list-style-type: decimal !important; padding-left: 2em !important; margin: 0.5em 0 !important; }
      li:not([class]) { display: list-item !important; }
      ul ul:not([style*="list-style"]) { list-style-type: circle !important; }
      ul ul ul:not([style*="list-style"]) { list-style-type: square !important; }
      ol ol:not([style*="list-style"]):not([class]) { list-style-type: lower-alpha !important; }

      /* 제목 태그: 인라인 스타일 없는 경우에만 기본값 적용 (원본 HTML style 태그 우선) */
      h1:not([style]) { font-size: 2em; font-weight: bold; }
      h2:not([style]) { font-size: 1.5em; font-weight: bold; }
      h3:not([style]) { font-size: 1.17em; font-weight: bold; }
      h4:not([style]) { font-size: 1em; font-weight: bold; }
      h5:not([style]) { font-size: 0.83em; font-weight: bold; }
      h6:not([style]) { font-size: 0.75em; font-weight: bold; }

      /* 인라인 스타일 보존 */
      strong, b { font-weight: bold !important; }
      em, i { font-style: italic !important; }
      u { text-decoration: underline !important; }
      s, strike, del { text-decoration: line-through !important; }

      /* 코드 블록 */
      pre { white-space: pre !important; font-family: monospace !important; }
      code { font-family: monospace !important; }

      /* 인용구 */
      blockquote { border-left: 4px solid #ccc; margin-left: 1em; padding-left: 1em; }

      /* 문단 간격 보존 - PostDetail rich-preview와 동일하게 */
      p { margin-top: 0.5em; margin-bottom: 0.5em; }
      /* 인라인 margin-bottom이 있는 p는 해당 인라인 값이 자동으로 적용됨 (CSS 구체성 규칙에 의해) */
      /* 주의: 인라인 style은 CSS 규칙보다 항상 우선순위가 높으므로 별도 강제 불필요 */

      /* 빈 p 태그(여백 블록) 시각화 - 편집 모드에서만 표시 */
      p:empty, p:has(br:only-child), p:has(> br:first-child:last-child) {
        min-height: 1.5em;
        position: relative;
      }
      p:empty::after, p:has(br:only-child)::after {
        content: '\u00a0';
        display: block;
        min-height: 1em;
      }
      p:empty, p:has(br:only-child) {
        background: rgba(251, 191, 36, 0.06) !important;
        border: 1px dashed rgba(251, 191, 36, 0.4) !important;
        border-radius: 2px;
      }
      p:empty:hover, p:has(br:only-child):hover {
        background: rgba(251, 191, 36, 0.12) !important;
        border-color: rgba(251, 191, 36, 0.7) !important;
      }

      /* 표 열 너비 드래그 핸들 */
      .col-resize-handle {
        position: absolute;
        top: 0;
        width: 6px;
        height: 100%;
        cursor: col-resize;
        z-index: 10;
        background: transparent;
        user-select: none;
        -webkit-user-select: none;
      }
      .col-resize-handle:hover,
      .col-resize-handle.dragging {
        background: rgba(99, 102, 241, 0.35);
      }
      /* 표 셀에 position:relative 적용 (핸들 배치용) - overflow는 hidden 유지 (너비 고정에 필수) */
      td[data-col-resizable], th[data-col-resizable] {
        position: relative;
        overflow: hidden !important;
      }
      /* 표 전체 너비 조정 핸들 */
      .table-width-handle {
        position: absolute;
        right: -5px;
        bottom: 0;
        width: 10px;
        height: 100%;
        cursor: ew-resize;
        z-index: 20;
        background: transparent;
        user-select: none;
        -webkit-user-select: none;
      }
      .table-width-handle:hover,
      .table-width-handle.dragging {
        background: rgba(99, 102, 241, 0.4);
      }
      /* 표 wrapper - position:relative로 핸들 배치 */
      .table-resize-wrapper {
        position: relative;
        display: inline-block;
        width: 100%;
        max-width: 100%;
      }
    `;
    doc.head.appendChild(style);
  }, []);

  // iframe 이벤트 바인딩
  const bindEvents = useCallback((doc: Document) => {
    const container = containerRef.current;
    if (!container) return;

    // ─── 표 열 너비 드래그 기능 ─────────────────────────────────────────────
    // 표에 드래그 핸들 주입 (표마다 한 번만 실행)
    const initTableColResize = (table: HTMLTableElement) => {
      if (table.getAttribute('data-col-resize-init')) return;
      table.setAttribute('data-col-resize-init', 'true');
      // 표를 wrapper로 감싸서 너비 조정 핸들 추가
      if (!table.parentElement?.classList.contains('table-resize-wrapper')) {
        const wrapper = doc.createElement('div');
        wrapper.className = 'table-resize-wrapper';
        table.parentNode?.insertBefore(wrapper, table);
        wrapper.appendChild(table);
        // 너비 조정 핸들 추가
        const widthHandle = doc.createElement('div');
        widthHandle.className = 'table-width-handle';
        widthHandle.setAttribute('data-table-width-handle', 'true');
        wrapper.appendChild(widthHandle);
      }

      // table-layout: fixed 강제 설정 (항상 덮어쓰기)
      table.style.tableLayout = 'fixed';
      table.style.width = table.style.width || '100%';
      table.style.wordBreak = 'break-word';
      table.style.overflowWrap = 'break-word';

      // 첫 번째 행의 셀들에 너비 초기화 (이미 지정된 경우 유지)
      const firstRow = table.rows[0];
      if (!firstRow) return;
      const cells = Array.from(firstRow.cells);
      const colCount = cells.length;

      // colgroup/col 요소 생성 또는 재사용
      let colgroup = table.querySelector('colgroup') as HTMLTableColElement | null;
      if (!colgroup) {
        colgroup = doc.createElement('colgroup') as unknown as HTMLTableColElement;
        table.insertBefore(colgroup, table.firstChild);
      }
      // col 요소 수를 셀 수에 맞춤
      const existingCols = Array.from(colgroup.querySelectorAll('col'));
      while (existingCols.length < colCount) {
        const col = doc.createElement('col');
        colgroup.appendChild(col);
        existingCols.push(col);
      }
      while (existingCols.length > colCount) {
        existingCols[existingCols.length - 1].remove();
        existingCols.pop();
      }

      // 각 col에 퍼센트 기반 너비 설정 (offsetWidth가 0이어도 안전)
      cells.forEach((cell, i) => {
        const col = existingCols[i];
        if (!col.style.width) {
          // 셀에 인라인 width가 있으면 우선 사용, 없으면 균등 분배
          const inlineW = (cell as HTMLElement).style.width;
          if (inlineW) {
            col.style.width = inlineW;
          } else {
            col.style.width = (100 / colCount).toFixed(2) + '%';
          }
        }
      });

      // 모든 td/th에 overflow:hidden + word-break 강제 (텍스트 입력 시 셀 확장 방지)
      Array.from(table.querySelectorAll('td, th')).forEach(cell => {
        const c = cell as HTMLElement;
        c.style.overflow = 'hidden';
        c.style.wordBreak = 'break-word';
        c.style.overflowWrap = 'break-word';
        c.style.maxWidth = '0'; // table-layout:fixed에서 max-width:0이 열 너비 고정의 핵심
      });

      // 열 마지막 세을 제외한 모든 셀에 드래그 핸들 주입
      const allRows = Array.from(table.rows);
      allRows.forEach(row => {
        const rowCells = Array.from(row.cells);
        rowCells.forEach((cell, colIdx) => {
          if (colIdx === rowCells.length - 1) return; // 마지막 열 제외
          if (cell.querySelector('.col-resize-handle')) return; // 이미 주입됨
          cell.setAttribute('data-col-resizable', 'true');
          const handle = doc.createElement('div');
          handle.className = 'col-resize-handle';
          handle.setAttribute('data-col-resize-handle', String(colIdx));
          handle.style.right = '-3px'; // 셀 오른쪽 경계에 위치
          cell.appendChild(handle);
        });
      });
    };

    // 모든 표에 드래그 핸들 주입
    const initAllTables = () => {
      const tables = Array.from(doc.querySelectorAll('table')) as HTMLTableElement[];
      tables.forEach(initTableColResize);
    };
    initAllTables();
    // initAllTables를 외부에서 호출 가능하도록 ref에 저장
    initAllTablesRef.current = initAllTables;

    // 표 열 드래그 상태
    let colResizeDragging = false;
    let colResizeStartX = 0;
    let colResizeColIdx = -1;
    let colResizeTable: HTMLTableElement | null = null;
    let colResizeHandle: HTMLElement | null = null;
    let colResizeStartWidths: number[] = [];

    const handleColResizeMouseDown = (e: MouseEvent) => {
      const target = e.target as HTMLElement;
      if (!target.classList.contains('col-resize-handle')) return;
      e.preventDefault();
      e.stopPropagation();

      const colIdx = parseInt(target.getAttribute('data-col-resize-handle') || '-1');
      if (colIdx < 0) return;

      const cell = target.parentElement as HTMLTableCellElement;
      const table = cell?.closest('table') as HTMLTableElement | null;
      if (!table) return;

      colResizeDragging = true;
      colResizeStartX = e.clientX;
      colResizeColIdx = colIdx;
      colResizeTable = table;
      colResizeHandle = target;
      target.classList.add('dragging');
      table.classList.add('col-resizing'); // 드래그 중 표 하이라이트

      // 현재 모든 col 너비 저장
      const cols = Array.from(table.querySelectorAll(':scope > colgroup > col')) as HTMLElement[];
      colResizeStartWidths = cols.map(col => {
        const w = col.style.width;
        return w ? parseFloat(w) : (table.offsetWidth / cols.length);
      });

      // 드래그 중 텍스트 선택 방지
      doc.body.style.userSelect = 'none';
      (doc.body.style as unknown as Record<string,string>)['-webkit-user-select'] = 'none';

      const handleMouseMove = (ev: MouseEvent) => {
        if (!colResizeDragging || !colResizeTable) return;
        const dx = ev.clientX - colResizeStartX;
        const cols2 = Array.from(colResizeTable.querySelectorAll(':scope > colgroup > col')) as HTMLElement[];
        if (colResizeColIdx >= cols2.length - 1) return;

        const newLeft = Math.max(30, colResizeStartWidths[colResizeColIdx] + dx);
        const newRight = Math.max(30, colResizeStartWidths[colResizeColIdx + 1] - dx);

        cols2[colResizeColIdx].style.width = newLeft + 'px';
        cols2[colResizeColIdx + 1].style.width = newRight + 'px';
      };

      const handleMouseUp = () => {
        if (!colResizeDragging) return;
        colResizeDragging = false;
        if (colResizeHandle) colResizeHandle.classList.remove('dragging');
        if (colResizeTable) {
          colResizeTable.classList.remove('col-resizing'); // 하이라이트 제거
          // px 단위 col 너비 → 퍼센트로 변환 (표-layout:fixed 안정성 보장)
          const tblW = colResizeTable.offsetWidth;
          if (tblW > 0) {
            const cols3 = Array.from(colResizeTable.querySelectorAll(':scope > colgroup > col')) as HTMLElement[];
            const totalPx = cols3.reduce((sum, c) => sum + parseFloat(c.style.width || '0'), 0);
            const base = totalPx > 0 ? totalPx : tblW;
            cols3.forEach(c => {
              const w = parseFloat(c.style.width || '0');
              if (w > 0) c.style.width = ((w / base) * 100).toFixed(2) + '%';
            });
          }
          // table.style.width를 100%로 유지
          colResizeTable.style.width = '100%';
          colResizeTable.style.tableLayout = 'fixed';
          // 모든 td/th max-width:0 재적용
          Array.from(colResizeTable.querySelectorAll('td, th')).forEach(cell => {
            (cell as HTMLElement).style.maxWidth = '0';
            (cell as HTMLElement).style.overflow = 'hidden';
          });
        }
        doc.body.style.userSelect = '';
        (doc.body.style as unknown as Record<string,string>)['-webkit-user-select'] = '';
        doc.removeEventListener('mousemove', handleMouseMove);
        doc.removeEventListener('mouseup', handleMouseUp);
        scheduleChange();
      };

      doc.addEventListener('mousemove', handleMouseMove);
      doc.addEventListener('mouseup', handleMouseUp);
    };

    doc.addEventListener('mousedown', handleColResizeMouseDown);

    // ─── 표 전체 너비 드래그 ──────────────────────────────────────────────
    let tableWidthDragging = false;
    let tableWidthStartX = 0;
    let tableWidthStartW = 0;
    let tableWidthEl: HTMLTableElement | null = null;
    let tableWidthHandleEl: HTMLElement | null = null;
    const handleTableWidthMouseDown = (e: MouseEvent) => {
      const target = e.target as HTMLElement;
      if (!target.hasAttribute('data-table-width-handle')) return;
      e.preventDefault();
      e.stopPropagation();
      const wrapper = target.parentElement;
      const table = wrapper?.querySelector('table') as HTMLTableElement | null;
      if (!table) return;
      tableWidthDragging = true;
      tableWidthStartX = e.clientX;
      tableWidthStartW = table.offsetWidth;
      tableWidthEl = table;
      tableWidthHandleEl = target;
      target.classList.add('dragging');
      doc.body.style.userSelect = 'none';
      (doc.body.style as unknown as Record<string,string>)['-webkit-user-select'] = 'none';
      const handleMouseMove = (ev: MouseEvent) => {
        if (!tableWidthDragging || !tableWidthEl) return;
        const dx = ev.clientX - tableWidthStartX;
        const newW = Math.max(120, tableWidthStartW + dx);
        tableWidthEl.style.width = newW + 'px';
        const wrapper2 = tableWidthEl.parentElement;
        if (wrapper2) wrapper2.style.width = newW + 'px';
      };
      const handleMouseUp = () => {
        if (!tableWidthDragging) return;
        tableWidthDragging = false;
        if (tableWidthHandleEl) tableWidthHandleEl.classList.remove('dragging');
        doc.body.style.userSelect = '';
        (doc.body.style as unknown as Record<string,string>)['-webkit-user-select'] = '';
        doc.removeEventListener('mousemove', handleMouseMove);
        doc.removeEventListener('mouseup', handleMouseUp);
        scheduleChange();
      };
      doc.addEventListener('mousemove', handleMouseMove);
      doc.addEventListener('mouseup', handleMouseUp);
    };
    doc.addEventListener('mousedown', handleTableWidthMouseDown);
    // ─────────────────────────────────────────────────────────────────────────

    // ─── 개별 요소 contenteditable 적용 (구조 보호) ──────────────────────────
    // 편집 가능한 텍스트 요소 태그 목록
    const EDITABLE_TAGS = new Set(['P','H1','H2','H3','H4','H5','H6',
      'DIV','LI','TD','TH','SPAN','A','STRONG','EM','B','I','U','S',
      'BLOCKQUOTE','PRE','CODE','CAPTION','FIGCAPTION','DT','DD',
      'LABEL','BUTTON']);
    // 현재 contenteditable이 적용된 요소
    let currentEditableEl: HTMLElement | null = null;

    // 요소에 contenteditable 적용
    const makeElementEditable = (el: HTMLElement) => {
      if (currentEditableEl === el) return; // 이미 편집 중
      // 이전 요소의 contenteditable 제거
      if (currentEditableEl && currentEditableEl !== el) {
        currentEditableEl.removeAttribute('contenteditable');
        currentEditableEl.style.cursor = '';
      }
      el.contentEditable = 'true';
      el.style.cursor = 'text';
      // td/th: contenteditable 활성화 시에도 너비 고정 강제
      if (el.tagName === 'TD' || el.tagName === 'TH') {
        el.style.overflow = 'hidden';
        el.style.wordBreak = 'break-word';
        el.style.overflowWrap = 'break-word';
        el.style.whiteSpace = 'normal';
        el.style.maxWidth = '0'; // table-layout:fixed 환경에서 핵심
        // 부모 table에도 table-layout:fixed 강제
        const tbl = el.closest('table') as HTMLTableElement | null;
        if (tbl) {
          tbl.style.tableLayout = 'fixed';
          if (!tbl.style.width) tbl.style.width = '100%';
        }
      }
      currentEditableEl = el;
    };

    // 요소의 contenteditable 제거
    const removeElementEditable = (el: HTMLElement) => {
      el.removeAttribute('contenteditable');
      el.style.cursor = '';
      if (currentEditableEl === el) currentEditableEl = null;
    };

    // 클릭한 요소에서 편집 가능한 가장 가까운 조상 찾기
    const findEditableAncestor = (target: HTMLElement): HTMLElement | null => {
      let el: HTMLElement | null = target;
      while (el && el !== doc.body) {
        if (EDITABLE_TAGS.has(el.tagName)) return el;
        el = el.parentElement;
      }
      return null;
    };

    // mousedown 시 편집 가능 요소 활성화
    const handleEditableMouseDown = (e: MouseEvent) => {
      const target = e.target as HTMLElement;
      // 이미지, 핸들, 오버레이 버튼 클릭은 무시
      if (target.tagName === 'IMG') return;
      if (target.hasAttribute('data-iframe-resize-handle')) return;
      if (target.hasAttribute('data-img-overlay-btn')) return;
      if (target.classList.contains('col-resize-handle')) return;

      const editableEl = findEditableAncestor(target);
      if (editableEl) {
        // DIV 클릭 시: 내부에 편집 가능한 자식(p, code 등)이 있으면 그쪽으로 위임
        // 단, DIV 자체가 contenteditable이거나 직접 텍스트 노드를 가지면 DIV 편집
        if (editableEl.tagName === 'DIV') {
          const innerEditable = editableEl.querySelector('p,h1,h2,h3,h4,h5,h6,li,blockquote,pre,code') as HTMLElement | null;
          if (innerEditable) {
            makeElementEditable(innerEditable);
            setTimeout(() => {
              if (innerEditable.isConnected) innerEditable.focus();
            }, 0);
            return;
          }
        }
        makeElementEditable(editableEl);
        // 포커스 이동 (클릭 위치에 커서 배치)
        // setTimeout으로 브라우저가 클릭 처리 후 포커스 설정
        setTimeout(() => {
          if (editableEl.isConnected) editableEl.focus();
        }, 0);
      } else if (target === doc.body || target.tagName === 'HTML') {
        // body/html 빈 공간 클릭 시: 클릭 위치에 가장 가까운 편집 가능 요소에 커서 배치
        if (currentEditableEl) {
          removeElementEditable(currentEditableEl);
        }
        const mouseX = e.clientX;
        const mouseY = e.clientY;
        // 클릭 위치와 가장 가까운 편집 가능 블록 찾기
        const allEditable = Array.from(doc.body.querySelectorAll(
          'p,h1,h2,h3,h4,h5,h6,li,td,th,blockquote,pre'
        )) as HTMLElement[];
        if (allEditable.length > 0) {
          let closest: HTMLElement | null = null;
          let minDist = Infinity;
          for (const el of allEditable) {
            const rect = el.getBoundingClientRect();
            if (mouseY >= rect.top && mouseY <= rect.bottom) {
              closest = el;
              break;
            }
            const centerY = (rect.top + rect.bottom) / 2;
            const dist = Math.abs(mouseY - centerY);
            if (dist < minDist) {
              minDist = dist;
              closest = el;
            }
          }
          if (closest) {
            makeElementEditable(closest);
            const closestEl = closest;
            setTimeout(() => {
              if (!closestEl.isConnected) return;
              closestEl.focus();
              // caretRangeFromPoint로 정확한 커서 위치 설정
              type DocWithCaret = Document & {
                caretRangeFromPoint?: (x: number, y: number) => Range | null;
                caretPositionFromPoint?: (x: number, y: number) => { offsetNode: Node; offset: number } | null;
              };
              const docExt = doc as DocWithCaret;
              let placed = false;
              if (docExt.caretRangeFromPoint) {
                const range = docExt.caretRangeFromPoint(mouseX, mouseY);
                if (range) {
                  const sel = doc.defaultView?.getSelection();
                  sel?.removeAllRanges();
                  sel?.addRange(range);
                  placed = true;
                }
              } else if (docExt.caretPositionFromPoint) {
                const pos = docExt.caretPositionFromPoint(mouseX, mouseY);
                if (pos) {
                  const range = doc.createRange();
                  range.setStart(pos.offsetNode, pos.offset);
                  range.collapse(true);
                  const sel = doc.defaultView?.getSelection();
                  sel?.removeAllRanges();
                  sel?.addRange(range);
                  placed = true;
                }
              }
              if (!placed) {
                const range = doc.createRange();
                range.selectNodeContents(closestEl);
                range.collapse(false);
                const sel = doc.defaultView?.getSelection();
                sel?.removeAllRanges();
                sel?.addRange(range);
              }
            }, 0);
          }
        }
      } else {
        // 편집 불가 영역 클릭 시 현재 편집 요소 비활성화
        if (currentEditableEl) {
          removeElementEditable(currentEditableEl);
        }
      }
    };

    // blur 시 contenteditable 제거 (포커스 이탈)
    const handleEditableBlur = (e: FocusEvent) => {
      const target = e.target as HTMLElement;
      if (target.getAttribute('contenteditable') === 'true' && target !== doc.body) {
        // relatedTarget이 같은 편집 가능 요소면 유지
        const related = e.relatedTarget as HTMLElement | null;
        if (related && findEditableAncestor(related)) return;
        // 약간의 지연 후 제거 (클릭 이벤트가 먼저 처리되도록)
        setTimeout(() => {
          if (target.isConnected && target.getAttribute('contenteditable') === 'true') {
            removeElementEditable(target);
          }
        }, 150);
      }
    };

    doc.addEventListener('mousedown', handleEditableMouseDown, true);
    doc.addEventListener('blur', handleEditableBlur, true);
    // ─────────────────────────────────────────────────────────────────────────

    // ─── 표 셀 드래그 다중 선택 ───────────────────────────────────────────────
    let cellDragStartEl: HTMLTableCellElement | null = null;
    let cellDragTable: HTMLTableElement | null = null;
    let cellDragging = false;

    const clearCellSelection = (tbl?: HTMLTableElement) => {
      const scope = tbl || doc;
      scope.querySelectorAll('.cell-selected, .cell-drag-start').forEach(el => {
        el.classList.remove('cell-selected', 'cell-drag-start');
      });
    };

    const getCellPos = (cell: HTMLTableCellElement): { row: number; col: number } => {
      const row = (cell.parentElement as HTMLTableRowElement)?.rowIndex ?? -1;
      const col = cell.cellIndex;
      return { row, col };
    };

    const selectCellRange = (table: HTMLTableElement, startCell: HTMLTableCellElement, endCell: HTMLTableCellElement) => {
      clearCellSelection(table);
      const { row: r1, col: c1 } = getCellPos(startCell);
      const { row: r2, col: c2 } = getCellPos(endCell);
      const minR = Math.min(r1, r2), maxR = Math.max(r1, r2);
      const minC = Math.min(c1, c2), maxC = Math.max(c1, c2);
      const rows = Array.from(table.rows);
      rows.forEach((row, ri) => {
        if (ri < minR || ri > maxR) return;
        Array.from(row.cells).forEach((cell, ci) => {
          if (ci < minC || ci > maxC) return;
          cell.classList.add('cell-selected');
        });
      });
      startCell.classList.add('cell-drag-start');
    };

    const handleCellDragMouseDown = (e: MouseEvent) => {
      const target = e.target as HTMLElement;
      if (target.classList.contains('col-resize-handle')) return;
      const cell = target.closest('td, th') as HTMLTableCellElement | null;
      if (!cell) return;
      const table = cell.closest('table') as HTMLTableElement | null;
      if (!table) return;
      // Ctrl/Cmd 없이 클릭 시 기존 선택 해제
      if (!e.ctrlKey && !e.metaKey) clearCellSelection(table);
      cellDragStartEl = cell;
      cellDragTable = table;
      cellDragging = false;
      cell.classList.add('cell-selected', 'cell-drag-start');
    };

    const handleCellDragMouseMove = (e: MouseEvent) => {
      if (!cellDragStartEl || !cellDragTable) return;
      const target = doc.elementFromPoint(e.clientX, e.clientY) as HTMLElement | null;
      if (!target) return;
      const cell = target.closest('td, th') as HTMLTableCellElement | null;
      if (!cell) return;
      if (cell.closest('table') !== cellDragTable) return;
      cellDragging = true;
      selectCellRange(cellDragTable, cellDragStartEl, cell);
    };

    const handleCellDragMouseUp = () => {
      if (!cellDragging) {
        // 단순 클릭: 선택 유지 (단일 셀)
      }
      cellDragStartEl = null;
      cellDragTable = null;
      cellDragging = false;
    };

    doc.addEventListener('mousedown', handleCellDragMouseDown);
    doc.addEventListener('mousemove', handleCellDragMouseMove);
    doc.addEventListener('mouseup', handleCellDragMouseUp);
    // ─────────────────────────────────────────────────────────────────────────

    // 이미지 클릭 → 오버레이 표시
    const handleImgClick = (e: MouseEvent) => {
      const target = e.target as HTMLElement;
      // 표 셀 클릭 시 표 편집 메뉴 표시
      const cellEl = target.closest("td,th") as HTMLElement | null;
      if (cellEl) {
        const tableEl = cellEl.closest("table") as HTMLElement | null;
        if (tableEl) {
          e.stopPropagation();
          const iframeRect = iframeRef.current!.getBoundingClientRect();
          setTableEditMenu({ tableEl, cellEl, x: iframeRect.left + e.clientX, y: iframeRect.top + e.clientY });
          setFloatToolbar(prev => ({ ...prev, blockEl: null, tableEl: null, cellEl: null }));
          return;
        }
      }
      if (target.tagName !== "IMG") {
        // 이미지가 아닌 곣 클릭 시 이미지 편집 팝업 닫기
        if (imageOverlay.visible) {
          if (imageOverlay.imgEl) {
            imageOverlay.imgEl.style.outline = '';
            imageOverlay.imgEl.removeAttribute('data-img-selected');
            imageOverlay.imgEl.parentElement?.querySelectorAll('[data-iframe-resize-handle]').forEach(el => el.remove());
          }
          setImageOverlay(prev => ({ ...prev, visible: false }));
        }
        // 버튼 스타일(a 또는 span)이 있는 요소 클릭 시 버튼 편집 다이얼로그 열기
        const btnEl = (target.closest('a[style*="border-radius"], span[style*="border-radius"]') ||
          (target.tagName === 'A' && (target as HTMLElement).style.borderRadius ? target : null) ||
          (target.tagName === 'SPAN' && (target as HTMLElement).style.borderRadius ? target : null)) as HTMLElement | null;
        if (btnEl && (btnEl.style.background || btnEl.style.backgroundColor)) {
          e.preventDefault();
          e.stopPropagation();
          // 기존 버튼의 스타일 추출
          const btnText = btnEl.textContent || '버튼 텍스트';
          editingButtonElRef.current = btnEl;
          setButtonDefaultText(btnText);
          setShowButtonDialog(true);
          return;
        }
        return;
      }
      e.preventDefault();
      e.stopPropagation();

      const img = target as HTMLImageElement;
      const rect = img.getBoundingClientRect();
      const containerRect = container.getBoundingClientRect();
      const iframeRect = iframeRef.current!.getBoundingClientRect();

      // 현재 정렬 감지
      let detectedAlign: 'left' | 'center' | 'right' = 'left';
      const imgFloat = img.style.float;
      const imgMargin = img.style.margin;
      const imgDisplay = img.style.display;
      if (imgDisplay === 'block' && (imgMargin === '0 auto' || imgMargin === '0px auto')) {
        detectedAlign = 'center';
      } else if (imgFloat === 'right') {
        detectedAlign = 'right';
      } else {
        detectedAlign = 'left';
      }
      // 현재 너비 감지
      const detectedWidth = img.style.width || `${img.offsetWidth}px`;
      // alt 텍스트 감지
      const detectedAlt = img.getAttribute('alt') || '';
      // 캡션 감지 (figure > figcaption 구조)
      const figureEl = img.closest('figure');
      const figcaptionEl = figureEl?.querySelector('figcaption');
      const detectedCaption = figcaptionEl?.textContent || '';
      // 원본 비율 감지 (naturalWidth/naturalHeight)
      const nw = img.naturalWidth || img.offsetWidth || 0;
      const nh = img.naturalHeight || img.offsetHeight || 0;
      const detectedAspectRatio = nh > 0 ? nw / nh : 0;

      setImageOverlay({
        visible: true,
        x: iframeRect.left - containerRect.left + rect.left + rect.width / 2,
        y: iframeRect.top - containerRect.top + rect.top - 8,
        imgRight: iframeRect.left - containerRect.left + rect.right, // 이미지 우측 끝 x
        imgEl: img,
        currentAlign: detectedAlign,
        currentWidth: detectedWidth,
        currentAlt: detectedAlt,
        currentCaption: detectedCaption,
        aspectRatio: detectedAspectRatio,
        keepAspect: true, // 기본값: 비율 유지
      });
      // 이미지 클릭 시 + 삽입 메뉴 닫기 (상호 배타적)
      setPlusButton(prev => ({ ...prev, visible: false, showMenu: false }));
      setFloatToolbar(prev => ({ ...prev, blockEl: null, tableEl: null, cellEl: null }));

      // 이미지 선택 테두리 표시
      doc.querySelectorAll('[data-img-selected]').forEach(el => {
        (el as HTMLElement).style.outline = '';
        (el as HTMLElement).removeAttribute('data-img-selected');
      });
      img.style.outline = '2px solid #6366f1';
      img.style.outlineOffset = '2px';
      img.setAttribute('data-img-selected', 'true');

      // 4방향 드래그 리사이즈 핸들 주입 (이미 있으면 기존 제거 후 재주입)
      img.parentElement?.querySelectorAll('[data-iframe-resize-handle]').forEach(el => el.remove());
      {
        const parent = img.parentElement;
        if (!parent) return;
        // 부모에 position:relative 필요
        const parentStyle = doc.defaultView!.getComputedStyle(parent);
        if (parentStyle.position === 'static') parent.style.position = 'relative';

        // 4방향 핸들 정의: [data-dir, cursor, position CSS]
        const handles: Array<{ dir: string; cursor: string; pos: string }> = [
          { dir: 'se', cursor: 'se-resize', pos: 'bottom:0;right:0;border-radius:3px 0 0 0;' },
          { dir: 'sw', cursor: 'sw-resize', pos: 'bottom:0;left:0;border-radius:0 3px 0 0;' },
          { dir: 'ne', cursor: 'ne-resize', pos: 'top:0;right:0;border-radius:0 0 0 3px;' },
          { dir: 'nw', cursor: 'nw-resize', pos: 'top:0;left:0;border-radius:0 0 3px 0;' },
        ];

        handles.forEach(({ dir, cursor, pos }) => {
          const handleEl = doc.createElement('span');
          handleEl.setAttribute('data-iframe-resize-handle', dir);
          handleEl.style.cssText = `position:absolute;${pos}width:14px;height:14px;background:#6366f1;cursor:${cursor};z-index:20;opacity:0.85;`;

          let startX = 0, startY = 0, startW = 0, startH = 0;
          const onMove = (ev: MouseEvent) => {
            const dx = ev.clientX - startX;
            const dy = ev.clientY - startY;
            let newW = startW;
            // 수평 방향에 따라 너비 계산
            if (dir === 'se' || dir === 'ne') newW = Math.max(40, startW + dx);
            else newW = Math.max(40, startW - dx);
            // Shift 키: 자유 리사이즈 / 기본: 비율 유지
            if (ev.shiftKey) {
              // Shift 키 누르면 자유 리사이즈 (수직 방향 독립)
              let newH = startH;
              if (dir === 'se' || dir === 'sw') newH = Math.max(20, startH + dy);
              else newH = Math.max(20, startH - dy);
              img.style.width = newW + 'px';
              img.style.height = newH + 'px';
              img.style.maxWidth = '100%';
            } else {
              // 기본: 비율 유지 (너비 기준, height auto)
              img.style.width = newW + 'px';
              img.style.maxWidth = '100%';
              img.style.height = 'auto';
            }
            void dy;
          };
          const onUp = () => {
            doc.removeEventListener('mousemove', onMove);
            doc.removeEventListener('mouseup', onUp);
            doc.body.style.cursor = '';
            doc.body.style.userSelect = '';
            // 오버레이 너비 업데이트
            setImageOverlay(prev => ({ ...prev, currentWidth: img.style.width }));
            scheduleChange();
          };
          handleEl.addEventListener('mousedown', (ev: MouseEvent) => {
            ev.preventDefault();
            ev.stopPropagation();
            startX = ev.clientX;
            startY = ev.clientY;
            startW = img.offsetWidth || img.naturalWidth || 200;
            startH = img.offsetHeight || img.naturalHeight || 150;
            doc.body.style.cursor = cursor;
            doc.body.style.userSelect = 'none';
            doc.addEventListener('mousemove', onMove);
            doc.addEventListener('mouseup', onUp);
          });
          parent.appendChild(handleEl);
        });
      }
    };

    // 블록 마우스 오버 → body 직계 자식 블록 기준 오버레이 표시
    // blockHideTimerRef는 React ref로 관리 (오버레이 버튼 onMouseEnter에서도 취소 가능)
    let currentHoveredBlock: HTMLElement | null = null;

    // 모든 블록 요소 태그 (삭제 버튼 표시 대상)
    const DELETABLE_BLOCK_TAGS = new Set(['P','H1','H2','H3','H4','H5','H6',
      'DIV','SECTION','ARTICLE','ASIDE','HEADER','FOOTER',
      'UL','OL','BLOCKQUOTE','PRE','TABLE','FIGURE','HR',
      'FORM','FIELDSET','DETAILS','SUMMARY']);

    const findTopLevelBlock = (el: HTMLElement): HTMLElement | null => {
      // body 직계 자식 중 삭제 가능한 블록 찾기
      // 래퍼 div/section/article 안의 직계 자식도 포함
      const body = doc.body;
      let cur: HTMLElement | null = el;
      while (cur && cur !== body) {
        // body 직계 자식이면 삭제 가능
        if (cur.parentElement === body) {
          if (DELETABLE_BLOCK_TAGS.has(cur.tagName)) return cur;
          return null;
        }
        // 래퍼 div/section/article 안의 직계 자식도 삭제 가능
        // (조건 완화: 래퍼의 자식 수에 관계없이 허용)
        if (cur.parentElement && cur.parentElement.parentElement === body) {
          const wrapper = cur.parentElement;
          if (['DIV','SECTION','ARTICLE','MAIN','HEADER','FOOTER'].includes(wrapper.tagName)) {
            if (DELETABLE_BLOCK_TAGS.has(cur.tagName)) return cur;
          }
        }
        cur = cur.parentElement;
      }
      return null;
    };

    // 빈 블록 여부 판단 헬퍼
    const isEmptyBlock = (el: HTMLElement): boolean => {
      const text = el.textContent ?? '';
      if (text.trim() !== '') return false;
      // <br> 하나만 있거나 완전히 비어있으면 빈 블록
      const children = Array.from(el.childNodes);
      if (children.length === 0) return true;
      if (children.length === 1 && children[0].nodeName === 'BR') return true;
      return false;
    };

    const handleMouseOver = (e: MouseEvent) => {
      const target = e.target as HTMLElement;
      const topBlock = findTopLevelBlock(target);
      if (!topBlock) return;
      if (topBlock === currentHoveredBlock) return; // 이미 표시 중이면 스킵
      // 클릭으로 선택된 블록이 있으면 hover 응답 차단 (다른 블록으로 오버레이 이동 방지)
      if (selectedBlockRef.current && selectedBlockRef.current !== topBlock) return;

      // 이전 호버 블록 하이라이트 제거
      if (currentHoveredBlock) currentHoveredBlock.classList.remove("iframe-block-hover");
      currentHoveredBlock = topBlock;
      topBlock.classList.add("iframe-block-hover");

      const rect = topBlock.getBoundingClientRect();
      const containerRect = container.getBoundingClientRect();
      const iframeRect = iframeRef.current!.getBoundingClientRect();

      if (blockHideTimerRef.current) { clearTimeout(blockHideTimerRef.current); blockHideTimerRef.current = null; }
      blockElRef.current = topBlock;
      setBlockOverlay({
        visible: true,
        // x는 블록 왼쪽 끝 기준 (width와 함께 우측 위치 계산에 사용)
        x: iframeRect.left - containerRect.left + rect.left,
        y: iframeRect.top - containerRect.top + rect.top,
        width: rect.width,
        blockEl: topBlock,
      });

      // ── 빈 블록 hover 시 + 버튼 자동 표시 ──────────────────────────────
      // 패널이 열린 상태이면 건드리지 않음
      if (plusShowMenuRef.current) return;
      if (isEmptyBlock(topBlock)) {
        const blockChildren = getBlockChildrenForPlus(doc.body);
        const idx = blockChildren.indexOf(topBlock);
        if (idx >= 0) {
          // 이 빈 블록 앞에 삽입 (insertBeforeMode)
          const blockRectNow = topBlock.getBoundingClientRect();
          const midY = blockRectNow.top + blockRectNow.height / 2;
          showPlusAt(topBlock, midY - iframeRect.top, false, true);
        }
      }
    };

    const handleMouseOut = (e: MouseEvent) => {
      const relatedTarget = e.relatedTarget as HTMLElement | null;
      // 마우스가 iframe 내부에서 다른 요소로 이동한 것이면 즉시 숨기지 않음
      if (relatedTarget && doc.body.contains(relatedTarget)) return;
      // iframe 밖으로 나갈 때만 지연 후 숨기기
      if (currentHoveredBlock) currentHoveredBlock.classList.remove("iframe-block-hover");
      currentHoveredBlock = null;
      blockHideTimerRef.current = setTimeout(() => {
        setBlockOverlay(prev => ({ ...prev, visible: false }));
      }, 200);
      // + 버튼은 클릭 기반으로만 열리므로 mouseout으로 자동 숨기지 않는다.
      // 패널이 열린 상태에서는 닫기 버튼/ESC/외부 클릭으로만 닫힌다.
    };

    const handleInput = () => {
      adjustHeight();
      scheduleChange();
    };

    // 텍스트 선택 / 블록 클릭 시 플로팅 툴바 표시
    const TOOLBAR_BLOCK_TAGS = ["P","H1","H2","H3","H4","H5","H6","DIV","SECTION",
      "BLOCKQUOTE","PRE","LI","TD","TH","SPAN","A","BUTTON","HR","IMG","FIGURE","TABLE","UL","OL"];

    const handleMouseUp = (e: MouseEvent) => {
      // 이미지 클릭이면 무시
      const target = e.target as HTMLElement;
      if (target.tagName === "IMG") return;

      const iframeWin = iframeRef.current?.contentWindow;
      if (!iframeWin) return;

      const sel = iframeWin.getSelection();
      const iframeRect = iframeRef.current!.getBoundingClientRect();

      // 텍스트가 선택된 경우 → selection 모드
      if (sel && !sel.isCollapsed && sel.toString().trim()) {
        const range = sel.getRangeAt(0);
        savedIframeSelectionRef.current = { range: range.cloneRange(), win: iframeWin };
        selectedTextRef.current = sel.toString().trim();

        const selRect = range.getBoundingClientRect();
        // 표 안에서 텍스트 선택 시 tableEl/cellEl 감지 (표 편집 탭 통합)
        let selTableEl: HTMLElement | null = null;
        let selCellEl: HTMLElement | null = null;
        let anchorNode: Node | null = range.startContainer;
        let anchorEl: HTMLElement | null = anchorNode?.nodeType === 1
          ? anchorNode as HTMLElement
          : anchorNode?.parentElement ?? null;
        while (anchorEl && anchorEl !== iframeWin.document.body) {
          if (anchorEl.tagName === 'TD' || anchorEl.tagName === 'TH') {
            selCellEl = anchorEl;
            let p: HTMLElement | null = anchorEl.parentElement;
            while (p && p.tagName !== 'TABLE') p = p.parentElement;
            selTableEl = p;
            break;
          }
          anchorEl = anchorEl.parentElement;
        }
        setFloatToolbar(prev => ({
          ...prev,
          mode: 'selection',
          blockEl: null,
          tableEl: selTableEl,
          cellEl: selCellEl,
        }));
        return;
      }

      // 클릭만 한 경우 → 블록 클릭 모드
      // 클릭한 요소에서 가장 가까운 편집 가능 블록 찾기
      let el: HTMLElement | null = target;
      let foundBlock: HTMLElement | null = null;
      while (el && el !== iframeWin.document.body) {
        if (TOOLBAR_BLOCK_TAGS.includes(el.tagName)) {
          foundBlock = el;
          break;
        }
        el = el.parentElement;
      }

      if (foundBlock) {
        // 선택 영역 저장 (블록 전체를 가리키는 range)
        const doc = iframeWin.document;
        const range = doc.createRange();
        range.selectNodeContents(foundBlock);
        savedIframeSelectionRef.current = { range, win: iframeWin };
        selectedTextRef.current = foundBlock.textContent?.trim() || '';

        // 클릭 위치 기준으로 툴바 표시
        const clickX = iframeRect.left + e.clientX;
        const clickY = iframeRect.top + e.clientY;

        // td/th 클릭 시: 가장 가까운 table 요소 찾기
        let tableElForToolbar: HTMLElement | null = null;
        let cellElForToolbar: HTMLElement | null = null;
        if (foundBlock.tagName === 'TD' || foundBlock.tagName === 'TH') {
          cellElForToolbar = foundBlock;
          let p: HTMLElement | null = foundBlock.parentElement;
          while (p && p.tagName !== 'TABLE') p = p.parentElement;
          tableElForToolbar = p;
        }

        // 이전 선택 블록 클래스 제거
        if (selectedBlockRef.current && selectedBlockRef.current !== foundBlock) {
          selectedBlockRef.current.classList.remove('iframe-block-selected');
        }
        // 새 선택 블록에 클래스 추가 (클릭 시 호버 클래스 제거 후 선택 클래스 추가)
        foundBlock.classList.remove('iframe-block-hover');
        foundBlock.classList.add('iframe-block-selected');
        selectedBlockRef.current = foundBlock;
        // blockElRef도 동기화 (블록 삭제 버튼용)
        blockElRef.current = foundBlock;

        // 블록 오버레이(삭제 버튼)도 선택 위치로 업데이트
        const selRect = foundBlock.getBoundingClientRect();
        const containerRect = containerRef.current!.getBoundingClientRect();
        const iframeRectForOverlay = iframeRef.current!.getBoundingClientRect();
        setBlockOverlay({
          visible: true,
          // x는 블록 왼쪽 끝 기준 (width와 함께 우측 위치 계산에 사용)
          x: iframeRectForOverlay.left - containerRect.left + selRect.left,
          y: iframeRectForOverlay.top - containerRect.top + selRect.top,
          width: selRect.width,
          blockEl: foundBlock,
        });

        // 팝업 편집기 좌표: iframe 내부 좌표 → viewport 좌표로 보정
        // selRect는 iframe 내부 document 기준이므로 iframeRect offset을 더해야 함
        const popupLeft = iframeRectForOverlay.left + selRect.left;
        const popupTop = iframeRectForOverlay.top + selRect.top;
        const popupBottomY = iframeRectForOverlay.top + selRect.bottom;
        const popupRightX = iframeRectForOverlay.left + selRect.right;

        setFloatToolbar(prev => ({
          ...prev,
          mode: 'block',
          blockEl: foundBlock,
          tableEl: tableElForToolbar,
          cellEl: cellElForToolbar,
          popupX: popupLeft,
          popupY: popupTop,
          popupBottom: popupBottomY,
          popupRight: popupRightX,
          currentBlockType: foundBlock.tagName,
        }));
      } else {
        // 빈 영역 클릭 시 선택 해제
        if (selectedBlockRef.current) {
          selectedBlockRef.current.classList.remove('iframe-block-selected');
          selectedBlockRef.current = null;
        }
        blockElRef.current = null;
        setBlockOverlay({ visible: false, x: 0, y: 0, width: 0, blockEl: null });
        setFloatToolbar(prev => ({ ...prev, mode: 'selection', blockEl: null, tableEl: null, cellEl: null, popupX: undefined, popupY: undefined, popupBottom: undefined }));
      }
    };

    const handleKeyUp = () => {
      scheduleChange();
    };

    // ─── 커서가 빈 줄에 있을 때 + 버튼 자동 표시 (selectionchange) ───
    const handleSelectionChange = () => {
      // 패널이 열린 상태이면 건드리지 않음
      if (plusShowMenuRef.current) return;
      const sel = doc.getSelection();
      if (!sel || sel.rangeCount === 0) return;
      const range = sel.getRangeAt(0);
      if (!range.collapsed) return; // 텍스트 선택 중이면 무시
      const anchorNode = sel.anchorNode;
      if (!anchorNode) return;
      const el = anchorNode.nodeType === Node.ELEMENT_NODE
        ? (anchorNode as HTMLElement)
        : anchorNode.parentElement;
      if (!el) return;
      const topBlock = findTopLevelBlock(el);
      if (!topBlock) return;
      if (isEmptyBlock(topBlock)) {
        const iframeRect = iframeRef.current!.getBoundingClientRect();
        const blockRect = topBlock.getBoundingClientRect();
        const midY = blockRect.top + blockRect.height / 2 - iframeRect.top;
        showPlusAt(topBlock, midY, false, true);
      } else {
        // 비어있지 않은 블록으로 커서가 이동하면 + 버튼 숨기기
        setPlusButton(prev => (prev.showMenu ? prev : { ...prev, visible: false }));
      }
    };

    // Ctrl+Z / Ctrl+Y / Ctrl+Shift+Z 단축키 처리
    // undoHandlerRef/redoHandlerRef를 사용하여 항상 최신 함수 참조 (클로저 stale 방지)
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        // ESC: 모든 팝업 닫기 (이미지 편집 팝업, + 메뉴, 플로팅 툴바) + 블록 선택 해제
        setImageOverlay(prev => ({ ...prev, visible: false }));
        setPlusButton(prev => ({ ...prev, visible: false, showMenu: false }));
        setFloatToolbar(prev => ({ ...prev, blockEl: null, tableEl: null, cellEl: null, popupX: undefined, popupY: undefined, popupBottom: undefined }));
        // 선택된 블록 클래스 제거
        if (selectedBlockRef.current) {
          selectedBlockRef.current.classList.remove('iframe-block-selected');
          selectedBlockRef.current = null;
        }
        blockElRef.current = null;
        setBlockOverlay({ visible: false, x: 0, y: 0, width: 0, blockEl: null });
        return;
      }
      // Delete/Backspace: 선택된 블록 삭제 (편집 중인 요소가 없을 때만)
      if ((e.key === 'Delete' || e.key === 'Backspace') && !e.ctrlKey && !e.metaKey) {
        const selBlock = selectedBlockRef.current || blockElRef.current;
        if (selBlock) {
          // 현재 편집 중인 요소가 있으면 일반 텍스트 삭제로 처리
          const activeEl = doc.activeElement as HTMLElement | null;
          if (activeEl && activeEl.getAttribute('contenteditable') === 'true' && activeEl !== doc.body) {
            return; // 텍스트 편집 중 - 기본 동작 허용
          }
          e.preventDefault();
          e.stopPropagation();
          pushSnapshot();
          selBlock.remove();
          selectedBlockRef.current = null;
          blockElRef.current = null;
          setBlockOverlay({ visible: false, x: 0, y: 0, width: 0, blockEl: null });
          setFloatToolbar(prev => ({ ...prev, blockEl: null, tableEl: null, cellEl: null }));
          scheduleChange();
          return;
        }
      }
      if (e.ctrlKey || e.metaKey) {
        if (e.key === 'z' && !e.shiftKey) {
          e.preventDefault();
          e.stopPropagation();
          undoHandlerRef.current();
        } else if (e.key === 'y' || (e.key === 'z' && e.shiftKey)) {
          e.preventDefault();
          e.stopPropagation();
          redoHandlerRef.current();
        }
      }
    };

    // 워드프레스식 + 버튼: 블록 요소 사이 클릭 시 표시
    const BLOCK_TAGS_FOR_PLUS = ["P", "DIV", "H1", "H2", "H3", "H4", "H5", "H6",
      "UL", "OL", "LI", "BLOCKQUOTE", "PRE", "TABLE", "FIGURE", "SECTION",
      "HEADER", "FOOTER", "ARTICLE", "ASIDE", "HR", "IMG"];
    const PLUS_INSERT_EDGE_THRESHOLD = 50; // 경계 감지 범위 확대 (30→50px, 블록 상하단 근처 마우스 이동만으로도 감지)
    const PLUS_INSERT_EMPTY_GAP_THRESHOLD = 20; // 빈 공간 감지 최소 크기 축소 (28→20px)
    const closePlusUi = () => {
      if (plusHideTimerRef.current) clearTimeout(plusHideTimerRef.current);
      setPlusButton(prev => ({ ...prev, visible: false, showMenu: false }));
    };
    const hidePlusButtonOnly = () => {
      if (plusHideTimerRef.current) clearTimeout(plusHideTimerRef.current);
      setPlusButton(prev => prev.showMenu ? prev : { ...prev, visible: false });
    };
    const getBlockChildrenForPlus = (parent: HTMLElement): HTMLElement[] => {
      // body의 직계 자식 블록만 반환 - 재귀 파고들기 없음
      // 커스텀 배경 div 등 복합 블록도 하나의 단위로 인식해야 삽입 위치가 정확함
      const children = Array.from(parent.children) as HTMLElement[];
      // body 직계 자식 중 블록 태그인 것들을 그대로 반환
      const blocks = children.filter(el => BLOCK_TAGS_FOR_PLUS.includes(el.tagName));
      if (blocks.length >= 1) return blocks;
      // body에 블록 자식이 없고 단일 래퍼 div만 있는 경우에만 한 단계 내려감
      if (children.length === 1 && ['DIV', 'SECTION', 'ARTICLE', 'MAIN'].includes(children[0].tagName)) {
        const inner = Array.from(children[0].children) as HTMLElement[];
        const innerBlocks = inner.filter(el => BLOCK_TAGS_FOR_PLUS.includes(el.tagName));
        if (innerBlocks.length >= 1) return innerBlocks;
      }
      return blocks;
    };
    const findClickedBlockForPlus = (el: HTMLElement, blockChildren: HTMLElement[]): HTMLElement | null => {
      let cur: HTMLElement | null = el;
      while (cur && cur !== doc.body) {
        if (blockChildren.includes(cur)) return cur;
        cur = cur.parentElement;
      }
      return null;
    };
    type PlusResolved =
      | { type: 'append-paragraph' }
      | { type: 'insert-target'; afterEl: HTMLElement; foundY: number; insertBeforeMode: boolean };
    const resolvePlusInsertionTarget = (target: HTMLElement, mouseY: number): PlusResolved | null => {
      const blockChildren = getBlockChildrenForPlus(doc.body);
      if (blockChildren.length === 0) return null;

      const clickedTopBlock = findClickedBlockForPlus(target, blockChildren);
      let afterEl: HTMLElement | null = null;
      let foundY = mouseY;
      let insertBeforeMode = false;
      let shouldOpen = false;

      if (clickedTopBlock) {
        const rect = clickedTopBlock.getBoundingClientRect();
        const distFromTop = Math.abs(mouseY - rect.top);
        const distFromBottom = Math.abs(rect.bottom - mouseY);
        const isNearTopEdge = distFromTop <= PLUS_INSERT_EDGE_THRESHOLD;
        const isNearBottomEdge = distFromBottom <= PLUS_INSERT_EDGE_THRESHOLD;

        if (!isNearTopEdge && !isNearBottomEdge) {
          return null;
        }

        if (isNearTopEdge && distFromTop <= distFromBottom) {
          // 항상 클릭된 블록 자체를 insertBeforeMode=true로 처리
          // (idx-1 블록을 afterEl로 설정하면 엉뚱한 위치에 삽입되는 버그 발생)
          afterEl = clickedTopBlock;
          foundY = rect.top - 10;
          insertBeforeMode = true;
          shouldOpen = true;
        } else {
          afterEl = clickedTopBlock;
          foundY = rect.bottom + 4;
          shouldOpen = true;
        }
      } else {
        for (let i = 0; i < blockChildren.length - 1; i++) {
          const currentRect = blockChildren[i].getBoundingClientRect();
          const nextRect = blockChildren[i + 1].getBoundingClientRect();
          if (mouseY >= currentRect.bottom - 2 && mouseY <= nextRect.top + 2) {
            const gapTop = currentRect.bottom;
            const gapBottom = nextRect.top;
            const gapSize = gapBottom - gapTop;
            if (gapSize >= 0 && (gapSize >= PLUS_INSERT_EMPTY_GAP_THRESHOLD || (mouseY >= gapTop - 4 && mouseY <= gapBottom + 4))) {
              afterEl = blockChildren[i];
              foundY = gapSize > 0 ? (gapTop + gapBottom) / 2 : gapTop;
              shouldOpen = true;
              break;
            }
          }
        }

        if (!shouldOpen) {
          const firstRect = blockChildren[0].getBoundingClientRect();
          if (mouseY < firstRect.top && Math.abs(mouseY - firstRect.top) <= 40) {
            afterEl = blockChildren[0];
            foundY = firstRect.top - 10;
            insertBeforeMode = true;
            shouldOpen = true;
          }
        }

        if (!shouldOpen) {
          const lastBlock = blockChildren[blockChildren.length - 1];
          const lastRect = lastBlock.getBoundingClientRect();
          if (mouseY > lastRect.bottom + 20 && target === doc.body) {
            return { type: 'append-paragraph' };
          }
        }
      }

      if (!shouldOpen || !afterEl) return null;
      return { type: 'insert-target', afterEl, foundY, insertBeforeMode };
    };
    const openPlusAtResolvedTarget = (resolved: PlusResolved) => {
      if (resolved.type === 'append-paragraph') {
        const newP = doc.createElement('p');
        newP.innerHTML = '<br>';
        doc.body.appendChild(newP);
        makeElementEditable(newP);
        setTimeout(() => {
          if (!newP.isConnected) return;
          newP.focus();
          const range = doc.createRange();
          range.setStart(newP, 0);
          range.collapse(true);
          const sel = doc.defaultView?.getSelection();
          sel?.removeAllRanges();
          sel?.addRange(range);
        }, 0);
        scheduleChange();
        return;
      }
      plusClosedRef.current = false;
      plusClickCountRef.current = 0;
      showPlusAt(resolved.afterEl, resolved.foundY, true, resolved.insertBeforeMode);
    };

    // iframe 내부 좌표(y) → 컨테이너 기준 상대 좌표 변환 헬퍼
    // iframe 내부 getBoundingClientRect()는 이미 viewport 좌표를 반환함
    // (iframe 내부 document의 getBoundingClientRect는 iframe 자체 viewport 기준)
    // 따라서 화면 절대 좌표 = iframeRect.top + iframeInternalY (스크롤 고려)
    const iframeInternalToContainerY = (iframeInternalViewportY: number): number => {
      const iframe = iframeRef.current;
      if (!iframe) return iframeInternalViewportY;
      const iframeRect = iframe.getBoundingClientRect();
      const containerRect = container.getBoundingClientRect();
      // iframe 내부 viewport Y → 화면 절대 Y → 컨테이너 기준 Y
      return (iframeRect.top + iframeInternalViewportY) - containerRect.top;
    };

    const iframeInternalToContainerX = (iframeInternalViewportX: number): number => {
      const iframe = iframeRef.current;
      if (!iframe) return iframeInternalViewportX;
      const iframeRect = iframe.getBoundingClientRect();
      const containerRect = container.getBoundingClientRect();
      return (iframeRect.left + iframeInternalViewportX) - containerRect.left;
    };

    // + 버튼 표시 공통 함수
    const showPlusAt = (afterEl: HTMLElement, iframeInternalY: number, openMenu = false, insertBeforeMode = false) => {
      const iframe = iframeRef.current;
      if (!iframe) return;
      const iframeRect = iframe.getBoundingClientRect();
      const blockRect = afterEl.getBoundingClientRect();
      // + 버튼은 선택한 블록 바로 위(상단)에 표시 - 블록 좌측에서 중앙으로 이동
      // insertBeforeMode: afterEl 앞에 삽입 → afterEl 상단
      // 일반 모드: afterEl 다음 블록 상단 (= afterEl 하단)
      const nextBlock = !insertBeforeMode ? (afterEl.nextElementSibling as HTMLElement | null) : null;
      const targetBlockRect = insertBeforeMode ? blockRect : (nextBlock ? nextBlock.getBoundingClientRect() : blockRect);
      // + 버튼을 대상 블록의 좌측 중앙 근처에 위치
      const blockLeft = iframeRect.left + targetBlockRect.left;
      const leftX = Math.max(iframeRect.left + 4, blockLeft - 16);
      // Y는 대상 블록 바로 위 (상단 경계)
      const viewportY = iframeRect.top + iframeInternalY;
      plusAfterElRef.current = afterEl;
      plusInsertBeforeModeRef.current = insertBeforeMode;
      if (plusHideTimerRef.current) clearTimeout(plusHideTimerRef.current);
      setPlusButton(prev => ({
        ...prev,
        visible: true,
        x: leftX,
        y: viewportY,
        afterEl,
        insertBeforeMode,
        // 패널이 열린 상태에서는 showMenu를 절대 false로 바꾼 수 없음 (mousemove에서 패널 닫힘 방지)
        showMenu: openMenu ? true : (plusShowMenuRef.current ? true : false),
      }));
    };


    // 블록 경계/블록 사이 클릭 시 + 버튼 표시 및 메뉴 열기
    const handleBodyClickForPlus = (e: MouseEvent) => {
      const target = e.target as HTMLElement;
      const mouseY = e.clientY;
      // 이미지 클릭이면 + 메뉴 열지 않음 (이미지 편집 팝업과 상호 배타적)
      if (target.tagName === 'IMG' || target.closest('[data-iframe-resize-handle]')) return;

      // 텍스트 선택 중이면 + 버튼 숨기기
      const selection = doc.defaultView?.getSelection();
      if (selection && !selection.isCollapsed && selection.toString().trim()) {
        if (plusHideTimerRef.current) clearTimeout(plusHideTimerRef.current);
        setPlusButton(prev => prev.showMenu ? prev : { ...prev, visible: false });
        return;
      }

      const resolved = resolvePlusInsertionTarget(target, mouseY);
      if (resolved) {
        openPlusAtResolvedTarget(resolved);
        return;
      }

      // 블록 경계가 아닌 곳 클릭 시 + 버튼 닫기
      if (!plusShowMenuRef.current) {
        if (plusHideTimerRef.current) clearTimeout(plusHideTimerRef.current);
        setPlusButton(prev => ({ ...prev, visible: false, showMenu: false }));
      }
    };

    // mousemove 기반 + 버튼 자동 표시: 블록 경계 근처에 마우스가 오면 클릭 없이도 + 버튼 표시
    const handleBodyMouseMoveForPlus = (e: MouseEvent) => {
      // 패널이 열린 상태이면 건드리지 않음
      if (plusShowMenuRef.current) return;
      // 텍스트 선택 중이면 무시
      const selection = doc.defaultView?.getSelection();
      if (selection && !selection.isCollapsed && selection.toString().trim()) return;
      const target = e.target as HTMLElement;
      if (target.tagName === 'IMG' || target.closest('[data-iframe-resize-handle]')) return;
      const mouseY = e.clientY;
      const resolved = resolvePlusInsertionTarget(target, mouseY);
      if (resolved && resolved.type === 'insert-target') {
        // 클릭 없이 hover만으로 + 버튼 표시 (메뉴는 열지 않음)
        plusClosedRef.current = false;
        showPlusAt(resolved.afterEl, resolved.foundY, false, resolved.insertBeforeMode);
      } else if (!plusShowMenuRef.current) {
        // 경계 밖으로 나가면 딜레이 후 숨기기 (메뉴가 열려있지 않을 때만)
        if (plusHideTimerRef.current) clearTimeout(plusHideTimerRef.current);
        plusHideTimerRef.current = setTimeout(() => {
          setPlusButton(prev => prev.showMenu ? prev : { ...prev, visible: false });
        }, 300);
      }
    };

    doc.addEventListener("click", handleImgClick);
    doc.addEventListener("click", handleBodyClickForPlus);
    doc.addEventListener("mousemove", handleBodyMouseMoveForPlus);
    doc.addEventListener("mouseover", handleMouseOver);
    doc.addEventListener("mouseout", handleMouseOut);
    doc.addEventListener("input", handleInput);
    doc.addEventListener("mouseup", handleMouseUp);
    doc.addEventListener("keyup", handleKeyUp);
    doc.addEventListener("keydown", handleKeyDown, true); // capture 단계에서 등록하여 브라우저 기본 undo보다 먼저 처리
    doc.addEventListener("selectionchange", handleSelectionChange);
        // 표 열 너비 드래그 mousedown (capture 단계 - 클릭 이벤트보다 먼저 처리)
    doc.addEventListener("mousedown", handleColResizeMouseDown, true);
    // iframe 밖에서 mouseup 발생 시 user-select 해제 (드래그 중 iframe 밖으로 나가는 경우 대비)
    const handleWindowMouseUp = () => {
      if (doc.body.style.userSelect === 'none') {
        doc.body.style.userSelect = '';
        (doc.body.style as unknown as Record<string,string>)['-webkit-user-select'] = '';
        doc.body.style.cursor = '';
      }
    };
    window.addEventListener('mouseup', handleWindowMouseUp);
    return () => {
      doc.removeEventListener("click", handleImgClick);
      doc.removeEventListener("click", handleBodyClickForPlus);
      doc.removeEventListener("mousemove", handleBodyMouseMoveForPlus);
      doc.removeEventListener("mouseover", handleMouseOver);
      doc.removeEventListener("mouseout", handleMouseOut);
      doc.removeEventListener("input", handleInput);
      doc.removeEventListener("mouseup", handleMouseUp);
      doc.removeEventListener("keyup", handleKeyUp);
      doc.removeEventListener("keydown", handleKeyDown, true);
      doc.removeEventListener("selectionchange", handleSelectionChange);
      doc.removeEventListener("mousedown", handleColResizeMouseDown, true);
      doc.removeEventListener('mousedown', handleTableWidthMouseDown);
      doc.removeEventListener("mousedown", handleEditableMouseDown, true);
      doc.removeEventListener("blur", handleEditableBlur, true);
      window.removeEventListener('mouseup', handleWindowMouseUp);
    };
  }, [scheduleChange, adjustHeight]);

  // iframe load 이벤트
  const handleIframeLoad = useCallback(() => {
    const iframe = iframeRef.current;
    if (!iframe) return;
    try {
      const doc = iframe.contentDocument || iframe.contentWindow?.document;
      if (!doc?.body) return;

      injectEditingScript(doc);
      adjustHeight();
      bindEvents(doc);

      // ── 초기 스냅샷 저장: 외부에서 로드된 경우만 Undo 스택 초기화 (실행 취소/되돌리기 실행 중에는 스택 유지) ──
      if (!isEditingRef.current && !isUndoRedoRef.current) {
        const currentHtml = loadedHtmlRef.current;
        if (currentHtml) {
          undoStackRef.current = [currentHtml];
          lastHistoryHtmlRef.current = currentHtml;
          redoStackRef.current = [];
          setCanUndo(false);
          setCanRedo(false);
        }
      }
      // Undo/Redo 실행 후 플래그 리셋
      isUndoRedoRef.current = false;

      // ResizeObserver로 높이 자동 조절
      const ro = new ResizeObserver(adjustHeight);
      ro.observe(doc.body);
      iframe.addEventListener("pagehide", () => ro.disconnect(), { once: true });
    } catch (err) {
      console.error("IframeVisualEditor: iframe load error", err);
    }
  }, [injectEditingScript, adjustHeight, bindEvents]);

  // HTML을 Blob URL로 iframe에 로드하는 헬퍼
  const loadHtmlToIframe = useCallback((html: string) => {
    const iframe = iframeRef.current;
    if (!iframe) return;
    // 이전 Blob URL 해제
    if (blobUrlRef.current) revokeBlobUrl(blobUrlRef.current);
    const url = buildBlobUrl(html || PLACEHOLDER_HTML);
    blobUrlRef.current = url;
    iframe.src = url;
  }, []);

  // value가 외부에서 크게 바뀔 때만 iframe 재로드 (편집 중 변경은 제외)
  // isEditingRef.current가 true이면 편집 중이므로 재로드 건너뜀
  // 단, loadedHtmlRef와 value가 동일하면 어떤 경우에도 재로드 불필요
  useEffect(() => {
    // 편집 중 onChange → 부모 state → value prop 변경 시 재로드 방지
    // isEditingRef는 scheduleChange에서 true로 설정되고 여기서 소비(false로 리셋)
    if (isEditingRef.current) {
      // 편집 중 변경은 무시 (플래그는 유지 - 다음 렌더에서도 방어)
      return;
    }
    if (value === loadedHtmlRef.current) return;

    loadedHtmlRef.current = value;
    loadHtmlToIframe(value);
  }, [value, loadHtmlToIframe]);

  // 컴포넌트 마운트 시 초기 로드
  useEffect(() => {
    loadedHtmlRef.current = value;
    loadHtmlToIframe(value);
    // 언마운트 시 Blob URL 해제
    return () => {
      if (blobUrlRef.current) revokeBlobUrl(blobUrlRef.current);
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []); // 마운트 시 1회만

  // ─── 플로팅 툴바 명령 처리 ────────────────────────────────────────────
  const handleFormatCommand = useCallback((cmd: string, value?: string) => {
    const saved = savedIframeSelectionRef.current;
    if (!saved) return;

    const { range, win } = saved;
    const sel = win.getSelection();
    if (!sel) return;

    const doc = win.document;

    // execCommand는 contenteditable 요소 안에서만 동작
    // 선택된 노드의 조상 중 contenteditable이 없으면 임시로 활성화
    const anchorNode = range.commonAncestorContainer as Node;
    const anchorEl = (anchorNode.nodeType === Node.TEXT_NODE
      ? anchorNode.parentElement
      : anchorNode as HTMLElement) as HTMLElement | null;
    let tempEditableEl: HTMLElement | null = null;
    if (anchorEl) {
      // 가장 가까운 contenteditable 조상 찾기
      let el: HTMLElement | null = anchorEl;
      let hasEditable = false;
      while (el && el !== doc.body) {
        if (el.getAttribute('contenteditable') === 'true') { hasEditable = true; break; }
        el = el.parentElement;
      }
      if (!hasEditable && anchorEl !== doc.body) {
        // 임시로 contenteditable 적용
        anchorEl.contentEditable = 'true';
        tempEditableEl = anchorEl;
      }
    }

    // 선택 영역 복원
    sel.removeAllRanges();
    sel.addRange(range.cloneRange());

    if (cmd === "foreColor" && value) {
      doc.execCommand("foreColor", false, value);
    } else if (cmd === "fontSize_custom" && value) {
      // span으로 감싸서 font-size 직접 적용
      const span = doc.createElement("span");
      span.style.fontSize = value;
      try {
        range.surroundContents(span);
      } catch {
        // 일부 선택이 여러 노드에 걸친 경우 insertHTML 사용
        const text = sel.toString();
        doc.execCommand("insertHTML", false, `<span style="font-size:${value}">${text}</span>`);
      }
    } else {
      doc.execCommand(cmd, false, value);
    }

    // 임시 contenteditable 제거
    if (tempEditableEl) {
      tempEditableEl.removeAttribute('contenteditable');
    }

    scheduleChange();
  }, [scheduleChange]);

  // ─── 링크 삽입 ────────────────────────────────────────────────────────────
  const handleBlockStyle = useCallback((prop: string, value: string) => {
    if (prop === '_noop') {
      // 다운로드 버튼 슬라이더 등 직접 DOM 수정 후 scheduleChange만 호출
      scheduleChange();
      setFloatToolbar(prev => ({ ...prev }));
      return;
    }
    setFloatToolbar(prev => {
      if (!prev.blockEl) return prev;
      const el = prev.blockEl;
      (el.style as unknown as Record<string, string>)[prop] = value;
      scheduleChange();
      return { ...prev };
    });
  }, [scheduleChange]);

  // ─── 블록 유형 변경 (P ↔ H2 ↔ BLOCKQUOTE) ───────────────────────────────────
  const handleChangeBlockType = useCallback((newTag: string) => {
    const blockEl = floatToolbar.blockEl;
    if (!blockEl) return;

    const iframeDoc = iframeRef.current?.contentDocument;
    if (!iframeDoc) return;

    const tag = newTag.toUpperCase();
    if (tag === blockEl.tagName) return;

    const newEl = iframeDoc.createElement(tag.toLowerCase());

    // 속성 복사
    Array.from(blockEl.attributes).forEach(attr => {
      newEl.setAttribute(attr.name, attr.value);
    });

    // 블록쿼트 스타일 적용
    if (tag === 'BLOCKQUOTE') {
      newEl.style.borderLeft = '4px solid #6366f1';
      newEl.style.paddingLeft = '16px';
      newEl.style.paddingTop = '8px';
      newEl.style.paddingBottom = '8px';
      newEl.style.margin = '1em 0';
      newEl.style.background = '#f8f7ff';
      newEl.style.borderRadius = '0 6px 6px 0';
      newEl.style.color = '#374151';
    } else if (tag === 'H2') {
      newEl.style.removeProperty('border-left');
      newEl.style.removeProperty('background');
      newEl.style.removeProperty('padding-left');
      newEl.style.removeProperty('border-radius');
    } else if (tag === 'P') {
      newEl.style.removeProperty('border-left');
      newEl.style.removeProperty('background');
      newEl.style.removeProperty('border-radius');
      newEl.style.removeProperty('padding-left');
      newEl.style.removeProperty('padding-top');
      newEl.style.removeProperty('padding-bottom');
    }

    newEl.innerHTML = blockEl.innerHTML;
    blockEl.parentNode?.replaceChild(newEl, blockEl);

    selectedBlockRef.current = newEl;
    blockElRef.current = newEl;

    setFloatToolbar(prev => ({
      ...prev,
      blockEl: newEl,
      currentBlockType: tag,
    }));

    scheduleChange();
  }, [floatToolbar.blockEl, scheduleChange]);

  // ─── 실행 취소 / 다시 실행 ──────────────────────────────────────────────
  /**
   * 현재 iframe HTML을 즉시 undo 스택에 저장 (블록 삭제/삽입 직전에 호출)
   * scheduleChange의 300ms 디바운스와 달리 즉각적으로 스냅샷을 저장
   */
  const pushSnapshot = useCallback(() => {
    const iframe = iframeRef.current;
    if (!iframe) return;
    try {
      const doc = iframe.contentDocument || iframe.contentWindow?.document;
      if (!doc?.body) return;
      // 편집기 주입 요소를 제거한 클린 HTML 추출
      const clone = doc.documentElement.cloneNode(true) as HTMLElement;
      clone.querySelectorAll('[data-editor-style]').forEach(el => el.remove());
      clone.querySelectorAll('[data-iframe-editor-init]').forEach(el => {
        el.removeAttribute('data-iframe-editor-init');
        el.removeAttribute('contenteditable');
        const htmlEl = el as HTMLElement;
        if (htmlEl.style.outline === 'none') htmlEl.style.outline = '';
        if (htmlEl.style.cursor === 'default') htmlEl.style.cursor = '';
      });
      clone.querySelectorAll("[contenteditable='true']").forEach(el => {
        el.removeAttribute('contenteditable');
        const htmlEl = el as HTMLElement;
        if (htmlEl.style.cursor === 'text') htmlEl.style.cursor = '';
      });
      clone.querySelectorAll('[data-img-overlay-btn]').forEach(el => el.remove());
      clone.querySelectorAll('[data-iframe-resize-handle]').forEach(el => el.remove());
      clone.querySelectorAll('.col-resize-handle').forEach(el => el.remove());
      clone.querySelectorAll('.table-width-handle').forEach(el => el.remove());
      clone.querySelectorAll('.table-resize-wrapper').forEach(wrapper => {
        const tbl = wrapper.querySelector('table');
        if (tbl) wrapper.parentNode?.insertBefore(tbl, wrapper);
        wrapper.remove();
      });
      const originalHtml = loadedHtmlRef.current;
      const isFullDoc = /^\s*<!DOCTYPE/i.test(originalHtml) || /^\s*<html/i.test(originalHtml);
      let result: string;
      if (isFullDoc) {
        result = '<!DOCTYPE html>\n' + clone.outerHTML;
      } else {
        // fragment HTML: 브라우저가 <body> 안의 <style>을 <head>로 자동 이동시키므로
        // fallback-css를 제외한 head의 <style> 태그도 함께 복원한다
        const bodyHtml2 = clone.querySelector('body')?.innerHTML ?? doc.body.innerHTML;
        const headStyleTags2 = Array.from(clone.querySelectorAll('head style'))
          .filter(s => s.id !== 'fallback-css')
          .map(s => s.outerHTML)
          .join('\n');
        result = headStyleTags2 ? headStyleTags2 + '\n' + bodyHtml2 : bodyHtml2;
      }
      // 절대 URL → 상대 경로 역변환
      const originEscape = window.location.origin.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      result = result
        .replace(new RegExp(`src=(["'])${originEscape}(/manus-storage/)`, 'gi'), 'src=$1$2')
        .replace(new RegExp(`href=(["'])${originEscape}(/manus-storage/)`, 'gi'), 'href=$1$2')
        .replace(new RegExp(`url\\((["']?)${originEscape}(/manus-storage/)`, 'gi'), 'url($1$2');
      // 현재 상태와 다를 때만 스택에 추가
      if (result !== lastHistoryHtmlRef.current) {
        undoStackRef.current.push(lastHistoryHtmlRef.current || result);
        if (undoStackRef.current.length > 100) undoStackRef.current.shift();
        redoStackRef.current = [];
        lastHistoryHtmlRef.current = result;
        setCanUndo(undoStackRef.current.length > 1);
        setCanRedo(false);
      }
    } catch { /* cross-origin */ }
  }, []);
  const reloadIframeWithHtml = useCallback((html: string) => {
    const iframe = iframeRef.current;
    if (!iframe) return;
    const isFullDoc = /^\s*<!DOCTYPE/i.test(html) || /^\s*<html/i.test(html);
    let docHtml: string;
    if (isFullDoc) {
      docHtml = html;
    } else {
      docHtml = `<!DOCTYPE html><html><head><meta charset="utf-8"><style>
        * { box-sizing: border-box; }
        body { margin: 0; padding: 8px; font-family: inherit; }
        table { border-collapse: collapse; }
        td, th { border: 1px solid #ccc; padding: 6px 10px; }
        ul { list-style: disc; padding-left: 2em; }
        ol { list-style: decimal; padding-left: 2em; }
        li { display: list-item; }
        h1 { font-size: 2em; font-weight: bold; }
        h2 { font-size: 1.5em; font-weight: bold; }
        h3 { font-size: 1.17em; font-weight: bold; }
        h4 { font-size: 1em; font-weight: bold; }
        blockquote { border-left: 4px solid #ccc; padding-left: 1em; margin-left: 0; color: #555; }
        pre { background: #f5f5f5; padding: 1em; border-radius: 4px; overflow-x: auto; }
        code { font-family: monospace; }
        a { color: #3b82f6; }
      </style></head><body>${html}</body></html>`;
    }
    const blob = new Blob([docHtml], { type: 'text/html; charset=utf-8' });
    if (blobUrlRef.current) URL.revokeObjectURL(blobUrlRef.current);
    const url = URL.createObjectURL(blob);
    blobUrlRef.current = url;
    isEditingRef.current = false;
    loadedHtmlRef.current = html;
    lastHistoryHtmlRef.current = html;
    iframe.src = url;
  }, []);

  const handleUndo = useCallback(() => {
    if (undoStackRef.current.length <= 1) return;
    const currentHtml = lastHistoryHtmlRef.current;
    const prevHtml = undoStackRef.current.pop()!;
    redoStackRef.current.push(currentHtml);
    setCanUndo(undoStackRef.current.length > 1);
    setCanRedo(true);
    // buildBlobUrl을 사용하여 동일한 CSS로 재로드
    const url = buildBlobUrl(prevHtml);
    if (blobUrlRef.current) URL.revokeObjectURL(blobUrlRef.current);
    blobUrlRef.current = url;
    isUndoRedoRef.current = true; // handleIframeLoad에서 스택 초기화 방지
    isEditingRef.current = false;
    loadedHtmlRef.current = prevHtml;
    lastHistoryHtmlRef.current = prevHtml;
    if (iframeRef.current) iframeRef.current.src = url;
    onChange(prevHtml);
  }, [onChange]);

  const handleRedo = useCallback(() => {
    if (redoStackRef.current.length === 0) return;
    const nextHtml = redoStackRef.current.pop()!;
    undoStackRef.current.push(lastHistoryHtmlRef.current);
    setCanUndo(true);
    setCanRedo(redoStackRef.current.length > 0);
    // buildBlobUrl을 사용하여 동일한 CSS로 재로드
    const url = buildBlobUrl(nextHtml);
    if (blobUrlRef.current) URL.revokeObjectURL(blobUrlRef.current);
    blobUrlRef.current = url;
    isUndoRedoRef.current = true; // handleIframeLoad에서 스택 초기화 방지
    isEditingRef.current = false;
    loadedHtmlRef.current = nextHtml;
    lastHistoryHtmlRef.current = nextHtml;
    if (iframeRef.current) iframeRef.current.src = url;
    onChange(nextHtml);
  }, [onChange]);

  // undoHandlerRef / redoHandlerRef 항상 최신 함수로 업데이트 (클로저 stale 방지)
  useEffect(() => {
    undoHandlerRef.current = handleUndo;
    redoHandlerRef.current = handleRedo;
  }, [handleUndo, handleRedo]);


  // 컨테이너 외부 클릭 시 이미지 편집 팝업 닫기
  useEffect(() => {
    if (!imageOverlay.visible) return;
    const handleOutsideClick = (e: MouseEvent) => {
      const target = e.target as Node;
      // 컨테이너 내부 클릭이면 무시 (iframe 내부 클릭은 이미 handleImgClick에서 처리됨)
      if (containerRef.current && containerRef.current.contains(target)) return;
      // 컨테이너 외부 클릭 시 팝업 닫기
      if (imageOverlay.imgEl) {
        imageOverlay.imgEl.style.outline = '';
        imageOverlay.imgEl.removeAttribute('data-img-selected');
        imageOverlay.imgEl.parentElement?.querySelectorAll('[data-iframe-resize-handle]').forEach(el => el.remove());
      }
      setImageOverlay(prev => ({ ...prev, visible: false }));
    };
    document.addEventListener('mousedown', handleOutsideClick, true);
    return () => document.removeEventListener('mousedown', handleOutsideClick, true);
  }, [imageOverlay.visible, imageOverlay.imgEl]);

  // iframe 외부 + iframe 포커스 시에도 Ctrl+Z / Ctrl+Y 동작하도록 외부 keydown 이벤트 리스너 등록
  // iframe 내부 keydown은 외부로 버블링되지 않으므로, IFRAME 포커스 시에도 여기서 처리
  useEffect(() => {
    const handleOuterKeyDown = (e: KeyboardEvent) => {
      const activeEl = document.activeElement;
      // 텍스트 입력 필드(INPUT/TEXTAREA)에 포커스가 있으면 무시
      if (activeEl && (activeEl.tagName === 'INPUT' || activeEl.tagName === 'TEXTAREA')) return;
      if (e.key === 'Escape') {
        // ESC: 모든 팝업 닫기
        setImageOverlay(prev => ({ ...prev, visible: false }));
        setPlusButton(prev => ({ ...prev, visible: false, showMenu: false }));
        setFloatToolbar(prev => ({ ...prev, blockEl: null, tableEl: null, cellEl: null }));
        return;
      }
      if ((e.ctrlKey || e.metaKey) && e.key === 'z' && !e.shiftKey) {
        e.preventDefault();
        handleUndo();
      } else if ((e.ctrlKey || e.metaKey) && (e.key === 'y' || (e.key === 'z' && e.shiftKey))) {
        e.preventDefault();
        handleRedo();
      }
    };
    document.addEventListener('keydown', handleOuterKeyDown);
    return () => document.removeEventListener('keydown', handleOuterKeyDown);
  }, [handleUndo, handleRedo]);

  // plusShowMenuRef를 plusButton.showMenu와 항상 동기화 (bindEvents 클로저 stale 방지)
  useEffect(() => {
    plusShowMenuRef.current = plusButton.showMenu;
  }, [plusButton.showMenu]);

  // 패널 위치: 블록 왼쪽 경계선 바깥에 세로 형식으로 배치
  useEffect(() => {
    if (!plusButton.showMenu) return;

    const PANEL_WIDTH = 120; // 세로 패널 너비
    const PANEL_GAP = 8;    // iframe 왼쪽 경계선과의 간격

    const updateInsertPanelRect = () => {
      const iframe = iframeRef.current;
      if (!iframe) return;
      const iframeRect = iframe.getBoundingClientRect();
      // 패널을 iframe 왼쪽 경계선 바깥에 배치
      // plusButton.x는 블록 왼쪽 좌표이지만, 패널은 항상 iframe 왼쪽 바깥에 고정
      const panelLeft = Math.max(4, iframeRect.left - PANEL_WIDTH - PANEL_GAP);
      // Y는 선택한 블록과 동일한 높이 (plusButton.y = 블록 경계 viewport Y)
      const blockY = plusButton.y;
      // 화면 상하 경계를 벗어나지 않도록 클램프
      const panelTop = Math.max(72, Math.min(window.innerHeight - 400, blockY - 20));
      setInsertPanelRect({ left: panelLeft, top: panelTop, width: PANEL_WIDTH });
    };

    updateInsertPanelRect();
    window.addEventListener('resize', updateInsertPanelRect);
    window.addEventListener('scroll', updateInsertPanelRect, true);

    return () => {
      window.removeEventListener('resize', updateInsertPanelRect);
      window.removeEventListener('scroll', updateInsertPanelRect, true);
    };
  }, [plusButton.showMenu, plusButton.y, iframeHeight]);

  // ─── 링크 삽입 ─────────────────────────────────────────────────────
  const handleInsertLink = useCallback(() => {
    setLinkDefaultText(selectedTextRef.current);
    setFloatToolbar(prev => ({ ...prev, blockEl: null, tableEl: null, cellEl: null }));
    setShowLinkDialog(true);
  }, []);

  const confirmLink = useCallback((url: string, text: string) => {
    const saved = savedIframeSelectionRef.current;
    if (!saved) return;

    const { range, win } = saved;
    const doc = win.document;
    const sel = win.getSelection();

    if (sel) {
      // range.deleteContents/insertNode은 contenteditable 없어도 동작하지만
      // execCommand fallback을 위해 임시 contenteditable 활성화
      const anchorNode = range.commonAncestorContainer as Node;
      const anchorEl = (anchorNode.nodeType === Node.TEXT_NODE
        ? anchorNode.parentElement
        : anchorNode as HTMLElement) as HTMLElement | null;
      let tempEditableEl: HTMLElement | null = null;
      if (anchorEl && anchorEl !== doc.body) {
        let el: HTMLElement | null = anchorEl;
        let hasEditable = false;
        while (el && el !== doc.body) {
          if (el.getAttribute('contenteditable') === 'true') { hasEditable = true; break; }
          el = el.parentElement;
        }
        if (!hasEditable) {
          anchorEl.contentEditable = 'true';
          tempEditableEl = anchorEl;
        }
      }

      sel.removeAllRanges();
      sel.addRange(range.cloneRange());

      const a = doc.createElement("a");
      a.href = url;
      a.target = "_blank";
      a.rel = "noopener noreferrer";
      a.textContent = text || url;

      try {
        range.deleteContents();
        range.insertNode(a);
      } catch {
        doc.execCommand("insertHTML", false, `<a href="${url}" target="_blank" rel="noopener noreferrer">${text || url}</a>`);
      }

      if (tempEditableEl) tempEditableEl.removeAttribute('contenteditable');
    }

    setShowLinkDialog(false);
    scheduleChange();
  }, [scheduleChange]);

  // ─── 버튼 생성 ────────────────────────────────────────────────────────────
  const handleInsertButton = useCallback(() => {
    setButtonDefaultText(selectedTextRef.current);
    setFloatToolbar(prev => ({ ...prev, blockEl: null, tableEl: null, cellEl: null }));
    setShowButtonDialog(true);
  }, []);

  const confirmButtonInsert = useCallback((html: string) => {
    pushSnapshot(); // 삽입 직전 스냅샷 저장
    const iframe = iframeRef.current;
    if (!iframe) return;
    try {
      const doc = iframe.contentDocument || iframe.contentWindow?.document;
      if (!doc) return;

      // 편집 모드: 기존 버튼 엘리먼트를 새 HTML로 교체
      if (editingButtonElRef.current) {
        const btnEl = editingButtonElRef.current;
        // 버튼의 부모 단락(p 태그) 교체 또는 버튼 자체 교체
        const parentP = btnEl.closest('p');
        if (parentP && parentP.parentNode) {
          const temp = doc.createElement('div');
          temp.innerHTML = html;
          const newEl = temp.firstElementChild;
          if (newEl) parentP.parentNode.replaceChild(newEl, parentP);
          else parentP.outerHTML = html;
        } else if (btnEl.parentNode) {
          const temp = doc.createElement('div');
          temp.innerHTML = html;
          const newEl = temp.firstElementChild;
          if (newEl) btnEl.parentNode.replaceChild(newEl, btnEl);
        }
        editingButtonElRef.current = null;
      } else {
        // 새 버튼 삽입
        const saved = savedIframeSelectionRef.current;
        if (saved) {
          const { range, win } = saved;
          const sel = win.getSelection();
          if (sel) {
            // execCommand를 위해 임시 contenteditable 활성화
            const anchorNode = range.commonAncestorContainer as Node;
            const anchorEl = (anchorNode.nodeType === Node.TEXT_NODE
              ? anchorNode.parentElement
              : anchorNode as HTMLElement) as HTMLElement | null;
            let tempEl: HTMLElement | null = null;
            if (anchorEl && anchorEl !== doc.body) {
              let el: HTMLElement | null = anchorEl;
              let hasEditable = false;
              while (el && el !== doc.body) {
                if (el.getAttribute('contenteditable') === 'true') { hasEditable = true; break; }
                el = el.parentElement;
              }
              if (!hasEditable) { anchorEl.contentEditable = 'true'; tempEl = anchorEl; }
            }
            sel.removeAllRanges();
            sel.addRange(range.cloneRange());
            doc.execCommand("insertHTML", false, html);
            if (tempEl) tempEl.removeAttribute('contenteditable');
          }
        } else {
          // 선택 없으면 body 끝에 추가
          doc.body.insertAdjacentHTML("beforeend", html);
        }
      }
    } catch { /* cross-origin */ }

    setShowButtonDialog(false);
    scheduleChange();
  }, [scheduleChange]);

  // ─── 이미지 교체 ────────────────────────────────────────────────────────────
  const handleReplaceImage = useCallback(() => {
    replaceImageFileRef.current?.click();
  }, []);

  const handleReplaceImageFileChange = useCallback(async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !imageOverlay.imgEl || !onUploadImage) return;
    pushSnapshot(); // 이미지 교체 직전 스냅샷 저장
    setImageUploading(true);
    try {
      const url = await onUploadImage(file);
      imageOverlay.imgEl.src = url;
      setImageOverlay(prev => ({ ...prev, visible: false }));
      scheduleChange();
    } catch {
      alert("이미지 업로드에 실패했습니다.");
    } finally {
      setImageUploading(false);
      if (replaceImageFileRef.current) replaceImageFileRef.current.value = "";
    }
  }, [imageOverlay.imgEl, onUploadImage, scheduleChange, pushSnapshot]);

  // ─── 이미지 삭제 ────────────────────────────────────────────────────────────
  const handleDeleteImage = useCallback(() => {
    if (!imageOverlay.imgEl) return;
    pushSnapshot(); // 이미지 삭제 직전 스냅샷 저장
    const parent = imageOverlay.imgEl.parentElement;
    imageOverlay.imgEl.remove();
    if (parent && parent.tagName !== "BODY" && parent.innerHTML.trim() === "") {
      parent.remove();
    }
    setImageOverlay(prev => ({ ...prev, visible: false }));
    scheduleChange();
  }, [imageOverlay.imgEl, scheduleChange, pushSnapshot]);

  // ─── 블록 삭제 ────────────────────────────────────────────────────────────
  const handleDeleteBlock = useCallback(() => {
    // blockElRef가 null일 때 blockOverlay.blockEl을 폴백으로 사용
    const el = blockElRef.current || blockOverlay.blockEl;
    if (!el) return;
    pushSnapshot(); // 삭제 직전 스냅샷 저장 (즉시 Undo 가능)
    el.remove();
    blockElRef.current = null;
    // 선택 상태도 완전 해제
    if (selectedBlockRef.current) {
      selectedBlockRef.current.classList.remove('iframe-block-selected');
      selectedBlockRef.current = null;
    }
    setBlockOverlay({ visible: false, x: 0, y: 0, width: 0, blockEl: null });
    setFloatToolbar(prev => ({ ...prev, blockEl: null, tableEl: null, cellEl: null }));
    scheduleChange();
  }, [scheduleChange, blockOverlay.blockEl, pushSnapshot]);

  // ─── 블록 위로 이동 ─────────────────────────────────────────────────────
  const handleMoveBlockUp = useCallback(() => {
    const el = blockElRef.current || blockOverlay.blockEl;
    if (!el) return;
    const prev = el.previousElementSibling as HTMLElement | null;
    if (!prev) return; // 이미 맨 위
    pushSnapshot();
    el.parentElement?.insertBefore(el, prev);
    // 오버레이 위치 업데이트
    const iframe = iframeRef.current;
    if (iframe) {
      const containerRect = containerRef.current!.getBoundingClientRect();
      const iframeRect = iframe.getBoundingClientRect();
      const rect = el.getBoundingClientRect();
      setBlockOverlay(prev2 => ({
        ...prev2,
        x: iframeRect.left - containerRect.left + rect.left,
        y: iframeRect.top - containerRect.top + rect.top,
        width: rect.width,
        blockEl: el,
      }));
    }
    scheduleChange();
  }, [blockOverlay.blockEl, pushSnapshot, scheduleChange]);

  // ─── 블록 아래로 이동 ────────────────────────────────────────────────────
  const handleMoveBlockDown = useCallback(() => {
    const el = blockElRef.current || blockOverlay.blockEl;
    if (!el) return;
    const next = el.nextElementSibling as HTMLElement | null;
    if (!next) return; // 이미 맨 아래
    pushSnapshot();
    el.parentElement?.insertBefore(next, el);
    // 오버레이 위치 업데이트
    const iframe = iframeRef.current;
    if (iframe) {
      const containerRect = containerRef.current!.getBoundingClientRect();
      const iframeRect = iframe.getBoundingClientRect();
      const rect = el.getBoundingClientRect();
      setBlockOverlay(prev2 => ({
        ...prev2,
        x: iframeRect.left - containerRect.left + rect.left,
        y: iframeRect.top - containerRect.top + rect.top,
        width: rect.width,
        blockEl: el,
      }));
    }
    scheduleChange();
  }, [blockOverlay.blockEl, pushSnapshot, scheduleChange]);

  // ─── 줄 간격 적용 ────────────────────────────────────────────────────────
  const applyLineHeight = useCallback((lh: number) => {
    const iframe = iframeRef.current;
    if (!iframe) return;
    try {
      const doc = iframe.contentDocument || iframe.contentWindow?.document;
      if (!doc?.body) return;
      doc.body.style.lineHeight = String(lh);
      scheduleChange();
    } catch { /* cross-origin */ }
  }, [scheduleChange]);

  // ─── 단락 간격 적용 ──────────────────────────────────────────────────────
  const applyParagraphSpacing = useCallback((mb: string) => {
    const iframe = iframeRef.current;
    if (!iframe) return;
    try {
      const doc = iframe.contentDocument || iframe.contentWindow?.document;
      if (!doc?.body) return;
      doc.querySelectorAll('p').forEach((p: Element) => {
        (p as HTMLElement).style.marginBottom = mb;
      });
      scheduleChange();
    } catch { /* cross-origin */ }
  }, [scheduleChange]);

  // ─── 새 단락 추가 (body 끝에) ─────────────────────────────────────────────
  const addNewParagraph = useCallback(() => {
    pushSnapshot(); // 단락 추가 직전 스냅샷 저장
    const iframe = iframeRef.current;
    if (!iframe) return;
    try {
      const doc = iframe.contentDocument || iframe.contentWindow?.document;
      if (!doc?.body) return;
      const p = doc.createElement("p");
      p.innerHTML = "<br>";
      p.style.cssText = "min-height:1.5em;padding:4px 0;";
      doc.body.appendChild(p);
      adjustHeight();
      // 새 단락에 포커스
      setTimeout(() => {
        const range = doc.createRange();
        range.setStart(p, 0);
        range.collapse(true);
        const sel = doc.defaultView?.getSelection();
        sel?.removeAllRanges();
        sel?.addRange(range);
        p.focus();
      }, 0);
      scheduleChange();
    } catch { /* cross-origin */ }
  }, [scheduleChange, adjustHeight, pushSnapshot]);

  // ─── 표 변환/삽입 ────────────────────────────────────────────────────────────
  const handleConvertToTable = useCallback(() => {
    setTableDefaultText(selectedTextRef.current);
    setFloatToolbar(prev => ({ ...prev, blockEl: null, tableEl: null, cellEl: null }));
    setShowTableDialog(true);
  }, []);

  const confirmTableInsert = useCallback((html: string) => {
    pushSnapshot(); // 표 삽입 직전 스냅샷 저장
    const iframe = iframeRef.current;
    if (!iframe) return;
    try {
      const doc = iframe.contentDocument || iframe.contentWindow?.document;
      if (!doc?.body) return;
      const saved = savedIframeSelectionRef.current;
      if (saved) {
        // 텍스트 선택 상태에서 표 삽입
        const { range, win } = saved;
        const sel = win.getSelection();
        if (sel) {
          sel.removeAllRanges();
          sel.addRange(range.cloneRange());
          doc.execCommand("insertHTML", false, html);
        }
      } else if (plusAfterElRef.current && plusAfterElRef.current.parentNode) {
        // + 버튼에서 열린 경우 plusAfterElRef.current 뒤/앞에 삽입 (stale 클로저 방지)
        const afterEl = plusAfterElRef.current;
        const template = doc.createElement('div');
        template.innerHTML = html;
        const newEl = template.firstChild as HTMLElement | null;
        if (newEl) {
          if (plusInsertBeforeModeRef.current) {
            afterEl.parentNode!.insertBefore(newEl, afterEl);
          } else {
            afterEl.parentNode!.insertBefore(newEl, afterEl.nextSibling);
          }
          // 새 표에 열 너비 드래그 핸들 초기화
          if (initAllTablesRef.current) initAllTablesRef.current(doc);
          // 삽입된 표의 첫 번째 셀에 포커스
          const firstCell = newEl.querySelector('td,th') as HTMLElement | null;
          if (firstCell) {
            firstCell.contentEditable = 'true';
            setTimeout(() => {
              if (!firstCell.isConnected) return;
              firstCell.focus();
              const r = doc.createRange();
              r.selectNodeContents(firstCell);
              r.collapse(true);
              const s = doc.defaultView?.getSelection();
              s?.removeAllRanges();
              s?.addRange(r);
            }, 0);
          }
        }
      } else {
        doc.body.insertAdjacentHTML("beforeend", html);
        // 새 표에 열 너비 드래그 핸들 초기화
        if (initAllTablesRef.current) initAllTablesRef.current(doc);
      }
    } catch { /* cross-origin */ }
    setShowTableDialog(false);
    setPlusButton(prev => ({ ...prev, visible: false, showMenu: false }));
    savedIframeSelectionRef.current = null;
    plusAfterElRef.current = null;
    adjustHeight();
    scheduleChange();
  }, [scheduleChange, adjustHeight, pushSnapshot]);

  // ─── 이미지 삽입 (+ 버튼 afterEl 위치 또는 body 끝에) ──────────────────────────────────
  const confirmImageInsert = useCallback((src: string, alt: string, width: string) => {
    pushSnapshot(); // 이미지 삽입 직전 스냅샷 저장
    const iframe = iframeRef.current;
    if (!iframe) return;
    try {
      const doc = iframe.contentDocument || iframe.contentWindow?.document;
      if (!doc?.body) return;
      const p = doc.createElement("p");
      p.style.textAlign = "center";
      const img = doc.createElement("img");
      // blob URL에서도 이미지가 표시되도록 /manus-storage/ 경로를 절대 URL로 변환
      // data-original-src에 원본 상대 경로 저장하여 직렬화 시 복원
      const isRelativeStorage = (src.startsWith('/manus-storage/') || (src.startsWith('/') && !src.startsWith('//')));
      const resolvedSrc = isRelativeStorage ? window.location.origin + src : src;
      img.src = resolvedSrc;
      if (isRelativeStorage) {
        img.setAttribute('data-original-src', src);
      }
      img.alt = alt;
      img.style.width = width;
      img.style.maxWidth = "100%";
      p.appendChild(img);

      // + 버튼에서 열린 경우 plusAfterElRef.current 뒤/앞에 삽입 (stale 클로저 방지)
      const afterEl = plusAfterElRef.current;
      if (afterEl && afterEl.parentNode) {
        if (plusInsertBeforeModeRef.current) {
          afterEl.parentNode.insertBefore(p, afterEl);
        } else {
          afterEl.parentNode.insertBefore(p, afterEl.nextSibling);
        }
      } else {
        doc.body.appendChild(p);
      }

      adjustHeight();
      scheduleChange();
    } catch { /* cross-origin */ }
    setShowImageInsertDialog(false);
    setPlusButton(prev => ({ ...prev, visible: false, showMenu: false }));
    plusAfterElRef.current = null;
    plusInsertBeforeModeRef.current = false;
  }, [scheduleChange, adjustHeight, pushSnapshot]);

  // ─── 동영상 삽입 (+ 버튼 afterEl 위치 또는 body 끝에) ───────────────────────────────
  const confirmVideoInsert = useCallback((embedUrl: string, _type: string, caption: string, width: string) => {
    pushSnapshot(); // 동영상 삽입 직전 스냅샷 저장
    const iframe = iframeRef.current;
    if (!iframe) return;
    try {
      const doc = iframe.contentDocument || iframe.contentWindow?.document;
      if (!doc?.body) return;
      const wrapper = doc.createElement('div');
      wrapper.setAttribute('data-video-embed', '');
      const wrapperWidth = width || '100%';
      wrapper.style.cssText = `width:${wrapperWidth};max-width:100%;margin:1em auto;`;
      const ratio = doc.createElement('div');
      ratio.style.cssText = 'position:relative;padding-bottom:56.25%;height:0;overflow:hidden;';
      const videoIframe = doc.createElement('iframe');
      videoIframe.src = embedUrl;
      videoIframe.style.cssText = 'position:absolute;top:0;left:0;width:100%;height:100%;border:none;';
      videoIframe.setAttribute('allow', 'accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture');
      videoIframe.setAttribute('allowfullscreen', '');
      ratio.appendChild(videoIframe);
      wrapper.appendChild(ratio);
      if (caption) {
        const fig = doc.createElement('figcaption');
        fig.textContent = caption;
        fig.style.cssText = 'text-align:center;font-size:0.875em;color:#6b7280;margin-top:6px;';
        wrapper.appendChild(fig);
      }
      const afterEl = plusAfterElRef.current;
      if (afterEl && afterEl.parentNode) {
        if (plusInsertBeforeModeRef.current) {
          afterEl.parentNode.insertBefore(wrapper, afterEl);
        } else {
          afterEl.parentNode.insertBefore(wrapper, afterEl.nextSibling);
        }
      } else {
        doc.body.appendChild(wrapper);
      }
      adjustHeight();
      scheduleChange();
    } catch { /* cross-origin */ }
    setShowVideoInsertDialog(false);
    setPlusButton(prev => ({ ...prev, visible: false, showMenu: false }));
    plusAfterElRef.current = null;
    plusInsertBeforeModeRef.current = false;
  }, [scheduleChange, adjustHeight, pushSnapshot]);

  return (
    <div
      ref={containerRef}
      style={{ position: "relative", background: "#fff", border: "1px solid #e5e7eb", borderRadius: 8, overflow: "visible" }}
    >
      {/* ─── 상단 고정 툴바 영역 (sticky: 최상단에 고정) ─── */}
      <div style={{
        position: "sticky",
        top: 0,
        zIndex: 110,
        background: "#fff",
        borderBottom: "2px solid #6366f1",
        boxShadow: "0 2px 8px rgba(99,102,241,0.10)",
        borderRadius: "8px 8px 0 0",
      }}>

      {/* 툴바 */}
      <div style={{
        background: "#f8fafc", borderBottom: "1px solid #e5e7eb",
        padding: "6px 16px", display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap",
      }}>
        {/* ← 실행 취소 / 다시 실행 버튼 */}
        <button
          type="button"
          onClick={handleUndo}
          disabled={!canUndo}
          title="실행 취소 (Ctrl+Z)"
          style={{
            display: "flex", alignItems: "center", gap: 3,
            padding: "4px 9px", borderRadius: 6, border: "1px solid #d1d5db",
            background: canUndo ? "#fff" : "#f9fafb",
            color: canUndo ? "#374151" : "#9ca3af",
            fontSize: 14, cursor: canUndo ? "pointer" : "not-allowed", fontWeight: 700,
            opacity: canUndo ? 1 : 0.5,
          }}
        >↩</button>
        <button
          type="button"
          onClick={handleRedo}
          disabled={!canRedo}
          title="다시 실행 (Ctrl+Y)"
          style={{
            display: "flex", alignItems: "center", gap: 3,
            padding: "4px 9px", borderRadius: 6, border: "1px solid #d1d5db",
            background: canRedo ? "#fff" : "#f9fafb",
            color: canRedo ? "#374151" : "#9ca3af",
            fontSize: 14, cursor: canRedo ? "pointer" : "not-allowed", fontWeight: 700,
            opacity: canRedo ? 1 : 0.5,
          }}
        >↪</button>
        <div style={{ width: 1, height: 18, background: "#e5e7eb" }} />
        {/* 텍스트 추가 */}
        <button
          type="button"
          onClick={addNewParagraph}
          style={{
            display: "flex", alignItems: "center", gap: 4,
            padding: "4px 10px", borderRadius: 6, border: "1px solid #c7d2fe",
            background: "#eef2ff", color: "#4338ca", fontSize: 12, cursor: "pointer", fontWeight: 600,
          }}
        >
          <Plus size={12} />
          텍스트 추가
        </button>

        {/* 이미지 삽입 */}
        <button
          type="button"
          onClick={() => { plusAfterElRef.current = null; setShowImageInsertDialog(true); }}
          style={{
            display: "flex", alignItems: "center", gap: 4,
            padding: "4px 10px", borderRadius: 6, border: "1px solid #bae6fd",
            background: "#f0f9ff", color: "#0369a1", fontSize: 12, cursor: "pointer", fontWeight: 600,
          }}
        >
          <ImageIcon size={12} />
          이미지 삽입
        </button>

        {/* 동영상 삽입 */}
        <button
          type="button"
          onClick={() => { plusAfterElRef.current = null; setShowVideoInsertDialog(true); }}
          style={{
            display: "flex", alignItems: "center", gap: 4,
            padding: "4px 10px", borderRadius: 6, border: "1px solid #ddd6fe",
            background: "#f5f3ff", color: "#6d28d9", fontSize: 12, cursor: "pointer", fontWeight: 600,
          }}
        >
          🎬 동영상 삽입
        </button>
        {/* 표 삽입 */}
        <button
          type="button"
          onClick={() => { setTableDefaultText(""); plusAfterElRef.current = null; setShowTableDialog(true); }}
          style={{
            display: "flex", alignItems: "center", gap: 4,
            padding: "4px 10px", borderRadius: 6, border: "1px solid #fde68a",
            background: "#fefce8", color: "#92400e", fontSize: 12, cursor: "pointer", fontWeight: 600,
          }}
        >
          📊 표 삽입
        </button>

        {/* 버튼 생성 */}
        <button
          type="button"
          onClick={() => { setButtonDefaultText(""); setShowButtonDialog(true); }}
          style={{
            display: "flex", alignItems: "center", gap: 4,
            padding: "4px 10px", borderRadius: 6, border: "1px solid #ddd6fe",
            background: "#f5f3ff", color: "#7c3aed", fontSize: 12, cursor: "pointer", fontWeight: 600,
          }}
        >
          🎨 버튼 생성
        </button>

        <div style={{ width: 1, height: 18, background: "#e5e7eb" }} />

        {/* 줄 간격 */}
        <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
          <span style={{ fontSize: 11, color: "#6b7280", fontWeight: 600, whiteSpace: "nowrap" }}>줄 간격</span>
          {[1.2, 1.5, 1.8, 2.0, 2.5].map(lh => (
            <button
              key={lh}
              type="button"
              onClick={() => applyLineHeight(lh)}
              style={{
                padding: "2px 8px", borderRadius: 4, border: "1px solid #d1d5db",
                background: "#fff", fontSize: 11, cursor: "pointer", color: "#374151",
              }}
            >{lh}</button>
          ))}
        </div>

        <div style={{ width: 1, height: 18, background: "#e5e7eb" }} />

        {/* 단락 간격 */}
        <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
          <span style={{ fontSize: 11, color: "#6b7280", fontWeight: 600, whiteSpace: "nowrap" }}>단락 간격</span>
          {[{ label: "없음", val: "0" }, { label: "작게", val: "0.5em" }, { label: "보통", val: "1em" }, { label: "크게", val: "1.5em" }].map(({ label, val }) => (
            <button
              key={val}
              type="button"
              onClick={() => applyParagraphSpacing(val)}
              style={{
                padding: "2px 8px", borderRadius: 4, border: "1px solid #d1d5db",
                background: "#fff", fontSize: 11, cursor: "pointer", color: "#374151",
              }}
                        >{label}</button>
          ))}
        </div>
      </div>
      {/* 서식 툴바 - sticky 컨테이너 내부 (블록 팝업 모드일 때는 팝업으로만 표시) */}
      <div style={{ borderTop: "1px solid #2d2d5e", background: "#1e1b4b" }}>
      <FloatToolbarUI
        mode={floatToolbar.mode}
        blockEl={floatToolbar.blockEl}
        onCommand={handleFormatCommand}
        onClose={() => setFloatToolbar(prev => ({ ...prev, blockEl: null, tableEl: null, cellEl: null, popupX: undefined, popupY: undefined, popupBottom: undefined }))}
        popupX={floatToolbar.popupX}
        popupY={floatToolbar.popupY}
        popupBottom={floatToolbar.popupBottom}
        popupRight={floatToolbar.popupRight}
        onInsertLink={handleInsertLink}
        onInsertButton={handleInsertButton}
        onConvertToTable={handleConvertToTable}
        onBlockStyle={handleBlockStyle}
        onUndo={handleUndo}
        onRedo={handleRedo}
        canUndo={canUndo}
        canRedo={canRedo}
        tableEl={floatToolbar.tableEl}
        cellEl={floatToolbar.cellEl}
        onTableAction={(action) => {
          if (!floatToolbar.tableEl || !floatToolbar.cellEl) return;
          const tbl = floatToolbar.tableEl as HTMLTableElement;
          const cell = floatToolbar.cellEl;
          const row = cell.parentElement as HTMLTableRowElement;
          const rowIndex = row ? Array.from(row.parentElement?.children ?? []).indexOf(row) : -1;
          const cellIndex = Array.from(row?.children ?? []).indexOf(cell);
          if (action === 'insertRowAbove' || action === 'insertRowBelow') {
            const newRow = tbl.insertRow(action === 'insertRowAbove' ? rowIndex : rowIndex + 1);
            const colCount = row.children.length;
            for (let i = 0; i < colCount; i++) {
              const td = newRow.insertCell(i);
              td.style.cssText = (row.children[i] as HTMLElement).style.cssText || 'padding:8px 12px;border:1.5px solid #94a3b8;word-break:break-word;';
              td.innerHTML = '&nbsp;';
            }
          } else if (action === 'deleteRow') {
            if (tbl.rows.length > 1) row.remove();
          } else if (action === 'insertColLeft' || action === 'insertColRight') {
            Array.from((tbl as HTMLTableElement).rows).forEach((r: HTMLTableRowElement) => {
              const idx = action === 'insertColLeft' ? cellIndex : cellIndex + 1;
              const newCell = r.insertCell(idx);
              const refCell = r.children[cellIndex] as HTMLElement;
              newCell.style.cssText = refCell?.style.cssText || 'padding:8px 12px;border:1.5px solid #94a3b8;word-break:break-word;';
              newCell.innerHTML = '&nbsp;;';
            });
          } else if (action === 'deleteCol') {
            const colCount = row.children.length;
            if (colCount > 1) {
              Array.from((tbl as HTMLTableElement).rows).forEach((r: HTMLTableRowElement) => {
                if (r.children[cellIndex]) r.deleteCell(cellIndex);
              });
            }
          } else if (action === 'deleteTable') {
            tbl.remove();
          } else if (action === 'mergeRight') {
            const nextCell = cell.nextElementSibling as HTMLElement | null;
            if (nextCell) {
              const span = parseInt(cell.getAttribute('colspan') || '1');
              cell.setAttribute('colspan', String(span + 1));
              cell.innerHTML += ' ' + nextCell.innerHTML;
              nextCell.remove();
            }
          } else if (action === 'mergeDown') {
            const nextRow = row.nextElementSibling as HTMLTableRowElement | null;
            if (nextRow && nextRow.children[cellIndex]) {
              const span = parseInt(cell.getAttribute('rowspan') || '1');
              cell.setAttribute('rowspan', String(span + 1));
              cell.innerHTML += ' ' + (nextRow.children[cellIndex] as HTMLElement).innerHTML;
              (nextRow.children[cellIndex] as HTMLElement).remove();
            }
          } else if (action === 'splitCell') {
            cell.removeAttribute('colspan');
            cell.removeAttribute('rowspan');
          }
          scheduleChange();
        }}
        onTableHeaderStyle={(bg, borderWidth, borderColor) => {
          if (!floatToolbar.tableEl) return;
          const tbl = floatToolbar.tableEl;
          const thCells = Array.from(tbl.querySelectorAll('th')) as HTMLTableCellElement[];
          thCells.forEach(th => {
            th.style.backgroundColor = bg;
            th.style.borderWidth = borderWidth;
            th.style.borderColor = borderColor;
            th.style.borderStyle = borderWidth === '0px' ? 'none' : 'solid';
            const hex = bg.replace('#', '');
            const r = parseInt(hex.substring(0,2),16), g = parseInt(hex.substring(2,4),16), b = parseInt(hex.substring(4,6),16);
            const luminance = (0.299*r + 0.587*g + 0.114*b) / 255;
            th.style.color = luminance > 0.5 ? '#1e293b' : '#ffffff';
          });
          tbl.style.borderCollapse = 'collapse';
          const allCells = Array.from(tbl.querySelectorAll('td')) as HTMLTableCellElement[];
          allCells.forEach(c => {
            c.style.borderWidth = borderWidth;
            c.style.borderColor = borderColor;
            c.style.borderStyle = borderWidth === '0px' ? 'none' : 'solid';
          });
          scheduleChange();
        }}
        currentBlockType={floatToolbar.mode === 'block' ? (floatToolbar.currentBlockType || floatToolbar.blockEl?.tagName) : undefined}
        onChangeBlockType={floatToolbar.mode === 'block' ? handleChangeBlockType : undefined}
      />
      </div>
      {/* 서식 툴바 끝 */}
      </div>{/* ─── sticky 툴바 컨테이너 끝 ─── */}

      {/* iframe */}
      <iframe
        ref={iframeRef}
        style={{
          width: "100%",
          height: iframeHeight,
          border: "none",
          display: "block",
          transition: "height 0.2s ease",
        }}
        title="비주얼 편집기"
        sandbox="allow-same-origin allow-scripts allow-forms allow-popups"
        onLoad={handleIframeLoad}
      />

      {/* 숨겨진 이미지 파일 input (이미지 교체용) */}
      <input
        ref={replaceImageFileRef}
        type="file"
        accept="image/*"
        style={{ display: "none" }}
        onChange={handleReplaceImageFileChange}
      />
      {/* 숨겨진 이미지 파일 input (이미지 삽입용) */}
      <input
        ref={imageFileRef}
        type="file"
        accept="image/*"
        style={{ display: "none" }}
      />

      {/* 플로팅 서식 툴바 (텍스트 선택 시) */}
      {/* 표 편집 패널 (IframeVisualEditor) */}
      {tableEditMenu && createPortal(
        <div
          style={{
            position: "fixed",
            left: Math.min(Math.max(tableEditMenu.x, 4), window.innerWidth - 400),
            top: Math.max(tableEditMenu.y - 8, 60),
            zIndex: 99998,
            background: "#fff",
            borderRadius: 12,
            boxShadow: "0 8px 32px rgba(0,0,0,0.18)",
            padding: "10px 8px",
            width: 390,
            maxHeight: "80vh",
            overflowY: "auto",
            border: "1px solid #c7d2fe",
            userSelect: "none",
          }}
          onMouseDown={e => e.stopPropagation()}
        >
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "2px 6px 8px", borderBottom: "1px solid #f1f5f9", marginBottom: 6 }}>
            <span style={{ fontSize: 11, fontWeight: 700, color: "#3730a3" }}>🗂️ 표 편집</span>
            <button type="button" onMouseDown={() => { setTableEditMenu(null); setTableEditTab("rowcol"); }} style={{ background: "none", border: "none", cursor: "pointer", color: "#94a3b8", fontSize: 14, padding: 2 }}>✕</button>
          </div>
          {/* 탭 */}
          <div style={{ display: "flex", gap: 4, padding: "0 4px", marginBottom: 8 }}>
            {([
              { id: "rowcol", label: "행/열" },
              { id: "merge", label: "셀 병합" },
              { id: "cellbg", label: "셀 색상" },
              { id: "header", label: "헤더" },
              { id: "rowbg", label: "행 색상" },
              { id: "border", label: "테두리" },
              { id: "padding", label: "패딩" },
              { id: "preset", label: "🎨 프리셋" },
            ] as Array<{id: "rowcol"|"merge"|"cellbg"|"header"|"rowbg"|"border"|"padding"|"preset"; label: string}>).map(tab => (
              <button type="button" key={tab.id} onMouseDown={() => setTableEditTab(tab.id)}
                style={{ flex: 1, padding: "5px 4px", borderRadius: 6, border: "none", cursor: "pointer", fontSize: 11, fontWeight: 700,
                  background: tableEditTab === tab.id ? "#6366f1" : "#f1f5f9",
                  color: tableEditTab === tab.id ? "#fff" : "#475569" }}>
                {tab.label}
              </button>
            ))}
          </div>

          {/* 탭 1: 행/열 */}
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
                    const { tableEl, cellEl } = tableEditMenu;
                    const cell = cellEl.closest("td,th") as HTMLTableCellElement | null;
                    const row = cell?.closest("tr") as HTMLTableRowElement | null;
                    if (action === "insertRowAbove" && row) {
                      const cols = row.cells.length;
                      const newRow = tableEl.ownerDocument.createElement("tr");
                      for (let i = 0; i < cols; i++) { const td = tableEl.ownerDocument.createElement("td"); td.style.cssText = 'padding:8px 12px;border:1.5px solid #94a3b8;word-break:break-word;'; td.innerHTML = "&nbsp;"; newRow.appendChild(td); }
                      row.parentElement!.insertBefore(newRow, row);
                    } else if (action === "insertRowBelow" && row) {
                      const cols = row.cells.length;
                      const newRow = tableEl.ownerDocument.createElement("tr");
                      for (let i = 0; i < cols; i++) { const td = tableEl.ownerDocument.createElement("td"); td.style.cssText = 'padding:8px 12px;border:1.5px solid #94a3b8;word-break:break-word;'; td.innerHTML = "&nbsp;"; newRow.appendChild(td); }
                      row.parentElement!.insertBefore(newRow, row.nextSibling);
                    } else if (action === "deleteRow" && row) {
                      const allRows = tableEl.querySelectorAll("tr");
                      if (allRows.length > 1) row.remove();
                    }
                    scheduleChange();
                    setTableEditMenu(null);
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
                    const { tableEl, cellEl } = tableEditMenu;
                    const cell = cellEl.closest("td,th") as HTMLTableCellElement | null;
                    if (!cell) return;
                    const colIndex = cell.cellIndex;
                    const rows = Array.from(tableEl.querySelectorAll("tr")) as HTMLTableRowElement[];
                    if (action === "insertColLeft") {
                      rows.forEach(r => { const ref = r.cells[colIndex]; const nc = tableEl.ownerDocument.createElement(ref?.tagName.toLowerCase() || "td") as HTMLTableCellElement; nc.style.cssText = 'padding:8px 12px;border:1.5px solid #94a3b8;word-break:break-word;'; nc.innerHTML = "&nbsp;"; if (ref) r.insertBefore(nc, ref); });
                    } else if (action === "insertColRight") {
                      rows.forEach(r => { const ref = r.cells[colIndex]; const nc = tableEl.ownerDocument.createElement(ref?.tagName.toLowerCase() || "td") as HTMLTableCellElement; nc.style.cssText = 'padding:8px 12px;border:1.5px solid #94a3b8;word-break:break-word;'; nc.innerHTML = "&nbsp;"; if (ref) r.insertBefore(nc, ref.nextSibling); });
                    } else if (action === "deleteCol") {
                      const totalCols = rows[0]?.cells.length || 0;
                      if (totalCols > 1) rows.forEach(r => { if (r.cells[colIndex]) r.deleteCell(colIndex); });
                    }
                    scheduleChange();
                    setTableEditMenu(null);
                  }}>{label}</button>
              ))}
            </div>
            <div style={{ borderTop: "1px solid #f1f5f9", paddingTop: 6, padding: "6px 4px 0" }}>
              <button type="button"
                style={{ display: "flex", alignItems: "center", gap: 6, width: "100%", padding: "7px 12px", borderRadius: 6, border: "none", cursor: "pointer", fontSize: 12, fontWeight: 700, background: "#fee2e2", color: "#dc2626" }}
                onMouseDown={() => { const el = tableEditMenu.tableEl; setTableEditMenu(null); el.remove(); scheduleChange(); }}>
                🗑️ 표 전체 제거
              </button>
            </div>
          </>)}

          {/* 탭 2: 셀 병합/분할 */}
          {tableEditTab === "merge" && (<>
            <div style={{ fontSize: 11, color: "#64748b", padding: "2px 6px 8px", lineHeight: 1.5 }}>
              셀을 선택한 후 병합 방향을 선택하세요.
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
                    const { tableEl, cellEl } = tableEditMenu;
                    const cell = cellEl.closest("td,th") as HTMLTableCellElement | null;
                    if (!cell) return;
                    const doc = tableEl.ownerDocument;
                    if (action === "mergeRight") {
                      const nextCell = cell.nextElementSibling as HTMLTableCellElement | null;
                      if (nextCell) { cell.colSpan = (cell.colSpan || 1) + (nextCell.colSpan || 1); cell.innerHTML += " " + nextCell.innerHTML; nextCell.remove(); }
                    } else if (action === "mergeDown") {
                      const row = cell.closest("tr") as HTMLTableRowElement | null;
                      const nextRow = row?.nextElementSibling as HTMLTableRowElement | null;
                      if (nextRow) { const nextCell = nextRow.cells[cell.cellIndex] as HTMLTableCellElement | null; if (nextCell) { cell.rowSpan = (cell.rowSpan || 1) + (nextCell.rowSpan || 1); cell.innerHTML += " " + nextCell.innerHTML; nextCell.remove(); } }
                    } else if (action === "splitColspan") {
                      const span = cell.colSpan || 1;
                      if (span > 1) { cell.colSpan = span - 1; const nc = doc.createElement(cell.tagName.toLowerCase()) as HTMLTableCellElement; nc.innerHTML = "&nbsp;"; cell.parentElement!.insertBefore(nc, cell.nextSibling); }
                    } else if (action === "splitRowspan") {
                      const span = cell.rowSpan || 1;
                      if (span > 1) { cell.rowSpan = span - 1; const row = cell.closest("tr") as HTMLTableRowElement | null; const nextRow = row?.nextElementSibling as HTMLTableRowElement | null; if (nextRow) { const nc = doc.createElement(cell.tagName.toLowerCase()) as HTMLTableCellElement; nc.innerHTML = "&nbsp;"; nextRow.insertBefore(nc, nextRow.cells[cell.cellIndex] || null); } }
                    }
                    scheduleChange();
                    setTableEditMenu(null);
                  }}>{label}</button>
              ))}
            </div>
          </>)}

          {/* 탭 3: 셀 색상 */}
          {tableEditTab === "cellbg" && (<>
            <div style={{ fontSize: 11, color: "#64748b", padding: "2px 6px 6px" }}>
              드래그로 여러 셀 선택 후 배경색/글자색을 일괄 적용합니다.
            </div>
            <div style={{ padding: "0 4px" }}>
              <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 10 }}>
                <span style={{ fontSize: 11, fontWeight: 600, color: "#475569", minWidth: 60 }}>셀 배경색</span>
                <input type="color" defaultValue="#ffffff"
                  id="cellBgColorPicker"
                  onChange={e => {
                    const iframeDoc = iframeRef.current?.contentDocument;
                    if (!iframeDoc) return;
                    const selected = Array.from(iframeDoc.querySelectorAll('.cell-selected')) as HTMLTableCellElement[];
                    const targets = selected.length > 0 ? selected : [tableEditMenu.cellEl.closest("td,th") as HTMLTableCellElement].filter(Boolean);
                    targets.forEach(cell => { if (cell) cell.style.backgroundColor = e.target.value; });
                    scheduleChange();
                  }}
                  style={{ width: 36, height: 28, borderRadius: 4, border: "1px solid #e2e8f0", cursor: "pointer" }} />
                <div style={{ display: "flex", gap: 4, flexWrap: "wrap" }}>
                  {["transparent","#ffffff","#f8fafc","#fef9c3","#dcfce7","#dbeafe","#fce7f3","#ede9fe","#ffedd5","#fee2e2","#1e293b","#1e3a5f","#14532d","#7c3aed"].map(c => (
                    <div key={c}
                      onMouseDown={() => {
                        const iframeDoc = iframeRef.current?.contentDocument;
                        if (!iframeDoc) return;
                        const selected = Array.from(iframeDoc.querySelectorAll('.cell-selected')) as HTMLTableCellElement[];
                        const targets = selected.length > 0 ? selected : [tableEditMenu.cellEl.closest("td,th") as HTMLTableCellElement].filter(Boolean);
                        targets.forEach(cell => { if (cell) cell.style.backgroundColor = c === "transparent" ? "" : c; });
                        scheduleChange();
                      }}
                      style={{ width: 22, height: 22, borderRadius: 4, cursor: "pointer",
                        background: c === "transparent" ? "repeating-linear-gradient(45deg,#aaa 0,#aaa 2px,#fff 0,#fff 6px)" : c,
                        border: "1px solid #e2e8f0" }} />
                  ))}
                </div>
              </div>
              <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 10 }}>
                <span style={{ fontSize: 11, fontWeight: 600, color: "#475569", minWidth: 60 }}>글자 색상</span>
                <input type="color" defaultValue="#000000"
                  onChange={e => {
                    const iframeDoc = iframeRef.current?.contentDocument;
                    if (!iframeDoc) return;
                    const selected = Array.from(iframeDoc.querySelectorAll('.cell-selected')) as HTMLTableCellElement[];
                    const targets = selected.length > 0 ? selected : [tableEditMenu.cellEl.closest("td,th") as HTMLTableCellElement].filter(Boolean);
                    targets.forEach(cell => { if (cell) cell.style.color = e.target.value; });
                    scheduleChange();
                  }}
                  style={{ width: 36, height: 28, borderRadius: 4, border: "1px solid #e2e8f0", cursor: "pointer" }} />
                <div style={{ display: "flex", gap: 4, flexWrap: "wrap" }}>
                  {["#000000","#ffffff","#1e3a5f","#ef4444","#3b82f6","#10b981","#f59e0b","#8b5cf6"].map(c => (
                    <div key={c}
                      onMouseDown={() => {
                        const iframeDoc = iframeRef.current?.contentDocument;
                        if (!iframeDoc) return;
                        const selected = Array.from(iframeDoc.querySelectorAll('.cell-selected')) as HTMLTableCellElement[];
                        const targets = selected.length > 0 ? selected : [tableEditMenu.cellEl.closest("td,th") as HTMLTableCellElement].filter(Boolean);
                        targets.forEach(cell => { if (cell) cell.style.color = c; });
                        scheduleChange();
                      }}
                      style={{ width: 22, height: 22, borderRadius: 4, cursor: "pointer",
                        background: c, border: c === "#ffffff" ? "1px solid #e2e8f0" : "none" }} />
                  ))}
                </div>
              </div>
              <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 10 }}>
                <span style={{ fontSize: 11, fontWeight: 600, color: "#475569", minWidth: 60 }}>텍스트 정렬</span>
                <div style={{ display: "flex", gap: 4 }}>
                  {(["left","center","right"] as const).map(a => (
                    <button type="button" key={a}
                      style={{ padding: "4px 10px", borderRadius: 5, border: "1px solid #e2e8f0", cursor: "pointer", fontSize: 12,
                        background: "#f1f5f9", color: "#475569" }}
                      onMouseDown={() => {
                        const { cellEl } = tableEditMenu;
                        const cell = cellEl.closest("td,th") as HTMLTableCellElement | null;
                        if (cell) { cell.style.textAlign = a; scheduleChange(); }
                      }}>{a === "left" ? "⬅ 왼쪽" : a === "center" ? "⬌ 가운데" : "➡ 오른쪽"}</button>
                  ))}
                </div>
              </div>
              <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 10 }}>
                <span style={{ fontSize: 11, fontWeight: 600, color: "#475569", minWidth: 60 }}>세로 정렬</span>
                <div style={{ display: "flex", gap: 4 }}>
                  {(["top","middle","bottom"] as const).map(v => (
                    <button type="button" key={v}
                      style={{ padding: "4px 10px", borderRadius: 5, border: "1px solid #e2e8f0", cursor: "pointer", fontSize: 12,
                        background: "#f1f5f9", color: "#475569" }}
                      onMouseDown={() => {
                        const { cellEl } = tableEditMenu;
                        const cell = cellEl.closest("td,th") as HTMLTableCellElement | null;
                        if (cell) { cell.style.verticalAlign = v; scheduleChange(); }
                      }}>{v === "top" ? "⬆ 위" : v === "middle" ? "⬌ 중간" : "⬇ 아래"}</button>
                  ))}
                </div>
              </div>
              <button type="button"
                style={{ width: "100%", padding: "7px 12px", borderRadius: 8, border: "none", cursor: "pointer", fontSize: 11, fontWeight: 700, background: "#f1f5f9", color: "#475569", marginBottom: 4 }}
                onMouseDown={() => {
                  const { tableEl } = tableEditMenu;
                  const allCells = Array.from(tableEl.querySelectorAll("td,th")) as HTMLTableCellElement[];
                  allCells.forEach(c => { c.style.backgroundColor = ""; });
                  scheduleChange();
                }}>🗑 전체 셀 배경색 초기화</button>
            </div>
          </>)}

          {/* 탭 4: 헤더 스타일 */}
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
                  const { tableEl } = tableEditMenu;
                  const thCells = Array.from(tableEl.querySelectorAll("th")) as HTMLTableCellElement[];
                  thCells.forEach(th => {
                    th.style.backgroundColor = tableHeaderStyle.bg;
                    th.style.borderWidth = tableHeaderStyle.borderWidth;
                    th.style.borderColor = tableHeaderStyle.borderColor;
                    th.style.borderStyle = tableHeaderStyle.borderWidth === "0px" ? "none" : "solid";
                    const hex = tableHeaderStyle.bg.replace("#", "");
                    const r = parseInt(hex.substring(0,2),16), g = parseInt(hex.substring(2,4),16), b = parseInt(hex.substring(4,6),16);
                    const luminance = (0.299*r + 0.587*g + 0.114*b) / 255;
                    th.style.color = luminance > 0.5 ? "#1e293b" : "#ffffff";
                  });
                  tableEl.style.borderCollapse = "collapse";
                  const allCells = Array.from(tableEl.querySelectorAll("td")) as HTMLTableCellElement[];
                  allCells.forEach(c => {
                    c.style.borderWidth = tableHeaderStyle.borderWidth;
                    c.style.borderColor = tableHeaderStyle.borderColor;
                    c.style.borderStyle = tableHeaderStyle.borderWidth === "0px" ? "none" : "solid";
                  });
                  scheduleChange();
                  setTableEditMenu(null);
                }}>
                ✅ 헤더 스타일 적용
              </button>
            </div>
          </>)}

          {/* 탭 5: 행 배경색 일괄 적용 */}
          {tableEditTab === "rowbg" && (<>
            <div style={{ fontSize: 11, color: "#64748b", padding: "2px 6px 6px" }}>
              선택한 셀이 속한 행 전체에 배경색을 적용합니다.
            </div>
            <div style={{ padding: "0 4px" }}>
              <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 10 }}>
                <span style={{ fontSize: 11, fontWeight: 600, color: "#475569", minWidth: 60 }}>행 배경색</span>
                <input type="color" defaultValue="#fef9c3"
                  onChange={e => {
                    const { cellEl } = tableEditMenu;
                    const cell = cellEl.closest("td,th") as HTMLTableCellElement | null;
                    const row = cell?.closest("tr") as HTMLTableRowElement | null;
                    if (row) { Array.from(row.cells).forEach(c => { (c as HTMLElement).style.backgroundColor = e.target.value; }); scheduleChange(); }
                  }}
                  style={{ width: 36, height: 28, borderRadius: 4, border: "1px solid #e2e8f0", cursor: "pointer" }} />
                <div style={{ display: "flex", gap: 4, flexWrap: "wrap" }}>
                  {["transparent","#ffffff","#f8fafc","#fef9c3","#dcfce7","#dbeafe","#fce7f3","#ede9fe","#ffedd5","#fee2e2","#1e293b","#1e3a5f"].map(c => (
                    <div key={c}
                      onMouseDown={() => {
                        const { cellEl } = tableEditMenu;
                        const cell = cellEl.closest("td,th") as HTMLTableCellElement | null;
                        const row = cell?.closest("tr") as HTMLTableRowElement | null;
                        if (row) { Array.from(row.cells).forEach(rc => { (rc as HTMLElement).style.backgroundColor = c === "transparent" ? "" : c; }); scheduleChange(); }
                      }}
                      style={{ width: 22, height: 22, borderRadius: 4, cursor: "pointer",
                        background: c === "transparent" ? "repeating-linear-gradient(45deg,#aaa 0,#aaa 2px,#fff 0,#fff 6px)" : c,
                        border: "1px solid #e2e8f0" }} />
                  ))}
                </div>
              </div>
              <div style={{ borderTop: "1px solid #f1f5f9", paddingTop: 8 }}>
                <div style={{ fontSize: 11, fontWeight: 600, color: "#475569", marginBottom: 6 }}>줄무늬 표 빠른 적용</div>
                <div style={{ display: "flex", gap: 6 }}>
                  {([
                    { label: "파랑 줄무늬", even: "#dbeafe", odd: "#ffffff" },
                    { label: "회색 줄무늬", even: "#f1f5f9", odd: "#ffffff" },
                    { label: "초록 줄무늬", even: "#dcfce7", odd: "#ffffff" },
                  ] as Array<{label:string;even:string;odd:string}>).map(({ label, even, odd }) => (
                    <button type="button" key={label}
                      style={{ flex: 1, padding: "6px 4px", borderRadius: 6, border: "1px solid #e2e8f0", cursor: "pointer", fontSize: 10, fontWeight: 600, background: "#f8fafc", color: "#475569" }}
                      onMouseDown={() => {
                        const { tableEl } = tableEditMenu;
                        const rows = Array.from(tableEl.querySelectorAll("tr")) as HTMLTableRowElement[];
                        rows.forEach((row, ri) => {
                          const bg = ri % 2 === 0 ? even : odd;
                          Array.from(row.cells).forEach(c => { (c as HTMLElement).style.backgroundColor = bg; });
                        });
                        scheduleChange();
                      }}>{label}</button>
                  ))}
                </div>
              </div>
              <button type="button"
                style={{ width: "100%", padding: "7px 12px", borderRadius: 8, border: "none", cursor: "pointer", fontSize: 11, fontWeight: 700, background: "#f1f5f9", color: "#475569", marginTop: 8 }}
                onMouseDown={() => {
                  const { tableEl } = tableEditMenu;
                  Array.from(tableEl.querySelectorAll("td,th")).forEach(c => { (c as HTMLElement).style.backgroundColor = ""; });
                  scheduleChange();
                }}>🗑 전체 행 배경색 초기화</button>
            </div>
          </>)}

          {/* 탭 6: 테두리 일괄 변경 */}
          {tableEditTab === "border" && (<>
            <div style={{ fontSize: 11, color: "#64748b", padding: "2px 6px 6px" }}>
              표 전체 테두리 두께와 색상을 일괄 변경합니다.
            </div>
            <div style={{ padding: "0 4px" }}>
              <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 10 }}>
                <span style={{ fontSize: 11, fontWeight: 600, color: "#475569", minWidth: 60 }}>테두리 색</span>
                <input type="color" defaultValue="#94a3b8"
                  onChange={e => {
                    const { tableEl } = tableEditMenu;
                    Array.from(tableEl.querySelectorAll("td,th")).forEach(c => { (c as HTMLElement).style.borderColor = e.target.value; (c as HTMLElement).style.borderStyle = "solid"; });
                    scheduleChange();
                  }}
                  style={{ width: 36, height: 28, borderRadius: 4, border: "1px solid #e2e8f0", cursor: "pointer" }} />
                <div style={{ display: "flex", gap: 4, flexWrap: "wrap" }}>
                  {["#94a3b8","#64748b","#334155","#000000","#3b82f6","#10b981","#ef4444","#f59e0b"].map(c => (
                    <div key={c}
                      onMouseDown={() => {
                        const { tableEl } = tableEditMenu;
                        Array.from(tableEl.querySelectorAll("td,th")).forEach(cell => {
                          const el = cell as HTMLElement;
                          el.style.borderColor = c; el.style.borderStyle = "solid";
                        });
                        scheduleChange();
                      }}
                      style={{ width: 22, height: 22, borderRadius: 4, cursor: "pointer", background: c, border: "1px solid #e2e8f0" }} />
                  ))}
                </div>
              </div>
              <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 10 }}>
                <span style={{ fontSize: 11, fontWeight: 600, color: "#475569", minWidth: 60 }}>테두리 굵기</span>
                <div style={{ display: "flex", gap: 4, flexWrap: "wrap" }}>
                  {(["0px","1px","1.5px","2px","3px","4px"] as const).map(w => (
                    <button type="button" key={w}
                      style={{ padding: "5px 10px", borderRadius: 5, border: "1px solid #e2e8f0", cursor: "pointer", fontSize: 11, fontWeight: 600, background: "#f1f5f9", color: "#475569" }}
                      onMouseDown={() => {
                        const { tableEl } = tableEditMenu;
                        Array.from(tableEl.querySelectorAll("td,th")).forEach(cell => {
                          const el = cell as HTMLElement;
                          el.style.borderWidth = w;
                          el.style.borderStyle = w === "0px" ? "none" : "solid";
                        });
                        scheduleChange();
                      }}>{w === "0px" ? "없음" : w}</button>
                  ))}
                </div>
              </div>
              <button type="button"
                style={{ width: "100%", padding: "7px 12px", borderRadius: 8, border: "none", cursor: "pointer", fontSize: 11, fontWeight: 700, background: "#fee2e2", color: "#dc2626", marginTop: 4 }}
                onMouseDown={() => {
                  const { tableEl } = tableEditMenu;
                  Array.from(tableEl.querySelectorAll("td,th")).forEach(cell => {
                    const el = cell as HTMLElement;
                    el.style.borderStyle = "none"; el.style.borderWidth = "";
                  });
                  scheduleChange();
                }}>테두리 전체 제거</button>
            </div>
          </>)}

          {/* 탭 7: 셀 패딩 조절 */}
          {tableEditTab === "padding" && (<>
            <div style={{ fontSize: 11, color: "#64748b", padding: "2px 6px 6px" }}>
              표 전체 셀의 내부 여백(패딩)을 조절합니다.
            </div>
            <div style={{ padding: "0 4px" }}>
              <div style={{ marginBottom: 14 }}>
                <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 4 }}>
                  <span style={{ fontSize: 11, fontWeight: 600, color: "#475569" }}>상하 패딩</span>
                  <span id="vPadLabel" style={{ fontSize: 11, color: "#6366f1", fontWeight: 700 }}>8px</span>
                </div>
                <input type="range" min={0} max={32} defaultValue={8}
                  style={{ width: "100%", accentColor: "#6366f1" }}
                  onInput={e => {
                    const v = (e.target as HTMLInputElement).value;
                    const label = document.getElementById("vPadLabel");
                    if (label) label.textContent = v + "px";
                    const { tableEl } = tableEditMenu;
                    Array.from(tableEl.querySelectorAll("td,th")).forEach(cell => {
                      const el = cell as HTMLElement;
                      const cur = el.style.padding || "8px 12px";
                      const parts = cur.split(" ");
                      const h = parts[1] || parts[0] || "12px";
                      el.style.padding = `${v}px ${h}`;
                    });
                    scheduleChange();
                  }} />
              </div>
              <div style={{ marginBottom: 14 }}>
                <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 4 }}>
                  <span style={{ fontSize: 11, fontWeight: 600, color: "#475569" }}>좌우 패딩</span>
                  <span id="hPadLabel" style={{ fontSize: 11, color: "#6366f1", fontWeight: 700 }}>12px</span>
                </div>
                <input type="range" min={0} max={48} defaultValue={12}
                  style={{ width: "100%", accentColor: "#6366f1" }}
                  onInput={e => {
                    const v = (e.target as HTMLInputElement).value;
                    const label = document.getElementById("hPadLabel");
                    if (label) label.textContent = v + "px";
                    const { tableEl } = tableEditMenu;
                    Array.from(tableEl.querySelectorAll("td,th")).forEach(cell => {
                      const el = cell as HTMLElement;
                      const cur = el.style.padding || "8px 12px";
                      const parts = cur.split(" ");
                      const vp = parts[0] || "8px";
                      el.style.padding = `${vp} ${v}px`;
                    });
                    scheduleChange();
                  }} />
              </div>
              <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                {([
                  { label: "촘촘 (4/8)", v: 4, h: 8 },
                  { label: "기본 (8/12)", v: 8, h: 12 },
                  { label: "여유 (12/16)", v: 12, h: 16 },
                  { label: "넓게 (16/24)", v: 16, h: 24 },
                ] as Array<{label:string;v:number;h:number}>).map(({ label, v, h }) => (
                  <button type="button" key={label}
                    style={{ flex: "1 1 80px", padding: "6px 6px", borderRadius: 6, border: "1px solid #e2e8f0", cursor: "pointer", fontSize: 10, fontWeight: 600, background: "#f8fafc", color: "#475569" }}
                    onMouseDown={() => {
                      const { tableEl } = tableEditMenu;
                      Array.from(tableEl.querySelectorAll("td,th")).forEach(cell => {
                        (cell as HTMLElement).style.padding = `${v}px ${h}px`;
                      });
                      scheduleChange();
                    }}>{label}</button>
                ))}
              </div>
            </div>
          </>)}

          {/* 탭 8: 표 스타일 프리셋 */}
          {tableEditTab === "preset" && (<>
            <div style={{ fontSize: 11, color: "#64748b", padding: "2px 6px 8px" }}>
              클릭 한 번으로 표 전체에 스타일을 적용합니다.
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8, padding: "0 4px" }}>
              {([
                {
                  id: "stripe",
                  label: "🟦 줄무니",
                  desc: "홀수 행 파란 배경",
                  preview: [["#dbeafe","#ffffff"],["#dbeafe","#ffffff"],["#dbeafe","#ffffff"]],
                  apply: (tbl: HTMLTableElement) => {
                    const rows = Array.from(tbl.rows);
                    rows.forEach((row, ri) => {
                      Array.from(row.cells).forEach(cell => {
                        const c = cell as HTMLElement;
                        c.style.backgroundColor = ri % 2 === 0 ? "#dbeafe" : "#ffffff";
                        c.style.border = "1.5px solid #93c5fd";
                        c.style.padding = "8px 12px";
                        c.style.color = "";
                      });
                    });
                  },
                },
                {
                  id: "header-bold",
                  label: "📌 헤더 강조",
                  desc: "첫 행 진한 네이비",
                  preview: [["#1e3a5f","#1e3a5f"],["#f8fafc","#f8fafc"],["#f8fafc","#f8fafc"]],
                  apply: (tbl: HTMLTableElement) => {
                    const rows = Array.from(tbl.rows);
                    rows.forEach((row, ri) => {
                      Array.from(row.cells).forEach(cell => {
                        const c = cell as HTMLElement;
                        if (ri === 0) {
                          c.style.backgroundColor = "#1e3a5f";
                          c.style.color = "#ffffff";
                          c.style.fontWeight = "700";
                        } else {
                          c.style.backgroundColor = ri % 2 === 0 ? "#f8fafc" : "#ffffff";
                          c.style.color = "";
                          c.style.fontWeight = "";
                        }
                        c.style.border = "1.5px solid #94a3b8";
                        c.style.padding = "8px 12px";
                      });
                    });
                  },
                },
                {
                  id: "dark",
                  label: "🌑 다크 테마",
                  desc: "다크 배경 + 흰 텍스트",
                  preview: [["#1e293b","#1e293b"],["#334155","#334155"],["#1e293b","#1e293b"]],
                  apply: (tbl: HTMLTableElement) => {
                    const rows = Array.from(tbl.rows);
                    rows.forEach((row, ri) => {
                      Array.from(row.cells).forEach(cell => {
                        const c = cell as HTMLElement;
                        c.style.backgroundColor = ri === 0 ? "#0f172a" : ri % 2 === 0 ? "#1e293b" : "#334155";
                        c.style.color = "#e2e8f0";
                        c.style.border = "1.5px solid #475569";
                        c.style.padding = "8px 12px";
                        if (ri === 0) { c.style.fontWeight = "700"; c.style.color = "#f8fafc"; }
                      });
                    });
                  },
                },
                {
                  id: "pastel",
                  label: "🌸 파스텔",
                  desc: "연한 톤 + 소프트 테두리",
                  preview: [["#fce7f3","#fce7f3"],["#fef9c3","#fef9c3"],["#dcfce7","#dcfce7"]],
                  apply: (tbl: HTMLTableElement) => {
                    const pastelColors = ["#fce7f3","#fef9c3","#dcfce7","#dbeafe","#ede9fe","#ffedd5"];
                    const rows = Array.from(tbl.rows);
                    rows.forEach((row, ri) => {
                      const bg = pastelColors[ri % pastelColors.length];
                      Array.from(row.cells).forEach(cell => {
                        const c = cell as HTMLElement;
                        c.style.backgroundColor = bg;
                        c.style.color = "#1e293b";
                        c.style.border = "1.5px solid #e2e8f0";
                        c.style.padding = "8px 12px";
                        c.style.fontWeight = ri === 0 ? "700" : "";
                      });
                    });
                  },
                },
                {
                  id: "simple",
                  label: "⬜ 심플",
                  desc: "흰 배경 + 연한 테두리",
                  preview: [["#ffffff","#ffffff"],["#ffffff","#ffffff"],["#ffffff","#ffffff"]],
                  apply: (tbl: HTMLTableElement) => {
                    Array.from(tbl.querySelectorAll("td,th")).forEach(cell => {
                      const c = cell as HTMLElement;
                      c.style.backgroundColor = "#ffffff";
                      c.style.color = "#1e293b";
                      c.style.border = "1px solid #e2e8f0";
                      c.style.padding = "8px 12px";
                      c.style.fontWeight = "";
                    });
                    const firstRow = tbl.rows[0];
                    if (firstRow) Array.from(firstRow.cells).forEach(cell => { (cell as HTMLElement).style.fontWeight = "700"; (cell as HTMLElement).style.borderBottom = "2px solid #94a3b8"; });
                  },
                },
                {
                  id: "no-border",
                  label: "🟥 테두리 없음",
                  desc: "테두리 제거 + 행 구분선만",
                  preview: [["#f8fafc","#f8fafc"],["#ffffff","#ffffff"],["#f8fafc","#f8fafc"]],
                  apply: (tbl: HTMLTableElement) => {
                    const rows = Array.from(tbl.rows);
                    rows.forEach((row, ri) => {
                      Array.from(row.cells).forEach((cell, ci) => {
                        const c = cell as HTMLElement;
                        c.style.backgroundColor = ri === 0 ? "#f8fafc" : "";
                        c.style.color = "";
                        c.style.border = "none";
                        c.style.borderBottom = "1px solid #e2e8f0";
                        c.style.borderLeft = ci === 0 ? "none" : "";
                        c.style.padding = "10px 12px";
                        c.style.fontWeight = ri === 0 ? "700" : "";
                      });
                    });
                  },
                },
                {
                  id: "green-stripe",
                  label: "🟩 연두 줄무니",
                  desc: "홈수 행 연두 배경",
                  preview: [["#dcfce7","#dcfce7"],["#ffffff","#ffffff"],["#dcfce7","#dcfce7"]],
                  apply: (tbl: HTMLTableElement) => {
                    const rows = Array.from(tbl.rows);
                    rows.forEach((row, ri) => {
                      Array.from(row.cells).forEach(cell => {
                        const c = cell as HTMLElement;
                        c.style.backgroundColor = ri === 0 ? "#14532d" : ri % 2 === 0 ? "#dcfce7" : "#ffffff";
                        c.style.color = ri === 0 ? "#ffffff" : "#1e293b";
                        c.style.border = "1.5px solid #86efac";
                        c.style.padding = "8px 12px";
                        c.style.fontWeight = ri === 0 ? "700" : "";
                      });
                    });
                  },
                },
                {
                  id: "purple-header",
                  label: "💜 퍼플 헤더",
                  desc: "퍼플 헤더 + 연한 행",
                  preview: [["#7c3aed","#7c3aed"],["#ede9fe","#ffffff"],["#ede9fe","#ffffff"]],
                  apply: (tbl: HTMLTableElement) => {
                    const rows = Array.from(tbl.rows);
                    rows.forEach((row, ri) => {
                      Array.from(row.cells).forEach(cell => {
                        const c = cell as HTMLElement;
                        if (ri === 0) {
                          c.style.backgroundColor = "#7c3aed";
                          c.style.color = "#ffffff";
                          c.style.fontWeight = "700";
                        } else {
                          c.style.backgroundColor = ri % 2 === 0 ? "#ede9fe" : "#ffffff";
                          c.style.color = "#1e293b";
                          c.style.fontWeight = "";
                        }
                        c.style.border = "1.5px solid #c4b5fd";
                        c.style.padding = "8px 12px";
                      });
                    });
                  },
                },
              ] as Array<{id:string;label:string;desc:string;preview:string[][];apply:(tbl:HTMLTableElement)=>void}>).map(preset => (
                <div key={preset.id}
                  onMouseDown={() => {
                    const { tableEl } = tableEditMenu;
                    const tbl = tableEl.closest('table') as HTMLTableElement || tableEl.querySelector('table') as HTMLTableElement || tableEl as HTMLTableElement;
                    preset.apply(tbl);
                    const doc = iframeRef.current?.contentDocument;
                    if (doc && initAllTablesRef.current) initAllTablesRef.current(doc);
                    scheduleChange();
                  }}
                  style={{ cursor: "pointer", borderRadius: 8, border: "2px solid #e2e8f0", overflow: "hidden",
                    transition: "border-color 0.15s, box-shadow 0.15s",
                    boxShadow: "0 1px 4px rgba(0,0,0,0.06)" }}
                  onMouseEnter={e => { (e.currentTarget as HTMLElement).style.borderColor = "#6366f1"; (e.currentTarget as HTMLElement).style.boxShadow = "0 2px 8px rgba(99,102,241,0.18)"; }}
                  onMouseLeave={e => { (e.currentTarget as HTMLElement).style.borderColor = "#e2e8f0"; (e.currentTarget as HTMLElement).style.boxShadow = "0 1px 4px rgba(0,0,0,0.06)"; }}
                >
                  {/* 미리보기 표 */}
                  <table style={{ width: "100%", borderCollapse: "collapse", tableLayout: "fixed" }}>
                    <tbody>
                      {preset.preview.map((row, ri) => (
                        <tr key={ri}>
                          {row.map((bg, ci) => (
                            <td key={ci} style={{ backgroundColor: bg, height: 14, border: "1px solid rgba(0,0,0,0.06)" }} />
                          ))}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                  {/* 라벨 */}
                  <div style={{ padding: "6px 8px", background: "#f8fafc" }}>
                    <div style={{ fontSize: 11, fontWeight: 700, color: "#1e293b" }}>{preset.label}</div>
                    <div style={{ fontSize: 10, color: "#64748b", marginTop: 1 }}>{preset.desc}</div>
                  </div>
                </div>
              ))}
            </div>
          </>)}
        </div>,
        document.body
      )}

      {/* 이미지 오버레이 버튼 */}
      {imageOverlay.visible && createPortal(
        <div
          style={{
            position: "absolute",
            // 이미지 우측 끝에 배치 (개선: + 삽입 메뉴와 겨치지 않도록)
            left: imageOverlay.imgRight !== undefined ? imageOverlay.imgRight + 8 : imageOverlay.x,
            top: imageOverlay.y,
            transform: imageOverlay.imgRight !== undefined ? "translate(0, -100%)" : "translate(-50%, -100%)",
            display: "flex", flexDirection: "column", gap: 4, alignItems: "flex-start",
            background: "#1f2937",
            borderRadius: 8,
            padding: "6px 8px",
            boxShadow: "0 4px 16px rgba(0,0,0,0.3)",
            zIndex: 9999,
          }}
        >
          {/* 1줄: 교체/삭제/닫기 */}
          <div style={{ display: "flex", gap: 4 }}>
            {onUploadImage && (
              <button
                type="button"
                onClick={handleReplaceImage}
                disabled={imageUploading}
                style={{
                  display: "flex", alignItems: "center", gap: 4,
                  padding: "4px 10px", borderRadius: 5,
                  background: "#6366f1", border: "none",
                  color: "#fff", fontSize: 11, fontWeight: 700,
                  cursor: imageUploading ? "not-allowed" : "pointer",
                }}
              >
                <Upload size={11} />
                {imageUploading ? "업로드 중..." : "교체"}
              </button>
            )}
            <button
              type="button"
              onClick={handleDeleteImage}
              style={{
                display: "flex", alignItems: "center", gap: 4,
                padding: "4px 10px", borderRadius: 5,
                background: "#ef4444", border: "none",
                color: "#fff", fontSize: 11, fontWeight: 700,
                cursor: "pointer",
              }}
            >
              <Trash2 size={11} />
              삭제
            </button>
            <button
              type="button"
              onClick={() => {
                // 선택 테두리 및 리사이즈 핸들 제거
                if (imageOverlay.imgEl) {
                  imageOverlay.imgEl.style.outline = '';
                  imageOverlay.imgEl.removeAttribute('data-img-selected');
                  imageOverlay.imgEl.parentElement?.querySelectorAll('[data-iframe-resize-handle]').forEach(el => el.remove());
                }
                setImageOverlay(prev => ({ ...prev, visible: false }));
              }}
              style={{
                display: "flex", alignItems: "center",
                padding: "4px 6px", borderRadius: 5,
                background: "#374151", border: "none",
                color: "#9ca3af", fontSize: 11,
                cursor: "pointer",
              }}
            >
              <X size={11} />
            </button>
          </div>
          {/* 2줄: 정렬 버튼 (현재 정렬 상태 하이라이트) */}
          <div style={{ display: "flex", gap: 4 }}>
            {([
              { align: "left" as const, label: "◀", title: "왼쪽 정렬" },
              { align: "center" as const, label: "◆", title: "가운데 정렬" },
              { align: "right" as const, label: "▶", title: "오른쪽 정렬" },
            ]).map(({ align, label, title }) => {
              const isActive = imageOverlay.currentAlign === align;
              return (
                <button
                  key={align}
                  type="button"
                  title={title}
                  onClick={() => {
                    const img = imageOverlay.imgEl;
                    if (!img) return;
                    if (align === "center") {
                      img.style.display = "block";
                      img.style.margin = "0 auto";
                      img.style.float = "none";
                    } else if (align === "right") {
                      img.style.float = "right";
                      img.style.margin = "0 0 8px 16px";
                      img.style.display = "";
                    } else {
                      img.style.float = "none";
                      img.style.margin = "0 16px 8px 0";
                      img.style.display = "";
                    }
                    scheduleChange();
                    setImageOverlay(prev => ({ ...prev, currentAlign: align }));
                  }}
                  style={{
                    padding: "4px 12px", borderRadius: 5,
                    background: isActive ? "#6366f1" : "rgba(255,255,255,0.1)",
                    border: isActive ? "1px solid #818cf8" : "1px solid rgba(255,255,255,0.2)",
                    color: isActive ? "#fff" : "#e5e7eb",
                    fontSize: 13, fontWeight: 700,
                    cursor: "pointer",
                    transition: "background 0.15s",
                  }}
                >
                  {label}
                </button>
              );
            })}
          </div>
          {/* 3줄: 너비 조절 */}
          <div style={{ display: "flex", gap: 4, alignItems: "center", width: "100%" }}>
            <span style={{ fontSize: 10, color: "#9ca3af", whiteSpace: "nowrap" }}>너비:</span>
            <input
              type="text"
              value={imageOverlay.currentWidth || ''}
              onChange={e => setImageOverlay(prev => ({ ...prev, currentWidth: e.target.value }))}
              onKeyDown={e => {
                if (e.key === 'Enter') {
                  const img = imageOverlay.imgEl;
                  if (!img) return;
                  const val = imageOverlay.currentWidth || '';
                  img.style.width = val;
                  img.style.maxWidth = '100%';
                  img.style.height = 'auto';
                  scheduleChange();
                }
              }}
              onBlur={() => {
                const img = imageOverlay.imgEl;
                if (!img) return;
                const val = imageOverlay.currentWidth || '';
                if (val) {
                  img.style.width = val;
                  img.style.maxWidth = '100%';
                  img.style.height = 'auto';
                  scheduleChange();
                }
              }}
              style={{
                width: 64, padding: "3px 6px", borderRadius: 4,
                background: "#374151", border: "1px solid #4b5563",
                color: "#fff", fontSize: 11,
                outline: "none",
              }}
              placeholder="예: 300px"
            />
            {(['100%','75%','50%','25%'] as const).map(w => (
              <button
                key={w}
                type="button"
                onClick={() => {
                  const img = imageOverlay.imgEl;
                  if (!img) return;
                  img.style.width = w;
                  img.style.maxWidth = '100%';
                  img.style.height = 'auto';
                  setImageOverlay(prev => ({ ...prev, currentWidth: w }));
                  scheduleChange();
                }}
                style={{
                  padding: "3px 6px", borderRadius: 4,
                  background: imageOverlay.currentWidth === w ? "#6366f1" : "rgba(255,255,255,0.1)",
                  border: "1px solid rgba(255,255,255,0.2)",
                  color: "#e5e7eb", fontSize: 10, fontWeight: 600,
                  cursor: "pointer",
                }}
              >{w}</button>
            ))}
          </div>
          {/* 4줄: 비율 유지 토글 + 리사이즈 안내 */}
          <div style={{ display: "flex", gap: 6, alignItems: "center", width: "100%" }}>
            <button
              type="button"
              title={imageOverlay.keepAspect ? "비율 유지 ON (클릭하면 자유 리사이즈)" : "자유 리사이즈 (클릭하면 비율 유지)"}
              onClick={() => setImageOverlay(prev => ({ ...prev, keepAspect: !prev.keepAspect }))}
              style={{
                padding: "3px 8px", borderRadius: 4, fontSize: 10, fontWeight: 600,
                background: imageOverlay.keepAspect ? "#059669" : "rgba(255,255,255,0.1)",
                border: imageOverlay.keepAspect ? "1px solid #34d399" : "1px solid rgba(255,255,255,0.2)",
                color: imageOverlay.keepAspect ? "#fff" : "#9ca3af",
                cursor: "pointer",
              }}
            >{imageOverlay.keepAspect ? "⛓ 비율 유지" : "✂ 자유 크기"}</button>
            <span style={{ fontSize: 10, color: "#6b7280" }}>Shift+드래그: 자유 리사이즈</span>
          </div>
          {/* 5줄: alt 텍스트 */}
          <div style={{ display: "flex", gap: 4, alignItems: "center", width: "100%" }}>
            <span style={{ fontSize: 10, color: "#9ca3af", whiteSpace: "nowrap", minWidth: 24 }}>alt:</span>
            <input
              type="text"
              value={imageOverlay.currentAlt || ''}
              onChange={e => setImageOverlay(prev => ({ ...prev, currentAlt: e.target.value }))}
              onBlur={() => {
                const img = imageOverlay.imgEl;
                if (!img) return;
                img.setAttribute('alt', imageOverlay.currentAlt || '');
                scheduleChange();
              }}
              onKeyDown={e => {
                if (e.key === 'Enter') {
                  const img = imageOverlay.imgEl;
                  if (!img) return;
                  img.setAttribute('alt', imageOverlay.currentAlt || '');
                  scheduleChange();
                }
              }}
              style={{
                flex: 1, padding: "3px 6px", borderRadius: 4,
                background: "#374151", border: "1px solid #4b5563",
                color: "#fff", fontSize: 11, outline: "none",
              }}
              placeholder="대체 텍스트 (접근성)"
            />
          </div>
          {/* 6줄: 하단 캡션 */}
          <div style={{ display: "flex", gap: 4, alignItems: "center", width: "100%" }}>
            <span style={{ fontSize: 10, color: "#9ca3af", whiteSpace: "nowrap", minWidth: 24 }}>캡션:</span>
            <input
              type="text"
              value={imageOverlay.currentCaption || ''}
              onChange={e => setImageOverlay(prev => ({ ...prev, currentCaption: e.target.value }))}
              onBlur={() => {
                const img = imageOverlay.imgEl;
                if (!img) return;
                const caption = imageOverlay.currentCaption || '';
                // figure > figcaption 구조로 변환
                const figureEl = img.closest('figure');
                if (caption) {
                  if (figureEl) {
                    // 기존 figure 업데이트
                    let fc = figureEl.querySelector('figcaption');
                    if (!fc) { fc = img.ownerDocument.createElement('figcaption'); figureEl.appendChild(fc); }
                    fc.textContent = caption;
                  } else {
                    // img를 figure로 감싸기
                    const parent = img.parentElement;
                    if (!parent) return;
                    const fig = img.ownerDocument.createElement('figure');
                    fig.style.cssText = 'margin: 1em 0; text-align: center;';
                    parent.insertBefore(fig, img);
                    fig.appendChild(img);
                    const fc = img.ownerDocument.createElement('figcaption');
                    fc.style.cssText = 'font-size: 0.85em; color: #6b7280; margin-top: 6px;';
                    fc.textContent = caption;
                    fig.appendChild(fc);
                  }
                } else {
                  // 캡션 제거 시 figure 해제
                  if (figureEl) {
                    figureEl.querySelector('figcaption')?.remove();
                    if (!figureEl.querySelector('figcaption')) {
                      const parent = figureEl.parentElement;
                      if (parent) { parent.insertBefore(img, figureEl); figureEl.remove(); }
                    }
                  }
                }
                scheduleChange();
              }}
              style={{
                flex: 1, padding: "3px 6px", borderRadius: 4,
                background: "#374151", border: "1px solid #4b5563",
                color: "#fff", fontSize: 11, outline: "none",
              }}
              placeholder="이미지 하단 캡션 (선택)"
            />
          </div>
        </div>,
        containerRef.current || document.body
      )}

      {/* 블록 삭제 오버레이 버튼 */}
      {/* + 버튼 (블록 사이 삽입) - 팝업 없이 클릭 시 하단 패널 활성화 */}
      {plusButton.visible && createPortal(
        <div
          style={{
            position: "fixed",
            left: plusButton.x,
            top: plusButton.y,
            transform: "translate(0, -100%)",
            zIndex: 99997,
            display: "flex",
            flexDirection: "row",
            alignItems: "flex-start",
            gap: 6,
          }}
          onMouseEnter={() => {
            if (plusHideTimerRef.current) clearTimeout(plusHideTimerRef.current);
          }}
          onMouseLeave={() => {
            // + 버튼은 클릭 기반으로만 열리고 닫힌다. mouseLeave로 자동 숨기지 않는다.
          }}
        >
          {/* + 버튼 - 클릭 시 하단 고정 패널 활성화 */}
          <button
            type="button"
            onClick={() => {
              // + 메뉴 토글 시 이미지 편집 팝업 닫기 (상호 배타적)
              if (imageOverlay.visible) {
                if (imageOverlay.imgEl) {
                  imageOverlay.imgEl.style.outline = '';
                  imageOverlay.imgEl.removeAttribute('data-img-selected');
                  imageOverlay.imgEl.parentElement?.querySelectorAll('[data-iframe-resize-handle]').forEach(el => el.remove());
                }
                setImageOverlay(prev => ({ ...prev, visible: false }));
              }
              // plusAfterElRef는 showPlusAt에서 이미 정확히 설정됨 - 여기서 덮어쓰지 않음
              // 하단 고정 패널 토글
              setPlusButton(prev => ({ ...prev, showMenu: !prev.showMenu }));
            }}
            style={{
              width: 26, height: 26, borderRadius: "50%",
              background: plusButton.showMenu ? "#4f46e5" : "#6366f1",
              border: plusButton.showMenu ? "2px solid #a5b4fc" : "2px solid #fff",
              color: "#fff", fontSize: 18, fontWeight: 700,
              cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center",
              boxShadow: plusButton.showMenu ? "0 0 0 3px rgba(99,102,241,0.4)" : "0 2px 8px rgba(99,102,241,0.5)",
              lineHeight: 1, padding: 0,
              transition: "all 0.15s",
            }}
          >
            <Plus size={14} />
          </button>
          {/* 삽입 위치 표시 라인 - 제거됨 */}
          {/* 블록 삽입 팝업 메뉴 - 고정 패널로 대체됨 */}
          {false && (
            <div
              style={{
                position: "absolute",
                left: 30,
                top: "50%",
                transform: "translateY(-50%)",
                zIndex: 9999,
                background: "#1e1b4b",
                border: "2px solid #6366f1",
                borderRadius: 10,
                boxShadow: "0 8px 32px rgba(0,0,0,0.35)",
                padding: "8px 6px",
                minWidth: 180,
                display: "flex",
                flexDirection: "column",
                gap: 2,
              }}
            >
              {/* 텍스트 단락 삽입 */}
              <button
                type="button"
                onClick={() => {
                  pushSnapshot(); // 삽입 직전 스냅샷 저장
                  const iframe = iframeRef.current;
                  if (!iframe) return;
                  try {
                    const doc = iframe.contentDocument || iframe.contentWindow?.document;
                    if (!doc?.body) return;
                    const p = doc.createElement("p");
                    p.innerHTML = "<br>";
                    p.style.cssText = "min-height:1.5em;padding:4px 0;";
                    const afterEl = plusAfterElRef.current;
                    if (afterEl && afterEl.parentNode) {
                      if (plusInsertBeforeModeRef.current) {
                        afterEl.parentNode.insertBefore(p, afterEl);
                      } else {
                        afterEl.parentNode.insertBefore(p, afterEl.nextSibling);
                      }
                    } else {
                      doc.body.appendChild(p);
                    }
                    adjustHeight();
                    setTimeout(() => {
                      // iframe에 포커스를 먼저 주어야 커서가 보임
                      iframe.contentWindow?.focus();
                      const range = doc.createRange();
                      range.setStart(p, 0);
                      range.collapse(true);
                      const sel = doc.defaultView?.getSelection();
                      sel?.removeAllRanges();
                      sel?.addRange(range);
                      // p 태그가 화면에 보이도록 스크롤
                      p.scrollIntoView({ block: "nearest", behavior: "smooth" });
                    }, 50);
                  } catch { /* cross-origin */ }
                  setPlusButton(prev => ({ ...prev, visible: false, showMenu: false }));
                  plusInsertBeforeModeRef.current = false;
                  scheduleChange();
                }}
                style={{
                  display: "flex", alignItems: "center", gap: 6,
                  padding: "5px 10px", borderRadius: 5, border: "none",
                  background: "rgba(255,255,255,0.08)", color: "#e5e7eb",
                  fontSize: 12, fontWeight: 600, cursor: "pointer", textAlign: "left",
                }}
              >
                ✏️ 텍스트 단락 삽입
              </button>
              {/* 빈 줄(여백) 삽입 */}
              <button
                type="button"
                onClick={() => {
                  pushSnapshot(); // 삽입 직전 스냅샷 저장
                  const iframe = iframeRef.current;
                  if (!iframe) return;
                  try {
                    const doc = iframe.contentDocument || iframe.contentWindow?.document;
                    if (!doc?.body) return;
                    const spacer = doc.createElement("div");
                    spacer.style.cssText = "height:40px;min-height:40px;";
                    spacer.setAttribute("data-spacer", "1");
                    const afterEl = plusAfterElRef.current;
                    if (afterEl && afterEl.parentNode) {
                      if (plusInsertBeforeModeRef.current) {
                        afterEl.parentNode.insertBefore(spacer, afterEl);
                      } else {
                        afterEl.parentNode.insertBefore(spacer, afterEl.nextSibling);
                      }
                    } else {
                      doc.body.appendChild(spacer);
                    }
                    adjustHeight();
                  } catch { /* cross-origin */ }
                  setPlusButton(prev => ({ ...prev, visible: false, showMenu: false }));
                  plusInsertBeforeModeRef.current = false;
                  scheduleChange();
                }}
                style={{
                  display: "flex", alignItems: "center", gap: 6,
                  padding: "5px 10px", borderRadius: 5, border: "none",
                  background: "rgba(255,255,255,0.08)", color: "#e5e7eb",
                  fontSize: 12, fontWeight: 600, cursor: "pointer", textAlign: "left",
                }}
              >
                ↕ 빈 줄(여백) 삽입
              </button>
              {/* 구분선 삽입 */}
              <button
                type="button"
                onClick={() => {
                  pushSnapshot(); // 삽입 직전 스냅샷 저장
                  const iframe = iframeRef.current;
                  if (!iframe) return;
                  try {
                    const doc = iframe.contentDocument || iframe.contentWindow?.document;
                    if (!doc?.body) return;
                    const hr = doc.createElement("hr");
                    hr.style.cssText = "border:none;border-top:2px solid #e5e7eb;margin:16px 0;";
                    const afterEl = plusAfterElRef.current;
                    if (afterEl && afterEl.parentNode) {
                      if (plusInsertBeforeModeRef.current) {
                        afterEl.parentNode.insertBefore(hr, afterEl);
                      } else {
                        afterEl.parentNode.insertBefore(hr, afterEl.nextSibling);
                      }
                    } else {
                      doc.body.appendChild(hr);
                    }
                    adjustHeight();
                  } catch { /* cross-origin */ }
                  setPlusButton(prev => ({ ...prev, visible: false, showMenu: false }));
                  plusInsertBeforeModeRef.current = false;
                  scheduleChange();
                }}
                style={{
                  display: "flex", alignItems: "center", gap: 6,
                  padding: "5px 10px", borderRadius: 5, border: "none",
                  background: "rgba(255,255,255,0.08)", color: "#e5e7eb",
                  fontSize: 12, fontWeight: 600, cursor: "pointer", textAlign: "left",
                }}
              >
                ─ 구분선 삽입
              </button>
              {/* 이미지 삽입 */}
              <button
                type="button"
                onClick={() => {
                  setPlusButton(prev => ({ ...prev, showMenu: false }));
                  setShowImageInsertDialog(true);
                }}
                style={{
                  display: "flex", alignItems: "center", gap: 6,
                  padding: "5px 10px", borderRadius: 5, border: "none",
                  background: "rgba(255,255,255,0.08)", color: "#e5e7eb",
                  fontSize: 12, fontWeight: 600, cursor: "pointer", textAlign: "left",
                }}
              >
                🖼️ 이미지 삽입
              </button>
              {/* 동영상 삽입 */}
              <button
                type="button"
                onClick={() => {
                  setPlusButton(prev => ({ ...prev, showMenu: false }));
                  setShowVideoInsertDialog(true);
                }}
                style={{
                  display: "flex", alignItems: "center", gap: 6,
                  padding: "5px 10px", borderRadius: 5, border: "none",
                  background: "rgba(255,255,255,0.08)", color: "#e5e7eb",
                  fontSize: 12, fontWeight: 600, cursor: "pointer", textAlign: "left",
                }}
              >
                🎬 동영상 삽입
              </button>
              {/* 표 삽입 */}
              <button
                type="button"
                onClick={() => {
                  setPlusButton(prev => ({ ...prev, showMenu: false }));
                  setShowTableDialog(true);
                }}
                style={{
                  display: "flex", alignItems: "center", gap: 6,
                  padding: "5px 10px", borderRadius: 5, border: "none",
                  background: "rgba(255,255,255,0.08)", color: "#e5e7eb",
                  fontSize: 12, fontWeight: 600, cursor: "pointer", textAlign: "left",
                }}
              >
                📊 표 삽입
              </button>
              {/* 인용구 삽입 */}
              <button
                type="button"
                onClick={() => {
                  pushSnapshot();
                  const iframe = iframeRef.current;
                  if (!iframe) return;
                  try {
                    const doc = iframe.contentDocument || iframe.contentWindow?.document;
                    if (!doc?.body) return;
                    const bq = doc.createElement('blockquote');
                    bq.style.cssText = 'border-left:4px solid #6366f1;margin:16px 0;padding:12px 16px;background:rgba(99,102,241,0.08);border-radius:0 8px 8px 0;color:#4b5563;font-style:italic;';
                    bq.innerHTML = '<p style="margin:0;min-height:1.5em;"><br></p>';
                    const afterEl = plusAfterElRef.current;
                    if (afterEl && afterEl.parentNode) {
                      if (plusInsertBeforeModeRef.current) { afterEl.parentNode.insertBefore(bq, afterEl); }
                      else { afterEl.parentNode.insertBefore(bq, afterEl.nextSibling); }
                    } else { doc.body.appendChild(bq); }
                    adjustHeight();
                    setTimeout(() => {
                      iframe.contentWindow?.focus();
                      const p = bq.querySelector('p');
                      if (p) {
                        const range = doc.createRange(); range.setStart(p, 0); range.collapse(true);
                        const sel = doc.defaultView?.getSelection(); sel?.removeAllRanges(); sel?.addRange(range);
                        p.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
                      }
                    }, 50);
                  } catch { /* cross-origin */ }
                  setPlusButton(prev => ({ ...prev, visible: false, showMenu: false }));
                  plusInsertBeforeModeRef.current = false;
                  scheduleChange();
                }}
                style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '5px 10px', borderRadius: 5, border: 'none', background: 'rgba(99,102,241,0.15)', color: '#a5b4fc', fontSize: 12, fontWeight: 600, cursor: 'pointer', textAlign: 'left' }}
              >
                💬 인용구 삽입
              </button>
              {/* 버튼 블록 삽입 */}
              <button
                type="button"
                onClick={() => {
                  pushSnapshot();
                  const iframe = iframeRef.current;
                  if (!iframe) return;
                  try {
                    const doc = iframe.contentDocument || iframe.contentWindow?.document;
                    if (!doc?.body) return;
                    const wrapper = doc.createElement('div');
                    wrapper.style.cssText = 'text-align:center;margin:16px 0;';
                    const btn = doc.createElement('a');
                    btn.href = '#';
                    btn.style.cssText = 'display:inline-block;padding:12px 28px;background:#6366f1;color:#fff;border-radius:8px;font-weight:700;font-size:15px;text-decoration:none;cursor:pointer;';
                    btn.textContent = '버튼 텍스트';
                    wrapper.appendChild(btn);
                    const afterEl = plusAfterElRef.current;
                    if (afterEl && afterEl.parentNode) {
                      if (plusInsertBeforeModeRef.current) { afterEl.parentNode.insertBefore(wrapper, afterEl); }
                      else { afterEl.parentNode.insertBefore(wrapper, afterEl.nextSibling); }
                    } else { doc.body.appendChild(wrapper); }
                    adjustHeight();
                    setTimeout(() => {
                      iframe.contentWindow?.focus();
                      const range = doc.createRange(); range.selectNodeContents(btn); range.collapse(false);
                      const sel = doc.defaultView?.getSelection(); sel?.removeAllRanges(); sel?.addRange(range);
                      btn.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
                    }, 50);
                  } catch { /* cross-origin */ }
                  setPlusButton(prev => ({ ...prev, visible: false, showMenu: false }));
                  plusInsertBeforeModeRef.current = false;
                  scheduleChange();
                }}
                style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '5px 10px', borderRadius: 5, border: 'none', background: 'rgba(99,102,241,0.15)', color: '#a5b4fc', fontSize: 12, fontWeight: 600, cursor: 'pointer', textAlign: 'left' }}
              >
                🔘 버튼 블록 삽입
              </button>
              {/* 구분선 */}
              <div style={{ height: 1, background: 'rgba(255,255,255,0.1)', margin: '2px 0' }} />
              {/* 제목 H2 삽입 */}
              <button
                type="button"
                onClick={() => {
                  pushSnapshot();
                  const iframe = iframeRef.current;
                  if (!iframe) return;
                  try {
                    const doc = iframe.contentDocument || iframe.contentWindow?.document;
                    if (!doc?.body) return;
                    const h2 = doc.createElement('h2');
                    h2.innerHTML = '<br>';
                    const afterEl = plusAfterElRef.current;
                    if (afterEl && afterEl.parentNode) {
                      if (plusInsertBeforeModeRef.current) { afterEl.parentNode.insertBefore(h2, afterEl); }
                      else { afterEl.parentNode.insertBefore(h2, afterEl.nextSibling); }
                    } else { doc.body.appendChild(h2); }
                    adjustHeight();
                    setTimeout(() => {
                      iframe.contentWindow?.focus();
                      const range = doc.createRange(); range.setStart(h2, 0); range.collapse(true);
                      const sel = doc.defaultView?.getSelection(); sel?.removeAllRanges(); sel?.addRange(range);
                      h2.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
                    }, 50);
                  } catch { /* cross-origin */ }
                  setPlusButton(prev => ({ ...prev, visible: false, showMenu: false }));
                  plusInsertBeforeModeRef.current = false;
                  scheduleChange();
                }}
                style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '5px 10px', borderRadius: 5, border: 'none', background: 'rgba(255,255,255,0.08)', color: '#e5e7eb', fontSize: 12, fontWeight: 600, cursor: 'pointer', textAlign: 'left' }}
              >
                H2 소제목 삽입
              </button>
              {/* 제목 H3 삽입 */}
              <button
                type="button"
                onClick={() => {
                  pushSnapshot();
                  const iframe = iframeRef.current;
                  if (!iframe) return;
                  try {
                    const doc = iframe.contentDocument || iframe.contentWindow?.document;
                    if (!doc?.body) return;
                    const h3 = doc.createElement('h3');
                    h3.innerHTML = '<br>';
                    const afterEl = plusAfterElRef.current;
                    if (afterEl && afterEl.parentNode) {
                      if (plusInsertBeforeModeRef.current) { afterEl.parentNode.insertBefore(h3, afterEl); }
                      else { afterEl.parentNode.insertBefore(h3, afterEl.nextSibling); }
                    } else { doc.body.appendChild(h3); }
                    adjustHeight();
                    setTimeout(() => {
                      iframe.contentWindow?.focus();
                      const range = doc.createRange(); range.setStart(h3, 0); range.collapse(true);
                      const sel = doc.defaultView?.getSelection(); sel?.removeAllRanges(); sel?.addRange(range);
                      h3.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
                    }, 50);
                  } catch { /* cross-origin */ }
                  setPlusButton(prev => ({ ...prev, visible: false, showMenu: false }));
                  plusInsertBeforeModeRef.current = false;
                  scheduleChange();
                }}
                style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '5px 10px', borderRadius: 5, border: 'none', background: 'rgba(255,255,255,0.08)', color: '#e5e7eb', fontSize: 12, fontWeight: 600, cursor: 'pointer', textAlign: 'left' }}
              >
                H3 소제목 삽입
              </button>
              {/* 코드 블록 삽입 */}
              <button
                type="button"
                onClick={() => {
                  pushSnapshot();
                  const iframe = iframeRef.current;
                  if (!iframe) return;
                  try {
                    const doc = iframe.contentDocument || iframe.contentWindow?.document;
                    if (!doc?.body) return;
                    const pre = doc.createElement('pre');
                    pre.style.cssText = 'background:#1e1e2e;color:#cdd6f4;padding:16px;border-radius:8px;font-family:monospace;font-size:13px;overflow-x:auto;margin:16px 0;';
                    const code = doc.createElement('code');
                    code.innerHTML = '<br>';
                    pre.appendChild(code);
                    const afterEl = plusAfterElRef.current;
                    if (afterEl && afterEl.parentNode) {
                      if (plusInsertBeforeModeRef.current) { afterEl.parentNode.insertBefore(pre, afterEl); }
                      else { afterEl.parentNode.insertBefore(pre, afterEl.nextSibling); }
                    } else { doc.body.appendChild(pre); }
                    adjustHeight();
                    setTimeout(() => {
                      iframe.contentWindow?.focus();
                      const range = doc.createRange(); range.setStart(code, 0); range.collapse(true);
                      const sel = doc.defaultView?.getSelection(); sel?.removeAllRanges(); sel?.addRange(range);
                      pre.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
                    }, 50);
                  } catch { /* cross-origin */ }
                  setPlusButton(prev => ({ ...prev, visible: false, showMenu: false }));
                  plusInsertBeforeModeRef.current = false;
                  scheduleChange();
                }}
                style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '5px 10px', borderRadius: 5, border: 'none', background: 'rgba(255,255,255,0.08)', color: '#e5e7eb', fontSize: 12, fontWeight: 600, cursor: 'pointer', textAlign: 'left' }}
              >
                💻 코드 블록 삽입
              </button>
              {/* 구분선 */}
              <div style={{ height: 1, background: 'rgba(255,255,255,0.1)', margin: '2px 0' }} />
              {/* 정보 박스 삽입 */}
              <button
                type="button"
                onClick={() => {
                  pushSnapshot();
                  const iframe = iframeRef.current;
                  if (!iframe) return;
                  try {
                    const doc = iframe.contentDocument || iframe.contentWindow?.document;
                    if (!doc?.body) return;
                    const box = doc.createElement('div');
                    box.style.cssText = 'background:#eff6ff;border:1px solid #bfdbfe;border-left:4px solid #3b82f6;border-radius:8px;padding:12px 16px;margin:16px 0;';
                    box.innerHTML = '<p style="margin:0;color:#1e40af;font-weight:600;margin-bottom:4px;">💡 정보</p><p style="margin:0;color:#1d4ed8;min-height:1.5em;"><br></p>';
                    const afterEl = plusAfterElRef.current;
                    if (afterEl && afterEl.parentNode) {
                      if (plusInsertBeforeModeRef.current) { afterEl.parentNode.insertBefore(box, afterEl); }
                      else { afterEl.parentNode.insertBefore(box, afterEl.nextSibling); }
                    } else { doc.body.appendChild(box); }
                    adjustHeight();
                    setTimeout(() => {
                      iframe.contentWindow?.focus();
                      const p = box.querySelectorAll('p')[1];
                      if (p) {
                        const range = doc.createRange(); range.setStart(p, 0); range.collapse(true);
                        const sel = doc.defaultView?.getSelection(); sel?.removeAllRanges(); sel?.addRange(range);
                        p.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
                      }
                    }, 50);
                  } catch { /* cross-origin */ }
                  setPlusButton(prev => ({ ...prev, visible: false, showMenu: false }));
                  plusInsertBeforeModeRef.current = false;
                  scheduleChange();
                }}
                style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '5px 10px', borderRadius: 5, border: 'none', background: 'rgba(59,130,246,0.15)', color: '#93c5fd', fontSize: 12, fontWeight: 600, cursor: 'pointer', textAlign: 'left' }}
              >
                💡 정보 박스 삽입
              </button>
              {/* 경고 박스 삽입 */}
              <button
                type="button"
                onClick={() => {
                  pushSnapshot();
                  const iframe = iframeRef.current;
                  if (!iframe) return;
                  try {
                    const doc = iframe.contentDocument || iframe.contentWindow?.document;
                    if (!doc?.body) return;
                    const box = doc.createElement('div');
                    box.style.cssText = 'background:#fff7ed;border:1px solid #fed7aa;border-left:4px solid #f97316;border-radius:8px;padding:12px 16px;margin:16px 0;';
                    box.innerHTML = '<p style="margin:0;color:#c2410c;font-weight:600;margin-bottom:4px;">⚠️ 주의</p><p style="margin:0;color:#ea580c;min-height:1.5em;"><br></p>';
                    const afterEl = plusAfterElRef.current;
                    if (afterEl && afterEl.parentNode) {
                      if (plusInsertBeforeModeRef.current) { afterEl.parentNode.insertBefore(box, afterEl); }
                      else { afterEl.parentNode.insertBefore(box, afterEl.nextSibling); }
                    } else { doc.body.appendChild(box); }
                    adjustHeight();
                    setTimeout(() => {
                      iframe.contentWindow?.focus();
                      const p = box.querySelectorAll('p')[1];
                      if (p) {
                        const range = doc.createRange(); range.setStart(p, 0); range.collapse(true);
                        const sel = doc.defaultView?.getSelection(); sel?.removeAllRanges(); sel?.addRange(range);
                        p.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
                      }
                    }, 50);
                  } catch { /* cross-origin */ }
                  setPlusButton(prev => ({ ...prev, visible: false, showMenu: false }));
                  plusInsertBeforeModeRef.current = false;
                  scheduleChange();
                }}
                style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '5px 10px', borderRadius: 5, border: 'none', background: 'rgba(249,115,22,0.15)', color: '#fdba74', fontSize: 12, fontWeight: 600, cursor: 'pointer', textAlign: 'left' }}
              >
                ⚠️ 경고 박스 삽입
              </button>
              {/* 구분선 */}
              <div style={{ height: 1, background: "rgba(255,255,255,0.1)", margin: "2px 0" }} />
              {/* 가운데 정렬 블록 삽입 */}
              <button
                type="button"
                onClick={() => {
                  pushSnapshot(); // 삽입 직전 스냅샷 저장
                  const iframe = iframeRef.current;
                  if (!iframe) return;
                  try {
                    const doc = iframe.contentDocument || iframe.contentWindow?.document;
                    if (!doc?.body) return;
                    const div = doc.createElement("div");
                    div.style.cssText = "text-align:center;min-height:1.5em;padding:4px 0;";
                    div.innerHTML = "<br>";
                    const afterEl = plusAfterElRef.current;
                    if (afterEl && afterEl.parentNode) {
                      if (plusInsertBeforeModeRef.current) {
                        afterEl.parentNode.insertBefore(div, afterEl);
                      } else {
                        afterEl.parentNode.insertBefore(div, afterEl.nextSibling);
                      }
                    } else {
                      doc.body.appendChild(div);
                    }
                    adjustHeight();
                    setTimeout(() => {
                      const range = doc.createRange();
                      range.setStart(div, 0);
                      range.collapse(true);
                      const sel = doc.defaultView?.getSelection();
                      sel?.removeAllRanges();
                      sel?.addRange(range);
                    }, 0);
                  } catch { /* cross-origin */ }
                  setPlusButton(prev => ({ ...prev, visible: false, showMenu: false }));
                  plusInsertBeforeModeRef.current = false;
                  scheduleChange();
                }}
                style={{
                  display: "flex", alignItems: "center", gap: 6,
                  padding: "5px 10px", borderRadius: 5, border: "none",
                  background: "rgba(255,255,255,0.08)", color: "#e5e7eb",
                  fontSize: 12, fontWeight: 600, cursor: "pointer", textAlign: "left",
                }}
              >
                ↔ 가운데 정렬 단락
              </button>
              {/* 구분선 */}
              <div style={{ height: 1, background: "rgba(255,255,255,0.1)", margin: "2px 0" }} />
              {/* 애드센스 광고 삽입 */}
              <button
                type="button"
                onClick={() => {
                  const iframe = iframeRef.current;
                  if (!iframe) return;
                  const code = adsenseSlotCode;
                  if (!code) {
                    alert('관리자 > 광고 설정 탭에서 애드센스 슬롯 코드를 먼저 저장해주세요.');
                    return;
                  }
                  pushSnapshot(); // 삽입 직전 스냅샷 저장
                  try {
                    const doc = iframe.contentDocument || iframe.contentWindow?.document;
                    if (!doc?.body) return;
                    const wrapper = doc.createElement("div");
                    wrapper.setAttribute("data-ad-type", "adsense");
                    wrapper.style.cssText = "margin:16px 0;text-align:center;";
                    wrapper.innerHTML = code;
                    const afterEl = plusAfterElRef.current;
                    if (afterEl && afterEl.parentNode) {
                      if (plusInsertBeforeModeRef.current) {
                        afterEl.parentNode.insertBefore(wrapper, afterEl);
                      } else {
                        afterEl.parentNode.insertBefore(wrapper, afterEl.nextSibling);
                      }
                    } else {
                      doc.body.appendChild(wrapper);
                    }
                    adjustHeight();
                  } catch { /* cross-origin */ }
                  setPlusButton(prev => ({ ...prev, visible: false, showMenu: false }));
                  plusInsertBeforeModeRef.current = false;
                  scheduleChange();
                }}
                style={{
                  display: "flex", alignItems: "center", gap: 6,
                  padding: "5px 10px", borderRadius: 5, border: "none",
                  background: "rgba(66,133,244,0.15)", color: "#93c5fd",
                  fontSize: 12, fontWeight: 600, cursor: "pointer", textAlign: "left",
                }}
              >
                📢 애드센스 광고 삽입
              </button>
              {/* 쿠팡 파트너스 삽입 */}
              <button
                type="button"
                onClick={() => {
                  const iframe = iframeRef.current;
                  if (!iframe) return;
                  const code = coupangWidgetCode;
                  if (!code) {
                    alert('관리자 > 제휴 마케팅 탭에서 쿠팡 파트너스를 활성화하고 API 키를 저장해주세요.');
                    return;
                  }
                  pushSnapshot(); // 삽입 직전 스냅샷 저장
                  try {
                    const doc = iframe.contentDocument || iframe.contentWindow?.document;
                    if (!doc?.body) return;
                    const wrapper = doc.createElement("div");
                    wrapper.setAttribute("data-ad-type", "coupang");
                    wrapper.style.cssText = "margin:16px 0;text-align:center;";
                    wrapper.innerHTML = code;
                    const afterEl = plusAfterElRef.current;
                    if (afterEl && afterEl.parentNode) {
                      if (plusInsertBeforeModeRef.current) {
                        afterEl.parentNode.insertBefore(wrapper, afterEl);
                      } else {
                        afterEl.parentNode.insertBefore(wrapper, afterEl.nextSibling);
                      }
                    } else {
                      doc.body.appendChild(wrapper);
                    }
                    adjustHeight();
                  } catch { /* cross-origin */ }
                  setPlusButton(prev => ({ ...prev, visible: false, showMenu: false }));
                  plusInsertBeforeModeRef.current = false;
                  scheduleChange();
                }}
                style={{
                  display: "flex", alignItems: "center", gap: 6,
                  padding: "5px 10px", borderRadius: 5, border: "none",
                  background: "rgba(249,115,22,0.15)", color: "#fdba74",
                  fontSize: 12, fontWeight: 600, cursor: "pointer", textAlign: "left",
                }}
              >
                🛒 쿠팡 파트너스 삽입
              </button>
              {/* 쇼핑 커넥트 삽입 */}
              <button
                type="button"
                onClick={() => {
                  const iframe = iframeRef.current;
                  if (!iframe) return;
                  const code = shopConnectWidgetCode;
                  if (!code) {
                    alert('관리자 > 제휴 마케팅 탭에서 쇼핑 커넥트 위젯 코드를 먼저 저장해주세요.');
                    return;
                  }
                  pushSnapshot(); // 삽입 직전 스냅샷 저장
                  try {
                    const doc = iframe.contentDocument || iframe.contentWindow?.document;
                    if (!doc?.body) return;
                    const wrapper = doc.createElement("div");
                    wrapper.setAttribute("data-ad-type", "shop-connect");
                    wrapper.style.cssText = "margin:16px 0;";
                    wrapper.innerHTML = code;
                    const afterEl = plusAfterElRef.current;
                    if (afterEl && afterEl.parentNode) {
                      if (plusInsertBeforeModeRef.current) {
                        afterEl.parentNode.insertBefore(wrapper, afterEl);
                      } else {
                        afterEl.parentNode.insertBefore(wrapper, afterEl.nextSibling);
                      }
                    } else {
                      doc.body.appendChild(wrapper);
                    }
                    adjustHeight();
                  } catch { /* cross-origin */ }
                  setPlusButton(prev => ({ ...prev, visible: false, showMenu: false }));
                  plusInsertBeforeModeRef.current = false;
                  scheduleChange();
                }}
                style={{
                  display: "flex", alignItems: "center", gap: 6,
                  padding: "5px 10px", borderRadius: 5, border: "none",
                  background: "rgba(34,197,94,0.15)", color: "#86efac",
                  fontSize: 12, fontWeight: 600, cursor: "pointer", textAlign: "left",
                }}
              >
                🛍️ 쇼핑 커넥트 삽입
              </button>
              {/* 파일 다운로드 버튼 삽입 */}
              {onRequestFileInsert && (
                <>
                  <div style={{ height: 1, background: "rgba(255,255,255,0.1)", margin: "2px 0" }} />
                  <button
                    type="button"
                    onClick={() => {
                      const afterEl = plusButton.afterEl;
                      // 클릭 시점에 insertBeforeMode를 클로저로 캐처 (팝업이 열린 사이 ref가 변경되는 것 방지)
                      const insertBeforeMode = plusButton.insertBeforeMode ?? false;
                      setPlusButton(prev => ({ ...prev, visible: false, showMenu: false }));
                      const insertHtml = (html: string) => {
                        pushSnapshot(); // 삽입 직전 스냅샷 저장
                        const iframe = iframeRef.current;
                        if (!iframe) return;
                        try {
                          const doc = iframe.contentDocument || iframe.contentWindow?.document;
                          if (!doc?.body) return;
                          const wrapper = doc.createElement('div');
                          wrapper.innerHTML = html;
                          const el = wrapper.firstElementChild || wrapper;
                          if (afterEl && afterEl.parentNode) {
                            if (insertBeforeMode) {
                              afterEl.parentNode.insertBefore(el, afterEl);
                            } else {
                              afterEl.parentNode.insertBefore(el, afterEl.nextSibling);
                            }
                          } else {
                            doc.body.appendChild(el);
                          }
                          adjustHeight();
                          scheduleChange();
                        } catch { /* cross-origin */ }
                      };
                      onRequestFileInsert?.(afterEl, insertHtml);
                    }}
                    style={{
                      display: "flex", alignItems: "center", gap: 6,
                      padding: "5px 10px", borderRadius: 5, border: "none",
                      background: "rgba(37,99,235,0.2)", color: "#93c5fd",
                      fontSize: 12, fontWeight: 600, cursor: "pointer", textAlign: "left",
                    }}
                  >
                    📎 파일 다운로드 버튼 삽입
                  </button>
                </>
              )}
              {/* 닫기 */}
              <button
                type="button"
                onClick={() => {
                  plusClosedRef.current = true;
                  plusClickCountRef.current = 0;
                  setPlusButton(prev => ({ ...prev, visible: false, showMenu: false }));
                }}
                style={{
                  display: "flex", alignItems: "center", justifyContent: "center",
                  gap: 4, padding: "5px 10px", borderRadius: 5, border: "none",
                  background: "#dc2626", color: "#fff",
                  fontSize: 11, fontWeight: 700, cursor: "pointer",
                  boxShadow: "0 1px 4px rgba(220,38,38,0.4)",
                }}
              >
                <X size={11} /> 닫기
              </button>
            </div>
          )}
        </div>,
        document.body
      )}

      {blockOverlay.visible && createPortal(
        <div
          style={{
            position: "absolute",
            // 블록 우측 상단 모서리에 격쳐 배치
            left: blockOverlay.x + blockOverlay.width - 190,
            top: blockOverlay.y - 14,
            transform: "translate(0, 0)",
            zIndex: 9998,
            padding: "4px",
            display: "flex",
            gap: 4,
          }}
          onMouseEnter={() => {
            if (blockHideTimerRef.current) { clearTimeout(blockHideTimerRef.current); blockHideTimerRef.current = null; }
            setBlockOverlay(prev => ({ ...prev, visible: true }));
          }}
          onMouseLeave={() => {
            if (!selectedBlockRef.current) {
              blockHideTimerRef.current = setTimeout(() => {
                setBlockOverlay(prev => ({ ...prev, visible: false }));
              }, 150);
            }
          }}
        >
          {/* 위로 이동 버튼 */}
          <button
            type="button"
            title="블록 위로 이동"
            onMouseDown={(e) => { e.preventDefault(); e.stopPropagation(); }}
            onClick={(e) => { e.preventDefault(); e.stopPropagation(); handleMoveBlockUp(); }}
            style={{
              display: "flex", alignItems: "center", justifyContent: "center",
              width: 28, height: 26, borderRadius: 5,
              background: "#6366f1", border: "none",
              color: "#fff", fontSize: 14, fontWeight: 700,
              cursor: "pointer",
              boxShadow: "0 2px 8px rgba(0,0,0,0.2)",
            }}
          >
            ↑
          </button>
          {/* 아래로 이동 버튼 */}
          <button
            type="button"
            title="블록 아래로 이동"
            onMouseDown={(e) => { e.preventDefault(); e.stopPropagation(); }}
            onClick={(e) => { e.preventDefault(); e.stopPropagation(); handleMoveBlockDown(); }}
            style={{
              display: "flex", alignItems: "center", justifyContent: "center",
              width: 28, height: 26, borderRadius: 5,
              background: "#6366f1", border: "none",
              color: "#fff", fontSize: 14, fontWeight: 700,
              cursor: "pointer",
              boxShadow: "0 2px 8px rgba(0,0,0,0.2)",
            }}
          >
            ↓
          </button>
          {/* 삭제 버튼 */}
          <button
            type="button"
            title="블록 삭제 (Delete 키)"
            onMouseDown={(e) => { e.preventDefault(); e.stopPropagation(); }}
            onClick={(e) => { e.preventDefault(); e.stopPropagation(); handleDeleteBlock(); }}
            style={{
              display: "flex", alignItems: "center", gap: 4,
              padding: "4px 10px", borderRadius: 5,
              background: "#ef4444", border: "none",
              color: "#fff", fontSize: 11, fontWeight: 700,
              cursor: "pointer",
              boxShadow: "0 2px 8px rgba(0,0,0,0.2)",
            }}
          >
            <Trash2 size={11} />
            삭제
          </button>
        </div>,
        containerRef.current || document.body
      )}

      {/* ─── 고정 삽입 패널 (본문 영역 외부에 포털로 배치) ─── */}
      {plusButton.showMenu && createPortal(
        <div
          style={{
            position: "fixed",
            left: insertPanelRect.left,
            top: insertPanelRect.top,
            width: insertPanelRect.width,
            background: "#1e1b4b",
            border: "2px solid #6366f1",
            borderRadius: 12,
            padding: "6px 6px 8px",
            display: "flex",
            flexDirection: "column",
            gap: 0,
            zIndex: 99998,
            boxShadow: "0 8px 28px rgba(15,23,42,0.55)",
          }}
          onMouseEnter={() => {
            panelHoverRef.current = true;
            // 타이머 취소 - 패널 위에 있으면 숨기지 않음
            if (plusHideTimerRef.current) clearTimeout(plusHideTimerRef.current);
          }}
          onMouseLeave={() => {
            panelHoverRef.current = false;
          }}
        >
          {/* 패널 헤더 - 삽입 위치 표시 + 닫기 */}
          <div style={{
            display: "flex", alignItems: "center", justifyContent: "space-between",
            marginBottom: 6, paddingBottom: 5,
            borderBottom: "1px solid rgba(99,102,241,0.3)",
            gap: 4,
          }}>
            <span style={{ fontSize: 9, fontWeight: 700, color: "#a5b4fc", lineHeight: 1.2, textAlign: "center", flex: 1, whiteSpace: "nowrap" }}>
              {plusButton.insertBeforeMode ? "앞에 삽입" : "뒤에 삽입"}
            </span>
            <button
              type="button"
              onClick={() => {
                plusClosedRef.current = true;
                plusClickCountRef.current = 0;
                setPlusButton(prev => ({ ...prev, visible: false, showMenu: false }));
              }}
              style={{
                background: "rgba(220,38,38,0.2)", border: "1px solid rgba(220,38,38,0.4)",
                borderRadius: 4, color: "#fca5a5", fontSize: 10, fontWeight: 700,
                cursor: "pointer", padding: "2px 5px",
                display: "flex", alignItems: "center", justifyContent: "center",
                minWidth: 22, minHeight: 20,
              }}
              title="닫기"
            >
              <X size={9} />
            </button>
          </div>

          {/* 삽입 버튼 세로 목록 */}
          <div style={{ display: "flex", flexDirection: "column", gap: 4, overflowY: "auto", maxHeight: "calc(100vh - 180px)" }}>
            {/* 텍스트 단락 삽입 */}
            <button
              type="button"
              onClick={() => {
                pushSnapshot();
                const iframe = iframeRef.current;
                if (!iframe) return;
                try {
                  const doc = iframe.contentDocument || iframe.contentWindow?.document;
                  if (!doc?.body) return;
                  const p = doc.createElement("p");
                  p.innerHTML = "<br>";
                  p.style.cssText = "min-height:1.5em;padding:4px 0;";
                  const afterEl = plusAfterElRef.current;
                  if (afterEl && afterEl.parentNode) {
                    if (plusInsertBeforeModeRef.current) {
                      afterEl.parentNode.insertBefore(p, afterEl);
                    } else {
                      afterEl.parentNode.insertBefore(p, afterEl.nextSibling);
                    }
                  } else {
                    doc.body.appendChild(p);
                  }
                  adjustHeight();
                  setTimeout(() => {
                    iframe.contentWindow?.focus();
                    const range = doc.createRange();
                    range.setStart(p, 0);
                    range.collapse(true);
                    const sel = doc.defaultView?.getSelection();
                    sel?.removeAllRanges();
                    sel?.addRange(range);
                    p.scrollIntoView({ block: "nearest", behavior: "smooth" });
                  }, 50);
                } catch { /* cross-origin */ }
                setPlusButton(prev => ({ ...prev, visible: false, showMenu: false }));
                plusInsertBeforeModeRef.current = false;
                scheduleChange();
              }}
              style={{
                display: "flex", flexDirection: "row", alignItems: "center", gap: 6,
                padding: "7px 8px", borderRadius: 7,
                border: "1px solid rgba(99,102,241,0.3)",
                background: "rgba(99,102,241,0.1)", color: "#c7d2fe",
                fontSize: 11, fontWeight: 600, cursor: "pointer",
                transition: "all 0.15s",
                whiteSpace: "nowrap", width: "100%",
              }}
              onMouseEnter={e => { (e.currentTarget as HTMLButtonElement).style.background = "rgba(99,102,241,0.25)"; (e.currentTarget as HTMLButtonElement).style.borderColor = "#6366f1"; }}
              onMouseLeave={e => { (e.currentTarget as HTMLButtonElement).style.background = "rgba(99,102,241,0.1)"; (e.currentTarget as HTMLButtonElement).style.borderColor = "rgba(99,102,241,0.3)"; }}
            >
              <span style={{ fontSize: 16 }}>✏️</span>
              <span>텍스트 단락</span>
            </button>

            {/* 빈 줄(여백) 삽입 */}
            <button
              type="button"
              onClick={() => {
                pushSnapshot();
                const iframe = iframeRef.current;
                if (!iframe) return;
                try {
                  const doc = iframe.contentDocument || iframe.contentWindow?.document;
                  if (!doc?.body) return;
                  const spacer = doc.createElement("div");
                  spacer.style.cssText = "height:40px;min-height:40px;";
                  spacer.setAttribute("data-spacer", "1");
                  const afterEl = plusAfterElRef.current;
                  if (afterEl && afterEl.parentNode) {
                    if (plusInsertBeforeModeRef.current) {
                      afterEl.parentNode.insertBefore(spacer, afterEl);
                    } else {
                      afterEl.parentNode.insertBefore(spacer, afterEl.nextSibling);
                    }
                  } else {
                    doc.body.appendChild(spacer);
                  }
                  adjustHeight();
                } catch { /* cross-origin */ }
                setPlusButton(prev => ({ ...prev, visible: false, showMenu: false }));
                plusInsertBeforeModeRef.current = false;
                scheduleChange();
              }}
              style={{
                display: "flex", flexDirection: "row", alignItems: "center", gap: 6,
                padding: "7px 8px", borderRadius: 7,
                border: "1px solid rgba(99,102,241,0.3)",
                background: "rgba(99,102,241,0.1)", color: "#c7d2fe",
                fontSize: 11, fontWeight: 600, cursor: "pointer",
                transition: "all 0.15s",
                whiteSpace: "nowrap", width: "100%",
              }}
              onMouseEnter={e => { (e.currentTarget as HTMLButtonElement).style.background = "rgba(99,102,241,0.25)"; (e.currentTarget as HTMLButtonElement).style.borderColor = "#6366f1"; }}
              onMouseLeave={e => { (e.currentTarget as HTMLButtonElement).style.background = "rgba(99,102,241,0.1)"; (e.currentTarget as HTMLButtonElement).style.borderColor = "rgba(99,102,241,0.3)"; }}
            >
              <span style={{ fontSize: 16 }}>↕</span>
              <span>빈 줄(여백)</span>
            </button>

            {/* 구분선 삽입 */}
            <button
              type="button"
              onClick={() => {
                pushSnapshot();
                const iframe = iframeRef.current;
                if (!iframe) return;
                try {
                  const doc = iframe.contentDocument || iframe.contentWindow?.document;
                  if (!doc?.body) return;
                  const hr = doc.createElement("hr");
                  hr.style.cssText = "border:none;border-top:2px solid #e5e7eb;margin:16px 0;";
                  const afterEl = plusAfterElRef.current;
                  if (afterEl && afterEl.parentNode) {
                    if (plusInsertBeforeModeRef.current) {
                      afterEl.parentNode.insertBefore(hr, afterEl);
                    } else {
                      afterEl.parentNode.insertBefore(hr, afterEl.nextSibling);
                    }
                  } else {
                    doc.body.appendChild(hr);
                  }
                  adjustHeight();
                } catch { /* cross-origin */ }
                setPlusButton(prev => ({ ...prev, visible: false, showMenu: false }));
                plusInsertBeforeModeRef.current = false;
                scheduleChange();
              }}
              style={{
                display: "flex", flexDirection: "row", alignItems: "center", gap: 6,
                padding: "7px 8px", borderRadius: 7,
                border: "1px solid rgba(99,102,241,0.3)",
                background: "rgba(99,102,241,0.1)", color: "#c7d2fe",
                fontSize: 11, fontWeight: 600, cursor: "pointer",
                transition: "all 0.15s",
                whiteSpace: "nowrap", width: "100%",
              }}
              onMouseEnter={e => { (e.currentTarget as HTMLButtonElement).style.background = "rgba(99,102,241,0.25)"; (e.currentTarget as HTMLButtonElement).style.borderColor = "#6366f1"; }}
              onMouseLeave={e => { (e.currentTarget as HTMLButtonElement).style.background = "rgba(99,102,241,0.1)"; (e.currentTarget as HTMLButtonElement).style.borderColor = "rgba(99,102,241,0.3)"; }}
            >
              <span style={{ fontSize: 16 }}>—</span>
              <span>구분선</span>
            </button>

            {/* 이미지 삽입 */}
            <button
              type="button"
              onClick={() => {
                setPlusButton(prev => ({ ...prev, showMenu: false }));
                setShowImageInsertDialog(true);
              }}
              style={{
                display: "flex", flexDirection: "row", alignItems: "center", gap: 6,
                padding: "7px 8px", borderRadius: 7,
                border: "1px solid rgba(14,165,233,0.3)",
                background: "rgba(14,165,233,0.1)", color: "#7dd3fc",
                fontSize: 11, fontWeight: 600, cursor: "pointer",
                transition: "all 0.15s",
                whiteSpace: "nowrap", width: "100%",
              }}
              onMouseEnter={e => { (e.currentTarget as HTMLButtonElement).style.background = "rgba(14,165,233,0.25)"; (e.currentTarget as HTMLButtonElement).style.borderColor = "#0ea5e9"; }}
              onMouseLeave={e => { (e.currentTarget as HTMLButtonElement).style.background = "rgba(14,165,233,0.1)"; (e.currentTarget as HTMLButtonElement).style.borderColor = "rgba(14,165,233,0.3)"; }}
            >
              <span style={{ fontSize: 16 }}>🖼️</span>
              <span>이미지</span>
            </button>

            {/* 동영상 삽입 */}
            <button
              type="button"
              onClick={() => {
                setPlusButton(prev => ({ ...prev, showMenu: false }));
                setShowVideoInsertDialog(true);
              }}
              style={{
                display: "flex", flexDirection: "row", alignItems: "center", gap: 6,
                padding: "7px 8px", borderRadius: 7,
                border: "1px solid rgba(168,85,247,0.3)",
                background: "rgba(168,85,247,0.1)", color: "#d8b4fe",
                fontSize: 11, fontWeight: 600, cursor: "pointer",
                transition: "all 0.15s",
                whiteSpace: "nowrap", width: "100%",
              }}
              onMouseEnter={e => { (e.currentTarget as HTMLButtonElement).style.background = "rgba(168,85,247,0.25)"; (e.currentTarget as HTMLButtonElement).style.borderColor = "#a855f7"; }}
              onMouseLeave={e => { (e.currentTarget as HTMLButtonElement).style.background = "rgba(168,85,247,0.1)"; (e.currentTarget as HTMLButtonElement).style.borderColor = "rgba(168,85,247,0.3)"; }}
            >
              <span style={{ fontSize: 16 }}>🎥</span>
              <span>동영상</span>
            </button>

            {/* 표 삽입 */}
            <button
              type="button"
              onClick={() => {
                setPlusButton(prev => ({ ...prev, showMenu: false }));
                setShowTableDialog(true);
              }}
              style={{
                display: "flex", flexDirection: "row", alignItems: "center", gap: 6,
                padding: "7px 8px", borderRadius: 7,
                border: "1px solid rgba(234,179,8,0.3)",
                background: "rgba(234,179,8,0.1)", color: "#fde047",
                fontSize: 11, fontWeight: 600, cursor: "pointer",
                transition: "all 0.15s",
                whiteSpace: "nowrap", width: "100%",
              }}
              onMouseEnter={e => { (e.currentTarget as HTMLButtonElement).style.background = "rgba(234,179,8,0.25)"; (e.currentTarget as HTMLButtonElement).style.borderColor = "#eab308"; }}
              onMouseLeave={e => { (e.currentTarget as HTMLButtonElement).style.background = "rgba(234,179,8,0.1)"; (e.currentTarget as HTMLButtonElement).style.borderColor = "rgba(234,179,8,0.3)"; }}
            >
              <span style={{ fontSize: 16 }}>📊</span>
              <span>표</span>
            </button>

            {/* 인용구 삽입 */}
            <button
              type="button"
              onClick={() => {
                pushSnapshot();
                const iframe = iframeRef.current;
                if (!iframe) return;
                try {
                  const doc = iframe.contentDocument || iframe.contentWindow?.document;
                  if (!doc?.body) return;
                  const bq = doc.createElement('blockquote');
                  bq.style.cssText = 'border-left:4px solid #6366f1;margin:16px 0;padding:12px 16px;background:rgba(99,102,241,0.08);border-radius:0 8px 8px 0;color:#4b5563;font-style:italic;';
                  bq.innerHTML = '<p style="margin:0;min-height:1.5em;"><br></p>';
                  const afterEl = plusAfterElRef.current;
                  if (afterEl && afterEl.parentNode) {
                    if (plusInsertBeforeModeRef.current) { afterEl.parentNode.insertBefore(bq, afterEl); }
                    else { afterEl.parentNode.insertBefore(bq, afterEl.nextSibling); }
                  } else { doc.body.appendChild(bq); }
                  adjustHeight();
                  setTimeout(() => {
                    iframe.contentWindow?.focus();
                    const p = bq.querySelector('p');
                    if (p) {
                      // contenteditable 즉시 활성화
                      p.contentEditable = 'true';
                      p.style.cursor = 'text';
                      p.focus();
                      const range = doc.createRange(); range.setStart(p, 0); range.collapse(true);
                      const sel = doc.defaultView?.getSelection(); sel?.removeAllRanges(); sel?.addRange(range);
                      p.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
                    }
                  }, 50);
                } catch { /* cross-origin */ }
                setPlusButton(prev => ({ ...prev, visible: false, showMenu: false }));
                plusInsertBeforeModeRef.current = false;
                scheduleChange();
              }}
              style={{ display: 'flex', flexDirection: 'row', alignItems: 'center', gap: 6, padding: '7px 8px', borderRadius: 7, border: '1px solid rgba(99,102,241,0.3)', background: 'rgba(99,102,241,0.1)', color: '#c7d2fe', fontSize: 11, fontWeight: 600, cursor: 'pointer', transition: 'all 0.15s', whiteSpace: 'nowrap', width: '100%' }}
              onMouseEnter={e => { (e.currentTarget as HTMLButtonElement).style.background = 'rgba(99,102,241,0.25)'; (e.currentTarget as HTMLButtonElement).style.borderColor = '#6366f1'; }}
              onMouseLeave={e => { (e.currentTarget as HTMLButtonElement).style.background = 'rgba(99,102,241,0.1)'; (e.currentTarget as HTMLButtonElement).style.borderColor = 'rgba(99,102,241,0.3)'; }}
            >
              <span style={{ fontSize: 16 }}>💬</span>
              <span>인용구</span>
            </button>

            {/* 버튼 블록 삽입 */}
            <button
              type="button"
              onClick={() => {
                pushSnapshot();
                const iframe = iframeRef.current;
                if (!iframe) return;
                try {
                  const doc = iframe.contentDocument || iframe.contentWindow?.document;
                  if (!doc?.body) return;
                  const wrapper = doc.createElement('div');
                  wrapper.style.cssText = 'text-align:center;margin:16px 0;';
                  const btn = doc.createElement('a');
                  btn.href = '#';
                  btn.style.cssText = 'display:inline-block;padding:12px 28px;background:#6366f1;color:#fff;border-radius:8px;font-weight:700;font-size:15px;text-decoration:none;cursor:pointer;';
                  btn.textContent = '버튼 텍스트';
                  wrapper.appendChild(btn);
                  const afterEl = plusAfterElRef.current;
                  if (afterEl && afterEl.parentNode) {
                    if (plusInsertBeforeModeRef.current) { afterEl.parentNode.insertBefore(wrapper, afterEl); }
                    else { afterEl.parentNode.insertBefore(wrapper, afterEl.nextSibling); }
                  } else { doc.body.appendChild(wrapper); }
                  adjustHeight();
                  setTimeout(() => {
                    iframe.contentWindow?.focus();
                    // contenteditable 즉시 활성화
                    btn.contentEditable = 'true';
                    btn.style.cursor = 'text';
                    btn.focus();
                    const range = doc.createRange(); range.selectNodeContents(btn); range.collapse(false);
                    const sel = doc.defaultView?.getSelection(); sel?.removeAllRanges(); sel?.addRange(range);
                    btn.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
                  }, 50);
                } catch { /* cross-origin */ }
                setPlusButton(prev => ({ ...prev, visible: false, showMenu: false }));
                plusInsertBeforeModeRef.current = false;
                scheduleChange();
              }}
              style={{ display: 'flex', flexDirection: 'row', alignItems: 'center', gap: 6, padding: '7px 8px', borderRadius: 7, border: '1px solid rgba(99,102,241,0.3)', background: 'rgba(99,102,241,0.1)', color: '#c7d2fe', fontSize: 11, fontWeight: 600, cursor: 'pointer', transition: 'all 0.15s', whiteSpace: 'nowrap', width: '100%' }}
              onMouseEnter={e => { (e.currentTarget as HTMLButtonElement).style.background = 'rgba(99,102,241,0.25)'; (e.currentTarget as HTMLButtonElement).style.borderColor = '#6366f1'; }}
              onMouseLeave={e => { (e.currentTarget as HTMLButtonElement).style.background = 'rgba(99,102,241,0.1)'; (e.currentTarget as HTMLButtonElement).style.borderColor = 'rgba(99,102,241,0.3)'; }}
            >
              <span style={{ fontSize: 16 }}>🔘</span>
              <span>버튼 블록</span>
            </button>

            {/* H2 소제목 삽입 */}
            <button
              type="button"
              onClick={() => {
                pushSnapshot();
                const iframe = iframeRef.current;
                if (!iframe) return;
                try {
                  const doc = iframe.contentDocument || iframe.contentWindow?.document;
                  if (!doc?.body) return;
                  const h2 = doc.createElement('h2');
                  h2.innerHTML = '<br>';
                  const afterEl = plusAfterElRef.current;
                  if (afterEl && afterEl.parentNode) {
                    if (plusInsertBeforeModeRef.current) { afterEl.parentNode.insertBefore(h2, afterEl); }
                    else { afterEl.parentNode.insertBefore(h2, afterEl.nextSibling); }
                  } else { doc.body.appendChild(h2); }
                  adjustHeight();
                  setTimeout(() => {
                    iframe.contentWindow?.focus();
                    const range = doc.createRange(); range.setStart(h2, 0); range.collapse(true);
                    const sel = doc.defaultView?.getSelection(); sel?.removeAllRanges(); sel?.addRange(range);
                    h2.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
                  }, 50);
                } catch { /* cross-origin */ }
                setPlusButton(prev => ({ ...prev, visible: false, showMenu: false }));
                plusInsertBeforeModeRef.current = false;
                scheduleChange();
              }}
              style={{ display: 'flex', flexDirection: 'row', alignItems: 'center', gap: 6, padding: '7px 8px', borderRadius: 7, border: '1px solid rgba(255,255,255,0.15)', background: 'rgba(255,255,255,0.07)', color: '#e5e7eb', fontSize: 11, fontWeight: 600, cursor: 'pointer', transition: 'all 0.15s', whiteSpace: 'nowrap', width: '100%' }}
              onMouseEnter={e => { (e.currentTarget as HTMLButtonElement).style.background = 'rgba(255,255,255,0.15)'; }}
              onMouseLeave={e => { (e.currentTarget as HTMLButtonElement).style.background = 'rgba(255,255,255,0.07)'; }}
            >
              <span style={{ fontSize: 14, fontWeight: 800 }}>H2</span>
              <span>H2 소제목</span>
            </button>

            {/* H3 소제목 삽입 */}
            <button
              type="button"
              onClick={() => {
                pushSnapshot();
                const iframe = iframeRef.current;
                if (!iframe) return;
                try {
                  const doc = iframe.contentDocument || iframe.contentWindow?.document;
                  if (!doc?.body) return;
                  const h3 = doc.createElement('h3');
                  h3.innerHTML = '<br>';
                  const afterEl = plusAfterElRef.current;
                  if (afterEl && afterEl.parentNode) {
                    if (plusInsertBeforeModeRef.current) { afterEl.parentNode.insertBefore(h3, afterEl); }
                    else { afterEl.parentNode.insertBefore(h3, afterEl.nextSibling); }
                  } else { doc.body.appendChild(h3); }
                  adjustHeight();
                  setTimeout(() => {
                    iframe.contentWindow?.focus();
                    const range = doc.createRange(); range.setStart(h3, 0); range.collapse(true);
                    const sel = doc.defaultView?.getSelection(); sel?.removeAllRanges(); sel?.addRange(range);
                    h3.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
                  }, 50);
                } catch { /* cross-origin */ }
                setPlusButton(prev => ({ ...prev, visible: false, showMenu: false }));
                plusInsertBeforeModeRef.current = false;
                scheduleChange();
              }}
              style={{ display: 'flex', flexDirection: 'row', alignItems: 'center', gap: 6, padding: '7px 8px', borderRadius: 7, border: '1px solid rgba(255,255,255,0.15)', background: 'rgba(255,255,255,0.07)', color: '#e5e7eb', fontSize: 11, fontWeight: 600, cursor: 'pointer', transition: 'all 0.15s', whiteSpace: 'nowrap', width: '100%' }}
              onMouseEnter={e => { (e.currentTarget as HTMLButtonElement).style.background = 'rgba(255,255,255,0.15)'; }}
              onMouseLeave={e => { (e.currentTarget as HTMLButtonElement).style.background = 'rgba(255,255,255,0.07)'; }}
            >
              <span style={{ fontSize: 13, fontWeight: 800 }}>H3</span>
              <span>H3 소제목</span>
            </button>

            {/* 코드 블록 삽입 */}
            <button
              type="button"
              onClick={() => {
                pushSnapshot();
                const iframe = iframeRef.current;
                if (!iframe) return;
                try {
                  const doc = iframe.contentDocument || iframe.contentWindow?.document;
                  if (!doc?.body) return;
                  const pre = doc.createElement('pre');
                  pre.style.cssText = 'background:#1e1e2e;color:#cdd6f4;padding:16px;border-radius:8px;font-family:monospace;font-size:13px;overflow-x:auto;margin:16px 0;';
                  const code = doc.createElement('code');
                  code.innerHTML = '<br>';
                  pre.appendChild(code);
                  const afterEl = plusAfterElRef.current;
                  if (afterEl && afterEl.parentNode) {
                    if (plusInsertBeforeModeRef.current) { afterEl.parentNode.insertBefore(pre, afterEl); }
                    else { afterEl.parentNode.insertBefore(pre, afterEl.nextSibling); }
                  } else { doc.body.appendChild(pre); }
                  adjustHeight();
                  setTimeout(() => {
                    iframe.contentWindow?.focus();
                    // contenteditable 즉시 활성화
                    code.contentEditable = 'true';
                    code.style.cursor = 'text';
                    code.focus();
                    const range = doc.createRange(); range.setStart(code, 0); range.collapse(true);
                    const sel = doc.defaultView?.getSelection(); sel?.removeAllRanges(); sel?.addRange(range);
                    pre.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
                  }, 50);
                } catch { /* cross-origin */ }
                setPlusButton(prev => ({ ...prev, visible: false, showMenu: false }));
                plusInsertBeforeModeRef.current = false;
                scheduleChange();
              }}
              style={{ display: 'flex', flexDirection: 'row', alignItems: 'center', gap: 6, padding: '7px 8px', borderRadius: 7, border: '1px solid rgba(255,255,255,0.15)', background: 'rgba(255,255,255,0.07)', color: '#e5e7eb', fontSize: 11, fontWeight: 600, cursor: 'pointer', transition: 'all 0.15s', whiteSpace: 'nowrap', width: '100%' }}
              onMouseEnter={e => { (e.currentTarget as HTMLButtonElement).style.background = 'rgba(255,255,255,0.15)'; }}
              onMouseLeave={e => { (e.currentTarget as HTMLButtonElement).style.background = 'rgba(255,255,255,0.07)'; }}
            >
              <span style={{ fontSize: 16 }}>💻</span>
              <span>코드 블록</span>
            </button>

            {/* 정보 박스 삽입 */}
            <button
              type="button"
              onClick={() => {
                pushSnapshot();
                const iframe = iframeRef.current;
                if (!iframe) return;
                try {
                  const doc = iframe.contentDocument || iframe.contentWindow?.document;
                  if (!doc?.body) return;
                  const box = doc.createElement('div');
                  box.style.cssText = 'background:#eff6ff;border:1px solid #bfdbfe;border-left:4px solid #3b82f6;border-radius:8px;padding:12px 16px;margin:16px 0;';
                  box.innerHTML = '<p style="margin:0;color:#1e40af;font-weight:600;margin-bottom:4px;">💡 정보</p><p style="margin:0;color:#1d4ed8;min-height:1.5em;"><br></p>';
                  const afterEl = plusAfterElRef.current;
                  if (afterEl && afterEl.parentNode) {
                    if (plusInsertBeforeModeRef.current) { afterEl.parentNode.insertBefore(box, afterEl); }
                    else { afterEl.parentNode.insertBefore(box, afterEl.nextSibling); }
                  } else { doc.body.appendChild(box); }
                  adjustHeight();
                  setTimeout(() => {
                    iframe.contentWindow?.focus();
                    const p = box.querySelectorAll('p')[1];
                    if (p) {
                      // contenteditable 즉시 활성화
                      p.contentEditable = 'true';
                      p.style.cursor = 'text';
                      p.focus();
                      const range = doc.createRange(); range.setStart(p, 0); range.collapse(true);
                      const sel = doc.defaultView?.getSelection(); sel?.removeAllRanges(); sel?.addRange(range);
                      p.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
                    }
                  }, 50);
                } catch { /* cross-origin */ }
                setPlusButton(prev => ({ ...prev, visible: false, showMenu: false }));
                plusInsertBeforeModeRef.current = false;
                scheduleChange();
              }}
              style={{ display: 'flex', flexDirection: 'row', alignItems: 'center', gap: 6, padding: '7px 8px', borderRadius: 7, border: '1px solid rgba(59,130,246,0.3)', background: 'rgba(59,130,246,0.1)', color: '#93c5fd', fontSize: 11, fontWeight: 600, cursor: 'pointer', transition: 'all 0.15s', whiteSpace: 'nowrap', width: '100%' }}
              onMouseEnter={e => { (e.currentTarget as HTMLButtonElement).style.background = 'rgba(59,130,246,0.25)'; (e.currentTarget as HTMLButtonElement).style.borderColor = '#3b82f6'; }}
              onMouseLeave={e => { (e.currentTarget as HTMLButtonElement).style.background = 'rgba(59,130,246,0.1)'; (e.currentTarget as HTMLButtonElement).style.borderColor = 'rgba(59,130,246,0.3)'; }}
            >
              <span style={{ fontSize: 16 }}>💡</span>
              <span>정보 박스</span>
            </button>

            {/* 경고 박스 삽입 */}
            <button
              type="button"
              onClick={() => {
                pushSnapshot();
                const iframe = iframeRef.current;
                if (!iframe) return;
                try {
                  const doc = iframe.contentDocument || iframe.contentWindow?.document;
                  if (!doc?.body) return;
                  const box = doc.createElement('div');
                  box.style.cssText = 'background:#fff7ed;border:1px solid #fed7aa;border-left:4px solid #f97316;border-radius:8px;padding:12px 16px;margin:16px 0;';
                  box.innerHTML = '<p style="margin:0;color:#c2410c;font-weight:600;margin-bottom:4px;">⚠️ 주의</p><p style="margin:0;color:#ea580c;min-height:1.5em;"><br></p>';
                  const afterEl = plusAfterElRef.current;
                  if (afterEl && afterEl.parentNode) {
                    if (plusInsertBeforeModeRef.current) { afterEl.parentNode.insertBefore(box, afterEl); }
                    else { afterEl.parentNode.insertBefore(box, afterEl.nextSibling); }
                  } else { doc.body.appendChild(box); }
                  adjustHeight();
                  setTimeout(() => {
                    iframe.contentWindow?.focus();
                    const p = box.querySelectorAll('p')[1];
                    if (p) {
                      // contenteditable 즉시 활성화
                      p.contentEditable = 'true';
                      p.style.cursor = 'text';
                      p.focus();
                      const range = doc.createRange(); range.setStart(p, 0); range.collapse(true);
                      const sel = doc.defaultView?.getSelection(); sel?.removeAllRanges(); sel?.addRange(range);
                      p.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
                    }
                  }, 50);
                } catch { /* cross-origin */ }
                setPlusButton(prev => ({ ...prev, visible: false, showMenu: false }));
                plusInsertBeforeModeRef.current = false;
                scheduleChange();
              }}
              style={{ display: 'flex', flexDirection: 'row', alignItems: 'center', gap: 6, padding: '7px 8px', borderRadius: 7, border: '1px solid rgba(249,115,22,0.3)', background: 'rgba(249,115,22,0.1)', color: '#fdba74', fontSize: 11, fontWeight: 600, cursor: 'pointer', transition: 'all 0.15s', whiteSpace: 'nowrap', width: '100%' }}
              onMouseEnter={e => { (e.currentTarget as HTMLButtonElement).style.background = 'rgba(249,115,22,0.25)'; (e.currentTarget as HTMLButtonElement).style.borderColor = '#f97316'; }}
              onMouseLeave={e => { (e.currentTarget as HTMLButtonElement).style.background = 'rgba(249,115,22,0.1)'; (e.currentTarget as HTMLButtonElement).style.borderColor = 'rgba(249,115,22,0.3)'; }}
            >
              <span style={{ fontSize: 16 }}>⚠️</span>
              <span>경고 박스</span>
            </button>

            {/* 가운데 정렬 단락 */}
            <button
              type="button"
              onClick={() => {
                pushSnapshot();
                const iframe = iframeRef.current;
                if (!iframe) return;
                try {
                  const doc = iframe.contentDocument || iframe.contentWindow?.document;
                  if (!doc?.body) return;
                  const div = doc.createElement("div");
                  div.style.cssText = "text-align:center;min-height:1.5em;padding:4px 0;";
                  div.innerHTML = "<br>";
                  const afterEl = plusAfterElRef.current;
                  if (afterEl && afterEl.parentNode) {
                    if (plusInsertBeforeModeRef.current) {
                      afterEl.parentNode.insertBefore(div, afterEl);
                    } else {
                      afterEl.parentNode.insertBefore(div, afterEl.nextSibling);
                    }
                  } else {
                    doc.body.appendChild(div);
                  }
                  adjustHeight();
                  setTimeout(() => {
                    const range = doc.createRange();
                    range.setStart(div, 0);
                    range.collapse(true);
                    const sel = doc.defaultView?.getSelection();
                    sel?.removeAllRanges();
                    sel?.addRange(range);
                  }, 0);
                } catch { /* cross-origin */ }
                setPlusButton(prev => ({ ...prev, visible: false, showMenu: false }));
                plusInsertBeforeModeRef.current = false;
                scheduleChange();
              }}
              style={{
                display: "flex", flexDirection: "row", alignItems: "center", gap: 6,
                padding: "7px 8px", borderRadius: 7,
                border: "1px solid rgba(99,102,241,0.3)",
                background: "rgba(99,102,241,0.1)", color: "#c7d2fe",
                fontSize: 11, fontWeight: 600, cursor: "pointer",
                transition: "all 0.15s",
                whiteSpace: "nowrap", width: "100%",
              }}
              onMouseEnter={e => { (e.currentTarget as HTMLButtonElement).style.background = "rgba(99,102,241,0.25)"; (e.currentTarget as HTMLButtonElement).style.borderColor = "#6366f1"; }}
              onMouseLeave={e => { (e.currentTarget as HTMLButtonElement).style.background = "rgba(99,102,241,0.1)"; (e.currentTarget as HTMLButtonElement).style.borderColor = "rgba(99,102,241,0.3)"; }}
            >
              <span style={{ fontSize: 16 }}>⇔</span>
              <span>가운데 단락</span>
            </button>

            {/* 애드센스 광고 삽입 - 항상 표시 */}
            {true && (
              <button
                type="button"
                onClick={() => {
                  const code = adsenseSlotCode;
                  if (!code) {
                    alert('관리자 > 광고 설정 탭에서 애드센스 슬롯 코드를 먼저 저장해주세요.');
                    return;
                  }
                  pushSnapshot();
                  const iframe = iframeRef.current;
                  if (!iframe) return;
                  try {
                    const doc = iframe.contentDocument || iframe.contentWindow?.document;
                    if (!doc?.body) return;
                    const wrapper = doc.createElement("div");
                    wrapper.setAttribute("data-ad-type", "adsense");
                    wrapper.style.cssText = "margin:16px 0;text-align:center;";
                    wrapper.innerHTML = code;
                    const afterEl = plusAfterElRef.current;
                    if (afterEl && afterEl.parentNode) {
                      if (plusInsertBeforeModeRef.current) {
                        afterEl.parentNode.insertBefore(wrapper, afterEl);
                      } else {
                        afterEl.parentNode.insertBefore(wrapper, afterEl.nextSibling);
                      }
                    } else {
                      doc.body.appendChild(wrapper);
                    }
                    adjustHeight();
                  } catch { /* cross-origin */ }
                  setPlusButton(prev => ({ ...prev, visible: false, showMenu: false }));
                  plusInsertBeforeModeRef.current = false;
                  scheduleChange();
                }}
                style={{
                  display: "flex", flexDirection: "row", alignItems: "center", gap: 6,
                  padding: "7px 8px", borderRadius: 7,
                  border: "1px solid rgba(66,133,244,0.3)",
                  background: "rgba(66,133,244,0.1)", color: "#93c5fd",
                  fontSize: 11, fontWeight: 600, cursor: "pointer",
                  transition: "all 0.15s",
                }}
                onMouseEnter={e => { (e.currentTarget as HTMLButtonElement).style.background = "rgba(66,133,244,0.25)"; (e.currentTarget as HTMLButtonElement).style.borderColor = "#4285f4"; }}
                onMouseLeave={e => { (e.currentTarget as HTMLButtonElement).style.background = "rgba(66,133,244,0.1)"; (e.currentTarget as HTMLButtonElement).style.borderColor = "rgba(66,133,244,0.3)"; }}
              >
                <span style={{ fontSize: 16 }}>📢</span>
                <span>애드센스</span>
              </button>
            )}

            {/* 쿠팡 파트너스 삽입 - 항상 표시 */}
            {true && (
              <button
                type="button"
                onClick={() => {
                  const code = coupangWidgetCode;
                  if (!code) {
                    alert('관리자 > 제휴 마케팅 탭에서 쿠팡 파트너스를 활성화하고 API 키를 저장해주세요.');
                    return;
                  }
                  pushSnapshot();
                  const iframe = iframeRef.current;
                  if (!iframe) return;
                  try {
                    const doc = iframe.contentDocument || iframe.contentWindow?.document;
                    if (!doc?.body) return;
                    const wrapper = doc.createElement("div");
                    wrapper.setAttribute("data-ad-type", "coupang");
                    wrapper.style.cssText = "margin:16px 0;text-align:center;";
                    wrapper.innerHTML = code;
                    const afterEl = plusAfterElRef.current;
                    if (afterEl && afterEl.parentNode) {
                      if (plusInsertBeforeModeRef.current) {
                        afterEl.parentNode.insertBefore(wrapper, afterEl);
                      } else {
                        afterEl.parentNode.insertBefore(wrapper, afterEl.nextSibling);
                      }
                    } else {
                      doc.body.appendChild(wrapper);
                    }
                    adjustHeight();
                  } catch { /* cross-origin */ }
                  setPlusButton(prev => ({ ...prev, visible: false, showMenu: false }));
                  plusInsertBeforeModeRef.current = false;
                  scheduleChange();
                }}
                style={{
                  display: "flex", flexDirection: "row", alignItems: "center", gap: 6,
                  padding: "7px 8px", borderRadius: 7,
                  border: "1px solid rgba(249,115,22,0.3)",
                  background: "rgba(249,115,22,0.1)", color: "#fdba74",
                  fontSize: 11, fontWeight: 600, cursor: "pointer",
                  transition: "all 0.15s",
                }}
                onMouseEnter={e => { (e.currentTarget as HTMLButtonElement).style.background = "rgba(249,115,22,0.25)"; (e.currentTarget as HTMLButtonElement).style.borderColor = "#f97316"; }}
                onMouseLeave={e => { (e.currentTarget as HTMLButtonElement).style.background = "rgba(249,115,22,0.1)"; (e.currentTarget as HTMLButtonElement).style.borderColor = "rgba(249,115,22,0.3)"; }}
              >
                <span style={{ fontSize: 16 }}>🛒</span>
                <span>쿠팡</span>
              </button>
            )}

            {/* 파일 다운로드 버튼 삽입 */}
            {onRequestFileInsert && (
              <button
                type="button"
                onClick={() => {
                  const afterEl = plusButton.afterEl;
                  const insertBeforeMode = plusButton.insertBeforeMode ?? false;
                  setPlusButton(prev => ({ ...prev, visible: false, showMenu: false }));
                  const insertHtml = (html: string) => {
                    pushSnapshot();
                    const iframe = iframeRef.current;
                    if (!iframe) return;
                    try {
                      const doc = iframe.contentDocument || iframe.contentWindow?.document;
                      if (!doc?.body) return;
                      const wrapper = doc.createElement('div');
                      wrapper.innerHTML = html;
                      const el = wrapper.firstElementChild || wrapper;
                      if (afterEl && afterEl.parentNode) {
                        if (insertBeforeMode) {
                          afterEl.parentNode.insertBefore(el, afterEl);
                        } else {
                          afterEl.parentNode.insertBefore(el, afterEl.nextSibling);
                        }
                      } else {
                        doc.body.appendChild(el);
                      }
                      adjustHeight();
                      scheduleChange();
                    } catch { /* cross-origin */ }
                  };
                  onRequestFileInsert?.(afterEl, insertHtml);
                }}
                style={{
                  display: "flex", flexDirection: "row", alignItems: "center", gap: 6,
                  padding: "7px 8px", borderRadius: 7,
                  border: "1px solid rgba(37,99,235,0.3)",
                  background: "rgba(37,99,235,0.1)", color: "#93c5fd",
                  fontSize: 11, fontWeight: 600, cursor: "pointer",
                  transition: "all 0.15s",
                }}
                onMouseEnter={e => { (e.currentTarget as HTMLButtonElement).style.background = "rgba(37,99,235,0.25)"; (e.currentTarget as HTMLButtonElement).style.borderColor = "#2563eb"; }}
                onMouseLeave={e => { (e.currentTarget as HTMLButtonElement).style.background = "rgba(37,99,235,0.1)"; (e.currentTarget as HTMLButtonElement).style.borderColor = "rgba(37,99,235,0.3)"; }}
              >
                <span style={{ fontSize: 16 }}>📎</span>
                <span>파일 버튼</span>
              </button>
            )}
          </div>
        </div>,
        document.body
      )}

      {/* 버튼 생성 다이얼로그 */}
      {showButtonDialog && (
        <ButtonGeneratorDialog
          defaultText={buttonDefaultText}
          editingEl={editingButtonElRef.current}
          onConfirm={confirmButtonInsert}
          onCancel={() => {
            editingButtonElRef.current = null;
            setShowButtonDialog(false);
          }}
        />
      )}

      {/* 링크 삽입 다이얼로그 */}
      {showLinkDialog && (
        <LinkDialog
          defaultText={linkDefaultText}
          onConfirm={confirmLink}
          onCancel={() => setShowLinkDialog(false)}
        />
      )}

      {/* 이미지 삽입 다이얼로그 */}
      {showImageInsertDialog && (
        <ImageInsertDialog
          onConfirm={confirmImageInsert}
          onCancel={() => setShowImageInsertDialog(false)}
          onUpload={onUploadImage}
        />
      )}
      {/* 동영상 삽입 다이얼로그 */}
      {showVideoInsertDialog && (
        <VideoInsertDialog
          onConfirm={confirmVideoInsert}
          onCancel={() => setShowVideoInsertDialog(false)}
        />
      )}

      {/* 표 삽입/변환 다이얼로그 */}
      {showTableDialog && (
        <TableDialog
          defaultText={tableDefaultText}
          onConfirm={confirmTableInsert}
          onCancel={() => setShowTableDialog(false)}
        />
      )}
    </div>
  );
}
