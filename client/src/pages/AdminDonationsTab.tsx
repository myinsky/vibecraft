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

export function DonationsTab() {
  const utils = trpc.useUtils();
  const { data: settings, isLoading: settingsLoading } = trpc.donations.getSettings.useQuery();
  const { data: listData, isLoading: listLoading, refetch } = trpc.donations.list.useQuery({ limit: 100, offset: 0 });
  const updateSettings = trpc.donations.updateSettings.useMutation({
    onSuccess: () => { adminSave.success("후원 설정이 저장되었습니다."); utils.donations.getSettings.invalidate(); },
    onError: (e) => toast.error(e.message),
  });
  const confirmMut = trpc.donations.confirm.useMutation({
    onSuccess: () => { toast.success("확인 처리되었습니다."); refetch(); },
    onError: (e) => toast.error(e.message),
  });
  const deleteMut = trpc.donations.delete.useMutation({
    onSuccess: () => { toast.success("삭제되었습니다."); refetch(); },
    onError: (e) => toast.error(e.message),
  });

  // 설정 폼 상태
  const [form, setForm] = useState({
    enabled: false,
    bankName: "",
    accountNumber: "",
    accountHolder: "",
    description: "",
    kakaoId: "",
  });
  const [formInit, setFormInit] = useState(false);

  useEffect(() => {
    if (settings && !formInit) {
      setForm({
        enabled: settings.enabled,
        bankName: settings.bankName,
        accountNumber: settings.accountNumber,
        accountHolder: settings.accountHolder,
        description: settings.description,
        kakaoId: settings.kakaoId,
      });
      setFormInit(true);
    }
  }, [settings, formInit]);

  const handleSaveSettings = () => {
    updateSettings.mutate(form);
  };

  const totalConfirmed = (listData?.items ?? []).filter(d => d.confirmed).reduce((s, d) => s + d.amount, 0);
  const totalAll = (listData?.items ?? []).reduce((s, d) => s + d.amount, 0);

  if (settingsLoading || listLoading) return (
    <div style={{ display: "flex", alignItems: "center", justifyContent: "center", padding: 60 }}>
      <Loader2 size={24} color="#6366f1" className="animate-spin" />
    </div>
  );

  return (
    <div style={{ maxWidth: 900, margin: "0 auto" }}>
      {/* 설정 카드 */}
      <div style={{ ...cardStyle, marginBottom: 16 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 16 }}>
          <Coffee size={18} color="#d97706" />
          <span style={{ fontSize: 15, fontWeight: 700, color: "#111827" }}>후원하기 설정</span>
        </div>

        {/* 표시 여부 토글 */}
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "12px 0", borderBottom: "1px solid #f3f4f6", marginBottom: 14 }}>
          <div>
            <div style={{ fontSize: 13, fontWeight: 600, color: "#374151" }}>후원하기 표시</div>
            <div style={{ fontSize: 11, color: "#9ca3af" }}>비활성화 시 푸터에서 후원하기 버튼이 숨겨집니다</div>
          </div>
          <button
            onClick={() => setForm(f => ({ ...f, enabled: !f.enabled }))}
            style={{
              width: 44, height: 24, borderRadius: 12, border: "none", cursor: "pointer",
              background: form.enabled ? "#f59e0b" : "#d1d5db",
              position: "relative", transition: "background 0.2s",
            }}
          >
            <span style={{ position: "absolute", top: 2, left: form.enabled ? 22 : 2, width: 20, height: 20, borderRadius: "50%", background: "#fff", transition: "left 0.2s", boxShadow: "0 1px 3px rgba(0,0,0,0.2)" }} />
          </button>
        </div>

        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
          <div>
            <label style={{ ...labelStyle, marginBottom: 4 }}>은행명</label>
            <input value={form.bankName} onChange={e => setForm(f => ({ ...f, bankName: e.target.value }))} placeholder="예: 카카오뱅크" style={inputStyle} />
          </div>
          <div>
            <label style={{ ...labelStyle, marginBottom: 4 }}>계좌번호</label>
            <input value={form.accountNumber} onChange={e => setForm(f => ({ ...f, accountNumber: e.target.value }))} placeholder="예: 3333-01-1234567" style={inputStyle} />
          </div>
          <div>
            <label style={{ ...labelStyle, marginBottom: 4 }}>예금주</label>
            <input value={form.accountHolder} onChange={e => setForm(f => ({ ...f, accountHolder: e.target.value }))} placeholder="예금주 이름" style={inputStyle} />
          </div>
          <div>
            <label style={{ ...labelStyle, marginBottom: 4 }}>카카오페이 ID (선택)</label>
            <input value={form.kakaoId} onChange={e => setForm(f => ({ ...f, kakaoId: e.target.value }))} placeholder="카카오페이 아이디" style={inputStyle} />
          </div>
          <div style={{ gridColumn: "1 / -1" }}>
            <label style={{ ...labelStyle, marginBottom: 4 }}>후원 설명 문구</label>
            <input value={form.description} onChange={e => setForm(f => ({ ...f, description: e.target.value }))} placeholder="블로그 운영에 힘이 됩니다 ☕" style={inputStyle} />
          </div>
        </div>

        <button
          onClick={handleSaveSettings}
          disabled={updateSettings.isPending}
          style={{
            marginTop: 14, padding: "9px 20px",
            background: updateSettings.isPending ? "#d1d5db" : "#f59e0b",
            border: "none", borderRadius: 8, color: "#fff",
            fontSize: 13, fontWeight: 700, cursor: "pointer",
            display: "flex", alignItems: "center", gap: 6,
          }}
        >
          <Save size={14} /> {updateSettings.isPending ? "저장 중..." : "설정 저장"}
        </button>
      </div>

      {/* 통계 카드 */}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 12, marginBottom: 16 }}>
        {[
          { label: "전체 후원 건수", value: `${listData?.total ?? 0}건`, color: "#6366f1" },
          { label: "확인된 후원 합계", value: `${totalConfirmed.toLocaleString()}원`, color: "#059669" },
          { label: "미확인 포함 합계", value: `${totalAll.toLocaleString()}원`, color: "#d97706" },
        ].map(stat => (
          <div key={stat.label} style={{ ...cardStyle, marginBottom: 0, textAlign: "center" }}>
            <div style={{ fontSize: 11, color: "#6b7280", marginBottom: 4 }}>{stat.label}</div>
            <div style={{ fontSize: 18, fontWeight: 800, color: stat.color }}>{stat.value}</div>
          </div>
        ))}
      </div>

      {/* 후원 목록 */}
      <div style={cardStyle}>
        <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 14 }}>
          <Heart size={16} color="#d97706" />
          <span style={{ fontSize: 14, fontWeight: 700, color: "#111827" }}>후원 내역</span>
          <span style={{ fontSize: 11, color: "#9ca3af" }}>총 {listData?.total ?? 0}건</span>
        </div>

        {(listData?.items ?? []).length === 0 ? (
          <div style={{ textAlign: "center", padding: 40, color: "#9ca3af", fontSize: 13 }}>
            아직 후원 내역이 없습니다.
          </div>
        ) : (
          <div style={{ overflowX: "auto" }}>
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12 }}>
              <thead>
                <tr style={{ background: "#f9fafb" }}>
                  {["#", "후원자명", "금액", "메시지", "상태", "등록일", "관리"].map(h => (
                    <th key={h} style={{ padding: "8px 10px", textAlign: "left", fontWeight: 600, color: "#6b7280", borderBottom: "1px solid #e5e7eb" }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {(listData?.items ?? []).map((d, i) => (
                  <tr key={d.id} style={{ borderBottom: "1px solid #f3f4f6", background: d.confirmed ? "#f0fdf4" : "#fff" }}>
                    <td style={{ padding: "8px 10px", color: "#9ca3af" }}>{i + 1}</td>
                    <td style={{ padding: "8px 10px", fontWeight: 600, color: "#111827" }}>{d.donorName}</td>
                    <td style={{ padding: "8px 10px", fontWeight: 700, color: "#d97706" }}>{d.amount.toLocaleString()}원</td>
                    <td style={{ padding: "8px 10px", color: "#6b7280", maxWidth: 200, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{d.message || "-"}</td>
                    <td style={{ padding: "8px 10px" }}>
                      {d.confirmed ? (
                        <span style={{ display: "inline-flex", alignItems: "center", gap: 3, background: "#d1fae5", color: "#065f46", borderRadius: 4, padding: "2px 8px", fontSize: 11, fontWeight: 600 }}>
                          <CheckCircle size={11} /> 확인됨
                        </span>
                      ) : (
                        <span style={{ display: "inline-flex", alignItems: "center", gap: 3, background: "#fef3c7", color: "#92400e", borderRadius: 4, padding: "2px 8px", fontSize: 11, fontWeight: 600 }}>
                          <XCircle size={11} /> 미확인
                        </span>
                      )}
                    </td>
                    <td style={{ padding: "8px 10px", color: "#9ca3af" }}>{new Date(d.createdAt).toLocaleDateString("ko-KR")}</td>
                    <td style={{ padding: "8px 10px" }}>
                      <div style={{ display: "flex", gap: 4 }}>
                        {!d.confirmed && (
                          <button
                            onClick={() => confirmMut.mutate({ id: d.id })}
                            disabled={confirmMut.isPending}
                            style={{ padding: "3px 8px", background: "#d1fae5", border: "none", borderRadius: 4, color: "#065f46", fontSize: 11, cursor: "pointer", fontWeight: 600 }}
                          >
                            확인
                          </button>
                        )}
                        <button
                          onClick={() => { if (confirm("삭제하시겠습니까?")) deleteMut.mutate({ id: d.id }); }}
                          disabled={deleteMut.isPending}
                          style={{ padding: "3px 8px", background: "#fee2e2", border: "none", borderRadius: 4, color: "#dc2626", fontSize: 11, cursor: "pointer", fontWeight: 600 }}
                        >
                          삭제
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}

