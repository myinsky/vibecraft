import { useEditor, EditorContent, type Editor } from "@tiptap/react";
import { FloatingMenu } from "@tiptap/react/menus";
import StarterKit from "@tiptap/starter-kit";
import Image from "@tiptap/extension-image";
import { mergeAttributes } from "@tiptap/core";
import Placeholder from "@tiptap/extension-placeholder";
import TextAlign from "@tiptap/extension-text-align";
import { TextStyle } from "@tiptap/extension-text-style";
// FontSize는 커스텀 구현으로 대체 (아래 CustomFontSize 참조)
import FontFamily from "@tiptap/extension-font-family";
import Color from "@tiptap/extension-color";
import Highlight from "@tiptap/extension-highlight";
import TaskList from "@tiptap/extension-task-list";
import TaskItem from "@tiptap/extension-task-item";
import { Table as TableBase } from "@tiptap/extension-table";
import TableRow from "@tiptap/extension-table-row";

// 커스텀 Table: style 속성 지원 (표 전체 너비 등 인라인 저장)
const Table = TableBase.extend({
  addAttributes() {
    return {
      ...this.parent?.(),
      style: {
        default: null,
        parseHTML: (el: HTMLElement) => el.getAttribute('style') || null,
        renderHTML: (attrs: Record<string, unknown>) => attrs.style ? { style: attrs.style } : {},
      },
    };
  },
});
import TableCellBase from "@tiptap/extension-table-cell";
import TableHeaderBase from "@tiptap/extension-table-header";

// 커스텀 TableCell: style 속성(배경색, 테두리 등) 인라인 저장 지원
const TableCell = TableCellBase.extend({
  addAttributes() {
    return {
      ...this.parent?.(),
      style: {
        default: null,
        parseHTML: (el: HTMLElement) => el.getAttribute('style') || null,
        renderHTML: (attrs: Record<string, unknown>) => attrs.style ? { style: attrs.style } : {},
      },
    };
  },
});

// 커스텀 TableHeader: style 속성 인라인 저장 지원
const TableHeader = TableHeaderBase.extend({
  addAttributes() {
    return {
      ...this.parent?.(),
      style: {
        default: null,
        parseHTML: (el: HTMLElement) => el.getAttribute('style') || null,
        renderHTML: (attrs: Record<string, unknown>) => attrs.style ? { style: attrs.style } : {},
      },
    };
  },
});
import { Node, Extension } from "@tiptap/core";
import OrderedList from "@tiptap/extension-ordered-list";

// OrderedListNoInputRule: 툴바 버튼은 작동하되 '1. ' 입력 시 자동 변환만 비활성화
const OrderedListNoInputRule = OrderedList.extend({
  addInputRules() {
    return []; // input rule 완전 비활성화
  },
});
import { useRef, useState, useCallback, useEffect } from "react";
import { createPortal } from "react-dom";
import { trpc } from "@/lib/trpc";

// CustomFontSize: 글자크기 조정 커스텀 Extension
// - 텍스트 선택 시: setMark('textStyle', { fontSize }) → <span style="font-size:...">
// - 커서만 있을 때: updateAttributes('paragraph'/'heading', { fontSize }) → <p style="font-size:...">
const CustomFontSize = Extension.create({
  name: 'customFontSize',
  addOptions() {
    return { types: ['textStyle', 'paragraph', 'heading', 'tableCell', 'tableHeader'] };
  },
  addGlobalAttributes() {
    return [
      {
        types: ['paragraph', 'heading', 'tableCell', 'tableHeader'],
        attributes: {
          fontSize: {
            default: null,
            parseHTML: (el: HTMLElement) => el.style.fontSize || null,
            renderHTML: (attrs: Record<string, unknown>) => {
              if (!attrs.fontSize) return {};
              return { style: `font-size: ${attrs.fontSize}` };
            },
          },
        },
      },
      {
        types: ['textStyle'],
        attributes: {
          fontSize: {
            default: null,
            parseHTML: (el: HTMLElement) => el.style.fontSize || null,
            renderHTML: (attrs: Record<string, unknown>) => {
              if (!attrs.fontSize) return {};
              return { style: `font-size: ${attrs.fontSize}` };
            },
          },
        },
      },
    ];
  },
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  addCommands(): any {
    return {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      setFontSize: (fontSize: string) => ({ chain, state }: any) => {
        const { selection } = state;
        const hasSelection = !selection.empty;
        if (hasSelection) {
          // 선택된 텍스트에만 span으로 적용
          return chain().setMark('textStyle', { fontSize }).run();
        } else {
          // 커서 위치 단락/제목/표 셀 전체에 적용
          return chain()
            .updateAttributes('paragraph', { fontSize })
            .updateAttributes('heading', { fontSize })
            .updateAttributes('tableCell', { fontSize })
            .updateAttributes('tableHeader', { fontSize })
            .run();
        }
      },
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      unsetFontSize: () => ({ chain, state }: any) => {
        const { selection } = state;
        const hasSelection = !selection.empty;
        if (hasSelection) {
          return chain().setMark('textStyle', { fontSize: null }).removeEmptyTextStyle().run();
        } else {
          return chain()
            .updateAttributes('paragraph', { fontSize: null })
            .updateAttributes('heading', { fontSize: null })
            .updateAttributes('tableCell', { fontSize: null })
            .updateAttributes('tableHeader', { fontSize: null })
            .run();
        }
      },
    };
  },
});

// LineHeight: 줄간격(line-height) 조정 커스텀 Extension
const LineHeight = Extension.create({
  name: 'lineHeight',
  addOptions() {
    // paragraph/heading/tableCell/tableHeader: block 노드에 line-height 직접 적용
    // textStyle: inline span에도 적용 (하위 호환성)
    return { types: ['paragraph', 'heading', 'tableCell', 'tableHeader', 'textStyle'] };
  },
  addGlobalAttributes() {
    return [
      {
        types: this.options.types,
        attributes: {
          lineHeight: {
            default: null,
            parseHTML: (el: HTMLElement) => el.style.lineHeight || null,
            renderHTML: (attrs: Record<string, unknown>) => {
              if (!attrs.lineHeight) return {};
              return { style: `line-height: ${attrs.lineHeight}` };
            },
          },
        },
      },
    ];
  },
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  addCommands(): any {
    return {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      setLineHeight: (lineHeight: string) => ({ tr, state, dispatch }: any) => {
        // 선택 범위 내 모든 block 노드(paragraph/heading/tableCell/tableHeader)에 적용
        // 선택이 없으면 커서 위치 단락에만 적용
        const { from, to, empty } = state.selection;
        const blockTypes = ['paragraph', 'heading', 'tableCell', 'tableHeader'];
        let changed = false;

        if (empty) {
          // 커서만 있을 때: $from을 탐색하여 가장 가까운 block 노드 찾기
          const { $from } = state.selection;
          for (let d = $from.depth; d >= 0; d--) {
            const node = $from.node(d);
            if (blockTypes.includes(node.type.name)) {
              const pos = $from.before(d);
              tr.setNodeMarkup(pos, undefined, { ...node.attrs, lineHeight });
              changed = true;
              break;
            }
          }
        } else {
          // 선택 범위 내 모든 block 노드에 적용
          state.doc.nodesBetween(from, to, (node: any, pos: number) => {
            if (blockTypes.includes(node.type.name)) {
              tr.setNodeMarkup(pos, undefined, { ...node.attrs, lineHeight });
              changed = true;
            }
          });
        }

        if (changed && dispatch) dispatch(tr);
        return changed;
      },
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      unsetLineHeight: () => ({ tr, state, dispatch }: any) => {
        const { from, to, empty } = state.selection;
        const blockTypes = ['paragraph', 'heading', 'tableCell', 'tableHeader'];
        let changed = false;

        if (empty) {
          const { $from } = state.selection;
          for (let d = $from.depth; d >= 0; d--) {
            const node = $from.node(d);
            if (blockTypes.includes(node.type.name)) {
              const pos = $from.before(d);
              const newAttrs = { ...node.attrs };
              delete newAttrs.lineHeight;
              tr.setNodeMarkup(pos, undefined, newAttrs);
              changed = true;
              break;
            }
          }
        } else {
          state.doc.nodesBetween(from, to, (node: any, pos: number) => {
            if (blockTypes.includes(node.type.name)) {
              const newAttrs = { ...node.attrs };
              delete newAttrs.lineHeight;
              tr.setNodeMarkup(pos, undefined, newAttrs);
              changed = true;
            }
          });
        }

        if (changed && dispatch) dispatch(tr);
        return changed;
      },
    };
  },
});

// CustomDiv: style/class 속성이 있는 <div> 태그를 보존 (외부 CMS에서 가져온 파란 박스 등)
const CustomDiv = Node.create({
  name: 'customDiv',
  group: 'block',
  content: 'block+',
  defining: true,
  addAttributes() {
    return {
      style: {
        default: null,
        parseHTML: (el: HTMLElement) => el.getAttribute('style') || null,
        renderHTML: (attrs: Record<string, unknown>) => attrs.style ? { style: attrs.style } : {},
      },
      class: {
        default: null,
        parseHTML: (el: HTMLElement) => el.getAttribute('class') || null,
        renderHTML: (attrs: Record<string, unknown>) => attrs.class ? { class: attrs.class } : {},
      },
    };
  },
  parseHTML() {
    return [{ tag: 'div[style]' }, { tag: 'div[class]' }];
  },
  renderHTML({ HTMLAttributes }: { HTMLAttributes: Record<string, unknown> }) {
    return ['div', mergeAttributes(HTMLAttributes as Record<string, string>), 0];
  },
});

// IframeNode: <iframe> 태그를 TipTap 노드로 파싱하여 클릭 삭제 지원 (냅킨/유튜브/외부 임베드)
const IframeNode = Node.create({
  name: 'iframe',
  group: 'block',
  atom: true,
  addAttributes() {
    return {
      src: { default: null, parseHTML: (el: HTMLElement) => el.getAttribute('src'), renderHTML: (a) => a.src ? { src: a.src } : {} },
      width: { default: '100%', parseHTML: (el: HTMLElement) => el.getAttribute('width') || '100%', renderHTML: (a) => a.width ? { width: a.width } : {} },
      height: { default: '400', parseHTML: (el: HTMLElement) => el.getAttribute('height') || '400', renderHTML: (a) => a.height ? { height: a.height } : {} },
      frameborder: { default: '0', parseHTML: (el: HTMLElement) => el.getAttribute('frameborder') || '0', renderHTML: (a) => ({ frameborder: a.frameborder }) },
      allowfullscreen: { default: true, parseHTML: (el: HTMLElement) => el.hasAttribute('allowfullscreen'), renderHTML: (a) => a.allowfullscreen ? { allowfullscreen: '' } : {} },
      style: { default: null, parseHTML: (el: HTMLElement) => el.getAttribute('style'), renderHTML: (a) => a.style ? { style: a.style } : {} },
      allow: { default: null, parseHTML: (el: HTMLElement) => el.getAttribute('allow'), renderHTML: (a) => a.allow ? { allow: a.allow } : {} },
      title: { default: null, parseHTML: (el: HTMLElement) => el.getAttribute('title'), renderHTML: (a) => a.title ? { title: a.title } : {} },
      class: { default: null, parseHTML: (el: HTMLElement) => el.getAttribute('class'), renderHTML: (a) => a.class ? { class: a.class } : {} },
    };
  },
  parseHTML() { return [{ tag: 'iframe' }]; },
  renderHTML({ HTMLAttributes }) {
    return ['iframe', mergeAttributes(HTMLAttributes)];
  },
});

import {
  Bold, Italic, Underline as UnderlineIcon, Strikethrough,
  Code, Code2, Quote, List, ListOrdered, ListChecks,
  AlignLeft, AlignCenter, AlignRight, AlignJustify,
  Link as LinkIcon, Image as ImageIcon, Paperclip, Video,
  Heading1, Heading2, Heading3, Heading4, Heading5,
  Minus, Table as TableIcon,
  Undo, Redo, Type, Highlighter,
  Eye, EyeOff, Loader2,
  Wand2, Pencil, Check, X as XIcon, Maximize2,
  BookOpen, AlertCircle, Sparkles,
  Palette, ChevronDown, Save, BookMarked, Trash2,
  Plus, AlignHorizontalJustifyCenter, Heading1 as H1Icon, Heading2 as H2Icon, Heading3 as H3Icon,
  SeparatorHorizontal, Quote as QuoteIcon2, Code2 as Code2Icon, ListIcon, ListOrdered as ListOrderedIcon,
} from "lucide-react";
import { toast } from "sonner";

interface RichEditorProps {
  content: string;
  onChange: (html: string) => void;
  placeholder?: string;
  minHeight?: number;
  /** AI alt 텍스트 생성 시 컨텍스트 힌트 (예: 포스트 제목) */
  context?: string;
}

// ─── Toolbar Button ────────────────────────────────────────────
function ToolBtn({
  onClick, onMouseDown, active, title, disabled, children,
}: {
  onClick?: () => void;
  onMouseDown?: (e: React.MouseEvent<HTMLButtonElement>) => void;
  active?: boolean;
  title: string;
  disabled?: boolean;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      title={title}
      onClick={onClick}
      onMouseDown={onMouseDown}
      disabled={disabled}
      style={{
        display: "flex", alignItems: "center", justifyContent: "center",
        width: 32, height: 32, borderRadius: 6,
        background: active ? "#4f46e5" : "transparent",
        border: active ? "1px solid #4f46e5" : "1px solid transparent",
        color: active ? "#ffffff" : disabled ? "#b0b8c8" : "#1f2937",
        cursor: disabled ? "not-allowed" : "pointer",
        transition: "all 0.12s",
        flexShrink: 0,
        opacity: disabled ? 0.4 : 1,
        fontWeight: active ? 700 : 400,
      }}
      onMouseEnter={e => {
        if (!disabled && !active) {
          (e.currentTarget as HTMLElement).style.background = "#e8eaff";
          (e.currentTarget as HTMLElement).style.color = "#4338ca";
          (e.currentTarget as HTMLElement).style.border = "1px solid #c7d2fe";
        }
      }}
      onMouseLeave={e => {
        if (!disabled) {
          (e.currentTarget as HTMLElement).style.background = active ? "#4f46e5" : "transparent";
          (e.currentTarget as HTMLElement).style.color = active ? "#ffffff" : disabled ? "#b0b8c8" : "#1f2937";
          (e.currentTarget as HTMLElement).style.border = active ? "1px solid #4f46e5" : "1px solid transparent";
        }
      }}
    >
      {children}
    </button>
  );
}

function Divider() {
  return <div style={{ width: 1, height: 22, background: "#b8bfd4", margin: "0 4px", flexShrink: 0, borderRadius: 1 }} />;
}

// ─── 목차 생성용 slug 유틸 ────────────────────────────────────────
function makeEditorSlug(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^\w\uAC00-\uD7A3\u3040-\u30FF\u4E00-\u9FFF\s-]/g, "")
    .trim()
    .replace(/\s+/g, "-")
    .replace(/-+/g, "-")
    .slice(0, 60);
}

// ─── Link Dialog ───────────────────────────────────────────────
function LinkDialog({ editor, onClose }: { editor: Editor; onClose: () => void }) {
  // Portal을 사용해 document.body에 직접 렌더링 (이벤트 버블링 문제 방지)
  const [url, setUrl] = useState(editor.getAttributes("link").href || "");
  const [text, setText] = useState("");

  const handleInsert = () => {
    if (!url.trim()) { toast.error("URL을 입력해주세요."); return; }
    // #hash 링크는 같은 페이지 앵커이므로 target 없이 삽입, 외부 링크만 _blank
    const isAnchor = url.startsWith("#");
    const href = isAnchor ? url : (url.startsWith("http") ? url : `https://${url}`);
    const targetAttr = isAnchor ? "" : ` target="_blank"`;
    if (editor.state.selection.empty && text.trim()) {
      editor.chain().focus().insertContent(`<a href="${href}"${targetAttr}>${text}</a>`).run();
    } else {
      if (isAnchor) {
        // 앵커 링크: target 속성 없이 설정
        editor.chain().focus().extendMarkRange("link").setLink({ href }).run();
      } else {
        editor.chain().focus().extendMarkRange("link").setLink({ href, target: "_blank" }).run();
      }
    }
    onClose();
  };

  return createPortal(
    <div
      style={{
        position: "fixed",
        top: "50%", left: "50%",
        transform: "translate(-50%, -50%)",
        zIndex: 9999,
        background: "#ffffff", border: "1px solid #e5e7eb",
        borderRadius: 12, padding: "20px", width: 340,
        boxShadow: "0 20px 60px rgba(0,0,0,0.25)",
      }}
      onClick={e => e.stopPropagation()}
      onMouseDown={e => e.stopPropagation()}
    >
      <div style={{ fontSize: 13, fontWeight: 700, color: "#111827", marginBottom: 12 }}>링크 삽입</div>
      <input
        autoFocus
        type="text"
        value={url}
        onChange={e => setUrl(e.target.value)}
        placeholder="https://example.com"
        onKeyDown={e => { if (e.key === "Enter") handleInsert(); if (e.key === "Escape") onClose(); }}
        style={{
          width: "100%", padding: "8px 10px", marginBottom: 8,
          background: "#ffffff", border: "1px solid #e5e7eb",
          borderRadius: 6, fontSize: 12, color: "#111827",
          outline: "none", boxSizing: "border-box",
        }}
      />
      {editor.state.selection.empty && (
        <input
          type="text"
          value={text}
          onChange={e => setText(e.target.value)}
          placeholder="링크 텍스트 (선택)"
          style={{
            width: "100%", padding: "8px 10px", marginBottom: 8,
            background: "#ffffff", border: "1px solid #e5e7eb",
            borderRadius: 6, fontSize: 12, color: "#111827",
            outline: "none", boxSizing: "border-box",
          }}
        />
      )}
      <div style={{ display: "flex", gap: 6 }}>
        <button type="button" onClick={onClose} style={{
          flex: 1, padding: "6px", borderRadius: 6,
          background: "#e5e7eb", border: "1px solid #e5e7eb",
          fontSize: 11, color: "#6b7280", cursor: "pointer",
        }}>취소</button>
        <button type="button" onClick={handleInsert} style={{
          flex: 2, padding: "6px", borderRadius: 6,
          background: "linear-gradient(135deg, #6366f1, #8b5cf6)",
          border: "none", fontSize: 11, fontWeight: 700, color: "#fff", cursor: "pointer",
        }}>삽입</button>
      </div>
    </div>,
    document.body
  );
}

// ─── Image Dialog ──────────────────────────────────────────────
function ImageDialog({
  editor, onClose, onUploadStart, onUploadEnd,
}: { editor: Editor; onClose: () => void; onUploadStart?: () => void; onUploadEnd?: () => void }) {
  const [url, setUrl] = useState("");
  const [alt, setAlt] = useState("");
  const [uploading, setUploading] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  const handleUrlInsert = () => {
    if (!url.trim()) { toast.error("이미지 URL을 입력해주세요."); return; }
    editor.chain().focus().setImage({ src: url, alt: alt || undefined }).run();
    onClose();
  };

  const MAX_IMAGE_SIZE = 5 * 1024 * 1024; // 5MB

  const handleFileUpload = async (file: File) => {
    if (file.size > MAX_IMAGE_SIZE) {
      toast.error(`이미지 크기가 너무 큽니다. 5MB 이하의 파일만 업로드할 수 있습니다. (현재: ${(file.size / 1024 / 1024).toFixed(1)}MB)`);
      return;
    }
    setUploading(true);
    onUploadStart?.(); // 에디터 오버레이 표시
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
      onClose(); // 다이얼로그 먼저 닫기 (에디터 포커스 복원 후 이미지 삽입)
      setTimeout(() => {
        editor.chain().focus().setImage({ src: data.url, alt: file.name }).run();
        toast.success("이미지가 삽입되었습니다.");
      }, 50);
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : "이미지 업로드 실패");
    } finally {
      setUploading(false);
      onUploadEnd?.(); // 에디터 오버레이 숨기기
    }
  };

  return createPortal(
    <div
      style={{
        position: "fixed",
        top: "50%", left: "50%",
        transform: "translate(-50%, -50%)",
        zIndex: 10001,
        background: "#ffffff", border: "1px solid #e5e7eb",
        borderRadius: 12, padding: "20px", width: 360,
        boxShadow: "0 20px 60px rgba(0,0,0,0.25)",
      }}
      onClick={e => e.stopPropagation()}
      onMouseDown={e => e.stopPropagation()}
    >
      <div style={{ fontSize: 13, fontWeight: 700, color: "#111827", marginBottom: 12 }}>이미지 삽입</div>

      {/* File upload area - input을 position:absolute로 드롭존 위에 올려 직접 클릭 전달 (브라우저 보안 정책 우회) */}
      <div
        onDragOver={e => { e.preventDefault(); (e.currentTarget as HTMLElement).style.borderColor = "#6366f1"; }}
        onDragLeave={e => { (e.currentTarget as HTMLElement).style.borderColor = "#e5e7eb"; }}
        onDrop={e => {
          e.preventDefault();
          (e.currentTarget as HTMLElement).style.borderColor = "#e5e7eb";
          const file = e.dataTransfer.files[0];
          if (file) handleFileUpload(file);
        }}
        style={{
          position: "relative",
          border: "2px dashed #d1d5db", borderRadius: 8,
          padding: "16px", textAlign: "center", cursor: "pointer",
          marginBottom: 12, transition: "border-color 0.15s",
        }}
      >
        {uploading ? (
          <div style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 8, color: "#6366f1" }}>
            <Loader2 size={16} style={{ animation: "spin 1s linear infinite" }} />
            <span style={{ fontSize: 12 }}>업로드 중...</span>
          </div>
        ) : (
          <>
            <ImageIcon size={20} color="#6b7280" style={{ margin: "0 auto 6px" }} />
            <div style={{ fontSize: 12, color: "#6b7280" }}>클릭하거나 드래그해서 이미지 업로드</div>
            <div style={{ fontSize: 10, color: "#6b7280", marginTop: 4 }}>JPG, PNG, GIF, WebP (최대 5MB)</div>
            {/* input을 드롭존 전체 위에 투명하게 올려 직접 클릭 전달 */}
            <input
              ref={fileRef}
              type="file"
              accept="image/*"
              style={{ position: "absolute", inset: 0, opacity: 0, cursor: "pointer", width: "100%", height: "100%" }}
              onChange={e => { const f = e.target.files?.[0]; if (f) { e.target.value = ''; handleFileUpload(f); } }}
            />
          </>
        )}
      </div>

      <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 10 }}>
        <div style={{ flex: 1, height: 1, background: "#e5e7eb" }} />
        <span style={{ fontSize: 10, color: "#6b7280" }}>또는 URL 입력</span>
        <div style={{ flex: 1, height: 1, background: "#e5e7eb" }} />
      </div>

      <input
        type="text"
        value={url}
        onChange={e => setUrl(e.target.value)}
        placeholder="https://example.com/image.jpg"
        onKeyDown={e => { if (e.key === "Enter") handleUrlInsert(); if (e.key === "Escape") onClose(); }}
        style={{
          width: "100%", padding: "8px 10px", marginBottom: 8,
          background: "#ffffff", border: "1px solid #e5e7eb",
          borderRadius: 6, fontSize: 12, color: "#111827",
          outline: "none", boxSizing: "border-box",
        }}
      />
      <input
        type="text"
        value={alt}
        onChange={e => setAlt(e.target.value)}
        placeholder="이미지 설명 (alt 텍스트, 선택)"
        style={{
          width: "100%", padding: "8px 10px", marginBottom: 10,
          background: "#ffffff", border: "1px solid #e5e7eb",
          borderRadius: 6, fontSize: 12, color: "#111827",
          outline: "none", boxSizing: "border-box",
        }}
      />
      <div style={{ display: "flex", gap: 6 }}>
        <button type="button" onClick={onClose} style={{
          flex: 1, padding: "6px", borderRadius: 6,
          background: "#e5e7eb", border: "1px solid #e5e7eb",
          fontSize: 11, color: "#6b7280", cursor: "pointer",
        }}>취소</button>
        <button type="button" onClick={handleUrlInsert} disabled={!url.trim()} style={{
          flex: 2, padding: "6px", borderRadius: 6,
          background: url.trim() ? "linear-gradient(135deg, #6366f1, #8b5cf6)" : "#e5e7eb",
          border: "none", fontSize: 11, fontWeight: 700,
          color: url.trim() ? "#fff" : "#6b7280", cursor: url.trim() ? "pointer" : "not-allowed",
        }}>URL로 삽입</button>
      </div>
    </div>,
    document.body
  );
}

