/**
 * LazySectionWrapper
 *
 * 뷰포트에 가까워질 때까지 children 렌더링을 지연합니다.
 * 로딩 전에는 실제 섹션과 비슷한 높이의 스켈레톤 플레이스홀더를 표시합니다.
 *
 * Props:
 *   - minHeight: 섹션이 렌더링되기 전 플레이스홀더 최소 높이 (기본 300px)
 *   - rootMargin: 뷰포트 여유 거리 (기본 "200px")
 *   - children: 실제 렌더링할 섹션 컴포넌트
 */
import { ReactNode } from "react";
import { useLazySection } from "@/hooks/useLazySection";

interface LazySectionWrapperProps {
  children: ReactNode | ((isVisible: boolean) => ReactNode);
  minHeight?: number;
  rootMargin?: string;
  /** true이면 서버 preload 데이터가 있으므로 뷰포트 진입 전에도 즉시 렌더링 */
  hasPreloadedData?: boolean;
}

export function LazySectionWrapper({
  children,
  minHeight = 300,
  rootMargin = "200px",
  hasPreloadedData = false,
}: LazySectionWrapperProps) {
  const [ref, isVisible] = useLazySection(rootMargin);

  // 서버 preload 데이터가 있으면 뷰포트 밖이어도 즉시 렌더링
  if (hasPreloadedData) {
    return <>{typeof children === 'function' ? children(true) : children}</>;
  }

  if (!isVisible) {
    return (
      <div
        ref={ref}
        style={{
          minHeight,
          background: "#f9fafb",
          borderRadius: 10,
          marginBottom: 4,
          overflow: "hidden",
        }}
      >
        {/* 섹션 헤더 스켈레톤 */}
        <div style={{ padding: "20px 0 12px" }}>
          <div
            style={{
              height: 20,
              width: 200,
              background: "#e5e7eb",
              borderRadius: 6,
              marginBottom: 8,
              animation: "lazy-pulse 1.5s ease-in-out infinite",
            }}
          />
          <div
            style={{
              height: 14,
              width: 300,
              background: "#f3f4f6",
              borderRadius: 4,
              animation: "lazy-pulse 1.5s ease-in-out infinite",
            }}
          />
        </div>
        {/* 카드 그리드 스켈레톤 */}
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fill, minmax(200px, 1fr))",
            gap: 12,
          }}
        >
          {[0, 1, 2, 3].map((i) => (
            <div
              key={i}
              style={{
                background: "#fff",
                border: "1px solid #e5e7eb",
                borderRadius: 8,
                overflow: "hidden",
              }}
            >
              <div
                style={{
                  height: 110,
                  background: "#e5e7eb",
                  animation: "lazy-pulse 1.5s ease-in-out infinite",
                }}
              />
              <div style={{ padding: "8px 10px" }}>
                <div
                  style={{
                    height: 13,
                    background: "#e5e7eb",
                    borderRadius: 4,
                    marginBottom: 6,
                    animation: "lazy-pulse 1.5s ease-in-out infinite",
                  }}
                />
                <div
                  style={{
                    height: 11,
                    width: "65%",
                    background: "#f3f4f6",
                    borderRadius: 4,
                    animation: "lazy-pulse 1.5s ease-in-out infinite",
                  }}
                />
              </div>
            </div>
          ))}
        </div>
        <style>{`
          @keyframes lazy-pulse {
            0%, 100% { opacity: 1; }
            50% { opacity: 0.45; }
          }
        `}</style>
      </div>
    );
  }

  // children이 render prop 함수이면 isVisible을 전달, 아니면 그대로 렌더링
  return <>{typeof children === 'function' ? children(isVisible) : children}</>;
}
