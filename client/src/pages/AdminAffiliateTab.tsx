/*
 * AdminAffiliateTab - 제휴 마케팅 설정 탭
 *
 * 전략 A — 개발자 장비 연결 방식
 * - 쿠팡 파트너스: API 자동 검색 + 개발자 장비 키워드 관리 + 본문 최소 배치
 * - 쇼핑 커넥트: 위젯 HTML 코드 입력 + 배치 위치 설정
 */
import { useState, useEffect, useMemo } from "react";
import { makeSingleCoupangCardHtml, makeCurationGridHtml } from "@/lib/unifiedAdInsert";
import { trpc } from "@/lib/trpc";
import { toast } from "sonner";
import { Switch } from "@/components/ui/switch";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import {
  ShoppingCart, Store, Plus, Trash2, RefreshCw,
  CheckCircle2, XCircle, Eye, EyeOff, ChevronDown, ChevronUp,
  Info, Loader2, Save, AlertCircle, Tag, Key, Zap, Globe,
  Layers, BarChart2, Settings2, MapPin, Palette,
} from "lucide-react";

// ─── 개발자 장비 기본 키워드 ─────────────────────────────────────────────────
const DEFAULT_DEV_KEYWORDS = [
  "개발자 노트북",
  "듀얼 모니터",
  "기계식 키보드",
  "무선 마우스",
  "노이즈캔슬링 헤드셋",
  "화상회의 웹캠",
];

// 쇼핑 커넥트 배치 위치 옵션
const SHOP_POSITIONS = [
  { id: "before_conclusion", label: "결론부 직전" },
  { id: "after_qa", label: "묻고 답하기 이후" },
  { id: "after_spec_table", label: "스펙 비교표 이후" },
  { id: "post_bottom", label: "글 최하단" },
] as const;
type ShopPositionKey = typeof SHOP_POSITIONS[number]["id"];

// 카테고리별 키워드 타입: { [categoryKey]: string[] }
type CategoryKeywordsMap = Record<string, string[]>;

// ─── 섹션 색상 테마 정의 ─────────────────────────────────────────────────────
const SECTION_THEMES = {
  // 활성화 토글: 쿠팡 빨간색
  toggle: {
    border: "#e8003d",
    bg: "#fff1f2",
    headerBg: "#fff1f2",
    headerBorder: "#fecdd3",
    titleColor: "#9f1239",
    iconColor: "#e8003d",
    badgeBg: "#fecdd3",
    badgeColor: "#9f1239",
  },
  // API 키 설정: 파란색 (보안)
  apiKey: {
    border: "#3b82f6",
    bg: "#eff6ff",
    headerBg: "#dbeafe",
    headerBorder: "#93c5fd",
    titleColor: "#1e40af",
    iconColor: "#2563eb",
    badgeBg: "#dbeafe",
    badgeColor: "#1e40af",
  },
  // API 자동 검색: 주황색
  autoSearch: {
    border: "#f97316",
    bg: "#fff7ed",
    headerBg: "#ffedd5",
    headerBorder: "#fed7aa",
    titleColor: "#9a3412",
    iconColor: "#ea580c",
    badgeBg: "#fed7aa",
    badgeColor: "#9a3412",
  },
  // 전역 키워드: 초록색
  globalKeyword: {
    border: "#16a34a",
    bg: "#f0fdf4",
    headerBg: "#dcfce7",
    headerBorder: "#86efac",
    titleColor: "#14532d",
    iconColor: "#16a34a",
    badgeBg: "#dcfce7",
    badgeColor: "#14532d",
  },
  // 카테고리별 키워드: 파란색
  categoryKeyword: {
    border: "#2563eb",
    bg: "#eff6ff",
    headerBg: "#dbeafe",
    headerBorder: "#93c5fd",
    titleColor: "#1e3a8a",
    iconColor: "#2563eb",
    badgeBg: "#dbeafe",
    badgeColor: "#1e40af",
  },
  // 배치 위치: 보라색
  placement: {
    border: "#7c3aed",
    bg: "#f5f3ff",
    headerBg: "#ede9fe",
    headerBorder: "#c4b5fd",
    titleColor: "#4c1d95",
    iconColor: "#7c3aed",
    badgeBg: "#ede9fe",
    badgeColor: "#4c1d95",
  },
  // 카드 스타일/디자인: 인디고
  cardStyle: {
    border: "#4338ca",
    bg: "#eef2ff",
    headerBg: "#e0e7ff",
    headerBorder: "#a5b4fc",
    titleColor: "#312e81",
    iconColor: "#4338ca",
    badgeBg: "#e0e7ff",
    badgeColor: "#312e81",
  },
  // 고급 설정: 회색
  advanced: {
    border: "#9ca3af",
    bg: "#f9fafb",
    headerBg: "#f3f4f6",
    headerBorder: "#d1d5db",
    titleColor: "#374151",
    iconColor: "#6b7280",
    badgeBg: "#e5e7eb",
    badgeColor: "#374151",
  },
  // 클릭 통계: 슬레이트
  stats: {
    border: "#475569",
    bg: "#f8fafc",
    headerBg: "#f1f5f9",
    headerBorder: "#cbd5e1",
    titleColor: "#0f172a",
    iconColor: "#475569",
    badgeBg: "#e2e8f0",
    badgeColor: "#0f172a",
  },
};

// ─── 섹션 카드 헬퍼 컴포넌트 ─────────────────────────────────────────────────
function SectionCard({
  theme,
  icon,
  title,
  subtitle,
  badge,
  children,
  collapsible,
  collapsed,
  onToggle,
  extra,
}: {
  theme: typeof SECTION_THEMES[keyof typeof SECTION_THEMES];
  icon: React.ReactNode;
  title: string;
  subtitle?: string;
  badge?: React.ReactNode;
  children: React.ReactNode;
  collapsible?: boolean;
  collapsed?: boolean;
  onToggle?: () => void;
  extra?: React.ReactNode;
}) {
  return (
    <div style={{
      border: `1.5px solid ${theme.border}`,
      borderRadius: 12,
      marginBottom: 14,
      overflow: "hidden",
      boxShadow: `0 2px 8px ${theme.border}18`,
    }}>
      {/* 섹션 헤더 */}
      <div
        style={{
          background: theme.headerBg,
          borderBottom: `1px solid ${theme.headerBorder}`,
          padding: "10px 16px",
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          cursor: collapsible ? "pointer" : "default",
        }}
        onClick={collapsible ? onToggle : undefined}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <span style={{ color: theme.iconColor, display: "flex", alignItems: "center" }}>{icon}</span>
          <div>
            <span style={{ fontSize: 13, fontWeight: 700, color: theme.titleColor }}>{title}</span>
            {subtitle && (
              <span style={{ fontSize: 11, color: theme.iconColor, marginLeft: 8, opacity: 0.8 }}>{subtitle}</span>
            )}
          </div>
          {badge && <span style={{ marginLeft: 4 }}>{badge}</span>}
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          {extra}
          {collapsible && (
            <span style={{ color: theme.iconColor }}>
              {collapsed ? <ChevronDown size={15} /> : <ChevronUp size={15} />}
            </span>
          )}
        </div>
      </div>
      {/* 섹션 내용 */}
      {(!collapsible || !collapsed) && (
        <div style={{ padding: "14px 16px", background: "#fff" }}>
          {children}
        </div>
      )}
    </div>
  );
}

// ─── 쿠팡 카드 실시간 미리보기 컴포넌트 ─────────────────────────────────────
const PREVIEW_PRODUCT = {
  productId: "preview",
  productName: "삼성 갤럭시북4 프로 360 노트북 16인치 코어 Ultra 7 16GB 512GB",
  productPrice: 1890000,
  productImage: "https://static.coupangcdn.com/image/retail/images/1000000000-vendor-image.jpg",
  productUrl: "https://www.coupang.com",
  categoryName: "노트북",
};

// 큐레이션 그리드 미리보기용 샘플 상품 (3개)
const PREVIEW_PRODUCTS = [
  {
    productId: "preview-1",
    productName: "삼성 갤럭시북4 프로 360 노트북 16인치",
    productPrice: 1890000,
    productImage: "https://static.coupangcdn.com/image/retail/images/1000000000-vendor-image.jpg",
    productUrl: "https://www.coupang.com",
    categoryName: "노트북",
  },
  {
    productId: "preview-2",
    productName: "LG 울트라기어 게이밍 모니터 27인치 QHD",
    productPrice: 349000,
    productImage: "https://static.coupangcdn.com/image/retail/images/1000000000-vendor-image.jpg",
    productUrl: "https://www.coupang.com",
    categoryName: "모니터",
  },
  {
    productId: "preview-3",
    productName: "로지텍 MX Keys 무선 키보드 한글",
    productPrice: 129000,
    productImage: "https://static.coupangcdn.com/image/retail/images/1000000000-vendor-image.jpg",
    productUrl: "https://www.coupang.com",
    categoryName: "키보드",
  },
  {
    productId: "preview-4",
    productName: "로지텍 MX Master 3 무선 마우스",
    productPrice: 89000,
    productImage: "https://static.coupangcdn.com/image/retail/images/1000000000-vendor-image.jpg",
    productUrl: "https://www.coupang.com",
    categoryName: "마우스",
  },
  {
    productId: "preview-5",
    productName: "소니 WH-1000XM5 노이즈캔슬링 헤드폰",
    productPrice: 379000,
    productImage: "https://static.coupangcdn.com/image/retail/images/1000000000-vendor-image.jpg",
    productUrl: "https://www.coupang.com",
    categoryName: "헤드폰",
  },
];

