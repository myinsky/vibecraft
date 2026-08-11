import { useState, useMemo } from "react";
import { useLocation } from "wouter";
import { trpc } from "@/lib/trpc";
import { useSEO } from "@/hooks/useSEO";
import { useAuth } from "@/_core/hooks/useAuth";
import { getLoginUrl } from "@/const";
import { toast } from "sonner";
import Header from "../components/Header";
import {
  FileText, Edit3, Trash2, Send, Clock, Loader2, PenSquare,
} from "lucide-react";

// 색상 팔레트 (navItems 인덱스 순환)
const COLOR_PALETTE = ["#7c3aed", "#e11d48", "#10b981", "#0ea5e9", "#f59e0b", "#6366f1", "#ec4899"];

/** navItem path에서 카테고리 키 추출 */
function extractCategoryKey(path: string): string {
  const m = path.match(/\/category\/([^/?#]+)/);
  return m ? m[1] : path.replace(/^.*\//, "");
}

export default function DraftsPage() {
  useSEO({ title: "임시저장 글 | 스마트 오토 가이드" });
  const [, navigate] = useLocation();
  const { isAuthenticated, loading: authLoading } = useAuth();
  const [deletingId, setDeletingId] = useState<number | null>(null);
  const [publishingId, setPublishingId] = useState<number | null>(null);
  const [confirmDeleteId, setConfirmDeleteId] = useState<number | null>(null);

  const { data: drafts, isLoading, refetch } = trpc.posts.listDrafts.useQuery(
    undefined,
    { enabled: isAuthenticated }
  );

  // DB navItems에서 카테고리 레이블/색상 동적 로드
  const { data: navItemsData } = trpc.admin.getNavItems.useQuery();
  const navMap = useMemo(() => {
    const map: Record<string, { label: string; color: string }> = {};
    if (navItemsData && navItemsData.length > 0) {
      const sorted = [...navItemsData].sort((a, b) => (a.sortOrder ?? 0) - (b.sortOrder ?? 0));
      sorted.forEach((item, idx) => {
        const key = extractCategoryKey(item.path || "");
        map[key] = {
          label: item.label,
          color: COLOR_PALETTE[idx % COLOR_PALETTE.length],
        };
      });
    }
    return map;
  }, [navItemsData]);

  const getCatInfo = (category: string) => {
    if (navMap[category]) return navMap[category];
    return { label: category, color: "#6366f1" };
  };

  const deletePost = trpc.posts.delete.useMutation({
    onSuccess: () => {
      toast.success("임시저장이 삭제되었습니다.");
      setDeletingId(null);
      setConfirmDeleteId(null);
      refetch();
    },
    onError: (err) => {
      toast.error("삭제 실패: " + err.message);
      setDeletingId(null);
    },
  });

  const publishDraft = trpc.posts.publishDraft.useMutation({
    onSuccess: (post) => {
      toast.success("글이 발행되었습니다!");
      setPublishingId(null);
      if (post?.id) {
        navigate(`/post/${post.id}`);
      } else {
        refetch();
      }
    },
    onError: (err) => {
      toast.error("발행 실패: " + err.message);
      setPublishingId(null);
    },
  });

  const handleDelete = (id: number) => {
    setDeletingId(id);
    deletePost.mutate({ id });
  };

  const handlePublish = (id: number) => {
    setPublishingId(id);
    publishDraft.mutate({ id });
  };

  // 로그인 필요
  if (!authLoading && !isAuthenticated) {
    return (
      <div style={{ minHeight: "100vh", background: "#f9fafb", fontFamily: "'Noto Sans KR', sans-serif" }}>
        <Header />
        <div style={{ textAlign: "center", padding: "100px 20px" }}>
          <div style={{ fontSize: 40, marginBottom: 16 }}>🔐</div>
          <div style={{ fontSize: 18, fontWeight: 700, color: "#111827", marginBottom: 8 }}>로그인이 필요합니다</div>
          <div style={{ fontSize: 13, color: "#6b7280", marginBottom: 24 }}>임시저장 목록을 보려면 먼저 로그인해주세요.</div>
          <a
            href={getLoginUrl(window.location.pathname)}
            style={{
              padding: "10px 28px",
              background: "linear-gradient(135deg, #6366f1, #8b5cf6)",
              borderRadius: 8, fontSize: 14, fontWeight: 700, color: "#fff",
              textDecoration: "none",
            }}
          >로그인하기</a>
        </div>
      </div>
    );
  }

  return (
    <div style={{ minHeight: "100vh", background: "#f9fafb", fontFamily: "'Noto Sans KR', 'Apple SD Gothic Neo', sans-serif" }}>
      <Header />
      <div style={{ maxWidth: 960, margin: "0 auto", padding: "32px 16px 60px" }}>
        {/* 페이지 헤더 */}
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 28 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
            <div style={{
              width: 36, height: 36,
              background: "linear-gradient(135deg, #6366f1, #8b5cf6)",
              borderRadius: 10, display: "flex", alignItems: "center", justifyContent: "center",
              boxShadow: "0 0 14px rgba(99,102,241,0.4)",
            }}>
              <FileText size={17} color="#fff" />
            </div>
            <div>
              <div style={{ fontSize: 20, fontWeight: 900, color: "#111827" }}>임시저장 목록</div>
              <div style={{ fontSize: 12, color: "#6b7280", marginTop: 2 }}>
                {drafts ? `${drafts.length}개의 임시저장된 글` : "로딩 중..."}
              </div>
            </div>
          </div>
          <button
            onClick={() => navigate("/write")}
            style={{
              display: "flex", alignItems: "center", gap: 7,
              padding: "9px 20px", borderRadius: 8,
              background: "linear-gradient(135deg, #6366f1, #8b5cf6)",
              border: "none", fontSize: 13, fontWeight: 700,
              color: "#fff", cursor: "pointer",
              boxShadow: "0 4px 14px rgba(99,102,241,0.4)",
            }}
          >
            <PenSquare size={14} />
            새 글 작성
          </button>
        </div>

        {/* 로딩 상태 */}
        {(isLoading || authLoading) && (
          <div style={{ display: "flex", alignItems: "center", justifyContent: "center", padding: "60px 0", gap: 12, color: "#6b7280" }}>
            <Loader2 size={24} style={{ animation: "spin 1s linear infinite" }} />
            <span>불러오는 중...</span>
          </div>
        )}

        {/* 빈 상태 */}
        {!isLoading && !authLoading && drafts && drafts.length === 0 && (
          <div style={{
            textAlign: "center", padding: "80px 20px",
            background: "#ffffff", border: "1px solid #2a2a45",
            borderRadius: 16,
          }}>
            <div style={{ fontSize: 48, marginBottom: 16 }}>📝</div>
            <div style={{ fontSize: 16, fontWeight: 700, color: "#6b7280", marginBottom: 8 }}>임시저장된 글이 없습니다</div>
            <div style={{ fontSize: 13, color: "#6b7280", marginBottom: 24 }}>
              글쓰기 페이지에서 "임시저장" 버튼을 누르거나<br />
              30초마다 자동으로 저장됩니다.
            </div>
            <button
              onClick={() => navigate("/write")}
              style={{
                padding: "10px 24px",
                background: "linear-gradient(135deg, #6366f1, #8b5cf6)",
                border: "none", borderRadius: 8,
                fontSize: 13, fontWeight: 700, color: "#fff",
                cursor: "pointer",
              }}
            >새 글 작성하기</button>
          </div>
        )}

        {/* 임시저장 목록 */}
        {drafts && drafts.length > 0 && (
          <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
            {drafts.map((draft) => {
              const catInfo = getCatInfo(draft.category);
              const catColor = catInfo.color;
              const catLabel = catInfo.label;
              const isDeleting = deletingId === draft.id;
              const isPublishing = publishingId === draft.id;
              const isConfirmingDelete = confirmDeleteId === draft.id;

              return (
                <div key={draft.id} style={{
                  background: "#ffffff",
                  border: isConfirmingDelete ? "1.5px solid #e11d48" : "1px solid #2a2a45",
                  borderRadius: 14,
                  padding: "18px 20px",
                  transition: "border-color 0.2s",
                }}>
                  {/* 삭제 확인 모드 */}
                  {isConfirmingDelete ? (
                    <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12 }}>
                      <div style={{ fontSize: 13, color: "#f87171", fontWeight: 700 }}>
                        "{draft.title || "(제목 없음)"}" 을(를) 삭제하시겠습니까?
                      </div>
                      <div style={{ display: "flex", gap: 8 }}>
                        <button
                          onClick={() => setConfirmDeleteId(null)}
                          style={{
                            padding: "7px 16px", borderRadius: 7,
                            background: "#1e1e35", border: "1px solid #2a2a45",
                            color: "#6b7280", fontSize: 12, fontWeight: 700, cursor: "pointer",
                          }}
                        >취소</button>
                        <button
                          onClick={() => handleDelete(draft.id)}
                          disabled={isDeleting}
                          style={{
                            padding: "7px 16px", borderRadius: 7,
                            background: "#e11d48", border: "none",
                            color: "#fff", fontSize: 12, fontWeight: 700,
                            cursor: isDeleting ? "not-allowed" : "pointer",
                            display: "flex", alignItems: "center", gap: 5,
                          }}
                        >
                          {isDeleting ? <Loader2 size={12} style={{ animation: "spin 1s linear infinite" }} /> : <Trash2 size={12} />}
                          {isDeleting ? "삭제 중..." : "삭제"}
                        </button>
                      </div>
                    </div>
                  ) : (
                    <div style={{ display: "flex", alignItems: "center", gap: 16 }}>
                      {/* 썸네일 */}
                      {draft.thumbnail ? (
                        <img
                          src={draft.thumbnail}
                          alt=""
                          loading="lazy"
                          decoding="async"
                          sizes="72px"
                          srcSet={draft.thumbnail.startsWith('/manus-storage/') && !draft.thumbnail.includes('?w=') ? `${draft.thumbnail}?w=320 320w, ${draft.thumbnail}?w=640 640w` : undefined}
                          style={{ width: 72, height: 52, objectFit: "cover", borderRadius: 8, flexShrink: 0 }}
                        />
                      ) : (
                        <div style={{
                          width: 72, height: 52, borderRadius: 8, flexShrink: 0,
                          background: "linear-gradient(135deg, #1e1e35, #2a2a45)",
                          display: "flex", alignItems: "center", justifyContent: "center",
                        }}>
                          <FileText size={20} color="#6b7280" />
                        </div>
                      )}

                      {/* 제목 및 메타 */}
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 4 }}>
                          <span style={{
                            fontSize: 10, fontWeight: 800,
                            color: catColor,
                            background: catColor + "18",
                            padding: "2px 8px", borderRadius: 10,
                            border: `1px solid ${catColor}33`,
                          }}>{catLabel}</span>
                          <span style={{
                            fontSize: 10, fontWeight: 700,
                            color: "#f59e0b",
                            background: "rgba(245,158,11,0.1)",
                            padding: "2px 8px", borderRadius: 10,
                            border: "1px solid rgba(245,158,11,0.2)",
                          }}>임시저장</span>
                        </div>
                        <div style={{
                          fontSize: 15, fontWeight: 800, color: "#111827",
                          overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
                          marginBottom: 4,
                        }}>
                          {draft.title || "(제목 없음)"}
                        </div>
                        {draft.excerpt && (
                          <div style={{
                            fontSize: 12, color: "#6b7280",
                            overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
                          }}>
                            {draft.excerpt}
                          </div>
                        )}
                        <div style={{ display: "flex", alignItems: "center", gap: 4, marginTop: 4, fontSize: 10, color: "#6b7280" }}>
                          <Clock size={9} />
                          마지막 수정: {new Date(draft.updatedAt).toLocaleString("ko-KR")}
                        </div>
                      </div>

                      {/* 액션 버튼 */}
                      <div style={{ display: "flex", gap: 8, flexShrink: 0 }}>
                        {/* 이어쓰기 */}
                        <button
                          onClick={() => navigate(`/write/edit/${draft.id}`)}
                          style={{
                            display: "flex", alignItems: "center", gap: 5,
                            padding: "8px 14px", borderRadius: 8,
                            background: "rgba(99,102,241,0.12)",
                            border: "1px solid rgba(99,102,241,0.25)",
                            color: "#6366f1", fontSize: 12, fontWeight: 700,
                            cursor: "pointer",
                          }}
                        >
                          <Edit3 size={12} />
                          이어쓰기
                        </button>
                        {/* 발행 */}
                        <button
                          onClick={() => handlePublish(draft.id)}
                          disabled={isPublishing}
                          style={{
                            display: "flex", alignItems: "center", gap: 5,
                            padding: "8px 14px", borderRadius: 8,
                            background: isPublishing ? "#1e1e35" : "rgba(16,185,129,0.12)",
                            border: `1px solid ${isPublishing ? "#e5e7eb" : "rgba(16,185,129,0.25)"}`,
                            color: isPublishing ? "#6b7280" : "#34d399",
                            fontSize: 12, fontWeight: 700,
                            cursor: isPublishing ? "not-allowed" : "pointer",
                          }}
                        >
                          {isPublishing
                            ? <Loader2 size={12} style={{ animation: "spin 1s linear infinite" }} />
                            : <Send size={12} />}
                          {isPublishing ? "발행 중..." : "발행"}
                        </button>
                        {/* 삭제 */}
                        <button
                          onClick={() => setConfirmDeleteId(draft.id)}
                          style={{
                            display: "flex", alignItems: "center", gap: 5,
                            padding: "8px 12px", borderRadius: 8,
                            background: "rgba(225,29,72,0.08)",
                            border: "1px solid rgba(225,29,72,0.2)",
                            color: "#f87171", fontSize: 12, fontWeight: 700,
                            cursor: "pointer",
                          }}
                        >
                          <Trash2 size={12} />
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>

      <style>{`
        @keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }
      `}</style>
    </div>
  );
}
