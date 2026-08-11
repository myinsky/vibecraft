import React, { useState, useEffect, useMemo, useRef, useCallback } from "react";
import { trpc } from "@/lib/trpc";
import { useLocation } from "wouter";
import { getPostUrl } from "@/lib/postUrl";
import { toast } from "sonner";
import { adminSave, btnStyle, inputStyle, labelStyle, selectStyle, cardStyle, CATEGORY_LABELS, SECTION_ICONS, EMPTY_SIDEBAR_ITEM, type SidebarItemForm } from "./adminShared";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import {
  Eye, EyeOff, GripVertical, Plus, Trash2, Edit2, Check, X,
  Settings, Layout, Sidebar, Navigation, FileText, ChevronUp, ChevronDown,
  Monitor, Palette, Globe, BarChart2, Save, RefreshCw, ExternalLink,
  MessageSquare, MessageCircleOff, Bot, Loader2, Zap, Key, BookOpen, Copy, AlertCircle, Send,
  Users, UserCheck, UserX, Shield, ShieldOff, Ban, Search, AlertTriangle, RotateCcw,
  Database, Download, Upload, HardDrive, Maximize2, Minimize2, Pin, PinOff,
  Heart, Coffee, CheckCircle, XCircle, ShoppingCart, TrendingUp,
} from "lucide-react";

