import React, { useState, useEffect, useMemo, useRef, useCallback } from "react";
import { trpc } from "@/lib/trpc";
import { useAuth } from "@/_core/hooks/useAuth";
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

export function AutomationTab() {
  const { user } = useAuth();
  const utils = trpc.useUtils();

  // API 키 목록
  const { data: apiKeysList, refetch: refetchKeys } = trpc.apiKeys.list.useQuery();
  const createKeyMutation = trpc.apiKeys.create.useMutation({
    onSuccess: (data) => {
      setNewKeyRaw(data.raw);
      setNewKeyName("");
      refetchKeys();
      toast.success("API 키가 생성되었습니다. 지금 바로 복사하세요 — 다시 확인할 수 없습니다.");
    },
    onError: () => toast.error("API 키 생성에 실패했습니다."),
  });
  const revokeKeyMutation = trpc.apiKeys.revoke.useMutation({
    onSuccess: () => { refetchKeys(); toast.success("API 키가 비활성화되었습니다."); },
    onError: () => toast.error("API 키 비활성화에 실패했습니다."),
  });

  // 발행 로그
  const { data: publishLogsList, isLoading: logsLoading } = trpc.admin.getPublishLogs.useQuery({ limit: 100 });

  // 예약 발행 수동 실행
  const runScheduled = trpc.admin.runScheduledPublish.useMutation({
    onSuccess: (d) => toast.success(`예약 발행 처리 완료: ${d.published}개 글이 발행되었습니다.`),
    onError: (e) => toast.error("예약 발행 처리 실패: " + e.message),
  });

  // 테스트 전송 상태
  const [testTitle, setTestTitle] = useState("");
  const [testContent, setTestContent] = useState("");
  const [testCategory, setTestCategory] = useState("");
  const [testApiKey, setTestApiKey] = useState("");
  const [testResult, setTestResult] = useState<{ ok: boolean; message: string; postId?: number } | null>(null);
  const [testLoading, setTestLoading] = useState(false);

  const { data: navItemsForTest } = trpc.admin.getNavItems.useQuery();
  const testCategories = useMemo(() => {
    if (!navItemsForTest) return [];
    return navItemsForTest.map(item => ({
      key: item.path.replace(/.*\/category\//, "").replace(/[/?#].*/, ""),
      label: item.label,
    })).filter(c => c.key);
  }, [navItemsForTest]);

  const handleTestSend = async () => {
    if (!testTitle.trim() || !testContent.trim() || !testCategory || !testApiKey.trim()) {
      toast.error("제목, 내용, 카테고리, API 키를 모두 입력하세요.");
      return;
    }
    setTestLoading(true);
    setTestResult(null);
    try {
      const resp = await fetch(`${siteOrigin}/api/publish`, {
        method: "POST",
        headers: { "Content-Type": "application/json", "Authorization": `Bearer ${testApiKey.trim()}` },
        body: JSON.stringify({ title: testTitle, content: testContent, category: testCategory }),
      });
      const json = await resp.json();
      setTestResult({ ok: json.ok, message: json.message || (json.ok ? "발행 성공!" : "발행 실패"), postId: json.postId });
      if (json.ok) toast.success("테스트 발행 성공!");
      else toast.error("테스트 발행 실패: " + (json.error || json.message));
    } catch (e) {
      setTestResult({ ok: false, message: "네트워크 오류가 발생했습니다." });
      toast.error("테스트 전송 중 오류가 발생했습니다.");
    } finally {
      setTestLoading(false);
    }
  };

  // 로그 필터
  const [logFilter, setLogFilter] = useState<"all" | "published" | "scheduled" | "draft">("all");
  const filteredLogs = useMemo(() => {
    if (!publishLogsList) return [];
    if (logFilter === "all") return publishLogsList;
    return publishLogsList.filter(l => l.status === logFilter);
  }, [publishLogsList, logFilter]);

  const [newKeyName, setNewKeyName] = useState("");
  const [newKeyRaw, setNewKeyRaw] = useState<string | null>(null);

  const siteOrigin = typeof window !== "undefined" ? window.location.origin : "https://vibecraftx.com";

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text).then(() => toast.success("클립보드에 복사되었습니다."));
  };

  const statusLabel = (s: string) => {
    if (s === "published") return { text: "발행됨", color: "#10b981" };
    if (s === "scheduled") return { text: "예약됨", color: "#f59e0b" };
    return { text: "임시저장", color: "#6b7280" };
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 24 }}>

      {/* ── API 키 관리 ─────────────────────────────────────────── */}
      <div style={cardStyle}>
        <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 16 }}>
          <Key size={16} color="#6366f1" />
          <span style={{ fontSize: 15, fontWeight: 700, color: "#111827" }}>API 키 관리</span>
        </div>
        <p style={{ fontSize: 13, color: "#6b7280", marginBottom: 16, lineHeight: 1.6 }}>
          자동화 프로그램이 블로그에 글을 업로드할 때 사용하는 API 키입니다.
          키는 생성 시 한 번만 표시되므로 즉시 복사해 두세요.
        </p>

        {/* 새 키 생성 */}
        <div style={{ display: "flex", gap: 8, marginBottom: 16 }}>
          <input
            value={newKeyName}
            onChange={e => setNewKeyName(e.target.value)}
            placeholder="키 이름 (예: 블로그 자동화 봇)"
            style={{ ...inputStyle, flex: 1, padding: "8px 12px" }}
            onKeyDown={e => e.key === "Enter" && newKeyName.trim() && createKeyMutation.mutate({ name: newKeyName.trim() })}
          />
          <Button
            onClick={() => newKeyName.trim() && createKeyMutation.mutate({ name: newKeyName.trim() })}
            disabled={!newKeyName.trim() || createKeyMutation.isPending}
            style={{ background: "linear-gradient(135deg, #6366f1, #8b5cf6)", color: "#fff", fontSize: 13 }}
          >
            <Plus size={14} style={{ marginRight: 4 }} />
            {createKeyMutation.isPending ? "생성 중..." : "키 생성"}
          </Button>
        </div>

        {/* 새로 생성된 키 표시 */}
        {newKeyRaw && (
          <div style={{
            background: "#fef3c7", border: "1px solid #f59e0b", borderRadius: 8,
            padding: "12px 16px", marginBottom: 16,
          }}>
            <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 8 }}>
              <AlertCircle size={14} color="#d97706" />
              <span style={{ fontSize: 12, fontWeight: 700, color: "#d97706" }}>
                이 키는 지금만 표시됩니다. 반드시 복사해 두세요!
              </span>
            </div>
            <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
              <code style={{
                flex: 1, background: "#fff", border: "1px solid #fcd34d",
                borderRadius: 6, padding: "8px 12px", fontSize: 12,
                fontFamily: "monospace", wordBreak: "break-all", color: "#92400e",
              }}>{newKeyRaw}</code>
              <Button
                variant="outline"
                size="sm"
                onClick={() => copyToClipboard(newKeyRaw)}
                style={{ flexShrink: 0 }}
              >
                <Copy size={13} style={{ marginRight: 4 }} />복사
              </Button>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setNewKeyRaw(null)}
                style={{ flexShrink: 0, color: "#6b7280" }}
              >
                <X size={13} />
              </Button>
            </div>
          </div>
        )}

        {/* 키 목록 */}
        {!apiKeysList || apiKeysList.length === 0 ? (
          <div style={{ textAlign: "center", padding: "24px 0", color: "#9ca3af", fontSize: 13 }}>
            등록된 API 키가 없습니다.
          </div>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            {apiKeysList.map(key => (
              <div key={key.id} style={{
                display: "flex", alignItems: "center", gap: 12,
                padding: "10px 14px", background: "#f9fafb",
                border: "1px solid #e5e7eb", borderRadius: 8,
              }}>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                    <span style={{ fontSize: 13, fontWeight: 600, color: "#111827" }}>{key.name}</span>
                    <span style={{
                      fontSize: 10, padding: "1px 6px", borderRadius: 10,
                      background: key.active ? "#d1fae5" : "#fee2e2",
                      color: key.active ? "#065f46" : "#991b1b",
                      fontWeight: 600,
                    }}>{key.active ? "활성" : "비활성"}</span>
                  </div>
                  <div style={{ fontSize: 11, color: "#9ca3af", marginTop: 2 }}>
                    접두사: <code style={{ fontFamily: "monospace" }}>{key.keyPrefix}…</code>
                    {key.lastUsedAt && <span style={{ marginLeft: 8 }}>마지막 사용: {new Date(key.lastUsedAt).toLocaleString("ko-KR")}</span>}
                    {!key.lastUsedAt && <span style={{ marginLeft: 8 }}>아직 사용되지 않음</span>}
                  </div>
                </div>
                {key.active && (
                  <button
                    onClick={() => {
                      if (window.confirm(`"${key.name}" 키를 비활성화하시겠습니까?`)) {
                        revokeKeyMutation.mutate({ id: key.id });
                      }
                    }}
                    disabled={revokeKeyMutation.isPending}
                    style={{
                      padding: "5px 10px", borderRadius: 6, border: "1px solid #fca5a5",
                      background: "rgba(254,202,202,0.3)", color: "#dc2626",
                      fontSize: 12, cursor: "pointer", flexShrink: 0,
                    }}
                  >
                    비활성화
                  </button>
                )}
              </div>
            ))}
          </div>
        )}
      </div>

      {/* ── 테스트 전송 ───────────────────────────────────────────────────── */}
      <div style={cardStyle}>
        <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 16 }}>
          <Send size={16} color="#6366f1" />
          <span style={{ fontSize: 15, fontWeight: 700, color: "#111827" }}>API 테스트 전송</span>
          <span style={{ fontSize: 11, color: "#9ca3af" }}>API 키 유효성 검증 및 실제 발행 테스트</span>
        </div>
        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          <div style={{ display: "flex", gap: 8 }}>
            <input
              value={testApiKey}
              onChange={e => setTestApiKey(e.target.value)}
              placeholder="API 키 (sag_...)"
              style={{ ...inputStyle, flex: 1, padding: "8px 12px", fontFamily: "monospace", fontSize: 12 }}
            />
            <select
              value={testCategory}
              onChange={e => setTestCategory(e.target.value)}
              style={{ ...inputStyle, padding: "8px 12px", minWidth: 160 }}
            >
              <option value="">카테고리 선택</option>
              {testCategories.map(c => (
                <option key={c.key} value={c.key}>{c.label}</option>
              ))}
            </select>
          </div>
          <input
            value={testTitle}
            onChange={e => setTestTitle(e.target.value)}
            placeholder="제목 (필수)"
            style={{ ...inputStyle, padding: "8px 12px" }}
          />
          <textarea
            value={testContent}
            onChange={e => setTestContent(e.target.value)}
            placeholder="본문 HTML 또는 텍스트 (필수)"
            rows={4}
            style={{ ...inputStyle, padding: "8px 12px", resize: "vertical", fontFamily: "monospace", fontSize: 12 }}
          />
          <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
            <Button
              onClick={handleTestSend}
              disabled={testLoading}
              style={{ background: "linear-gradient(135deg, #6366f1, #8b5cf6)", color: "#fff", fontSize: 13 }}
            >
              {testLoading ? <><Loader2 size={13} className="animate-spin" style={{ marginRight: 4 }} />전송 중...</> : <><Send size={13} style={{ marginRight: 4 }} />테스트 발행</>}
            </Button>
            {testResult && (
              <div style={{
                fontSize: 12, padding: "6px 12px", borderRadius: 6,
                background: testResult.ok ? "rgba(16,185,129,0.1)" : "rgba(239,68,68,0.1)",
                color: testResult.ok ? "#059669" : "#dc2626",
                border: `1px solid ${testResult.ok ? "#6ee7b7" : "#fca5a5"}`,
              }}>
                {testResult.ok ? "✅" : "❌"} {testResult.message}
                {testResult.postId && (
                  <a href={`/post/${testResult.postId}`} target="_blank" rel="noreferrer"
                    style={{ marginLeft: 8, color: "#6366f1", textDecoration: "underline" }}>
                    글 확인
                  </a>
                )}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* ── 발행 로그 ───────────────────────────────────────────────────── */}
      <div style={cardStyle}>
        <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 12, flexWrap: "wrap" }}>
          <BarChart2 size={16} color="#6366f1" />
          <span style={{ fontSize: 15, fontWeight: 700, color: "#111827" }}>자동 발행 로그</span>
          <span style={{ fontSize: 11, color: "#9ca3af" }}>(최근 100건)</span>
          <div style={{ marginLeft: "auto", display: "flex", gap: 6, flexWrap: "wrap" }}>
            {(["all", "published", "scheduled", "draft"] as const).map(f => (
              <button key={f} onClick={() => setLogFilter(f)} style={{
                padding: "4px 10px", borderRadius: 20, fontSize: 11, cursor: "pointer",
                border: `1px solid ${logFilter === f ? "#6366f1" : "#e5e7eb"}`,
                background: logFilter === f ? "rgba(99,102,241,0.1)" : "#f9fafb",
                color: logFilter === f ? "#6366f1" : "#6b7280", fontWeight: logFilter === f ? 700 : 400,
              }}>
                {f === "all" ? `전체 (${publishLogsList?.length || 0})` :
                 f === "published" ? `발행됨 (${publishLogsList?.filter(l => l.status === "published").length || 0})` :
                 f === "scheduled" ? `예약됨 (${publishLogsList?.filter(l => l.status === "scheduled").length || 0})` :
                 `임시저장 (${publishLogsList?.filter(l => l.status === "draft").length || 0})`}
              </button>
            ))}
            <Button
              onClick={() => runScheduled.mutate()}
              disabled={runScheduled.isPending}
              style={{ padding: "4px 10px", fontSize: 11, background: "#f0fdf4", color: "#16a34a", border: "1px solid #bbf7d0" }}
            >
              {runScheduled.isPending ? <Loader2 size={11} className="animate-spin" /> : "▶"} 예약 발행 실행
            </Button>
          </div>
        </div>

        {logsLoading ? (
          <div style={{ textAlign: "center", padding: "24px 0" }}>
            <Loader2 size={20} color="#6366f1" className="animate-spin" style={{ margin: "0 auto" }} />
          </div>
        ) : filteredLogs.length === 0 ? (
          <div style={{ textAlign: "center", padding: "24px 0", color: "#9ca3af", fontSize: 13 }}>
            {logFilter === "all" ? "자동 발행 기록이 없습니다." : `"필터: ${logFilter}"에 해당하는 로그가 없습니다.`}
          </div>
        ) : (
          <div style={{ overflowX: "auto" }}>
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12 }}>
              <thead>
                <tr style={{ background: "#f9fafb", borderBottom: "1px solid #e5e7eb" }}>
                  <th style={{ padding: "8px 10px", textAlign: "left", color: "#6b7280", fontWeight: 600 }}>제목</th>
                  <th style={{ padding: "8px 10px", textAlign: "left", color: "#6b7280", fontWeight: 600 }}>카테고리</th>
                  <th style={{ padding: "8px 10px", textAlign: "left", color: "#6b7280", fontWeight: 600 }}>상태</th>
                  <th style={{ padding: "8px 10px", textAlign: "left", color: "#6b7280", fontWeight: 600 }}>발행일시</th>
                </tr>
              </thead>
              <tbody>
                {filteredLogs.map(log => {
                  const s = statusLabel(log.status);
                  return (
                    <tr key={log.id} style={{ borderBottom: "1px solid #f3f4f6" }}>
                      <td style={{ padding: "8px 10px", color: "#111827", maxWidth: 240, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                        {log.postId ? (
                          <a href={`/post/${log.postId}`} target="_blank" rel="noreferrer" style={{ color: "#6366f1", textDecoration: "none" }}>
                            {log.title}
                          </a>
                        ) : log.title}
                      </td>
                      <td style={{ padding: "8px 10px", color: "#6b7280" }}>{log.category}</td>
                      <td style={{ padding: "8px 10px" }}>
                        <span style={{
                          fontSize: 11, padding: "2px 8px", borderRadius: 10,
                          background: s.color + "20", color: s.color, fontWeight: 600,
                        }}>{s.text}</span>
                      </td>
                      <td style={{ padding: "8px 10px", color: "#9ca3af" }}>
                        {new Date(log.createdAt).toLocaleString("ko-KR")}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* ── API 레퍼런스 ─────────────────────────────────────────── */}
      <div style={cardStyle}>
        <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 16 }}>
          <BookOpen size={16} color="#6366f1" />
          <span style={{ fontSize: 15, fontWeight: 700, color: "#111827" }}>API 레퍼런스</span>
        </div>

        <p style={{ fontSize: 13, color: "#6b7280", marginBottom: 20, lineHeight: 1.6 }}>
          자동화 프로그램에서 아래 REST API를 호출하여 블로그 글을 자동으로 업로드할 수 있습니다.
          모든 요청에는 <code style={{ background: "#f3f4f6", padding: "1px 5px", borderRadius: 4 }}>Authorization: Bearer &lt;API_KEY&gt;</code> 헤더가 필요합니다.
        </p>

        {/* 엔드포인트 목록 */}
        {[
          {
            method: "GET", path: "/api/publish/ping",
            desc: "API 키 유효성 확인 및 사용 가능한 카테고리 목록 조회",
            response: `{ ok: true, user: { id, name }, categories: ["ai-apps", ...] }`,
          },
          {
            method: "GET", path: "/api/publish/categories",
            desc: "인증 없이 사용 가능한 카테고리 목록 조회",
            response: `{ ok: true, categories: ["ai-apps", "my-apps", "ai-tools", "resources"] }`,
          },
          {
            method: "GET", path: "/api/publish/logs",
            desc: "내 API 키로 발행된 최근 50건 로그 조회",
            response: `{ ok: true, logs: [{ id, title, category, status, createdAt, ... }] }`,
          },
          {
            method: "POST", path: "/api/publish",
            desc: "게시물 발행 (즉시 또는 예약)",
            response: `{ ok: true, postId, status, scheduledAt, message }`,
          },
        ].map(ep => (
          <div key={ep.path} style={{
            marginBottom: 16, border: "1px solid #e5e7eb", borderRadius: 8, overflow: "hidden",
          }}>
            <div style={{
              display: "flex", alignItems: "center", gap: 10,
              padding: "10px 14px", background: "#f9fafb", borderBottom: "1px solid #e5e7eb",
            }}>
              <span style={{
                fontSize: 11, fontWeight: 700, padding: "2px 8px", borderRadius: 6,
                background: ep.method === "POST" ? "#dbeafe" : "#d1fae5",
                color: ep.method === "POST" ? "#1d4ed8" : "#065f46",
              }}>{ep.method}</span>
              <code style={{ fontSize: 13, color: "#111827", fontFamily: "monospace" }}>{siteOrigin}{ep.path}</code>
              <button
                onClick={() => copyToClipboard(`${siteOrigin}${ep.path}`)}
                style={{ marginLeft: "auto", background: "none", border: "none", cursor: "pointer", color: "#9ca3af" }}
              >
                <Copy size={13} />
              </button>
            </div>
            <div style={{ padding: "10px 14px" }}>
              <p style={{ fontSize: 12, color: "#6b7280", margin: "0 0 8px" }}>{ep.desc}</p>
              <code style={{
                display: "block", fontSize: 11, background: "#f8fafc",
                border: "1px solid #e2e8f0", borderRadius: 6, padding: "8px 12px",
                fontFamily: "monospace", color: "#475569", whiteSpace: "pre-wrap",
              }}>{ep.response}</code>
            </div>
          </div>
        ))}

        {/* POST /api/publish 요청 바디 상세 */}
        <div style={{ marginTop: 8, border: "1px solid #e5e7eb", borderRadius: 8, overflow: "hidden" }}>
          <div style={{ padding: "10px 14px", background: "#f9fafb", borderBottom: "1px solid #e5e7eb" }}>
            <span style={{ fontSize: 13, fontWeight: 700, color: "#111827" }}>POST /api/publish — 요청 바디 파라미터</span>
          </div>
          <div style={{ padding: "14px" }}>
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12 }}>
              <thead>
                <tr style={{ borderBottom: "1px solid #e5e7eb" }}>
                  <th style={{ padding: "6px 8px", textAlign: "left", color: "#6b7280" }}>필드</th>
                  <th style={{ padding: "6px 8px", textAlign: "left", color: "#6b7280" }}>타입</th>
                  <th style={{ padding: "6px 8px", textAlign: "left", color: "#6b7280" }}>필수</th>
                  <th style={{ padding: "6px 8px", textAlign: "left", color: "#6b7280" }}>설명</th>
                </tr>
              </thead>
              <tbody>
                {[
                  { field: "title", type: "string", required: "✅", desc: "게시물 제목 (최대 200자)" },
                  { field: "content", type: "string (HTML)", required: "✅", desc: "게시물 본문 HTML" },
                  { field: "category", type: "string", required: "✅", desc: "카테고리 키 (예: ai-apps)" },
                  { field: "excerpt", type: "string", required: "❌", desc: "요약문 (미입력 시 본문 앞 120자 자동 생성)" },
                  { field: "thumbnail", type: "string (URL)", required: "❌", desc: "썸네일 이미지 URL (미입력 시 본문 첫 이미지 자동 추출)" },
                  { field: "tag", type: "string", required: "❌", desc: "태그 (최대 50자)" },
                  { field: "badge", type: "string", required: "❌", desc: "배지 텍스트 (최대 30자, 예: NEW)" },
                  { field: "published", type: "boolean", required: "❌", desc: "발행 여부 (기본값: true)" },
                  { field: "scheduledAt", type: "string (ISO 8601)", required: "❌", desc: "예약 발행 시각 (예: 2026-05-15T09:00:00Z), 미래 시각이면 자동 예약" },
                ].map(row => (
                  <tr key={row.field} style={{ borderBottom: "1px solid #f3f4f6" }}>
                    <td style={{ padding: "6px 8px" }}>
                      <code style={{ fontFamily: "monospace", color: "#6366f1" }}>{row.field}</code>
                    </td>
                    <td style={{ padding: "6px 8px", color: "#6b7280" }}>{row.type}</td>
                    <td style={{ padding: "6px 8px", textAlign: "center" }}>{row.required}</td>
                    <td style={{ padding: "6px 8px", color: "#374151" }}>{row.desc}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        {/* 예시 코드 */}
        <div style={{ marginTop: 16 }}>
          <div style={{ fontSize: 13, fontWeight: 600, color: "#374151", marginBottom: 8 }}>Python 예시 코드</div>
          <div style={{ position: "relative" }}>
            <pre style={{
              background: "#1e293b", color: "#e2e8f0", borderRadius: 8,
              padding: "16px", fontSize: 12, overflowX: "auto",
              fontFamily: "monospace", lineHeight: 1.6, margin: 0,
            }}>{`import requests

API_KEY = "sag_your_api_key_here"
BASE_URL = "${siteOrigin}"

headers = {
    "Authorization": f"Bearer {API_KEY}",
    "Content-Type": "application/json",
}

# 카테고리 목록 확인
resp = requests.get(f"{BASE_URL}/api/publish/categories")
print(resp.json())  # {"ok": true, "categories": [...]}

# 게시물 즉시 발행
payload = {
    "title": "AI 자동화 블로그 포스트",
    "content": "<p>본문 내용입니다.</p>",
    "category": "ai-apps",
    "excerpt": "요약문",
    "tag": "AI,자동화",
}
resp = requests.post(f"{BASE_URL}/api/publish", json=payload, headers=headers)
print(resp.json())  # {"ok": true, "postId": 123, "status": "published", ...}

# 예약 발행
payload["scheduledAt"] = "2026-05-15T09:00:00Z"
resp = requests.post(f"{BASE_URL}/api/publish", json=payload, headers=headers)
print(resp.json())  # {"ok": true, "status": "scheduled", ...}`}</pre>
            <button
              onClick={() => copyToClipboard(`import requests\n\nAPI_KEY = "sag_your_api_key_here"\nBASE_URL = "${siteOrigin}"\n\nheaders = {\n    "Authorization": f"Bearer {API_KEY}",\n    "Content-Type": "application/json",\n}\n\nresp = requests.get(f"{BASE_URL}/api/publish/categories")\nprint(resp.json())\n\npayload = {\n    "title": "AI 자동화 블로그 포스트",\n    "content": "<p>본문 내용입니다.</p>",\n    "category": "ai-apps",\n}\nresp = requests.post(f"{BASE_URL}/api/publish", json=payload, headers=headers)\nprint(resp.json())`)}
              style={{
                position: "absolute", top: 8, right: 8,
                background: "rgba(255,255,255,0.1)", border: "1px solid rgba(255,255,255,0.2)",
                borderRadius: 6, padding: "4px 8px", color: "#e2e8f0",
                fontSize: 11, cursor: "pointer", display: "flex", alignItems: "center", gap: 4,
              }}
            >
              <Copy size={11} />복사
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}


