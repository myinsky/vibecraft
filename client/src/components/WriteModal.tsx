import { useState, useEffect } from "react";
import { X, PenSquare } from "lucide-react";
import { trpc } from "@/lib/trpc";
import { useAuth } from "@/_core/hooks/useAuth";
import { getLoginUrl } from "@/const";
import { toast } from "sonner";
import RichEditor from "./RichEditor";

const CATEGORIES = [
  { value: "ai-apps", label: "AI 앱 만들기", color: "#7c3aed" },
  { value: "ai-tools", label: "AI 툴 추천", color: "#e11d48" },
  { value: "my-apps", label: "사용해보기", color: "#10b981" },
  { value: "resources", label: "자료실", color: "#0ea5e9" },
];

interface WriteModalProps {
  isOpen: boolean;
  onClose: () => void;
  defaultCategory?: string;
  onSuccess?: () => void;
}

export default function WriteModal({ isOpen, onClose, defaultCategory, onSuccess }: WriteModalProps) {
  const { isAuthenticated } = useAuth();
  const createPost = trpc.posts.create.useMutation({
    onSuccess: () => {
      toast.success("게시물이 성공적으로 등록되었습니다!");
      onClose();
      onSuccess?.();
    },
    onError: (err) => {
      toast.error("게시물 등록 실패: " + err.message);
    },
  });

  const [title, setTitle] = useState("");
  const [category, setCategory] = useState(defaultCategory || "ai-apps");
  const [content, setContent] = useState("");
  const [thumbnail, setThumbnail] = useState("");
  const [excerpt, setExcerpt] = useState("");

  useEffect(() => {
    if (isOpen) {
      setCategory(defaultCategory || "ai-apps");
      setTitle("");
      setContent("");
      setThumbnail("");
      setExcerpt("");
    }
  }, [isOpen, defaultCategory]);

  if (!isOpen) return null;

  const handleBackdrop = (e: React.MouseEvent<HTMLDivElement>) => {
    if (e.target === e.currentTarget) onClose();
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!isAuthenticated) {
      window.location.href = getLoginUrl(window.location.pathname);
      return;
    }
    if (!title.trim()) { toast.error("제목을 입력해주세요."); return; }
    const plainText = content.replace(/<[^>]+>/g, "").trim();
    if (!plainText) { toast.error("본문 내용을 입력해주세요."); return; }
    createPost.mutate({
      title: title.trim(),
      content,
      excerpt: excerpt.trim() || undefined,
      thumbnail: thumbnail.trim() || undefined,
      category: category as "ai-apps" | "ai-tools" | "my-apps" | "resources",
    });
  };

  const selectedCat = CATEGORIES.find(c => c.value === category);

  return (
    <div
      onClick={handleBackdrop}
      style={{
        position: "fixed", inset: 0, zIndex: 1000,
        background: "rgba(0,0,0,0.82)",
        backdropFilter: "blur(6px)",
        display: "flex", alignItems: "center", justifyContent: "center",
        padding: "16px",
        animation: "fadeIn 0.18s ease",
      }}
    >
      <div style={{
        background: "#ffffff",
        border: "1px solid #2a2a45",
        borderRadius: 16,
        width: "100%",
        maxWidth: 960,
        maxHeight: "95vh",
        display: "flex",
        flexDirection: "column",
        boxShadow: "0 24px 80px rgba(0,0,0,0.8), 0 0 0 1px rgba(99,102,241,0.12)",
        overflow: "hidden",
        animation: "slideUp 0.22s ease",
      }}>

        {/* Header */}
        <div style={{
          padding: "16px 22px 14px",
          borderBottom: "1px solid #1e2040",
          display: "flex", alignItems: "center", justifyContent: "space-between",
          flexShrink: 0,
        }}>
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <div style={{
              width: 32, height: 32,
              background: "linear-gradient(135deg, #6366f1, #8b5cf6)",
              borderRadius: 8,
              display: "flex", alignItems: "center", justifyContent: "center",
              boxShadow: "0 0 10px rgba(99,102,241,0.4)",
            }}>
              <PenSquare size={15} color="#fff" />
            </div>
            <div>
              <div style={{ fontSize: 15, fontWeight: 800, color: "#111827" }}>새 글 작성</div>
              <div style={{ fontSize: 10, color: "#6b7280" }}>Smart Auto Guide · 리치 에디터</div>
            </div>
          </div>
          <button
            onClick={onClose}
            style={{
              background: "none", border: "none", cursor: "pointer",
              color: "#6b7280", padding: 6, borderRadius: 6,
              display: "flex", alignItems: "center",
            }}
            onMouseEnter={e => { (e.currentTarget as HTMLElement).style.background = "#e5e7eb"; (e.currentTarget as HTMLElement).style.color = "#111827"; }}
            onMouseLeave={e => { (e.currentTarget as HTMLElement).style.background = ""; (e.currentTarget as HTMLElement).style.color = "#6b7280"; }}
          >
            <X size={18} />
          </button>
        </div>

        {/* Form */}
        <form onSubmit={handleSubmit} style={{ flex: 1, overflowY: "auto", padding: "18px 22px 20px", display: "flex", flexDirection: "column", gap: 14 }}>

          {/* Category selector */}
          <div>
            <label style={{ fontSize: 11, fontWeight: 700, color: "#6b7280", display: "block", marginBottom: 8, textTransform: "uppercase", letterSpacing: "0.5px" }}>
              카테고리
            </label>
            <div style={{ display: "flex", gap: 7, flexWrap: "wrap" }}>
              {CATEGORIES.map(cat => (
                <button
                  key={cat.value}
                  type="button"
                  onClick={() => setCategory(cat.value)}
                  style={{
                    padding: "5px 13px",
                    borderRadius: 20,
                    border: `1.5px solid ${category === cat.value ? cat.color : "#e5e7eb"}`,
                    background: category === cat.value ? cat.color + "22" : "transparent",
                    color: category === cat.value ? cat.color : "#6b7280",
                    fontSize: 12, fontWeight: 700,
                    cursor: "pointer",
                    transition: "all 0.15s",
                  }}
                >
                  {cat.label}
                </button>
              ))}
            </div>
            {selectedCat && (
              <div style={{ marginTop: 6, display: "flex", alignItems: "center", gap: 6 }}>
                <span style={{ width: 7, height: 7, borderRadius: "50%", background: selectedCat.color, display: "inline-block" }} />
                <span style={{ fontSize: 11, color: "#6b7280" }}>
                  선택: <span style={{ color: selectedCat.color, fontWeight: 700 }}>{selectedCat.label}</span>
                </span>
              </div>
            )}
          </div>

          {/* Title */}
          <div>
            <label style={{ fontSize: 11, fontWeight: 700, color: "#6b7280", display: "block", marginBottom: 6, textTransform: "uppercase", letterSpacing: "0.5px" }}>
              제목 <span style={{ color: "#e11d48" }}>*</span>
            </label>
            <input
              type="text"
              required
              value={title}
              onChange={e => setTitle(e.target.value)}
              placeholder="글 제목을 입력하세요"
              maxLength={200}
              style={{
                width: "100%", padding: "10px 14px",
                background: "#ffffff", border: "1px solid #2a2a45",
                borderRadius: 8, fontSize: 15, fontWeight: 700, color: "#111827",
                outline: "none", boxSizing: "border-box",
                transition: "border-color 0.15s",
              }}
              onFocus={e => (e.target as HTMLElement).style.borderColor = "#6366f1"}
              onBlur={e => (e.target as HTMLElement).style.borderColor = "#e5e7eb"}
            />
            <div style={{ textAlign: "right", fontSize: 10, color: "#6b7280", marginTop: 3 }}>{title.length}/200</div>
          </div>

          {/* Excerpt */}
          <div>
            <label style={{ fontSize: 11, fontWeight: 700, color: "#6b7280", display: "block", marginBottom: 6, textTransform: "uppercase", letterSpacing: "0.5px" }}>
              요약 <span style={{ color: "#6b7280", fontWeight: 400, textTransform: "none" }}>(선택 · 목록에 표시)</span>
            </label>
            <input
              type="text"
              value={excerpt}
              onChange={e => setExcerpt(e.target.value)}
              placeholder="글 요약을 입력하세요 (비워두면 자동 생성)"
              maxLength={300}
              style={{
                width: "100%", padding: "9px 14px",
                background: "#ffffff", border: "1px solid #2a2a45",
                borderRadius: 8, fontSize: 13, color: "#111827",
                outline: "none", boxSizing: "border-box",
                transition: "border-color 0.15s",
              }}
              onFocus={e => (e.target as HTMLElement).style.borderColor = "#6366f1"}
              onBlur={e => (e.target as HTMLElement).style.borderColor = "#e5e7eb"}
            />
          </div>

          {/* Thumbnail URL */}
          <div>
            <label style={{ fontSize: 11, fontWeight: 700, color: "#6b7280", display: "block", marginBottom: 6, textTransform: "uppercase", letterSpacing: "0.5px" }}>
              썸네일 이미지 URL <span style={{ color: "#6b7280", fontWeight: 400, textTransform: "none" }}>(선택)</span>
            </label>
            <input
              type="url"
              value={thumbnail}
              onChange={e => setThumbnail(e.target.value)}
              placeholder="https://example.com/image.jpg"
              style={{
                width: "100%", padding: "9px 14px",
                background: "#ffffff", border: "1px solid #2a2a45",
                borderRadius: 8, fontSize: 13, color: "#111827",
                outline: "none", boxSizing: "border-box",
                transition: "border-color 0.15s",
              }}
              onFocus={e => (e.target as HTMLElement).style.borderColor = "#6366f1"}
              onBlur={e => (e.target as HTMLElement).style.borderColor = "#e5e7eb"}
            />
            {thumbnail && (
              <div style={{ marginTop: 6, borderRadius: 8, overflow: "hidden", height: 70 }}>
                <img loading="lazy" src={thumbnail} alt="썸네일 미리보기" style={{ width: "100%", height: "100%", objectFit: "cover" }} onError={e => (e.currentTarget.style.display = "none")} />
              </div>
            )}
          </div>

          {/* Rich Editor */}
          <div>
            <label style={{ fontSize: 11, fontWeight: 700, color: "#6b7280", display: "block", marginBottom: 6, textTransform: "uppercase", letterSpacing: "0.5px" }}>
              본문 내용 <span style={{ color: "#e11d48" }}>*</span>
            </label>
            <RichEditor
              content={content}
              onChange={setContent}
              placeholder="본문 내용을 입력하세요. 툴바에서 서식, 링크, 이미지, 파일 첨부 등을 사용할 수 있습니다."
              minHeight={320}
            />
            <div style={{ textAlign: "right", fontSize: 10, color: "#6b7280", marginTop: 3 }}>
              {content.replace(/<[^>]+>/g, "").length}자 (HTML 포함)
            </div>
          </div>

          {/* Actions */}
          <div style={{ display: "flex", gap: 10, paddingTop: 4 }}>
            <button
              type="button"
              onClick={onClose}
              style={{
                flex: 1, padding: "11px",
                background: "#e5e7eb", border: "1px solid #2a2a45",
                borderRadius: 9, fontSize: 13, fontWeight: 700, color: "#6b7280",
                cursor: "pointer",
              }}
            >취소</button>
            <button
              type="submit"
              disabled={createPost.isPending}
              style={{
                flex: 2, padding: "11px",
                background: createPost.isPending ? "#e5e7eb" : "linear-gradient(135deg, #6366f1, #8b5cf6)",
                border: "none", borderRadius: 9,
                fontSize: 13, fontWeight: 700, color: createPost.isPending ? "#6b7280" : "#fff",
                cursor: createPost.isPending ? "not-allowed" : "pointer",
                boxShadow: createPost.isPending ? "none" : "0 4px 14px rgba(99,102,241,0.4)",
                display: "flex", alignItems: "center", justifyContent: "center", gap: 7,
                transition: "all 0.15s",
              }}
            >
              <PenSquare size={14} />
              {createPost.isPending ? "게시 중..." : "게시하기"}
            </button>
          </div>

          {!isAuthenticated && (
            <div style={{
              background: "rgba(99,102,241,0.06)", border: "1px solid rgba(99,102,241,0.15)",
              borderRadius: 8, padding: "10px 14px",
              fontSize: 11, color: "#6b7280", lineHeight: 1.6,
            }}>
              🔐 로그인 후 실제 게시물을 저장할 수 있습니다.{" "}
              <a href={getLoginUrl(window.location.pathname)} style={{ color: "#6366f1", textDecoration: "underline" }}>로그인하기</a>
            </div>
          )}
        </form>
      </div>

      <style>{`
        @keyframes fadeIn { from { opacity: 0; } to { opacity: 1; } }
        @keyframes slideUp { from { opacity: 0; transform: translateY(20px) scale(0.97); } to { opacity: 1; transform: translateY(0) scale(1); } }
      `}</style>
    </div>
  );
}
