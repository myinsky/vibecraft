/**
 * affiliateInsert.ts
 * 게시글 HTML에 제휴 마케팅 링크(쿠팡 파트너스 / 쇼핑 커넥트)를 자동 삽입
 *
 * 가이드라인:
 * - 글의 2/3 지점 이후에만 삽입 (상단은 애드센스 영역)
 * - 최대 3개 초과 금지
 * - 텍스트 링크 / 아웃라인 버튼 / 강조 버튼 형태 지원
 * - 공정위 대가성 문구 글 최하단 자동 삽입
 */

export interface AffiliateLinkItem {
  /** 제품 링크 URL (게시글 편집 시 입력) */
  url: string;
  /** 버튼 텍스트 (기본값: 관리자 설정 값) */
  text?: string;
}

export interface AffiliateConfig {
  /** 전체 제휴 마케팅 활성화 */
  enabled: boolean;

  /** 쿠팡 파트너스 설정 */
  coupang: {
    enabled: boolean;
    buttonText: string;
    buttonStyle: "text_link" | "outline_button" | "solid_button";
    buttonColor: string;
    maxPerPost: number;
    positions: string[];
    disclaimer: boolean;
    disclaimerText: string;
  };

  /** 쇼핑 커넥트 설정 */
  shopConnect: {
    enabled: boolean;
    buttonText: string;
    buttonStyle: "text_link" | "outline_button" | "solid_button";
    buttonColor: string;
    maxPerPost: number;
    positions: string[];
    disclaimer: boolean;
    disclaimerText: string;
  };
}

/** siteConfigData에서 AffiliateConfig 파싱 */
export function parseAffiliateConfig(cfg: Record<string, string>): AffiliateConfig {
  const parsePositions = (key: string, fallback: string[]): string[] => {
    try {
      const parsed = JSON.parse(cfg[key] ?? "null");
      if (Array.isArray(parsed)) return parsed;
    } catch {}
    return fallback;
  };

  return {
    enabled: cfg["affiliate_enabled"] === "true",
    coupang: {
      enabled: cfg["coupang_enabled"] === "true",
      buttonText: cfg["coupang_button_text"] || "최저가 확인하기",
      buttonStyle: (cfg["coupang_button_style"] as AffiliateConfig["coupang"]["buttonStyle"]) || "outline_button",
      buttonColor: cfg["coupang_button_color"] || "#e8003d",
      maxPerPost: Math.min(3, Math.max(1, Number(cfg["coupang_max_per_post"] ?? 1))),
      positions: parsePositions("coupang_positions", ["before_conclusion"]),
      disclaimer: cfg["coupang_disclaimer"] !== "false",
      disclaimerText: cfg["coupang_disclaimer_text"] || "이 포스팅은 쿠팡 파트너스 활동의 일환으로, 이에 따른 일정액의 수수료를 제공받습니다.",
    },
    shopConnect: {
      enabled: cfg["shop_connect_enabled"] === "true",
      buttonText: cfg["shop_connect_button_text"] || "최저가 확인하기",
      buttonStyle: (cfg["shop_connect_button_style"] as AffiliateConfig["shopConnect"]["buttonStyle"]) || "outline_button",
      buttonColor: cfg["shop_connect_button_color"] || "#03c75a",
      maxPerPost: Math.min(3, Math.max(1, Number(cfg["shop_connect_max_per_post"] ?? 1))),
      positions: parsePositions("shop_connect_positions", ["before_conclusion"]),
      disclaimer: cfg["shop_connect_disclaimer"] !== "false",
      disclaimerText: cfg["shop_connect_disclaimer_text"] || "이 포스팅은 네이버 쇼핑 커넥트 활동의 일환으로, 이에 따른 일정액의 수수료를 제공받습니다.",
    },
  };
}

