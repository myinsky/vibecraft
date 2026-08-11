/**
 * SiteConfigContext
 *
 * getSiteConfig, getNavItems, pages.getNavList 쿼리를 App 최상단에서 1번만 호출하고
 * 전체 앱에 공유합니다. Header, Footer, Home, CategoryPage 등이 이 컨텍스트를 통해
 * 이미 캐시된 데이터를 즉시 읽어 중복 네트워크 요청을 방지합니다.
 */

import { createContext, useContext, ReactNode } from "react";
import { trpc } from "@/lib/trpc";

const SHARED_QUERY_OPTS = {
  staleTime: 15 * 60 * 1000, // 15분
  refetchOnWindowFocus: false,
} as const;

interface NavItem {
  id: number;
  label: string;
  path: string | null;
  sortOrder: number | null;
  visible?: boolean | null;
  [key: string]: unknown;
}

interface NavPage {
  id: number;
  title: string;
  slug: string;
}

interface SiteConfigContextValue {
  siteConfig: Record<string, string> | undefined;
  navItemsData: NavItem[] | undefined;
  navCustomPages: NavPage[] | undefined;
  isLoading: boolean;
}

const SiteConfigContext = createContext<SiteConfigContextValue>({
  siteConfig: undefined,
  navItemsData: undefined,
  navCustomPages: undefined,
  isLoading: true,
});

export function SiteConfigProvider({ children }: { children: ReactNode }) {
  const { data: siteConfig, isLoading: sc } = trpc.admin.getSiteConfig.useQuery(
    undefined,
    SHARED_QUERY_OPTS
  );
  const { data: navItemsData, isLoading: ni } = trpc.admin.getNavItems.useQuery(
    undefined,
    SHARED_QUERY_OPTS
  );
  const { data: navCustomPages, isLoading: np } = trpc.pages.getNavList.useQuery(
    undefined,
    SHARED_QUERY_OPTS
  );

  return (
    <SiteConfigContext.Provider
      value={{
        siteConfig: siteConfig as Record<string, string> | undefined,
        navItemsData: navItemsData as NavItem[] | undefined,
        navCustomPages: navCustomPages as NavPage[] | undefined,
        isLoading: sc || ni || np,
      }}
    >
      {children}
    </SiteConfigContext.Provider>
  );
}

export function useSiteConfig() {
  return useContext(SiteConfigContext);
}