function CoupangCardPreview({
  style,
  size,
  cardBgColor,
  btnColor,
  btnText,
  disclaimerText,
  curationGridCount,
  curationGridTitle,
  curationGridTitleStyle,
}: {
  style: "text_link" | "name_price" | "image_compact" | "image_detail" | "image_full" | "link_card" | "curation_grid";
  size: "small" | "medium" | "large";
  cardBgColor: string;
  btnColor: string;
  btnText: string;
  disclaimerText: string;
  curationGridCount?: number;
  curationGridTitle?: string;
  curationGridTitleStyle?: "fire" | "sale" | "new" | "pick" | "plain";
}) {
  const html = useMemo(() => {
    if (style === "curation_grid") {
      return makeCurationGridHtml(PREVIEW_PRODUCTS, disclaimerText, curationGridCount ?? 3, cardBgColor, btnColor, btnText, curationGridTitle ?? "", curationGridTitleStyle ?? "fire");
    }
    return makeSingleCoupangCardHtml(PREVIEW_PRODUCT, style, size, cardBgColor, btnColor, btnText);
  }, [style, size, cardBgColor, btnColor, btnText, curationGridCount, disclaimerText, curationGridTitle, curationGridTitleStyle]);
  return (
    <div style={{ marginTop: 14, marginBottom: 4 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 8 }}>
        <Eye size={13} style={{ color: "#6b7280" }} />
        <span style={{ fontSize: 11, fontWeight: 600, color: "#6b7280", textTransform: "uppercase", letterSpacing: "0.5px" }}>
          실시간 미리보기
        </span>
      </div>
      <div
        style={{
          border: "1.5px dashed #e5e7eb",
          borderRadius: 10,
          padding: "12px 14px",
          background: "#fafafa",
          pointerEvents: "none",
          userSelect: "none",
        }}
      >
        <div dangerouslySetInnerHTML={{ __html: html }} />
        {/* curation_grid는 makeCurationGridHtml 내부에서 이미 disclaimer를 포함하므로 중복 출력 방지 */}
        {disclaimerText && style !== "curation_grid" && (
          <p style={{ fontSize: 14, color: "#374151", fontWeight: 500, margin: "8px 0 0", textAlign: "center", padding: "8px 14px", background: "#f9fafb", borderRadius: 4, border: "1px solid #e5e7eb", lineHeight: 1.6 }}>
            ⚠️ {disclaimerText}
          </p>
        )}
      </div>
    </div>
  );
}

// ─── 카테고리 키워드 편집 서브컴포넌트 ───────────────────────────────────────
function CategoryKeywordRow({
  categoryKey,
  categoryLabel,
  keywords,
  onChange,
}: {
  categoryKey: string;
  categoryLabel: string;
  keywords: string[];
  onChange: (newKeywords: string[]) => void;
}) {
  const [newKw, setNewKw] = useState("");

  const addKw = () => {
    const kw = newKw.trim();
    if (!kw || keywords.includes(kw)) return;
    if (keywords.length >= 10) { toast.error("카테고리당 키워드는 최대 10개입니다."); return; }
    onChange([...keywords, kw]);
    setNewKw("");
  };
  const removeKw = (kw: string) => onChange(keywords.filter(k => k !== kw));

  return (
    <div style={{
      border: keywords.length > 0 ? "1px solid #bfdbfe" : "1px solid #e5e7eb",
      borderRadius: 8,
      padding: "12px 14px",
      marginBottom: 10,
      background: keywords.length > 0 ? "#f0f7ff" : "#fff",
    }}>
      <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 8 }}>
        <Tag size={12} color="#2563eb" />
        <span style={{ fontSize: 12, fontWeight: 700, color: "#1e3a8a" }}>{categoryLabel}</span>
        <span style={{ fontSize: 10, color: "#9ca3af", fontFamily: "monospace" }}>({categoryKey})</span>
        {keywords.length === 0 && (
          <span style={{ fontSize: 10, color: "#9ca3af", marginLeft: "auto" }}>미설정 시 전역 키워드 사용</span>
        )}
        {keywords.length > 0 && (
          <Badge style={{ fontSize: 9, background: "#dbeafe", color: "#1e40af", border: "none", padding: "1px 6px", marginLeft: "auto" }}>
            {keywords.length}개
          </Badge>
        )}
      </div>
      {keywords.length > 0 && (
        <div style={{ display: "flex", flexWrap: "wrap", gap: 5, marginBottom: 8 }}>
          {keywords.map(kw => (
            <div key={kw} style={{
              display: "flex", alignItems: "center", gap: 3,
              background: "#dbeafe", border: "1px solid #93c5fd",
              borderRadius: 20, padding: "2px 8px 2px 10px",
              fontSize: 11, color: "#1e40af",
            }}>
              {kw}
              <button onClick={() => removeKw(kw)} style={{ background: "none", border: "none", cursor: "pointer", color: "#60a5fa", padding: 0, lineHeight: 1 }}>
                <Trash2 size={10} />
              </button>
            </div>
          ))}
        </div>
      )}
      <div style={{ display: "flex", gap: 5 }}>
        <Input
          value={newKw}
          onChange={e => setNewKw(e.target.value)}
          onKeyDown={e => e.key === "Enter" && addKw()}
          placeholder={`예: ${categoryKey.includes("vibe") ? "개발자 노트북" : "웹캠, 마이크"}`}
          style={{ fontSize: 11, flex: 1, height: 30 }}
        />
        <Button size="sm" variant="outline" onClick={addKw} style={{ fontSize: 11, height: 30, padding: "0 10px", borderColor: "#2563eb", color: "#2563eb" }}>
          <Plus size={11} style={{ marginRight: 2 }} /> 추가
        </Button>
        {keywords.length > 0 && (
          <Button size="sm" variant="outline" onClick={() => onChange([])} style={{ fontSize: 11, height: 30, padding: "0 10px", color: "#9ca3af" }}>
            초기화
          </Button>
        )}
      </div>
    </div>
  );
}

