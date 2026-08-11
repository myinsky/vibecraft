import React, { Suspense, lazy } from "react";
import { Loader2 } from "lucide-react";

const AnalyticsPage = lazy(() => import("./AnalyticsPage"));

export function AnalyticsEmbed() {
  return (
    <Suspense
      fallback={
        <div style={{ display: "flex", alignItems: "center", justifyContent: "center", height: 400 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8, color: "#6b7280", fontSize: 14 }}>
            <Loader2 size={16} style={{ animation: "spin 0.8s linear infinite" }} />
            분석 데이터 로딩 중...
          </div>
        </div>
      }
    >
      <AnalyticsPage />
    </Suspense>
  );
}