/** 버튼 스타일별 HTML 생성 */
function makeAffiliateLinkHtml(
  url: string,
  text: string,
  style: "text_link" | "outline_button" | "solid_button",
  color: string,
  platform: "coupang" | "shop_connect",
): string {
  const safeUrl = url.replace(/"/g, "&quot;");
  const safeText = text.replace(/</g, "&lt;").replace(/>/g, "&gt;");

  if (style === "text_link") {
    return `<a href="${safeUrl}" target="_blank" rel="noopener noreferrer nofollow" class="affiliate-link affiliate-${platform}" style="color:${color};font-weight:600;text-decoration:underline;text-underline-offset:2px;">→ ${safeText}</a>`;
  }
  if (style === "outline_button") {
    return `<a href="${safeUrl}" target="_blank" rel="noopener noreferrer nofollow" class="affiliate-link affiliate-${platform}" style="display:inline-block;padding:8px 20px;border:2px solid ${color};border-radius:6px;color:${color};font-weight:700;font-size:14px;text-decoration:none;transition:all 0.15s;">[ ${safeText} ]</a>`;
  }
  // solid_button
  return `<a href="${safeUrl}" target="_blank" rel="noopener noreferrer nofollow" class="affiliate-link affiliate-${platform}" style="display:inline-block;padding:10px 24px;background:${color};border-radius:6px;color:#fff;font-weight:700;font-size:14px;text-decoration:none;box-shadow:0 2px 8px ${color}55;">▶ ${safeText}</a>`;
}

/** 제휴 링크 블록 HTML 생성 */
function makeAffiliateBlockHtml(
  url: string,
  text: string,
  style: "text_link" | "outline_button" | "solid_button",
  color: string,
  platform: "coupang" | "shop_connect",
): string {
  const linkHtml = makeAffiliateLinkHtml(url, text, style, color, platform);
  return `<div class="affiliate-block affiliate-block-${platform}" style="margin:24px auto;text-align:center;clear:both;">${linkHtml}</div>`;
}

/** 공정위 문구 HTML 생성 */
function makeDisclaimerHtml(text: string, platform: "coupang" | "shop_connect"): string {
  return `<p class="affiliate-disclaimer affiliate-disclaimer-${platform}" style="margin-top:32px;padding:10px 14px;background:#f9fafb;border-left:3px solid #d1d5db;border-radius:4px;font-size:11px;color:#6b7280;line-height:1.6;">${text}</p>`;
}

/**
 * HTML 본문에 제휴 링크를 삽입
 * - 게시글 편집 시 data-affiliate-url 속성이 있는 경우 해당 URL 사용
 * - 없는 경우 관리자 설정의 기본 위치에 빈 placeholder 삽입 (실제 URL은 편집 시 입력)
 */
export function insertAffiliateLinks(
  html: string,
  config: AffiliateConfig,
  /** 게시글에 직접 지정된 제휴 링크 목록 (편집 시 입력) */
  postLinks?: {
    coupang?: AffiliateLinkItem[];
    shopConnect?: AffiliateLinkItem[];
  },
): string {
  if (!html) return html;
  if (!config.enabled) return html;
  if (typeof window === "undefined" || typeof DOMParser === "undefined") return html;

  const parser = new DOMParser();
  const doc = parser.parseFromString(`<div id="__affroot">${html}</div>`, "text/html");
  const root = doc.getElementById("__affroot");
  if (!root) return html;

  const disclaimers: string[] = [];

  // ─── 쿠팡 파트너스 ────────────────────────────────────────────────────────
  if (config.coupang.enabled) {
    const links = postLinks?.coupang ?? [];
    const cfg = config.coupang;

    links.slice(0, cfg.maxPerPost).forEach((item, idx) => {
      const url = item.url;
      if (!url?.trim()) return;
      const text = item.text || cfg.buttonText;
      const blockHtml = makeAffiliateBlockHtml(url, text, cfg.buttonStyle, cfg.buttonColor, "coupang");

      // 위치 결정: 설정된 positions 중 첫 번째 유효 위치에 삽입
      let inserted = false;
      for (const pos of cfg.positions) {
        if (inserted) break;
        inserted = insertAtPosition(doc, root, pos, blockHtml, idx);
      }
      // 위치를 못 찾으면 최하단에 삽입
      if (!inserted) {
        root.insertAdjacentHTML("beforeend", blockHtml);
      }
    });

    if (cfg.disclaimer && links.length > 0) {
      disclaimers.push(makeDisclaimerHtml(cfg.disclaimerText, "coupang"));
    }
  }

  // ─── 쇼핑 커넥트 ─────────────────────────────────────────────────────────
  if (config.shopConnect.enabled) {
    const links = postLinks?.shopConnect ?? [];
    const cfg = config.shopConnect;

    links.slice(0, cfg.maxPerPost).forEach((item, idx) => {
      const url = item.url;
      if (!url?.trim()) return;
      const text = item.text || cfg.buttonText;
      const blockHtml = makeAffiliateBlockHtml(url, text, cfg.buttonStyle, cfg.buttonColor, "shop_connect");

      let inserted = false;
      for (const pos of cfg.positions) {
        if (inserted) break;
        inserted = insertAtPosition(doc, root, pos, blockHtml, idx);
      }
      if (!inserted) {
        root.insertAdjacentHTML("beforeend", blockHtml);
      }
    });

    if (cfg.disclaimer && links.length > 0) {
      disclaimers.push(makeDisclaimerHtml(cfg.disclaimerText, "shop_connect"));
    }
  }

  // 공정위 문구 최하단 삽입
  if (disclaimers.length > 0) {
    root.insertAdjacentHTML("beforeend", disclaimers.join(""));
  }

  return root.innerHTML;
}

/** 지정된 위치 키에 따라 HTML 블록 삽입 */
function insertAtPosition(
  doc: Document,
  root: Element,
  posKey: string,
  blockHtml: string,
  index: number,
): boolean {
  const h2List = Array.from(root.querySelectorAll("h2"));
  const totalH2 = h2List.length;

  // 글의 2/3 지점 이후 h2 인덱스
  const twoThirdsIdx = Math.floor(totalH2 * 2 / 3);

  if (posKey === "before_conclusion") {
    // 마지막 h2 앞에 삽입 (글의 2/3 이후)
    const targetIdx = Math.max(twoThirdsIdx, totalH2 - 1);
    const targetH2 = h2List[targetIdx];
    if (targetH2) {
      const wrapper = doc.createElement("div");
      wrapper.innerHTML = blockHtml;
      const el = wrapper.firstElementChild;
      if (el) {
        targetH2.parentNode?.insertBefore(el, targetH2);
        return true;
      }
    }
    return false;
  }

  if (posKey === "after_qa") {
    const qaKeywords = /faq|q&a|묻고\s*답하기|자주\s*묻는|질문과\s*답변/i;
    const allHeadings = Array.from(root.querySelectorAll("h2, h3"));
    const qaHeading = allHeadings.find(h => qaKeywords.test(h.textContent ?? ""));
    if (qaHeading) {
      let lastEl: Element = qaHeading;
      let next = qaHeading.nextElementSibling;
      while (next && next.tagName !== "H2") {
        lastEl = next;
        next = next.nextElementSibling;
      }
      if (lastEl !== qaHeading) {
        const wrapper = doc.createElement("div");
        wrapper.innerHTML = blockHtml;
        const el = wrapper.firstElementChild;
        if (el) {
          lastEl.parentNode?.insertBefore(el, lastEl.nextSibling);
          return true;
        }
      }
    }
    return false;
  }

  if (posKey === "after_spec_table") {
    // table 태그 이후 (글의 2/3 이후에 있는 첫 번째 table)
    const tables = Array.from(root.querySelectorAll("table"));
    // 글의 2/3 이후에 있는 table 찾기
    const targetTable = tables.find(table => {
      const tableH2 = findPrecedingH2Index(table, h2List);
      return tableH2 >= twoThirdsIdx;
    }) ?? tables[tables.length - 1];

    if (targetTable) {
      const wrapper = doc.createElement("div");
      wrapper.innerHTML = blockHtml;
      const el = wrapper.firstElementChild;
      if (el) {
        targetTable.parentNode?.insertBefore(el, targetTable.nextSibling);
        return true;
      }
    }
    return false;
  }

  if (posKey === "end_of_post") {
    root.insertAdjacentHTML("beforeend", blockHtml);
    return true;
  }

  return false;
}

/** 요소 앞에 있는 h2의 인덱스 반환 */
function findPrecedingH2Index(el: Element, h2List: Element[]): number {
  let current: Element | null = el;
  while (current) {
    const idx = h2List.indexOf(current as HTMLHeadingElement);
    if (idx !== -1) return idx;
    current = current.previousElementSibling ?? current.parentElement;
  }
  return 0;
}
