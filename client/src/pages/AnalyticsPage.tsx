/**
 * AnalyticsPage - 방문자 통합 분석 대시보드 (관리자 전용)
 * 유료급 프리미엄 SaaS 스타일
 */
import { useState, useMemo, lazy, Suspense } from "react";
const LazyStreamdown = lazy(() => import("streamdown").then(m => ({ default: m.Streamdown })));
import { trpc } from "@/lib/trpc";
import { useAuth } from "@/_core/hooks/useAuth";
import {
  LineChart, Line, BarChart, Bar, PieChart, Pie, Cell,
  XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer, LabelList,
} from "recharts";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import {
  Loader2, Users, Eye, Clock, TrendingUp, Monitor, Smartphone, Tablet,
  Globe, ChevronRight, Lightbulb, Search, Tag, Hash, Zap, BarChart2,
  ArrowRight, Cpu, Activity, Target, ExternalLink, Calendar, ChevronLeft, ChevronRight as ChevronRightIcon,
} from "lucide-react";

type Period = "day" | "week" | "month" | "year";

const PERIOD_LABELS: Record<Period, string> = {
  day: "오늘",
  week: "최근 7일",
  month: "이번 달",
  year: "올해",
};

const DEVICE_COLORS: Record<string, string> = {
  desktop: "#6366f1",
  mobile: "#f59e0b",
  tablet: "#10b981",
  other: "#94a3b8",
};

const DEVICE_ICONS: Record<string, React.ReactNode> = {
  desktop: <Monitor size={14} />,
  mobile: <Smartphone size={14} />,
  tablet: <Tablet size={14} />,
  other: <Globe size={14} />,
};

const ROLE_COLORS: Record<string, string> = {
  guest: "#94a3b8",
  user: "#6366f1",
  admin: "#f59e0b",
};

const REFERRER_COLORS: Record<string, string> = {
  direct: "#6366f1",
  search: "#10b981",
  social: "#f59e0b",
  referral: "#ec4899",
  other: "#94a3b8",
};

const REFERRER_LABELS: Record<string, string> = {
  direct: "직접 방문",
  search: "검색",
  social: "소셜",
  referral: "외부 링크",
  other: "기타",
};

function formatDuration(seconds: number): string {
  if (!seconds || seconds < 1) return "0초";
  if (seconds < 60) return `${Math.round(seconds)}초`;
  const m = Math.floor(seconds / 60);
  const s = Math.round(seconds % 60);
  return s > 0 ? `${m}분 ${s}초` : `${m}분`;
}

// ─── 섹션 구분 헤더 ───────────────────────────────────────────────────────────
function SectionHeader({
  icon,
  title,
  desc,
  accent = "#6366f1",
}: {
  icon: React.ReactNode;
  title: string;
  desc?: string;
  accent?: string;
}) {
  return (
    <div style={{ display: "flex", alignItems: "flex-start", gap: 12, marginBottom: 16 }}>
      <div
        style={{
          width: 36,
          height: 36,
          borderRadius: 10,
          background: `${accent}18`,
          border: `1px solid ${accent}30`,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          flexShrink: 0,
          color: accent,
        }}
      >
        {icon}
      </div>
      <div>
        <h2 style={{ fontSize: 15, fontWeight: 700, color: "#111827", margin: 0, lineHeight: 1.3 }}>
          {title}
        </h2>
        {desc && (
          <p style={{ fontSize: 12, color: "#6b7280", margin: "3px 0 0", lineHeight: 1.5 }}>
            {desc}
          </p>
        )}
      </div>
    </div>
  );
}

// ─── 프리미엄 카드 ────────────────────────────────────────────────────────────
function PCard({
  children,
  style,
  className,
}: {
  children: React.ReactNode;
  style?: React.CSSProperties;
  className?: string;
}) {
  return (
    <div
      className={className}
      style={{
        background: "#ffffff",
        border: "1px solid #e5e7eb",
        borderRadius: 14,
        boxShadow: "0 1px 3px rgba(0,0,0,0.05), 0 4px 12px rgba(0,0,0,0.04)",
        overflow: "hidden",
        ...style,
      }}
    >
      {children}
    </div>
  );
}

function PCardHeader({
  title,
  subtitle,
  icon,
  iconColor = "#6366f1",
  action,
}: {
  title: string;
  subtitle?: string;
  icon?: React.ReactNode;
  iconColor?: string;
  action?: React.ReactNode;
}) {
  return (
    <div
      style={{
        padding: "16px 20px 12px",
        borderBottom: "1px solid #f3f4f6",
        display: "flex",
        alignItems: "flex-start",
        justifyContent: "space-between",
        gap: 12,
      }}
    >
      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
        {icon && (
          <span style={{ color: iconColor, display: "flex", alignItems: "center" }}>{icon}</span>
        )}
        <div>
          <p style={{ fontSize: 13, fontWeight: 700, color: "#111827", margin: 0 }}>{title}</p>
          {subtitle && (
            <p style={{ fontSize: 11, color: "#9ca3af", margin: "2px 0 0" }}>{subtitle}</p>
          )}
        </div>
      </div>
      {action && <div style={{ flexShrink: 0 }}>{action}</div>}
    </div>
  );
}

function PCardBody({
  children,
  style,
}: {
  children: React.ReactNode;
  style?: React.CSSProperties;
}) {
  return (
    <div style={{ padding: "16px 20px", ...style }}>
      {children}
    </div>
  );
}

