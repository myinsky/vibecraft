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

export function SiteConfigTab() {
  const { data: config, refetch } = trpc.admin.getSiteConfig.useQuery();
  const utils = trpc.useUtils();
  const updateConfig = trpc.admin.updateSiteConfig.useMutation({
    onSuccess: () => { adminSave.success("사이트 설정이 저장되었습니다."); refetch(); utils.admin.getHomeInitialData.invalidate(); utils.admin.getSiteConfig.invalidate(); },
    onError: (err) => { toast.error(err.message || "설정 저장 중 오류가 발생했습니다."); },
  });

  const [form, setForm] = useState<Record<string, string>>({});
  useEffect(() => { if (config) setForm({ ...config }); }, [config]);
  // 플로팅 버튼 이벤트 리스너
  useEffect(() => {
    const handler = () => {
      window.dispatchEvent(new CustomEvent("admin-save-start"));
      // null/undefined 값 필터링 (z.record(z.string(), z.string()) 검증 통과)
      const sanitized = Object.fromEntries(
        Object.entries(form).filter(([, v]) => v !== null && v !== undefined)
      ) as Record<string, string>;
      updateConfig.mutate(sanitized);
    };
    window.addEventListener("admin-save-request", handler);
    return () => window.removeEventListener("admin-save-request", handler);
  }, [form]);

  // 단일 컬럼 필드 (긴 내용)
  const singleFields = [
    { key: "siteTitle",        label: "사이트 제목",         placeholder: "Smart Auto Guide",         icon: <Globe size={14} /> },
    { key: "siteDescription",  label: "사이트 설명",         placeholder: "AI 자동화 프로그램 블로그", icon: <FileText size={14} /> },
    { key: "siteSubtitle",     label: "헤더 부제목",         placeholder: "+ Vibe Coding",            icon: <FileText size={14} /> },
    { key: "footerText",       label: "푸터 텍스트",         placeholder: "© 2026 Smart Auto Guide.", icon: <FileText size={14} /> },
  ];
  // 2열 배치 필드 (짧은 내용 쌍) — sectionLabel로 그룹 구분
  const pairFields: Array<{
    sectionLabel?: string;
    pair: [{key:string;label:string;placeholder:string;icon:React.ReactNode;maxLength?:number;isColor?:boolean},{key:string;label:string;placeholder:string;icon:React.ReactNode;maxLength?:number;isColor?:boolean}];
  }> = [
    {
      sectionLabel: "디자인",
      pair: [
        { key: "logoText",         label: "로고 텍스트 (최대 20자)", placeholder: "S",        icon: <Palette size={14} />, maxLength: 20 },
        { key: "themeAccentColor", label: "테마 강조 색상",           placeholder: "#6366f1", icon: <Palette size={14} />, isColor: true },
      ],
    },
    {
      sectionLabel: "연락처",
      pair: [
        { key: "contactEmail", label: "문의 이메일", placeholder: "help@example.com",    icon: <FileText size={14} /> },
        { key: "contactHours", label: "운영시간",     placeholder: "평일 10:00 - 18:00", icon: <FileText size={14} /> },
      ],
    },
    {
      sectionLabel: "정책 페이지 URL",
      pair: [
        { key: "policyPrivacyUrl", label: "개인정보처리방침", placeholder: "/privacy", icon: <Globe size={14} /> },
        { key: "policyTermsUrl",   label: "이용약관",         placeholder: "/terms",   icon: <Globe size={14} /> },
      ],
    },
    {
      pair: [
        { key: "policyAdUrl",      label: "광고 문의 URL",  placeholder: "mailto:ad@example.com",  icon: <Globe size={14} /> },
        { key: "policyPartnerUrl", label: "제휴 문의 URL",  placeholder: "mailto:biz@example.com", icon: <Globe size={14} /> },
      ],
    },
    {
      sectionLabel: "분석 및 사이트",
      pair: [
        { key: "googleAnalyticsId", label: "Google Analytics ID", placeholder: "G-XXXXXXXXXX",        icon: <BarChart2 size={14} /> },
        { key: "siteUrl",           label: "사이트 URL",           placeholder: "https://example.com", icon: <Globe size={14} /> },
      ],
    },
  ];

  const renderField = (field: {key:string;label:string;placeholder:string;icon:React.ReactNode;maxLength?:number;isColor?:boolean}) => (
    <div key={field.key}>
      <label style={{ ...labelStyle, display: "flex", alignItems: "center", gap: 6 }}>
        {field.icon}{field.label}
      </label>
      {field.isColor ? (
        <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
          <input type="color" value={form[field.key] || "#6366f1"} onChange={e => setForm(f => ({ ...f, [field.key]: e.target.value }))} style={{ width: 40, height: 36, borderRadius: 6, border: "none", cursor: "pointer" }} />
          <Input value={form[field.key] || ""} onChange={e => setForm(f => ({ ...f, [field.key]: e.target.value }))} placeholder={field.placeholder} style={{ ...inputStyle, flex: 1 }} />
          <div style={{ width: 36, height: 36, borderRadius: 6, background: form[field.key] || "#6366f1", border: "1px solid #e5e7eb" }} />
        </div>
      ) : (
        <Input value={form[field.key] || ""} onChange={e => setForm(f => ({ ...f, [field.key]: e.target.value }))} placeholder={field.placeholder} style={inputStyle} maxLength={field.maxLength} />
      )}
    </div>
  );

  return (
    <div>
      <div style={cardStyle}>
        <div style={{ fontSize: 13, fontWeight: 700, color: "#6366f1", marginBottom: 16, display: "flex", alignItems: "center", gap: 8 }}>
          <Settings size={15} />사이트 전역 설정
        </div>
        {/* 단일 컬럼 필드 */}
        <div style={{ display: "flex", flexDirection: "column", gap: 14, marginBottom: 14 }}>
          {singleFields.map(renderField)}
        </div>
        {/* 단일 콜럼과 2열 그리드 사이 구분선 */}
        <div style={{ borderTop: "1px solid #e5e7eb", margin: "6px 0 16px" }} />
        {/* 2열 그리드 필드 */}
        <div style={{ display: "flex", flexDirection: "column", gap: 0 }}>
          {pairFields.map(({ sectionLabel, pair }, idx) => (
            <div key={idx}>
              {/* 섹션 시작 시 구분선 + 레이블 */}
              {idx > 0 && (
                <div style={{ display: "flex", alignItems: "center", gap: 8, margin: "14px 0 12px" }}>
                  <div style={{ flex: 1, height: 1, background: "linear-gradient(to right, #e5e7eb, transparent)" }} />
                  {sectionLabel && (
                    <span style={{
                      fontSize: 10,
                      fontWeight: 600,
                      color: "#9ca3af",
                      letterSpacing: "0.08em",
                      textTransform: "uppercase" as const,
                      padding: "0 6px",
                      background: "#fff",
                      whiteSpace: "nowrap" as const,
                    }}>{sectionLabel}</span>
                  )}
                  <div style={{ flex: 1, height: 1, background: "linear-gradient(to left, #e5e7eb, transparent)" }} />
                </div>
              )}
              {/* 첫 번째 섹션은 레이블만 표시 */}
              {idx === 0 && sectionLabel && (
                <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 10 }}>
                  <span style={{
                    fontSize: 10,
                    fontWeight: 600,
                    color: "#9ca3af",
                    letterSpacing: "0.08em",
                    textTransform: "uppercase" as const,
                  }}>{sectionLabel}</span>
                  <div style={{ flex: 1, height: 1, background: "linear-gradient(to right, #e5e7eb, transparent)" }} />
                </div>
              )}
              <div style={{
                display: "grid",
                gridTemplateColumns: "1fr 1fr",
                gap: 12,
                padding: "10px 12px",
                background: idx % 2 === 0 ? "#fafafa" : "#f5f3ff",
                borderRadius: 8,
                border: "1px solid",
                borderColor: idx % 2 === 0 ? "#f3f4f6" : "#ede9fe",
              }}>
                {pair.map(renderField)}
              </div>
            </div>
                    ))}
        </div>
      </div>
      {/* 검색사이트 소유권 확인 관리 */}
      <SearchSiteManageCard form={form} setForm={setForm} />
      {/* 미리보기 */}
      <div style={{ ...cardStyle, background: "#f9fafb" }}>
        <div style={{ fontSize: 12, color: "#6b7280", marginBottom: 10 }}>미리보기:</div>
        <div style={{ background: "#ffffff", borderRadius: 8, padding: "10px 16px", border: "1px solid #e5e7eb", display: "flex", alignItems: "center", gap: 10 }}>
          <div style={{ width: 28, height: 28, borderRadius: 6, background: form.themeAccentColor || "#6366f1", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 13, fontWeight: 800, color: "#fff" }}>
            {(form.logoText || "S").slice(0, 2)}
          </div>
          <div>
            <div style={{ fontSize: 13, fontWeight: 700, color: "#111827" }}>{form.siteTitle || "Smart Auto Guide"}</div>
            <div style={{ fontSize: 11, color: "#6b7280" }}>{form.siteDescription || "AI 자동화 프로그램 블로그"}</div>
          </div>
        </div>
      </div>

      {/* 헤더 공통 스크립트 입력 */}
      <div style={cardStyle}>
        <div style={{ fontSize: 13, fontWeight: 700, color: "#6366f1", marginBottom: 8, display: "flex", alignItems: "center", gap: 8 }}>
          <Monitor size={15} />헤더 공통 스크립트 (&lt;head&gt; 삽입)
        </div>
        <div style={{ fontSize: 12, color: "#6b7280", marginBottom: 10, lineHeight: 1.6 }}>
          입력한 코드는 모든 페이지의 <code style={{ background: "#f3f4f6", padding: "1px 5px", borderRadius: 3, fontSize: 11 }}>&lt;head&gt;</code>에 자동으로 삽입됩니다.<br />
          애드센스 로더 스크립트, Google Analytics, 네이버 서치 콘솔 등을 입력하세요.
        </div>
        <textarea
          value={form["headScripts"] || ""}
          onChange={e => setForm(f => ({ ...f, headScripts: e.target.value }))}
          placeholder={`예시 (애드센스 로더 스크립트):\n<script async src="https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js?client=ca-pub-XXXXXXXX" crossorigin="anonymous"></script>\n\n예시 (네이버 서치 콘솔):\n<meta name="naver-site-verification" content="XXXXXXXX" />`}
          rows={8}
          style={{
            ...inputStyle,
            width: "100%",
            resize: "vertical",
            fontFamily: "'Fira Code', 'Consolas', monospace",
            fontSize: 12,
            lineHeight: 1.6,
            padding: "10px 12px",
          }}
        />
        <div style={{ fontSize: 10, color: "#9ca3af", marginTop: 6 }}>
          ⚠️ 스크립트 코드는 그대로 실행됩니다. 신뢰할 수 있는 서비스의 코드만 입력하세요.
        </div>
      </div>

      {/* 페이지당 글 개수 설정 */}
      <div style={cardStyle}>
        <div style={{ fontSize: 13, fontWeight: 700, color: "#6366f1", marginBottom: 12, display: "flex", alignItems: "center", gap: 8 }}>
          <FileText size={15} />페이지당 글 개수
        </div>
        <div>
          <label style={{ ...labelStyle, marginBottom: 8 }}>카테고리 페이지당 표시 글 개수</label>
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            {["5", "10", "15", "20", "30"].map(n => (
              <button
                key={n}
                type="button"
                onClick={() => setForm(f => ({ ...f, postsPerPage: n }))}
                style={{
                  padding: "6px 18px",
                  borderRadius: 8,
                  border: (form.postsPerPage || "15") === n ? "2px solid #6366f1" : "1px solid #e5e7eb",
                  background: (form.postsPerPage || "15") === n ? "#eef2ff" : "#fff",
                  color: (form.postsPerPage || "15") === n ? "#6366f1" : "#374151",
                  fontWeight: (form.postsPerPage || "15") === n ? 700 : 400,
                  fontSize: 14,
                  cursor: "pointer",
                  transition: "all 0.15s",
                }}
              >{n}개</button>
            ))}
          </div>
          <div style={{ fontSize: 11, color: "#6b7280", marginTop: 8 }}>
            현재 선택: <strong>{form.postsPerPage || "15"}개 / 페이지</strong>
          </div>
        </div>
      </div>
      {/* 고정글 최대 표시 개수 */}
      <div style={cardStyle}>
        <div style={{ fontSize: 13, fontWeight: 700, color: "#6366f1", marginBottom: 12, display: "flex", alignItems: "center", gap: 8 }}>
          <FileText size={15} />고정글 설정
        </div>
        <div>
          <label style={{ ...labelStyle, marginBottom: 8 }}>메인 화면에 표시할 고정글 최대 개수</label>
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            {["1", "2", "3", "5", "10"].map(n => (
              <button
                key={n}
                type="button"
                onClick={() => setForm(f => ({ ...f, pinnedPostsLimit: n }))}
                style={{
                  padding: "6px 18px",
                  borderRadius: 8,
                  border: (form.pinnedPostsLimit || "3") === n ? "2px solid #6366f1" : "1px solid #e5e7eb",
                  background: (form.pinnedPostsLimit || "3") === n ? "#eef2ff" : "#fff",
                  color: (form.pinnedPostsLimit || "3") === n ? "#6366f1" : "#374151",
                  fontWeight: (form.pinnedPostsLimit || "3") === n ? 700 : 400,
                  fontSize: 14,
                  cursor: "pointer",
                  transition: "all 0.15s",
                }}
              >{n}개</button>
            ))}
          </div>
          <div style={{ fontSize: 11, color: "#6b7280", marginTop: 8 }}>
            현재 선택: <strong>최대 {form.pinnedPostsLimit || "3"}개</strong> — 고정글이 이 개수를 넘으면 상위 {form.pinnedPostsLimit || "3"}개만 표시됩니다.
          </div>
        </div>
      </div>

      {/* 댓글 사용 여부 */}
      <div style={cardStyle}>
        <div style={{ fontSize: 13, fontWeight: 700, color: "#6366f1", marginBottom: 12, display: "flex", alignItems: "center", gap: 8 }}>
          <MessageSquare size={15} />댓글 설정
        </div>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "10px 0" }}>
          <div>
            <div style={{ fontSize: 13, fontWeight: 600, color: "#111827" }}>댓글 기능 사용</div>
            <div style={{ fontSize: 11, color: "#6b7280", marginTop: 2 }}>비활성화 시 모든 게시물에서 댓글 영역이 숨겨집니다.</div>
          </div>
          <button
            type="button"
            onClick={() => setForm(f => ({ ...f, commentsEnabled: f.commentsEnabled === "false" ? "true" : "false" }))}
            style={{
              width: 44, height: 24, borderRadius: 12,
              background: form.commentsEnabled === "false" ? "#d1d5db" : "#6366f1",
              border: "none", cursor: "pointer", position: "relative",
              transition: "background 0.2s",
              flexShrink: 0,
            }}
            aria-label="댓글 토글"
          >
            <span style={{
              position: "absolute", top: 2,
              left: form.commentsEnabled === "false" ? 2 : 22,
              width: 20, height: 20, borderRadius: "50%",
              background: "#fff",
              transition: "left 0.2s",
              boxShadow: "0 1px 3px rgba(0,0,0,0.2)",
            }} />
          </button>
        </div>
      </div>
      {/* 헤더 메뉴 스타일 설정 */}
      <div style={cardStyle}>
        <div style={{ fontSize: 13, fontWeight: 700, color: "#6366f1", marginBottom: 12, display: "flex", alignItems: "center", gap: 8 }}>
          <Navigation size={15} />헤더 메뉴 스타일 설정
        </div>

        {/* 메뉴 스타일 프리셋 5종 */}
        <div style={{ marginBottom: 16 }}>
          <label style={{ ...labelStyle, marginBottom: 8 }}>메뉴 스타일 프리셋</label>
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            {[
              { value: "underline",  label: "탭 스타일",    desc: "활성 시 하단 밑줄" },
              { value: "bold-line",  label: "두꺼운 라인",  desc: "활성 시 굵은 밑줄" },
              { value: "pill",       label: "필(Pill)",    desc: "둥근 배지형 버튼" },
              { value: "floating",   label: "플로팅 카드",  desc: "활성 시 떠오르는 그림자" },
              { value: "neon",       label: "네온 글로우",  desc: "활성 시 빛나는 효과" },
              { value: "chip",       label: "칩(Chip)",    desc: "비활성도 테두리 표시" },
              { value: "slash",      label: "슬래시 강조",  desc: "활성 시 사선 배경" },
              { value: "glass",      label: "유리(Glass)", desc: "반투명 유리 효과" },
            ].map(opt => (
              <button key={opt.value} type="button"
                onClick={() => setForm(f => ({ ...f, navStyle: opt.value }))}
                style={{
                  padding: "8px 14px", borderRadius: 8, textAlign: "left", cursor: "pointer", transition: "all 0.15s",
                  border: (form.navStyle || "underline") === opt.value ? "2px solid #6366f1" : "1px solid #e5e7eb",
                  background: (form.navStyle || "underline") === opt.value ? "#eef2ff" : "#f9fafb",
                  color: (form.navStyle || "underline") === opt.value ? "#6366f1" : "#374151",
                  minWidth: 110,
                }}
              >
                <div style={{ fontWeight: 700, fontSize: 13 }}>{opt.label}</div>
                <div style={{ fontSize: 10, color: "#9ca3af", marginTop: 2 }}>{opt.desc}</div>
              </button>
            ))}
          </div>
          <div style={{ fontSize: 11, color: "#9ca3af", marginTop: 6 }}>현재: <strong>{form.navStyle || "underline"}</strong></div>
        </div>

        {/* 메뉴 글자 크기 */}
        <div style={{ marginBottom: 16 }}>
          <label style={{ ...labelStyle, marginBottom: 8 }}>메뉴 글자 크기</label>
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            {["11px", "12px", "13px", "14px", "15px", "16px", "17px", "18px"].map(size => (
              <button key={size} type="button"
                onClick={() => setForm(f => ({ ...f, navFontSize: size }))}
                style={{
                  padding: "6px 14px", borderRadius: 8, cursor: "pointer", transition: "all 0.15s",
                  border: (form.navFontSize || "13px") === size ? "2px solid #6366f1" : "1px solid #e5e7eb",
                  background: (form.navFontSize || "13px") === size ? "#eef2ff" : "#fff",
                  color: (form.navFontSize || "13px") === size ? "#6366f1" : "#374151",
                  fontWeight: (form.navFontSize || "13px") === size ? 700 : 400,
                  fontSize: size,
                }}
              >{size}</button>
            ))}
          </div>
          <div style={{ fontSize: 11, color: "#6b7280", marginTop: 6 }}>현재: <strong>{form.navFontSize || "13px"}</strong></div>
        </div>

        {/* 메뉴 글자 굵기 */}
        <div style={{ marginBottom: 16 }}>
          <label style={{ ...labelStyle, marginBottom: 8 }}>메뉴 글자 굵기</label>
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            {[
              { value: "400", label: "일반" },
              { value: "500", label: "미디엄" },
              { value: "600", label: "세미볼드" },
              { value: "700", label: "볼드" },
              { value: "800", label: "엑스트라볼드" },
            ].map(opt => (
              <button key={opt.value} type="button"
                onClick={() => setForm(f => ({ ...f, navFontWeight: opt.value }))}
                style={{
                  padding: "6px 14px", borderRadius: 8, cursor: "pointer", transition: "all 0.15s",
                  border: (form.navFontWeight || "600") === opt.value ? "2px solid #6366f1" : "1px solid #e5e7eb",
                  background: (form.navFontWeight || "600") === opt.value ? "#eef2ff" : "#fff",
                  color: (form.navFontWeight || "600") === opt.value ? "#6366f1" : "#374151",
                  fontWeight: Number(opt.value),
                }}
              >{opt.label}</button>
            ))}
          </div>
          <div style={{ fontSize: 11, color: "#6b7280", marginTop: 6 }}>현재: <strong>{form.navFontWeight || "600"}</strong></div>
        </div>

        {/* 메뉴 폰트 패밀리 */}
        <div style={{ marginBottom: 16 }}>
          <label style={{ ...labelStyle, marginBottom: 8 }}>메뉴 폰트 패밀리</label>
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            {[
              { value: "", label: "기본" },
              { value: "'Noto Sans KR', sans-serif", label: "Noto Sans KR" },
              { value: "'Nanum Gothic', sans-serif", label: "Nanum Gothic" },
              { value: "'Nanum Myeongjo', serif", label: "Nanum Myeongjo" },
              { value: "'Pretendard', sans-serif", label: "Pretendard" },
              { value: "'Spoqa Han Sans Neo', sans-serif", label: "Spoqa Han Sans" },
              { value: "'IBM Plex Sans KR', sans-serif", label: "IBM Plex Sans" },
              { value: "'Roboto', sans-serif", label: "Roboto" },
              { value: "'Georgia', serif", label: "Georgia" },
            ].map(opt => (
              <button key={opt.value || "default"} type="button"
                onClick={() => setForm(f => ({ ...f, navFontFamily: opt.value }))}
                style={{
                  padding: "6px 14px", borderRadius: 8, cursor: "pointer", transition: "all 0.15s",
                  border: (form.navFontFamily || "") === opt.value ? "2px solid #6366f1" : "1px solid #e5e7eb",
                  background: (form.navFontFamily || "") === opt.value ? "#eef2ff" : "#fff",
                  color: (form.navFontFamily || "") === opt.value ? "#6366f1" : "#374151",
                  fontFamily: opt.value || "inherit",
                }}
              >{opt.label}</button>
            ))}
          </div>
          <div style={{ fontSize: 11, color: "#6b7280", marginTop: 6 }}>현재: <strong>{form.navFontFamily || "기본"}</strong></div>
        </div>

        {/* 메뉴 문구 색상 */}
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16, marginBottom: 16 }}>
          <div>
            <label style={{ ...labelStyle, marginBottom: 8 }}>메뉴 글자 색상 (기본)</label>
            <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
              <input type="color" value={form.navTextColor || "#374151"}
                onChange={e => setForm(f => ({ ...f, navTextColor: e.target.value }))}
                style={{ width: 40, height: 36, border: "1px solid #e5e7eb", borderRadius: 6, cursor: "pointer", padding: 2 }}
              />
              <input type="text" value={form.navTextColor || "#374151"}
                onChange={e => setForm(f => ({ ...f, navTextColor: e.target.value }))}
                placeholder="#374151"
                style={{ ...inputStyle, flex: 1 }}
              />
            </div>
            <div style={{ fontSize: 11, color: "#9ca3af", marginTop: 4 }}>현재: <strong style={{ color: form.navTextColor || "#374151" }}>{form.navTextColor || "#374151"}</strong></div>
          </div>
          <div>
            <label style={{ ...labelStyle, marginBottom: 8 }}>메뉴 활성 색상</label>
            <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
              <input type="color" value={form.navActiveColor || "#6366f1"}
                onChange={e => setForm(f => ({ ...f, navActiveColor: e.target.value }))}
                style={{ width: 40, height: 36, border: "1px solid #e5e7eb", borderRadius: 6, cursor: "pointer", padding: 2 }}
              />
              <input type="text" value={form.navActiveColor || "#6366f1"}
                onChange={e => setForm(f => ({ ...f, navActiveColor: e.target.value }))}
                placeholder="#6366f1"
                style={{ ...inputStyle, flex: 1 }}
              />
            </div>
            <div style={{ fontSize: 11, color: "#9ca3af", marginTop: 4 }}>현재: <strong style={{ color: form.navActiveColor || "#6366f1" }}>{form.navActiveColor || "#6366f1"}</strong></div>
          </div>
        </div>

        {/* 메뉴 호버 색상 */}
        <div style={{ marginBottom: 8 }}>
          <label style={{ ...labelStyle, marginBottom: 8 }}>메뉴 호버 색상</label>
          <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
            <input type="color" value={form.navHoverColor || "#6366f1"}
              onChange={e => setForm(f => ({ ...f, navHoverColor: e.target.value }))}
              style={{ width: 40, height: 36, border: "1px solid #e5e7eb", borderRadius: 6, cursor: "pointer", padding: 2 }}
            />
            <input type="text" value={form.navHoverColor || "#6366f1"}
              onChange={e => setForm(f => ({ ...f, navHoverColor: e.target.value }))}
              placeholder="#6366f1"
              style={{ ...inputStyle, flex: 1 }}
            />
          </div>
          <div style={{ fontSize: 11, color: "#9ca3af", marginTop: 4 }}>현재: <strong style={{ color: form.navHoverColor || "#6366f1" }}>{form.navHoverColor || "#6366f1"}</strong></div>
        </div>
      </div>
      {/* 카드 테두리 설정 → 홈 레이아웃 탭으로 이동됨 */}
      <div style={{ ...cardStyle, background: "#f0f9ff", border: "1px solid #bae6fd" }}>
        <div style={{ fontSize: 13, fontWeight: 700, color: "#0369a1", marginBottom: 6, display: "flex", alignItems: "center", gap: 8 }}>
          <Palette size={15} />다운로드 카드 테두리 설정
        </div>
        <div style={{ fontSize: 12, color: "#0369a1" }}>
          카드 테두리 색상 및 두께 설정은 <strong>홈 레이아웃 탭</strong> 하단에서 조정할 수 있습니다.
        </div>
      </div>
      {/* 카드 테두리 설정 (숨김 처리 — 홈 레이아웃 탭에서 관리) */}
      {false && <div style={cardStyle}>
        <div style={{ fontSize: 13, fontWeight: 700, color: "#6366f1", marginBottom: 12, display: "flex", alignItems: "center", gap: 8 }}>
          <Palette size={15} />게시물 카드 테두리 설정
        </div>
        <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
          {/* 테두리 색상 */}
          <div>
            <label style={{ ...labelStyle, marginBottom: 8 }}>테두리 색상</label>
            <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
              <input
                type="color"
                value={form.cardBorderColor || "#c7d2fe"}
                onChange={e => setForm(f => ({ ...f, cardBorderColor: e.target.value }))}
                style={{ width: 40, height: 36, borderRadius: 6, border: "none", cursor: "pointer" }}
              />
              <Input
                value={form.cardBorderColor || ""}
                onChange={e => setForm(f => ({ ...f, cardBorderColor: e.target.value }))}
                placeholder="#c7d2fe"
                style={{ ...inputStyle, flex: 1 }}
              />
              <div style={{ width: 36, height: 36, borderRadius: 6, background: form.cardBorderColor || "#c7d2fe", border: "1px solid #e5e7eb" }} />
            </div>
            <div style={{ display: "flex", gap: 6, marginTop: 8, flexWrap: "wrap" }}>
              {[
                { color: "#c7d2fe", label: "인디고 연한" },
                { color: "#a5b4fc", label: "인디고" },
                { color: "#6366f1", label: "인디고 진한" },
                { color: "#e5e7eb", label: "회색" },
                { color: "#d1d5db", label: "진한 회색" },
                { color: "#fca5a5", label: "빨강" },
                { color: "#86efac", label: "녹색" },
                { color: "#93c5fd", label: "파란" },
              ].map(({ color, label }) => (
                <button
                  key={color}
                  type="button"
                  title={label}
                  onClick={() => setForm(f => ({ ...f, cardBorderColor: color }))}
                  style={{
                    width: 28, height: 28, borderRadius: 6, cursor: "pointer",
                    background: color,
                    border: (form.cardBorderColor || "#c7d2fe") === color ? "3px solid #6366f1" : "1px solid #e5e7eb",
                    outline: "none",
                  }}
                />
              ))}
            </div>
          </div>
          {/* 테두리 두께 */}
          <div>
            <label style={{ ...labelStyle, marginBottom: 8 }}>테두리 두께</label>
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
              {["0.5px", "1px", "1.5px", "2px", "2.5px", "3px"].map(w => (
                <button
                  key={w}
                  type="button"
                  onClick={() => setForm(f => ({ ...f, cardBorderWidth: w }))}
                  style={{
                    padding: "6px 14px",
                    borderRadius: 8,
                    border: (form.cardBorderWidth || "1.5px") === w ? "2px solid #6366f1" : "1px solid #e5e7eb",
                    background: (form.cardBorderWidth || "1.5px") === w ? "#eef2ff" : "#fff",
                    color: (form.cardBorderWidth || "1.5px") === w ? "#6366f1" : "#374151",
                    fontWeight: (form.cardBorderWidth || "1.5px") === w ? 700 : 400,
                    fontSize: 13,
                    cursor: "pointer",
                    transition: "all 0.15s",
                  }}
                >{w}</button>
              ))}
            </div>
            <div style={{ fontSize: 11, color: "#6b7280", marginTop: 8 }}>
              현재 선택: <strong>{form.cardBorderWidth || "1.5px"}</strong>
            </div>
          </div>
          {/* 카드 테두리 미리보기 */}
          <div>
            <label style={{ ...labelStyle, marginBottom: 8 }}>카드 미리보기</label>
            <div style={{
              background: "#f9fafb",
              borderRadius: 10,
              padding: "16px",
              border: `${form.cardBorderWidth || "1.5px"} solid ${form.cardBorderColor || "#c7d2fe"}`,
              boxShadow: `0 2px 8px ${form.cardBorderColor || "#c7d2fe"}44`,
              maxWidth: 260,
            }}>
              <div style={{ width: "100%", height: 80, background: "#e5e7eb", borderRadius: 6, marginBottom: 10 }} />
              <div style={{ fontSize: 13, fontWeight: 700, color: "#111827", marginBottom: 4 }}>예시 게시물 제목</div>
              <div style={{ fontSize: 11, color: "#6b7280" }}>요약 텍스트가 여기에 표시됩니다</div>
            </div>
          </div>
        </div>
      </div>}
      {/* 관련글 설정 */}
      <div style={cardStyle}>
        <div style={{ fontSize: 13, fontWeight: 700, color: "#6366f1", marginBottom: 12, display: "flex", alignItems: "center", gap: 8 }}>
          <FileText size={15} />관련글 더 보기 설정
        </div>
        <div>
          <label style={{ ...labelStyle, marginBottom: 8 }}>관련글 정렬 기준</label>
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            {[
              { value: "similarity", label: "관련도 높은 순", desc: "본문 내용 유사도 기준" },
              { value: "latest",     label: "최신순",        desc: "최근 작성된 글 우선" },
              { value: "views",      label: "조회수 많은 순", desc: "많이 읽힌 글 우선" },
              { value: "likes",      label: "좋아요 많은 순", desc: "반응이 좋은 글 우선" },
            ].map(opt => (
              <button
                key={opt.value}
                type="button"
                onClick={() => setForm(f => ({ ...f, relatedPostsSortBy: opt.value }))}
                style={{
                  padding: "8px 16px",
                  borderRadius: 8,
                  border: (form.relatedPostsSortBy || "similarity") === opt.value ? "2px solid #6366f1" : "1px solid #e5e7eb",
                  background: (form.relatedPostsSortBy || "similarity") === opt.value ? "#eef2ff" : "#fff",
                  color: (form.relatedPostsSortBy || "similarity") === opt.value ? "#6366f1" : "#374151",
                  fontWeight: (form.relatedPostsSortBy || "similarity") === opt.value ? 700 : 400,
                  fontSize: 13,
                  cursor: "pointer",
                  transition: "all 0.15s",
                  textAlign: "left" as const,
                }}
              >
                <div>{opt.label}</div>
                <div style={{ fontSize: 10, color: (form.relatedPostsSortBy || "similarity") === opt.value ? "#818cf8" : "#9ca3af", marginTop: 2 }}>{opt.desc}</div>
              </button>
            ))}
          </div>
          <div style={{ fontSize: 11, color: "#6b7280", marginTop: 8 }}>
            현재 선택: <strong>{({ similarity: "관련도 높은 순", latest: "최신순", views: "조회수 많은 순", likes: "좋아요 많은 순" } as Record<string,string>)[form.relatedPostsSortBy || "similarity"] || "관련도 높은 순"}</strong>
            &nbsp;— 같은 카테고리 글이 부족하면 다른 카테고리 인기글로 자동 보완됩니다.
          </div>
        </div>
        <div style={{ marginTop: 16 }}>
          <label style={{ ...labelStyle, marginBottom: 8 }}>관련글 노출 개수</label>
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            {[2, 3, 4, 5, 6].map(n => (
              <button
                key={n}
                type="button"
                onClick={() => setForm(f => ({ ...f, relatedPostsCount: String(n) }))}
                style={{
                  width: 48,
                  height: 48,
                  borderRadius: 8,
                  border: (form.relatedPostsCount ? Number(form.relatedPostsCount) : 3) === n ? "2px solid #6366f1" : "1px solid #e5e7eb",
                  background: (form.relatedPostsCount ? Number(form.relatedPostsCount) : 3) === n ? "#eef2ff" : "#fff",
                  color: (form.relatedPostsCount ? Number(form.relatedPostsCount) : 3) === n ? "#6366f1" : "#374151",
                  fontWeight: (form.relatedPostsCount ? Number(form.relatedPostsCount) : 3) === n ? 700 : 400,
                  fontSize: 16,
                  cursor: "pointer",
                  transition: "all 0.15s",
                }}
              >
                {n}
              </button>
            ))}
          </div>
          <div style={{ fontSize: 11, color: "#6b7280", marginTop: 8 }}>
            현재 설정: <strong>{form.relatedPostsCount ? Number(form.relatedPostsCount) : 3}개</strong>
            &nbsp;— 기본값은 3개입니다.
          </div>
        </div>
        {/* 관련글 레이아웃 */}
        <div style={{ marginTop: 16 }}>
          <label style={{ ...labelStyle, marginBottom: 8 }}>관련글 레이아웃</label>
          <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
            {[
              { value: "card",  label: "카드형",       desc: "썸네일 위, 제목 아래 그리드" },
              { value: "list",  label: "가로 리스트형", desc: "썸네일 좌측, 제목+요약 우측" },
            ].map(opt => (
              <button
                key={opt.value}
                type="button"
                onClick={() => setForm(f => ({ ...f, relatedPostsLayout: opt.value }))}
                style={{
                  padding: "10px 18px",
                  borderRadius: 8,
                  border: (form.relatedPostsLayout || "card") === opt.value ? "2px solid #6366f1" : "1px solid #e5e7eb",
                  background: (form.relatedPostsLayout || "card") === opt.value ? "#eef2ff" : "#fff",
                  color: (form.relatedPostsLayout || "card") === opt.value ? "#6366f1" : "#374151",
                  fontWeight: (form.relatedPostsLayout || "card") === opt.value ? 700 : 400,
                  fontSize: 13,
                  cursor: "pointer",
                  transition: "all 0.15s",
                  textAlign: "left" as const,
                  minWidth: 120,
                }}
              >
                <div>{opt.label}</div>
                <div style={{ fontSize: 10, color: (form.relatedPostsLayout || "card") === opt.value ? "#818cf8" : "#9ca3af", marginTop: 2 }}>{opt.desc}</div>
              </button>
            ))}
          </div>
          <div style={{ fontSize: 11, color: "#6b7280", marginTop: 8 }}>
            현재 선택: <strong>{(form.relatedPostsLayout || "card") === "list" ? "가로 리스트형" : "카드형"}</strong>
          </div>
        </div>
      </div>
      {/* 레이아웃 폭 설정 */}
      <div style={cardStyle}>
        <div style={{ fontSize: 13, fontWeight: 700, color: "#6366f1", marginBottom: 12, display: "flex", alignItems: "center", gap: 8 }}>
          <Maximize2 size={15} />레이아웃 폭 설정
        </div>
        <div style={{ fontSize: 12, color: "#6b7280", marginBottom: 16, lineHeight: 1.6 }}>
          메인 페이지 전체 폭과 글 본문 폭을 조절합니다. 저장 후 즉시 반영됩니다.
        </div>
        <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
          {/* 메인 레이아웃 최대 폭 */}
          <div>
            <label style={{ ...labelStyle, marginBottom: 8, display: "flex", alignItems: "center", gap: 6 }}>
              <Globe size={13} />본문 영역 폭 (사이드바 제외)
            </label>
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
              {[600, 700, 800, 860, 960, 1080, 1200, 1400].map(w => (
                <button
                  key={w}
                  onClick={() => setForm(f => ({ ...f, mainLayoutWidth: String(w) }))}
                  style={{
                    padding: "6px 14px", borderRadius: 6,
                    border: (Number(form.mainLayoutWidth) || 860) === w ? "2px solid #6366f1" : "1px solid #e5e7eb",
                    background: (Number(form.mainLayoutWidth) || 860) === w ? "#eef2ff" : "#fff",
                    color: (Number(form.mainLayoutWidth) || 860) === w ? "#6366f1" : "#374151",
                    fontWeight: (Number(form.mainLayoutWidth) || 860) === w ? 700 : 400,
                    fontSize: 13, cursor: "pointer", transition: "all 0.15s",
                  }}
                >{w}px</button>
              ))}
            </div>
            <div style={{ marginTop: 10, display: "flex", alignItems: "center", gap: 10 }}>
              <label style={{ fontSize: 11, color: "#6b7280" }}>직접 입력 (px):</label>
              <input
                type="number" min={800} max={2400}
                value={form.mainLayoutWidth || "860"}
                onChange={e => setForm(f => ({ ...f, mainLayoutWidth: e.target.value }))}
                style={{ ...inputStyle, width: 100, padding: "6px 10px" }}
              />
            </div>
            <div style={{ fontSize: 11, color: "#9ca3af", marginTop: 6 }}>현재: <strong>{form.mainLayoutWidth || "860"}px</strong> — 사이드바 제외 본문만의 폭. 전체 화면 폭 = 본문 + 좌우 사이드바 + 간격</div>
          </div>
          {/* 글 본문 최대 폭 */}
          <div>
            <label style={{ ...labelStyle, marginBottom: 8, display: "flex", alignItems: "center", gap: 6 }}>
              <FileText size={13} />글 본문 최대 폭
            </label>
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
              {[700, 800, 900, 960, 1040, 1100].map(w => (
                <button
                  key={w}
                  onClick={() => setForm(f => ({ ...f, postContentWidth: String(w) }))}
                  style={{
                    padding: "6px 14px", borderRadius: 6,
                    border: (Number(form.postContentWidth) || 960) === w ? "2px solid #6366f1" : "1px solid #e5e7eb",
                    background: (Number(form.postContentWidth) || 960) === w ? "#eef2ff" : "#fff",
                    color: (Number(form.postContentWidth) || 960) === w ? "#6366f1" : "#374151",
                    fontWeight: (Number(form.postContentWidth) || 960) === w ? 700 : 400,
                    fontSize: 13, cursor: "pointer", transition: "all 0.15s",
                  }}
                >{w}px</button>
              ))}
            </div>
            <div style={{ marginTop: 10, display: "flex", alignItems: "center", gap: 10 }}>
              <label style={{ fontSize: 11, color: "#6b7280" }}>직접 입력 (px):</label>
              <input
                type="number" min={600} max={1600}
                value={form.postContentWidth || "960"}
                onChange={e => setForm(f => ({ ...f, postContentWidth: e.target.value }))}
                style={{ ...inputStyle, width: 100, padding: "6px 10px" }}
              />
            </div>
            <div style={{ fontSize: 11, color: "#9ca3af", marginTop: 6 }}>현재: <strong>{form.postContentWidth || "960"}px</strong> — 기본값 960px</div>
          </div>

          {/* 사이드바 너비 및 간격 설정 */}
          <div style={{ borderTop: "1px solid #f3f4f6", paddingTop: 20 }}>
            <label style={{ ...labelStyle, marginBottom: 12, display: "flex", alignItems: "center", gap: 6, fontSize: 13, fontWeight: 700, color: "#374151" }}>
              사이드바 너비 및 간격
            </label>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 16 }}>
              {/* 좌측 사이드바 너비 */}
              <div>
                <label style={{ fontSize: 11, color: "#6b7280", marginBottom: 6, display: "block" }}>좌측 사이드바 너비 (px)</label>
                <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginBottom: 6 }}>
                  {[160, 180, 200, 220, 240].map(w => (
                    <button key={w} onClick={() => setForm(f => ({ ...f, leftSidebarWidth: String(w) }))}
                      style={{ padding: "4px 10px", borderRadius: 6, fontSize: 12, cursor: "pointer", transition: "all 0.15s",
                        border: (Number(form.leftSidebarWidth) || 200) === w ? "2px solid #6366f1" : "1px solid #e5e7eb",
                        background: (Number(form.leftSidebarWidth) || 200) === w ? "#eef2ff" : "#fff",
                        color: (Number(form.leftSidebarWidth) || 200) === w ? "#6366f1" : "#374151",
                        fontWeight: (Number(form.leftSidebarWidth) || 200) === w ? 700 : 400,
                      }}>{w}</button>
                  ))}
                </div>
                <input type="number" min={120} max={400}
                  value={form.leftSidebarWidth || "200"}
                  onChange={e => setForm(f => ({ ...f, leftSidebarWidth: e.target.value }))}
                  style={{ ...inputStyle, width: "100%", padding: "6px 10px" }}
                />
                <div style={{ fontSize: 11, color: "#9ca3af", marginTop: 4 }}>현재: <strong>{form.leftSidebarWidth || "200"}px</strong></div>
              </div>
              {/* 우측 사이드바 너비 */}
              <div>
                <label style={{ fontSize: 11, color: "#6b7280", marginBottom: 6, display: "block" }}>우측 사이드바 너비 (px)</label>
                <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginBottom: 6 }}>
                  {[160, 180, 200, 220, 240].map(w => (
                    <button key={w} onClick={() => setForm(f => ({ ...f, rightSidebarWidth: String(w) }))}
                      style={{ padding: "4px 10px", borderRadius: 6, fontSize: 12, cursor: "pointer", transition: "all 0.15s",
                        border: (Number(form.rightSidebarWidth) || 200) === w ? "2px solid #6366f1" : "1px solid #e5e7eb",
                        background: (Number(form.rightSidebarWidth) || 200) === w ? "#eef2ff" : "#fff",
                        color: (Number(form.rightSidebarWidth) || 200) === w ? "#6366f1" : "#374151",
                        fontWeight: (Number(form.rightSidebarWidth) || 200) === w ? 700 : 400,
                      }}>{w}</button>
                  ))}
                </div>
                <input type="number" min={120} max={400}
                  value={form.rightSidebarWidth || "200"}
                  onChange={e => setForm(f => ({ ...f, rightSidebarWidth: e.target.value }))}
                  style={{ ...inputStyle, width: "100%", padding: "6px 10px" }}
                />
                <div style={{ fontSize: 11, color: "#9ca3af", marginTop: 4 }}>현재: <strong>{form.rightSidebarWidth || "200"}px</strong></div>
              </div>
              {/* 사이드바-본문 간격 */}
              <div>
                <label style={{ fontSize: 11, color: "#6b7280", marginBottom: 6, display: "block" }}>사이드바-본문 간격 (px)</label>
                <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginBottom: 6 }}>
                  {[12, 20, 28, 36, 48, 60, 80, 100, 140, 200].map(w => (
                    <button key={w} onClick={() => setForm(f => ({ ...f, sidebarGap: String(w) }))}
                      style={{ padding: "4px 10px", borderRadius: 6, fontSize: 12, cursor: "pointer", transition: "all 0.15s",
                        border: (Number(form.sidebarGap) || 28) === w ? "2px solid #6366f1" : "1px solid #e5e7eb",
                        background: (Number(form.sidebarGap) || 28) === w ? "#eef2ff" : "#fff",
                        color: (Number(form.sidebarGap) || 28) === w ? "#6366f1" : "#374151",
                        fontWeight: (Number(form.sidebarGap) || 28) === w ? 700 : 400,
                      }}>{w}</button>
                  ))}
                </div>
                <input type="number" min={4} max={200}
                  value={form.sidebarGap || "28"}
                  onChange={e => setForm(f => ({ ...f, sidebarGap: e.target.value }))}
                  style={{ ...inputStyle, width: "100%", padding: "6px 10px" }}
                />
                <div style={{ fontSize: 11, color: "#9ca3af", marginTop: 4 }}>현재: <strong>{form.sidebarGap || "28"}px</strong> (최대 200px)</div>
              </div>
            </div>
          </div>
        </div>
      </div>
      {/* 메인 상단 섹션 표시 방식 */}
      <div style={{ background: "#fff", border: "1px solid #e5e7eb", borderRadius: 12, padding: "20px 24px" }}>
        <h3 style={{ fontSize: 14, fontWeight: 700, color: "#374151", marginBottom: 16, display: "flex", alignItems: "center", gap: 6 }}>
          <TrendingUp size={14} />메인 상단 섹션 표시 방식
        </h3>
        <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
          {[
            { value: "current", label: "현재 구성", desc: "첫 번째 카테고리 DB 설정값 그대로" },
            { value: "popular", label: "인기글 (조회수 순)", desc: "첫 번째 카테고리 내 조회수 순" },
            { value: "latest", label: "최신글", desc: "첫 번째 카테고리 내 최신순" },
          ].map(opt => (
            <button
              key={opt.value}
              onClick={() => setForm(f => ({ ...f, heroSectionMode: opt.value }))}
              style={{
                padding: "10px 16px", borderRadius: 8, textAlign: "left",
                border: (form.heroSectionMode || "current") === opt.value ? "2px solid #6366f1" : "1px solid #e5e7eb",
                background: (form.heroSectionMode || "current") === opt.value ? "#eef2ff" : "#f9fafb",
                color: (form.heroSectionMode || "current") === opt.value ? "#6366f1" : "#374151",
                cursor: "pointer", transition: "all 0.15s", minWidth: 160,
              }}
            >
              <div style={{ fontWeight: 700, fontSize: 13 }}>{opt.label}</div>
              <div style={{ fontSize: 11, color: "#9ca3af", marginTop: 3 }}>{opt.desc}</div>
            </button>
          ))}
        </div>
        {/* 인기글 선택 시 안내 문구 */}
        {form.heroSectionMode === "popular" && (
          <div style={{ marginTop: 12, padding: "10px 14px", background: "#f0fdf4", border: "1px solid #bbf7d0", borderRadius: 8, fontSize: 12, color: "#166534" }}>
            첫 번째 카테고리 내에서 조회수가 높은 글 순으로 표시됩니다. (전체 기간 기준)
          </div>
        )}
        {form.heroSectionMode === "latest" && (
          <div style={{ marginTop: 12, padding: "10px 14px", background: "#eff6ff", border: "1px solid #bfdbfe", borderRadius: 8, fontSize: 12, color: "#1e40af" }}>
            첫 번째 카테고리 내에서 가장 최근에 발행된 글 순으로 표시됩니다.
          </div>
        )}
        {/* 인기글/최신글 선택 시 표시 개수 설정 */}
        {(form.heroSectionMode === "popular" || form.heroSectionMode === "latest") && (
          <div style={{ marginTop: 16 }}>
            <div style={{ fontSize: 13, fontWeight: 600, color: "#374151", marginBottom: 10 }}>표시할 게시글 수</div>
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
              {[3, 4, 5, 6, 8, 10, 12].map(n => (
                <button
                  key={n}
                  onClick={() => setForm(f => ({ ...f, heroPostCount: String(n) }))}
                  style={{
                    width: 44, height: 36, borderRadius: 8, fontWeight: 700, fontSize: 13,
                    border: (form.heroPostCount || "6") === String(n) ? "2px solid #6366f1" : "1px solid #e5e7eb",
                    background: (form.heroPostCount || "6") === String(n) ? "#eef2ff" : "#f9fafb",
                    color: (form.heroPostCount || "6") === String(n) ? "#6366f1" : "#374151",
                    cursor: "pointer", transition: "all 0.15s",
                  }}
                >
                  {n}
                </button>
              ))}
              <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                <span style={{ fontSize: 12, color: "#9ca3af" }}>직접 입력:</span>
                <input
                  type="number" min={1} max={20}
                  value={form.heroPostCount || "6"}
                  onChange={e => {
                    const v = Math.max(1, Math.min(20, Number(e.target.value)));
                    setForm(f => ({ ...f, heroPostCount: String(v) }));
                  }}
                  style={{ width: 60, padding: "6px 8px", border: "1px solid #e5e7eb", borderRadius: 8, fontSize: 13, textAlign: "center" }}
                />
              </div>
            </div>
            <div style={{ fontSize: 11, color: "#9ca3af", marginTop: 8 }}>현재 설정: <strong>{form.heroPostCount || "6"}개</strong> (최대 20개)</div>
          </div>
        )}
        <div style={{ fontSize: 11, color: "#9ca3af", marginTop: 8 }}>현재: <strong>{form.heroSectionMode === "popular" ? "인기글" : form.heroSectionMode === "latest" ? "최신글" : "현재 구성"}</strong></div>
      </div>

      {/* 바이브코딩 인사이트 섹션 표시 개수 설정 */}
      <div style={{ ...cardStyle, borderLeft: "4px solid #7c3aed" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 10 }}>
          <span style={{ fontSize: 15 }}>⚡</span>
          <span style={{ fontSize: 13, fontWeight: 700, color: "#7c3aed" }}>바이브코딩 인사이트 섹션 표시 개수</span>
        </div>
        <p style={{ fontSize: 12, color: "#6b7280", margin: "0 0 12px" }}>홈페이지에 vibecraftx.com 링크 글을 몇 줄 표시할지 설정합니다. (1줄 = 2개)</p>
        <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
          {[1, 2, 3, 4, 5].map(n => {
            const active = (form.vibecraftInsightRows || "2") === String(n);
            return (
              <button
                key={n}
                onClick={() => setForm(f => ({ ...f, vibecraftInsightRows: String(n) }))}
                style={{
                  padding: "6px 16px", borderRadius: 8, cursor: "pointer",
                  border: active ? "2px solid #7c3aed" : "1px solid #e5e7eb",
                  background: active ? "#f5f3ff" : "#f9fafb",
                  color: active ? "#7c3aed" : "#374151",
                  fontWeight: active ? 700 : 400, fontSize: 13,
                  transition: "all 0.15s",
                }}
              >{n}줄 ({n * 2}개)</button>
            );
          })}
        </div>
        <div style={{ fontSize: 11, color: "#9ca3af", marginTop: 8 }}>현재 설정: <strong>{form.vibecraftInsightRows || "2"}줄 ({Number(form.vibecraftInsightRows || "2") * 2}개 표시)</strong></div>
      </div>

      {/* 사이트맵 캐시 관리 */}
      <SitemapCacheCard />
      {/* 일괄 크롤링 요청 */}
      <IndexingRequestCard />

      <Button onClick={() => {
        window.dispatchEvent(new CustomEvent("admin-save-start"));
        // null/undefined 값 필터링 (z.record(z.string(), z.string()) 검증 통과)
        const sanitized = Object.fromEntries(
          Object.entries(form).filter(([, v]) => v !== null && v !== undefined)
        ) as Record<string, string>;
        updateConfig.mutate(sanitized);
      }} disabled={updateConfig.isPending} style={{ background: "linear-gradient(135deg, #6366f1, #8b5cf6)", fontSize: 13 }}>
        <Save size={14} style={{ marginRight: 6 }} />{updateConfig.isPending ? "저장 중..." : "설정 저장"}
      </Button>
    </div>
  );
}

