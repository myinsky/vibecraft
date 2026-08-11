/**
 * AdminPagesTab - 관리자 커스텀 페이지 만들기 탭
 * 섹션 기반 페이지 빌더: 텍스트, 이미지, 버튼, 구분선, HTML 섹션 지원
 */
import { useState, useCallback, useRef, useEffect } from "react";
import { trpc } from "@/lib/trpc";
import { toast } from "sonner";
import {
  Plus, Trash2, Edit2, Check, X, Eye, EyeOff, Globe, GripVertical,
  FileText, ChevronUp, ChevronDown, Save, RefreshCw, ExternalLink,
  AlignLeft, Image, Square, Minus, Code, LayoutGrid, ArrowLeft,
  MoreVertical, Pin, PinOff, BookOpen, Pencil, Copy, MessageSquare,
  Upload, Loader2, History, Wand2, Eye as EyeIcon, Download,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import RichEditor from "@/components/RichEditor";
import IframeVisualEditor from "@/components/IframeVisualEditor";
import {
  DropdownMenu, DropdownMenuTrigger, DropdownMenuContent,
  DropdownMenuItem, DropdownMenuSeparator,
} from "@/components/ui/dropdown-menu";
import { getPostUrl } from "@/lib/postUrl";
import HtmlSourceEditor from "@/components/HtmlSourceEditor";

/** HTML 태그, <style> 블록, CSS :root 코드 등을 제거하고 순수 텍스트만 반환 */
function stripHtmlAndCss(raw: string | null | undefined, maxLen = 80): string {
  if (!raw) return "";
  // <style>...</style> 블록 제거
  let text = raw.replace(/<style[^>]*>[\s\S]*?<\/style>/gi, "");
  // :root { ... } CSS 변수 블록 제거 (공백 없는 :root{도 처리, 중첩 중괄호 포함)
  // 방법: :root 이후 첫 { 부터 마지막 } 까지 탐욕적으로 제거
  text = text.replace(/:root\s*\{[^}]*(?:\{[^}]*\}[^}]*)*\}/gi, "");
  // CSS 변수 선언 패턴 제거 (--변수명: 값; 형태)
  text = text.replace(/--[a-zA-Z0-9_-]+\s*:[^;]+;/g, "");
  // HTML 태그 제거
  text = text.replace(/<[^>]+>/g, " ");
  // HTML 엔티티 디코딩 (기본)
  text = text.replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&nbsp;/g, " ").replace(/&quot;/g, '"');
  // 연속 공백/줄바꿈 정리
  text = text.replace(/\s+/g, " ").trim();
  if (text.length > maxLen) return text.slice(0, maxLen) + "...";
  return text;
}

// ─── 섹션 타입 정의 ────────────────────────────────────────────────────────────
type SectionType = "text" | "image" | "button" | "divider" | "html" | "hero" | "columns" | "vibe-apps";

interface PageSection {
  id: string;
  type: SectionType;
  content: string;       // 주 콘텐츠 (HTML 또는 텍스트)
  settings: {
    bgColor?: string;
    textAlign?: "left" | "center" | "right";
    padding?: "sm" | "md" | "lg";
    imageUrl?: string;
    imageAlt?: string;
    buttonText?: string;
    buttonUrl?: string;
    buttonStyle?: "primary" | "outline" | "ghost";
    columns?: string[];  // 콜럼 레이아웃 콘텐츠 배열
    heroTitle?: string;
    heroSubtitle?: string;
    heroButtonText?: string;
    heroButtonUrl?: string;
    isAppMode?: boolean;  // HTML 섹션: JS 실행 앱 모드
    embedMode?: "html" | "url";  // HTML 섹션 임베드 모드 (html 소스 vs URL)
    embedUrl?: string;  // URL 임베드 모드일 때 사용할 외부 URL
  };
}

interface CustomPage {
  id: number;
  slug: string;
  title: string;
  description: string | null;
  sectionsJson: string;
  published: boolean;
  showInNav: boolean;
  hideSidebar: boolean;
  hideChrome?: boolean;
  contentWidth?: number | null;
  fullscreenDefault?: boolean;
  showTitle?: boolean;
  showDescription?: boolean;
  titleAlign?: string | null;
  membersOnly: boolean;
  commentsEnabled?: boolean;
  postListCategory?: string | null;
  sortOrder: number;
  thumbnail?: string | null;
  createdAt: Date;
  updatedAt: Date;
}

// ─── 섹션 타입 목록 ────────────────────────────────────────────────────────────
const SECTION_TYPES: { type: SectionType; label: string; icon: React.ReactNode; desc: string }[] = [
  { type: "hero",    label: "히어로",    icon: <LayoutGrid size={16} />, desc: "큰 제목 + 부제목 + 버튼" },
  { type: "text",    label: "텍스트",    icon: <AlignLeft size={16} />,  desc: "리치 텍스트 에디터" },
  { type: "image",   label: "이미지",    icon: <Image size={16} />,      desc: "이미지 + 캡션" },
  { type: "columns", label: "2단 레이아웃", icon: <LayoutGrid size={16} />, desc: "좌우 2단 콘텐츠" },
  { type: "button",  label: "버튼",      icon: <Square size={16} />,     desc: "CTA 버튼" },
  { type: "divider", label: "구분선",    icon: <Minus size={16} />,      desc: "섹션 구분선" },
  { type: "html",    label: "HTML",      icon: <Code size={16} />,       desc: "커스텀 HTML 삽입" },
  { type: "vibe-apps", label: "앱 목록", icon: <LayoutGrid size={16} />, desc: "DB 연동 앱 카드 그리드" },
];

function generateId() {
  return Math.random().toString(36).slice(2, 10);
}

function createSection(type: SectionType): PageSection {
  return {
    id: generateId(),
    type,
    content: "",
    settings: {
      bgColor: "#ffffff",
      textAlign: "left",
      padding: "md",
    },
  };
}

// ─── 섹션 편집기 ──────// ─── HTML 섹션 전용 편집기 ──────────────────────────────────────────
function HtmlSectionEditor({
  sectionId,
  content,
  isAppMode,
  embedMode = "html",
  embedUrl = "",
  onChange,
  onAppModeChange,
  onEmbedModeChange,
  onEmbedUrlChange,
  onFileLoaded,
}: {
  sectionId: string;  // 섹션이 바뀔 때만 내부 상태 초기화하기 위한 식별자
  content: string;
  isAppMode: boolean;
  embedMode?: "html" | "url";
  embedUrl?: string;
  onChange: (content: string) => void;
  onAppModeChange: (v: boolean) => void;
  onEmbedModeChange: (v: "html" | "url") => void;
  onEmbedUrlChange: (v: string) => void;
  onFileLoaded?: (content: string, isAppMode: boolean, embedMode: "html" | "url") => void;
}) {
  const localFileInputRef = useRef<HTMLInputElement>(null);
  const s3FileInputRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);
  // 내부 로컬 상태: 파일 불러오기 시 직접 업데이트 (stale 클로저 방지)
  const [localContent, setLocalContent] = useState(content);
  const [localIsAppMode, setLocalIsAppMode] = useState(isAppMode);
  const [localEmbedMode, setLocalEmbedMode] = useState<"html" | "url">(embedMode as "html" | "url");
  const [localEmbedUrl, setLocalEmbedUrl] = useState(embedUrl);
  // 미리보기 갱신 버튼용: key가 증가하면 iframe 재생성
  const [previewKey, setPreviewKey] = useState(0);
  // 편집 모드: visual(비주얼) | source(HTML 소스)
  const [editMode, setEditMode] = useState<"visual" | "source">("visual");

  // 섹션이 바뀔 때만 내부 상태 초기화 (content 변경 시마다 동기화하면 무한 루프 발생)
  const prevSectionIdRef = useRef(sectionId);
  useEffect(() => {
    if (prevSectionIdRef.current !== sectionId) {
      prevSectionIdRef.current = sectionId;
      setLocalContent(content);
      setLocalIsAppMode(isAppMode);
      setLocalEmbedMode(embedMode as "html" | "url");
      setLocalEmbedUrl(embedUrl);
      setPreviewKey(0);
    }
  }, [sectionId, content, isAppMode, embedMode, embedUrl]);

  // 내부 상태 변경 시 상위로 전파 (상위 → 내부 동기화 없음, 내부가 진실의 원천)
  const handleContentChange = (val: string) => {
    setLocalContent(val);
    onChange(val);
  };
  const handleAppModeChange = (val: boolean) => {
    setLocalIsAppMode(val);
    onAppModeChange(val);
  };
  const handleEmbedModeChange = (val: "html" | "url") => {
    setLocalEmbedMode(val);
    onEmbedModeChange(val);
  };
  const handleEmbedUrlChange = (val: string) => {
    setLocalEmbedUrl(val);
    onEmbedUrlChange(val);
  };

  // 로컬 파일 불러오기: FileReader로 텍스트 읽어 내부 상태에 직접 반영
  const handleFileLoad = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (ev) => {
      const text = ev.target?.result as string;
      const isHtml = file.name.endsWith(".html") || file.name.endsWith(".htm");
      // 내부 상태 즉시 업데이트 (stale 클로저 없음)
      setLocalContent(text);
      if (isHtml) {
        setLocalIsAppMode(true);
        setLocalEmbedMode("html");
      }
      // 상위로 한 번에 전파
      if (onFileLoaded) {
        onFileLoaded(text, isHtml, "html");
      } else {
        onChange(text);
        if (isHtml) {
          onAppModeChange(true);
          onEmbedModeChange("html");
        }
      }
      if (isHtml) {
        toast.success(`HTML 파일을 불러왔습니다. 앱 모드가 자동으로 활성화되었습니다.`);
      }
    };
    reader.readAsText(file);
    e.target.value = "";
  };

  // S3 업로드: 파일을 서버에 저장 후 URL 임베드 탭으로 자동 전환
  const handleS3Upload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    if (uploading) return; // 업로드 중 중복 방지
    const file = e.target.files?.[0];
    if (!file) return;
    e.target.value = "";
    setUploading(true);
    try {
      const formData = new FormData();
      formData.append("file", file);
      const res = await fetch("/api/upload/html", {
        method: "POST",
        body: formData,
        credentials: "include",
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({ error: "업로드 실패" }));
        throw new Error(err.error || "업로드 실패");
      }
      const data = await res.json() as { url: string; filename: string; size: number };
      onEmbedUrlChange(data.url);
      onEmbedModeChange("url");
      toast.success(`"최대 5MB" ${data.filename} S3에 업로드 완료! URL 임베드 모드로 전환되었습니다.`);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "업로드 실패";
      toast.error(msg);
    } finally {
      setUploading(false);
    }
  };

  return (
    <div>
      {/* 모드 탭: 비주얼 편집 / HTML 소스 / URL 임베드 */}
      <div style={{ display: "flex", gap: 0, marginBottom: 10, border: "1px solid #e5e7eb", borderRadius: 8, overflow: "hidden", width: "fit-content" }}>
        <button
          type="button"
          onClick={() => { handleEmbedModeChange("html"); setEditMode("visual"); }}
          style={{
            padding: "5px 14px", fontSize: 12, fontWeight: 600, cursor: "pointer", border: "none",
            background: localEmbedMode === "html" && editMode === "visual" ? "#6366f1" : "#f9fafb",
            color: localEmbedMode === "html" && editMode === "visual" ? "#fff" : "#6b7280",
          }}
        >
          ✏️ 비주얼 편집
        </button>
        <button
          type="button"
          onClick={() => { handleEmbedModeChange("html"); setEditMode("source"); }}
          style={{
            padding: "5px 14px", fontSize: 12, fontWeight: 600, cursor: "pointer", border: "none",
            borderLeft: "1px solid #e5e7eb",
            background: localEmbedMode === "html" && editMode === "source" ? "#6366f1" : "#f9fafb",
            color: localEmbedMode === "html" && editMode === "source" ? "#fff" : "#6b7280",
          }}
        >
          &lt;/&gt; HTML 소스
        </button>
        <button
          type="button"
          onClick={() => handleEmbedModeChange("url")}
          style={{
            padding: "5px 14px", fontSize: 12, fontWeight: 600, cursor: "pointer", border: "none",
            borderLeft: "1px solid #e5e7eb",
            background: localEmbedMode === "url" ? "#6366f1" : "#f9fafb",
            color: localEmbedMode === "url" ? "#fff" : "#6b7280",
          }}
        >
          🔗 URL 임베드
        </button>
      </div>

      {localEmbedMode === "url" ? (
        <div>
          <div style={{
            marginBottom: 8, padding: "6px 10px", borderRadius: 6,
            background: "#eff6ff", border: "1px solid #93c5fd",
            fontSize: 11, color: "#1e40af", lineHeight: 1.6,
          }}>
            🔗 <strong>URL 임베드</strong>: 외부 URL을 iframe으로 삽입합니다. YouTube, CodePen, Google Maps 등 임베드를 허용하는 서비스에서 작동합니다.
          </div>
          <label style={{ fontSize: 11, color: "#6b7280", display: "block", marginBottom: 4, fontWeight: 600 }}>임베드 URL</label>
          <input
            type="url"
            value={localEmbedUrl}
            onChange={e => handleEmbedUrlChange(e.target.value)}
            placeholder="https://www.youtube.com/embed/... 또는 https://codepen.io/..."
            style={{
              width: "100%", padding: "8px 12px", borderRadius: 8,
              border: "1px solid #e5e7eb", fontSize: 12,
              background: "#f8fafc", color: "#374151", outline: "none",
              boxSizing: "border-box",
            }}
          />
          {localEmbedUrl && (
            <div style={{ marginTop: 10 }}>
              <div style={{ fontSize: 11, color: "#6b7280", marginBottom: 4, fontWeight: 600 }}>미리보기</div>
              <iframe
                src={localEmbedUrl}
                style={{ width: "100%", minHeight: 300, border: "1px solid #e5e7eb", borderRadius: 8, display: "block" }}
                allowFullScreen
                title="URL 임베드 미리보기"
                onLoad={(e) => {
                  const iframe = e.currentTarget;
                  try {
                    const doc = iframe.contentDocument || iframe.contentWindow?.document;
                    if (doc?.body) {
                      const ro = new ResizeObserver(() => {
                        const h = doc.documentElement.scrollHeight || doc.body?.scrollHeight || 300;
                        if (h > 100) iframe.style.height = h + "px";
                      });
                      ro.observe(doc.body);
                      iframe.addEventListener("pagehide", () => ro.disconnect(), { once: true });
                    }
                  } catch { /* cross-origin */ }
                }}
              />
            </div>
          )}
        </div>
      ) : (
        <div>
          {/* 비주얼 편집 모드: IframeVisualEditor 사용 (WritePage와 동일한 편집기) */}
          {editMode === "visual" && (
            <div style={{ border: "1px solid #e5e7eb", borderRadius: 8, overflow: "hidden", marginBottom: 8 }}>
              <IframeVisualEditor
                key={`html-section-${sectionId}`}
                value={localContent}
                onChange={handleContentChange}
                minHeight={400}
                isAppMode={localIsAppMode}
                onUploadImage={async (file: File) => {
                  const formData = new FormData();
                  formData.append('file', file);
                  const res = await fetch('/api/upload/image', { method: 'POST', body: formData, credentials: 'include' });
                  if (!res.ok) throw new Error('이미지 업로드 실패');
                  const { url } = await res.json();
                  return url as string;
                }}
              />
            </div>
          )}

          {/* HTML 소스 모드: 툴바 + CodeMirror */}
          {editMode === "source" && (
          <>
          {/* 툴바: HTML 파일 불러오기 + 앱 모드 토글 */}
          <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 8, flexWrap: "wrap" }}>
            <button
              type="button"
              onClick={() => localFileInputRef.current?.click()}
              style={{
                padding: "5px 12px", borderRadius: 6,
                border: "1px solid #6366f1", background: "#eef2ff",
                color: "#4338ca", fontSize: 12, fontWeight: 700, cursor: "pointer",
                display: "flex", alignItems: "center", gap: 5,
              }}
            >
              📂 HTML 파일 불러오기
            </button>
            <input
              ref={localFileInputRef}
              type="file"
              accept=".html,.htm"
              style={{ display: "none" }}
              onChange={handleFileLoad}
            />
            <button
              type="button"
              onClick={() => { if (!uploading) s3FileInputRef.current?.click(); }}
              disabled={uploading}
              style={{
                padding: "5px 12px", borderRadius: 6,
                border: "1px solid #10b981", background: uploading ? "#d1fae5" : "#ecfdf5",
                color: uploading ? "#065f46" : "#047857",
                fontSize: 12, fontWeight: 700,
                cursor: uploading ? "not-allowed" : "pointer",
                display: "flex", alignItems: "center", gap: 5,
                opacity: uploading ? 0.7 : 1,
              }}
            >
              {uploading ? "⏳ 업로드 중..." : "☁️ S3 업로드"}
            </button>
            <input
              ref={s3FileInputRef}
              type="file"
              accept=".html,.htm"
              style={{ display: "none" }}
              onChange={handleS3Upload}
            />
            <button
              type="button"
              onClick={() => handleAppModeChange(!localIsAppMode)}
              title="앱 모드: JavaScript가 포함된 HTML을 iframe에서 실행합니다"
              style={{
                padding: "5px 12px", borderRadius: 6,
                border: localIsAppMode ? "2px solid #f59e0b" : "1px solid #d1d5db",
                background: localIsAppMode ? "#fef3c7" : "#f9fafb",
                color: localIsAppMode ? "#92400e" : "#6b7280",
                fontSize: 12, fontWeight: localIsAppMode ? 700 : 500, cursor: "pointer",
              }}
            >
              {localIsAppMode ? "🟡 앱 모드 ON" : "⚪ 앱 모드 OFF"}
            </button>
          </div>

          {localIsAppMode && (
            <div style={{
              marginBottom: 8, padding: "6px 10px", borderRadius: 6,
              background: "#fef3c7", border: "1px solid #f59e0b",
              fontSize: 11, color: "#92400e", lineHeight: 1.5,
            }}>
              🟡 <strong>앱 모드</strong>: JavaScript가 포함된 HTML이 iframe에서 실행됩니다.
            </div>
          )}

          {/* HTML 소스 에디터 (CodeMirror + 실시간 미리보기) */}
          <div style={{ border: "1px solid #e5e7eb", borderRadius: 8, overflow: "hidden", marginBottom: 8 }}>
            <HtmlSourceEditor
              value={localContent}
              onChange={handleContentChange}
              isAppMode={localIsAppMode}
              minHeight={300}
            />
          </div>

            {/* 앱 모드 ON + 콘텐츠 있을 때 인라인 iframe 미리보기 */}
          {localIsAppMode && localContent.trim() && (
            <div style={{ marginTop: 10 }}>
              <div style={{
                background: "#fef3c7", borderBottom: "1px solid #f59e0b",
                padding: "4px 10px", fontSize: 11, color: "#92400e", fontWeight: 600,
                borderRadius: "8px 8px 0 0",
                display: "flex", alignItems: "center", justifyContent: "space-between",
              }}>
                <span>🟡 앱 모드 미리보기 — JavaScript가 실제로 실행됩니다.</span>
                <div style={{ display: "flex", gap: 6 }}>
                  <button
                    type="button"
                    onClick={() => setPreviewKey(k => k + 1)}
                    style={{ padding: "2px 8px", borderRadius: 5, border: "1px solid #f59e0b", background: "#fff", color: "#92400e", fontSize: 11, fontWeight: 700, cursor: "pointer" }}
                  >
                    🔄 미리보기 갱신
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      const blob = new Blob([localContent], { type: "text/html" });
                      const url = URL.createObjectURL(blob);
                      window.open(url, "_blank");
                      setTimeout(() => URL.revokeObjectURL(url), 10000);
                    }}
                    style={{ padding: "2px 8px", borderRadius: 5, border: "1px solid #6366f1", background: "#eef2ff", color: "#4338ca", fontSize: 11, fontWeight: 700, cursor: "pointer" }}
                  >
                    🔗 새 탭
                  </button>
                </div>
              </div>
              <iframe
                key={previewKey}
                srcDoc={localContent}
                style={{
                  width: "100%", minHeight: 300, border: "1px solid #f59e0b",
                  borderTop: "none", borderRadius: "0 0 8px 8px", display: "block",
                }}
                sandbox="allow-scripts allow-same-origin allow-forms allow-modals allow-popups"
                title="앱 모드 미리보기"
                onLoad={(e) => {
                  const iframe = e.currentTarget;
                  const setH = () => {
                    try {
                      const doc = iframe.contentDocument || iframe.contentWindow?.document;
                      if (doc) {
                        const h = doc.documentElement.scrollHeight || doc.body?.scrollHeight || 300;
                        if (h > 100) iframe.style.height = h + "px";
                      }
                    } catch { /* cross-origin */ }
                  };
                  setH();
                  try {
                    const doc = iframe.contentDocument || iframe.contentWindow?.document;
                    if (doc?.body) {
                      const ro = new ResizeObserver(() => setH());
                      ro.observe(doc.body);
                      iframe.addEventListener("pagehide", () => ro.disconnect(), { once: true });
                    }
                  } catch { /* cross-origin */ }
                }}
              />
            </div>
          )}
          </>
          )}
        </div>
      )}
    </div>
  );
}

