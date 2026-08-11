import { useState } from "react";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
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
import { toast } from "sonner";
import {
  Plus,
  Trash2,
  Link2,
  Unlink,
  CheckCircle2,
  XCircle,
  Loader2,
  ExternalLink,
  FlaskConical,
  Pencil,
  Key,
  Info,
  Sparkles,
  Search,
  Youtube,
  ShieldCheck,
  AlertTriangle,
} from "lucide-react";

type KeyRow = {
  id: number;
  keyType: string;
  label: string;
  maskedValue: string;
  createdAt: number;
  updatedAt: number;
  connectedPages: Array<{ id: number; title: string; slug: string }>;
};

type PageRow = { id: number; title: string; slug: string };

const KEY_TYPE_CONFIG: Record<
  string,
  {
    name: string;
    Icon: React.ElementType;
    desc: string;
    gradient: string;
    iconBg: string;
    iconColor: string;
    accentColor: string;
    badgeBg: string;
    badgeText: string;
    badgeBorder: string;
  }
> = {
  gemini: {
    name: "Gemini API Key",
    Icon: Sparkles,
    desc: "Google AI Studio에서 발급한 Gemini API 키입니다. AI 분석 기능(SiteScope 등)에 사용됩니다.",
    gradient: "from-violet-500/10 to-purple-500/5",
    iconBg: "bg-violet-100",
    iconColor: "text-violet-600",
    accentColor: "#7c3aed",
    badgeBg: "#f5f3ff",
    badgeText: "#6d28d9",
    badgeBorder: "#ddd6fe",
  },
  google: {
    name: "Google API Key",
    Icon: Search,
    desc: "Google Cloud Console에서 발급한 키입니다. PageSpeed Insights 및 Safe Browsing API에 사용됩니다.",
    gradient: "from-blue-500/10 to-sky-500/5",
    iconBg: "bg-blue-100",
    iconColor: "text-blue-600",
    accentColor: "#2563eb",
    badgeBg: "#eff6ff",
    badgeText: "#1d4ed8",
    badgeBorder: "#bfdbfe",
  },
  youtube: {
    name: "YouTube Data API Key",
    Icon: Youtube,
    desc: "Google Cloud Console에서 YouTube Data API v3를 활성화하여 발급한 키입니다. 유튜브 영상 검색 및 데이터 조회에 사용됩니다.",
    gradient: "from-red-500/10 to-rose-500/5",
    iconBg: "bg-red-100",
    iconColor: "text-red-600",
    accentColor: "#dc2626",
    badgeBg: "#fff1f2",
    badgeText: "#be123c",
    badgeBorder: "#fecdd3",
  },
};

const DEFAULT_KEY_CONFIG = {
  name: "API Key",
  Icon: Key,
  desc: "",
  gradient: "from-gray-500/10 to-gray-500/5",
  iconBg: "bg-gray-100",
  iconColor: "text-gray-600",
  accentColor: "#6b7280",
  badgeBg: "#f9fafb",
  badgeText: "#374151",
  badgeBorder: "#e5e7eb",
};

