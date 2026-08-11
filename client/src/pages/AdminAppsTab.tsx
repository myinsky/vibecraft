import { useState, useRef } from "react";
import { trpc } from "@/lib/trpc";
import { toast } from "sonner";
import {
  Plus, Edit2, Trash2, Eye, EyeOff, Upload, X, Link2, Download,
  Loader2, ExternalLink, Package, CheckCircle, XCircle, Clock,
  Monitor, Smartphone, ChevronDown, ChevronUp
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";

type AppRow = {
  id: number;
  name: string;
  description: string;
  longDescription?: string | null;
  category?: string | null;
  techStack?: string | null;
  features?: string | null;
  howToUse?: string | null;
  appUrl?: string | null;
  downloadUrl?: string | null;
  originalFilename?: string | null;
  thumbnail?: string | null;
  gradient?: string | null;
  downloads: number;
  published: boolean;
  createdAt: Date;
};

type FormData = {
  name: string;
  description: string;
  longDescription: string;
  category: string;
  techStack: string;
  features: string;
  howToUse: string;
  appUrl: string;
  downloadUrl: string;
  originalFilename: string;
  thumbnail: string;
  gradient: string;
  published: boolean;
};

const EMPTY_FORM: FormData = {
  name: "",
  description: "",
  longDescription: "",
  category: "",
  techStack: "",
  features: "",
  howToUse: "",
  appUrl: "",
  downloadUrl: "",
  originalFilename: "",
  thumbnail: "",
  gradient: "",
  published: true,
};

export function AdminAppsTab() {
  const [activeSection, setActiveSection] = useState<"manage" | "submissions">("manage");
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [form, setForm] = useState<FormData>(EMPTY_FORM);
  const [uploading, setUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [rejectDialogId, setRejectDialogId] = useState<number | null>(null);
  const [rejectReason, setRejectReason] = useState("");
  const [expandedId, setExpandedId] = useState<number | null>(null);

  const utils = trpc.useUtils();

  const { data: apps, isLoading } = trpc.apps.adminList.useQuery();
  const { data: submissions, isLoading: submissionsLoading } = trpc.apps.listSubmissions.useQuery();

  const approveMutation = trpc.apps.approveSubmission.useMutation({
    onSuccess: () => {
      toast.success("앱 신청이 승인되었습니다.");
      utils.apps.listSubmissions.invalidate();
      utils.apps.adminList.invalidate();
      utils.apps.list.invalidate();
    },
    onError: (err) => toast.error(err.message),
  });

  const rejectMutation = trpc.apps.rejectSubmission.useMutation({
    onSuccess: () => {
      toast.success("앱 신청이 거절되었습니다.");
      setRejectDialogId(null);
      setRejectReason("");
      utils.apps.listSubmissions.invalidate();
    },
    onError: (err) => toast.error(err.message),
  });

  const createMutation = trpc.apps.create.useMutation({
    onSuccess: () => {
      toast.success("앱이 등록되었습니다.");
      utils.apps.adminList.invalidate();
      utils.apps.list.invalidate();
      setShowForm(false);
      setForm(EMPTY_FORM);
      setEditingId(null);
    },
    onError: (err) => toast.error(err.message),
  });

  const updateMutation = trpc.apps.update.useMutation({
    onSuccess: () => {
      toast.success("앱이 수정되었습니다.");
      utils.apps.adminList.invalidate();
      utils.apps.list.invalidate();
      setShowForm(false);
      setForm(EMPTY_FORM);
      setEditingId(null);
    },
    onError: (err) => toast.error(err.message),
  });

  const deleteMutation = trpc.apps.delete.useMutation({
    onSuccess: () => {
      toast.success("앱이 삭제되었습니다.");
      utils.apps.adminList.invalidate();
      utils.apps.list.invalidate();
    },
    onError: (err) => toast.error(err.message),
  });

  const togglePublishMutation = trpc.apps.update.useMutation({
    onSuccess: () => {
      utils.apps.adminList.invalidate();
      utils.apps.list.invalidate();
    },
    onError: (err) => toast.error(err.message),
  });

  const handleEdit = (app: AppRow) => {
    setEditingId(app.id);
    setForm({
      name: app.name,
      description: app.description,
      longDescription: app.longDescription ?? "",
      category: app.category ?? "",
      techStack: app.techStack ?? "",
      features: app.features ?? "",
      howToUse: app.howToUse ?? "",
      appUrl: app.appUrl ?? "",
      downloadUrl: app.downloadUrl ?? "",
      originalFilename: app.originalFilename ?? "",
      thumbnail: app.thumbnail ?? "",
      gradient: app.gradient ?? "",
      published: app.published,
    });
    setShowForm(true);
  };

  const handleSubmit = () => {
    if (!form.name.trim()) { toast.error("앱 이름을 입력해주세요."); return; }
    if (!form.description.trim()) { toast.error("앱 설명을 입력해주세요."); return; }

    const payload = {
      ...form,
      appUrl: form.appUrl.trim() || undefined,
      downloadUrl: form.downloadUrl.trim() || undefined,
      originalFilename: form.originalFilename.trim() || undefined,
      thumbnail: form.thumbnail.trim() || undefined,
      gradient: form.gradient.trim() || undefined,
      longDescription: form.longDescription.trim() || undefined,
      category: form.category.trim() || undefined,
      techStack: form.techStack.trim() || undefined,
      features: form.features.trim() || undefined,
      howToUse: form.howToUse.trim() || undefined,
    };

    if (editingId !== null) {
      updateMutation.mutate({ id: editingId, ...payload });
    } else {
      createMutation.mutate(payload);
    }
  };

  const handleFileUpload = async (file: File) => {
    setUploading(true);
    setUploadProgress(0);
    try {
      const formData = new FormData();
      formData.append("file", file);

      const xhr = new XMLHttpRequest();
      xhr.upload.onprogress = (e) => {
        if (e.lengthComputable) {
          setUploadProgress(Math.round((e.loaded / e.total) * 100));
        }
      };

      const result = await new Promise<{ url: string; filename: string }>((resolve, reject) => {
        xhr.onload = () => {
          if (xhr.status === 200) {
            resolve(JSON.parse(xhr.responseText));
          } else {
            try {
              const err = JSON.parse(xhr.responseText);
              reject(new Error(err.error || "업로드 실패"));
            } catch {
              reject(new Error("업로드 실패"));
            }
          }
        };
        xhr.onerror = () => reject(new Error("네트워크 오류"));
        xhr.open("POST", "/api/upload/file");
        xhr.withCredentials = true;
        xhr.send(formData);
      });

      setForm(prev => ({
        ...prev,
        downloadUrl: result.url,
        originalFilename: result.filename,
      }));
      toast.success(`파일 업로드 완료: ${result.filename}`);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "업로드 실패");
    } finally {
      setUploading(false);
      setUploadProgress(0);
    }
  };

  const handleFileDrop = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    const file = e.dataTransfer.files[0];
    if (file) handleFileUpload(file);
  };

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) handleFileUpload(file);
    e.target.value = "";
  };

  const handleCancel = () => {
    setShowForm(false);
    setForm(EMPTY_FORM);
    setEditingId(null);
  };

  return (
    <div style={{ padding: "24px 0" }}>
      {/* 헤더 */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 20 }}>
        <div>
          <h2 style={{ fontSize: 18, fontWeight: 700, color: "#111827", margin: 0 }}>앱 관리</h2>
          <p style={{ fontSize: 13, color: "#6b7280", margin: "4px 0 0" }}>
            바이브 코딩 앱을 등록하고 관리합니다.
          </p>
        </div>
        {activeSection === "manage" && !showForm && (
          <Button
            onClick={() => { setShowForm(true); setEditingId(null); setForm(EMPTY_FORM); }}
            style={{ background: "linear-gradient(135deg, #6366f1, #8b5cf6)", color: "#fff", border: "none" }}
          >
            <Plus size={14} style={{ marginRight: 6 }} />
            앱 추가
          </Button>
        )}
      </div>

      {/* 섹션 탭 */}
      <div style={{ display: "flex", gap: 4, marginBottom: 20, borderBottom: "1px solid #e5e7eb", paddingBottom: 0 }}>
        <button
          onClick={() => setActiveSection("manage")}
          style={{
            padding: "8px 16px",
            fontSize: 13,
            fontWeight: 600,
            border: "none",
            borderBottom: activeSection === "manage" ? "2px solid #6366f1" : "2px solid transparent",
            background: "none",
            cursor: "pointer",
            color: activeSection === "manage" ? "#6366f1" : "#6b7280",
            marginBottom: -1,
          }}
        >
          <Package size={14} style={{ marginRight: 6, verticalAlign: "middle" }} />
          앱 목록
        </button>
        <button
          onClick={() => setActiveSection("submissions")}
          style={{
            padding: "8px 16px",
            fontSize: 13,
            fontWeight: 600,
            border: "none",
            borderBottom: activeSection === "submissions" ? "2px solid #6366f1" : "2px solid transparent",
            background: "none",
            cursor: "pointer",
            color: activeSection === "submissions" ? "#6366f1" : "#6b7280",
            marginBottom: -1,
            display: "flex",
            alignItems: "center",
            gap: 6,
          }}
        >
          <Clock size={14} />
          신청 검토
          {submissions && submissions.length > 0 && (
            <span style={{
              background: "#ef4444",
              color: "#fff",
              borderRadius: 999,
              fontSize: 10,
              fontWeight: 700,
              padding: "1px 6px",
              minWidth: 18,
              textAlign: "center",
            }}>{submissions.length}</span>
          )}
        </button>
      </div>

      {/* 신청 검토 섹션 */}
      {activeSection === "submissions" && (
        <div>
          {submissionsLoading ? (
            <div style={{ textAlign: "center", padding: 40, color: "#6b7280" }}>
              <Loader2 size={24} style={{ animation: "spin 1s linear infinite", margin: "0 auto 8px", display: "block" }} />
              불러오는 중...
            </div>
          ) : !submissions || submissions.length === 0 ? (
            <div style={{
              background: "#fff",
              border: "1px solid #e5e7eb",
              borderRadius: 12,
              padding: "40px 24px",
              textAlign: "center",
              color: "#9ca3af"
            }}>
              <Clock size={32} style={{ margin: "0 auto 12px", display: "block", opacity: 0.4 }} />
              <p style={{ margin: 0, fontSize: 14 }}>검토 대기 중인 신청이 없습니다.</p>
            </div>
          ) : (
            <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
              {(submissions as any[]).map((sub: any) => (
                <div
                  key={sub.id}
                  style={{
                    background: "#fff",
                    border: "1px solid #e5e7eb",
                    borderRadius: 12,
                    padding: 16,
                    boxShadow: "0 1px 3px rgba(0,0,0,0.04)"
                  }}
                >
                  <div style={{ display: "flex", alignItems: "flex-start", gap: 12 }}>
                    {/* 썸네일 */}
                    <div style={{
                      width: 56,
                      height: 56,
                      borderRadius: 10,
                      background: sub.thumbnail ? `url(${sub.thumbnail}) center/cover` : "linear-gradient(135deg, #6366f1, #8b5cf6)",
                      flexShrink: 0,
                      backgroundSize: "cover",
                      backgroundPosition: "center",
                    }} />

                    {/* 정보 */}
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 4 }}>
                        <span style={{ fontSize: 15, fontWeight: 700, color: "#111827" }}>{sub.name}</span>
                        {sub.category && (
                          <Badge variant="outline" style={{ fontSize: 10, color: "#6366f1", borderColor: "#c7d2fe" }}>{sub.category}</Badge>
                        )}
                        <Badge variant="outline" style={{ fontSize: 10, color: "#d97706", borderColor: "#fde68a", background: "#fffbeb" }}>
                          <Clock size={10} style={{ marginRight: 3 }} />검토중
                        </Badge>
                      </div>
                      <p style={{ fontSize: 12, color: "#6b7280", margin: "0 0 6px", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                        {sub.description}
                      </p>
                      <div style={{ display: "flex", gap: 12, flexWrap: "wrap" }}>
                        {sub.appUrl && (
                          <a href={sub.appUrl} target="_blank" rel="noopener noreferrer" style={{ fontSize: 11, color: "#6366f1", display: "flex", alignItems: "center", gap: 3 }}>
                            <ExternalLink size={10} />
                            앱 URL
                          </a>
                        )}
                        {sub.pcDownloadUrl && (
                          <a href={sub.pcDownloadUrl} download={sub.pcOriginalFilename || true} style={{ fontSize: 11, color: "#0369a1", display: "flex", alignItems: "center", gap: 3 }}>
                            <Monitor size={10} />
                            PC 파일
                          </a>
                        )}
                        {sub.mobileDownloadUrl && (
                          <a href={sub.mobileDownloadUrl} download={sub.mobileOriginalFilename || true} style={{ fontSize: 11, color: "#16a34a", display: "flex", alignItems: "center", gap: 3 }}>
                            <Smartphone size={10} />
                            모바일 파일
                          </a>
                        )}
                        {sub.submitterName && (
                          <span style={{ fontSize: 11, color: "#9ca3af" }}>신청자: {sub.submitterName}</span>
                        )}
                        <span style={{ fontSize: 11, color: "#9ca3af" }}>{new Date(sub.createdAt).toLocaleDateString()}</span>
                      </div>
                    </div>

                    {/* 액션 버튼 */}
                    <div style={{ display: "flex", gap: 6, flexShrink: 0 }}>
                      <button
                        onClick={() => setExpandedId(expandedId === sub.id ? null : sub.id)}
                        title="상세 보기"
                        style={{
                          background: "none", border: "1px solid #e5e7eb", borderRadius: 6,
                          padding: "5px 8px", cursor: "pointer", color: "#6b7280"
                        }}
                      >
                        {expandedId === sub.id ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
                      </button>
                      <Button
                        size="sm"
                        onClick={() => approveMutation.mutate({ id: sub.id })}
                        disabled={approveMutation.isPending}
                        style={{ background: "#16a34a", color: "#fff", border: "none", height: 32, fontSize: 12 }}
                      >
                        <CheckCircle size={13} style={{ marginRight: 4 }} />
                        승인
                      </Button>
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => { setRejectDialogId(sub.id); setRejectReason(""); }}
                        disabled={rejectMutation.isPending}
                        style={{ borderColor: "#fca5a5", color: "#dc2626", height: 32, fontSize: 12 }}
                      >
                        <XCircle size={13} style={{ marginRight: 4 }} />
                        거절
                      </Button>
                    </div>
                  </div>

                  {/* 상세 정보 펼치기 */}
                  {expandedId === sub.id && (
                    <div style={{
                      marginTop: 12,
                      padding: "12px 16px",
                      background: "#f9fafb",
                      borderRadius: 8,
                      fontSize: 12,
                      color: "#374151",
                      lineHeight: 1.6,
                    }}>
                      {sub.longDescription && (
                        <div style={{ marginBottom: 8 }}>
                          <strong>상세 설명:</strong>
                          <p style={{ margin: "4px 0 0", whiteSpace: "pre-wrap" }}>{sub.longDescription}</p>
                        </div>
                      )}
                      {sub.features && (
                        <div style={{ marginBottom: 8 }}>
                          <strong>주요 기능:</strong>
                          <p style={{ margin: "4px 0 0", whiteSpace: "pre-wrap" }}>{sub.features}</p>
                        </div>
                      )}
                      {sub.howToUse && (
                        <div style={{ marginBottom: 8 }}>
                          <strong>사용 방법:</strong>
                          <p style={{ margin: "4px 0 0", whiteSpace: "pre-wrap" }}>{sub.howToUse}</p>
                        </div>
                      )}
                      {sub.techStack && (
                        <div><strong>기술 스택:</strong> {sub.techStack}</div>
                      )}
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}

          {/* 거절 사유 입력 다이얼로그 */}
          {rejectDialogId !== null && (
            <div style={{
              position: "fixed", inset: 0, background: "rgba(0,0,0,0.5)",
              display: "flex", alignItems: "center", justifyContent: "center", zIndex: 9999
            }}>
              <div style={{
                background: "#fff", borderRadius: 12, padding: 24,
                width: "min(480px, calc(100vw - 32px))",
                boxShadow: "0 20px 60px rgba(0,0,0,0.2)"
              }}>
                <h3 style={{ fontSize: 16, fontWeight: 700, color: "#111827", margin: "0 0 8px" }}>신청 거절</h3>
                <p style={{ fontSize: 13, color: "#6b7280", margin: "0 0 16px" }}>거절 사유를 입력하면 신청자에게 표시됩니다. (선택)</p>
                <Textarea
                  value={rejectReason}
                  onChange={e => setRejectReason(e.target.value)}
                  placeholder="거절 사유를 입력하세요 (예: 악성 코드 포함, 저작권 문제 등)"
                  rows={3}
                  style={{ marginBottom: 16 }}
                />
                <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
                  <Button variant="outline" onClick={() => { setRejectDialogId(null); setRejectReason(""); }}>취소</Button>
                  <Button
                    onClick={() => rejectMutation.mutate({ id: rejectDialogId, reason: rejectReason.trim() || undefined })}
                    disabled={rejectMutation.isPending}
                    style={{ background: "#dc2626", color: "#fff", border: "none" }}
                  >
                    {rejectMutation.isPending && <Loader2 size={14} style={{ marginRight: 6, animation: "spin 1s linear infinite" }} />}
                    거절 확정
                  </Button>
                </div>
              </div>
            </div>
          )}
        </div>
      )}

      {/* 앱 관리 섹션 */}
      {activeSection === "manage" && (<>

      {/* 앱 등록/수정 폼 */}
      {showForm && (
        <div style={{
          background: "#fff",
          border: "1px solid #e5e7eb",
          borderRadius: 12,
          padding: 24,
          marginBottom: 24,
          boxShadow: "0 2px 8px rgba(0,0,0,0.06)"
        }}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 20 }}>
            <h3 style={{ fontSize: 16, fontWeight: 700, color: "#111827", margin: 0 }}>
              {editingId !== null ? "앱 수정" : "새 앱 등록"}
            </h3>
            <button onClick={handleCancel} style={{ background: "none", border: "none", cursor: "pointer", color: "#6b7280" }}>
              <X size={18} />
            </button>
          </div>

          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 }}>
            {/* 앱 이름 */}
            <div>
              <label style={{ fontSize: 13, fontWeight: 600, color: "#374151", display: "block", marginBottom: 6 }}>
                앱 이름 *
              </label>
              <Input
                value={form.name}
                onChange={e => setForm(p => ({ ...p, name: e.target.value }))}
                placeholder="예: AutoCaption AI"
              />
            </div>

            {/* 카테고리 */}
            <div>
              <label style={{ fontSize: 13, fontWeight: 600, color: "#374151", display: "block", marginBottom: 6 }}>
                카테고리
              </label>
              <Input
                value={form.category}
                onChange={e => setForm(p => ({ ...p, category: e.target.value }))}
                placeholder="예: 영상 자동화"
              />
            </div>

            {/* 설명 */}
            <div style={{ gridColumn: "1 / -1" }}>
              <label style={{ fontSize: 13, fontWeight: 600, color: "#374151", display: "block", marginBottom: 6 }}>
                앱 설명 *
              </label>
              <Textarea
                value={form.description}
                onChange={e => setForm(p => ({ ...p, description: e.target.value }))}
                placeholder="앱에 대한 간단한 설명을 입력하세요"
                rows={2}
              />
            </div>

            {/* 상세 설명 */}
            <div style={{ gridColumn: "1 / -1" }}>
              <label style={{ fontSize: 13, fontWeight: 600, color: "#374151", display: "block", marginBottom: 6 }}>
                상세 설명
              </label>
              <Textarea
                value={form.longDescription}
                onChange={e => setForm(p => ({ ...p, longDescription: e.target.value }))}
                placeholder="앱의 상세 기능 및 특징을 입력하세요"
                rows={3}
              />
            </div>

            {/* 앱 URL */}
            <div style={{ gridColumn: "1 / -1" }}>
              <label style={{ fontSize: 13, fontWeight: 600, color: "#374151", display: "block", marginBottom: 6 }}>
                <Link2 size={13} style={{ marginRight: 4, verticalAlign: "middle" }} />
                앱 URL
              </label>
              <Input
                value={form.appUrl}
                onChange={e => setForm(p => ({ ...p, appUrl: e.target.value }))}
                placeholder="https://myapp.com"
                type="url"
              />
              <p style={{ fontSize: 11, color: "#9ca3af", marginTop: 4 }}>
                앱 웹사이트 주소를 입력하세요 (PC 또는 스마트폰에서 접근 가능한 URL)
              </p>
            </div>

            {/* 파일 업로드 */}
            <div style={{ gridColumn: "1 / -1" }}>
              <label style={{ fontSize: 13, fontWeight: 600, color: "#374151", display: "block", marginBottom: 6 }}>
                <Download size={13} style={{ marginRight: 4, verticalAlign: "middle" }} />
                앱 파일 업로드 (PC/스마트폰 앱)
              </label>

              {/* 업로드 영역 */}
              <div
                onDrop={handleFileDrop}
                onDragOver={e => e.preventDefault()}
                onClick={() => fileInputRef.current?.click()}
                style={{
                  border: "2px dashed #c7d2fe",
                  borderRadius: 10,
                  padding: "20px 16px",
                  textAlign: "center",
                  cursor: uploading ? "not-allowed" : "pointer",
                  background: uploading ? "#f9fafb" : "#f5f3ff",
                  transition: "all 0.2s",
                }}
              >
                {uploading ? (
                  <div>
                    <Loader2 size={24} style={{ color: "#6366f1", animation: "spin 1s linear infinite", margin: "0 auto 8px" }} />
                    <p style={{ fontSize: 13, color: "#6366f1", margin: 0 }}>업로드 중... {uploadProgress}%</p>
                    <div style={{ background: "#e0e7ff", borderRadius: 4, height: 4, marginTop: 8, overflow: "hidden" }}>
                      <div style={{ background: "#6366f1", height: "100%", width: `${uploadProgress}%`, transition: "width 0.3s" }} />
                    </div>
                  </div>
                ) : (
                  <div>
                    <Upload size={24} style={{ color: "#6366f1", margin: "0 auto 8px", display: "block" }} />
                    <p style={{ fontSize: 13, color: "#374151", margin: "0 0 4px", fontWeight: 600 }}>
                      파일을 드래그하거나 클릭하여 업로드
                    </p>
                    <p style={{ fontSize: 11, color: "#9ca3af", margin: 0 }}>
                      .exe, .apk, .ipa, .dmg, .zip 등 모든 파일 형식 지원
                    </p>
                  </div>
                )}
              </div>
              <input
                ref={fileInputRef}
                type="file"
                style={{ display: "none" }}
                onChange={handleFileSelect}
                accept="*/*"
              />

              {/* 업로드된 파일 표시 */}
              {form.downloadUrl && (
                <div style={{
                  marginTop: 8,
                  padding: "8px 12px",
                  background: "#f0fdf4",
                  border: "1px solid #86efac",
                  borderRadius: 8,
                  display: "flex",
                  alignItems: "center",
                  gap: 8,
                }}>
                  <Package size={14} style={{ color: "#16a34a", flexShrink: 0 }} />
                  <span style={{ fontSize: 12, color: "#15803d", flex: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                    {form.originalFilename || form.downloadUrl}
                  </span>
                  <button
                    onClick={() => setForm(p => ({ ...p, downloadUrl: "", originalFilename: "" }))}
                    style={{ background: "none", border: "none", cursor: "pointer", color: "#6b7280", padding: 0 }}
                  >
                    <X size={14} />
                  </button>
                </div>
              )}
            </div>

            {/* 썸네일 URL */}
            <div>
              <label style={{ fontSize: 13, fontWeight: 600, color: "#374151", display: "block", marginBottom: 6 }}>
                썸네일 이미지 URL
              </label>
              <Input
                value={form.thumbnail}
                onChange={e => setForm(p => ({ ...p, thumbnail: e.target.value }))}
                placeholder="https://example.com/image.jpg"
              />
            </div>

            {/* 기술 스택 */}
            <div>
              <label style={{ fontSize: 13, fontWeight: 600, color: "#374151", display: "block", marginBottom: 6 }}>
                기술 스택
              </label>
              <Input
                value={form.techStack}
                onChange={e => setForm(p => ({ ...p, techStack: e.target.value }))}
                placeholder="Python, React, Node.js"
              />
            </div>

            {/* 주요 기능 */}
            <div style={{ gridColumn: "1 / -1" }}>
              <label style={{ fontSize: 13, fontWeight: 600, color: "#374151", display: "block", marginBottom: 6 }}>
                주요 기능 (줄바꿈으로 구분)
              </label>
              <Textarea
                value={form.features}
                onChange={e => setForm(p => ({ ...p, features: e.target.value }))}
                placeholder={"자막 자동 생성\n한국어 번역\nSRT 파일 내보내기"}
                rows={3}
              />
            </div>

            {/* 사용 방법 */}
            <div style={{ gridColumn: "1 / -1" }}>
              <label style={{ fontSize: 13, fontWeight: 600, color: "#374151", display: "block", marginBottom: 6 }}>
                사용 방법
              </label>
              <Textarea
                value={form.howToUse}
                onChange={e => setForm(p => ({ ...p, howToUse: e.target.value }))}
                placeholder="앱 사용 방법을 입력하세요"
                rows={3}
              />
            </div>

            {/* 공개 여부 */}
            <div style={{ gridColumn: "1 / -1" }}>
              <label style={{ display: "flex", alignItems: "center", gap: 8, cursor: "pointer" }}>
                <input
                  type="checkbox"
                  checked={form.published}
                  onChange={e => setForm(p => ({ ...p, published: e.target.checked }))}
                  style={{ width: 16, height: 16, accentColor: "#6366f1" }}
                />
                <span style={{ fontSize: 13, fontWeight: 600, color: "#374151" }}>공개</span>
              </label>
            </div>
          </div>

          {/* 버튼 */}
          <div style={{ display: "flex", gap: 8, justifyContent: "flex-end", marginTop: 20 }}>
            <Button variant="outline" onClick={handleCancel}>취소</Button>
            <Button
              onClick={handleSubmit}
              disabled={createMutation.isPending || updateMutation.isPending}
              style={{ background: "linear-gradient(135deg, #6366f1, #8b5cf6)", color: "#fff", border: "none" }}
            >
              {(createMutation.isPending || updateMutation.isPending) && (
                <Loader2 size={14} style={{ marginRight: 6, animation: "spin 1s linear infinite" }} />
              )}
              {editingId !== null ? "수정 저장" : "앱 등록"}
            </Button>
          </div>
        </div>
      )}

      {/* 앱 목록 */}
      {isLoading ? (
        <div style={{ textAlign: "center", padding: 40, color: "#6b7280" }}>
          <Loader2 size={24} style={{ animation: "spin 1s linear infinite", margin: "0 auto 8px", display: "block" }} />
          불러오는 중...
        </div>
      ) : !apps || apps.length === 0 ? (
        <div style={{
          background: "#fff",
          border: "1px solid #e5e7eb",
          borderRadius: 12,
          padding: "40px 24px",
          textAlign: "center",
          color: "#9ca3af"
        }}>
          <Package size={32} style={{ margin: "0 auto 12px", display: "block", opacity: 0.4 }} />
          <p style={{ margin: 0, fontSize: 14 }}>등록된 앱이 없습니다.</p>
          <p style={{ margin: "4px 0 0", fontSize: 12 }}>위의 "앱 추가" 버튼을 눌러 첫 번째 앱을 등록하세요.</p>
        </div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          {(apps as AppRow[]).map(app => (
            <div
              key={app.id}
              style={{
                background: "#fff",
                border: "1px solid #e5e7eb",
                borderRadius: 10,
                padding: "14px 16px",
                display: "flex",
                alignItems: "center",
                gap: 12,
                boxShadow: "0 1px 3px rgba(0,0,0,0.04)"
              }}
            >
              {/* 썸네일 */}
              <div style={{
                width: 48,
                height: 48,
                borderRadius: 8,
                background: app.thumbnail ? `url(${app.thumbnail}) center/cover` : (app.gradient || "linear-gradient(135deg, #6366f1, #8b5cf6)"),
                flexShrink: 0,
                backgroundSize: "cover",
                backgroundPosition: "center",
              }} />

              {/* 정보 */}
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 2 }}>
                  <span style={{ fontSize: 14, fontWeight: 700, color: "#111827" }}>{app.name}</span>
                  {!app.published && (
                    <Badge variant="outline" style={{ fontSize: 10, color: "#6b7280", borderColor: "#d1d5db" }}>비공개</Badge>
                  )}
                  {app.category && (
                    <Badge variant="outline" style={{ fontSize: 10, color: "#6366f1", borderColor: "#c7d2fe" }}>{app.category}</Badge>
                  )}
                  {(app as any).authorUsername && (
                    <span style={{ fontSize: 10, color: "#8b5cf6", fontWeight: 600 }}>@{(app as any).authorUsername}</span>
                  )}
                </div>
                <p style={{ fontSize: 12, color: "#6b7280", margin: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                  {app.description}
                </p>
                <div style={{ display: "flex", gap: 12, marginTop: 4 }}>
                  {app.appUrl && (
                    <a href={app.appUrl} target="_blank" rel="noopener noreferrer" style={{ fontSize: 11, color: "#6366f1", display: "flex", alignItems: "center", gap: 3 }}>
                      <ExternalLink size={10} />
                      앱 URL
                    </a>
                  )}
                  {app.downloadUrl && (
                    <span style={{ fontSize: 11, color: "#16a34a", display: "flex", alignItems: "center", gap: 3 }}>
                      <Download size={10} />
                      {app.originalFilename || "파일 있음"}
                    </span>
                  )}
                  <span style={{ fontSize: 11, color: "#9ca3af" }}>다운로드 {app.downloads}회</span>
                </div>
              </div>

              {/* 액션 버튼 */}
              <div style={{ display: "flex", gap: 6, flexShrink: 0 }}>
                <button
                  onClick={() => togglePublishMutation.mutate({ id: app.id, published: !app.published })}
                  title={app.published ? "비공개로 전환" : "공개로 전환"}
                  style={{
                    background: "none", border: "1px solid #e5e7eb", borderRadius: 6,
                    padding: "5px 8px", cursor: "pointer", color: app.published ? "#16a34a" : "#9ca3af"
                  }}
                >
                  {app.published ? <Eye size={14} /> : <EyeOff size={14} />}
                </button>
                <button
                  onClick={() => handleEdit(app)}
                  title="수정"
                  style={{
                    background: "none", border: "1px solid #e5e7eb", borderRadius: 6,
                    padding: "5px 8px", cursor: "pointer", color: "#6366f1"
                  }}
                >
                  <Edit2 size={14} />
                </button>
                <button
                  onClick={() => {
                    if (confirm(`"${app.name}" 앱을 삭제하시겠습니까?`)) {
                      deleteMutation.mutate({ id: app.id });
                    }
                  }}
                  title="삭제"
                  style={{
                    background: "none", border: "1px solid #fee2e2", borderRadius: 6,
                    padding: "5px 8px", cursor: "pointer", color: "#dc2626"
                  }}
                >
                  <Trash2 size={14} />
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      <style>{`
        @keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }
      `}</style>
      </>)}
    </div>
  );
}

export default AdminAppsTab;
