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

export function PolicyTab() {
  type PolicySlug = "privacy" | "terms";
  const [activePolicy, setActivePolicy] = useState<PolicySlug>("privacy");

  const POLICY_META: Record<PolicySlug, { label: string; defaultTitle: string; defaultContent: string }> = {
    privacy: {
      label: "개인정보처리방침",
      defaultTitle: "개인정보처리방침",
      defaultContent: `# 개인정보처리방침

## 1. 개인정보의 처리 목적

본 사이트는 다음의 목적을 위하여 개인정보를 처리합니다.

- 서비스 제공 및 운영
- 회원 관리 및 본인 확인
- 서비스 개선 및 신규 서비스 개발

## 2. 개인정보의 처리 및 보유 기간

회원 탈퇴 시까지 또는 법령에서 정한 보유 기간까지 보유합니다.

## 3. 개인정보의 제3자 제공

원칙적으로 이용자의 개인정보를 제3자에게 제공하지 않습니다.

## 4. 개인정보 보호책임자

- 이름: 관리자
- 이메일: admin@example.com

*최종 수정일: ${new Date().toLocaleDateString("ko-KR")}*`,
    },
    terms: {
      label: "이용약관",
      defaultTitle: "이용약관",
      defaultContent: `# 이용약관

## 제1조 (목적)

본 약관은 본 사이트가 제공하는 서비스의 이용 조건 및 절차, 이용자와 사이트의 권리, 의무, 책임 사항을 규정함을 목적으로 합니다.

## 제2조 (서비스 이용)

이용자는 본 약관에 동의함으로써 서비스를 이용할 수 있습니다.

## 제3조 (금지 행위)

다음 행위는 금지됩니다.

- 타인의 정보 도용
- 서비스 운영 방해
- 불법 콘텐츠 게시

## 제4조 (면책 조항)

사이트는 천재지변 또는 이에 준하는 불가항력으로 인하여 서비스를 제공할 수 없는 경우 책임이 면제됩니다.

*최종 수정일: ${new Date().toLocaleDateString("ko-KR")}*`,
    },
  };

  const { data, refetch } = trpc.admin.getLegalPage.useQuery({ slug: activePolicy });
  const upsert = trpc.admin.upsertLegalPage.useMutation({
    onSuccess: () => { adminSave.success("저장되었습니다."); refetch(); },
    onError: (e) => toast.error(e.message),
  });

  const meta = POLICY_META[activePolicy];
  const [title, setTitle] = useState("");
  const [content, setContent] = useState("");
  const [preview, setPreview] = useState(false);

  // 데이터 로드 시 폼 초기화
  useEffect(() => {
    setTitle(data?.title ?? meta.defaultTitle);
    setContent(data?.content ?? meta.defaultContent);
  }, [data, activePolicy]);

  const handleSave = () => {
    if (!title.trim()) { toast.error("제목을 입력해 주세요."); return; }
    window.dispatchEvent(new CustomEvent("admin-save-start"));
    upsert.mutate({ slug: activePolicy, title: title.trim(), content });
  };
  // 플로팅 버튼 이벤트 리스너
  useEffect(() => {
    const handler = () => handleSave();
    window.addEventListener("admin-save-request", handler);
    return () => window.removeEventListener("admin-save-request", handler);
  }, [title, content, activePolicy]);

  return (
    <div>
      {/* 안내 */}
      <div style={{ ...cardStyle, borderLeft: "4px solid #6366f1", marginBottom: 16 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 6 }}>
          <Globe size={15} color="#6366f1" />
          <span style={{ fontSize: 13, fontWeight: 700, color: "#6366f1" }}>정책 페이지 편집</span>
        </div>
        <p style={{ fontSize: 12, color: "#6b7280", margin: 0 }}>
          마크다운 형식으로 작성하면 <strong>/privacy</strong>, <strong>/terms</strong> 페이지에 자동으로 반영됩니다.
          저장 후 링크를 클릭하여 결과를 확인하세요.
        </p>
      </div>

      {/* 정책 선택 탭 */}
      <div style={{ display: "flex", gap: 8, marginBottom: 16 }}>
        {(["privacy", "terms"] as PolicySlug[]).map(slug => (
          <button
            key={slug}
            onClick={() => { setActivePolicy(slug); setPreview(false); }}
            style={{
              padding: "8px 20px", borderRadius: 8, border: "none", cursor: "pointer",
              fontSize: 13, fontWeight: activePolicy === slug ? 700 : 500,
              background: activePolicy === slug ? "linear-gradient(135deg, #6366f1, #8b5cf6)" : "#f3f4f6",
              color: activePolicy === slug ? "#fff" : "#6b7280",
              transition: "all 0.15s",
            }}
          >
            {POLICY_META[slug].label}
          </button>
        ))}
        <div style={{ flex: 1 }} />
        <a
          href={`/${activePolicy}`}
          target="_blank"
          rel="noopener noreferrer"
          style={{
            display: "inline-flex", alignItems: "center", gap: 4,
            padding: "8px 14px", borderRadius: 8, fontSize: 12, color: "#6366f1",
            border: "1px solid #6366f1", textDecoration: "none", background: "#fff",
          }}
        >
          <ExternalLink size={12} />
          페이지 보기
        </a>
      </div>

      {/* 편집 카드 */}
      <div style={cardStyle}>
        {/* 제목 */}
        <div style={{ marginBottom: 14 }}>
          <label style={labelStyle}>페이지 제목</label>
          <Input
            value={title}
            onChange={e => setTitle(e.target.value)}
            placeholder={meta.defaultTitle}
            style={{ ...inputStyle, fontSize: 14, fontWeight: 600 }}
          />
        </div>

        {/* 에디터 / 미리보기 전환 */}
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 8 }}>
          <label style={labelStyle}>내용 (마크다운)</label>
          <button
            onClick={() => setPreview(p => !p)}
            style={{
              padding: "4px 12px", borderRadius: 6, border: "1px solid #d1d5db",
              background: preview ? "#6366f1" : "#f9fafb",
              color: preview ? "#fff" : "#6b7280",
              fontSize: 11, fontWeight: 600, cursor: "pointer",
            }}
          >
            {preview ? "에디터로 돌아가기" : "미리보기"}
          </button>
        </div>

        {preview ? (
          <div
            style={{
              minHeight: 400, padding: 20, borderRadius: 8, border: "1px solid #e5e7eb",
              background: "#f9fafb", fontSize: 14, lineHeight: 1.8, color: "#374151",
            }}
            className="policy-preview"
          >
            {/* 미리보기는 간단한 마크다운 렌더링 */}
            <div dangerouslySetInnerHTML={{ __html: renderSimpleMarkdown(content) }} />
          </div>
        ) : (
          <textarea
            value={content}
            onChange={e => setContent(e.target.value)}
            placeholder="마크다운 형식으로 내용을 작성하세요..."
            style={{
              width: "100%", minHeight: 400, padding: "12px 14px",
              border: "1px solid #d1d5db", borderRadius: 8,
              background: "#ffffff", color: "#111827",
              fontSize: 13, fontFamily: "'Courier New', monospace",
              lineHeight: 1.7, resize: "vertical", boxSizing: "border-box",
            }}
          />
        )}

        {/* 저장 버튼 */}
        <div style={{ display: "flex", justifyContent: "flex-end", marginTop: 14, gap: 8 }}>
          <button
            onClick={() => { setTitle(meta.defaultTitle); setContent(meta.defaultContent); }}
            style={{
              padding: "8px 16px", borderRadius: 8, border: "1px solid #d1d5db",
              background: "#f9fafb", color: "#6b7280", fontSize: 13, cursor: "pointer",
            }}
          >
            기본값으로 초기화
          </button>
          <Button
            onClick={handleSave}
            disabled={upsert.isPending}
            style={{ background: "linear-gradient(135deg, #6366f1, #8b5cf6)", color: "#fff", fontSize: 13 }}
          >
            {upsert.isPending ? (
              <><RefreshCw size={13} className="animate-spin" style={{ marginRight: 6 }} />저장 중...</>
            ) : (
              <><Save size={13} style={{ marginRight: 6 }} />저장하기</>
            )}
          </Button>
        </div>
      </div>

      {/* 미리보기 스타일 */}
      <style>{`
        .policy-preview h1 { font-size: 20px; font-weight: 700; color: #111827; margin: 0 0 12px; }
        .policy-preview h2 { font-size: 16px; font-weight: 700; color: #1f2937; margin: 20px 0 8px; padding-bottom: 4px; border-bottom: 1px solid #e5e7eb; }
        .policy-preview h3 { font-size: 14px; font-weight: 600; color: #374151; margin: 16px 0 6px; }
        .policy-preview p  { margin: 0 0 10px; }
        .policy-preview ul, .policy-preview ol { padding-left: 18px; margin: 0 0 10px; }
        .policy-preview li { margin-bottom: 4px; }
        .policy-preview strong { font-weight: 600; color: #111827; }
        .policy-preview em { font-style: italic; color: #6b7280; }
        .policy-preview hr { border: none; border-top: 1px solid #e5e7eb; margin: 16px 0; }
        .policy-preview code { background: #f3f4f6; padding: 1px 5px; border-radius: 3px; font-size: 12px; }
      `}</style>
    </div>
  );
}

/** 간단한 마크다운 → HTML 변환 (미리보기 전용) */
function renderSimpleMarkdown(md: string): string {
  return md
    .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
    .replace(/^### (.+)$/gm, "<h3>$1</h3>")
    .replace(/^## (.+)$/gm, "<h2>$1</h2>")
    .replace(/^# (.+)$/gm, "<h1>$1</h1>")
    .replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>")
    .replace(/\*(.+?)\*/g, "<em>$1</em>")
    .replace(/`(.+?)`/g, "<code>$1</code>")
    .replace(/^---$/gm, "<hr>")
    .replace(/^- (.+)$/gm, "<li>$1</li>")
    .replace(/(<li>[\s\S]*?<\/li>)/, "<ul>$1</ul>")
    .replace(/\n\n/g, "</p><p>")
    .replace(/^(?!<[hul]|<hr)(.+)$/gm, "<p>$1</p>")
    .replace(/<p><\/p>/g, "");
}

