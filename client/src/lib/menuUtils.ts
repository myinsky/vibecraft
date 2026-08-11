/**
 * menuLinks 파싱/직렬화 유틸리티
 * Sidebar.tsx에서 adminShared.ts 전체를 import하지 않도록 분리
 * (adminShared.ts는 sonner 등 무거운 패키지를 import하므로 초기 번들에서 제외)
 */

export interface MenuLinkItem {
  label: string;
  url: string;
  icon?: string;
  badge?: string;
  description?: string;
}

/** htmlCode에서 menuLinks 파싱 */
export const parseMenuLinks = (htmlCode: string | null | undefined): MenuLinkItem[] => {
  if (!htmlCode) return [];
  try {
    const parsed = JSON.parse(htmlCode);
    if (parsed.__menuLinks && Array.isArray(parsed.__menuLinks)) {
      return parsed.__menuLinks;
    }
  } catch {}
  return [];
};

/** menuLinks를 JSON으로 직렬화하여 htmlCode 필드에 저장 */
export const serializeMenuLinks = (links: MenuLinkItem[]): string => {
  return JSON.stringify({ __menuLinks: links });
};