// ─── File Attachment Dialog ────────────────────────────────────
function FileDialog({ editor, onClose }: { editor: Editor; onClose: () => void }) {
  const [uploading, setUploading] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  const [btnColor, setBtnColor] = useState('#2563eb');
  const [btnSize, setBtnSize] = useState<'sm' | 'md' | 'lg'>('md');
  const [btnAlign, setBtnAlign] = useState<'left' | 'center' | 'right'>('center');
  const [btnTextColor, setBtnTextColor] = useState('#ffffff');
  const [btnCustomText, setBtnCustomText] = useState('');

  const buildBtnHtml = (downloadUrl: string, filename: string, sizeStr: string) => {
    const pad = btnSize === 'sm' ? '6px 16px' : btnSize === 'lg' ? '14px 28px' : '10px 22px';
    const fs = btnSize === 'sm' ? '12px' : btnSize === 'lg' ? '16px' : '14px';
    const hexColor = btnColor.replace('#', '');
    const r = parseInt(hexColor.slice(0, 2), 16);
    const g = parseInt(hexColor.slice(2, 4), 16);
    const b = parseInt(hexColor.slice(4, 6), 16);
    const label = btnCustomText.trim() || `⬇️ ${filename} (${sizeStr}) 다운로드`;
    return `<div style="margin:12px 0;text-align:${btnAlign}"><a href="${downloadUrl}" target="_blank" rel="noopener noreferrer" download="${filename}" style="display:inline-flex;align-items:center;gap:8px;padding:${pad};background:${btnColor};color:${btnTextColor};border-radius:8px;text-decoration:none;font-size:${fs};font-weight:600;box-shadow:0 2px 8px rgba(${r},${g},${b},0.3)">${label}</a></div>`;
  };

  const handleFileUpload = async (file: File) => {
    setUploading(true);
    try {
      const formData = new FormData();
      formData.append("file", file);
      const res = await fetch("/api/upload/file", {
        method: "POST",
        body: formData,
        credentials: "include",
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({ error: "업로드 실패" }));
        throw new Error(err.error || "업로드 실패");
      }
      const data = await res.json();
      const sizeStr = data.size < 1024 * 1024
        ? `${(data.size / 1024).toFixed(1)}KB`
        : `${(data.size / 1024 / 1024).toFixed(1)}MB`;
      // /api/download/:fileKey 전용 API를 사용하여 원본 파일명으로 다운로드
      // 이 방식은 Nginx 프록시 환경에서도 URL 파라미터 손실 없이 원본 파일명 보장
      const downloadUrl = data.key
        ? `/api/download/${data.key}`
        : data.url;
      // 선택된 스타일 옵션으로 다운로드 버튼 HTML 생성
      const btnHtml = buildBtnHtml(downloadUrl, data.filename, sizeStr);
      editor.chain().focus().insertContent(btnHtml).run();
      toast.success(`파일이 첨부되었습니다: ${data.filename}`);
      onClose();
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : "파일 업로드 실패");
    } finally {
      setUploading(false);
    }
  };

  return createPortal(
    <div
      style={{
        position: "fixed",
        top: "50%", left: "50%",
        transform: "translate(-50%, -50%)",
        zIndex: 10001,
        background: "#ffffff", border: "1px solid #e5e7eb",
        borderRadius: 12, padding: "20px", width: 380,
        boxShadow: "0 20px 60px rgba(0,0,0,0.25)",
        display: 'flex', flexDirection: 'column', gap: 12,
      }}
      onClick={e => e.stopPropagation()}
      onMouseDown={e => e.stopPropagation()}
    >
      <div style={{ fontSize: 13, fontWeight: 700, color: "#111827" }}>📎 파일 첨부</div>

      {/* 버튼 스타일 옵션 */}
      <div style={{ background: '#f8fafc', borderRadius: 8, padding: '10px 12px', display: 'flex', flexDirection: 'column', gap: 8 }}>
        {/* 색상 선택 */}
        <div>
          <div style={{ fontSize: 11, fontWeight: 600, color: '#374151', marginBottom: 5 }}>버튼 색상</div>
          <div style={{ display: 'flex', gap: 6 }}>
            {[
              { color: '#2563eb', label: '파란' },
              { color: '#16a34a', label: '초록' },
              { color: '#dc2626', label: '빨강' },
              { color: '#6b7280', label: '회색' },
              { color: '#7c3aed', label: '보라' },
            ].map(({ color, label }) => (
              <button
                key={color}
                type="button"
                title={label}
                onClick={() => setBtnColor(color)}
                style={{
                  width: 24, height: 24, borderRadius: '50%', background: color,
                  border: btnColor === color ? '3px solid #1e3a5f' : '2px solid transparent',
                  cursor: 'pointer',
                  outline: btnColor === color ? '2px solid #fff' : 'none',
                  outlineOffset: '-4px',
                  boxShadow: '0 1px 4px rgba(0,0,0,0.15)',
                }}
              />
            ))}
          </div>
        </div>
        {/* 크기 선택 */}
        <div>
          <div style={{ fontSize: 11, fontWeight: 600, color: '#374151', marginBottom: 5 }}>버튼 크기</div>
          <div style={{ display: 'flex', gap: 5 }}>
            {(['sm', 'md', 'lg'] as const).map((sz) => (
              <button
                key={sz}
                type="button"
                onClick={() => setBtnSize(sz)}
                style={{
                  padding: '3px 12px', borderRadius: 5, fontSize: 11, fontWeight: 600,
                  border: btnSize === sz ? '2px solid #2563eb' : '1px solid #d1d5db',
                  background: btnSize === sz ? '#eff6ff' : '#fff',
                  color: btnSize === sz ? '#2563eb' : '#374151',
                  cursor: 'pointer',
                }}
              >{sz === 'sm' ? '소' : sz === 'md' ? '중' : '대'}</button>
            ))}
          </div>
        </div>
        {/* 정렬 선택 */}
        <div>
          <div style={{ fontSize: 11, fontWeight: 600, color: '#374151', marginBottom: 5 }}>버튼 정렬</div>
          <div style={{ display: 'flex', gap: 5 }}>
            {(['left', 'center', 'right'] as const).map((align) => (
              <button
                key={align}
                type="button"
                onClick={() => setBtnAlign(align)}
                style={{
                  padding: '3px 10px', borderRadius: 5, fontSize: 11, fontWeight: 600,
                  border: btnAlign === align ? '2px solid #2563eb' : '1px solid #d1d5db',
                  background: btnAlign === align ? '#eff6ff' : '#fff',
                  color: btnAlign === align ? '#2563eb' : '#374151',
                  cursor: 'pointer',
                }}
              >{align === 'left' ? '왼쪽' : align === 'center' ? '가운데' : '오른쪽'}</button>
            ))}
          </div>
        </div>
        {/* 버튼 텍스트 직접 입력 */}
        <div>
          <div style={{ fontSize: 11, fontWeight: 600, color: '#374151', marginBottom: 5 }}>버튼 텍스트 (비워두면 파일명 자동 사용)</div>
          <input
            type="text"
            value={btnCustomText}
            placeholder="⬇️ 파일명 (크기) 다운로드"
            onChange={e => setBtnCustomText(e.target.value)}
            style={{
              width: '100%', padding: '6px 10px', borderRadius: 6,
              border: '1px solid #d1d5db', fontSize: 12, color: '#111827',
              boxSizing: 'border-box',
            }}
          />
        </div>
        {/* 글자 색상 */}
        <div>
          <div style={{ fontSize: 11, fontWeight: 600, color: '#374151', marginBottom: 5 }}>글자 색상</div>
          <div style={{ display: 'flex', gap: 5, alignItems: 'center', flexWrap: 'wrap' }}>
            {['#ffffff','#000000','#fef08a','#bbf7d0','#fecaca','#bfdbfe','#e9d5ff','#fed7aa'].map(c => (
              <button
                key={c}
                type="button"
                onClick={() => setBtnTextColor(c)}
                style={{
                  width: 22, height: 22, borderRadius: 4, background: c,
                  border: btnTextColor === c ? '3px solid #1e3a5f' : '1px solid #d1d5db',
                  cursor: 'pointer', padding: 0, flexShrink: 0,
                }}
              />
            ))}
            <input
              type="color"
              value={btnTextColor.startsWith('#') ? btnTextColor : '#ffffff'}
              title="글자색 직접 선택"
              onChange={e => setBtnTextColor(e.target.value)}
              style={{ width: 22, height: 22, borderRadius: 4, border: '1px solid #d1d5db', cursor: 'pointer', padding: 0, flexShrink: 0 }}
            />
          </div>
        </div>
        {/* 미리보기 */}
        <div>
          <div style={{ fontSize: 11, fontWeight: 600, color: '#374151', marginBottom: 5 }}>미리보기</div>
          <div style={{ textAlign: btnAlign }}>
            <span style={{
              display: 'inline-flex', alignItems: 'center', gap: 6,
              padding: btnSize === 'sm' ? '6px 16px' : btnSize === 'lg' ? '14px 28px' : '10px 22px',
              background: btnColor, color: btnTextColor, borderRadius: 8,
              fontSize: btnSize === 'sm' ? 12 : btnSize === 'lg' ? 16 : 14,
              fontWeight: 600,
            }}>{btnCustomText.trim() || '⬇️ 파일명.pdf 다운로드'}</span>
          </div>
        </div>
      </div>

      {/* 드롭존: input을 position:absolute로 위에 올려 직접 클릭 전달 (브라우저 보안 우회) */}
      <div
        onDragOver={e => { e.preventDefault(); (e.currentTarget as HTMLElement).style.borderColor = "#6366f1"; }}
        onDragLeave={e => { (e.currentTarget as HTMLElement).style.borderColor = "#e5e7eb"; }}
        onDrop={e => {
          e.preventDefault();
          (e.currentTarget as HTMLElement).style.borderColor = "#e5e7eb";
          const file = e.dataTransfer.files[0];
          if (file) handleFileUpload(file);
        }}
        style={{
          position: "relative",
          border: "2px dashed #d1d5db", borderRadius: 8,
          padding: "16px", textAlign: "center", cursor: "pointer",
          transition: "border-color 0.15s",
        }}
      >
        {uploading ? (
          <div style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 8, color: "#6366f1" }}>
            <Loader2 size={16} className="animate-spin" />
            <span style={{ fontSize: 12 }}>업로드 중...</span>
          </div>
        ) : (
          <>
            <Paperclip size={18} color="#6b7280" style={{ margin: "0 auto 5px" }} />
            <div style={{ fontSize: 12, color: "#6b7280" }}>클릭하거나 드래그해서 파일 선택</div>
            <div style={{ fontSize: 10, color: "#6b7280", marginTop: 3 }}>PDF · Word · Excel · PPT · HWP 등 문서: 최대 50MB</div>
            <div style={{ fontSize: 10, color: "#6b7280", marginTop: 2 }}>ZIP · RAR · 7z 등 압축파일: 최대 100MB</div>
            {/* input을 드롭존 전체 위에 투명하게 올려 직접 클릭 전달 */}
            <input
              ref={fileRef}
              type="file"
              style={{
                position: "absolute", inset: 0, opacity: 0, cursor: "pointer",
                width: "100%", height: "100%",
              }}
              onChange={e => { const f = e.target.files?.[0]; if (f) { e.target.value = ''; handleFileUpload(f); } }}
            />
          </>
        )}
      </div>
      <button type="button" onClick={onClose} style={{
        width: "100%", padding: "7px", borderRadius: 6,
        background: "#e5e7eb", border: "1px solid #e5e7eb",
        fontSize: 11, color: "#6b7280", cursor: "pointer",
      }}>닫기</button>
    </div>,
    document.body
  );
}

