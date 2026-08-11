/**
 * SeoPreview 컴포넌트
 *
 * 포스트 제목·설명·URL·썸네일을 받아
 * 1) Google 검색 결과 스니펫 미리보기
 * 2) SNS(Open Graph) 카드 미리보기
 * 두 가지 탭으로 보여줍니다.
 */

import { useState } from "react";
import { Search, Share2, AlertCircle, CheckCircle2, Info } from "lucide-react";

export interface SeoPreviewProps {
  /** 페이지 <title> 에 들어갈 제목 */
  title: string;
  /** meta description / og:description */
  description: string;
  /** 이 포스트의 canonical URL (전체 URL) */
  url: string;
  /** og:image URL (썸네일) */
  image?: string;
  /** 사이트 이름 (og:site_name) */
  siteName?: string;
}

// ─── 유틸 함수 ──────────────────────────────────────────────────────────────

/** URL에서 표시용 breadcrumb 경로 추출 */
export function formatBreadcrumb(url: string): string {
  try {
    const u = new URL(url);
    const parts = [u.hostname, ...u.pathname.split("/").filter(Boolean)];
    return parts.join(" › ");
  } catch {
    return url;
  }
}

/** 제목 길이 평가 */
export function evaluateTitle(title: string): {
  status: "good" | "warn" | "error";
  message: string;
} {
  const len = title.length;
  if (len === 0) return { status: "error", message: "제목을 입력해 주세요." };
  if (len < 10) return { status: "warn", message: `제목이 너무 짧습니다 (${len}자). 10자 이상 권장합니다.` };
  if (len > 60) return { status: "warn", message: `제목이 너무 깁니다 (${len}자). 60자 이하 권장합니다.` };
  return { status: "good", message: `제목 길이 적절 (${len}자)` };
}

/** 설명 길이 평가 */
export function evaluateDescription(desc: string): {
  status: "good" | "warn" | "error";
  message: string;
} {
  const len = desc.length;
  if (len === 0) return { status: "warn", message: "설명이 없으면 Google이 본문에서 자동 추출합니다." };
  if (len < 50) return { status: "warn", message: `설명이 너무 짧습니다 (${len}자). 50자 이상 권장합니다.` };
  if (len > 160) return { status: "warn", message: `설명이 너무 깁니다 (${len}자). 160자 이하 권장합니다.` };
  return { status: "good", message: `설명 길이 적절 (${len}자)` };
}

/** 텍스트를 maxLen 이하로 자르고 말줄임표 추가 */
export function truncate(text: string, maxLen: number): string {
  if (text.length <= maxLen) return text;
  return text.slice(0, maxLen - 1) + "…";
}

// ─── 상태 아이콘 ─────────────────────────────────────────────────────────────

function StatusIcon({ status }: { status: "good" | "warn" | "error" }) {
  if (status === "good") return <CheckCircle2 size={13} style={{ color: "#10b981", flexShrink: 0 }} />;
  if (status === "warn") return <Info size={13} style={{ color: "#f59e0b", flexShrink: 0 }} />;
  return <AlertCircle size={13} style={{ color: "#ef4444", flexShrink: 0 }} />;
}

// ─── Google 검색 결과 미리보기 ───────────────────────────────────────────────

function GooglePreview({ title, description, url }: { title: string; description: string; url: string }) {
  const displayTitle = truncate(title || "제목 없음", 60);
  const displayDesc = truncate(description || "설명이 없습니다. Google이 본문에서 자동으로 내용을 추출하여 표시합니다.", 160);
  const breadcrumb = formatBreadcrumb(url);

  return (
    <div style={{
      background: "#fff",
      border: "1px solid #e5e7eb",
      borderRadius: 12,
      padding: "20px 24px",
      fontFamily: "Arial, sans-serif",
    }}>
      {/* Google 검색창 모형 */}
      <div style={{
        display: "flex", alignItems: "center", gap: 10,
        background: "#f1f3f4", borderRadius: 24,
        padding: "8px 16px", marginBottom: 20,
        border: "1px solid #dfe1e5",
      }}>
        <Search size={16} style={{ color: "#9aa0a6", flexShrink: 0 }} />
        <span style={{ fontSize: 14, color: "#202124" }}>
          {truncate(title || "검색어", 40)}
        </span>
      </div>

      {/* 검색 결과 스니펫 */}
      <div>
        {/* URL 경로 */}
        <div style={{ fontSize: 12, color: "#202124", marginBottom: 2 }}>
          <span style={{ color: "#4d5156" }}>{breadcrumb}</span>
        </div>
        {/* 제목 */}
        <div style={{
          fontSize: 20, color: "#1a0dab",
          lineHeight: 1.3, marginBottom: 4,
          cursor: "pointer",
        }}
          onMouseEnter={e => (e.currentTarget.style.textDecoration = "underline")}
          onMouseLeave={e => (e.currentTarget.style.textDecoration = "none")}
        >
          {displayTitle}
        </div>
        {/* 설명 */}
        <div style={{ fontSize: 14, color: "#4d5156", lineHeight: 1.58 }}>
          {displayDesc}
        </div>
      </div>
    </div>
  );
}

// ─── SNS 카드 미리보기 ───────────────────────────────────────────────────────

