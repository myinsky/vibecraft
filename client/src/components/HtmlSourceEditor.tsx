/**
 * HtmlSourceEditor - HTML 소스 직접 편집기 (CodeMirror 기반)
 * - 비주얼 편집기(HtmlVisualEditor) 대체
 * - 좌: HTML 소스 코드 편집 (구문 강조, 자동완성)
 * - 우: 실시간 미리보기 (원본 그대로 렌더링)
 * - 원칙: 입력한 소스를 그대로 보여줌, 구조 변경 없음
 */
import { useState, useCallback, useRef, useEffect } from "react";
import CodeMirror from "@uiw/react-codemirror";
import { html } from "@codemirror/lang-html";
import { oneDark } from "@codemirror/theme-one-dark";
import { EditorView } from "@codemirror/view";
import { Eye, Code2, Columns, RefreshCw, Maximize2, Monitor, Smartphone, Tablet } from "lucide-react";

interface HtmlSourceEditorProps {
  value: string;
  onChange: (value: string) => void;
  contentWidth?: number;
  isAppMode?: boolean;
  minHeight?: number;
}

// Blob URL 기반 iframe (앱 모드 - JS 실행 가능)
function BlobIframe({ html: htmlContent, title }: { html: string; title?: string }) {
  const [blobUrl, setBlobUrl] = useState<string | null>(null);
  const iframeRef = useRef<HTMLIFrameElement>(null);

  useEffect(() => {
    // /manus-storage/... 상대 경로를 절대 URL로 변환 (blob URL 기준 해석 방지)
    const origin = window.location.origin;
    const processedHtml = htmlContent
      .replace(/src=(["'])(\/manus-storage\/)/gi, `src=$1${origin}/manus-storage/`)
      .replace(/href=(["'])(\/manus-storage\/)/gi, `href=$1${origin}/manus-storage/`)
      .replace(/url\((["']?)(\/manus-storage\/)/gi, `url($1${origin}/manus-storage/`);
    const blob = new Blob([processedHtml], { type: "text/html; charset=utf-8" });
    const url = URL.createObjectURL(blob);
    setBlobUrl(url);
    return () => URL.revokeObjectURL(url);
  }, [htmlContent]);

  const handleLoad = () => {
    const iframe = iframeRef.current;
    if (!iframe) return;
    try {
      const doc = iframe.contentDocument || iframe.contentWindow?.document;
      if (doc?.body) {
        const setHeight = () => {
          const h = doc.documentElement.scrollHeight || doc.body?.scrollHeight || 400;
          if (h > 100) iframe.style.height = h + "px";
        };
        setHeight();
        const ro = new ResizeObserver(setHeight);
        ro.observe(doc.body);
        iframe.addEventListener("pagehide", () => ro.disconnect(), { once: true });
      }
    } catch { /* cross-origin */ }
  };

  if (!blobUrl) return (
    <div style={{ display: "flex", alignItems: "center", justifyContent: "center", minHeight: 200, color: "#94a3b8", fontSize: 13 }}>
      로딩 중...
    </div>
  );

  return (
    <iframe
      ref={iframeRef}
      src={blobUrl}
      style={{ width: "100%", border: "none", minHeight: 400, display: "block" }}
      onLoad={handleLoad}
      title={title || "HTML 미리보기"}
    />
  );
}

type ViewMode = "split" | "editor" | "preview";

type DeviceMode = 'desktop' | 'tablet' | 'mobile';

export default function HtmlSourceEditor({
  value,
  onChange,
  contentWidth = 960,
  isAppMode = false,
  minHeight = 500,
}: HtmlSourceEditorProps) {
  const [viewMode, setViewMode] = useState<ViewMode>("split");
  const [previewKey, setPreviewKey] = useState(0);
  const [deviceMode, setDeviceMode] = useState<DeviceMode>('desktop');

  const handleRefreshPreview = useCallback(() => {
    setPreviewKey(k => k + 1);
  }, []);

  // 미리보기 렌더링
  const renderPreview = () => {
    if (!value.trim()) {
      return (
        <div style={{
          display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center",
          minHeight: 200, color: "#9ca3af", fontSize: 13, gap: 8,
        }}>
          <Code2 size={28} style={{ opacity: 0.3 }} />
          <span>HTML 소스를 입력하면 여기에 미리보기가 표시됩니다</span>
        </div>
      );
    }

    // 모든 HTML 소스: BlobIframe으로 원본 구조 완전 보존
    const isFullDoc = /^\s*(<!DOCTYPE|<html)/i.test(value.trim());
    // 기기 모드에 따른 viewport 메타 설정
    const viewportMeta = deviceMode === 'mobile'
      ? '<meta name="viewport" content="width=375,initial-scale=1">'
      : deviceMode === 'tablet'
      ? '<meta name="viewport" content="width=768,initial-scale=1">'
      : '<meta name="viewport" content="width=device-width,initial-scale=1">';
    const wrappedHtml = isFullDoc
      ? value.replace(/<meta[^>]*name=["']viewport["'][^>]*>/i, viewportMeta)
      : `<!DOCTYPE html><html><head><meta charset="utf-8">${viewportMeta}<style>body{margin:0;padding:16px;font-family:inherit;max-width:${contentWidth}px;}</style></head><body>${value}</body></html>`;
    // 기기 폭 제한 컨테이너
    const previewWidth = deviceMode === 'mobile' ? 375 : deviceMode === 'tablet' ? 768 : undefined;
    return (
      <div style={{
        maxWidth: previewWidth,
        margin: previewWidth ? '0 auto' : undefined,
        transition: 'max-width 0.3s ease',
        boxShadow: previewWidth ? '0 0 0 1px #e5e7eb' : undefined,
      }}>
        <BlobIframe key={`${previewKey}-${deviceMode}`} html={wrappedHtml} title="HTML 미리보기" />
      </div>
    );
  };

  const editorExtensions = [
    html(),
    EditorView.lineWrapping,
    EditorView.theme({
      "&": { fontSize: "13px", fontFamily: "'Fira Code', 'JetBrains Mono', 'Courier New', monospace" },
      ".cm-content": { padding: "12px 0" },
      ".cm-line": { padding: "0 16px" },
    }),
  ];

  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100%" }}>
      {/* 툴바 */}
      <div style={{
        display: "flex", alignItems: "center", gap: 6,
        padding: "8px 16px",
        borderBottom: "1px solid #e5e7eb",
        background: "#f8fafc",
        flexWrap: "wrap",
      }}>
        {/* 뷰 모드 전환 */}
        <div style={{ display: "flex", border: "1px solid #e5e7eb", borderRadius: 7, overflow: "hidden" }}>
          {([
            { mode: "editor" as ViewMode, icon: <Code2 size={13} />, label: "소스만" },
            { mode: "split" as ViewMode, icon: <Columns size={13} />, label: "분할" },
            { mode: "preview" as ViewMode, icon: <Eye size={13} />, label: "미리보기만" },
          ] as const).map(({ mode, icon, label }) => (
            <button
              key={mode}
              type="button"
              onClick={() => setViewMode(mode)}
              style={{
                display: "flex", alignItems: "center", gap: 4,
                padding: "5px 11px", border: "none",
                background: viewMode === mode ? "#6366f1" : "transparent",
                color: viewMode === mode ? "#fff" : "#6b7280",
                fontSize: 12, fontWeight: viewMode === mode ? 700 : 500,
                cursor: "pointer",
                borderRight: mode !== "preview" ? "1px solid #e5e7eb" : "none",
              }}
            >
              {icon} {label}
            </button>
          ))}
        </div>

        {/* 미리보기 새로고침 */}
        <button
          type="button"
          onClick={handleRefreshPreview}
          title="미리보기 새로고침"
          style={{
            display: "flex", alignItems: "center", gap: 4,
            padding: "5px 10px", borderRadius: 6,
            border: "1px solid #e5e7eb", background: "#fff",
            color: "#6b7280", fontSize: 12, cursor: "pointer",
          }}
        >
          <RefreshCw size={12} /> 새로고침
        </button>

        {/* 기기별 미리보기 토글 (미리보기 패널이 있을 때만 표시) */}
        {viewMode !== 'editor' && (
          <div style={{ display: "flex", border: "1px solid #e5e7eb", borderRadius: 7, overflow: "hidden" }}>
            {([
              { key: 'desktop' as DeviceMode, icon: <Monitor size={12} />, label: '데스크탑' },
              { key: 'tablet' as DeviceMode, icon: <Tablet size={12} />, label: '태블릿' },
              { key: 'mobile' as DeviceMode, icon: <Smartphone size={12} />, label: '모바일' },
            ]).map(({ key, icon, label }) => (
              <button
                key={key}
                type="button"
                onClick={() => setDeviceMode(key)}
                title={label}
                style={{
                  display: "flex", alignItems: "center", gap: 4,
                  padding: "5px 9px", border: "none",
                  borderRight: key !== 'mobile' ? "1px solid #e5e7eb" : "none",
                  background: deviceMode === key ? "#6366f1" : "transparent",
                  color: deviceMode === key ? "#fff" : "#6b7280",
                  fontSize: 11, fontWeight: deviceMode === key ? 700 : 500,
                  cursor: "pointer",
                }}
              >
                {icon}
              </button>
            ))}
          </div>
        )}

        {/* 문자 수 */}
        <span style={{ marginLeft: "auto", fontSize: 11, color: "#9ca3af" }}>
          {value.length.toLocaleString()}자
        </span>
      </div>

      {/* 에디터 + 미리보기 영역 */}
      <div style={{
        display: "flex",
        flex: 1,
        minHeight,
        overflow: "hidden",
      }}>
        {/* 소스 편집기 */}
        {(viewMode === "editor" || viewMode === "split") && (
          <div style={{
            flex: viewMode === "split" ? "0 0 50%" : "1 1 100%",
            borderRight: viewMode === "split" ? "1px solid #e5e7eb" : "none",
            overflow: "auto",
            minWidth: 0,
          }}>
            <CodeMirror
              value={value}
              height={`${minHeight}px`}
              extensions={editorExtensions}
              theme={oneDark}
              onChange={onChange}
              basicSetup={{
                lineNumbers: true,
                foldGutter: true,
                autocompletion: true,
                bracketMatching: true,
                closeBrackets: true,
                indentOnInput: true,
                highlightActiveLine: true,
                highlightSelectionMatches: true,
                searchKeymap: true,
                history: true,
              }}
            />
          </div>
        )}

        {/* 미리보기 */}
        {(viewMode === "preview" || viewMode === "split") && (
          <div style={{
            flex: viewMode === "split" ? "0 0 50%" : "1 1 100%",
            overflow: "auto",
            background: "#ffffff",
            minWidth: 0,
          }}>
            <div style={{
              padding: "8px 12px",
              borderBottom: "1px solid #f3f4f6",
              background: "#f8fafc",
              fontSize: 11, color: "#9ca3af",
              display: "flex", alignItems: "center", gap: 5,
            }}>
              <Eye size={11} /> 실시간 미리보기 {isAppMode && <span style={{ color: "#f59e0b", fontWeight: 700 }}>• 앱 모드</span>}
            </div>
            <div style={{ overflow: "auto" }}>
              {renderPreview()}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