// ─── Video URL 파싱 (YouTube / Vimeo) ────────────────────────
function parseVideoUrl(url: string): { embedUrl: string; type: string; videoId: string } | null {
  const trimmed = url.trim();
  // YouTube: watch?v=, youtu.be/, embed/, shorts/
  const ytPattern = /(?:youtube\.com\/(?:watch\?(?:.*&)?v=|embed\/|shorts\/)|youtu\.be\/)([\w-]{11})/;
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

// ─── Style Save/Load Dialog ──────────────────────────────────────────────
type StyleData = {
  fontFamily?: string;
  fontSize?: string;
  lineHeight?: string;
  color?: string;
  bold?: boolean;
  italic?: boolean;
  underline?: boolean;
  textAlign?: string;
};

// ─── 표 편집 패널 ───────────────────────────────────────────────────────────
function TableEditPanel({ editor }: { editor: Editor }) {
  const [cellBg, setCellBg] = useState('#ffffff');
  const [borderColor, setBorderColor] = useState('#e5e7eb');
  const [borderWidth, setBorderWidth] = useState('1');
  const [tableWidth, setTableWidth] = useState('100%');
  const [activeTab, setActiveTab] = useState<'structure' | 'cell' | 'border' | 'table'>('structure');

  // 셀 병합/분할 가능 여부
  const canMergeCells = editor.can().mergeCells();
  const canSplitCell = editor.can().splitCell();
  const canMergeOrSplit = canMergeCells || canSplitCell;
  // 현재 커서가 헤더 셀인지 여부
  const isInHeaderCell = editor.isActive('tableHeader');

  // 현재 셀의 style 읽기
  useEffect(() => {
    const { state } = editor.view;
    const { $from } = state.selection;
    for (let d = $from.depth; d >= 0; d--) {
      const node = $from.node(d);
      if (node.type.name === 'tableCell' || node.type.name === 'tableHeader') {
        const style = node.attrs.style || '';
        const bgMatch = style.match(/background(?:-color)?:\s*([^;]+)/);
        if (bgMatch) setCellBg(bgMatch[1].trim());
        const bwMatch = style.match(/border-width:\s*([^;]+)/);
        if (bwMatch) setBorderWidth(bwMatch[1].replace('px','').trim());
        const bcMatch = style.match(/border-color:\s*([^;]+)/);
        if (bcMatch) setBorderColor(bcMatch[1].trim());
        break;
      }
    }
  }, [editor.state.selection]);

  // 현재 선택된 셀의 style 업데이트 헬퍼
  // - 다중 셀 선택 시: 선택 범위 내 모든 tableCell/tableHeader 업데이트
  // - 단일 커서 시: 커서가 위치한 셀로 직접 탐색하여 적용
  // 핵심: onMouseDown e.preventDefault()로 selection이 보존된 상태에서 호출됨
  const updateCellStyle = useCallback((updates: Record<string, string>) => {
    const { state } = editor.view;
    const { from, to, empty } = state.selection;

    const mergeStyle = (existingStyle: string, updates: Record<string, string>): string => {
      const styleObj: Record<string, string> = {};
      existingStyle.split(';').forEach((s: string) => {
        const idx = s.indexOf(':');
        if (idx === -1) return;
        const k = s.slice(0, idx).trim();
        const v = s.slice(idx + 1).trim();
        if (k && v) styleObj[k] = v;
      });
      Object.assign(styleObj, updates);
      return Object.entries(styleObj).map(([k, v]) => `${k}: ${v}`).join('; ');
    };

    // editor.chain()을 사용하여 TipTap의 트랜잭션 시스템을 통해 적용
    // 이렇게 하면 undo/redo도 지원됨
    const chain = editor.chain();

    if (empty) {
      // 커서만 있을 때: $from.depth를 탐색하여 현재 셀 찾기
      const { $from } = state.selection;
      let found = false;
      for (let d = $from.depth; d >= 0; d--) {
        const node = $from.node(d);
        if (node.type.name === 'tableCell' || node.type.name === 'tableHeader') {
          const pos = $from.before(d);
          const newStyle = mergeStyle(node.attrs.style || '', updates);
          chain.command(({ tr, dispatch }) => {
            if (dispatch) tr.setNodeMarkup(pos, undefined, { ...node.attrs, style: newStyle });
            return true;
          });
          found = true;
          break;
        }
      }
      if (!found) return;
    } else {
      // 다중 셀 선택 시: 선택 범위 내 모든 셀에 적용
      const cellPositions: { pos: number; node: any }[] = [];
      state.doc.nodesBetween(from, to, (node: any, pos: number) => {
        if (node.type.name === 'tableCell' || node.type.name === 'tableHeader') {
          cellPositions.push({ pos, node });
        }
      });
      if (cellPositions.length === 0) return;
      chain.command(({ tr, dispatch }) => {
        if (dispatch) {
          cellPositions.forEach(({ pos, node }) => {
            const newStyle = mergeStyle(node.attrs.style || '', updates);
            tr.setNodeMarkup(pos, undefined, { ...node.attrs, style: newStyle });
          });
        }
        return true;
      });
    }

    chain.run();
  }, [editor]);

  // 표 전체 너비 업데이트
  const updateTableWidth = useCallback((width: string) => {
    const { state, dispatch } = editor.view;
    const { $from } = state.selection;
    const tr = state.tr;
    for (let d = $from.depth; d >= 0; d--) {
      const node = $from.node(d);
      const pos = $from.before(d);
      if (node.type.name === 'table') {
        const existingStyle = node.attrs.style || '';
        let styleObj: Record<string, string> = {};
        existingStyle.split(';').forEach((s: string) => {
          const [k, v] = s.split(':').map((x: string) => x.trim());
          if (k && v) styleObj[k] = v;
        });
        styleObj['width'] = width;
        const newStyle = Object.entries(styleObj).map(([k, v]) => `${k}: ${v}`).join('; ');
        tr.setNodeMarkup(pos, undefined, { ...node.attrs, style: newStyle });
        dispatch(tr);
        break;
      }
    }
  }, [editor]);

  // 표 전체 테두리 일괄 적용
  const applyBorderToAllCells = useCallback((bw: string, bc: string) => {
    const { state, dispatch } = editor.view;
    const tr = state.tr;
    let changed = false;
    state.doc.descendants((node: any, pos: number) => {
      if (node.type.name === 'tableCell' || node.type.name === 'tableHeader') {
        const existingStyle = node.attrs.style || '';
        const styleObj: Record<string, string> = {};
        existingStyle.split(';').forEach((s: string) => {
          const [k, ...rest] = s.split(':');
          const v = rest.join(':').trim();
          const key = k?.trim();
          if (key && v) styleObj[key] = v;
        });
        styleObj['border-width'] = `${bw}px`;
        styleObj['border-style'] = bw === '0' ? 'none' : 'solid';
        styleObj['border-color'] = bc;
        const newStyle = Object.entries(styleObj).map(([k, v]) => `${k}: ${v}`).join('; ');
        tr.setNodeMarkup(pos, undefined, { ...node.attrs, style: newStyle });
        changed = true;
      }
    });
    if (changed && dispatch) dispatch(tr);
  }, [editor]);

  const labelStyle: React.CSSProperties = { color: '#6366f1', fontWeight: 700, fontSize: 11, marginRight: 2 };
  const btnStyle = (active?: boolean): React.CSSProperties => ({
    fontSize: 11, padding: '3px 7px', borderRadius: 5, cursor: 'pointer', border: '1px solid #e5e7eb',
    background: active ? '#6366f1' : '#fff', color: active ? '#fff' : '#374151', fontWeight: active ? 700 : 400,
  });
  const tabBtnStyle = (active: boolean): React.CSSProperties => ({
    fontSize: 11, padding: '4px 10px', borderRadius: '5px 5px 0 0', cursor: 'pointer',
    border: active ? '1px solid #e5e7eb' : '1px solid transparent',
    borderBottom: active ? '1px solid #f8fafc' : '1px solid #e5e7eb',
    background: active ? '#f8fafc' : '#eef2ff',
    color: active ? '#6366f1' : '#6b7280', fontWeight: active ? 700 : 400,
    marginBottom: -1,
  });

  return (
    <div style={{ background: '#f8fafc', border: '1px solid #e5e7eb', borderRadius: 8, margin: '4px 0', fontSize: 12 }}>
      {/* 탭 네비게이션 */}
      <div style={{ display: 'flex', gap: 2, padding: '4px 8px 0', borderBottom: '1px solid #e5e7eb', background: '#eef2ff', borderRadius: '8px 8px 0 0' }}>
        {([
          { id: 'structure', label: '구조' },
          { id: 'cell',      label: '셀 스타일' },
          { id: 'border',    label: '테두리' },
          { id: 'table',     label: '표 설정' },
        ] as const).map(({ id, label }) => (
          <button key={id} type="button" style={tabBtnStyle(activeTab === id)}
            onMouseDown={e => { e.preventDefault(); setActiveTab(id); }}>
            {label}
          </button>
        ))}
      </div>

      {/* 탭 콘텐츠 */}
      <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 6, padding: '6px 10px' }}>

        {/* 탭 1: 구조 - 행/열 추가·삭제, 병합/분할, 표 이동 */}
        {activeTab === 'structure' && (<>
          <span style={labelStyle}>행</span>
          <button type="button" style={btnStyle()} onMouseDown={e => { e.preventDefault(); editor.chain().focus().addRowBefore().run(); }} title="위에 행 추가">↑ 추가</button>
          <button type="button" style={btnStyle()} onMouseDown={e => { e.preventDefault(); editor.chain().focus().addRowAfter().run(); }} title="아래에 행 추가">↓ 추가</button>
          <button type="button" style={{ ...btnStyle(), color: '#ef4444', borderColor: '#fca5a5' }} onMouseDown={e => { e.preventDefault(); editor.chain().focus().deleteRow().run(); }} title="행 삭제">삭제</button>
          <span style={{ width: 1, height: 20, background: '#e5e7eb', margin: '0 2px' }} />
          <span style={labelStyle}>열</span>
          <button type="button" style={btnStyle()} onMouseDown={e => { e.preventDefault(); editor.chain().focus().addColumnBefore().run(); }} title="왼쪽에 열 추가">← 추가</button>
          <button type="button" style={btnStyle()} onMouseDown={e => { e.preventDefault(); editor.chain().focus().addColumnAfter().run(); }} title="오른쪽에 열 추가">→ 추가</button>
          <button type="button" style={{ ...btnStyle(), color: '#ef4444', borderColor: '#fca5a5' }} onMouseDown={e => { e.preventDefault(); editor.chain().focus().deleteColumn().run(); }} title="열 삭제">삭제</button>
          <span style={{ width: 1, height: 20, background: '#e5e7eb', margin: '0 2px' }} />
          <span style={labelStyle}>셀 병합</span>
          <button
            type="button"
            style={{ ...btnStyle(canMergeCells), opacity: canMergeCells ? 1 : 0.4, cursor: canMergeCells ? 'pointer' : 'not-allowed' }}
            onMouseDown={e => { e.preventDefault(); if (canMergeCells) editor.chain().focus().mergeCells().run(); }}
            title={canMergeCells ? '선택된 셀 병합 (드래그로 여러 셀 선택 후 사용)' : '병합하려면 여러 셀을 드래그로 선택하세요'}>⊞ 병합</button>
          <button
            type="button"
            style={{ ...btnStyle(false), opacity: canSplitCell ? 1 : 0.4, cursor: canSplitCell ? 'pointer' : 'not-allowed' }}
            onMouseDown={e => { e.preventDefault(); if (canSplitCell) editor.chain().focus().splitCell().run(); }}
            title={canSplitCell ? '병합된 셀 분할' : '분할할 수 있는 병합 셀이 없습니다'}>⊟ 분할</button>
          <button
            type="button"
            style={{ ...btnStyle(false), opacity: canMergeOrSplit ? 1 : 0.4, cursor: canMergeOrSplit ? 'pointer' : 'not-allowed', background: canMergeOrSplit ? '#f0f0ff' : '#fff', borderColor: canMergeOrSplit ? '#a5b4fc' : '#e5e7eb' }}
            onMouseDown={e => { e.preventDefault(); if (canMergeOrSplit) editor.chain().focus().mergeOrSplit().run(); }}
            title="병합/분할 자동 전환">⇄ 자동</button>
          <button
            type="button"
            style={{ ...btnStyle(isInHeaderCell), borderColor: isInHeaderCell ? '#6366f1' : '#e5e7eb' }}
            onMouseDown={e => { e.preventDefault(); editor.chain().focus().toggleHeaderCell().run(); }}
            title={isInHeaderCell ? '일반 셀로 변환' : '헤더 셀로 변환'}>{isInHeaderCell ? 'H→셀' : '셀→H'}</button>
          <span style={{ width: 1, height: 20, background: '#e5e7eb', margin: '0 2px' }} />
          <span style={labelStyle}>표 이동</span>
          <button type="button" style={btnStyle()} onMouseDown={e => { e.preventDefault(); editor.chain().focus().liftEmptyBlock().run(); }} title="표 위로 이동">↑ 위</button>
          <button type="button" style={{ ...btnStyle(), color: '#ef4444', borderColor: '#fca5a5' }}
            onMouseDown={e => { e.preventDefault(); editor.chain().focus().deleteTable().run(); }}
            title="표 삭제">표 삭제</button>
        </>)}

        {/* 탭 2: 셀 스타일 - 배경색, 텍스트 정렬, 셀 패딩 */}
        {activeTab === 'cell' && (<>
          <span style={labelStyle}>셀 배경</span>
          <input type="color" value={cellBg} onChange={e => setCellBg(e.target.value)}
            onBlur={e => updateCellStyle({ 'background-color': e.target.value })}
            style={{ width: 28, height: 24, border: '1px solid #e5e7eb', borderRadius: 4, cursor: 'pointer', padding: 1 }}
            title="셀 배경색 (직접 선택)" />
          {[
            '#ffffff', '#f8fafc', '#f3f4f6',
            '#fef9c3', '#fef3c7', '#fed7aa',
            '#dbeafe', '#e0e7ff', '#ede9fe',
            '#dcfce7', '#d1fae5', '#ccfbf1',
            '#fce7f3', '#fce7e7', '#fdf2f8',
            '#111827', '#374151', '#6b7280',
          ].map(c => (
            <button key={c} type="button"
              onMouseDown={e => { e.preventDefault(); setCellBg(c); updateCellStyle({ 'background-color': c }); }}
              style={{ width: 20, height: 20, background: c, border: cellBg === c ? '2px solid #6366f1' : '1px solid #d1d5db', borderRadius: 3, cursor: 'pointer', flexShrink: 0 }}
              title={c} />
          ))}
          <span style={{ width: '100%', height: 0 }} />
          <span style={labelStyle}>정렬</span>
          {([
            { align: 'left',    icon: '←', title: '왼쪽 정렬' },
            { align: 'center',  icon: '↔', title: '가운데 정렬' },
            { align: 'right',   icon: '→', title: '오른쪽 정렬' },
            { align: 'justify', icon: '≡', title: '양쪽 정렬' },
          ] as const).map(({ align, icon, title }) => (
            <button key={align} type="button"
              style={btnStyle(editor.isActive({ textAlign: align }))}
              onMouseDown={e => { e.preventDefault(); editor.chain().setTextAlign(align).run(); }}
              title={title}>{icon}</button>
          ))}
          <span style={{ width: 1, height: 20, background: '#e5e7eb', margin: '0 2px' }} />
          <span style={labelStyle}>세로 정렬</span>
          {([
            { val: 'top',    icon: '↑', title: '위 정렬' },
            { val: 'middle', icon: '↕', title: '중앙 정렬' },
            { val: 'bottom', icon: '↓', title: '아래 정렬' },
          ] as const).map(({ val, icon, title }) => (
            <button key={val} type="button"
              style={btnStyle()}
              onMouseDown={e => { e.preventDefault(); updateCellStyle({ 'vertical-align': val }); }}
              title={title}>{icon}</button>
          ))}
        </>)}

        {/* 탭 3: 테두리 - 두께, 색상, 선택/전체 적용 */}
        {activeTab === 'border' && (<>
          <span style={labelStyle}>두께</span>
          {['0', '1', '2', '3', '4', '5'].map(w => (
            <button key={w} type="button"
              style={btnStyle(borderWidth === w)}
              onMouseDown={e => { e.preventDefault(); setBorderWidth(w); updateCellStyle({ 'border-width': `${w}px`, 'border-style': w === '0' ? 'none' : 'solid' }); }}
            >{w}px</button>
          ))}
          <span style={{ width: 1, height: 20, background: '#e5e7eb', margin: '0 2px' }} />
          <span style={labelStyle}>색상</span>
          <input type="color" value={borderColor} onChange={e => setBorderColor(e.target.value)}
            onBlur={e => updateCellStyle({ 'border-color': e.target.value, 'border-style': 'solid' })}
            style={{ width: 28, height: 24, border: '1px solid #e5e7eb', borderRadius: 4, cursor: 'pointer', padding: 1 }}
            title="테두리 색상" />
          {['#e5e7eb', '#d1d5db', '#9ca3af', '#374151', '#111827', '#6366f1', '#ef4444', '#f59e0b', '#10b981'].map(c => (
            <button key={c} type="button"
              onMouseDown={e => { e.preventDefault(); setBorderColor(c); updateCellStyle({ 'border-color': c, 'border-style': 'solid' }); }}
              style={{ width: 20, height: 20, background: c, border: borderColor === c ? '2px solid #6366f1' : '1px solid #d1d5db', borderRadius: 3, cursor: 'pointer', flexShrink: 0 }}
              title={c} />
          ))}
          <span style={{ width: '100%', height: 0 }} />
          <span style={labelStyle}>적용 범위</span>
          <button type="button" style={btnStyle()}
            onMouseDown={e => { e.preventDefault(); updateCellStyle({ 'border-width': `${borderWidth}px`, 'border-style': borderWidth === '0' ? 'none' : 'solid', 'border-color': borderColor }); }}
            title="선택된 셀에만 적용">선택 셀</button>
          <button type="button" style={{ ...btnStyle(), background: '#eef2ff', borderColor: '#a5b4fc', color: '#4f46e5', fontWeight: 700 }}
            onMouseDown={e => { e.preventDefault(); applyBorderToAllCells(borderWidth, borderColor); }}
            title="표 전체 셀에 일괄 적용">✔ 전체 적용</button>
          <button type="button" style={{ ...btnStyle(), color: '#6b7280' }}
            onMouseDown={e => { e.preventDefault(); applyBorderToAllCells('0', 'transparent'); }}
            title="표 전체 테두리 제거">✕ 전체 제거</button>
        </>)}

        {/* 탭 4: 표 설정 - 너비, 정렬, 삭제 */}
        {activeTab === 'table' && (<>
          <span style={labelStyle}>표 너비</span>
          {['30%', '50%', '70%', '100%'].map(w => (
            <button key={w} type="button"
              style={btnStyle(tableWidth === w)}
              onMouseDown={e => { e.preventDefault(); setTableWidth(w); updateTableWidth(w); }}
            >{w}</button>
          ))}
          <input type="text" defaultValue={tableWidth} placeholder="직접입력 (px/%)"
            onKeyDown={e => { if (e.key === 'Enter') { const v = (e.target as HTMLInputElement).value.trim(); if (v) { setTableWidth(v); updateTableWidth(v); } } }}
            style={{ fontSize: 11, padding: '3px 6px', borderRadius: 5, width: 90, border: '1px solid #d1d5db', outline: 'none' }} />
          <span style={{ width: '100%', height: 0 }} />
          <span style={labelStyle}>표 정렬</span>
          {([
            { val: 'left',   label: '왼쪽' },
            { val: 'center', label: '가운데' },
            { val: 'right',  label: '오른쪽' },
          ] as const).map(({ val, label }) => (
            <button key={val} type="button" style={btnStyle()}
              onMouseDown={e => {
                e.preventDefault();
                const { state, dispatch } = editor.view;
                const { $from } = state.selection;
                const tr = state.tr;
                for (let d = $from.depth; d >= 0; d--) {
                  const node = $from.node(d);
                  if (node.type.name === 'table') {
                    const pos = $from.before(d);
                    const existingStyle = node.attrs.style || '';
                    const styleObj: Record<string, string> = {};
                    existingStyle.split(';').forEach((s: string) => {
                      const [k, ...rest] = s.split(':');
                      const v = rest.join(':').trim();
                      const key = k?.trim();
                      if (key && v) styleObj[key] = v;
                    });
                    styleObj['margin-left'] = val === 'center' ? 'auto' : val === 'right' ? 'auto' : '0';
                    styleObj['margin-right'] = val === 'center' ? 'auto' : val === 'right' ? '0' : 'auto';
                    const newStyle = Object.entries(styleObj).map(([k, v]) => `${k}: ${v}`).join('; ');
                    tr.setNodeMarkup(pos, undefined, { ...node.attrs, style: newStyle });
                    dispatch(tr);
                    break;
                  }
                }
              }}>{label}</button>
          ))}
          <span style={{ width: 1, height: 20, background: '#e5e7eb', margin: '0 2px' }} />
          <button type="button" style={{ ...btnStyle(), color: '#ef4444', borderColor: '#fca5a5' }}
            onMouseDown={e => { e.preventDefault(); editor.chain().focus().deleteTable().run(); }}
            title="표 삭제">표 삭제</button>
        </>)}

      </div>
    </div>
  );
}

