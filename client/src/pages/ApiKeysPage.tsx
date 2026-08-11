import { useState } from "react";
import { useLocation } from "wouter";
import { trpc } from "@/lib/trpc";
import { useAuth } from "@/_core/hooks/useAuth";
import { getLoginUrl } from "@/const";
import { toast } from "sonner";
import Header from "../components/Header";
import {
  Key, Plus, Trash2, Copy, Eye, EyeOff,
  CheckCircle, XCircle, ArrowLeft, Loader2, AlertTriangle,
  RefreshCw, RotateCcw,
} from "lucide-react";

export default function ApiKeysPage() {
  const [, navigate] = useLocation();
  const { isAuthenticated, loading: authLoading } = useAuth();
  const [newKeyName, setNewKeyName] = useState("");
  const [createdKey, setCreatedKey] = useState<string | null>(null);
  const [showCreatedKey, setShowCreatedKey] = useState(true);
  const [revokeConfirm, setRevokeConfirm] = useState<number | null>(null);
  const [deleteConfirm, setDeleteConfirm] = useState<number | null>(null);
  const [creating, setCreating] = useState(false);

  const utils = trpc.useUtils();
  const { data: keys, isLoading } = trpc.apiKeys.list.useQuery(undefined, {
    enabled: isAuthenticated,
  });

  const createKey = trpc.apiKeys.create.useMutation({
    onSuccess: (data) => {
      setCreatedKey(data.raw);
      setShowCreatedKey(true);
      setNewKeyName("");
      utils.apiKeys.list.invalidate();
      toast.success("API 키가 생성되었습니다. 지금 복사해두세요!");
    },
    onError: (err) => toast.error("API 키 생성 실패: " + err.message),
  });

  const revokeKey = trpc.apiKeys.revoke.useMutation({
    onSuccess: () => {
      setRevokeConfirm(null);
      utils.apiKeys.list.invalidate();
      toast.success("API 키가 비활성화되었습니다.");
    },
    onError: (err) => toast.error("API 키 비활성화 실패: " + err.message),
  });

  const deleteKey = trpc.apiKeys.delete.useMutation({
    onSuccess: () => {
      setDeleteConfirm(null);
      utils.apiKeys.list.invalidate();
      toast.success("API 키가 삭제되었습니다.");
    },
    onError: (err) => toast.error("API 키 삭제 실패: " + err.message),
  });

  const reactivateKey = trpc.apiKeys.reactivate.useMutation({
    onSuccess: () => {
      utils.apiKeys.list.invalidate();
      toast.success("API 키가 다시 활성화되었습니다.");
    },
    onError: (err) => toast.error("API 키 활성화 실패: " + err.message),
  });

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newKeyName.trim()) { toast.error("키 이름을 입력해주세요."); return; }
    setCreating(true);
    try {
      await createKey.mutateAsync({ name: newKeyName.trim() });
    } finally {
      setCreating(false);
    }
  };

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text).then(() => toast.success("클립보드에 복사되었습니다."));
  };

  if (!authLoading && !isAuthenticated) {
    return (
      <div style={{ minHeight: "100vh", background: "#f9fafb", fontFamily: "'Noto Sans KR', sans-serif" }}>
        <Header />
        <div style={{ textAlign: "center", padding: "100px 20px" }}>
          <div style={{ fontSize: 40, marginBottom: 16 }}>🔐</div>
          <div style={{ fontSize: 18, fontWeight: 700, color: "#111827", marginBottom: 8 }}>로그인이 필요합니다</div>
          <a
            href={getLoginUrl(window.location.pathname)}
            style={{
              padding: "10px 28px",
              background: "linear-gradient(135deg, #6366f1, #8b5cf6)",
              borderRadius: 8, fontSize: 14, fontWeight: 700, color: "#fff",
              textDecoration: "none", display: "inline-block", marginTop: 16,
            }}
          >로그인하기</a>
        </div>
      </div>
    );
  }

  return (
    <div style={{ minHeight: "100vh", background: "#f9fafb", fontFamily: "'Noto Sans KR', 'Apple SD Gothic Neo', sans-serif" }}>
      <Header />

      <div style={{ maxWidth: 760, margin: "0 auto", padding: "24px 16px 60px" }}>
        {/* 상단 */}
        <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 28 }}>
          <button
            onClick={() => navigate("/")}
            style={{
              background: "none", border: "none", cursor: "pointer",
              color: "#6b7280", display: "flex", alignItems: "center", gap: 5,
              fontSize: 13, padding: 0,
            }}
          >
            <ArrowLeft size={15} /> 홈으로
          </button>
          <div style={{ width: 1, height: 16, background: "#e5e7eb" }} />
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <div style={{
              width: 28, height: 28,
              background: "linear-gradient(135deg, #0ea5e9, #6366f1)",
              borderRadius: 7, display: "flex", alignItems: "center", justifyContent: "center",
            }}>
              <Key size={13} color="#fff" />
            </div>
            <span style={{ fontSize: 16, fontWeight: 800, color: "#111827" }}>자동화 API 키 관리</span>
          </div>
        </div>

        {/* 설명 */}
        <div style={{
          background: "rgba(14,165,233,0.08)", border: "1px solid rgba(14,165,233,0.2)",
          borderRadius: 12, padding: "16px 20px", marginBottom: 24,
        }}>
          <div style={{ fontSize: 13, fontWeight: 700, color: "#38bdf8", marginBottom: 6 }}>자동화 발행 API 사용법</div>
          <div style={{ fontSize: 12, color: "#6b7280", lineHeight: 1.7 }}>
            API 키를 발급받아 외부 프로그램(Python, n8n, Zapier 등)에서 자동으로 글을 발행할 수 있습니다.<br />
            <code style={{ background: "#e5e7eb", padding: "1px 6px", borderRadius: 4, color: "#6366f1" }}>POST /api/publish</code>
            {" "}엔드포인트에{" "}
            <code style={{ background: "#e5e7eb", padding: "1px 6px", borderRadius: 4, color: "#6366f1" }}>Authorization: Bearer &lt;api_key&gt;</code>
            {" "}헤더를 포함하세요.
          </div>
          <div style={{ marginTop: 10 }}>
            <button
              onClick={() => copyToClipboard(`curl -X POST https://your-site.manus.space/api/publish \\
  -H "Authorization: Bearer sag_your_api_key" \\
  -H "Content-Type: application/json" \\
  -d '{
    "title": "글 제목",
    "content": "<p>HTML 본문 내용</p>",
    "category": "ai-apps",
    "excerpt": "요약 (선택)",
    "thumbnail": "https://example.com/image.jpg",
    "coupangKeywords": ["키워드1", "키워드2"]
  }'`)}
              style={{
                fontSize: 11, color: "#6b7280", background: "#e5e7eb",
                border: "1px solid #2a2a45", borderRadius: 6,
                padding: "5px 10px", cursor: "pointer",
              }}
            >
              <Copy size={10} style={{ display: "inline", marginRight: 4 }} />
              예시 curl 복사
            </button>
          </div>
        </div>

        {/* 보안 안내 */}
        <div style={{
          background: "rgba(251,191,36,0.08)", border: "1px solid rgba(251,191,36,0.3)",
          borderRadius: 10, padding: "12px 16px", marginBottom: 20,
          display: "flex", gap: 10, alignItems: "flex-start",
        }}>
          <AlertTriangle size={14} color="#fbbf24" style={{ flexShrink: 0, marginTop: 1 }} />
          <div style={{ fontSize: 12, color: "#92400e", lineHeight: 1.7 }}>
            <strong>API 키는 생성 시 단 한 번만 표시됩니다.</strong> 생성 후 즉시 복사해 안전한 곳에 보관하세요.<br />
            키를 분실한 경우 <strong>기존 키를 삭제하고 새 키를 생성</strong>하면 됩니다.
            비활성화된 키는 다시 활성화하거나 삭제할 수 있습니다.
          </div>
        </div>

        {/* 새 키 생성 */}
        <div style={{
          background: "#ffffff", border: "1px solid #e5e7eb",
          borderRadius: 12, padding: "20px", marginBottom: 20,
        }}>
          <div style={{ fontSize: 13, fontWeight: 700, color: "#111827", marginBottom: 14 }}>
            <Plus size={14} style={{ display: "inline", marginRight: 6, verticalAlign: "middle" }} />
            새 API 키 생성
          </div>
          <form onSubmit={handleCreate} style={{ display: "flex", gap: 10 }}>
            <input
              type="text"
              value={newKeyName}
              onChange={e => setNewKeyName(e.target.value)}
              placeholder="키 이름 (예: 자동화 스크립트, n8n 워크플로우)"
              maxLength={100}
              style={{
                flex: 1, padding: "9px 14px",
                background: "#ffffff", border: "1px solid #e5e7eb",
                borderRadius: 8, fontSize: 13, color: "#111827",
                outline: "none",
              }}
              onFocus={e => (e.target as HTMLElement).style.borderColor = "#6366f1"}
              onBlur={e => (e.target as HTMLElement).style.borderColor = "#e5e7eb"}
            />
            <button
              type="submit"
              disabled={creating}
              style={{
                padding: "9px 20px",
                background: creating ? "#e5e7eb" : "linear-gradient(135deg, #6366f1, #8b5cf6)",
                border: "none", borderRadius: 8,
                fontSize: 13, fontWeight: 700, color: creating ? "#6b7280" : "#fff",
                cursor: creating ? "not-allowed" : "pointer",
                display: "flex", alignItems: "center", gap: 6, flexShrink: 0,
              }}
            >
              {creating ? <Loader2 size={13} style={{ animation: "spin 1s linear infinite" }} /> : <Plus size={13} />}
              생성
            </button>
          </form>
        </div>

        {/* 생성된 키 표시 (1회용) */}
        {createdKey && (
          <div style={{
            background: "rgba(16,185,129,0.08)", border: "1px solid rgba(16,185,129,0.3)",
            borderRadius: 12, padding: "16px 20px", marginBottom: 20,
          }}>
            <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 10 }}>
              <AlertTriangle size={14} color="#fbbf24" />
              <span style={{ fontSize: 13, fontWeight: 700, color: "#fbbf24" }}>
                지금 바로 복사해두세요! 이 키는 다시 표시되지 않습니다.
              </span>
            </div>
            <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
              <code style={{
                flex: 1, padding: "10px 14px",
                background: "#ffffff", border: "1px solid #e5e7eb",
                borderRadius: 8, fontSize: 12, color: "#6366f1",
                fontFamily: "'Fira Code', monospace",
                wordBreak: "break-all",
                display: showCreatedKey ? "block" : "none",
              }}>
                {createdKey}
              </code>
              {!showCreatedKey && (
                <div style={{
                  flex: 1, padding: "10px 14px",
                  background: "#ffffff", border: "1px solid #e5e7eb",
                  borderRadius: 8, fontSize: 12, color: "#6b7280",
                }}>
                  {"•".repeat(48)}
                </div>
              )}
              <div style={{ display: "flex", gap: 6, flexShrink: 0 }}>
                <button
                  onClick={() => setShowCreatedKey(!showCreatedKey)}
                  style={{
                    padding: "8px 10px", background: "#e5e7eb",
                    border: "1px solid #d1d5db", borderRadius: 7,
                    cursor: "pointer", color: "#6b7280",
                  }}
                  title={showCreatedKey ? "숨기기" : "보기"}
                >
                  {showCreatedKey ? <EyeOff size={13} /> : <Eye size={13} />}
                </button>
                <button
                  onClick={() => copyToClipboard(createdKey)}
                  style={{
                    padding: "8px 14px", background: "#10b981",
                    border: "none", borderRadius: 7,
                    cursor: "pointer", color: "#fff",
                    fontSize: 12, fontWeight: 700,
                    display: "flex", alignItems: "center", gap: 5,
                  }}
                >
                  <Copy size={12} /> 복사
                </button>
                <button
                  onClick={() => setCreatedKey(null)}
                  style={{
                    padding: "8px 10px", background: "#e5e7eb",
                    border: "1px solid #d1d5db", borderRadius: 7,
                    cursor: "pointer", color: "#6b7280",
                  }}
                >
                  <XCircle size={13} />
                </button>
              </div>
            </div>
          </div>
        )}

        {/* 키 목록 */}
        <div style={{ background: "#ffffff", border: "1px solid #e5e7eb", borderRadius: 12, overflow: "hidden" }}>
          <div style={{
            padding: "14px 20px",
            borderBottom: "1px solid #e5e7eb",
            fontSize: 13, fontWeight: 700, color: "#6b7280",
          }}>
            발급된 API 키 ({keys?.length ?? 0}개)
          </div>

          {isLoading ? (
            <div style={{ padding: "40px", textAlign: "center", color: "#6b7280" }}>
              <Loader2 size={20} style={{ animation: "spin 1s linear infinite", margin: "0 auto" }} />
            </div>
          ) : !keys || keys.length === 0 ? (
            <div style={{ padding: "40px", textAlign: "center", color: "#6b7280", fontSize: 13 }}>
              발급된 API 키가 없습니다. 위에서 새 키를 생성하세요.
            </div>
          ) : (
            keys.map((key, i) => (
              <div
                key={key.id}
                style={{
                  padding: "14px 20px",
                  borderBottom: i < keys.length - 1 ? "1px solid #f3f4f6" : "none",
                  display: "flex", alignItems: "center", gap: 12,
                  opacity: key.active ? 1 : 0.65,
                  background: key.active ? "#fff" : "#fafafa",
                }}
              >
                <div style={{
                  width: 32, height: 32, borderRadius: 8,
                  background: key.active ? "rgba(99,102,241,0.15)" : "#e5e7eb",
                  display: "flex", alignItems: "center", justifyContent: "center",
                  flexShrink: 0,
                }}>
                  <Key size={14} color={key.active ? "#6366f1" : "#9ca3af"} />
                </div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 3 }}>
                    <span style={{ fontSize: 13, fontWeight: 700, color: "#111827" }}>{key.name}</span>
                    {key.active
                      ? <span style={{ fontSize: 10, color: "#10b981", background: "rgba(16,185,129,0.1)", padding: "1px 7px", borderRadius: 10, fontWeight: 700 }}>활성</span>
                      : <span style={{ fontSize: 10, color: "#ef4444", background: "rgba(239,68,68,0.1)", padding: "1px 7px", borderRadius: 10, fontWeight: 700 }}>비활성</span>
                    }
                  </div>
                  <div style={{ fontSize: 11, color: "#6b7280" }}>
                    <code style={{ fontFamily: "'Fira Code', monospace", color: "#6b7280" }}>{key.keyPrefix}••••••••••••••••••••</code>
                    {" · "}생성: {new Date(key.createdAt).toLocaleDateString("ko-KR")}
                    {key.lastUsedAt && ` · 마지막 사용: ${new Date(key.lastUsedAt).toLocaleDateString("ko-KR")}`}
                  </div>
                  {!key.active && (
                    <div style={{ fontSize: 11, color: "#9ca3af", marginTop: 3 }}>
                      키 값은 재확인 불가 — 재활성화하거나 삭제 후 새 키를 생성하세요
                    </div>
                  )}
                </div>

                {/* 액션 버튼 영역 */}
                <div style={{ display: "flex", gap: 6, flexShrink: 0 }}>
                  {key.active ? (
                    // 활성 키: 비활성화 버튼
                    revokeConfirm === key.id ? (
                      <>
                        <button
                          onClick={() => revokeKey.mutate({ id: key.id })}
                          style={{
                            padding: "6px 12px", background: "#f59e0b",
                            border: "none", borderRadius: 6,
                            fontSize: 11, fontWeight: 700, color: "#fff",
                            cursor: "pointer", display: "flex", alignItems: "center", gap: 4,
                          }}
                        >
                          <CheckCircle size={11} /> 비활성화 확인
                        </button>
                        <button
                          onClick={() => setRevokeConfirm(null)}
                          style={{
                            padding: "6px 10px", background: "#e5e7eb",
                            border: "1px solid #d1d5db", borderRadius: 6,
                            fontSize: 11, color: "#6b7280", cursor: "pointer",
                            display: "flex", alignItems: "center", gap: 4,
                          }}
                        >
                          <XCircle size={11} /> 취소
                        </button>
                      </>
                    ) : (
                      <button
                        onClick={() => setRevokeConfirm(key.id)}
                        style={{
                          padding: "6px 12px", background: "transparent",
                          border: "1px solid #e5e7eb", borderRadius: 6,
                          fontSize: 11, color: "#6b7280", cursor: "pointer",
                          display: "flex", alignItems: "center", gap: 4,
                        }}
                      >
                        <RefreshCw size={11} /> 비활성화
                      </button>
                    )
                  ) : (
                    // 비활성 키: 재활성화 + 삭제 버튼
                    deleteConfirm === key.id ? (
                      <>
                        <button
                          onClick={() => deleteKey.mutate({ id: key.id })}
                          style={{
                            padding: "6px 12px", background: "#e11d48",
                            border: "none", borderRadius: 6,
                            fontSize: 11, fontWeight: 700, color: "#fff",
                            cursor: "pointer", display: "flex", alignItems: "center", gap: 4,
                          }}
                        >
                          <CheckCircle size={11} /> 삭제 확인
                        </button>
                        <button
                          onClick={() => setDeleteConfirm(null)}
                          style={{
                            padding: "6px 10px", background: "#e5e7eb",
                            border: "1px solid #d1d5db", borderRadius: 6,
                            fontSize: 11, color: "#6b7280", cursor: "pointer",
                            display: "flex", alignItems: "center", gap: 4,
                          }}
                        >
                          <XCircle size={11} /> 취소
                        </button>
                      </>
                    ) : (
                      <>
                        <button
                          onClick={() => reactivateKey.mutate({ id: key.id })}
                          style={{
                            padding: "6px 12px", background: "rgba(16,185,129,0.1)",
                            border: "1px solid rgba(16,185,129,0.3)", borderRadius: 6,
                            fontSize: 11, fontWeight: 700, color: "#10b981", cursor: "pointer",
                            display: "flex", alignItems: "center", gap: 4,
                          }}
                        >
                          <RotateCcw size={11} /> 재활성화
                        </button>
                        <button
                          onClick={() => setDeleteConfirm(key.id)}
                          style={{
                            padding: "6px 12px", background: "rgba(239,68,68,0.08)",
                            border: "1px solid rgba(239,68,68,0.25)", borderRadius: 6,
                            fontSize: 11, fontWeight: 700, color: "#ef4444", cursor: "pointer",
                            display: "flex", alignItems: "center", gap: 4,
                          }}
                        >
                          <Trash2 size={11} /> 삭제
                        </button>
                      </>
                    )
                  )}
                </div>
              </div>
            ))
          )}
        </div>

        {/* API 문서 */}
        <div style={{
          background: "#ffffff", border: "1px solid #e5e7eb",
          borderRadius: 12, padding: "20px", marginTop: 20,
        }}>
          <div style={{ fontSize: 13, fontWeight: 700, color: "#111827", marginBottom: 14 }}>API 레퍼런스</div>

          <div style={{ marginBottom: 16 }}>
            <div style={{ fontSize: 11, fontWeight: 700, color: "#6b7280", marginBottom: 8 }}>POST /api/publish — 게시물 발행</div>
            <div style={{ background: "#f9fafb", borderRadius: 8, padding: "12px 16px", fontSize: 11, color: "#6366f1", fontFamily: "'Fira Code', monospace", lineHeight: 1.8 }}>
              <div style={{ color: "#6b7280" }}>// 요청 헤더</div>
              <div>Authorization: Bearer {"<api_key>"}</div>
              <div>Content-Type: application/json</div>
              <br />
              <div style={{ color: "#6b7280" }}>// 요청 바디 (JSON)</div>
              <div>{"{"}</div>
              <div style={{ paddingLeft: 16 }}>
                <div><span style={{ color: "#34d399" }}>"title"</span>: <span style={{ color: "#fbbf24" }}>"글 제목"</span> <span style={{ color: "#6b7280" }}>// 필수</span></div>
                <div><span style={{ color: "#34d399" }}>"content"</span>: <span style={{ color: "#fbbf24" }}>"&lt;p&gt;HTML 본문&lt;/p&gt;"</span> <span style={{ color: "#6b7280" }}>// 필수</span></div>
                <div><span style={{ color: "#34d399" }}>"category"</span>: <span style={{ color: "#fbbf24" }}>"ai-apps"</span> <span style={{ color: "#6b7280" }}>// 필수: ai-apps | ai-tools | my-apps | resources</span></div>
                <div><span style={{ color: "#34d399" }}>"excerpt"</span>: <span style={{ color: "#fbbf24" }}>"요약"</span> <span style={{ color: "#6b7280" }}>// 선택</span></div>
                <div><span style={{ color: "#34d399" }}>"thumbnail"</span>: <span style={{ color: "#fbbf24" }}>"https://..."</span> <span style={{ color: "#6b7280" }}>// 선택</span></div>
                <div><span style={{ color: "#34d399" }}>"coupangKeywords"</span>: <span style={{ color: "#fbbf24" }}>["키워드1"]</span> <span style={{ color: "#6b7280" }}>// 선택</span></div>
              </div>
              <div>{"}"}</div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
