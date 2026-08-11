/**
 * adsenseInsert - 게시글 본문 HTML에 애드센스 광고 블록을 자동 삽입하는 유틸리티
 *
 * 삽입 위치:
 *  - after_intro: 첫 번째 h2 이전 마지막 <p> 이후
 *  - after_toc: 목차(.auto-toc) 블록 이후
 *  - between_headings: h2 사이 (최소 거리 준수)
 *  - after_qa: FAQ/묻고 답하기 섹션 이후
 *
 * 슬롯별 코드: 각 위치마다 다른 슬롯(광고 사이즈) 코드를 사용할 수 있음
 * 모바일 연속 광고 방지: CSS로 처리 (index.css)
 */

export interface AdsenseConfig {
  /** 하위 호환용 단일 슬롯 코드 (slotCodes가 없을 때 폴백) */
  slotCode: string;
  /** 슬롯 ID별 코드 맵 { slot1: "<ins...>", slot2: "...", slot3: "..." } */
  slotCodes?: Record<string, string>;
  /** 위치별 슬롯 ID 맵 { after_intro: "slot1", between_headings: "slot2", ... } */
  positionSlots?: Record<string, string>;
  maxAds: number;
  minGapHeadings: number;
  positions: string[];
}

/** 위치 키에 해당하는 슬롯 코드 반환 */
function getSlotCodeForPosition(pos: string, cfg: AdsenseConfig): string {
  if (cfg.slotCodes && cfg.positionSlots) {
    const slotId = cfg.positionSlots[pos] ?? "slot1";
    const code = cfg.slotCodes[slotId];
    if (code?.trim()) return code;
  }
  // 폴백: 단일 슬롯 코드
  return cfg.slotCode;
}

/** 광고 블록 HTML 생성 */
function makeAdHtml(slotCode: string, index: number): string {
  const pushScript = `<script>(adsbygoogle = window.adsbygoogle || []).push({});<\/script>`;
  return `<div class="adsense-block adsense-block-${index}" style="margin:28px auto;text-align:center;clear:both;max-width:100%;">${slotCode}${pushScript}</div>`;
}

/**
 * processedContent HTML에 광고 블록 삽입 후 반환
 */
export function insertAdsIntoContent(html: string, cfg: AdsenseConfig): string {
  if (!html) return html;
  if (cfg.maxAds <= 0) return html;

  // 슬롯 코드가 하나도 없으면 삽입 안 함
  const hasAnySlot = cfg.slotCode?.trim() ||
    (cfg.slotCodes && Object.values(cfg.slotCodes).some(c => c?.trim()));
  if (!hasAnySlot) return html;

  // DOMParser는 브라우저 환경에서만 동작
  if (typeof window === "undefined" || typeof DOMParser === "undefined") return html;

  const parser = new DOMParser();
  const doc = parser.parseFromString(`<div id="__adroot">${html}</div>`, "text/html");
  const root = doc.getElementById("__adroot");
  if (!root) return html;

  let adCount = 0;
  let lastAdH2Index = -999;

  const h2List = Array.from(root.querySelectorAll("h2"));

  /** 노드 앞에 광고 삽입 */
  const insertBefore = (node: Element, posKey: string) => {
    if (adCount >= cfg.maxAds) return;
    const code = getSlotCodeForPosition(posKey, cfg);
    if (!code?.trim()) return;
    const wrapper = doc.createElement("div");
    wrapper.innerHTML = makeAdHtml(code, adCount);
    const adEl = wrapper.firstElementChild;
    if (adEl) {
      node.parentNode?.insertBefore(adEl, node);
      adCount++;
    }
  };

  /** 노드 뒤에 광고 삽입 */
  const insertAfter = (node: Element, posKey: string) => {
    if (adCount >= cfg.maxAds) return;
    const code = getSlotCodeForPosition(posKey, cfg);
    if (!code?.trim()) return;
    const wrapper = doc.createElement("div");
    wrapper.innerHTML = makeAdHtml(code, adCount);
    const adEl = wrapper.firstElementChild;
    if (adEl) {
      node.parentNode?.insertBefore(adEl, node.nextSibling);
      adCount++;
    }
  };

  // ① after_intro: 첫 번째 h2 이전 마지막 <p> 이후
  if (cfg.positions.includes("after_intro") && adCount < cfg.maxAds) {
    const firstH2 = h2List[0];
    if (firstH2) {
      let target: Element | null = null;
      let sib = firstH2.previousElementSibling;
      while (sib) {
        const tag = sib.tagName.toUpperCase();
        if (tag === "P" || tag === "DIV" || tag === "BLOCKQUOTE") {
          target = sib;
          break;
        }
        sib = sib.previousElementSibling;
      }
      if (target) {
        insertAfter(target, "after_intro");
        lastAdH2Index = 0;
      }
    }
  }

  // ② after_toc: auto-toc 블록 이후
  if (cfg.positions.includes("after_toc") && adCount < cfg.maxAds) {
    const tocEl = root.querySelector(".auto-toc") as Element | null;
    if (tocEl) {
      const tocH2 = tocEl.querySelector("h2");
      const tocH2Idx = tocH2 ? h2List.indexOf(tocH2 as HTMLHeadingElement) : 0;
      const gap = tocH2Idx - lastAdH2Index;
      if (gap >= cfg.minGapHeadings || lastAdH2Index === -999) {
        insertAfter(tocEl, "after_toc");
        lastAdH2Index = tocH2Idx;
      }
    }
  }

  // ③ between_headings: h2 사이에 삽입 (최소 거리 준수)
  if (cfg.positions.includes("between_headings") && adCount < cfg.maxAds) {
    h2List.forEach((h2, idx) => {
      if (adCount >= cfg.maxAds) return;
      if (idx === 0) return; // 첫 번째 h2는 건너뜀
      const gap = idx - lastAdH2Index;
      if (gap < cfg.minGapHeadings) return;
      insertBefore(h2, "between_headings");
      lastAdH2Index = idx;
    });
  }

  // ④ after_qa: FAQ/묻고 답하기 섹션 이후
  if (cfg.positions.includes("after_qa") && adCount < cfg.maxAds) {
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
        insertAfter(lastEl, "after_qa");
      }
    }
  }

  return root.innerHTML;
}