// ─── 섹션 편집기 ──────────────────────────────────────────────
function SectionEditor({section,
  onChange,
  onDelete,
  onMoveUp,
  onMoveDown,
  isFirst,
  isLast,
}: {
  section: PageSection;
  onChange: (s: PageSection) => void;
  onDelete: () => void;
  onMoveUp: () => void;
  onMoveDown: () => void;
  isFirst: boolean;
  isLast: boolean;
}) {
  const [expanded, setExpanded] = useState(true);
  const sectionMeta = SECTION_TYPES.find(t => t.type === section.type);

  const update = (patch: Partial<PageSection>) => onChange({ ...section, ...patch });
  const updateSettings = (patch: Partial<PageSection["settings"]>) =>
    onChange({ ...section, settings: { ...section.settings, ...patch } });

  return (
    <div style={{
      border: "1px solid #e5e7eb", borderRadius: 10, marginBottom: 12,
      background: "#fff", overflow: "hidden",
    }}>
      {/* 섹션 헤더 */}
      <div style={{
        display: "flex", alignItems: "center", gap: 8, padding: "10px 14px",
        background: "#f9fafb", borderBottom: expanded ? "1px solid #e5e7eb" : "none",
        cursor: "pointer",
      }} onClick={() => setExpanded(!expanded)}>
        <GripVertical size={14} color="#9ca3af" />
        <span style={{ color: "#6366f1", display: "flex", alignItems: "center" }}>{sectionMeta?.icon}</span>
        <span style={{ fontSize: 13, fontWeight: 600, color: "#374151", flex: 1 }}>
          {sectionMeta?.label}
          <span style={{ fontSize: 11, color: "#9ca3af", marginLeft: 8 }}>{sectionMeta?.desc}</span>
        </span>
        <div style={{ display: "flex", gap: 4 }} onClick={e => e.stopPropagation()}>
          <button onClick={onMoveUp} disabled={isFirst} title="위로"
            style={{ padding: "3px 6px", border: "1px solid #e5e7eb", borderRadius: 5, background: "#fff", cursor: isFirst ? "not-allowed" : "pointer", opacity: isFirst ? 0.4 : 1 }}>
            <ChevronUp size={12} />
          </button>
          <button onClick={onMoveDown} disabled={isLast} title="아래로"
            style={{ padding: "3px 6px", border: "1px solid #e5e7eb", borderRadius: 5, background: "#fff", cursor: isLast ? "not-allowed" : "pointer", opacity: isLast ? 0.4 : 1 }}>
            <ChevronDown size={12} />
          </button>
          <button onClick={onDelete} title="삭제"
            style={{ padding: "3px 6px", border: "1px solid #fecaca", borderRadius: 5, background: "#fff", cursor: "pointer", color: "#ef4444" }}>
            <Trash2 size={12} />
          </button>
        </div>
        <span style={{ color: "#9ca3af", fontSize: 12 }}>{expanded ? "▲" : "▼"}</span>
      </div>

      {/* 섹션 내용 편집 */}
      {expanded && (
        <div style={{ padding: "14px 16px" }}>
          {/* 공통 설정 */}
          <div style={{ display: "flex", gap: 10, marginBottom: 12, flexWrap: "wrap" }}>
            <div>
              <label style={{ fontSize: 11, color: "#6b7280", display: "block", marginBottom: 3 }}>배경색</label>
              <input type="color" value={section.settings.bgColor || "#ffffff"}
                onChange={e => updateSettings({ bgColor: e.target.value })}
                style={{ width: 40, height: 28, border: "1px solid #e5e7eb", borderRadius: 5, cursor: "pointer" }} />
            </div>
            {section.type !== "divider" && section.type !== "html" && section.type !== "vibe-apps" && (
              <div>
                <label style={{ fontSize: 11, color: "#6b7280", display: "block", marginBottom: 3 }}>정렬</label>
                <select value={section.settings.textAlign || "left"}
                  onChange={e => updateSettings({ textAlign: e.target.value as "left" | "center" | "right" })}
                  style={{ fontSize: 12, border: "1px solid #e5e7eb", borderRadius: 5, padding: "4px 8px" }}>
                  <option value="left">왼쪽</option>
                  <option value="center">가운데</option>
                  <option value="right">오른쪽</option>
                </select>
              </div>
            )}
            <div>
              <label style={{ fontSize: 11, color: "#6b7280", display: "block", marginBottom: 3 }}>여백</label>
              <select value={section.settings.padding || "md"}
                onChange={e => updateSettings({ padding: e.target.value as "sm" | "md" | "lg" })}
                style={{ fontSize: 12, border: "1px solid #e5e7eb", borderRadius: 5, padding: "4px 8px" }}>
                <option value="sm">좁게</option>
                <option value="md">보통</option>
                <option value="lg">넓게</option>
              </select>
            </div>
          </div>

          {/* 섹션 타입별 편집 UI */}
          {section.type === "hero" && (
            <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
              <div>
                <label style={{ fontSize: 11, color: "#6b7280", display: "block", marginBottom: 3 }}>큰 제목</label>
                <Input value={section.settings.heroTitle || ""} placeholder="히어로 제목"
                  onChange={e => updateSettings({ heroTitle: e.target.value })} style={{ fontSize: 13 }} />
              </div>
              <div>
                <label style={{ fontSize: 11, color: "#6b7280", display: "block", marginBottom: 3 }}>부제목</label>
                <Input value={section.settings.heroSubtitle || ""} placeholder="히어로 부제목"
                  onChange={e => updateSettings({ heroSubtitle: e.target.value })} style={{ fontSize: 13 }} />
              </div>
              <div style={{ display: "flex", gap: 10 }}>
                <div style={{ flex: 1 }}>
                  <label style={{ fontSize: 11, color: "#6b7280", display: "block", marginBottom: 3 }}>버튼 텍스트</label>
                  <Input value={section.settings.heroButtonText || ""} placeholder="시작하기"
                    onChange={e => updateSettings({ heroButtonText: e.target.value })} style={{ fontSize: 13 }} />
                </div>
                <div style={{ flex: 1 }}>
                  <label style={{ fontSize: 11, color: "#6b7280", display: "block", marginBottom: 3 }}>버튼 URL</label>
                  <Input value={section.settings.heroButtonUrl || ""} placeholder="/category/ai-apps"
                    onChange={e => updateSettings({ heroButtonUrl: e.target.value })} style={{ fontSize: 13 }} />
                </div>
              </div>
              <div>
                <label style={{ fontSize: 11, color: "#6b7280", display: "block", marginBottom: 3 }}>배경 이미지 URL (선택)</label>
                <Input value={section.settings.imageUrl || ""} placeholder="https://..."
                  onChange={e => updateSettings({ imageUrl: e.target.value })} style={{ fontSize: 13 }} />
              </div>
            </div>
          )}

          {section.type === "text" && (
            <div>
              <label style={{ fontSize: 11, color: "#6b7280", display: "block", marginBottom: 6 }}>본문 내용</label>
              <RichEditor content={section.content} onChange={html => update({ content: html })}
                placeholder="페이지 내용을 입력하세요..." minHeight={200} />
            </div>
          )}

          {section.type === "image" && (
            <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
              <div>
                <label style={{ fontSize: 11, color: "#6b7280", display: "block", marginBottom: 3 }}>이미지 URL</label>
                <Input value={section.settings.imageUrl || ""} placeholder="https://..."
                  onChange={e => updateSettings({ imageUrl: e.target.value })} style={{ fontSize: 13 }} />
              </div>
              <div>
                <label style={{ fontSize: 11, color: "#6b7280", display: "block", marginBottom: 3 }}>이미지 설명 (alt)</label>
                <Input value={section.settings.imageAlt || ""} placeholder="이미지 설명"
                  onChange={e => updateSettings({ imageAlt: e.target.value })} style={{ fontSize: 13 }} />
              </div>
              <div>
                <label style={{ fontSize: 11, color: "#6b7280", display: "block", marginBottom: 3 }}>캡션 (선택)</label>
                <Input value={section.content} placeholder="이미지 캡션"
                  onChange={e => update({ content: e.target.value })} style={{ fontSize: 13 }} />
              </div>
              {section.settings.imageUrl && (
                <img loading="lazy" src={section.settings.imageUrl} alt={section.settings.imageAlt || ""}
                  style={{ maxWidth: 300, maxHeight: 200, objectFit: "cover", borderRadius: 8, border: "1px solid #e5e7eb" }} />
              )}
            </div>
          )}

          {section.type === "columns" && (
            <div>
              <label style={{ fontSize: 11, color: "#6b7280", display: "block", marginBottom: 6 }}>왼쪽 컬럼</label>
              <RichEditor
                content={section.settings.columns?.[0] || ""}
                onChange={html => {
                  const cols = [...(section.settings.columns || ["", ""])];
                  cols[0] = html;
                  updateSettings({ columns: cols });
                }}
                placeholder="왼쪽 내용..." minHeight={150} />
              <label style={{ fontSize: 11, color: "#6b7280", display: "block", marginBottom: 6, marginTop: 12 }}>오른쪽 컬럼</label>
              <RichEditor
                content={section.settings.columns?.[1] || ""}
                onChange={html => {
                  const cols = [...(section.settings.columns || ["", ""])];
                  cols[1] = html;
                  updateSettings({ columns: cols });
                }}
                placeholder="오른쪽 내용..." minHeight={150} />
            </div>
          )}

          {section.type === "button" && (
            <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
              <div style={{ flex: 1, minWidth: 150 }}>
                <label style={{ fontSize: 11, color: "#6b7280", display: "block", marginBottom: 3 }}>버튼 텍스트</label>
                <Input value={section.settings.buttonText || ""} placeholder="더 알아보기"
                  onChange={e => updateSettings({ buttonText: e.target.value })} style={{ fontSize: 13 }} />
              </div>
              <div style={{ flex: 1, minWidth: 150 }}>
                <label style={{ fontSize: 11, color: "#6b7280", display: "block", marginBottom: 3 }}>링크 URL</label>
                <Input value={section.settings.buttonUrl || ""} placeholder="/category/ai-apps"
                  onChange={e => updateSettings({ buttonUrl: e.target.value })} style={{ fontSize: 13 }} />
              </div>
              <div>
                <label style={{ fontSize: 11, color: "#6b7280", display: "block", marginBottom: 3 }}>스타일</label>
                <select value={section.settings.buttonStyle || "primary"}
                  onChange={e => updateSettings({ buttonStyle: e.target.value as "primary" | "outline" | "ghost" })}
                  style={{ fontSize: 12, border: "1px solid #e5e7eb", borderRadius: 5, padding: "4px 8px" }}>
                  <option value="primary">채우기</option>
                  <option value="outline">테두리</option>
                  <option value="ghost">텍스트</option>
                </select>
              </div>
            </div>
          )}

          {section.type === "divider" && (
            <div style={{ padding: "10px 0", textAlign: "center", color: "#9ca3af", fontSize: 12 }}>
              ── 구분선이 여기에 표시됩니다 ──
            </div>
          )}

          {section.type === "html" && (
            <HtmlSectionEditor
              sectionId={section.id}
              content={section.content}
              isAppMode={!!section.settings.isAppMode}
              embedMode={(section.settings.embedMode as "html" | "url") || "html"}
              embedUrl={section.settings.embedUrl || ""}
              onChange={(content: string) => update({ content })}
              onAppModeChange={(isAppMode: boolean) => updateSettings({ isAppMode })}
              onEmbedModeChange={(embedMode: "html" | "url") => updateSettings({ embedMode })}
              onEmbedUrlChange={(embedUrl: string) => updateSettings({ embedUrl })}
              onFileLoaded={(fileContent, fileIsAppMode, fileEmbedMode) => {
                // content + settings를 한 번에 업데이트하여 React 상태 덮어쓰기 방지
                onChange({ ...section, content: fileContent, settings: { ...section.settings, isAppMode: fileIsAppMode, embedMode: fileEmbedMode } });
              }}
            />
          )}
        </div>
      )}
    </div>


  );
}

