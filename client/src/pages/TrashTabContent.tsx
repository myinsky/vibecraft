// TrashTab component - 보관함 (삭제된 글 관리)
import { useState, useMemo } from "react";
import { trpc } from "@/lib/trpc";
import { toast } from "sonner";
import { Trash2, RotateCcw, Search, X, AlertTriangle, Pencil, Send } from "lucide-react";
import { Input } from "@/components/ui/input";
import { useLocation } from "wouter";

// ─── 확인 다이얼로그 (공통) ───────────────────────────────────────────────────
interface ConfirmDialogProps {
  open: boolean;
  title: string;
  message: string;
  confirmLabel: string;
  confirmColor?: string;
  onConfirm: () => void;
  onCancel: () => void;
}

function ConfirmDialog({ open, title, message, confirmLabel, confirmColor = "#ef4444", onConfirm, onCancel }: ConfirmDialogProps) {
  if (!open) return null;
  return (
    <div
      style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.45)", zIndex: 9999, display: "flex", alignItems: "center", justifyContent: "center", padding: 16 }}
      onClick={onCancel}
    >
      <div
        style={{ background: "#fff", borderRadius: 14, padding: 28, width: "100%", maxWidth: 420, boxShadow: "0 20px 60px rgba(0,0,0,0.18)" }}
        onClick={e => e.stopPropagation()}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 14 }}>
          <div style={{ width: 36, height: 36, borderRadius: 8, background: "rgba(239,68,68,0.1)", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
            <AlertTriangle size={18} color="#ef4444" />
          </div>
          <span style={{ fontSize: 15, fontWeight: 800, color: "#111827" }}>{title}</span>
        </div>
        <p style={{ fontSize: 13, color: "#6b7280", lineHeight: 1.6, marginBottom: 22 }}>{message}</p>
        <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
          <button
            onClick={onCancel}
            style={{ padding: "8px 18px", borderRadius: 8, border: "1px solid #e5e7eb", background: "#f9fafb", color: "#374151", fontSize: 13, fontWeight: 600, cursor: "pointer" }}
          >
            취소
          </button>
          <button
            onClick={onConfirm}
            style={{ padding: "8px 18px", borderRadius: 8, border: "none", background: confirmColor, color: "#fff", fontSize: 13, fontWeight: 700, cursor: "pointer" }}
          >
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── 보관함 탭 ────────────────────────────────────────────────────────────────
export function TrashTab() {
  const [, navigate] = useLocation();
  const { data: deletedPosts, refetch } = trpc.admin.getDeletedPosts.useQuery();

  // 단건 복원/영구삭제
  const restorePost = trpc.admin.restorePost.useMutation({
    onSuccess: () => { toast.success("복원되었습니다."); refetch(); }
  });
  const hardDelete = trpc.admin.hardDeletePost.useMutation({
    onSuccess: () => { toast.success("완전히 삭제되었습니다."); refetch(); }
  });

  // 일괄 복원/영구삭제
  const bulkRestore = trpc.admin.bulkRestorePosts.useMutation({
    onSuccess: (d) => { toast.success(`${d.count}개 글이 복원되었습니다.`); setSelectedIds([]); refetch(); }
  });
  const bulkHardDelete = trpc.admin.bulkHardDeletePosts.useMutation({
    onSuccess: (d) => { toast.success(`${d.count}개 글이 완전히 삭제되었습니다.`); setSelectedIds([]); refetch(); }
  });

  // 상태
  const [selectedIds, setSelectedIds] = useState<number[]>([]);
  const [search, setSearch] = useState("");

  // 확인 다이얼로그 상태
  const [confirmDialog, setConfirmDialog] = useState<{
    open: boolean;
    type: "single-restore" | "single-delete" | "bulk-restore" | "bulk-delete" | "single-publish";
    targetId?: number;
    targetTitle?: string;
  }>({ open: false, type: "single-delete" });

  // 필터링
  const filtered = useMemo(() => {
    if (!deletedPosts) return [];
    if (!search.trim()) return deletedPosts;
    return deletedPosts.filter((p: any) =>
      p.title.toLowerCase().includes(search.toLowerCase())
    );
  }, [deletedPosts, search]);

  const toggleSelect = (id: number) =>
    setSelectedIds(prev => prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]);
  const toggleSelectAll = () =>
    setSelectedIds(prev => prev.length === filtered.length ? [] : filtered.map((p: any) => p.id));

  // 확인 다이얼로그 실행
  const handleConfirm = () => {
    const { type, targetId } = confirmDialog;
    if (type === "single-restore" && targetId) restorePost.mutate({ id: targetId });
    else if (type === "single-publish" && targetId) restorePost.mutate({ id: targetId });
    else if (type === "single-delete" && targetId) hardDelete.mutate({ id: targetId });
    else if (type === "bulk-restore") bulkRestore.mutate({ ids: selectedIds });
    else if (type === "bulk-delete") bulkHardDelete.mutate({ ids: selectedIds });
    setConfirmDialog({ open: false, type: "single-delete" });
  };

  const getDialogProps = () => {
    const { type, targetTitle } = confirmDialog;
    const count = selectedIds.length;
    if (type === "single-restore") return {
      title: "글 복원",
      message: `"${targetTitle}" 글을 발행 상태로 복원하시겠습니까?`,
      confirmLabel: "복원",
      confirmColor: "#6366f1",
    };
    if (type === "single-publish") return {
      title: "글 발행",
      message: `"${targetTitle}" 글을 발행하시겠습니까?\n보관함에서 꺼내 발행 상태로 전환됩니다.`,
      confirmLabel: "발행",
      confirmColor: "#10b981",
    };
    if (type === "single-delete") return {
      title: "완전 삭제",
      message: `"${targetTitle}" 글을 완전히 삭제하시겠습니까?\n이 작업은 되돌릴 수 없습니다.`,
      confirmLabel: "완전 삭제",
      confirmColor: "#ef4444",
    };
    if (type === "bulk-restore") return {
      title: "일괄 복원",
      message: `선택한 ${count}개 글을 발행 상태로 복원하시겠습니까?`,
      confirmLabel: "복원",
      confirmColor: "#6366f1",
    };
    return {
      title: "일괄 완전 삭제",
      message: `선택한 ${count}개 글을 완전히 삭제하시겠습니까?\n이 작업은 되돌릴 수 없습니다.`,
      confirmLabel: "완전 삭제",
      confirmColor: "#ef4444",
    };
  };

  const inputStyle: React.CSSProperties = {
    background: "#ffffff", border: "1px solid #d1d5db", color: "#111827",
    fontSize: 13, borderRadius: 6,
  };

  return (
    <div>
      {/* 확인 다이얼로그 */}
      <ConfirmDialog
        open={confirmDialog.open}
        {...getDialogProps()}
        onConfirm={handleConfirm}
        onCancel={() => setConfirmDialog({ open: false, type: "single-delete" })}
      />

      <div style={{ background: "#fff", borderRadius: 12, border: "1px solid #e5e7eb", overflow: "hidden" }}>
        {/* 헤더 */}
        <div style={{ padding: "16px 20px", borderBottom: "1px solid #f3f4f6", display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
          <Trash2 size={16} color="#ef4444" />
          <span style={{ fontSize: 15, fontWeight: 700, color: "#111827" }}>보관함</span>
          <span style={{ fontSize: 12, color: "#9ca3af", marginLeft: 4 }}>
            제목을 클릭하면 내용을 확인하고 수정할 수 있습니다.
          </span>
          <span style={{ marginLeft: "auto", fontSize: 12, color: "#6366f1", fontWeight: 700, background: "rgba(99,102,241,0.08)", padding: "2px 10px", borderRadius: 99 }}>
            총 {deletedPosts?.length ?? 0}개
          </span>
        </div>

        {/* 검색 & 일괄 작업 툴바 */}
        <div style={{ padding: "12px 20px", borderBottom: "1px solid #f3f4f6", display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
          <div style={{ position: "relative", flexShrink: 0 }}>
            <Search size={13} style={{ position: "absolute", left: 9, top: "50%", transform: "translateY(-50%)", color: "#9ca3af" }} />
            <Input
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder="제목 검색..."
              style={{ ...inputStyle, paddingLeft: 28, maxWidth: 220 }}
            />
            {search && (
              <button onClick={() => setSearch("")} style={{ position: "absolute", right: 8, top: "50%", transform: "translateY(-50%)", background: "none", border: "none", cursor: "pointer", color: "#9ca3af", padding: 0 }}>
                <X size={13} />
              </button>
            )}
          </div>

          {selectedIds.length > 0 && (
            <div style={{ display: "flex", alignItems: "center", gap: 6, marginLeft: 8 }}>
              <span style={{ fontSize: 12, color: "#6366f1", fontWeight: 700 }}>{selectedIds.length}개 선택됨</span>
              <button
                onClick={() => setConfirmDialog({ open: true, type: "bulk-restore" })}
                style={{ padding: "5px 12px", borderRadius: 6, border: "1px solid #6366f1", background: "rgba(99,102,241,0.08)", color: "#6366f1", fontSize: 11, fontWeight: 700, cursor: "pointer", display: "flex", alignItems: "center", gap: 4 }}
              >
                <RotateCcw size={11} />
                일괄 복원
              </button>
              <button
                onClick={() => setConfirmDialog({ open: true, type: "bulk-delete" })}
                style={{ padding: "5px 12px", borderRadius: 6, border: "1px solid #ef4444", background: "rgba(239,68,68,0.08)", color: "#ef4444", fontSize: 11, fontWeight: 700, cursor: "pointer", display: "flex", alignItems: "center", gap: 4 }}
              >
                <Trash2 size={11} />
                일괄 완전삭제
              </button>
              <button
                onClick={() => setSelectedIds([])}
                style={{ padding: "5px 10px", borderRadius: 6, border: "1px solid #e5e7eb", background: "#f9fafb", color: "#6b7280", fontSize: 11, cursor: "pointer" }}
              >
                선택 해제
              </button>
            </div>
          )}
        </div>

        {/* 목록 */}
        {!filtered || filtered.length === 0 ? (
          <div style={{ padding: "48px 0", textAlign: "center", color: "#9ca3af", fontSize: 14 }}>
            <Trash2 size={32} color="#d1d5db" style={{ margin: "0 auto 12px" }} />
            <p>{search ? "검색 결과가 없습니다." : "보관함이 비어 있습니다."}</p>
          </div>
        ) : (
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
            <thead>
              <tr style={{ background: "#f9fafb", borderBottom: "1px solid #e5e7eb" }}>
                <th style={{ padding: "10px 16px", width: 40 }}>
                  <input
                    type="checkbox"
                    checked={filtered.length > 0 && selectedIds.length === filtered.length}
                    onChange={toggleSelectAll}
                    style={{ cursor: "pointer" }}
                  />
                </th>
                <th style={{ padding: "10px 4px", textAlign: "center", fontWeight: 600, color: "#374151", width: 36 }}>#</th>
                <th style={{ padding: "10px 12px", textAlign: "left", fontWeight: 600, color: "#374151" }}>제목</th>
                <th style={{ padding: "10px 12px", textAlign: "left", fontWeight: 600, color: "#374151", width: 120 }}>카테고리</th>
                <th style={{ padding: "10px 12px", textAlign: "left", fontWeight: 600, color: "#374151", width: 140 }}>삭제일시</th>
                <th style={{ padding: "10px 12px", textAlign: "center", fontWeight: 600, color: "#374151", width: 240 }}>작업</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((post: any, idx: number) => (
                <tr
                  key={post.id}
                  style={{
                    borderBottom: "1px solid #f3f4f6",
                    background: selectedIds.includes(post.id) ? "rgba(99,102,241,0.04)" : "#fff",
                  }}
                >
                  <td style={{ padding: "12px 16px", textAlign: "center" }}>
                    <input
                      type="checkbox"
                      checked={selectedIds.includes(post.id)}
                      onChange={() => toggleSelect(post.id)}
                      style={{ cursor: "pointer" }}
                    />
                  </td>
                  <td style={{ padding: "12px 4px", textAlign: "center", color: "#9ca3af", fontSize: 11, fontWeight: 600 }}>{idx + 1}</td>
                  <td style={{ padding: "12px 12px", color: "#374151" }}>
                    {/* 제목 클릭 시 편집 페이지로 이동 */}
                    <span
                      style={{ fontWeight: 600, cursor: "pointer", color: "#374151", textDecoration: "underline", textUnderlineOffset: 2 }}
                      onClick={() => navigate(`/write/edit/${post.id}`)}
                      title="클릭하여 내용 확인 및 수정"
                    >
                      {post.title}
                    </span>
                    <span style={{ fontSize: 11, color: "#9ca3af", marginLeft: 8 }}>by {post.authorName || "알 수 없음"}</span>
                  </td>
                  <td style={{ padding: "12px 12px" }}>
                    <span style={{ fontSize: 11, background: "#f3f4f6", color: "#6b7280", padding: "2px 8px", borderRadius: 99 }}>{post.category}</span>
                  </td>
                  <td style={{ padding: "12px 12px", color: "#9ca3af", fontSize: 12 }}>
                    {post.deletedAt ? new Date(post.deletedAt).toLocaleString("ko-KR") : "-"}
                  </td>
                  <td style={{ padding: "12px 12px", textAlign: "center" }}>
                    <div style={{ display: "flex", gap: 5, justifyContent: "center", flexWrap: "wrap" }}>
                      {/* 수정 버튼 */}
                      <button
                        onClick={() => navigate(`/write/edit/${post.id}`)}
                        style={{ padding: "4px 10px", borderRadius: 6, border: "1px solid #6b7280", background: "#fff", color: "#374151", fontSize: 12, fontWeight: 600, cursor: "pointer", display: "flex", alignItems: "center", gap: 4 }}
                        title="내용 수정"
                      >
                        <Pencil size={11} />
                        수정
                      </button>
                      {/* 발행 버튼 */}
                      <button
                        onClick={() => setConfirmDialog({ open: true, type: "single-publish", targetId: post.id, targetTitle: post.title })}
                        disabled={restorePost.isPending}
                        style={{ padding: "4px 10px", borderRadius: 6, border: "1px solid #10b981", background: "#fff", color: "#10b981", fontSize: 12, fontWeight: 600, cursor: "pointer", display: "flex", alignItems: "center", gap: 4 }}
                        title="발행"
                      >
                        <Send size={11} />
                        발행
                      </button>
                      {/* 복원 버튼 */}
                      <button
                        onClick={() => setConfirmDialog({ open: true, type: "single-restore", targetId: post.id, targetTitle: post.title })}
                        disabled={restorePost.isPending}
                        style={{ padding: "4px 10px", borderRadius: 6, border: "1px solid #6366f1", background: "#fff", color: "#6366f1", fontSize: 12, fontWeight: 600, cursor: "pointer", display: "flex", alignItems: "center", gap: 4 }}
                        title="복원 (발행 상태로 전환)"
                      >
                        <RotateCcw size={11} />
                        복원
                      </button>
                      {/* 완전삭제 버튼 */}
                      <button
                        onClick={() => setConfirmDialog({ open: true, type: "single-delete", targetId: post.id, targetTitle: post.title })}
                        disabled={hardDelete.isPending}
                        style={{ padding: "4px 10px", borderRadius: 6, border: "1px solid #ef4444", background: "#fff", color: "#ef4444", fontSize: 12, fontWeight: 600, cursor: "pointer", display: "flex", alignItems: "center", gap: 4 }}
                        title="완전 삭제"
                      >
                        <Trash2 size={11} />
                        완전삭제
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