// ─── 진행 바 행 ───────────────────────────────────────────────────────────────
function ProgressRow({
  label,
  count,
  maxCount,
  color,
  rank,
}: {
  label: string;
  count: number;
  maxCount: number;
  color: string;
  rank?: number;
}) {
  const pct = Math.round((count / (maxCount || 1)) * 100);
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
      {rank !== undefined && (
        <span
          style={{
            fontSize: 11,
            fontWeight: 700,
            color: rank < 3 ? color : "#9ca3af",
            width: 16,
            textAlign: "right",
            flexShrink: 0,
          }}
        >
          {rank + 1}
        </span>
      )}
      <span style={{ fontSize: 12, fontWeight: 500, color: "#374151", width: 90, flexShrink: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
        {label}
      </span>
      <div
        style={{
          flex: 1,
          height: 6,
          background: "#f3f4f6",
          borderRadius: 99,
          overflow: "hidden",
        }}
      >
        <div
          style={{
            height: "100%",
            width: `${pct}%`,
            background: color,
            borderRadius: 99,
            transition: "width 0.6s ease",
          }}
        />
      </div>
      <span style={{ fontSize: 11, color: "#6b7280", width: 34, textAlign: "right", flexShrink: 0 }}>
        {count}
      </span>
    </div>
  );
}

// ─── 스크롤 깊이 모달 ─────────────────────────────────────────────────────────
function ScrollDepthModal({
  postId,
  postTitle,
  open,
  onClose,
}: {
  postId: number;
  postTitle: string;
  open: boolean;
  onClose: () => void;
}) {
  const { data: stats } = trpc.analytics.postScrollStats.useQuery(
    { postId },
    { enabled: open }
  );
  const writingAdvice = trpc.analytics.writingAdvice.useMutation();

  const depthData = useMemo(() => {
    if (!stats) return [];
    const total = stats.totalVisits || 1;
    return [
      { label: "10%", count: stats.depth10, pct: Math.round((stats.depth10 / total) * 100) },
      { label: "20%", count: stats.depth20, pct: Math.round((stats.depth20 / total) * 100) },
      { label: "30%", count: stats.depth30, pct: Math.round((stats.depth30 / total) * 100) },
      { label: "40%", count: stats.depth40, pct: Math.round((stats.depth40 / total) * 100) },
      { label: "50%", count: stats.depth50, pct: Math.round((stats.depth50 / total) * 100) },
      { label: "60%", count: stats.depth60, pct: Math.round((stats.depth60 / total) * 100) },
      { label: "70%", count: stats.depth70, pct: Math.round((stats.depth70 / total) * 100) },
      { label: "80%", count: stats.depth80, pct: Math.round((stats.depth80 / total) * 100) },
      { label: "90%", count: stats.depth90, pct: Math.round((stats.depth90 / total) * 100) },
      { label: "100%", count: stats.depth100, pct: Math.round((stats.depth100 / total) * 100) },
    ];
  }, [stats]);

  return (
    <Dialog open={open} onOpenChange={v => { if (!v) onClose(); }}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="text-base font-bold line-clamp-2">{postTitle}</DialogTitle>
        </DialogHeader>
        {!stats ? (
          <div className="flex items-center justify-center h-40">
            <Loader2 className="animate-spin text-muted-foreground" />
          </div>
        ) : (
          <div className="space-y-6">
            <div className="flex items-center gap-4 text-sm text-muted-foreground">
              <span>총 방문: <strong className="text-foreground">{stats.totalVisits.toLocaleString()}명</strong></span>
              <span>완독률: <strong className="text-foreground">{stats.totalVisits > 0 ? Math.round((stats.depth100 / stats.totalVisits) * 100) : 0}%</strong></span>
            </div>
            <div>
              <p className="text-sm font-semibold mb-3">스크롤 깊이별 이탈 현황</p>
              <div className="space-y-2">
                {depthData.map((d, i) => {
                  const prev = i > 0 ? depthData[i - 1].pct : 100;
                  const dropoff = prev - d.pct;
                  return (
                    <div key={d.label} className="flex items-center gap-3">
                      <span className="text-xs text-muted-foreground w-8 text-right">{d.label}</span>
                      <div className="flex-1 bg-muted rounded-full h-5 relative overflow-hidden">
                        <div
                          className="h-full rounded-full transition-all"
                          style={{
                            width: `${d.pct}%`,
                            background: d.pct > 70 ? "#10b981" : d.pct > 40 ? "#f59e0b" : "#ef4444",
                          }}
                        />
                      </div>
                      <span className="text-xs font-semibold w-10 text-right">{d.pct}%</span>
                      {dropoff > 15 && (
                        <Badge variant="destructive" className="text-xs px-1 py-0">
                          -{dropoff}%
                        </Badge>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
            <div className="border-t pt-4">
              <div className="flex items-center justify-between mb-3">
                <p className="text-sm font-semibold flex items-center gap-2">
                  <Lightbulb size={14} className="text-amber-500" />
                  AI 글쓰기 개선 제안
                </p>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => writingAdvice.mutate({ postId })}
                  disabled={writingAdvice.isPending}
                >
                  {writingAdvice.isPending ? (
                    <><Loader2 size={12} className="animate-spin mr-1" />분석 중...</>
                  ) : "분석 요청"}
                </Button>
              </div>
              {writingAdvice.data && (
                <div className="bg-amber-50 dark:bg-amber-950/20 rounded-lg p-4 text-sm">
                  <Suspense fallback={<span className="text-xs text-muted-foreground">로딩 중...</span>}>
                    <LazyStreamdown>{String(writingAdvice.data.advice)}</LazyStreamdown>
                  </Suspense>
                </div>
              )}
              {!writingAdvice.data && !writingAdvice.isPending && (
                <p className="text-xs text-muted-foreground">
                  "분석 요청" 버튼을 클릭하면 AI가 이탈 데이터를 분석하여 글쓰기 개선 방법을 제안합니다.
                </p>
              )}
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}

// ─── 추이 차트 그룹 타입 ──────────────────────────────────────────────────────
type TrendGroupBy = "hour" | "day" | "week" | "month" | "year";

const TREND_GROUP_LABELS: Record<TrendGroupBy, string> = {
  hour: "시간별",
  day: "일별",
  week: "주간별",
  month: "월별",
  year: "년도별",
};

const TREND_GROUP_RANGE: Record<TrendGroupBy, string> = {
  hour: "최근 24시간",
  day: "최근 30일",
  week: "최근 12주",
  month: "최근 12개월",
  year: "최근 5년",
};

function formatTrendLabel(date: string, groupBy: TrendGroupBy): string {
  if (!date) return "";
  try {
    if (groupBy === "hour") {
      const parts = date.split(" ");
      if (parts.length === 2) {
        const hh = parts[1].split(":")[0];
        return `${parseInt(hh)}시`;
      }
      return date;
    }
    if (groupBy === "week") {
      const d = new Date(date);
      return `${d.getMonth() + 1}/${d.getDate()}주`;
    }
    if (groupBy === "month") {
      const parts = date.split("-");
      if (parts.length >= 2) return `${parseInt(parts[1])}월`;
      return date;
    }
    if (groupBy === "year") return `${date}년`;
    const d = new Date(date);
    return `${d.getMonth() + 1}/${d.getDate()}`;
  } catch {
    return date;
  }
}

// ─── 메인 대시보드 ────────────────────────────────────────────────────────────
export default function AnalyticsPage() {
  const { user, loading } = useAuth();
  const [period, setPeriod] = useState<Period>("week");
  const [trendGroupBy, setTrendGroupBy] = useState<TrendGroupBy>("day");
  const [selectedPost, setSelectedPost] = useState<{ id: number; title: string } | null>(null);

  // 일자별 조회수 분석
  const todayStr = useMemo(() => {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  }, []);
  const [selectedDate, setSelectedDate] = useState<string>(todayStr);

  const isAdmin = !loading && !!user && user.role === "admin";

  const { data: summary } = trpc.analytics.summary.useQuery({ period }, { enabled: isAdmin });
  const { data: trend } = trpc.analytics.trend.useQuery({ period, groupBy: trendGroupBy }, { enabled: isAdmin });
  const { data: devices } = trpc.analytics.devices.useQuery({ period }, { enabled: isAdmin });
  const { data: userRoles } = trpc.analytics.userRoles.useQuery({ period }, { enabled: isAdmin });
  const { data: hourly } = trpc.analytics.hourly.useQuery({ period }, { enabled: isAdmin });
  const { data: referrers } = trpc.analytics.referrers.useQuery({ period }, { enabled: isAdmin });
  const { data: topPosts } = trpc.analytics.topPosts.useQuery({ period, limit: 10 }, { enabled: isAdmin });
  const { data: searchKeywords } = trpc.analytics.searchKeywords.useQuery({ period, limit: 20 }, { enabled: isAdmin });
  const { data: popularCategories } = trpc.analytics.popularCategories.useQuery({ period }, { enabled: isAdmin });
  const { data: popularTags } = trpc.analytics.popularTags.useQuery({ period, limit: 15 }, { enabled: isAdmin });
  const { data: entryPages } = trpc.analytics.entryPages.useQuery({ period, limit: 10 }, { enabled: isAdmin });
  const { data: searchEngines } = trpc.analytics.searchEngines.useQuery({ period }, { enabled: isAdmin });
  const { data: osStats } = trpc.analytics.osStats.useQuery({ period }, { enabled: isAdmin });
  const { data: browserStats } = trpc.analytics.browserStats.useQuery({ period }, { enabled: isAdmin });
  const { data: cumulativeStats } = trpc.analytics.cumulativeStats.useQuery(undefined, { enabled: isAdmin });

  // 일자별 조회수 세부 쿼리
  const { data: recentDailyTotals } = trpc.analytics.recentDailyTotals.useQuery({ days: 30 }, { enabled: isAdmin });
  const { data: dailyPages, isLoading: dailyPagesLoading } = trpc.analytics.dailyPageBreakdown.useQuery(
    { date: selectedDate, limit: 30 },
    { enabled: isAdmin && !!selectedDate }
  );
  const { data: dailyHourly } = trpc.analytics.dailyHourlyBreakdown.useQuery(
    { date: selectedDate },
    { enabled: isAdmin && !!selectedDate }
  );
  const { data: dailyReferrers } = trpc.analytics.dailyReferrerBreakdown.useQuery(
    { date: selectedDate },
    { enabled: isAdmin && !!selectedDate }
  );

  const [aiInsightText, setAiInsightText] = useState<string | null>(null);
  const [aiInsightPeriod, setAiInsightPeriod] = useState<string>("");
  type RecommendationItem = { title: string; reason: string; targetAudience: string; seoKeywords: string[]; category: string; priority: string };
  const [aiRecommendations, setAiRecommendations] = useState<RecommendationItem[]>([]);
  const aiInsightMutation = trpc.analytics.aiInsight.useMutation({
    onSuccess: (data) => {
      setAiInsightText(typeof data.insight === "string" ? data.insight : String(data.insight));
      setAiInsightPeriod(data.period);
      setAiRecommendations((data.recommendations ?? []) as RecommendationItem[]);
    },
  });

  const hourlyData = useMemo(() => {
    const map = new Map((hourly ?? []).map(h => [h.hour, h.count]));
    return Array.from({ length: 24 }, (_, i) => ({
      hour: `${i}시`,
      count: map.get(i) ?? 0,
    }));
  }, [hourly]);

  if (loading) {
    return (
      <div style={{ display: "flex", alignItems: "center", justifyContent: "center", minHeight: 300 }}>
        <Loader2 className="animate-spin" style={{ color: "#6366f1" }} size={32} />
      </div>
    );
  }

  if (!user || user.role !== "admin") {
    return (
      <div style={{ display: "flex", alignItems: "center", justifyContent: "center", minHeight: 300 }}>
        <p style={{ fontSize: 14, color: "#9ca3af" }}>관리자만 접근할 수 있습니다.</p>
      </div>
    );
  }

  return (
    <div style={{ maxWidth: 1400, margin: "0 auto" }}>

      {/* ══════════════════════════════════════════════════════════════════ */}
      {/* 페이지 헤더 */}
      {/* ══════════════════════════════════════════════════════════════════ */}
      <div
        style={{
          background: "linear-gradient(135deg, #0f172a 0%, #1e1b4b 50%, #0f172a 100%)",
          borderRadius: 16,
          padding: "24px 28px",
          marginBottom: 24,
          position: "relative",
          overflow: "hidden",
        }}
      >
        {/* 배경 장식 */}
        <div style={{ position: "absolute", top: -50, right: -50, width: 200, height: 200, borderRadius: "50%", background: "rgba(99,102,241,0.12)", pointerEvents: "none" }} />
        <div style={{ position: "absolute", bottom: -30, left: 200, width: 120, height: 120, borderRadius: "50%", background: "rgba(16,185,129,0.08)", pointerEvents: "none" }} />

        <div style={{ position: "relative", display: "flex", alignItems: "center", justifyContent: "space-between", gap: 16, flexWrap: "wrap" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
            <div style={{ width: 48, height: 48, borderRadius: 13, background: "rgba(99,102,241,0.25)", border: "1px solid rgba(99,102,241,0.4)", display: "flex", alignItems: "center", justifyContent: "center" }}>
              <Activity style={{ width: 22, height: 22, color: "#a5b4fc" }} />
            </div>
            <div>
              <h1 style={{ fontSize: 20, fontWeight: 700, color: "#ffffff", margin: 0, letterSpacing: "-0.3px" }}>
                방문자 분석
              </h1>
              <p style={{ fontSize: 12, color: "#94a3b8", marginTop: 4, lineHeight: 1.5 }}>
                사이트 방문자 통계 및 콘텐츠 성과를 실시간으로 확인합니다
              </p>
            </div>
          </div>

          {/* 기간 선택 탭 */}
          <div
            style={{
              display: "flex",
              gap: 4,
              background: "rgba(255,255,255,0.07)",
              borderRadius: 10,
              padding: 4,
              border: "1px solid rgba(255,255,255,0.1)",
            }}
          >
            {(Object.keys(PERIOD_LABELS) as Period[]).map(p => (
              <button
                key={p}
                onClick={() => setPeriod(p)}
                style={{
                  padding: "7px 14px",
                  borderRadius: 7,
                  fontSize: 12,
                  fontWeight: 600,
                  border: "none",
                  cursor: "pointer",
                  transition: "all 0.15s",
                  background: period === p ? "#6366f1" : "transparent",
                  color: period === p ? "#ffffff" : "#94a3b8",
                  boxShadow: period === p ? "0 2px 8px rgba(99,102,241,0.4)" : "none",
                }}
              >
                {PERIOD_LABELS[p]}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* ══════════════════════════════════════════════════════════════════ */}
      {/* 누적 통계 카드 3개 */}
      {/* ══════════════════════════════════════════════════════════════════ */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 14, marginBottom: 24 }}>
        {[
          {
            label: "이번 달",
            total: cumulativeStats?.thisMonth.total ?? 0,
            unique: cumulativeStats?.thisMonth.unique ?? 0,
            accentColor: "#6366f1",
            gradientFrom: "#eef2ff",
            gradientTo: "#f5f3ff",
            borderColor: "#c7d2fe",
            Icon: Eye,
          },
          {
            label: "올해",
            total: cumulativeStats?.thisYear.total ?? 0,
            unique: cumulativeStats?.thisYear.unique ?? 0,
            accentColor: "#10b981",
            gradientFrom: "#ecfdf5",
            gradientTo: "#f0fdf4",
            borderColor: "#a7f3d0",
            Icon: TrendingUp,
          },
          {
            label: "전체 누계",
            total: cumulativeStats?.allTime.total ?? 0,
            unique: cumulativeStats?.allTime.unique ?? 0,
            accentColor: "#f59e0b",
            gradientFrom: "#fffbeb",
            gradientTo: "#fef9c3",
            borderColor: "#fde68a",
            Icon: BarChart2,
          },
        ].map(card => (
          <div
            key={card.label}
            style={{
              background: `linear-gradient(135deg, ${card.gradientFrom}, ${card.gradientTo})`,
              border: `1px solid ${card.borderColor}`,
              borderRadius: 14,
              padding: "20px 22px",
              position: "relative",
              overflow: "hidden",
            }}
          >
            <div style={{ position: "absolute", top: -20, right: -20, width: 80, height: 80, borderRadius: "50%", background: `${card.accentColor}12`, pointerEvents: "none" }} />
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 14 }}>
              <span style={{ fontSize: 12, fontWeight: 600, color: "#374151" }}>{card.label}</span>
              <div style={{ width: 30, height: 30, borderRadius: 8, background: `${card.accentColor}18`, display: "flex", alignItems: "center", justifyContent: "center" }}>
                <card.Icon style={{ width: 15, height: 15, color: card.accentColor }} />
              </div>
            </div>
            <div style={{ display: "flex", alignItems: "flex-end", gap: 16 }}>
              <div>
                <p style={{ fontSize: 11, color: "#6b7280", margin: "0 0 3px" }}>총 방문</p>
                <p style={{ fontSize: 26, fontWeight: 800, color: card.accentColor, margin: 0, lineHeight: 1 }}>
                  {card.total.toLocaleString()}
                  <span style={{ fontSize: 12, fontWeight: 400, color: "#9ca3af", marginLeft: 3 }}>회</span>
                </p>
              </div>
              <div style={{ paddingBottom: 2 }}>
                <p style={{ fontSize: 11, color: "#6b7280", margin: "0 0 3px" }}>순 방문자</p>
                <p style={{ fontSize: 18, fontWeight: 700, color: "#374151", margin: 0, lineHeight: 1 }}>
                  {card.unique.toLocaleString()}
                  <span style={{ fontSize: 11, fontWeight: 400, color: "#9ca3af", marginLeft: 3 }}>명</span>
                </p>
              </div>
            </div>
          </div>
        ))}
      </div>

      {/* ══════════════════════════════════════════════════════════════════ */}
      {/* 기간별 요약 카드 4개 */}
      {/* ══════════════════════════════════════════════════════════════════ */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 12, marginBottom: 24 }}>
        {[
          {
            Icon: Eye,
            label: "총 방문",
            value: (summary?.total ?? 0).toLocaleString(),
            unit: "회",
            color: "#6366f1",
            bg: "#eef2ff",
          },
          {
            Icon: Users,
            label: "순 방문자",
            value: (summary?.unique ?? 0).toLocaleString(),
            unit: "명",
            color: "#10b981",
            bg: "#ecfdf5",
          },
          {
            Icon: Clock,
            label: "평균 체류시간",
            value: formatDuration(summary?.avgDuration ?? 0),
            unit: "",
            color: "#f59e0b",
            bg: "#fffbeb",
          },
          {
            Icon: Target,
            label: "평균 스크롤",
            value: `${Math.round(summary?.avgScrollDepth ?? 0)}`,
            unit: "%",
            color: "#ec4899",
            bg: "#fdf2f8",
          },
        ].map(card => (
          <PCard key={card.label}>
            <PCardBody style={{ padding: "16px 18px" }}>
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 10 }}>
                <span style={{ fontSize: 11, fontWeight: 500, color: "#6b7280" }}>{card.label}</span>
                <div style={{ width: 28, height: 28, borderRadius: 7, background: card.bg, display: "flex", alignItems: "center", justifyContent: "center" }}>
                  <card.Icon style={{ width: 14, height: 14, color: card.color }} />
                </div>
              </div>
              <p style={{ fontSize: 22, fontWeight: 800, color: "#111827", margin: 0, lineHeight: 1 }}>
                {card.value}
                {card.unit && <span style={{ fontSize: 12, fontWeight: 400, color: "#9ca3af", marginLeft: 3 }}>{card.unit}</span>}
              </p>
            </PCardBody>
          </PCard>
        ))}
      </div>

      {/* ══════════════════════════════════════════════════════════════════ */}
      {/* 방문 추이 차트 */}
      {/* ══════════════════════════════════════════════════════════════════ */}
      <PCard style={{ marginBottom: 24 }}>
        <PCardHeader
          title="방문 추이"
          subtitle={TREND_GROUP_RANGE[trendGroupBy]}
          icon={<Activity size={15} />}
          iconColor="#6366f1"
          action={
            <div style={{ display: "flex", gap: 3, background: "#f9fafb", borderRadius: 8, padding: 3, border: "1px solid #e5e7eb" }}>
              {(Object.keys(TREND_GROUP_LABELS) as TrendGroupBy[]).map(g => (
                <button
                  key={g}
                  onClick={() => setTrendGroupBy(g)}
                  style={{
                    padding: "5px 10px",
                    borderRadius: 6,
                    fontSize: 11,
                    fontWeight: 600,
                    border: "none",
                    cursor: "pointer",
                    transition: "all 0.15s",
                    background: trendGroupBy === g ? "#6366f1" : "transparent",
                    color: trendGroupBy === g ? "#ffffff" : "#6b7280",
                  }}
                >
                  {TREND_GROUP_LABELS[g]}
                </button>
              ))}
            </div>
          }
        />
        <PCardBody>
          <ResponsiveContainer width="100%" height={240}>
            <LineChart data={trend ?? []} margin={{ top: 20, right: 16, left: 0, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#f3f4f6" />
              <XAxis
                dataKey="date"
                tick={{ fontSize: 11, fill: "#9ca3af" }}
                tickFormatter={(v) => formatTrendLabel(v, trendGroupBy)}
                interval="preserveStartEnd"
                axisLine={{ stroke: "#e5e7eb" }}
                tickLine={false}
              />
              <YAxis
                tick={{ fontSize: 11, fill: "#9ca3af" }}
                axisLine={false}
                tickLine={false}
              />
              <Tooltip
                contentStyle={{ borderRadius: 10, border: "1px solid #e5e7eb", boxShadow: "0 4px 12px rgba(0,0,0,0.08)" }}
                formatter={(value: number, name: string) => [value.toLocaleString(), name]}
                labelFormatter={(label) => {
                  if (trendGroupBy === "hour") return `시간: ${label}`;
                  if (trendGroupBy === "week") return `주 시작: ${label}`;
                  if (trendGroupBy === "month") return `월: ${label}`;
                  if (trendGroupBy === "year") return `년도: ${label}`;
                  return `날짜: ${label}`;
                }}
              />
              <Legend wrapperStyle={{ fontSize: 12 }} />
              <Line type="monotone" dataKey="total" name="총 방문" stroke="#c7d2fe" strokeWidth={2} dot={false} />
              <Line type="monotone" dataKey="unique" name="순 방문자" stroke="#6366f1" strokeWidth={2.5} dot={{ r: 3, fill: "#6366f1", stroke: "#6366f1" }} activeDot={{ r: 5 }}>
                <LabelList
                  dataKey="unique"
                  position="top"
                  style={{ fontSize: 10, fontWeight: 700, fill: "#4f46e5" }}
                  formatter={(v: number) => v > 0 ? v.toLocaleString() : ""}
                />
              </Line>
            </LineChart>
          </ResponsiveContainer>
        </PCardBody>
      </PCard>

      {/* ══════════════════════════════════════════════════════════════════ */}
      {/* 디바이스 분포 + 방문자 유형 */}
      {/* ══════════════════════════════════════════════════════════════════ */}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14, marginBottom: 24 }}>
        {/* 디바이스 분포 */}
        <PCard>
          <PCardHeader title="디바이스 분포" icon={<Monitor size={15} />} iconColor="#6366f1" />
          <PCardBody>
            <div style={{ display: "flex", alignItems: "center", gap: 16 }}>
              <div style={{ width: 150, height: 150, flexShrink: 0 }}>
                <ResponsiveContainer width="100%" height={150}>
                  <PieChart>
                    <Pie
                      data={devices ?? []}
                      dataKey="count"
                      nameKey="deviceType"
                      cx="50%"
                      cy="50%"
                      innerRadius={42}
                      outerRadius={65}
                      strokeWidth={2}
                      stroke="#ffffff"
                    >
                      {(devices ?? []).map(d => (
                        <Cell key={d.deviceType} fill={DEVICE_COLORS[d.deviceType] ?? "#94a3b8"} />
                      ))}
                    </Pie>
                    <Tooltip contentStyle={{ borderRadius: 8, fontSize: 12 }} />
                  </PieChart>
                </ResponsiveContainer>
              </div>
              <div style={{ flex: 1, display: "flex", flexDirection: "column", gap: 8 }}>
                {(devices ?? []).map(d => {
                  const total = (devices ?? []).reduce((s, x) => s + x.count, 0) || 1;
                  const pct = Math.round((d.count / total) * 100);
                  const label = d.deviceType === "desktop" ? "데스크톱" : d.deviceType === "mobile" ? "모바일" : d.deviceType === "tablet" ? "태블릿" : "기타";
                  return (
                    <div key={d.deviceType} style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                      <div style={{ display: "flex", alignItems: "center", gap: 7 }}>
                        <div style={{ width: 8, height: 8, borderRadius: "50%", background: DEVICE_COLORS[d.deviceType] ?? "#94a3b8", flexShrink: 0 }} />
                        <span style={{ display: "flex", alignItems: "center", gap: 4, fontSize: 12, color: "#374151" }}>
                          <span style={{ color: DEVICE_COLORS[d.deviceType] }}>{DEVICE_ICONS[d.deviceType]}</span>
                          {label}
                        </span>
                      </div>
                      <span style={{ fontSize: 12, fontWeight: 700, color: "#111827" }}>{pct}%</span>
                    </div>
                  );
                })}
              </div>
            </div>
          </PCardBody>
        </PCard>

        {/* 방문자 유형 */}
        <PCard>
          <PCardHeader title="방문자 유형" icon={<Users size={15} />} iconColor="#10b981" />
          <PCardBody>
            <div style={{ display: "flex", alignItems: "center", gap: 16 }}>
              <div style={{ width: 150, height: 150, flexShrink: 0 }}>
                <ResponsiveContainer width="100%" height={150}>
                  <PieChart>
                    <Pie
                      data={userRoles ?? []}
                      dataKey="count"
                      nameKey="userRole"
                      cx="50%"
                      cy="50%"
                      innerRadius={42}
                      outerRadius={65}
                      strokeWidth={2}
                      stroke="#ffffff"
                    >
                      {(userRoles ?? []).map(r => (
                        <Cell key={r.userRole} fill={ROLE_COLORS[r.userRole] ?? "#94a3b8"} />
                      ))}
                    </Pie>
                    <Tooltip contentStyle={{ borderRadius: 8, fontSize: 12 }} />
                  </PieChart>
                </ResponsiveContainer>
              </div>
              <div style={{ flex: 1, display: "flex", flexDirection: "column", gap: 8 }}>
                {(userRoles ?? []).map(r => {
                  const total = (userRoles ?? []).reduce((s, x) => s + x.count, 0) || 1;
                  const pct = Math.round((r.count / total) * 100);
                  const label = r.userRole === "guest" ? "비회원" : r.userRole === "user" ? "회원" : "관리자";
                  return (
                    <div key={r.userRole} style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                      <div style={{ display: "flex", alignItems: "center", gap: 7 }}>
                        <div style={{ width: 8, height: 8, borderRadius: "50%", background: ROLE_COLORS[r.userRole] ?? "#94a3b8", flexShrink: 0 }} />
                        <span style={{ fontSize: 12, color: "#374151" }}>{label}</span>
                      </div>
                      <span style={{ fontSize: 12, fontWeight: 700, color: "#111827" }}>{pct}%</span>
                    </div>
                  );
                })}
              </div>
            </div>
          </PCardBody>
        </PCard>
      </div>

      {/* ══════════════════════════════════════════════════════════════════ */}
      {/* 유입 소스 + 인기 시간대 */}
      {/* ══════════════════════════════════════════════════════════════════ */}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14, marginBottom: 24 }}>
        {/* 유입 소스 */}
        <PCard>
          <PCardHeader title="유입 소스" icon={<Globe size={15} />} iconColor="#f59e0b" />
          <PCardBody>
            <ResponsiveContainer width="100%" height={180}>
              <BarChart data={referrers ?? []} layout="vertical" margin={{ left: 0, right: 8 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#f3f4f6" horizontal={false} />
                <XAxis type="number" tick={{ fontSize: 11, fill: "#9ca3af" }} axisLine={false} tickLine={false} />
                <YAxis
                  type="category"
                  dataKey="referrerType"
                  tick={{ fontSize: 11, fill: "#374151" }}
                  tickFormatter={v => REFERRER_LABELS[v] ?? v}
                  width={62}
                  axisLine={false}
                  tickLine={false}
                />
                <Tooltip
                  contentStyle={{ borderRadius: 10, border: "1px solid #e5e7eb", boxShadow: "0 4px 12px rgba(0,0,0,0.08)" }}
                  formatter={(v, n) => [v, REFERRER_LABELS[n as string] ?? n]}
                />
                <Bar dataKey="count" name="방문수" radius={[0, 5, 5, 0]}>
                  {(referrers ?? []).map(r => (
                    <Cell key={r.referrerType} fill={REFERRER_COLORS[r.referrerType] ?? "#94a3b8"} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </PCardBody>
        </PCard>

        {/* 인기 시간대 */}
        <PCard>
          <PCardHeader title="인기 방문 시간대" icon={<Clock size={15} />} iconColor="#ec4899" />
          <PCardBody>
            <ResponsiveContainer width="100%" height={180}>
              <BarChart data={hourlyData} barSize={7} margin={{ left: -8, right: 4 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#f3f4f6" />
                <XAxis
                  dataKey="hour"
                  tick={{ fontSize: 9, fill: "#9ca3af" }}
                  interval={2}
                  axisLine={{ stroke: "#e5e7eb" }}
                  tickLine={false}
                />
                <YAxis tick={{ fontSize: 11, fill: "#9ca3af" }} axisLine={false} tickLine={false} />
                <Tooltip contentStyle={{ borderRadius: 10, border: "1px solid #e5e7eb", boxShadow: "0 4px 12px rgba(0,0,0,0.08)" }} />
                <Bar dataKey="count" name="방문수" fill="#6366f1" radius={[3, 3, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </PCardBody>
        </PCard>
      </div>

      {/* ══════════════════════════════════════════════════════════════════ */}
      {/* 인기 게시물 TOP 10 */}
      {/* ══════════════════════════════════════════════════════════════════ */}
      <PCard style={{ marginBottom: 32 }}>
        <PCardHeader
          title="인기 게시물 TOP 10"
          subtitle={`${PERIOD_LABELS[period]} 기준`}
          icon={<TrendingUp size={15} />}
          iconColor="#6366f1"
        />
        <PCardBody style={{ padding: 0 }}>
          {!topPosts || topPosts.length === 0 ? (
            <div style={{ textAlign: "center", padding: "32px 20px", color: "#9ca3af", fontSize: 13 }}>
              아직 게시물 방문 데이터가 없습니다.
            </div>
          ) : (
            <div style={{ overflowX: "auto" }}>
              <table style={{ width: "100%", borderCollapse: "collapse" }}>
                <thead>
                  <tr style={{ borderBottom: "1px solid #f3f4f6" }}>
                    {["#", "제목", "방문수", "평균 체류", "평균 스크롤", "이탈 분석"].map((h, i) => (
                      <th
                        key={h}
                        style={{
                          padding: "10px 16px",
                          fontSize: 11,
                          fontWeight: 600,
                          color: "#9ca3af",
                          textAlign: i === 0 ? "center" : i >= 2 ? "right" : "left",
                          background: "#fafafa",
                          whiteSpace: "nowrap",
                        }}
                      >
                        {h}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {topPosts.map((post, idx) => (
                    <tr
                      key={post.postId}
                      style={{ borderBottom: "1px solid #f9fafb", transition: "background 0.1s" }}
                      onMouseEnter={e => (e.currentTarget.style.background = "#fafafa")}
                      onMouseLeave={e => (e.currentTarget.style.background = "transparent")}
                    >
                      <td style={{ padding: "12px 16px", textAlign: "center" }}>
                        <span
                          style={{
                            display: "inline-flex",
                            alignItems: "center",
                            justifyContent: "center",
                            width: 22,
                            height: 22,
                            borderRadius: 6,
                            fontSize: 11,
                            fontWeight: 700,
                            background: idx < 3 ? "#eef2ff" : "#f9fafb",
                            color: idx < 3 ? "#6366f1" : "#9ca3af",
                          }}
                        >
                          {idx + 1}
                        </span>
                      </td>
                      <td style={{ padding: "12px 16px", maxWidth: 280 }}>
                        <a
                          href={post.slug ? `/post/${post.slug}` : `/post/${post.postId}`}
                          target="_blank"
                          rel="noopener noreferrer"
                          style={{
                            fontSize: 13,
                            fontWeight: 500,
                            color: "#111827",
                            textDecoration: "none",
                            display: "flex",
                            alignItems: "center",
                            gap: 4,
                            overflow: "hidden",
                          }}
                          onMouseEnter={e => ((e.currentTarget as HTMLAnchorElement).style.color = "#6366f1")}
                          onMouseLeave={e => ((e.currentTarget as HTMLAnchorElement).style.color = "#111827")}
                        >
                          <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                            {post.title}
                          </span>
                          <ExternalLink style={{ width: 11, height: 11, flexShrink: 0, opacity: 0.4 }} />
                        </a>
                      </td>
                      <td style={{ padding: "12px 16px", textAlign: "right", fontSize: 13, fontWeight: 700, color: "#111827" }}>
                        {post.views.toLocaleString()}
                      </td>
                      <td style={{ padding: "12px 16px", textAlign: "right", fontSize: 12, color: "#6b7280" }}>
                        {formatDuration(post.avgDuration ?? 0)}
                      </td>
                      <td style={{ padding: "12px 16px", textAlign: "right" }}>
                        <span
                          style={{
                            fontSize: 12,
                            fontWeight: 700,
                            color: (post.avgScrollDepth ?? 0) >= 70 ? "#10b981" : (post.avgScrollDepth ?? 0) >= 40 ? "#f59e0b" : "#ef4444",
                          }}
                        >
                          {Math.round(post.avgScrollDepth ?? 0)}%
                        </span>
                      </td>
                      <td style={{ padding: "12px 16px", textAlign: "right" }}>
                        <button
                          onClick={() => setSelectedPost({ id: post.postId!, title: post.title })}
                          style={{
                            display: "inline-flex",
                            alignItems: "center",
                            gap: 3,
                            fontSize: 11,
                            fontWeight: 600,
                            color: "#6366f1",
                            background: "#eef2ff",
                            border: "1px solid #c7d2fe",
                            borderRadius: 6,
                            padding: "4px 9px",
                            cursor: "pointer",
                            transition: "all 0.15s",
                          }}
                          onMouseEnter={e => {
                            (e.currentTarget as HTMLButtonElement).style.background = "#e0e7ff";
                          }}
                          onMouseLeave={e => {
                            (e.currentTarget as HTMLButtonElement).style.background = "#eef2ff";
                          }}
                        >
                          상세 <ChevronRight size={11} />
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </PCardBody>
      </PCard>

      {/* ══════════════════════════════════════════════════════════════════ */}
      {/* 키워드 / 주제 분석 섹션 */}
      {/* ══════════════════════════════════════════════════════════════════ */}
      <SectionHeader
        icon={<Search size={17} />}
        title="키워드 / 주제 분석"
        desc="방문자가 어떤 키워드와 주제로 유입되는지 파악합니다"
        accent="#10b981"
      />

      {/* 검색 키워드 + 검색엔진별 유입 */}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14, marginBottom: 14 }}>
        <PCard>
          <PCardHeader
            title="검색 키워드 TOP 20"
            subtitle="검색엔진에서 유입된 키워드"
            icon={<Search size={14} />}
            iconColor="#10b981"
          />
          <PCardBody>
            {!searchKeywords || searchKeywords.length === 0 ? (
              <div style={{ textAlign: "center", padding: "24px 0", color: "#9ca3af", fontSize: 12 }}>
                검색엔진 유입 데이터가 없습니다.
              </div>
            ) : (
              <div style={{ display: "flex", flexDirection: "column", gap: 8, maxHeight: 280, overflowY: "auto" }}>
                {searchKeywords.map((kw, idx) => (
                  <ProgressRow
                    key={kw.keyword}
                    label={kw.keyword ?? ""}
                    count={kw.count}
                    maxCount={searchKeywords[0]?.count ?? 1}
                    color="#10b981"
                    rank={idx}
                  />
                ))}
              </div>
            )}
          </PCardBody>
        </PCard>

        <PCard>
          <PCardHeader
            title="검색엔진별 유입"
            subtitle="어떤 검색엔진에서 많이 유입되는지"
            icon={<Globe size={14} />}
            iconColor="#3b82f6"
          />
          <PCardBody>
            {!searchEngines || searchEngines.length === 0 ? (
              <div style={{ textAlign: "center", padding: "24px 0", color: "#9ca3af", fontSize: 12 }}>
                검색엔진 유입 데이터가 없습니다.
              </div>
            ) : (
              <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                {searchEngines.map((se) => {
                  const engineColors: Record<string, string> = {
                    Google: "#4285f4", Naver: "#03c75a", Bing: "#008373",
                    Daum: "#ff5722", Yahoo: "#720e9e", DuckDuckGo: "#de5833",
                    Baidu: "#2932e1", "기타": "#94a3b8",
                  };
                  return (
                    <ProgressRow
                      key={se.engine}
                      label={se.engine}
                      count={se.count}
                      maxCount={searchEngines[0]?.count ?? 1}
                      color={engineColors[se.engine] ?? "#94a3b8"}
                    />
                  );
                })}
              </div>
            )}
          </PCardBody>
        </PCard>
      </div>

      {/* 인기 카테고리 + 인기 태그 */}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14, marginBottom: 14 }}>
        <PCard>
          <PCardHeader
            title="인기 카테고리"
            subtitle="방문자가 가장 많이 읽은 카테고리"
            icon={<Tag size={14} />}
            iconColor="#f59e0b"
          />
          <PCardBody>
            {!popularCategories || popularCategories.length === 0 ? (
              <div style={{ textAlign: "center", padding: "24px 0", color: "#9ca3af", fontSize: 12 }}>
                카테고리 데이터가 없습니다.
              </div>
            ) : (
              <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                {popularCategories.map((cat, idx) => {
                  const colors = ["#6366f1", "#f59e0b", "#10b981", "#ec4899", "#3b82f6", "#8b5cf6", "#f97316", "#06b6d4"];
                  return (
                    <ProgressRow
                      key={cat.category}
                      label={cat.label ?? cat.category}
                      count={cat.count}
                      maxCount={popularCategories[0]?.count ?? 1}
                      color={colors[idx % colors.length]}
                      rank={idx}
                    />
                  );
                })}
              </div>
            )}
          </PCardBody>
        </PCard>

        <PCard>
          <PCardHeader
            title="인기 태그"
            subtitle="방문자가 많이 읽은 글의 태그"
            icon={<Hash size={14} />}
            iconColor="#ec4899"
          />
          <PCardBody>
            {!popularTags || popularTags.length === 0 ? (
              <div style={{ textAlign: "center", padding: "24px 0", color: "#9ca3af", fontSize: 12 }}>
                태그 데이터가 없습니다.
              </div>
            ) : (
              <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
                {popularTags.map((tag) => {
                  const maxCount = popularTags[0]?.count ?? 1;
                  const intensity = Math.max(0.3, tag.count / maxCount);
                  const fontSize = 10 + Math.round(intensity * 7);
                  return (
                    <span
                      key={tag.tag}
                      style={{
                        display: "inline-flex",
                        alignItems: "center",
                        gap: 3,
                        padding: "4px 9px",
                        borderRadius: 20,
                        background: `rgba(236,72,153,${0.06 + intensity * 0.1})`,
                        border: `1px solid rgba(236,72,153,${0.15 + intensity * 0.2})`,
                        color: "#be185d",
                        fontSize,
                        fontWeight: 500,
                        cursor: "default",
                        opacity: 0.5 + intensity * 0.5,
                      }}
                      title={`${tag.count}회 방문`}
                    >
                      <Hash size={9} />
                      {tag.tag}
                      <span style={{ fontSize: 9, opacity: 0.6, marginLeft: 1 }}>{tag.count}</span>
                    </span>
                  );
                })}
              </div>
            )}
          </PCardBody>
        </PCard>
      </div>

      {/* ══════════════════════════════════════════════════════════════════ */}
      {/* 기술 환경 섹션 */}
      {/* ══════════════════════════════════════════════════════════════════ */}
      <div style={{ marginTop: 24 }}>
        <SectionHeader
          icon={<Cpu size={17} />}
          title="기술 환경 분석"
          desc="방문자의 OS, 브라우저, 진입 페이지 분포를 파악합니다"
          accent="#6366f1"
        />
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 14, marginBottom: 24 }}>
        {/* OS 분포 */}
        <PCard>
          <PCardHeader title="OS 분포" icon={<Cpu size={14} />} iconColor="#64748b" />
          <PCardBody>
            {!osStats || osStats.length === 0 ? (
              <div style={{ textAlign: "center", padding: "24px 0", color: "#9ca3af", fontSize: 12 }}>OS 데이터가 없습니다.</div>
            ) : (
              <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                {osStats.map((os) => {
                  const total = osStats.reduce((s, x) => s + x.count, 0) || 1;
                  const osColors: Record<string, string> = {
                    Windows: "#0078d4", macOS: "#555", Android: "#3ddc84",
                    iOS: "#555", Linux: "#f97316", other: "#94a3b8",
                  };
                  return (
                    <ProgressRow
                      key={os.os}
                      label={os.os ?? "기타"}
                      count={os.count}
                      maxCount={total}
                      color={osColors[os.os ?? "other"] ?? "#94a3b8"}
                    />
                  );
                })}
              </div>
            )}
          </PCardBody>
        </PCard>

        {/* 브라우저 분포 */}
        <PCard>
          <PCardHeader title="브라우저 분포" icon={<BarChart2 size={14} />} iconColor="#8b5cf6" />
          <PCardBody>
            {!browserStats || browserStats.length === 0 ? (
              <div style={{ textAlign: "center", padding: "24px 0", color: "#9ca3af", fontSize: 12 }}>브라우저 데이터가 없습니다.</div>
            ) : (
              <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                {browserStats.map((br) => {
                  const total = browserStats.reduce((s, x) => s + x.count, 0) || 1;
                  const brColors: Record<string, string> = {
                    Chrome: "#4285f4", Safari: "#555", Firefox: "#ff7139",
                    Edge: "#0078d4", Opera: "#ff1b2d", IE: "#1ebbee", other: "#94a3b8",
                  };
                  return (
                    <ProgressRow
                      key={br.browser}
                      label={br.browser ?? "기타"}
                      count={br.count}
                      maxCount={total}
                      color={brColors[br.browser ?? "other"] ?? "#94a3b8"}
                    />
                  );
                })}
              </div>
            )}
          </PCardBody>
        </PCard>

        {/* 주요 진입 페이지 */}
        <PCard>
          <PCardHeader title="주요 진입 페이지" subtitle="첫 번째로 접근한 페이지" icon={<ArrowRight size={14} />} iconColor="#6366f1" />
          <PCardBody style={{ padding: 0 }}>
            {!entryPages || entryPages.length === 0 ? (
              <div style={{ textAlign: "center", padding: "24px 20px", color: "#9ca3af", fontSize: 12 }}>진입 페이지 데이터가 없습니다.</div>
            ) : (
              <div>
                {entryPages.map((ep, idx) => (
                  <div
                    key={ep.path}
                    style={{
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "space-between",
                      padding: "9px 20px",
                      borderBottom: idx < entryPages.length - 1 ? "1px solid #f9fafb" : "none",
                      gap: 8,
                    }}
                  >
                    <a
                      href={ep.path}
                      target="_blank"
                      rel="noopener noreferrer"
                      style={{
                        fontSize: 11,
                        fontFamily: "monospace",
                        color: "#6366f1",
                        textDecoration: "none",
                        overflow: "hidden",
                        textOverflow: "ellipsis",
                        whiteSpace: "nowrap",
                        flex: 1,
                      }}
                      onMouseEnter={e => ((e.currentTarget as HTMLAnchorElement).style.textDecoration = "underline")}
                      onMouseLeave={e => ((e.currentTarget as HTMLAnchorElement).style.textDecoration = "none")}
                    >
                      {ep.path}
                    </a>
                    <span style={{ fontSize: 11, fontWeight: 700, color: "#374151", flexShrink: 0 }}>
                      {ep.sessions}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </PCardBody>
        </PCard>
      </div>

      {/* ══════════════════════════════════════════════════════════════════ */}
      {/* AI 인사이트 섹션 */}
      {/* ══════════════════════════════════════════════════════════════════ */}
      <div
        style={{
          background: "linear-gradient(135deg, #1e1b4b 0%, #312e81 60%, #1e1b4b 100%)",
          borderRadius: 16,
          padding: "24px 28px",
          marginBottom: 8,
          position: "relative",
          overflow: "hidden",
        }}
      >
        <div style={{ position: "absolute", top: -40, right: -40, width: 160, height: 160, borderRadius: "50%", background: "rgba(139,92,246,0.15)", pointerEvents: "none" }} />
        <div style={{ position: "relative", display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 16, flexWrap: "wrap", marginBottom: 20 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
            <div style={{ width: 42, height: 42, borderRadius: 11, background: "rgba(139,92,246,0.25)", border: "1px solid rgba(139,92,246,0.4)", display: "flex", alignItems: "center", justifyContent: "center" }}>
              <Zap style={{ width: 20, height: 20, color: "#c4b5fd" }} />
            </div>
            <div>
              <h2 style={{ fontSize: 15, fontWeight: 700, color: "#ffffff", margin: 0 }}>
                AI 방문자 인사이트 &amp; 콘텐츠 주제 추천
              </h2>
              <p style={{ fontSize: 12, color: "#a5b4fc", marginTop: 4 }}>
                인기 키워드 데이터를 분석하여 작성하면 좋을 블로그 포스트 주제를 AI가 구체적으로 추천합니다
              </p>
            </div>
          </div>
          <button
            onClick={() => aiInsightMutation.mutate({ period })}
            disabled={aiInsightMutation.isPending}
            style={{
              display: "flex",
              alignItems: "center",
              gap: 7,
              padding: "10px 18px",
              borderRadius: 10,
              background: aiInsightMutation.isPending ? "rgba(139,92,246,0.5)" : "rgba(139,92,246,0.9)",
              border: "1px solid rgba(167,139,250,0.5)",
              color: "#ffffff",
              fontSize: 13,
              fontWeight: 600,
              cursor: aiInsightMutation.isPending ? "not-allowed" : "pointer",
              flexShrink: 0,
              transition: "all 0.15s",
            }}
          >
            {aiInsightMutation.isPending ? (
              <><Loader2 size={14} className="animate-spin" />분석 중...</>
            ) : (
              <><Lightbulb size={14} />AI 인사이트 생성</>
            )}
          </button>
        </div>

        {/* AI 결과 영역 */}
        <div
          style={{
            background: "rgba(255,255,255,0.05)",
            border: "1px solid rgba(255,255,255,0.1)",
            borderRadius: 12,
            padding: "20px",
            position: "relative",
          }}
        >
          {aiInsightMutation.isPending && (
            <div style={{ textAlign: "center", padding: "32px 0", color: "#a5b4fc" }}>
              <Loader2 size={28} className="mx-auto mb-3 animate-spin" style={{ color: "#a5b4fc" }} />
              <p style={{ fontSize: 13, fontWeight: 500, color: "#e0e7ff", margin: "0 0 6px" }}>키워드 데이터 분석 중...</p>
              <p style={{ fontSize: 11, color: "#818cf8", margin: 0 }}>검색 키워드, 인기 카테고리, 태그를 종합 분석하여 주제를 추천하고 있습니다</p>
            </div>
          )}
          {!aiInsightMutation.isPending && aiInsightText ? (
            <div>
              <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 14 }}>
                <span style={{ fontSize: 11, fontWeight: 600, color: "#c7d2fe", background: "rgba(99,102,241,0.3)", border: "1px solid rgba(99,102,241,0.4)", borderRadius: 6, padding: "3px 9px" }}>
                  {aiInsightPeriod} 분석
                </span>
                <span style={{ fontSize: 11, color: "#94a3b8" }}>방문자 행동 분석 및 콘텐츠 전략</span>
              </div>
              <div style={{ background: "rgba(255,255,255,0.08)", borderRadius: 10, padding: "16px", marginBottom: 16, color: "#e0e7ff", fontSize: 13, lineHeight: 1.7 }}>
                  <Suspense fallback={<Loader2 className="animate-spin" size={16} />}>
                    <LazyStreamdown>{aiInsightText ?? ""}</LazyStreamdown>
                  </Suspense>
              </div>
              {aiRecommendations.length > 0 && (
                <div>
                  <p style={{ fontSize: 13, fontWeight: 700, color: "#c4b5fd", marginBottom: 12, display: "flex", alignItems: "center", gap: 6 }}>
                    <Lightbulb size={14} />
                    작성 추천 포스트 주제 ({aiRecommendations.length}개)
                  </p>
                  <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                    {aiRecommendations.map((rec, idx) => (
                      <div
                        key={idx}
                        style={{
                          background: "rgba(255,255,255,0.07)",
                          border: "1px solid rgba(255,255,255,0.12)",
                          borderRadius: 10,
                          padding: "14px 16px",
                          display: "flex",
                          alignItems: "flex-start",
                          justifyContent: "space-between",
                          gap: 12,
                        }}
                      >
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 7, flexWrap: "wrap" }}>
                            <span
                              style={{
                                fontSize: 11,
                                fontWeight: 600,
                                borderRadius: 5,
                                padding: "2px 8px",
                                background: rec.priority === "high" ? "rgba(239,68,68,0.2)" : rec.priority === "medium" ? "rgba(245,158,11,0.2)" : "rgba(148,163,184,0.2)",
                                color: rec.priority === "high" ? "#fca5a5" : rec.priority === "medium" ? "#fcd34d" : "#94a3b8",
                                border: `1px solid ${rec.priority === "high" ? "rgba(239,68,68,0.3)" : rec.priority === "medium" ? "rgba(245,158,11,0.3)" : "rgba(148,163,184,0.2)"}`,
                              }}
                            >
                              {rec.priority === "high" ? "🔥 즉시 작성" : rec.priority === "medium" ? "⏰ 이번 주" : "📅 다음 달"}
                            </span>
                            <span style={{ fontSize: 11, color: "#a5b4fc", background: "rgba(99,102,241,0.2)", border: "1px solid rgba(99,102,241,0.3)", borderRadius: 5, padding: "2px 8px" }}>
                              {rec.category}
                            </span>
                          </div>
                          <p style={{ fontSize: 13, fontWeight: 600, color: "#e0e7ff", margin: "0 0 5px", lineHeight: 1.4 }}>{rec.title}</p>
                          <p style={{ fontSize: 11, color: "#94a3b8", margin: "0 0 6px", lineHeight: 1.5 }}>{rec.reason}</p>
                          <p style={{ fontSize: 11, color: "#818cf8", margin: "0 0 7px" }}>
                            <span style={{ fontWeight: 600 }}>대상 독자:</span> {rec.targetAudience}
                          </p>
                          <div style={{ display: "flex", flexWrap: "wrap", gap: 4 }}>
                            {rec.seoKeywords.map((kw, ki) => (
                              <span key={ki} style={{ fontSize: 10, background: "rgba(99,102,241,0.2)", color: "#a5b4fc", borderRadius: 4, padding: "2px 6px", border: "1px solid rgba(99,102,241,0.25)" }}>
                                #{kw}
                              </span>
                            ))}
                          </div>
                        </div>
                        <a
                          href={`/write?title=${encodeURIComponent(rec.title)}`}
                          style={{
                            flexShrink: 0,
                            display: "inline-flex",
                            alignItems: "center",
                            gap: 5,
                            fontSize: 11,
                            fontWeight: 600,
                            color: "#ffffff",
                            background: "rgba(139,92,246,0.7)",
                            border: "1px solid rgba(167,139,250,0.4)",
                            borderRadius: 8,
                            padding: "7px 12px",
                            textDecoration: "none",
                            transition: "all 0.15s",
                            whiteSpace: "nowrap",
                          }}
                          onMouseEnter={e => ((e.currentTarget as HTMLAnchorElement).style.background = "rgba(139,92,246,0.9)")}
                          onMouseLeave={e => ((e.currentTarget as HTMLAnchorElement).style.background = "rgba(139,92,246,0.7)")}
                        >
                          <ArrowRight size={11} />
                          글쓰기
                        </a>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          ) : !aiInsightMutation.isPending && (
            <div style={{ textAlign: "center", padding: "32px 0" }}>
              <Zap size={32} style={{ color: "#4f46e5", margin: "0 auto 10px", display: "block" }} />
              <p style={{ fontSize: 13, fontWeight: 500, color: "#c7d2fe", margin: "0 0 5px" }}>AI 인사이트 생성 버튼을 클릭하세요</p>
              <p style={{ fontSize: 11, color: "#818cf8", margin: 0 }}>검색 키워드와 인기 카테고리 데이터를 바탕으로<br />구체적인 블로그 포스트 주제를 추천합니다</p>
            </div>
          )}
        </div>
      </div>

      {/* ══════════════════════════════════════════════════════════════════ */}
      {/* 일자별 페이지별 조회수 분석 섹션 */}
      {/* ══════════════════════════════════════════════════════════════════ */}
      <SectionHeader
        icon={<Calendar size={17} />}
        title="일자별 조회수 상세 분석"
        desc="날짜를 선택하면 해당 날의 페이지별 조회수, 시간대, 유입 소스를 확인합니다"
        accent="#8b5cf6"
      />

      {/* 날짜 선택 + 30일 달력 바 */}
      <PCard style={{ marginBottom: 14 }}>
        <PCardHeader
          title="날짜 선택"
          subtitle="최근 30일 중 분석할 날짜를 선택하세요"
          icon={<Calendar size={14} />}
          iconColor="#8b5cf6"
          action={
            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <button
                onClick={() => {
                  const d = new Date(selectedDate);
                  d.setDate(d.getDate() - 1);
                  setSelectedDate(d.toISOString().slice(0, 10));
                }}
                style={{ background: "none", border: "1px solid #e5e7eb", borderRadius: 6, padding: "3px 8px", cursor: "pointer", fontSize: 12, color: "#374151" }}
              >
                <ChevronLeft size={14} />
              </button>
              <input
                type="date"
                value={selectedDate}
                max={todayStr}
                onChange={e => setSelectedDate(e.target.value)}
                style={{ border: "1px solid #e5e7eb", borderRadius: 6, padding: "4px 8px", fontSize: 13, color: "#111827", cursor: "pointer" }}
              />
              <button
                onClick={() => {
                  const d = new Date(selectedDate);
                  d.setDate(d.getDate() + 1);
                  const next = d.toISOString().slice(0, 10);
                  if (next <= todayStr) setSelectedDate(next);
                }}
                disabled={selectedDate >= todayStr}
                style={{ background: "none", border: "1px solid #e5e7eb", borderRadius: 6, padding: "3px 8px", cursor: selectedDate >= todayStr ? "not-allowed" : "pointer", fontSize: 12, color: selectedDate >= todayStr ? "#d1d5db" : "#374151" }}
              >
                <ChevronRightIcon size={14} />
              </button>
              <button
                onClick={() => setSelectedDate(todayStr)}
                style={{ background: "#8b5cf6", color: "#fff", border: "none", borderRadius: 6, padding: "4px 10px", cursor: "pointer", fontSize: 12, fontWeight: 600 }}
              >
                오늘
              </button>
            </div>
          }
        />
        {/* 최근 30일 바 차트 */}
        {recentDailyTotals && recentDailyTotals.length > 0 && (
          <PCardBody>
            <ResponsiveContainer width="100%" height={80}>
              <BarChart data={recentDailyTotals.map(r => ({ date: r.date.slice(5), views: r.views, full: r.date }))} barSize={8}>
                <XAxis dataKey="date" tick={{ fontSize: 10, fill: "#9ca3af" }} interval={4} />
                <Tooltip
                  formatter={(v: number) => [`${v}회`, "조회수"]}
                  labelFormatter={(label: string, payload) => {
                    const full = payload?.[0]?.payload?.full ?? label;
                    const isSelected = full === selectedDate;
                    return `${full}${isSelected ? " (선택됨)" : ""}`;
                  }}
                />
                <Bar
                  dataKey="views"
                  radius={[3, 3, 0, 0]}
                  onClick={(data: { full: string }) => setSelectedDate(data.full)}
                  style={{ cursor: "pointer" }}
                >
                  {recentDailyTotals.map((r) => (
                    <Cell key={r.date} fill={r.date === selectedDate ? "#8b5cf6" : "#c4b5fd"} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
            <p style={{ fontSize: 11, color: "#9ca3af", textAlign: "center", margin: "4px 0 0" }}>막대를 클릭하면 해당 날짜로 이동합니다</p>
          </PCardBody>
        )}
      </PCard>

      {/* 선택 날짜 요약 */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 12, marginBottom: 14 }}>
        {/* 총 조회수 */}
        <PCard>
          <PCardBody>
            <div style={{ textAlign: "center", padding: "8px 0" }}>
              <p style={{ fontSize: 11, color: "#6b7280", margin: "0 0 4px" }}>{selectedDate} 총 조회수</p>
              <p style={{ fontSize: 28, fontWeight: 800, color: "#8b5cf6", margin: 0 }}>
                {dailyPagesLoading ? <Loader2 size={20} className="animate-spin" style={{ display: "inline" }} /> : (dailyPages ?? []).reduce((s, r) => s + Number(r.views), 0).toLocaleString()}
              </p>
            </div>
          </PCardBody>
        </PCard>
        {/* 고유 방문자 */}
        <PCard>
          <PCardBody>
            <div style={{ textAlign: "center", padding: "8px 0" }}>
              <p style={{ fontSize: 11, color: "#6b7280", margin: "0 0 4px" }}>고유 세션</p>
              <p style={{ fontSize: 28, fontWeight: 800, color: "#6366f1", margin: 0 }}>
                {dailyPagesLoading ? <Loader2 size={20} className="animate-spin" style={{ display: "inline" }} /> : Math.max(...(dailyPages ?? []).map(r => Number(r.uniqueSessions)), 0) === 0 ? (dailyPages ?? []).reduce((s, r) => s + Number(r.uniqueSessions), 0).toLocaleString() : (dailyPages ?? []).reduce((s, r) => s + Number(r.uniqueSessions), 0).toLocaleString()}
              </p>
            </div>
          </PCardBody>
        </PCard>
        {/* 방문 페이지 수 */}
        <PCard>
          <PCardBody>
            <div style={{ textAlign: "center", padding: "8px 0" }}>
              <p style={{ fontSize: 11, color: "#6b7280", margin: "0 0 4px" }}>방문 페이지 수</p>
              <p style={{ fontSize: 28, fontWeight: 800, color: "#10b981", margin: 0 }}>
                {dailyPagesLoading ? <Loader2 size={20} className="animate-spin" style={{ display: "inline" }} /> : (dailyPages ?? []).length}
              </p>
            </div>
          </PCardBody>
        </PCard>
      </div>

      {/* 시간대별 + 유입 소스별 */}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14, marginBottom: 14 }}>
        {/* 시간대별 조회수 */}
        <PCard>
          <PCardHeader title="시간대별 조회수" subtitle={selectedDate} icon={<Clock size={14} />} iconColor="#8b5cf6" />
          <PCardBody>
            {dailyHourly && dailyHourly.length > 0 ? (
              <ResponsiveContainer width="100%" height={160}>
                <BarChart data={Array.from({ length: 24 }, (_, i) => {
                  const hh = String(i).padStart(2, '0');
                  const found = (dailyHourly ?? []).find(h => h.hour === hh);
                  return { hour: `${i}시`, count: found ? Number(found.views) : 0 };
                })} barSize={8}>
                  <XAxis dataKey="hour" tick={{ fontSize: 9, fill: "#9ca3af" }} interval={2} />
                  <YAxis tick={{ fontSize: 9, fill: "#9ca3af" }} width={24} />
                  <Tooltip formatter={(v: number) => [`${v}회`, "조회수"]} />
                  <Bar dataKey="count" fill="#8b5cf6" radius={[3, 3, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            ) : (
              <div style={{ textAlign: "center", padding: "32px 0", color: "#9ca3af", fontSize: 13 }}>데이터 없음</div>
            )}
          </PCardBody>
        </PCard>

        {/* 유입 소스별 */}
        <PCard>
          <PCardHeader title="유입 소스별" subtitle={selectedDate} icon={<Globe size={14} />} iconColor="#10b981" />
          <PCardBody>
            {dailyReferrers && dailyReferrers.length > 0 ? (
              <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                {dailyReferrers.map((r, i) => (
                  <ProgressRow
                    key={r.referrerType}
                    label={REFERRER_LABELS[r.referrerType] ?? r.referrerType}
                    count={Number(r.views)}
                    maxCount={Number(dailyReferrers[0]?.views ?? 1)}
                    color={REFERRER_COLORS[r.referrerType] ?? "#94a3b8"}
                    rank={i}
                  />
                ))}
              </div>
            ) : (
              <div style={{ textAlign: "center", padding: "32px 0", color: "#9ca3af", fontSize: 13 }}>데이터 없음</div>
            )}
          </PCardBody>
        </PCard>
      </div>

      {/* 페이지별 조회수 상세 테이블 */}
      <PCard style={{ marginBottom: 24 }}>
        <PCardHeader
          title={`페이지별 조회수 — ${selectedDate}`}
          subtitle="관리자 방문 제외, 상위 30개 페이지"
          icon={<Eye size={14} />}
          iconColor="#8b5cf6"
        />
        <PCardBody style={{ padding: 0 }}>
          {dailyPagesLoading ? (
            <div style={{ display: "flex", justifyContent: "center", padding: 32 }}>
              <Loader2 className="animate-spin" size={24} style={{ color: "#8b5cf6" }} />
            </div>
          ) : !dailyPages || dailyPages.length === 0 ? (
            <div style={{ textAlign: "center", padding: "40px 0", color: "#9ca3af", fontSize: 13 }}>해당 날짜에 방문 데이터가 없습니다</div>
          ) : (
            <div style={{ overflowX: "auto" }}>
              <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
                <thead>
                  <tr style={{ background: "#f9fafb", borderBottom: "1px solid #e5e7eb" }}>
                    <th style={{ padding: "10px 16px", textAlign: "left", fontWeight: 600, color: "#374151", width: 32 }}>#</th>
                    <th style={{ padding: "10px 16px", textAlign: "left", fontWeight: 600, color: "#374151" }}>페이지 경로</th>
                    <th style={{ padding: "10px 16px", textAlign: "right", fontWeight: 600, color: "#374151", width: 80 }}>조회수</th>
                    <th style={{ padding: "10px 16px", textAlign: "right", fontWeight: 600, color: "#374151", width: 90 }}>고유 세션</th>
                    <th style={{ padding: "10px 16px", textAlign: "right", fontWeight: 600, color: "#374151", width: 90 }}>평균 체류</th>
                  </tr>
                </thead>
                <tbody>
                  {dailyPages.map((row, i) => (
                    <tr key={row.path} style={{ borderBottom: "1px solid #f3f4f6", background: i % 2 === 0 ? "#fff" : "#fafafa" }}>
                      <td style={{ padding: "9px 16px", color: "#9ca3af", fontWeight: 700 }}>{i + 1}</td>
                      <td style={{ padding: "9px 16px" }}>
                        <a
                          href={row.path}
                          target="_blank"
                          rel="noopener noreferrer"
                          style={{ color: "#6366f1", textDecoration: "none", fontFamily: "monospace", fontSize: 12 }}
                        >
                          {row.path}
                          <ExternalLink size={10} style={{ marginLeft: 4, opacity: 0.5 }} />
                        </a>
                      </td>
                      <td style={{ padding: "9px 16px", textAlign: "right", fontWeight: 700, color: "#111827" }}>{Number(row.views).toLocaleString()}</td>
                      <td style={{ padding: "9px 16px", textAlign: "right", color: "#6b7280" }}>{Number(row.uniqueSessions).toLocaleString()}</td>
                      <td style={{ padding: "9px 16px", textAlign: "right", color: "#6b7280" }}>{formatDuration(Number(row.avgDuration))}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </PCardBody>
      </PCard>

      {/* 데이터 없을 때 안내 */}
      {(summary?.total ?? 0) === 0 && (
        <div
          style={{
            marginTop: 16,
            padding: "14px 18px",
            background: "#eff6ff",
            border: "1px solid #bfdbfe",
            borderRadius: 10,
            fontSize: 13,
            color: "#1d4ed8",
          }}
        >
          <strong>방문 데이터 수집 중</strong> — 사이트를 방문하면 자동으로 데이터가 수집됩니다. 실제 방문자가 있어야 통계가 표시됩니다.
        </div>
      )}

      {/* 스크롤 깊이 모달 */}
      {selectedPost && (
        <ScrollDepthModal
          postId={selectedPost.id}
          postTitle={selectedPost.title}
          open={true}
          onClose={() => setSelectedPost(null)}
        />
      )}
    </div>
  );
}