// ─── 게시물 관리 탭 ────────────────────────────────────────────────────────────
/** navItem path에서 카테고리 키 추출 */
function extractCategoryKeyAdmin(path: string): string {
  const m = path.match(/\/category\/([^/?#]+)/);
  return m ? m[1] : path.replace(/^.*\//, "");
}

export function PostsTab({ onEditPage }: { onEditPage?: (pageId: number) => void }) {
  const { data: allPosts, refetch } = trpc.admin.listAllPosts.useQuery();
  const { data: navItemsData } = trpc.admin.getNavItems.useQuery();
  // 커스텀 페이지 전체 목록 (공개+비공개 포함, "페이지" 탭용)
  const { data: publishedPages, refetch: refetchPages } = trpc.pages.adminList.useQuery();
  const togglePagePublish = trpc.pages.togglePublish.useMutation({
    onSuccess: (d) => {
      toast.success(d.published ? "페이지가 공개되었습니다." : "페이지가 비공개 처리되었습니다.");
      refetchPages();
    },
    onError: () => toast.error("상태 변경에 실패했습니다."),
  });
  const updateStatus = trpc.admin.updatePostStatus.useMutation({ onSuccess: () => { toast.success("상태가 변경되었습니다."); refetch(); } });
  const deletePost   = trpc.admin.deletePost.useMutation({ onSuccess: () => { toast.success("게시물이 보관함으로 이동되었습니다."); refetch(); } });
  const togglePin    = trpc.admin.togglePinPost.useMutation({ onSuccess: (d) => { toast.success(d.isPinned ? "고정글로 설정되었습니다." : "고정이 해제되었습니다."); refetch(); } });
  const bulkUpdateStatus = trpc.admin.bulkUpdatePostStatus.useMutation({ onSuccess: (d) => { toast.success(`${d.count}개 게시물 상태가 변경되었습니다.`); setSelectedIds([]); refetch(); } });
  const bulkDelete = trpc.admin.bulkDeletePosts.useMutation({ onSuccess: (d) => { toast.success(`${d.count}개 게시물이 보관함으로 이동되었습니다.`); setSelectedIds([]); refetch(); } });
  const bulkUpdateCategory = trpc.admin.bulkUpdateCategory.useMutation({ onSuccess: (d) => { toast.success(`${d.count}개 게시물의 카테고리가 변경되었습니다.`); setSelectedIds([]); setBulkCatTarget(""); refetch(); } });
  const batchUpdateEmbedWidth = trpc.admin.batchUpdateEmbedWidth.useMutation({ onSuccess: (d) => { toast.success(`${d.count}개 앱 모드 글의 표시 너비가 변경되었습니다.`); setSelectedIds([]); refetch(); } });
  const toggleShowInSection = trpc.admin.toggleShowInSection.useMutation({ onSuccess: () => { toast.success("섹션 노출 설정이 변경되었습니다."); refetch(); } });
  const toggleAllowComments = trpc.admin.toggleAllowComments.useMutation({ onSuccess: () => { toast.success("댓글 설정이 변경되었습니다."); refetch(); } });
  const bulkToggleAllowComments = trpc.admin.bulkToggleAllowComments.useMutation({ onSuccess: (d) => { toast.success(`${d.count}개 게시물의 댓글 설정이 변경되었습니다.`); setSelectedIds([]); refetch(); } });
  const [optimizeResult, setOptimizeResult] = React.useState<{ optimized: number; skipped: number; failed: number; total: number } | null>(null);
  const [responsiveResult, setResponsiveResult] = React.useState<{ optimized: number; skipped: number; failed: number; total: number } | null>(null);
  const fixDownloadUrls = trpc.admin.fixDownloadUrls.useMutation({
    onSuccess: (d) => {
      toast.success(`다운로드 링크 수정 완료: ${d.fixed}개 게시물 수정됨 (전체 ${d.total}개 검사)`);
      refetch();
    },
    onError: (e) => toast.error('다운로드 링크 수정 실패: ' + e.message),
  });
  const bulkGenerateResponsiveThumbnails = trpc.admin.bulkGenerateResponsiveThumbnails.useMutation({
    onSuccess: (d) => {
      setResponsiveResult(d);
      toast.success(`반응형 이미지 변환 완료: ${d.optimized}개 변환, ${d.failed}개 실패 (전체 ${d.total}개 대상)`);
      refetch();
    },
    onError: (e) => toast.error('반응형 이미지 변환 실패: ' + e.message),
  });
  const bulkOptimizeThumbnails = trpc.admin.bulkOptimizeThumbnails.useMutation({
    onSuccess: (d) => {
      setOptimizeResult(d);
      toast.success(`썸네일 최적화 완료: ${d.optimized}개 변환, ${d.failed}개 실패 (전체 ${d.total}개 대상)`);
      refetch();
    },
    onError: (e) => toast.error('썸네일 최적화 실패: ' + e.message),
  });
  const hardDeletePost = trpc.admin.hardDeletePost.useMutation({ onSuccess: () => { toast.success("게시물이 완전히 삭제되었습니다."); refetch(); } });
  const bulkHardDelete = trpc.admin.bulkHardDeletePosts.useMutation({ onSuccess: (d) => { toast.success(`${d.count}개 게시물이 완전히 삭제되었습니다.`); setSelectedIds([]); refetch(); } });
  const deleteAllDrafts = trpc.admin.deleteAllDrafts.useMutation({ onSuccess: (d) => { toast.success(`임시저장 ${d.count}개가 모두 삭제되었습니다.`); setSelectedIds([]); refetch(); }, onError: (e) => toast.error("전체 삭제 실패: " + e.message) });
  const updatePostCustomSlug = trpc.admin.updatePostCustomSlug.useMutation({
    onSuccess: () => { toast.success("SEO URL이 저장되었습니다."); setSlugEditId(null); setSlugEditValue(""); refetch(); },
    onError: (e) => toast.error("저장 실패: " + e.message),
  });
  // 슬러그 인라인 편집 상태
  const [slugEditId, setSlugEditId] = useState<number | null>(null);
  const [slugEditValue, setSlugEditValue] = useState("");

  const [, navigate] = useLocation();
  const [filter, setFilter] = useState<"published" | "draft">("published");
  const [catFilter, setCatFilter] = useState<string>("all");
  const [search, setSearch] = useState("");
  // 다중 선택
  const [selectedIds, setSelectedIds] = useState<number[]>([]);
  // 일괄 카테고리 변경 대상
  const [bulkCatTarget, setBulkCatTarget] = useState<string>("");
  // 앱 모드 글 필터
  const [appModeFilter, setAppModeFilter] = useState<"all" | "app">("all");
  // 정렬
  type SortKey = "title" | "createdAt" | "views" | "likes";
  const [sortKey, setSortKey] = useState<SortKey>("createdAt");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("desc");
  const handleSort = (key: SortKey) => {
    if (sortKey === key) setSortDir(d => d === "asc" ? "desc" : "asc");
    else { setSortKey(key); setSortDir("desc"); }
  };
  const toggleSelect = (id: number) => setSelectedIds(prev => prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]);
  // 일괄 삭제 확인 다이얼로그
  const [bulkDeleteDialog, setBulkDeleteDialog] = useState(false);
  // 일괄 영구 삭제 확인 다이얼로그
  const [bulkHardDeleteDialog, setBulkHardDeleteDialog] = useState(false);
  // 임시저장 전체 삭제 확인 다이얼로그
  const [deleteAllDraftsDialog, setDeleteAllDraftsDialog] = useState(false);
  // 단건 삭제 확인 다이얼로그 (status 포함)
  const [singleDeleteTarget, setSingleDeleteTarget] = useState<{ id: number; title: string; status?: string } | null>(null);
  // 조회수 상세 팝업
  const [viewStatsPostId, setViewStatsPostId] = useState<number | null>(null);
  const { data: viewStats, isLoading: viewStatsLoading } = trpc.admin.getPostViewStats.useQuery(
    { postId: viewStatsPostId! },
    { enabled: viewStatsPostId !== null }
  );
  // 카테고리별 댓글 설정
  const { data: catCommentSettings, refetch: refetchCatComments } = trpc.admin.getCategoryCommentSettings.useQuery();
  const updateCatComment = trpc.admin.updateCategoryCommentSetting.useMutation({
    onSuccess: () => { adminSave.success("카테고리 댓글 설정이 저장되었습니다."); refetchCatComments(); },
    onError: (e) => toast.error("저장 실패: " + e.message),
  });

  // toggleSelectAll은 filtered 선언 이후에 정의
  const filtered = useMemo(() => {
    const base = (allPosts || []).filter(p => {
      // 발행됨 탭: published만, 임시저장 탭: draft만
      if (filter === "published" && p.status !== "published") return false;
      if (filter === "draft"     && p.status !== "draft")     return false;
      // 임시저장 탭에서는 카테고리 필터 무시
      if (filter !== "draft" && catFilter !== "all" && p.category !== catFilter) return false;
      if (search && !p.title.toLowerCase().includes(search.toLowerCase())) return false;
      // 앱 모드 필터
      if (appModeFilter === "app" && !(p as any).isAppMode) return false;
      return true;
    });
    return [...base].sort((a, b) => {
      let va: string | number, vb: string | number;
      if (sortKey === "title") { va = a.title.toLowerCase(); vb = b.title.toLowerCase(); }
      else if (sortKey === "views") { va = a.views ?? 0; vb = b.views ?? 0; }
      else if (sortKey === "likes") { va = a.likes ?? 0; vb = b.likes ?? 0; }
      else { va = new Date(a.createdAt).getTime(); vb = new Date(b.createdAt).getTime(); }
      if (va < vb) return sortDir === "asc" ? -1 : 1;
      if (va > vb) return sortDir === "asc" ? 1 : -1;
      return 0;
    });
  }, [allPosts, filter, catFilter, search, sortKey, sortDir]);
  // 페이지네이션
  const POSTS_PER_PAGE = 25;
  const [currentPage, setCurrentPage] = useState(1);
  // 필터/검색 변경 시 첫 페이지로 리셋
  const prevFilterRef = React.useRef({ filter, catFilter, search, appModeFilter, sortKey, sortDir });
  React.useEffect(() => {
    const prev = prevFilterRef.current;
    if (prev.filter !== filter || prev.catFilter !== catFilter || prev.search !== search ||
        prev.appModeFilter !== appModeFilter || prev.sortKey !== sortKey || prev.sortDir !== sortDir) {
      setCurrentPage(1);
      prevFilterRef.current = { filter, catFilter, search, appModeFilter, sortKey, sortDir };
    }
  }, [filter, catFilter, search, appModeFilter, sortKey, sortDir]);
  const totalPages = Math.max(1, Math.ceil(filtered.length / POSTS_PER_PAGE));
  const pagedPosts = filtered.slice((currentPage - 1) * POSTS_PER_PAGE, currentPage * POSTS_PER_PAGE);
  const toggleSelectAll = () => setSelectedIds(prev => prev.length === filtered.length ? [] : filtered.map(p => p.id));

  // 카테고리 목록 (navItems 기반 동적)
  const categoryOptions = useMemo(() => {
    if (!navItemsData || navItemsData.length === 0) return [];
    return navItemsData
      .sort((a, b) => (a.sortOrder ?? 0) - (b.sortOrder ?? 0))
      .map(item => ({
        key: extractCategoryKeyAdmin(item.path || ""),
        label: item.label,
      }))
      .filter(c => c.key);
  }, [navItemsData]);

  // DB navItems에서 동적으로 카테고리 레이블 생성 (관리자에서 수정한 메뉴명 즉시 반영)
  const CAT_LABELS: Record<string, string> = useMemo(() => {
    const fallback: Record<string, string> = {
      "ai-apps":   "AI로 만드는 자동화 프로그램",
      "my-apps":   "진행중인 자동화 프로그램",
      "ai-tools":  "AI 툴 추천",
      "resources": "자료실",
    };
    if (!navItemsData || navItemsData.length === 0) return fallback;
    const map: Record<string, string> = {};
    navItemsData.forEach(item => {
      const key = extractCategoryKeyAdmin(item.path || "");
      if (key) map[key] = item.label;
    });
    return Object.keys(map).length > 0 ? map : fallback;
  }, [navItemsData]);

  return (
    <div style={{ maxWidth: 1400 }}>
      {/* 일괄 삭제 확인 다이얼로그 */}
      {bulkDeleteDialog && (
        <div
          style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.45)", zIndex: 9999, display: "flex", alignItems: "center", justifyContent: "center", padding: 16 }}
          onClick={() => setBulkDeleteDialog(false)}
        >
          <div
            style={{ background: "#fff", borderRadius: 14, padding: 28, width: "100%", maxWidth: 420, boxShadow: "0 20px 60px rgba(0,0,0,0.18)" }}
            onClick={e => e.stopPropagation()}
          >
            <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 14 }}>
              <div style={{ width: 36, height: 36, borderRadius: 8, background: "rgba(239,68,68,0.1)", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
                <AlertTriangle size={18} color="#ef4444" />
              </div>
              <span style={{ fontSize: 15, fontWeight: 800, color: "#111827" }}>보관함으로 이동</span>
            </div>
            <p style={{ fontSize: 13, color: "#6b7280", lineHeight: 1.6, marginBottom: 22 }}>
              선택한 <strong style={{ color: "#111827" }}>{selectedIds.length}개 글</strong>을 보관함으로 이동하시겠습니까?<br />
              보관함에서 복원하거나 완전히 삭제할 수 있습니다.
            </p>
            <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
              <button
                onClick={() => setBulkDeleteDialog(false)}
                style={{ padding: "8px 18px", borderRadius: 8, border: "1px solid #e5e7eb", background: "#f9fafb", color: "#374151", fontSize: 13, fontWeight: 600, cursor: "pointer" }}
              >
                취소
              </button>
              <button
                onClick={() => { setBulkDeleteDialog(false); bulkDelete.mutate({ ids: selectedIds }); }}
                style={{ padding: "8px 18px", borderRadius: 8, border: "none", background: "#ef4444", color: "#fff", fontSize: 13, fontWeight: 700, cursor: "pointer" }}
              >
                보관함으로 이동
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 일괄 영구 삭제 확인 다이얼로그 */}
      {bulkHardDeleteDialog && (
        <div
          style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.45)", zIndex: 9999, display: "flex", alignItems: "center", justifyContent: "center", padding: 16 }}
          onClick={() => setBulkHardDeleteDialog(false)}
        >
          <div
            style={{ background: "#fff", borderRadius: 14, padding: 28, width: "100%", maxWidth: 420, boxShadow: "0 20px 60px rgba(0,0,0,0.18)" }}
            onClick={e => e.stopPropagation()}
          >
            <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 14 }}>
              <div style={{ width: 36, height: 36, borderRadius: 8, background: "rgba(220,38,38,0.12)", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
                <AlertTriangle size={18} color="#dc2626" />
              </div>
              <span style={{ fontSize: 15, fontWeight: 800, color: "#111827" }}>영구 삭제</span>
            </div>
            <p style={{ fontSize: 13, color: "#6b7280", lineHeight: 1.6, marginBottom: 22 }}>
              선택한 <strong style={{ color: "#dc2626" }}>{selectedIds.length}개 글</strong>을 <strong style={{ color: "#dc2626" }}>완전히 삭제</strong>하시겠습니까?<br />
              <span style={{ fontSize: 11, color: "#9ca3af" }}>이 작업은 되돌릴 수 없습니다. 보관함을 거치지 않고 즉시 삭제됩니다.</span>
            </p>
            <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
              <button
                onClick={() => setBulkHardDeleteDialog(false)}
                style={{ padding: "8px 18px", borderRadius: 8, border: "1px solid #e5e7eb", background: "#f9fafb", color: "#374151", fontSize: 13, fontWeight: 600, cursor: "pointer" }}
              >
                취소
              </button>
              <button
                onClick={() => { setBulkHardDeleteDialog(false); bulkHardDelete.mutate({ ids: selectedIds }); }}
                style={{ padding: "8px 18px", borderRadius: 8, border: "none", background: "#dc2626", color: "#fff", fontSize: 13, fontWeight: 700, cursor: "pointer" }}
              >
                영구 삭제
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 임시저장 전체 삭제 확인 다이얼로그 */}
      {deleteAllDraftsDialog && (
        <div
          style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.45)", zIndex: 9999, display: "flex", alignItems: "center", justifyContent: "center", padding: 16 }}
          onClick={() => setDeleteAllDraftsDialog(false)}
        >
          <div
            style={{ background: "#fff", borderRadius: 14, padding: 28, width: "100%", maxWidth: 440, boxShadow: "0 20px 60px rgba(0,0,0,0.18)" }}
            onClick={e => e.stopPropagation()}
          >
            <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 14 }}>
              <div style={{ width: 36, height: 36, borderRadius: 8, background: "rgba(220,38,38,0.12)", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
                <AlertTriangle size={18} color="#dc2626" />
              </div>
              <span style={{ fontSize: 15, fontWeight: 800, color: "#111827" }}>임시저장 전체 삭제</span>
            </div>
            <p style={{ fontSize: 13, color: "#6b7280", lineHeight: 1.6, marginBottom: 22 }}>
              <strong style={{ color: "#dc2626" }}>임시저장 상태인 게시물 전체 ({(allPosts || []).filter(p => p.status === "draft").length}개)</strong>를 완전히 삭제합니다.<br />
              <span style={{ fontSize: 11, color: "#9ca3af" }}>이 작업은 되돌릴 수 없습니다. 발행된 글은 영향을 받지 않습니다.</span>
            </p>
            <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
              <button
                onClick={() => setDeleteAllDraftsDialog(false)}
                style={{ padding: "8px 18px", borderRadius: 8, border: "1px solid #e5e7eb", background: "#f9fafb", color: "#374151", fontSize: 13, fontWeight: 600, cursor: "pointer" }}
              >
                취소
              </button>
              <button
                onClick={() => { setDeleteAllDraftsDialog(false); deleteAllDrafts.mutate(); }}
                disabled={deleteAllDrafts.isPending}
                style={{ padding: "8px 18px", borderRadius: 8, border: "none", background: "#dc2626", color: "#fff", fontSize: 13, fontWeight: 700, cursor: deleteAllDrafts.isPending ? "not-allowed" : "pointer", display: "flex", alignItems: "center", gap: 6 }}
              >
                {deleteAllDrafts.isPending ? <><RefreshCw size={13} className="animate-spin" /> 삭제 중...</> : "전체 삭제"}
              </button>
            </div>
          </div>
        </div>
      )}
      {/* 단건 삭제 확인 다이얼로그 */}
      {singleDeleteTarget && (
        <div
          style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.45)", zIndex: 9999, display: "flex", alignItems: "center", justifyContent: "center", padding: 16 }}
          onClick={() => setSingleDeleteTarget(null)}
        >
          <div
            style={{ background: "#fff", borderRadius: 14, padding: 28, width: "100%", maxWidth: 420, boxShadow: "0 20px 60px rgba(0,0,0,0.18)" }}
            onClick={e => e.stopPropagation()}
          >
            <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 14 }}>
              <div style={{ width: 36, height: 36, borderRadius: 8, background: "rgba(239,68,68,0.1)", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
                <AlertTriangle size={18} color="#ef4444" />
              </div>
              <span style={{ fontSize: 15, fontWeight: 800, color: "#111827" }}>게시물 삭제</span>
            </div>
            <p style={{ fontSize: 13, color: "#6b7280", lineHeight: 1.6, marginBottom: 22 }}>
              {singleDeleteTarget.status === "draft" ? (
                <><strong style={{ color: "#111827" }}>"{singleDeleteTarget.title}"</strong> 게시물을 <strong style={{ color: "#ef4444" }}>완전히 삭제</strong>하시겠습니까?<br /><span style={{ fontSize: 11, color: "#9ca3af" }}>임시저장 글은 보관함을 거치지 않고 즉시 삭제됩니다.</span></>
              ) : (
                <><strong style={{ color: "#111827" }}>"{singleDeleteTarget.title}"</strong> 게시물을 보관함으로 이동하시겠습니까?</>
              )}
            </p>
            <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
              <button
                onClick={() => setSingleDeleteTarget(null)}
                style={{ padding: "8px 18px", borderRadius: 8, border: "1px solid #e5e7eb", background: "#f9fafb", color: "#374151", fontSize: 13, fontWeight: 600, cursor: "pointer" }}
              >
                취소
              </button>
              <button
                onClick={() => { const t = singleDeleteTarget; setSingleDeleteTarget(null); if (t.status === "draft") hardDeletePost.mutate({ id: t.id }); else deletePost.mutate({ id: t.id }); }}
                style={{ padding: "8px 18px", borderRadius: 8, border: "none", background: "#ef4444", color: "#fff", fontSize: 13, fontWeight: 700, cursor: "pointer" }}
              >
                {singleDeleteTarget.status === "draft" ? "완전 삭제" : "보관함으로 이동"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 필터 & 검색 */}
      <div style={{ display: "flex", gap: 8, marginBottom: 8, flexWrap: "wrap", alignItems: "center" }}>
        <Input
          value={search}
          onChange={e => setSearch(e.target.value)}
          placeholder="제목 검색..."
          style={{ ...inputStyle, maxWidth: 240 }}
        />
        {(["published", "draft"] as const).map(f => (
          <button key={f} onClick={() => { setFilter(f); setSelectedIds([]); }} style={{
            padding: "6px 14px", borderRadius: 6,
            border: `1px solid ${filter === f ? "#6366f1" : "#e5e7eb"}`,
            background: filter === f ? "rgba(99,102,241,0.08)" : "#ffffff",
            color: filter === f ? "#6366f1" : "#6b7280", fontSize: 12, cursor: "pointer",
          }}>
            {f === "published"
              ? `발행됨 (${allPosts?.filter(p => p.status === "published").length || 0})`
              : `📁 임시저장 (${allPosts?.filter(p => p.status === "draft").length || 0})`}
          </button>
        ))}
        {/* 임시저장 탭: 전체 삭제 버튼 */}
        {filter === "draft" && (
          <button
            onClick={() => setDeleteAllDraftsDialog(true)}
            style={{
              padding: "6px 14px", borderRadius: 6,
              border: "1px solid #dc2626",
              background: "rgba(220,38,38,0.07)",
              color: "#dc2626", fontSize: 12, fontWeight: 700, cursor: "pointer",
              display: "flex", alignItems: "center", gap: 5, whiteSpace: "nowrap",
            }}
          >
            🗑️ 임시저장 전체 삭제
          </button>
        )}
        {/* 썸네일 일괄 최적화 버튼 */}
        <button
          onClick={() => {
            if (confirm('외부 URL 썸네일을 WebP로 변환합니다. 게시물 수에 따라 1~5분 소요될 수 있습니다. 계속하시겠습니까?'))
              bulkOptimizeThumbnails.mutate();
          }}
          disabled={bulkOptimizeThumbnails.isPending}
          style={{
            marginLeft: 'auto', padding: '6px 14px', borderRadius: 6,
            border: '1px solid #10b981', background: bulkOptimizeThumbnails.isPending ? '#d1fae5' : 'rgba(16,185,129,0.08)',
            color: '#059669', fontSize: 12, fontWeight: 700, cursor: bulkOptimizeThumbnails.isPending ? 'not-allowed' : 'pointer',
            display: 'flex', alignItems: 'center', gap: 5, whiteSpace: 'nowrap',
          }}
        >
          {bulkOptimizeThumbnails.isPending
            ? <><RefreshCw size={12} className="animate-spin" /> 썸네일 최적화 중...⁠</>
            : <>🖼️ 썸네일 일괄 최적화</>}
        </button>
        {optimizeResult && (
          <span style={{ fontSize: 11, color: '#6b7280', alignSelf: 'center' }}>
            마지막 결과: {optimizeResult.optimized}개 변환 / {optimizeResult.failed}개 실패 / 전체 {optimizeResult.total}개
          </span>
        )}
        {/* 반응형 이미지 일괄 변환 버튼 */}
        <button
          onClick={() => {
            if (confirm('기존 단일 해상도 이미지를 320w/640w/1200w 반응형 WebP로 변환합니다.\n게시물 수에 따라 수 분이 소요될 수 있습니다. 계속하시겠습니까?'))
              bulkGenerateResponsiveThumbnails.mutate();
          }}
          disabled={bulkGenerateResponsiveThumbnails.isPending}
          style={{
            padding: '6px 14px', borderRadius: 6,
            border: '1px solid #6366f1', background: bulkGenerateResponsiveThumbnails.isPending ? '#e0e7ff' : 'rgba(99,102,241,0.08)',
            color: '#4f46e5', fontSize: 12, fontWeight: 700, cursor: bulkGenerateResponsiveThumbnails.isPending ? 'not-allowed' : 'pointer',
            display: 'flex', alignItems: 'center', gap: 5, whiteSpace: 'nowrap',
          }}
        >
          {bulkGenerateResponsiveThumbnails.isPending
            ? <><RefreshCw size={12} className="animate-spin" /> 반응형 변환 중...</>
            : <>📐 반응형 이미지 변환</>}
        </button>
        {responsiveResult && (
          <span style={{ fontSize: 11, color: '#6b7280', alignSelf: 'center' }}>
            반응형 변환: {responsiveResult.optimized}개 완료 / {responsiveResult.failed}개 실패 / 전체 {responsiveResult.total}개
          </span>
        )}
        {/* 다운로드 링크 URL 일괄 수정 버튼 */}
        <button
          onClick={() => {
            if (confirm('게시물 내 다운로드 링크의 파일명 파라미터를 일괄 정규화합니다.\n(&amp; 엔티티, 중복 파라미터 등 수정) 계속하시겠습니까?'))
              fixDownloadUrls.mutate();
          }}
          disabled={fixDownloadUrls.isPending}
          style={{
            padding: '6px 14px', borderRadius: 6,
            border: '1px solid #059669', background: fixDownloadUrls.isPending ? '#d1fae5' : 'rgba(5,150,105,0.08)',
            color: '#047857', fontSize: 12, fontWeight: 700, cursor: fixDownloadUrls.isPending ? 'not-allowed' : 'pointer',
            display: 'flex', alignItems: 'center', gap: 5, whiteSpace: 'nowrap',
          }}
        >
          {fixDownloadUrls.isPending
            ? <><RefreshCw size={12} className="animate-spin" /> 수정 중...</>
            : <>🔗 다운로드 링크 수정</>}
        </button>
      </div>
      {/* 카테고리 필터 - 임시저장 탭에서는 숨김 */}
      {filter !== "draft" && categoryOptions.length > 0 && (
        <div style={{ display: "flex", gap: 6, marginBottom: 16, flexWrap: "wrap" }}>
          <button
            onClick={() => setCatFilter("all")}
            style={{
              padding: "4px 12px", borderRadius: 5, fontSize: 11, cursor: "pointer",
              border: `1px solid ${catFilter === "all" ? "#6366f1" : "#e5e7eb"}`,
              background: catFilter === "all" ? "rgba(99,102,241,0.1)" : "#f9fafb",
              color: catFilter === "all" ? "#6366f1" : "#6b7280", fontWeight: catFilter === "all" ? 700 : 400,
            }}
          >
            전체 카테고리
          </button>
          {categoryOptions.map(opt => (
            <button
              key={opt.key}
              onClick={() => setCatFilter(opt.key)}
              style={{
                padding: "4px 12px", borderRadius: 5, fontSize: 11, cursor: "pointer",
                border: `1px solid ${catFilter === opt.key ? "#6366f1" : "#e5e7eb"}`,
                background: catFilter === opt.key ? "rgba(99,102,241,0.1)" : "#f9fafb",
                color: catFilter === opt.key ? "#6366f1" : "#6b7280", fontWeight: catFilter === opt.key ? 700 : 400,
              }}
            >
              {opt.label} ({(allPosts || []).filter(p => p.category === opt.key).length})
            </button>
          ))}
          {/* 페이지 탭 */}
          <button
            onClick={() => setCatFilter("pages")}
            style={{
              padding: "4px 12px", borderRadius: 5, fontSize: 11, cursor: "pointer",
              border: `1px solid ${catFilter === "pages" ? "#7c3aed" : "#e5e7eb"}`,
              background: catFilter === "pages" ? "rgba(124,58,237,0.1)" : "#f9fafb",
              color: catFilter === "pages" ? "#7c3aed" : "#6b7280", fontWeight: catFilter === "pages" ? 700 : 400,
            }}
          >
            발행 페이지 ({(publishedPages || []).length})
          </button>
        </div>
      )}

      {/* 앱 모드 필터 - 페이지 탭에서는 숨김 */}
      {catFilter !== "pages" && <div style={{ display: "flex", gap: 6, marginBottom: 12, alignItems: "center" }}>
        <span style={{ fontSize: 11, color: "#6b7280", fontWeight: 600 }}>유형:</span>
        <button
          onClick={() => { setAppModeFilter("all"); setSelectedIds([]); }}
          style={{
            padding: "4px 12px", borderRadius: 5, fontSize: 11, cursor: "pointer",
            border: `1px solid ${appModeFilter === "all" ? "#6366f1" : "#e5e7eb"}`,
            background: appModeFilter === "all" ? "rgba(99,102,241,0.1)" : "#f9fafb",
            color: appModeFilter === "all" ? "#6366f1" : "#6b7280", fontWeight: appModeFilter === "all" ? 700 : 400,
          }}
        >
          전체
        </button>
        <button
          onClick={() => { setAppModeFilter("app"); setSelectedIds([]); }}
          style={{
            padding: "4px 12px", borderRadius: 5, fontSize: 11, cursor: "pointer",
            border: `1px solid ${appModeFilter === "app" ? "#f59e0b" : "#e5e7eb"}`,
            background: appModeFilter === "app" ? "rgba(245,158,11,0.1)" : "#f9fafb",
            color: appModeFilter === "app" ? "#b45309" : "#6b7280", fontWeight: appModeFilter === "app" ? 700 : 400,
          }}
        >
          프로그램(앱 모드) ({(allPosts || []).filter(p => (p as any).isAppMode).length})
        </button>
        {appModeFilter === "app" && (
          <span style={{ fontSize: 10, color: "#9ca3af", marginLeft: 4 }}>
            상단 체크박스로 선택 후 일괄 표시 너비 변경 가능
                    </span>
        )}
      </div>}
      {/* 일괄 작업 툴바 */}
      {selectedIds.length > 0 && (
        <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 10, padding: "8px 14px", background: "rgba(99,102,241,0.07)", borderRadius: 8, border: "1px solid rgba(99,102,241,0.2)" }}>
          <span style={{ fontSize: 12, color: "#6366f1", fontWeight: 700 }}>{selectedIds.length}개 선택됨</span>
          {/* 임시저장 탭: 일괄 발행 버튼 강조 */}
          {filter === "draft" && (
            <button
              onClick={() => { if (confirm(`선택한 ${selectedIds.length}개 게시물을 발행할까요?`)) bulkUpdateStatus.mutate({ ids: selectedIds, status: "published" }); }}
              style={{ padding: "5px 14px", borderRadius: 6, border: "2px solid #16a34a", background: "rgba(34,197,94,0.15)", color: "#15803d", fontSize: 12, fontWeight: 800, cursor: "pointer" }}
            >
              🚀 일괄 발행
            </button>
          )}
          {/* 발행됨 탭: 임시저장으로 버튼 */}
          {filter === "published" && (
            <button
              onClick={() => { if (confirm(`선택한 ${selectedIds.length}개 게시물을 임시저장으로 이동할까요?`)) bulkUpdateStatus.mutate({ ids: selectedIds, status: "draft" }); }}
              style={{ padding: "5px 12px", borderRadius: 6, border: "1px solid #ca8a04", background: "rgba(234,179,8,0.08)", color: "#ca8a04", fontSize: 11, fontWeight: 700, cursor: "pointer" }}
            >
              임시저장으로
            </button>
          )}
          {/* 발행됨 탭: 발행하기 버튼 */}
          {filter === "published" && (
            <button
              onClick={() => { if (confirm(`선택한 ${selectedIds.length}개 게시물을 발행할까요?`)) bulkUpdateStatus.mutate({ ids: selectedIds, status: "published" }); }}
              style={{ padding: "5px 12px", borderRadius: 6, border: "1px solid #16a34a", background: "rgba(34,197,94,0.08)", color: "#16a34a", fontSize: 11, fontWeight: 700, cursor: "pointer" }}
            >
              발행하기
            </button>
          )}
          {/* 임시저장 탭: 일괄 영구 삭제 버튼 */}
          {filter === "draft" && (
            <button
              onClick={() => setBulkHardDeleteDialog(true)}
              style={{ padding: "5px 12px", borderRadius: 6, border: "2px solid #dc2626", background: "rgba(220,38,38,0.12)", color: "#dc2626", fontSize: 11, fontWeight: 800, cursor: "pointer" }}
            >
              🗑 영구 삭제
            </button>
          )}
          {/* 발행됨 탭: 보관함으로 이동 버튼 */}
          {filter !== "draft" && (
            <button
              onClick={() => setBulkDeleteDialog(true)}
              style={{ padding: "5px 12px", borderRadius: 6, border: "1px solid #ef4444", background: "rgba(239,68,68,0.08)", color: "#ef4444", fontSize: 11, fontWeight: 700, cursor: "pointer" }}
            >
              보관함으로
            </button>
          )}
          {/* 일괄 카테고리 변경 - 임시저장 탭에서는 숨김 */}
          {filter !== "draft" && (
            <div style={{ display: "flex", alignItems: "center", gap: 4, marginLeft: 8 }}>
              <select
                value={bulkCatTarget}
                onChange={e => setBulkCatTarget(e.target.value)}
                style={{ padding: "5px 8px", borderRadius: 6, border: "1px solid #d1d5db", fontSize: 11, color: "#374151", background: "#fff", cursor: "pointer" }}
              >
                <option value="">카테고리 선택...</option>
                {categoryOptions.map(opt => (
                  <option key={opt.key} value={opt.key}>{opt.label}</option>
                ))}
              </select>
              <button
                disabled={!bulkCatTarget || bulkUpdateCategory.isPending}
                onClick={() => {
                  if (!bulkCatTarget) return;
                  const label = categoryOptions.find(c => c.key === bulkCatTarget)?.label || bulkCatTarget;
                  if (confirm(`선택한 ${selectedIds.length}개 게시물의 카테고리를 "${label}"으로 변경할까요?`))
                    bulkUpdateCategory.mutate({ ids: selectedIds, category: bulkCatTarget });
                }}
                style={{ padding: "5px 12px", borderRadius: 6, border: "1px solid #6366f1", background: bulkCatTarget ? "rgba(99,102,241,0.1)" : "#f3f4f6", color: bulkCatTarget ? "#6366f1" : "#9ca3af", fontSize: 11, fontWeight: 700, cursor: bulkCatTarget ? "pointer" : "not-allowed" }}
              >
                카테고리 변경
              </button>
            </div>
          )}
          {/* 앱 모드 글 표시 너비 일괄 변경 - 선택된 글 중 isAppMode인 것이 있을 때만 표시 */}
          {selectedIds.some(id => (allPosts || []).find(p => p.id === id && (p as any).isAppMode)) && (
            <div style={{ display: "flex", alignItems: "center", gap: 4, marginLeft: 8, padding: "4px 10px", background: "rgba(245,158,11,0.08)", borderRadius: 6, border: "1px solid rgba(245,158,11,0.25)" }}>
              <Maximize2 size={11} color="#b45309" />
              <span style={{ fontSize: 11, color: "#b45309", fontWeight: 700 }}>앱 표시 너비:</span>
              <button
                onClick={() => {
                  const appIds = selectedIds.filter(id => (allPosts || []).find(p => p.id === id && (p as any).isAppMode));
                  if (appIds.length === 0) return;
                  if (confirm(`선택한 글 중 앱 모드 ${appIds.length}개를 "전체 너비(사이드바 포함)"로 변경할까요?`))
                    batchUpdateEmbedWidth.mutate({ ids: appIds, embedWidth: "full" });
                }}
                disabled={batchUpdateEmbedWidth.isPending}
                style={{ padding: "3px 10px", borderRadius: 5, border: "1px solid #f59e0b", background: "rgba(245,158,11,0.15)", color: "#b45309", fontSize: 10, fontWeight: 700, cursor: "pointer", display: "flex", alignItems: "center", gap: 3 }}
              >
                <Maximize2 size={10} /> 전체 너비
              </button>
              <button
                onClick={() => {
                  const appIds = selectedIds.filter(id => (allPosts || []).find(p => p.id === id && (p as any).isAppMode));
                  if (appIds.length === 0) return;
                  if (confirm(`선택한 글 중 앱 모드 ${appIds.length}개를 "본문 너비"로 변경할까요?`))
                    batchUpdateEmbedWidth.mutate({ ids: appIds, embedWidth: "content" });
                }}
                disabled={batchUpdateEmbedWidth.isPending}
                style={{ padding: "3px 10px", borderRadius: 5, border: "1px solid #d1d5db", background: "#f9fafb", color: "#6b7280", fontSize: 10, fontWeight: 700, cursor: "pointer", display: "flex", alignItems: "center", gap: 3 }}
              >
                <Minimize2 size={10} /> 본문 너비
              </button>
            </div>
          )}
          {/* 댓글 일괄 허용/비허용 */}
          <div style={{ display: "flex", alignItems: "center", gap: 4, marginLeft: 4 }}>
            <button
              onClick={() => { if (confirm(`선택한 ${selectedIds.length}개 게시물의 댓글을 허용할까요?`)) bulkToggleAllowComments.mutate({ ids: selectedIds, allowComments: true }); }}
              disabled={bulkToggleAllowComments.isPending}
              style={{ padding: "5px 10px", borderRadius: 6, border: "1px solid #1d4ed8", background: "rgba(37,99,235,0.1)", color: "#1d4ed8", fontSize: 11, fontWeight: 700, cursor: "pointer", display: "flex", alignItems: "center", gap: 3 }}
            >
              <MessageSquare size={11} /> 댓글 허용
            </button>
            <button
              onClick={() => { if (confirm(`선택한 ${selectedIds.length}개 게시물의 댓글을 비허용할까요?`)) bulkToggleAllowComments.mutate({ ids: selectedIds, allowComments: false }); }}
              disabled={bulkToggleAllowComments.isPending}
              style={{ padding: "5px 10px", borderRadius: 6, border: "1px solid #9ca3af", background: "#f9fafb", color: "#6b7280", fontSize: 11, fontWeight: 700, cursor: "pointer", display: "flex", alignItems: "center", gap: 3 }}
            >
              <MessageSquare size={11} /> 댓글 비허용
            </button>
          </div>
          <button onClick={() => setSelectedIds([])} style={{ marginLeft: "auto", padding: "5px 10px", borderRadius: 6, border: "1px solid #e5e7eb", background: "#f9fafb", color: "#6b7280", fontSize: 11, cursor: "pointer" }}>선택 해제</button>
        </div>
      )}

      {/* 페이지 탭 목록 */}
      {catFilter === "pages" && (
        <div style={{ background: "#ffffff", border: "1px solid #e5e7eb", borderRadius: 10, overflow: "hidden", boxShadow: "0 1px 3px rgba(0,0,0,0.05)" }}>
          {/* 헤더 */}
          <div style={{ display: "grid", gridTemplateColumns: "1fr 160px 70px 80px 80px 200px", gap: 0, background: "#f9fafb", padding: "10px 16px", fontSize: 11, color: "#6b7280", fontWeight: 700, borderBottom: "1px solid #e5e7eb" }}>
            <div>제목 / URL</div>
            <div>주소</div>
            <div>조회수</div>
            <div>수정일</div>
            <div style={{ textAlign: "center" }}>상태</div>
            <div>작업</div>
          </div>
          {(publishedPages || []).length === 0 ? (
            <div style={{ textAlign: "center", padding: "32px", color: "#9ca3af", fontSize: 13 }}>
              발행된 페이지가 없습니다. "페이지 관리" 탭에서 페이지를 만들고 발행하세요.
            </div>
          ) : (
            (publishedPages || []).map((page, idx) => {
              const pageUrl = `/page/${page.slug}`;
              const fullUrl = `${window.location.origin}${pageUrl}`;
              const isPublished = page.published;
              return (
                <div key={page.id} style={{
                  display: "grid", gridTemplateColumns: "1fr 160px 70px 80px 80px 200px",
                  gap: 0, padding: "10px 16px", fontSize: 12,
                  borderTop: idx > 0 ? "1px solid #f3f4f6" : "none",
                  alignItems: "center",
                  background: isPublished ? "#ffffff" : "#fafafa",
                  opacity: isPublished ? 1 : 0.75,
                }}>
                  {/* 제목 */}
                  <div style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", paddingRight: 8 }}>
                    <a href={pageUrl} target="_blank" rel="noopener noreferrer"
                      style={{ color: isPublished ? "#111827" : "#9ca3af", textDecoration: "none", fontWeight: 600, fontSize: 18 }}
                      onMouseEnter={e => (e.currentTarget.style.color = "#7c3aed")}
                      onMouseLeave={e => (e.currentTarget.style.color = isPublished ? "#111827" : "#9ca3af")}
                    >{page.title}</a>
                    {page.description && (
                      <div style={{ fontSize: 12, color: "#9ca3af", marginTop: 2, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{page.description}</div>
                    )}
                  </div>
                  {/* URL */}
                  <div style={{ fontSize: 11, color: "#6b7280", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                    {pageUrl}
                  </div>
                  {/* 조회수 */}
                  <div style={{ fontSize: 12, color: "#374151", textAlign: "center" }}>
                    {((page as any).viewCount ?? 0).toLocaleString()}
                  </div>
                  {/* 수정일 */}
                  <div style={{ fontSize: 11, color: "#9ca3af" }}>
                    {new Date(page.updatedAt).toLocaleDateString("ko-KR")}
                  </div>
                  {/* 상태 배지 */}
                  <div style={{ textAlign: "center" }}>
                    <span style={{
                      display: "inline-block", padding: "2px 8px", borderRadius: 20, fontSize: 10, fontWeight: 700,
                      background: isPublished ? "rgba(16,185,129,0.1)" : "rgba(156,163,175,0.15)",
                      color: isPublished ? "#059669" : "#6b7280",
                      border: `1px solid ${isPublished ? "#6ee7b7" : "#d1d5db"}`,
                    }}>
                      {isPublished ? "공개" : "비공개"}
                    </span>
                  </div>
                  {/* 작업 버튼 */}
                  <div style={{ display: "flex", gap: 4, flexWrap: "wrap" }}>
                    {/* 공개/비공개 토글 */}
                    <button
                      onClick={() => togglePagePublish.mutate({ id: page.id, published: !isPublished })}
                      disabled={togglePagePublish.isPending}
                      title={isPublished ? "비공개로 전환" : "공개로 전환"}
                      style={{
                        padding: "3px 8px", borderRadius: 5, fontSize: 10, fontWeight: 700, cursor: "pointer",
                        border: isPublished ? "1px solid #f59e0b" : "1px solid #10b981",
                        background: isPublished ? "rgba(245,158,11,0.08)" : "rgba(16,185,129,0.08)",
                        color: isPublished ? "#d97706" : "#059669",
                        display: "flex", alignItems: "center", gap: 3,
                        opacity: togglePagePublish.isPending ? 0.6 : 1,
                      }}
                    >
                      {isPublished ? "발행 취소" : "공개"}
                    </button>
                    <button
                      onClick={() => {
                        navigator.clipboard.writeText(fullUrl).then(() => toast.success("페이지 주소가 복사되었습니다")).catch(() => toast.error("복사 실패"));
                      }}
                      title={`복사: ${fullUrl}`}
                      style={{ padding: "3px 8px", borderRadius: 5, border: "1px solid #7c3aed", background: "rgba(124,58,237,0.07)", color: "#7c3aed", fontSize: 10, fontWeight: 700, cursor: "pointer", display: "flex", alignItems: "center", gap: 3 }}
                    >
                      주소 복사
                    </button>
                    <button
                      onClick={() => onEditPage?.(page.id)}
                      title="페이지 편집"
                      style={{ padding: "3px 8px", borderRadius: 5, border: "1px solid #6366f1", background: "rgba(99,102,241,0.08)", color: "#6366f1", fontSize: 10, fontWeight: 700, cursor: "pointer", display: "flex", alignItems: "center", gap: 3 }}
                    >
                      ✏️ 편집
                    </button>
                    <a href={pageUrl} target="_blank" rel="noopener noreferrer"
                      style={{ padding: "3px 8px", borderRadius: 5, border: "1px solid #e5e7eb", background: "#f9fafb", color: "#6b7280", fontSize: 10, fontWeight: 700, cursor: "pointer", display: "flex", alignItems: "center", gap: 3, textDecoration: "none" }}
                    >
                      보기
                    </a>
                  </div>
                </div>
              );
            })
          )}
        </div>
      )}

      {/* 게시물 테이블 */}
      {catFilter !== "pages" && <div style={{ background: "#ffffff", border: "1px solid #e5e7eb", borderRadius: 10, overflow: "hidden", boxShadow: "0 1px 3px rgba(0,0,0,0.05)", maxWidth: "100%" }}>
        <div style={{ display: "grid", gridTemplateColumns: "28px 28px minmax(120px,1fr) 120px 44px 48px 68px 280px", gap: 0, background: "#f9fafb", padding: "8px 12px", fontSize: 11, color: "#6b7280", fontWeight: 700, borderBottom: "1px solid #e5e7eb" }}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "center" }}>
            <input type="checkbox" checked={filtered.length > 0 && selectedIds.length === filtered.length} onChange={toggleSelectAll} style={{ cursor: "pointer" }} />
          </div>
          <div style={{ textAlign: "center" }}>#</div>
          <div style={{ cursor: "pointer", userSelect: "none", display: "flex", alignItems: "center", gap: 3 }} onClick={() => handleSort("title")}>
            제목 {sortKey === "title" ? (sortDir === "asc" ? "↑" : "↓") : <span style={{ color: "#d1d5db" }}>↕</span>}
          </div>
          <div>카테고리</div>
          <div>상태</div>
          <div style={{ cursor: "pointer", userSelect: "none", display: "flex", alignItems: "center", gap: 3 }} onClick={() => handleSort("views")}>
            조회수 {sortKey === "views" ? (sortDir === "asc" ? "↑" : "↓") : <span style={{ color: "#d1d5db" }}>↕</span>}
          </div>
          <div style={{ cursor: "pointer", userSelect: "none", display: "flex", alignItems: "center", gap: 3 }} onClick={() => handleSort("createdAt")}>
            작성일 {sortKey === "createdAt" ? (sortDir === "asc" ? "↑" : "↓") : <span style={{ color: "#d1d5db" }}>↕</span>}
          </div>
          <div>작업</div>
        </div>

        {pagedPosts.map((post, idx) => (
          <div key={post.id} style={{
            display: "grid", gridTemplateColumns: "28px 28px minmax(120px,1fr) 120px 44px 48px 68px 280px",
            gap: 0, padding: "7px 12px", fontSize: 13,
            borderTop: idx > 0 ? "1px solid #f3f4f6" : "none",
            alignItems: "center",
            background: selectedIds.includes(post.id) ? "rgba(99,102,241,0.04)" : "#ffffff",
          }}>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "center" }}>
              <input type="checkbox" checked={selectedIds.includes(post.id)} onChange={() => toggleSelect(post.id)} style={{ cursor: "pointer" }} />
            </div>
            <div style={{ textAlign: "center", color: "#9ca3af", fontSize: 11, fontWeight: 600 }}>{(currentPage - 1) * POSTS_PER_PAGE + idx + 1}</div>
            <div style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", color: "#111827", paddingRight: 8 }}>
              <a
                href={getPostUrl(post)}
                target="_blank"
                rel="noopener noreferrer"
                style={{ color: "#111827", textDecoration: "none", fontWeight: 500 }}
                onMouseEnter={e => (e.currentTarget.style.color = "#6366f1")}
                onMouseLeave={e => (e.currentTarget.style.color = "#111827")}
              >
                {post.title}
              </a>
              {(post as any).isAppMode && (
                <span style={{ marginLeft: 5, fontSize: 9, background: "rgba(245,158,11,0.15)", color: "#b45309", padding: "1px 5px", borderRadius: 3, fontWeight: 700, verticalAlign: "middle" }}>
                  프로그램
                </span>
              )}
              {(post as any).isAppMode && (
                <span style={{ marginLeft: 3, fontSize: 9, background: (post as any).embedWidth === "full" ? "rgba(99,102,241,0.12)" : "rgba(107,114,128,0.1)", color: (post as any).embedWidth === "full" ? "#6366f1" : "#6b7280", padding: "1px 5px", borderRadius: 3, fontWeight: 600, verticalAlign: "middle" }}>
                  {(post as any).embedWidth === "full" ? "전체너비" : "본문너비"}
                </span>
              )}
              {(post as any).allowComments === false && (
                <span style={{
                  marginLeft: 5, fontSize: 9,
                  background: "rgba(156,163,175,0.15)",
                  color: "#9ca3af",
                  padding: "1px 5px", borderRadius: 3, fontWeight: 700,
                  verticalAlign: "middle",
                  textDecoration: "line-through",
                  border: "1px solid #e5e7eb",
                }}>
                  댓글
                </span>
              )}
              <span style={{ marginLeft: 6, fontSize: 10, color: "#9ca3af" }}>by {post.authorName || "?"}</span>
              {/* SEO URL 인라인 편집 */}
              {slugEditId === post.id ? (
                <div style={{ display: "flex", alignItems: "center", gap: 4, marginTop: 4 }}>
                  <span style={{ fontSize: 10, color: "#9ca3af", flexShrink: 0 }}>/p/</span>
                  <input
                    autoFocus
                    value={slugEditValue}
                    onChange={e => setSlugEditValue(e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, "-").replace(/-+/g, "-"))}
                    onKeyDown={e => {
                      if (e.key === "Enter") updatePostCustomSlug.mutate({ id: post.id, customSlug: slugEditValue || null });
                      if (e.key === "Escape") { setSlugEditId(null); setSlugEditValue(""); }
                    }}
                    placeholder="영문 슬러그 입력..."
                    style={{ fontSize: 11, padding: "2px 6px", borderRadius: 4, border: "1px solid #6366f1", outline: "none", width: 160, color: "#111827", background: "#fff" }}
                  />
                  <button
                    onClick={() => updatePostCustomSlug.mutate({ id: post.id, customSlug: slugEditValue || null })}
                    disabled={updatePostCustomSlug.isPending}
                    style={{ fontSize: 10, padding: "2px 6px", borderRadius: 4, border: "none", background: "#6366f1", color: "#fff", cursor: "pointer", fontWeight: 700 }}
                  >✓</button>
                  <button
                    onClick={() => { setSlugEditId(null); setSlugEditValue(""); }}
                    style={{ fontSize: 10, padding: "2px 6px", borderRadius: 4, border: "1px solid #e5e7eb", background: "#f9fafb", color: "#6b7280", cursor: "pointer" }}
                  >×</button>
                </div>
              ) : (
                <div
                  style={{ display: "flex", alignItems: "center", gap: 3, marginTop: 3, cursor: "pointer" }}
                  onClick={() => { setSlugEditId(post.id); setSlugEditValue((post as any).customSlug || ""); }}
                  title="SEO URL 수정"
                >
                  {(post as any).customSlug ? (
                    <span style={{ fontSize: 10, color: "#6366f1", fontFamily: "monospace", background: "rgba(99,102,241,0.08)", padding: "1px 5px", borderRadius: 3, border: "1px solid rgba(99,102,241,0.2)" }}>
                      /p/{(post as any).customSlug}
                    </span>
                  ) : (
                    <span style={{ fontSize: 10, color: "#d1d5db", fontStyle: "italic" }}>SEO URL 추가...</span>
                  )}
                  <span style={{ fontSize: 9, color: "#d1d5db" }}>✏️</span>
                </div>
              )}
            </div>
            <div style={{ overflow: "hidden" }}>
              <span style={{ fontSize: 9, background: "#ede9fe", color: "#6366f1", padding: "2px 5px", borderRadius: 4, display: "inline-block", maxWidth: "100%", lineHeight: 1.4, wordBreak: "keep-all" }}>
                {CAT_LABELS[post.category] || post.category}
              </span>
            </div>
            <div>
              <span style={{
                fontSize: 10, padding: "2px 6px", borderRadius: 4,
                background: post.status === "published" ? "rgba(34,197,94,0.1)" : "rgba(234,179,8,0.1)",
                color: post.status === "published" ? "#16a34a" : "#ca8a04",
              }}>
                {post.status === "published" ? "발행" : "임시"}
              </span>
            </div>
            <div style={{ color: "#6b7280", cursor: "pointer" }}
              onClick={() => setViewStatsPostId(post.id)}
              title="조회수 상세 보기"
            >
              <span style={{ borderBottom: "1px dashed #6366f1", color: "#6366f1", fontWeight: 600 }}>{post.views}</span>
              <BarChart2 size={10} style={{ marginLeft: 3, verticalAlign: "middle", color: "#6366f1" }} />
            </div>
            <div style={{ color: "#9ca3af", fontSize: 10 }}>
              {new Date(post.createdAt).toLocaleDateString("ko-KR", { year: "2-digit", month: "2-digit", day: "2-digit" })}
            </div>
            <div style={{ display: "flex", gap: 2, flexWrap: "nowrap", alignItems: "center" }}>
              {/* 편집 */}
              <button onClick={() => navigate(`/write/edit/${post.id}`)} style={btnStyle} title="편집">
                <Edit2 size={11} />편집
              </button>
              {/* 상태토글 */}
              <button
                onClick={() => updateStatus.mutate({ id: post.id, status: post.status === "published" ? "draft" : "published" })}
                style={{ ...btnStyle, color: post.status === "published" ? "#ca8a04" : "#16a34a",
                  border: post.status === "published" ? "1px solid #ca8a04" : "1px solid #16a34a" }}
                title={post.status === "published" ? "임시저장으로 변경" : "발행"}
              >
                {post.status === "published" ? <EyeOff size={11} /> : <Eye size={11} />}
                {post.status === "published" ? "임시" : "발행"}
              </button>
              {/* 고정글 */}
              <button
                onClick={() => togglePin.mutate({ postId: post.id, pin: !(post as any).isPinned })}
                style={{
                  ...btnStyle,
                  background: (post as any).isPinned ? "#2563eb" : "#f9fafb",
                  color: (post as any).isPinned ? "#ffffff" : "#9ca3af",
                  border: (post as any).isPinned ? "1px solid #1d4ed8" : "1px solid #d1d5db",
                }}
                title={(post as any).isPinned ? "고정글 해제" : "섹션에 고정"}
              >
                {(post as any).isPinned ? <Pin size={11} /> : <PinOff size={11} />}
                고정
              </button>
              {/* 앱모드 너비 토글 - 정렬 통일을 위해 숨김 */}
              {/* 섹션노출 토글 */}
              <button
                onClick={() => toggleShowInSection.mutate({ id: post.id, showInSection: !(post as any).showInSection })}
                style={{
                  ...btnStyle,
                  color: (post as any).showInSection ? "#6366f1" : "#9ca3af",
                  border: (post as any).showInSection ? "1px solid #6366f1" : "1px solid #d1d5db",
                  background: (post as any).showInSection ? "rgba(99,102,241,0.08)" : "#f9fafb",
                }}
                title={(post as any).showInSection ? "메인노출 중 - 클릭하면 숨김" : "메인노출 숨김 - 클릭하면 노출"}
              >
                {(post as any).showInSection ? <Eye size={11} /> : <EyeOff size={11} />}
                노출
              </button>
              {/* 댓글 허용 토글 */}
              <button
                onClick={() => toggleAllowComments.mutate({ id: post.id, allowComments: !(post as any).allowComments })}
                style={{
                  ...btnStyle,
                  background: (post as any).allowComments !== false ? "#2563eb" : "#f9fafb",
                  color: (post as any).allowComments !== false ? "#ffffff" : "#9ca3af",
                  border: (post as any).allowComments !== false ? "1px solid #1d4ed8" : "1px solid #d1d5db",
                }}
                title={(post as any).allowComments !== false ? "댓글 허용 중 - 클릭하면 비활성화" : "댓글 비활성화 - 클릭하면 허용"}
              >
                {(post as any).allowComments !== false ? <MessageSquare size={11} /> : <MessageCircleOff size={11} />}
                댓글
              </button>
              {/* 삭제 */}
              <button
                onClick={() => setSingleDeleteTarget({ id: post.id, title: post.title, status: post.status })}
                style={{ ...btnStyle, color: "#ef4444", border: "1px solid #fca5a5" }}
                title="삭제"
              >
                <Trash2 size={11} />삭제
              </button>
            </div>
          </div>
        ))}

                {filtered.length === 0 && (
          <div style={{ textAlign: "center", padding: "32px", color: "#9ca3af", fontSize: 13 }}>
            게시물이 없습니다.
          </div>
        )}
      </div>}

      {/* ─── 페이지네이션 ─── */}
      {totalPages > 1 && (
        <div style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 6, marginTop: 20, flexWrap: "wrap" }}>
          <button
            onClick={() => setCurrentPage(1)}
            disabled={currentPage === 1}
            style={{ padding: "5px 10px", borderRadius: 6, border: "1px solid #e5e7eb", background: currentPage === 1 ? "#f3f4f6" : "#fff", color: currentPage === 1 ? "#9ca3af" : "#374151", fontSize: 12, cursor: currentPage === 1 ? "default" : "pointer", fontWeight: 600 }}
          >«</button>
          <button
            onClick={() => setCurrentPage(p => Math.max(1, p - 1))}
            disabled={currentPage === 1}
            style={{ padding: "5px 10px", borderRadius: 6, border: "1px solid #e5e7eb", background: currentPage === 1 ? "#f3f4f6" : "#fff", color: currentPage === 1 ? "#9ca3af" : "#374151", fontSize: 12, cursor: currentPage === 1 ? "default" : "pointer", fontWeight: 600 }}
          >‹</button>
          {Array.from({ length: totalPages }, (_, i) => i + 1)
            .filter(p => p === 1 || p === totalPages || Math.abs(p - currentPage) <= 2)
            .reduce<(number | "...")[]>((acc, p, i, arr) => {
              if (i > 0 && typeof arr[i - 1] === "number" && (p as number) - (arr[i - 1] as number) > 1) acc.push("...");
              acc.push(p);
              return acc;
            }, [])
            .map((p, i) => p === "..." ? (
              <span key={`ellipsis-${i}`} style={{ padding: "5px 4px", fontSize: 12, color: "#9ca3af" }}>…</span>
            ) : (
              <button
                key={p}
                onClick={() => setCurrentPage(p as number)}
                style={{
                  padding: "5px 11px", borderRadius: 6, fontSize: 12, fontWeight: 700, cursor: "pointer",
                  border: currentPage === p ? "2px solid #6366f1" : "1px solid #e5e7eb",
                  background: currentPage === p ? "#eef2ff" : "#fff",
                  color: currentPage === p ? "#6366f1" : "#374151",
                }}
              >{p}</button>
            ))
          }
          <button
            onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))}
            disabled={currentPage === totalPages}
            style={{ padding: "5px 10px", borderRadius: 6, border: "1px solid #e5e7eb", background: currentPage === totalPages ? "#f3f4f6" : "#fff", color: currentPage === totalPages ? "#9ca3af" : "#374151", fontSize: 12, cursor: currentPage === totalPages ? "default" : "pointer", fontWeight: 600 }}
          >›</button>
          <button
            onClick={() => setCurrentPage(totalPages)}
            disabled={currentPage === totalPages}
            style={{ padding: "5px 10px", borderRadius: 6, border: "1px solid #e5e7eb", background: currentPage === totalPages ? "#f3f4f6" : "#fff", color: currentPage === totalPages ? "#9ca3af" : "#374151", fontSize: 12, cursor: currentPage === totalPages ? "default" : "pointer", fontWeight: 600 }}
          >»</button>
          <span style={{ fontSize: 11, color: "#6b7280", marginLeft: 8 }}>
            {(currentPage - 1) * POSTS_PER_PAGE + 1}–{Math.min(currentPage * POSTS_PER_PAGE, filtered.length)} / 총 {filtered.length}개
          </span>
        </div>
      )}
      {/* ─── 카테고리별 댓글 설정 ─── */}
      <div style={{ ...cardStyle, marginTop: 24 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 16 }}>
          <MessageSquare size={15} color="#6366f1" />
          <span style={{ fontSize: 13, fontWeight: 700, color: "#111827" }}>카테고리별 댓글 설정</span>
          <span style={{ fontSize: 11, color: "#9ca3af" }}>카테고리별로 댓글 기능을 켜거나 끌 수 있습니다.</span>
        </div>
        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          {categoryOptions.map(opt => {
            const setting = catCommentSettings?.find((s: { categoryKey: string }) => s.categoryKey === opt.key);
            const enabled = setting !== undefined ? setting.commentsEnabled : true;
            return (
              <div key={opt.key} style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "10px 14px", background: "#f9fafb", borderRadius: 8, border: "1px solid #e5e7eb" }}>
                <span style={{ fontSize: 13, color: "#374151", fontWeight: 500 }}>{opt.label}</span>
                <button
                  onClick={() => updateCatComment.mutate({ categoryKey: opt.key, commentsEnabled: !enabled })}
                  style={{
                    padding: "5px 14px", borderRadius: 20, fontSize: 12, fontWeight: 700, cursor: "pointer",
                    border: "none",
                    background: enabled ? "linear-gradient(135deg, #6366f1, #8b5cf6)" : "#e5e7eb",
                    color: enabled ? "#fff" : "#6b7280",
                    transition: "all 0.15s",
                  }}
                >
                  {enabled ? "댓글 ON" : "댓글 OFF"}
                </button>
              </div>
            );
          })}
          {categoryOptions.length === 0 && (
            <div style={{ fontSize: 12, color: "#9ca3af", textAlign: "center", padding: "16px 0" }}>카테고리가 없습니다. 헤더 네비 탭에서 카테고리를 추가하세요.</div>
          )}
        </div>
      </div>

      {/* ─── 조회수 상세 팝업 ─── */}
      {viewStatsPostId !== null && (
        <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.5)", zIndex: 9999, display: "flex", alignItems: "center", justifyContent: "center", padding: 16 }}
          onClick={() => setViewStatsPostId(null)}
        >
          <div style={{ background: "#fff", borderRadius: 14, padding: 28, width: "100%", maxWidth: 520, maxHeight: "80vh", overflow: "auto", boxShadow: "0 20px 60px rgba(0,0,0,0.2)" }}
            onClick={e => e.stopPropagation()}
          >
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 20 }}>
              <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                <BarChart2 size={18} color="#6366f1" />
                <span style={{ fontSize: 15, fontWeight: 800, color: "#111827" }}>조회수 상세 분석</span>
              </div>
              <button onClick={() => setViewStatsPostId(null)} style={{ ...btnStyle, width: 28, height: 28 }}><X size={14} /></button>
            </div>
            {viewStatsLoading ? (
              <div style={{ display: "flex", alignItems: "center", justifyContent: "center", padding: "32px 0", gap: 8, color: "#9ca3af" }}>
                <Loader2 size={18} className="animate-spin" /><span style={{ fontSize: 13 }}>불러오는 중...</span>
              </div>
            ) : viewStats ? (
              <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
                {/* 총 조회수 */}
                <div style={{ textAlign: "center", padding: "16px 0", borderBottom: "1px solid #f3f4f6" }}>
                  <div style={{ fontSize: 36, fontWeight: 900, color: "#6366f1" }}>{viewStats.total}</div>
                  <div style={{ fontSize: 12, color: "#9ca3af", marginTop: 4 }}>총 조회수 (최근 500건 기준)</div>
                </div>
                {/* 방문자 유형 */}
                <div>
                  <div style={{ fontSize: 12, fontWeight: 700, color: "#374151", marginBottom: 10 }}>방문자 유형</div>
                  <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                    {([
                      { key: "guest",     label: "외부 방문자",    color: "#10b981" },
                      { key: "logged_in", label: "로그인 회원",    color: "#6366f1" },
                      { key: "admin",     label: "관리자 방문",    color: "#f59e0b" },
                      { key: "author",    label: "작성자 본인",    color: "#ec4899" },
                    ] as const).map(({ key, label, color }) => {
                      const count = (viewStats.byVisitorType as Record<string, number>)[key] ?? 0;
                      const pct = viewStats.total > 0 ? Math.round(count / viewStats.total * 100) : 0;
                      return (
                        <div key={key} style={{ display: "flex", alignItems: "center", gap: 10 }}>
                          <div style={{ width: 80, fontSize: 12, color: "#374151", flexShrink: 0 }}>{label}</div>
                          <div style={{ flex: 1, height: 14, background: "#f3f4f6", borderRadius: 7, overflow: "hidden" }}>
                            <div style={{ width: `${pct}%`, height: "100%", background: color, borderRadius: 7, transition: "width 0.5s" }} />
                          </div>
                          <div style={{ width: 50, fontSize: 12, color: "#374151", textAlign: "right" }}>{count}회 ({pct}%)</div>
                        </div>
                      );
                    })}
                  </div>
                </div>
                {/* 유입 출처 유형 */}
                <div>
                  <div style={{ fontSize: 12, fontWeight: 700, color: "#374151", marginBottom: 10 }}>유입 출처</div>
                  <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                    {([
                      { key: "direct",   label: "직접 접속",   color: "#6366f1" },
                      { key: "search",   label: "검색 엔진",   color: "#10b981" },
                      { key: "social",   label: "소셜 미디어", color: "#f59e0b" },
                      { key: "share",    label: "공유 링크",   color: "#ec4899" },
                      { key: "internal", label: "내부 링크",   color: "#0ea5e9" },
                      { key: "external", label: "외부 링크",   color: "#8b5cf6" },
                    ] as const).map(({ key, label, color }) => {
                      const count = (viewStats.byReferrerType as Record<string, number>)[key] ?? 0;
                      if (count === 0) return null;
                      const pct = viewStats.total > 0 ? Math.round(count / viewStats.total * 100) : 0;
                      return (
                        <div key={key} style={{ display: "flex", alignItems: "center", gap: 10 }}>
                          <div style={{ width: 80, fontSize: 12, color: "#374151", flexShrink: 0 }}>{label}</div>
                          <div style={{ flex: 1, height: 14, background: "#f3f4f6", borderRadius: 7, overflow: "hidden" }}>
                            <div style={{ width: `${pct}%`, height: "100%", background: color, borderRadius: 7, transition: "width 0.5s" }} />
                          </div>
                          <div style={{ width: 50, fontSize: 12, color: "#374151", textAlign: "right" }}>{count}회 ({pct}%)</div>
                        </div>
                      );
                    })}
                  </div>
                </div>
                {/* 상위 유입 도메인 */}
                {Object.keys(viewStats.byReferrerDomain as Record<string, number>).length > 0 && (
                  <div>
                    <div style={{ fontSize: 12, fontWeight: 700, color: "#374151", marginBottom: 10 }}>상위 유입 도메인</div>
                    <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                      {Object.entries(viewStats.byReferrerDomain as Record<string, number>)
                        .sort((a, b) => b[1] - a[1]).slice(0, 8)
                        .map(([domain, count]) => (
                          <div key={domain} style={{ display: "flex", justifyContent: "space-between", padding: "5px 10px", background: "#f9fafb", borderRadius: 6, fontSize: 12 }}>
                            <span style={{ color: "#374151" }}>{domain}</span>
                            <span style={{ color: "#6366f1", fontWeight: 700 }}>{count}회</span>
                          </div>
                        ))}
                    </div>
                  </div>
                )}
                {viewStats.total === 0 && (
                  <div style={{ textAlign: "center", color: "#9ca3af", fontSize: 13, padding: "16px 0" }}>아직 조회 기록이 없습니다. (새 방문부터 기록됩니다)</div>
                )}
              </div>
            ) : (
              <div style={{ textAlign: "center", color: "#9ca3af", fontSize: 13, padding: "32px 0" }}>데이터를 불러올 수 없습니다.</div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
