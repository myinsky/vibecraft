/**
 * AdminAdsTab - 광고 설정 탭
 * 애드센스 슬롯 3종 등록 + 위치별 슬롯 선택 + 자동 배치 규칙 설정
 */
import { useState, useEffect } from "react";
import { trpc } from "@/lib/trpc";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import {
  Megaphone, Save, Eye, EyeOff, AlertCircle,
  ChevronDown, ChevronUp, Code2, Settings2, Smartphone,
  LayoutTemplate, Layers, ShoppingCart, Store, BarChart2,
} from "lucide-react";

// ─── 광고 위치 한글 레이블 매핑 ─────────────────────────────────────────────────
const POSITION_LABEL_MAP: Record<string, string> = {
  after_title: "제목 바로 아래",
  after_intro: "도입부 이후 (상단 반응형)",
  after_toc: "목차 이후",
  between_h2: "소제목 사이 (본문 중간 인피드)",
  after_qna: "묻고 답하기 이후",
  post_bottom_adsense: "본문 하단 (댓글창 바로 위)",
  home_section: "메인 섹션 사이",
  after_section_header: "섹션 헤더 아래",
  between_cards: "카드 그리드 사이",
};

/** 카테고리별 광고 슬롯 설정 패널 */
function CategoryAdSlotsPanel() {
  // 네비게이션 카테고리 목록 조회
  const { data: navItems } = trpc.admin.getNavItems.useQuery();
  // 카테고리별 광고 슬롯 설정 조회
  const { data: catSlots, refetch: refetchCatSlots } = trpc.ads.getCategorySlots.useQuery(undefined, {
    retry: false,
  });
  const upsertSlot = trpc.ads.upsertCategorySlot.useMutation({
    onSuccess: () => { toast.success("카테고리 광고 슬롯이 저장되었습니다."); refetchCatSlots(); },
    onError: (e) => toast.error("저장 실패: " + e.message),
  });

  // 카테고리별 편집 상태 (categoryKey → {slot1Code, slot2Code, slot3Code, disabled})
  const [editState, setEditState] = useState<Record<string, {
    slot1Code: string;
    slot2Code: string;
    slot3Code: string;
    disabled: boolean;
    expanded: boolean;
  }>>({});

  // catSlots 로드 시 editState 초기화
  useEffect(() => {
    if (!catSlots || !navItems) return;
    const initial: typeof editState = {};
    navItems.forEach(nav => {
      const key = nav.path.replace(/^\/category\//, "").replace(/^\//,"");
      if (!key) return;
      const existing = catSlots.find(s => s.categoryKey === key);
      initial[key] = {
        slot1Code: existing?.slot1Code ?? "",
        slot2Code: existing?.slot2Code ?? "",
        slot3Code: existing?.slot3Code ?? "",
        disabled: Boolean(existing?.disabled),
        expanded: false,
      };
    });
    setEditState(initial);
  }, [catSlots, navItems]);

  const updateField = (key: string, field: string, value: string | boolean) => {
    setEditState(prev => ({ ...prev, [key]: { ...prev[key], [field]: value } }));
  };

  const handleSaveCategory = (categoryKey: string) => {
    const s = editState[categoryKey];
    if (!s) return;
    upsertSlot.mutate({
      categoryKey,
      slot1Code: s.slot1Code || null,
      slot2Code: s.slot2Code || null,
      slot3Code: s.slot3Code || null,
      disabled: s.disabled,
    });
  };

  const categories = (navItems ?? []).map(nav => ({
    key: nav.path.replace(/^\/category\//, "").replace(/^\//,""),
    label: nav.label,
  })).filter(c => c.key);

  return (
    <div style={{ marginTop: 24, border: "1px solid #e5e7eb", borderRadius: 12, overflow: "hidden" }}>
      <div style={{ background: "linear-gradient(135deg, #fef3c7, #fde68a)", padding: "14px 18px", display: "flex", alignItems: "center", gap: 8 }}>
        <Layers size={16} style={{ color: "#b45309" }} />
        <span style={{ fontSize: 14, fontWeight: 700, color: "#92400e" }}>카테고리별 광고 슬롯 설정</span>
        <span style={{ fontSize: 11, color: "#a16207", marginLeft: 4 }}>비워두면 전역 슬롯(슬롯1/2/3) 사용</span>
      </div>
      <div style={{ padding: "16px 18px", background: "#fff" }}>
        {categories.length === 0 ? (
          <div style={{ fontSize: 13, color: "#9ca3af", textAlign: "center", padding: "20px 0" }}>네비게이션 카테고리가 없습니다.</div>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
            {categories.map(cat => {
              const s = editState[cat.key];
              if (!s) return null;
              const isExpanded = s.expanded;
              const hasCustom = !!(s.slot1Code || s.slot2Code || s.slot3Code);
              return (
                <div key={cat.key} style={{ border: "1px solid #e5e7eb", borderRadius: 10, overflow: "hidden" }}>
                  {/* 카테고리 헤더 */}
                  <div
                    onClick={() => updateField(cat.key, "expanded", !isExpanded)}
                    style={{ display: "flex", alignItems: "center", gap: 10, padding: "10px 14px", cursor: "pointer", background: isExpanded ? "#fffbeb" : "#fafafa" }}
                  >
                    <div style={{ flex: 1, display: "flex", alignItems: "center", gap: 8 }}>
                      <span style={{ fontSize: 13, fontWeight: 600, color: "#374151" }}>{cat.label}</span>
                      <span style={{ fontSize: 10, color: "#9ca3af" }}>/{cat.key}</span>
                      {hasCustom && <span style={{ fontSize: 10, background: "#fef3c7", color: "#b45309", borderRadius: 4, padding: "1px 6px", fontWeight: 600 }}>커스텀</span>}
                      {s.disabled && <span style={{ fontSize: 10, background: "#fee2e2", color: "#dc2626", borderRadius: 4, padding: "1px 6px", fontWeight: 600 }}>광고 OFF</span>}
                    </div>
                    <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                      <span style={{ fontSize: 11, color: "#6b7280" }}>광고 비활성화</span>
                      <Switch
                        checked={s.disabled}
                        onCheckedChange={v => { updateField(cat.key, "disabled", v); }}
                        onClick={e => e.stopPropagation()}
                      />
                    </div>
                    {isExpanded ? <ChevronUp size={14} color="#9ca3af" /> : <ChevronDown size={14} color="#9ca3af" />}
                  </div>
                  {/* 슬롯 코드 입력 */}
                  {isExpanded && (
                    <div style={{ padding: "12px 14px", background: "#fffbeb", borderTop: "1px solid #fde68a", display: "flex", flexDirection: "column", gap: 10 }}>
                      {s.disabled && (
                        <div style={{ background: "#fee2e2", border: "1px solid #fca5a5", borderRadius: 6, padding: "8px 12px", fontSize: 11, color: "#dc2626" }}>
                          ⛔ 이 카테고리에서는 광고가 표시되지 않습니다.
                        </div>
                      )}
                      {(["slot1", "slot2", "slot3"] as const).map((slotId, idx) => (
                        <div key={slotId}>
                          <label style={{ fontSize: 11, fontWeight: 600, color: "#374151", display: "block", marginBottom: 4 }}>
                            슬롯{idx + 1} 코드 <span style={{ fontWeight: 400, color: "#9ca3af" }}>(비워두면 전역 슬롯{idx + 1} 사용)</span>
                          </label>
                          <textarea
                            value={s[slotId + "Code" as "slot1Code" | "slot2Code" | "slot3Code"]}
                            onChange={e => updateField(cat.key, slotId + "Code", e.target.value)}
                            placeholder={`<ins class="adsbygoogle" ...></ins> (비우면 전역 슬롯${idx + 1} 사용)`}
                            rows={3}
                            style={{ width: "100%", border: "1px solid #e5e7eb", borderRadius: 6, padding: "8px 10px", fontSize: 11, fontFamily: "monospace", resize: "vertical", boxSizing: "border-box" }}
                          />
                        </div>
                      ))}
                      <div style={{ display: "flex", justifyContent: "flex-end" }}>
                        <button
                          type="button"
                          onClick={() => handleSaveCategory(cat.key)}
                          disabled={upsertSlot.isPending}
                          style={{ background: "linear-gradient(135deg, #f59e0b, #d97706)", color: "#fff", border: "none", borderRadius: 8, padding: "8px 18px", fontSize: 12, fontWeight: 600, cursor: "pointer" }}
                        >
                          <Save size={12} style={{ display: "inline", marginRight: 4 }} />
                          {upsertSlot.isPending ? "저장 중..." : "이 카테고리 저장"}
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
        <div style={{ marginTop: 12, fontSize: 10, color: "#9ca3af" }}>
          * 슬롯 코드를 비워두면 전역 광고 설정(슬롯1/2/3)이 자동으로 적용됩니다. 광고 비활성화를 켜면 해당 카테고리에서 모든 광고가 숨겨집니다.
        </div>
      </div>
    </div>
  );
}

/** 광고 위치별 클릭 통계 패널 (최근 30일) */
function AdClickStatsPanel() {
  const { data: stats, isLoading, refetch } = trpc.ads.getClickStats.useQuery(undefined, {
    retry: false,
  });

  const POSITION_COLORS: Record<string, string> = {
    after_title: "#6366f1",
    after_intro: "#8b5cf6",
    after_toc: "#0ea5e9",
    between_h2: "#10b981",
    after_qna: "#f59e0b",
    post_bottom_adsense: "#e11d48",
    home_section: "#7c3aed",
    after_section_header: "#0369a1",
    between_cards: "#15803d",
  };

  const maxCount = stats && stats.length > 0 ? Math.max(...stats.map(s => s.count)) : 1;

  return (
    <div style={{ marginTop: 24, border: "1px solid #e5e7eb", borderRadius: 12, overflow: "hidden" }}>
      <div style={{ background: "linear-gradient(135deg, #f5f3ff, #ede9fe)", padding: "14px 18px", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <BarChart2 size={16} style={{ color: "#6366f1" }} />
          <span style={{ fontSize: 14, fontWeight: 700, color: "#3730a3" }}>광고 위치별 클릭 통계 (최근 30일)</span>
        </div>
        <button
          type="button"
          onClick={() => refetch()}
          style={{ fontSize: 11, color: "#6366f1", background: "none", border: "none", cursor: "pointer", fontWeight: 600 }}
        >
          새로고침
        </button>
      </div>
      <div style={{ padding: "16px 18px", background: "#fff" }}>
        {isLoading ? (
          <div style={{ fontSize: 13, color: "#9ca3af", textAlign: "center", padding: "20px 0" }}>통계 불러오는 중...</div>
        ) : !stats || stats.length === 0 ? (
          <div style={{ fontSize: 13, color: "#9ca3af", textAlign: "center", padding: "20px 0" }}>
            아직 기록된 클릭이 없습니다. 광고가 활성화되면 자동으로 집계됩니다.
          </div>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
            {stats.map((s, i) => {
              const label = POSITION_LABEL_MAP[s.position] ?? s.position;
              const barColor = POSITION_COLORS[s.position] ?? "#6366f1";
              const pct = Math.round((s.count / maxCount) * 100);
              return (
                <div key={i}>
                  <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 3 }}>
                    <span style={{ fontSize: 12, color: "#374151", fontWeight: 600 }}>{label} <span style={{ fontSize: 10, color: "#9ca3af", fontWeight: 400 }}>(slot{s.slotNum})</span></span>
                    <span style={{ fontSize: 12, fontWeight: 700, color: barColor }}>{s.count.toLocaleString()}회</span>
                  </div>
                  <div style={{ height: 8, background: "#f3f4f6", borderRadius: 4, overflow: "hidden" }}>
                    <div style={{ height: "100%", width: `${pct}%`, background: barColor, borderRadius: 4, transition: "width 0.4s" }} />
                  </div>
                </div>
              );
            })}
          </div>
        )}
        <div style={{ marginTop: 12, fontSize: 10, color: "#9ca3af" }}>
          * 광고 영역 클릭 시 자동 집계됩니다. 실제 애드센스 클릭과는 다를 수 있습니다.
        </div>
      </div>
    </div>
  );
}

// ─── 광고 슬롯 3종 정의 ──────────────────────────────────────────────────────
export const SLOT_DEFS = [
  {
    id: "slot1",
    label: "슬롯 1 — 반응형 (권장)",
    shortLabel: "반응형",
    desc: "data-ad-format=\"auto\" data-full-width-responsive=\"true\" — 컨테이너 폭에 맞게 자동 조정",
    color: "#6366f1",
    bgColor: "#f5f3ff",
    borderColor: "#c7d2fe",
  },
  {
    id: "slot2",
    label: "슬롯 2 — 직사각형 (300×250)",
    shortLabel: "직사각형",
    desc: "data-ad-format=\"rectangle\" — 본문 중간 삽입에 최적화된 고정 크기",
    color: "#0ea5e9",
    bgColor: "#f0f9ff",
    borderColor: "#bae6fd",
  },
  {
    id: "slot3",
    label: "슬롯 3 — 멀티플렉스 / 하단 배너",
    shortLabel: "멀티플렉스",
    desc: "본문 하단 댓글창 바로 위 배치 — 멀티플렉스 또는 수평 배너(728×90) 클릭률 최상위권",
    color: "#10b981",
    bgColor: "#f0fdf4",
    borderColor: "#bbf7d0",
  },
] as const;

type SlotId = "slot1" | "slot2" | "slot3";

// ─── 광고 배치 위치 옵션 ──────────────────────────────────────────────────────
const POSITION_OPTIONS = [
  {
    key: "after_title",
    label: "제목 바로 아래 (최상단)",
    desc: "h1 제목 바로 아래 또는 본문 첫 줄 앞 — 시선이 머무는 시간이 가장 길어 노출 가치 최상위권",
    icon: "①",
    defaultSlot: "slot1" as SlotId,
  },
  {
    key: "after_intro",
    label: "도입부 이후 (상단 반응형)",
    desc: "첫 번째 소제목(h2) 이전 마지막 단락 이후 — 헤드라인 바로 아래 반응형(slot1) 권장",
    icon: "②",
    defaultSlot: "slot1" as SlotId,
  },
  {
    key: "after_toc",
    label: "목차 이후",
    desc: "목차(Table of Contents) 블록 바로 아래에 삽입",
    icon: "②",
    defaultSlot: "slot1" as SlotId,
  },
  {
    key: "between_headings",
    label: "소제목 사이 (본문 중간 인피드)",
    desc: "소제목(h2) 사이에 삽입 — 직사각형(300×250) slot2 권장, 최대 2개 배치",
    icon: "③",
    defaultSlot: "slot2" as SlotId,
  },
  {
    key: "after_qa",
    label: "묻고 답하기 이후",
    desc: "FAQ/Q&A 섹션 또는 '묻고 답하기' 블록 이후에 삽입",
    icon: "④",
    defaultSlot: "slot2" as SlotId,
  },
  {
    key: "post_bottom_adsense",
    label: "본문 하단 (댓글창 바로 위)",
    desc: "글 끝까지 읽은 독자 공략 — 멀티플렉스 또는 수평 배너(slot3) 권장, 클릭률 최상위권",
    icon: "⑤",
    defaultSlot: "slot3" as SlotId,
  },
];

// 최적 기본 배치: 제목 아래 1개 + 본문 중간 인피드 1~2개 + 하단 멀티플렉스 1개
const DEFAULT_POSITIONS = ["after_title", "between_headings", "post_bottom_adsense"];

const DEFAULT_POSITION_SLOTS: Record<string, SlotId> = {
  // 슬롯1(반응형): 제목 바로 아래 + 도입부 이후 상단 반응형
  after_title: "slot1",
  after_intro: "slot1",
  after_toc: "slot1",
  // 슬롯2(인피드/직사각형): 본문 중간 소제목 사이 1~2개
  between_headings: "slot2",
  after_qa: "slot2",
  // 슬롯3(멀티플렉스/수평 배너): 본문 하단 댓글창 바로 위 1개
  post_bottom_adsense: "slot3",
};

type SlotCodes = Record<SlotId, string>;

export function AdminAdsTab() {
  const { data: config, refetch } = trpc.admin.getSiteConfig.useQuery();
  const updateConfig = trpc.admin.updateSiteConfig.useMutation({
    onSuccess: () => { toast.success("광고 설정이 저장되었습니다."); refetch(); },
    onError: (e) => toast.error("저장 실패: " + e.message),
  });

  const [adsMasterEnabled, setAdsMasterEnabled] = useState(true); // 통합 광고 마스터 ON/OFF
  const [adsenseEnabled, setAdsenseEnabled] = useState(false);
  const [adsenseScriptCode, setAdsenseScriptCode] = useState("");
  const [slotCodes, setSlotCodes] = useState<SlotCodes>({ slot1: "", slot2: "", slot3: "" });
  const [maxAdsPerPost, setMaxAdsPerPost] = useState(3);
  const [minGapHeadings, setMinGapHeadings] = useState(2);
  const [selectedPositions, setSelectedPositions] = useState<string[]>(DEFAULT_POSITIONS);
  const [positionSlots, setPositionSlots] = useState<Record<string, SlotId>>(DEFAULT_POSITION_SLOTS);
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [previewSlot, setPreviewSlot] = useState<SlotId | null>(null);
  const [expandedSlot, setExpandedSlot] = useState<SlotId | null>("slot1");

  // 메인 섹션(홈) 전용 광고 설정
  const [homeAdEnabled, setHomeAdEnabled] = useState(false);
  const [homeAdSlotCode, setHomeAdSlotCode] = useState("");
  const [homeAdPosition, setHomeAdPosition] = useState<"between_sections" | "top" | "bottom" | "after_section_header" | "between_cards">("between_sections");
  const [homeAdMaxCount, setHomeAdMaxCount] = useState(2);

  // 쿠팡 파트너스 설정 (미리보기용, 읽기 전용)
  const [coupangEnabled, setCoupangEnabledPreview] = useState(false);
  const [coupangPositions, setCoupangPositionsPreview] = useState<string[]>(["end_of_post"]);
  // 쇼핑 커넥트 설정 (미리보기용, 읽기 전용)
  const [shopEnabled, setShopEnabledPreview] = useState(false);
  const [shopPositions, setShopPositionsPreview] = useState<string[]>(["post_bottom"]);
  const [shopMaxPerPost, setShopMaxPerPostPreview] = useState(1);
  const [shopWidgetCode, setShopWidgetCodePreview] = useState("");

  useEffect(() => {
    if (!config) return;
    setAdsMasterEnabled(config["ads_master_enabled"] !== "false"); // 기본값 true
    setAdsenseEnabled(config["adsense_enabled"] === "true");
    setAdsenseScriptCode(config["adsense_script_code"] ?? "");
    setSlotCodes({
      slot1: config["adsense_slot1_code"] ?? config["adsense_slot_code"] ?? "",
      slot2: config["adsense_slot2_code"] ?? "",
      slot3: config["adsense_slot3_code"] ?? "",
    });
    setMaxAdsPerPost(Number(config["adsense_max_per_post"] ?? 3));
    setMinGapHeadings(Number(config["adsense_min_gap_headings"] ?? 2));
    try {
      const pos = JSON.parse(config["adsense_positions"] ?? "null");
      if (Array.isArray(pos)) setSelectedPositions(pos);
    } catch {
      setSelectedPositions(DEFAULT_POSITIONS);
    }
    try {
      const ps = JSON.parse(config["adsense_position_slots"] ?? "null");
      if (ps && typeof ps === "object") setPositionSlots({ ...DEFAULT_POSITION_SLOTS, ...ps });
    } catch {
      setPositionSlots(DEFAULT_POSITION_SLOTS);
    }
    // 쿠팡 파트너스 미리보기용 설정 로드
    setCoupangEnabledPreview(config["coupang_enabled"] === "true");
    try {
      const cp = JSON.parse(config["coupang_positions"] ?? "null");
      if (Array.isArray(cp)) setCoupangPositionsPreview(cp);
    } catch { /* keep default */ }
    // 쇼핑 커넥트 미리보기용 설정 로드
    setShopEnabledPreview(config["shop_connect_enabled"] === "true");
    setShopWidgetCodePreview(config["shop_connect_widget_code"] ?? "");
    if (config["shop_connect_max_per_post"]) setShopMaxPerPostPreview(Number(config["shop_connect_max_per_post"]));
    try {
      const sp = JSON.parse(config["shop_connect_positions"] ?? "null");
      if (Array.isArray(sp)) setShopPositionsPreview(sp);
    } catch { /* keep default */ }
    // 메인 섹션 광고 설정 로드
    setHomeAdEnabled(config["home_ad_enabled"] === "true");
    setHomeAdSlotCode(config["home_ad_slot_code"] ?? "");
    if (config["home_ad_position"]) setHomeAdPosition(config["home_ad_position"] as any);
    if (config["home_ad_max_count"]) setHomeAdMaxCount(Number(config["home_ad_max_count"]));
  }, [config]);

  const togglePosition = (key: string) => {
    setSelectedPositions(prev =>
      prev.includes(key) ? prev.filter(p => p !== key) : [...prev, key]
    );
  };

  const updateSlotCode = (slotId: SlotId, code: string) => {
    setSlotCodes(prev => ({ ...prev, [slotId]: code }));
  };

  const updatePositionSlot = (posKey: string, slotId: SlotId) => {
    setPositionSlots(prev => ({ ...prev, [posKey]: slotId }));
  };

  const handleSave = () => {
    if (adsenseEnabled) {
      const hasAnySlot = Object.values(slotCodes).some(c => c.trim());
      if (!hasAnySlot) {
        toast.error("최소 1개의 광고 슬롯 코드를 입력해주세요.");
        return;
      }
      const missingSlots = selectedPositions.filter(pos => {
        const slotId = positionSlots[pos] ?? "slot1";
        return !slotCodes[slotId as SlotId]?.trim();
      });
      if (missingSlots.length > 0) {
        const missingLabels = missingSlots.map(pos => {
          const opt = POSITION_OPTIONS.find(o => o.key === pos);
          const slotId = positionSlots[pos] ?? "slot1";
          const slotDef = SLOT_DEFS.find(s => s.id === slotId);
          return `"${opt?.label}" → ${slotDef?.shortLabel}`;
        }).join(", ");
        toast.error(`다음 위치에 할당된 슬롯 코드가 없습니다: ${missingLabels}`);
        return;
      }
    }
    if (selectedPositions.length === 0 && adsenseEnabled) {
      toast.error("광고 배치 위치를 최소 1개 이상 선택해주세요.");
      return;
    }
    updateConfig.mutate({
      ads_master_enabled: String(adsMasterEnabled),
      adsense_enabled: String(adsenseEnabled),
      adsense_script_code: adsenseScriptCode,
      adsense_slot1_code: slotCodes.slot1,
      adsense_slot2_code: slotCodes.slot2,
      adsense_slot3_code: slotCodes.slot3,
      adsense_slot_code: slotCodes.slot1,
      adsense_max_per_post: String(maxAdsPerPost),
      adsense_min_gap_headings: String(minGapHeadings),
      adsense_positions: JSON.stringify(selectedPositions),
      adsense_position_slots: JSON.stringify(positionSlots),
      // 메인 섹션 광고 설정
      home_ad_enabled: String(homeAdEnabled),
      home_ad_slot_code: homeAdSlotCode,
      home_ad_position: homeAdPosition,
      home_ad_max_count: String(homeAdMaxCount),
    });
  };

  const cardStyle: React.CSSProperties = {
    background: "#fff",
    borderRadius: 12,
    border: "1px solid #e5e7eb",
    padding: "20px 24px",
    marginBottom: 16,
    boxShadow: "0 1px 3px rgba(0,0,0,0.05)",
  };
  const labelStyle: React.CSSProperties = {
    fontSize: 13,
    fontWeight: 600,
    color: "#374151",
    marginBottom: 6,
    display: "block",
  };
  const inputStyle: React.CSSProperties = {
    width: "100%",
    padding: "10px 12px",
    border: "1px solid #d1d5db",
    borderRadius: 8,
    fontSize: 12,
    color: "#111827",
    background: "#fafafa",
    outline: "none",
    boxSizing: "border-box",
  };

  return (
    <div style={{ maxWidth: 760, margin: "0 auto", padding: "8px 0 40px" }}>
      {/* 헤더 */}
      <div style={{ marginBottom: 20 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 4 }}>
          <Megaphone size={18} color="#6366f1" />
          <span style={{ fontSize: 18, fontWeight: 700, color: "#111827" }}>광고 설정</span>
        </div>
        <p style={{ fontSize: 12, color: "#6b7280", margin: 0 }}>
          애드센스 광고 슬롯을 최대 3종 등록하고, 각 배치 위치마다 사용할 슬롯을 선택하세요.
        </p>
      </div>

      {/* 0. 통합 광고 마스터 ON/OFF */}
      <div style={{ ...cardStyle, border: adsMasterEnabled ? "1px solid #e5e7eb" : "2px solid #dc2626", background: adsMasterEnabled ? "#fff" : "#fff5f5" }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          <div>
            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <span style={{ fontSize: 14, fontWeight: 700, color: adsMasterEnabled ? "#111827" : "#dc2626" }}>
                통합 광고 {adsMasterEnabled ? "ON" : "OFF"}
              </span>
              {adsMasterEnabled
                ? <Badge style={{ background: "#dcfce7", color: "#16a34a", fontSize: 10 }}>전체 활성화</Badge>
                : <Badge style={{ background: "#fee2e2", color: "#dc2626", fontSize: 10 }}>전체 비활성화</Badge>
              }
            </div>
            <div style={{ fontSize: 12, color: adsMasterEnabled ? "#6b7280" : "#dc2626", marginTop: 2 }}>
              {adsMasterEnabled
                ? "애드센스 · 쿠팡 파트너스 모든 광고가 정상 동작합니다"
                : "⛔ 현재 모든 광고가 전체 비활성화되어 있습니다. 글별 설정과 무관하게 전체 글에서 광고가 숨겨집니다."
              }
            </div>
          </div>
          <Switch checked={adsMasterEnabled} onCheckedChange={setAdsMasterEnabled} />
        </div>
      </div>

      {/* 1. 애드센스 활성화 */}
      <div style={cardStyle}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          <div>
            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <span style={{ fontSize: 14, fontWeight: 700, color: "#111827" }}>애드센스 광고 활성화</span>
              {adsenseEnabled
                ? <Badge style={{ background: "#dcfce7", color: "#16a34a", fontSize: 10 }}>활성화</Badge>
                : <Badge style={{ background: "#f3f4f6", color: "#6b7280", fontSize: 10 }}>비활성화</Badge>
              }
            </div>
            <div style={{ fontSize: 12, color: "#6b7280", marginTop: 2 }}>게시글 본문에 애드센스 광고를 자동으로 삽입합니다</div>
          </div>
          <Switch checked={adsenseEnabled} onCheckedChange={setAdsenseEnabled} />
        </div>

        {adsenseEnabled && (
          <div style={{ marginTop: 20 }}>
            <label style={labelStyle}>
              <Code2 size={13} style={{ display: "inline", marginRight: 4 }} />
              애드센스 스크립트 코드 (head 삽입용)
            </label>
            <div style={{ fontSize: 11, color: "#9ca3af", marginBottom: 6 }}>
              애드센스 계정에서 발급받은{" "}
              <code style={{ background: "#f3f4f6", padding: "1px 4px", borderRadius: 3 }}>
                &lt;script async src="https://pagead2.googlesyndication.com/..."&gt;&lt;/script&gt;
              </code>{" "}
              코드를 입력하세요. 페이지당 한 번만 삽입됩니다.
            </div>
            <textarea
              value={adsenseScriptCode}
              onChange={e => setAdsenseScriptCode(e.target.value)}
              placeholder={`<script async src="https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js?client=ca-pub-XXXXXXXXXX" crossorigin="anonymous"></script>`}
              rows={3}
              style={{ ...inputStyle, fontFamily: "monospace", fontSize: 11, resize: "vertical" }}
            />
          </div>
        )}
      </div>

      {/* 2. 광고 슬롯 3종 등록 */}
      {adsenseEnabled && (
        <div style={cardStyle}>
          <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 4 }}>
            <Layers size={14} color="#6366f1" />
            <span style={{ fontSize: 14, fontWeight: 700, color: "#111827" }}>광고 슬롯 코드 등록</span>
          </div>
          <p style={{ fontSize: 12, color: "#6b7280", marginBottom: 16 }}>
            최대 3가지 광고 단위 코드를 등록하세요. 각 배치 위치마다 어떤 슬롯을 사용할지 아래에서 선택합니다.
          </p>

          <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
            {SLOT_DEFS.map(slot => {
              const isExpanded = expandedSlot === slot.id;
              const hasCode = !!slotCodes[slot.id]?.trim();
              return (
                <div
                  key={slot.id}
                  style={{
                    border: `1px solid ${hasCode ? slot.borderColor : "#e5e7eb"}`,
                    borderRadius: 10,
                    overflow: "hidden",
                    background: hasCode ? slot.bgColor : "#fafafa",
                  }}
                >
                  <button
                    onClick={() => setExpandedSlot(isExpanded ? null : slot.id)}
                    style={{
                      width: "100%", background: "none", border: "none", cursor: "pointer",
                      display: "flex", alignItems: "center", gap: 12,
                      padding: "12px 16px", textAlign: "left",
                    }}
                  >
                    <div style={{
                      width: 32, height: 32, borderRadius: 8, flexShrink: 0,
                      background: hasCode ? slot.color : "#e5e7eb",
                      display: "flex", alignItems: "center", justifyContent: "center",
                      fontSize: 11, fontWeight: 700, color: "#fff",
                    }}>
                      {slot.id === "slot1" ? "S1" : slot.id === "slot2" ? "S2" : "S3"}
                    </div>
                    <div style={{ flex: 1 }}>
                      <div style={{ fontSize: 13, fontWeight: 600, color: hasCode ? slot.color : "#374151" }}>
                        {slot.label}
                      </div>
                      <div style={{ fontSize: 11, color: "#9ca3af", marginTop: 1 }}>{slot.desc}</div>
                    </div>
                    <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                      {hasCode
                        ? <Badge style={{ background: "#dcfce7", color: "#16a34a", fontSize: 10 }}>등록됨</Badge>
                        : <Badge style={{ background: "#f3f4f6", color: "#9ca3af", fontSize: 10 }}>미등록</Badge>
                      }
                      {isExpanded ? <ChevronUp size={15} color="#9ca3af" /> : <ChevronDown size={15} color="#9ca3af" />}
                    </div>
                  </button>

                  {isExpanded && (
                    <div style={{ padding: "0 16px 16px" }}>
                      <div style={{ fontSize: 11, color: "#6b7280", marginBottom: 6 }}>
                        애드센스 &gt; 광고 &gt; 광고 단위에서 생성한{" "}
                        <code style={{ background: "#f3f4f6", padding: "1px 4px", borderRadius: 3 }}>
                          &lt;ins class="adsbygoogle"...&gt;
                        </code>{" "}
                        코드를 붙여넣으세요.
                      </div>
                      <textarea
                        value={slotCodes[slot.id]}
                        onChange={e => updateSlotCode(slot.id, e.target.value)}
                        placeholder={`<ins class="adsbygoogle"\n     style="display:block"\n     data-ad-client="ca-pub-XXXXXXXXXX"\n     data-ad-slot="XXXXXXXXXX"\n     data-ad-format="auto"\n     data-full-width-responsive="true"></ins>`}
                        rows={5}
                        style={{ ...inputStyle, fontFamily: "monospace", fontSize: 11, resize: "vertical" }}
                      />
                      {slotCodes[slot.id]?.trim() && (
                        <button
                          onClick={() => setPreviewSlot(previewSlot === slot.id ? null : slot.id)}
                          style={{ marginTop: 6, fontSize: 11, color: slot.color, background: "none", border: "none", cursor: "pointer", display: "flex", alignItems: "center", gap: 4 }}
                        >
                          {previewSlot === slot.id ? <EyeOff size={12} /> : <Eye size={12} />}
                          {previewSlot === slot.id ? "코드 숨기기" : "입력된 코드 확인"}
                        </button>
                      )}
                      {previewSlot === slot.id && slotCodes[slot.id]?.trim() && (
                        <pre style={{ marginTop: 8, background: "#1e1e2e", color: "#cdd6f4", padding: "12px 14px", borderRadius: 8, fontSize: 11, overflow: "auto", maxHeight: 120 }}>
                          {slotCodes[slot.id]}
                        </pre>
                      )}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* 3. 배치 위치 + 슬롯 선택 */}
      {adsenseEnabled && (
        <div style={cardStyle}>
          <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 4 }}>
            <LayoutTemplate size={14} color="#6366f1" />
            <span style={{ fontSize: 14, fontWeight: 700, color: "#111827" }}>배치 위치 및 슬롯 선택</span>
          </div>
          <p style={{ fontSize: 12, color: "#6b7280", marginBottom: 16 }}>
            광고를 삽입할 위치를 선택하고, 각 위치에서 사용할 슬롯(광고 사이즈)을 지정하세요.
          </p>

          <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
            {POSITION_OPTIONS.map(opt => {
              const active = selectedPositions.includes(opt.key);
              const currentSlot = positionSlots[opt.key] ?? opt.defaultSlot;
              const slotDef = SLOT_DEFS.find(s => s.id === currentSlot)!;
              return (
                <div
                  key={opt.key}
                  style={{
                    borderRadius: 10,
                    border: active ? "2px solid #6366f1" : "1px solid #e5e7eb",
                    background: active ? "#f5f3ff" : "#fafafa",
                    overflow: "hidden",
                  }}
                >
                  <div
                    onClick={() => togglePosition(opt.key)}
                    style={{ display: "flex", alignItems: "center", gap: 12, padding: "12px 14px", cursor: "pointer" }}
                  >
                    <div style={{
                      width: 32, height: 32, borderRadius: 8, flexShrink: 0,
                      background: active ? "linear-gradient(135deg, #6366f1, #8b5cf6)" : "#e5e7eb",
                      display: "flex", alignItems: "center", justifyContent: "center",
                      fontSize: 14, fontWeight: 700, color: active ? "#fff" : "#9ca3af",
                    }}>
                      {opt.icon}
                    </div>
                    <div style={{ flex: 1 }}>
                      <div style={{ fontSize: 13, fontWeight: 600, color: active ? "#4f46e5" : "#374151" }}>{opt.label}</div>
                      <div style={{ fontSize: 11, color: "#9ca3af", marginTop: 2 }}>{opt.desc}</div>
                    </div>
                    <div style={{
                      width: 20, height: 20, borderRadius: "50%", flexShrink: 0,
                      background: active ? "#6366f1" : "#e5e7eb",
                      display: "flex", alignItems: "center", justifyContent: "center",
                    }}>
                      {active && <div style={{ width: 8, height: 8, borderRadius: "50%", background: "#fff" }} />}
                    </div>
                  </div>

                  {active && (
                    <div
                      style={{
                        borderTop: "1px solid #e0e7ff",
                        padding: "10px 14px",
                        background: "#eef2ff",
                        display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap",
                      }}
                      onClick={e => e.stopPropagation()}
                    >
                      <span style={{ fontSize: 11, fontWeight: 600, color: "#4f46e5", flexShrink: 0 }}>
                        사용할 슬롯:
                      </span>
                      {SLOT_DEFS.map(s => {
                        const isSelected = currentSlot === s.id;
                        const hasCode = !!slotCodes[s.id]?.trim();
                        return (
                          <button
                            key={s.id}
                            onClick={() => updatePositionSlot(opt.key, s.id)}
                            disabled={!hasCode}
                            title={!hasCode ? "슬롯 코드를 먼저 등록하세요" : ""}
                            style={{
                              padding: "5px 12px", borderRadius: 20, cursor: hasCode ? "pointer" : "not-allowed",
                              border: isSelected ? `2px solid ${s.color}` : "1px solid #d1d5db",
                              background: isSelected ? s.bgColor : "#fff",
                              color: isSelected ? s.color : hasCode ? "#374151" : "#d1d5db",
                              fontWeight: isSelected ? 700 : 500,
                              fontSize: 11,
                              display: "flex", alignItems: "center", gap: 4,
                              opacity: hasCode ? 1 : 0.5,
                            }}
                          >
                            <span style={{
                              width: 8, height: 8, borderRadius: "50%",
                              background: hasCode ? s.color : "#d1d5db",
                              display: "inline-block", flexShrink: 0,
                            }} />
                            {s.shortLabel}
                            {!hasCode && <span style={{ fontSize: 9, color: "#9ca3af" }}>(미등록)</span>}
                          </button>
                        );
                      })}
                      <span style={{ fontSize: 10, color: "#6b7280", marginLeft: "auto" }}>
                        → {slotDef.label}
                      </span>
                    </div>
                  )}
                </div>
              );
            })}
          </div>

          {selectedPositions.length === 0 && (
            <div style={{ marginTop: 10, display: "flex", alignItems: "center", gap: 6, color: "#ef4444", fontSize: 12 }}>
              <AlertCircle size={13} /> 최소 1개 이상의 위치를 선택해야 합니다.
            </div>
          )}
        </div>
      )}

      {/* 4. 고급 설정 */}
      {adsenseEnabled && (
        <div style={cardStyle}>
          <button
            onClick={() => setShowAdvanced(!showAdvanced)}
            style={{ width: "100%", background: "none", border: "none", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "space-between", padding: 0 }}
          >
            <div style={{ fontSize: 14, fontWeight: 700, color: "#111827" }}>
              <Settings2 size={14} style={{ display: "inline", marginRight: 6 }} />
              고급 설정
            </div>
            {showAdvanced ? <ChevronUp size={16} color="#6b7280" /> : <ChevronDown size={16} color="#6b7280" />}
          </button>
          {showAdvanced && (
            <div style={{ marginTop: 16, display: "flex", flexDirection: "column", gap: 16 }}>
              <div>
                <label style={labelStyle}>게시글당 최대 광고 수</label>
                <div style={{ fontSize: 11, color: "#9ca3af", marginBottom: 8 }}>
                  게시글 1개에 삽입할 수 있는 최대 광고 개수입니다. (권장: 2~4개)
                </div>
                <div style={{ display: "flex", gap: 8 }}>
                  {[2, 3, 4].map(n => (
                    <button
                      key={n}
                      onClick={() => setMaxAdsPerPost(n)}
                      style={{
                        padding: "8px 20px", borderRadius: 8,
                        border: maxAdsPerPost === n ? "2px solid #6366f1" : "1px solid #d1d5db",
                        background: maxAdsPerPost === n ? "#f5f3ff" : "#fff",
                        color: maxAdsPerPost === n ? "#4f46e5" : "#374151",
                        fontWeight: maxAdsPerPost === n ? 700 : 500,
                        fontSize: 13, cursor: "pointer",
                      }}
                    >
                      {n}개
                    </button>
                  ))}
                </div>
              </div>
              <div>
                <label style={labelStyle}>광고 간 최소 소제목 거리</label>
                <div style={{ fontSize: 11, color: "#9ca3af", marginBottom: 8 }}>
                  두 광고 사이에 최소 몇 개의 소제목(h2)이 있어야 하는지 설정합니다.
                </div>
                <div style={{ display: "flex", gap: 8 }}>
                  {[1, 2, 3].map(n => (
                    <button
                      key={n}
                      onClick={() => setMinGapHeadings(n)}
                      style={{
                        padding: "8px 20px", borderRadius: 8,
                        border: minGapHeadings === n ? "2px solid #6366f1" : "1px solid #d1d5db",
                        background: minGapHeadings === n ? "#f5f3ff" : "#fff",
                        color: minGapHeadings === n ? "#4f46e5" : "#374151",
                        fontWeight: minGapHeadings === n ? 700 : 500,
                        fontSize: 13, cursor: "pointer",
                      }}
                    >
                      {n}개
                    </button>
                  ))}
                </div>
              </div>
              <div style={{ background: "#f0fdf4", border: "1px solid #bbf7d0", borderRadius: 8, padding: "10px 14px", display: "flex", gap: 8, alignItems: "flex-start" }}>
                <Smartphone size={14} color="#16a34a" style={{ marginTop: 1, flexShrink: 0 }} />
                <div style={{ fontSize: 11, color: "#15803d", lineHeight: 1.6 }}>
                  <strong>모바일 자동 조정</strong><br />
                  모바일 화면에서는 광고가 2개 연속으로 붙어 나오지 않도록 자동으로 조정됩니다.
                </div>
              </div>
            </div>
          )}
        </div>
      )}

      {/* 광고 배치 미리보기 패널 */}
      <div style={cardStyle}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 12 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <Eye size={16} color="#6366f1" />
            <span style={{ fontSize: 14, fontWeight: 700, color: "#111827" }}>광고 배치 미리보기</span>
            <span style={{ fontSize: 11, color: "#9ca3af" }}>현재 설정대로 샘플 본문에 광고가 어떻게 배치되는지 확인합니다</span>
          </div>
        </div>

        {/* 범례 */}
        <div style={{ display: "flex", flexWrap: "wrap", gap: 8, marginBottom: 12 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 5, background: "#eff6ff", border: "1px solid #c7d2fe", borderRadius: 6, padding: "4px 10px" }}>
            <div style={{ width: 10, height: 10, borderRadius: 2, background: "#6366f1" }} />
            <span style={{ fontSize: 11, color: "#4338ca", fontWeight: 600 }}>애드센스</span>
            <span style={{ fontSize: 10, color: "#818cf8" }}>{adsenseEnabled ? "ON" : "OFF"}</span>
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 5, background: "#fff7ed", border: "1px solid #fed7aa", borderRadius: 6, padding: "4px 10px" }}>
            <div style={{ width: 10, height: 10, borderRadius: 2, background: "#f97316" }} />
            <span style={{ fontSize: 11, color: "#c2410c", fontWeight: 600 }}>쿠팡 파트너스</span>
            <span style={{ fontSize: 10, color: "#fb923c" }}>{coupangEnabled ? "ON" : "OFF"}</span>
          </div>
{/* 쇼핑 커넥트 범례 숨김 처리 */}
        </div>

        {!adsMasterEnabled && (
          <div style={{ background: "#fee2e2", border: "1px solid #fca5a5", borderRadius: 8, padding: "10px 14px", marginBottom: 12, fontSize: 12, color: "#dc2626" }}>
            ⛔ 통합 광고가 OFF 상태입니다. 미리보기는 설정이 ON일 때를 기준으로 표시됩니다.
          </div>
        )}

        <div style={{ border: "1px solid #e5e7eb", borderRadius: 8, overflow: "hidden" }}>
          {/* 미리보기 샘플 본문 */}
          <div style={{ background: "#f9fafb", padding: "16px 20px", maxHeight: 600, overflowY: "auto" }}>
            <div style={{ fontSize: 13, fontWeight: 700, color: "#111827", marginBottom: 8 }}>샘플 글: "광고 배치 시뮬레이션"</div>

            {/* 제목 */}
            <div style={{ background: "#fff", borderRadius: 6, padding: "8px 14px", marginBottom: 6, fontSize: 14, fontWeight: 700, color: "#111827" }}>
              📝 글 제목 예시 — 샘플 게시글의 제목입니다
            </div>

            {/* 제목 바로 아래 애드센스 */}
            {adsenseEnabled && selectedPositions.includes("after_title") && (() => {
              const slotId = positionSlots["after_title"] ?? "slot1";
              const slotDef = SLOT_DEFS.find(s => s.id === slotId);
              return (
                <div style={{ background: "#eff6ff", border: "2px dashed #6366f1", borderRadius: 8, padding: "10px 14px", marginBottom: 6, display: "flex", alignItems: "center", gap: 8 }}>
                  <Megaphone size={14} color="#6366f1" />
                  <div>
                    <div style={{ fontSize: 11, fontWeight: 700, color: "#6366f1" }}>📢 애드센스 — 제목 바로 아래 ({slotDef?.shortLabel ?? slotId})</div>
                    <div style={{ fontSize: 10, color: "#818cf8" }}>{slotCodes[slotId as SlotId]?.trim() ? "코드 설정됨" : "⚠️ 코드 미입력"}</div>
                  </div>
                </div>
              );
            })()}

            {/* 도입부 */}
            <div style={{ background: "#fff", borderRadius: 6, padding: "10px 14px", marginBottom: 6, fontSize: 12, color: "#374151", lineHeight: 1.7 }}>
              📄 도입부 — 이 글은 광고 배치 미리보기용 샘플입니다. 실제 게시글에서는 현재 설정된 위치와 개수에 따라 광고가 자동으로 삽입됩니다.
            </div>

            {/* 도입부 이후 애드센스 */}
            {adsenseEnabled && selectedPositions.includes("after_intro") && (() => {
              const slotId = positionSlots["after_intro"] ?? "slot1";
              const slotDef = SLOT_DEFS.find(s => s.id === slotId);
              return (
                <div style={{ background: "#eff6ff", border: "2px dashed #6366f1", borderRadius: 8, padding: "10px 14px", marginBottom: 6, display: "flex", alignItems: "center", gap: 8 }}>
                  <Megaphone size={14} color="#6366f1" />
                  <div>
                    <div style={{ fontSize: 11, fontWeight: 700, color: "#6366f1" }}>📢 애드센스 — 도입부 이후 ({slotDef?.shortLabel ?? slotId})</div>
                    <div style={{ fontSize: 10, color: "#818cf8" }}>{slotCodes[slotId as SlotId]?.trim() ? "코드 설정됨" : "⚠️ 코드 미입력"}</div>
                  </div>
                </div>
              );
            })()}

            {/* 목차 */}
            <div style={{ background: "#fff", borderRadius: 6, padding: "10px 14px", marginBottom: 6, fontSize: 12, color: "#374151", border: "1px solid #f3f4f6" }}>
              📋 목차 — 1. 소제목 A &nbsp; 2. 소제목 B &nbsp; 3. 소제목 C
            </div>

            {/* 목차 이후 애드센스 */}
            {adsenseEnabled && selectedPositions.includes("after_toc") && (() => {
              const slotId = positionSlots["after_toc"] ?? "slot1";
              const slotDef = SLOT_DEFS.find(s => s.id === slotId);
              return (
                <div style={{ background: "#eff6ff", border: "2px dashed #6366f1", borderRadius: 8, padding: "10px 14px", marginBottom: 6, display: "flex", alignItems: "center", gap: 8 }}>
                  <Megaphone size={14} color="#6366f1" />
                  <div>
                    <div style={{ fontSize: 11, fontWeight: 700, color: "#6366f1" }}>📢 애드센스 — 목차 이후 ({slotDef?.shortLabel ?? slotId})</div>
                    <div style={{ fontSize: 10, color: "#818cf8" }}>{slotCodes[slotId as SlotId]?.trim() ? "코드 설정됨" : "⚠️ 코드 미입력"}</div>
                  </div>
                </div>
              );
            })()}

            {/* 소제목 A */}
            <div style={{ background: "#fff", borderRadius: 6, padding: "8px 14px", marginBottom: 6, fontSize: 12, color: "#374151" }}>
              <strong style={{ color: "#374151" }}>H2 소제목 A</strong> — 본문 내용 예시...
            </div>

            {/* 소제목 사이 애드센스 */}
            {adsenseEnabled && selectedPositions.includes("between_headings") && (() => {
              const slotId = positionSlots["between_headings"] ?? "slot2";
              const slotDef = SLOT_DEFS.find(s => s.id === slotId);
              return (
                <div style={{ background: "#eff6ff", border: "2px dashed #6366f1", borderRadius: 8, padding: "10px 14px", marginBottom: 6, display: "flex", alignItems: "center", gap: 8 }}>
                  <Megaphone size={14} color="#6366f1" />
                  <div>
                    <div style={{ fontSize: 11, fontWeight: 700, color: "#6366f1" }}>📢 애드센스 — 소제목 사이 ({slotDef?.shortLabel ?? slotId})</div>
                    <div style={{ fontSize: 10, color: "#818cf8" }}>{slotCodes[slotId as SlotId]?.trim() ? "코드 설정됨" : "⚠️ 코드 미입력"}</div>
                  </div>
                </div>
              );
            })()}

            {/* 쿠팡 파트너스 — 소제목 사이 */}
            {coupangEnabled && coupangPositions.includes("between_headings") && (
              <div style={{ background: "#fff7ed", border: "2px dashed #f97316", borderRadius: 8, padding: "10px 14px", marginBottom: 6, display: "flex", alignItems: "center", gap: 8 }}>
                <ShoppingCart size={14} color="#f97316" />
                <div>
                  <div style={{ fontSize: 11, fontWeight: 700, color: "#c2410c" }}>🛒 쿠팡 파트너스 — 소제목 사이</div>
                  <div style={{ fontSize: 10, color: "#fb923c" }}>키워드 기반 자동 상품 카드 삽입</div>
                </div>
              </div>
            )}

            {/* 소제목 B */}
            <div style={{ background: "#fff", borderRadius: 6, padding: "8px 14px", marginBottom: 6, fontSize: 12, color: "#374151" }}>
              <strong style={{ color: "#374151" }}>H2 소제목 B</strong> — 본문 내용 예시...
            </div>

            {/* FAQ/묻고 답하기 */}
            <div style={{ background: "#fff", borderRadius: 6, padding: "8px 14px", marginBottom: 6, fontSize: 12, color: "#374151", border: "1px solid #f3f4f6" }}>
              ❓ 묻고 답하기 섹션 — Q: 질문 예시 / A: 답변 예시
            </div>

            {/* 묻고 답하기 이후 애드센스 */}
            {adsenseEnabled && selectedPositions.includes("after_qa") && (() => {
              const slotId = positionSlots["after_qa"] ?? "slot3";
              const slotDef = SLOT_DEFS.find(s => s.id === slotId);
              return (
                <div style={{ background: "#eff6ff", border: "2px dashed #6366f1", borderRadius: 8, padding: "10px 14px", marginBottom: 6, display: "flex", alignItems: "center", gap: 8 }}>
                  <Megaphone size={14} color="#6366f1" />
                  <div>
                    <div style={{ fontSize: 11, fontWeight: 700, color: "#6366f1" }}>📢 애드센스 — 묻고 답하기 이후 ({slotDef?.shortLabel ?? slotId})</div>
                    <div style={{ fontSize: 10, color: "#818cf8" }}>{slotCodes[slotId as SlotId]?.trim() ? "코드 설정됨" : "⚠️ 코드 미입력"}</div>
                  </div>
                </div>
              );
            })()}

{/* 쇼핑 커넥트 결론부 직전 숨김 */}

            {/* 쿠팡 파트너스 — 결론부 직전 */}
            {coupangEnabled && coupangPositions.includes("before_conclusion") && (
              <div style={{ background: "#fff7ed", border: "2px dashed #f97316", borderRadius: 8, padding: "10px 14px", marginBottom: 6, display: "flex", alignItems: "center", gap: 8 }}>
                <ShoppingCart size={14} color="#f97316" />
                <div>
                  <div style={{ fontSize: 11, fontWeight: 700, color: "#c2410c" }}>🛒 쿠팡 파트너스 — 결론부 직전</div>
                  <div style={{ fontSize: 10, color: "#fb923c" }}>키워드 기반 자동 상품 카드 삽입</div>
                </div>
              </div>
            )}

            {/* 결론부 */}
            <div style={{ background: "#fff", borderRadius: 6, padding: "8px 14px", marginBottom: 6, fontSize: 12, color: "#374151" }}>
              <strong style={{ color: "#374151" }}>결론</strong> — 마지막 단락 내용 예시...
            </div>

{/* 쇼핑 커넥트 묻고답하기/스펙비교표 숨김 */}

            {/* 글 최하단 — 쿠팡 파트너스 */}
            {coupangEnabled && coupangPositions.includes("end_of_post") && (
              <div style={{ background: "#fff7ed", border: "2px dashed #f97316", borderRadius: 8, padding: "10px 14px", marginBottom: 6, display: "flex", alignItems: "center", gap: 8 }}>
                <ShoppingCart size={14} color="#f97316" />
                <div>
                  <div style={{ fontSize: 11, fontWeight: 700, color: "#c2410c" }}>🛒 쿠팡 파트너스 — 글 최하단</div>
                  <div style={{ fontSize: 10, color: "#fb923c" }}>키워드 기반 자동 상품 카드 삽입</div>
                </div>
              </div>
            )}

{/* 쇼핑 커넥트 글최하단 숨김 */}

            {/* 아무 광고도 없을 때 */}
            {!adsenseEnabled && !coupangEnabled && !shopEnabled && (
              <div style={{ background: "#f3f4f6", borderRadius: 8, padding: "14px 16px", fontSize: 12, color: "#9ca3af", textAlign: "center" }}>
                광고를 활성화하면 여기에 배치 위치가 표시됩니다
              </div>
            )}
          </div>

          {/* 미리보기 요약 */}
          <div style={{ background: "#f8f8ff", padding: "10px 16px", borderTop: "1px solid #e5e7eb", fontSize: 11, display: "flex", flexWrap: "wrap", gap: 12 }}>
            <span style={{ color: "#6366f1" }}>📢 애드센스 {adsenseEnabled ? `${selectedPositions.length}개 위치 · 최대 ${maxAdsPerPost}개` : "OFF"}</span>
            <span style={{ color: "#c2410c" }}>🛒 쿠팡 {coupangEnabled ? `${coupangPositions.length}개 위치` : "OFF"}</span>
            {/* 쇼핑 커넥트 요약 숨김 */}
          </div>
        </div>
      </div>

      {/* 메인 섹션 전용 광고 설정 */}
      <div style={cardStyle}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 16 }}>
          <div>
            <div style={{ fontSize: 14, fontWeight: 700, color: "#111827" }}>🏠 메인 섹션 전용 광고</div>
            <div style={{ fontSize: 11, color: "#6b7280", marginTop: 2 }}>홈 페이지 섹션 사이에 삽입되는 광고 단독 설정 — 게시글 광고와 독립적으로 제어됩니다</div>
          </div>
          <label style={{ display: "flex", alignItems: "center", gap: 8, cursor: "pointer" }}>
            <span style={{ fontSize: 12, color: homeAdEnabled ? "#6366f1" : "#9ca3af", fontWeight: 600 }}>{homeAdEnabled ? "ON" : "OFF"}</span>
            <div
              onClick={() => setHomeAdEnabled(v => !v)}
              style={{
                width: 40, height: 22, borderRadius: 11,
                background: homeAdEnabled ? "#6366f1" : "#d1d5db",
                position: "relative", cursor: "pointer", transition: "background 0.2s",
              }}
            >
              <div style={{
                position: "absolute", top: 3, left: homeAdEnabled ? 21 : 3,
                width: 16, height: 16, borderRadius: "50%", background: "#fff",
                transition: "left 0.2s", boxShadow: "0 1px 3px rgba(0,0,0,0.2)",
              }} />
            </div>
          </label>
        </div>

        {homeAdEnabled && (
          <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
            {/* 광고 슬롯 코드 */}
            <div>
              <label style={labelStyle}>광고 슬롯 코드 (data-ad-slot)</label>
              <input
                type="text"
                value={homeAdSlotCode}
                onChange={e => setHomeAdSlotCode(e.target.value)}
                placeholder="예: 1234567890"
                style={inputStyle}
              />
              <div style={{ fontSize: 10, color: "#9ca3af", marginTop: 4 }}>애드센스 스크립트 코드의 data-ad-slot 값을 입력하세요. 슬롯 1과 동일한 코드를 사용해도 됩니다.</div>
            </div>

            {/* 삽입 위치 */}
            <div>
              <label style={labelStyle}>삽입 위치</label>
              <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                {[
                  { value: "top", label: "섹션 상단", desc: "첫 번째 섹션 위에 1개" },
                  { value: "between_sections", label: "섹션 사이", desc: "지정한 개수만큼 섹션 사이에 분산" },
                  { value: "after_section_header", label: "섹션 헤더 아래", desc: "각 섹션 제목 바로 아래에 삽입" },
                  { value: "between_cards", label: "카드 그리드 사이", desc: "피처드 카드와 소형 그리드 사이에 삽입" },
                  { value: "bottom", label: "섹션 하단", desc: "마지막 섹션 아래에 1개" },
                ].map(opt => (
                  <button
                    key={opt.value}
                    type="button"
                    onClick={() => setHomeAdPosition(opt.value as any)}
                    style={{
                      padding: "8px 14px", borderRadius: 8, border: `1px solid ${homeAdPosition === opt.value ? "#6366f1" : "#e5e7eb"}`,
                      background: homeAdPosition === opt.value ? "#eff6ff" : "#f9fafb",
                      color: homeAdPosition === opt.value ? "#4338ca" : "#374151",
                      fontSize: 12, fontWeight: homeAdPosition === opt.value ? 700 : 400, cursor: "pointer",
                    }}
                  >
                    <div>{opt.label}</div>
                    <div style={{ fontSize: 10, color: "#9ca3af", marginTop: 2 }}>{opt.desc}</div>
                  </button>
                ))}
              </div>
            </div>

            {/* 섹션 사이 삽입 시 개수 */}
            {homeAdPosition === "between_sections" && (
              <div>
                <label style={labelStyle}>삽입 개수 (1~4개)</label>
                <div style={{ display: "flex", gap: 6 }}>
                  {[1, 2, 3, 4].map(n => (
                    <button
                      key={n}
                      type="button"
                      onClick={() => setHomeAdMaxCount(n)}
                      style={{
                        padding: "6px 14px", borderRadius: 8, border: `1px solid ${homeAdMaxCount === n ? "#6366f1" : "#e5e7eb"}`,
                        background: homeAdMaxCount === n ? "#6366f1" : "#f9fafb",
                        color: homeAdMaxCount === n ? "#fff" : "#374151",
                        fontSize: 13, fontWeight: 600, cursor: "pointer",
                      }}
                    >{n}개</button>
                  ))}
                </div>
                <div style={{ fontSize: 10, color: "#9ca3af", marginTop: 4 }}>섹션 수가 설정값보다 적으면 가능한 범위 내에서 자동 조정됩니다.</div>
              </div>
            )}

            <div style={{ background: "#f0f9ff", borderRadius: 8, padding: "10px 14px", fontSize: 11, color: "#0369a1" }}>
              💡 메인 섹션 광고는 애드센스 스크립트 코드(슬롯1과 동일한 publisher ID)가 입력되어야 작동합니다.
              모바일에서는 자동으로 반응형 및 300×250 사이즈로 표시됩니다.
            </div>
          </div>
        )}
      </div>

      {/* 저장 버튼 */}
      <div style={{ display: "flex", justifyContent: "flex-end", gap: 10, marginTop: 8 }}>
        <Button
          onClick={handleSave}
          disabled={updateConfig.isPending}
          style={{ background: "linear-gradient(135deg, #6366f1, #8b5cf6)", color: "#fff", fontWeight: 600, fontSize: 13, padding: "10px 24px" }}
        >
          <Save size={14} style={{ marginRight: 6 }} />
          {updateConfig.isPending ? "저장 중..." : "설정 저장"}
        </Button>
      </div>

      {/* 카테고리별 광고 슬롯 설정 */}
      <CategoryAdSlotsPanel />

      {/* 광고 위치별 클릭 통계 */}
      <AdClickStatsPanel />

      {/* 하단 안내 */}
      <div style={{ marginTop: 24, padding: "14px 16px", background: "#eff6ff", border: "1px solid #c7d2fe", borderRadius: 10 }}>
        <div style={{ fontSize: 12, fontWeight: 600, color: "#4338ca", marginBottom: 6 }}>💡 쿠팡 파트너스 설정 안내</div>
        <div style={{ fontSize: 11, color: "#374151", lineHeight: 1.7 }}>
          쿠팡 파트너스의 위치 설정은 <strong>제휴 마케팅 탭</strong>에서 관리합니다.
          위 미리보기는 제휴 마케팅 탭에서 저장된 설정을 실시간으로 반영합니다.
        </div>
      </div>
    </div>
  );
}