// ─── 검색사이트 관리 카드 ───────────────────────────────────────────────────────
// customSearchSites: JSON 직렬화된 배열 { name: string; metaName: string; content: string }[]
interface SearchSiteEntry {
  id: string;       // 클라이언트 고유 ID (저장 안 함)
  name: string;     // 표시 이름 (예: "다음", "줌")
  metaName: string; // meta name 속성 (예: "daum-site-verification")
  content: string;  // meta content 값
}

function SearchSiteManageCard({
  form,
  setForm,
}: {
  form: Record<string, string>;
  setForm: React.Dispatch<React.SetStateAction<Record<string, string>>>;
}) {
  // customSearchSites JSON 파싱 (안전)
  const parseSites = (raw: string): SearchSiteEntry[] => {
    try {
      const arr = JSON.parse(raw || "[]");
      if (!Array.isArray(arr)) return [];
      return arr.map((item: any, i: number) => ({
        id: item.id || String(i),
        name: item.name || "",
        metaName: item.metaName || "",
        content: item.content || "",
      }));
    } catch {
      return [];
    }
  };

  const sites = parseSites(form.customSearchSites || "[]");

  const saveSites = (updated: SearchSiteEntry[]) => {
    // id 제외하고 저장
    const toSave = updated.map(({ name, metaName, content }) => ({ name, metaName, content }));
    setForm(f => ({ ...f, customSearchSites: JSON.stringify(toSave) }));
  };

  const [newName, setNewName] = useState("");
  const [newMetaName, setNewMetaName] = useState("");
  const [newContent, setNewContent] = useState("");
  const [addError, setAddError] = useState("");

  const handleAdd = () => {
    setAddError("");
    if (!newName.trim()) { setAddError("사이트 이름을 입력하세요."); return; }
    if (!newMetaName.trim()) { setAddError("메타 태그 이름을 입력하세요."); return; }
    if (!newContent.trim()) { setAddError("확인 코드를 입력하세요."); return; }
    // 중복 metaName 체크
    if (sites.some(s => s.metaName === newMetaName.trim())) {
      setAddError("이미 동일한 메타 태그 이름이 등록되어 있습니다."); return;
    }
    const newEntry: SearchSiteEntry = {
      id: Date.now().toString(),
      name: newName.trim(),
      metaName: newMetaName.trim(),
      content: newContent.trim(),
    };
    saveSites([...sites, newEntry]);
    setNewName("");
    setNewMetaName("");
    setNewContent("");
    toast.success(`"${newEntry.name}" 검색사이트가 추가되었습니다. 저장 버튼을 눌러 적용하세요.`);
  };

  const handleDelete = (id: string) => {
    saveSites(sites.filter(s => s.id !== id));
  };

  const handleEdit = (id: string, field: keyof SearchSiteEntry, value: string) => {
    saveSites(sites.map(s => s.id === id ? { ...s, [field]: value } : s));
  };

  // 기본 제공 검색사이트 (Google, 네이버 — 기존 필드와 연동)
  const builtinSites = [
    {
      name: "Google Search Console",
      metaName: "google-site-verification",
      configKey: "googleSiteVerification",
      placeholder: "XXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXX",
      link: "https://search.google.com/search-console",
    },
    {
      name: "네이버 서치어드바이저",
      metaName: "naver-site-verification",
      configKey: "naverSiteVerification",
      placeholder: "XXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXX",
      link: "https://searchadvisor.naver.com",
    },
    {
      name: "Bing Webmaster Tools",
      metaName: "msvalidate.01",
      configKey: "bingSiteVerification",
      placeholder: "XXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXX",
      link: "https://www.bing.com/webmasters",
    },
  ];

  return (
    <div style={{ ...cardStyle, marginTop: 0 }}>
      <div style={{ fontSize: 13, fontWeight: 700, color: "#6366f1", marginBottom: 12, display: "flex", alignItems: "center", gap: 8 }}>
        <Search size={15} />검색사이트 소유권 확인 관리
      </div>
      <div style={{ fontSize: 12, color: "#6b7280", marginBottom: 16, lineHeight: 1.7 }}>
        각 검색사이트의 소유권 확인 코드를 입력하면 <code style={{ background: "#f3f4f6", padding: "1px 5px", borderRadius: 3, fontSize: 11 }}>&lt;meta&gt;</code> 태그가 모든 페이지에 자동 삽입됩니다.<br />
        Google · 네이버 · Bing은 기본 제공되며, 아래에서 새 검색사이트를 추가할 수 있습니다.
      </div>

      {/* ── 기본 제공 검색사이트 ── */}
      <div style={{ marginBottom: 18 }}>
        <div style={{ fontSize: 11, fontWeight: 700, color: "#374151", marginBottom: 10, textTransform: "uppercase", letterSpacing: "0.05em" }}>기본 제공 검색사이트</div>
        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          {builtinSites.map(site => (
            <div key={site.configKey} style={{ background: "#f9fafb", border: "1px solid #e5e7eb", borderRadius: 8, padding: "10px 14px" }}>
              <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 6 }}>
                <span style={{ fontSize: 12, fontWeight: 700, color: "#374151" }}>{site.name}</span>
                <code style={{ fontSize: 10, color: "#6b7280", background: "#f3f4f6", padding: "1px 6px", borderRadius: 4 }}>
                  name="{site.metaName}"
                </code>
                <a href={site.link} target="_blank" rel="noopener noreferrer" style={{ fontSize: 10, color: "#6366f1", marginLeft: "auto", textDecoration: "none" }}>
                  <ExternalLink size={11} style={{ verticalAlign: "middle" }} /> 사이트 이동
                </a>
              </div>
              <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                <Input
                  value={form[site.configKey] || ""}
                  onChange={e => setForm(f => ({ ...f, [site.configKey]: e.target.value }))}
                  placeholder={site.placeholder}
                  style={{ ...inputStyle, flex: 1, fontSize: 12 }}
                />
                {form[site.configKey]?.trim() && (
                  <span style={{ fontSize: 10, color: "#059669", background: "#ecfdf5", padding: "3px 8px", borderRadius: 5, whiteSpace: "nowrap", border: "1px solid #a7f3d0" }}>✅ 등록됨</span>
                )}
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* ── 추가된 검색사이트 목록 ── */}
      {sites.length > 0 && (
        <div style={{ marginBottom: 18 }}>
          <div style={{ fontSize: 11, fontWeight: 700, color: "#374151", marginBottom: 10, textTransform: "uppercase", letterSpacing: "0.05em" }}>추가된 검색사이트 ({sites.length}개)</div>
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            {sites.map(site => (
              <div key={site.id} style={{ background: "#f0f9ff", border: "1px solid #bae6fd", borderRadius: 8, padding: "10px 14px" }}>
                <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 8 }}>
                  <input
                    value={site.name}
                    onChange={e => handleEdit(site.id, "name", e.target.value)}
                    placeholder="사이트 이름"
                    style={{ ...inputStyle, flex: "0 0 140px", fontSize: 12, fontWeight: 700 }}
                  />
                  <button
                    onClick={() => handleDelete(site.id)}
                    style={{ marginLeft: "auto", background: "none", border: "1px solid #fca5a5", borderRadius: 6, color: "#dc2626", cursor: "pointer", padding: "4px 8px", fontSize: 11, display: "flex", alignItems: "center", gap: 4 }}
                    title="삭제"
                  >
                    <Trash2 size={11} />삭제
                  </button>
                </div>
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
                  <div>
                    <div style={{ fontSize: 10, color: "#6b7280", marginBottom: 3 }}>메타 태그 이름 (name=)</div>
                    <input
                      value={site.metaName}
                      onChange={e => handleEdit(site.id, "metaName", e.target.value)}
                      placeholder="예: daum-site-verification"
                      style={{ ...inputStyle, width: "100%", fontSize: 12 }}
                    />
                  </div>
                  <div>
                    <div style={{ fontSize: 10, color: "#6b7280", marginBottom: 3 }}>확인 코드 (content=)</div>
                    <input
                      value={site.content}
                      onChange={e => handleEdit(site.id, "content", e.target.value)}
                      placeholder="확인 코드 붙여넣기"
                      style={{ ...inputStyle, width: "100%", fontSize: 12 }}
                    />
                  </div>
                </div>
                <div style={{ fontSize: 10, color: "#0369a1", marginTop: 6, background: "#e0f2fe", padding: "4px 8px", borderRadius: 4 }}>
                  생성될 태그: <code>&lt;meta name="{site.metaName}" content="{site.content.slice(0, 20)}{site.content.length > 20 ? "..." : ""}" /&gt;</code>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ── 새 검색사이트 추가 ── */}
      <div style={{ background: "#fafafa", border: "1.5px dashed #d1d5db", borderRadius: 10, padding: "14px 16px" }}>
        <div style={{ fontSize: 12, fontWeight: 700, color: "#374151", marginBottom: 10, display: "flex", alignItems: "center", gap: 6 }}>
          <Plus size={13} />새 검색사이트 추가
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 8, marginBottom: 8 }}>
          <div>
            <div style={{ fontSize: 10, color: "#6b7280", marginBottom: 3 }}>사이트 이름 *</div>
            <input
              value={newName}
              onChange={e => { setNewName(e.target.value); setAddError(""); }}
              placeholder="예: 다음, 줌, 야후"
              style={{ ...inputStyle, width: "100%", fontSize: 12 }}
            />
          </div>
          <div>
            <div style={{ fontSize: 10, color: "#6b7280", marginBottom: 3 }}>메타 태그 이름 (name=) *</div>
            <input
              value={newMetaName}
              onChange={e => { setNewMetaName(e.target.value); setAddError(""); }}
              placeholder="예: daum-site-verification"
              style={{ ...inputStyle, width: "100%", fontSize: 12 }}
            />
          </div>
          <div>
            <div style={{ fontSize: 10, color: "#6b7280", marginBottom: 3 }}>확인 코드 (content=) *</div>
            <input
              value={newContent}
              onChange={e => { setNewContent(e.target.value); setAddError(""); }}
              placeholder="검색사이트에서 발급된 코드"
              style={{ ...inputStyle, width: "100%", fontSize: 12 }}
            />
          </div>
        </div>
        {addError && (
          <div style={{ fontSize: 11, color: "#dc2626", marginBottom: 8 }}>⚠️ {addError}</div>
        )}
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <Button
            onClick={handleAdd}
            style={{ background: "linear-gradient(135deg, #059669, #10b981)", fontSize: 12, padding: "6px 16px" }}
          >
            <Plus size={13} style={{ marginRight: 4 }} />추가
          </Button>
          <div style={{ fontSize: 11, color: "#9ca3af" }}>
            추가 후 반드시 하단 <strong>설정 저장</strong> 버튼을 눌러야 실제 적용됩니다.
          </div>
        </div>
        {/* 주요 검색사이트 빠른 추가 템플릿 */}
        <div style={{ marginTop: 12, borderTop: "1px solid #e5e7eb", paddingTop: 10 }}>
          <div style={{ fontSize: 10, color: "#9ca3af", marginBottom: 6 }}>빠른 추가 템플릿 (이름 클릭 시 자동 입력):</div>
          <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
            {[
              { name: "다음", metaName: "daum-site-verification" },
              { name: "줌", metaName: "zum-site-verification" },
              { name: "야후 재팬", metaName: "y_key" },
              { name: "Yandex", metaName: "yandex-verification" },
              { name: "Baidu", metaName: "baidu-site-verification" },
            ].filter(t => !sites.some(s => s.metaName === t.metaName)).map(t => (
              <button
                key={t.metaName}
                onClick={() => { setNewName(t.name); setNewMetaName(t.metaName); setAddError(""); }}
                style={{ fontSize: 10, padding: "3px 10px", borderRadius: 5, border: "1px solid #e5e7eb", background: "#fff", color: "#374151", cursor: "pointer" }}
              >
                + {t.name}
              </button>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── 사이트맵 캐시 관리 카드 ───────────────────────────────────────────────────
function SitemapCacheCard() {
  const [status, setStatus] = useState<{ cached: boolean; builtAt: number | null; ageMs: number | null } | null>(null);
  const [purging, setPurging] = useState(false);

  const fetchStatus = async () => {
    try {
      const res = await fetch("/api/sitemap/status");
      if (res.ok) setStatus(await res.json());
    } catch { /* ignore */ }
  };

  useEffect(() => { fetchStatus(); }, []);

  const handlePurge = async () => {
    setPurging(true);
    try {
      const res = await fetch("/api/sitemap/purge", { method: "POST" });
      const data = await res.json();
      if (data.ok) {
        toast.success("사이트맵 캐시가 초기화되었습니다. 다음 방문자는 최신 사이트맵을 받게 됩니다.");
        await fetchStatus();
      } else {
        toast.error(data.message || "캐시 초기화 실패");
      }
    } catch {
      toast.error("네트워크 오류가 발생했습니다.");
    } finally {
      setPurging(false);
    }
  };

  const formatAge = (ms: number) => {
    const m = Math.floor(ms / 60000);
    if (m < 1) return "방금 생성됨";
    if (m < 60) return `${m}분 전 생성`;
    return `${Math.floor(m / 60)}시간 전 생성`;
  };

  return (
    <div style={cardStyle}>
      <div style={{ fontSize: 13, fontWeight: 700, color: "#6366f1", marginBottom: 12, display: "flex", alignItems: "center", gap: 8 }}>
        <Globe size={15} />사이트맵 캐시 관리
      </div>
      <div style={{ fontSize: 12, color: "#6b7280", marginBottom: 14, lineHeight: 1.6 }}>
        새 글을 발행한 후 아래 버튼을 누르면 사이트맵 캐시가 즉시 초기화됩니다.<br />
        이후 검색 엔진이 새 글을 크롤링할 때 최신 목록이 반영됩니다.
      </div>
      <div style={{ display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
        <div style={{ fontSize: 12, color: status?.cached ? "#059669" : "#9ca3af", background: status?.cached ? "#ecfdf5" : "#f3f4f6", padding: "4px 10px", borderRadius: 6, border: `1px solid ${status?.cached ? "#a7f3d0" : "#e5e7eb"}` }}>
          {status === null ? "조회 중..." : status.cached ? `✅ 캐시 활성 — ${formatAge(status.ageMs!)}` : "❌ 캐시 없음 (다음 요청 시 생성)"}
        </div>
        <Button
          onClick={handlePurge}
          disabled={purging}
          style={{ background: "linear-gradient(135deg, #f59e0b, #d97706)", fontSize: 12, padding: "6px 14px" }}
        >
          <RefreshCw size={13} style={{ marginRight: 5 }} />{purging ? "초기화 중..." : "사이트맵 지금 갱신"}
        </Button>
        <button
          onClick={fetchStatus}
          style={{ fontSize: 11, color: "#6b7280", background: "none", border: "none", cursor: "pointer", textDecoration: "underline" }}
        >상태 새로고침</button>
      </div>
    </div>
  );
}

// ─── 일괄 크롤링 요청 카드 ───────────────────────────────────────────────────────
function IndexingRequestCard() {
  const [mode, setMode] = useState<'sitemap_ping' | 'indexing_api'>('sitemap_ping');
  const [results, setResults] = useState<{ url: string; status: string; method: string }[]>([]);
  const [showResults, setShowResults] = useState(false);
  const { data: googleKeyStatus } = trpc.admin.checkGoogleIndexingKey.useQuery();

  const requestIndexing = trpc.admin.requestIndexing.useMutation({
    onSuccess: (data) => {
      setResults(data.results);
      setShowResults(true);
      const successCount = data.results.filter((r) => r.status === 'success').length;
      toast.success(`크롤링 요청 완료: ${successCount}/${data.total}개 성공`);
    },
    onError: (err) => {
      toast.error(err.message || '크롤링 요청 중 오류가 발생했습니다.');
    },
  });

  return (
    <div style={{ ...cardStyle, marginTop: 12 }}>
      <div style={{ fontSize: 13, fontWeight: 700, color: '#6366f1', marginBottom: 12, display: 'flex', alignItems: 'center', gap: 8 }}>
        <Search size={15} />일괄 색인 요청 (IndexNow)
      </div>
      <div style={{ fontSize: 12, color: '#6b7280', marginBottom: 14, lineHeight: 1.6 }}>
        Bing · 네이버 등 IndexNow 파트너 엔진에 사이트 URL을 직접 전송하여 빠른 색인을 요청합니다.<br />
        <span style={{ color: '#ef4444' }}>Google sitemap ping은 2023년 이후 폐지</span>되어 IndexNow 방식으로 대체됩니다. Google은 Search Console에 사이트맵 제출 권장.
      </div>

      {/* 모드 선택 탭 */}
      <div style={{ display: 'flex', gap: 6, marginBottom: 14 }}>
        {(['sitemap_ping', 'indexing_api'] as const).map((m) => (
          <button
            key={m}
            onClick={() => setMode(m)}
            style={{
              fontSize: 11,
              padding: '4px 12px',
              borderRadius: 6,
              border: `1.5px solid ${mode === m ? '#6366f1' : '#e5e7eb'}`,
              background: mode === m ? '#eef2ff' : '#f9fafb',
              color: mode === m ? '#4f46e5' : '#6b7280',
              cursor: 'pointer',
              fontWeight: mode === m ? 700 : 400,
              transition: 'all 0.15s',
            }}
          >
            {m === 'sitemap_ping' ? '🔔 IndexNow (추천)' : '🔑 Google Indexing API'}
          </button>
        ))}
      </div>

      {/* 모드별 안내 */}
      {mode === 'sitemap_ping' && (
        <div style={{ fontSize: 11, color: '#059669', background: '#ecfdf5', border: '1px solid #a7f3d0', borderRadius: 6, padding: '8px 12px', marginBottom: 12, lineHeight: 1.6 }}>
          ✅ IndexNow API를 통해 Bing · 네이버 등 파트너 엔진에 사이트 전체 URL을 즉시 전송합니다.<br />
          별도 설정 없이 사용 가능하며, 새 글 발행 시에도 자동으로 전송됩니다.
        </div>
      )}
      {mode === 'indexing_api' && googleKeyStatus?.configured && (
        <div style={{ fontSize: 11, color: '#059669', background: '#ecfdf5', border: '1px solid #a7f3d0', borderRadius: 6, padding: '8px 12px', marginBottom: 12, lineHeight: 1.6 }}>
          ✅ Google Search Console 서비스 계정 키가 등록되어 있습니다.<br />
          <span style={{ color: '#6b7280' }}>계정: {googleKeyStatus.email}</span>
        </div>
      )}
      {mode === 'indexing_api' && googleKeyStatus && !googleKeyStatus.configured && (
        <div style={{ fontSize: 11, color: '#b45309', background: '#fffbeb', border: '1px solid #fde68a', borderRadius: 6, padding: '8px 12px', marginBottom: 12, lineHeight: 1.6 }}>
          ⚠️ Google Search Console 서비스 계정 JSON 키가 필요합니다.<br />
          환경변수 <code>GOOGLE_INDEXING_SERVICE_ACCOUNT_KEY</code>에 JSON 전체를 등록해 주세요.
        </div>
      )}

      {/* 실행 버튼 */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
        <Button
          onClick={() => requestIndexing.mutate({ mode })}
          disabled={requestIndexing.isPending}
          style={{ background: 'linear-gradient(135deg, #6366f1, #8b5cf6)', fontSize: 12, padding: '6px 16px' }}
        >
          <Send size={13} style={{ marginRight: 5 }} />
          {requestIndexing.isPending ? '요청 중...' : '지금 크롤링 요청'}
        </Button>
        {showResults && (
          <button
            onClick={() => setShowResults(!showResults)}
            style={{ fontSize: 11, color: '#6b7280', background: 'none', border: 'none', cursor: 'pointer', textDecoration: 'underline' }}
          >
            결과 {showResults ? '숨기기' : '보기'}
          </button>
        )}
      </div>

      {/* 결과 목록 */}
      {showResults && results.length > 0 && (
        <div style={{ marginTop: 12, borderTop: '1px solid #e5e7eb', paddingTop: 10 }}>
          <div style={{ fontSize: 11, fontWeight: 600, color: '#374151', marginBottom: 6 }}>요청 결과</div>
          {results.map((r, i) => (
            <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 11, color: '#6b7280', marginBottom: 4 }}>
              <span style={{ color: r.status === 'success' ? '#059669' : '#dc2626', fontWeight: 700 }}>
                {r.status === 'success' ? '✅' : '❌'}
              </span>
              <span style={{ color: '#374151' }}>{r.method}</span>
              <span style={{ color: r.status === 'success' ? '#059669' : '#dc2626' }}>{r.status}</span>
            </div>
          ))}
          {/* Google 403 소유권 오류 안내 */}
          {results.some(r => (r.status.includes('403') || r.status.includes('Permission denied') || r.status.includes('verify the URL ownership')) && r.method?.toLowerCase().includes('google')) && (
            <div style={{ marginTop: 10, padding: '10px 12px', background: '#fef2f2', border: '1px solid #fecaca', borderRadius: 6, fontSize: 11, lineHeight: 1.7, color: '#7f1d1d' }}>
              <div style={{ fontWeight: 700, marginBottom: 4 }}>⚠️ 403 오류: Google Search Console에서 서비스 계정 소유권 추가 필요</div>
              <div style={{ color: '#991b1b' }}>이 오류는 서비스 계정이 사이트 소유자로 등록되지 않아 발생합니다. 아래 순서로 해결하세요:</div>
              <ol style={{ margin: '6px 0 0 16px', padding: 0, color: '#7f1d1d' }}>
                <li><a href="https://search.google.com/search-console" target="_blank" rel="noopener noreferrer" style={{ color: '#1d4ed8' }}>Google Search Console</a> → 속성 선택 → 설정 → 사용자 및 권한</li>
                <li>사용자 추가 → <code style={{ background: '#fee2e2', padding: '1px 4px', borderRadius: 3 }}>{googleKeyStatus?.email ?? '서비스 계정 이메일'}</code> 입력</li>
                <li>권한을 <strong>소유자(Owner)</strong>로 설정 후 저장</li>
                <li>저장 후 다시 크롤링 요청</li>
              </ol>
            </div>
          )}
          {/* 네이버 IndexNow 403/422 오류 안내 */}
          {results.some(r => r.method?.includes('네이버') && (r.status.includes('403') || r.status.includes('422'))) && (
            <div style={{ marginTop: 10, padding: '10px 12px', background: '#fffbeb', border: '1px solid #fde68a', borderRadius: 6, fontSize: 11, lineHeight: 1.7, color: '#78350f' }}>
              <div style={{ fontWeight: 700, marginBottom: 4 }}>⚠️ 네이버 IndexNow 오류: 네이버 서치어드바이저에 사이트 등록 필요</div>
              <div style={{ color: '#92400e', marginBottom: 6 }}>
                네이버 IndexNow는 <strong>네이버 서치어드바이저에 사이트가 등록</strong>되어야 합니다.
                {results.find(r => r.status.includes('403') && r.method?.includes('네이버')) && ' (403: 사이트 미등록 또는 소유권 미확인)'}
                {results.find(r => r.status.includes('422') && r.method?.includes('네이버')) && ' (422: URL 형식 오류 또는 사이트 미등록)'}
              </div>
              <ol style={{ margin: '0 0 0 16px', padding: 0, color: '#78350f' }}>
                <li><a href="https://searchadvisor.naver.com" target="_blank" rel="noopener noreferrer" style={{ color: '#1d4ed8' }}>네이버 서치어드바이저</a>에 네이버 계정으로 로그인</li>
                <li>웹마스터 도구 → <strong>사이트 추가</strong> → 사이트 URL 입력 (예: https://www.vibecraftx.com)</li>
                <li>소유권 확인: HTML 태그 방식 → 아래 메타태그를 헤더 스크립트에 추가<br />
                  <code style={{ background: '#fef3c7', padding: '2px 6px', borderRadius: 3, display: 'block', marginTop: 4 }}>&lt;meta name="naver-site-verification" content="[발급된 코드]" /&gt;</code>
                </li>
                <li>소유권 확인 완료 후 다시 크롤링 요청</li>
              </ol>
              <div style={{ marginTop: 8, color: '#92400e', fontSize: 10 }}>
                💡 현재 헤더 스크립트에 naver-site-verification 메타태그가 이미 있다면, 서치어드바이저에서 소유권 확인 버튼을 눌러 확인을 완료하세요.
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