// ─── 컴포넌트 ────────────────────────────────────────────────────────────────
export function AdminAffiliateTab() {
  const { data: siteConfig, refetch } = trpc.admin.getSiteConfig.useQuery();
  const { data: navItemsData } = trpc.admin.getNavItems.useQuery();
  const updateConfig = trpc.admin.updateSiteConfig.useMutation({
    onSuccess: () => { toast.success("설정이 저장되었습니다."); refetch(); },
    onError: () => toast.error("저장에 실패했습니다."),
  });
  const testCoupangApi = trpc.admin.testCoupangApi.useMutation();

  // ─── 쿠팡 파트너스 상태 ────────────────────────────────────────────────
  const [coupangEnabled, setCoupangEnabled] = useState(false);
  const [coupangApiEnabled, setCoupangApiEnabled] = useState(false);
  const [accessKey, setAccessKey] = useState("");
  const [secretKey, setSecretKey] = useState("");
  const [showSecretKey, setShowSecretKey] = useState(false);
  const [keywords, setKeywords] = useState<string[]>([...DEFAULT_DEV_KEYWORDS]);
  const [newKeyword, setNewKeyword] = useState("");
  const [maxPerPost, setMaxPerPost] = useState(1);
  const [coupangDisclaimer, setCoupangDisclaimer] = useState(true);
  const [coupangDisclaimerText, setCoupangDisclaimerText] = useState(
    "이 포스팅은 쿠팡 파트너스 활동의 일환으로, 이에 따른 일정액의 수수료를 제공받습니다."
  );
  const [apiTestResult, setApiTestResult] = useState<{ success: boolean; message: string } | null>(null);
  const [cacheRefreshHours, setCacheRefreshHours] = useState<number>(6);
  const [coupangCardStyle, setCoupangCardStyle] = useState<"text_link" | "name_price" | "image_compact" | "image_detail" | "image_full" | "link_card" | "curation_grid">("image_compact");
  const [curationGridCount, setCurationGridCount] = useState<number>(3);
  const [curationGridTitle, setCurationGridTitle] = useState<string>("");
  const [curationGridTitleStyle, setCurationGridTitleStyle] = useState<"fire" | "sale" | "new" | "pick" | "plain">("fire");
  // 슬롯별 스타일: 빈 문자열이면 전역 스타일 사용
  const [slotStyleEnabled, setSlotStyleEnabled] = useState(false);
  const [slotStyle1, setSlotStyle1] = useState<"text_link" | "name_price" | "image_compact" | "image_detail" | "image_full" | "link_card" | "curation_grid" | "">("image_compact");
  const [slotStyle2, setSlotStyle2] = useState<"text_link" | "name_price" | "image_compact" | "image_detail" | "image_full" | "link_card" | "curation_grid" | "">("image_compact");
  const [slotStyle3, setSlotStyle3] = useState<"text_link" | "name_price" | "image_compact" | "image_detail" | "image_full" | "link_card" | "curation_grid" | "">("image_compact");
  const [coupangCardSize, setCoupangCardSize] = useState<"small" | "medium" | "large">("medium");
  const [coupangCardBgColor, setCoupangCardBgColor] = useState("#ffffff");
  const [coupangBtnColor, setCoupangBtnColor] = useState("#e11d48");
  const [coupangBtnText, setCoupangBtnText] = useState("지금 쿠팡에서 확인하기 →");
  const [btnPresets, setBtnPresets] = useState<string[]>([
    "지금 쿠팡에서 확인하기 →",
    "할인가 얼마인지 보기 클릭",
    "쿠팡 최저가 바로가기",
    "오늘만 특가 쿠팡에서 보기",
    "쿠팡에서 사는 것이 남는 이유",
    "현재 실시간 가격 정보 확인",
  ]);
  const [showCoupangAdvanced, setShowCoupangAdvanced] = useState(false);
  const [showGuide, setShowGuide] = useState(false);

  // ─── 카테고리별 키워드 상태 ────────────────────────────────────────────
  const [categoryKeywords, setCategoryKeywords] = useState<CategoryKeywordsMap>({});
  const [showCategoryKeywords, setShowCategoryKeywords] = useState(true);

  // ─── 쿠팡 파트너스 배치 위치 상태 ────────────────────────────────────────
  const [coupangPositions, setCoupangPositions] = useState<string[]>(["end_of_post"]);

  // ─── 쇼핑 커넥트 상태 ──────────────────────────────────────────────────
  const [shopEnabled, setShopEnabled] = useState(false);
  const [shopWidgetCode, setShopWidgetCode] = useState("");
  const [shopMaxPerPost, setShopMaxPerPost] = useState(1);
  const [shopPositions, setShopPositions] = useState<ShopPositionKey[]>(["post_bottom"]);
  const [shopDisclaimer, setShopDisclaimer] = useState(true);
  const [shopDisclaimerText, setShopDisclaimerText] = useState(
    "이 포스팅은 네이버 쇼핑 커넥트 활동의 일환으로, 이에 따른 일정액의 수수료를 제공받습니다."
  );
  const [showShopAdvanced, setShowShopAdvanced] = useState(false);

  // 활성 탭
  const [activeTab, setActiveTab] = useState<"coupang" | "shopping">("coupang");

  // ─── 클릭 통계 ─────────────────────────────────────────────────────────
  const [statsDays, setStatsDays] = useState(30);
  const { data: clickStatsData, refetch: refetchStats } = trpc.coupang.getClickStats.useQuery(
    { days: statsDays },
    { retry: false }
  );

  // ─── 설정 로드 ─────────────────────────────────────────────────────────
  useEffect(() => {
    if (!siteConfig) return;
    const c = siteConfig as Record<string, string>;

    // 쿠팡
    setCoupangEnabled(c["coupang_enabled"] === "true");
    setCoupangApiEnabled(c["coupang_api_enabled"] === "true");
    if (c["coupang_access_key"]) setAccessKey(c["coupang_access_key"]);
    if (c["coupang_secret_key"]) setSecretKey(c["coupang_secret_key"]);
    if (c["coupang_max_per_post"]) setMaxPerPost(Number(c["coupang_max_per_post"]));
    if (c["coupang_cache_hours"]) setCacheRefreshHours(Number(c["coupang_cache_hours"]));
    if (c["coupang_card_style"]) setCoupangCardStyle(c["coupang_card_style"] as "text_link" | "name_price" | "image_compact" | "image_detail" | "image_full" | "link_card" | "curation_grid");
    if (c["coupang_curation_grid_count"]) setCurationGridCount(Number(c["coupang_curation_grid_count"]) || 3);
    if (c["coupang_curation_grid_title"] !== undefined) setCurationGridTitle(c["coupang_curation_grid_title"] ?? "");
    if (c["coupang_curation_grid_title_style"]) setCurationGridTitleStyle(c["coupang_curation_grid_title_style"] as "fire" | "sale" | "new" | "pick" | "plain");
    // 슬롯별 스타일 로드
    setSlotStyleEnabled(c["coupang_slot_style_enabled"] === "true");
    if (c["coupang_card_style_1"]) setSlotStyle1(c["coupang_card_style_1"] as "text_link" | "name_price" | "image_compact" | "image_detail" | "image_full" | "link_card");
    if (c["coupang_card_style_2"]) setSlotStyle2(c["coupang_card_style_2"] as "text_link" | "name_price" | "image_compact" | "image_detail" | "image_full" | "link_card");
    if (c["coupang_card_style_3"]) setSlotStyle3(c["coupang_card_style_3"] as "text_link" | "name_price" | "image_compact" | "image_detail" | "image_full" | "link_card");
    if (c["coupang_card_size"]) setCoupangCardSize(c["coupang_card_size"] as "small" | "medium" | "large");
    if (c["coupang_card_bg_color"]) setCoupangCardBgColor(c["coupang_card_bg_color"]);
    if (c["coupang_btn_color"]) setCoupangBtnColor(c["coupang_btn_color"]);
    if (c["coupang_btn_text"]) setCoupangBtnText(c["coupang_btn_text"]);
    if (c["coupang_disclaimer"] !== undefined) setCoupangDisclaimer(c["coupang_disclaimer"] !== "false");
    if (c["coupang_disclaimer_text"]) setCoupangDisclaimerText(c["coupang_disclaimer_text"]);
    try {
      const kw = JSON.parse(c["coupang_keywords"] ?? "null");
      if (Array.isArray(kw) && kw.length > 0) setKeywords(kw);
    } catch {}
    // 카테고리별 키워드
    try {
      const catKw = JSON.parse(c["coupang_category_keywords"] ?? "null");
      if (catKw && typeof catKw === "object" && !Array.isArray(catKw)) {
        setCategoryKeywords(catKw as CategoryKeywordsMap);
      }
    } catch {}

    // 쿠팡 배치 위치
    try {
      const coupangPos = JSON.parse(c["coupang_positions"] ?? "null");
      if (Array.isArray(coupangPos) && coupangPos.length > 0) setCoupangPositions(coupangPos);
    } catch {}

    // 쇼핑 커넥트
    setShopEnabled(c["shop_connect_enabled"] === "true");
    if (c["shop_connect_widget_code"]) setShopWidgetCode(c["shop_connect_widget_code"]);
    if (c["shop_connect_max_per_post"]) setShopMaxPerPost(Number(c["shop_connect_max_per_post"]));
    if (c["shop_connect_disclaimer"] !== undefined) setShopDisclaimer(c["shop_connect_disclaimer"] !== "false");
    if (c["shop_connect_disclaimer_text"]) setShopDisclaimerText(c["shop_connect_disclaimer_text"]);
    try {
      const pos = JSON.parse(c["shop_connect_positions"] ?? "null");
      if (Array.isArray(pos)) setShopPositions(pos);
    } catch {}
  }, [siteConfig]);

  // ─── 저장 ──────────────────────────────────────────────────────────────
  const handleSave = () => {
    updateConfig.mutate({
      // 쿠팡
      coupang_enabled: String(coupangEnabled),
      coupang_api_enabled: String(coupangApiEnabled),
      coupang_access_key: accessKey,
      coupang_secret_key: secretKey,
      coupang_keywords: JSON.stringify(keywords),
      coupang_category_keywords: JSON.stringify(categoryKeywords),
      coupang_max_per_post: String(maxPerPost),
      coupang_cache_hours: String(cacheRefreshHours),
      coupang_disclaimer: String(coupangDisclaimer),
      coupang_disclaimer_text: coupangDisclaimerText,
      // 쿠팡 배치 위치 및 카드 스타일
      coupang_positions: JSON.stringify(coupangPositions),
      coupang_card_style: coupangCardStyle,
      coupang_curation_grid_count: String(curationGridCount),
      coupang_curation_grid_title: curationGridTitle,
      coupang_curation_grid_title_style: curationGridTitleStyle,
      coupang_slot_style_enabled: String(slotStyleEnabled),
      coupang_card_style_1: slotStyle1 || coupangCardStyle,
      coupang_card_style_2: slotStyle2 || coupangCardStyle,
      coupang_card_style_3: slotStyle3 || coupangCardStyle,
      coupang_card_size: coupangCardSize,
      coupang_card_bg_color: coupangCardBgColor,
      coupang_btn_color: coupangBtnColor,
      coupang_btn_text: coupangBtnText,
      // 쇼핑 커넥트
      shop_connect_enabled: String(shopEnabled),
      shop_connect_widget_code: shopWidgetCode,
      shop_connect_max_per_post: String(shopMaxPerPost),
      shop_connect_positions: JSON.stringify(shopPositions),
      shop_connect_disclaimer: String(shopDisclaimer),
      shop_connect_disclaimer_text: shopDisclaimerText,
    });
  };

  // ─── 쿠팡 API 연결 테스트 ──────────────────────────────────────────────
  const handleTestApi = async () => {
    if (!accessKey || !secretKey) {
      toast.error("Access Key와 Secret Key를 먼저 입력해주세요.");
      return;
    }
    setApiTestResult(null);
    try {
      const result = await testCoupangApi.mutateAsync({ accessKey, secretKey });
      setApiTestResult(result);
      if (result.success) toast.success("API 연결 성공!");
      else toast.error("API 연결 실패: " + result.message);
    } catch (e: any) {
      setApiTestResult({ success: false, message: e.message ?? "알 수 없는 오류" });
    }
  };
  // ─── API 키만 저장 ──────────────────────────────────────────────────────
  const [savingApiKeys, setSavingApiKeys] = useState(false);
  const handleSaveApiKeys = async () => {
    if (!accessKey || !secretKey) {
      toast.error("Access Key와 Secret Key를 먼저 입력해주세요.");
      return;
    }
    setSavingApiKeys(true);
    try {
      await updateConfig.mutateAsync({
        coupang_access_key: accessKey,
        coupang_secret_key: secretKey,
      });
      toast.success("API 키가 저장되었습니다.");
    } catch {
      toast.error("저장에 실패했습니다.");
    } finally {
      setSavingApiKeys(false);
    }
  };
  // ─── 연결 테스트 후 저장 ────────────────────────────────────────────────
  const handleTestAndSave = async () => {
    if (!accessKey || !secretKey) {
      toast.error("Access Key와 Secret Key를 먼저 입력해주세요.");
      return;
    }
    setApiTestResult(null);
    try {
      const result = await testCoupangApi.mutateAsync({ accessKey, secretKey });
      setApiTestResult(result);
      if (result.success) {
        // 연결 성공 시 자동으로 API 키 저장
        await updateConfig.mutateAsync({
          coupang_access_key: accessKey,
          coupang_secret_key: secretKey,
        });
        toast.success("연결 성공 — API 키가 저장되었습니다.");
      } else {
        toast.error("API 연결 실패: " + result.message);
      }
    } catch (e: any) {
      setApiTestResult({ success: false, message: e.message ?? "알 수 없는 오류" });
      toast.error("연결 테스트 중 오류가 발생했습니다.");
    }
  };

  // ─── 전역 키워드 관리 ──────────────────────────────────────────────────
  const addKeyword = () => {
    const kw = newKeyword.trim();
    if (!kw || keywords.includes(kw)) return;
    if (keywords.length >= 10) { toast.error("키워드는 최대 10개까지 등록 가능합니다."); return; }
    setKeywords([...keywords, kw]);
    setNewKeyword("");
  };
  const removeKeyword = (kw: string) => setKeywords(keywords.filter(k => k !== kw));
  const resetKeywords = () => setKeywords([...DEFAULT_DEV_KEYWORDS]);

  // ─── 카테고리별 키워드 업데이트 ────────────────────────────────────────
  const updateCategoryKeywords = (catKey: string, newKws: string[]) => {
    setCategoryKeywords(prev => ({ ...prev, [catKey]: newKws }));
  };

  // ─── 쇼핑 커넥트 위치 토글 ─────────────────────────────────────────────
  const toggleShopPosition = (pos: ShopPositionKey) => {
    setShopPositions(prev =>
      prev.includes(pos) ? prev.filter(p => p !== pos) : [...prev, pos]
    );
  };

  // ─── 카테고리 목록 추출 (navItems에서) ────────────────────────────────
  const categories = (navItemsData ?? [])
    .filter(n => n.visible && n.path)
    .sort((a, b) => (a.sortOrder ?? 0) - (b.sortOrder ?? 0))
    .map(n => {
      const match = (n.path ?? "").match(/\/category\/([^/?#]+)/);
      const key = match ? match[1] : (n.path ?? "").replace(/^\//, "");
      return { key, label: n.label };
    })
    .filter(c => c.key);

  // ─── 공통 fieldLabel 스타일 ────────────────────────────────────────────
  const fieldLabel: React.CSSProperties = {
    display: "block", fontSize: 11, fontWeight: 600, color: "#6b7280",
    textTransform: "uppercase" as const, letterSpacing: "0.05em", marginBottom: 4,
  };

  return (
    <div style={{ maxWidth: 760, margin: "0 auto", padding: "8px 0 40px" }}>

      {/* ── 헤더 ── */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 16 }}>
        <div>
          <h2 style={{ fontSize: 16, fontWeight: 800, color: "#111827", margin: 0 }}>제휴 마케팅 설정</h2>
          <p style={{ fontSize: 12, color: "#6b7280", margin: "3px 0 0" }}>전략 A — 개발자 장비 연결 방식</p>
        </div>
        <Button
          onClick={handleSave}
          disabled={updateConfig.isPending}
          style={{ background: "#111827", color: "#fff", minWidth: 110, fontSize: 13 }}
        >
          {updateConfig.isPending ? <Loader2 size={13} className="animate-spin mr-2" /> : <Save size={13} style={{ marginRight: 6 }} />}
          설정 저장
        </Button>
      </div>

      {/* ── 안내 배너 ── */}
      <div style={{ background: "#f0f9ff", border: "1px solid #bae6fd", borderRadius: 10, padding: "12px 16px", marginBottom: 16 }}>
        <button
          onClick={() => setShowGuide(!showGuide)}
          style={{ width: "100%", background: "none", border: "none", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "space-between", padding: 0 }}
        >
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <AlertCircle size={14} color="#0284c7" />
            <span style={{ fontSize: 12, fontWeight: 700, color: "#0c4a6e" }}>운영 가이드라인 — 클릭하여 펼치기</span>
          </div>
          {showGuide ? <ChevronUp size={13} color="#0284c7" /> : <ChevronDown size={13} color="#0284c7" />}
        </button>
        {showGuide && (
          <div style={{ marginTop: 12, fontSize: 11, color: "#0c4a6e", lineHeight: 1.7 }}>
            <strong>핵심 원칙:</strong> 상단~목차 이후는 애드센스만 노출 → 글의 2/3 지점(결론부/Q&A 직전)에 제휴 링크 최소 배치 → 최하단에 공정위 문구 자동 삽입<br />
            <strong>수량 기준:</strong> 일반 글(1,500자) — 제휴 링크 1개 / 긴 글(2,000자+) — 최대 2개 / 3개 초과 시 검색 저품질 위험<br />
            <strong>형태 권장:</strong> 텍스트 링크 또는 깔끔한 버튼 1개 (이미지 배너 지양 — 애드센스와 시각 충돌)<br />
            <strong>키워드 우선순위:</strong> 글별 키워드 &gt; 카테고리별 키워드 &gt; 전역 키워드 순으로 적용됩니다
          </div>
        )}
      </div>

      {/* ── 탭 전환 ── */}
      <div style={{ display: "flex", gap: 3, background: "#f1f2f6", borderRadius: 10, padding: 4, marginBottom: 16, border: "1px solid #e2e4ea" }}>
        <button
          onClick={() => setActiveTab("coupang")}
          style={{
            flex: 1, padding: "8px 12px", borderRadius: 7, border: "none", cursor: "pointer",
            display: "flex", alignItems: "center", justifyContent: "center", gap: 6,
            fontSize: 13, fontWeight: activeTab === "coupang" ? 700 : 500,
            background: activeTab === "coupang" ? "#e8003d" : "#fff",
            color: activeTab === "coupang" ? "#fff" : "#4b5563",
            boxShadow: activeTab === "coupang" ? "0 2px 8px #e8003d55" : "0 1px 2px rgba(0,0,0,0.06)",
            transition: "all 0.15s",
          }}
        >
          <ShoppingCart size={14} />
          쿠팡 파트너스
          <Badge style={{ fontSize: 9, background: coupangEnabled ? "rgba(255,255,255,0.25)" : "rgba(255,255,255,0.15)", color: activeTab === "coupang" ? "#fff" : "#9ca3af", border: "none", padding: "1px 5px" }}>
            {coupangEnabled ? "ON" : "OFF"}
          </Badge>
        </button>
        <button
          onClick={() => setActiveTab("shopping")}
          style={{
            flex: 1, padding: "8px 12px", borderRadius: 7, border: "none", cursor: "pointer",
            display: "none", alignItems: "center", justifyContent: "center", gap: 6,
            fontSize: 13, fontWeight: activeTab === "shopping" ? 700 : 500,
            background: activeTab === "shopping" ? "#03c75a" : "#fff",
            color: activeTab === "shopping" ? "#fff" : "#4b5563",
            boxShadow: activeTab === "shopping" ? "0 2px 8px #03c75a55" : "0 1px 2px rgba(0,0,0,0.06)",
            transition: "all 0.15s",
          }}
        >
          <Store size={14} />
          쇼핑 커넥트
          <Badge style={{ fontSize: 9, background: shopEnabled ? "rgba(255,255,255,0.25)" : "rgba(255,255,255,0.15)", color: activeTab === "shopping" ? "#fff" : "#9ca3af", border: "none", padding: "1px 5px" }}>
            {shopEnabled ? "ON" : "OFF"}
          </Badge>
        </button>
      </div>

      {/* ════════════════════════════════════════════════════════════════
          쿠팡 파트너스 탭
      ════════════════════════════════════════════════════════════════ */}
      {activeTab === "coupang" && (
        <>
          {/* ① 활성화 토글 */}
          <SectionCard
            theme={SECTION_THEMES.toggle}
            icon={<ShoppingCart size={15} />}
            title="쿠팡 파트너스 API 자동 연동"
            subtitle="개발자 장비 키워드로 상품 자동 검색 후 본문 하단에 최소 배치"
            badge={
              <Badge style={{ fontSize: 10, background: coupangEnabled ? "#e8003d" : "#e5e7eb", color: coupangEnabled ? "#fff" : "#9ca3af", border: "none", padding: "2px 8px", borderRadius: 20 }}>
                {coupangEnabled ? "활성" : "비활성"}
              </Badge>
            }
            extra={<Switch checked={coupangEnabled} onCheckedChange={setCoupangEnabled} />}
          >
            <p style={{ fontSize: 12, color: "#6b7280", margin: 0, lineHeight: 1.6 }}>
              쿠팡 파트너스 API를 통해 키워드 기반으로 상품을 자동 검색하고, 글 본문에 상품 카드를 삽입합니다.
              활성화하면 아래 설정 항목들이 표시됩니다.
            </p>
          </SectionCard>

          {coupangEnabled && (
            <>
              {/* ② API 키 설정 */}
              <SectionCard
                theme={SECTION_THEMES.apiKey}
                icon={<Key size={15} />}
                title="API 키 설정"
                subtitle="쿠팡 파트너스 개발자센터에서 발급"
              >
                <div style={{ marginBottom: 12 }}>
                  <label style={{ ...fieldLabel, color: "#1e40af" }}>Access Key</label>
                  <Input
                    value={accessKey}
                    onChange={e => setAccessKey(e.target.value)}
                    placeholder="쿠팡 파트너스 Access Key"
                    style={{ fontFamily: "monospace", fontSize: 12, borderColor: "#93c5fd" }}
                  />
                </div>
                <div style={{ marginBottom: 14 }}>
                  <label style={{ ...fieldLabel, color: "#1e40af" }}>Secret Key</label>
                  <div style={{ position: "relative" }}>
                    <Input
                      type={showSecretKey ? "text" : "password"}
                      value={secretKey}
                      onChange={e => setSecretKey(e.target.value)}
                      placeholder="쿠팡 파트너스 Secret Key"
                      style={{ fontFamily: "monospace", fontSize: 12, paddingRight: 36, borderColor: "#93c5fd" }}
                    />
                    <button
                      onClick={() => setShowSecretKey(!showSecretKey)}
                      style={{ position: "absolute", right: 8, top: "50%", transform: "translateY(-50%)", background: "none", border: "none", cursor: "pointer", color: "#9ca3af" }}
                    >
                      {showSecretKey ? <EyeOff size={14} /> : <Eye size={14} />}
                    </button>
                  </div>
                </div>
                <div style={{ display: "flex", flexWrap: "wrap", alignItems: "center", gap: 8, marginBottom: 10 }}>
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={handleTestApi}
                    disabled={testCoupangApi.isPending || updateConfig.isPending}
                    style={{ fontSize: 12, borderColor: "#e8003d", color: "#e8003d" }}
                  >
                    {testCoupangApi.isPending
                      ? <Loader2 size={12} className="animate-spin" style={{ marginRight: 4 }} />
                      : <RefreshCw size={12} style={{ marginRight: 4 }} />
                    }
                    연결 테스트
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={handleTestAndSave}
                    disabled={testCoupangApi.isPending || updateConfig.isPending}
                    style={{ fontSize: 12, borderColor: "#16a34a", color: "#16a34a", background: apiTestResult?.success ? "#f0fdf4" : undefined }}
                  >
                    {(testCoupangApi.isPending || updateConfig.isPending)
                      ? <Loader2 size={12} className="animate-spin" style={{ marginRight: 4 }} />
                      : <CheckCircle2 size={12} style={{ marginRight: 4 }} />
                    }
                    테스트 후 저장
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={handleSaveApiKeys}
                    disabled={savingApiKeys || updateConfig.isPending}
                    style={{ fontSize: 12, borderColor: "#6366f1", color: "#6366f1" }}
                  >
                    {savingApiKeys
                      ? <Loader2 size={12} className="animate-spin" style={{ marginRight: 4 }} />
                      : <Save size={12} style={{ marginRight: 4 }} />
                    }
                    키만 저장
                  </Button>
                </div>
                {apiTestResult && (
                  <div style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 12, marginBottom: 8, padding: "8px 12px", borderRadius: 8, background: apiTestResult.success ? "#f0fdf4" : "#fff1f2", border: `1px solid ${apiTestResult.success ? "#86efac" : "#fecdd3"}` }}>
                    {apiTestResult.success
                      ? <><CheckCircle2 size={14} color="#16a34a" /><span style={{ color: "#15803d", fontWeight: 600 }}>{apiTestResult.message}</span></>
                      : <><XCircle size={14} color="#dc2626" /><span style={{ color: "#dc2626", fontWeight: 600 }}>{apiTestResult.message}</span></>
                    }
                  </div>
                )}
                <p style={{ fontSize: 11, color: "#6b7280", marginTop: 4 }}>
                  <a href="https://partners.coupang.com" target="_blank" rel="noopener noreferrer" style={{ color: "#2563eb", fontWeight: 600 }}>partners.coupang.com</a>
                  {" "}→ 개발자센터 → API 키 발급
                </p>
              </SectionCard>

              {/* ③ API 자동 검색 활성화 */}
              <SectionCard
                theme={SECTION_THEMES.autoSearch}
                icon={<Zap size={15} />}
                title="API 자동 검색 활성화"
                subtitle="저장된 키워드로 자동 검색 후 본문에 상품 카드 삽입"
                badge={
                  <Badge style={{ fontSize: 10, background: coupangApiEnabled ? "#f97316" : "#e5e7eb", color: coupangApiEnabled ? "#fff" : "#9ca3af", border: "none", padding: "2px 8px", borderRadius: 20 }}>
                    {coupangApiEnabled ? "활성" : "비활성"}
                  </Badge>
                }
                extra={<Switch checked={coupangApiEnabled} onCheckedChange={setCoupangApiEnabled} />}
              >
                <p style={{ fontSize: 12, color: "#9a3412", margin: 0, lineHeight: 1.6 }}>
                  캐시 유효기간: <strong>{cacheRefreshHours}시간</strong> — 아래 배치 설정에서 캐시 갱신 주기를 변경할 수 있습니다.
                  자동 검색이 활성화되면 글을 열 때 키워드로 쿠팡 API를 호출하여 상품 카드를 본문에 삽입합니다.
                </p>
              </SectionCard>

              {/* ④ 전역 기본 키워드 */}
              <SectionCard
                theme={SECTION_THEMES.globalKeyword}
                icon={<Globe size={15} />}
                title={`전역 기본 키워드 (${keywords.length}/10)`}
                subtitle="카테고리·글별 키워드 없을 때 사용"
                extra={
                  <button
                    onClick={resetKeywords}
                    style={{ fontSize: 11, color: "#16a34a", background: "none", border: "1px solid #86efac", borderRadius: 6, padding: "3px 10px", cursor: "pointer", display: "flex", alignItems: "center", gap: 3 }}
                  >
                    <RefreshCw size={11} /> 기본값 초기화
                  </button>
                }
              >
                <p style={{ fontSize: 11, color: "#166534", marginBottom: 12, lineHeight: 1.5, background: "#dcfce7", padding: "8px 12px", borderRadius: 8, border: "1px solid #86efac" }}>
                  카테고리별 키워드가 없거나 글별 키워드가 없을 때 사용됩니다. 순서대로 검색하며 캐시된 결과를 우선 사용합니다.
                </p>
                <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginBottom: 12 }}>
                  {keywords.map(kw => (
                    <div key={kw} style={{
                      display: "flex", alignItems: "center", gap: 4,
                      background: "#dcfce7", border: "1px solid #86efac",
                      borderRadius: 20, padding: "3px 10px 3px 12px",
                      fontSize: 12, color: "#14532d",
                    }}>
                      {kw}
                      <button onClick={() => removeKeyword(kw)} style={{ background: "none", border: "none", cursor: "pointer", color: "#4ade80", padding: 0, lineHeight: 1 }}>
                        <Trash2 size={11} />
                      </button>
                    </div>
                  ))}
                </div>
                <div style={{ display: "flex", gap: 6 }}>
                  <Input
                    value={newKeyword}
                    onChange={e => setNewKeyword(e.target.value)}
                    onKeyDown={e => e.key === "Enter" && addKeyword()}
                    placeholder="새 키워드 입력 (예: 고성능 노트북)"
                    style={{ fontSize: 12, flex: 1, borderColor: "#86efac" }}
                  />
                  <Button size="sm" variant="outline" onClick={addKeyword} style={{ fontSize: 12, borderColor: "#16a34a", color: "#16a34a" }}>
                    <Plus size={12} style={{ marginRight: 3 }} /> 추가
                  </Button>
                </div>
              </SectionCard>

              {/* ⑤ 카테고리별 키워드 설정 */}
              <SectionCard
                theme={SECTION_THEMES.categoryKeyword}
                icon={<Tag size={15} />}
                title="카테고리별 기본 키워드"
                subtitle="카테고리마다 다른 키워드 지정"
                badge={
                  <Badge style={{ fontSize: 9, background: "#dbeafe", color: "#1d4ed8", border: "none", padding: "1px 6px" }}>
                    {Object.values(categoryKeywords).filter(v => v.length > 0).length}개 카테고리 설정됨
                  </Badge>
                }
                collapsible
                collapsed={!showCategoryKeywords}
                onToggle={() => setShowCategoryKeywords(!showCategoryKeywords)}
              >
                {/* 우선순위 안내 */}
                <div style={{ background: "#eff6ff", border: "1px solid #bfdbfe", borderRadius: 7, padding: "8px 12px", marginBottom: 14 }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 5, marginBottom: 4 }}>
                    <Info size={12} color="#2563eb" />
                    <span style={{ fontSize: 11, fontWeight: 700, color: "#1e40af" }}>키워드 적용 우선순위</span>
                  </div>
                  <div style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 11, color: "#1d4ed8", flexWrap: "wrap" }}>
                    <span style={{ background: "#dbeafe", borderRadius: 4, padding: "1px 7px", fontWeight: 700 }}>1순위</span>
                    <span>글별 키워드 (글 편집 화면에서 설정)</span>
                    <span style={{ color: "#93c5fd" }}>→</span>
                    <span style={{ background: "#dbeafe", borderRadius: 4, padding: "1px 7px", fontWeight: 700 }}>2순위</span>
                    <span>카테고리별 키워드 (이 섹션)</span>
                    <span style={{ color: "#93c5fd" }}>→</span>
                    <span style={{ background: "#dbeafe", borderRadius: 4, padding: "1px 7px", fontWeight: 700 }}>3순위</span>
                    <span>전역 키워드 (위 섹션)</span>
                  </div>
                </div>

                {categories.length === 0 ? (
                  <div style={{ textAlign: "center", padding: "20px 0", color: "#9ca3af", fontSize: 12 }}>
                    <Info size={16} style={{ margin: "0 auto 6px", display: "block" }} />
                    카테고리가 없습니다. 먼저 관리자 &gt; 네비게이션 메뉴에서 카테고리를 추가해주세요.
                  </div>
                ) : (
                  categories.map(cat => (
                    <CategoryKeywordRow
                      key={cat.key}
                      categoryKey={cat.key}
                      categoryLabel={cat.label}
                      keywords={categoryKeywords[cat.key] ?? []}
                      onChange={(kws) => updateCategoryKeywords(cat.key, kws)}
                    />
                  ))
                )}
              </SectionCard>

              {/* ⑥ 배치 설정 */}
              <SectionCard
                theme={SECTION_THEMES.placement}
                icon={<MapPin size={15} />}
                title="배치 설정"
                subtitle="상품 카드 삽입 위치 및 수량 설정"
              >
                {/* 게시글당 최대 상품 수 */}
                <div style={{ marginBottom: 16 }}>
                  <label style={{ ...fieldLabel, color: "#4c1d95" }}>게시글당 최대 상품 수</label>
                  <div style={{ display: "flex", gap: 6, marginBottom: 4 }}>
                    {[1, 2, 3].map(n => (
                      <button
                        key={n}
                        onClick={() => setMaxPerPost(n)}
                        style={{
                          padding: "6px 22px", borderRadius: 8, fontSize: 13, fontWeight: 700,
                          border: maxPerPost === n ? "2px solid #7c3aed" : "1px solid #e5e7eb",
                          background: maxPerPost === n ? "#ede9fe" : "#fff",
                          color: maxPerPost === n ? "#4c1d95" : "#6b7280",
                          cursor: "pointer",
                          boxShadow: maxPerPost === n ? "0 2px 6px #7c3aed30" : "none",
                        }}
                      >
                        {n}개
                      </button>
                    ))}
                  </div>
                  <p style={{ fontSize: 10, color: "#7c3aed", opacity: 0.8 }}>소제목 사이 분산 배치 시 최대 3개까지 설정 가능합니다</p>
                </div>

                {/* 배치 위치 선택 */}
                <div style={{ marginBottom: 16 }}>
                  <label style={{ ...fieldLabel, color: "#4c1d95" }}>상품 카드 배치 위치</label>
                  <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginBottom: 4 }}>
                    {[
                      { id: "end_of_post", label: "📌 글 최하단" },
                      { id: "before_conclusion", label: "📝 결론부 직전" },
                      { id: "between_headings", label: "📋 중간 소제목 사이" },
                    ].map(pos => {
                      const selected = coupangPositions.includes(pos.id);
                      return (
                        <button
                          key={pos.id}
                          onClick={() => setCoupangPositions([pos.id])}
                          style={{
                            padding: "6px 14px", borderRadius: 8, fontSize: 12,
                            border: selected ? "2px solid #7c3aed" : "1px solid #e5e7eb",
                            background: selected ? "#ede9fe" : "#fff",
                            color: selected ? "#4c1d95" : "#6b7280",
                            cursor: "pointer", fontWeight: selected ? 700 : 400,
                            boxShadow: selected ? "0 2px 6px #7c3aed30" : "none",
                          }}
                        >
                          {pos.label}
                        </button>
                      );
                    })}
                  </div>
                  <p style={{ fontSize: 10, color: "#7c3aed", opacity: 0.8 }}>상품 카드가 삽입될 위치를 선택합니다. 애드센스와 쇼핑 커넥트와 겹치지 않도록 자동 조정됩니다.</p>
                </div>

                {/* 캐시 갱신 주기 */}
                <div>
                  <label style={{ ...fieldLabel, color: "#4c1d95" }}>캐시 갱신 주기</label>
                  <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginBottom: 4 }}>
                    {[3, 6, 12, 24].map(h => (
                      <button
                        key={h}
                        onClick={() => setCacheRefreshHours(h)}
                        style={{
                          padding: "6px 20px", borderRadius: 8, fontSize: 13, fontWeight: 700,
                          border: cacheRefreshHours === h ? "2px solid #7c3aed" : "1px solid #e5e7eb",
                          background: cacheRefreshHours === h ? "#ede9fe" : "#fff",
                          color: cacheRefreshHours === h ? "#4c1d95" : "#6b7280",
                          cursor: "pointer",
                          boxShadow: cacheRefreshHours === h ? "0 2px 6px #7c3aed30" : "none",
                        }}
                      >
                        {h}h
                      </button>
                    ))}
                  </div>
                  <p style={{ fontSize: 10, color: "#7c3aed", opacity: 0.8 }}>쿠팡 API 상품 검색 결과를 DB에 캐시하는 주기입니다. 짧을수록 최신 가격을 반영하지만 API 호출이 늘어납니다.</p>
                </div>
              </SectionCard>

              {/* ⑦ 카드 스타일 / 디자인 */}
              <SectionCard
                theme={SECTION_THEMES.cardStyle}
                icon={<Palette size={15} />}
                title="카드 스타일 / 디자인"
                subtitle="상품 카드 외관 및 버튼 문구 설정"
              >
                {/* 카드 표시 스타일 */}
                <div style={{ marginBottom: 16 }}>
                  <label style={{ ...fieldLabel, color: "#312e81" }}>상품 카드 스타일</label>
                  <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginBottom: 6 }}>
                    {([
                      { id: "image_compact", label: "🖼️ 이미지+제목형", desc: "가로형 썬네일 카드 (기본)" },
                      { id: "link_card",     label: "🔗 링크 카드형", desc: "티스토리 스타일: 좌측 이미지 + 우측 상품명" },
                      { id: "image_detail",  label: "🏷️ 이미지+제목+설명형", desc: "가로형, 카테고리+간단설명 포함" },
                      { id: "image_full",    label: "📦 이미지+설명형", desc: "세로형 풀카드 (대형)" },
                      { id: "name_price",   label: "💰 상품명+가격형", desc: "이미지 없음, 텍스트+가격" },
                      { id: "text_link",    label: "🔗 텍스트 링크형", desc: "한 줄 링크 (최소형)" },
                      { id: "curation_grid", label: "📊 큐레이션 그리드형", desc: "2~5개 상품을 가로 그리드로 나열 (큐레이션 특가 스타일)" },
                    ] as const).map(s => {
                      const sel = coupangCardStyle === s.id;
                      const isCuration = s.id === "curation_grid";
                      return (
                        <button
                          key={s.id}
                          onClick={() => setCoupangCardStyle(s.id)}
                          title={s.desc}
                          style={{
                            padding: "6px 12px", borderRadius: 8, fontSize: 12,
                            border: sel ? (isCuration ? "2px solid #e8003d" : "2px solid #4338ca") : "1px solid #e5e7eb",
                            background: sel ? (isCuration ? "#fff1f2" : "#e0e7ff") : "#fff",
                            color: sel ? (isCuration ? "#9f1239" : "#312e81") : "#6b7280",
                            cursor: "pointer", fontWeight: sel ? 700 : 400,
                            boxShadow: sel ? (isCuration ? "0 2px 6px #e8003d30" : "0 2px 6px #4338ca30") : "none",
                          }}
                        >
                          {s.label}
                        </button>
                      );
                    })}
                  </div>
                  <p style={{ fontSize: 10, color: "#4338ca", opacity: 0.8 }}>스타일을 선택하면 아래에서 미리보기를 확인할 수 있습니다.</p>
                </div>

                {/* 큐레이션 그리드형 선택 시: 상품 수 설정 UI */}
                {coupangCardStyle === "curation_grid" && (
                  <div style={{ marginBottom: 16, padding: "12px 14px", background: "#fff1f2", border: "1.5px solid #fecdd3", borderRadius: 10 }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 10 }}>
                      <span style={{ fontSize: 13, fontWeight: 700, color: "#9f1239" }}>큐레이션 그리드 상품 수</span>
                      <span style={{ fontSize: 11, color: "#e8003d", background: "#fecdd3", borderRadius: 20, padding: "1px 8px", fontWeight: 600 }}>2~5개 선택</span>
                    </div>
                    <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                      {[2, 3, 4, 5].map(n => {
                        const sel = curationGridCount === n;
                        return (
                          <button
                            key={n}
                            onClick={() => setCurationGridCount(n)}
                            style={{
                              padding: "8px 0", width: 64, borderRadius: 8, fontSize: 13,
                              border: sel ? "2px solid #e8003d" : "1px solid #fecdd3",
                              background: sel ? "#e8003d" : "#fff",
                              color: sel ? "#fff" : "#9f1239",
                              cursor: "pointer", fontWeight: 700,
                              boxShadow: sel ? "0 2px 8px #e8003d40" : "none",
                              display: "flex", flexDirection: "column" as const, alignItems: "center", gap: 2,
                            }}
                          >
                            <span style={{ fontSize: 18, lineHeight: 1 }}>{n}</span>
                            <span style={{ fontSize: 10, fontWeight: 500 }}>개</span>
                          </button>
                        );
                      })}
                    </div>
                    <p style={{ fontSize: 11, color: "#9f1239", marginTop: 8, lineHeight: 1.5 }}>
                      한 번에 {curationGridCount}개 상품이 가로 그리드로 표시됩니다.
                      모바일에서는 자동으로 2열 배치됩니다.
                      공정위 문구는 그리드 하단에 1번만 표시됩니다.
                    </p>

                    {/* 강조 제목 설정 */}
                    <div style={{ marginTop: 14, paddingTop: 14, borderTop: "1px solid #fecdd3" }}>
                      <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 8 }}>
                        <span style={{ fontSize: 13, fontWeight: 700, color: "#9f1239" }}>그리드 상단 강조 제목</span>
                        <span style={{ fontSize: 11, color: "#6b7280" }}>비워두면 제목 없이 표시</span>
                      </div>
                      <Input
                        value={curationGridTitle}
                        onChange={e => setCurationGridTitle(e.target.value)}
                        placeholder="예: 이번 주 특가 추천, ZARA 신상 모음, 가성비 TOP 5"
                        style={{ fontSize: 12, height: 34, marginBottom: 10 }}
                        maxLength={50}
                      />
                      {/* 제목 스타일 선택 */}
                      <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 8 }}>
                        <span style={{ fontSize: 12, fontWeight: 600, color: "#9f1239" }}>제목 스타일</span>
                      </div>
                      <div style={{ display: "flex", gap: 6, flexWrap: "wrap" as const }}>
                        {([
                          { id: "fire",  label: "🔥 HOT",   bg: "#fff7ed", border: "#fed7aa", color: "#9a3412", badgeBg: "#ea580c" },
                          { id: "sale",  label: "🏷️ SALE",  bg: "#fff1f2", border: "#fecdd3", color: "#9f1239", badgeBg: "#e11d48" },
                          { id: "new",   label: "✨ NEW",   bg: "#f0fdf4", border: "#bbf7d0", color: "#14532d", badgeBg: "#16a34a" },
                          { id: "pick",  label: "👍 PICK",  bg: "#eff6ff", border: "#bfdbfe", color: "#1e3a8a", badgeBg: "#2563eb" },
                          { id: "plain", label: "📝 기본형", bg: "#f8fafc", border: "#e2e8f0", color: "#1e293b", badgeBg: "#64748b" },
                        ] as const).map(ts => {
                          const sel = curationGridTitleStyle === ts.id;
                          return (
                            <button
                              key={ts.id}
                              onClick={() => setCurationGridTitleStyle(ts.id)}
                              style={{
                                display: "flex", alignItems: "center", gap: 5,
                                padding: "6px 10px", borderRadius: 8, fontSize: 12,
                                border: sel ? `2px solid ${ts.badgeBg}` : `1.5px solid ${ts.border}`,
                                background: sel ? ts.bg : "#fff",
                                color: sel ? ts.color : "#6b7280",
                                cursor: "pointer", fontWeight: sel ? 700 : 400,
                                boxShadow: sel ? `0 1px 6px ${ts.badgeBg}30` : "none",
                                transition: "all 0.15s",
                              }}
                            >
                              <span style={{ display: "inline-block", padding: "1px 6px", background: ts.badgeBg, color: "#fff", borderRadius: 20, fontSize: 10, fontWeight: 800 }}>{ts.label}</span>
                              {sel && <span style={{ fontSize: 10, color: ts.color }}>선택됨</span>}
                            </button>
                          );
                        })}
                      </div>
                      {curationGridTitle && (
                        <div style={{ marginTop: 10, padding: "8px 12px", background: "#f9fafb", border: "1px solid #e5e7eb", borderRadius: 6 }}>
                          <span style={{ fontSize: 11, color: "#6b7280" }}>미리보기: </span>
                          <span style={{ fontSize: 12, fontWeight: 700, color: "#1f2937" }}>{curationGridTitle}</span>
                        </div>
                      )}
                    </div>
                  </div>
                )}

                {/* 실시간 미리보기 (전역 스타일) */}
                <CoupangCardPreview
                  style={coupangCardStyle}
                  size={coupangCardSize}
                  cardBgColor={coupangCardBgColor}
                  btnColor={coupangBtnColor}
                  btnText={coupangBtnText}
                  disclaimerText={coupangDisclaimer ? coupangDisclaimerText : ""}
                  curationGridCount={curationGridCount}
                  curationGridTitle={curationGridTitle}
                  curationGridTitleStyle={curationGridTitleStyle}
                />

                {/* 슬롯별 스타일 지정 */}
                <div style={{ marginTop: 16, padding: "12px 14px", background: "#f8fafc", border: "1px solid #e0e7ff", borderRadius: 8 }}>
                  <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: slotStyleEnabled ? 12 : 0 }}>
                    <div>
                      <span style={{ fontSize: 12, fontWeight: 700, color: "#312e81" }}>상품별 개별 스타일 지정</span>
                      <span style={{ fontSize: 11, color: "#6366f1", marginLeft: 8 }}>1번째/2번째/3번째 상품에 서로 다른 스타일 적용</span>
                    </div>
                    <Switch checked={slotStyleEnabled} onCheckedChange={setSlotStyleEnabled} />
                  </div>
                  {slotStyleEnabled && (
                    <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
                      {([
                        { label: "1번째 상품", val: slotStyle1, set: setSlotStyle1 },
                        { label: "2번째 상품", val: slotStyle2, set: setSlotStyle2 },
                        { label: "3번째 상품", val: slotStyle3, set: setSlotStyle3 },
                      ] as const).map(({ label, val, set }) => (
                        <div key={label}>
                          <div style={{ fontSize: 11, fontWeight: 700, color: "#4338ca", marginBottom: 5 }}>{label}</div>
                          <div style={{ display: "flex", flexWrap: "wrap", gap: 5 }}>
                            {([
                              { id: "image_compact",  label: "🖼️ 이미지+제목형",    isCuration: false },
                              { id: "link_card",      label: "🔗 링크 카드형",       isCuration: false },
                              { id: "image_detail",   label: "🏷️ 이미지+설명형",    isCuration: false },
                              { id: "image_full",     label: "📦 풀카드형",         isCuration: false },
                              { id: "name_price",     label: "💰 상품명+가격형",    isCuration: false },
                              { id: "text_link",      label: "🔗 텍스트형",          isCuration: false },
                              { id: "curation_grid",  label: "📊 큐레이션 그리드형", isCuration: true  },
                            ] as const).map(s => {
                              const sel = val === s.id;
                              return (
                                <button
                                  key={s.id}
                                  onClick={() => set(s.id)}
                                  style={{
                                    padding: "4px 10px", borderRadius: 6, fontSize: 11,
                                    border: sel ? (s.isCuration ? "2px solid #e8003d" : "2px solid #4338ca") : "1px solid #e5e7eb",
                                    background: sel ? (s.isCuration ? "#fff1f2" : "#e0e7ff") : "#fff",
                                    color: sel ? (s.isCuration ? "#9f1239" : "#312e81") : "#6b7280",
                                    cursor: "pointer", fontWeight: sel ? 700 : 400,
                                    boxShadow: sel ? (s.isCuration ? "0 1px 4px #e8003d30" : "none") : "none",
                                  }}
                                >
                                  {s.label}
                                </button>
                              );
                            })}
                          </div>
                          <div style={{ marginTop: 8, pointerEvents: "none", userSelect: "none" }}>
                            <CoupangCardPreview
                              style={(val || coupangCardStyle) as "text_link" | "name_price" | "image_compact" | "image_detail" | "image_full" | "link_card" | "curation_grid"}
                              size={coupangCardSize}
                              cardBgColor={coupangCardBgColor}
                              btnColor={coupangBtnColor}
                              btnText={coupangBtnText}
                              disclaimerText=""
                              curationGridCount={curationGridCount}
                            />
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>

                {/* 카드 사이즈 */}
                <div style={{ marginTop: 16 }}>
                  <label style={{ ...fieldLabel, color: "#312e81" }}>카드 사이즈</label>
                  <div style={{ display: "flex", gap: 6, marginBottom: 4 }}>
                    {([
                      { id: "small",  label: "소형" },
                      { id: "medium", label: "중형" },
                      { id: "large",  label: "대형" },
                    ] as const).map(sz => {
                      const sel = coupangCardSize === sz.id;
                      return (
                        <button
                          key={sz.id}
                          onClick={() => setCoupangCardSize(sz.id)}
                          style={{
                            padding: "6px 20px", borderRadius: 8, fontSize: 13, fontWeight: 700,
                            border: sel ? "2px solid #4338ca" : "1px solid #e5e7eb",
                            background: sel ? "#e0e7ff" : "#fff",
                            color: sel ? "#312e81" : "#6b7280",
                            cursor: "pointer",
                            boxShadow: sel ? "0 2px 6px #4338ca30" : "none",
                          }}
                        >
                          {sz.label}
                        </button>
                      );
                    })}
                  </div>
                  <p style={{ fontSize: 10, color: "#4338ca", opacity: 0.8 }}>소형: 이미지 165px / 중형: 210px (기본) / 대형: 270px</p>
                </div>

                {/* 카드 배경색 · 버튼 색상 */}
                <div style={{ marginTop: 16 }}>
                  <label style={{ ...fieldLabel, color: "#312e81" }}>카드 색상 설정</label>
                  <div style={{ display: "flex", gap: 16, flexWrap: "wrap", padding: "10px 12px", background: "#f8fafc", borderRadius: 8, border: "1px solid #e0e7ff" }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                      <label style={{ fontSize: 11, color: "#4338ca", fontWeight: 600, whiteSpace: "nowrap" }}>카드 배경색</label>
                      <input
                        type="color"
                        value={coupangCardBgColor}
                        onChange={e => setCoupangCardBgColor(e.target.value)}
                        style={{ width: 36, height: 28, border: "1px solid #a5b4fc", borderRadius: 4, cursor: "pointer", padding: 2 }}
                        title="카드 배경색 선택"
                      />
                      <span style={{ fontSize: 10, color: "#6366f1", fontFamily: "monospace" }}>{coupangCardBgColor}</span>
                    </div>
                    <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                      <label style={{ fontSize: 11, color: "#4338ca", fontWeight: 600, whiteSpace: "nowrap" }}>버튼 색상</label>
                      <input
                        type="color"
                        value={coupangBtnColor}
                        onChange={e => setCoupangBtnColor(e.target.value)}
                        style={{ width: 36, height: 28, border: "1px solid #a5b4fc", borderRadius: 4, cursor: "pointer", padding: 2 }}
                        title="버튼 색상 선택"
                      />
                      <span style={{ fontSize: 10, color: "#6366f1", fontFamily: "monospace" }}>{coupangBtnColor}</span>
                    </div>
                    <button
                      onClick={() => { setCoupangCardBgColor("#ffffff"); setCoupangBtnColor("#e11d48"); }}
                      style={{ fontSize: 10, color: "#6366f1", background: "#eef2ff", border: "1px solid #a5b4fc", borderRadius: 6, padding: "4px 10px", cursor: "pointer" }}
                    >
                      기본값 재설정
                    </button>
                  </div>
                </div>

                {/* 버튼 문구 */}
                <div style={{ marginTop: 16 }}>
                  <label style={{ ...fieldLabel, color: "#312e81" }}>버튼 문구</label>
                  <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginBottom: 8 }}>
                    {btnPresets.map((text, idx) => (
                      <div key={idx} style={{ position: "relative", display: "inline-flex", alignItems: "center" }}>
                        <button
                          onClick={() => setCoupangBtnText(text)}
                          style={{
                            padding: "4px 26px 4px 10px", borderRadius: 6, fontSize: 11,
                            border: coupangBtnText === text ? "2px solid #4338ca" : "1px solid #e5e7eb",
                            background: coupangBtnText === text ? "#e0e7ff" : "#fff",
                            color: coupangBtnText === text ? "#312e81" : "#6b7280",
                            cursor: "pointer", fontWeight: coupangBtnText === text ? 700 : 400,
                          }}
                        >
                          {text}
                        </button>
                        <button
                          onClick={() => {
                            const next = btnPresets.filter((_, i) => i !== idx);
                            setBtnPresets(next);
                            if (coupangBtnText === text && next.length > 0) setCoupangBtnText(next[0]);
                          }}
                          title="삭제"
                          style={{
                            position: "absolute", right: 4, top: "50%", transform: "translateY(-50%)",
                            background: "none", border: "none", cursor: "pointer",
                            color: "#9ca3af", fontSize: 12, lineHeight: 1, padding: 0,
                            display: "flex", alignItems: "center",
                          }}
                        >
                          ×
                        </button>
                      </div>
                    ))}
                  </div>
                  <div style={{ display: "flex", gap: 6, marginBottom: 6 }}>
                    <Input
                      value={coupangBtnText}
                      onChange={e => setCoupangBtnText(e.target.value)}
                      placeholder="직접 입력 후 + 추가 버튼 클릭..."
                      style={{ fontSize: 12, flex: 1, borderColor: "#a5b4fc" }}
                    />
                    <button
                      onClick={() => {
                        const trimmed = coupangBtnText.trim();
                        if (trimmed && !btnPresets.includes(trimmed)) {
                          setBtnPresets(prev => [...prev, trimmed]);
                        }
                      }}
                      style={{
                        padding: "0 14px", borderRadius: 6, fontSize: 12, fontWeight: 600,
                        border: "1px solid #4338ca", background: "#e0e7ff", color: "#312e81",
                        cursor: "pointer", whiteSpace: "nowrap", flexShrink: 0,
                      }}
                    >
                      + 추가
                    </button>
                  </div>
                  <p style={{ fontSize: 10, color: "#4338ca", opacity: 0.8 }}>위에서 선택하거나 직접 입력할 수 있습니다. × 버튼으로 삭제, + 추가로 저장할 수 있습니다.</p>
                </div>
              </SectionCard>

              {/* ⑧ 고급 설정 - 공정위 문구 */}
              <SectionCard
                theme={SECTION_THEMES.advanced}
                icon={<Settings2 size={15} />}
                title="고급 설정 — 공정위 대가성 문구"
                subtitle="쿠팡 링크가 있는 글 하단에 자동 삽입"
                collapsible
                collapsed={!showCoupangAdvanced}
                onToggle={() => setShowCoupangAdvanced(!showCoupangAdvanced)}
              >
                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 10 }}>
                  <div>
                    <p style={{ fontSize: 12, fontWeight: 600, color: "#374151", margin: 0 }}>공정위 대가성 문구 자동 삽입</p>
                    <p style={{ fontSize: 11, color: "#9ca3af", margin: "2px 0 0" }}>쿠팡 링크가 있는 글 하단에 자동으로 표시됩니다</p>
                  </div>
                  <Switch checked={coupangDisclaimer} onCheckedChange={setCoupangDisclaimer} />
                </div>
                {coupangDisclaimer && (
                  <Textarea
                    value={coupangDisclaimerText}
                    onChange={e => setCoupangDisclaimerText(e.target.value)}
                    rows={2}
                    style={{ fontSize: 11, resize: "vertical", borderColor: "#d1d5db" }}
                  />
                )}
              </SectionCard>
            </>
          )}
        </>
      )}

      {/* ════════════════════════════════════════════════════════════════
          버튼 문구별 클릭 통계
      ════════════════════════════════════════════════════════════════ */}
      <SectionCard
        theme={SECTION_THEMES.stats}
        icon={<BarChart2 size={15} />}
        title="클릭 통계 — 버튼 문구별"
        subtitle="어떤 문구가 클릭을 더 많이 받는지 확인"
        extra={
          <div style={{ display: "flex", gap: 5, alignItems: "center" }}>
            {[7, 30, 90].map(d => (
              <button
                key={d}
                onClick={() => { setStatsDays(d); setTimeout(() => refetchStats(), 50); }}
                style={{ padding: "3px 10px", borderRadius: 6, fontSize: 11, fontWeight: 600, border: "1px solid #cbd5e1", background: statsDays === d ? "#475569" : "#fff", color: statsDays === d ? "#fff" : "#475569", cursor: "pointer" }}
              >{d}일</button>
            ))}
            <button onClick={() => refetchStats()} style={{ padding: "3px 8px", borderRadius: 6, fontSize: 11, border: "1px solid #cbd5e1", background: "#fff", cursor: "pointer", color: "#475569" }}>
              🔄
            </button>
          </div>
        }
      >
        {clickStatsData && clickStatsData.total > 0 ? (
          <div>
            <p style={{ fontSize: 11, color: "#475569", marginBottom: 10, fontWeight: 600 }}>총 {clickStatsData.total}회 클릭 ({statsDays}일 기준)</p>
            {clickStatsData.stats.map((s: {btnText: string; count: number; pct: number}, i: number) => (
              <div key={i} style={{ marginBottom: 10 }}>
                <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 4 }}>
                  <span style={{ fontSize: 12, color: "#1e293b", fontWeight: 600 }}>{s.btnText}</span>
                  <span style={{ fontSize: 12, color: "#475569", fontWeight: 600 }}>{s.count}회 <span style={{ color: "#94a3b8" }}>({s.pct}%)</span></span>
                </div>
                <div style={{ height: 8, background: "#e2e8f0", borderRadius: 4, overflow: "hidden" }}>
                  <div style={{
                    height: "100%",
                    width: `${s.pct}%`,
                    background: i === 0 ? "#e11d48" : i === 1 ? "#f97316" : i === 2 ? "#3b82f6" : "#8b5cf6",
                    borderRadius: 4,
                    transition: "width 0.4s",
                  }} />
                </div>
              </div>
            ))}
          </div>
        ) : (
          <div style={{ textAlign: "center", padding: "20px 0" }}>
            <BarChart2 size={24} style={{ color: "#cbd5e1", margin: "0 auto 8px", display: "block" }} />
            <p style={{ fontSize: 12, color: "#94a3b8", margin: 0 }}>
              {clickStatsData ? "클릭 데이터가 없습니다. 구독자가 쿠팡 카드를 클릭하면 여기에 통계가 쌓입니다." : "통계를 불러오는 중..."}
            </p>
          </div>
        )}
      </SectionCard>

      {/* ════════════════════════════════════════════════════════════════
          쿠팡 커넥트 탭 (숨김 처리 - 특정 사이트만 지원)
      ════════════════════════════════════════════════════════════════ */}
      {false && activeTab === "shopping" && (
        <>
          {/* 활성화 토글 */}
          <div style={{ border: "1.5px solid #03c75a", borderRadius: 12, marginBottom: 14, overflow: "hidden" }}>
            <div style={{ background: "#f0fdf4", borderBottom: "1px solid #bbf7d0", padding: "10px 16px", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
              <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                <Store size={15} style={{ color: "#16a34a" }} />
                <span style={{ fontSize: 13, fontWeight: 700, color: "#14532d" }}>쇼핑 커넥트 위젯</span>
              </div>
              <Switch checked={shopEnabled} onCheckedChange={setShopEnabled} />
            </div>
            <div style={{ padding: "14px 16px", background: "#fff" }}>
              <p style={{ fontSize: 11, color: "#6b7280", margin: 0 }}>네이버 알고리즘이 방문자 맥락에 맞는 상품을 자동으로 선택합니다</p>
            </div>
          </div>

          {shopEnabled && (
            <>
              {/* 위젯 코드 입력 */}
              <div style={{ border: "1.5px solid #16a34a", borderRadius: 12, marginBottom: 14, overflow: "hidden" }}>
                <div style={{ background: "#dcfce7", borderBottom: "1px solid #86efac", padding: "10px 16px" }}>
                  <span style={{ fontSize: 13, fontWeight: 700, color: "#14532d" }}>📋 위젯 코드 입력</span>
                </div>
                <div style={{ padding: "14px 16px", background: "#fff" }}>
                  <div style={{ background: "#f0fdf4", border: "1px solid #bbf7d0", borderRadius: 8, padding: "10px 14px", marginBottom: 10 }}>
                    <p style={{ fontSize: 11, color: "#166534", margin: 0, lineHeight: 1.6 }}>
                      <a href="https://adcenter.naver.com" target="_blank" rel="noopener noreferrer" style={{ color: "#15803d", fontWeight: 700 }}>네이버 쇼핑 파트너센터</a>
                      {" "}→ 광고 소재 → 위젯 코드를 복사하여 아래에 붙여넣으세요.
                      별도 키워드 설정 없이 네이버 알고리즘이 자동으로 적합한 상품을 보여줍니다.
                    </p>
                  </div>
                  <Textarea
                    value={shopWidgetCode}
                    onChange={e => setShopWidgetCode(e.target.value)}
                    placeholder={"<script type=\"text/javascript\">\n// 네이버 쇼핑 커넥트 위젯 코드를 여기에 붙여넣으세요\n</script>"}
                    rows={6}
                    style={{ fontFamily: "monospace", fontSize: 11, resize: "vertical" }}
                  />
                </div>
              </div>

              {/* 배치 위치 */}
              <div style={{ border: "1.5px solid #7c3aed", borderRadius: 12, marginBottom: 14, overflow: "hidden" }}>
                <div style={{ background: "#ede9fe", borderBottom: "1px solid #c4b5fd", padding: "10px 16px" }}>
                  <span style={{ fontSize: 13, fontWeight: 700, color: "#4c1d95" }}>📍 배치 설정</span>
                </div>
                <div style={{ padding: "14px 16px", background: "#fff" }}>
                  {/* 게시글당 최대 위젯 개수 */}
                  <label style={fieldLabel}>게시글당 최대 위젯 개수</label>
                  <div style={{ display: "flex", gap: 6, marginBottom: 6 }}>
                    {[1, 2, 3].map(n => (
                      <button
                        key={n}
                        onClick={() => setShopMaxPerPost(n)}
                        style={{
                          padding: "5px 20px", borderRadius: 6, fontSize: 13, fontWeight: 600,
                          border: shopMaxPerPost === n ? "2px solid #03c75a" : "1px solid #e5e7eb",
                          background: shopMaxPerPost === n ? "#f0fdf4" : "#fff",
                          color: shopMaxPerPost === n ? "#15803d" : "#6b7280",
                          cursor: "pointer",
                        }}
                      >
                        {n}개
                      </button>
                    ))}
                  </div>
                  <p style={{ fontSize: 10, color: "#9ca3af", marginBottom: 12 }}>동일 글에 삽입할 위젯 개수입니다. 여러 위치를 선택하면 각 위치에 순서대로 배치됩니다.</p>

                  {/* 배치 위치 선택 */}
                  <label style={fieldLabel}>배치 위치 (원하는 위치를 복수 선택 가능)</label>
                  <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
                    {SHOP_POSITIONS.map(pos => {
                      const selected = shopPositions.includes(pos.id);
                      return (
                        <button
                          key={pos.id}
                          onClick={() => toggleShopPosition(pos.id)}
                          style={{
                            padding: "6px 14px", borderRadius: 6, fontSize: 12,
                            border: selected ? "2px solid #03c75a" : "1px solid #e5e7eb",
                            background: selected ? "#f0fdf4" : "#fff",
                            color: selected ? "#15803d" : "#6b7280",
                            cursor: "pointer", fontWeight: selected ? 600 : 400,
                          }}
                        >
                          {pos.label}
                        </button>
                      );
                    })}
                  </div>
                </div>
              </div>

              {/* 고급 설정 - 공정위 문구 */}
              <div style={{ border: "1.5px solid #9ca3af", borderRadius: 12, marginBottom: 14, overflow: "hidden" }}>
                <button
                  onClick={() => setShowShopAdvanced(!showShopAdvanced)}
                  style={{ display: "flex", alignItems: "center", justifyContent: "space-between", width: "100%", background: "#f3f4f6", borderBottom: showShopAdvanced ? "1px solid #d1d5db" : "none", padding: "10px 16px", border: "none", cursor: "pointer" }}
                >
                  <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                    <Settings2 size={14} style={{ color: "#6b7280" }} />
                    <span style={{ fontSize: 13, fontWeight: 700, color: "#374151" }}>고급 설정 — 공정위 대가성 문구</span>
                  </div>
                  {showShopAdvanced ? <ChevronUp size={14} color="#6b7280" /> : <ChevronDown size={14} color="#6b7280" />}
                </button>
                {showShopAdvanced && (
                  <div style={{ padding: "14px 16px", background: "#fff" }}>
                    <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 8 }}>
                      <div>
                        <p style={{ fontSize: 12, fontWeight: 600, color: "#374151", margin: 0 }}>공정위 대가성 문구 자동 삽입</p>
                        <p style={{ fontSize: 11, color: "#9ca3af", margin: "2px 0 0" }}>쇼핑 커넥트 위젯이 있는 글 하단에 자동으로 표시됩니다</p>
                      </div>
                      <Switch checked={shopDisclaimer} onCheckedChange={setShopDisclaimer} />
                    </div>
                    {shopDisclaimer && (
                      <Textarea
                        value={shopDisclaimerText}
                        onChange={e => setShopDisclaimerText(e.target.value)}
                        rows={2}
                        style={{ fontSize: 11, resize: "vertical" }}
                      />
                    )}
                  </div>
                )}
              </div>
            </>
          )}
        </>
      )}
    </div>
  );
}
