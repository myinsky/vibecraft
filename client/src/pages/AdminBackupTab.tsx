import React, { useState, useEffect, useMemo, useRef, useCallback } from "react";
import { trpc } from "@/lib/trpc";
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

export function BackupTab() {
  const [isExporting, setIsExporting] = useState(false);
  const [isSavingToS3, setIsSavingToS3] = useState(false);
  const [isImporting, setIsImporting] = useState(false);
  const [pendingFile, setPendingFile] = useState<File | null>(null);
  const [pendingData, setPendingData] = useState<any>(null);
  const [showConfirm, setShowConfirm] = useState(false);
  const [confirmMode, setConfirmMode] = useState<"full" | "selected">("full");
  const [backupMeta, setBackupMeta] = useState<{ exportedAt: string; counts: Record<string, number> } | null>(null);
  const [selectedTables, setSelectedTables] = useState<string[]>([]);
  const [showSelectiveRestore, setShowSelectiveRestore] = useState(false);
  // 백업 진행률 추적
  const [backupJobId, setBackupJobId] = useState<string | null>(null);
  const [backupProgress, setBackupProgress] = useState<{ progress: number; step: string; done: boolean; error: string | null } | null>(null);
  const backupStartTimeRef = useRef<number | null>(null); // 백업 시작 시간 (ms)
  const [backupNetworkError, setBackupNetworkError] = useState<string | null>(null); // 폴링 네트워크 오류 메시지
  const backupIntervalRef = React.useRef<ReturnType<typeof setInterval> | null>(null);
  // 백업 이력 선택 삭제
  const [selectedBackupIds, setSelectedBackupIds] = useState<number[]>([]);
  const [isDeletingBackups, setIsDeletingBackups] = useState(false);
  // 다운로드 실패 상태 (itemId -> 오류 메시지)
  const [downloadErrors, setDownloadErrors] = useState<Record<number, string>>({});
  const [downloadingIds, setDownloadingIds] = useState<number[]>([]);
  // 다운로드 진행률 상태 (itemId -> { percent, speed, remaining })
  const [downloadProgress, setDownloadProgress] = useState<Record<number, { percent: number; speedKBs: number; remainingSec: number | null; done?: boolean }>>({})
  // 취소용 AbortController Map (itemId -> controller)
  const downloadControllersRef = useRef<Record<number, AbortController>>({});
  // 사용자가 직접 취소한 itemId Set
  const cancelledDownloadsRef = useRef<Set<number>>(new Set());

  const exportMutation = trpc.backup.export.useMutation();
  const importMutation = trpc.backup.import.useMutation();
  const saveToS3Mutation = trpc.backup.saveToS3.useMutation();
  const startBackupJobMutation = trpc.backup.startBackupJob.useMutation();
  const importSelectedMutation = trpc.backup.importSelected.useMutation();
  const deleteManyMutation = trpc.backup.deleteMany.useMutation();
  const historyQuery = trpc.backup.listHistory.useQuery();
  const utils = trpc.useUtils();

  // 자동 백업 스케줄 상태
  const autoBackupQuery = trpc.backup.getAutoBackupSchedule.useQuery();
  const setAutoBackupMutation = trpc.backup.setAutoBackupSchedule.useMutation({
    onSuccess: () => { autoBackupQuery.refetch(); },
  });
  const [autoBackupHour, setAutoBackupHour] = React.useState<number>(0);  // KST 시각
  React.useEffect(() => {
    if (autoBackupQuery.data) {
      setAutoBackupHour(Number(autoBackupQuery.data.cronHourKST ?? 0));
    }
  }, [autoBackupQuery.data]);

  // 진행률 폴링 시작
  const startProgressPolling = (jobId: string) => {
    if (backupIntervalRef.current) clearInterval(backupIntervalRef.current);
    let failCount = 0;
    const MAX_FAILS = 5; // 연속 5회 실패 시 중단
    backupIntervalRef.current = setInterval(async () => {
      try {
        const result = await utils.backup.getBackupProgress.fetch({ jobId });
        failCount = 0; // 성공 시 실패 카운터 리셋
        setBackupProgress({ progress: result.progress, step: result.step, done: result.done, error: result.error });
        if (result.done) {
          clearInterval(backupIntervalRef.current!);
          backupIntervalRef.current = null;
          setIsSavingToS3(false);
          if (result.error) {
            toast.error(`백업 실패: ${result.error}`);
          } else {
            adminSave.success("백업이 S3에 저장되었습니다.");
            historyQuery.refetch();
          }
          setTimeout(() => { setBackupJobId(null); setBackupProgress(null); }, 3000);
        }
      } catch (e: any) {
        failCount++;
        if (failCount >= MAX_FAILS) {
          clearInterval(backupIntervalRef.current!);
          backupIntervalRef.current = null;
          setIsSavingToS3(false);
          const errMsg = e?.message ?? '네트워크 연결에 실패했습니다.';
          setBackupNetworkError(errMsg);
          // 진행률 표시를 에러 상태로 변경
          setBackupProgress(prev => prev ? { ...prev, done: true, error: '폴링 실패: ' + errMsg } : null);
        }
        // 실패 시 재시도 (폴링 계속)
      }
    }, 800); // 0.8초 간격 - 진행률 변화를 빠르게 반영
  };

  const tableLabels: Record<string, string> = {
    posts: "게시물",
    postTags: "게시물 태그",
    vibeApps: "바이브 앱",
    appReviews: "앱 리뷰",
    postLikes: "좋아요",
    siteConfig: "사이트 설정",
    sidebarItems: "사이드바 항목",
    homeSections: "홈 섹션",
    navItems: "네비게이션",
    legalPages: "정책 페이지",
    comments: "댓글",
    categoryCommentSettings: "카테고리 댓글 설정",
    customPages: "커스텀 페이지",
  };

  // 로컬 백업 다운로드
  const handleExport = async () => {
    setIsExporting(true);
    try {
      const data = await exportMutation.mutateAsync();
      const json = JSON.stringify(data, null, 2);
      const blob = new Blob([json], { type: "application/json" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      const now = new Date().toISOString().slice(0, 10);
      a.href = url;
      a.download = `blog-backup-${now}.json`;
      a.click();
      URL.revokeObjectURL(url);
      toast.success("백업 파일이 다운로드되었습니다.");
    } catch {
      toast.error("백업 생성에 실패했습니다.");
    } finally {
      setIsExporting(false);
    }
  };

  // S3에 백업 저장 (진행률 추적 방식)
  const handleSaveToS3 = async () => {
    setIsSavingToS3(true);
    setBackupNetworkError(null); // 이전 오류 상태 초기화
    backupStartTimeRef.current = Date.now(); // 시작 시간 기록
    setBackupProgress({ progress: 0, step: '백업 시작 중...', done: false, error: null });
    try {
      const { jobId } = await startBackupJobMutation.mutateAsync();
      setBackupJobId(jobId);
      startProgressPolling(jobId);
    } catch {
      toast.error("S3 백업 시작에 실패했습니다.");
      setIsSavingToS3(false);
      setBackupProgress(null);
    }
  };

  // 이력에서 다운로드
  const handleDownloadFromHistory = async (itemId: number, fileKey: string, createdAt: number, fileSize?: number | null) => {
    // 이전 오류/완료 상태 초기화 + 로딩 시작
    setDownloadErrors(prev => { const n = { ...prev }; delete n[itemId]; return n; });
    setDownloadProgress(prev => { const n = { ...prev }; delete n[itemId]; return n; });
    setDownloadingIds(prev => [...prev, itemId]);

    // AbortController 등록 (취소 버튼에서 사용)
    const controller = new AbortController();
    downloadControllersRef.current[itemId] = controller;
    cancelledDownloadsRef.current.delete(itemId); // 이전 취소 플래그 제거

    try {
      // 1. 서버에서 S3 presign URL 직접 발급 (리다이렉트 없이 빠른 다운로드)
      const { url: signedUrl, fileSize: serverFileSize } = await utils.backup.getDownloadUrl.fetch({ id: itemId });
      const totalBytes = fileSize ?? serverFileSize ?? null;

      // 2. 타임아웃 120초
      const timer = setTimeout(() => controller.abort(), 120_000);
      try {
        const resp = await fetch(signedUrl, { signal: controller.signal });
        clearTimeout(timer);
        if (!resp.ok) throw new Error(`서버 응답 오류 (HTTP ${resp.status})`);

        // 3. ReadableStream으로 진행률 + 속도 + 예상 남은 시간 추적
        const reader = resp.body?.getReader();
        const chunks: ArrayBuffer[] = [];
        let receivedBytes = 0;
        const startTime = Date.now();

        if (reader) {
          while (true) {
            const { done, value } = await reader.read();
            if (done) break;
            chunks.push(value.buffer.slice(value.byteOffset, value.byteOffset + value.byteLength));
            receivedBytes += value.byteLength;
            const elapsedSec = (Date.now() - startTime) / 1000;
            const speedKBs = elapsedSec > 0 ? (receivedBytes / 1024) / elapsedSec : 0;
            const percent = totalBytes ? Math.min(99, Math.round((receivedBytes / totalBytes) * 100)) : -1;
            const remainingSec = (totalBytes && speedKBs > 0)
              ? Math.ceil((totalBytes - receivedBytes) / 1024 / speedKBs)
              : null;
            setDownloadProgress(prev => ({
              ...prev,
              [itemId]: { percent, speedKBs, remainingSec, done: false },
            }));
          }
        } else {
          // ReadableStream 미지원 환경 폴백
          const blob = await resp.blob();
          chunks.push(await blob.arrayBuffer());
        }

        // 4. blob 생성 후 다운로드
        const blob = new Blob(chunks, { type: 'application/json' });
        const objectUrl = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = objectUrl;
        a.download = `blog-backup-${new Date(createdAt).toISOString().slice(0, 10)}.json`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(objectUrl);

        // 5. 완료 상태 표시 (3초 후 제거)
        setDownloadProgress(prev => ({
          ...prev,
          [itemId]: { percent: 100, speedKBs: 0, remainingSec: null, done: true },
        }));
        setTimeout(() => setDownloadProgress(prev => { const n = { ...prev }; delete n[itemId]; return n; }), 3000);
      } finally {
        clearTimeout(timer);
      }
    } catch (e: any) {
      if (e?.name === 'AbortError' && cancelledDownloadsRef.current.has(itemId)) {
        // 사용자가 직접 취소한 경우 - 에러 배너 없이 조용히 종료
        setDownloadProgress(prev => { const n = { ...prev }; delete n[itemId]; return n; });
        cancelledDownloadsRef.current.delete(itemId);
      } else {
        const msg = e?.name === 'AbortError'
          ? '다운로드 시간이 초과되었습니다 (120초). 네트워크 상태를 확인 후 다시 시도하세요.'
          : e?.message ?? '알 수 없는 오류가 발생했습니다.';
        setDownloadErrors(prev => ({ ...prev, [itemId]: msg }));
        setDownloadProgress(prev => { const n = { ...prev }; delete n[itemId]; return n; });
      }
    } finally {
      setDownloadingIds(prev => prev.filter(id => id !== itemId));
      delete downloadControllersRef.current[itemId];
    }
  };

  // 다운로드 취소
  const handleCancelDownload = (itemId: number) => {
    const controller = downloadControllersRef.current[itemId];
    if (controller) {
      // cancelled 플래그를 세울 수 없으므로 별도 cancelled Set으로 관리
      cancelledDownloadsRef.current.add(itemId);
      controller.abort();
    }
  };

  // 선택된 백업 삭제
  const handleDeleteSelected = async () => {
    if (selectedBackupIds.length === 0) return;
    if (!window.confirm(`선택한 ${selectedBackupIds.length}개의 백업을 삭제하시겠습니까?\n삭제 후 복구할 수 없습니다.`)) return;
    setIsDeletingBackups(true);
    try {
      await deleteManyMutation.mutateAsync({ ids: selectedBackupIds });
      toast.success(`${selectedBackupIds.length}개 백업이 삭제되었습니다.`);
      setSelectedBackupIds([]);
      historyQuery.refetch();
    } catch {
      toast.error('백업 삭제에 실패했습니다.');
    } finally {
      setIsDeletingBackups(false);
    }
  };

  const toggleBackupSelect = (id: number) => {
    setSelectedBackupIds(prev =>
      prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]
    );
  };

  const toggleSelectAllBackups = () => {
    const allIds = (historyQuery.data ?? []).map((item: any) => item.id);
    if (selectedBackupIds.length === allIds.length) {
      setSelectedBackupIds([]);
    } else {
      setSelectedBackupIds(allIds);
    }
  };

  // 파일 선택 시 메타 미리보기
  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (!file.name.endsWith(".json")) {
      toast.error("JSON 파일만 업로드할 수 있습니다.");
      return;
    }
    const reader = new FileReader();
    reader.onload = (ev) => {
      try {
        const parsed = JSON.parse(ev.target?.result as string);
        if (!parsed?.version || !parsed?.tables) {
          toast.error("유효하지 않은 백업 파일입니다.");
          setPendingFile(null);
          setPendingData(null);
          return;
        }
        const counts: Record<string, number> = {};
        for (const [k, v] of Object.entries(parsed.tables)) {
          counts[k] = Array.isArray(v) ? v.length : 0;
        }
        setBackupMeta({ exportedAt: parsed.exportedAt, counts });
        setPendingFile(file);
        setPendingData(parsed);
        setSelectedTables(Object.keys(counts));
        setShowSelectiveRestore(false);
      } catch {
        toast.error("파일을 파싱할 수 없습니다.");
        setPendingFile(null);
        setPendingData(null);
      }
    };
    reader.readAsText(file);
    e.target.value = "";
  };

  // 전체 복원 실행
  const handleImport = async () => {
    if (!pendingData) return;
    setIsImporting(true);
    setShowConfirm(false);
    try {
      if (confirmMode === "selected") {
        await importSelectedMutation.mutateAsync({ data: pendingData, tables: selectedTables });
        toast.success(`${selectedTables.length}개 테이블 복원이 완료되었습니다. 페이지를 새로고침합니다.`);
      } else {
        await importMutation.mutateAsync({ data: pendingData });
        toast.success("전체 복원이 완료되었습니다. 페이지를 새로고침합니다.");
      }
      setTimeout(() => window.location.reload(), 1500);
    } catch {
      toast.error("복원에 실패했습니다. 파일을 확인해 주세요.");
    } finally {
      setIsImporting(false);
      setPendingFile(null);
      setPendingData(null);
      setBackupMeta(null);
    }
  };

  const toggleTable = (key: string) => {
    setSelectedTables(prev =>
      prev.includes(key) ? prev.filter(k => k !== key) : [...prev, key]
    );
  };

  return (
    <div style={{ maxWidth: 760, margin: "0 auto" }}>

      {/* ── 백업 섹션 ── */}
      <div style={{ background: "#fff", borderRadius: 12, border: "1px solid #e5e7eb", padding: 28, marginBottom: 20 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 6 }}>
          <Download size={18} style={{ color: "#6366f1" }} />
          <span style={{ fontSize: 16, fontWeight: 700, color: "#111827" }}>데이터 백업</span>
        </div>
        <p style={{ fontSize: 13, color: "#6b7280", marginBottom: 20, lineHeight: 1.6 }}>
          블로그의 모든 데이터(게시물, 카테고리, 설정, 댓글, 앱 등)를 백업합니다.
          로컬 다운로드 또는 S3에 저장할 수 있습니다.
        </p>
        <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
          <Button
            onClick={handleExport}
            disabled={isExporting}
            style={{ background: "linear-gradient(135deg, #6366f1, #8b5cf6)", color: "#fff", border: "none", padding: "10px 20px", borderRadius: 8, fontSize: 13, fontWeight: 600, cursor: isExporting ? "not-allowed" : "pointer", display: "flex", alignItems: "center", gap: 7 }}
          >
            {isExporting ? <Loader2 size={14} className="animate-spin" /> : <Download size={14} />}
            {isExporting ? "생성 중…" : "로컬 다운로드"}
          </Button>
          <Button
            onClick={handleSaveToS3}
            disabled={isSavingToS3}
            style={{ background: "#10b981", color: "#fff", border: "none", padding: "10px 20px", borderRadius: 8, fontSize: 13, fontWeight: 600, cursor: isSavingToS3 ? "not-allowed" : "pointer", display: "flex", alignItems: "center", gap: 7 }}
          >
            {isSavingToS3 ? <Loader2 size={14} className="animate-spin" /> : <Database size={14} />}
            {isSavingToS3 ? "저장 중…" : "S3에 저장"}
          </Button>
        </div>
        {/* 진행률 표시 */}
        {backupProgress && (
          <div style={{ marginTop: 16, padding: "14px 16px", background: backupProgress.error ? "#fef2f2" : backupProgress.done ? "#f0fdf4" : "#eff6ff", borderRadius: 10, border: `1px solid ${backupProgress.error ? "#fecaca" : backupProgress.done ? "#bbf7d0" : "#bfdbfe"}` }}>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 8 }}>
              <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                {backupProgress.done && !backupProgress.error
                  ? <span style={{ fontSize: 16 }}>✅</span>
                  : backupProgress.error
                  ? <span style={{ fontSize: 16 }}>❌</span>
                  : <Loader2 size={14} className="animate-spin" color="#3b82f6" />}
                <span style={{ fontSize: 13, fontWeight: 600, color: backupProgress.error ? "#dc2626" : backupProgress.done ? "#16a34a" : "#1d4ed8" }}>
                  {backupProgress.error ? `실패: ${backupProgress.error}` : backupProgress.step}
                </span>
              </div>
              <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                {/* 예상 남은 시간 계산 */}
                {!backupProgress.done && !backupProgress.error && backupProgress.progress > 5 && backupStartTimeRef.current && (() => {
                  const elapsed = (Date.now() - backupStartTimeRef.current) / 1000;
                  const rate = backupProgress.progress / elapsed; // %/초
                  const remaining = rate > 0 ? Math.ceil((100 - backupProgress.progress) / rate) : null;
                  if (!remaining) return null;
                  const mins = Math.floor(remaining / 60);
                  const secs = remaining % 60;
                  const label = mins > 0 ? `약 ${mins}분 ${secs}초 남음` : `약 ${secs}초 남음`;
                  return <span style={{ fontSize: 11, color: "#6b7280" }}>{label}</span>;
                })()}
                <span style={{ fontSize: 13, fontWeight: 700, color: backupProgress.error ? "#dc2626" : backupProgress.done ? "#16a34a" : "#1d4ed8" }}>
                  {backupProgress.progress}%
                </span>
              </div>
            </div>
            <div style={{ height: 8, background: backupProgress.error ? "#fee2e2" : "#dbeafe", borderRadius: 4, overflow: "hidden" }}>
              <div style={{
                height: "100%",
                width: `${backupProgress.progress}%`,
                background: backupProgress.error ? "#ef4444" : backupProgress.done ? "#22c55e" : "linear-gradient(90deg, #3b82f6, #6366f1)",
                borderRadius: 4,
                transition: "width 0.4s ease",
              }} />
            </div>
          </div>
        )}
        {/* 네트워크 오류 배너 + 재시도 버튼 */}
        {backupNetworkError && (
          <div style={{ marginTop: 12, padding: "14px 16px", background: "#fef2f2", borderRadius: 10, border: "1px solid #fecaca" }}>
            <div style={{ display: "flex", alignItems: "flex-start", gap: 10 }}>
              <AlertTriangle size={16} color="#dc2626" style={{ flexShrink: 0, marginTop: 1 }} />
              <div style={{ flex: 1 }}>
                <p style={{ fontSize: 13, fontWeight: 700, color: "#dc2626", margin: "0 0 4px" }}>백업 중 네트워크 오류가 발생했습니다</p>
                <p style={{ fontSize: 12, color: "#b91c1c", margin: "0 0 12px", lineHeight: 1.5 }}>{backupNetworkError}</p>
                <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                  <button
                    onClick={() => {
                      setBackupNetworkError(null);
                      setBackupProgress(null);
                      handleSaveToS3();
                    }}
                    style={{ display: "flex", alignItems: "center", gap: 6, padding: "8px 16px", background: "#dc2626", color: "#fff", border: "none", borderRadius: 7, fontSize: 13, fontWeight: 600, cursor: "pointer" }}
                  >
                    <RotateCcw size={13} />
                    즉시 재시도
                  </button>
                  <button
                    onClick={() => {
                      setBackupNetworkError(null);
                      setBackupProgress(null);
                      setBackupJobId(null);
                    }}
                    style={{ display: "flex", alignItems: "center", gap: 6, padding: "8px 16px", background: "#f3f4f6", color: "#374151", border: "1px solid #d1d5db", borderRadius: 7, fontSize: 13, fontWeight: 600, cursor: "pointer" }}
                  >
                    <X size={13} />
                    닫기
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* ── 자동 백업 스케줄 설정 ── */}
      <div style={{ background: "#f0fdf4", borderRadius: 12, border: "1px solid #bbf7d0", padding: 20, marginBottom: 20 }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 12 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <span style={{ fontSize: 14, fontWeight: 700, color: "#166534" }}>⏰ 자동 정기 백업</span>
            {autoBackupQuery.data?.enabled
              ? <span style={{ fontSize: 11, background: "#dcfce7", color: "#15803d", padding: "2px 8px", borderRadius: 20, fontWeight: 600 }}>활성화</span>
              : <span style={{ fontSize: 11, background: "#f3f4f6", color: "#6b7280", padding: "2px 8px", borderRadius: 20, fontWeight: 600 }}>비활성화</span>
            }
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <label style={{ fontSize: 12, color: "#374151", fontWeight: 600 }}>백업 시각 (KST)</label>
            <select
              value={autoBackupHour}
              onChange={e => setAutoBackupHour(Number(e.target.value))}
              style={{ fontSize: 12, border: "1px solid #d1fae5", borderRadius: 6, padding: "4px 8px", background: "#fff", color: "#166534" }}
            >
              {Array.from({ length: 24 }, (_, i) => (
                <option key={i} value={i}>{String(i).padStart(2, '0')}:00</option>
              ))}
            </select>
            <button
              onClick={() => setAutoBackupMutation.mutate({ enabled: true, cronHourKST: autoBackupHour })}
              disabled={setAutoBackupMutation.isPending}
              style={{ fontSize: 12, background: "#16a34a", color: "#fff", border: "none", borderRadius: 6, padding: "5px 14px", cursor: setAutoBackupMutation.isPending ? "not-allowed" : "pointer", fontWeight: 600 }}
            >
              {setAutoBackupMutation.isPending ? '저장 중...' : '스케줄 저장'}
            </button>
            {autoBackupQuery.data?.enabled && (
              <button
                onClick={() => setAutoBackupMutation.mutate({ enabled: false })}
                disabled={setAutoBackupMutation.isPending}
                style={{ fontSize: 12, background: "#ef4444", color: "#fff", border: "none", borderRadius: 6, padding: "5px 14px", cursor: setAutoBackupMutation.isPending ? "not-allowed" : "pointer", fontWeight: 600 }}
              >
                비활성화
              </button>
            )}
          </div>
        </div>
        <p style={{ fontSize: 12, color: "#166534", lineHeight: 1.7, margin: 0 }}>
          지정한 시각에 매일 자동으로 S3에 백업이 저장됩니다.
          최근 <strong>5개</strong>의 백업만 유지되며, 오래된 백업은 자동 삭제됩니다.
          {autoBackupQuery.data?.nextExecutionAt && (
            <> &nbsp;•&nbsp; 다음 실행: <strong>{new Date(autoBackupQuery.data.nextExecutionAt).toLocaleString('ko-KR', { timeZone: 'Asia/Seoul' })}</strong></>
          )}
          {!autoBackupQuery.data?.enabled && <> &nbsp;•&nbsp; 배포 후 스케줄을 저장하면 활성화됩니다.</>}
        </p>
        {setAutoBackupMutation.isError && (
          <p style={{ fontSize: 12, color: "#dc2626", marginTop: 8, marginBottom: 0 }}>
            오류: {setAutoBackupMutation.error?.message}
          </p>
        )}
        {setAutoBackupMutation.isSuccess && (
          <p style={{ fontSize: 12, color: "#16a34a", marginTop: 8, marginBottom: 0 }}>
            ✓ 스케줄이 저장되었습니다.
          </p>
        )}
      </div>

      {/* ── 백업 이력 ── */}
      <div style={{ background: "#fff", borderRadius: 12, border: "1px solid #e5e7eb", padding: 28, marginBottom: 20 }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 16 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <Database size={16} style={{ color: "#6366f1" }} />
            <span style={{ fontSize: 15, fontWeight: 700, color: "#111827" }}>백업 이력</span>
            {historyQuery.data && historyQuery.data.length > 0 && (
              <button
                onClick={toggleSelectAllBackups}
                style={{ fontSize: 11, color: "#6366f1", background: "#eef2ff", border: "none", borderRadius: 5, padding: "2px 8px", cursor: "pointer", fontWeight: 600 }}
              >
                {selectedBackupIds.length === historyQuery.data.length ? '선택 해제' : '전체 선택'}
              </button>
            )}
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            {selectedBackupIds.length > 0 && (
              <button
                onClick={handleDeleteSelected}
                disabled={isDeletingBackups}
                style={{ fontSize: 11, color: "#fff", background: "#ef4444", border: "none", borderRadius: 6, padding: "4px 12px", cursor: isDeletingBackups ? "not-allowed" : "pointer", display: "flex", alignItems: "center", gap: 4, fontWeight: 600 }}
              >
                {isDeletingBackups ? <Loader2 size={11} className="animate-spin" /> : <Trash2 size={11} />}
                {selectedBackupIds.length}개 삭제
              </button>
            )}
            <button onClick={() => historyQuery.refetch()} style={{ fontSize: 11, color: "#6b7280", background: "none", border: "none", cursor: "pointer", padding: "4px 8px", borderRadius: 6, display: "flex", alignItems: "center", gap: 4 }}>
              <Loader2 size={11} className={historyQuery.isFetching ? "animate-spin" : ""} />
              새로고침
            </button>
          </div>
        </div>
        {historyQuery.isLoading ? (
          <div style={{ textAlign: "center", padding: 20, color: "#9ca3af", fontSize: 13 }}>
            <Loader2 size={16} className="animate-spin" style={{ display: "inline-block", marginBottom: 6 }} />
            <div>불러오는 중…</div>
          </div>
        ) : !historyQuery.data?.length ? (
          <div style={{ textAlign: "center", padding: 24, color: "#9ca3af", fontSize: 13 }}>
            <Database size={28} style={{ margin: "0 auto 8px", opacity: 0.4 }} />
            <div>저장된 백업 이력이 없습니다.</div>
            <div style={{ fontSize: 11, marginTop: 4 }}>"S3에 저장" 버튼을 눌러 첫 백업을 만들어 보세요.</div>
          </div>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            {historyQuery.data.map((item: any) => (
              <div
                key={item.id}
                style={{
                  display: "flex", flexDirection: "column",
                  padding: "10px 14px", background: selectedBackupIds.includes(item.id) ? "#fef2f2" : "#f9fafb",
                  borderRadius: 8, border: `1px solid ${downloadErrors[item.id] ? "#fca5a5" : selectedBackupIds.includes(item.id) ? "#fecaca" : "#e5e7eb"}`,
                  transition: "background 0.15s",
                }}
              >
                {/* 아이템 주요 행 */}
                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                    <input
                      type="checkbox"
                      checked={selectedBackupIds.includes(item.id)}
                      onChange={() => toggleBackupSelect(item.id)}
                      style={{ width: 15, height: 15, cursor: "pointer", accentColor: "#ef4444" }}
                    />
                    <div>
                      <div style={{ fontSize: 13, fontWeight: 600, color: "#111827" }}>
                        {new Date(item.createdAt).toLocaleString("ko-KR")}
                      </div>
                      <div style={{ fontSize: 11, color: "#9ca3af", marginTop: 2 }}>
                        {item.trigger === "auto" ? "⏰ 자동 백업" : "👤 수동 백업"} &nbsp;·&nbsp;
                        {item.fileSize ? `${(item.fileSize / 1024).toFixed(1)} KB` : ""}
                      </div>
                    </div>
                  </div>
                  <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                    <button
                      onClick={() => handleDownloadFromHistory(item.id, item.fileKey, item.createdAt, item.fileSize)}
                      disabled={downloadingIds.includes(item.id)}
                      style={{ fontSize: 12, color: downloadingIds.includes(item.id) ? "#a5b4fc" : "#6366f1", background: "#eef2ff", border: "none", borderRadius: 6, padding: "5px 12px", cursor: downloadingIds.includes(item.id) ? "not-allowed" : "pointer", display: "flex", alignItems: "center", gap: 5, fontWeight: 600, opacity: downloadingIds.includes(item.id) ? 0.7 : 1 }}
                    >
                      {downloadingIds.includes(item.id)
                        ? <><span style={{ display: "inline-block", width: 10, height: 10, border: "2px solid #a5b4fc", borderTopColor: "transparent", borderRadius: "50%", animation: "spin 0.8s linear infinite" }} /> 다운로드 중...</>
                        : <><Download size={12} /> 다운로드</>}
                    </button>
                    <button
                      onClick={async () => {
                        if (!window.confirm('이 백업을 삭제하시겠습니까?')) return;
                        try {
                          await deleteManyMutation.mutateAsync({ ids: [item.id] });
                          toast.success('백업이 삭제되었습니다.');
                          historyQuery.refetch();
                        } catch {
                          toast.error('삭제에 실패했습니다.');
                        }
                      }}
                      style={{ fontSize: 12, color: "#ef4444", background: "#fef2f2", border: "none", borderRadius: 6, padding: "5px 10px", cursor: "pointer", display: "flex", alignItems: "center", gap: 4, fontWeight: 600 }}
                    >
                      <Trash2 size={12} />
                    </button>
                  </div>
                </div>
                {/* 다운로드 진행률 / 완료 표시 */}
                {downloadProgress[item.id] && (
                  downloadProgress[item.id].done ? (
                    /* 완료 상태 */
                    <div style={{ marginTop: 8, padding: "8px 12px", background: "#f0fdf4", border: "1px solid #bbf7d0", borderRadius: 6, display: "flex", alignItems: "center", gap: 8 }}>
                      <span style={{ fontSize: 14 }}>✅</span>
                      <span style={{ fontSize: 12, color: "#15803d", fontWeight: 600 }}>다운로드 완료! 파일이 저장되었습니다.</span>
                    </div>
                  ) : (
                    /* 진행 중 상태 */
                    <div style={{ marginTop: 8, padding: "8px 12px", background: "#eff6ff", border: "1px solid #bfdbfe", borderRadius: 6 }}>
                      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 5 }}>
                        <span style={{ fontSize: 11, color: "#3b82f6", fontWeight: 600 }}>
                          {downloadProgress[item.id].percent >= 0
                            ? `다운로드 중... ${downloadProgress[item.id].percent}%`
                            : '다운로드 중...'}
                        </span>
                        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                          <span style={{ fontSize: 11, color: "#6b7280" }}>
                            {downloadProgress[item.id].speedKBs > 0 && `${downloadProgress[item.id].speedKBs.toFixed(1)} KB/s`}
                            {downloadProgress[item.id].remainingSec !== null && ` · 약 ${downloadProgress[item.id].remainingSec}초 남음`}
                          </span>
                          <button
                            onClick={() => handleCancelDownload(item.id)}
                            style={{ fontSize: 10, color: "#6b7280", background: "transparent", border: "1px solid #d1d5db", borderRadius: 4, padding: "2px 7px", cursor: "pointer", fontWeight: 600, whiteSpace: "nowrap" }}
                          >
                            취소
                          </button>
                        </div>
                      </div>
                      {downloadProgress[item.id].percent >= 0 && (
                        <div style={{ height: 4, background: "#dbeafe", borderRadius: 2, overflow: "hidden" }}>
                          <div style={{ height: "100%", width: `${downloadProgress[item.id].percent}%`, background: "#3b82f6", borderRadius: 2, transition: "width 0.3s ease" }} />
                        </div>
                      )}
                    </div>
                  )
                )}
                {/* 다운로드 실패 시 에러 배너 */}
                {downloadErrors[item.id] && (
                  <div style={{ marginTop: 8, padding: "8px 12px", background: "#fef2f2", border: "1px solid #fca5a5", borderRadius: 6, display: "flex", alignItems: "flex-start", gap: 8 }}>
                    <span style={{ fontSize: 14, flexShrink: 0 }}>⚠️</span>
                    <div style={{ flex: 1 }}>
                      <div style={{ fontSize: 12, color: "#b91c1c", fontWeight: 600, marginBottom: 4 }}>다운로드 실패</div>
                      <div style={{ fontSize: 11, color: "#dc2626", lineHeight: 1.5 }}>{downloadErrors[item.id]}</div>
                    </div>
                    <div style={{ display: "flex", flexDirection: "column", gap: 4, flexShrink: 0 }}>
                      <button
                        onClick={() => handleDownloadFromHistory(item.id, item.fileKey, item.createdAt, item.fileSize)}
                        style={{ fontSize: 11, color: "#fff", background: "#ef4444", border: "none", borderRadius: 5, padding: "4px 10px", cursor: "pointer", fontWeight: 600, whiteSpace: "nowrap" }}
                      >
                        다시 시도
                      </button>
                      <button
                        onClick={() => setDownloadErrors(prev => { const n = { ...prev }; delete n[item.id]; return n; })}
                        style={{ fontSize: 11, color: "#6b7280", background: "transparent", border: "1px solid #d1d5db", borderRadius: 5, padding: "3px 8px", cursor: "pointer", whiteSpace: "nowrap" }}
                      >
                        닫기
                      </button>
                    </div>
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </div>

      {/* ── 복원 섹션 ── */}
      <div style={{ background: "#fff", borderRadius: 12, border: "1px solid #e5e7eb", padding: 28 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 6 }}>
          <Upload size={18} style={{ color: "#f59e0b" }} />
          <span style={{ fontSize: 16, fontWeight: 700, color: "#111827" }}>데이터 복원</span>
        </div>
        <div style={{ background: "#fffbeb", border: "1px solid #fde68a", borderRadius: 8, padding: "10px 14px", marginBottom: 20, display: "flex", gap: 8 }}>
          <AlertTriangle size={15} style={{ color: "#d97706", flexShrink: 0, marginTop: 2 }} />
          <p style={{ fontSize: 12, color: "#92400e", lineHeight: 1.6, margin: 0 }}>
            <strong>주의:</strong> 복원 시 선택한 테이블의 데이터가 백업 파일로 덮어씌워집니다.
            복원 전에 반드시 현재 데이터를 백업해 두세요.
          </p>
        </div>

        {/* 파일 선택 */}
        <label style={{ display: "inline-flex", alignItems: "center", gap: 8, padding: "10px 20px", background: "#f3f4f6", border: "1px dashed #d1d5db", borderRadius: 8, cursor: "pointer", fontSize: 13, color: "#374151", fontWeight: 500 }}>
          <Database size={15} style={{ color: "#6b7280" }} />
          {pendingFile ? pendingFile.name : "백업 파일 선택 (.json)"}
          <input type="file" accept=".json" onChange={handleFileChange} style={{ display: "none" }} />
        </label>

        {/* 선택된 파일 미리보기 + 선택적 복원 */}
        {backupMeta && pendingFile && (
          <div style={{ marginTop: 16, background: "#f9fafb", border: "1px solid #e5e7eb", borderRadius: 8, padding: 16 }}>
            <div style={{ fontSize: 12, color: "#6b7280", marginBottom: 12 }}>
              백업 일시: <strong style={{ color: "#111827" }}>{new Date(backupMeta.exportedAt).toLocaleString()}</strong>
            </div>

            {/* 선택적 복원 토글 */}
            <div style={{ marginBottom: 12 }}>
              <button
                onClick={() => setShowSelectiveRestore(v => !v)}
                style={{ fontSize: 12, color: "#6366f1", background: "#eef2ff", border: "none", borderRadius: 6, padding: "5px 12px", cursor: "pointer", fontWeight: 600, display: "flex", alignItems: "center", gap: 5 }}
              >
                {showSelectiveRestore ? "▲ 전체 복원" : "▼ 선택적 복원 (테이블 선택)"}
              </button>
            </div>

            {showSelectiveRestore ? (
              /* 선택적 복원 체크박스 */
              <div>
                <div style={{ display: "flex", gap: 8, marginBottom: 8 }}>
                  <button onClick={() => setSelectedTables(Object.keys(backupMeta.counts))} style={{ fontSize: 11, color: "#6366f1", background: "none", border: "1px solid #c7d2fe", borderRadius: 5, padding: "3px 8px", cursor: "pointer" }}>전체 선택</button>
                  <button onClick={() => setSelectedTables([])} style={{ fontSize: 11, color: "#6b7280", background: "none", border: "1px solid #e5e7eb", borderRadius: 5, padding: "3px 8px", cursor: "pointer" }}>전체 해제</button>
                </div>
                <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(180px, 1fr))", gap: 6 }}>
                  {Object.entries(backupMeta.counts).map(([key, cnt]) => (
                    <label key={key} style={{ display: "flex", alignItems: "center", gap: 7, padding: "6px 10px", background: selectedTables.includes(key) ? "#eef2ff" : "#fff", border: `1px solid ${selectedTables.includes(key) ? "#c7d2fe" : "#e5e7eb"}`, borderRadius: 6, cursor: "pointer", transition: "all 0.15s" }}>
                      <input
                        type="checkbox"
                        checked={selectedTables.includes(key)}
                        onChange={() => toggleTable(key)}
                        style={{ accentColor: "#6366f1" }}
                      />
                      <span style={{ fontSize: 11, color: "#374151", flex: 1 }}>{tableLabels[key] ?? key}</span>
                      <span style={{ fontSize: 11, fontWeight: 700, color: "#6366f1" }}>{cnt}</span>
                    </label>
                  ))}
                </div>
                <div style={{ marginTop: 8, fontSize: 11, color: "#9ca3af" }}>
                  {selectedTables.length}개 테이블 선택됨
                </div>
              </div>
            ) : (
              /* 전체 복원 미리보기 */
              <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(160px, 1fr))", gap: 6 }}>
                {Object.entries(backupMeta.counts).map(([key, cnt]) => (
                  <div key={key} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", background: "#fff", border: "1px solid #e5e7eb", borderRadius: 6, padding: "5px 10px" }}>
                    <span style={{ fontSize: 11, color: "#6b7280" }}>{tableLabels[key] ?? key}</span>
                    <span style={{ fontSize: 12, fontWeight: 700, color: "#6366f1" }}>{cnt.toLocaleString()}</span>
                  </div>
                ))}
              </div>
            )}

            <div style={{ marginTop: 14, display: "flex", gap: 8 }}>
              {showSelectiveRestore ? (
                <Button
                  onClick={() => { setConfirmMode("selected"); setShowConfirm(true); }}
                  disabled={isImporting || selectedTables.length === 0}
                  style={{ background: "#6366f1", color: "#fff", border: "none", padding: "9px 20px", borderRadius: 8, fontSize: 13, fontWeight: 600, cursor: (isImporting || selectedTables.length === 0) ? "not-allowed" : "pointer", display: "flex", alignItems: "center", gap: 6 }}
                >
                  {isImporting ? <Loader2 size={14} className="animate-spin" /> : <Upload size={14} />}
                  {isImporting ? "복원 중…" : `선택 항목 복원 (${selectedTables.length}개)`}
                </Button>
              ) : (
                <Button
                  onClick={() => { setConfirmMode("full"); setShowConfirm(true); }}
                  disabled={isImporting}
                  style={{ background: "#f59e0b", color: "#fff", border: "none", padding: "9px 20px", borderRadius: 8, fontSize: 13, fontWeight: 600, cursor: isImporting ? "not-allowed" : "pointer", display: "flex", alignItems: "center", gap: 6 }}
                >
                  {isImporting ? <Loader2 size={14} className="animate-spin" /> : <Upload size={14} />}
                  {isImporting ? "복원 중…" : "전체 복원"}
                </Button>
              )}
              <Button
                variant="ghost"
                onClick={() => { setPendingFile(null); setPendingData(null); setBackupMeta(null); }}
                style={{ fontSize: 13, color: "#6b7280" }}
              >
                취소
              </Button>
            </div>
          </div>
        )}
      </div>

      {/* 복원 확인 다이얼로그 */}
      {showConfirm && backupMeta && (
        <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.5)", zIndex: 9999, display: "flex", alignItems: "center", justifyContent: "center" }} onClick={() => setShowConfirm(false)}>
          <div style={{ background: "#fff", borderRadius: 14, padding: 32, maxWidth: 440, width: "90%", boxShadow: "0 20px 60px rgba(0,0,0,0.2)" }} onClick={e => e.stopPropagation()}>
            <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 12 }}>
              <AlertTriangle size={22} style={{ color: "#ef4444" }} />
              <span style={{ fontSize: 17, fontWeight: 700, color: "#111827" }}>정말 복원하시겠습니까?</span>
            </div>
            <p style={{ fontSize: 13, color: "#6b7280", lineHeight: 1.7, marginBottom: 24 }}>
              {confirmMode === "selected" ? (
                <><strong>{selectedTables.map(k => tableLabels[k] ?? k).join(", ")}</strong> 테이블이 백업 파일로 덮어씌워집니다.</>
              ) : (
                <>현재 DB의 <strong>모든 데이터</strong>가 선택한 백업 파일로 덮어씌워집니다.</>
              )}
              <br />이 작업은 <strong style={{ color: "#ef4444" }}>되돌릴 수 없습니다.</strong>
              <br /><br />
              백업 일시: <strong>{new Date(backupMeta.exportedAt).toLocaleString()}</strong>
            </p>
            <div style={{ display: "flex", gap: 10, justifyContent: "flex-end" }}>
              <Button variant="ghost" onClick={() => setShowConfirm(false)} style={{ fontSize: 13 }}>취소</Button>
              <Button
                onClick={handleImport}
                style={{ background: "#ef4444", color: "#fff", border: "none", padding: "9px 20px", borderRadius: 8, fontSize: 13, fontWeight: 600, cursor: "pointer" }}
              >
                복원 실행
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ─── 방문자 분석 임베드 컴포넌트 ─────────────────────────────────────────────
import { lazy, Suspense } from "react";
const AnalyticsPage = lazy(() => import("./AnalyticsPage"));
