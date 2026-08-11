import { useLocation } from "wouter";
import { getPostUrl } from "@/lib/postUrl";
import { trpc } from "@/lib/trpc";
import { useSEO } from "@/hooks/useSEO";
import { insertUnifiedAds, calcDynamicMaxAds, makeCoupangCardHtml, CoupangProduct, CoupangCardStyle, CoupangCardSize } from "@/lib/unifiedAdInsert";
import { insertAffiliateLinks, parseAffiliateConfig } from "@/lib/affiliateInsert";
import { useVisitTracker } from "@/hooks/useVisitTracker";
import { useJsonLd } from "@/hooks/useJsonLd";
import Header from "../components/Header";
import Footer from "../components/Footer";
import Sidebar from "../components/Sidebar";
import { useState, useMemo, useRef, useEffect, lazy, Suspense } from "react";
import {
  Eye, Heart, Clock, ArrowLeft, Loader2, Share2, Bookmark, ChevronRight,
  Pencil, Trash2, AlertTriangle, MessageSquare, Bot, Send, LogIn,
  Maximize2, X as XIcon, Check,
} from "lucide-react";

import { useAuth } from "@/_core/hooks/useAuth";
import { useSiteConfig } from "@/contexts/SiteConfigContext";

// 카카오 SDK 타입 선언은 ShareButtons.tsx에서 관리됩니다
import SeoPreview from "../components/SeoPreview";
import PostDetailSkeleton from "../components/PostDetailSkeleton";
import TableOfContents from "../components/TableOfContents";
import ShareButtons from "../components/ShareButtons";
import RelatedPosts from "../components/RelatedPosts";
import { Search as SearchIcon, ChevronDown as ChevronDownIcon } from "lucide-react";
import { toast } from "sonner";
// streamdown(+shiki+mermaid)은 AI 댓글에서만 사용 — 지연 로드로 초기 번들 최소화
const LazyStreamdown = lazy(() => import("streamdown").then(m => ({ default: m.Streamdown })));
import { getLoginUrl } from "../const";
import { makeSrcSet, THUMBNAIL_SIZES } from "@/lib/imageUtils";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";

// 색상 팔레트 (navItems 인덱스 순환)
const COLOR_PALETTE = ["#7c3aed", "#e11d48", "#10b981", "#0ea5e9", "#f59e0b", "#6366f1", "#ec4899"];

