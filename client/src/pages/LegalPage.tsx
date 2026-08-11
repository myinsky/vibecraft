/**
 * LegalPage - 정책 페이지 렌더링 (/privacy, /terms)
 * DB에 저장된 마크다운 내용을 렌더링합니다.
 * 관리자 패널 → 정책 편집 탭에서 내용을 수정할 수 있습니다.
 */
import { trpc } from "@/lib/trpc";
import { Link } from "wouter";
import { useSEO } from "@/hooks/useSEO";
import { lazy, Suspense } from "react";

// react-markdown + remark-gfm은 무거운 패키지(mdast/micromark 포함, ~180KB)
// LegalPage는 lazy 로드되므로 내부에서도 동적 import로 처리하여 청크 분리
const ReactMarkdown = lazy(() => import("react-markdown"));
const RemarkGfmWrapper = lazy(() =>
  import("react-markdown").then((mod) => {
    // remark-gfm을 함께 로드
    return import("remark-gfm").then((gfm) => ({
      default: ({ children }: { children: string }) => (
        <mod.default remarkPlugins={[gfm.default]}>{children}</mod.default>
      ),
    }));
  })
);

// lucide 아이콘 SVG 인라인 교체 — TBT 개선
function ArrowLeftIcon({ size = 15, className }: { size?: number; className?: string }) {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" width={size} height={size} viewBox="0 0 24 24"
      fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"
      className={className}>
      <path d="m12 19-7-7 7-7" /><path d="M19 12H5" />
    </svg>
  );
}

function Loader2Icon({ size = 20, className }: { size?: number; className?: string }) {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" width={size} height={size} viewBox="0 0 24 24"
      fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"
      className={className}>
      <path d="M21 12a9 9 0 1 1-6.219-8.56" />
    </svg>
  );
}

function FileTextIcon({ size = 40, color, style }: { size?: number; color?: string; style?: React.CSSProperties }) {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" width={size} height={size} viewBox="0 0 24 24"
      fill="none" stroke={color ?? "currentColor"} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"
      style={style}>
      <path d="M15 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7Z" />
      <path d="M14 2v4a2 2 0 0 0 2 2h4" />
      <path d="M10 9H8" /><path d="M16 13H8" /><path d="M16 17H8" />
    </svg>
  );
}

interface LegalPageProps {
  slug: "privacy" | "terms";
}

const DEFAULT_TITLES: Record<string, string> = {
  privacy: "개인정보처리방침",
  terms: "이용약관",
};

const DEFAULT_CONTENTS: Record<string, string> = {
  privacy: `# 개인정보처리방침

아직 개인정보처리방침이 작성되지 않았습니다.

관리자 패널 → **정책 편집** 탭에서 내용을 작성해 주세요.`,
  terms: `# 이용약관

아직 이용약관이 작성되지 않았습니다.

관리자 패널 → **정책 편집** 탭에서 내용을 작성해 주세요.`,
};

