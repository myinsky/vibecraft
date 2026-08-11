/**
 * unifiedAdInsert - 애드센스 · 쿠팡 파트너스 · 쇼핑 커넥트 3종 광고를
 * 서로 겹치지 않고 소제목(h2/h3) 간격을 두어 자동 배치하는 통합 엔진
 *
 * 배치 우선순위:
 *  1. 애드센스: after_intro → after_toc → between_headings → after_qa
 *  2. 쿠팡 파트너스 상품 카드: 설정된 위치(before_conclusion / end_of_post / between_headings)
 *     - maxPerPost > 1 이고 between_headings 선택 시 → 각 상품을 서로 다른 소제목 사이에 분산 배치
 *  3. 쇼핑 커넥트 위젯: 설정된 위치(before_conclusion / after_qa / after_spec_table / post_bottom)
 *
 * 겹침 방지:
 *  - 각 광고 삽입 후 "점유된 h2 인덱스"를 공유 레지스트리에 기록
 *  - 다음 광고는 minGapHeadings 이상 떨어진 h2 위치에만 삽입
 *  - 같은 DOM 노드에 두 광고가 삽입되지 않도록 삽입된 노드 Set 관리
 */

// ─── 타입 정의 ────────────────────────────────────────────────────────────────

export interface AdsenseSlotConfig {
  slotCode: string;
  slotCodes?: Record<string, string>;
  positionSlots?: Record<string, string>;
  maxAds: number;
  minGapHeadings: number;
  positions: string[];
}

export interface CoupangProduct {
  productId: string;
  productName: string;
  productPrice: number;
  productImage: string;
  productUrl: string;
  categoryName?: string;
}

/**
 * 쿠팡 카드 스타일
 * - "text_link"       : 텍스트 링크형 (한 줄 링크)
 * - "name_price"      : 상품명+가격형 (이미지 없음, 텍스트+가격+버튼)
 * - "image_compact"   : 이미지+제목형 (기존 기본값, 소형 가로 카드)
 * - "image_detail"    : 이미지+제목+간단설명형 (가로형, 카테고리명 포함)
 * - "image_full"      : 이미지+제목+설명형 (세로 풀카드, 대형)
 * - "link_card"        : 티스토리 링크 카드형 (좌측 이미지 + 우측 상품명, 테두리 없는 다단한 카드)
 * - "curation_grid"    : 큐레이션 그리드형 (2~5개 상품을 가로 그리드로 나열, 큐레이션 특가 스타일)
 */
export type CoupangCardStyle = "text_link" | "name_price" | "image_compact" | "image_detail" | "image_full" | "link_card" | "curation_grid";

/**
 * 쿠팡 카드 사이즈
 * - "small"  : 소형 (이미지 56px, 폰트 12px)
 * - "medium" : 중형 (이미지 72px, 폰트 13px) — 기본값
 * - "large"  : 대형 (이미지 96px, 폰트 15px)
 */
export type CoupangCardSize = "small" | "medium" | "large";

export interface CoupangConfig {
  enabled: boolean;
  products: CoupangProduct[];
  maxPerPost: number; // 1~3
  positions: string[]; // "before_conclusion" | "end_of_post" | "between_headings"
  disclaimerText: string;
  /** 카드 표시 스타일 (기본: "image_compact") */
  cardStyle?: CoupangCardStyle;
  /** 슬롯별 카드 스타일 [1번째, 2번째, 3번째] — 지정 시 cardStyle보다 우선 */
  cardStyleSlots?: (CoupangCardStyle | null)[];
  /** 카드 사이즈 (기본: "medium") */
  cardSize?: CoupangCardSize;
  /** 카드 배경색 (기본: "#ffffff") */
  cardBgColor?: string;
  /** 버튼 배경색 (기본: "#e11d48") */
  btnColor?: string;
  /** 버튼 텍스트 (기본: "지금 쿠팡에서 확인하기 →") */
  btnText?: string;
  /** 큐레이션 그리드형 선택 시 한 번에 표시할 상품 수 (2~5, 기본: 3) */
  curationGridCount?: number;
  /** 큐레이션 그리드 상단 강조 제목 텍스트 (빈 문자열이면 제목 없음) */
  curationGridTitle?: string;
  /** 큐레이션 그리드 제목 스타일 (기본: "fire") */
  curationGridTitleStyle?: "fire" | "sale" | "new" | "pick" | "plain";
}

export interface ShopConnectConfig {
  enabled: boolean;
  widgetCode: string;
  maxPerPost: number; // 1~3
  positions: string[]; // "before_conclusion" | "after_qa" | "after_spec_table" | "post_bottom"
  disclaimerText: string;
}

export interface UnifiedAdConfig {
  adsense?: AdsenseSlotConfig;
  coupang?: CoupangConfig;
  shopConnect?: ShopConnectConfig;
  /** 전역 최소 h2 간격 (광고 종류 무관하게 공유) */
  globalMinGap?: number;
}

// ─── 헬퍼 함수 ───────────────────────────────────────────────────────────────

/** 위치 키에 해당하는 애드센스 슬롯 코드 반환 */
function getAdsenseSlotCode(pos: string, cfg: AdsenseSlotConfig): string {
  if (cfg.slotCodes && cfg.positionSlots) {
    const slotId = cfg.positionSlots[pos] ?? "slot1";
    const code = cfg.slotCodes[slotId];
    if (code?.trim()) return code;
  }
  return cfg.slotCode;
}

/** 애드센스 광고 블록 HTML 생성 */
function makeAdsenseHtml(slotCode: string, index: number): string {
  const pushScript = `<script>(adsbygoogle = window.adsbygoogle || []).push({});<\/script>`;
  return `<div class="adsense-block adsense-block-${index}" data-ad-type="adsense" style="margin:28px auto;text-align:center;clear:both;max-width:100%;">${slotCode}${pushScript}</div>`;
}

