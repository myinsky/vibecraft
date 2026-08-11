/**
 * PostDetailSkeleton
 * 실제 PostDetail 레이아웃과 동일한 구조의 shimmer 스켈레톤 UI
 * - 전체 배경: #f9fafb
 * - 좌우 사이드바(160px) + 메인 콘텐츠 (max-width 1400)
 * - article: 썸네일(320px) + 내부(padding 56px 48px 64px)
 * - 반응형: 768px 이하 패딩 20px 16px, 썸네일 200px
 *           480px 이하 패딩 16px 12px, 썸네일 160px
 */

function SkeletonBox({
  width = "100%",
  height,
  style,
}: {
  width?: string | number;
  height: number;
  style?: React.CSSProperties;
}) {
  return (
    <div
      className="sk-box"
      style={{
        width,
        height,
        flexShrink: 0,
        borderRadius: 6,
        ...style,
      }}
    />
  );
}

export default function PostDetailSkeleton() {
  return (
    <div
      style={{
        minHeight: "100vh",
        background: "#f9fafb",
        fontFamily: "'Noto Sans KR', 'Apple SD Gothic Neo', sans-serif",
      }}
    >
      <style>{`
        @keyframes sk-shimmer {
          0%   { background-position: -800px 0; }
          100% { background-position:  800px 0; }
        }
        .sk-box {
          background: linear-gradient(90deg, #e5e7eb 25%, #f3f4f6 50%, #e5e7eb 75%);
          background-size: 800px 100%;
          animation: sk-shimmer 1.4s infinite linear;
        }
        .sk-sidebar-col { width: 160px; flex-shrink: 0; }
        @media (max-width: 1100px) {
          .sk-sidebar-col { display: none !important; }
        }
        @media (max-width: 768px) {
          .sk-article-inner { padding: 20px 16px 28px !important; }
          .sk-thumbnail { height: 200px !important; }
        }
        @media (max-width: 480px) {
          .sk-article-inner { padding: 16px 12px 24px !important; }
          .sk-thumbnail { height: 160px !important; }
        }
      `}</style>

      {/* 레이아웃 래퍼 - 실제와 동일: maxWidth 1400, padding 16px 10px, flex gap 12 */}
      <div
        className="post-layout-wrapper"
        style={{
          maxWidth: 1400,
          margin: "0 auto",
          padding: "16px 10px",
          display: "flex",
          gap: 12,
          alignItems: "flex-start",
        }}
      >
        {/* 좌측 사이드바 */}
        <div className="sk-sidebar-col">
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            <SkeletonBox height={120} style={{ borderRadius: 8 }} />
            <SkeletonBox height={80} style={{ borderRadius: 8 }} />
            <SkeletonBox height={100} style={{ borderRadius: 8 }} />
          </div>
        </div>

        {/* 메인 콘텐츠 */}
        <main style={{ flex: 1, minWidth: 0 }}>
          {/* 뒤로가기 버튼 자리 */}
          <div style={{ marginBottom: 20 }}>
            <SkeletonBox width={120} height={32} style={{ borderRadius: 8 }} />
          </div>

          {/* Article 카드 - 실제와 동일: bg white, border, borderRadius 16 */}
          <article
            style={{
              background: "#ffffff",
              border: "1px solid #e5e7eb",
              borderRadius: 16,
              overflow: "hidden",
              maxWidth: 1000,
              margin: "0 auto",
              width: "100%",
            }}
          >
            {/* 썸네일 - 실제: height 320 */}
            <div
              className="sk-thumbnail sk-box"
              style={{ height: 320, borderRadius: 0 }}
            />

            {/* 아티클 내부 - 실제: padding 56px 48px 64px */}
            <div className="sk-article-inner" style={{ padding: "56px 48px 64px" }}>

              {/* 카테고리 뱃지 */}
              <div style={{ display: "flex", gap: 8, marginBottom: 14 }}>
                <SkeletonBox width={64} height={22} style={{ borderRadius: 4 }} />
                <SkeletonBox width={44} height={22} style={{ borderRadius: 4 }} />
              </div>

              {/* 제목 - 실제: fontSize 34 */}
              <div style={{ marginBottom: 16 }}>
                <SkeletonBox height={42} style={{ marginBottom: 10, borderRadius: 8 }} />
                <SkeletonBox width="72%" height={42} style={{ borderRadius: 8 }} />
              </div>

              {/* 메타 정보 (저자, 날짜, 조회수) */}
              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 16,
                  paddingBottom: 20,
                  marginBottom: 28,
                  borderBottom: "1px solid #e5e7eb",
                  flexWrap: "wrap",
                }}
              >
                <SkeletonBox width={80} height={16} style={{ borderRadius: 4 }} />
                <SkeletonBox width={100} height={16} style={{ borderRadius: 4 }} />
                <SkeletonBox width={60} height={16} style={{ borderRadius: 4 }} />
              </div>

              {/* 본문 영역 */}
              <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>

                {/* 목차 박스 */}
                <div
                  style={{
                    background: "#f9fafb",
                    border: "1px solid #e5e7eb",
                    borderRadius: 8,
                    padding: "16px 20px",
                    marginBottom: 8,
                  }}
                >
                  <SkeletonBox width={60} height={18} style={{ marginBottom: 12, borderRadius: 4 }} />
                  <div style={{ display: "flex", flexDirection: "column", gap: 8, paddingLeft: 12 }}>
                    <SkeletonBox width="55%" height={14} style={{ borderRadius: 4 }} />
                    <SkeletonBox width="45%" height={14} style={{ borderRadius: 4 }} />
                    <SkeletonBox width="50%" height={14} style={{ borderRadius: 4 }} />
                    <SkeletonBox width="40%" height={14} style={{ borderRadius: 4 }} />
                  </div>
                </div>

                {/* h2 소제목 */}
                <SkeletonBox width="45%" height={28} style={{ borderRadius: 6, marginTop: 8 }} />

                {/* 본문 단락 1 */}
                <SkeletonBox height={16} style={{ borderRadius: 4 }} />
                <SkeletonBox height={16} style={{ borderRadius: 4 }} />
                <SkeletonBox width="88%" height={16} style={{ borderRadius: 4 }} />
                <SkeletonBox width="92%" height={16} style={{ borderRadius: 4 }} />
                <SkeletonBox width="75%" height={16} style={{ borderRadius: 4 }} />

                {/* 이미지 자리 */}
                <SkeletonBox height={240} style={{ borderRadius: 10, margin: "12px 0" }} />

                {/* h2 소제목 2 */}
                <SkeletonBox width="38%" height={28} style={{ borderRadius: 6, marginTop: 8 }} />

                {/* 본문 단락 2 */}
                <SkeletonBox height={16} style={{ borderRadius: 4 }} />
                <SkeletonBox height={16} style={{ borderRadius: 4 }} />
                <SkeletonBox width="80%" height={16} style={{ borderRadius: 4 }} />
                <SkeletonBox width="65%" height={16} style={{ borderRadius: 4 }} />

                {/* 리스트 항목들 */}
                <div style={{ display: "flex", flexDirection: "column", gap: 8, paddingLeft: 16, marginTop: 4 }}>
                  <SkeletonBox width="70%" height={14} style={{ borderRadius: 4 }} />
                  <SkeletonBox width="62%" height={14} style={{ borderRadius: 4 }} />
                  <SkeletonBox width="68%" height={14} style={{ borderRadius: 4 }} />
                </div>

                {/* 본문 단락 3 */}
                <SkeletonBox height={16} style={{ borderRadius: 4, marginTop: 8 }} />
                <SkeletonBox width="90%" height={16} style={{ borderRadius: 4 }} />
                <SkeletonBox width="55%" height={16} style={{ borderRadius: 4 }} />
              </div>

              {/* 태그 영역 */}
              <div style={{ display: "flex", gap: 8, marginTop: 40, flexWrap: "wrap" }}>
                <SkeletonBox width={56} height={26} style={{ borderRadius: 20 }} />
                <SkeletonBox width={72} height={26} style={{ borderRadius: 20 }} />
                <SkeletonBox width={64} height={26} style={{ borderRadius: 20 }} />
              </div>
            </div>
          </article>

          {/* 관련글 섹션 자리 */}
          <div style={{ marginTop: 32, marginBottom: 32 }}>
            <SkeletonBox width={100} height={22} style={{ marginBottom: 16, borderRadius: 6 }} />
            <div
              style={{
                display: "grid",
                gridTemplateColumns: "repeat(3, 1fr)",
                gap: 16,
              }}
            >
              {[0, 1, 2].map((i) => (
                <div
                  key={i}
                  style={{
                    background: "#fff",
                    border: "1px solid #e5e7eb",
                    borderRadius: 12,
                    overflow: "hidden",
                  }}
                >
                  <div className="sk-box" style={{ height: 120 }} />
                  <div style={{ padding: "12px 14px" }}>
                    <SkeletonBox height={14} style={{ marginBottom: 8, borderRadius: 4 }} />
                    <SkeletonBox width="80%" height={14} style={{ borderRadius: 4 }} />
                  </div>
                </div>
              ))}
            </div>
          </div>
        </main>

        {/* 우측 사이드바 */}
        <div className="sk-sidebar-col">
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            <SkeletonBox height={120} style={{ borderRadius: 8 }} />
            <SkeletonBox height={80} style={{ borderRadius: 8 }} />
            <SkeletonBox height={100} style={{ borderRadius: 8 }} />
          </div>
        </div>
      </div>
    </div>
  );
}