// ─── 페이지 에디터 ─────────────────────────────────────────────────────────────
// ─── 인라인 미리보기 섹션 렌더러 ─────────────────────────────────────────────
const PREVIEW_PADDING: Record<string, string> = { sm: "16px 24px", md: "36px 24px", lg: "64px 24px" };
function PreviewSection({ section }: { section: PageSection }) {
  const bg = section.settings.bgColor || "#ffffff";
  const align = section.settings.textAlign || "left";
  const padding = PREVIEW_PADDING[section.settings.padding || "md"];
  const wrapStyle: React.CSSProperties = { background: bg, padding, textAlign: align as "left" | "center" | "right" };
  if (section.type === "hero") {
    const { heroTitle, heroSubtitle, heroButtonText, heroButtonUrl, imageUrl } = section.settings;
    return (
      <section style={{ ...wrapStyle, backgroundImage: imageUrl ? "linear-gradient(rgba(0,0,0,0.5),rgba(0,0,0,0.5)),url(" + imageUrl + ")" : undefined, backgroundSize: "cover", backgroundPosition: "center", color: imageUrl ? "#fff" : "#111827", textAlign: "center" }}>
        <div style={{ maxWidth: 700, margin: "0 auto" }}>
          {heroTitle && <h1 style={{ fontSize: "clamp(24px,4vw,40px)", fontWeight: 800, marginBottom: 12, lineHeight: 1.2 }}>{heroTitle}</h1>}
          {heroSubtitle && <p style={{ fontSize: "clamp(14px,2vw,18px)", opacity: 0.85, marginBottom: 24, lineHeight: 1.6 }}>{heroSubtitle}</p>}
          {heroButtonText && <a href={heroButtonUrl || "#"} style={{ display: "inline-block", padding: "10px 24px", background: "#6366f1", color: "#fff", borderRadius: 8, fontWeight: 700, fontSize: 14, textDecoration: "none" }}>{heroButtonText}</a>}
        </div>
      </section>
    );
  }
  if (section.type === "text") {
    return <section style={wrapStyle}><div style={{ maxWidth: 960, margin: "0 auto" }}><div className="rich-preview" dangerouslySetInnerHTML={{ __html: section.content }} /></div></section>;
  }
  if (section.type === "image") {
    const { imageUrl, imageAlt } = section.settings;
    return <section style={wrapStyle}><div style={{ maxWidth: 960, margin: "0 auto" }}>{imageUrl ? <img loading="lazy" src={imageUrl} alt={imageAlt || ""} style={{ maxWidth: "100%", borderRadius: 10, display: "block", margin: "0 auto" }} /> : <div style={{ padding: 40, border: "2px dashed #e5e7eb", borderRadius: 10, color: "#9ca3af", textAlign: "center", fontSize: 13 }}>이미지 URL을 입력하세요</div>}</div></section>;
  }
  if (section.type === "button") {
    const { buttonText, buttonUrl, buttonStyle } = section.settings;
    const btnStyles: Record<string, React.CSSProperties> = {
      primary: { background: "#6366f1", color: "#fff", border: "none" },
      outline: { background: "transparent", color: "#6366f1", border: "2px solid #6366f1" },
      ghost: { background: "transparent", color: "#374151", border: "1px solid #e5e7eb" },
    };
    return <section style={wrapStyle}><div style={{ maxWidth: 960, margin: "0 auto" }}><a href={buttonUrl || "#"} style={{ display: "inline-block", padding: "10px 24px", borderRadius: 8, fontWeight: 700, fontSize: 14, textDecoration: "none", cursor: "pointer", ...(btnStyles[buttonStyle || "primary"]) }}>{buttonText || "버튼"}</a></div></section>;
  }
  if (section.type === "divider") {
    return <section style={wrapStyle}><hr style={{ border: "none", borderTop: "1px solid #e5e7eb", maxWidth: 960, margin: "0 auto" }} /></section>;
  }
  if (section.type === "html") {
    // URL 임베드 모드
    if (section.settings.embedMode === "url" && section.settings.embedUrl) {
      return (
        <section style={wrapStyle}>
          <div style={{ maxWidth: 960, margin: "0 auto" }}>
            <iframe
              src={section.settings.embedUrl}
              style={{ width: "100%", minHeight: 400, border: "none", display: "block" }}
              allowFullScreen
              title="URL 임베드"
              onLoad={(e) => {
                const iframe = e.currentTarget;
                try {
                  const doc = iframe.contentDocument || iframe.contentWindow?.document;
                  if (doc?.body) {
                    const ro = new ResizeObserver(() => {
                      const h = doc.documentElement.scrollHeight || doc.body?.scrollHeight || 400;
                      if (h > 100) iframe.style.height = h + "px";
                    });
                    ro.observe(doc.body);
                    iframe.addEventListener("pagehide", () => ro.disconnect(), { once: true });
                  }
                } catch { /* cross-origin */ }
              }}
            />
          </div>
        </section>
      );
    }
    // HTML 소스 + 앱 모드
    if (section.settings.isAppMode && section.content.trim()) {
      return (
        <section style={wrapStyle}>
          <div style={{ maxWidth: 960, margin: "0 auto" }}>
            <div style={{ background: "#fef3c7", borderBottom: "1px solid #f59e0b", padding: "4px 10px", fontSize: 11, color: "#92400e", fontWeight: 600 }}>
              🟡 앱 모드 미리보기 — JavaScript가 실제로 실행됩니다.
            </div>
            <iframe
              srcDoc={section.content}
              style={{ width: "100%", minHeight: 400, border: "none", display: "block" }}
              sandbox="allow-scripts allow-same-origin allow-forms allow-modals allow-popups"
              title="HTML 앱 미리보기"
              onLoad={(e) => {
                const iframe = e.currentTarget;
                const setH = () => {
                  try {
                    const doc = iframe.contentDocument || iframe.contentWindow?.document;
                    if (doc) {
                      const h = doc.documentElement.scrollHeight || doc.body?.scrollHeight || 400;
                      if (h > 100) iframe.style.height = h + "px";
                    }
                  } catch { /* cross-origin */ }
                };
                setH();
                try {
                  const doc = iframe.contentDocument || iframe.contentWindow?.document;
                  if (doc?.body) {
                    const ro = new ResizeObserver(() => setH());
                    ro.observe(doc.body);
                    iframe.addEventListener("pagehide", () => ro.disconnect(), { once: true });
                  }
                } catch { /* cross-origin */ }
              }}
            />
          </div>
        </section>
      );
    }
    return <section style={wrapStyle}><div style={{ maxWidth: 960, margin: "0 auto" }} dangerouslySetInnerHTML={{ __html: section.content }} /></section>;
  }
  if (section.type === "columns") {
    const cols = section.settings.columns || [];
    return (
      <section style={wrapStyle}>
        <div style={{ maxWidth: 960, margin: "0 auto", display: "grid", gridTemplateColumns: "repeat(" + Math.max(cols.length, 1) + ", 1fr)", gap: 20 }}>
          {cols.map((col, i) => <div key={i} className="rich-preview" dangerouslySetInnerHTML={{ __html: col }} />)}
        </div>
      </section>
    );
  }
  if (section.type === "vibe-apps") {
    return (
      <section style={wrapStyle}>
        <div style={{ maxWidth: 960, margin: "0 auto", padding: "20px", background: "#f3f4f6", borderRadius: 8, textAlign: "center", color: "#6b7280", fontSize: 13 }}>
          📱 DB 연동 앱 목록 섹션 — 실제 페이지에서 동적으로 렌더링됩니다.
        </div>
      </section>
    );
  }
  return null;
}