/** 사이즈별 치수 반환 */
function getSizeDimensions(size: CoupangCardSize): { imgPx: number; fontSize: number; priceFontSize: number; btnFontSize: number; padding: string } {
  if (size === "small")  return { imgPx: 165, fontSize: 12, priceFontSize: 13, btnFontSize: 11, padding: "10px 12px" };
  if (size === "large")  return { imgPx: 270, fontSize: 15, priceFontSize: 16, btnFontSize: 13, padding: "18px 20px" };
  return                        { imgPx: 210, fontSize: 13, priceFontSize: 14, btnFontSize: 12, padding: "14px 16px" };
}

/** 쿠팡 이미지 URL을 서버 프록시 URL로 변환 (Referer 제한 우회) */
function proxyCoupangImageUrl(imageUrl: string): string {
  if (!imageUrl) return "";
  // 이미 절대 프록시 URL이면 그대로 반환
  if (imageUrl.includes("/api/coupang-img")) return imageUrl;
  // 쿠팡 도메인 이미지만 프록시
  try {
    const u = new URL(imageUrl);
    if (u.hostname.endsWith(".coupang.com")) {
      // BlobIframe 내부에서도 동작하도록 절대 URL 사용
      const origin = typeof window !== "undefined" ? window.location.origin : "";
      return `${origin}/api/coupang-img?url=${encodeURIComponent(imageUrl)}`;
    }
  } catch { /* ignore */ }
  return imageUrl;
}

/**
 * 큐레이션 그리드 HTML 생성 — 2~5개 상품을 가로 그리드로 나열
 * 각 상품: 이미지(정사각형) + 상품명 + 가격 + 버튼
 * 공정위 문구는 그리드 하단에 1번만 표시
 */
