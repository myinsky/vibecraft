/**
 * TableOfContents.tsx
 *
 * 게시글 본문의 h2/h3 태그를 파싱해 클릭 가능한 목차를 렌더링합니다.
 * - enableToc=true 이고 h2/h3 항목이 2개 이상일 때만 표시
 * - 스크롤 위치에 따라 현재 섹션을 자동 하이라이트
 * - 항목 클릭 시 해당 섹션으로 부드럽게 스크롤 이동
 */

import { useEffect, useRef, useState } from "react";

export interface TocItem {
  id: string;
  text: string;
  level: 2 | 3;
}

interface Props {
  /** 게시글 본문 HTML 문자열 */
  content: string;
  /** enableToc 플래그 (false면 렌더링 안 함) */
  enabled: boolean;
}

/**
 * HTML 문자열에서 h2/h3 항목을 추출하고
 * 각 태그에 id 앵커를 주입한 새 HTML을 반환합니다.
 */
export function injectHeadingIds(html: string): { html: string; items: TocItem[] } {
  const items: TocItem[] = [];
  const usedIds = new Set<string>();

  const result = html.replace(
    /<(h[23])([^>]*)>([\s\S]*?)<\/h[23]>/gi,
    (match, tag: string, attrs: string, inner: string) => {
      const level = parseInt(tag[1], 10) as 2 | 3;
      // 기존 id 속성이 있으면 재사용
      const existingId = attrs.match(/\bid=["']([^"']+)["']/i)?.[1];
      const rawText = inner.replace(/<[^>]+>/g, "").trim();

      let id = existingId || slugify(rawText);
      // 중복 id 방지
      if (!existingId) {
        let suffix = 0;
        let candidate = id;
        while (usedIds.has(candidate)) {
          suffix++;
          candidate = `${id}-${suffix}`;
        }
        id = candidate;
      }
      usedIds.add(id);

      if (rawText) {
        items.push({ id, text: rawText, level });
      }

      // id 속성이 없으면 주입, 있으면 그대로
      const newAttrs = existingId ? attrs : ` id="${id}"${attrs}`;
      return `<${tag}${newAttrs}>${inner}</${tag}>`;
    }
  );

  return { html: result, items };
}

function slugify(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^\w\s가-힣]/g, "")
    .replace(/\s+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80) || "heading";
}

export default function TableOfContents({ content, enabled }: Props) {
  const [items, setItems] = useState<TocItem[]>([]);
  const [activeId, setActiveId] = useState<string>("");
  const observerRef = useRef<IntersectionObserver | null>(null);

  // 본문 변경 시 목차 항목 파싱
  useEffect(() => {
    if (!enabled) return;
    const { items: parsed } = injectHeadingIds(content);
    setItems(parsed);
  }, [content, enabled]);

  // IntersectionObserver로 현재 섹션 추적
  useEffect(() => {
    if (!enabled || items.length < 2) return;

    observerRef.current?.disconnect();

    const headings = items
      .map((item) => document.getElementById(item.id))
      .filter(Boolean) as HTMLElement[];

    if (headings.length === 0) return;

    observerRef.current = new IntersectionObserver(
      (entries) => {
        // 화면에 보이는 항목 중 가장 위에 있는 것을 활성화
        const visible = entries
          .filter((e) => e.isIntersecting)
          .sort((a, b) => a.boundingClientRect.top - b.boundingClientRect.top);
        if (visible.length > 0) {
          setActiveId(visible[0].target.id);
        }
      },
      { rootMargin: "0px 0px -60% 0px", threshold: 0 }
    );

    headings.forEach((el) => observerRef.current!.observe(el));

    return () => observerRef.current?.disconnect();
  }, [items, enabled]);

  const handleClick = (id: string) => {
    const el = document.getElementById(id);
    if (!el) return;
    const offset = 80; // 헤더 높이 보정
    const top = el.getBoundingClientRect().top + window.scrollY - offset;
    window.scrollTo({ top, behavior: "smooth" });
  };

  if (!enabled || items.length < 2) return null;

  return (
    <nav
      aria-label="목차"
      style={{
        background: "#f8fafc",
        border: "1px solid #e2e8f0",
        borderRadius: 10,
        padding: "16px 20px",
        marginBottom: 28,
        fontSize: 13,
      }}
    >
      <div
        style={{
          fontWeight: 700,
          fontSize: 12,
          color: "#64748b",
          letterSpacing: "0.08em",
          textTransform: "uppercase",
          marginBottom: 10,
          display: "flex",
          alignItems: "center",
          gap: 6,
        }}
      >
        <svg width="14" height="14" viewBox="0 0 14 14" fill="none" aria-hidden="true">
          <rect x="1" y="2" width="12" height="1.5" rx="0.75" fill="#94a3b8" />
          <rect x="1" y="6" width="9" height="1.5" rx="0.75" fill="#94a3b8" />
          <rect x="1" y="10" width="10" height="1.5" rx="0.75" fill="#94a3b8" />
        </svg>
        목차
      </div>
      <ol style={{ margin: 0, padding: 0, listStyle: "none" }}>
        {items.map((item) => {
          const isActive = activeId === item.id;
          return (
            <li
              key={item.id}
              style={{
                paddingLeft: item.level === 3 ? 16 : 0,
                marginBottom: 4,
              }}
            >
              <button
                type="button"
                onClick={() => handleClick(item.id)}
                style={{
                  background: "none",
                  border: "none",
                  padding: "3px 6px",
                  borderRadius: 5,
                  cursor: "pointer",
                  textAlign: "left",
                  width: "100%",
                  fontSize: item.level === 2 ? 13 : 12,
                  fontWeight: item.level === 2 ? (isActive ? 700 : 500) : (isActive ? 600 : 400),
                  color: isActive ? "#2563eb" : item.level === 2 ? "#1e293b" : "#475569",
                  backgroundColor: isActive ? "#eff6ff" : "transparent",
                  transition: "all 0.15s",
                  lineHeight: 1.5,
                }}
              >
                {item.level === 3 && (
                  <span style={{ color: "#cbd5e1", marginRight: 4 }}>└</span>
                )}
                {item.text}
              </button>
            </li>
          );
        })}
      </ol>
    </nav>
  );
}