// ===== Blob URL 기반 HTML 앱 iframe 컴포넌트 =====
// srcdoc + sandbox 방식은 localStorage/fetch/IndexedDB 등을 차단하므로
// Blob URL 방식으로 독립 origin을 부여하여 모든 JS API가 정상 동작하도록 함
function BlobIframe({ html, title }: { html: string; title?: string }) {
  const [blobUrl, setBlobUrl] = useState<string | null>(null);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const iframeRef = useRef<HTMLIFrameElement>(null);

  useEffect(() => {
    // /manus-storage/... 경로 이미지를 절대 URL로 변환 (blob URL 기준 해석 방지)
    // 상대 경로(/manus-storage/...)와 이미 절대 URL인 경우 모두 처리
    const origin = window.location.origin;
    let processedHtml = html
      // data-original-src 속성 제거 (저장 시 남아있을 수 있음)
      .replace(/\s*data-original-src=(["'])[^"']*?\1/gi, '')
      // src="/manus-storage/..." → src="https://origin/manus-storage/..."
      .replace(/src=(["'])(\/manus-storage\/)/gi, `src=$1${origin}/manus-storage/`)
      // href="/manus-storage/..." → href="https://origin/manus-storage/..."
      .replace(/href=(["'])(\/manus-storage\/)/gi, `href=$1${origin}/manus-storage/`)
      // CSS url(/manus-storage/...) → url(https://origin/manus-storage/...)
      .replace(/url\((["']?)(\/manus-storage\/)/gi, `url($1${origin}/manus-storage/`);

    const isFullDoc = /^\s*(<!DOCTYPE|<html)/i.test(processedHtml.trim());
    if (!isFullDoc) {
      processedHtml = `<!DOCTYPE html><html><head><meta charset="utf-8"><style>html,body{margin:0;padding:0;background:#fff}body{padding:8px;font-family:'Noto Sans KR',sans-serif;font-size:16px;line-height:1.8;color:#374151;background:#fff}img{max-width:100%;height:auto;display:block}img[width][height]{aspect-ratio:attr(width)/attr(height);height:auto}</style></head><body>${processedHtml}</body></html>`;
    } else {
      // 전체 HTML 문서에도 배경색이 없으면 흰 배경 강제 주입 (검은 화면 방지)
      if (!/<body[^>]*style=[^>]*background/i.test(processedHtml) && !/<html[^>]*style=[^>]*background/i.test(processedHtml)) {
        processedHtml = processedHtml.replace(/<body([^>]*)>/i, '<body$1 style="background:#fff">');
      }
    }

    // /api/download/ 링크에 download 속성 자동 추가 (iframe이 이동하지 않도록)
    processedHtml = processedHtml.replace(
      /<a([^>]*href=["'][^"']*\/api\/download\/[^"']*["'][^>]*)>/gi,
      (match, attrs) => {
        if (/\bdownload\b/i.test(attrs)) return match; // 이미 있으면 스킵
        return `<a${attrs} download>`;
      }
    );

    // ── 목차 링크 자동 복구 (BlobIframe 전용) ──────────────────────────────────
    // h2/h3 id 추출 후, toc 관련 클래스의 <li>에 앵커 링크가 없으면 자동 추가
    try {
      const parser = new DOMParser();
      const doc = parser.parseFromString(processedHtml, 'text/html');

      // 1) h2/h3 id 맵 구성
      const headingMap: { id: string; text: string }[] = [];
      doc.querySelectorAll('h2[id], h3[id]').forEach(h => {
        const text = h.textContent?.replace(/<[^>]+>/g, '').trim() || '';
        if (text && text !== '목차') headingMap.push({ id: h.id, text });
      });

      if (headingMap.length >= 1) {
        // 2) toc 관련 클래스를 가진 컨테이너 내 li 처리
        const removeEmoji = (s: string) => s.replace(/[\uD800-\uDFFF]|[\u2600-\u27FF]|[\uFE00-\uFEFF]/g, '').replace(/^[0-9\s.]+/, '').trim();
        const tocContainers = doc.querySelectorAll('[class*="toc"]');
        tocContainers.forEach(container => {
          container.querySelectorAll('li').forEach(li => {
            // 이미 앵커 링크가 있으면 유효성 검증
            const existingA = li.querySelector('a') as HTMLAnchorElement | null;
            if (existingA) {
              const existingHref = existingA.getAttribute('href') || '';
              if (existingHref.startsWith('#')) {
                const existingId = existingHref.slice(1);
                const isValid = headingMap.some(h => h.id === existingId || h.id === decodeURIComponent(existingId));
                if (!isValid) {
                  // 링크 텍스트로 재매칭
                  const liText = removeEmoji(li.textContent?.trim() || '').toLowerCase();
                  const matched = headingMap.find(h =>
                    removeEmoji(h.text).toLowerCase().includes(liText) ||
                    liText.includes(removeEmoji(h.text).toLowerCase().slice(0, 8))
                  );
                  if (matched) existingA.setAttribute('href', `#${matched.id}`);
                }
              }
              return;
            }
            // 앵커 없는 경우: 텍스트로 소제목 매칭 후 링크 추가
            const liText = li.textContent?.trim() || '';
            if (!liText) return;
            const liClean = removeEmoji(liText).toLowerCase();
            const matched = headingMap.find(h =>
              h.text === liText ||
              removeEmoji(h.text).toLowerCase() === liClean ||
              removeEmoji(h.text).toLowerCase().includes(liClean) ||
              liClean.includes(removeEmoji(h.text).toLowerCase().slice(0, 8))
            );
            if (matched) {
              const a = doc.createElement('a');
              a.href = `#${matched.id}`;
              a.style.cssText = 'color:inherit;text-decoration:none;display:block;';
              a.innerHTML = li.innerHTML;
              li.innerHTML = '';
              li.appendChild(a);
            }
          });
        });
        // 직렬화
        const serialized = doc.documentElement.outerHTML;
        if (serialized && serialized.length > 100) {
          processedHtml = '<!DOCTYPE html>' + serialized;
        }
      }
    } catch { /* 파싱 실패 시 원본 유지 */ }
    // ─────────────────────────────────────────────────────────────────────────

    const blob = new Blob([processedHtml], { type: "text/html; charset=utf-8" });
    const url = URL.createObjectURL(blob);
    setBlobUrl(url);
    return () => URL.revokeObjectURL(url);
  }, [html]);

  // ESC 키로 전체화면 닫기
  useEffect(() => {
    if (!isFullscreen) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") setIsFullscreen(false);
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [isFullscreen]);

  // 전체화면 시 body 스크롤 잠금
  useEffect(() => {
    document.body.style.overflow = isFullscreen ? "hidden" : "";
    return () => { document.body.style.overflow = ""; };
  }, [isFullscreen]);

  const handleLoad = (iframe: HTMLIFrameElement) => {
    try {
      const doc = iframe.contentDocument || iframe.contentWindow?.document;
      if (doc?.body) {
        const setHeight = () => {
          const h = doc.documentElement.scrollHeight || doc.body?.scrollHeight || 600;
          if (h > 100) iframe.style.height = h + "px";
        };
        setHeight();
        const ro = new ResizeObserver(setHeight);
        ro.observe(doc.body);
        iframe.addEventListener("pagehide", () => ro.disconnect(), { once: true });

        // iframe 내부 앵커 클릭 처리 - 목차 링크 클릭 시 iframe 내부에서 스크롤, 외부 링크 새 창 열기
        doc.addEventListener("click", (e: MouseEvent) => {
          const target = e.target as HTMLElement;
          const anchor = target.closest("a") as HTMLAnchorElement | null;
          if (!anchor) return;
          const href = anchor.getAttribute("href") || "";
          // #으로 시작하는 앵커 링크: iframe 내부 스크롤
          if (href.startsWith("#")) {
            e.preventDefault();
            e.stopPropagation();
            const id = href.slice(1);
            let el = doc.getElementById(id);
            if (!el) {
              try { el = doc.getElementById(decodeURIComponent(id)); } catch {}
            }
            if (el) {
              el.scrollIntoView({ behavior: "smooth", block: "start" });
              setTimeout(setHeight, 300);
            }
            return;
          }
          // /api/download/ 경로: 부모 창에서 다운로드 처리 (iframe이 이동하지 않도록)
          if (href.startsWith("/api/download/") || href.includes("/api/download/")) {
            e.preventDefault();
            e.stopPropagation();
            const a = window.document.createElement("a");
            a.href = href;
            a.download = "";
            window.document.body.appendChild(a);
            a.click();
            window.document.body.removeChild(a);
            return;
          }
          // 외부 링크(http/https): 새 창으로 열기
          if (href.startsWith("http://") || href.startsWith("https://")) {
            e.preventDefault();
            e.stopPropagation();
            window.open(href, "_blank", "noopener,noreferrer");
            return;
          }
        });
      }
    } catch { /* cross-origin 무시 */ }
  };

  if (!blobUrl) {
    return (
      <div style={{ width: "100%", minHeight: 400, display: "flex", alignItems: "center", justifyContent: "center", background: "#f8fafc", borderRadius: 8 }}>
        <span style={{ color: "#94a3b8", fontSize: 14 }}>🔄 앱 로딩 중...</span>
      </div>
    );
  }

  return (
    <>
      {/* 인라인 iframe 영역 */}
      <div style={{ position: "relative" }}>
        {/* 전체화면 버튼 (우상단 오버레이) */}
        <button
          onClick={() => setIsFullscreen(true)}
          title="전체화면으로 보기"
          style={{
            position: "absolute", top: 10, right: 10, zIndex: 10,
            background: "rgba(0,0,0,0.55)", border: "none", borderRadius: 6,
            color: "#fff", cursor: "pointer", padding: "6px 10px",
            display: "flex", alignItems: "center", gap: 5, fontSize: 12,
            backdropFilter: "blur(4px)",
          }}
        >
          <Maximize2 size={14} />
          전체화면
        </button>
        <iframe
          ref={iframeRef}
          src={blobUrl}
          style={{ width: "100%", border: "none", minHeight: 600, display: "block", overflow: "hidden" }}
          onLoad={(e) => handleLoad(e.currentTarget)}
          title={title || "HTML 앱"}
          scrolling="no"
        />
      </div>

      {/* 전체화면 오버레이 모달 */}
      {isFullscreen && (
        <div
          style={{
            position: "fixed", inset: 0, zIndex: 9999,
            background: "#000",
            display: "flex", flexDirection: "column",
          }}
        >
          {/* 상단 툴바 */}
          <div style={{
            height: 44, background: "#111827",
            display: "flex", alignItems: "center", justifyContent: "space-between",
            padding: "0 16px", flexShrink: 0,
          }}>
            <span style={{ color: "#9ca3af", fontSize: 13 }}>
              {title || "HTML 앱"} — 전체화면 모드
            </span>
            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <span style={{ color: "#6b7280", fontSize: 11 }}>ESC로 닫기</span>
              <button
                onClick={() => setIsFullscreen(false)}
                title="전체화면 닫기"
                style={{
                  background: "#374151", border: "none", borderRadius: 6,
                  color: "#e5e7eb", cursor: "pointer", padding: "5px 10px",
                  display: "flex", alignItems: "center", gap: 4, fontSize: 12,
                }}
              >
                <XIcon size={14} />
                닫기
              </button>
            </div>
          </div>
          {/* 전체화면 iframe */}
          <iframe
            src={blobUrl}
            style={{ flex: 1, width: "100%", border: "none", display: "block" }}
            title={title || "HTML 앱 전체화면"}
          />
        </div>
      )}
    </>
  );
}

// ===== AI 답변 블록 컴포넌트 (관리자 인라인 편집 지원) =====
function AiReplyBlock({ comment, isAdmin, postId, onUpdated }: {
  comment: any;
  isAdmin: boolean;
  postId: number;
  onUpdated: () => void;
}) {
  const [isEditing, setIsEditing] = useState(false);
  const [editContent, setEditContent] = useState(comment.aiReply || "");
  const [isSaving, setIsSaving] = useState(false);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const updateAiReplyMutation = trpc.comments.updateAiReply.useMutation({
    onSuccess: () => {
      setIsEditing(false);
      onUpdated();
    },
    onError: (err) => alert("저장 실패: " + err.message),
    onSettled: () => setIsSaving(false),
  });

  const handleEdit = () => {
    setEditContent(comment.aiReply || "");
    setIsEditing(true);
    setTimeout(() => textareaRef.current?.focus(), 50);
  };

  const handleSave = () => {
    if (!editContent.trim()) return;
    setIsSaving(true);
    updateAiReplyMutation.mutate({ commentId: comment.id, content: editContent.trim() });
  };

  const handleCancel = () => {
    setIsEditing(false);
    setEditContent(comment.aiReply || "");
  };

  return (
    <div style={{
      padding: "14px 18px",
      background: "rgba(99,102,241,0.04)",
      borderTop: "1px solid rgba(99,102,241,0.1)",
    }}>
      {/* 헤더 */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 8 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
          <div style={{
            display: "flex", alignItems: "center", gap: 5,
            padding: "3px 10px", borderRadius: 20,
            background: "linear-gradient(135deg, #6366f1, #8b5cf6)",
          }}>
            <Bot size={11} color="#fff" />
            <span style={{ fontSize: 11, fontWeight: 700, color: "#fff" }}>AI 답변</span>
          </div>
          {comment.aiRepliedAt && (
            <span style={{ fontSize: 11, color: "#9ca3af" }}>
              {new Date(comment.aiRepliedAt).toLocaleDateString("ko-KR", { month: "short", day: "numeric" })}
            </span>
          )}
        </div>
        {/* 관리자 편집 버튼 */}
        {isAdmin && !isEditing && (
          <button
            onClick={handleEdit}
            title="AI 답변 수정"
            style={{
              display: "flex", alignItems: "center", gap: 4,
              padding: "3px 10px", borderRadius: 6,
              background: "transparent", border: "1px solid rgba(99,102,241,0.3)",
              color: "#6366f1", cursor: "pointer", fontSize: 11, fontWeight: 600,
              transition: "all 0.15s",
            }}
            onMouseEnter={(e) => {
              (e.currentTarget as HTMLElement).style.background = "rgba(99,102,241,0.08)";
            }}
            onMouseLeave={(e) => {
              (e.currentTarget as HTMLElement).style.background = "transparent";
            }}
          >
            <Pencil size={11} />
            수정
          </button>
        )}
        {/* 편집 중 저장/취소 버튼 */}
        {isAdmin && isEditing && (
          <div style={{ display: "flex", gap: 6 }}>
            <button
              onClick={handleSave}
              disabled={isSaving || !editContent.trim()}
              title="저장"
              style={{
                display: "flex", alignItems: "center", gap: 4,
                padding: "3px 10px", borderRadius: 6,
                background: "#6366f1", border: "none",
                color: "#fff", cursor: isSaving ? "not-allowed" : "pointer",
                fontSize: 11, fontWeight: 600, opacity: isSaving ? 0.7 : 1,
              }}
            >
              {isSaving ? <Loader2 size={11} style={{ animation: "spin 1s linear infinite" }} /> : <Check size={11} />}
              저장
            </button>
            <button
              onClick={handleCancel}
              disabled={isSaving}
              title="취소"
              style={{
                display: "flex", alignItems: "center", gap: 4,
                padding: "3px 10px", borderRadius: 6,
                background: "transparent", border: "1px solid #d1d5db",
                color: "#6b7280", cursor: "pointer", fontSize: 11, fontWeight: 600,
              }}
            >
              <XIcon size={11} />
              취소
            </button>
          </div>
        )}
      </div>
      {/* 내용: 편집 모드 vs 읽기 모드 */}
      {isEditing ? (
        <textarea
          ref={textareaRef}
          value={editContent}
          onChange={(e) => setEditContent(e.target.value)}
          rows={6}
          style={{
            width: "100%", boxSizing: "border-box",
            padding: "10px 12px", borderRadius: 8,
            border: "1px solid rgba(99,102,241,0.4)",
            background: "#fff", color: "#1f2937",
            fontSize: 13, lineHeight: 1.7, resize: "vertical",
            outline: "none",
            fontFamily: "inherit",
          }}
        />
      ) : (
        <div style={{ fontSize: 14, color: "#4b5563", lineHeight: 1.7 }}>
          <Suspense fallback={<span style={{ color: '#9ca3af', fontSize: 13 }}>AI 답변 로딩 중...</span>}>
            <LazyStreamdown>{comment.aiReply}</LazyStreamdown>
          </Suspense>
        </div>
      )}
    </div>
  );
}

// ===== 댓글 섹션 컴포넌트 =====
function CommentsSection({ postId, currentUserId, isAuthenticated, isAdmin }: {
  postId: number;
  currentUserId?: string;
  isAuthenticated: boolean;
  isAdmin?: boolean;
}) {
  const utils = trpc.useUtils();
  const [commentText, setCommentText] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [allItems, setAllItems] = useState<any[]>([]);
  const [nextCursor, setNextCursor] = useState<number | null>(null);
  const [isLoadingMore, setIsLoadingMore] = useState(false);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const { data: commentsData, isLoading, refetch } = trpc.comments.list.useQuery(
    { postId, cursor: undefined, limit: 5 },
    { enabled: !!postId, refetchInterval: 10000 }
  );

  // 초기 로드 시 allItems 세팅 (useEffect로 render-time setState 방지)
  useEffect(() => {
    if (commentsData) {
      setAllItems(commentsData.items);
      setNextCursor(commentsData.nextCursor);
    }
  }, [commentsData]);

  // 새 댓글 추가 후 목록 갱신
  const refreshComments = async () => {
    const fresh = await utils.comments.list.fetch({ postId, cursor: undefined, limit: 5 });
    setAllItems(fresh.items);
    setNextCursor(fresh.nextCursor);
  };

  const addCommentMutation = trpc.comments.add.useMutation({
    onSuccess: () => {
      setCommentText("");
      refreshComments();
      if (isAdmin) {
        toast.success("댓글이 등록되었습니다.");
      } else {
        toast.success("댓글이 등록되었습니다. AI 답변이 곧 생성됩니다.");
      }
    },
    onError: (err) => toast.error("댓글 등록 실패: " + err.message),
    onSettled: () => setIsSubmitting(false),
  });

  const deleteCommentMutation = trpc.comments.delete.useMutation({
    onSuccess: () => {
      refreshComments();
      toast.success("댓글이 삭제되었습니다.");
    },
    onError: (err) => toast.error("삭제 실패: " + err.message),
  });

  const handleLoadMore = async () => {
    if (!nextCursor || isLoadingMore) return;
    setIsLoadingMore(true);
    try {
      const more = await utils.comments.list.fetch({ postId, cursor: nextCursor, limit: 5 });
      setAllItems(prev => [...prev, ...more.items]);
      setNextCursor(more.nextCursor);
    } finally {
      setIsLoadingMore(false);
    }
  };

  const handleSubmit = () => {
    const trimmed = commentText.trim();
    if (!trimmed) return;
    if (trimmed.length > 2000) {
      toast.error("댓글은 2000자 이내로 작성해주세요.");
      return;
    }
    setIsSubmitting(true);
    addCommentMutation.mutate({ postId, content: trimmed });
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) {
      e.preventDefault();
      handleSubmit();
    }
  };

  const commentCount = allItems.length;

  return (
    <div style={{
      maxWidth: 1400, margin: "0 auto",
      padding: "0 10px 40px",
    }}>
      <div>
        {/* 댓글 섹션 헤더 */}
        <div style={{
          borderTop: "1px solid #e5e7eb",
          paddingTop: 32,
          marginTop: 4,
        }}>
          <h3 style={{
            fontSize: 16, fontWeight: 800, color: "#111827",
            marginBottom: 24,
            display: "flex", alignItems: "center", gap: 8,
          }}>
            <span style={{
              display: "inline-block", width: 4, height: 18,
              background: "#6366f1", borderRadius: 2,
            }} />
            댓글
            <span style={{
              fontSize: 13, fontWeight: 600, color: "#6366f1",
              background: "rgba(99,102,241,0.1)",
              padding: "2px 8px", borderRadius: 20,
            }}>{commentCount}</span>
          </h3>

          {/* 댓글 작성 폼 */}
          {isAuthenticated ? (
            <div style={{
              background: "#f9fafb",
              border: "1px solid #e5e7eb",
              borderRadius: 12,
              padding: "16px",
              marginBottom: 24,
            }}>
              <textarea
                ref={textareaRef}
                value={commentText}
                onChange={(e) => setCommentText(e.target.value)}
                onKeyDown={handleKeyDown}
                placeholder="댓글을 작성하세요... (Ctrl+Enter로 전송)"
                rows={3}
                style={{
                  width: "100%", border: "1px solid #e5e7eb",
                  borderRadius: 8, padding: "10px 12px",
                  fontSize: 14, color: "#111827",
                  background: "#ffffff", resize: "vertical",
                  outline: "none", fontFamily: "inherit",
                  lineHeight: 1.6, boxSizing: "border-box",
                }}
              />
              <div style={{
                display: "flex", alignItems: "center",
                justifyContent: "space-between", marginTop: 10,
              }}>
                <span style={{ fontSize: 12, color: "#9ca3af" }}>
                  {commentText.length}/2000자
                </span>
                <button
                  onClick={handleSubmit}
                  disabled={isSubmitting || !commentText.trim()}
                  style={{
                    display: "flex", alignItems: "center", gap: 6,
                    padding: "8px 18px", borderRadius: 8,
                    background: isSubmitting || !commentText.trim()
                      ? "#e5e7eb"
                      : "linear-gradient(135deg, #6366f1, #8b5cf6)",
                    border: "none", cursor: isSubmitting || !commentText.trim() ? "not-allowed" : "pointer",
                    fontSize: 13, fontWeight: 700,
                    color: isSubmitting || !commentText.trim() ? "#9ca3af" : "#fff",
                    transition: "all 0.15s",
                  }}
                >
                  {isSubmitting ? (
                    <><Loader2 size={13} style={{ animation: "spin 1s linear infinite" }} /> 등록 중...</>
                  ) : (
                    <><Send size={13} /> 댓글 등록</>
                  )}
                </button>
              </div>
            </div>
          ) : (
            <div style={{
              display: "flex", alignItems: "center", justifyContent: "space-between",
              background: "#f9fafb", border: "1px solid #e5e7eb",
              borderRadius: 12, padding: "14px 18px", marginBottom: 24,
            }}>
              <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                <MessageSquare size={18} color="#6366f1" />
                <span style={{ fontSize: 14, color: "#6b7280" }}>
                  댓글을 작성하려면 로그인이 필요합니다.
                </span>
              </div>
              <a
                href={getLoginUrl(window.location.pathname)}
                style={{
                  display: "flex", alignItems: "center", gap: 6,
                  padding: "8px 18px", borderRadius: 8,
                  background: "linear-gradient(135deg, #6366f1, #8b5cf6)",
                  fontSize: 13, fontWeight: 700, color: "#fff",
                  textDecoration: "none",
                  whiteSpace: "nowrap",
                  boxShadow: "0 4px 12px rgba(99,102,241,0.3)",
                }}
              >
                <LogIn size={13} /> 로그인
              </a>
            </div>
          )}

          {/* 댓글 목록 */}
          {isLoading && allItems.length === 0 ? (
            <div style={{ display: "flex", alignItems: "center", justifyContent: "center", padding: "32px 0", gap: 8, color: "#9ca3af" }}>
              <Loader2 size={18} style={{ animation: "spin 1s linear infinite" }} />
              <span style={{ fontSize: 13 }}>댓글을 불러오는 중...</span>
            </div>
          ) : allItems.length > 0 ? (
            <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
              {allItems.map((comment: any) => (
                <div
                  key={comment.id}
                  style={{
                    background: "#ffffff",
                    border: "1px solid #e5e7eb",
                    borderRadius: 12,
                    overflow: "hidden",
                  }}
                >
                  {/* 댓글 헤더 */}
                  <div style={{
                    padding: "14px 18px 12px",
                    display: "flex", alignItems: "center", justifyContent: "space-between",
                    borderBottom: comment.aiReply ? "1px solid #f3f4f6" : "none",
                  }}>
                    <div style={{ display: "flex", alignItems: "flex-start", gap: 12, flex: 1 }}>
                      {/* 아바타 */}
                      <div style={{
                        width: 36, height: 36, borderRadius: "50%",
                        background: "linear-gradient(135deg, #6366f1, #8b5cf6)",
                        display: "flex", alignItems: "center", justifyContent: "center",
                        flexShrink: 0,
                        fontSize: 14, fontWeight: 800, color: "#fff",
                      }}>
                        {(comment.userName || "?")[0].toUpperCase()}
                      </div>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 6 }}>
                          <span style={{ fontSize: 13, fontWeight: 700, color: "#111827" }}>
                            {comment.userName}
                          </span>
                          <span style={{ fontSize: 12, color: "#9ca3af" }}>
                            {new Date(comment.createdAt).toLocaleDateString("ko-KR", {
                              year: "numeric", month: "short", day: "numeric",
                            })}
                          </span>
                        </div>
                        <p style={{
                          fontSize: 14, color: "#374151",
                          lineHeight: 1.7, margin: 0,
                          whiteSpace: "pre-wrap", wordBreak: "break-word",
                        }}>
                          {comment.content}
                        </p>
                      </div>
                    </div>
                    {/* 삭제 버튼 (본인 댓글 또는 관리자) */}
                    {currentUserId && (comment.userId === currentUserId || isAdmin) && (
                      <button
                        onClick={() => deleteCommentMutation.mutate({ id: comment.id, postId })}
                        disabled={deleteCommentMutation.isPending}
                        title="댓글 삭제"
                        style={{
                          display: "flex", alignItems: "center", justifyContent: "center",
                          width: 28, height: 28, borderRadius: 6,
                          background: "transparent", border: "1px solid transparent",
                          color: "#d1d5db", cursor: "pointer",
                          transition: "all 0.15s",
                          flexShrink: 0, marginLeft: 8,
                        }}
                        onMouseEnter={(e) => {
                          (e.currentTarget as HTMLElement).style.background = "rgba(248,113,113,0.1)";
                          (e.currentTarget as HTMLElement).style.borderColor = "rgba(248,113,113,0.3)";
                          (e.currentTarget as HTMLElement).style.color = "#f87171";
                        }}
                        onMouseLeave={(e) => {
                          (e.currentTarget as HTMLElement).style.background = "transparent";
                          (e.currentTarget as HTMLElement).style.borderColor = "transparent";
                          (e.currentTarget as HTMLElement).style.color = "#d1d5db";
                        }}
                      >
                        <Trash2 size={13} />
                      </button>
                    )}
                  </div>
                  {/* AI 답변 */}
                  {comment.aiReply ? (
                    <AiReplyBlock
                      comment={comment}
                      isAdmin={!!isAdmin}
                      postId={postId}
                      onUpdated={refreshComments}
                    />
                  ) : isAdmin ? null : (
                    <div style={{
                      padding: "10px 18px",
                      background: "rgba(99,102,241,0.02)",
                      borderTop: "1px solid rgba(99,102,241,0.06)",
                      display: "flex", alignItems: "center", gap: 6,
                    }}>
                      <Bot size={12} color="#c4b5fd" />
                      <span style={{ fontSize: 12, color: "#c4b5fd" }}>AI 답변 생성 중...</span>
                    </div>
                  )}
                </div>
              ))}

              {/* 더 보기 버튼 */}
              {nextCursor && (
                <div style={{ textAlign: "center", paddingTop: 8 }}>
                  <button
                    onClick={handleLoadMore}
                    disabled={isLoadingMore}
                    style={{
                      display: "inline-flex", alignItems: "center", gap: 6,
                      padding: "10px 24px", borderRadius: 8,
                      background: "#ffffff",
                      border: "1px solid #e5e7eb",
                      fontSize: 13, fontWeight: 600, color: "#6366f1",
                      cursor: isLoadingMore ? "not-allowed" : "pointer",
                      transition: "all 0.15s",
                      boxShadow: "0 1px 3px rgba(0,0,0,0.05)",
                    }}
                    onMouseEnter={(e) => {
                      if (!isLoadingMore) {
                        (e.currentTarget as HTMLElement).style.background = "rgba(99,102,241,0.05)";
                        (e.currentTarget as HTMLElement).style.borderColor = "#6366f1";
                      }
                    }}
                    onMouseLeave={(e) => {
                      (e.currentTarget as HTMLElement).style.background = "#ffffff";
                      (e.currentTarget as HTMLElement).style.borderColor = "#e5e7eb";
                    }}
                  >
                    {isLoadingMore ? (
                      <><Loader2 size={13} style={{ animation: "spin 1s linear infinite" }} /> 불러오는 중...</>
                    ) : (
                      <>댓글 더 보기</>
                    )}
                  </button>
                </div>
              )}
            </div>
          ) : (
            <div style={{
              textAlign: "center", padding: "40px 20px",
              color: "#9ca3af",
            }}>
              <MessageSquare size={32} style={{ margin: "0 auto 12px", opacity: 0.4 }} />
              <p style={{ fontSize: 15, margin: 0 }}>아직 댓글이 없습니다. 첫 번째 댓글을 남겨보세요!</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function extractCategoryKey(path: string): string {
  const m = path.match(/\/category\/([^/?#]+)/);
  return m ? m[1] : path.replace(/^.*\//, "");
}

// 텍스트에서 앵커 id 슬러그 생성 (컴포넌트 외부 유틸리티)
// ===== 완전한 CSS 스코핑 함수 =====
// 모든 CSS 선택자에 .html-source-content 프리픽스를 추가하여
// 게시물 내부 스타일이 외부 CSS와 충돌하지 않도록 격리
const SCOPE = '.html-source-content';

function scopeCSS(css: string): string {
  let result = '';
  let i = 0;

  while (i < css.length) {
    // @media, @supports 등 at-rule 처리
    if (css[i] === '@') {
      const atEnd = css.indexOf('{', i);
      if (atEnd === -1) { result += css.slice(i); break; }
      const atRule = css.slice(i, atEnd + 1);

      if (/^@(?:media|supports)/.test(atRule.trim())) {
        result += atRule;
        i = atEnd + 1;
        let depth = 1;
        const innerStart = i;
        while (i < css.length && depth > 0) {
          if (css[i] === '{') depth++;
          else if (css[i] === '}') depth--;
          i++;
        }
        const innerCSS = css.slice(innerStart, i - 1);
        result += scopeCSS(innerCSS) + '}';
        continue;
      }

      // 기타 at-rule (@keyframes, @font-face 등)은 그대로
      let depth = 1;
      result += atRule;
      i = atEnd + 1;
      while (i < css.length && depth > 0) {
        if (css[i] === '{') depth++;
        else if (css[i] === '}') depth--;
        result += css[i];
        i++;
      }
      continue;
    }

    // 주석 처리
    if (css.slice(i, i + 2) === '/*') {
      const end = css.indexOf('*/', i);
      if (end === -1) { result += css.slice(i); break; }
      result += css.slice(i, end + 2);
      i = end + 2;
      continue;
    }

    // 공백/줄바꿈
    if (/\s/.test(css[i])) {
      result += css[i];
      i++;
      continue;
    }

    // 선택자 + 블록 파싱
    const blockStart = css.indexOf('{', i);
    if (blockStart === -1) { result += css.slice(i); break; }

    const selectorStr = css.slice(i, blockStart).trim();
    const blockEnd = css.indexOf('}', blockStart);
    if (blockEnd === -1) { result += css.slice(i); break; }

    const declarations = css.slice(blockStart + 1, blockEnd);

    // 선택자를 쉼표로 분리하여 각각 스코핑
    const scopedSelectors = selectorStr.split(',').map(sel => {
      sel = sel.trim();
      if (!sel) return '';

      // body/html 선택자 → .html-source-content 로 치환
      // 단, tbody/thead 등은 치환하지 않음 (lookbehind/lookahead 사용)
      let scoped = sel
        .replace(/(?<![a-zA-Z])html(?![a-zA-Z])/g, SCOPE)
        .replace(/(?<![a-zA-Z])body(?![a-zA-Z])/g, SCOPE);

      // 이미 SCOPE로 시작하면 그대로 (body/html이 SCOPE로 치환된 경우)
      if (scoped.startsWith(SCOPE)) {
        return scoped;
      }

      // 나머지 모든 선택자에 SCOPE 프리픽스 추가
      return `${SCOPE} ${scoped}`;
    }).filter(Boolean).join(', ');

    // body/html 관련 선언에서 오염 속성 제거
    let cleanDecls = declarations;
    if (/(?<![a-zA-Z])(?:body|html)(?![a-zA-Z])/.test(selectorStr)) {
      cleanDecls = declarations
        .replace(/(?<![a-zA-Z-])(?:max-width|min-width|width)\s*:[^;]+;?/gi, '')
        .replace(/\bmargin\s*:\s*(?:0\s+auto|auto\s+0|auto)\s*;?/gi, '')
        .replace(/\bbackground(?:-color)?\s*:[^;]+;?/gi, '')
        .replace(/\bpadding\s*:[^;]+;?/gi, '');
    }

    // .html-source-content 자체 블록에서도 오염 속성 제거 (이중 안전장치)
    if (scopedSelectors.trim() === SCOPE || scopedSelectors.trim().startsWith(SCOPE + ' ') === false && scopedSelectors.trim() === SCOPE) {
      cleanDecls = cleanDecls
        .replace(/(?<![a-zA-Z-])(?:max-width|min-width|width)\s*:[^;]+;?/gi, '')
        .replace(/\bmargin\s*:\s*(?:0\s+auto|auto\s+0|auto)\s*;?/gi, '')
        .replace(/\bbackground(?:-color)?\s*:[^;]+;?/gi, '')
        .replace(/\bpadding\s*:[^;]+;?/gi, '');
    }

    result += `${scopedSelectors} {${cleanDecls}}\n`;
    i = blockEnd + 1;
  }

  return result;
}

function makeSlug(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^\w\uAC00-\uD7A3\u3131-\u314E\u314F-\u3163\s-]/g, "")
    .replace(/\s+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 80);
}

export default function PostDetail({ slug: slugProp }: { slug?: string } = {}) {
  const [location, navigate] = useLocation();
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [showSeoPreview, setShowSeoPreview] = useState(false);
  const { isAuthenticated, user } = useAuth();
  const contentRef = useRef<HTMLDivElement>(null);

  // useParams가 wouter 패치 이슈로 동작하지 않을 수 있으므로 경로에서 직접 파싱
  const postIdMatch = location.match(/^\/post\/(\d+)/);
  const postId = postIdMatch ? parseInt(postIdMatch[1], 10) : 0;

  // 슬러그 기반 조회 (SEO URL: /p/:slug)
  const STALE_5MIN = { staleTime: 5 * 60 * 1000, refetchOnWindowFocus: false } as const;
  const { data: postBySlug, isLoading: slugLoading } = trpc.posts.getBySlug.useQuery(
    { slug: slugProp || "" },
    { enabled: !!slugProp, ...STALE_5MIN }
  );
  const { data: postById, isLoading: idLoading, error } = trpc.posts.get.useQuery(
    { id: postId },
    { enabled: !slugProp && !!postId && !isNaN(postId), ...STALE_5MIN }
  );
  const post = slugProp ? postBySlug : postById;
  const isLoading = slugProp ? slugLoading : idLoading;
  // 게시물 스크롤 깊이 추적 (post.id가 확정된 후에만)
  useVisitTracker({ postId: post?.id });

  // SiteConfigContext에서 공유 데이터 읽기 (중복 API 호출 방지)
  const { siteConfig: siteConfigData, navItemsData } = useSiteConfig();

  // 사이드바 항목 유무 확인 (항목 없으면 사이드바 컨테이너 자체를 숨겨 본문 너비 확보)
  const { data: sidebarItems } = trpc.admin.getSidebarItems.useQuery(
    undefined,
    { staleTime: 10 * 60 * 1000, refetchOnWindowFocus: false }
  );
  const hasLeftSidebar = (sidebarItems || []).some(i => i.side === "left" && i.visible);
  const hasRightSidebar = (sidebarItems || []).some(i => i.side === "right" && i.visible);
  // 쿠팡 파트너스 API 자동 검색 (개발자 장비 키워드 기반)
  const coupangApiEnabled = siteConfigData?.["coupang_enabled"] === "true" && siteConfigData?.["coupang_api_enabled"] === "true";
  // 글별 키워드 오버라이드 (없으면 빈 배열 → 서버에서 카테고리/전역 키워드 사용)
  const postCoupangKeywords = useMemo(() => {
    try {
      const kw = JSON.parse((post as any)?.coupangKeywords ?? "null");
      if (Array.isArray(kw) && kw.length > 0) return kw.slice(0, 3) as string[];
    } catch {}
    return [] as string[];
  }, [post]);
  const maxCoupangPerPost = Number(siteConfigData?.["coupang_max_per_post"] ?? 1);
  const { data: coupangProductsData } = trpc.coupang.getProductsForPost.useQuery(
    { keywords: postCoupangKeywords, categoryKey: post?.category ?? undefined, limit: maxCoupangPerPost },
    { enabled: coupangApiEnabled && !!post }
  );
  const trackCoupangClick = trpc.coupang.trackClick.useMutation();
  // 카테고리별 댓글 설정 (로그인 여부 무관하게 항상 로드)
  const { data: categoryCommentSettings } = trpc.admin.getCategoryCommentSettings.useQuery(
    undefined,
    { staleTime: 10 * 60 * 1000, refetchOnWindowFocus: false }
  );
  const { catLabel, catColor } = useMemo(() => {
    if (!post) return { catLabel: "", catColor: "#6366f1" };
    if (navItemsData && navItemsData.length > 0) {
      const sorted = [...navItemsData].sort((a, b) => (a.sortOrder ?? 0) - (b.sortOrder ?? 0));
      const idx = sorted.findIndex(n => extractCategoryKey(n.path || "") === post.category);
      if (idx >= 0) {
        return {
          catLabel: sorted[idx].label,
          catColor: COLOR_PALETTE[idx % COLOR_PALETTE.length],
        };
      }
    }
    // fallback: 카테고리 키 그대로 표시
    return { catLabel: post.category, catColor: "#6366f1" };
  }, [navItemsData, post]);

  // SEO 메타 태그 동적 적용 (포스트 데이터 기반)
  useSEO({
    title: post ? `${post.title} | 스마트 오토 가이드` : undefined,
    description: post?.excerpt ?? undefined,
    image: post?.thumbnail ?? undefined,
    type: "article",
    preloadImage: !!(post?.thumbnail), // 썸네일 있을 때 LCP 이미지 preload 힌트 추가
  });
  // JSON-LD 구조화 데이터 (BlogPosting 스키마)
  useJsonLd(post ? {
    type: "BlogPosting",
    headline: post.title,
    description: post.excerpt ?? undefined,
    image: post.thumbnail ?? undefined,
    datePublished: new Date(post.createdAt).toISOString(),
    dateModified: new Date(post.updatedAt).toISOString(),
    authorName: post.authorName ?? "스마트 오토 가이드",
    url: window.location.href,
    publisherName: "스마트 오토 가이드",
    keywords: post.tag ? [post.tag] : undefined,
  } : null);

  // 좋아요 상태 조회 (post.id가 확정된 후에만)
  const { data: likeStatusData, refetch: refetchLikeStatus } = trpc.posts.getLikeStatus.useQuery(
    { postId: post?.id ?? 0 },
    { enabled: !!post?.id && isAuthenticated, staleTime: 60 * 1000 }
  );
  const serverIsLiked = likeStatusData?.liked ?? false;

  // 낙관적 업데이트를 위한 로컬 상태 (서버 응답 전 즉시 UI 반영)
  const [localIsLiked, setLocalIsLiked] = useState<boolean | null>(null);
  const [localLikeCount, setLocalLikeCount] = useState<number | null>(null);

  // 서버에서 좋아요 상태가 로드되면 로컬 상태 초기화
  useEffect(() => {
    if (likeStatusData !== undefined) {
      setLocalIsLiked(likeStatusData.liked);
    }
  }, [likeStatusData]);

  // post.likes가 변경되면 로컬 카운트 초기화
  useEffect(() => {
    if (post?.likes !== undefined) {
      setLocalLikeCount(post.likes);
    }
  }, [post?.likes]);

  // 실제 표시에 사용할 값 (로컬 상태 우선)
  const isLiked = localIsLiked ?? serverIsLiked;
  const displayLikeCount = localLikeCount ?? (post?.likes ?? 0);

  const utils = trpc.useUtils();

  const likeMutation = trpc.posts.like.useMutation({
    onMutate: async ({ postId: mutatePostId }) => {
      // 낙관적 업데이트: 서버 응답 전 즉시 UI 반영
      const prevIsLiked = localIsLiked ?? serverIsLiked;
      const prevCount = localLikeCount ?? (post?.likes ?? 0);
      if (prevIsLiked) {
        setLocalIsLiked(false);
        setLocalLikeCount(Math.max(0, prevCount - 1));
      } else {
        setLocalIsLiked(true);
        setLocalLikeCount(prevCount + 1);
      }
      return { prevIsLiked, prevCount };
    },
    onSuccess: (data) => {
      if (data.liked) {
        toast.success("좋아요를 눌렀습니다!");
      } else {
        toast.success("좋아요를 취소했습니다.");
      }
      // 서버 상태와 동기화
      setLocalIsLiked(data.liked);
      refetchLikeStatus();
      // 게시글 쿼리 무효화하여 서버 카운트와 동기화
      if (post?.id) {
        utils.posts.get.invalidate({ id: post.id });
        utils.posts.getBySlug.invalidate();
      }
    },
    onError: (err, _vars, context) => {
      // 에러 시 낙관적 업데이트 롤백
      if (context) {
        setLocalIsLiked(context.prevIsLiked);
        setLocalLikeCount(context.prevCount);
      }
      toast.error(err.message);
    },
  });

  const deleteMutation = trpc.posts.delete.useMutation({
    onSuccess: () => {
      toast.success("게시물이 보관함으로 이동되었습니다.");
      navigate(`/category/${post?.category || "ai-apps"}`);
    },
    onError: (err) => {
      toast.error("삭제 실패: " + err.message);
      setShowDeleteConfirm(false);
    },
  });

  const handleShare = () => {
    if (navigator.share) {
      navigator.share({ title: post?.title, url: window.location.href })
        .catch(() => {});
    } else {
      navigator.clipboard.writeText(window.location.href);
      toast.success("링크가 복사되었습니다.");
    }
  };

  const handleKakaoShare = () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const kakao = (window as any).Kakao;
    if (!kakao) {
      toast.error("카카오 SDK를 불러오지 못했습니다.");
      return;
    }
    if (!kakao.isInitialized()) {
      kakao.init(import.meta.env.VITE_KAKAO_JS_KEY || "");
    }
    const url = window.location.href;
    const title = post?.title || "스마트 오토 가이드";
    const description = post?.excerpt || post?.content?.replace(/<[^>]+>/g, "").slice(0, 100) || "";
    const imageUrl = post?.thumbnail || "";
    kakao.Share.sendDefault({
      objectType: "feed",
      content: {
        title,
        description,
        ...(imageUrl ? { imageUrl } : {}),
        link: { mobileWebUrl: url, webUrl: url },
      },
      buttons: [
        { title: "글 보러가기", link: { mobileWebUrl: url, webUrl: url } },
      ],
    });
  };

  const handleCopyLink = () => {
    navigator.clipboard.writeText(window.location.href)
      .then(() => toast.success("링크가 복사되었습니다!"))
      .catch(() => toast.error("링크 복사에 실패했습니다."));
  };

  const handleLike = () => {
    if (!isAuthenticated) {
      toast.error("좋아요는 로그인 후 이용할 수 있습니다.");
      return;
    }
    // slug로 접근 시 postId가 0일 수 있으므로 post.id를 우선 사용
    const targetPostId = post?.id || postId;
    if (!targetPostId) {
      toast.error("게시글을 찾을 수 없습니다.");
      return;
    }
    likeMutation.mutate({ postId: targetPostId });
  };

  const handleEdit = () => {
    // slug로 접근한 경우 postId가 0일 수 있으므로 post.id를 우선 사용
    const targetId = post?.id || postId;
    if (!targetId) return;
    navigate(`/write/edit/${targetId}`);
  };

  const handleDeleteConfirm = () => {
    // slug로 접근한 경우 postId가 0이므로 post.id를 우선 사용 (handleEdit과 동일)
    const targetId = post?.id || postId;
    if (!targetId) return;
    deleteMutation.mutate({ id: targetId });
  };

  // 유사 글 추천 쿼리 - 조건부 return 이전에 선언 (React Hooks 규칙 준수)
  const { data: similarPosts } = trpc.posts.getSimilar.useQuery(
    { postId, category: post?.category ?? "", limit: 3 },
    { enabled: !!postId && !!post?.category, staleTime: 5 * 60 * 1000, refetchOnWindowFocus: false }
  );
  // 태그 쿼리
  const { data: postTags } = trpc.posts.getTags.useQuery(
    { postId },
    { enabled: !!postId, staleTime: 10 * 60 * 1000, refetchOnWindowFocus: false }
  );
  // 관련글 노출 개수 (사이트 설정에서 읽기, 기본값: 3)
  const relatedPostsCount = siteConfigData?.relatedPostsCount ? Math.min(6, Math.max(2, Number(siteConfigData.relatedPostsCount))) : 3;
  // 관련글 정렬 기준 (관리자 설정, 기본값: similarity)
  const relatedSortBy = (siteConfigData?.relatedPostsSortBy as string | undefined) ?? 'similarity';
  const useSimilarity = relatedSortBy === 'similarity';

  // 키워드 유사도 기반 관련 글 쿼리 (제목+본문 TF 코사인 유사도, 같은 카테고리 보너스)
  // content는 서버에서 처리하므로 앞 10000자만 전달
  // slug 기반 접근 시 postId=0이므로 post.id를 우선 사용
  const resolvedPostId = post?.id || postId;
  const relatedContentInput = useMemo(() => (post?.content ?? '').slice(0, 10000), [post?.content]);
  // mutation으로 변경: GET 본문 전달 시 URL 길이 제한(414) 회피
  const similarityMutation = trpc.posts.getRelatedBySimilarity.useMutation();
  const [relatedBySimilarity, setRelatedBySimilarity] = useState<Array<{id: number; title: string; excerpt: string | null; thumbnail: string | null; category: string | null; tag?: string | null; badge?: string | null; views?: number | null; likes?: number | null; slug?: string | null; createdAt?: Date | string | null; score?: number}> | undefined>(undefined);
  useEffect(() => {
    if (!resolvedPostId || !post || !useSimilarity) return;
    // 초기 렌더링 완료 후 관련글 유사도 계산 (무거운 요청이므로 지연 실행)
    const timer = setTimeout(() => {
      similarityMutation.mutate({
        postId: resolvedPostId,
        category: post.category ?? "",
        title: post.title ?? "",
        content: relatedContentInput,
        excerpt: post.excerpt ?? null,
        limit: relatedPostsCount,
      }, {
        onSuccess: (data) => setRelatedBySimilarity(data),
      });
    }, 800); // 800ms 지연: 본문 렌더링 완료 후 실행
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [resolvedPostId, useSimilarity, relatedPostsCount]);

  // 카테고리 기반 관련 글 쿼리 (latest/views/likes 정렬)
  const { data: relatedByCategory } = trpc.posts.getRelatedByCategory.useQuery(
    {
      postId: resolvedPostId,
      category: post?.category ?? "",
      limit: relatedPostsCount,
      sortBy: (relatedSortBy as 'latest' | 'views' | 'likes') ?? 'latest',
    },
    { enabled: !!resolvedPostId && !!post && !useSimilarity, staleTime: 5 * 60 * 1000, refetchOnWindowFocus: false }
  );

  // 실제 사용할 관련글 데이터
  const relatedByTags = useSimilarity ? relatedBySimilarity : relatedByCategory;

  // 작성자 본인 여부 확인 (user.id와 post.authorId 비교)
  const isAuthor = isAuthenticated && user && post && (user as any).id === post.authorId;

  // 본문 HTML 처리: h2/h3 id 자동 추가 + 목차 링크 자동 복구 + 목차 없으면 자동 생성
  const processedContent = useMemo(() => {
    const content = post?.content ?? "";
    // CSS 코드로 시작하는 content도 isHtmlSource이면 처리 (DIV 삭제 시 style 태그 유실 경우)
    const cssStartPattern = /^\s*(:root|\*\s*\{|body\s*\{|html\s*\{|@media|@keyframes|\.[a-zA-Z_-]|#[a-zA-Z_-])/;
    if (!content.trim().startsWith("<") && !(post?.isHtmlSource && cssStartPattern.test(content))) return content;
    // HTML 소스 모드 글: 자동생성 메타 텍스트 제거 + h2/h3 id 추가 + 목차 자동 생성
    if (post?.isHtmlSource) {
      let result = content;
      // ⓪-b CSS 텍스트가 <style> 태그 없이 저장된 경우 자동 복구
      // 비주얼 편집기에서 DIV 삭제 시 <style> 태그가 사라지고 CSS 텍스트만 남는 경우 처리
      // 문자열 레벨에서 첫 번째 HTML 태그 이전에 CSS 코드가 있으면 <style>로 감싸서 저장
      {
        // content가 CSS 코드로 시작하는지 확인 (:root, *, body, .class, @media 등)
        const cssStartPattern = /^\s*(:root|\*\s*\{|body\s*\{|html\s*\{|@media|@keyframes|\.[a-zA-Z_-]|#[a-zA-Z_-])/;
        if (cssStartPattern.test(result)) {
          // 첫 번째 HTML 태그 위치 찾기
          const firstTagIdx = result.indexOf("<");
          if (firstTagIdx > 0) {
            // 첫 태그 앞의 텍스트가 CSS 코드임
            const cssText = result.slice(0, firstTagIdx);
            const rest = result.slice(firstTagIdx);
            result = `<style>${cssText}</style>${rest}`;
          } else if (firstTagIdx === -1) {
            // HTML 태그가 없으면 전체가 CSS
            result = `<style>${result}</style>`;
          }
        }
      }
      // ⓪-a [FAL: ...] 이미지 생성 프롬프트 텍스트 제거 - DOMParser 기반으로 안정적 제거
      {
        const parser = new DOMParser();
        const doc = parser.parseFromString(result, "text/html");
        // img-slot 전체 제거 (이미지가 생성되지 않은 슬롯)
        doc.querySelectorAll(".img-slot").forEach(el => el.remove());
        // prompt 클래스 제거
        doc.querySelectorAll(".prompt").forEach(el => el.remove());
        // 인라인 [FAL: ...] 텍스트 노드 제거 (텍스트 노드 직접 포함)
        const walker = document.createTreeWalker(doc.body, NodeFilter.SHOW_TEXT);
        const textNodesToProcess: Text[] = [];
        let node = walker.nextNode();
        while (node) {
          if (/\[FAL:[^\]]*\]/.test(node.textContent || "")) {
            textNodesToProcess.push(node as Text);
          }
          node = walker.nextNode();
        }
        textNodesToProcess.forEach(textNode => {
          textNode.textContent = (textNode.textContent || "").replace(/\[FAL:[^\]]*\]/g, "");
        });
        // head 안의 <style> 태그도 보존 (DOMParser는 body.innerHTML만 반환하므로 head style 유실 방지)
        const headStyles = Array.from(doc.head.querySelectorAll("style"))
          .map(s => s.outerHTML)
          .join("\n");
        result = headStyles + doc.body.innerHTML;
      }
      // ⓪ <style> 태그 내 CSS 완전 스코핑: 모든 선택자에 .html-source-content 프리픽스 추가
      // scopeCSS() 함수가 body/html → .html-source-content 치환, 나머지 선택자는 .html-source-content 프리픽스 추가,
      // @media 내부도 재귀적으로 스코핑, body/html 관련 오염 속성(max-width, margin:auto, background, padding) 제거
      result = result.replace(
        /<style([^>]*)>([\s\S]*?)<\/style>/gi,
        (_match: string, attrs: string, css: string) => {
          const scoped = scopeCSS(css);
          return `<style${attrs}>${scoped}</style>`;
        }
      );
      // ① 자동생성 메타 텍스트 제거: <div class="post-meta"> 패턴 또는 📅/⏱/🏷 이모지 포함 요소
      // class="post-meta" div 전체 제거
      result = result.replace(
        /<div[^>]*class=["'][^"']*post-meta[^"']*["'][^>]*>[\s\S]*?<\/div>/gi,
        ""
      );
      // 📅 이모지 포함 p/div/span 요소 제거
      result = result.replace(
        /<(p|div|span)[^>]*>[^<]*📅[^<]*<\/(p|div|span)>/gi,
        ""
      );
      // 텍스트 노드로만 있는 경우 (태그 없이 직접 포함)
      result = result.replace(
        /[📅🗓][^\n<]*[⏱🕐][^\n<]*읽기[^\n<]*[🏷🔖][^\n<]*/g,
        ""
      );
      // ③ h2/h3 태그에 id 자동 추가
      result = result.replace(
        /<(h[23])([^>]*)>(.*?)<\/\1>/gi,
        (match, tag, attrs, inner) => {
          if (/\bid=/.test(attrs)) return match;
          const text = inner.replace(/<[^>]+>/g, "").trim();
          const id = makeSlug(text);
          if (!id) return match;
          return `<${tag}${attrs} id="${id}">${inner}</${tag}>`;
        }
      );
      // ④ h2/h3 목록 추출
      const headingMap: { id: string; text: string }[] = [];
      const headingRe = /<h[23][^>]*\bid="([^"]+)"[^>]*>(.*?)<\/h[23]>/gi;
      let hm: RegExpExecArray | null;
      while ((hm = headingRe.exec(result)) !== null) {
        const text = hm[2].replace(/<[^>]+>/g, "").trim();
        if (text && text !== "목차") headingMap.push({ id: hm[1], text });
      }
      // ⑥ 기존 목차의 li 항목에 앵커 링크 자동 추가 (DOMParser 사용 - 중첩 div 문제 해결)
      if (headingMap.length >= 2 && typeof DOMParser !== 'undefined') {
        try {
          const parser = new DOMParser();
          const doc = parser.parseFromString(`<body>${result}</body>`, 'text/html');
          // toc 클래스를 가진 div/nav 찾기
          const tocEls = doc.querySelectorAll('[class*="toc"]');
          tocEls.forEach((tocEl) => {
            const liEls = tocEl.querySelectorAll('li');
            // 이모지 제거 후 비교를 위한 헬퍼 (공통)
            const removeEmoji = (s: string) => s.replace(/[\uD800-\uDFFF]|[\u2600-\u27FF]|[\uFE00-\uFEFF]/g, '').replace(/^[0-9\s]+/, '').trim();
            liEls.forEach((li) => {
              const existingA = li.querySelector('a') as HTMLAnchorElement | null;
              if (existingA) {
                // 이미 앵커 링크가 있는 경우: href가 유효한지 검증
                const existingHref = existingA.getAttribute('href') || '';
                if (existingHref.startsWith('#')) {
                  const existingId = existingHref.slice(1);
                  const isValid = headingMap.some(h => h.id === existingId || h.id === decodeURIComponent(existingId));
                  if (isValid) return; // 유효한 앵커 링크이면 건너뜀
                  // 유효하지 않은 앵커 링크: href 교체 시도
                  const plainText2 = li.textContent?.trim() || '';
                  const plainClean2 = removeEmoji(plainText2).toLowerCase();
                  const slug2 = makeSlug(plainText2);
                  const found2 = headingMap.find(h => h.id === slug2) ||
                    headingMap.find(h => makeSlug(h.text) === slug2) ||
                    headingMap.find(h => removeEmoji(h.text).toLowerCase().includes(plainClean2) || plainClean2.includes(removeEmoji(h.text).toLowerCase().slice(0, 8))) ||
                    headingMap.find(h => h.text.replace(/[^\w\uAC00-\uD7A3]/g, '').startsWith(plainText2.replace(/[^\w\uAC00-\uD7A3]/g, '').slice(0, 8)));
                  if (found2) existingA.href = `#${found2.id}`;
                }
                return;
              }
              // 앵커 링크가 없는 경우: 새로 생성
              const plainText = li.textContent?.trim() || '';
              if (!plainText) return;
              const slug = makeSlug(plainText);
              const plainClean = removeEmoji(plainText).toLowerCase();
              const found = headingMap.find(h => h.id === slug) ||
                headingMap.find(h => makeSlug(h.text) === slug) ||
                headingMap.find(h => removeEmoji(h.text).toLowerCase().includes(plainClean) || plainClean.includes(removeEmoji(h.text).toLowerCase().slice(0, 8))) ||
                headingMap.find(h => h.text.replace(/[^\w\uAC00-\uD7A3]/g, '').startsWith(plainText.replace(/[^\w\uAC00-\uD7A3]/g, '').slice(0, 8)));
              if (found) {
                const a = doc.createElement('a');
                a.href = `#${found.id}`;
                a.innerHTML = li.innerHTML;
                li.innerHTML = '';
                li.appendChild(a);
              }
            });
          });
          result = doc.body.innerHTML;
        } catch {
          // DOMParser 실패 시 기존 방식 유지
        }
      }
      // ⑦ 목차 없으면 자동 생성 (h2/h3가 2개 이상인 경우)
      const hasToc = /목차/.test(result) && (/<ol/.test(result) || /<ul/.test(result));
      if (!hasToc && headingMap.length >= 2) {
        const tocItems = headingMap
          .map((h) => `<li><a href="#${h.id}">${h.text}</a></li>`)
          .join("");
        const tocHtml = `<div class="auto-toc"><h2 id="목차"><strong>목차</strong></h2><ol>${tocItems}</ol></div>`;
        const insertBefore = result.search(/<h2[^>]*>/i);
        if (insertBefore > 0) {
          result = result.slice(0, insertBefore) + tocHtml + result.slice(insertBefore);
        } else {
          result = tocHtml + result;
        }
      }
      return result;
    }

    // ① h2/h3 태그에 id 자동 추가 (없는 경우)
    let result = content.replace(
      /<(h[23])([^>]*)>(.*?)<\/\1>/gi,
      (match, tag, attrs, inner) => {
        if (/\bid=/.test(attrs)) return match;
        const text = inner.replace(/<[^>]+>/g, "").trim();
        const id = makeSlug(text);
        if (!id) return match;
        return `<${tag}${attrs} id="${id}">${inner}</${tag}>`;
      }
    );

    // ② h2/h3 목록 추출 (id → 텍스트 맵)
    const headingMap: { id: string; text: string }[] = [];
    const headingRe = /<h[23][^>]*\bid="([^"]+)"[^>]*>(.*?)<\/h[23]>/gi;
    let hm: RegExpExecArray | null;
    while ((hm = headingRe.exec(result)) !== null) {
      const text = hm[2].replace(/<[^>]+>/g, "").trim();
      // '목차' 제목 자체는 제외
      if (text && text !== "목차") headingMap.push({ id: hm[1], text });
    }

    // ③ 목차 링크 자동 복구: href가 #으로 시작하지만 실제 id와 매칭 안 되는 경우
    //    링크 텍스트와 가장 유사한 h2/h3 id로 교체
    result = result.replace(
      /<a([^>]*)href="(#[^"]*?)"([^>]*)>(.*?)<\/a>/gi,
      (match, before, href, after, linkText) => {
        const rawId = href.slice(1);
        // 이미 유효한 id면 그대로 (단, target=_blank는 제거)
        const existsInDoc = headingMap.some(h => h.id === rawId || h.id === decodeURIComponent(rawId));
        // target=_blank 제거 (앵커 링크이므로)
        const cleanBefore = before.replace(/\s*target="[^"]*"/gi, "");
        const cleanAfter = after.replace(/\s*target="[^"]*"/gi, "");
        if (existsInDoc) {
          return `<a${cleanBefore}href="${href}"${cleanAfter}>${linkText}</a>`;
        }
        // 링크 텍스트와 heading 텍스트 매칭
        const linkTextClean = linkText.replace(/<[^>]+>/g, "").trim();
        const matched = headingMap.find(
          h => h.text === linkTextClean ||
               h.text.includes(linkTextClean) ||
               linkTextClean.includes(h.text) ||
               makeSlug(h.text) === makeSlug(linkTextClean)
        );
        if (matched) {
          return `<a${cleanBefore}href="#${matched.id}"${cleanAfter}>${linkText}</a>`;
        }
        // 매칭 실패 시 target만 제거하고 유지
        return `<a${cleanBefore}href="${href}"${cleanAfter}>${linkText}</a>`;
      }
    );

    // ③-2 외부 링크에 rel="nofollow noopener noreferrer" 자동 추가 (링크 주스 누출 방지)
    result = result.replace(
      /<a([^>]*)href="(https?:\/\/[^"]+)"([^>]*)>/gi,
      (match: string, before: string, href: string, after: string) => {
        const combined = before + after;
        const hasRel = /\brel="([^"]*)"/i.test(combined);
        if (hasRel) {
          if (/\bnofollow\b/.test(combined)) return match;
          return match.replace(/rel="([^"]*)"/i, (_: string, relVal: string) => `rel="${relVal} nofollow"`);
        }
        return `<a${before}href="${href}"${after} rel="nofollow noopener noreferrer">`;
      }
    );

    // ③-3 alt 없는 이미지에 게시글 제목을 alt로 자동 추가 + loading=lazy 지연 로딩 적용 (SEO + 속도 개선)
    const postTitleForAlt = post?.title ?? "";
    // alt 처리 + loading=lazy + decoding=async 일괄 적용
    result = result.replace(
      /<img([^>]*)>/gi,
      (_match: string, attrs: string) => {
        let newAttrs = attrs;
        // alt 처리: 없거나 비어있는 경우 게시글 제목으로 채움
        if (postTitleForAlt) {
          const altMatch = attrs.match(/alt="([^"]*)"/i);
          if (!altMatch || !altMatch[1].trim()) {
            if (altMatch) {
              newAttrs = newAttrs.replace(/alt="[^"]*"/i, `alt="${postTitleForAlt.replace(/"/g, '&quot;')}"`);
            } else {
              newAttrs = `${newAttrs} alt="${postTitleForAlt.replace(/"/g, '&quot;')}"`;
            }
          }
        }
        // loading=lazy 추가: 이미 loading 속성이 있으면 유지 (eager 등 의도적 설정 보호)
        if (!/\bloading=/i.test(newAttrs)) {
          newAttrs = `${newAttrs} loading="lazy"`;
        }
        // decoding=async 추가: 렌더링 차단 없이 비동기 디코딩
        if (!/\bdecoding=/i.test(newAttrs)) {
          newAttrs = `${newAttrs} decoding="async"`;
        }
        return `<img${newAttrs}>`;
      }
    );

    // ④ 목차 섹션 존재 여부 확인 (목차 h2 또는 목차 텍스트 포함 여부)
    const hasToc = /목차/.test(result) && /<ol|<ul/.test(result);

    // ④-2 에디터에서 직접 삽입한 목차(<h2>목차</h2><ol>...)를 auto-toc div로 래핑
    if (hasToc) {
      // <h2 ...>목차</h2> 바로 뒤에 오는 <ol>...</ol> 또는 <ul>...</ul>을 auto-toc으로 감싸기
      // 이미 auto-toc으로 감싸진 경우는 건너뜀
      if (!result.includes('class="auto-toc"') && !result.includes("class='auto-toc'")) {
        result = result.replace(
          /(<h2[^>]*>[^<]*목차[^<]*<\/h2>)\s*(<[ou]l[\s\S]*?<\/[ou]l>)/gi,
          '<div class="auto-toc">$1$2</div>'
        );
      }
    }

    // ⑤ 목차 없으면 자동 생성 (enableToc=true이고 h2/h3가 2개 이상인 경우)
    // enableToc=false면 기존 auto-toc 삽입 생략 (React TableOfContents 컴포넌트로 대체)
    const enableTocFlag = (post as any)?.enableToc === true;
    if (enableTocFlag && !hasToc && headingMap.length >= 2) {
      const tocItems = headingMap
        .map((h) => `<li><a href="#${h.id}">${h.text}</a></li>`)
        .join("");
      const tocHtml = `<div class="auto-toc"><h2 id="목차"><strong>목차</strong></h2><ol>${tocItems}</ol></div>`;
      // 첫 번째 <p> 또는 <h2> 앞에 삽입
      const insertBefore = result.search(/<h2[^>]*>/i);
      if (insertBefore > 0) {
        result = result.slice(0, insertBefore) + tocHtml + result.slice(insertBefore);
      } else {
        result = tocHtml + result;
      }
    }

    return result;
  }, [post?.content, (post as any)?.enableToc]);

  // ─── 통합 광고 자동 삽입 (애드센스 + 쿠팡 파트너스 + 쇼핑 커넥트) ──────────────────────────
  const contentWithAds = useMemo(() => {
    if (!siteConfigData) return processedContent;
    // 통합 광고 마스터 OFF 또는 글별 광고 비활성화 시 광고 삽입 건너뜀
    if (siteConfigData["ads_master_enabled"] === "false") return processedContent;
    if ((post as any)?.disableAds === true) return processedContent;

    // ─── 애드센스 설정 ─────────────────────────────────────────────────────────────────────────────
    let adsenseCfg: Parameters<typeof insertUnifiedAds>[1]["adsense"] = undefined;
    if (siteConfigData["adsense_enabled"] === "true") {
      const slotCodes: Record<string, string> = {
        slot1: siteConfigData["adsense_slot1_code"] ?? siteConfigData["adsense_slot_code"] ?? "",
        slot2: siteConfigData["adsense_slot2_code"] ?? "",
        slot3: siteConfigData["adsense_slot3_code"] ?? "",
      };
      const hasAnySlot = Object.values(slotCodes).some(c => c?.trim());
      if (hasAnySlot) {
        const maxAds = Number(siteConfigData["adsense_max_per_post"] ?? 4);
        const minGapHeadings = Number(siteConfigData["adsense_min_gap_headings"] ?? 2);
        let positions: string[] = ["after_intro", "between_headings", "post_bottom_adsense"];
        try {
          const parsed = JSON.parse(siteConfigData["adsense_positions"] ?? "null");
          if (Array.isArray(parsed)) positions = parsed;
        } catch {}
        let positionSlots: Record<string, string> = {
          // 슬롯1(반응형): 큰 제목(h1) 바로 아래 및 도입부 이후 상단 반응형
          after_title: "slot1",
          after_intro: "slot1",
          after_toc: "slot1",
          // 슬롯2(인피드/직사각형): 본문 중간 소제목 사이 1~2개
          between_headings: "slot2",
          after_qa: "slot2",
          // 슬롯3(멀티플렉스/수평 배너): 본문 하단 댓글사랑 바로 위 1개
          post_bottom_adsense: "slot3",
        };
        try {
          const parsed = JSON.parse(siteConfigData["adsense_position_slots"] ?? "null");
          if (parsed && typeof parsed === "object") positionSlots = { ...positionSlots, ...parsed };
        } catch {}
        // calcDynamicMaxAds는 insertUnifiedAds 내부에서 H2 소제목 수를 파악한 뒤 자동 적용됩니다.
        // maxAds는 관리자 설정 상한선으로만 사용됩니다 (짧은 글에서는 자동으로 줄어듭니다).
        adsenseCfg = { slotCode: slotCodes.slot1, slotCodes, positionSlots, maxAds, minGapHeadings, positions };
      }
    }

    // ─── 쿠팡 파트너스 설정 ─────────────────────────────────────────────────────────────────────────
    let coupangCfg: Parameters<typeof insertUnifiedAds>[1]["coupang"] = undefined;
    if (siteConfigData["coupang_enabled"] === "true" && siteConfigData["coupang_api_enabled"] === "true") {
      const products = (coupangProductsData?.products ?? []).map((p: any) => ({
        ...p,
        productId: String(p.productId),
      })) as Array<{
        productId: string; productName: string; productPrice: number;
        productImage: string; productUrl: string; categoryName?: string;
      }>;
      if (products.length > 0) {
        const maxPerPost = Number(siteConfigData["coupang_max_per_post"] ?? 1);
        let coupangPositions: string[] = ["end_of_post"];
        try {
          const parsed = JSON.parse(siteConfigData["coupang_positions"] ?? "null");
          if (Array.isArray(parsed) && parsed.length > 0) coupangPositions = parsed;
        } catch {}
        const disclaimerText = siteConfigData["coupang_disclaimer"] !== "false"
          ? (siteConfigData["coupang_disclaimer_text"] ?? "이 포스팅은 쿠팡 파트너스 활동의 일환으로, 이에 따른 일정액의 수수료를 제공받습니다.")
          : "";
        const cardStyle = (siteConfigData["coupang_card_style"] ?? "image_compact") as CoupangCardStyle;
        const cardSize = (siteConfigData["coupang_card_size"] ?? "medium") as "small" | "medium" | "large";
        const cardBgColor = siteConfigData["coupang_card_bg_color"] ?? "#ffffff";
        const btnColor = siteConfigData["coupang_btn_color"] ?? "#e11d48";
        const btnText = siteConfigData["coupang_btn_text"] ?? "지금 쿠팡에서 확인하기 →";
        // 슬롯별 스타일: 활성화된 경우에만 적용
        const slotStyleEnabled = siteConfigData["coupang_slot_style_enabled"] === "true";
        const cardStyleSlots: (CoupangCardStyle | null)[] | undefined = slotStyleEnabled ? [
          (siteConfigData["coupang_card_style_1"] as CoupangCardStyle | undefined) ?? null,
          (siteConfigData["coupang_card_style_2"] as CoupangCardStyle | undefined) ?? null,
          (siteConfigData["coupang_card_style_3"] as CoupangCardStyle | undefined) ?? null,
        ] : undefined;
        const curationGridCount = Number(siteConfigData["coupang_curation_grid_count"] ?? 3) || 3;
        const curationGridTitle = siteConfigData["coupang_curation_grid_title"] ?? "";
        const curationGridTitleStyle = (siteConfigData["coupang_curation_grid_title_style"] ?? "fire") as "fire" | "sale" | "new" | "pick" | "plain";
        coupangCfg = { enabled: true, products, maxPerPost, positions: coupangPositions, disclaimerText, cardStyle, cardSize, cardBgColor, btnColor, btnText, cardStyleSlots, curationGridCount, curationGridTitle, curationGridTitleStyle };
      }
    }

    // ─── 쇼핑 커넥트 설정 ─────────────────────────────────────────────────────────────────────────
    let shopConnectCfg: Parameters<typeof insertUnifiedAds>[1]["shopConnect"] = undefined;
    if (siteConfigData["shop_connect_enabled"] === "true") {
      const widgetCode = siteConfigData["shop_connect_widget_code"] ?? "";
      if (widgetCode.trim()) {
        const maxPerPost = Number(siteConfigData["shop_connect_max_per_post"] ?? 1);
        let shopPositions: string[] = ["post_bottom"];
        try {
          const parsed = JSON.parse(siteConfigData["shop_connect_positions"] ?? "null");
          if (Array.isArray(parsed) && parsed.length > 0) shopPositions = parsed;
        } catch {}
        const disclaimerText = siteConfigData["shop_connect_disclaimer"] !== "false"
          ? (siteConfigData["shop_connect_disclaimer_text"] ?? "")
          : "";
        shopConnectCfg = { enabled: true, widgetCode, maxPerPost, positions: shopPositions, disclaimerText };
      }
    }

    // ─── 통합 배치 엔진 호출 ──────────────────────────────────────────────────────────────────────
    // 3종 설정이 모두 없으면 수동 제휴 링크 방식으로 폴백
    if (!adsenseCfg && !coupangCfg && !shopConnectCfg) {
      if (siteConfigData["affiliate_enabled"] === "true") {
        const affiliateCfg = parseAffiliateConfig(siteConfigData as Record<string, string>);
        let postLinks: { coupang?: { url: string; text?: string }[]; shopConnect?: { url: string; text?: string }[] } | undefined;
        try {
          const raw = (post as any)?.affiliateLinks;
          if (raw) postLinks = typeof raw === "string" ? JSON.parse(raw) : raw;
        } catch {}
        return insertAffiliateLinks(processedContent, affiliateCfg, postLinks);
      }
      return processedContent;
    }

    const withUnifiedAds = insertUnifiedAds(processedContent, {
      adsense: adsenseCfg,
      coupang: coupangCfg,
      shopConnect: shopConnectCfg,
      globalMinGap: Number(siteConfigData["adsense_min_gap_headings"] ?? 2),
    });

    // 기존 수동 제휴 링크 삽입 (affiliate_enabled + postLinks 방식)
    if (siteConfigData["affiliate_enabled"] === "true") {
      const affiliateCfg = parseAffiliateConfig(siteConfigData as Record<string, string>);
      let postLinks: { coupang?: { url: string; text?: string }[]; shopConnect?: { url: string; text?: string }[] } | undefined;
      try {
        const raw = (post as any)?.affiliateLinks;
        if (raw) postLinks = typeof raw === "string" ? JSON.parse(raw) : raw;
      } catch {}
      return insertAffiliateLinks(withUnifiedAds, affiliateCfg, postLinks);
    }

        return withUnifiedAds;
  }, [processedContent, siteConfigData, post, coupangProductsData]);

  /**
   * BlobIframe HTML에 쿠팡 상품 카드 주입
   * - HTML 파일 업로드 글에서 data-coupang-manual="1" 플레이스홀더를 실제 상품 카드로 교체
   */
  const blobHtmlWithCoupang = useMemo(() => {
    if (!post?.content) return post?.content ?? "";
    const isBlobPost = (post as any).isAppMode ||
      ((post as any).isHtmlSource && (
        /^\s*(<!DOCTYPE|<html)/i.test(post.content.trim()) ||
        /<style[\s>]/i.test(post.content)
      ));
    if (!isBlobPost) return post.content;
    if (!siteConfigData) return post.content;
    if (siteConfigData["coupang_enabled"] !== "true" || siteConfigData["coupang_api_enabled"] !== "true") return post.content;
    const products = (coupangProductsData?.products ?? []).map(p => ({
      ...p,
      productId: String(p.productId),
    })) as CoupangProduct[];
    if (products.length === 0) return post.content;
    // data-coupang-manual="1" 플레이스홀더 개수 파악
    const manualCount = (post.content.match(/data-coupang-manual=["']1["']/g) || []).length;
    if (manualCount === 0) {
      // 플레이스홀더 없으면 insertUnifiedAds로 자동 분산 배치 시도
      const maxPerPost2 = Math.min(Number(siteConfigData["coupang_max_per_post"] ?? 1), products.length);
      const disclaimerText2 = siteConfigData["coupang_disclaimer"] !== "false"
        ? (siteConfigData["coupang_disclaimer_text"] ?? "이 포스팅은 쿠팡 파트너스 활동의 일환으로, 이에 따른 일정액의 수수료를 제공받습니다.")
        : "";
      const cardStyle2 = (siteConfigData["coupang_card_style"] ?? "image_compact") as CoupangCardStyle;
      const cardSize2 = (siteConfigData["coupang_card_size"] ?? "medium") as CoupangCardSize;
      const cardBgColor2 = siteConfigData["coupang_card_bg_color"] ?? "#ffffff";
      const btnColor2 = siteConfigData["coupang_btn_color"] ?? "#e11d48";
      const btnText2 = siteConfigData["coupang_btn_text"] ?? "지금 쿠팡에서 확인하기 →";
      let coupangPositions2: string[] = ["end_of_post"];
      try {
        const parsed2 = JSON.parse(siteConfigData["coupang_positions"] ?? "null");
        if (Array.isArray(parsed2) && parsed2.length > 0) coupangPositions2 = parsed2;
      } catch {}
      const slotStyleEnabled2 = siteConfigData["coupang_slot_style_enabled"] === "true";
      const cardStyleSlots2: (CoupangCardStyle | null)[] | undefined = slotStyleEnabled2 ? [
        (siteConfigData["coupang_card_style_1"] as CoupangCardStyle | undefined) ?? null,
        (siteConfigData["coupang_card_style_2"] as CoupangCardStyle | undefined) ?? null,
        (siteConfigData["coupang_card_style_3"] as CoupangCardStyle | undefined) ?? null,
      ] : undefined;
      const curationGridCount2 = Number(siteConfigData["coupang_curation_grid_count"] ?? 3) || 3;
      const curationGridTitle2 = siteConfigData["coupang_curation_grid_title"] ?? "";
      const curationGridTitleStyle2 = (siteConfigData["coupang_curation_grid_title_style"] ?? "fire") as "fire" | "sale" | "new" | "pick" | "plain";
      const coupangCfg2 = { enabled: true, products: products.slice(0, maxPerPost2), maxPerPost: maxPerPost2, positions: coupangPositions2, disclaimerText: disclaimerText2, cardStyle: cardStyle2, cardSize: cardSize2, cardBgColor: cardBgColor2, btnColor: btnColor2, btnText: btnText2, cardStyleSlots: cardStyleSlots2, curationGridCount: curationGridCount2, curationGridTitle: curationGridTitle2, curationGridTitleStyle: curationGridTitleStyle2 };
      const withAds2 = insertUnifiedAds(post.content, { coupang: coupangCfg2, globalMinGap: 1 });
      // insertUnifiedAds가 변경을 가했으면 반환, 아니면 기존 방식(React 레이어) 유지
      return withAds2 !== post.content ? withAds2 : post.content;
    }
    const maxPerPost = Math.min(Number(siteConfigData["coupang_max_per_post"] ?? 1), products.length);
    const disclaimerText = siteConfigData["coupang_disclaimer"] !== "false"
      ? (siteConfigData["coupang_disclaimer_text"] ?? "이 포스팅은 쿠팡 파트너스 활동의 일환으로, 이에 따른 일정액의 수수료를 제공받습니다.")
      : "";
    const cardStyle = (siteConfigData["coupang_card_style"] ?? "image_compact") as CoupangCardStyle;
    const cardSize = (siteConfigData["coupang_card_size"] ?? "medium") as CoupangCardSize;
    const cardBgColor = siteConfigData["coupang_card_bg_color"] ?? "#ffffff";
    const btnColor = siteConfigData["coupang_btn_color"] ?? "#e11d48";
    const btnText = siteConfigData["coupang_btn_text"] ?? "지금 쿠팡에서 확인하기 →";
    const slotStyleEnabled3 = siteConfigData["coupang_slot_style_enabled"] === "true";
    const cardStyleSlots3: (CoupangCardStyle | null)[] | undefined = slotStyleEnabled3 ? [
      (siteConfigData["coupang_card_style_1"] as CoupangCardStyle | undefined) ?? null,
      (siteConfigData["coupang_card_style_2"] as CoupangCardStyle | undefined) ?? null,
      (siteConfigData["coupang_card_style_3"] as CoupangCardStyle | undefined) ?? null,
    ] : undefined;
    // DOMParser로 data-coupang-manual 요소를 실제 카드로 교체
    if (typeof window === "undefined" || typeof DOMParser === "undefined") return post.content;
    const parser = new DOMParser();
    const doc = parser.parseFromString(post.content, "text/html");
    const manualEls = Array.from(doc.querySelectorAll('[data-coupang-manual="1"]'));
    let productIdx = 0;
    for (const el of manualEls) {
      if (productIdx >= maxPerPost || productIdx >= products.length) {
        el.remove();
        continue;
      }
      const product = products[productIdx];
      const isLast = productIdx === Math.min(manualEls.length, maxPerPost) - 1;
      productIdx++;
      // 수동 플레이스홀더도 슬롯별 스타일 적용
      const slotCardStyle = (cardStyleSlots3 && cardStyleSlots3[productIdx - 1]) ? (cardStyleSlots3[productIdx - 1] as CoupangCardStyle) : cardStyle;
      const cardHtml = makeCoupangCardHtml([product], isLast ? disclaimerText : "", slotCardStyle, cardSize, false, cardBgColor, btnColor, btnText);
      const wrapper = doc.createElement("div");
      wrapper.innerHTML = cardHtml;
      el.replaceWith(...Array.from(wrapper.childNodes));
    }
    // 전체 HTML 문서인 경우 전체 문서 반환, fragment인 경우 body innerHTML 반환
    if (/^\s*(<!DOCTYPE|<html)/i.test(post.content.trim())) {
      return doc.documentElement.outerHTML;
    }
    return doc.body.innerHTML;
  }, [post, siteConfigData, coupangProductsData]);

  // 애드센스 스크립트 동적 삽입 (head에 한 번만)
  useEffect(() => {
    if (!siteConfigData) return;
    if (siteConfigData["adsense_enabled"] !== "true") return;
    const scriptCode = siteConfigData["adsense_script_code"] ?? "";
    if (!scriptCode.trim()) return;
    if (document.querySelector("script[data-adsense-auto]")) return;
    const srcMatch = scriptCode.match(/src=["']([^"']+)["']/);
    if (!srcMatch) return;
    const script = document.createElement("script");
    script.src = srcMatch[1];
    script.async = true;
    script.setAttribute("data-adsense-auto", "true");
    const crossMatch = scriptCode.match(/crossorigin=["']([^"']+)["']/);
    if (crossMatch) script.crossOrigin = crossMatch[1];
    document.head.appendChild(script);
  }, [siteConfigData]);

  // adsbygoogle.push 실행 (광고 블록이 DOM에 추가된 후)
  useEffect(() => {
    if (!siteConfigData || siteConfigData["adsense_enabled"] !== "true") return;
    const timer = setTimeout(() => {
      try {
        const adEls = document.querySelectorAll(".adsense-block ins.adsbygoogle");
        adEls.forEach(el => {
          if (!(el as any).dataset.adsbygoogleStatus) {
            ((window as any).adsbygoogle = (window as any).adsbygoogle || []).push({});
          }
        });
      } catch {}
    }, 400);
    return () => clearTimeout(timer);
  }, [contentWithAds, siteConfigData]);

  // 쿠팡 카드 버튼 클릭 트래킹: iframe postMessage 수신
  useEffect(() => {
    const handler = (e: MessageEvent) => {
      if (!e.data || e.data.type !== 'coupang_click') return;
      const { btnText, productId } = e.data;
      if (!btnText) return;
      trackCoupangClick.mutate({
        btnText: String(btnText).slice(0, 200),
        productId: productId ? String(productId).slice(0, 100) : undefined,
        postId: post?.id ?? undefined,
      });
    };
    window.addEventListener('message', handler);
    return () => window.removeEventListener('message', handler);
  }, [post?.id]);

  // 목차 앵커 클릭 인터셉트: #hash 링크 클릭 시 새 탭 대신 같은 페이지 내 스크롤 이동 - 조건부 return 이전에 선언 (React Hooks 규칙 준수)
  useEffect(() => {
    const container = contentRef.current;
    if (!container) return;
    const handleClick = (e: MouseEvent) => {
      const target = e.target as HTMLElement;
      const anchor = target.closest("a") as HTMLAnchorElement | null;
      if (!anchor) return;
      const href = anchor.getAttribute("href") || "";

      // /manus-storage/ 링크: 원본 파일명으로 다운로드 다이얼로그 표시
      // ?download=1이 이미 있는 링크도 인터셉트하여 download 속성의 원본 파일명 적용
      if (href.startsWith("/manus-storage/")) {
        e.preventDefault();
        // download 속성에서 원본 파일명 추출 (buildBtnHtml에서 download="파일명" 속성으로 저장됨)
        const originalFilename = anchor.getAttribute('download') || '';
        // href에 이미 ?filename= 파라미터가 있으면 그값을 원본 파일명으로 사용
        const hrefUrl = new URL(href, window.location.origin);
        const filenameParam = hrefUrl.searchParams.get('filename');
        const baseHref = href.split('?')[0];
        // href에서 S3 key를 추출하여 의미있는 파일명 파싱
        const keyPart = baseHref.replace('/manus-storage/', '');
        const rawBasename = keyPart.split('/').pop() || '';
        // S3 키 패턴 {timestamp}_{randomId}_{fileSlug}_{hash}.{ext}에서 fileSlug 추출
        const smartFilename = (() => {
          const lastDot = rawBasename.lastIndexOf('.');
          const ext = lastDot >= 0 ? rawBasename.slice(lastDot) : '';
          const nameWithoutExt = lastDot >= 0 ? rawBasename.slice(0, lastDot) : rawBasename;
          const parts = nameWithoutExt.split('_');
          if (parts.length >= 4) {
            const isTimestamp = /^\d{13}$/.test(parts[0]);
            const isHash = /^[a-f0-9]{8}$/.test(parts[parts.length - 1]);
            if (isTimestamp && isHash) {
              const fileSlugParts = parts.slice(2, parts.length - 1);
              const fileSlug = fileSlugParts.join('_').replace(/_+/g, '_').replace(/^_|_$/g, '');
              if (fileSlug.length > 0) return fileSlug + ext;
            }
          }
          return rawBasename;
        })();
        // 우선순위: download 속성 > ?filename= 파라미터 > S3 키 파싱 결과
        const filenameToUse = originalFilename || filenameParam || smartFilename;
        const downloadUrl = filenameToUse
          ? `${baseHref}?download=1&filename=${encodeURIComponent(filenameToUse)}`
          : `${baseHref}?download=1`;
        const a = document.createElement('a');
        a.href = downloadUrl;
        a.download = filenameToUse;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        return;
      }

      // #으로 시작하는 앵커 링크만 처리
      if (!href.startsWith("#")) return;
      e.preventDefault();
      e.stopPropagation();
      const id = href.slice(1);
      // 현재 문서에서 id로 요소 찾기
      let el = document.getElementById(id);
      // URL 인코딩 대응
      if (!el) {
        try { el = document.getElementById(decodeURIComponent(id)); } catch {}
      }
      if (el) {
        // 헤더 높이만큼 오프셋 보정 (고정 헤더가 소제목을 가리지 않도록)
        const headerEl = document.querySelector("header") as HTMLElement | null;
        const headerHeight = headerEl ? headerEl.offsetHeight : 64;
        const EXTRA_PADDING = 16;
        const top = el.getBoundingClientRect().top + window.scrollY - headerHeight - EXTRA_PADDING;
        window.scrollTo({ top, behavior: "smooth" });
        // URL 해시 업데이트 (뒤로가기 지원)
        history.pushState(null, "", `#${id}`);
      }
    };
    container.addEventListener("click", handleClick);
    return () => container.removeEventListener("click", handleClick);
  }, [processedContent]);

  if (isLoading) {
    return (
      <>
        <Header />
        <PostDetailSkeleton />
      </>
    );
  }

  if (error || !post) {
    return (
      <div style={{ minHeight: "100vh", background: "#f9fafb", fontFamily: "'Noto Sans KR', sans-serif" }}>
        <Header />
        <div style={{ textAlign: "center", padding: "80px 20px", color: "#6b7280" }}>
          <div style={{ fontSize: 48, marginBottom: 16 }}>😕</div>
          <div style={{ fontSize: 18, fontWeight: 700, color: "#6b7280", marginBottom: 8 }}>게시물을 찾을 수 없습니다</div>
          <button
            onClick={() => navigate("/")}
            style={{
              marginTop: 16, padding: "10px 24px",
              background: "linear-gradient(135deg, #6366f1, #8b5cf6)",
              border: "none", borderRadius: 8,
              fontSize: 13, fontWeight: 700, color: "#fff", cursor: "pointer",
            }}
          >홈으로 돌아가기</button>
        </div>
      </div>
    );
  }

  const dateStr = new Date(post.createdAt).toLocaleDateString("ko-KR", {
    year: "numeric", month: "long", day: "numeric",
  });

  // Check if content is HTML (from rich editor) or plain text
  const isHtml = post.content.trim().startsWith("<");
  // embedWidth=full: 앱 모드 글을 사이드바 포함 전체 화면 너비로 표시
  const isFullWidthApp = (post as any).isAppMode && (post as any).embedWidth === "full";
  // HTML 소스 글(isHtmlSource=true)에서 embedWidth=full 시 article 전체 너비 표시
  const isFullWidthHtml = (post as any).isHtmlSource && (post as any).embedWidth === "full";

  // 전체 너비 앱 모드: 사이드바 없이 전체 화면 너비로 iframe 렌더링
  if (isFullWidthApp) {
    return (
      <div style={{ minHeight: "100vh", background: "#0a0a14", fontFamily: "'Noto Sans KR', 'Apple SD Gothic Neo', sans-serif" }}>
        <Header />
        {/* 전체 너비 앱 렌더링 - 사이드바 없음 */}
        <div style={{ width: "100%", position: "relative" }}>
          {/* 뒤로가기 버튼 오버레이 */}
          <div style={{
            position: "absolute", top: 10, left: 12, zIndex: 20,
            display: "flex", alignItems: "center", gap: 8,
          }}>
            <button
              onClick={() => navigate(-1 as any)}
              style={{
                display: "flex", alignItems: "center", gap: 5,
                background: "rgba(0,0,0,0.55)", border: "none", borderRadius: 6,
                color: "#e5e7eb", cursor: "pointer", padding: "6px 12px",
                fontSize: 12, backdropFilter: "blur(4px)",
              }}
            >
              <ArrowLeft size={14} /> 목록으로
            </button>
            {isAuthor && (
              <button
                onClick={() => navigate(`/write/edit/${post.id}` as any)}
                style={{
                  display: "flex", alignItems: "center", gap: 5,
                  background: "rgba(99,102,241,0.75)", border: "none", borderRadius: 6,
                  color: "#fff", cursor: "pointer", padding: "6px 12px",
                  fontSize: 12, backdropFilter: "blur(4px)",
                }}
              >
                <Pencil size={13} /> 수정
              </button>
            )}
          </div>
          {(post as any).appEmbedUrl ? (
            <iframe
              src={(post as any).appEmbedUrl}
              style={{ width: "100%", border: "none", minHeight: "calc(100vh - 56px)", display: "block" }}
              allowFullScreen
              title={post.title}
            />
          ) : (
            <BlobIframe html={post.content} title={post.title} />
          )}
        </div>
        <style>{`
          @keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }
        `}</style>
      </div>
    );
  }

  return (
    <div style={{ minHeight: "100vh", background: "#f9fafb", fontFamily: "'Noto Sans KR', 'Apple SD Gothic Neo', sans-serif" }}>
      <Header />
      <div className="post-layout-wrapper" style={{
        maxWidth: 1400, margin: "0 auto",
        padding: "16px 10px",
        display: "flex", gap: 12, alignItems: "flex-start",
      }}>
        {/* Left Sidebar - 항목이 있을 때만 컨테이너 표시 */}
        {hasLeftSidebar && (
          <div className="sidebar-col" style={{ width: 160, flexShrink: 0 }}>
            <Sidebar side="left" />
          </div>
        )}
        {/* Main Content */}
        <main style={{ flex: 1, minWidth: 0 }}>
          {/* Back button + Author actions */}
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 20 }}>
            <button
              onClick={() => navigate(-1 as any)}
              style={{
                display: "flex", alignItems: "center", gap: 6,
                background: "none", border: "none",
                color: "#6b7280", fontSize: 13, cursor: "pointer",
                padding: "4px 0",
                transition: "color 0.15s",
              }}
              onMouseEnter={e => (e.currentTarget as HTMLElement).style.color = "#6366f1"}
              onMouseLeave={e => (e.currentTarget as HTMLElement).style.color = "#6b7280"}
            >
              <ArrowLeft size={15} /> 목록으로 돌아가기
            </button>

            {/* 작성자 전용 수정/삭제 버튼 */}
            {isAuthor && (
              <div style={{ display: "flex", gap: 8 }}>
                <button
                  onClick={handleEdit}
                  style={{
                    display: "flex", alignItems: "center", gap: 6,
                    padding: "7px 16px", borderRadius: 8,
                    background: "#e5e7eb", border: "1px solid #e5e7eb",
                    fontSize: 12, fontWeight: 700, color: "#6366f1",
                    cursor: "pointer", transition: "all 0.15s",
                  }}
                  onMouseEnter={e => {
                    (e.currentTarget as HTMLElement).style.background = "#f3f4f6";
                    (e.currentTarget as HTMLElement).style.borderColor = "#6366f1";
                  }}
                  onMouseLeave={e => {
                    (e.currentTarget as HTMLElement).style.background = "#e5e7eb";
                    (e.currentTarget as HTMLElement).style.borderColor = "#e5e7eb";
                  }}
                >
                  <Pencil size={13} /> 수정
                </button>
                <button
                  onClick={() => setShowDeleteConfirm(true)}
                  style={{
                    display: "flex", alignItems: "center", gap: 6,
                    padding: "7px 16px", borderRadius: 8,
                    background: "#e5e7eb", border: "1px solid #e5e7eb",
                    fontSize: 12, fontWeight: 700, color: "#f87171",
                    cursor: "pointer", transition: "all 0.15s",
                  }}
                  onMouseEnter={e => {
                    (e.currentTarget as HTMLElement).style.background = "#2d1a1a";
                    (e.currentTarget as HTMLElement).style.borderColor = "#f87171";
                  }}
                  onMouseLeave={e => {
                    (e.currentTarget as HTMLElement).style.background = "#e5e7eb";
                    (e.currentTarget as HTMLElement).style.borderColor = "#e5e7eb";
                  }}
                >
                  <Trash2 size={13} /> 삭제
                </button>
              </div>
            )}
          </div>

          {/* Article - postContentWidth + 80px 여백으로 카드 폭 설정 */}
          <article style={{
            background: "#ffffff",
            border: "1px solid #e5e7eb",
            borderRadius: 16,
            overflow: "hidden",
            maxWidth: isFullWidthHtml ? undefined : (Number(siteConfigData?.postContentWidth) || 960) + 40,
            margin: isFullWidthHtml ? undefined : "0 auto",
            width: "100%",
          }}>
            {/* Thumbnail */}
            {post.thumbnail && (
              <div className="post-thumbnail" style={{ height: 320, overflow: "hidden" }}>
                <img
                  src={post.thumbnail}
                  srcSet={makeSrcSet(post.thumbnail)}
                  sizes={THUMBNAIL_SIZES}
                  alt={post.title}
                  loading="eager"
                  fetchPriority="high"
                  decoding="async"
                  width={800}
                  height={320}
                  style={{ width: "100%", height: "100%", objectFit: "cover" }}
                />
              </div>
            )}

            <div className="post-article-inner" style={{ padding: "56px 48px 64px" }}>
              {/* Category & Badge */}
              <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 14 }}>
                <span style={{
                  fontSize: 11, fontWeight: 700,
                  color: catColor, background: catColor + "18",
                  padding: "3px 10px", borderRadius: 4,
                }}>{catLabel}</span>
                {post.badge && (
                  <span style={{
                    fontSize: 10, fontWeight: 800,
                    background: "#6366f1", color: "#fff",
                    padding: "3px 8px", borderRadius: 4,
                  }}>{post.badge}</span>
                )}
              </div>

              {/* Title */}
              <h1 className="post-title-h1" style={{
                fontSize: 34, fontWeight: 900, color: "#111827",
                lineHeight: 1.35, margin: "0 0 16px",
                textAlign: "center",
              }}>{post.title}</h1>

              {/* Meta */}
              <div style={{
                display: "flex", alignItems: "center", gap: 16,
                paddingBottom: 20, marginBottom: 28,
                borderBottom: "1px solid #1e2040",
                flexWrap: "wrap",
              }}>
                {/* 저자 정보 - 구글 EEAT(전문성/신뢰성) 기준 충족 */}
                {post.authorName && (
                  <span style={{ display: "flex", alignItems: "center", gap: 5, fontSize: 13, color: "#374151", fontWeight: 600 }}>
                    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/></svg>
                    {post.authorName}
                  </span>
                )}
                <span style={{ display: "flex", alignItems: "center", gap: 5, fontSize: 13, color: "#6b7280" }}>
                  <Clock size={13} /> {dateStr}
                </span>
                <span style={{ display: "flex", alignItems: "center", gap: 5, fontSize: 13, color: "#6b7280" }}>
                  <Eye size={13} /> {post.views.toLocaleString()} 조회
                </span>
                <span style={{ display: "flex", alignItems: "center", gap: 5, fontSize: 13, color: "#6b7280" }}>
                  <Heart size={13} fill={isLiked ? "#6366f1" : "none"} color={isLiked ? "#6366f1" : "currentColor"} /> {displayLikeCount.toLocaleString()} 좋아요
                </span>

                {/* Action buttons */}
                <div style={{ marginLeft: "auto", display: "flex", gap: 8 }}>
                  <button
                    onClick={handleLike}
                    disabled={likeMutation.isPending}
                    style={{
                      display: "flex", alignItems: "center", gap: 5,
                      padding: "7px 15px", borderRadius: 7,
                      background: isLiked ? "#6366f1" : "#e5e7eb",
                      border: isLiked ? "1px solid #6366f1" : "1px solid #e5e7eb",
                      fontSize: 13, fontWeight: 700,
                      color: isLiked ? "#fff" : "#6366f1",
                      cursor: "pointer", transition: "all 0.15s",
                    }}
                    onMouseEnter={e => {
                      (e.currentTarget as HTMLElement).style.background = isLiked ? "#4f46e5" : "#f3f4f6";
                    }}
                    onMouseLeave={e => {
                      (e.currentTarget as HTMLElement).style.background = isLiked ? "#6366f1" : "#e5e7eb";
                    }}
                  >
                    <Heart size={13} fill={isLiked ? "currentColor" : "none"} />
                    {isLiked ? "좋아요 ♥" : "좋아요"}
                  </button>
                  <button
                    onClick={handleShare}
                    style={{
                      display: "flex", alignItems: "center", gap: 5,
                      padding: "7px 15px", borderRadius: 7,
                      background: "#e5e7eb", border: "1px solid #e5e7eb",
                      fontSize: 13, fontWeight: 700, color: "#6b7280",
                      cursor: "pointer", transition: "all 0.15s",
                    }}
                    onMouseEnter={e => (e.currentTarget as HTMLElement).style.background = "#f3f4f6"}
                    onMouseLeave={e => (e.currentTarget as HTMLElement).style.background = "#e5e7eb"}
                  >
                    <Share2 size={13} /> 공유
                  </button>
                  <button
                    style={{
                      display: "flex", alignItems: "center", gap: 5,
                      padding: "7px 15px", borderRadius: 7,
                      background: "#e5e7eb", border: "1px solid #e5e7eb",
                      fontSize: 13, fontWeight: 700, color: "#6b7280",
                      cursor: "pointer", transition: "all 0.15s",
                    }}
                    onMouseEnter={e => (e.currentTarget as HTMLElement).style.background = "#f3f4f6"}
                    onMouseLeave={e => (e.currentTarget as HTMLElement).style.background = "#e5e7eb"}
                    onClick={() => toast.info("북마크 기능은 준비 중입니다.")}
                  >
                    <Bookmark size={13} /> 저장
                  </button>
                </div>
              </div>

              {/* React 목차(TOC) — enableToc=true이고 isHtmlSource/isAppMode가 아닌 일반 rich-preview 글에만 표시 */}
              {(post as any)?.enableToc && !isHtml && (
                <TableOfContents
                  content={processedContent}
                  enabled={(post as any)?.enableToc === true}
                />
              )}

              {/* Content */}
              {isHtml ? (
                (post as any).appEmbedUrl ? (
                  // URL 임베드 모드
                  <iframe
                    src={(post as any).appEmbedUrl}
                    style={{
                      width: "100%",
                      border: "none",
                      minHeight: 600,
                      display: "block",
                    }}
                    allowFullScreen
                    onLoad={(e) => {
                      const iframe = e.currentTarget;
                      try {
                        const doc = iframe.contentDocument || iframe.contentWindow?.document;
                        if (doc?.body) {
                          const ro = new ResizeObserver(() => {
                            const h = doc.documentElement.scrollHeight || doc.body?.scrollHeight || 600;
                            if (h > 100) iframe.style.height = h + "px";
                          });
                          ro.observe(doc.body);
                          iframe.addEventListener("pagehide", () => ro.disconnect(), { once: true });
                        }
                      } catch { /* cross-origin */ }
                    }}
                    title={post.title}
                  />
                ) : (post as any).isAppMode ? (
                  // Blob URL 방식: srcdoc+sandbox 대신 독립 origin 부여 → localStorage/fetch/IndexedDB 등 모든 JS API 정상 동작
                  <BlobIframe html={blobHtmlWithCoupang || post.content} title={post.title} />
                ) : (post as any).isHtmlSource && /^\s*(<!DOCTYPE|<html)/i.test(post.content.trim()) ? (
                  // 전체 HTML 문서: 쿠팡 manual 플레이스홀더 교체 후 BlobIframe에 전달
                  <BlobIframe html={blobHtmlWithCoupang || post.content} title={post.title} />
                ) : (post as any).isHtmlSource && /<style[\s>]/i.test(post.content) ? (
                  // <style> 태그가 있는 HTML fragment: 쿠팡 manual 플레이스홀더 교체 후 BlobIframe에 전달
                  <BlobIframe
                    html={blobHtmlWithCoupang
                      ? (blobHtmlWithCoupang !== post.content
                          ? blobHtmlWithCoupang  // 플레이스홀더 교체된 경우 그대로 사용
                          : `<!DOCTYPE html><html lang="ko"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1.0"><style>body{font-family:'Noto Sans KR','Malgun Gothic','Apple SD Gothic Neo',sans-serif;margin:0;padding:16px;background:#fff;max-width:${Number(siteConfigData?.postContentWidth) || 960}px;}</style></head><body>${post.content}</body></html>`)
                      : `<!DOCTYPE html><html lang="ko"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1.0"><style>body{font-family:'Noto Sans KR','Malgun Gothic','Apple SD Gothic Neo',sans-serif;margin:0;padding:16px;background:#fff;max-width:${Number(siteConfigData?.postContentWidth) || 960}px;}</style></head><body>${post.content}</body></html>`}
                    title={post.title}
                  />
                ) : (
                  <div
                    ref={contentRef}
                    className={(post as any).isHtmlSource ? "html-source-content" : "rich-preview"}
                    style={{
                      maxWidth: Number(siteConfigData?.postContentWidth) || 960,
                      margin: "0 auto",
                      padding: "8px 0 16px",
                    }}
                    dangerouslySetInnerHTML={{ __html: contentWithAds }}
                  />
                )
              ) : (
                <div
                  className="post-content"
                  style={{
                    whiteSpace: "pre-wrap", lineHeight: 1.95, color: "#374151", fontSize: 16,
                    maxWidth: Number(siteConfigData?.postContentWidth) || 960,
                    margin: "0 auto",
                    padding: "8px 0 16px",
                  }}
                >
                  {post.content}
                </div>
              )}

              {/* BlobIframe 글(isHtmlSource + style/DOCTYPE, isAppMode)에서 쿠팡 상품 카드를 React 레이어로 렌더링 */}
              {/* data-coupang-manual 플레이스홀더가 있으면 iframe 내부에 이미 삽입되므로 하단 카드 표시 안 함 */}
              {(() => {
                const isBlobPost = (post as any).isAppMode ||
                  ((post as any).isHtmlSource && (
                    /^\s*(<!DOCTYPE|<html)/i.test(post.content.trim()) ||
                    /<style[\s>]/i.test(post.content)
                  ));
                if (!isBlobPost) return null;
                // data-coupang-manual="1" 플레이스홀더가 있으면 iframe 내부에 이미 삽입되므로 하단 카드 표시 안 함
                const hasManualPlaceholder = /data-coupang-manual=["']1["']/.test(post.content);
                if (hasManualPlaceholder) return null;
                // blobHtmlWithCoupang이 원본과 다르면 insertUnifiedAds가 이미 카드를 삽입했으므로 React 레이어 카드 표시 안 함
                if (blobHtmlWithCoupang && blobHtmlWithCoupang !== post.content) return null;
                if (!siteConfigData) return null;
                if (siteConfigData["coupang_enabled"] !== "true" || siteConfigData["coupang_api_enabled"] !== "true") return null;
                const products = (coupangProductsData?.products ?? []).map(p => ({
                  ...p,
                  productId: String(p.productId),
                })) as CoupangProduct[];
                if (products.length === 0) return null;
                const maxPerPost = Math.min(Number(siteConfigData["coupang_max_per_post"] ?? 1), products.length);
                const displayProducts = products.slice(0, maxPerPost);
                const disclaimerText = siteConfigData["coupang_disclaimer"] !== "false"
                  ? (siteConfigData["coupang_disclaimer_text"] ?? "이 포스팅은 쿠팡 파트너스 활동의 일환으로, 이에 따른 일정액의 수수료를 제공받습니다.")
                  : "";
                const cardStyle = (siteConfigData["coupang_card_style"] ?? "image_compact") as CoupangCardStyle;
                const cardSize = (siteConfigData["coupang_card_size"] ?? "medium") as CoupangCardSize;
                const cardBgColor = siteConfigData["coupang_card_bg_color"] ?? "#ffffff";
                const btnColor = siteConfigData["coupang_btn_color"] ?? "#e11d48";
                const btnText = siteConfigData["coupang_btn_text"] ?? "지금 쿠팡에서 확인하기 →";
                const slotStyleEnabled4 = siteConfigData["coupang_slot_style_enabled"] === "true";
                const cardStyleSlots4: (CoupangCardStyle | null)[] | undefined = slotStyleEnabled4 ? [
                  (siteConfigData["coupang_card_style_1"] as CoupangCardStyle | undefined) ?? null,
                  (siteConfigData["coupang_card_style_2"] as CoupangCardStyle | undefined) ?? null,
                  (siteConfigData["coupang_card_style_3"] as CoupangCardStyle | undefined) ?? null,
                ] : undefined;
                const curationGridCount4 = Number(siteConfigData["coupang_curation_grid_count"] ?? 3) || 3;
                const curationGridTitle4 = siteConfigData["coupang_curation_grid_title"] ?? "";
                const curationGridTitleStyle4 = (siteConfigData["coupang_curation_grid_title_style"] ?? "fire") as "fire" | "sale" | "new" | "pick" | "plain";
                const maxWidth = Number(siteConfigData?.postContentWidth) || 960;
                return (
                  <div style={{ maxWidth, margin: "0 auto" }}>
                    {/* BlobIframe 글 쿠팡 카드: 카드가 여러 개일 때 시각적으로 분리하여 표시 */}
                    {displayProducts.length > 1 && (
                      <div style={{ marginTop: 8, marginBottom: 4, padding: "4px 0", borderTop: "1px dashed #e5e7eb", textAlign: "center" }}>
                        <span style={{ fontSize: 11, color: "#9ca3af", background: "#fff", padding: "0 8px", position: "relative", top: -1 }}>쿠팡 파트너스 추천 상품</span>
                      </div>
                    )}
                    {displayProducts.map((product, idx) => (
                      <div key={product.productId} style={{ marginBottom: idx < displayProducts.length - 1 ? 4 : 0 }}
                        dangerouslySetInnerHTML={{ __html: makeCoupangCardHtml([product], disclaimerText, (cardStyleSlots4 && cardStyleSlots4[idx]) ? (cardStyleSlots4[idx] as CoupangCardStyle) : cardStyle, cardSize, false, cardBgColor, btnColor, btnText, undefined, curationGridCount4, curationGridTitle4, curationGridTitleStyle4) }}
                      />
                    ))}
                  </div>
                );
              })()}
              {/* 태그 표시 */}
              {postTags && postTags.length > 0 && (
                <div style={{
                  marginTop: 32, paddingTop: 20,
                  borderTop: "1px solid #e5e7eb",
                  display: "flex", flexWrap: "wrap", gap: 8, alignItems: "center",
                }}>
                  <span style={{ fontSize: 12, fontWeight: 700, color: "#6b7280", marginRight: 4 }}>태그</span>
                  {postTags.map((tag: string) => (
                    <a
                      key={tag}
                      href={`/tag/${encodeURIComponent(tag)}`}
                      style={{
                        display: "inline-flex", alignItems: "center",
                        background: "#f0f0ff", border: "1px solid #c7d2fe",
                        borderRadius: 20, padding: "4px 12px",
                        fontSize: 12, color: "#4338ca", fontWeight: 600,
                        textDecoration: "none", transition: "all 0.15s",
                      }}
                      onMouseEnter={e => {
                        (e.currentTarget as HTMLAnchorElement).style.background = "#e0e7ff";
                        (e.currentTarget as HTMLAnchorElement).style.borderColor = "#818cf8";
                      }}
                      onMouseLeave={e => {
                        (e.currentTarget as HTMLAnchorElement).style.background = "#f0f0ff";
                        (e.currentTarget as HTMLAnchorElement).style.borderColor = "#c7d2fe";
                      }}
                    >#{tag}</a>
                  ))}
                </div>
              )}
              {/* 관련 게시물 섹션 - SNS 공유 버튼 바로 위 */}
              {relatedByTags && relatedByTags.length > 0 && (
                <div style={{ marginTop: 32, marginBottom: 0 }}>
                  <RelatedPosts
                    posts={relatedByTags}
                    currentCategory={post.category}
                    subtitle={useSimilarity ? "관련도 높은 순" : relatedSortBy === 'views' ? "조회수 많은 순" : relatedSortBy === 'likes' ? "좋아요 많은 순" : "최신순"}
                    layout={(siteConfigData?.relatedPostsLayout as 'card' | 'list' | undefined) ?? 'card'}
                  />
                </div>
              )}

                            {/* 게시물 하단 공유 버튼 */}
              <div style={{ marginTop: 32, paddingTop: 24, borderTop: "1px solid #e5e7eb" }}>
                <p style={{
                  textAlign: "center", fontSize: 13, color: "#9ca3af",
                  marginBottom: 14, fontWeight: 600, letterSpacing: "0.04em",
                }}>
                  이 글이 도움이 됐다면 공유해 주세요
                </p>
                <ShareButtons
                  url={window.location.href}
                  title={post?.title || ""}
                  description={post?.excerpt || post?.content?.replace(/<[^>]+>/g, "").slice(0, 100) || ""}
                  imageUrl={post?.thumbnail}
                />
              </div>

              {/* 하단 작성자 수정/삭제 버튼 (본문 끝) */}
              {isAuthor && (
                <div style={{
                  marginTop: 40, paddingTop: 24,
                  borderTop: "1px solid #1e2040",
                  display: "flex", justifyContent: "flex-end", gap: 10,
                }}>
                  <button
                    onClick={handleEdit}
                    style={{
                      display: "flex", alignItems: "center", gap: 7,
                      padding: "9px 22px", borderRadius: 8,
                      background: "linear-gradient(135deg, #6366f1, #8b5cf6)",
                      border: "none", fontSize: 13, fontWeight: 700, color: "#fff",
                      cursor: "pointer",
                      boxShadow: "0 4px 14px rgba(99,102,241,0.3)",
                    }}
                  >
                    <Pencil size={14} /> 글 수정하기
                  </button>
                  <button
                    onClick={() => setShowDeleteConfirm(true)}
                    style={{
                      display: "flex", alignItems: "center", gap: 7,
                      padding: "9px 22px", borderRadius: 8,
                      background: "#e5e7eb", border: "1px solid #f87171",
                      fontSize: 13, fontWeight: 700, color: "#f87171",
                      cursor: "pointer",
                    }}
                  >
                    <Trash2 size={14} /> 글 삭제하기
                  </button>
                </div>
              )}
            </div>
          </article>
        </main>

        {/* Right Sidebar - 항목이 있을 때만 컨테이너 표시 */}
        {hasRightSidebar && (
          <div className="sidebar-col" style={{ width: 160, flexShrink: 0 }}>
            <Sidebar side="right" />
          </div>
        )}
      </div>

      {/* 구 추천글 섹션 (리스트형) - 하위 호환 유지 */}
      {false && post && !relatedByTags && (
        <div style={{
          maxWidth: 1400, margin: "0 auto",
          padding: "0 10px 40px",
        }}>
          <div style={{ maxWidth: Number(siteConfigData?.postContentWidth) || 960, margin: "0 auto" }}>
          <div style={{
            borderTop: "2px solid #e5e7eb",
            paddingTop: 28,
            marginTop: 4,
          }}>
            <h3 style={{
              fontSize: 18, fontWeight: 800, color: "#111827",
              marginBottom: 4,
              display: "flex", alignItems: "center", gap: 8,
            }}>
              <span style={{
                display: "inline-block", width: 4, height: 20,
                background: "#6366f1", borderRadius: 2,
              }} />
              관련글 더 보기
            </h3>
            <p style={{ fontSize: 13, color: "#9ca3af", marginBottom: 16, marginTop: 2 }}>
              같은 카테고리의 다른 글도 읽어보세요
            </p>
            {(!similarPosts || (similarPosts as any[]).length === 0) ? (
              <div style={{
                padding: "32px 0", textAlign: "center",
                color: "#9ca3af", fontSize: 14,
                border: "1.5px dashed #e5e7eb", borderRadius: 12,
              }}>
                같은 카테고리의 다른 글이 없습니다.
              </div>
            ) : (
              <div>
                {(similarPosts as any[]).slice(0, 3).map((sp: any) => {
                  const spDate = new Date(sp.createdAt).toLocaleDateString("ko-KR", { year: "numeric", month: "long", day: "numeric" });
                  return (
                    <article
                      key={sp.id}
                      style={{
                        display: "flex", gap: 20,
                        padding: "22px 0",
                        borderBottom: "1px solid #1e2040",
                        cursor: "pointer",
                      }}
                      onClick={() => navigate(getPostUrl(sp))}
                      onMouseEnter={e => (e.currentTarget as HTMLElement).style.background = "rgba(99,102,241,0.03)"}
                      onMouseLeave={e => (e.currentTarget as HTMLElement).style.background = ""}
                    >
                      {/* 썸네일 */}
                      <div style={{
                        width: 176, height: 116,
                        borderRadius: 9, overflow: "hidden",
                        flexShrink: 0, background: "#e5e7eb",
                      }}>
                        {sp.thumbnail ? (
                          <img
                            src={sp.thumbnail}
                            srcSet={makeSrcSet(sp.thumbnail)}
                            sizes="(max-width: 640px) 100vw, 50vw"
                            alt={sp.title}
                            loading="lazy"
                            style={{ width: "100%", height: "100%", objectFit: "cover", transition: "transform 0.3s" }}
                            onMouseEnter={e => (e.currentTarget as HTMLElement).style.transform = "scale(1.05)"}
                            onMouseLeave={e => (e.currentTarget as HTMLElement).style.transform = ""}
                          />
                        ) : (
                          <div style={{
                            width: "100%", height: "100%",
                            background: "linear-gradient(135deg, #ede9fe, #ddd6fe)",
                            display: "flex", alignItems: "center", justifyContent: "center",
                            fontSize: 30,
                          }}>📄</div>
                        )}
                      </div>
                      {/* 텍스트 영역 */}
                      <div style={{ flex: 1, minWidth: 0, display: "flex", flexDirection: "column", justifyContent: "space-between" }}>
                        <div>
                          <div style={{ display: "flex", alignItems: "center", gap: 7, marginBottom: 7 }}>
                            {sp.badge && (
                              <span style={{
                                fontSize: 9, fontWeight: 800,
                                background: "#6366f1", color: "#fff",
                                padding: "2px 7px", borderRadius: 3,
                              }}>{sp.badge}</span>
                            )}
                          </div>
                          <h4 style={{
                            fontSize: 19.8, fontWeight: 800, color: "#111827",
                            lineHeight: 1.4, margin: "0 0 9px",
                            display: "-webkit-box",
                            WebkitLineClamp: 2,
                            WebkitBoxOrient: "vertical" as const,
                            overflow: "hidden",
                          }}>{sp.title}</h4>
                          <p style={{
                            fontSize: 15.5, color: "#6b7280", lineHeight: 1.7, margin: 0,
                            display: "-webkit-box",
                            WebkitLineClamp: 2,
                            WebkitBoxOrient: "vertical" as const,
                            overflow: "hidden",
                          }}>{sp.excerpt || (sp.content ? sp.content.replace(/<[^>]+>/g, "").slice(0, 120) + "..." : "")}</p>
                        </div>
                        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginTop: 12 }}>
                          <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
                            <span style={{ fontSize: 12, color: "#6b7280" }}>{spDate}</span>
                            <span style={{ display: "flex", alignItems: "center", gap: 4, fontSize: 12, color: "#6b7280" }}>
                              <Eye size={12} />{sp.views ?? 0}
                            </span>
                            <span style={{ display: "flex", alignItems: "center", gap: 4, fontSize: 12, color: "#6b7280" }}>
                              <Heart size={12} />{sp.likes ?? 0}
                            </span>
                          </div>
                          <button
                            style={{
                              display: "flex", alignItems: "center", gap: 4,
                              background: "#e5e7eb", border: "1px solid #2a2a45",
                              borderRadius: 6, padding: "6px 13px",
                              fontSize: 12, fontWeight: 700, color: "#6366f1",
                              cursor: "pointer",
                              transition: "background 0.15s",
                            }}
                            onMouseEnter={e => (e.currentTarget as HTMLElement).style.background = "#f3f4f6"}
                            onMouseLeave={e => (e.currentTarget as HTMLElement).style.background = "#e5e7eb"}
                            onClick={e => { e.stopPropagation(); navigate(getPostUrl(sp)); }}
                          >
                            더 읽기 <ChevronRight size={12} />
                          </button>
                        </div>
                      </div>
                    </article>
                  );
                })}
              </div>
            )}
          </div>
          </div>
        </div>
      )}
      {/* 태그 기반 관련 글 섹션 - 위의 추천글 섹션과 중복되므로 숨김 */}

      {/* ─── 본문 하단 광고 (댓글창 바로 위 — 멀티플렉스/수평 배너) ─────────────────────────────
           post_bottom_adsense 위치는 unifiedAdInsert.ts 에서 본문 HTML 안에 삽입됩니다.
           단, isHtml(BlobIframe) 글이나 plain-text 글은 contentWithAds를 사용하지 않으므로
           React 레이어에서 직접 슬롯3 코드를 렌더링합니다. */}
      {post && siteConfigData && siteConfigData["adsense_enabled"] === "true" &&
       siteConfigData["ads_master_enabled"] !== "false" &&
       (post as any).disableAds !== true && (() => {
        // BlobIframe / plain-text 글에만 React 레이어 하단 광고 표시 (rich-preview는 contentWithAds에서 처리)
        const isBlobOrPlain = (post as any).isAppMode ||
          ((post as any).isHtmlSource && (
            /^\s*(<!DOCTYPE|<html)/i.test(post.content.trim()) ||
            /<style[\s>]/i.test(post.content)
          )) ||
          !(post as any).isHtmlSource;
        if (!isBlobOrPlain) return null;
        const slot3Code = siteConfigData["adsense_slot3_code"]?.trim();
        if (!slot3Code) return null;
        const pushScript = `<script>(adsbygoogle = window.adsbygoogle || []).push({});<\/script>`;
        return (
          <div
            className="adsense-block adsense-block-bottom"
            style={{ margin: "24px auto 8px", textAlign: "center", clear: "both", maxWidth: "100%" }}
            dangerouslySetInnerHTML={{
              __html: slot3Code + pushScript,
            }}
          />
        );
      })()}

      {/* 댓글 섹션 - allowComments=false 시 숨김 */}
      {post && (post as any).allowComments !== false && (
        <CommentsSection
          postId={post.id}
          currentUserId={user?.id?.toString()}
          isAuthenticated={isAuthenticated}
          isAdmin={user?.role === 'admin'}
        />
      )}
      {/* 삭제 확인 AlertDialog */}
      <AlertDialog open={showDeleteConfirm} onOpenChange={setShowDeleteConfirm}>
        <AlertDialogContent
          className="bg-white text-gray-900 border border-gray-200 shadow-2xl"
          style={{ zIndex: 9999, maxWidth: 360, padding: "20px 24px 20px" }}
        >
          <AlertDialogHeader className="space-y-1 pb-3 border-b border-gray-100">
            <AlertDialogTitle className="text-gray-900 text-base font-bold flex items-center gap-2">
              <span style={{ fontSize: 18 }}>🗑️</span> 게시물 삭제
            </AlertDialogTitle>
            <AlertDialogDescription className="text-gray-500 text-xs leading-relaxed">
              삭제된 게시물은 복구할 수 없습니다. 계속하시겠습니까?
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter className="pt-3 flex flex-row justify-end gap-2">
            <AlertDialogCancel
              className="h-8 px-4 text-sm bg-gray-100 text-gray-700 border border-gray-200 hover:bg-gray-200 rounded-md"
              style={{ minWidth: 64 }}
            >
              취소
            </AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDeleteConfirm}
              className="h-8 px-4 text-sm bg-red-500 hover:bg-red-600 text-white rounded-md font-semibold"
              style={{ minWidth: 64 }}
            >
              {deleteMutation.isPending ? "삭제 중..." : "삭제"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <style>{`
        @media (max-width: 1100px) {
          .sidebar-col { display: none !important; }
        }
        /* ─── 모바일 반응형 ─── */
        @media (max-width: 768px) {
          .post-layout-wrapper { padding: 8px 8px !important; }
          .post-article-inner { padding: 20px 16px 28px !important; }
          .post-content { font-size: 15px !important; }
          /* 인라인 font-size가 있는 p/h1~h6는 제외 */
          .rich-preview:not(p[style]):not(h1[style]):not(h2[style]):not(h3[style]):not(h4[style]):not(h5[style]):not(h6[style]) { font-size: 15px; }
          .rich-preview p:not([style]), .rich-preview h1:not([style]), .rich-preview h2:not([style]),
          .rich-preview h3:not([style]), .rich-preview h4:not([style]), .rich-preview h5:not([style]),
          .rich-preview h6:not([style]) { font-size: inherit; }
          .post-title-h1 { font-size: 1.9rem !important; line-height: 1.35 !important; }
          .post-thumbnail { height: 200px !important; }
          .html-source-content { font-size: 15px; }
        }
        @media (max-width: 480px) {
          .post-article-inner { padding: 16px 12px 24px !important; }
          .post-content { font-size: 15px !important; }
          /* 인라인 font-size가 있는 p/h1~h6는 제외 */
          .rich-preview p:not([style]), .rich-preview h1:not([style]), .rich-preview h2:not([style]),
          .rich-preview h3:not([style]), .rich-preview h4:not([style]), .rich-preview h5:not([style]),
          .rich-preview h6:not([style]) { font-size: inherit; }
          .post-title-h1 { font-size: 1.6rem !important; }
          .post-thumbnail { height: 160px !important; }
          .html-source-content { font-size: 15px; }
          .rich-preview h2 { font-size: 1.25em !important; }
          .rich-preview h3 { font-size: 1.1em !important; }
          .post-content h2:not(div[style] h2):not(section[style] h2):not(.auto-toc h2) { font-size: 1.25em !important; }
          .post-content h3:not(div[style] h3):not(section[style] h3) { font-size: 1.1em !important; }
        }
        @keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }
        .post-content { color: #374151; font-size: 16px; line-height: 1.8; }

        /* ─── HTML 소스 모드 전용 완전 격리 ─── */
        /* html-source-content: 블로그 CSS 차단, 브라우저 기본값 + 원본 HTML 스타일 사용 */
        /* all:initial 금지 - 브라우저 기본 스타일(table/h2/strong 등)까지 날아가 구조 붕괴 */
        .html-source-content {
          display: block;
          width: 100%;
          max-width: 100%;
          overflow-x: hidden;
          box-sizing: border-box;
        }
        /* html-source-content 내 블록 요소: 폭 제한 + box-sizing */
        /* 단, 표 셀(td/th)과 원형 요소는 제외 */
        .html-source-content *:not(td):not(th):not([style*="border-radius: 50%"]):not([style*="border-radius:50%"]):not([style*="border-radius: 9999px"]):not([style*="border-radius:9999px"]):not(.toc-num):not(.step-num):not(.num):not(.circle-num):not(.circle):not(.number-badge):not(.plugin-num):not(.badge-num) {
          max-width: 100%;
          box-sizing: border-box;
        }
        /* 표 셀: 내부 레이아웃 보존 - 인라인 스타일 없는 경우에만 기본 패딩 적용 */
        /* !important 제거: HTML 원본의 thead/tbody 스타일(background, border, color, padding)이 보존되도록 */
        .html-source-content td,
        .html-source-content th {
          box-sizing: border-box;
          max-width: none;
          word-break: break-word;
          white-space: normal;
        }
        /* 인라인 스타일 없는 셀에만 기본 패딩 적용 */
        .html-source-content td:not([style]),
        .html-source-content th:not([style]) {
          padding: 8px 12px;
          min-width: 60px;
        }
        /* 원형 번호 요소: 찌그러짐 방지 - 인라인 style 기반 */
        .html-source-content [style*="border-radius: 50%"],
        .html-source-content [style*="border-radius:50%"],
        .html-source-content [style*="border-radius: 9999px"],
        .html-source-content [style*="border-radius:9999px"] {
          max-width: none !important;
          flex-shrink: 0 !important;
          min-width: 0 !important;
          display: inline-flex !important;
          align-items: center !important;
          justify-content: center !important;
        }
        /* 원형 번호 클래스 기반 예외: .step-num, .num, .toc-num 등 */
        .html-source-content .step-num,
        .html-source-content .toc-num,
        .html-source-content .num,
        .html-source-content .circle-num,
        .html-source-content .circle,
        .html-source-content .number-badge,
        .html-source-content .plugin-num,
        .html-source-content .badge-num,
        .html-source-content li > span:first-child[style*="width"],
        .html-source-content li > div:first-child[style*="width"] {
          max-width: none !important;
          width: revert !important;
          height: revert !important;
          flex-shrink: 0 !important;
          display: inline-flex !important;
          align-items: center !important;
          justify-content: center !important;
        }
        /* li::before 가상 요소: 원형 번호 찌그러짐 방지 */
        .html-source-content li::before {
          max-width: none !important;
          flex-shrink: 0 !important;
          box-sizing: content-box !important;
        }
        /* 블로그 전역 CSS 차단: h1~h6 */
        .html-source-content h1,
        .html-source-content h2,
        .html-source-content h3,
        .html-source-content h4,
        .html-source-content h5,
        .html-source-content h6 {
          all: revert;
          box-sizing: border-box;
        }
        /* 블로그 전역 CSS 차단: p */
        .html-source-content p {
          all: revert;
          box-sizing: border-box;
        }
        /* 블로그 전역 CSS 차단: ul/ol/li */
        .html-source-content ul,
        .html-source-content ol,
        .html-source-content li {
          all: revert;
          box-sizing: border-box;
        }
        /* 블로그 전역 CSS 차단: table */
        /* all:revert 금지 - HTML 원본 <style> 태그의 thead/tr background/border/color 스타일이 사라짐 */
        /* 블로그 전역 CSS에서 table에 적용되는 속성만 선택적으로 초기화 */
        .html-source-content table {
          box-sizing: border-box;
          max-width: 100%;
          overflow-x: auto;
          display: table;
          border-spacing: 0;
          border-collapse: collapse;
          width: 100%;
          font-size: 15px;
          line-height: 1.6;
          color: #000000;
          word-break: keep-all;
          margin: 1.5em 0 2em;
        }
        .html-source-content thead,
        .html-source-content tbody,
        .html-source-content tfoot,
        .html-source-content tr {
          box-sizing: border-box;
        }
        /* th 기본 스타일: 인라인 스타일 없는 경우에만 네이비 헤더 적용 */
        .html-source-content th {
          box-sizing: border-box;
          word-break: break-word;
          white-space: normal;
          max-width: none;
        }
        /* 인라인 스타일 없는 th에만 기본 헤더 스타일 적용 */
        .html-source-content th:not([style]) {
          padding: 11px 14px;
          font-weight: 700;
          border: 1px solid #1e3a5f;
          text-align: left;
          background: #1e3a5f;
          color: #ffffff;
        }
        /* thead가 있는 경우 thead th에 네이비 헤더 (인라인 스타일 없는 경우만) */
        .html-source-content thead th:not([style]) {
          background: #1e3a5f;
          color: #ffffff;
          border: 1px solid #1e3a5f;
          padding: 11px 14px;
          font-weight: 700;
          text-align: center;
        }
        /* tbody 안의 첫 번째 tr의 th도 헤더로 처리 (thead 없는 경우, 인라인 스타일 없는 경우만) */
        .html-source-content tbody tr:first-child th:not([style]) {
          background: #1e3a5f;
          color: #ffffff;
          border: 1px solid #1e3a5f;
          padding: 11px 14px;
          font-weight: 700;
          text-align: center;
        }
        /* td 기본 스타일 */
        .html-source-content td {
          box-sizing: border-box;
          word-break: break-word;
          white-space: normal;
          max-width: none;
        }
        /* 인라인 스타일 없는 td에만 기본 패딩/테두리 적용 */
        .html-source-content td:not([style]) {
          padding: 10px 14px;
          border: 1px solid #cbd5e1;
          vertical-align: top;
        }
        /* tbody 행 배경: tr과 td 모두 인라인 스타일 없는 경우에만 줄무늬 배경 적용 */
        /* tr에 인라인 스타일이 있으면 원본 배경색 유지 */
        .html-source-content tbody tr:not([style]):nth-child(even) td:not([style]) {
          background: #f8fafc;
        }
        .html-source-content tbody tr:not([style]):nth-child(odd) td:not([style]) {
          background: #ffffff;
        }
        /* tbody 첫 번째 행: thead가 없는 표에서만 헤더 스타일 적용 */
        /* tr과 td 모두 인라인 스타일 없는 경우에만 적용 */
        /* 주의: thead가 있는 표의 tbody 첫 행은 데이터 행이므로 네이비 적용 안 함 */
        /* warn-box / tip-box 폴백 스타일 */
        .html-source-content .warn-box {
          background: #fff7ed;
          border-left: 4px solid #f97316;
          border-radius: 0 8px 8px 0;
          padding: 14px 18px;
          margin: 1.5em 0;
          font-size: 15px;
          color: #7c2d12;
          line-height: 1.7;
        }
        .html-source-content .tip-box {
          background: #eff6ff;
          border-left: 4px solid #2563eb;
          border-radius: 0 8px 8px 0;
          padding: 14px 18px;
          margin: 1.5em 0;
          font-size: 15px;
          color: #1e3a5f;
          line-height: 1.7;
        }
        /* toc-box 폴백 스타일 */
        .html-source-content .toc-box {
          background: #f8fafc;
          border: 2px solid #e2e8f0;
          border-radius: 12px;
          padding: 22px 26px;
          margin: 2.35em 0;
        }
        /* 블로그 전역 CSS 차단: a */
        .html-source-content a {
          all: revert;
          box-sizing: border-box;
        }
        /* 블로그 전역 CSS 차단: strong/em/code/span */
        .html-source-content strong,
        .html-source-content em,
        .html-source-content code,
        .html-source-content pre,
        .html-source-content blockquote {
          all: revert;
          box-sizing: border-box;
        }
        /* img 오버플로우 방지 + 편집기와 동일한 여백 */
        .html-source-content img { max-width: 100%; height: auto; margin: 1em 0; display: block; }
        .html-source-content p > img { margin: 0; display: inline-block; }
        .html-source-content p:has(> img:only-child) { margin: 1em 0; text-align: center; }
        /* h1 제목 항상 가운데 정렬 */
        .html-source-content h1 { text-align: center !important; }
        /* auto-toc 예외: html-source-content 안에서도 블로그 목차 스타일 적용 */
        .html-source-content .auto-toc { background: #f8f9ff !important; border: 2px solid #e0e7ff !important; border-left: 5px solid #6366f1 !important; border-radius: 10px !important; padding: 20px 24px 16px !important; margin: 0 0 2em !important; }
        .html-source-content .auto-toc h2 { all: unset !important; display: flex !important; align-items: center !important; gap: 6px !important; font-size: 1em !important; font-weight: 800 !important; color: #4f46e5 !important; margin: 0 0 12px !important; }
        .html-source-content .auto-toc h2::before { content: '\\1F4CB'; font-size: 1em; }
        .html-source-content .auto-toc ol { all: unset !important; display: block !important; padding: 0 !important; margin: 0 !important; list-style: none !important; counter-reset: toc-counter !important; }
        .html-source-content .auto-toc ol li { all: unset !important; display: flex !important; align-items: baseline !important; gap: 10px !important; margin: 7px 0 !important; font-size: 0.93em !important; list-style: none !important; counter-increment: toc-counter !important; background: none !important; padding: 0 !important; }
        .html-source-content .auto-toc ol li::before { all: unset !important; content: counter(toc-counter) !important; display: inline-flex !important; align-items: center !important; justify-content: center !important; min-width: 22px !important; height: 22px !important; background: #6366f1 !important; color: #fff !important; border-radius: 50% !important; font-size: 0.8em !important; font-weight: 700 !important; flex-shrink: 0 !important; }
        .html-source-content .auto-toc ol li a { all: unset !important; color: #4f46e5 !important; text-decoration: none !important; font-weight: 600 !important; cursor: pointer !important; }
        .html-source-content .auto-toc ol li a:hover { color: #6366f1 !important; text-decoration: underline !important; }

        /* ─── 커스텀 HTML 격리: 블로그 CSS만 차단, 인라인 스타일(display:grid 등) 보존 ─── */
        /* 주의: all:revert 미사용 - 인라인 스타일을 덮어쓰므로 금지 */
        /* h1~h6: 블로그 제목 스타일 차단 */
        .post-content div[style] h1, .post-content div[style] h2, .post-content div[style] h3,
        .post-content div[style] h4, .post-content div[style] h5, .post-content div[style] h6,
        .post-content section[style] h1, .post-content section[style] h2, .post-content section[style] h3,
        .post-content section[style] h4, .post-content section[style] h5, .post-content section[style] h6,
        .post-content .html-embed h1, .post-content .html-embed h2, .post-content .html-embed h3,
        .post-content .html-embed h4, .post-content .html-embed h5, .post-content .html-embed h6 {
          border-bottom: none !important;
          padding-bottom: unset;
          color: unset;
          font-size: unset;
          font-weight: unset;
          margin: unset;
        }
        /* p: 블로그 여백 차단 */
        .post-content div[style] p, .post-content section[style] p,
        .post-content .html-embed p { margin: 0; min-height: unset; }
        /* img: 블로그 border-radius/margin 차단 */
        .post-content div[style] img, .post-content section[style] img,
        .post-content .html-embed img { border-radius: 0; margin: 0; max-width: 100%; }
        /* a: 블로그 링크 색상 차단 */
        .post-content div[style] a, .post-content section[style] a,
        .post-content .html-embed a { color: unset; text-decoration: unset; }
        /* strong/em/code/span: 블로그 색상 차단 */
        .post-content div[style] strong, .post-content section[style] strong,
        .post-content .html-embed strong { color: unset; }
        .post-content div[style] em, .post-content section[style] em,
        .post-content .html-embed em { color: unset; }
        .post-content div[style] code, .post-content section[style] code,
        .post-content .html-embed code { background: none; color: unset; padding: 0; font-size: unset; }
        .post-content div[style] span, .post-content section[style] span,
        .post-content .html-embed span { color: unset; }

        /* ─── 일반 본문 요소 스타일 (직접 작성한 내용에만 적용) ─── */
        .post-content > h1, .post-content > p > span > h1 { font-size: 1.8em; font-weight: 900; color: #111827; margin: 1.2em 0 0.5em; }
        .post-content h1:not(div[style] h1):not(section[style] h1) { font-size: 1.8em; font-weight: 900; color: #111827; margin: 1.2em 0 0.5em; }
        .post-content h2:not(div[style] h2):not(section[style] h2):not(.auto-toc h2) { font-size: 1.4em; font-weight: 800; color: #1f2937; margin: 1em 0 0.4em; padding-bottom: 8px; border-bottom: 1px solid #e5e7eb; }
        .post-content h3:not(div[style] h3):not(section[style] h3) { font-size: 1.15em; font-weight: 700; color: #374151; margin: 0.9em 0 0.3em; }
        .post-content > p { margin: 0.5em 0; }
        .post-content > p:empty { min-height: 1.2em; display: block; }
        .post-content > p:has(> br:only-child) { min-height: 1.2em; }
        .post-content strong:not(div[style] strong):not(section[style] strong) { color: inherit; font-weight: 800; }
        .post-content em:not(div[style] em):not(section[style] em) { color: inherit; font-style: italic; }
        .post-content u { text-decoration: underline; }
        .post-content s { text-decoration: line-through; color: inherit; }
        .post-content code:not(div[style] code):not(section[style] code) { background: #f3f4f6; color: #6366f1; padding: 2px 7px; border-radius: 4px; font-size: 0.88em; font-family: 'Fira Code', monospace; }
        .post-content pre:not(div[style] pre):not(section[style] pre) { background: #f8fafc; border: 1px solid #e5e7eb; border-radius: 10px; padding: 18px 20px; overflow-x: auto; margin: 1.2em 0; }
        .post-content pre code { background: none; color: #6366f1; padding: 0; }
        .post-content blockquote:not(div[style] blockquote) { border-left: 4px solid #6366f1; padding: 10px 18px; margin: 1.2em 0; background: rgba(99,102,241,0.06); border-radius: 0 8px 8px 0; color: #6b7280; font-style: italic; }
        .post-content ul:not(div[style] ul):not(section[style] ul) { padding-left: 1.6em; margin: 0.7em 0; list-style: disc; }
        .post-content ol:not(div[style] ol):not(section[style] ol) { padding-left: 1.6em; margin: 0.7em 0; list-style: decimal; }
        .post-content li:not(div[style] li):not(section[style] li) { margin: 0.3em 0; }
        .post-content a:not(div[style] a):not(section[style] a) { color: #6366f1; text-decoration: underline; }
        .post-content img:not(div[style] img):not(section[style] img) { max-width: 100%; border-radius: 10px; margin: 1em 0; display: block; }
        .post-content img[data-align="left"] { margin-left: 0; margin-right: auto; }
        .post-content img[data-align="center"] { margin-left: auto; margin-right: auto; }
        .post-content img[data-align="right"] { margin-left: auto; margin-right: 0; }
        .post-content hr { border: none; border-top: 1px solid #e5e7eb; margin: 2em 0; }
        /* mark: 기본 형광펜 스타일 — color는 inherit 유지하여 인라인 스타일 보존 */
        .post-content mark { background: rgba(254,240,138,0.5); padding: 1px 4px; border-radius: 3px; }
        /* mark[data-color]: TipTap Highlight 확장 출력 — 인라인 background-color/color 그대로 표시 */
        /* CSS background 규칙 없음 → 인라인 style="background-color:..." 그대로 적용됨 */
        .post-content mark[data-color] { padding: 1px 4px; border-radius: 3px; }
        .post-content table:not(div[style] table):not(section[style] table) { border-collapse: collapse; width: 100%; margin: 1.2em 0; }
        .post-content td:not(div[style] td):not(section[style] td), .post-content th:not(div[style] th):not(section[style] th) { border: 1px solid #e5e7eb; padding: 10px 14px; text-align: left; vertical-align: top; }
        .post-content th:not(div[style] th):not(section[style] th) { background: #f3f4f6; font-weight: 700; color: #6366f1; }
        /* TipTap이 td/th 안에 <p> 태그를 생성하므로 margin/min-height 리셋 */
        .post-content td p, .post-content th p { margin: 0 !important; min-height: unset !important; }
        .post-content td p + p, .post-content th p + p { margin-top: 0.4em !important; }
        .post-content .is-empty::before { content: ''; display: block; }
        /* 자동 생성 목차 스타일 */
        .post-content .auto-toc { background: #f8f9ff; border: 2px solid #e0e7ff; border-left: 5px solid #6366f1; border-radius: 10px; padding: 20px 24px 16px; margin: 0 0 2em; }
        .post-content .auto-toc h2 { font-size: 1em !important; font-weight: 800 !important; color: #4f46e5 !important; margin: 0 0 12px !important; padding-bottom: 0 !important; border-bottom: none !important; display: flex !important; align-items: center; gap: 6px; }
        .post-content .auto-toc h2::before { content: '\\1F4CB'; font-size: 1em; }
        .post-content .auto-toc ol { padding-left: 1.4em !important; margin: 0 !important; list-style: decimal !important; counter-reset: toc-counter; }
        .post-content .auto-toc ol li { margin: 5px 0 !important; font-size: 0.93em; display: list-item !important; }
        .post-content .auto-toc ol li a { color: #4f46e5 !important; text-decoration: none !important; font-weight: 600; transition: color 0.15s; }
        .post-content .auto-toc ol li a:hover { color: #6366f1 !important; text-decoration: underline !important; }
        .rich-preview { color: #374151; font-size: 16px; line-height: 1.8; }
        .rich-preview p[style*="line-height"] { line-height: inherit !important; }
        .rich-preview h1[style*="line-height"] { line-height: inherit !important; }
        .rich-preview h2[style*="line-height"] { line-height: inherit !important; }
        .rich-preview h3[style*="line-height"] { line-height: inherit !important; }
        .rich-preview h4[style*="line-height"] { line-height: inherit !important; }
        .rich-preview h5[style*="line-height"] { line-height: inherit !important; }
        .rich-preview td[style*="line-height"] { line-height: inherit !important; }
        .rich-preview th[style*="line-height"] { line-height: inherit !important; }
        /* ─── rich-preview 커스텀 HTML 격리: 인라인 스타일이 있는 div/section 내부는 블로그 CSS 리셋 ─── */
        .rich-preview div[style] > h1, .rich-preview div[style] > h2, .rich-preview div[style] > h3,
        .rich-preview div[style] > h4, .rich-preview div[style] > h5, .rich-preview div[style] > h6,
        .rich-preview section[style] > h1, .rich-preview section[style] > h2, .rich-preview section[style] > h3,
        .rich-preview section[style] > h4, .rich-preview section[style] > h5, .rich-preview section[style] > h6 {
          border-bottom: none !important;
          padding-bottom: unset !important;
          color: unset !important;
          font-size: unset !important;
          font-weight: unset !important;
          margin: unset !important;
        }
        .rich-preview div[style] > p, .rich-preview section[style] > p { margin: 0; min-height: unset; }
        .rich-preview div[style] > img, .rich-preview section[style] > img { border-radius: 0; margin: 0; max-width: 100%; }
        .rich-preview div[style] > a, .rich-preview section[style] > a { color: unset; text-decoration: unset; }
        .rich-preview div[style] > strong, .rich-preview section[style] > strong { color: unset; }
        .rich-preview div[style] > em, .rich-preview section[style] > em { color: unset; }
        .rich-preview div[style] > code, .rich-preview section[style] > code { background: none; color: unset; padding: 0; font-size: unset; }
        .rich-preview div[style] > span, .rich-preview section[style] > span { color: unset; }
        /* ─── rich-preview 일반 본문 스타일 ─── */
        .rich-preview h1 { font-size: 2.2em !important; font-weight: 900 !important; color: #111827; margin: 1.2em 0 0.5em; }
        .rich-preview h2 { font-size: 1.75em !important; font-weight: 800 !important; color: #1f2937; margin: 1em 0 0.4em; padding-bottom: 8px; border-bottom: 1px solid #e5e7eb; }
        .rich-preview h3 { font-size: 1.4em !important; font-weight: 700 !important; color: #374151; margin: 0.9em 0 0.3em; }
        .rich-preview h4 { font-size: 1.15em !important; font-weight: 700 !important; color: #374151; margin: 0.8em 0 0.3em; }
        .rich-preview h5 { font-size: 1.0em !important; font-weight: 700 !important; color: #374151; margin: 0.7em 0 0.2em; }
        .rich-preview h6 { font-size: 0.95em !important; font-weight: 700 !important; color: #6b7280; margin: 0.6em 0 0.2em; }
        .rich-preview > p { margin: 0.5em 0; }
        .rich-preview > p:empty { min-height: 1.2em; display: block; }
        .rich-preview > p:has(> br:only-child) { min-height: 1.2em; }
        .rich-preview strong { color: inherit; font-weight: 800; }
        .rich-preview em { color: inherit; font-style: italic; }
        .rich-preview code { background: #f3f4f6; color: #6366f1; padding: 2px 7px; border-radius: 4px; font-size: 0.88em; font-family: 'Fira Code', monospace; }
        .rich-preview pre { background: #f8fafc; border: 1px solid #e5e7eb; border-radius: 10px; padding: 18px 20px; overflow-x: auto; margin: 1.2em 0; }
        .rich-preview pre code { background: none; color: #6366f1; padding: 0; }
        .rich-preview blockquote { border-left: 4px solid #6366f1; padding: 10px 18px; margin: 1.2em 0; background: rgba(99,102,241,0.06); border-radius: 0 8px 8px 0; color: #6b7280; font-style: italic; }
        .rich-preview ul { padding-left: 1.6em; margin: 0.7em 0; list-style: disc; }
        .rich-preview ol { padding-left: 1.6em; margin: 0.7em 0; list-style: decimal; }
        .rich-preview li { margin: 0.3em 0; }
        .rich-preview a { color: #6366f1; text-decoration: underline; }
        .rich-preview img { max-width: 100%; border-radius: 10px; margin: 1em 0; display: block; }
        /* p 태그 안의 img는 p의 margin이 여백을 담당하므로 img 자체 margin 제거 */
        .rich-preview p > img { margin-top: 0; margin-bottom: 0; }
        /* 이미지만 있는 p 태그: 이미지 중앙 정렬 */
        .rich-preview p:has(> img:only-child) { text-align: center; margin: 1em 0; }
        .rich-preview img[data-align="left"] { margin-left: 0; margin-right: auto; }
        .rich-preview img[data-align="center"] { margin-left: auto; margin-right: auto; }
        .rich-preview img[data-align="right"] { margin-left: auto; margin-right: 0; }
        .rich-preview hr { border: none; border-top: 1px solid #e5e7eb; margin: 2em 0; }
        /* mark: 기본 형광펜 스타일 — color는 inherit 유지하여 인라인 스타일 보존 */
        .rich-preview mark { background: rgba(254,240,138,0.5); padding: 1px 4px; border-radius: 3px; }
        /* mark[data-color]: TipTap Highlight 확장 출력 — 인라인 background-color/color 그대로 표시 */
        /* CSS background 규칙 없음 → 인라인 style="background-color:..." 그대로 적용됨 */
        .rich-preview mark[data-color] { padding: 1px 4px; border-radius: 3px; }
        /* 표: 인라인 style 속성이 있는 경우 CSS 규칙이 덮어쓰지 않도록 보정 */
        .rich-preview table { border-collapse: collapse; width: 100%; margin: 1.2em 0; }
        .rich-preview table[style] { width: unset; }
        .rich-preview td, .rich-preview th { border: 1px solid #e5e7eb; padding: 10px 14px; text-align: left; vertical-align: top; }
        .rich-preview td[style] { background: unset; border: unset; }
        .rich-preview th[style] { background: unset; border: unset; }
        .rich-preview th:not([style]) { background: #f3f4f6; font-weight: 700; color: #6366f1; }
        .rich-preview th[style] { font-weight: 700; }
        /* TipTap이 td/th 안에 <p> 태그를 생성하므로 margin/min-height 리셋 */
        .rich-preview td p, .rich-preview th p { margin: 0 !important; min-height: unset !important; }
        .rich-preview td p + p, .rich-preview th p + p { margin-top: 0.4em !important; }
        /* 자동 생성 목차 스타일 (rich-preview) */
        .rich-preview .auto-toc { background: #f8f9ff; border: 2px solid #e0e7ff; border-left: 5px solid #6366f1; border-radius: 10px; padding: 20px 24px 16px; margin: 0 0 2em; }
        .rich-preview .auto-toc h2 { font-size: 1em !important; font-weight: 800 !important; color: #4f46e5 !important; margin: 0 0 12px !important; padding-bottom: 0 !important; border-bottom: none !important; display: flex !important; align-items: center; gap: 6px; }
        .rich-preview .auto-toc h2::before { content: '\\1F4CB'; font-size: 1em; }
        .rich-preview .auto-toc ol { padding-left: 1.4em !important; margin: 0 !important; list-style: decimal !important; }
        .rich-preview .auto-toc ol li { margin: 5px 0 !important; font-size: 0.93em; display: list-item !important; }
        .rich-preview .auto-toc ol li a { color: #4f46e5 !important; text-decoration: none !important; font-weight: 600; transition: color 0.15s; }
        .rich-preview .auto-toc ol li a:hover { color: #6366f1 !important; text-decoration: underline !important; }
        /* ─── 영상 래퍼 (video-wrapper) ─── */
        /* 리스폰시브 16:9 비율 래퍼: padding-bottom:56.25% + height:0 패턴 */
        .rich-preview .video-wrapper { position: relative; padding-bottom: 56.25%; height: 0; overflow: hidden; margin: 16px 0; border-radius: 10px; background: #000; }
        .rich-preview .video-wrapper video,
        .rich-preview .video-wrapper iframe { position: absolute; top: 0; left: 0; width: 100%; height: 100%; border: none; border-radius: 10px; }
        /* video-wrapper 없이 직접 삽입된 video 태그 폴백 */
        .rich-preview video { max-width: 100%; border-radius: 10px; margin: 1em 0; display: block; }
        /* video-wrapper 없이 직접 삽입된 iframe 폰백 */
        .rich-preview > iframe { max-width: 100%; border-radius: 10px; margin: 1em 0; display: block; }
      `}</style>
    </div>
  );
}