function PageEditor({
  page,
  onBack,
  onSaved,
  existingSlugs = [],
}: {
  page: CustomPage | null; // null이면 새 페이지 생성
  onBack: () => void;
  onSaved: () => void;
  existingSlugs?: string[];
}) {
  const isNew = !page;
  // 새 페이지 초기 슬러그: page01, page02... 중 기존 슬러그와 겹치지 않는 것 자동 선택
  const autoPageSlug = (() => {
    const usedSet = new Set(existingSlugs);
    let n = 1;
    while (usedSet.has(`page${String(n).padStart(2, "0")}`)) n++;
    return `page${String(n).padStart(2, "0")}`;
  })();
  const [title, setTitle] = useState(page?.title || "");
  const [slug, setSlug] = useState(page?.slug || (isNew ? autoPageSlug : ""));
  // CSS 변수값(--xxx:#yyy;) 패턴이 섞여 들어오는 경우 제거
  const sanitizeDescription = (raw: string) =>
    raw
      .replace(/--[a-zA-Z0-9-]+\s*:\s*[^;,}]+[;,}]?/g, "")
      .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, "")
      .replace(/<[^>]+>/g, " ")
      .replace(/\s+/g, " ")
      .trim();
  const [description, setDescription] = useState(sanitizeDescription(page?.description || ""));
  const [published, setPublished] = useState(page?.published ?? false);
  const [showInNav, setShowInNav] = useState(page?.showInNav ?? false);
  const [hideSidebar, setHideSidebar] = useState(page?.hideSidebar ?? false);
  const [hideChrome, setHideChrome] = useState(page?.hideChrome ?? false);
  const [contentWidth, setContentWidth] = useState<number>(page?.contentWidth ?? 960);
  const [fullscreenDefault, setFullscreenDefault] = useState(page?.fullscreenDefault ?? false);
  const [showTitle, setShowTitle] = useState(page?.showTitle ?? true);
  const [showDescription, setShowDescription] = useState(page?.showDescription ?? true);
  const [titleAlign, setTitleAlign] = useState<"left" | "center" | "right">((page?.titleAlign as "left" | "center" | "right") ?? "left");
  const [membersOnly, setMembersOnly] = useState(page?.membersOnly ?? false);
  const [postListCategory, setPostListCategory] = useState<string>(page?.postListCategory ?? "");
  const [thumbnail, setThumbnail] = useState<string>(page?.thumbnail ?? "");
  const [thumbnailUploading, setThumbnailUploading] = useState(false);
  const thumbnailFileRef = useRef<HTMLInputElement>(null);
  const [sections, setSections] = useState<PageSection[]>(() => {
    if (!page?.sectionsJson) return [];
    try { return JSON.parse(page.sectionsJson); } catch { return []; }
  });
  const [showSectionPicker, setShowSectionPicker] = useState(false);
  const [saving, setSaving] = useState(false);
  const [showPreview, setShowPreview] = useState(false);

  const utils = trpc.useUtils();
  const createMutation = trpc.pages.create.useMutation();
  const updateMutation = trpc.pages.update.useMutation();
  const { data: navItems } = trpc.admin.getNavItems.useQuery();

  // 제목에서 slug 자동 생성 (새 페이지만)
  const autoSlug = (t: string) => {
    return t.toLowerCase()
      .replace(/[^a-z0-9\s-]/g, "")
      .trim()
      .replace(/\s+/g, "-")
      .replace(/-+/g, "-")
      .slice(0, 60);
  };

  // 썸네일 업로드 핸들러
  const handleThumbnailUpload = async (file: File) => {
    if (file.size > 5 * 1024 * 1024) {
      toast.error("이미지 크기가 너무 큽니다. 5MB 이하의 파일만 업로드할 수 있습니다.");
      return;
    }
    setThumbnailUploading(true);
    try {
      const formData = new FormData();
      formData.append("file", file);
      const res = await fetch("/api/upload/image", {
        method: "POST",
        body: formData,
        credentials: "include",
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({ error: "업로드 실패" }));
        throw new Error(err.error || "업로드 실패");
      }
      const data = await res.json();
      setThumbnail(data.url);
      toast.success("썸네일이 업로드되었습니다.");
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : "썸네일 업로드 실패");
    } finally {
      setThumbnailUploading(false);
    }
  };

  const handleTitleChange = (v: string) => {
    setTitle(v);
    if (isNew && !slug) setSlug(autoSlug(v));
  };

  const addSection = (type: SectionType) => {
    setSections(prev => [...prev, createSection(type)]);
    setShowSectionPicker(false);
  };

  const updateSection = useCallback((id: string, updated: PageSection) => {
    setSections(prev => prev.map(s => s.id === id ? updated : s));
  }, []);

  const deleteSection = (id: string) => {
    setSections(prev => prev.filter(s => s.id !== id));
  };

  const moveSection = (idx: number, dir: -1 | 1) => {
    setSections(prev => {
      const arr = [...prev];
      const target = idx + dir;
      if (target < 0 || target >= arr.length) return arr;
      [arr[idx], arr[target]] = [arr[target], arr[idx]];
      return arr;
    });
  };

  // 섯션 내용에서 텍스트 추출 (HTML 태그 제거 후 200자)
  const extractDescriptionFromSections = (secs: PageSection[]): string => {
    const texts: string[] = [];
    for (const sec of secs) {
      if (sec.type === "hero") {
        if (sec.settings.heroTitle) texts.push(sec.settings.heroTitle);
        if (sec.settings.heroSubtitle) texts.push(sec.settings.heroSubtitle);
      } else if (sec.type === "text" || sec.type === "html") {
        // style/script 태그 내용 먼저 제거 후 HTML 태그 제거
        const plain = sec.content
          .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, "")
          .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, "")
          .replace(/<[^>]+>/g, " ")
          .replace(/&[a-z#0-9]+;/gi, " ")
          .replace(/\s+/g, " ")
          .trim();
        if (plain) texts.push(plain);
      } else if (sec.type === "columns") {
        if (sec.settings.columns) {
          for (const col of sec.settings.columns) {
            const plain = col
              .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, "")
              .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, "")
              .replace(/<[^>]+>/g, " ")
              .replace(/&[a-z#0-9]+;/gi, " ")
              .replace(/\s+/g, " ")
              .trim();
            if (plain) texts.push(plain);
          }
        }
      } else if (sec.type === "button") {
        if (sec.settings.buttonText) texts.push(sec.settings.buttonText);
      } else if (sec.type === "vibe-apps") {
        texts.push("앱 목록");
      }
    }
    const combined = texts.join(" ").replace(/\s+/g, " ").trim();
    return combined.length > 200 ? combined.slice(0, 197) + "..." : combined;
  };

  const handleSave = async (pub?: boolean) => {
    if (!title.trim()) { toast.error("제목을 입력하세요"); return; }
    if (!slug.trim()) { toast.error("URL 슬러그를 입력하세요"); return; }
    if (!/^[a-z0-9-]+$/.test(slug)) { toast.error("슬러그는 영소문자, 숫자, 하이픈만 허용됩니다"); return; }
    setSaving(true);
    // 설명이 비어있으면 섯션 내용에서 자동 생성
    const finalDescription = description.trim() || extractDescriptionFromSections(sections);
    try {
      const sectionsJson = JSON.stringify(sections);
      const publishedVal = pub !== undefined ? pub : published;
      if (isNew) {
        await createMutation.mutateAsync({ title, slug, description: finalDescription, sectionsJson, published: publishedVal, showInNav, hideSidebar, hideChrome, contentWidth, fullscreenDefault, showTitle, showDescription, titleAlign, membersOnly, postListCategory: postListCategory || null, thumbnail: thumbnail || null });
        toast.success("페이지가 생성되었습니다");
      } else {
        await updateMutation.mutateAsync({ id: page!.id, title, slug, description: finalDescription, sectionsJson, published: publishedVal, showInNav, hideSidebar, hideChrome, contentWidth, fullscreenDefault, showTitle, showDescription, titleAlign, membersOnly, postListCategory: postListCategory || null, thumbnail: thumbnail || null });
        toast.success("페이지가 저장되었습니다");
      }
      utils.pages.getNavList.invalidate();
      utils.pages.adminList.invalidate();
      onSaved();
    } catch (e: any) {
      toast.error(e?.message || "저장 실패");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div>
      {/* 에디터 헤더 */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10, marginBottom: 20 }}>
        {/* 좌: 목록으로 버튼 */}
        <button onClick={onBack}
          style={{ display: "flex", alignItems: "center", gap: 5, padding: "6px 12px", border: "1px solid #e5e7eb", borderRadius: 7, background: "#fff", cursor: "pointer", fontSize: 13, color: "#374151", flexShrink: 0 }}>
          <ArrowLeft size={14} /> 목록으로
        </button>
        {/* 중: 제목 */}
        <h2 style={{ fontSize: 16, fontWeight: 700, color: "#111827", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis", flex: 1, textAlign: "center", margin: 0 }}>
          {isNew ? "새 페이지 만들기" : `페이지 편집: ${page?.title}`}
        </h2>
        {/* 우: 액션 버튼들 */}
        <div style={{ display: "flex", gap: 8, flexShrink: 0 }}>
          <button onClick={() => setShowPreview(true)}
            style={{ display: "flex", alignItems: "center", gap: 4, padding: "6px 12px", border: "1px solid #6366f1", borderRadius: 7, background: "#f5f3ff", cursor: "pointer", fontSize: 12, color: "#6366f1", fontWeight: 600 }}>
            <Eye size={13} /> 미리보기
          </button>
          {!isNew && page?.slug && (
            <a
              href={page.published ? `/page/${page.slug}` : `/page/${page.slug}?preview=true`}
              target="_blank" rel="noopener noreferrer"
              title={page.published ? "발행된 페이지 열기" : "비공개 페이지 미리보기 (관리자 전용)"}
              style={{ display: "flex", alignItems: "center", gap: 4, padding: "6px 12px", border: page.published ? "1px solid #e5e7eb" : "1px solid #fbbf24", borderRadius: 7, background: page.published ? "#fff" : "#fffbeb", fontSize: 12, color: page.published ? "#6b7280" : "#d97706", textDecoration: "none" }}>
              <ExternalLink size={13} /> {page.published ? "발행 페이지 열기" : "비공개 미리보기"}
            </a>
          )}
          <button onClick={() => handleSave(false)} disabled={saving}
            style={{ display: "flex", alignItems: "center", gap: 5, padding: "6px 14px", border: "1px solid #e5e7eb", borderRadius: 7, background: "#fff", cursor: saving ? "not-allowed" : "pointer", fontSize: 13, color: "#374151" }}>
            <Save size={13} /> 임시저장
          </button>
          <button onClick={() => handleSave(true)} disabled={saving}
            style={{ display: "flex", alignItems: "center", gap: 5, padding: "6px 14px", border: "none", borderRadius: 7, background: published ? "linear-gradient(135deg, #10b981, #059669)" : "linear-gradient(135deg, #6366f1, #8b5cf6)", cursor: saving ? "not-allowed" : "pointer", fontSize: 13, color: "#fff", fontWeight: 600 }}>
            {saving ? <RefreshCw size={13} className="animate-spin" /> : published ? <Globe size={13} /> : <Globe size={13} />}
            {published ? "발행 저장" : "발행"}
          </button>
        </div>
      </div>

      <div style={{ display: "flex", gap: 20, alignItems: "flex-start" }}>
        {/* 왼쪽: 섹션 빌더 */}
        <div style={{ flex: 1, minWidth: 0 }}>
          {/* 섹션 목록 */}
          {sections.length === 0 && (
            <div style={{ textAlign: "center", padding: "40px 20px", border: "2px dashed #e5e7eb", borderRadius: 12, color: "#9ca3af", marginBottom: 16 }}>
              <LayoutGrid size={32} style={{ margin: "0 auto 10px", display: "block", opacity: 0.4 }} />
              <p style={{ fontSize: 14, marginBottom: 4 }}>아직 섹션이 없습니다</p>
              <p style={{ fontSize: 12 }}>아래 버튼으로 섹션을 추가하세요</p>
            </div>
          )}
          {sections.map((section, idx) => (
            <SectionEditor
              key={section.id}
              section={section}
              onChange={updated => updateSection(section.id, updated)}
              onDelete={() => deleteSection(section.id)}
              onMoveUp={() => moveSection(idx, -1)}
              onMoveDown={() => moveSection(idx, 1)}
              isFirst={idx === 0}
              isLast={idx === sections.length - 1}
            />
          ))}

          {/* 섹션 추가 버튼 */}
          {!showSectionPicker ? (
            <button onClick={() => setShowSectionPicker(true)}
              style={{ width: "100%", padding: "12px", border: "2px dashed #6366f1", borderRadius: 10, background: "rgba(99,102,241,0.04)", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", gap: 8, fontSize: 13, color: "#6366f1", fontWeight: 600 }}>
              <Plus size={16} /> 섹션 추가
            </button>
          ) : (
            <div style={{ border: "1px solid #e5e7eb", borderRadius: 12, padding: 16, background: "#fff" }}>
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 12 }}>
                <span style={{ fontSize: 13, fontWeight: 600, color: "#374151" }}>섹션 유형 선택</span>
                <button onClick={() => setShowSectionPicker(false)} style={{ border: "none", background: "none", cursor: "pointer", color: "#9ca3af" }}>
                  <X size={16} />
                </button>
              </div>
              <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(140px, 1fr))", gap: 8 }}>
                {SECTION_TYPES.map(st => (
                  <button key={st.type} onClick={() => addSection(st.type)}
                    style={{ padding: "10px 12px", border: "1px solid #e5e7eb", borderRadius: 8, background: "#f9fafb", cursor: "pointer", textAlign: "left", transition: "all 0.15s" }}
                    onMouseEnter={e => { (e.currentTarget as HTMLButtonElement).style.borderColor = "#6366f1"; (e.currentTarget as HTMLButtonElement).style.background = "rgba(99,102,241,0.05)"; }}
                    onMouseLeave={e => { (e.currentTarget as HTMLButtonElement).style.borderColor = "#e5e7eb"; (e.currentTarget as HTMLButtonElement).style.background = "#f9fafb"; }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 4, color: "#6366f1" }}>{st.icon}</div>
                    <div style={{ fontSize: 12, fontWeight: 600, color: "#374151" }}>{st.label}</div>
                    <div style={{ fontSize: 11, color: "#9ca3af" }}>{st.desc}</div>
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* 오른쪽: 페이지 설정 */}
        <div style={{ width: 220, flexShrink: 0 }}>
          <div style={{ border: "1px solid #e5e7eb", borderRadius: 10, padding: 16, background: "#fff", marginBottom: 12 }}>
            <h3 style={{ fontSize: 13, fontWeight: 700, color: "#374151", marginBottom: 12 }}>페이지 정보</h3>
            <div style={{ marginBottom: 10 }}>
              <label style={{ fontSize: 11, color: "#6b7280", display: "block", marginBottom: 4 }}>제목 *</label>
              <Input value={title} onChange={e => handleTitleChange(e.target.value)} placeholder="페이지 제목" style={{ fontSize: 13 }} />
            </div>
            <div style={{ marginBottom: 10 }}>
              <label style={{ fontSize: 11, color: "#6b7280", display: "block", marginBottom: 4 }}>URL 슬러그 *</label>
              <div style={{ display: "flex", alignItems: "center", gap: 4 }}>
                <span style={{ fontSize: 11, color: "#9ca3af", whiteSpace: "nowrap" }}>/page/</span>
                <Input value={slug} onChange={e => setSlug(e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, ""))}
                  placeholder="about" style={{ fontSize: 13 }} />
              </div>
              <p style={{ fontSize: 10, color: "#9ca3af", marginTop: 3 }}>영소문자, 숫자, 하이픈만 허용</p>
            </div>
            <div style={{ marginBottom: 10 }}>
              <label style={{ fontSize: 11, color: "#6b7280", display: "block", marginBottom: 4 }}>설명 (선택)</label>
              <textarea value={description} onChange={e => setDescription(e.target.value)}
                placeholder="페이지 설명 (SEO, 검색용)"
                style={{ width: "100%", minHeight: 60, fontSize: 12, border: "1px solid #e5e7eb", borderRadius: 7, padding: "6px 10px", resize: "vertical", outline: "none" }} />
            </div>
          </div>

          {/* 썸네일 업로드 패널 */}
          <div style={{ border: "1px solid #e5e7eb", borderRadius: 10, padding: 16, background: "#fff", marginBottom: 12 }}>
            <h3 style={{ fontSize: 13, fontWeight: 700, color: "#374151", marginBottom: 10 }}>대표 이미지 (썸네일)</h3>
            {/* 썸네일 미리보기 */}
            <div
              style={{
                width: "100%", height: 100, borderRadius: 8, overflow: "hidden",
                background: "#f3f4f6", border: "1.5px dashed #d1d5db",
                position: "relative", cursor: thumbnailUploading ? "not-allowed" : "pointer",
                marginBottom: 8, display: "flex", alignItems: "center", justifyContent: "center",
              }}
              onClick={() => { if (!thumbnailUploading) thumbnailFileRef.current?.click(); }}
              title="클릭하여 썸네일 이미지 업로드"
            >
              {thumbnail ? (
                <>
                  <img loading="lazy" src={thumbnail} alt="썸네일" style={{ width: "100%", height: "100%", objectFit: "cover" }} />
                  <button
                    type="button"
                    onClick={e => { e.stopPropagation(); setThumbnail(""); }}
                    style={{
                      position: "absolute", top: 4, right: 4,
                      background: "rgba(0,0,0,0.65)", border: "none",
                      borderRadius: "50%", width: 22, height: 22,
                      display: "flex", alignItems: "center", justifyContent: "center",
                      cursor: "pointer", color: "#fff",
                    }}
                    title="썸네일 삭제"
                  ><X size={12} /></button>
                </>
              ) : (
                <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 5, color: "#9ca3af" }}>
                  {thumbnailUploading
                    ? <Loader2 size={20} className="animate-spin" />
                    : <><Image size={22} /><span style={{ fontSize: 10 }}>클릭하여 업로드</span></>}
                </div>
              )}
            </div>
            <input
              ref={thumbnailFileRef}
              type="file"
              accept="image/*"
              style={{ display: "none" }}
              onChange={e => { const f = e.target.files?.[0]; if (f) handleThumbnailUpload(f); e.target.value = ""; }}
            />
            <button
              type="button"
              onClick={() => thumbnailFileRef.current?.click()}
              disabled={thumbnailUploading}
              style={{
                width: "100%", display: "flex", alignItems: "center", justifyContent: "center", gap: 6,
                padding: "7px 12px", border: "1px solid #d1d5db", borderRadius: 7,
                background: "#f9fafb", fontSize: 12, color: "#374151",
                cursor: thumbnailUploading ? "not-allowed" : "pointer", fontWeight: 600,
              }}
            >
              {thumbnailUploading ? <><Loader2 size={12} className="animate-spin" /> 업로드 중...</> : <><Upload size={12} /> 이미지 업로드</>}
            </button>
            <p style={{ fontSize: 10, color: "#9ca3af", marginTop: 5 }}>메인 섹션 카드에 표시됩니다. 5MB 이하 이미지 권장.</p>
          </div>

          <div style={{ border: "1px solid #e5e7eb", borderRadius: 10, padding: 16, background: "#fff" }}>
            <h3 style={{ fontSize: 13, fontWeight: 700, color: "#374151", marginBottom: 12 }}>공개 설정</h3>
            <label style={{ display: "flex", alignItems: "center", gap: 8, cursor: "pointer", marginBottom: 10, padding: "8px 10px", borderRadius: 8, background: published ? "rgba(16,185,129,0.08)" : "transparent", border: published ? "1px solid #6ee7b7" : "1px solid transparent", transition: "all 0.15s" }}>
              <input type="checkbox" checked={published} onChange={e => setPublished(e.target.checked)}
                style={{ width: 15, height: 15, accentColor: "#10b981" }} />
              <span style={{ fontSize: 13, color: published ? "#059669" : "#374151", fontWeight: published ? 600 : 400 }}>
                {published ? "발행 중 (공개)" : "발행 (공개)"}
              </span>
              {published && <span style={{ marginLeft: "auto", fontSize: 10, background: "rgba(16,185,129,0.15)", color: "#059669", border: "1px solid #6ee7b7", borderRadius: 10, padding: "1px 7px", fontWeight: 700 }}>LIVE</span>}
            </label>
            <label style={{ display: "flex", alignItems: "center", gap: 8, cursor: "pointer", marginBottom: 10 }}>
              <input type="checkbox" checked={showInNav} onChange={e => setShowInNav(e.target.checked)}
                style={{ width: 15, height: 15, accentColor: "#6366f1" }} />
              <span style={{ fontSize: 13, color: "#374151" }}>네비게이션에 표시</span>
            </label>
            <label style={{ display: "flex", alignItems: "center", gap: 8, cursor: "pointer", marginBottom: 10 }}>
              <input type="checkbox" checked={hideSidebar} onChange={e => setHideSidebar(e.target.checked)}
                style={{ width: 15, height: 15, accentColor: "#6366f1" }} />
              <span style={{ fontSize: 13, color: "#374151" }}>사이드바 숨김 (본문 좌우 가득)</span>
            </label>
            <label style={{ display: "flex", alignItems: "center", gap: 8, cursor: "pointer", marginBottom: 10, padding: "8px 10px", background: hideChrome ? "#f0fdf4" : "transparent", border: hideChrome ? "1.5px solid #22c55e" : "1.5px solid transparent", borderRadius: 7, transition: "all 0.15s" }}>
              <input type="checkbox" checked={hideChrome} onChange={e => setHideChrome(e.target.checked)}
                style={{ width: 15, height: 15, accentColor: "#22c55e" }} />
              <span style={{ fontSize: 13, color: hideChrome ? "#15803d" : "#374151", fontWeight: hideChrome ? 600 : 400 }}>헤더/카테고리/푸터 완전 숨김 (페이지 단독 전체화면)</span>
            </label>
            {/* 전체화면 기본값 설정 */}
            <label style={{ display: "flex", alignItems: "center", gap: 8, cursor: "pointer", marginBottom: 10 }}>
              <input type="checkbox" checked={fullscreenDefault} onChange={e => setFullscreenDefault(e.target.checked)}
                style={{ width: 15, height: 15, accentColor: "#6366f1" }} />
              <span style={{ fontSize: 13, color: "#374151" }}>HTML 앱 기본 전체화면 표시</span>
            </label>
            {/* 제목/설명 표시 여부 */}
            <label style={{ display: "flex", alignItems: "center", gap: 8, cursor: "pointer", marginBottom: 10 }}>
              <input type="checkbox" checked={showTitle} onChange={e => setShowTitle(e.target.checked)}
                style={{ width: 15, height: 15, accentColor: "#6366f1" }} />
              <span style={{ fontSize: 13, color: "#374151" }}>제목 표시</span>
            </label>
            <label style={{ display: "flex", alignItems: "center", gap: 8, cursor: "pointer", marginBottom: 10 }}>
              <input type="checkbox" checked={showDescription} onChange={e => setShowDescription(e.target.checked)}
                style={{ width: 15, height: 15, accentColor: "#6366f1" }} />
              <span style={{ fontSize: 13, color: "#374151" }}>설명 표시</span>
            </label>
            {/* 제목/설명 정렬 */}
            <div style={{ marginBottom: 10 }}>
              <div style={{ fontSize: 12, fontWeight: 700, color: "#374151", marginBottom: 6 }}>제목/설명 정렬</div>
              <div style={{ display: "flex", gap: 4 }}>
                {(["left", "center", "right"] as const).map(align => (
                  <button
                    key={align}
                    type="button"
                    onClick={() => setTitleAlign(align)}
                    title={{ left: "왼쪽 정렬", center: "가운데 정렬", right: "오른쪽 정렬" }[align]}
                    style={{
                      flex: 1, padding: "5px 0", border: titleAlign === align ? "2px solid #6366f1" : "1.5px solid #e5e7eb",
                      borderRadius: 6, background: titleAlign === align ? "#eef2ff" : "#f9fafb",
                      cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center",
                      transition: "all 0.12s",
                    }}
                  >
                    {align === "left" && (
                      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke={titleAlign === align ? "#6366f1" : "#9ca3af"} strokeWidth="2" strokeLinecap="round">
                        <line x1="3" y1="6" x2="21" y2="6"/><line x1="3" y1="12" x2="15" y2="12"/><line x1="3" y1="18" x2="18" y2="18"/>
                      </svg>
                    )}
                    {align === "center" && (
                      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke={titleAlign === align ? "#6366f1" : "#9ca3af"} strokeWidth="2" strokeLinecap="round">
                        <line x1="3" y1="6" x2="21" y2="6"/><line x1="6" y1="12" x2="18" y2="12"/><line x1="4" y1="18" x2="20" y2="18"/>
                      </svg>
                    )}
                    {align === "right" && (
                      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke={titleAlign === align ? "#6366f1" : "#9ca3af"} strokeWidth="2" strokeLinecap="round">
                        <line x1="3" y1="6" x2="21" y2="6"/><line x1="9" y1="12" x2="21" y2="12"/><line x1="6" y1="18" x2="21" y2="18"/>
                      </svg>
                    )}
                  </button>
                ))}
              </div>
              <div style={{ fontSize: 10, color: "#9ca3af", marginTop: 3 }}>제목과 설명 텍스트의 정렬 방향</div>
            </div>
            {/* 본문 최대 너비 설정 */}
            <div style={{ marginBottom: 10 }}>
              <div style={{ fontSize: 12, fontWeight: 700, color: "#374151", marginBottom: 6 }}>본문 최대 너비 (px)</div>
              <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                <input
                  type="range"
                  min={700}
                  max={1600}
                  step={100}
                  value={contentWidth}
                  onChange={e => setContentWidth(Number(e.target.value))}
                  style={{ flex: 1, accentColor: "#6366f1" }}
                />
                <span style={{ fontSize: 13, fontWeight: 700, color: "#6366f1", minWidth: 50, textAlign: "right" }}>{contentWidth}px</span>
              </div>
              <div style={{ display: "flex", justifyContent: "space-between", fontSize: 10, color: "#9ca3af", marginTop: 2 }}>
                <span>700 (좁게)</span>
                <span>960 (기본)</span>
                <span>1200 (넓게)</span>
                <span>1600 (최대)</span>
              </div>
              <div style={{ fontSize: 11, color: "#9ca3af", marginTop: 4 }}>사이드바 숨김 시 전체 너비로 표시됩니다. 이 설정은 사이드바 표시 시에만 적용됩니다.</div>
            </div>
            <label style={{ display: "flex", alignItems: "center", gap: 8, cursor: "pointer", padding: "10px 12px", background: membersOnly ? "#fef3c7" : "#f9fafb", border: membersOnly ? "1.5px solid #f59e0b" : "1.5px solid #e5e7eb", borderRadius: 8, transition: "all 0.15s" }}>
              <input type="checkbox" checked={membersOnly} onChange={e => setMembersOnly(e.target.checked)}
                style={{ width: 15, height: 15, accentColor: "#f59e0b" }} />
              <div>
                <div style={{ fontSize: 13, fontWeight: 700, color: membersOnly ? "#92400e" : "#374151" }}>🔒 회원 전용</div>
                <div style={{ fontSize: 11, color: membersOnly ? "#b45309" : "#9ca3af", marginTop: 2 }}>체크 시 로그인한 회원만 이 페이지를 이용할 수 있습니다</div>
              </div>
            </label>
            {/* 하단 글 목록 카테고리 */}
            <div style={{ marginTop: 12 }}>
              <div style={{ fontSize: 12, fontWeight: 700, color: "#374151", marginBottom: 6 }}>하단 글 목록 카테고리</div>
              <select
                value={postListCategory}
                onChange={e => setPostListCategory(e.target.value)}
                style={{ width: "100%", padding: "6px 10px", border: "1px solid #d1d5db", borderRadius: 6, fontSize: 12, color: "#374151", background: "#fff" }}
              >
                <option value="">표시 안 함 (글 목록 없음)</option>
                {(navItems || []).filter(n => n.visible).map(n => (
                  <option key={n.id} value={n.path.replace(/^\//,"").replace(/^\/category\//,"")}>
                    {n.label} ({n.path})
                  </option>
                ))}
              </select>
              <div style={{ fontSize: 11, color: "#9ca3af", marginTop: 4 }}>선택 시 페이지 하단에 해당 카테고리 글 목록이 표시됩니다.</div>
            </div>
          </div>
        </div>
      </div>
      {showPreview && (
        <div style={{
          position: "fixed", inset: 0, zIndex: 9999,
          background: "rgba(0,0,0,0.65)", display: "flex", flexDirection: "column",
          alignItems: "center", justifyContent: "flex-start", padding: "24px 16px",
        }}>
          <div style={{ width: "100%", maxWidth: 960, display: "flex", alignItems: "center",
            justifyContent: "space-between", marginBottom: 12,
          }}>
            <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
              <Eye size={16} color="#fff" />
              <span style={{ color: "#fff", fontWeight: 700, fontSize: 15 }}>
                미리보기 — {title || "제목 없음"}
              </span>
              <span style={{ color: "#a5b4fc", fontSize: 12 }}>(저장 전 현재 상태)</span>
            </div>
            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
              {/* HTML 앱 섹션이 있을 때 새 탭 열기 버튼 */}
              {sections.some(s => s.type === "html" && s.settings.isAppMode && s.content.trim()) && (
                <button
                  onClick={() => {
                    // 첫 번째 HTML 앱 섹션을 새 탭에서 열기
                    const htmlSection = sections.find(s => s.type === "html" && s.settings.isAppMode && s.content.trim());
                    if (htmlSection) {
                      const blob = new Blob([htmlSection.content], { type: "text/html" });
                      const url = URL.createObjectURL(blob);
                      window.open(url, "_blank");
                      setTimeout(() => URL.revokeObjectURL(url), 10000);
                    }
                  }}
                  style={{ display: "flex", alignItems: "center", gap: 5, padding: "6px 14px", border: "1px solid rgba(99,102,241,0.6)", borderRadius: 7, background: "rgba(99,102,241,0.2)", cursor: "pointer", fontSize: 12, color: "#c7d2fe", fontWeight: 600 }}
                >
                  <ExternalLink size={13} /> 새 탭에서 열기
                </button>
              )}
              <button onClick={() => setShowPreview(false)}
                style={{ display: "flex", alignItems: "center", gap: 5, padding: "6px 14px", border: "1px solid rgba(255,255,255,0.3)", borderRadius: 7, background: "rgba(255,255,255,0.1)", cursor: "pointer", fontSize: 13, color: "#fff" }}>
                <X size={14} /> 닫기
              </button>
            </div>
          </div>
          <div style={{
            width: "100%", maxWidth: 960, background: "#fff", borderRadius: 12,
            overflow: "auto", maxHeight: "calc(100vh - 100px)",
            boxShadow: "0 20px 60px rgba(0,0,0,0.4)",
          }}>
            <div style={{ borderBottom: "1px solid #f3f4f6", padding: "20px 32px", background: "#fafafa" }}>
              <div style={{ fontSize: 11, color: "#9ca3af", marginBottom: 4 }}>
                /page/{slug || "슬러그"}
              </div>
              <h1 style={{ fontSize: 22, fontWeight: 800, color: "#111827", margin: 0 }}>
                {title || "제목 없음"}
              </h1>
              {description && (
                <p style={{ fontSize: 14, color: "#6b7280", marginTop: 6, marginBottom: 0 }}>{description}</p>
              )}
            </div>
            {sections.length === 0 ? (
              <div style={{ padding: "60px 32px", textAlign: "center", color: "#9ca3af" }}>
                <LayoutGrid size={36} style={{ margin: "0 auto 12px", display: "block", opacity: 0.3 }} />
                <p style={{ fontSize: 14 }}>아직 추가된 섹션이 없습니다</p>
              </div>
            ) : (
              sections.map(section => (
                <PreviewSection key={section.id} section={section} />
              ))
            )}
          </div>
        </div>
      )}
    </div>
  );
}


// ─── 페이지 연결 글 목록 서브패널 ────────────────────────────────────────────────
function PagePostsPanel({ postListCategory, onEditPage }: { postListCategory: string | null | undefined; onEditPage?: () => void }) {
  const [expanded, setExpanded] = useState(false);
  const utils = trpc.useUtils();
  const { data: allPosts, isLoading } = trpc.admin.listAllPosts.useQuery(undefined, { enabled: expanded });
  const updateStatusMutation = trpc.admin.updatePostStatus.useMutation({
    onSuccess: () => { utils.admin.listAllPosts.invalidate(); toast.success("상태가 변경되었습니다"); },
    onError: () => toast.error("변경 실패"),
  });
  const deletePostMutation = trpc.admin.deletePost.useMutation({
    onSuccess: () => { utils.admin.listAllPosts.invalidate(); toast.success("글이 삭제되었습니다"); },
    onError: () => toast.error("삭제 실패"),
  });
  const togglePinMutation = trpc.admin.togglePinPost.useMutation({
    onSuccess: () => { utils.admin.listAllPosts.invalidate(); toast.success("고정 상태가 변경되었습니다"); },
    onError: () => toast.error("고정 변경 실패"),
  });
  const toggleShowInSectionMutation = trpc.admin.toggleShowInSection.useMutation({
    onSuccess: () => { utils.admin.listAllPosts.invalidate(); toast.success("섹션 노출 설정이 변경되었습니다"); },
    onError: () => toast.error("변경 실패"),
  });

  const filteredPosts = postListCategory
    ? (allPosts?.filter((p: any) => p.category === postListCategory) ?? [])
    : [];

  return (
    <div style={{ borderTop: "1px solid #f0f0f0", marginTop: 6, paddingTop: 4 }}>
      {/* 헤더 - 클릭으로 토글 */}
      <div
        style={{ display: "flex", alignItems: "center", justifyContent: "space-between", cursor: "pointer", padding: "2px 0" }}
        onClick={() => setExpanded(v => !v)}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 12, color: "#6366f1", fontWeight: 600 }}>
          <BookOpen size={13} />
          {postListCategory ? `연결 글 목록 (${postListCategory})` : "연결 글 목록"}
          {postListCategory && !isLoading && expanded && (
            <span style={{ fontSize: 11, color: "#9ca3af", fontWeight: 400 }}>{filteredPosts.length}개</span>
          )}
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
          {!postListCategory && onEditPage && (
            <button
              onClick={e => { e.stopPropagation(); onEditPage(); }}
              style={{ fontSize: 11, color: "#6366f1", background: "rgba(99,102,241,0.07)", border: "1px solid #c7d2fe", borderRadius: 5, padding: "2px 8px", cursor: "pointer" }}
            >
              카테고리 설정
            </button>
          )}
          <span style={{ fontSize: 10, color: "#9ca3af" }}>{expanded ? "▲" : "▼"}</span>
        </div>
      </div>

      {/* 카테고리 미설정 */}
      {expanded && (!postListCategory ? (
        <div style={{ padding: "14px 16px", background: "#f9fafb", borderRadius: 8, border: "1px dashed #e5e7eb", textAlign: "center" }}>
          <BookOpen size={20} style={{ margin: "0 auto 6px", display: "block", opacity: 0.25 }} />
          <p style={{ fontSize: 12, color: "#9ca3af", margin: 0 }}>연결된 카테고리가 없습니다.</p>
          <p style={{ fontSize: 11, color: "#c4c4c4", margin: "4px 0 0" }}>편집 → "하단 글 목록 카테고리"를 설정하면 글 목록이 표시됩니다.</p>
        </div>
      ) : isLoading ? (
        <div style={{ fontSize: 12, color: "#9ca3af", padding: "10px 0", display: "flex", alignItems: "center", gap: 6 }}>
          <RefreshCw size={13} className="animate-spin" />
          불러오는 중...
        </div>
      ) : (
        <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12 }}>
          <thead>
            <tr style={{ borderBottom: "1px solid #f3f4f6", background: "#fafafa" }}>
              <th style={{ textAlign: "left", padding: "5px 6px", color: "#9ca3af", fontWeight: 500, width: 32 }}>No</th>
              <th style={{ textAlign: "left", padding: "5px 6px", color: "#9ca3af", fontWeight: 500 }}>제목</th>
              <th style={{ textAlign: "center", padding: "5px 6px", color: "#9ca3af", fontWeight: 500, width: 56 }}>상태</th>
              <th style={{ textAlign: "right", padding: "5px 6px", color: "#9ca3af", fontWeight: 500, width: 80 }}>작성일</th>
              <th style={{ textAlign: "right", padding: "5px 6px", color: "#9ca3af", fontWeight: 500, width: 40 }}>조회</th>
              <th style={{ textAlign: "center", padding: "5px 6px", color: "#9ca3af", fontWeight: 500, width: 56 }}>섹션</th>
              <th style={{ textAlign: "right", padding: "5px 6px", color: "#9ca3af", fontWeight: 500, width: 90 }}>작업</th>
            </tr>
          </thead>
              <tbody>
                {filteredPosts.map((post: any, idx: number) => (
                  <tr key={post.id} style={{ borderBottom: "1px solid #f9fafb" }}>
                    <td style={{ padding: "5px 6px", color: "#9ca3af" }}>{idx + 1}</td>
                    <td style={{ padding: "5px 6px", maxWidth: 0 }}>
                      <div style={{ display: "flex", alignItems: "center", gap: 4, overflow: "hidden" }}>
                        {post.isPinned && (
                          <span style={{ fontSize: 10, background: "#3b82f6", color: "#fff", borderRadius: 3, padding: "1px 4px", flexShrink: 0 }}>고정글</span>
                        )}
                        <a href={getPostUrl(post)} target="_blank" rel="noopener noreferrer"
                          style={{ color: "#374151", textDecoration: "none", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                          {post.title}
                        </a>
                      </div>
                    </td>
                    <td style={{ padding: "5px 6px", textAlign: "center" }}>
                      {post.published ? (
                        <span style={{ fontSize: 10, background: "rgba(16,185,129,0.1)", color: "#059669", border: "1px solid #a7f3d0", borderRadius: 4, padding: "1px 5px" }}>발행</span>
                      ) : (
                        <span style={{ fontSize: 10, background: "#f3f4f6", color: "#9ca3af", borderRadius: 4, padding: "1px 5px" }}>비공개</span>
                      )}
                    </td>
                    <td style={{ padding: "5px 6px", textAlign: "right", color: "#9ca3af", whiteSpace: "nowrap" }}>
                      {new Date(post.createdAt).toLocaleDateString("ko-KR", { month: "2-digit", day: "2-digit" })}
                    </td>
                    <td style={{ padding: "5px 6px", textAlign: "right", color: "#9ca3af" }}>{post.views}</td>
                    <td style={{ padding: "5px 6px", textAlign: "center" }}>
                      <button
                        onClick={() => toggleShowInSectionMutation.mutate({ id: post.id, showInSection: !post.showInSection })}
                        title={post.showInSection ? "섹션 노출 중 - 클릭하면 숨김" : "섹션 숨김 - 클릭하면 노출"}
                        style={{ background: "none", border: "none", cursor: "pointer", padding: 2 }}
                      >
                        {post.showInSection ? (
                          <span style={{ fontSize: 10, background: "rgba(99,102,241,0.1)", color: "#6366f1", border: "1px solid #c7d2fe", borderRadius: 4, padding: "1px 5px" }}>노출</span>
                        ) : (
                          <span style={{ fontSize: 10, background: "#f3f4f6", color: "#9ca3af", borderRadius: 4, padding: "1px 5px" }}>숨김</span>
                        )}
                      </button>
                    </td>
                    <td style={{ padding: "5px 6px", textAlign: "right" }}>
                      <div style={{ display: "flex", alignItems: "center", justifyContent: "flex-end", gap: 4 }}>
                        {/* 수정 버튼 */}
                        <a href={`/write/edit/${post.id}`}
                          style={{ padding: "3px 7px", border: "1px solid #e5e7eb", borderRadius: 5, background: "#fff", fontSize: 11, color: "#374151", textDecoration: "none", display: "flex", alignItems: "center", gap: 3 }}>
                          <Pencil size={10} /> 수정
                        </a>
                        {/* 기타 설정 드롭다운 */}
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <button style={{ padding: "3px 6px", border: "1px solid #e5e7eb", borderRadius: 5, background: "#fff", cursor: "pointer", display: "flex", alignItems: "center" }}>
                              <MoreVertical size={12} color="#6b7280" />
                            </button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end" style={{ minWidth: 140, fontSize: 12 }}>
                            {/* 발행/비공개 전환 */}
                            <DropdownMenuItem
                              onClick={() => updateStatusMutation.mutate({ id: post.id, status: post.published ? "draft" : "published" })}
                            >
                              {post.published ? <><EyeOff size={12} style={{ marginRight: 6 }} />비공개로 전환</> : <><Eye size={12} style={{ marginRight: 6 }} />발행하기</>}
                            </DropdownMenuItem>
                            {/* 고정/해제 */}
                            <DropdownMenuItem
                              onClick={() => togglePinMutation.mutate({ postId: post.id, pin: !post.isPinned })}
                            >
                              {post.isPinned ? <><PinOff size={12} style={{ marginRight: 6 }} />고정 해제</> : <><Pin size={12} style={{ marginRight: 6 }} />고정글 설정</>}
                            </DropdownMenuItem>
                            {/* 섹션 노출/숨김 */}
                            <DropdownMenuItem
                              onClick={() => toggleShowInSectionMutation.mutate({ id: post.id, showInSection: !post.showInSection })}
                            >
                              {post.showInSection ? <><EyeOff size={12} style={{ marginRight: 6 }} />메인 섹션에서 숨김</> : <><Eye size={12} style={{ marginRight: 6 }} />메인 섹션에 노출</>}
                            </DropdownMenuItem>
                            <DropdownMenuSeparator />
                            {/* 삭제 */}
                            <DropdownMenuItem
                              variant="destructive"
                              onSelect={(e) => e.preventDefault()}
                              onClick={() => {
                                if (confirm(`"${post.title}" 글을 보관함으로 이동하시겠습니까?`)) {
                                  deletePostMutation.mutate({ id: post.id });
                                }
                              }}
                            >
                              <Trash2 size={12} style={{ marginRight: 6 }} />삭제
                            </DropdownMenuItem>
                          </DropdownMenuContent>
                        </DropdownMenu>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
          </table>
      ))}
    </div>
  );
}

// ─── 메인 탭 컴포넌트 ──────────────────────────────────────────────────────────
export function PagesTab({ initialEditPageId }: { initialEditPageId?: number }) {
  const { data: allPages } = trpc.pages.adminList.useQuery();
  const { data: allSlugs } = trpc.pages.allSlugs.useQuery();
  const [editingPage, setEditingPage] = useState<CustomPage | null | "new">(null);
  const [initialEditHandled, setInitialEditHandled] = useState(false);

  // initialEditPageId가 있으면 해당 페이지 편집 모드로 자동 진입
  useEffect(() => {
    if (initialEditPageId && allPages && !initialEditHandled) {
      const target = allPages.find((p: CustomPage) => p.id === initialEditPageId);
      if (target) {
        setEditingPage(target);
        setInitialEditHandled(true);
      }
    }
  }, [initialEditPageId, allPages, initialEditHandled]);
  const [settingHomePage, setSettingHomePage] = useState<number | null>(null);
  const [pageStatusFilter, setPageStatusFilter] = useState<"all" | "published" | "private">("all");
  const utils = trpc.useUtils();
  const { data: pages, refetch, isLoading } = trpc.pages.adminList.useQuery();
  const { data: siteConfig } = trpc.admin.getSiteConfig.useQuery();
  const deleteMutation = trpc.pages.delete.useMutation();
  const archiveMutation = trpc.pages.archive.useMutation();
  const restorePageMutation = trpc.pages.restore.useMutation();
  const { data: archivedPages, refetch: refetchArchived } = trpc.pages.archivedList.useQuery();
  const [archiveConfirmDialog, setArchiveConfirmDialog] = useState<{ id: number; title: string } | null>(null);
  const [archiveMemoInput, setArchiveMemoInput] = useState('');
  const [showArchived, setShowArchived] = useState(false);
  const permanentDeleteMutation = trpc.pages.permanentDelete.useMutation();
  // 영구 삭제 3단계 확인 다이얼로그 상태
  // step 1: 경고 표시, step 2: 재확인, step 3: 제목 입력 확인
  const [permDeleteDialog, setPermDeleteDialog] = useState<{ id: number; title: string; step: 1 | 2 | 3 } | null>(null);
  const [permDeleteTitleInput, setPermDeleteTitleInput] = useState('');
  const updateMutation = trpc.pages.update.useMutation();
  const toggleCommentsMutation = trpc.pages.toggleComments.useMutation();
  const updateSiteConfigMutation = trpc.admin.updateSiteConfig.useMutation();
  const setMainSectionMutation = trpc.pages.setMainSection.useMutation();
  const { data: navItemsForSection } = trpc.admin.getNavItems.useQuery();
  const [sectionDropdownPageId, setSectionDropdownPageId] = useState<number | null>(null);
  const [settingSection, setSettingSection] = useState<number | null>(null);

  // ── 업그레이드 기능 상태 ──────────────────────────────────────────
  const upgradeFileInputRef = useRef<HTMLInputElement>(null);
  const [upgradingPageId, setUpgradingPageId] = useState<number | null>(null);
  const [upgradeConfirmDialog, setUpgradeConfirmDialog] = useState<{
    pageId: number;
    pageTitle: string;
    htmlContent: string;
    errors: string[];
    warnings: string[];
  } | null>(null);
  const [upgradeLoading, setUpgradeLoading] = useState(false);
  const upgradeHtmlMutation = trpc.pages.upgradeHtml.useMutation();
  const autoFixHtmlMutation = trpc.pages.autoFixHtml.useMutation();
  const restoreFromHistoryMutation = trpc.pages.restoreFromHistory.useMutation();
  // 업그레이드 메모
  const [upgradeMemo, setUpgradeMemo] = useState('');
  // 미리보기 다이얼로그
  const [previewDialog, setPreviewDialog] = useState<{
    pageId: number;
    pageTitle: string;
    htmlContent: string;
  } | null>(null);
  // 이력 다이얼로그
  const [historyDialog, setHistoryDialog] = useState<{ pageId: number; pageTitle: string } | null>(null);
  const { data: upgradeHistory, refetch: refetchHistory } = trpc.pages.getUpgradeHistory.useQuery(
    { pageId: historyDialog?.pageId ?? 0 },
    { enabled: !!historyDialog }
  );
  const [autoFixLoading, setAutoFixLoading] = useState(false);
  const trpcUtils = trpc.useUtils();
  const handleToggleComments = async (page: CustomPage) => {
    const newVal = !(page as any).commentsEnabled;
    try {
      await toggleCommentsMutation.mutateAsync({ id: page.id, commentsEnabled: newVal });
      toast.success(newVal ? "댓글이 활성화되었습니다" : "댓글이 비활성화되었습니다");
      refetch();
    } catch {
      toast.error("설정 변경 실패");
    }
  };

  // 현재 첫화면으로 설정된 페이지 ID
  const currentHomePageId = siteConfig?.homePageId ? parseInt(siteConfig.homePageId, 10) : null;

  const handleDelete = async (id: number, title: string) => {
    if (!confirm(`"${title}" 페이지를 삭제하시겠습니까?`)) return;
    try {
      await deleteMutation.mutateAsync({ id });
      toast.success("페이지가 삭제되었습니다");
      utils.pages.getNavList.invalidate();
      refetch();
    } catch {
      toast.error("삭제 실패");
    }
  };

  const handleArchive = async (id: number, title: string) => {
    setArchiveConfirmDialog({ id, title });
  };

  const handleConfirmArchive = async () => {
    if (!archiveConfirmDialog) return;
    try {
      await archiveMutation.mutateAsync({ id: archiveConfirmDialog.id, memo: archiveMemoInput.trim() || undefined });
      toast.success(`"${archiveConfirmDialog.title}" 페이지가 보관함으로 이동되었습니다`);
      setArchiveConfirmDialog(null);
      setArchiveMemoInput('');
      utils.pages.getNavList.invalidate();
      refetch();
      refetchArchived();
    } catch {
      toast.error("보관함 이동 실패");
    }
  };

  const handlePermanentDelete = async () => {
    if (!permDeleteDialog || permDeleteDialog.step !== 3) return;
    if (permDeleteTitleInput.trim() !== permDeleteDialog.title) {
      toast.error('페이지 제목이 일치하지 않습니다');
      return;
    }
    try {
      await permanentDeleteMutation.mutateAsync({ id: permDeleteDialog.id });
      toast.success(`"${permDeleteDialog.title}" 페이지가 영구 삭제되었습니다`);
      setPermDeleteDialog(null);
      setPermDeleteTitleInput('');
      refetchArchived();
    } catch {
      toast.error('영구 삭제 실패');
    }
  };

  const handleRestorePage = async (id: number, title: string) => {
    if (!confirm(`"${title}" 페이지를 복원하시겠습니까?\n복원 후 비공개 상태로 복원됩니다. 필요시 직접 발행해 주세요.`)) return;
    try {
      await restorePageMutation.mutateAsync({ id });
      toast.success(`"${title}" 페이지가 복원되었습니다`);
      refetch();
      refetchArchived();
    } catch {
      toast.error("복원 실패");
    }
  };

  const handleTogglePublish = async (page: CustomPage) => {
    try {
      await updateMutation.mutateAsync({ id: page.id, published: !page.published });
      toast.success(page.published ? "비공개로 변경되었습니다" : "발행되었습니다");
      utils.pages.getNavList.invalidate();
      refetch();
    } catch {
      toast.error("변경 실패");
    }
  };

  const handleToggleMembersOnly = async (page: CustomPage) => {
    try {
      await updateMutation.mutateAsync({ id: page.id, membersOnly: !page.membersOnly });
      toast.success(page.membersOnly ? "전체 공개로 변경되었습니다" : "회원 전용으로 설정되었습니다");
      refetch();
    } catch {
      toast.error("변경 실패");
    }
  };

  const handleSetHomePage = async (page: CustomPage) => {
    const isCurrentHome = currentHomePageId === page.id;
    setSettingHomePage(page.id);
    try {
      await updateSiteConfigMutation.mutateAsync({ homePageId: isCurrentHome ? "" : String(page.id) });
      utils.admin.getSiteConfig.invalidate();
      toast.success(isCurrentHome ? "첫화면이 기본 홈으로 복원되었습니다" : `"${page.title}"이 첫화면으로 설정되었습니다`);
    } catch {
      toast.error("첫화면 설정 실패");
    } finally {
      setSettingHomePage(null);
    }
  };

  const handleSetMainSection = async (page: CustomPage, sectionKey: string | null) => {
    setSettingSection(page.id);
    setSectionDropdownPageId(null);
    try {
      await setMainSectionMutation.mutateAsync({ id: page.id, mainSectionKey: sectionKey });
      toast.success(sectionKey ? `"${page.title}"이 '${navItemsForSection?.find(n => n.path?.includes(sectionKey))?.label ?? sectionKey}' 섹션에 배치되었습니다` : '섹션 배치가 해제되었습니다');
      refetch();
    } catch {
      toast.error('섹션 배치 설정 실패');
    } finally {
      setSettingSection(null);
    }
  };

  // ── 업그레이드 파일 선택 핸들러 ───────────────────────────────────────
  const handleUpgradeFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || upgradingPageId === null) return;
    e.target.value = ''; // 다음에 동일 파일 선택 가능하도록 초기화

    const isHtml = file.name.endsWith('.html') || file.name.endsWith('.htm');
    if (!isHtml) {
      toast.error('HTML 파일(.html, .htm)만 업로드할 수 있습니다.');
      setUpgradingPageId(null);
      return;
    }

    const maxSize = 5 * 1024 * 1024; // 5MB
    if (file.size > maxSize) {
      toast.error('파일 크기는 5MB 이하여야 합니다.');
      setUpgradingPageId(null);
      return;
    }

    setUpgradeLoading(true);
    const reader = new FileReader();
    reader.onload = async (ev) => {
      const htmlContent = ev.target?.result as string;
      if (!htmlContent) {
        toast.error('파일을 읽을 수 없습니다.');
        setUpgradeLoading(false);
        setUpgradingPageId(null);
        return;
      }

      // 파일 선택 후 바로 업그레이드하지 않고 미리보기 다이얼로그 표시
      const page = pages?.find(p => p.id === upgradingPageId);
      setPreviewDialog({
        pageId: upgradingPageId,
        pageTitle: page?.title ?? '',
        htmlContent,
      });
      setUpgradeLoading(false);
      setUpgradingPageId(null);
    };
    reader.readAsText(file);
  };

  // 오류 확인 후 강제 업그레이드
  const handleForceUpgrade = async () => {
    if (!upgradeConfirmDialog) return;
    setUpgradeLoading(true);
    try {
      const result = await upgradeHtmlMutation.mutateAsync({
        id: upgradeConfirmDialog.pageId,
        htmlContent: upgradeConfirmDialog.htmlContent,
        force: true,
      });
      if (result.ok) {
        toast.success(`"${result.pageTitle}" 페이지가 업그레이드되었습니다.`);
        setUpgradeConfirmDialog(null);
        refetch();
      }
    } catch (err: any) {
      toast.error(err?.message || '업그레이드 실패');
    } finally {
      setUpgradeLoading(false);
    }
  };

  // 미리보기 다이얼로그에서 업그레이드 확정
  const handleConfirmUpgradeFromPreview = async () => {
    if (!previewDialog) return;
    setUpgradeLoading(true);
    try {
      const result = await upgradeHtmlMutation.mutateAsync({
        id: previewDialog.pageId,
        htmlContent: previewDialog.htmlContent,
        force: false,
        memo: upgradeMemo.trim() || undefined,
      });
      if (!result.ok && result.requiresConfirm) {
        // 오류 있음 → 오류 확인 다이얼로그로 전환
        setUpgradeConfirmDialog({
          pageId: previewDialog.pageId,
          pageTitle: result.pageTitle,
          htmlContent: previewDialog.htmlContent,
          errors: result.errors,
          warnings: result.warnings,
        });
        setPreviewDialog(null);
      } else if (result.ok) {
        toast.success(`"${result.pageTitle}" 페이지가 업그레이드되었습니다.`);
        setPreviewDialog(null);
        setUpgradeMemo('');
        refetch();
      }
    } catch (err: any) {
      toast.error(err?.message || '업그레이드 실패');
    } finally {
      setUpgradeLoading(false);
    }
  };

  // 자동 수정 후 업그레이드
  const handleAutoFix = async () => {
    if (!upgradeConfirmDialog) return;
    setAutoFixLoading(true);
    try {
      const result = await autoFixHtmlMutation.mutateAsync({
        htmlContent: upgradeConfirmDialog.htmlContent,
        errors: upgradeConfirmDialog.errors,
        warnings: upgradeConfirmDialog.warnings,
      });
      toast.success(`AI가 ${result.changes.length}가지 항목을 수정했습니다.`);
      // 수정된 HTML로 바로 업그레이드
      const upgradeResult = await upgradeHtmlMutation.mutateAsync({
        id: upgradeConfirmDialog.pageId,
        htmlContent: result.fixedHtml,
        force: true,
        memo: upgradeMemo.trim() ? `[AI 자동수정] ${upgradeMemo.trim()}` : 'AI 자동 수정 후 업그레이드',
      });
      if (upgradeResult.ok) {
        toast.success(`"${upgradeResult.pageTitle}" 페이지가 자동 수정 후 업그레이드되었습니다.`);
        setUpgradeConfirmDialog(null);
        setUpgradeMemo('');
        refetch();
      }
    } catch (err: any) {
      toast.error(err?.message || '자동 수정 실패');
    } finally {
      setAutoFixLoading(false);
    }
  };

  // 이력에서 복원
  const handleRestoreFromHistory = async (historyId: number) => {
    if (!confirm('이 버전으로 복원하시겠습니까? 현재 내용은 자동으로 백업됩니다.')) return;
    try {
      await restoreFromHistoryMutation.mutateAsync({ historyId });
      toast.success('이전 버전으로 복원되었습니다.');
      setHistoryDialog(null);
      refetch();
      refetchHistory();
    } catch (err: any) {
      toast.error(err?.message || '복원 실패');
    }
  };

  if (editingPage === "new") {
    return <PageEditor page={null} existingSlugs={allSlugs ?? []} onBack={() => setEditingPage(null)} onSaved={() => { setEditingPage(null); refetch(); }} />;
  }
  if (editingPage) {
    return <PageEditor page={editingPage} onBack={() => setEditingPage(null)} onSaved={() => { setEditingPage(null); refetch(); }} />;
  }

  return (
    <div>
      {/* 업그레이드 파일 입력 (hidden) */}
      <input
        ref={upgradeFileInputRef}
        type="file"
        accept=".html,.htm"
        style={{ display: 'none' }}
        onChange={handleUpgradeFileChange}
      />

      {/* 보관함 이동 확인 다이얼로그 */}
      {archiveConfirmDialog && (
        <div style={{
          position: 'fixed', inset: 0, zIndex: 1100,
          background: 'rgba(0,0,0,0.55)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          padding: 16,
        }}>
          <div style={{
            background: '#fff', borderRadius: 16, padding: 28,
            maxWidth: 460, width: '100%',
            boxShadow: '0 20px 60px rgba(0,0,0,0.3)',
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 16 }}>
              <div style={{ width: 40, height: 40, borderRadius: 10, background: 'rgba(239,68,68,0.1)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <span style={{ fontSize: 20 }}>📦</span>
              </div>
              <div>
                <div style={{ fontSize: 15, fontWeight: 700, color: '#111827' }}>페이지를 보관함으로 이동</div>
                <div style={{ fontSize: 12, color: '#6b7280' }}>이 작업은 되돌릴 수 있습니다</div>
              </div>
            </div>
            <div style={{ background: '#fef9f0', border: '1px solid #fde68a', borderRadius: 10, padding: '12px 16px', marginBottom: 16 }}>
              <div style={{ fontSize: 13, color: '#92400e', fontWeight: 600, marginBottom: 4 }}>⚠️ 정말 보관함으로 이동하시겠습니까?</div>
              <div style={{ fontSize: 12, color: '#78350f' }}>
                <strong>"{archiveConfirmDialog.title}"</strong> 페이지가 즉시 비공개 처리되고 보관함으로 이동됩니다.
                보관함에서 언제든지 복원할 수 있습니다.
              </div>
            </div>
            {/* 보관 사유 메모 입력 */}
            <div style={{ marginBottom: 20 }}>
              <label style={{ fontSize: 12, fontWeight: 600, color: '#374151', display: 'block', marginBottom: 6 }}>
                평 보관 사유 <span style={{ color: '#9ca3af', fontWeight: 400 }}>(선택사항)</span>
              </label>
              <textarea
                value={archiveMemoInput}
                onChange={e => setArchiveMemoInput(e.target.value)}
                placeholder="예: 임시 비공개, 리뉴얼 예정, 중복 콘텐츠 정리 등..."
                maxLength={500}
                rows={3}
                style={{
                  width: '100%', padding: '8px 12px', borderRadius: 8,
                  border: '1px solid #e5e7eb', fontSize: 12, resize: 'vertical',
                  fontFamily: 'inherit', color: '#374151', background: '#f9fafb',
                  boxSizing: 'border-box', outline: 'none',
                }}
              />
              <div style={{ fontSize: 11, color: '#9ca3af', textAlign: 'right', marginTop: 2 }}>{archiveMemoInput.length}/500</div>
            </div>
            <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
              <button
                onClick={() => { setArchiveConfirmDialog(null); setArchiveMemoInput(''); }}
                style={{ padding: '9px 20px', border: '1px solid #e5e7eb', borderRadius: 8, background: '#fff', cursor: 'pointer', fontSize: 13, color: '#374151', fontWeight: 500 }}
              >
                취소
              </button>
              <button
                onClick={handleConfirmArchive}
                disabled={archiveMutation.isPending}
                style={{ padding: '9px 20px', border: 'none', borderRadius: 8, background: '#ef4444', cursor: 'pointer', fontSize: 13, color: '#fff', fontWeight: 600, opacity: archiveMutation.isPending ? 0.7 : 1 }}
              >
                {archiveMutation.isPending ? '이동 중...' : '보관함으로 이동'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 영구 삭제 3단계 확인 다이얼로그 */}
      {permDeleteDialog && (
        <div style={{
          position: 'fixed', inset: 0, zIndex: 1200,
          background: 'rgba(0,0,0,0.65)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          padding: 16,
        }}>
          <div style={{
            background: '#fff', borderRadius: 16, padding: 28,
            maxWidth: 480, width: '100%',
            boxShadow: '0 24px 80px rgba(0,0,0,0.35)',
            border: '2px solid #fecaca',
          }}>
            {/* 단계 표시바 */}
            <div style={{ display: 'flex', gap: 6, marginBottom: 20 }}>
              {[1, 2, 3].map(s => (
                <div key={s} style={{
                  flex: 1, height: 4, borderRadius: 2,
                  background: permDeleteDialog.step >= s ? '#ef4444' : '#e5e7eb',
                  transition: 'background 0.2s',
                }} />
              ))}
            </div>

            {/* Step 1: 경고 */}
            {permDeleteDialog.step === 1 && (
              <>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 16 }}>
                  <div style={{ width: 44, height: 44, borderRadius: 12, background: '#fef2f2', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 22 }}>🗑️</div>
                  <div>
                    <div style={{ fontSize: 16, fontWeight: 700, color: '#dc2626' }}>영구 삭제 경고</div>
                    <div style={{ fontSize: 12, color: '#6b7280' }}>이 작업은 되돌릴 수 없습니다</div>
                  </div>
                </div>
                <div style={{ background: '#fef2f2', border: '1px solid #fecaca', borderRadius: 10, padding: '14px 16px', marginBottom: 20 }}>
                  <div style={{ fontSize: 13, fontWeight: 700, color: '#dc2626', marginBottom: 8 }}>⚠️ 주의하세요!</div>
                  <div style={{ fontSize: 12, color: '#7f1d1d', lineHeight: 1.7 }}>
                    <strong>"{permDeleteDialog.title}"</strong> 페이지를 <strong>영구적으로 삭제</strong>하려고 합니다.<br />
                    삭제된 페이지와 모든 업그레이드 이력은 <strong>복구할 수 없습니다</strong>.
                  </div>
                </div>
                <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
                  <button onClick={() => { setPermDeleteDialog(null); setPermDeleteTitleInput(''); }}
                    style={{ padding: '9px 20px', border: '1px solid #e5e7eb', borderRadius: 8, background: '#fff', cursor: 'pointer', fontSize: 13, color: '#374151', fontWeight: 500 }}>
                    취소
                  </button>
                  <button onClick={() => setPermDeleteDialog(d => d ? { ...d, step: 2 } : null)}
                    style={{ padding: '9px 20px', border: 'none', borderRadius: 8, background: '#ef4444', cursor: 'pointer', fontSize: 13, color: '#fff', fontWeight: 600 }}>
                    다음 단계 →
                  </button>
                </div>
              </>
            )}

            {/* Step 2: 재확인 */}
            {permDeleteDialog.step === 2 && (
              <>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 16 }}>
                  <div style={{ width: 44, height: 44, borderRadius: 12, background: '#fef2f2', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 22 }}>❓</div>
                  <div>
                    <div style={{ fontSize: 16, fontWeight: 700, color: '#dc2626' }}>정말 삭제하시겠습니까?</div>
                    <div style={{ fontSize: 12, color: '#6b7280' }}>2단계 / 3단계</div>
                  </div>
                </div>
                <div style={{ background: '#fffbeb', border: '1px solid #fde68a', borderRadius: 10, padding: '14px 16px', marginBottom: 20 }}>
                  <div style={{ fontSize: 13, color: '#92400e', lineHeight: 1.7 }}>
                    보관함에서 <strong>"{permDeleteDialog.title}"</strong> 페이지를 완전히 제거합니다.<br />
                    업그레이드 이력 {`(${permDeleteDialog.title})`}도 함께 삭제됩니다.
                  </div>
                </div>
                <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
                  <button onClick={() => setPermDeleteDialog(d => d ? { ...d, step: 1 } : null)}
                    style={{ padding: '9px 20px', border: '1px solid #e5e7eb', borderRadius: 8, background: '#fff', cursor: 'pointer', fontSize: 13, color: '#374151', fontWeight: 500 }}>
                    ← 이전
                  </button>
                  <button onClick={() => setPermDeleteDialog(d => d ? { ...d, step: 3 } : null)}
                    style={{ padding: '9px 20px', border: 'none', borderRadius: 8, background: '#ef4444', cursor: 'pointer', fontSize: 13, color: '#fff', fontWeight: 600 }}>
                    네, 삭제하겠습니다
                  </button>
                </div>
              </>
            )}

            {/* Step 3: 제목 입력 확인 */}
            {permDeleteDialog.step === 3 && (
              <>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 16 }}>
                  <div style={{ width: 44, height: 44, borderRadius: 12, background: '#fef2f2', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 22 }}>✏️</div>
                  <div>
                    <div style={{ fontSize: 16, fontWeight: 700, color: '#dc2626' }}>페이지 제목 입력</div>
                    <div style={{ fontSize: 12, color: '#6b7280' }}>3단계 / 3단계 — 마지막 확인</div>
                  </div>
                </div>
                <div style={{ marginBottom: 20 }}>
                  <div style={{ fontSize: 13, color: '#374151', marginBottom: 10, lineHeight: 1.6 }}>
                    영구 삭제를 확인하려면 아래 입력란에 페이지 제목을 정확히 입력하세요:
                  </div>
                  <div style={{ background: '#f3f4f6', borderRadius: 8, padding: '8px 12px', marginBottom: 10, fontSize: 13, fontWeight: 700, color: '#111827', wordBreak: 'break-all' }}>
                    {permDeleteDialog.title}
                  </div>
                  <input
                    type="text"
                    value={permDeleteTitleInput}
                    onChange={e => setPermDeleteTitleInput(e.target.value)}
                    onKeyDown={e => { if (e.key === 'Enter' && permDeleteTitleInput.trim() === permDeleteDialog.title) handlePermanentDelete(); }}
                    placeholder="위의 제목을 정확히 입력하세요"
                    style={{
                      width: '100%', padding: '10px 14px', borderRadius: 8,
                      border: `2px solid ${permDeleteTitleInput.trim() === permDeleteDialog.title ? '#10b981' : '#e5e7eb'}`,
                      fontSize: 13, boxSizing: 'border-box', outline: 'none',
                      transition: 'border-color 0.2s',
                    }}
                    autoFocus
                  />
                  {permDeleteTitleInput.trim() === permDeleteDialog.title && (
                    <div style={{ fontSize: 11, color: '#10b981', marginTop: 4, fontWeight: 600 }}>✓ 제목이 일치합니다</div>
                  )}
                </div>
                <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
                  <button onClick={() => setPermDeleteDialog(d => d ? { ...d, step: 2 } : null)}
                    style={{ padding: '9px 20px', border: '1px solid #e5e7eb', borderRadius: 8, background: '#fff', cursor: 'pointer', fontSize: 13, color: '#374151', fontWeight: 500 }}>
                    ← 이전
                  </button>
                  <button
                    onClick={handlePermanentDelete}
                    disabled={permDeleteTitleInput.trim() !== permDeleteDialog.title || permanentDeleteMutation.isPending}
                    style={{
                      padding: '9px 20px', border: 'none', borderRadius: 8,
                      background: permDeleteTitleInput.trim() === permDeleteDialog.title ? '#dc2626' : '#e5e7eb',
                      cursor: permDeleteTitleInput.trim() === permDeleteDialog.title ? 'pointer' : 'not-allowed',
                      fontSize: 13, color: permDeleteTitleInput.trim() === permDeleteDialog.title ? '#fff' : '#9ca3af',
                      fontWeight: 600, transition: 'all 0.2s',
                    }}
                  >
                    {permanentDeleteMutation.isPending ? '삭제 중...' : '영구 삭제'}
                  </button>
                </div>
              </>
            )}
          </div>
        </div>
      )}

      {/* 업그레이드 오류 확인 다이얼로그 */}
      {upgradeConfirmDialog && (
        <div style={{
          position: 'fixed', inset: 0, zIndex: 1000,
          background: 'rgba(0,0,0,0.5)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          padding: 16,
        }}>
          <div style={{
            background: '#fff', borderRadius: 16, padding: 28,
            maxWidth: 540, width: '100%',
            boxShadow: '0 20px 60px rgba(0,0,0,0.25)',
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 16 }}>
              <div style={{ width: 36, height: 36, borderRadius: 8, background: 'rgba(239,68,68,0.1)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <span style={{ fontSize: 18 }}>⚠️</span>
              </div>
              <div>
                <div style={{ fontSize: 15, fontWeight: 700, color: '#111827' }}>HTML 유효성 검사 결과</div>
                <div style={{ fontSize: 12, color: '#6b7280' }}>"{upgradeConfirmDialog.pageTitle}" 페이지 업그레이드</div>
              </div>
            </div>

            {/* 오류 목록 */}
            {upgradeConfirmDialog.errors.length > 0 && (
              <div style={{ marginBottom: 14 }}>
                <div style={{ fontSize: 12, fontWeight: 700, color: '#dc2626', marginBottom: 6 }}>
                  ❌ 수정이 필요한 오류 ({upgradeConfirmDialog.errors.length}개)
                </div>
                <div style={{ background: '#fef2f2', border: '1px solid #fecaca', borderRadius: 8, padding: '10px 14px' }}>
                  {upgradeConfirmDialog.errors.map((e, i) => (
                    <div key={i} style={{ fontSize: 12, color: '#dc2626', marginBottom: i < upgradeConfirmDialog.errors.length - 1 ? 6 : 0 }}>
                      • {e}
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* 경고 목록 */}
            {upgradeConfirmDialog.warnings.length > 0 && (
              <div style={{ marginBottom: 14 }}>
                <div style={{ fontSize: 12, fontWeight: 700, color: '#d97706', marginBottom: 6 }}>
                  ⚠️ 경고 ({upgradeConfirmDialog.warnings.length}개)
                </div>
                <div style={{ background: '#fffbeb', border: '1px solid #fde68a', borderRadius: 8, padding: '10px 14px' }}>
                  {upgradeConfirmDialog.warnings.map((w, i) => (
                    <div key={i} style={{ fontSize: 12, color: '#92400e', marginBottom: i < upgradeConfirmDialog.warnings.length - 1 ? 6 : 0 }}>
                      • {w}
                    </div>
                  ))}
                </div>
              </div>
            )}

            <div style={{ fontSize: 12, color: '#6b7280', marginBottom: 20, padding: '10px 14px', background: '#f9fafb', borderRadius: 8 }}>
              위의 오류가 있어도 강제로 업그레이드할 수 있습니다. 다만 일부 기능이 정상 동작하지 않을 수 있습니다.
            </div>

            <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
              <button
                onClick={() => setUpgradeConfirmDialog(null)}
                disabled={upgradeLoading}
                style={{ padding: '8px 18px', border: '1px solid #e5e7eb', borderRadius: 8, background: '#fff', cursor: 'pointer', fontSize: 13, color: '#374151', fontWeight: 500 }}
              >
                취소
              </button>
              <button
                onClick={handleAutoFix}
                disabled={upgradeLoading || autoFixLoading}
                style={{
                  padding: '8px 18px', border: 'none', borderRadius: 8,
                  background: autoFixLoading ? '#9ca3af' : '#7c3aed',
                  color: '#fff', cursor: (upgradeLoading || autoFixLoading) ? 'not-allowed' : 'pointer',
                  fontSize: 13, fontWeight: 600,
                  display: 'flex', alignItems: 'center', gap: 6,
                }}
              >
                {autoFixLoading ? <><Loader2 size={13} className="animate-spin" /> AI 수정 중...</> : <><Wand2 size={13} /> AI 자동 수정 후 업그레이드</>}
              </button>
              <button
                onClick={handleForceUpgrade}
                disabled={upgradeLoading || autoFixLoading}
                style={{
                  padding: '8px 18px', border: 'none', borderRadius: 8,
                  background: upgradeLoading ? '#9ca3af' : '#dc2626',
                  color: '#fff', cursor: upgradeLoading ? 'not-allowed' : 'pointer',
                  fontSize: 13, fontWeight: 600,
                  display: 'flex', alignItems: 'center', gap: 6,
                }}
              >
                {upgradeLoading ? <><Loader2 size={13} className="animate-spin" /> 업그레이드 중...</> : '그래도 업그레이드'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 미리보기 다이얼로그 */}
      {previewDialog && (
        <div style={{
          position: 'fixed', inset: 0, zIndex: 1000,
          background: 'rgba(0,0,0,0.6)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          padding: 16,
        }}>
          <div style={{
            background: '#fff', borderRadius: 16, padding: 0,
            width: '90vw', maxWidth: 900, maxHeight: '90vh',
            boxShadow: '0 20px 60px rgba(0,0,0,0.3)',
            display: 'flex', flexDirection: 'column', overflow: 'hidden',
          }}>
            <div style={{ padding: '18px 24px', borderBottom: '1px solid #e5e7eb', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <div>
                <div style={{ fontSize: 15, fontWeight: 700, color: '#111827' }}>업그레이드 미리보기</div>
                <div style={{ fontSize: 12, color: '#6b7280', marginTop: 2 }}>"{previewDialog.pageTitle}" — 이 내용으로 교체됩니다</div>
              </div>
              <button onClick={() => setPreviewDialog(null)} style={{ border: 'none', background: 'none', cursor: 'pointer', color: '#6b7280', padding: 4 }}>
                <X size={18} />
              </button>
            </div>
            <div style={{ flex: 1, overflow: 'auto', background: '#f9fafb' }}>
              {(() => {
                const origin = window.location.origin;
                const processedHtml = previewDialog.htmlContent
                  .replace(/src=(["'])(\/manus-storage\/)/gi, `src=$1${origin}/manus-storage/`)
                  .replace(/href=(["'])(\/manus-storage\/)/gi, `href=$1${origin}/manus-storage/`);
                const blob = new Blob([processedHtml], { type: 'text/html; charset=utf-8' });
                const blobUrl = URL.createObjectURL(blob);
                return (
                  <iframe
                    src={blobUrl}
                    style={{ width: '100%', height: '60vh', border: 'none', display: 'block' }}
                    title="업그레이드 미리보기"
                    onLoad={(e) => {
                      URL.revokeObjectURL(blobUrl);
                      const iframe = e.currentTarget;
                      try {
                        const doc = iframe.contentDocument;
                        if (doc?.body) {
                          const h = doc.documentElement.scrollHeight || doc.body.scrollHeight;
                          if (h > 100) iframe.style.height = Math.min(h, window.innerHeight * 0.6) + 'px';
                        }
                      } catch {}
                    }}
                  />
                );
              })()}
            </div>
            <div style={{ padding: '14px 24px', borderTop: '1px solid #e5e7eb', background: '#fff' }}>
              {/* 메모 입력 필드 */}
              <div style={{ marginBottom: 12 }}>
                <label style={{ fontSize: 12, fontWeight: 600, color: '#374151', display: 'block', marginBottom: 4 }}>
                  업그레이드 메모 <span style={{ fontWeight: 400, color: '#9ca3af' }}>(선택 사항)</span>
                </label>
                <input
                  type="text"
                  value={upgradeMemo}
                  onChange={e => setUpgradeMemo(e.target.value)}
                  placeholder="예: 디자인 개선, 콘텐츠 추가, 버그 수정..."
                  maxLength={500}
                  style={{
                    width: '100%', padding: '7px 12px', border: '1px solid #e5e7eb',
                    borderRadius: 8, fontSize: 13, color: '#111827',
                    outline: 'none', boxSizing: 'border-box',
                  }}
                />
              </div>
              <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
              <button
                onClick={() => setPreviewDialog(null)}
                style={{ padding: '8px 18px', border: '1px solid #e5e7eb', borderRadius: 8, background: '#fff', cursor: 'pointer', fontSize: 13, color: '#374151', fontWeight: 500 }}
              >
                취소
              </button>
              <button
                onClick={handleConfirmUpgradeFromPreview}
                disabled={upgradeLoading}
                style={{
                  padding: '8px 20px', border: 'none', borderRadius: 8,
                  background: upgradeLoading ? '#9ca3af' : 'linear-gradient(135deg, #6366f1, #8b5cf6)',
                  color: '#fff', cursor: upgradeLoading ? 'not-allowed' : 'pointer',
                  fontSize: 13, fontWeight: 600, display: 'flex', alignItems: 'center', gap: 6,
                }}
              >
                {upgradeLoading ? <><Loader2 size={13} className="animate-spin" /> 업그레이드 중...</> : '이 내용으로 업그레이드'}
              </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* 이력 다이얼로그 */}
      {historyDialog && (
        <div style={{
          position: 'fixed', inset: 0, zIndex: 1000,
          background: 'rgba(0,0,0,0.5)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          padding: 16,
        }}>
          <div style={{
            background: '#fff', borderRadius: 16, padding: 0,
            maxWidth: 560, width: '100%', maxHeight: '80vh',
            boxShadow: '0 20px 60px rgba(0,0,0,0.25)',
            display: 'flex', flexDirection: 'column', overflow: 'hidden',
          }}>
            <div style={{ padding: '18px 24px', borderBottom: '1px solid #e5e7eb', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <div>
                <div style={{ fontSize: 15, fontWeight: 700, color: '#111827' }}>업그레이드 이력</div>
                <div style={{ fontSize: 12, color: '#6b7280', marginTop: 2 }}>"{historyDialog.pageTitle}" — 최대 10개 보관</div>
              </div>
              <button onClick={() => setHistoryDialog(null)} style={{ border: 'none', background: 'none', cursor: 'pointer', color: '#6b7280', padding: 4 }}>
                <X size={18} />
              </button>
            </div>
            <div style={{ flex: 1, overflow: 'auto', padding: '16px 24px' }}>
              {!upgradeHistory || upgradeHistory.length === 0 ? (
                <div style={{ textAlign: 'center', color: '#9ca3af', fontSize: 13, padding: '32px 0' }}>
                  <History size={32} style={{ marginBottom: 8, opacity: 0.4 }} />
                  <div>업그레이드 이력이 없습니다.</div>
                  <div style={{ fontSize: 11, marginTop: 4 }}>HTML 업그레이드 시 자동으로 백업됩니다.</div>
                </div>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                  {upgradeHistory.map((h, idx) => (
                    <div key={h.id} style={{
                      border: '1px solid #e5e7eb', borderRadius: 10, padding: '12px 16px',
                      display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                      background: idx === 0 ? '#f0fdf4' : '#fff',
                    }}>
                      <div>
                        <div style={{ fontSize: 12, fontWeight: 600, color: '#111827', display: 'flex', alignItems: 'center', gap: 6 }}>
                          {idx === 0 && <span style={{ fontSize: 10, background: '#dcfce7', color: '#16a34a', padding: '1px 6px', borderRadius: 4, fontWeight: 700 }}>최신</span>}
                          {h.note || '업그레이드 전 자동 백업'}
                        </div>
                        {h.memo && (
                          <div style={{ fontSize: 11, color: '#6366f1', marginTop: 2, fontStyle: 'italic' }}>
                            한줄 메모: {h.memo}
                          </div>
                        )}
                        <div style={{ fontSize: 11, color: '#6b7280', marginTop: 3 }}>
                          {new Date(h.createdAt).toLocaleString('ko-KR')}
                        </div>
                      </div>
                      <button
                        onClick={() => handleRestoreFromHistory(h.id)}
                        style={{
                          padding: '5px 12px', border: '1px solid #6366f1', borderRadius: 6,
                          background: '#fff', color: '#6366f1', cursor: 'pointer',
                          fontSize: 12, fontWeight: 600, display: 'flex', alignItems: 'center', gap: 4,
                        }}
                      >
                        <History size={11} /> 복원
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* 헤더 */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 16 }}>
        <div>
          <h2 style={{ fontSize: 16, fontWeight: 700, color: "#111827" }}>페이지 관리</h2>
          <p style={{ fontSize: 12, color: "#6b7280", marginTop: 2 }}>블로그 글과 별개로 독립적인 페이지를 만들고 관리합니다</p>
        </div>
        <button onClick={() => setEditingPage("new")}
          style={{ display: "flex", alignItems: "center", gap: 6, padding: "8px 16px", border: "none", borderRadius: 8, background: "linear-gradient(135deg, #6366f1, #8b5cf6)", color: "#fff", cursor: "pointer", fontSize: 13, fontWeight: 600 }}>
          <Plus size={15} /> 새 페이지 만들기
        </button>
      </div>

      {/* 상태별 필터 탭 */}
      {pages && pages.length > 0 && (
        <div style={{ display: "flex", gap: 6, marginBottom: 12, flexWrap: "wrap" }}>
          {([
            { key: "all", label: "전체", count: pages.length },
            { key: "published", label: "공개", count: pages.filter((p: CustomPage) => p.published).length },
            { key: "private", label: "비공개", count: pages.filter((p: CustomPage) => !p.published).length },
          ] as const).map(({ key, label, count }) => (
            <button
              key={key}
              onClick={() => setPageStatusFilter(key)}
              style={{
                padding: "5px 14px", borderRadius: 20, fontSize: 12, fontWeight: 600, cursor: "pointer",
                border: pageStatusFilter === key ? "1.5px solid #6366f1" : "1px solid #e5e7eb",
                background: pageStatusFilter === key ? "rgba(99,102,241,0.1)" : "#f9fafb",
                color: pageStatusFilter === key ? "#6366f1" : "#6b7280",
                transition: "all 0.15s",
              }}
            >
              {label} ({count})
            </button>
          ))}
        </div>
      )}

      {/* 페이지 목록 */}
      {isLoading ? (
        <div style={{ textAlign: "center", padding: 40 }}>
          <RefreshCw size={20} color="#6366f1" className="animate-spin" style={{ margin: "0 auto" }} />
        </div>
      ) : !pages || pages.length === 0 ? (
        <div style={{ textAlign: "center", padding: "60px 20px", border: "2px dashed #e5e7eb", borderRadius: 12, color: "#9ca3af" }}>
          <FileText size={40} style={{ margin: "0 auto 12px", display: "block", opacity: 0.3 }} />
          <p style={{ fontSize: 15, fontWeight: 600, marginBottom: 6 }}>아직 만들어진 페이지가 없습니다</p>
          <p style={{ fontSize: 13 }}>소개 페이지, 이용 안내 등 자유롭게 페이지를 만들어보세요</p>
          <button onClick={() => setEditingPage("new")}
            style={{ marginTop: 16, padding: "8px 20px", border: "none", borderRadius: 8, background: "#6366f1", color: "#fff", cursor: "pointer", fontSize: 13, fontWeight: 600 }}>
            첫 페이지 만들기
          </button>
        </div>
      ) : (() => {
        const filteredPages = pages.filter((p: CustomPage) =>
          pageStatusFilter === "all" ? true :
          pageStatusFilter === "published" ? p.published :
          !p.published
        );
        return filteredPages.length === 0 ? (
          <div style={{ textAlign: "center", padding: "40px 20px", border: "2px dashed #e5e7eb", borderRadius: 12, color: "#9ca3af" }}>
            <p style={{ fontSize: 14, fontWeight: 600 }}>
              {pageStatusFilter === "published" ? "공개된 페이지가 없습니다" : "비공개 페이지가 없습니다"}
            </p>
          </div>
        ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          {filteredPages.map((page: CustomPage) => (
            <div key={page.id} style={{ border: page.published ? "1.5px solid #6ee7b7" : "1.5px solid #e5e7eb", borderRadius: 8, padding: "6px 12px", background: page.published ? "#f0fdf4" : "#fff", display: "flex", flexDirection: "column", gap: 0, boxShadow: page.published ? "0 1px 4px rgba(16,185,129,0.08)" : "0 1px 4px rgba(0,0,0,0.04)", transition: "border-color 0.15s, box-shadow 0.15s" }}
              onMouseEnter={e => { (e.currentTarget as HTMLDivElement).style.borderColor = page.published ? "#10b981" : "#9ca3af"; (e.currentTarget as HTMLDivElement).style.boxShadow = page.published ? "0 2px 8px rgba(16,185,129,0.16)" : "0 2px 8px rgba(0,0,0,0.08)"; }}
              onMouseLeave={e => { (e.currentTarget as HTMLDivElement).style.borderColor = page.published ? "#6ee7b7" : "#e5e7eb"; (e.currentTarget as HTMLDivElement).style.boxShadow = page.published ? "0 1px 4px rgba(16,185,129,0.08)" : "0 1px 4px rgba(0,0,0,0.04)"; }}
            >
              <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
              {/* 썸네일 미리보기 */}
              {page.thumbnail ? (
                <div style={{ flexShrink: 0, width: 44, height: 33, borderRadius: 4, overflow: "hidden", border: "1px solid #e5e7eb", background: "#f9fafb" }}>
                  <img
                    src={page.thumbnail}
                    alt={page.title}
                    loading="lazy"
                    decoding="async"
                    sizes="64px"
                    srcSet={page.thumbnail.startsWith('/manus-storage/') && !page.thumbnail.includes('?w=') ? `${page.thumbnail}?w=320 320w, ${page.thumbnail}?w=640 640w` : undefined}
                    style={{ width: "100%", height: "100%", objectFit: "cover", display: "block" }}
                    onError={e => { (e.currentTarget as HTMLImageElement).style.display = "none"; }}
                  />
                </div>
              ) : (
                <div style={{ flexShrink: 0, width: 44, height: 33, borderRadius: 4, border: "1px dashed #d1d5db", background: "#f9fafb", display: "flex", alignItems: "center", justifyContent: "center" }}>
                  <Image size={18} style={{ color: "#d1d5db" }} />
                </div>
              )}
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ display: "flex", alignItems: "center", gap: 5, marginBottom: 2, flexWrap: "wrap" }}>
                  <a
                    href={page.published ? `/page/${page.slug}` : `/page/${page.slug}?preview=true`}
                    target="_blank" rel="noopener noreferrer"
                    title={page.published ? "발행된 페이지 열기" : "비공개 미리보기"}
                    style={{ fontSize: 13, fontWeight: 600, color: "#111827", textDecoration: "none", cursor: "pointer" }}
                    onMouseEnter={e => (e.currentTarget.style.color = "#6366f1")}
                    onMouseLeave={e => (e.currentTarget.style.color = "#111827")}
                  >{page.title}</a>
                  {page.published ? (
                    <Badge style={{ fontSize: 10, background: "rgba(16,185,129,0.1)", color: "#059669", border: "1px solid #a7f3d0", padding: "1px 6px" }}>발행됨</Badge>
                  ) : (
                    <Badge variant="outline" style={{ fontSize: 10, color: "#9ca3af", padding: "1px 6px" }}>비공개</Badge>
                  )}
                  {page.showInNav && (
                    <Badge style={{ fontSize: 10, background: "rgba(99,102,241,0.1)", color: "#6366f1", border: "1px solid #c7d2fe", padding: "1px 6px" }}>네비</Badge>
                  )}
                  {currentHomePageId === page.id && (
                    <Badge style={{ fontSize: 10, background: "rgba(245,158,11,0.15)", color: "#d97706", border: "1px solid #fcd34d", padding: "1px 6px" }}>현재 첫화면</Badge>
                  )}
                  {page.membersOnly && (
                    <Badge style={{ fontSize: 10, background: "rgba(239,68,68,0.1)", color: "#dc2626", border: "1px solid #fca5a5", padding: "1px 6px" }}>🔒 회원 전용</Badge>
                  )}
                </div>
                <div style={{ fontSize: 11, color: "#6b7280" }}>
                  <span style={{ fontFamily: "monospace" }}>/page/{page.slug}</span>
                  {page.description && (() => { const clean = stripHtmlAndCss(page.description, 80); return clean ? <span style={{ marginLeft: 10 }}>· {clean}</span> : null; })()}
                </div>
                <div style={{ fontSize: 10, color: "#9ca3af", marginTop: 1 }}>
                  섹션 {(() => { try { return JSON.parse(page.sectionsJson).length; } catch { return 0; } })()}개
                  · 조회 {((page as any).viewCount ?? 0).toLocaleString()}회
                  · 수정 {new Date(page.updatedAt).toLocaleDateString("ko-KR")}
                </div>
              </div>
              <div style={{ display: "flex", gap: 4, flexShrink: 0, flexWrap: "wrap", justifyContent: "flex-end" }}>
                {/* URL 복사 버튼 (항상 표시) */}
                <button
                  onClick={() => {
                    const url = `${window.location.origin}/page/${page.slug}`;
                    navigator.clipboard.writeText(url).then(() => {
                      toast.success("페이지 주소가 복사되었습니다");
                    }).catch(() => {
                      toast.error("복사 실패");
                    });
                  }}
                  title={`주소 복사: ${window.location.origin}/page/${page.slug}`}
                  style={{ padding: "3px 8px", border: "1px solid #e5e7eb", borderRadius: 6, background: "#fff", cursor: "pointer", fontSize: 12, color: "#6b7280", display: "flex", alignItems: "center", gap: 4 }}>
                  <Copy size={12} /> 주소 복사
                </button>
                <a
                  href={page.published ? `/page/${page.slug}` : `/page/${page.slug}?preview=true`}
                  target="_blank" rel="noopener noreferrer"
                  title={page.published ? "발행된 페이지 열기" : "비공개 페이지 미리보기 (관리자 전용)"}
                  style={{ padding: "3px 8px", border: page.published ? "1px solid #e5e7eb" : "1px solid #fbbf24", borderRadius: 6, background: page.published ? "#fff" : "#fffbeb", fontSize: 12, color: page.published ? "#6b7280" : "#d97706", textDecoration: "none", display: "flex", alignItems: "center", gap: 4 }}>
                  <ExternalLink size={12} /> {page.published ? "보기" : "미리보기"}
                </a>
                {/* 첫화면으로 설정 버튼 (발행된 페이지만) */}
                {page.published && (
                  <button
                    onClick={() => handleSetHomePage(page)}
                    disabled={settingHomePage === page.id}
                    title={currentHomePageId === page.id ? "첫화면 설정 해제" : "이 페이지를 첫화면으로 설정"}
                    style={{
                      padding: "3px 8px", borderRadius: 6, background: currentHomePageId === page.id ? "#fef3c7" : "#fff",
                      cursor: settingHomePage === page.id ? "not-allowed" : "pointer", fontSize: 12,
                      border: currentHomePageId === page.id ? "1px solid #fcd34d" : "1px solid #e5e7eb",
                      color: currentHomePageId === page.id ? "#d97706" : "#6b7280",
                      display: "flex", alignItems: "center", gap: 4, fontWeight: currentHomePageId === page.id ? 600 : 400,
                    }}>
                    <Globe size={12} />
                    {settingHomePage === page.id ? "저장 중..." : currentHomePageId === page.id ? "첫화면 해제" : "첫화면 설정"}
                  </button>
                )}
                {/* 메인 섹션 배치 버튼 */}
                <div style={{ position: "relative" }}>
                  <button
                    onClick={() => setSectionDropdownPageId(sectionDropdownPageId === page.id ? null : page.id)}
                    disabled={settingSection === page.id}
                    title="메인 섹션에 배치"
                    style={{
                      padding: "3px 8px", borderRadius: 6, fontSize: 12, cursor: settingSection === page.id ? "not-allowed" : "pointer",
                      display: "flex", alignItems: "center", gap: 4,
                      border: (page as any).mainSectionKey ? "1px solid #a5b4fc" : "1px solid #e5e7eb",
                      background: (page as any).mainSectionKey ? "rgba(99,102,241,0.08)" : "#fff",
                      color: (page as any).mainSectionKey ? "#4f46e5" : "#6b7280",
                      fontWeight: (page as any).mainSectionKey ? 600 : 400,
                    }}>
                    <LayoutGrid size={12} />
                    {settingSection === page.id ? "저장 중..." : (page as any).mainSectionKey ? `섹션: ${(page as any).mainSectionKey}` : "섹션 배치"}
                  </button>
                  {sectionDropdownPageId === page.id && (
                    <div style={{
                      position: "absolute", top: "100%", left: 0, zIndex: 100, marginTop: 4,
                      background: "#fff", border: "1px solid #e5e7eb", borderRadius: 8,
                      boxShadow: "0 4px 16px rgba(0,0,0,0.12)", minWidth: 200, padding: 6,
                    }}>
                      <div style={{ fontSize: 11, color: "#9ca3af", padding: "4px 8px", fontWeight: 600 }}>메인 섹션 선택</div>
                      {(navItemsForSection || []).map(n => {
                        const catKey = (n.path.match(/\/category\/([^/?#]+)/) || [])[1] || n.path.replace(/^.*\//, "");
                        return (
                          <button
                            key={n.id}
                            onClick={() => handleSetMainSection(page, catKey)}
                            style={{
                              display: "flex", alignItems: "center", gap: 8, width: "100%",
                              padding: "7px 10px", borderRadius: 6, border: "none", background: (page as any).mainSectionKey === catKey ? "#ede9fe" : "transparent",
                              color: (page as any).mainSectionKey === catKey ? "#4f46e5" : "#374151",
                              cursor: "pointer", fontSize: 13, fontWeight: (page as any).mainSectionKey === catKey ? 600 : 400,
                              textAlign: "left",
                            }}>
                            <LayoutGrid size={12} />
                            {n.label}
                            {(page as any).mainSectionKey === catKey && <Check size={12} style={{ marginLeft: "auto" }} />}
                          </button>
                        );
                      })}
                      {(page as any).mainSectionKey && (
                        <>
                          <div style={{ borderTop: "1px solid #f3f4f6", margin: "4px 0" }} />
                          <button
                            onClick={() => handleSetMainSection(page, null)}
                            style={{
                              display: "flex", alignItems: "center", gap: 8, width: "100%",
                              padding: "7px 10px", borderRadius: 6, border: "none", background: "transparent",
                              color: "#ef4444", cursor: "pointer", fontSize: 13, textAlign: "left",
                            }}>
                            <X size={12} /> 배치 해제
                          </button>
                        </>
                      )}
                      {(navItemsForSection || []).length === 0 && (
                        <div style={{ padding: "8px 10px", fontSize: 12, color: "#9ca3af" }}>네비게이션에 카테고리를 먼저 추가하세요</div>
                      )}
                    </div>
                  )}
                </div>
                <button onClick={() => handleTogglePublish(page)}
                  style={{ padding: "4px 10px", border: page.published ? "1.5px solid #6ee7b7" : "1.5px solid #d1d5db", borderRadius: 6, background: page.published ? "#dcfce7" : "#f3f4f6", cursor: "pointer", fontSize: 12, color: page.published ? "#ea580c" : "#6b7280", display: "flex", alignItems: "center", gap: 4, fontWeight: page.published ? 700 : 500 }}>
                  {page.published ? <Globe size={12} /> : <EyeOff size={12} />}
                  {page.published ? "발행" : "비공개"}
                </button>
                {/* 회원 전용 토글 버튼 */}
                <button
                  onClick={() => handleToggleMembersOnly(page)}
                  title={page.membersOnly ? "회원 전용 해제" : "회원 전용으로 설정"}
                  style={{
                    padding: "3px 8px", borderRadius: 6, fontSize: 12, cursor: "pointer",
                    display: "flex", alignItems: "center", gap: 4,
                    border: page.membersOnly ? "1px solid #fca5a5" : "1px solid #e5e7eb",
                    background: page.membersOnly ? "rgba(239,68,68,0.08)" : "#fff",
                    color: page.membersOnly ? "#dc2626" : "#9ca3af",
                  }}>
                  {page.membersOnly ? "🔒 회원 전용" : "🔓 전체 공개"}
                </button>
                {/* 댓글 토글 버튼 */}
                <button
                  onClick={() => handleToggleComments(page)}
                  title={(page as any).commentsEnabled !== false ? "댓글 비활성화" : "댓글 활성화"}
                  style={{
                    padding: "3px 8px", borderRadius: 6, fontSize: 12, cursor: "pointer",
                    display: "flex", alignItems: "center", gap: 4,
                    border: (page as any).commentsEnabled !== false ? "1px solid #a7f3d0" : "1px solid #e5e7eb",
                    background: (page as any).commentsEnabled !== false ? "rgba(16,185,129,0.08)" : "#fff",
                    color: (page as any).commentsEnabled !== false ? "#059669" : "#9ca3af",
                  }}>
                  <MessageSquare size={12} />
                  {(page as any).commentsEnabled !== false ? "댓글 ON" : "댓글 OFF"}
                </button>
                {/* 업그레이드 버튼 */}
                <button
                  onClick={() => {
                    setUpgradingPageId(page.id);
                    upgradeFileInputRef.current?.click();
                  }}
                  disabled={upgradeLoading && upgradingPageId === page.id}
                  title="새 HTML 파일로 페이지 내용 교체 (미리보기 후 적용)"
                  style={{
                    padding: "3px 8px", borderRadius: 6, fontSize: 12,
                    display: "flex", alignItems: "center", gap: 4,
                    border: "1px solid #a5b4fc",
                    background: "rgba(99,102,241,0.06)",
                    color: "#6366f1",
                    cursor: upgradeLoading && upgradingPageId === page.id ? "not-allowed" : "pointer",
                    fontWeight: 500,
                  }}
                >
                  {upgradeLoading && upgradingPageId === page.id
                    ? <><Loader2 size={12} className="animate-spin" /> 처리 중...</>
                    : <><Upload size={12} /> HTML 업그레이드</>}
                </button>
                {/* 이력 버튼 */}
                <button
                  onClick={() => setHistoryDialog({ pageId: page.id, pageTitle: page.title })}
                  title="업그레이드 이력 보기 및 이전 버전 복원"
                  style={{
                    padding: "3px 8px", borderRadius: 6, fontSize: 12,
                    display: "flex", alignItems: "center", gap: 4,
                    border: "1px solid #d1d5db",
                    background: "#fff",
                    color: "#6b7280",
                    cursor: "pointer",
                    fontWeight: 500,
                  }}
                >
                  <History size={12} /> 이력
                </button>
                {/* 다운로드 버튼 */}
                <button
                  onClick={async () => {
                    try {
                      const result = await trpcUtils.pages.downloadPage.fetch({ pageId: page.id });
                      const blob = new Blob([result.html], { type: 'text/html; charset=utf-8' });
                      const url = URL.createObjectURL(blob);
                      const a = document.createElement('a');
                      a.href = url;
                      a.download = result.filename;
                      document.body.appendChild(a);
                      a.click();
                      document.body.removeChild(a);
                      URL.revokeObjectURL(url);
                      toast.success(`"${page.title}" 페이지가 다운로드되었습니다.`);
                    } catch (err: any) {
                      toast.error(err?.message || '다운로드 실패');
                    }
                  }}
                  title="페이지 HTML 파일 다운로드"
                  style={{
                    padding: "3px 8px", borderRadius: 6, fontSize: 12,
                    display: "flex", alignItems: "center", gap: 4,
                    border: "1px solid #d1fae5",
                    background: "rgba(16,185,129,0.06)",
                    color: "#059669",
                    cursor: "pointer",
                    fontWeight: 500,
                  }}
                >
                  <Download size={12} /> HTML 다운로드
                </button>
                <button onClick={() => setEditingPage(page)}
                  style={{ padding: "3px 8px", border: "1px solid #e5e7eb", borderRadius: 6, background: "#fff", cursor: "pointer", fontSize: 12, color: "#374151", display: "flex", alignItems: "center", gap: 4 }}>
                  <Edit2 size={12} /> 편집
                </button>
                <button onClick={() => handleArchive(page.id, page.title)}
                  title="보관함으로 이동"
                  style={{ padding: "3px 8px", border: "1px solid #fecaca", borderRadius: 6, background: "#fff", cursor: "pointer", fontSize: 12, color: "#ef4444", display: "flex", alignItems: "center", gap: 4 }}>
                  <Trash2 size={12} />
                </button>
              </div>
              </div>
              {page.postListCategory && <PagePostsPanel postListCategory={page.postListCategory} onEditPage={() => setEditingPage(page)} />}
            </div>
          ))}
        </div>
        );
      })()}

      {/* 페이지 보관함 섹션 */}
      <div style={{ marginTop: 32, borderTop: '2px solid #f3f4f6', paddingTop: 24 }}>
        <button
          onClick={() => setShowArchived(v => !v)}
          style={{
            display: 'flex', alignItems: 'center', gap: 8,
            padding: '8px 16px', border: '1px solid #e5e7eb',
            borderRadius: 8, background: showArchived ? '#fef2f2' : '#fff',
            cursor: 'pointer', fontSize: 13, color: '#6b7280', fontWeight: 600,
            marginBottom: showArchived ? 16 : 0,
          }}
        >
          <span style={{ fontSize: 16 }}>📦</span>
          페이지 보관함 {archivedPages && archivedPages.length > 0 ? `(${archivedPages.length}개)` : ''}
          <span style={{ fontSize: 11, marginLeft: 4 }}>{showArchived ? '▲ 닫기' : '▼ 펼치기'}</span>
        </button>

        {showArchived && (
          <div>
            {!archivedPages || archivedPages.length === 0 ? (
              <div style={{ padding: '24px 16px', textAlign: 'center', color: '#9ca3af', fontSize: 13, background: '#fafafa', borderRadius: 10, border: '1px dashed #e5e7eb' }}>
                보관함이 비어 있습니다
              </div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                {archivedPages.map((page: any) => (
                  <div key={page.id} style={{
                    padding: '12px 16px', background: '#fef9f0',
                    border: '1px solid #fde68a', borderRadius: 10,
                  }}>
                    <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12 }}>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ fontSize: 14, fontWeight: 600, color: '#374151' }}>{page.title}</div>
                        <div style={{ fontSize: 11, color: '#9ca3af', marginTop: 2 }}>
                          /{page.slug} · 보관일: {new Date(page.updatedAt || page.createdAt).toLocaleDateString('ko-KR')}
                        </div>
                        {/* 보관 사유 메모 표시 */}
                        {page.archiveMemo && (
                          <div style={{
                            marginTop: 6, fontSize: 12, color: '#7c3aed',
                            fontStyle: 'italic', background: '#f5f3ff',
                            border: '1px solid #ddd6fe', borderRadius: 6,
                            padding: '4px 10px', display: 'inline-block',
                            maxWidth: '100%', wordBreak: 'break-word',
                          }}>
                            📝 {page.archiveMemo}
                          </div>
                        )}
                      </div>
                      <div style={{ display: 'flex', gap: 8, flexShrink: 0 }}>
                        <button
                          onClick={() => handleRestorePage(page.id, page.title)}
                          style={{
                            padding: '6px 14px', border: '1px solid #6366f1',
                            borderRadius: 7, background: '#fff', cursor: 'pointer',
                            fontSize: 12, color: '#6366f1', fontWeight: 600,
                            display: 'flex', alignItems: 'center', gap: 4,
                          }}
                        >
                          ↩ 복원
                        </button>
                        <button
                          onClick={() => { setPermDeleteDialog({ id: page.id, title: page.title, step: 1 }); setPermDeleteTitleInput(''); }}
                          title="영구 삭제 (복구 불가)"
                          style={{
                            padding: '6px 12px', border: '1px solid #fecaca',
                            borderRadius: 7, background: '#fff', cursor: 'pointer',
                            fontSize: 12, color: '#ef4444', fontWeight: 600,
                            display: 'flex', alignItems: 'center', gap: 4,
                          }}
                        >
                          <Trash2 size={12} /> 영구 삭제
                        </button>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