export default function AdminApiKeysTab() {
  const utils = trpc.useUtils();

  const { data: keys = [], isLoading } = trpc.proxyApiKeys.list.useQuery();
  const { data: allPages = [] } = trpc.proxyApiKeys.listPages.useQuery();

  const [showCreate, setShowCreate] = useState(false);
  const [newKeyType, setNewKeyType] = useState<"gemini" | "google" | "youtube">("gemini");
  const [newLabel, setNewLabel] = useState("");
  const [newKeyValue, setNewKeyValue] = useState("");

  const [linkTarget, setLinkTarget] = useState<KeyRow | null>(null);
  const [selectedPageId, setSelectedPageId] = useState<string>("");
  const [urlInput, setUrlInput] = useState("");
  const [urlMatchResult, setUrlMatchResult] = useState<PageRow | null | "not-found">(null);

  const handleUrlInput = (value: string) => {
    setUrlInput(value);
    setUrlMatchResult(null);
    setSelectedPageId("");
    if (!value.trim()) return;
    try {
      let pathname = value.trim();
      if (pathname.startsWith("http")) {
        pathname = new URL(pathname).pathname;
      }
      const match = pathname.match(/\/page\/([^/?#]+)/);
      if (!match) {
        setUrlMatchResult("not-found");
        return;
      }
      const slug = match[1];
      const found = allPages.find((p) => p.slug === slug);
      if (found) {
        setUrlMatchResult(found);
        setSelectedPageId(String(found.id));
      } else {
        setUrlMatchResult("not-found");
      }
    } catch {
      setUrlMatchResult("not-found");
    }
  };

  const [deleteTarget, setDeleteTarget] = useState<KeyRow | null>(null);
  const [editTarget, setEditTarget] = useState<KeyRow | null>(null);
  const [editLabel, setEditLabel] = useState("");
  const [editKeyValue, setEditKeyValue] = useState("");

  const [testResults, setTestResults] = useState<
    Record<number, { ok: boolean; message: string } | "loading">
  >({});

  const createMut = trpc.proxyApiKeys.create.useMutation({
    onSuccess: () => {
      utils.proxyApiKeys.list.invalidate();
      setShowCreate(false);
      setNewLabel("");
      setNewKeyValue("");
      toast.success("API 키 등록 완료");
    },
    onError: (e) => toast.error(`등록 실패: ${e.message}`),
  });

  const deleteMut = trpc.proxyApiKeys.delete.useMutation({
    onSuccess: () => {
      utils.proxyApiKeys.list.invalidate();
      setDeleteTarget(null);
      toast.success("API 키 삭제 완료");
    },
    onError: (e) => toast.error(`삭제 실패: ${e.message}`),
  });

  const linkMut = trpc.proxyApiKeys.linkPage.useMutation({
    onSuccess: () => {
      utils.proxyApiKeys.list.invalidate();
      setSelectedPageId("");
      setLinkTarget(null);
      setUrlInput("");
      setUrlMatchResult(null);
      toast.success("페이지 연결 완료");
    },
    onError: (e) => toast.error(`연결 실패: ${e.message}`),
  });

  const unlinkMut = trpc.proxyApiKeys.unlinkPage.useMutation({
    onSuccess: () => {
      utils.proxyApiKeys.list.invalidate();
      toast.success("연결 해제 완료");
    },
    onError: (e) => toast.error(`해제 실패: ${e.message}`),
  });

  const updateMut = trpc.proxyApiKeys.update.useMutation({
    onSuccess: () => {
      utils.proxyApiKeys.list.invalidate();
      setEditTarget(null);
      toast.success("API 키 수정 완료");
    },
    onError: (e) => toast.error(`수정 실패: ${e.message}`),
  });

  const testMut = trpc.proxyApiKeys.test.useMutation({
    onMutate: ({ id }) => {
      setTestResults((prev) => ({ ...prev, [id]: "loading" }));
    },
    onSuccess: (data, { id }) => {
      setTestResults((prev) => ({ ...prev, [id]: data }));
    },
    onError: (e, { id }) => {
      setTestResults((prev) => ({ ...prev, [id]: { ok: false, message: e.message } }));
    },
  });

  const availablePages = (key: KeyRow): PageRow[] => {
    const linked = new Set(key.connectedPages.map((p) => p.id));
    return allPages.filter((p) => !linked.has(p.id));
  };

  const handleCreate = () => {
    if (!newLabel.trim() || !newKeyValue.trim()) {
      toast.error("레이블과 키 값을 모두 입력해주세요.");
      return;
    }
    createMut.mutate({
      keyType: newKeyType as "gemini" | "google" | "youtube",
      label: newLabel.trim(),
      keyValue: newKeyValue.trim(),
    });
  };

  const handleLink = () => {
    if (!linkTarget) return;
    const pageId = selectedPageId
      ? Number(selectedPageId)
      : urlMatchResult && urlMatchResult !== "not-found"
        ? urlMatchResult.id
        : null;
    if (!pageId) return;
    linkMut.mutate({ keyId: linkTarget.id, pageId });
  };

  const handleEdit = () => {
    if (!editTarget) return;
    if (!editLabel.trim()) {
      toast.error("레이블을 입력해주세요.");
      return;
    }
    updateMut.mutate({
      id: editTarget.id,
      label: editLabel.trim(),
      keyValue: editKeyValue.trim() || undefined,
    });
  };

  if (isLoading) {
    return (
      <div className="flex flex-col items-center justify-center py-24 gap-3">
        <Loader2 className="animate-spin w-7 h-7 text-violet-400" />
        <p className="text-sm text-gray-400">API 키 목록 불러오는 중...</p>
      </div>
    );
  }

  return (
    <div className="w-full max-w-3xl space-y-6">
      {/* ── 페이지 헤더 ── */}
      <div
        style={{
          background: "linear-gradient(135deg, #1e1b4b 0%, #312e81 50%, #1e1b4b 100%)",
          borderRadius: 16,
          padding: "28px 32px",
          position: "relative",
          overflow: "hidden",
        }}
      >
        {/* 배경 장식 */}
        <div
          style={{
            position: "absolute",
            top: -40,
            right: -40,
            width: 180,
            height: 180,
            borderRadius: "50%",
            background: "rgba(139,92,246,0.15)",
            pointerEvents: "none",
          }}
        />
        <div
          style={{
            position: "absolute",
            bottom: -20,
            left: 120,
            width: 100,
            height: 100,
            borderRadius: "50%",
            background: "rgba(99,102,241,0.12)",
            pointerEvents: "none",
          }}
        />

        <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 16, position: "relative" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 16 }}>
            <div
              style={{
                width: 52,
                height: 52,
                borderRadius: 14,
                background: "rgba(139,92,246,0.25)",
                border: "1px solid rgba(139,92,246,0.4)",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                flexShrink: 0,
              }}
            >
              <Key style={{ width: 24, height: 24, color: "#c4b5fd" }} />
            </div>
            <div>
              <h2 style={{ fontSize: 20, fontWeight: 700, color: "#ffffff", margin: 0, letterSpacing: "-0.3px" }}>
                API 키 관리
              </h2>
              <p style={{ fontSize: 13, color: "#a5b4fc", marginTop: 4, lineHeight: 1.5 }}>
                API 키를 등록하고 각 키를 원하는 페이지에 연결하여 사용할 수 있습니다.
              </p>
            </div>
          </div>
          <button
            onClick={() => setShowCreate(true)}
            style={{
              display: "flex",
              alignItems: "center",
              gap: 7,
              padding: "10px 18px",
              borderRadius: 10,
              background: "rgba(139,92,246,0.9)",
              border: "1px solid rgba(167,139,250,0.5)",
              color: "#ffffff",
              fontSize: 13,
              fontWeight: 600,
              cursor: "pointer",
              flexShrink: 0,
              transition: "all 0.15s",
              backdropFilter: "blur(4px)",
            }}
            onMouseEnter={(e) => {
              (e.currentTarget as HTMLButtonElement).style.background = "rgba(139,92,246,1)";
              (e.currentTarget as HTMLButtonElement).style.transform = "translateY(-1px)";
            }}
            onMouseLeave={(e) => {
              (e.currentTarget as HTMLButtonElement).style.background = "rgba(139,92,246,0.9)";
              (e.currentTarget as HTMLButtonElement).style.transform = "translateY(0)";
            }}
          >
            <Plus style={{ width: 15, height: 15 }} />
            새 키 등록
          </button>
        </div>

        {/* ENV 안내 배너 */}
        <div
          style={{
            marginTop: 20,
            background: "rgba(99,102,241,0.15)",
            border: "1px solid rgba(99,102,241,0.3)",
            borderRadius: 10,
            padding: "12px 16px",
            display: "flex",
            alignItems: "flex-start",
            gap: 10,
            position: "relative",
          }}
        >
          <Info style={{ width: 15, height: 15, color: "#a5b4fc", flexShrink: 0, marginTop: 1 }} />
          <p style={{ fontSize: 12, color: "#c7d2fe", lineHeight: 1.6, margin: 0 }}>
            <span style={{ fontWeight: 600, color: "#e0e7ff" }}>ENV 환경변수 키 사용 방법: </span>
            DB에 등록된 키가 없으면 서버 환경변수(GEMINI_API_KEY, GOOGLE_API_KEY)가 자동으로 사용됩니다.
            특정 페이지에 다른 키를 사용하려면 새 키를 등록하고 페이지에 연결하세요.
          </p>
        </div>
      </div>

      {/* ── 키 목록 ── */}
      {keys.length === 0 ? (
        <div
          style={{
            textAlign: "center",
            padding: "48px 24px",
            border: "2px dashed #e5e7eb",
            borderRadius: 16,
            background: "#fafafa",
          }}
        >
          <div
            style={{
              width: 56,
              height: 56,
              borderRadius: 14,
              background: "#f3f4f6",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              margin: "0 auto 16px",
            }}
          >
            <Key style={{ width: 24, height: 24, color: "#9ca3af" }} />
          </div>
          <p style={{ fontSize: 15, fontWeight: 600, color: "#374151", margin: "0 0 6px" }}>
            등록된 API 키가 없습니다
          </p>
          <p style={{ fontSize: 13, color: "#9ca3af", margin: "0 0 20px" }}>
            ENV 환경변수 키가 전역으로 사용됩니다.
          </p>
          <button
            onClick={() => setShowCreate(true)}
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: 7,
              padding: "9px 18px",
              borderRadius: 9,
              background: "#4f46e5",
              border: "none",
              color: "#ffffff",
              fontSize: 13,
              fontWeight: 600,
              cursor: "pointer",
            }}
          >
            <Plus style={{ width: 14, height: 14 }} />
            첫 번째 키 등록하기
          </button>
        </div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
          {(keys as KeyRow[]).map((key) => {
            const cfg = KEY_TYPE_CONFIG[key.keyType] ?? DEFAULT_KEY_CONFIG;
            const { Icon } = cfg;
            const testResult = testResults[key.id];
            const avail = availablePages(key);

            return (
              <div
                key={key.id}
                style={{
                  background: "#ffffff",
                  border: "1px solid #e5e7eb",
                  borderRadius: 16,
                  overflow: "hidden",
                  boxShadow: "0 1px 3px rgba(0,0,0,0.06), 0 4px 16px rgba(0,0,0,0.04)",
                  transition: "box-shadow 0.2s",
                }}
                onMouseEnter={(e) => {
                  (e.currentTarget as HTMLDivElement).style.boxShadow =
                    "0 4px 12px rgba(0,0,0,0.08), 0 8px 24px rgba(0,0,0,0.06)";
                }}
                onMouseLeave={(e) => {
                  (e.currentTarget as HTMLDivElement).style.boxShadow =
                    "0 1px 3px rgba(0,0,0,0.06), 0 4px 16px rgba(0,0,0,0.04)";
                }}
              >
                {/* 카드 상단 컬러 스트라이프 */}
                <div
                  style={{
                    height: 3,
                    background: `linear-gradient(90deg, ${cfg.accentColor}, ${cfg.accentColor}88)`,
                  }}
                />

                {/* 카드 본문 */}
                <div style={{ padding: "20px 24px" }}>
                  {/* 상단: 아이콘 + 정보 + 버튼 */}
                  <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 12 }}>
                    {/* 좌측: 아이콘 + 이름 */}
                    <div style={{ display: "flex", alignItems: "center", gap: 14, flex: 1, minWidth: 0 }}>
                      <div
                        style={{
                          width: 46,
                          height: 46,
                          borderRadius: 12,
                          background: cfg.iconBg,
                          display: "flex",
                          alignItems: "center",
                          justifyContent: "center",
                          flexShrink: 0,
                        }}
                      >
                        <Icon
                          style={{
                            width: 22,
                            height: 22,
                            color: cfg.accentColor,
                          }}
                        />
                      </div>
                      <div style={{ minWidth: 0 }}>
                        <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
                          <span style={{ fontWeight: 700, fontSize: 15, color: "#111827" }}>{cfg.name}</span>
                          <span
                            style={{
                              fontSize: 11,
                              fontWeight: 600,
                              color: cfg.badgeText,
                              background: cfg.badgeBg,
                              border: `1px solid ${cfg.badgeBorder}`,
                              borderRadius: 6,
                              padding: "2px 8px",
                              letterSpacing: "0.02em",
                            }}
                          >
                            {key.label}
                          </span>
                        </div>
                        <div style={{ display: "flex", alignItems: "center", gap: 6, marginTop: 5 }}>
                          <ShieldCheck style={{ width: 12, height: 12, color: "#9ca3af" }} />
                          <span style={{ fontSize: 12, color: "#6b7280" }}>
                            현재 키:{" "}
                            <code
                              style={{
                                background: "#f3f4f6",
                                border: "1px solid #e5e7eb",
                                padding: "1px 7px",
                                borderRadius: 5,
                                fontSize: 11,
                                fontFamily: "monospace",
                                color: "#374151",
                              }}
                            >
                              {key.maskedValue}
                            </code>
                          </span>
                        </div>
                      </div>
                    </div>

                    {/* 우측: 액션 버튼 */}
                    <div style={{ display: "flex", alignItems: "center", gap: 6, flexShrink: 0 }}>
                      <button
                        onClick={() => testMut.mutate({ id: key.id })}
                        disabled={testResult === "loading"}
                        style={{
                          display: "flex",
                          alignItems: "center",
                          gap: 5,
                          padding: "6px 12px",
                          borderRadius: 8,
                          background: "#f9fafb",
                          border: "1px solid #e5e7eb",
                          color: "#374151",
                          fontSize: 12,
                          fontWeight: 500,
                          cursor: testResult === "loading" ? "not-allowed" : "pointer",
                          opacity: testResult === "loading" ? 0.6 : 1,
                          transition: "all 0.15s",
                        }}
                        onMouseEnter={(e) => {
                          if (testResult !== "loading") {
                            (e.currentTarget as HTMLButtonElement).style.background = "#f3f4f6";
                            (e.currentTarget as HTMLButtonElement).style.borderColor = "#d1d5db";
                          }
                        }}
                        onMouseLeave={(e) => {
                          (e.currentTarget as HTMLButtonElement).style.background = "#f9fafb";
                          (e.currentTarget as HTMLButtonElement).style.borderColor = "#e5e7eb";
                        }}
                      >
                        {testResult === "loading" ? (
                          <Loader2 style={{ width: 13, height: 13 }} className="animate-spin" />
                        ) : (
                          <FlaskConical style={{ width: 13, height: 13 }} />
                        )}
                        테스트
                      </button>
                      <button
                        onClick={() => {
                          setEditTarget(key);
                          setEditLabel(key.label);
                          setEditKeyValue("");
                        }}
                        style={{
                          display: "flex",
                          alignItems: "center",
                          gap: 5,
                          padding: "6px 12px",
                          borderRadius: 8,
                          background: "#eff6ff",
                          border: "1px solid #bfdbfe",
                          color: "#1d4ed8",
                          fontSize: 12,
                          fontWeight: 500,
                          cursor: "pointer",
                          transition: "all 0.15s",
                        }}
                        onMouseEnter={(e) => {
                          (e.currentTarget as HTMLButtonElement).style.background = "#dbeafe";
                        }}
                        onMouseLeave={(e) => {
                          (e.currentTarget as HTMLButtonElement).style.background = "#eff6ff";
                        }}
                      >
                        <Pencil style={{ width: 12, height: 12 }} />
                        수정
                      </button>
                      <button
                        onClick={() => setDeleteTarget(key)}
                        style={{
                          display: "flex",
                          alignItems: "center",
                          gap: 5,
                          padding: "6px 12px",
                          borderRadius: 8,
                          background: "#fff1f2",
                          border: "1px solid #fecdd3",
                          color: "#be123c",
                          fontSize: 12,
                          fontWeight: 500,
                          cursor: "pointer",
                          transition: "all 0.15s",
                        }}
                        onMouseEnter={(e) => {
                          (e.currentTarget as HTMLButtonElement).style.background = "#ffe4e6";
                        }}
                        onMouseLeave={(e) => {
                          (e.currentTarget as HTMLButtonElement).style.background = "#fff1f2";
                        }}
                      >
                        <Trash2 style={{ width: 12, height: 12 }} />
                        삭제
                      </button>
                    </div>
                  </div>

                  {/* 테스트 결과 */}
                  {testResult && testResult !== "loading" && (
                    <div
                      style={{
                        marginTop: 14,
                        borderRadius: 10,
                        padding: "11px 14px",
                        fontSize: 13,
                        background: testResult.ok ? "#f0fdf4" : "#fef2f2",
                        border: `1px solid ${testResult.ok ? "#bbf7d0" : "#fecaca"}`,
                        color: testResult.ok ? "#15803d" : "#dc2626",
                        display: "flex",
                        alignItems: "flex-start",
                        gap: 8,
                      }}
                    >
                      {testResult.ok ? (
                        <CheckCircle2 style={{ width: 15, height: 15, flexShrink: 0, marginTop: 1 }} />
                      ) : (
                        <AlertTriangle style={{ width: 15, height: 15, flexShrink: 0, marginTop: 1 }} />
                      )}
                      <div>
                        <p style={{ fontWeight: 600, margin: "0 0 2px" }}>
                          {testResult.ok ? "연결 성공" : "연결 실패"}
                        </p>
                        <p style={{ margin: 0, opacity: 0.85, fontSize: 12 }}>{testResult.message}</p>
                      </div>
                    </div>
                  )}

                  {/* 키 설명 */}
                  <p
                    style={{
                      marginTop: 14,
                      fontSize: 12.5,
                      color: "#6b7280",
                      lineHeight: 1.65,
                      padding: "10px 14px",
                      background: "#f9fafb",
                      borderRadius: 8,
                      border: "1px solid #f3f4f6",
                    }}
                  >
                    {cfg.desc}
                  </p>

                  {/* 연결된 페이지 섹션 */}
                  <div style={{ marginTop: 16 }}>
                    <div
                      style={{
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "space-between",
                        marginBottom: 10,
                      }}
                    >
                      <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                        <Link2 style={{ width: 13, height: 13, color: "#6b7280" }} />
                        <span style={{ fontSize: 12, fontWeight: 600, color: "#374151" }}>
                          연결된 페이지
                        </span>
                        <span
                          style={{
                            fontSize: 11,
                            fontWeight: 700,
                            color: cfg.badgeText,
                            background: cfg.badgeBg,
                            border: `1px solid ${cfg.badgeBorder}`,
                            borderRadius: 20,
                            padding: "1px 7px",
                          }}
                        >
                          {key.connectedPages.length}
                        </span>
                      </div>
                      <button
                        onClick={() => {
                          setLinkTarget(key);
                          setSelectedPageId("");
                          setUrlInput("");
                          setUrlMatchResult(null);
                        }}
                        disabled={avail.length === 0}
                        style={{
                          display: "flex",
                          alignItems: "center",
                          gap: 5,
                          padding: "5px 11px",
                          borderRadius: 7,
                          background: avail.length === 0 ? "#f9fafb" : cfg.badgeBg,
                          border: `1px solid ${avail.length === 0 ? "#e5e7eb" : cfg.badgeBorder}`,
                          color: avail.length === 0 ? "#9ca3af" : cfg.badgeText,
                          fontSize: 12,
                          fontWeight: 500,
                          cursor: avail.length === 0 ? "not-allowed" : "pointer",
                          transition: "all 0.15s",
                        }}
                      >
                        <Plus style={{ width: 12, height: 12 }} />
                        페이지 연결
                      </button>
                    </div>

                    {key.connectedPages.length === 0 ? (
                      <div
                        style={{
                          padding: "12px 14px",
                          borderRadius: 8,
                          border: "1.5px dashed #e5e7eb",
                          textAlign: "center",
                        }}
                      >
                        <p style={{ fontSize: 12, color: "#9ca3af", margin: 0 }}>
                          연결된 페이지가 없습니다. 페이지를 연결하면 해당 페이지에서 이 키가 사용됩니다.
                        </p>
                      </div>
                    ) : (
                      <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
                        {key.connectedPages.map((page) => (
                          <div
                            key={page.id}
                            style={{
                              display: "flex",
                              alignItems: "center",
                              gap: 6,
                              background: cfg.badgeBg,
                              border: `1px solid ${cfg.badgeBorder}`,
                              borderRadius: 8,
                              padding: "6px 10px",
                              fontSize: 12,
                              color: cfg.badgeText,
                              transition: "all 0.15s",
                            }}
                          >
                            <a
                              href={`/page/${page.slug}`}
                              target="_blank"
                              rel="noopener noreferrer"
                              style={{
                                display: "flex",
                                alignItems: "center",
                                gap: 4,
                                color: "inherit",
                                textDecoration: "none",
                                fontWeight: 500,
                              }}
                              onMouseEnter={(e) =>
                                ((e.currentTarget as HTMLAnchorElement).style.textDecoration = "underline")
                              }
                              onMouseLeave={(e) =>
                                ((e.currentTarget as HTMLAnchorElement).style.textDecoration = "none")
                              }
                            >
                              {page.title}
                              <ExternalLink style={{ width: 11, height: 11, opacity: 0.6 }} />
                            </a>
                            <button
                              style={{
                                marginLeft: 2,
                                color: "#d1d5db",
                                background: "none",
                                border: "none",
                                cursor: "pointer",
                                padding: 0,
                                display: "flex",
                                alignItems: "center",
                                transition: "color 0.15s",
                              }}
                              onMouseEnter={(e) =>
                                ((e.currentTarget as HTMLButtonElement).style.color = "#ef4444")
                              }
                              onMouseLeave={(e) =>
                                ((e.currentTarget as HTMLButtonElement).style.color = "#d1d5db")
                              }
                              onClick={() => unlinkMut.mutate({ keyId: key.id, pageId: page.id })}
                              title="연결 해제"
                            >
                              <Unlink style={{ width: 12, height: 12 }} />
                            </button>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* ── 신규 키 등록 다이얼로그 ── */}
      <Dialog open={showCreate} onOpenChange={setShowCreate}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <div className="w-7 h-7 rounded-lg bg-violet-100 flex items-center justify-center">
                <Plus className="w-4 h-4 text-violet-600" />
              </div>
              새 API 키 등록
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-1.5">
              <label className="text-sm font-medium text-gray-700">키 종류</label>
              <Select
                value={newKeyType}
                onValueChange={(v) => setNewKeyType(v as "gemini" | "google" | "youtube")}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="gemini">
                    <div className="flex items-center gap-2">
                      <Sparkles className="w-4 h-4 text-violet-500" />
                      Gemini API Key
                    </div>
                  </SelectItem>
                  <SelectItem value="google">
                    <div className="flex items-center gap-2">
                      <Search className="w-4 h-4 text-blue-500" />
                      Google API Key
                    </div>
                  </SelectItem>
                  <SelectItem value="youtube">
                    <div className="flex items-center gap-2">
                      <Youtube className="w-4 h-4 text-red-500" />
                      YouTube Data API Key
                    </div>
                  </SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <label className="text-sm font-medium text-gray-700">
                레이블{" "}
                <span className="text-gray-400 font-normal text-xs">(구분용 이름)</span>
              </label>
              <Input
                placeholder="예: 프로젝트A용 Gemini, 백업 키"
                value={newLabel}
                onChange={(e) => setNewLabel(e.target.value)}
                maxLength={200}
              />
            </div>
            <div className="space-y-1.5">
              <label className="text-sm font-medium text-gray-700">API 키 값</label>
              <Input
                type="password"
                placeholder="API 키를 입력하세요"
                value={newKeyValue}
                onChange={(e) => setNewKeyValue(e.target.value)}
                maxLength={500}
              />
            </div>
            <div className="flex items-start gap-2 rounded-lg bg-amber-50 border border-amber-200 px-3 py-2.5">
              <Info className="w-3.5 h-3.5 text-amber-500 mt-0.5 shrink-0" />
              <p className="text-xs text-amber-700 leading-relaxed">
                등록 후 원하는 페이지에 연결할 수 있습니다. 연결된 페이지에서는 이 키가 우선 사용됩니다.
              </p>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowCreate(false)}>
              취소
            </Button>
            <Button onClick={handleCreate} disabled={createMut.isPending}>
              {createMut.isPending && <Loader2 className="w-4 h-4 animate-spin mr-1.5" />}
              등록
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ── 페이지 연결 다이얼로그 ── */}
      <Dialog
        open={!!linkTarget}
        onOpenChange={(open) => {
          if (!open) {
            setLinkTarget(null);
            setUrlInput("");
            setUrlMatchResult(null);
            setSelectedPageId("");
          }
        }}
      >
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <div className="w-7 h-7 rounded-lg bg-blue-100 flex items-center justify-center">
                <Link2 className="w-4 h-4 text-blue-600" />
              </div>
              페이지 연결
            </DialogTitle>
          </DialogHeader>
          {linkTarget && (
            <div className="space-y-4 py-2">
              <div className="rounded-lg bg-gray-50 border border-gray-200 px-3 py-2.5">
                <p className="text-xs text-gray-500 mb-0.5">연결할 키</p>
                <p className="text-sm font-semibold text-gray-800">{linkTarget.label}</p>
              </div>
              <p className="text-sm text-gray-600">
                연결할 페이지를 선택하거나 URL을 직접 입력하세요.
              </p>
              <div className="space-y-1.5">
                <label className="text-xs font-medium text-gray-700">URL 직접 입력</label>
                <Input
                  placeholder="https://example.com/page/page02 또는 /page/page02"
                  value={urlInput}
                  onChange={(e) => handleUrlInput(e.target.value)}
                  className={
                    urlMatchResult === "not-found"
                      ? "border-red-300 focus-visible:ring-red-300"
                      : urlMatchResult
                        ? "border-green-400 focus-visible:ring-green-300"
                        : ""
                  }
                />
                {urlMatchResult === "not-found" && (
                  <p className="text-xs text-red-500 flex items-center gap-1">
                    <XCircle className="w-3.5 h-3.5" />
                    페이지를 찾을 수 없습니다. URL을 확인해주세요.
                  </p>
                )}
                {urlMatchResult && urlMatchResult !== "not-found" && (
                  <p className="text-xs text-green-600 flex items-center gap-1">
                    <CheckCircle2 className="w-3.5 h-3.5" />
                    <span>
                      <strong>{urlMatchResult.title}</strong> 페이지를 찾았습니다.
                    </span>
                  </p>
                )}
              </div>
              <div className="flex items-center gap-2">
                <div className="flex-1 h-px bg-gray-200" />
                <span className="text-xs text-gray-400">또는 목록에서 선택</span>
                <div className="flex-1 h-px bg-gray-200" />
              </div>
              {availablePages(linkTarget).length === 0 ? (
                <p className="text-sm text-gray-400 text-center py-2">연결 가능한 페이지가 없습니다.</p>
              ) : (
                <Select
                  value={selectedPageId}
                  onValueChange={(v) => {
                    setSelectedPageId(v);
                    setUrlInput("");
                    setUrlMatchResult(null);
                  }}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="페이지를 선택하세요" />
                  </SelectTrigger>
                  <SelectContent>
                    {availablePages(linkTarget).map((page) => (
                      <SelectItem key={page.id} value={String(page.id)}>
                        {page.title}
                        <span className="text-gray-400 text-xs ml-1">/{page.slug}</span>
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}
            </div>
          )}
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => {
                setLinkTarget(null);
                setUrlInput("");
                setUrlMatchResult(null);
                setSelectedPageId("");
              }}
            >
              취소
            </Button>
            <Button
              onClick={handleLink}
              disabled={
                (!selectedPageId && (!urlMatchResult || urlMatchResult === "not-found")) ||
                linkMut.isPending
              }
            >
              {linkMut.isPending && <Loader2 className="w-4 h-4 animate-spin mr-1.5" />}
              연결
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ── 수정 다이얼로그 ── */}
      <Dialog open={!!editTarget} onOpenChange={(open) => { if (!open) setEditTarget(null); }}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <div className="w-7 h-7 rounded-lg bg-blue-100 flex items-center justify-center">
                <Pencil className="w-4 h-4 text-blue-600" />
              </div>
              API 키 수정
            </DialogTitle>
          </DialogHeader>
          {editTarget && (
            <div className="space-y-4 py-2">
              <div className="rounded-lg bg-gray-50 border border-gray-200 px-4 py-3">
                <p className="text-xs text-gray-500 mb-0.5">수정 중인 키</p>
                <p className="text-base font-bold text-gray-900">{editTarget.label}</p>
                <p className="text-xs text-gray-500 mt-0.5">
                  {KEY_TYPE_CONFIG[editTarget.keyType]?.name ?? editTarget.keyType}
                  &nbsp;·&nbsp;현재 키:{" "}
                  <code className="bg-white border border-gray-200 px-1 rounded font-mono">
                    {editTarget.maskedValue}
                  </code>
                </p>
              </div>
              <div className="space-y-1.5">
                <label className="text-sm font-medium text-gray-700">
                  레이블{" "}
                  <span className="text-gray-400 font-normal text-xs">(구분용 이름)</span>
                </label>
                <Input
                  placeholder="예: 프로젝트A용 Gemini, 백업 키"
                  value={editLabel}
                  onChange={(e) => setEditLabel(e.target.value)}
                  maxLength={200}
                />
              </div>
              <div className="space-y-1.5">
                <label className="text-sm font-medium text-gray-700">새 API 키 값</label>
                <Input
                  type="password"
                  placeholder="변경하려면 새 키를 입력하세요 (비워두면 유지)"
                  value={editKeyValue}
                  onChange={(e) => setEditKeyValue(e.target.value)}
                  maxLength={500}
                />
                <p className="text-xs text-gray-400">비워두면 기존 키 값이 유지됩니다.</p>
              </div>
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditTarget(null)}>
              취소
            </Button>
            <Button onClick={handleEdit} disabled={updateMut.isPending}>
              {updateMut.isPending && <Loader2 className="w-4 h-4 animate-spin mr-1.5" />}
              저장
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ── 삭제 확인 다이얼로그 ── */}
      <AlertDialog open={!!deleteTarget} onOpenChange={(open) => !open && setDeleteTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle className="flex items-center gap-2">
              <div className="w-7 h-7 rounded-lg bg-red-100 flex items-center justify-center">
                <Trash2 className="w-4 h-4 text-red-600" />
              </div>
              API 키 삭제
            </AlertDialogTitle>
            <AlertDialogDescription asChild>
              <div className="space-y-2 pt-1">
                <p className="text-sm text-gray-600">
                  <strong className="text-gray-800">{deleteTarget?.label}</strong> 키를 삭제하시겠습니까?
                </p>
                {deleteTarget && deleteTarget.connectedPages.length > 0 && (
                  <div className="flex items-start gap-2 rounded-lg bg-red-50 border border-red-200 px-3 py-2.5">
                    <AlertTriangle className="w-3.5 h-3.5 text-red-500 mt-0.5 shrink-0" />
                    <p className="text-xs text-red-600">
                      연결된 페이지 {deleteTarget.connectedPages.length}개의 연결도 함께 해제됩니다.
                    </p>
                  </div>
                )}
                <p className="text-xs text-gray-400">이 작업은 되돌릴 수 없습니다.</p>
              </div>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>취소</AlertDialogCancel>
            <AlertDialogAction
              className="bg-red-600 hover:bg-red-700"
              onClick={() => deleteTarget && deleteMut.mutate({ id: deleteTarget.id })}
            >
              {deleteMut.isPending && <Loader2 className="w-4 h-4 animate-spin mr-1.5" />}
              삭제
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
