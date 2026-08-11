import { useState } from "react";
import { trpc } from "@/lib/trpc";
import Header from "@/components/Header";
import Footer from "@/components/Footer";

const AD_TYPES = [
  { value: "banner", label: "배너 광고", desc: "사이드바 또는 본문 상단/하단 배너" },
  { value: "sponsored", label: "스폰서드 포스트", desc: "블로그 글 형식의 홍보 콘텐츠" },
  { value: "newsletter", label: "뉴스레터 광고", desc: "뉴스레터 내 광고 삽입" },
  { value: "other", label: "기타", desc: "위 유형 외 별도 협의" },
] as const;

const BUDGET_OPTIONS = [
  "10만원 미만",
  "10만원 ~ 30만원",
  "30만원 ~ 50만원",
  "50만원 ~ 100만원",
  "100만원 이상",
  "협의 후 결정",
];

const PERIOD_OPTIONS = [
  "1주일",
  "2주일",
  "1개월",
  "3개월",
  "6개월",
  "1년 이상",
  "협의 후 결정",
];

const INITIAL_FORM = {
  name: "",
  email: "",
  company: "",
  adType: "banner" as "banner" | "sponsored" | "newsletter" | "other",
  period: "",
  budget: "",
  message: "",
};

export default function AdvertisePage() {
  const [form, setForm] = useState(INITIAL_FORM);
  const [showSuccessModal, setShowSuccessModal] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});

  const submitMutation = trpc.adInquiry.submit.useMutation({
    onSuccess: () => {
      setShowSuccessModal(true);
    },
    onError: (err) => {
      setErrors({ submit: err.message || "제출 중 오류가 발생했습니다. 다시 시도해주세요." });
    },
  });

  const validate = () => {
    const errs: Record<string, string> = {};
    if (!form.name.trim()) errs.name = "이름을 입력해주세요.";
    if (!form.email.trim()) errs.email = "이메일을 입력해주세요.";
    else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.email)) errs.email = "올바른 이메일 형식이 아닙니다.";
    if (!form.message.trim()) errs.message = "문의 내용을 입력해주세요.";
    else if (form.message.trim().length < 10) errs.message = "문의 내용을 10자 이상 입력해주세요.";
    return errs;
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const errs = validate();
    if (Object.keys(errs).length > 0) {
      setErrors(errs);
      return;
    }
    setErrors({});
    submitMutation.mutate({
      name: form.name.trim(),
      email: form.email.trim(),
      company: form.company.trim() || undefined,
      adType: form.adType,
      period: form.period || undefined,
      budget: form.budget || undefined,
      message: form.message.trim(),
    });
  };

  const handleCloseModal = () => {
    setShowSuccessModal(false);
    setForm(INITIAL_FORM);
    setErrors({});
  };

  const inputStyle: React.CSSProperties = {
    width: "100%",
    padding: "10px 14px",
    fontSize: 14,
    border: "1.5px solid #e5e7eb",
    borderRadius: 8,
    outline: "none",
    background: "#fff",
    color: "#111827",
    boxSizing: "border-box",
    transition: "border-color 0.15s",
  };

  const labelStyle: React.CSSProperties = {
    display: "block",
    fontSize: 13,
    fontWeight: 600,
    color: "#374151",
    marginBottom: 6,
  };

  const errorStyle: React.CSSProperties = {
    fontSize: 12,
    color: "#ef4444",
    marginTop: 4,
  };

  return (
    <div style={{ minHeight: "100vh", background: "#f9fafb", fontFamily: "'Noto Sans KR', sans-serif" }}>
      <Header />

      {/* 성공 모달 */}
      {showSuccessModal && (
        <div
          style={{
            position: "fixed",
            inset: 0,
            background: "rgba(0,0,0,0.45)",
            zIndex: 1000,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            padding: "16px",
            backdropFilter: "blur(2px)",
          }}
          onClick={(e) => { if (e.target === e.currentTarget) handleCloseModal(); }}
        >
          <div
            style={{
              background: "#fff",
              borderRadius: 20,
              padding: "48px 40px",
              maxWidth: 440,
              width: "100%",
              textAlign: "center",
              boxShadow: "0 20px 60px rgba(0,0,0,0.18)",
              animation: "modalIn 0.22s cubic-bezier(0.34,1.56,0.64,1)",
            }}
          >
            {/* 체크 아이콘 */}
            <div style={{
              width: 72, height: 72,
              background: "linear-gradient(135deg, #6366f1, #818cf8)",
              borderRadius: "50%",
              display: "flex", alignItems: "center", justifyContent: "center",
              margin: "0 auto 20px",
              boxShadow: "0 8px 24px rgba(99,102,241,0.35)",
            }}>
              <svg width="36" height="36" viewBox="0 0 36 36" fill="none">
                <path d="M10 18.5L15.5 24L26 13" stroke="#fff" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            </div>

            <h2 style={{ fontSize: 22, fontWeight: 800, color: "#111827", margin: "0 0 10px" }}>
              문의가 접수되었습니다!
            </h2>
            <p style={{ fontSize: 14, color: "#6b7280", lineHeight: 1.75, margin: "0 0 8px" }}>
              광고 문의가 성공적으로 접수되었습니다.
            </p>
            <p style={{ fontSize: 14, color: "#6b7280", lineHeight: 1.75, margin: "0 0 32px" }}>
              입력하신 이메일로 검토 결과를 보내드리겠습니다.<br />
              보통 <strong style={{ color: "#4f46e5" }}>1~2 영업일</strong> 내에 답변드립니다.
            </p>

            <div style={{ display: "flex", gap: 10, justifyContent: "center" }}>
              <button
                onClick={handleCloseModal}
                style={{
                  padding: "11px 28px",
                  fontSize: 14, fontWeight: 700,
                  background: "#6366f1", color: "#fff",
                  border: "none", borderRadius: 10,
                  cursor: "pointer",
                  transition: "background 0.15s",
                }}
                onMouseEnter={(e) => (e.currentTarget.style.background = "#4f46e5")}
                onMouseLeave={(e) => (e.currentTarget.style.background = "#6366f1")}
              >
                새 문의 작성하기
              </button>
              <button
                onClick={() => { window.location.href = "/"; }}
                style={{
                  padding: "11px 28px",
                  fontSize: 14, fontWeight: 600,
                  background: "#f3f4f6", color: "#374151",
                  border: "none", borderRadius: 10,
                  cursor: "pointer",
                  transition: "background 0.15s",
                }}
                onMouseEnter={(e) => (e.currentTarget.style.background = "#e5e7eb")}
                onMouseLeave={(e) => (e.currentTarget.style.background = "#f3f4f6")}
              >
                홈으로 이동
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 모달 애니메이션 */}
      <style>{`
        @keyframes modalIn {
          from { opacity: 0; transform: scale(0.88) translateY(16px); }
          to   { opacity: 1; transform: scale(1) translateY(0); }
        }
      `}</style>

      <main style={{ maxWidth: 720, margin: "0 auto", padding: "48px 16px 80px" }}>
        {/* 헤더 섹션 */}
        <div style={{ textAlign: "center", marginBottom: 48 }}>
          <div style={{
            display: "inline-flex", alignItems: "center", gap: 8,
            background: "#eff6ff", color: "#2563eb", fontSize: 13, fontWeight: 600,
            padding: "6px 16px", borderRadius: 20, marginBottom: 16,
          }}>
            📢 광고 문의
          </div>
          <h1 style={{ fontSize: 28, fontWeight: 800, color: "#111827", margin: "0 0 12px" }}>
            광고 게재 문의
          </h1>
          <p style={{ fontSize: 15, color: "#6b7280", lineHeight: 1.7, margin: 0 }}>
            Smart Auto Guide에 광고를 게재하고 싶으신가요?<br />
            아래 양식을 작성해 주시면 빠르게 검토 후 연락드리겠습니다.
          </p>
        </div>

        {/* 광고 유형 안내 카드 */}
        <div style={{
          display: "grid", gridTemplateColumns: "repeat(2, 1fr)", gap: 12,
          marginBottom: 40,
        }}>
          {AD_TYPES.map((type) => (
            <div
              key={type.value}
              onClick={() => setForm((f) => ({ ...f, adType: type.value }))}
              style={{
                padding: "16px 18px",
                border: form.adType === type.value ? "2px solid #6366f1" : "1.5px solid #e5e7eb",
                borderRadius: 10,
                background: form.adType === type.value ? "#eef2ff" : "#fff",
                cursor: "pointer",
                transition: "all 0.15s",
              }}
            >
              <div style={{ fontSize: 14, fontWeight: 700, color: form.adType === type.value ? "#4f46e5" : "#111827", marginBottom: 4 }}>
                {type.label}
              </div>
              <div style={{ fontSize: 12, color: "#6b7280" }}>{type.desc}</div>
            </div>
          ))}
        </div>

        {/* 문의 폼 */}
        <form onSubmit={handleSubmit} style={{ background: "#fff", border: "1.5px solid #e5e7eb", borderRadius: 16, padding: "36px 32px" }}>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 20, marginBottom: 20 }}>
            {/* 이름 */}
            <div>
              <label style={labelStyle}>이름 <span style={{ color: "#ef4444" }}>*</span></label>
              <input
                type="text"
                placeholder="홍길동"
                value={form.name}
                onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
                style={{ ...inputStyle, borderColor: errors.name ? "#ef4444" : "#e5e7eb" }}
                onFocus={(e) => (e.currentTarget.style.borderColor = "#6366f1")}
                onBlur={(e) => (e.currentTarget.style.borderColor = errors.name ? "#ef4444" : "#e5e7eb")}
              />
              {errors.name && <div style={errorStyle}>{errors.name}</div>}
            </div>

            {/* 이메일 */}
            <div>
              <label style={labelStyle}>이메일 <span style={{ color: "#ef4444" }}>*</span></label>
              <input
                type="email"
                placeholder="example@company.com"
                value={form.email}
                onChange={(e) => setForm((f) => ({ ...f, email: e.target.value }))}
                style={{ ...inputStyle, borderColor: errors.email ? "#ef4444" : "#e5e7eb" }}
                onFocus={(e) => (e.currentTarget.style.borderColor = "#6366f1")}
                onBlur={(e) => (e.currentTarget.style.borderColor = errors.email ? "#ef4444" : "#e5e7eb")}
              />
              {errors.email && <div style={errorStyle}>{errors.email}</div>}
            </div>
          </div>

          {/* 회사/브랜드명 */}
          <div style={{ marginBottom: 20 }}>
            <label style={labelStyle}>회사 / 브랜드명</label>
            <input
              type="text"
              placeholder="(선택) 회사명 또는 브랜드명"
              value={form.company}
              onChange={(e) => setForm((f) => ({ ...f, company: e.target.value }))}
              style={inputStyle}
              onFocus={(e) => (e.currentTarget.style.borderColor = "#6366f1")}
              onBlur={(e) => (e.currentTarget.style.borderColor = "#e5e7eb")}
            />
          </div>

          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 20, marginBottom: 20 }}>
            {/* 광고 기간 */}
            <div>
              <label style={labelStyle}>희망 광고 기간</label>
              <select
                value={form.period}
                onChange={(e) => setForm((f) => ({ ...f, period: e.target.value }))}
                style={{ ...inputStyle, cursor: "pointer" }}
              >
                <option value="">선택해주세요</option>
                {PERIOD_OPTIONS.map((p) => (
                  <option key={p} value={p}>{p}</option>
                ))}
              </select>
            </div>

            {/* 예산 */}
            <div>
              <label style={labelStyle}>예산 범위</label>
              <select
                value={form.budget}
                onChange={(e) => setForm((f) => ({ ...f, budget: e.target.value }))}
                style={{ ...inputStyle, cursor: "pointer" }}
              >
                <option value="">선택해주세요</option>
                {BUDGET_OPTIONS.map((b) => (
                  <option key={b} value={b}>{b}</option>
                ))}
              </select>
            </div>
          </div>

          {/* 문의 내용 */}
          <div style={{ marginBottom: 28 }}>
            <label style={labelStyle}>문의 내용 <span style={{ color: "#ef4444" }}>*</span></label>
            <textarea
              placeholder="광고하려는 제품/서비스 소개, 원하는 광고 형태, 기타 요청사항 등을 자유롭게 작성해주세요."
              value={form.message}
              onChange={(e) => setForm((f) => ({ ...f, message: e.target.value }))}
              rows={6}
              style={{
                ...inputStyle,
                resize: "vertical",
                minHeight: 140,
                borderColor: errors.message ? "#ef4444" : "#e5e7eb",
              }}
              onFocus={(e) => (e.currentTarget.style.borderColor = "#6366f1")}
              onBlur={(e) => (e.currentTarget.style.borderColor = errors.message ? "#ef4444" : "#e5e7eb")}
            />
            <div style={{ display: "flex", justifyContent: "space-between", marginTop: 4 }}>
              {errors.message ? <div style={errorStyle}>{errors.message}</div> : <div />}
              <div style={{ fontSize: 12, color: "#9ca3af" }}>{form.message.length} / 2000</div>
            </div>
          </div>

          {errors.submit && (
            <div style={{ background: "#fef2f2", border: "1px solid #fecaca", borderRadius: 8, padding: "12px 16px", marginBottom: 20, fontSize: 14, color: "#dc2626" }}>
              {errors.submit}
            </div>
          )}

          <button
            type="submit"
            disabled={submitMutation.isPending}
            style={{
              width: "100%",
              padding: "14px",
              fontSize: 15,
              fontWeight: 700,
              background: submitMutation.isPending ? "#a5b4fc" : "#6366f1",
              color: "#fff",
              border: "none",
              borderRadius: 10,
              cursor: submitMutation.isPending ? "not-allowed" : "pointer",
              transition: "background 0.15s",
            }}
          >
            {submitMutation.isPending ? "제출 중..." : "광고 문의 제출하기"}
          </button>

          <p style={{ fontSize: 12, color: "#9ca3af", textAlign: "center", marginTop: 16, marginBottom: 0 }}>
            제출하신 정보는 광고 문의 검토 목적으로만 사용됩니다.
          </p>
        </form>
      </main>

      <Footer />
    </div>
  );
}
