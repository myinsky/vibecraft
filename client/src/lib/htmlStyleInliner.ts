/**
 * htmlStyleInliner.ts
 *
 * HTML 문자열 안의 <style> 태그 CSS 규칙을 파싱하여
 * 해당 선택자에 매칭되는 요소에 인라인 스타일로 직접 적용합니다.
 *
 * 목적: HTML 파일을 가져올 때 <style> 태그가 DB에 저장되지 않아
 * 표 스타일(헤더 배경색, 테두리 등)이 사라지는 문제를 근본적으로 해결합니다.
 */

/**
 * CSS 텍스트에서 규칙 목록 추출
 * 반환: [{ selector: string, declarations: string }]
 */
function parseCssRules(cssText: string): Array<{ selector: string; declarations: string }> {
  const rules: Array<{ selector: string; declarations: string }> = [];

  // @media, @keyframes 등 at-rule 블록 제거 (중첩 블록 포함)
  let cleaned = cssText;
  // @keyframes 등 중첩 블록 제거
  cleaned = cleaned.replace(/@[a-zA-Z-]+[^{]*\{(?:[^{}]*|\{[^{}]*\})*\}/g, "");

  // 일반 규칙 파싱: selector { declarations }
  const ruleRegex = /([^{}]+)\{([^{}]*)\}/g;
  let match: RegExpExecArray | null;
  while ((match = ruleRegex.exec(cleaned)) !== null) {
    const selector = match[1].trim();
    const declarations = match[2].trim();
    if (!selector || !declarations) continue;
    // 콤마로 구분된 다중 선택자 처리
    const selectors = selector.split(",").map(s => s.trim()).filter(Boolean);
    for (const sel of selectors) {
      rules.push({ selector: sel, declarations });
    }
  }
  return rules;
}

/**
 * 선택자가 안전하게 querySelectorAll에 사용 가능한지 확인
 * 의사 선택자(:hover, ::before 등)는 인라인 스타일로 적용 불가
 */
function isSelectorApplicable(selector: string): boolean {
  // 의사 요소/클래스는 인라인 스타일 적용 불가
  if (/::?[a-zA-Z-]+/.test(selector)) return false;
  // :root는 body에 해당하므로 건너뜀
  if (selector === ":root") return false;
  return true;
}

/**
 * 기존 인라인 스타일에 새 선언을 병합 (기존 값 우선, 새 값으로 덮어쓰지 않음)
 * 단, 표 관련 스타일은 강제 적용
 */
function mergeInlineStyle(existing: string, newDeclarations: string): string {
  const existingMap: Record<string, string> = {};
  if (existing) {
    existing.split(";").forEach(decl => {
      const [prop, ...vals] = decl.split(":");
      if (prop && vals.length) {
        existingMap[prop.trim().toLowerCase()] = vals.join(":").trim();
      }
    });
  }

  newDeclarations.split(";").forEach(decl => {
    const colonIdx = decl.indexOf(":");
    if (colonIdx === -1) return;
    const prop = decl.slice(0, colonIdx).trim().toLowerCase();
    const val = decl.slice(colonIdx + 1).trim();
    if (!prop || !val) return;
    // 기존 인라인 스타일이 없는 경우에만 적용 (인라인 스타일 우선)
    if (!(prop in existingMap)) {
      existingMap[prop] = val;
    }
  });

  return Object.entries(existingMap)
    .map(([p, v]) => `${p}: ${v}`)
    .join("; ");
}

/**
 * HTML 문자열의 <style> 태그 CSS를 인라인 스타일로 변환
 *
 * @param html - 원본 HTML 문자열
 * @returns 인라인 스타일이 적용된 HTML 문자열
 */
export function inlineHtmlStyles(html: string): string {
  if (!html || !html.includes("<style")) return html;

  try {
    const parser = new DOMParser();
    const doc = parser.parseFromString(html, "text/html");

    // <style> 태그에서 CSS 규칙 수집
    const allRules: Array<{ selector: string; declarations: string }> = [];
    doc.querySelectorAll("style").forEach(styleEl => {
      const cssText = styleEl.textContent || "";
      const rules = parseCssRules(cssText);
      allRules.push(...rules);
    });

    if (allRules.length === 0) return html;

    // 각 규칙을 해당 요소에 인라인 스타일로 적용
    for (const { selector, declarations } of allRules) {
      if (!isSelectorApplicable(selector)) continue;

      let elements: NodeListOf<Element> | null = null;
      try {
        elements = doc.querySelectorAll(selector);
      } catch {
        // 유효하지 않은 CSS 선택자 무시
        continue;
      }

      elements.forEach(el => {
        const htmlEl = el as HTMLElement;
        const existing = htmlEl.getAttribute("style") || "";
        const merged = mergeInlineStyle(existing, declarations);
        if (merged) {
          htmlEl.setAttribute("style", merged);
        }
      });
    }

    // 변환된 HTML 반환 (body 내용만)
    return doc.body.innerHTML;
  } catch (err) {
    console.warn("[htmlStyleInliner] 스타일 인라인 변환 실패:", err);
    return html;
  }
}

/**
 * 전체 HTML 문서(<!DOCTYPE html>...)를 처리하여
 * <style> CSS를 인라인 스타일로 변환한 전체 HTML 반환
 */
export function inlineHtmlStylesFullDocument(html: string): string {
  if (!html || !html.includes("<style")) return html;

  try {
    const parser = new DOMParser();
    const doc = parser.parseFromString(html, "text/html");

    // <style> 태그에서 CSS 규칙 수집
    const allRules: Array<{ selector: string; declarations: string }> = [];
    doc.querySelectorAll("style").forEach(styleEl => {
      const cssText = styleEl.textContent || "";
      const rules = parseCssRules(cssText);
      allRules.push(...rules);
    });

    if (allRules.length === 0) return html;

    // 각 규칙을 해당 요소에 인라인 스타일로 적용
    for (const { selector, declarations } of allRules) {
      if (!isSelectorApplicable(selector)) continue;

      let elements: NodeListOf<Element> | null = null;
      try {
        elements = doc.querySelectorAll(selector);
      } catch {
        continue;
      }

      elements.forEach(el => {
        const htmlEl = el as HTMLElement;
        const existing = htmlEl.getAttribute("style") || "";
        const merged = mergeInlineStyle(existing, declarations);
        if (merged) {
          htmlEl.setAttribute("style", merged);
        }
      });
    }

    // 전체 HTML 직렬화
    return doc.documentElement.outerHTML;
  } catch (err) {
    console.warn("[htmlStyleInliner] 전체 문서 스타일 인라인 변환 실패:", err);
    return html;
  }
}