export function makeCurationGridHtml(
  products: CoupangProduct[],
  disclaimerText: string,
  count: number,
  cardBgColor = "#ffffff",
  btnColor = "#e11d48",
  btnText = "쿠팡에서 보기",
  gridTitle = "",
  titleStyle: "fire" | "sale" | "new" | "pick" | "plain" = "fire",
): string {
  const clampedCount = Math.min(Math.max(count, 2), 5);
  const items = products.slice(0, clampedCount);
  if (items.length === 0) return "";

  // 제목 스타일 정의
  const titleStyleMap: Record<string, { bg: string; border: string; color: string; badge: string; badgeBg: string; badgeColor: string }> = {
    fire:  { bg: "#fff7ed", border: "#fed7aa", color: "#9a3412", badge: "🔥 HOT",   badgeBg: "#ea580c", badgeColor: "#fff" },
    sale:  { bg: "#fff1f2", border: "#fecdd3", color: "#9f1239", badge: "🏷️ SALE",  badgeBg: "#e11d48", badgeColor: "#fff" },
    new:   { bg: "#f0fdf4", border: "#bbf7d0", color: "#14532d", badge: "✨ NEW",   badgeBg: "#16a34a", badgeColor: "#fff" },
    pick:  { bg: "#eff6ff", border: "#bfdbfe", color: "#1e3a8a", badge: "👍 PICK",  badgeBg: "#2563eb", badgeColor: "#fff" },
    plain: { bg: "#f8fafc", border: "#e2e8f0", color: "#1e293b", badge: "",        badgeBg: "transparent", badgeColor: "transparent" },
  };
  const ts = titleStyleMap[titleStyle] ?? titleStyleMap.fire;
  const safeTitle = gridTitle.replace(/</g, "&lt;").replace(/>/g, "&gt;");
  const titleHtml = safeTitle
    ? `<div style="display:flex;align-items:center;gap:8px;margin-bottom:10px;padding:10px 14px;background:${ts.bg};border:1.5px solid ${ts.border};border-radius:8px;">
  ${ts.badge ? `<span style="display:inline-block;padding:2px 8px;background:${ts.badgeBg};color:${ts.badgeColor};border-radius:20px;font-size:11px;font-weight:800;letter-spacing:0.5px;flex-shrink:0;">${ts.badge}</span>` : ""}
  <span style="font-size:14px;font-weight:800;color:${ts.color};line-height:1.3;">${safeTitle}</span>
</div>`
    : "";

  // 그리드 열 수: 2개→2열, 3개→3열, 4개→2열×2행(모바일 2열), 5개→5열(모바일 2+3)
  const cols = items.length <= 3 ? items.length : items.length === 4 ? 2 : 5;
  const uid = `cpq-grid-${Math.random().toString(36).slice(2, 8)}`;

  const itemsHtml = items.map(p => {
    const price = p.productPrice ? `${Number(p.productPrice).toLocaleString()}원` : "";
    const safeUrl = String(p.productUrl ?? "").replace(/"/g, "&quot;");
    const safeName = String(p.productName ?? "").replace(/</g, "&lt;").replace(/>/g, "&gt;");
    const safeImg = proxyCoupangImageUrl(String(p.productImage ?? "")).replace(/"/g, "&quot;");
    const safeProductId = String(p.productId).replace(/"/g, "&quot;").replace(/'/g, "&#39;");
    const safeBtnText = btnText.replace(/"/g, "&quot;").replace(/'/g, "&#39;");
    const trackOnclick = `onclick="(function(e){try{var d={type:'coupang_click',btnText:'${safeBtnText}',productId:'${safeProductId}'};if(window.parent&&window.parent!==window){window.parent.postMessage(d,'*');}else{window.postMessage(d,'*');}}catch(ex){}})();"`;
    return `<div class="cpq-grid-item" style="display:flex;flex-direction:column;align-items:stretch;background:${cardBgColor};border:1px solid #f3f4f6;border-radius:10px;padding:10px 8px 12px;box-shadow:0 1px 4px rgba(0,0,0,0.06);">
  <a href="${safeUrl}" target="_blank" rel="noopener noreferrer sponsored" ${trackOnclick} style="display:flex;flex-direction:column;height:100%;text-decoration:none;">
    <div style="width:100%;aspect-ratio:1/1;overflow:hidden;border-radius:7px;margin-bottom:8px;background:#f9fafb;flex-shrink:0;">
      <img src="${safeImg}" alt="${safeName}" style="width:100%;height:100%;object-fit:contain;display:block;" loading="lazy" />
    </div>
    <div style="font-size:12px;color:#1f2937;font-weight:600;line-height:1.4;margin-bottom:5px;overflow:hidden;display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;text-align:left;flex-grow:1;">${safeName}</div>
    ${price ? `<div style="font-size:13px;color:${btnColor};font-weight:800;margin-bottom:8px;text-align:left;">${price}</div>` : `<div style="margin-bottom:8px;"></div>`}
    <span style="display:block;width:100%;text-align:center;padding:6px 4px;background:${btnColor};color:#fff;border-radius:6px;font-size:11px;font-weight:700;flex-shrink:0;margin-top:auto;">${btnText}</span>
  </a>
</div>`;
  }).join("");

  const disclaimer = disclaimerText
    ? `<p style="font-size:13px;color:#374151;font-weight:500;margin:10px 0 4px;text-align:center;padding:8px 14px;background:#f9fafb;border-radius:4px;border:1px solid #e5e7eb;line-height:1.6;">⚠️ ${disclaimerText}</p>`
    : "";

  return `<style>
.${uid}{display:grid;grid-template-columns:repeat(${cols},1fr);gap:10px;margin:20px 0;align-items:stretch;}
.${uid} .cpq-grid-item{height:100%;}
@media(max-width:600px){.${uid}{grid-template-columns:repeat(2,1fr)!important;}}
</style>
<div class="coupang-block coupang-curation-grid" data-ad-type="coupang">
  ${titleHtml}
  <div class="${uid}">${itemsHtml}</div>
  ${disclaimer}
</div>`;
}

/** 단일 쿠팡 상품 카드 HTML 생성 (스타일·사이즈·색상·버튼문구 적용) */
export function makeSingleCoupangCardHtml(
  p: CoupangProduct,
  style: CoupangCardStyle,
  size: CoupangCardSize,
  cardBgColor = "#ffffff",
  btnColor = "#e11d48",
  btnText = "지금 쿠팡에서 확인하기 →",
): string {
  const price = p.productPrice ? `${Number(p.productPrice).toLocaleString()}원` : "";
  const dim = getSizeDimensions(size);
  const safeUrl = String(p.productUrl ?? "").replace(/"/g, "&quot;");
  const safeName = String(p.productName ?? "").replace(/</g, "&lt;").replace(/>/g, "&gt;");
  const safeImg = proxyCoupangImageUrl(String(p.productImage ?? "")).replace(/"/g, "&quot;");
  // 버튼 클릭 트래킹: iframe 내부에서도 동작하도록 postMessage 사용
  const safeBtnText = btnText.replace(/"/g, "&quot;").replace(/'/g, "&#39;");
  const safeProductId = String(p.productId).replace(/"/g, "&quot;").replace(/'/g, "&#39;");
  const trackOnclick = `onclick="(function(e){try{var d={type:'coupang_click',btnText:'${safeBtnText}',productId:'${safeProductId}'};if(window.parent&&window.parent!==window){window.parent.postMessage(d,'*');}else{window.postMessage(d,'*');}}catch(ex){}})();"`

  if (style === "text_link") {
    // 텍스트 링크형: 한 줄 링크
    return `<div class="coupang-product-card coupang-card-text" data-ad-type="coupang" style="margin:12px 0;padding:8px 0;">
  <a href="${safeUrl}" target="_blank" rel="noopener noreferrer sponsored" ${trackOnclick} style="font-size:${dim.fontSize}px;color:#e11d48;font-weight:700;text-decoration:underline;text-underline-offset:2px;">
    🛒 ${safeName}${price ? ` — ${price}` : ""}
  </a>
</div>`;
  }

  if (style === "name_price") {
    // 상품명+가격형: 이미지 없음, 텍스트+가격+버튼
    return `<div class="coupang-product-card coupang-card-name-price" data-ad-type="coupang" style="display:flex;align-items:center;justify-content:space-between;gap:12px;padding:${dim.padding};margin:16px 0;border:1px solid #fecdd3;border-radius:8px;background:${cardBgColor};">
  <div style="flex:1;min-width:0;">
    <div style="font-size:${dim.fontSize}px;color:#1f2937;font-weight:600;line-height:1.4;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">${safeName}</div>
    ${price ? `<div style="font-size:${dim.priceFontSize}px;color:${btnColor};font-weight:700;margin-top:4px;">${price}</div>` : ""}
  </div>
  <a href="${safeUrl}" target="_blank" rel="noopener noreferrer sponsored" ${trackOnclick} style="flex-shrink:0;display:inline-block;padding:6px 14px;background:${btnColor};color:#fff;border-radius:6px;font-size:${dim.btnFontSize}px;font-weight:700;text-decoration:none;white-space:nowrap;">${btnText}</a>
</div>`;
  }

  if (style === "image_detail") {
    // 이미지+제목+간단설명형: 이미지 크게, 우측 텍스트 영역 최소화 + 모바일 반응형
    const safeCategory = (p.categoryName ?? "").replace(/</g, "&lt;").replace(/>/g, "&gt;");
    const uid = `cpq-${Math.random().toString(36).slice(2, 8)}`;
    return `<style>@media(max-width:600px){.${uid}{flex-direction:column!important;align-items:stretch!important;}.${uid} img{width:100%!important;height:auto!important;max-height:260px;object-fit:contain;border-radius:8px 8px 0 0!important;}}</style><div class="coupang-product-card coupang-card-image-detail ${uid}" data-ad-type="coupang" style="display:flex;align-items:center;gap:12px;padding:${dim.padding};margin:20px 0;border:1px solid #e5e7eb;border-radius:10px;background:${cardBgColor};box-shadow:0 1px 4px rgba(0,0,0,0.06);">
  <img src="${safeImg}" alt="${safeName}" style="width:${dim.imgPx}px;height:${dim.imgPx}px;object-fit:contain;border-radius:6px;flex-shrink:0;" loading="lazy" />
  <div style="flex:1;min-width:0;padding:4px 0;">
    ${safeCategory ? `<div style="font-size:11px;color:#6b7280;font-weight:500;margin-bottom:4px;">${safeCategory}</div>` : ""}
    <div style="font-size:${dim.fontSize}px;color:#374151;font-weight:700;line-height:1.4;margin-bottom:6px;overflow:hidden;text-overflow:ellipsis;display:-webkit-box;-webkit-line-clamp:3;-webkit-box-orient:vertical;">${safeName}</div>
    ${price ? `<div style="font-size:${dim.priceFontSize + 2}px;color:${btnColor};font-weight:800;margin-bottom:10px;">${price}</div>` : ""}
    <a href="${safeUrl}" target="_blank" rel="noopener noreferrer sponsored" ${trackOnclick} style="display:inline-block;padding:7px 16px;background:${btnColor};color:#fff;border-radius:6px;font-size:${dim.btnFontSize}px;font-weight:700;text-decoration:none;">${btnText}</a>
  </div>
</div>`;
  }

  if (style === "image_full") {
    // 이미지+제목+설명형: 세로 풀카드
    const imgSize = Math.max(dim.imgPx, 120);
    return `<div class="coupang-product-card coupang-card-image-full" data-ad-type="coupang" style="padding:${dim.padding};margin:20px 0;border:1px solid #e5e7eb;border-radius:12px;background:${cardBgColor};box-shadow:0 2px 8px rgba(0,0,0,0.08);text-align:center;">
  <a href="${safeUrl}" target="_blank" rel="noopener noreferrer sponsored" style="text-decoration:none;display:block;">
    <img src="${safeImg}" alt="${safeName}" style="width:${imgSize}px;height:${imgSize}px;object-fit:contain;border-radius:8px;margin:0 auto 12px;" loading="lazy" />
    <div style="font-size:${dim.fontSize}px;color:#1f2937;font-weight:600;line-height:1.5;margin-bottom:8px;">${safeName}</div>
    ${price ? `<div style="font-size:${dim.priceFontSize}px;color:${btnColor};font-weight:700;margin-bottom:12px;">${price}</div>` : ""}
    <span style="display:inline-block;padding:8px 24px;background:${btnColor};color:#fff;border-radius:8px;font-size:${dim.btnFontSize}px;font-weight:700;">${btnText}</span>
  </a>
</div>`;
  }

  if (style === "link_card") {
    // 티스토리 링크 카드형: 좌측 큰 이미지 + 우측 최소 텍스트 + 모바일 반응형
    const linkImgPx = size === "small" ? 165 : size === "large" ? 270 : 210;
    const uid2 = `cpq-${Math.random().toString(36).slice(2, 8)}`;
    return `<style>@media(max-width:600px){.${uid2} a{flex-direction:column!important;}.${uid2} .lc-img-wrap{width:100%!important;height:auto!important;}.${uid2} .lc-img-wrap img{width:100%!important;height:auto!important;max-height:280px;object-fit:contain;}}</style><div class="coupang-product-card coupang-card-link ${uid2}" data-ad-type="coupang" style="display:flex;align-items:stretch;gap:0;margin:16px 0;border:1px solid #e5e7eb;border-radius:8px;background:${cardBgColor};overflow:hidden;">
  <a href="${safeUrl}" target="_blank" rel="noopener noreferrer sponsored" ${trackOnclick} style="display:flex;align-items:center;width:100%;text-decoration:none;color:inherit;">
    <div class="lc-img-wrap" style="flex-shrink:0;width:${linkImgPx}px;height:${linkImgPx}px;background:#f3f4f6;">
      <img src="${safeImg}" alt="${safeName}" style="width:${linkImgPx}px;height:${linkImgPx}px;object-fit:contain;display:block;" loading="lazy" />
    </div>
    <div style="flex:1;min-width:0;padding:12px 14px;display:flex;flex-direction:column;justify-content:center;gap:6px;">
      <div style="font-size:${dim.fontSize + 1}px;color:#111827;font-weight:700;line-height:1.45;overflow:hidden;text-overflow:ellipsis;display:-webkit-box;-webkit-line-clamp:3;-webkit-box-orient:vertical;">${safeName}</div>
      ${price ? `<div style="font-size:${dim.priceFontSize + 1}px;color:${btnColor};font-weight:800;">${price}</div>` : ""}
      <div style="font-size:12px;color:#6b7280;font-weight:500;">www.coupang.com</div>
    </div>
  </a>
</div>`;
  }

  // image_compact (기본): 가로형 이미지+제목 카드 — 이미지 크게, 우측 텍스트 최소화 + 모바일 반응형
  const uid3 = `cpq-${Math.random().toString(36).slice(2, 8)}`;
  return `<style>@media(max-width:600px){.${uid3}{flex-direction:column!important;align-items:stretch!important;}.${uid3} > img{width:100%!important;height:auto!important;max-height:260px;border-radius:8px 8px 0 0!important;}}</style><div class="coupang-product-card coupang-card-image-compact ${uid3}" data-ad-type="coupang" style="display:flex;align-items:center;gap:12px;padding:${dim.padding};margin:20px 0;border:1px solid #e5e7eb;border-radius:10px;background:${cardBgColor};box-shadow:0 1px 4px rgba(0,0,0,0.06);">
  <img src="${safeImg}" alt="${safeName}" style="width:${dim.imgPx}px;height:${dim.imgPx}px;object-fit:contain;border-radius:6px;flex-shrink:0;" loading="lazy" />
  <div style="flex:1;min-width:0;display:flex;flex-direction:column;gap:6px;padding:4px 0;">
    <div style="font-size:${dim.fontSize}px;color:#374151;font-weight:700;line-height:1.4;overflow:hidden;text-overflow:ellipsis;display:-webkit-box;-webkit-line-clamp:3;-webkit-box-orient:vertical;">${safeName}</div>
    ${price ? `<div style="font-size:${dim.priceFontSize + 2}px;color:${btnColor};font-weight:800;">${price}</div>` : ""}
    <a href="${safeUrl}" target="_blank" rel="noopener noreferrer sponsored" ${trackOnclick} style="display:inline-block;padding:7px 16px;background:${btnColor};color:#fff;border-radius:6px;font-size:${dim.btnFontSize}px;font-weight:700;text-decoration:none;align-self:flex-start;">${btnText}</a>
  </div>
</div>`;
}

/**
 * 쿠팡 상품 카드 HTML 생성
 * - products 배열의 각 상품을 개별 카드로 생성
 * - distributed=true 이면 각 카드마다 공정위 문구 표시 (분산 배치 시 사용)
 * - distributed=false 이면 전체 카드 묶음 마지막에 공정위 문구 1번 표시
 */
export function makeCoupangCardHtml(
  products: CoupangProduct[],
  disclaimerText: string,
  style: CoupangCardStyle = "image_compact",
  size: CoupangCardSize = "medium",
  distributed: boolean = false,
  cardBgColor = "#ffffff",
  btnColor = "#e11d48",
  btnText = "지금 쿠팡에서 확인하기 →",
  cardStyleSlots?: (CoupangCardStyle | null)[],
  curationGridCount?: number,
  curationGridTitle?: string,
  curationGridTitleStyle?: "fire" | "sale" | "new" | "pick" | "plain",
): string {
  // 큐레이션 그리드형: 별도 렌더러 사용
  if (style === "curation_grid") {
    return makeCurationGridHtml(products, disclaimerText, curationGridCount ?? 3, cardBgColor, btnColor, btnText, curationGridTitle ?? "", curationGridTitleStyle ?? "fire");
  }
  // 공정위 문구: 진한 회색 + 중앙 정렬 + 약간 큰 폰트로 가시성 강화
  const disclaimer = disclaimerText
    ? `<p style="font-size:14px;color:#374151;font-weight:500;margin:8px 0 12px;text-align:center;padding:8px 14px;background:#f9fafb;border-radius:4px;border:1px solid #e5e7eb;line-height:1.6;">⚠️ ${disclaimerText}</p>`
    : "";
  /** 슬롯 인덱스(0-based)에 맞는 스타일 반환 */
  const getSlotStyle = (idx: number): CoupangCardStyle =>
    (cardStyleSlots && cardStyleSlots[idx]) ? (cardStyleSlots[idx] as CoupangCardStyle) : style;

  if (distributed) {
    // 분산 배치 시: 단일 상품 카드 + 공정위 문구 (슬롯 인덱스는 호출 시 외부에서 전달)
    const card = makeSingleCoupangCardHtml(products[0], getSlotStyle(0), size, cardBgColor, btnColor, btnText);
    return `<div class="coupang-block" data-ad-type="coupang">${card}${disclaimer}</div>`;
  }
  // 일괄 배치 시: 각 상품에 슬롯별 스타일 적용 후 하나의 래퍼로 묶어서 마지막에 공정위 문구 1번
  const cards = products.map((p, i) => makeSingleCoupangCardHtml(p, getSlotStyle(i), size, cardBgColor, btnColor, btnText)).join("");
  return `<div class="coupang-block" data-ad-type="coupang">${cards}${disclaimer}</div>`;
}

/** 쇼핑 커넥트 위젯 HTML 생성 */
function makeShopConnectHtml(widgetCode: string, index: number): string {
  return `<div class="shop-connect-widget shop-connect-widget-${index}" data-ad-type="shop_connect" style="margin:24px 0 8px;">${widgetCode}</div>`;
}

/** 요소 앞에 있는 h2의 인덱스 반환 */
function findPrecedingH2Index(el: Element, h2List: Element[]): number {
  let current: Element | null = el;
  while (current) {
    const idx = h2List.indexOf(current as HTMLHeadingElement);
    if (idx !== -1) return idx;
    const prev: Element | null = current.previousElementSibling;
    if (prev) { current = prev; continue; }
    current = current.parentElement;
  }
  return 0;
}

// ─── 통합 배치 엔진 ───────────────────────────────────────────────────────────

/**
 * H2 소제목 수와 글자 수를 기반으로 최적 광고 수를 계산
 *
 * 기준:
 *  - H2 0~1개 (짧은 글):    최대 1개 (도입부 이후 1개만)
 *  - H2 2~3개 (중간 길이):  최대 2개 (도입부 + 본문 중간 1개)
 *  - H2 4개 이상 (긴 글):   최대 3개 (도입부 + 본문 중간 1~2개 + 하단)
 *  - H2 6개 이상 (매우 긴 글): 최대 4개 (전체 위치 활용)
 *
 * @param h2Count - 본문 내 H2 소제목 수
 * @param configuredMax - 관리자가 설정한 최대 광고 수 (상한선)
 */
export function calcDynamicMaxAds(h2Count: number, configuredMax: number): number {
  let dynamic: number;
  if (h2Count <= 1) {
    dynamic = 1;  // 짧은 글: 광고 과밀 방지
  } else if (h2Count <= 3) {
    dynamic = 2;  // 중간 길이: 도입부 + 중간 1개
  } else if (h2Count <= 5) {
    dynamic = 3;  // 긴 글: 도입부 + 중간 + 하단
  } else {
    dynamic = 4;  // 매우 긴 글: 전체 위치 활용
  }
  // 관리자 설정값을 상한선으로 사용
  return Math.min(dynamic, configuredMax);
}

/**
 * HTML 본문에 3종 광고를 통합 배치하여 반환
 */
export function insertUnifiedAds(html: string, cfg: UnifiedAdConfig): string {
  if (!html) return html;
  if (typeof window === "undefined" || typeof DOMParser === "undefined") return html;

  // ── 전체 HTML 문서(<!DOCTYPE html> 또는 <html>로 시작)인 경우: body 내용만 추출해 광고 삽입 후 복원
  const isFullHtmlDoc = /^\s*(<!(DOCTYPE|doctype)\s+html|<html[\s>])/i.test(html.trim());
  if (isFullHtmlDoc) {
    const parser0 = new DOMParser();
    const fullDoc = parser0.parseFromString(html, "text/html");
    const bodyHtml = fullDoc.body.innerHTML;
    const processedBody = insertUnifiedAds(bodyHtml, cfg);
    // body 내용만 교체해서 반환
    fullDoc.body.innerHTML = processedBody;
    // head style 포함한 전체 문서 재조립
    const headContent = fullDoc.head.innerHTML;
    return `<!DOCTYPE html><html lang="ko"><head>${headContent}</head><body>${fullDoc.body.innerHTML}</body></html>`;
  }

  const globalMinGap = cfg.globalMinGap ?? 2;
  const parser = new DOMParser();
  const doc = parser.parseFromString(`<div id="__adroot">${html}</div>`, "text/html");
  const root = doc.getElementById("__adroot");
  if (!root) return html;

  const h2List = Array.from(root.querySelectorAll("h2"));
  const totalH2 = h2List.length;

  // 공유 상태: 마지막 광고가 삽입된 h2 인덱스 (종류 무관)
  let lastAdH2Index = -999;
  // 이미 광고가 삽입된 DOM 노드 Set (같은 위치에 두 광고 방지)
  const occupiedNodes = new Set<Element>();

  /** 현재 h2 인덱스 기준으로 간격 체크 */
  const hasEnoughGap = (h2Idx: number): boolean => {
    return (h2Idx - lastAdH2Index) >= globalMinGap;
  };

  /** 노드 앞에 HTML 삽입 (간격 체크 포함) */
  const insertBeforeNode = (
    node: Element,
    adHtml: string,
    h2Idx: number,
    skipGapCheck = false,
  ): boolean => {
    if (occupiedNodes.has(node)) return false;
    if (!skipGapCheck && !hasEnoughGap(h2Idx)) return false;
    const wrapper = doc.createElement("div");
    wrapper.innerHTML = adHtml;
    const adEl = wrapper.firstElementChild;
    if (!adEl) return false;
    node.parentNode?.insertBefore(adEl, node);
    lastAdH2Index = h2Idx;
    occupiedNodes.add(adEl);
    return true;
  };

  /** 노드 뒤에 HTML 삽입 (간격 체크 포함) */
  const insertAfterNode = (
    node: Element,
    adHtml: string,
    h2Idx: number,
    skipGapCheck = false,
  ): boolean => {
    if (occupiedNodes.has(node)) return false;
    if (!skipGapCheck && !hasEnoughGap(h2Idx)) return false;
    const wrapper = doc.createElement("div");
    wrapper.innerHTML = adHtml;
    const adEl = wrapper.firstElementChild;
    if (!adEl) return false;
    node.parentNode?.insertBefore(adEl, node.nextSibling);
    lastAdH2Index = h2Idx;
    occupiedNodes.add(adEl);
    return true;
  };

  // ════════════════════════════════════════════════════════════════
  // 1단계: 애드센스 삽입
  // ════════════════════════════════════════════════════════════════
  if (cfg.adsense) {
    const adsCfg = cfg.adsense;
    const hasAnySlot = adsCfg.slotCode?.trim() ||
      (adsCfg.slotCodes && Object.values(adsCfg.slotCodes).some(c => c?.trim()));

    // 본문 길이 기반 동적 maxAds 계산: H2 소제목 수에 따라 광고 수 자동 조정
    const effectiveMaxAds = calcDynamicMaxAds(totalH2, adsCfg.maxAds);

    if (hasAnySlot && effectiveMaxAds > 0) {
      let adsCount = 0;

      // ① after_title: 본문 최상단 — h1/제목 바로 아래 (첫 번째 블록 요소 이전)
      if (adsCfg.positions.includes("after_title") && adsCount < effectiveMaxAds) {
        // h1이 있으면 h1 다음, 없으면 본문 첫 번째 블록 요소 앞에 삽입
        const h1El = root.querySelector("h1");
        if (h1El) {
          const code = getAdsenseSlotCode("after_title", adsCfg);
          if (code?.trim() && insertAfterNode(h1El, makeAdsenseHtml(code, adsCount), -1, true)) {
            adsCount++;
          }
        } else {
          // h1이 없으면 본문 첫 번째 p/div 앞에 삽입
          const firstBlock = root.querySelector("p, div, blockquote");
          if (firstBlock) {
            const code = getAdsenseSlotCode("after_title", adsCfg);
            if (code?.trim() && insertBeforeNode(firstBlock, makeAdsenseHtml(code, adsCount), -1, true)) {
              adsCount++;
            }
          }
        }
      }

      // ② after_intro: 첫 번째 h2 이전 마지막 <p> 이후
      if (adsCfg.positions.includes("after_intro") && adsCount < effectiveMaxAds) {
        const firstH2 = h2List[0];
        if (firstH2) {
          let target: Element | null = null;
          let sib = firstH2.previousElementSibling;
          while (sib) {
            const tag = sib.tagName.toUpperCase();
            if (tag === "P" || tag === "DIV" || tag === "BLOCKQUOTE") { target = sib; break; }
            sib = sib.previousElementSibling;
          }
          if (target) {
            const code = getAdsenseSlotCode("after_intro", adsCfg);
            if (code?.trim() && insertAfterNode(target, makeAdsenseHtml(code, adsCount), 0, true)) {
              adsCount++;
            }
          }
        }
      }

      // ② after_toc: auto-toc 블록 이후
      if (adsCfg.positions.includes("after_toc") && adsCount < effectiveMaxAds) {
        const tocEl = root.querySelector(".auto-toc") as Element | null;
        if (tocEl) {
          const tocH2 = tocEl.querySelector("h2");
          const tocH2Idx = tocH2 ? h2List.indexOf(tocH2 as HTMLHeadingElement) : 0;
          const code = getAdsenseSlotCode("after_toc", adsCfg);
          if (code?.trim() && insertAfterNode(tocEl, makeAdsenseHtml(code, adsCount), tocH2Idx)) {
            adsCount++;
          }
        }
      }

      // ③ between_headings: h2 사이 (최소 거리 준수)
      if (adsCfg.positions.includes("between_headings") && adsCount < effectiveMaxAds) {
        for (let idx = 1; idx < h2List.length; idx++) {
          if (adsCount >= effectiveMaxAds) break;
          const h2 = h2List[idx];
          const code = getAdsenseSlotCode("between_headings", adsCfg);
          if (code?.trim() && insertBeforeNode(h2, makeAdsenseHtml(code, adsCount), idx)) {
            adsCount++;
          }
        }
      }

      // ④ after_qa: FAQ/묻고 답하기 섹션 이후
      if (adsCfg.positions.includes("after_qa") && adsCount < effectiveMaxAds) {
        const qaKeywords = /faq|q&a|묻고\s*답하기|자주\s*묻는|질문과\s*답변/i;
        const allHeadings = Array.from(root.querySelectorAll("h2, h3"));
        const qaHeading = allHeadings.find(h => qaKeywords.test(h.textContent ?? ""));
        if (qaHeading) {
          let lastEl: Element = qaHeading;
          let next = qaHeading.nextElementSibling;
          while (next && next.tagName !== "H2") { lastEl = next; next = next.nextElementSibling; }
          if (lastEl !== qaHeading) {
            const qaH2Idx = findPrecedingH2Index(qaHeading, h2List);
            const code = getAdsenseSlotCode("after_qa", adsCfg);
            if (code?.trim()) insertAfterNode(lastEl, makeAdsenseHtml(code, adsCount), qaH2Idx);
          }
        }
      }

      // ⑤ post_bottom_adsense: 본문 최하단 (댓글창 바로 위 — 멀티플렉스/디스플레이 광고)
      if (adsCfg.positions.includes("post_bottom_adsense") && adsCount < effectiveMaxAds) {
        const code = getAdsenseSlotCode("post_bottom_adsense", adsCfg);
        if (code?.trim()) {
          root.insertAdjacentHTML("beforeend", makeAdsenseHtml(code, adsCount));
          adsCount++;
        }
      }
    }
  }

  // ════════════════════════════════════════════════════════════════
  // 2단계: 쿠팡 파트너스 삽입
  // ════════════════════════════════════════════════════════════════
  if (cfg.coupang?.enabled && cfg.coupang.products.length > 0) {
    const coupangCfg = cfg.coupang;
    const cardStyle: CoupangCardStyle = coupangCfg.cardStyle ?? "image_compact";
    const curationGridCount = coupangCfg.curationGridCount ?? 3;
    const curationGridTitle = coupangCfg.curationGridTitle ?? "";
    const curationGridTitleStyle = coupangCfg.curationGridTitleStyle ?? "fire";
    const cardSize: CoupangCardSize = coupangCfg.cardSize ?? "medium";
    const cardBgColor = coupangCfg.cardBgColor ?? "#ffffff";
    const btnColor = coupangCfg.btnColor ?? "#e11d48";
    const btnText = coupangCfg.btnText ?? "지금 쿠팡에서 확인하기 →";
    // curation_grid 스타일일 때는 curationGridCount 기준으로 상품 수 제한
    const maxProducts = cardStyle === "curation_grid" ? Math.min(curationGridCount, 5) : coupangCfg.maxPerPost;
    const products = coupangCfg.products.slice(0, maxProducts);
    const pos = coupangCfg.positions[0] ?? "end_of_post";

    /**
     * between_headings + 복수 상품: 소제목 사이에 1개씩 분산 배치
     * 예) 상품 2개, h2 4개 → h2[1] 앞, h2[3] 앞 (균등 분산)
     */
    if (pos === "between_headings" && products.length > 1 && totalH2 >= 2) {
      let insertedCount = 0;
      // 균등 분산: h2 인덱스를 products 수에 맞게 나눔
      // 예) products=2, h2=5 → 삽입 후보: [1, 3] (1/3 지점, 2/3 지점)
      const step = Math.max(1, Math.floor(totalH2 / (products.length + 1)));
      const targetIndices: number[] = [];
      for (let i = 1; i <= products.length; i++) {
        const idx = Math.min(i * step, totalH2 - 1);
        if (!targetIndices.includes(idx)) targetIndices.push(idx);
      }

      const cardStyleSlots = coupangCfg.cardStyleSlots;
      for (let pi = 0; pi < products.length; pi++) {
        if (insertedCount >= products.length) break;
        // 슬롯별 스타일: cardStyleSlots[pi]가 있으면 우선 사용, 없으면 전역 cardStyle
        const slotStyle: CoupangCardStyle = (cardStyleSlots && cardStyleSlots[pi]) ? (cardStyleSlots[pi] as CoupangCardStyle) : cardStyle;
        const cardHtml = makeCoupangCardHtml(
          [products[pi]],
          coupangCfg.disclaimerText, // 공정위 문구는 각 카드마다 표시
          slotStyle,
          cardSize,
          true,
          cardBgColor,
          btnColor,
          btnText,
        );
        // 목표 h2 인덱스에서 삽입 시도, 실패 시 앞뒤 탐색
        // 분산 배치는 이미 균등 간격으로 배치하므로 gap 체크 우회(skipGapCheck=true)
        const targetIdx = targetIndices[pi] ?? (pi + 1);
        let inserted = false;
        // 목표 인덱스부터 뒤로 탐색
        for (let idx = targetIdx; idx < totalH2; idx++) {
          if (insertBeforeNode(h2List[idx], cardHtml, idx, true)) {
            insertedCount++;
            inserted = true;
            break;
          }
        }
        // 뒤로 실패 시 앞으로 탐색
        if (!inserted) {
          for (let idx = targetIdx - 1; idx >= 1; idx--) {
            if (insertBeforeNode(h2List[idx], cardHtml, idx, true)) {
              insertedCount++;
              inserted = true;
              break;
            }
          }
        }
        // 완전 실패 시 최하단
        if (!inserted) {
          root.insertAdjacentHTML("beforeend", cardHtml);
          lastAdH2Index = totalH2;
          insertedCount++;
        }
      }
    } else {
      // 단일 상품 or end_of_post / before_conclusion: 기존 방식 (슬롯별 스타일 포함)
      const cardHtml = makeCoupangCardHtml(products, coupangCfg.disclaimerText, cardStyle, cardSize, false, cardBgColor, btnColor, btnText, coupangCfg.cardStyleSlots, curationGridCount, curationGridTitle, curationGridTitleStyle);
      let inserted = false;

      if (pos === "before_conclusion") {
        const lastH2 = h2List[h2List.length - 1];
        if (lastH2) {
          inserted = insertBeforeNode(lastH2, cardHtml, h2List.length - 1);
        }
      } else if (pos === "between_headings") {
        // 단일 상품 + between_headings: 글의 중간 h2 앞에 삽입
        const midIdx = Math.floor(totalH2 / 2);
        const midH2 = h2List[midIdx];
        if (midH2) {
          inserted = insertBeforeNode(midH2, cardHtml, midIdx);
        }
      } else if (pos === "end_of_post") {
        root.insertAdjacentHTML("beforeend", cardHtml);
        lastAdH2Index = totalH2;
        inserted = true;
      }

      // 폴백: 어디에도 못 넣으면 최하단
      if (!inserted) {
        root.insertAdjacentHTML("beforeend", cardHtml);
        lastAdH2Index = totalH2;
      }
    }
  }

  // ════════════════════════════════════════════════════════════════
  // 3단계: 쇼핑 커넥트 위젯 삽입
  // ════════════════════════════════════════════════════════════════
  if (cfg.shopConnect?.enabled && cfg.shopConnect.widgetCode.trim()) {
    const shopCfg = cfg.shopConnect;
    const maxWidgets = shopCfg.maxPerPost;
    let widgetCount = 0;

    // 각 위치에 순서대로 배치 (maxPerPost 개수만큼)
    for (const pos of shopCfg.positions) {
      if (widgetCount >= maxWidgets) break;
      const widgetHtml = makeShopConnectHtml(shopCfg.widgetCode, widgetCount);

      if (pos === "before_conclusion") {
        const lastH2 = h2List[h2List.length - 1];
        if (lastH2) {
          const h2Idx = h2List.length - 1;
          if (insertBeforeNode(lastH2, widgetHtml, h2Idx)) widgetCount++;
        }
      } else if (pos === "after_qa") {
        const qaKeywords = /faq|q&a|묻고\s*답하기|자주\s*묻는|질문과\s*답변/i;
        const allHeadings = Array.from(root.querySelectorAll("h2, h3"));
        const qaHeading = allHeadings.find(h => qaKeywords.test(h.textContent ?? ""));
        if (qaHeading) {
          let lastEl: Element = qaHeading;
          let next = qaHeading.nextElementSibling;
          while (next && next.tagName !== "H2") { lastEl = next; next = next.nextElementSibling; }
          if (lastEl !== qaHeading) {
            const qaH2Idx = findPrecedingH2Index(qaHeading, h2List);
            if (insertAfterNode(lastEl, widgetHtml, qaH2Idx)) widgetCount++;
          }
        }
      } else if (pos === "after_spec_table") {
        const twoThirdsIdx = Math.floor(totalH2 * 2 / 3);
        const tables = Array.from(root.querySelectorAll("table"));
        const targetTable = tables.find(table => {
          const tableH2Idx = findPrecedingH2Index(table, h2List);
          return tableH2Idx >= twoThirdsIdx;
        }) ?? tables[tables.length - 1];
        if (targetTable) {
          const tableH2Idx = findPrecedingH2Index(targetTable, h2List);
          if (insertAfterNode(targetTable, widgetHtml, tableH2Idx)) widgetCount++;
        }
      } else if (pos === "post_bottom") {
        root.insertAdjacentHTML("beforeend", widgetHtml);
        lastAdH2Index = totalH2;
        widgetCount++;
      }
    }
    // 폴백: 위치를 못 찾으면 최하단에 1개
    if (widgetCount === 0) {
      root.insertAdjacentHTML("beforeend", makeShopConnectHtml(shopCfg.widgetCode, 0));
    }
    // 공정위 문구 삽입
    if (shopCfg.disclaimerText && widgetCount > 0) {
      root.insertAdjacentHTML(
        "beforeend",
        `<p style="font-size:11px;color:#9ca3af;margin:4px 0 16px;text-align:right;">${shopCfg.disclaimerText}</p>`,
      );
    }
  }

  return root.innerHTML;
}