function SnsCard({ title, description, url, image, siteName }: SeoPreviewProps) {
  const displayTitle = truncate(title || "제목 없음", 55);
  const displayDesc = truncate(description || "", 100);
  const domain = (() => {
    try { return new URL(url).hostname; } catch { return url; }
  })();

  return (
    <div style={{
      background: "#fff",
      border: "1px solid #e5e7eb",
      borderRadius: 12,
      overflow: "hidden",
      maxWidth: 500,
      fontFamily: "system-ui, -apple-system, sans-serif",
    }}>
      {/* 썸네일 */}
      {image ? (
        <div style={{ width: "100%", aspectRatio: "1200/630", background: "#f3f4f6", overflow: "hidden" }}>
          <img
            src={image}
            alt="썸네일"
            loading="lazy"
            decoding="async"
            style={{ width: "100%", height: "100%", objectFit: "cover" }}
            onError={e => {
              (e.currentTarget as HTMLImageElement).style.display = "none";
            }}
          />
        </div>
      ) : (
        <div style={{
          width: "100%", aspectRatio: "1200/630",
          background: "linear-gradient(135deg, #6366f1 0%, #8b5cf6 100%)",
          display: "flex", alignItems: "center", justifyContent: "center",
        }}>
          <Share2 size={40} style={{ color: "rgba(255,255,255,0.5)" }} />
        </div>
      )}

      {/* 텍스트 영역 */}
      <div style={{ padding: "12px 16px", borderTop: "1px solid #e5e7eb" }}>
        <div style={{ fontSize: 11, color: "#9ca3af", textTransform: "uppercase", letterSpacing: "0.5px", marginBottom: 4 }}>
          {domain}
        </div>
        <div style={{ fontSize: 15, fontWeight: 700, color: "#111827", lineHeight: 1.4, marginBottom: 4 }}>
          {displayTitle}
        </div>
        {displayDesc && (
          <div style={{ fontSize: 13, color: "#6b7280", lineHeight: 1.5 }}>
            {displayDesc}
          </div>
        )}
        {siteName && (
          <div style={{ fontSize: 11, color: "#9ca3af", marginTop: 6 }}>
            {siteName}
          </div>
        )}
      </div>
    </div>
  );
}

// ─── SEO 점수 체크리스트 ─────────────────────────────────────────────────────

function SeoChecklist({ title, description, image }: { title: string; description: string; image?: string }) {
  const titleEval = evaluateTitle(title);
  const descEval = evaluateDescription(description);
  const imageStatus: { status: "good" | "warn"; message: string } = image
    ? { status: "good", message: "썸네일 이미지가 설정되어 있습니다." }
    : { status: "warn", message: "썸네일 이미지가 없으면 SNS 공유 시 빈 카드로 표시됩니다." };

  const items = [
    { label: "제목", ...titleEval },
    { label: "설명", ...descEval },
    { label: "이미지", ...imageStatus },
  ];

  const score = items.filter(i => i.status === "good").length;

  return (
    <div style={{
      background: "#f9fafb",
      border: "1px solid #e5e7eb",
      borderRadius: 12,
      padding: "16px 20px",
    }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 12 }}>
        <span style={{ fontSize: 12, fontWeight: 700, color: "#374151", textTransform: "uppercase", letterSpacing: "0.5px" }}>
          SEO 점검
        </span>
        <span style={{
          fontSize: 12, fontWeight: 700,
          color: score === 3 ? "#10b981" : score >= 2 ? "#f59e0b" : "#ef4444",
          background: score === 3 ? "#d1fae5" : score >= 2 ? "#fef3c7" : "#fee2e2",
          padding: "2px 8px", borderRadius: 12,
        }}>
          {score}/3 통과
        </span>
      </div>
      <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
        {items.map(item => (
          <div key={item.label} style={{ display: "flex", alignItems: "flex-start", gap: 8 }}>
            <StatusIcon status={item.status} />
            <div>
              <span style={{ fontSize: 12, fontWeight: 600, color: "#374151" }}>{item.label}: </span>
              <span style={{ fontSize: 12, color: "#6b7280" }}>{item.message}</span>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

// ─── 메인 컴포넌트 ───────────────────────────────────────────────────────────

type PreviewTab = "google" | "sns";

export default function SeoPreview({ title, description, url, image, siteName }: SeoPreviewProps) {
  const [tab, setTab] = useState<PreviewTab>("google");

  const tabStyle = (active: boolean): React.CSSProperties => ({
    display: "flex", alignItems: "center", gap: 6,
    padding: "8px 16px",
    background: "none", border: "none",
    borderBottom: active ? "2px solid #6366f1" : "2px solid transparent",
    color: active ? "#6366f1" : "#6b7280",
    fontSize: 12, fontWeight: active ? 700 : 500,
    cursor: "pointer", transition: "all 0.15s",
  });

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
      {/* 탭 헤더 */}
      <div style={{
        display: "flex", borderBottom: "1px solid #e5e7eb",
      }}>
        <button type="button" style={tabStyle(tab === "google")} onClick={() => setTab("google")}>
          <Search size={13} /> Google 검색 결과
        </button>
        <button type="button" style={tabStyle(tab === "sns")} onClick={() => setTab("sns")}>
          <Share2 size={13} /> SNS 공유 카드
        </button>
      </div>

      {/* 미리보기 */}
      {tab === "google" ? (
        <GooglePreview title={title} description={description} url={url} />
      ) : (
        <SnsCard title={title} description={description} url={url} image={image} siteName={siteName} />
      )}

      {/* SEO 점검 체크리스트 */}
      <SeoChecklist title={title} description={description} image={image} />
    </div>
  );
}