// ─── 표 삽입 다이얼로그 (행/열 선택 UI) ────────────────────────────────
function TableInsertDialog({ editor, onClose }: { editor: Editor; onClose: () => void }) {
  const [hoverRow, setHoverRow] = useState(0);
  const [hoverCol, setHoverCol] = useState(0);
  const [manualRows, setManualRows] = useState(3);
  const [manualCols, setManualCols] = useState(3);
  const [hasHeader, setHasHeader] = useState(true);
  const [mode, setMode] = useState<'grid' | 'manual'>('grid');
  const MAX = 10;

  const doInsert = (rows: number, cols: number) => {
    editor.chain().focus().insertTable({ rows, cols, withHeaderRow: hasHeader }).run();
    onClose();
  };

  return createPortal(
    <div
      style={{ position: 'fixed', inset: 0, zIndex: 100000, background: 'rgba(0,0,0,0.45)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
      onMouseDown={e => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div style={{ background: '#fff', borderRadius: 14, padding: 24, width: 400, boxShadow: '0 8px 40px rgba(0,0,0,0.22)', fontFamily: 'inherit' }}>
        <h3 style={{ margin: '0 0 16px', fontSize: 16, fontWeight: 700, color: '#1e1b4b' }}>📊 표 삽입</h3>

        {/* 모드 탭 */}
        <div style={{ display: 'flex', gap: 8, marginBottom: 16 }}>
          {(['grid', 'manual'] as const).map(m => (
            <button key={m} type="button" onClick={() => setMode(m)}
              style={{ flex: 1, padding: '7px 0', borderRadius: 7, border: mode === m ? '2px solid #6366f1' : '1px solid #e5e7eb', background: mode === m ? '#eef2ff' : '#fff', color: mode === m ? '#6366f1' : '#374151', fontWeight: mode === m ? 700 : 400, cursor: 'pointer', fontSize: 13 }}>
              {m === 'grid' ? '화면에서 선택' : '직접 입력'}
            </button>
          ))}
        </div>

        {mode === 'grid' ? (
          <>
            {/* 그리드 선택 */}
            <div style={{ marginBottom: 10, fontSize: 13, color: '#6b7280', textAlign: 'center' }}>
              {hoverRow > 0 && hoverCol > 0
                ? `${hoverRow}행 × ${hoverCol}열`
                : '셀에 마우스를 올려 크기를 선택하세요'}
            </div>
            <div
              style={{ display: 'grid', gridTemplateColumns: `repeat(${MAX}, 28px)`, gap: 3, margin: '0 auto 16px', width: 'fit-content' }}
              onMouseLeave={() => { setHoverRow(0); setHoverCol(0); }}
            >
              {Array.from({ length: MAX * MAX }).map((_, idx) => {
                const r = Math.floor(idx / MAX) + 1;
                const c = (idx % MAX) + 1;
                const active = r <= hoverRow && c <= hoverCol;
                return (
                  <div
                    key={idx}
                    onMouseEnter={() => { setHoverRow(r); setHoverCol(c); }}
                    onClick={() => doInsert(r, c)}
                    style={{
                      width: 26, height: 26, borderRadius: 4, cursor: 'pointer',
                      background: active ? '#c7d2fe' : '#f3f4f6',
                      border: active ? '1.5px solid #6366f1' : '1px solid #e5e7eb',
                      transition: 'background 0.08s, border 0.08s',
                    }}
                  />
                );
              })}
            </div>
          </>
        ) : (
          <div style={{ display: 'flex', gap: 12, marginBottom: 16 }}>
            <div style={{ flex: 1 }}>
              <label style={{ fontSize: 13, color: '#555', display: 'block', marginBottom: 4 }}>행 수</label>
              <input type="number" min={1} max={30} value={manualRows}
                onChange={e => setManualRows(Math.max(1, Math.min(30, Number(e.target.value))))}
                style={{ width: '100%', padding: '8px 10px', border: '1px solid #d1d5db', borderRadius: 7, fontSize: 14, boxSizing: 'border-box' as const }} />
            </div>
            <div style={{ flex: 1 }}>
              <label style={{ fontSize: 13, color: '#555', display: 'block', marginBottom: 4 }}>열 수</label>
              <input type="number" min={1} max={20} value={manualCols}
                onChange={e => setManualCols(Math.max(1, Math.min(20, Number(e.target.value))))}
                style={{ width: '100%', padding: '8px 10px', border: '1px solid #d1d5db', borderRadius: 7, fontSize: 14, boxSizing: 'border-box' as const }} />
            </div>
          </div>
        )}

        {/* 헤더 여부 */}
        <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, color: '#555', cursor: 'pointer', marginBottom: 20 }}>
          <input type="checkbox" checked={hasHeader} onChange={e => setHasHeader(e.target.checked)} />
          첫 행을 헤더로 설정
        </label>

        <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
          <button type="button" onClick={onClose}
            style={{ padding: '8px 18px', borderRadius: 7, border: '1px solid #e5e7eb', background: '#fff', cursor: 'pointer', fontSize: 14 }}>
            취소
          </button>
          {mode === 'manual' && (
            <button type="button" onClick={() => doInsert(manualRows, manualCols)}
              style={{ padding: '8px 18px', borderRadius: 7, border: 'none', background: '#6366f1', color: '#fff', cursor: 'pointer', fontSize: 14, fontWeight: 700 }}>
              삽입
            </button>
          )}
        </div>
      </div>
    </div>,
    document.body
  );
}

function StyleDialog({
  editor, onClose,
}: { editor: Editor; onClose: () => void }) {
  const [saveName, setSaveName] = useState('');
  const [tab, setTab] = useState<'load' | 'save'>('load');
  const utils = trpc.useUtils();
  type EditorStyleRow = { id: number; name: string; styleData: string; createdAt: number; updatedAt: number };
  const { data: styles = [] as EditorStyleRow[], isLoading } = trpc.editorStyles.list.useQuery();
  const saveMutation = trpc.editorStyles.save.useMutation({
    onSuccess: () => {
      utils.editorStyles.list.invalidate();
      toast.success(`스타일 "${saveName}" 저장 완료!`);
      setSaveName('');
    },
    onError: () => toast.error('스타일 저장 실패'),
  });
  const deleteMutation = trpc.editorStyles.delete.useMutation({
    onSuccess: () => utils.editorStyles.list.invalidate(),
    onError: () => toast.error('스타일 삭제 실패'),
  });

  // 현재 커서/선택 위치의 스타일 수집
  function getCurrentStyle(): StyleData {
    const ts = editor.getAttributes('textStyle');
    const para = editor.getAttributes('paragraph');
    const heading = editor.getAttributes('heading');
    return {
      fontFamily: ts.fontFamily || undefined,
      fontSize: ts.fontSize || para.fontSize || heading.fontSize || undefined,
      lineHeight: (para.lineHeight || heading.lineHeight || ts.lineHeight) || undefined,
      color: ts.color || undefined,
      bold: editor.isActive('bold') || undefined,
      italic: editor.isActive('italic') || undefined,
      underline: editor.isActive('underline') || undefined,
      textAlign: editor.isActive({ textAlign: 'center' }) ? 'center'
        : editor.isActive({ textAlign: 'right' }) ? 'right'
        : editor.isActive({ textAlign: 'justify' }) ? 'justify'
        : 'left',
    };
  }

  // 스타일 적용
  function applyStyle(sd: StyleData) {
    editor.chain().focus();
    if (sd.bold !== undefined) { if (sd.bold) editor.chain().focus().setBold().run(); else editor.chain().focus().unsetBold().run(); }
    if (sd.italic !== undefined) { if (sd.italic) editor.chain().focus().setItalic().run(); else editor.chain().focus().unsetItalic().run(); }
    if (sd.underline !== undefined) { if (sd.underline) editor.chain().focus().setUnderline().run(); else editor.chain().focus().unsetUnderline().run(); }
    if (sd.fontFamily) (editor.chain().focus() as any).setFontFamily(sd.fontFamily).run();
    if (sd.fontSize) (editor.chain().focus() as any).setFontSize(sd.fontSize).run();
    if (sd.lineHeight) (editor.chain().focus() as any).setLineHeight(sd.lineHeight).run();
    if (sd.color) editor.chain().focus().setColor(sd.color).run();
    if (sd.textAlign) editor.chain().focus().setTextAlign(sd.textAlign).run();
    toast.success('스타일 적용 완료!');
    onClose();
  }

  const handleSave = () => {
    if (!saveName.trim()) { toast.error('스타일 이름을 입력하세요'); return; }
    const sd = getCurrentStyle();
    saveMutation.mutate({ name: saveName.trim(), styleData: JSON.stringify(sd) });
  };

  const dialogStyle: React.CSSProperties = {
    position: 'absolute', top: '100%', left: 0, zIndex: 9999,
    background: '#fff', border: '1px solid #e5e7eb', borderRadius: 10,
    boxShadow: '0 8px 32px rgba(0,0,0,0.13)', padding: 16, width: 320, marginTop: 4,
  };

  return (
    <div style={dialogStyle} onMouseDown={e => e.stopPropagation()}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
        <span style={{ fontWeight: 700, fontSize: 14 }}>🎨 스타일 저장/불러오기</span>
        <button type="button" onClick={onClose} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#6b7280' }}><XIcon size={16} /></button>
      </div>
      {/* 탭 */}
      <div style={{ display: 'flex', gap: 6, marginBottom: 12 }}>
        {(['load', 'save'] as const).map(t => (
          <button key={t} type="button" onClick={() => setTab(t)}
            style={{ flex: 1, padding: '6px 0', borderRadius: 7, fontSize: 12, fontWeight: tab === t ? 700 : 400,
              background: tab === t ? '#6366f1' : '#f3f4f6', color: tab === t ? '#fff' : '#374151',
              border: tab === t ? '1px solid #6366f1' : '1px solid #e5e7eb', cursor: 'pointer' }}>
            {t === 'load' ? '📂 불러오기' : '💾 현재 스타일 저장'}
          </button>
        ))}
      </div>

      {tab === 'save' && (
        <div>
          <div style={{ fontSize: 11, color: '#6b7280', marginBottom: 6 }}>현재 커서 위치의 스타일을 이름으로 저장합니다.</div>
          <input
            type="text" value={saveName} onChange={e => setSaveName(e.target.value)}
            placeholder="스타일 이름 (예: 제목 강조, 본문 기본)"
            style={{ width: '100%', padding: '7px 10px', borderRadius: 7, border: '1px solid #d1d5db', fontSize: 13, marginBottom: 8, boxSizing: 'border-box' }}
            onKeyDown={e => { if (e.key === 'Enter') handleSave(); }}
          />
          <button type="button" onClick={handleSave} disabled={saveMutation.isPending}
            style={{ width: '100%', padding: '8px 0', borderRadius: 7, background: '#6366f1', color: '#fff', fontWeight: 700, fontSize: 13, border: 'none', cursor: 'pointer' }}>
            {saveMutation.isPending ? '저장 중...' : '저장'}
          </button>
        </div>
      )}

      {tab === 'load' && (
        <div>
          {isLoading && <div style={{ textAlign: 'center', color: '#9ca3af', fontSize: 13, padding: '12px 0' }}>불러오는 중...</div>}
          {!isLoading && styles.length === 0 && (
            <div style={{ textAlign: 'center', color: '#9ca3af', fontSize: 13, padding: '12px 0' }}>저장된 스타일이 없습니다.<br/>"현재 스타일 저장" 탭에서 먼저 저장하세요.</div>
          )}
          <div style={{ maxHeight: 240, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 6 }}>
            {styles.map(s => {
              let sd: StyleData = {};
              try { sd = JSON.parse(s.styleData); } catch {}
              return (
                <div key={s.id} style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '8px 10px', borderRadius: 8, border: '1px solid #e5e7eb', background: '#f9fafb' }}>
                  <div style={{ flex: 1 }}>
                    <div style={{ fontWeight: 600, fontSize: 13, color: '#111827' }}>{s.name}</div>
                    <div style={{ fontSize: 11, color: '#9ca3af', marginTop: 2 }}>
                      {[sd.fontFamily, sd.fontSize, sd.lineHeight && `줄간격 ${sd.lineHeight}`, sd.color && `색상 ${sd.color}`, sd.bold && '굵게', sd.italic && '기울임'].filter(Boolean).join(' · ')}
                    </div>
                  </div>
                  <button type="button" onClick={() => applyStyle(sd)}
                    style={{ padding: '5px 10px', borderRadius: 6, background: '#6366f1', color: '#fff', fontSize: 12, fontWeight: 700, border: 'none', cursor: 'pointer', whiteSpace: 'nowrap' }}>
                    적용
                  </button>
                  <button type="button" onClick={() => { if (confirm(`"${s.name}" 스타일을 삭제할까요?`)) deleteMutation.mutate({ id: s.id }); }}
                    style={{ padding: '5px 7px', borderRadius: 6, background: '#fee2e2', color: '#dc2626', fontSize: 12, border: 'none', cursor: 'pointer' }}>
                    <Trash2 size={12} />
                  </button>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Video Dialog ──────────────────────────────────────────────
function VideoDialog({
  editor, onClose,
}: { editor: Editor; onClose: () => void }) {
  const [tab, setTab] = useState<'upload' | 'url'>('url');
  const [url, setUrl] = useState('');
  const [uploading, setUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [playMode, setPlayMode] = useState<'click' | 'autoplay'>('click');
  const [align, setAlign] = useState<'left' | 'center' | 'right'>('center');
  const fileRef = useRef<HTMLInputElement>(null);
  const parsed = parseVideoUrl(url);
  const isValidUrl = parsed !== null;

  const MAX_VIDEO_SIZE = 200 * 1024 * 1024; // 200MB

  // 정렬에 따른 wrapper 스타일 생성
  const getWrapperStyle = (a: 'left' | 'center' | 'right') => {
    const base = 'position:relative;padding-bottom:56.25%;height:0;overflow:hidden;margin:16px 0;';
    if (a === 'center') return `${base}max-width:100%;`;
    if (a === 'left') return `${base}max-width:560px;margin-right:auto;`;
    if (a === 'right') return `${base}max-width:560px;margin-left:auto;`;
    return base;
  };

  const handleFileUpload = async (file: File) => {
    if (file.size > MAX_VIDEO_SIZE) {
      toast.error(`영상 크기가 너무 큽니다. 200MB 이하의 파일만 업로드할 수 있습니다. (현재: ${(file.size / 1024 / 1024).toFixed(1)}MB)`);
      return;
    }
    setUploading(true);
    setUploadProgress(0);
    try {
      const formData = new FormData();
      formData.append('file', file);
      const result = await new Promise<{ url: string; filename: string }>((resolve, reject) => {
        const xhr = new XMLHttpRequest();
        xhr.open('POST', '/api/upload/video');
        xhr.withCredentials = true;
        xhr.upload.onprogress = (e) => {
          if (e.lengthComputable) setUploadProgress(Math.round((e.loaded / e.total) * 100));
        };
        xhr.onload = () => {
          if (xhr.status >= 200 && xhr.status < 300) {
            resolve(JSON.parse(xhr.responseText));
          } else {
            try { reject(new Error(JSON.parse(xhr.responseText).error || '업로드 실패')); }
            catch { reject(new Error('업로드 실패')); }
          }
        };
        xhr.onerror = () => reject(new Error('네트워크 오류'));
        xhr.send(formData);
      });
      const sizeStr = file.size < 1024 * 1024
        ? `${(file.size / 1024).toFixed(1)}KB`
        : `${(file.size / 1024 / 1024).toFixed(1)}MB`;
      // 자동재생 옵션 및 정렬 적용
      const videoAttrs = playMode === 'autoplay'
        ? 'autoplay muted loop playsinline controls'
        : 'controls';
      const wrapperStyle = getWrapperStyle(align);
      onClose();
      setTimeout(() => {
        editor.chain().focus().insertContent(
          `<div class="video-wrapper" data-align="${align}" style="${wrapperStyle}"><video ${videoAttrs} style="position:absolute;top:0;left:0;width:100%;height:100%;" src="${result.url}"></video></div><p></p>`
        ).run();
        toast.success(`영상이 삽입되었습니다: ${result.filename} (${sizeStr})`);
      }, 50);
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : '영상 업로드 실패');
    } finally {
      setUploading(false);
      setUploadProgress(0);
    }
  };

  const handleUrlInsert = () => {
    if (!parsed) return;
    // 유튜브/비메오 URL에 자동재생 파라미터 추가
    let embedUrl = parsed.embedUrl;
    if (playMode === 'autoplay') {
      embedUrl += (embedUrl.includes('?') ? '&' : '?') + 'autoplay=1&mute=1';
    }
    const wrapperStyle = getWrapperStyle(align);
    onClose();
    setTimeout(() => {
      editor.chain().focus().insertContent(
        `<div class="video-wrapper" data-align="${align}" style="${wrapperStyle}"><iframe src="${embedUrl}" style="position:absolute;top:0;left:0;width:100%;height:100%;border:none;" allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture" allowfullscreen title="동영상"></iframe></div><p></p>`
      ).run();
      toast.success(`${parsed.type === 'youtube' ? '유튜브' : '비메오'} 영상이 삽입되었습니다.`);
    }, 50);
  };

  return createPortal(
    <div
      style={{
        position: 'fixed', inset: 0, zIndex: 10001,
        background: 'rgba(0,0,0,0.45)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
      }}
      onMouseDown={e => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div
        style={{
          background: '#ffffff', borderRadius: 14, padding: 24, width: 480,
          boxShadow: '0 20px 60px rgba(0,0,0,0.25)',
        }}
        onClick={e => e.stopPropagation()}
        onMouseDown={e => e.stopPropagation()}
      >
        {/* 헤더 */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
          <div style={{ fontSize: 15, fontWeight: 700, color: '#111827' }}>🎬 영상 삽입</div>
          <button type="button" onClick={onClose} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#6b7280', padding: 4 }}>
            <XIcon size={16} />
          </button>
        </div>

        {/* 탭 */}
        <div style={{ display: 'flex', gap: 0, marginBottom: 16, borderBottom: '2px solid #e5e7eb' }}>
          {(['url', 'upload'] as const).map(t => (
            <button
              key={t}
              type="button"
              onClick={() => setTab(t)}
              style={{
                padding: '7px 16px', fontSize: 13, fontWeight: tab === t ? 700 : 400,
                color: tab === t ? '#6366f1' : '#6b7280',
                background: 'none', border: 'none', cursor: 'pointer',
                borderBottom: tab === t ? '2px solid #6366f1' : '2px solid transparent',
                marginBottom: -2,
              }}
            >
              {t === 'url' ? '🔗 URL 임베드 (YouTube/Vimeo)' : '📁 파일 업로드'}
            </button>
          ))}
        </div>

        {/* 재생 설정 + 정렬 */}
        <div style={{ display: 'flex', gap: 12, marginBottom: 14, flexWrap: 'wrap' }}>
          {/* 재생 모드 */}
          <div style={{ flex: 1, minWidth: 180 }}>
            <div style={{ fontSize: 11, color: '#6b7280', fontWeight: 600, marginBottom: 5 }}>▶ 재생 설정</div>
            <div style={{ display: 'flex', gap: 6 }}>
              {(['click', 'autoplay'] as const).map(m => (
                <button
                  key={m}
                  type="button"
                  onClick={() => setPlayMode(m)}
                  style={{
                    flex: 1, padding: '6px 8px', borderRadius: 7, fontSize: 12, fontWeight: playMode === m ? 700 : 400,
                    background: playMode === m ? '#6366f1' : '#f3f4f6',
                    color: playMode === m ? '#fff' : '#374151',
                    border: playMode === m ? '1px solid #6366f1' : '1px solid #e5e7eb',
                    cursor: 'pointer',
                  }}
                >
                  {m === 'click' ? '▶️ 클릭 재생' : '⏵ 자동 재생'}
                </button>
              ))}
            </div>
          </div>
          {/* 정렬 */}
          <div style={{ flex: 1, minWidth: 160 }}>
            <div style={{ fontSize: 11, color: '#6b7280', fontWeight: 600, marginBottom: 5 }}>↕ 정렬</div>
            <div style={{ display: 'flex', gap: 6 }}>
              {([['left', '◧ 좌'], ['center', '▣ 중앙'], ['right', '◨ 우']] as const).map(([a, label]) => (
                <button
                  key={a}
                  type="button"
                  onClick={() => setAlign(a)}
                  style={{
                    flex: 1, padding: '6px 4px', borderRadius: 7, fontSize: 11, fontWeight: align === a ? 700 : 400,
                    background: align === a ? '#6366f1' : '#f3f4f6',
                    color: align === a ? '#fff' : '#374151',
                    border: align === a ? '1px solid #6366f1' : '1px solid #e5e7eb',
                    cursor: 'pointer',
                  }}
                >
                  {label}
                </button>
              ))}
            </div>
          </div>
        </div>

        {/* URL 탭 */}
        {tab === 'url' && (
          <div>
            <div style={{ fontSize: 12, color: '#6b7280', marginBottom: 8 }}>유튜브(YouTube), 비메오(Vimeo) URL을 붙여넣으세요.</div>
            <input
              autoFocus
              type="text"
              value={url}
              onChange={e => setUrl(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter' && isValidUrl) handleUrlInsert(); if (e.key === 'Escape') onClose(); }}
              placeholder="https://www.youtube.com/watch?v=... 또는 https://vimeo.com/..."
              style={{
                width: '100%', padding: '9px 12px', marginBottom: 8,
                border: `1px solid ${isValidUrl ? '#22c55e' : url ? '#f87171' : '#e5e7eb'}`,
                borderRadius: 8, fontSize: 13, color: '#111827',
                outline: 'none', boxSizing: 'border-box',
              }}
            />
            {url && !isValidUrl && <p style={{ margin: '0 0 8px', fontSize: 11, color: '#ef4444' }}>유튜브 또는 비메오 URL을 입력해주세요.</p>}
            {isValidUrl && <p style={{ margin: '0 0 8px', fontSize: 11, color: '#16a34a' }}>✓ {parsed.type === 'youtube' ? '유튜브' : '비메오'} 동영상 감지됨</p>}
            {/* 미리보기 */}
            {isValidUrl && (
              <div style={{ marginBottom: 16, borderRadius: 8, overflow: 'hidden', background: '#000', aspectRatio: '16/9' }}>
                <iframe
                  src={parsed.embedUrl}
                  style={{ width: '100%', height: '100%', border: 'none' }}
                  allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                  allowFullScreen
                  title="동영상 미리보기"
                />
              </div>
            )}
            <div style={{ display: 'flex', gap: 8 }}>
              <button type="button" onClick={onClose} style={{ flex: 1, padding: '8px', borderRadius: 8, background: '#f3f4f6', border: '1px solid #e5e7eb', fontSize: 12, color: '#6b7280', cursor: 'pointer' }}>취소</button>
              <button type="button" onClick={handleUrlInsert} disabled={!isValidUrl} style={{ flex: 2, padding: '8px', borderRadius: 8, background: isValidUrl ? 'linear-gradient(135deg,#6366f1,#8b5cf6)' : '#e5e7eb', border: 'none', fontSize: 12, fontWeight: 700, color: isValidUrl ? '#fff' : '#9ca3af', cursor: isValidUrl ? 'pointer' : 'not-allowed' }}>삽입</button>
            </div>
          </div>
        )}

        {/* 파일 업로드 탭 */}
        {tab === 'upload' && (
          <div>
            <div
              onDragOver={e => { e.preventDefault(); (e.currentTarget as HTMLElement).style.borderColor = '#6366f1'; }}
              onDragLeave={e => { (e.currentTarget as HTMLElement).style.borderColor = '#d1d5db'; }}
              onDrop={e => {
                e.preventDefault();
                (e.currentTarget as HTMLElement).style.borderColor = '#d1d5db';
                const file = e.dataTransfer.files[0];
                if (file) handleFileUpload(file);
              }}
              style={{
                position: 'relative',
                border: '2px dashed #d1d5db', borderRadius: 10,
                padding: '24px 16px', textAlign: 'center',
                cursor: uploading ? 'not-allowed' : 'pointer',
                marginBottom: 12, transition: 'border-color 0.15s',
                background: uploading ? '#f9fafb' : '#fff',
              }}
            >
              {uploading ? (
                <div>
                  <Loader2 size={24} color="#6366f1" style={{ margin: '0 auto 8px', animation: 'spin 1s linear infinite' }} />
                  <div style={{ fontSize: 13, color: '#6366f1', fontWeight: 600 }}>업로드 중... {uploadProgress}%</div>
                  <div style={{ marginTop: 8, height: 6, background: '#e5e7eb', borderRadius: 3, overflow: 'hidden' }}>
                    <div style={{ height: '100%', width: `${uploadProgress}%`, background: 'linear-gradient(90deg,#6366f1,#8b5cf6)', transition: 'width 0.3s' }} />
                  </div>
                </div>
              ) : (
                <>
                  <Video size={28} color="#9ca3af" style={{ margin: '0 auto 8px' }} />
                  <div style={{ fontSize: 13, color: '#374151', fontWeight: 600 }}>클릭하거나 드래그해서 영상 업로드</div>
                  <div style={{ fontSize: 11, color: '#9ca3af', marginTop: 4 }}>MP4, WebM, MOV, AVI, MKV (최대 200MB)</div>
                  {/* input을 드롭존 전체 위에 투명하게 올려 직접 클릭 전달 */}
                  <input
                    ref={fileRef}
                    type="file"
                    accept="video/*,.mp4,.webm,.mov,.avi,.mkv"
                    style={{ position: 'absolute', inset: 0, opacity: 0, cursor: 'pointer', width: '100%', height: '100%' }}
                    onChange={e => { const f = e.target.files?.[0]; if (f) { e.target.value = ''; handleFileUpload(f); } }}
                  />
                </>
              )}
            </div>
            <button type="button" onClick={onClose} style={{ width: '100%', padding: '8px', borderRadius: 8, background: '#f3f4f6', border: '1px solid #e5e7eb', fontSize: 12, color: '#6b7280', cursor: 'pointer' }}>취소</button>
          </div>
        )}
      </div>
    </div>,
    document.body
  );
}

// ─── Color Palette ────────────────────────────────────────────
const TEXT_COLORS = [
  // 무채색
  "#000000", "#1f2937", "#374151", "#6b7280", "#9ca3af", "#d1d5db", "#f3f4f6", "#ffffff",
  // 빨강 계열
  "#7f1d1d", "#b91c1c", "#ef4444", "#fca5a5", "#fecaca", "#fee2e2",
  // 주황 계열
  "#7c2d12", "#c2410c", "#f97316", "#fb923c", "#fed7aa",
  // 노랑 계열
  "#713f12", "#ca8a04", "#eab308", "#fde047", "#fef9c3",
  // 초록 계열
  "#14532d", "#15803d", "#22c55e", "#86efac", "#dcfce7",
  // 청록 계열
  "#134e4a", "#0f766e", "#14b8a6", "#5eead4",
  // 파랑 계열
  "#1e3a8a", "#1d4ed8", "#3b82f6", "#93c5fd", "#dbeafe",
  // 남색/보라 계열
  "#312e81", "#4338ca", "#6366f1", "#a5b4fc",
  // 보라 계열
  "#581c87", "#7e22ce", "#a855f7", "#d8b4fe",
  // 분홍 계열
  "#831843", "#be185d", "#ec4899", "#f9a8d4",
];

const HIGHLIGHT_COLORS = [
  // 파스텔 형광
  "#fef08a", "#fde047", "#fef9c3",
  "#bbf7d0", "#86efac", "#dcfce7",
  "#bfdbfe", "#93c5fd", "#dbeafe",
  "#fbcfe8", "#f9a8d4", "#fce7f3",
  "#e9d5ff", "#d8b4fe", "#ede9fe",
  "#fed7aa", "#fdba74", "#ffedd5",
  "#fecaca", "#fca5a5", "#fee2e2",
  "#a5f3fc", "#67e8f9", "#cffafe",
  // 진한 형광
  "#fbbf24", "#f59e0b",
  "#34d399", "#10b981",
  "#60a5fa", "#3b82f6",
  "#c084fc", "#a855f7",
  "#f472b6", "#ec4899",
];

function ColorPalette({
  editor, type, onClose,
}: { editor: Editor; type: "text" | "highlight"; onClose: () => void }) {
  const colors = type === "text" ? TEXT_COLORS : HIGHLIGHT_COLORS;
  const currentColor = type === "text"
    ? editor.getAttributes("textStyle").color || ""
    : editor.getAttributes("highlight").color || "";

  const applyColor = (color: string) => {
    // 팔레트 버튼에 onMouseDown e.preventDefault()가 있으므로
    // 에디터 포커스와 selection이 이미 보존된 상태.
    // focus()를 호출하면 오히려 selection이 초기화되므로 절대 호출하지 않는다.
    if (type === "text") {
      if (!color) {
        editor.chain().unsetColor().run();
      } else {
        editor.chain().setColor(color).run();
      }
    } else {
      if (!color) {
        editor.chain().unsetHighlight().run();
      } else {
        editor.chain().setHighlight({ color }).run();
      }
    }
  };

  return (
    <div
      style={{
        position: "absolute", top: "calc(100% + 4px)", left: 0,
        zIndex: 9999,
        background: "#ffffff",
        border: "1px solid #e5e7eb",
        borderRadius: 12,
        padding: 14,
        width: 256,
        boxShadow: "0 8px 28px rgba(0,0,0,0.18)",
      }}
      onMouseDown={e => e.preventDefault()}
    >
      {/* 헤더 */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 10 }}>
        <span style={{ fontSize: 12, fontWeight: 700, color: "#374151" }}>
          {type === "text" ? "글자 색상" : "배경 색상"}
        </span>
        {/* 기본값 초기화 + 닫기 버튼 */}
        <div style={{ display: "flex", gap: 4 }}>
          <button
            type="button"
            onMouseDown={e => { e.preventDefault(); applyColor(""); setTimeout(onClose, 0); }}
            style={{
              fontSize: 10, padding: "2px 7px", borderRadius: 4,
              background: "#f3f4f6", border: "1px solid #d1d5db",
              color: "#6b7280", cursor: "pointer",
            }}
          >기본값</button>
          <button
            type="button"
            onMouseDown={e => { e.preventDefault(); onClose(); }}
            style={{
              fontSize: 12, padding: "2px 7px", borderRadius: 4,
              background: "#fee2e2", border: "1px solid #fca5a5",
              color: "#dc2626", cursor: "pointer", fontWeight: 700, lineHeight: 1,
            }}
            title="닫기"
          >✕</button>
        </div>
      </div>

      {/* 색상 팔레트 그리드 */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(8, 1fr)", gap: 4, marginBottom: 10 }}>
        {colors.map(c => (
          <button
            key={c}
            type="button"
            title={c}
            onMouseDown={e => { e.preventDefault(); applyColor(c); setTimeout(onClose, 0); }}
            style={{
              width: 24, height: 24,
              borderRadius: 4,
              background: c,
              border: c === currentColor
                ? "2px solid #4f46e5"
                : c === "#ffffff" || c === "#f3f4f6" || c === "#fef9c3" || c === "#dcfce7" || c === "#dbeafe" || c === "#ede9fe" || c === "#fce7f3" || c === "#ffedd5" || c === "#fee2e2" || c === "#cffafe"
                  ? "1px solid #d1d5db"
                  : "1px solid rgba(0,0,0,0.08)",
              cursor: "pointer",
              display: "flex", alignItems: "center", justifyContent: "center",
              flexShrink: 0,
              boxSizing: "border-box",
            }}
          >
            {c === currentColor && (
              <span style={{
                fontSize: 10, fontWeight: 900, lineHeight: 1,
                color: ["#ffffff","#f3f4f6","#fef9c3","#dcfce7","#dbeafe","#ede9fe","#fce7f3","#ffedd5","#fee2e2","#cffafe","#fde047","#fef08a","#bbf7d0","#bfdbfe","#fbcfe8","#fed7aa","#fecaca","#a5f3fc","#67e8f9","#d8b4fe","#f9a8d4","#a5b4fc","#86efac","#93c5fd","#5eead4","#fdba74","#fca5a5","#d1d5db","#9ca3af"].includes(c) ? "#374151" : "#fff",
                textShadow: "none",
              }}>✓</span>
            )}
          </button>
        ))}
      </div>

      {/* 직접 색상 입력 */}
      <div style={{ display: "flex", alignItems: "center", gap: 8, paddingTop: 8, borderTop: "1px solid #f3f4f6" }}>
        <span style={{ fontSize: 11, color: "#6b7280", flexShrink: 0 }}>직접 입력</span>
        <label
          style={{
            display: "flex", alignItems: "center", gap: 6, cursor: "pointer",
            flex: 1,
          }}
          onMouseDown={e => e.stopPropagation()}
        >
          <input
            type="color"
            defaultValue={currentColor || (type === "text" ? "#000000" : "#fef08a")}
            style={{ width: 28, height: 28, borderRadius: 4, border: "1px solid #d1d5db", cursor: "pointer", padding: 1 }}
            onChange={e => { applyColor(e.target.value); }}
          />
          <span style={{ fontSize: 11, color: "#9ca3af" }}>컴러 피커로 자유롭게 선택</span>
        </label>
      </div>
    </div>
  );
}

// ─── Main Editor Component ─────────────────────────────────────
export default function RichEditor({ content, onChange, placeholder, minHeight = 300, context }: RichEditorProps) {
  // editor selection/transaction 변경 시 React 리렌더링을 위한 버전 카운터
  // onSelectionUpdate/onTransaction에서 증가시켜 isActive() 등이 올바르게 재평가되도록 함
  const [editorSelectionVersion, setEditorSelectionVersion] = useState(0);
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const _editorSelectionVersion = editorSelectionVersion; // 리렌더링 트리거용 (사용하지 않아도 됨)

  const [showLinkDialog, setShowLinkDialog] = useState(false);
  const [showImageDialog, setShowImageDialog] = useState(false);
  const [showFileDialog, setShowFileDialog] = useState(false);
  const [showVideoDialog, setShowVideoDialog] = useState(false);
  const [showStyleDialog, setShowStyleDialog] = useState(false);
  const [showTableDialog, setShowTableDialog] = useState(false);
  const [showColorPicker, setShowColorPicker] = useState(false);
  const [showFontSizeDropdown, setShowFontSizeDropdown] = useState(false);
  const [showFontDropdown, setShowFontDropdown] = useState(false);
  const [showLineHeightDropdown, setShowLineHeightDropdown] = useState(false);
  const [showHighlightPicker, setShowHighlightPicker] = useState(false);
  const [previewMode, setPreviewMode] = useState(false);
  const [htmlSourceMode, setHtmlSourceMode] = useState(false);
  const [htmlSourceValue, setHtmlSourceValue] = useState('');

  // ─── 블록 삽입 패널 상태 ──────────────────────────────────────
  const [showBlockInsertPanel, setShowBlockInsertPanel] = useState(false);
  const [blockInsertPanelPos, setBlockInsertPanelPos] = useState({ x: 0, y: 0 });

  const [imageUploading, setImageUploading] = useState(false);
  const imageUploadingRef = useRef(false);
  const setImageUploadingRef = useCallback((v: boolean) => {
    imageUploadingRef.current = v;
    setImageUploading(v);
  }, []);

  // ─── AI alt 텍스트 생성 ──────────────────────────────────
  // AI alt 생성 중인 이미지 URL Set (백그라운드 자동 생성 추적)
  const [altGeneratingUrls, setAltGeneratingUrls] = useState<Set<string>>(new Set());
  const generateAltMutation = trpc.image.generateAlt.useMutation();
  const contextRef = useRef(context);
  useEffect(() => { contextRef.current = context; }, [context]);

  /**
   * 이미지 URL에 대해 AI alt 텍스트를 생성하고 에디터의 해당 img 노드에 적용
   * @param imageUrl 업로드된 이미지 URL
   * @param editor tiptap 에디터 인스턴스
   */
  // editor ref - applyAltToImage에서 사용하기 위해 useEditor 후에 설정됨
  const editorRef = useRef<ReturnType<typeof useEditor>>(null);
  // 툴바 컨테이너 ref - 외부 클릭 시 드롭다운 닫기용
  const toolbarRef = useRef<HTMLDivElement>(null);

  const applyAltToImage = useCallback(async (imageUrl: string) => {
    const editorInstance = editorRef.current;
    if (!editorInstance) return;

    // 생성 중 URL 등록
    setAltGeneratingUrls(prev => new Set(prev).add(imageUrl));
    try {
      const result = await generateAltMutation.mutateAsync({
        imageUrl,
        context: contextRef.current,
      });
      if (result.isEmpty || !result.alt) return; // 장식적 이미지는 alt 없음

      // 에디터 내 해당 src의 img 노드를 찾아 alt 업데이트
      const { state, dispatch } = editorInstance.view;
      state.doc.descendants((node, pos) => {
        if (node.type.name === 'image' && node.attrs.src === imageUrl) {
          const tr = state.tr.setNodeMarkup(pos, undefined, {
            ...node.attrs,
            alt: result.alt,
          });
          dispatch(tr);
          return false; // 첫 번째 매치만 업데이트
        }
      });

      // 폸오버가 열려 있고 해당 이미지이면 입력값 동기화
      setAltPopover(prev => {
        if (prev && prev.src === imageUrl) {
          setAltEditValue(result.alt);
        }
        return prev;
      });

      // 생성 완료 토스트 (alt가 실제로 생성된 경우만)
      toast.success('AI가 alt 텍스트를 생성했습니다.', {
        description: result.alt.length > 40 ? result.alt.slice(0, 40) + '…' : result.alt,
        duration: 3000,
      });
    } catch {
      // alt 생성 실패는 조용히 무시 (업로드 자체는 성공했으므로)
    } finally {
      // 생성 완료 후 URL 제거
      setAltGeneratingUrls(prev => {
        const next = new Set(prev);
        next.delete(imageUrl);
        return next;
      });
    }
  }, [generateAltMutation]);

  // ─── 이미지 클릭 팝오버 상태 ────────────────────────────────

  const [altPopover, setAltPopover] = useState<{
    src: string;
    pos: number;
    currentAlt: string;
    currentWidth: string;
    currentAlign: string;
    rect: DOMRect;
  } | null>(null);

  // iframe 클릭 시 삭제 팝오버 (냅킨/유튜브/외부 임베드)
  const [iframePopover, setIframePopover] = useState<{
    pos: number;
    src: string;
    rect: DOMRect;
  } | null>(null);
  const [altEditValue, setAltEditValue] = useState('');
  const [altGenerating, setAltGenerating] = useState(false);
  const [imgWidthValue, setImgWidthValue] = useState('80%');
  const [imgAlignValue, setImgAlignValue] = useState('center');

  const MAX_IMAGE_SIZE_EDITOR = 5 * 1024 * 1024; // 5MB

  /** 이미지 파일을 /api/upload/image로 업로드하고 URL 반환 */
  const uploadImageFileImpl = useCallback(async (file: File): Promise<string | null> => {
    if (file.size > MAX_IMAGE_SIZE_EDITOR) {
      toast.error(`이미지 크기가 너무 큽니다. 5MB 이하의 파일만 업로드할 수 있습니다. (현재: ${(file.size / 1024 / 1024).toFixed(1)}MB)`);
      return null;
    }
    try {
      setImageUploadingRef(true);
      const formData = new FormData();
      formData.append("file", file);
      const res = await fetch("/api/upload/image", {
        method: "POST",
        credentials: "include",
        body: formData,
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        toast.error(err.error || "이미지 업로드 실패");
        return null;
      }
      const data = await res.json();
      return data.url as string;
    } catch {
      toast.error("이미지 업로드 중 오류가 발생했습니다.");
      return null;
    } finally {
      setImageUploadingRef(false);
    }
  }, [setImageUploadingRef]);

  const uploadImageFileRef = useRef(uploadImageFileImpl);
  useEffect(() => {
    uploadImageFileRef.current = uploadImageFileImpl;
  }, [uploadImageFileImpl]);
  const uploadImageFile = useCallback((file: File) => uploadImageFileRef.current(file), []);

  // applyAltToImage ref (useEditor 내부에서 최신 함수 참조용)
  const applyAltToImageRef = useRef(applyAltToImage);
  useEffect(() => { applyAltToImageRef.current = applyAltToImage; }, [applyAltToImage]);

  // 에디터 전용 폰트 동적 로딩 (WritePage에서만 필요한 폰트를 index.html에서 분리)
  // RichEditor가 마운트될 때 한 번만 로드 (중복 방지: id로 체크)
  useEffect(() => {
    const EDITOR_FONTS_URL =
      'https://fonts.googleapis.com/css2?family=Noto+Serif+KR:wght@400;700' +
      '&family=Nanum+Gothic:wght@400;700' +
      '&family=Nanum+Myeongjo:wght@400;700' +
      '&family=Nanum+Barun+Gothic' +
      '&family=Black+Han+Sans' +
      '&family=Jua' +
      '&family=Gaegu' +
      '&family=Do+Hyeon' +
      '&family=Gowun+Dodum' +
      '&family=Roboto:wght@400;700' +
      '&family=Open+Sans:wght@400;700' +
      '&family=Lato:wght@400;700' +
      '&family=Montserrat:wght@400;700' +
      '&family=Playfair+Display:wght@400;700' +
      '&family=Poppins:wght@400;700' +
      '&family=Raleway:wght@400;700' +
      '&family=Oswald:wght@400;700' +
      '&family=Merriweather:wght@400;700' +
      '&family=Source+Sans+3:wght@400;700' +
      '&display=swap';
    const LINK_ID = 'rich-editor-fonts';
    if (!document.getElementById(LINK_ID)) {
      const link = document.createElement('link');
      link.id = LINK_ID;
      link.rel = 'stylesheet';
      link.href = EDITOR_FONTS_URL;
      document.head.appendChild(link);
    }
  }, []);

  // useRef로 초기 content만 저장 - content prop 변경 시 에디터가 재초기화되는 것을 방지
  // (이미지 업로드 후 onChange -> setContent -> content prop 변경 -> 에디터 재초기화 문제 해결)
  const initialContentRef = useRef(content);

  const editor = useEditor({
    extensions: [
      StarterKit.configure({
        // StarterKit v3 already includes: Bold, Italic, Underline, Strike, Code, CodeBlock,
        // Blockquote, HorizontalRule, Link, Heading, BulletList, OrderedList, etc.
        // Override CodeBlock to add custom class
        codeBlock: { HTMLAttributes: { class: "rich-code-block" } },
        // Configure Link to not open on click
        // target 속성은 링크별로 저장된 값을 사용 (전역 target=_blank 제거 - #hash 앵커 링크는 새 탭으로 열리면 안 됨)
        link: {
          openOnClick: false,
          HTMLAttributes: { rel: "noopener noreferrer" },
        },
        // orderedList는 별도 커스텀 extension으로 대체 (아래 OrderedListNoInputRule 참조)
        orderedList: false,
      }),
      TextStyle,
      CustomFontSize,
      FontFamily.configure({ types: ["textStyle"] }),
      LineHeight.configure({ types: ["paragraph", "heading", "tableCell", "tableHeader", "textStyle"] }),
      Color.configure({ types: ["textStyle"] }),
      Highlight.configure({ multicolor: true }),
      TextAlign.configure({ types: ["heading", "paragraph", "tableCell", "tableHeader"] }),
      Image.extend({
        addAttributes() {
          return {
            ...this.parent?.(),
            width: {
              default: null,
              parseHTML: el => el.getAttribute('width') || el.style.width || null,
              renderHTML: attrs => {
                if (!attrs.width) return {};
                return { width: attrs.width, style: `width:${attrs.width};max-width:100%;` };
              },
            },
            'data-align': {
              default: null,
              parseHTML: el => el.getAttribute('data-align') || null,
              renderHTML: attrs => {
                if (!attrs['data-align']) return {};
                return { 'data-align': attrs['data-align'] };
              },
            },
          };
        },
        renderHTML({ HTMLAttributes }) {
          return ['img', mergeAttributes(this.options.HTMLAttributes, HTMLAttributes)];
        },
      }).configure({ inline: false, allowBase64: false }),
      Placeholder.configure({ placeholder: placeholder || "내용을 입력하세요..." }),
      TaskList,
      TaskItem.configure({ nested: true }),
      Table.configure({ resizable: true }),
      TableRow,
      TableCell,
      TableHeader,
      CustomDiv,
      IframeNode,
      OrderedListNoInputRule,
    ],

    content: initialContentRef.current,
    onUpdate: ({ editor }) => {
      onChange(editor.getHTML());
    },
    // selection 변경 시 React 리렌더링을 트리거하여
    // editor.isActive('tableCell') 등이 올바르게 재평가되도록 함
    onSelectionUpdate: () => {
      setEditorSelectionVersion(v => v + 1);
    },
    onTransaction: () => {
      setEditorSelectionVersion(v => v + 1);
    },
    editorProps: {
      attributes: {
        class: "rich-editor-content",
        style: `min-height:${minHeight}px; outline:none; padding:16px; color:#111827; font-size:15px; font-family:'Noto Sans KR',sans-serif;`,
      },
      handlePaste(view, event) {
        const items = Array.from(event.clipboardData?.items ?? []);

        // 1. 클립보드에 직접 이미지 파일이 있는 경우 (스크린샷 등)
        const imageItem = items.find(item => item.type.startsWith("image/"));
        if (imageItem) {
          event.preventDefault();
          event.stopPropagation();
          const file = imageItem.getAsFile();
          if (!file) return true;
          uploadImageFile(file).then(url => {
            if (!url) return;
            const imageNode = view.state.schema.nodes.image.create({
              src: url,
              alt: file.name || "",
              title: "",
            });
            const tr = view.state.tr.replaceSelectionWith(imageNode);
            view.dispatch(tr);
            // AI alt 텍스트 자동 생성 (비동기, 업로드 후 백그라운드에서 실행)
            setTimeout(() => applyAltToImageRef.current(url), 100);
          });
          return true;
        }

        // 2. HTML 클립보드가 있는 경우 - img src 추출 후 업로드
        const htmlItem = items.find(item => item.type === "text/html");
        if (htmlItem) {
          // HTML 문자열을 동기적으로 읽기 위해 clipboardData.getData 사용
          const htmlStr = event.clipboardData?.getData("text/html") || "";
          const parser = new DOMParser();
          const doc = parser.parseFromString(htmlStr, "text/html");

          // ── 티스토리 figure.imageblock → <img> 변환 ─────────────────────────
          // <figure class="imageblock"><span data-url="..."><img src="..."></span></figure>
          // ProseMirror가 figure/span 구조를 처리하지 못해 이미지가 소실됨 → img로 직접 변환
          const imageblocks = Array.from(doc.querySelectorAll('figure.imageblock, figure[data-ke-type="image"]'));
          imageblocks.forEach(fig => {
            const img = fig.querySelector('img');
            if (!img) {
              // span[data-url]에서 URL 추출
              const span = fig.querySelector('span[data-url]');
              if (span) {
                const url = span.getAttribute('data-url') || span.getAttribute('data-phocus') || '';
                if (url) {
                  const newImg = doc.createElement('img');
                  newImg.setAttribute('src', url);
                  const align = fig.className.includes('alignCenter') ? 'display:block;margin:0 auto;' :
                                fig.className.includes('alignRight') ? 'display:block;margin-left:auto;' : '';
                  if (align) newImg.setAttribute('style', align);
                  fig.parentNode?.replaceChild(newImg, fig);
                }
              }
              return;
            }
            // img가 있는 경우 img만 추출하여 figure 대체
            const align = fig.className.includes('alignCenter') ? 'display:block;margin:0 auto;' :
                          fig.className.includes('alignRight') ? 'display:block;margin-left:auto;' : '';
            if (align) img.setAttribute('style', (img.getAttribute('style') || '') + align);
            fig.parentNode?.replaceChild(img, fig);
          });

          // ── 티스토리 figure[data-ke-type="opengraph"] → OG 카드 변환 ──────────────
          // <figure data-ke-type="opengraph" data-og-title="..." data-og-image="..."><a href="...">...</a></figure>
          const ogFigures = Array.from(doc.querySelectorAll('figure[data-ke-type="opengraph"]'));
          ogFigures.forEach(fig => {
            const href = fig.getAttribute('data-og-url') || fig.getAttribute('data-og-source-url') || '';
            const title = fig.getAttribute('data-og-title') || '';
            const desc = fig.getAttribute('data-og-description') || '';
            const host = fig.getAttribute('data-og-host') || '';
            const imgUrl = fig.getAttribute('data-og-image') || '';
            const cardHtml = `<div class="coupang-link-card" style="border:1px solid #e5e7eb;border-radius:8px;overflow:hidden;margin:12px 0;"><a href="${href}" target="_blank" rel="noopener noreferrer" style="display:block;text-decoration:none;color:inherit;">${imgUrl ? `<img src="${imgUrl}" alt="${title}" style="width:100%;max-height:160px;object-fit:cover;display:block;" />` : ''}<p style="font-weight:700;margin:8px 12px 4px;font-size:14px;">${title}</p><p style="font-size:12px;color:#6b7280;margin:0 12px 4px;">${desc}</p><p style="font-size:11px;color:#9ca3af;margin:0 12px 8px;">${host}</p></a></div>`;
            const wrapper = doc.createElement('div');
            wrapper.innerHTML = cardHtml;
            fig.parentNode?.replaceChild(wrapper.firstElementChild!, fig);
          });

          // ── 쿠팡/티스토리 OG 링크 카드 변환 ──────────────────────────────
          // <a href="..."><div class="og-image" style="background-image:url(...)">..</div><div class="og-text">...</div></a>
          // ProseMirror는 a 안에 div를 허용하지 않아 링크가 소실됨 → 카드형 블록으로 변환
          const ogLinks = Array.from(doc.querySelectorAll('a[href]')).filter(a => {
            return a.querySelector('div.og-image, div.og-text, div[class*="og-"]') !== null;
          });
          ogLinks.forEach(a => {
            const href = a.getAttribute('href') || '';
            // og-image의 background-image URL 추출
            const ogImageEl = a.querySelector<HTMLElement>('.og-image, [class*="og-image"]');
            let imgUrl = '';
            if (ogImageEl) {
              const bgStyle = ogImageEl.style.backgroundImage || '';
              const bgMatch = bgStyle.match(/url\(['"]?([^'"\)]+)['"]?\)/);
              if (bgMatch) imgUrl = bgMatch[1];
            }
            const ogTitle = a.querySelector('.og-title, [class*="og-title"]')?.textContent?.trim() || '';
            const ogDesc = a.querySelector('.og-desc, [class*="og-desc"]')?.textContent?.trim() || '';
            const ogHost = a.querySelector('.og-host, [class*="og-host"]')?.textContent?.trim() || '';

            // 카드형 링크 HTML 생성 (ProseMirror는 a 안에 block 요소를 허용하지 않으므로
            // 외부 div 안에 a와 내용을 분리하여 배치)
            const cardHtml = `<div class="coupang-link-card" style="border:1px solid #e5e7eb;border-radius:8px;overflow:hidden;margin:12px 0;"><a href="${href}" target="_blank" rel="noopener noreferrer" style="display:block;text-decoration:none;color:inherit;">${imgUrl ? `<img src="${imgUrl}" alt="${ogTitle}" style="width:100%;max-height:160px;object-fit:cover;display:block;" />` : ''}<p style="font-weight:700;margin:8px 12px 4px;font-size:14px;">${ogTitle}</p><p style="font-size:12px;color:#6b7280;margin:0 12px 4px;">${ogDesc}</p><p style="font-size:11px;color:#9ca3af;margin:0 12px 8px;">${ogHost}</p></a></div>`;
            const wrapper = doc.createElement('div');
            wrapper.innerHTML = cardHtml;
            a.parentNode?.replaceChild(wrapper.firstElementChild!, a);
          });

          const imgs = Array.from(doc.querySelectorAll("img"));

          // 업로드가 필요한 이미지 확인 (base64 또는 외부 URL)
          const needsUpload = imgs.filter(img => {
            const src = img.getAttribute("src") || "";
            return src.startsWith("data:") || (
              src.startsWith("http") &&
              !src.includes(window.location.hostname) &&
              !src.startsWith("/manus-storage/")
            );
          });

          const hasTransformed = imageblocks.length > 0 || ogFigures.length > 0 || ogLinks.length > 0;

          if (needsUpload.length === 0 && !hasTransformed) {
            // 업로드 필요 없고 변환도 없으면 기본 Tiptap paste 동작 허용
            return false;
          }

          // 변환만 있고 이미지 업로드 불필요한 경우 바로 삽입
          if (needsUpload.length === 0 && hasTransformed) {
            event.preventDefault();
            event.stopPropagation();
            (async () => {
              const { DOMParser: PmDOMParser } = await import("@tiptap/pm/model");
              const { tr, schema } = view.state;
              const domNode = document.createElement("div");
              domNode.innerHTML = doc.body.innerHTML;
              const slice = PmDOMParser.fromSchema(schema).parseSlice(domNode);
              view.dispatch(tr.replaceSelection(slice));
            })();
            return true;
          }

          // 이미지 업로드가 필요하므로 기본 paste 동작 억제
          event.preventDefault();
          event.stopPropagation();

          // 비동기 업로드 후 수정된 HTML 삽입
          (async () => {
            setImageUploadingRef(true);
            try {
              const uploadResults = await Promise.allSettled(
                needsUpload.map(async (img) => {
                  const src = img.getAttribute("src") || "";
                  try {
                    const res = await fetch("/api/upload/image-from-url", {
                      method: "POST",
                      credentials: "include",
                      headers: { "Content-Type": "application/json" },
                      body: JSON.stringify({ imageUrl: src }),
                    });
                    if (!res.ok) {
                      const errData = await res.json().catch(() => ({}));
                      throw new Error(errData.error || "업로드 실패");
                    }
                    const data = await res.json();
                    img.setAttribute("src", data.url);
                    return data.url as string;
                  } catch (err) {
                    console.warn("[Paste] 이미지 업로드 실패, 원본 src 유지:", err);
                    return null;
                  }
                })
              );

              const successCount = uploadResults.filter(
                r => r.status === "fulfilled" && r.value !== null
              ).length;
              const failCount = needsUpload.length - successCount;

              if (successCount > 0) {
                toast.success(`이미지 ${successCount}개가 서버에 업로드되었습니다.`);
              }
              if (failCount > 0) {
                toast.warning(`이미지 ${failCount}개는 업로드에 실패하여 원본 URL이 유지됩니다.`);
              }

              // 업로드 성공한 URL들에 AI alt 자동 생성 (삽입 후 짧은 딥레이 후 실행)
              const uploadedUrls = uploadResults
                .filter((r): r is PromiseFulfilledResult<string> => r.status === 'fulfilled' && r.value !== null)
                .map(r => r.value);
              if (uploadedUrls.length > 0) {
                setTimeout(() => {
                  uploadedUrls.forEach(url => applyAltToImageRef.current(url));
                }, 200);
              }

              // 수정된 HTML을 에디터에 삽입
              const updatedHtml = doc.body.innerHTML;
              // @tiptap/pm/model에서 DOMParser 가져오기 (prosemirror-model 대신)
              const { DOMParser: PmDOMParser } = await import("@tiptap/pm/model");
              const { tr, schema } = view.state;
              const domNode = document.createElement("div");
              domNode.innerHTML = updatedHtml;
              const slice = PmDOMParser.fromSchema(schema).parseSlice(domNode);
              view.dispatch(tr.replaceSelection(slice));
            } finally {
              setImageUploadingRef(false);
            }
          })();

          return true;
        }

        return false;
      },
      handleDrop(view, event, _slice, moved) {
        if (moved) return false;
        const files = Array.from(event.dataTransfer?.files ?? []);
        const imageFiles = files.filter(f => f.type.startsWith("image/"));
        if (imageFiles.length === 0) return false;
        event.preventDefault();
        const pos = view.posAtCoords({ left: event.clientX, top: event.clientY });
        imageFiles.forEach(file => {
          uploadImageFile(file).then(url => {
            if (url && pos) {
              const tr = view.state.tr.insert(
                pos.pos,
                view.state.schema.nodes.image.create({ src: url })
              );
              view.dispatch(tr);
              // AI alt 텍스트 자동 생성
              setTimeout(() => applyAltToImageRef.current(url), 100);
            }
          });
        });
        return true;
      },
    },
  });

  // editorRef 업데이트 - useEditor 후 editor 인스턴스를 ref에 저장
  useEffect(() => {
    (editorRef as React.MutableRefObject<ReturnType<typeof useEditor>>).current = editor;
  }, [editor]);

  const closeAllDialogs = useCallback(() => {
    setShowLinkDialog(false);
    setShowImageDialog(false);
    setShowFileDialog(false);
    setShowVideoDialog(false);
    setShowStyleDialog(false);
    setShowTableDialog(false);
    setShowColorPicker(false);
    setShowHighlightPicker(false);
    setShowFontDropdown(false);
    setShowFontSizeDropdown(false);
    setShowLineHeightDropdown(false);
    setShowBlockInsertPanel(false);
  }, []);

  // 툴바 외부 클릭 시 모든 드롭다운/팝업 닫기
  // (폰트, 크기, 줄간격, 색상, 형광펜 등 모든 팝업 통합 처리)
  const anyDropdownOpen = showFontDropdown || showFontSizeDropdown || showLineHeightDropdown ||
    showColorPicker || showHighlightPicker;
  useEffect(() => {
    if (!anyDropdownOpen) return;
    const handler = (e: MouseEvent) => {
      if (toolbarRef.current && toolbarRef.current.contains(e.target as unknown as globalThis.Node)) return;
      closeAllDialogs();
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [anyDropdownOpen, closeAllDialogs]);

  // ─── 목차 자동 삽입 ──────────────────────────────────────────────
  const insertToc = useCallback(() => {
    if (!editor) return;
    const html = editor.getHTML();

    // h2/h3 제목 추출
    const headingRe = /<h[23][^>]*>(.*?)<\/h[23]>/gi;
    const headings: { text: string; id: string }[] = [];
    let hm: RegExpExecArray | null;
    while ((hm = headingRe.exec(html)) !== null) {
      const text = hm[1].replace(/<[^>]+>/g, "").trim();
      if (text && text !== "목차") {
        headings.push({ text, id: makeEditorSlug(text) });
      }
    }
    if (headings.length < 2) {
      toast.info("목차를 만들려면 h2/h3 소제목이 2개 이상 필요합니다.");
      return;
    }

    // 기존 목차 섹션 존재 여부 확인
    const hasToc = /목차/.test(html) && (/<ol/.test(html) || /<ul/.test(html));

    if (hasToc) {
      // 기존 목차가 있으면: 목차 내 링크 href를 올바른 id로 보완
      const newHtml = html.replace(
        /<a([^>]*)href="(#[^"]*?)"([^>]*)>(.*?)<\/a>/gi,
        (match, before, href, after, linkText) => {
          const rawId = href.slice(1);
          const linkTextClean = linkText.replace(/<[^>]+>/g, "").trim();
          // 이미 유효한 id면 그대로
          const existsInDoc = headings.some(h => h.id === rawId || h.id === decodeURIComponent(rawId));
          if (existsInDoc) return match;
          // 텍스트 매칭으로 올바른 id 찾기
          const matched = headings.find(
            h => h.text === linkTextClean ||
                 h.text.includes(linkTextClean) ||
                 linkTextClean.includes(h.text) ||
                 makeEditorSlug(h.text) === makeEditorSlug(linkTextClean)
          );
          if (matched) {
            return `<a${before}href="#${matched.id}"${after}>${linkText}</a>`;
          }
          return match;
        }
      );
      if (newHtml !== html) {
        editor.commands.setContent(newHtml, { emitUpdate: true });
        toast.success("목차 링크를 보완했습니다.");
      } else {
        toast.info("목차가 이미 올바르게 연결되어 있습니다.");
      }
      return;
    }

    // 목차 없으면 자동 생성
    const tocItems = headings
      .map(h => `<li><a href="#${h.id}">${h.text}</a></li>`)
      .join("");
    const tocHtml = `<h2>목차</h2><ol>${tocItems}</ol>`;

    // 첫 번째 h2 앞에 삽입
    const insertPos = html.search(/<h2[^>]*>/i);
    let newHtml: string;
    if (insertPos > 0) {
      newHtml = html.slice(0, insertPos) + tocHtml + html.slice(insertPos);
    } else {
      newHtml = tocHtml + html;
    }
    editor.commands.setContent(newHtml, { emitUpdate: true });
    toast.success("목차가 자동으로 삽입되었습니다.");
  }, [editor]);

  if (!editor) return null;

  // 이미지 편집 팝업 위치 계산 (화면 하단 잠힘 방지)
  const POPUP_HEIGHT = 320;
  const POPUP_WIDTH = 340;
  const popupTop = altPopover
    ? (() => {
        const spaceBelow = window.innerHeight - altPopover.rect.bottom - 8;
        const spaceAbove = altPopover.rect.top - 8;
        const showAbove = spaceBelow < POPUP_HEIGHT && spaceAbove > POPUP_HEIGHT;
        return showAbove
          ? Math.max(8, altPopover.rect.top - POPUP_HEIGHT - 8)
          : Math.min(altPopover.rect.bottom + 8, window.innerHeight - POPUP_HEIGHT - 8);
      })()
    : 0;
  const popupLeft = altPopover
    ? Math.min(Math.max(8, altPopover.rect.left), window.innerWidth - POPUP_WIDTH - 8)
    : 0;

  return (
    <div style={{ position: "relative" }}>
      {/* Toolbar - sticky 고정 */}
      <div ref={toolbarRef} style={{
        background: "#eef0fb",
        border: "1px solid #c8cde8",
        borderBottom: "2px solid #c8cde8",
        borderRadius: "8px 8px 0 0",
        padding: "7px 10px",
        display: "flex", flexWrap: "wrap", gap: 3, alignItems: "center",
        position: "sticky",
        top: 56, /* 헤더 높이(56px) 아래에 고정 */
        zIndex: 20,
        boxShadow: "0 2px 10px rgba(79,70,229,0.10)",
      }}>
        {/* 이미지 업로드 중 인디케이터 */}
        {imageUploading && (
          <div style={{
            position: "absolute", top: 0, left: 0, right: 0, bottom: 0,
            background: "rgba(255,255,255,0.85)",
            display: "flex", alignItems: "center", justifyContent: "center",
            borderRadius: "8px 8px 0 0", zIndex: 30, gap: 8,
            fontSize: 13, color: "#6366f1", fontWeight: 600,
          }}>
            <Loader2 size={16} style={{ animation: "spin 1s linear infinite" }} />
            이미지 업로드 중...
          </div>
        )}
        {/* Undo/Redo */}
        <ToolBtn onClick={() => editor.chain().focus().undo().run()} title="실행 취소 (Ctrl+Z)" disabled={!editor.can().undo()}>
          <Undo size={13} />
        </ToolBtn>
        <ToolBtn onClick={() => editor.chain().focus().redo().run()} title="다시 실행 (Ctrl+Y)" disabled={!editor.can().redo()}>
          <Redo size={13} />
        </ToolBtn>
        <Divider />

        {/* 폰트 선택 드롭다운 — 글자크기보다 먼저 */}
        <div style={{ position: "relative" }}>
          <button
            type="button"
            title="폰트 선택"
            onMouseDown={e => { e.preventDefault(); closeAllDialogs(); setShowFontDropdown(v => !v); }}
            style={{
              display: "flex", alignItems: "center", gap: 3,
              height: 32, padding: "0 8px", borderRadius: 6, minWidth: 80,
              background: showFontDropdown ? "#6366f1" : "transparent",
              border: showFontDropdown ? "1px solid #6366f1" : "1px solid #d1d5db",
              color: showFontDropdown ? "#fff" : "#374151",
              cursor: "pointer", fontSize: 12, fontWeight: 600, flexShrink: 0,
            }}
          >
            <span style={{
              minWidth: 52, textAlign: "left", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
              fontFamily: editor.getAttributes("textStyle").fontFamily || "inherit",
            }}>
              {(() => {
                const ff = editor.getAttributes("textStyle").fontFamily;
                if (!ff) return "폰트";
                const found = [
                  { label: "Noto Sans KR", value: "'Noto Sans KR', sans-serif" },
                  { label: "Noto Serif KR", value: "'Noto Serif KR', serif" },
                  { label: "나눔고딕", value: "'Nanum Gothic', sans-serif" },
                  { label: "나눔명조", value: "'Nanum Myeongjo', serif" },
                  { label: "나눔바른고딕", value: "'Nanum Barun Gothic', sans-serif" },
                  { label: "검은고딕", value: "'Black Han Sans', sans-serif" },
                  { label: "주아체", value: "'Jua', sans-serif" },
                  { label: "개구쟁이체", value: "'Gaegu', cursive" },
                  { label: "도현체", value: "'Do Hyeon', sans-serif" },
                  { label: "고운돋움", value: "'Gowun Dodum', sans-serif" },
                  { label: "Roboto", value: "'Roboto', sans-serif" },
                  { label: "Open Sans", value: "'Open Sans', sans-serif" },
                  { label: "Lato", value: "'Lato', sans-serif" },
                  { label: "Montserrat", value: "'Montserrat', sans-serif" },
                  { label: "Playfair Display", value: "'Playfair Display', serif" },
                  { label: "맑은 고딕", value: "'Malgun Gothic', '맑은 고딕', sans-serif" },
                  { label: "굴림", value: "Gulim, '굴림', sans-serif" },
                  { label: "돋움", value: "Dotum, '돋움', sans-serif" },
                  { label: "바탕", value: "Batang, '바탕', serif" },
                  { label: "궁서", value: "Gungsuh, '궁서', serif" },
                ].find(f => ff.includes(f.value.split(",")[0].replace(/'/g, "")));
                return found ? found.label : "폰트";
              })()}
            </span>
            <ChevronDown size={10} />
          </button>
          {showFontDropdown && (
            <div
              onMouseDown={e => e.stopPropagation()}
              style={{
                position: "absolute", top: "calc(100% + 4px)", left: 0,
                background: "#fff", border: "1px solid #e5e7eb", borderRadius: 10,
                boxShadow: "0 8px 28px rgba(0,0,0,0.18)",
                zIndex: 9999, padding: "6px 0",
                maxHeight: 400, overflowY: "auto", width: 280,
              }}
            >
              {/* 기본값 초기화 */}
              <button
                type="button"
                onMouseDown={e => { e.preventDefault(); editor.chain().focus().unsetFontFamily().run(); setShowFontDropdown(false); }}
                style={{ display: "flex", alignItems: "center", width: "100%", padding: "6px 16px", textAlign: "left", background: "none", border: "none", cursor: "pointer", fontSize: 13, color: "#6b7280", gap: 8 }}
              >
                <span style={{ fontSize: 13 }}>기본값 (초기화)</span>
              </button>
              <div style={{ height: 1, background: "#f3f4f6", margin: "4px 0" }} />
              {/* ★ 자주 쓰는 폰트 */}
              <div style={{ padding: "3px 16px 5px", fontSize: 10, color: "#6366f1", fontWeight: 700, letterSpacing: "0.6px", textTransform: "uppercase" }}>★ 자주 쓰는 폰트</div>
              {[
                { label: "나눔고딕", value: "'Nanum Gothic', sans-serif", preview: "가나다라마 Abc 123" },
                { label: "Noto Sans KR", value: "'Noto Sans KR', sans-serif", preview: "가나다라마 Abc 123" },
                { label: "맑은 고딕", value: "'Malgun Gothic', '맑은 고딕', sans-serif", preview: "가나다라마 Abc 123" },
                { label: "나눔명조", value: "'Nanum Myeongjo', serif", preview: "가나다라마 Abc 123" },
                { label: "Roboto", value: "'Roboto', sans-serif", preview: "Hello World 123" },
                { label: "Arial", value: "Arial, sans-serif", preview: "Hello World 123" },
              ].map(f => {
                const currentFf = editor.getAttributes("textStyle").fontFamily;
                const isActive = currentFf && currentFf.includes(f.value.split(",")[0].replace(/'/g, ""));
                return (
                  <button
                    key={f.value}
                    type="button"
                    onMouseDown={e => { e.preventDefault(); editor.chain().focus().setFontFamily(f.value).run(); setShowFontDropdown(false); }}
                    style={{
                      display: "flex", alignItems: "center",
                      width: "100%", padding: "7px 16px",
                      background: isActive ? "#eef2ff" : "none",
                      border: "none", cursor: "pointer", gap: 0,
                    }}
                  >
                    <span style={{ fontSize: 13, fontFamily: f.value, color: isActive ? "#6366f1" : "#111827", fontWeight: isActive ? 700 : 500, whiteSpace: "nowrap", minWidth: 110, flexShrink: 0 }}>{f.label}</span>
                    <span style={{ fontSize: 12, color: "#9ca3af", fontFamily: f.value, marginLeft: 8, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{f.preview}</span>
                  </button>
                );
              })}
              <div style={{ height: 1, background: "#f3f4f6", margin: "4px 0" }} />
              {/* 한국어 전체 */}
              <div style={{ padding: "3px 16px 5px", fontSize: 10, color: "#9ca3af", fontWeight: 700, letterSpacing: "0.6px", textTransform: "uppercase" }}>한국어</div>
              {[
                { label: "Noto Serif KR", value: "'Noto Serif KR', serif", preview: "가나다라마 Abc 123" },
                { label: "나눔바른고딕", value: "'Nanum Barun Gothic', sans-serif", preview: "가나다라마 Abc 123" },
                { label: "검은고딕", value: "'Black Han Sans', sans-serif", preview: "가나다라마 Abc 123" },
                { label: "주아체", value: "'Jua', sans-serif", preview: "가나다라마 Abc 123" },
                { label: "개구쟁이체", value: "'Gaegu', cursive", preview: "가나다라마 Abc 123" },
                { label: "도현체", value: "'Do Hyeon', sans-serif", preview: "가나다라마 Abc 123" },
                { label: "고운돋움", value: "'Gowun Dodum', sans-serif", preview: "가나다라마 Abc 123" },
                { label: "굴림", value: "Gulim, '굴림', sans-serif", preview: "가나다라마 Abc 123" },
                { label: "돋움", value: "Dotum, '돋움', sans-serif", preview: "가나다라마 Abc 123" },
                { label: "바탕", value: "Batang, '바탕', serif", preview: "가나다라마 Abc 123" },
                { label: "궁서", value: "Gungsuh, '궁서', serif", preview: "가나다라마 Abc 123" },
              ].map(f => {
                const currentFf = editor.getAttributes("textStyle").fontFamily;
                const isActive = currentFf && currentFf.includes(f.value.split(",")[0].replace(/'/g, ""));
                return (
                  <button
                    key={f.value}
                    type="button"
                    onMouseDown={e => { e.preventDefault(); editor.chain().focus().setFontFamily(f.value).run(); setShowFontDropdown(false); }}
                    style={{
                      display: "flex", alignItems: "center",
                      width: "100%", padding: "7px 16px",
                      background: isActive ? "#eef2ff" : "none",
                      border: "none", cursor: "pointer", gap: 0,
                    }}
                  >
                    <span style={{ fontSize: 13, fontFamily: f.value, color: isActive ? "#6366f1" : "#111827", fontWeight: isActive ? 700 : 500, whiteSpace: "nowrap", minWidth: 110, flexShrink: 0 }}>{f.label}</span>
                    <span style={{ fontSize: 12, color: "#9ca3af", fontFamily: f.value, marginLeft: 8, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{f.preview}</span>
                  </button>
                );
              })}
              <div style={{ height: 1, background: "#f3f4f6", margin: "4px 0" }} />
              {/* 영어 */}
              <div style={{ padding: "3px 16px 5px", fontSize: 10, color: "#9ca3af", fontWeight: 700, letterSpacing: "0.6px", textTransform: "uppercase" }}>영어</div>
              {[
                { label: "Open Sans", value: "'Open Sans', sans-serif", preview: "Hello World 123" },
                { label: "Lato", value: "'Lato', sans-serif", preview: "Hello World 123" },
                { label: "Montserrat", value: "'Montserrat', sans-serif", preview: "Hello World 123" },
                { label: "Poppins", value: "'Poppins', sans-serif", preview: "Hello World 123" },
                { label: "Raleway", value: "'Raleway', sans-serif", preview: "Hello World 123" },
                { label: "Oswald", value: "'Oswald', sans-serif", preview: "Hello World 123" },
                { label: "Merriweather", value: "'Merriweather', serif", preview: "Hello World 123" },
                { label: "Source Sans Pro", value: "'Source Sans 3', sans-serif", preview: "Hello World 123" },
                { label: "Playfair Display", value: "'Playfair Display', serif", preview: "Hello World 123" },
                { label: "Georgia", value: "Georgia, serif", preview: "Hello World 123" },
                { label: "Times New Roman", value: "'Times New Roman', serif", preview: "Hello World 123" },
                { label: "Courier New", value: "'Courier New', monospace", preview: "Hello World 123" },
              ].map(f => {
                const currentFf = editor.getAttributes("textStyle").fontFamily;
                const isActive = currentFf && currentFf.includes(f.value.split(",")[0].replace(/'/g, ""));
                return (
                  <button
                    key={f.value}
                    type="button"
                    onMouseDown={e => { e.preventDefault(); editor.chain().focus().setFontFamily(f.value).run(); setShowFontDropdown(false); }}
                    style={{
                      display: "flex", alignItems: "center",
                      width: "100%", padding: "7px 16px",
                      background: isActive ? "#eef2ff" : "none",
                      border: "none", cursor: "pointer", gap: 0,
                    }}
                  >
                    <span style={{ fontSize: 13, fontFamily: f.value, color: isActive ? "#6366f1" : "#111827", fontWeight: isActive ? 700 : 500, whiteSpace: "nowrap", minWidth: 110, flexShrink: 0 }}>{f.label}</span>
                    <span style={{ fontSize: 12, color: "#9ca3af", fontFamily: f.value, marginLeft: 8, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{f.preview}</span>
                  </button>
                );
              })}
            </div>
          )}
        </div>

        {/* 글자 크기 드롭다운 */}
        <div style={{ position: "relative" }}>
          <button
            type="button"
            title="글자 크기"
            onMouseDown={e => { e.preventDefault(); closeAllDialogs(); setShowFontSizeDropdown(v => !v); }}
            style={{
              display: "flex", alignItems: "center", gap: 3,
              height: 32, padding: "0 8px", borderRadius: 6, minWidth: 58,
              background: showFontSizeDropdown ? "#6366f1" : "transparent",
              border: showFontSizeDropdown ? "1px solid #6366f1" : "1px solid #d1d5db",
              color: showFontSizeDropdown ? "#fff" : "#374151",
              cursor: "pointer", fontSize: 12, fontWeight: 600, flexShrink: 0,
            }}
          >
            <span style={{ minWidth: 24, textAlign: "center" }}>
              {(() => {
                const fromSpan = editor.getAttributes("textStyle").fontSize;
                const fromPara = editor.getAttributes("paragraph").fontSize;
                const fromHead = editor.getAttributes("heading").fontSize;
                const val = fromSpan || fromPara || fromHead;
                return val ? val.replace("px", "") : "크기";
              })()}
            </span>
            <ChevronDown size={10} />
          </button>
          {showFontSizeDropdown && (
            <div
              onMouseDown={e => e.stopPropagation()}
              style={{
                position: "absolute", top: "calc(100% + 4px)", left: 0,
                background: "#fff", border: "1px solid #e5e7eb", borderRadius: 8,
                boxShadow: "0 8px 24px rgba(0,0,0,0.15)",
                zIndex: 9999, padding: "6px 0",
                maxHeight: 280, overflowY: "auto", minWidth: 80,
              }}
            >
              {/* 초기화 */}
              <button
                type="button"
                onMouseDown={e => { e.preventDefault(); editor.chain().focus().unsetFontSize().run(); setShowFontSizeDropdown(false); }}
                style={{ display: "block", width: "100%", padding: "5px 14px", textAlign: "left", background: "none", border: "none", cursor: "pointer", fontSize: 12, color: "#6b7280" }}
              >기본값</button>
              <div style={{ height: 1, background: "#f3f4f6", margin: "4px 0" }} />
              {[3,4,5,6,7,8,9,10,11,12,13,14,15,16,17,18,20,22,24,26,28,30,32,36,40,44,48,52,56,60,64,72,80,90,100,120,140,160,180,200].map(size => {
                const activeFontSize = editor.getAttributes("textStyle").fontSize
                  || editor.getAttributes("paragraph").fontSize
                  || editor.getAttributes("heading").fontSize;
                const current = activeFontSize === `${size}px`;
                return (
                  <button
                    key={size}
                    type="button"
                    onMouseDown={e => { e.preventDefault(); editor.chain().focus().setFontSize(`${size}px`).run(); setShowFontSizeDropdown(false); }}
                    style={{
                      display: "block", width: "100%", padding: "4px 14px",
                      textAlign: "left", background: current ? "#eef2ff" : "none",
                      border: "none", cursor: "pointer",
                      fontSize: Math.min(Math.max(size * 0.7, 10), 18),
                      color: current ? "#6366f1" : "#374151",
                      fontWeight: current ? 700 : 400,
                    }}
                  >{size}px</button>
                );
              })}
            </div>
          )}
        </div>

        {/* 줄간격 드롭다운 */}
        <div style={{ position: "relative" }}>
          <button
            type="button"
            title="줄간격 설정"
            onMouseDown={e => { e.preventDefault(); closeAllDialogs(); setShowLineHeightDropdown(v => !v); }}
            style={{
              display: "flex", alignItems: "center", gap: 3,
              height: 32, padding: "0 8px", borderRadius: 6, minWidth: 68,
              background: showLineHeightDropdown ? "#6366f1" : "transparent",
              border: showLineHeightDropdown ? "1px solid #6366f1" : "1px solid #d1d5db",
              color: showLineHeightDropdown ? "#fff" : "#374151",
              cursor: "pointer", fontSize: 12, fontWeight: 600, flexShrink: 0,
            }}
          >
            <span style={{ fontSize: 13, lineHeight: 1 }}>☰</span>
            <span style={{ minWidth: 28, textAlign: "left", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
              {(() => {
                const lh = editor.getAttributes("paragraph").lineHeight
                  || editor.getAttributes("textStyle").lineHeight;
                return lh ? lh : "간격";
              })()}
            </span>
            <ChevronDown size={10} />
          </button>
          {showLineHeightDropdown && (
            <div
              onMouseDown={e => e.stopPropagation()}
              style={{
                position: "absolute", top: "calc(100% + 4px)", left: 0,
                background: "#fff", border: "1px solid #e5e7eb", borderRadius: 10,
                boxShadow: "0 8px 28px rgba(0,0,0,0.18)",
                zIndex: 9999, padding: "6px 0", width: 200,
              }}
            >
              <button
                type="button"
                onMouseDown={e => { e.preventDefault(); (editor.chain().focus() as unknown as { unsetLineHeight: () => { run: () => void } }).unsetLineHeight().run(); setShowLineHeightDropdown(false); }}
                style={{ display: "flex", alignItems: "center", width: "100%", padding: "6px 16px", background: "none", border: "none", cursor: "pointer", fontSize: 13, color: "#6b7280" }}
              >기본값 (초기화)</button>
              <div style={{ height: 1, background: "#f3f4f6", margin: "4px 0" }} />
              {[
                { label: "0.8 — 매우 좁게", value: "0.8" },
                { label: "0.9 — 아주 좁게", value: "0.9" },
                { label: "1.0 — 좁게", value: "1.0" },
                { label: "1.2 — 약간 좁게", value: "1.2" },
                { label: "1.4 — 기본", value: "1.4" },
                { label: "1.6 — 보통", value: "1.6" },
                { label: "1.8 — 넓게", value: "1.8" },
                { label: "2.0 — 더 넓게", value: "2.0" },
                { label: "2.5 — 매우 넓게", value: "2.5" },
                { label: "3.0 — 최대", value: "3.0" },
              ].map(item => {
                const currentLh = editor.getAttributes("paragraph").lineHeight
                  || editor.getAttributes("textStyle").lineHeight;
                const isActive = currentLh === item.value;
                return (
                  <button
                    key={item.value}
                    type="button"
                    onMouseDown={e => {
                      e.preventDefault();
                      (editor.chain().focus() as unknown as { setLineHeight: (v: string) => { run: () => void } }).setLineHeight(item.value).run();
                      setShowLineHeightDropdown(false);
                    }}
                    style={{
                      display: "flex", alignItems: "center", justifyContent: "space-between",
                      width: "100%", padding: "7px 16px",
                      background: isActive ? "#eef2ff" : "none",
                      border: "none", cursor: "pointer",
                      color: isActive ? "#6366f1" : "#111827",
                      fontWeight: isActive ? 700 : 400,
                    }}
                  >
                    <span style={{ fontSize: 13, lineHeight: item.value }}>{item.label}</span>
                    <span style={{ fontSize: 11, color: isActive ? "#6366f1" : "#9ca3af", fontWeight: isActive ? 700 : 400 }}>{item.value}</span>
                  </button>
                );
              })}
            </div>
          )}
        </div>
        <Divider />

        {/* Headings - 현재 정렬값을 보존하여 toggleHeading 후 재적용 */}
        {([1,2,3,4,5] as const).map((level, idx) => {
          const HeadingIcons = [Heading1, Heading2, Heading3, Heading4, Heading5];
          const HIcon = HeadingIcons[idx];
          return (
            <ToolBtn
              key={level}
              onClick={() => {
                // 현재 정렬 상태 저장 (paragraph 또는 heading 어느 쪽이든)
                const currentAlign =
                  editor.getAttributes('paragraph').textAlign ||
                  editor.getAttributes('heading').textAlign ||
                  null;
                editor.chain().focus().toggleHeading({ level }).run();
                // 정렬값이 있으면 heading 전환 후 재적용
                if (currentAlign) {
                  editor.chain().focus().setTextAlign(currentAlign).run();
                }
              }}
              active={editor.isActive('heading', { level })}
              title={`제목 ${level} (H${level})`}
            >
              <HIcon size={13} />
            </ToolBtn>
          );
        })}
        <ToolBtn
          onClick={() => {
            const currentAlign =
              editor.getAttributes('paragraph').textAlign ||
              editor.getAttributes('heading').textAlign ||
              null;
            editor.chain().focus().setParagraph().run();
            if (currentAlign) {
              editor.chain().focus().setTextAlign(currentAlign).run();
            }
          }}
          active={editor.isActive('paragraph')}
          title="본문 (P)"
        >
          <Type size={13} />
        </ToolBtn>
        <Divider />

        {/* Text formatting */}
        <ToolBtn onClick={() => editor.chain().focus().toggleBold().run()} active={editor.isActive("bold")} title="굵게 (Ctrl+B)">
          <Bold size={13} />
        </ToolBtn>
        <ToolBtn onClick={() => editor.chain().focus().toggleItalic().run()} active={editor.isActive("italic")} title="기울임 (Ctrl+I)">
          <Italic size={13} />
        </ToolBtn>
        <ToolBtn onClick={() => editor.chain().focus().toggleUnderline().run()} active={editor.isActive("underline")} title="밑줄 (Ctrl+U)">
          <UnderlineIcon size={13} />
        </ToolBtn>
        <ToolBtn onClick={() => editor.chain().focus().toggleStrike().run()} active={editor.isActive("strike")} title="취소선">
          <Strikethrough size={13} />
        </ToolBtn>
        <ToolBtn onClick={() => editor.chain().focus().toggleCode().run()} active={editor.isActive("code")} title="인라인 코드">
          <Code size={13} />
        </ToolBtn>
        {/* 글자색 팔레트 */}
        <div style={{ position: "relative" }}>
          <button
            type="button"
            title="글자 색상"
            onMouseDown={e => { e.preventDefault(); closeAllDialogs(); setShowColorPicker(v => !v); }}
            style={{
              display: "flex", alignItems: "center", gap: 2,
              height: 32, padding: "0 6px", borderRadius: 6,
              background: showColorPicker ? "#6366f1" : "transparent",
              border: showColorPicker ? "1px solid #6366f1" : "1px solid transparent",
              color: showColorPicker ? "#ffffff" : "#374151",
              cursor: "pointer", transition: "all 0.12s", flexShrink: 0,
            }}
            onMouseEnter={e => {
              if (!showColorPicker) {
                (e.currentTarget as HTMLElement).style.background = "#f0f0ff";
                (e.currentTarget as HTMLElement).style.color = "#4f46e5";
              }
            }}
            onMouseLeave={e => {
              (e.currentTarget as HTMLElement).style.background = showColorPicker ? "#6366f1" : "transparent";
              (e.currentTarget as HTMLElement).style.color = showColorPicker ? "#ffffff" : "#374151";
            }}
          >
            {/* 현재 글자색 미리보기 */}
            <span style={{
              display: "inline-block", width: 13, height: 13, borderRadius: 3,
              background: editor.getAttributes("textStyle").color || "#111827",
              border: "1px solid rgba(0,0,0,0.15)", flexShrink: 0,
            }} />
            <Palette size={13} />
            <ChevronDown size={10} />
          </button>
          {showColorPicker && (
            <ColorPalette
              editor={editor}
              type="text"
              onClose={() => setShowColorPicker(false)}
            />
          )}
        </div>
        {/* 형광펜 팔레트 */}
        <div style={{ position: "relative" }}>
          <button
            type="button"
            title="형광펜(배경) 색상"
            onMouseDown={e => { e.preventDefault(); closeAllDialogs(); setShowHighlightPicker(v => !v); }}
            style={{
              display: "flex", alignItems: "center", gap: 2,
              height: 32, padding: "0 6px", borderRadius: 6,
              background: showHighlightPicker ? "#6366f1" : editor.isActive("highlight") ? "rgba(99,102,241,0.15)" : "transparent",
              border: showHighlightPicker ? "1px solid #6366f1" : editor.isActive("highlight") ? "1px solid rgba(99,102,241,0.4)" : "1px solid transparent",
              color: showHighlightPicker ? "#ffffff" : editor.isActive("highlight") ? "#4f46e5" : "#374151",
              cursor: "pointer", transition: "all 0.12s", flexShrink: 0,
            }}
            onMouseEnter={e => {
              if (!showHighlightPicker) {
                (e.currentTarget as HTMLElement).style.background = "#f0f0ff";
                (e.currentTarget as HTMLElement).style.color = "#4f46e5";
              }
            }}
            onMouseLeave={e => {
              (e.currentTarget as HTMLElement).style.background = showHighlightPicker ? "#6366f1" : editor.isActive("highlight") ? "rgba(99,102,241,0.15)" : "transparent";
              (e.currentTarget as HTMLElement).style.color = showHighlightPicker ? "#ffffff" : editor.isActive("highlight") ? "#4f46e5" : "#374151";
            }}
          >
            {/* 현재 형광펜색 미리보기 */}
            <span style={{
              display: "inline-block", width: 13, height: 13, borderRadius: 3,
              background: editor.getAttributes("highlight").color || "#fef08a",
              border: "1px solid rgba(0,0,0,0.15)", flexShrink: 0,
            }} />
            <Highlighter size={13} />
            <ChevronDown size={10} />
          </button>
          {showHighlightPicker && (
            <ColorPalette
              editor={editor}
              type="highlight"
              onClose={() => setShowHighlightPicker(false)}
            />
          )}
        </div>
        <Divider />

        {/* Lists */}
        <ToolBtn onClick={() => editor.chain().focus().toggleBulletList().run()} active={editor.isActive("bulletList")} title="글머리 목록">
          <List size={13} />
        </ToolBtn>
        <ToolBtn onClick={() => editor.chain().focus().toggleOrderedList().run()} active={editor.isActive("orderedList")} title="번호 목록">
          <ListOrdered size={13} />
        </ToolBtn>
        <ToolBtn onClick={() => editor.chain().focus().toggleTaskList().run()} active={editor.isActive("taskList")} title="체크리스트">
          <ListChecks size={13} />
        </ToolBtn>
        <Divider />

        {/* Block elements */}
        <ToolBtn onClick={() => editor.chain().focus().toggleBlockquote().run()} active={editor.isActive("blockquote")} title="인용구">
          <Quote size={13} />
        </ToolBtn>
        <ToolBtn onClick={() => editor.chain().focus().toggleCodeBlock().run()} active={editor.isActive("codeBlock")} title="코드 블록">
          <Code2 size={13} />
        </ToolBtn>
        <ToolBtn onClick={() => editor.chain().focus().setHorizontalRule().run()} title="구분선">
          <Minus size={13} />
        </ToolBtn>
        <Divider />

        {/* Text alignment */}
        <ToolBtn onClick={() => editor.chain().focus().setTextAlign("left").run()} active={editor.isActive({ textAlign: "left" })} title="왼쪽 정렬">
          <AlignLeft size={13} />
        </ToolBtn>
        <ToolBtn onClick={() => editor.chain().focus().setTextAlign("center").run()} active={editor.isActive({ textAlign: "center" })} title="가운데 정렬">
          <AlignCenter size={13} />
        </ToolBtn>
        <ToolBtn onClick={() => editor.chain().focus().setTextAlign("right").run()} active={editor.isActive({ textAlign: "right" })} title="오른쪽 정렬">
          <AlignRight size={13} />
        </ToolBtn>
        <ToolBtn onClick={() => editor.chain().focus().setTextAlign("justify").run()} active={editor.isActive({ textAlign: "justify" })} title="양쪽 정렬">
          <AlignJustify size={13} />
        </ToolBtn>
        <Divider />

        {/* Table */}
        <ToolBtn
          onClick={() => { closeAllDialogs(); setShowTableDialog(v => !v); }}
          active={showTableDialog}
          title="표 삽입 (행/열 선택)"
        >
          <TableIcon size={13} />
        </ToolBtn>
        {showTableDialog && (
          <TableInsertDialog editor={editor} onClose={() => setShowTableDialog(false)} />
        )}
        <Divider />

        {/* Insert: Link, Image, File */}
        <div style={{ position: "relative" }}>
          <ToolBtn
            onClick={() => { closeAllDialogs(); setShowLinkDialog(v => !v); }}
            active={showLinkDialog || editor.isActive("link")}
            title="링크 삽입"
          >
            <LinkIcon size={13} />
          </ToolBtn>
          {showLinkDialog && (
            <LinkDialog editor={editor} onClose={() => setShowLinkDialog(false)} />
          )}
        </div>
        <div style={{ position: "relative" }}>
          <ToolBtn
            onClick={() => { closeAllDialogs(); setShowImageDialog(v => !v); }}
            active={showImageDialog}
            title="이미지 삽입"
          >
            <ImageIcon size={13} />
          </ToolBtn>
          {showImageDialog && (
            <ImageDialog
              editor={editor}
              onClose={() => setShowImageDialog(false)}
              onUploadStart={() => setImageUploadingRef(true)}
              onUploadEnd={() => setImageUploadingRef(false)}
            />
          )}
        </div>
        <div style={{ position: "relative" }}>
          <ToolBtn
            onClick={() => { closeAllDialogs(); setShowFileDialog(v => !v); }}
            active={showFileDialog}
            title="파일 첨부"
          >
            <Paperclip size={13} />
          </ToolBtn>
          {showFileDialog && (
            <FileDialog editor={editor} onClose={() => setShowFileDialog(false)} />
          )}
        </div>
        <div style={{ position: "relative" }}>
          <ToolBtn
            onClick={() => { closeAllDialogs(); setShowVideoDialog(v => !v); }}
            active={showVideoDialog}
            title="영상 삽입 (파일 업로드 또는 YouTube/Vimeo URL)"
          >
            <Video size={13} />
          </ToolBtn>
          {showVideoDialog && (
            <VideoDialog editor={editor} onClose={() => setShowVideoDialog(false)} />
          )}
        </div>

                <div style={{ position: "relative" }}>
          <ToolBtn
            onMouseDown={e => { e.preventDefault(); closeAllDialogs(); setShowStyleDialog(v => !v); }}
            active={showStyleDialog}
            title="스타일 저장/불러오기"
          >
            <BookMarked size={13} />
          </ToolBtn>
          {showStyleDialog && (
            <StyleDialog editor={editor} onClose={() => setShowStyleDialog(false)} />
          )}
        </div>
        {/* Spacer */}
        <div style={{ flex: 1 }} />
        {/* 목차 자동 삽입 버튼 */}
        <ToolBtn
          onClick={() => { closeAllDialogs(); insertToc(); }}
          title="목차 자동 삽입 (h2/h3 소제목에서 목차 생성 또는 보완)"
        >
          <BookOpen size={13} />
        </ToolBtn>
        <Divider />

        {/* HTML Source toggle */}
        <ToolBtn
          onClick={() => {
            if (!htmlSourceMode) {
              // 텍스트 → HTML: 현재 에디터 HTML을 소스창에 표시
              setHtmlSourceValue(editor.getHTML());
              setHtmlSourceMode(true);
              setPreviewMode(false);
            } else {
              // HTML → 텍스트: 소스창 HTML을 에디터에 반영
              editor.commands.setContent(htmlSourceValue);
              onChange(htmlSourceValue);
              setHtmlSourceMode(false);
            }
          }}
          active={htmlSourceMode}
          title={htmlSourceMode ? "텍스트 편집으로 전환 (HTML 적용)" : "HTML 소스 보기/편집"}
        >
          <Code2 size={13} />
        </ToolBtn>
        <Divider />

        {/* Preview toggle */}
        <ToolBtn
          onClick={() => {
            setPreviewMode(v => !v);
            if (htmlSourceMode) setHtmlSourceMode(false);
          }}
          active={previewMode}
          title={previewMode ? "편집 모드" : "미리보기"}
        >
          {previewMode ? <EyeOff size={13} /> : <Eye size={13} />}
        </ToolBtn>
      </div>

      {/* 표 편집 패널: 커서가 표 안에 있을 때만 표시 (tableCell/tableHeader/table 모두 감지) */}
      {!previewMode && !htmlSourceMode &&
        (editor.isActive('tableCell') || editor.isActive('tableHeader') || editor.isActive('table')) && (
        <TableEditPanel editor={editor} />
      )}
      {/* Editor / Preview */}
      {previewMode ? (
        <div
          className="rich-preview"
          dangerouslySetInnerHTML={{ __html: editor.getHTML() }}
          style={{
            minHeight,
            background: "#f9fafb",
            border: "1px solid #e5e7eb",
            borderRadius: "0 0 8px 8px",
            padding: "16px",
            color: "#111827",
            fontSize: 14,
            lineHeight: 1.8,
            fontFamily: "'Noto Sans KR', sans-serif",
          }}
        />
      ) : htmlSourceMode ? (
        <div style={{ border: "1px solid #e5e7eb", borderRadius: "0 0 8px 8px", background: "#1e1e2e", position: "relative" }}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "6px 12px", borderBottom: "1px solid #2d2d3f", background: "#16162a" }}>
            <span style={{ fontSize: 11, color: "#a78bfa", fontWeight: 600, fontFamily: "monospace" }}>HTML 소스</span>
            <div style={{ display: "flex", gap: 6 }}>
              <button
                type="button"
                onClick={() => {
                  // 에디터 현재 HTML을 소스창에 동기화 (에디터에서 수정한 내용을 가져오기)
                  setHtmlSourceValue(editor.getHTML());
                }}
                style={{ padding: "3px 10px", borderRadius: 4, border: "1px solid #4c4c6f", fontSize: 11, cursor: "pointer", background: "#2d2d4f", color: "#c4b5fd", fontWeight: 600 }}
              >
                에디터에서 가져오기
              </button>
              <button
                type="button"
                onClick={() => {
                  // HTML 소스를 에디터에 적용하고 텍스트 모드로 전환
                  editor.commands.setContent(htmlSourceValue);
                  onChange(htmlSourceValue);
                  setHtmlSourceMode(false);
                }}
                style={{ padding: "3px 10px", borderRadius: 4, border: "1px solid #6d28d9", fontSize: 11, cursor: "pointer", background: "#6d28d9", color: "#fff", fontWeight: 600 }}
              >
                텍스트 편집에 적용
              </button>
            </div>
          </div>
          <textarea
            value={htmlSourceValue}
            onChange={e => setHtmlSourceValue(e.target.value)}
            spellCheck={false}
            style={{
              width: "100%",
              minHeight: Math.max(minHeight, 300),
              padding: "14px 16px",
              background: "transparent",
              color: "#e2e8f0",
              fontFamily: "'Fira Code', 'Consolas', 'Monaco', monospace",
              fontSize: 13,
              lineHeight: 1.6,
              border: "none",
              outline: "none",
              resize: "vertical",
              boxSizing: "border-box",
              display: "block",
            }}
          />
        </div>
      ) : (
        <div
          style={{
            background: "#f9fafb",
            border: "1px solid #e5e7eb",
            borderRadius: "0 0 8px 8px",
            overflow: "hidden",
            cursor: "text",
            position: "relative",
          }}
          onClick={(e) => {
            editor.commands.focus();
            // 이미지 클릭 시 alt 폸오버 표시
            const target = e.target as HTMLElement;
            // iframe 클릭 시 삭제 팝오버 (냅킨/임베드 이미지)
            if (target.tagName === 'IFRAME' || target.closest('iframe')) {
              const iframeEl = (target.tagName === 'IFRAME' ? target : target.closest('iframe')) as HTMLIFrameElement;
              const src = iframeEl.getAttribute('src') || '';
              let foundPos = -1;
              editor.state.doc.descendants((node, pos) => {
                if (node.type.name === 'iframe') { foundPos = pos; return false; }
              });
              if (foundPos >= 0) {
                const rect = iframeEl.getBoundingClientRect();
                setIframePopover({ pos: foundPos, src, rect });
                setAltPopover(null);
              }
              return;
            }
            if (target.tagName === 'IMG') {
              const img = target as HTMLImageElement;
              const src = img.getAttribute('src') || '';
              // 에디터에서 해당 img 노드의 pos 찾기
              let foundPos = -1;
              editor.state.doc.descendants((node, pos) => {
                if (node.type.name === 'image' && node.attrs.src === src) {
                  foundPos = pos;
                  return false;
                }
              });
              if (foundPos >= 0) {
                const rect = img.getBoundingClientRect();
                const currentAlt = img.getAttribute('alt') || '';
                // 현재 이미지 width 읽기 (노드 attrs 우선, 없으면 인라인 스타일)
                let currentWidth = '80%';
                editor.state.doc.descendants((node) => {
                  if (node.type.name === 'image' && node.attrs.src === src) {
                    currentWidth = node.attrs.width || '80%';
                    return false;
                  }
                });
                let currentAlign = 'center';
                editor.state.doc.descendants((node) => {
                  if (node.type.name === 'image' && node.attrs.src === src) {
                    currentAlign = node.attrs['data-align'] || 'center';
                    return false;
                  }
                });
                setAltPopover({ src, pos: foundPos, currentAlt, currentWidth, currentAlign, rect });
                setAltEditValue(currentAlt);
                setImgWidthValue(currentWidth);
                setImgAlignValue(currentAlign);
              }
            } else {
              setAltPopover(null);
            }
          }}
        >
          {/* ─── 블록 삽입 FloatingMenu: 빈 단락에 커서가 있을 때 좌측에 + 버튼 표시 ─── */}
          <FloatingMenu
            editor={editor}
            options={{
              placement: 'left',
              offset: { mainAxis: 8 },
            }}
          >
            <div style={{ position: 'relative' }}>
              <button
                type="button"
                title="블록 삽입 (+)"
                onClick={(e) => {
                  const rect = (e.currentTarget as HTMLButtonElement).getBoundingClientRect();
                  setBlockInsertPanelPos({ x: rect.right + 8, y: rect.top });
                  setShowBlockInsertPanel(v => !v);
                }}
                style={{
                  width: 26, height: 26, borderRadius: '50%',
                  background: showBlockInsertPanel ? '#4f46e5' : '#6366f1',
                  border: showBlockInsertPanel ? '2px solid #a5b4fc' : '2px solid #fff',
                  color: '#fff', cursor: 'pointer',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  boxShadow: showBlockInsertPanel
                    ? '0 0 0 3px rgba(99,102,241,0.4)'
                    : '0 2px 8px rgba(99,102,241,0.5)',
                  padding: 0, transition: 'all 0.15s',
                }}
              >
                <Plus size={14} />
              </button>

              {/* 삽입 패널 */}
              {showBlockInsertPanel && createPortal(
                <div
                  style={{
                    position: 'fixed',
                    top: Math.min(blockInsertPanelPos.y, window.innerHeight - 520),
                    left: Math.min(blockInsertPanelPos.x, window.innerWidth - 220),
                    background: '#1e1b4b',
                    border: '2px solid #6366f1',
                    borderRadius: 12,
                    padding: '10px 8px 12px',
                    display: 'flex',
                    flexDirection: 'column',
                    gap: 3,
                    zIndex: 99999,
                    boxShadow: '0 8px 32px rgba(15,23,42,0.6)',
                    minWidth: 200,
                    maxHeight: '80vh',
                    overflowY: 'auto',
                  }}
                  onClick={e => e.stopPropagation()}
                >
                  {/* 헤더 */}
                  <div style={{
                    display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                    marginBottom: 6, paddingBottom: 6,
                    borderBottom: '1px solid rgba(99,102,241,0.3)',
                  }}>
                    <span style={{ fontSize: 11, fontWeight: 700, color: '#a5b4fc' }}>블록 삽입</span>
                    <button
                      type="button"
                      onClick={() => setShowBlockInsertPanel(false)}
                      style={{
                        background: 'rgba(220,38,38,0.2)', border: '1px solid rgba(220,38,38,0.4)',
                        borderRadius: 4, color: '#fca5a5', fontSize: 10, fontWeight: 700,
                        cursor: 'pointer', padding: '2px 6px',
                        display: 'flex', alignItems: 'center', gap: 3,
                      }}
                    >
                      <XIcon size={9} /> 닫기
                    </button>
                  </div>

                  {/* 삽입 버튼 목록 */}
                  {([
                    { label: '텍스트 단락', icon: <Type size={13} />, action: () => { editor.chain().focus().setParagraph().run(); } },
                    { label: '제목 1 (H1)', icon: <Heading1 size={13} />, action: () => { editor.chain().focus().setHeading({ level: 1 }).run(); } },
                    { label: '제목 2 (H2)', icon: <Heading2 size={13} />, action: () => { editor.chain().focus().setHeading({ level: 2 }).run(); } },
                    { label: '제목 3 (H3)', icon: <Heading3 size={13} />, action: () => { editor.chain().focus().setHeading({ level: 3 }).run(); } },
                    { label: '제목 4 (H4)', icon: <Heading4 size={13} />, action: () => { editor.chain().focus().setHeading({ level: 4 }).run(); } },
                    { label: '구분선', icon: <Minus size={13} />, action: () => { editor.chain().focus().setHorizontalRule().run(); } },
                    { label: '인용구', icon: <Quote size={13} />, action: () => { editor.chain().focus().setBlockquote().run(); } },
                    { label: '코드 블록', icon: <Code2 size={13} />, action: () => { editor.chain().focus().setCodeBlock().run(); } },
                    { label: '글머리 목록', icon: <List size={13} />, action: () => { editor.chain().focus().toggleBulletList().run(); } },
                    { label: '번호 목록', icon: <ListOrdered size={13} />, action: () => { editor.chain().focus().toggleOrderedList().run(); } },
                    { label: '체크리스트', icon: <ListChecks size={13} />, action: () => { editor.chain().focus().toggleTaskList().run(); } },
                    { label: '이미지 삽입', icon: <ImageIcon size={13} />, action: () => { setShowBlockInsertPanel(false); setShowImageDialog(true); } },
                    { label: '표 삽입', icon: <TableIcon size={13} />, action: () => { setShowBlockInsertPanel(false); setShowTableDialog(true); } },
                    { label: '빈 줄 추가', icon: <AlignHorizontalJustifyCenter size={13} />, action: () => {
                      editor.chain().focus()
                        .insertContent('<p></p>')
                        .run();
                    }},
                  ] as { label: string; icon: React.ReactNode; action: () => void }[]).map(({ label, icon, action }) => (
                    <button
                      key={label}
                      type="button"
                      onClick={() => { action(); setShowBlockInsertPanel(false); }}
                      style={{
                        display: 'flex', alignItems: 'center', gap: 8,
                        padding: '6px 10px', borderRadius: 6, border: 'none',
                        background: 'transparent', color: '#e0e7ff',
                        fontSize: 12, fontWeight: 500, cursor: 'pointer',
                        textAlign: 'left', transition: 'background 0.1s',
                      }}
                      onMouseEnter={e => { (e.currentTarget as HTMLButtonElement).style.background = 'rgba(99,102,241,0.25)'; }}
                      onMouseLeave={e => { (e.currentTarget as HTMLButtonElement).style.background = 'transparent'; }}
                    >
                      <span style={{ color: '#a5b4fc', flexShrink: 0 }}>{icon}</span>
                      {label}
                    </button>
                  ))}
                </div>,
                document.body
              )}
            </div>
          </FloatingMenu>

          <EditorContent editor={editor} />

          {/* 이미지 업로드 중 로딩 오버레이 */}
          {imageUploading && (
            <div
              style={{
                position: "absolute",
                inset: 0,
                background: "rgba(249, 250, 251, 0.85)",
                display: "flex",
                flexDirection: "column",
                alignItems: "center",
                justifyContent: "center",
                gap: 10,
                zIndex: 10,
                borderRadius: "0 0 8px 8px",
                backdropFilter: "blur(2px)",
              }}
            >
              <div
                style={{
                  width: 36,
                  height: 36,
                  border: "3px solid #e5e7eb",
                  borderTop: "3px solid #6366f1",
                  borderRadius: "50%",
                  animation: "rich-editor-spin 0.8s linear infinite",
                }}
              />
              <span
                style={{
                  fontSize: 13,
                  fontWeight: 600,
                  color: "#4f46e5",
                  letterSpacing: "-0.01em",
                }}
              >
                이미지 업로드 중...
              </span>
            </div>
          )}
        </div>
      )}

      {/* 이미지 alt 텍스트 팝오버 */}
      {altPopover && createPortal(
          <div
          style={{
            position: 'fixed',
            top: popupTop,
            left: popupLeft,
            width: POPUP_WIDTH,
            background: '#fff',
            border: '1px solid #e5e7eb',
            borderRadius: 10,
            boxShadow: '0 8px 24px rgba(0,0,0,0.12)',
            padding: '12px 14px',
            zIndex: 10000,
            fontFamily: "'Noto Sans KR', sans-serif",
            maxHeight: 'calc(100vh - 24px)',
            overflowY: 'auto',
          }}
          onClick={e => e.stopPropagation()}
        >
          {/* ──────────────────────────────────────────────────────────────────── 헤더 */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 10 }}>
            <Pencil size={13} style={{ color: '#6366f1', flexShrink: 0 }} />
            <span style={{ fontSize: 12, fontWeight: 700, color: '#374151' }}>이미지 편집</span>
            <button
              onClick={() => setAltPopover(null)}
              style={{ marginLeft: 'auto', background: 'none', border: 'none', cursor: 'pointer', color: '#9ca3af', padding: 2 }}
            >
              <XIcon size={13} />
            </button>
          </div>

          {/* ──────────────────────────────────────────────────────────────────── alt 텍스트 섹션 (상단 배치) */}
          <div style={{ marginBottom: 10 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 5, marginBottom: 5 }}>
              <Sparkles size={12} style={{ color: '#6366f1', flexShrink: 0 }} />
              <span style={{ fontSize: 11, fontWeight: 700, color: '#374151' }}>alt 텍스트
                <span style={{ fontSize: 10, color: '#9ca3af', fontWeight: 400, marginLeft: 4 }}>(SEO 및 접근성)</span>
              </span>
              {/* AI 생성 중 배지 */}
              {altGeneratingUrls.has(altPopover!.src) && (
                <span style={{
                  display: 'flex', alignItems: 'center', gap: 3,
                  marginLeft: 'auto', fontSize: 10, color: '#6366f1',
                  background: '#eef2ff', borderRadius: 4, padding: '2px 6px',
                }}>
                  <Loader2 size={10} style={{ animation: 'spin 1s linear infinite' }} />
                  AI 생성 중…
                </span>
              )}
            </div>
            <div style={{ display: 'flex', gap: 6 }}>
              <input
                type="text"
                autoFocus
                value={altEditValue}
                onChange={e => setAltEditValue(e.target.value)}
                placeholder={altGeneratingUrls.has(altPopover!.src) ? 'AI가 alt 텍스트를 생성 중입니다…' : '이미지 설명 텍스트…'}
                disabled={altGeneratingUrls.has(altPopover!.src)}
                style={{
                  flex: 1, fontSize: 12, padding: '6px 10px',
                  border: !altEditValue && !altGeneratingUrls.has(altPopover!.src)
                    ? '1.5px solid #f59e0b'
                    : '1px solid #d1d5db',
                  borderRadius: 6, outline: 'none', color: '#111827',
                  background: altGeneratingUrls.has(altPopover!.src) ? '#f9fafb' : '#fff',
                }}
                onKeyDown={e => {
                  if (e.key === 'Enter') {
                    const { state, dispatch } = editor.view;
                    state.doc.descendants((node, pos) => {
                      if (node.type.name === 'image' && node.attrs.src === altPopover!.src) {
                        dispatch(state.tr.setNodeMarkup(pos, undefined, { ...node.attrs, alt: altEditValue }));
                        return false;
                      }
                    });
                    setAltPopover(null);
                    toast.success('alt 텍스트가 저장되었습니다.');
                  }
                }}
              />
              {/* AI 재생성 버튼 */}
              <button
                type="button"
                onClick={async () => {
                  setAltGenerating(true);
                  try {
                    const result = await generateAltMutation.mutateAsync({
                      imageUrl: altPopover!.src,
                      context: contextRef.current,
                    });
                    setAltEditValue(result.alt);
                    toast.success('AI alt 텍스트가 재생성되었습니다.');
                  } catch {
                    toast.error('AI alt 생성에 실패했습니다.');
                  } finally {
                    setAltGenerating(false);
                  }
                }}
                disabled={altGenerating || altGeneratingUrls.has(altPopover!.src)}
                title="AI로 alt 재생성"
                style={{
                  background: (altGenerating || altGeneratingUrls.has(altPopover!.src)) ? '#f3f4f6' : '#eef2ff',
                  border: '1px solid #c7d2fe', borderRadius: 6,
                  padding: '6px 8px', cursor: (altGenerating || altGeneratingUrls.has(altPopover!.src)) ? 'not-allowed' : 'pointer',
                  display: 'flex', alignItems: 'center',
                }}
              >
                {(altGenerating || altGeneratingUrls.has(altPopover!.src))
                  ? <Loader2 size={13} style={{ color: '#6366f1', animation: 'spin 1s linear infinite' }} />
                  : <Wand2 size={13} style={{ color: '#6366f1' }} />
                }
              </button>
              {/* 저장 버튼 */}
              <button
                type="button"
                onClick={() => {
                  const { state, dispatch } = editor.view;
                  state.doc.descendants((node, pos) => {
                    if (node.type.name === 'image' && node.attrs.src === altPopover!.src) {
                      dispatch(state.tr.setNodeMarkup(pos, undefined, { ...node.attrs, alt: altEditValue }));
                      return false;
                    }
                  });
                  setAltPopover(null);
                  toast.success('alt 텍스트가 저장되었습니다.');
                }}
                title="저장"
                style={{
                  background: '#6366f1', border: 'none', borderRadius: 6,
                  padding: '6px 8px', cursor: 'pointer',
                  display: 'flex', alignItems: 'center',
                }}
              >
                <Check size={13} style={{ color: '#fff' }} />
              </button>
            </div>
            {/* alt 비어있을 때 경고 */}
            {!altEditValue && !altGeneratingUrls.has(altPopover!.src) && (
              <div style={{ display: 'flex', alignItems: 'center', gap: 4, marginTop: 5 }}>
                <AlertCircle size={11} style={{ color: '#f59e0b', flexShrink: 0 }} />
                <span style={{ fontSize: 10, color: '#f59e0b' }}>
                  alt 텍스트가 비어 있으면 SEO와 접근성에 불리합니다.
                </span>
              </div>
            )}
            {altEditValue && (
              <p style={{ fontSize: 11, color: '#6b7280', marginTop: 5, lineHeight: 1.4 }}>
                미리보기: <em>{altEditValue}</em>
              </p>
            )}
          </div>

          {/* ────────────────────────────────────────────────────────────────────이미지 크기 조절 */}
          {/* ── 이미지 크기 조절 ── */}
          <div style={{ marginBottom: 10 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 5, marginBottom: 5 }}>
              <Maximize2 size={12} style={{ color: '#6366f1', flexShrink: 0 }} />
              <span style={{ fontSize: 11, fontWeight: 700, color: '#374151' }}>이미지 크기</span>
            </div>
            <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
              {['10%', '20%', '30%', '40%', '50%', '70%', '80%', '100%'].map(preset => (
                <button
                  key={preset}
                  type="button"
                  onClick={() => {
                    const { state, dispatch } = editor.view;
                    state.doc.descendants((node, pos) => {
                      if (node.type.name === 'image' && node.attrs.src === altPopover.src) {
                        dispatch(state.tr.setNodeMarkup(pos, undefined, { ...node.attrs, width: preset }));
                        return false;
                      }
                    });
                    setImgWidthValue(preset);
                    toast.success(`이미지 크기가 ${preset}로 설정되었습니다.`);
                  }}
                  style={{
                    fontSize: 11, padding: '3px 8px', borderRadius: 5, cursor: 'pointer',
                    background: imgWidthValue === preset ? '#6366f1' : '#f3f4f6',
                    color: imgWidthValue === preset ? '#fff' : '#374151',
                    border: imgWidthValue === preset ? '1px solid #6366f1' : '1px solid #e5e7eb',
                    fontWeight: imgWidthValue === preset ? 700 : 400,
                  }}
                >
                  {preset}
                </button>
              ))}
              <div style={{ display: 'flex', alignItems: 'center', gap: 3 }}>
                <input
                  type="text"
                  value={imgWidthValue}
                  onChange={e => setImgWidthValue(e.target.value)}
                  placeholder="직접 입력 (예: 60%)"
                  style={{
                    fontSize: 11, padding: '3px 6px', borderRadius: 5, width: 90,
                    border: '1px solid #d1d5db', outline: 'none', color: '#111827',
                  }}
                  onKeyDown={e => {
                    if (e.key === 'Enter') {
                      const val = imgWidthValue.trim();
                      if (!val) return;
                      const { state, dispatch } = editor.view;
                      state.doc.descendants((node, pos) => {
                        if (node.type.name === 'image' && node.attrs.src === altPopover.src) {
                          dispatch(state.tr.setNodeMarkup(pos, undefined, { ...node.attrs, width: val }));
                          return false;
                        }
                      });
                      toast.success(`이미지 크기가 ${val}로 설정되었습니다.`);
                    }
                  }}
                />
                <button
                  type="button"
                  onClick={() => {
                    const val = imgWidthValue.trim();
                    if (!val) return;
                    const { state, dispatch } = editor.view;
                    state.doc.descendants((node, pos) => {
                      if (node.type.name === 'image' && node.attrs.src === altPopover.src) {
                        dispatch(state.tr.setNodeMarkup(pos, undefined, { ...node.attrs, width: val }));
                        return false;
                      }
                    });
                    toast.success(`이미지 크기가 ${val}로 설정되었습니다.`);
                  }}
                  style={{
                    background: '#6366f1', border: 'none', borderRadius: 5,
                    padding: '3px 7px', cursor: 'pointer', color: '#fff', fontSize: 11,
                  }}
                >
                  적용
                </button>
              </div>
            </div>
          </div>
          {/* ── 이미지 정렬 ── */}
          <div style={{ marginBottom: 10 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 5, marginBottom: 5 }}>
              <span style={{ fontSize: 14, color: '#6366f1', flexShrink: 0 }}>⇔</span>
              <span style={{ fontSize: 11, fontWeight: 700, color: '#374151' }}>이미지 정렬</span>
            </div>
            <div style={{ display: 'flex', gap: 4 }}>
              {[{ value: 'left', label: '◀ 좌측' }, { value: 'center', label: '☰ 중앙' }, { value: 'right', label: '▶ 우측' }].map(opt => (
                <button
                  key={opt.value}
                  type="button"
                  onClick={() => {
                    const { state, dispatch } = editor.view;
                    state.doc.descendants((node, pos) => {
                      if (node.type.name === 'image' && node.attrs.src === altPopover.src) {
                        dispatch(state.tr.setNodeMarkup(pos, undefined, { ...node.attrs, 'data-align': opt.value }));
                        return false;
                      }
                    });
                    setImgAlignValue(opt.value);
                    toast.success(`이미지가 ${opt.label.replace(/[◀☰▶] /, '')} 정렬되었습니다.`);
                  }}
                  style={{
                    fontSize: 11, padding: '3px 10px', borderRadius: 5, cursor: 'pointer',
                    background: imgAlignValue === opt.value ? '#6366f1' : '#f3f4f6',
                    color: imgAlignValue === opt.value ? '#fff' : '#374151',
                    border: imgAlignValue === opt.value ? '1px solid #6366f1' : '1px solid #e5e7eb',
                    fontWeight: imgAlignValue === opt.value ? 700 : 400,
                  }}
                >
                  {opt.label}
                </button>
              ))}
            </div>
          </div>
          {/* 이미지 삭제 버튼 */}
          <div style={{ borderTop: '1px solid #f3f4f6', paddingTop: 8, marginTop: 2 }}>
            <button
              type="button"
              onClick={() => {
                if (!window.confirm('이미지를 본문에서 제거하시겠습니까?')) return;
                const { state, dispatch } = editor.view;
                state.doc.descendants((node, pos) => {
                  if (node.type.name === 'image' && node.attrs.src === altPopover!.src) {
                    dispatch(state.tr.delete(pos, pos + node.nodeSize));
                    return false;
                  }
                });
                setAltPopover(null);
                toast.success('이미지가 제거되었습니다.');
              }}
              style={{
                width: '100%', fontSize: 11, padding: '5px 0',
                background: 'none', border: '1px solid #fca5a5',
                borderRadius: 5, cursor: 'pointer', color: '#ef4444',
              }}
            >
              이미지 제거
            </button>
          </div>
        </div>,
        document.body
      )}

      {/* iframe 삭제 팝오버 (냅킨/유튜브/외부 임베드) */}
      {iframePopover && createPortal(
        <div
          style={{
            position: 'fixed',
            top: Math.max(8, iframePopover.rect.top - 60),
            left: Math.min(Math.max(8, iframePopover.rect.left), window.innerWidth - 260),
            zIndex: 10001,
            background: '#fff',
            border: '1px solid #fca5a5',
            borderRadius: 10,
            boxShadow: '0 4px 20px rgba(0,0,0,0.15)',
            padding: '10px 14px',
            minWidth: 240,
          }}
          onMouseDown={e => e.stopPropagation()}
        >
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
            <span style={{ fontSize: 12, fontWeight: 700, color: '#374151' }}>임베드 블록</span>
            <button
              type="button"
              onClick={() => setIframePopover(null)}
              style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#9ca3af', padding: 2 }}
            >✕</button>
          </div>
          <div style={{ fontSize: 11, color: '#6b7280', marginBottom: 8, wordBreak: 'break-all', maxWidth: 220, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            {iframePopover.src || '(URL 없음)'}
          </div>
          <button
            type="button"
            onClick={() => {
              if (!window.confirm('이 임베드 블록을 본문에서 제거하시겠습니까?')) return;
              const { state, dispatch } = editor.view;
              let deleted = false;
              state.doc.descendants((node, pos) => {
                if (!deleted && node.type.name === 'iframe') {
                  dispatch(state.tr.delete(pos, pos + node.nodeSize));
                  deleted = true;
                  return false;
                }
              });
              setIframePopover(null);
              if (deleted) toast.success('임베드 블록이 제거되었습니다.');
            }}
            style={{
              width: '100%', fontSize: 12, padding: '6px 0',
              background: '#fef2f2', border: '1px solid #fca5a5',
              borderRadius: 6, cursor: 'pointer', color: '#ef4444', fontWeight: 700,
            }}
          >
            🗑 임베드 제거
          </button>
        </div>,
        document.body
      )}

      {/* Close dialogs on outside click - 다이얼로그 뒤 반투명 오버레이 (portal로 body에 직접 렌더링) */}
      {(showLinkDialog || showImageDialog || showFileDialog) && createPortal(
        <div
          style={{ position: "fixed", inset: 0, zIndex: 10000, background: "rgba(0,0,0,0.3)" }}
          onClick={() => {
            // ImageDialog와 FileDialog는 오버레이 클릭으로 닫히지 않음
            // (내부 input[type=file] 클릭 이벤트 보호 - 브라우저 보안 정책)
            if (showLinkDialog) closeAllDialogs();
          }}
          onMouseDown={e => e.stopPropagation()}
        />,
        document.body
      )}

      <style>{`
        /* 기본 줄간격: 인라인 style이 없는 요소에만 적용 */
        .rich-editor-content { line-height: 1.8; }
        /* 인라인 style[line-height]이 있는 요소는 CSS를 모두 해제하여 인라인 값이 직접 적용되도록 함 */
        /* unset: CSS 상속/초기값 모두 제거 → 인라인 style만 남음 */
        .rich-editor-content p[style*="line-height"],
        .rich-editor-content h1[style*="line-height"],
        .rich-editor-content h2[style*="line-height"],
        .rich-editor-content h3[style*="line-height"],
        .rich-editor-content h4[style*="line-height"],
        .rich-editor-content h5[style*="line-height"],
        .rich-editor-content td[style*="line-height"],
        .rich-editor-content th[style*="line-height"] { line-height: unset; }
        .rich-editor-content h1 { font-size: 2.2em !important; font-weight: 900; color: #111827; margin: 1em 0 0.5em; }
        .rich-editor-content h2 { font-size: 1.75em !important; font-weight: 800; color: #1f2937; margin: 0.9em 0 0.4em; }
        .rich-editor-content h3 { font-size: 1.4em !important; font-weight: 700; color: #374151; margin: 0.8em 0 0.3em; }
        .rich-editor-content h4 { font-size: 1.15em !important; font-weight: 700; color: #374151; margin: 0.8em 0 0.3em; }
        .rich-editor-content h5 { font-size: 1.0em !important; font-weight: 700; color: #374151; margin: 0.7em 0 0.2em; }
        .rich-editor-content p { margin: 0.5em 0; }
        .rich-editor-content p:empty { min-height: 1.2em; display: block; }
        .rich-editor-content p:has(> br:only-child) { min-height: 1.2em; }
        .rich-editor-content strong { color: inherit; font-weight: 800; }
        .rich-editor-content em { color: inherit; font-style: italic; }
        .rich-editor-content u { text-decoration: underline; text-underline-offset: 3px; }
        .rich-editor-content s { text-decoration: line-through; color: inherit; }
        .rich-editor-content code { background: #f3f4f6; color: #4f46e5; padding: 2px 6px; border-radius: 4px; font-size: 0.88em; font-family: 'Fira Code', monospace; }
        .rich-editor-content pre { background: #f8fafc; border: 1px solid #e5e7eb; border-radius: 8px; padding: 14px 16px; overflow-x: auto; margin: 1em 0; }
        .rich-editor-content pre code { background: none; color: #4f46e5; padding: 0; font-size: 0.85em; }
        .rich-editor-content blockquote { border-left: 3px solid #6366f1; padding-left: 14px; margin: 1em 0; color: #6b7280; font-style: italic; }
        .rich-editor-content ul { padding-left: 1.5em; margin: 0.5em 0; list-style: disc; }
        .rich-editor-content ol { padding-left: 1.5em; margin: 0.5em 0; list-style: decimal; }
        .rich-editor-content li { margin: 0.2em 0; }
        .rich-editor-content ul[data-type="taskList"] { list-style: none; padding-left: 0.5em; }
        .rich-editor-content ul[data-type="taskList"] li { display: flex; align-items: flex-start; gap: 8px; }
        .rich-editor-content ul[data-type="taskList"] li label { margin-top: 2px; }
        .rich-editor-content ul[data-type="taskList"] li input[type="checkbox"] { accent-color: #6366f1; width: 14px; height: 14px; cursor: pointer; }
        .rich-editor-content a { color: #6366f1; text-decoration: underline; text-underline-offset: 3px; }
        .rich-editor-content a:hover { color: #4f46e5; }
        .rich-editor-content img { max-width: 100%; border-radius: 8px; margin: 0.5em 0; display: block; }
        .rich-editor-content img[data-align="left"] { margin-left: 0; margin-right: auto; }
        .rich-editor-content img[data-align="center"] { margin-left: auto; margin-right: auto; }
        .rich-editor-content img[data-align="right"] { margin-left: auto; margin-right: 0; }
        .rich-editor-content hr { border: none; border-top: 1px solid #e5e7eb; margin: 1.5em 0; }
        /* mark: 기본 형광펜 — color 고정하지 않아 인라인 스타일 보존 */
        .rich-editor-content mark { background: rgba(253,224,71,0.35); padding: 1px 3px; border-radius: 3px; }
        /* mark[data-color]: TipTap Highlight 확장 — 인라인 background-color 그대로 표시 */
        .rich-editor-content mark[data-color] { padding: 1px 3px; border-radius: 3px; }
        .rich-editor-content table { border-collapse: collapse; width: 100%; margin: 1em 0; }
        .rich-editor-content td, .rich-editor-content th { border: 1px solid #e5e7eb; padding: 8px 12px; text-align: left; }
        .rich-editor-content th { background: #f3f4f6; font-weight: 700; color: #4f46e5; }
        .rich-editor-content tr:nth-child(even) td { background: rgba(243,244,246,0.7); }
        .rich-editor-content .ProseMirror-focused { outline: none; }
        .rich-editor-content .ProseMirror p.is-editor-empty:first-child::before { content: attr(data-placeholder); color: #9ca3af; pointer-events: none; float: left; height: 0; }
        .rich-preview h1 { font-size: 1.8em; font-weight: 900; color: #111827; margin: 1em 0 0.5em; }
        .rich-preview h2 { font-size: 1.4em; font-weight: 800; color: #1f2937; margin: 0.9em 0 0.4em; }
        .rich-preview h3 { font-size: 1.15em; font-weight: 700; color: #374151; margin: 0.8em 0 0.3em; }
        .rich-preview p { margin: 0.5em 0; }
        .rich-preview strong { color: inherit; font-weight: 800; }
        .rich-preview em { color: inherit; }
        .rich-preview code { background: #1e1e35; color: #a5b4fc; padding: 2px 6px; border-radius: 4px; font-size: 0.88em; }
        .rich-preview pre { background: #0d0d1a; border: 1px solid #2a2a45; border-radius: 8px; padding: 14px 16px; overflow-x: auto; margin: 1em 0; }
        .rich-preview blockquote { border-left: 3px solid #6366f1; padding-left: 14px; margin: 1em 0; color: #9ca3af; font-style: italic; }
        .rich-preview ul { padding-left: 1.5em; margin: 0.5em 0; list-style: disc; }
        .rich-preview ol { padding-left: 1.5em; margin: 0.5em 0; list-style: decimal; }
        .rich-preview a { color: #818cf8; text-decoration: underline; }
        .rich-preview img { max-width: 100%; border-radius: 8px; margin: 0.5em 0; display: block; }
        .rich-preview hr { border: none; border-top: 1px solid #2a2a45; margin: 1.5em 0; }
        /* mark: 기본 형광펜 — color 고정하지 않아 인라인 스타일 보존 */
        .rich-preview mark { background: rgba(254,240,138,0.25); padding: 1px 3px; border-radius: 3px; }
        /* mark[data-color]: TipTap Highlight 확장 — 인라인 background-color 그대로 표시 */
        .rich-preview mark[data-color] { padding: 1px 3px; border-radius: 3px; }
        .rich-preview table { border-collapse: collapse; width: 100%; margin: 1em 0; }
        .rich-preview td, .rich-preview th { border: 1px solid #2a2a45; padding: 8px 12px; }
        .rich-preview th { background: #1e1e35; font-weight: 700; color: #a5b4fc; }
        @keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }
        @keyframes rich-editor-spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }
      `}</style>
    </div>
  );
}