export default function LegalPage({ slug }: LegalPageProps) {
  const { data, isLoading, error } = trpc.admin.getLegalPage.useQuery({ slug });

  const title = data?.title ?? DEFAULT_TITLES[slug];
  const content = data?.content ?? DEFAULT_CONTENTS[slug];
  const updatedAt = data?.updatedAt;

  useSEO({
    title,
    description: `${title} - 스마트 오토 가이드`,
  });

  return (
    <div
      style={{
        minHeight: "100vh",
        background: "#f9fafb",
        fontFamily: "'Noto Sans KR', 'Apple SD Gothic Neo', sans-serif",
        color: "#111827",
      }}
    >
      {/* 헤더 */}
      <div
        style={{
          borderBottom: "1px solid #e5e7eb",
          padding: "16px 0",
          background: "#ffffff",
        }}
      >
        <div style={{ maxWidth: 960, margin: "0 auto", padding: "0 20px" }}>
          <Link href="/"
              style={{
                display: "inline-flex",
                alignItems: "center",
                gap: 6,
                color: "#6366f1",
                textDecoration: "none",
                fontSize: 14,
                fontWeight: 500,
              }}
            >
              <ArrowLeftIcon size={15} />
              홈으로 돌아가기
            </Link>
        </div>
      </div>

      {/* 본문 */}
      <div style={{ maxWidth: 960, margin: "0 auto", padding: "48px 20px 80px" }}>
        {isLoading ? (
          <div
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              gap: 10,
              padding: "80px 0",
              color: "#6b7280",
            }}
          >
            <Loader2Icon size={20} className="animate-spin" />
            <span>불러오는 중...</span>
          </div>
        ) : error ? (
          <div
            style={{
              textAlign: "center",
              padding: "80px 0",
              color: "#ef4444",
            }}
          >
            <FileTextIcon size={40} style={{ margin: "0 auto 12px", opacity: 0.5 }} />
            <p>페이지를 불러오지 못했습니다.</p>
          </div>
        ) : (
          <>
            {/* 페이지 제목 */}
            <div
              style={{
                marginBottom: 40,
                paddingBottom: 24,
                borderBottom: "1px solid #e5e7eb",
              }}
            >
              <div
                style={{
                  display: "inline-flex",
                  alignItems: "center",
                  gap: 8,
                  background: "linear-gradient(135deg, #6366f1, #8b5cf6)",
                  borderRadius: 8,
                  padding: "6px 14px",
                  marginBottom: 16,
                }}
              >
                <FileTextIcon size={14} color="#fff" />
                <span style={{ fontSize: 12, color: "#fff", fontWeight: 600 }}>
                  {slug === "privacy" ? "개인정보" : "이용약관"}
                </span>
              </div>
              <h1
                style={{
                  fontSize: 28,
                  fontWeight: 700,
                  color: "#111827",
                  margin: 0,
                  lineHeight: 1.3,
                }}
              >
                {title}
              </h1>
              {updatedAt && (
                <p style={{ fontSize: 13, color: "#6b7280", marginTop: 8 }}>
                  최종 업데이트:{" "}
                  {new Date(updatedAt).toLocaleDateString("ko-KR", {
                    year: "numeric",
                    month: "long",
                    day: "numeric",
                  })}
                </p>
              )}
            </div>

            {/* 마크다운 본문 — react-markdown을 lazy로 로드하여 초기 번들에서 제외 */}
            <div
              style={{
                lineHeight: 1.9,
                fontSize: 15,
                color: "#374151",
              }}
              className="legal-content"
            >
              <Suspense fallback={<div style={{ color: "#6b7280", fontSize: 14 }}>렌더링 중...</div>}>
                <RemarkGfmWrapper>{content}</RemarkGfmWrapper>
              </Suspense>
            </div>
          </>
        )}
      </div>

      {/* 마크다운 스타일 오버라이드 */}
      <style>{`
        .legal-content h1 { font-size: 22px; font-weight: 700; color: #111827; margin: 32px 0 12px; }
        .legal-content h2 { font-size: 18px; font-weight: 700; color: #1f2937; margin: 28px 0 10px; padding-bottom: 6px; border-bottom: 1px solid #e5e7eb; }
        .legal-content h3 { font-size: 15px; font-weight: 600; color: #374151; margin: 20px 0 8px; }
        .legal-content p  { margin: 0 0 14px; color: #374151; }
        .legal-content ul, .legal-content ol { padding-left: 20px; margin: 0 0 14px; }
        .legal-content li { margin-bottom: 6px; color: #374151; }
        .legal-content a  { color: #6366f1; text-decoration: underline; }
        .legal-content strong { color: #111827; font-weight: 600; }
        .legal-content hr { border: none; border-top: 1px solid #e5e7eb; margin: 28px 0; }
        .legal-content blockquote { border-left: 3px solid #6366f1; padding-left: 14px; color: #6b7280; margin: 16px 0; }
        .legal-content code { background: #f3f4f6; padding: 2px 6px; border-radius: 4px; font-size: 13px; color: #6366f1; }
        .legal-content pre  { background: #f3f4f6; padding: 16px; border-radius: 8px; overflow-x: auto; margin: 16px 0; }
        .legal-content pre code { background: none; padding: 0; color: #374151; }
        .legal-content table { width: 100%; border-collapse: collapse; margin: 16px 0; }
        .legal-content th, .legal-content td { border: 1px solid #e5e7eb; padding: 8px 12px; text-align: left; }
        .legal-content th { background: #f9fafb; color: #1f2937; font-weight: 600; }
      `}</style>
    </div>
  );
}
