import { useEffect } from "react";

/**
 * JSON-LD 구조화 데이터를 <head>에 삽입하는 훅
 *
 * 컴포넌트 마운트 시 <script type="application/ld+json"> 태그를 삽입하고
 * 언마운트 시 제거합니다.
 *
 * 지원 타입:
 *  - BlogPosting: 개별 블로그 글 페이지
 *  - WebSite: 사이트 홈 (SearchAction 포함)
 */

export interface BlogPostingSchema {
  type: "BlogPosting";
  headline: string;
  description?: string;
  image?: string;
  datePublished: string;
  dateModified?: string;
  authorName?: string;
  url: string;
  publisherName?: string;
  publisherLogo?: string;
  keywords?: string[];
}

export interface WebSiteSchema {
  type: "WebSite";
  name: string;
  url: string;
  description?: string;
}

export interface WebPageSchema {
  type: "WebPage";
  name: string;
  url: string;
  description?: string;
  dateModified?: string;
  isPartOf?: string; // 사이트 URL (WebSite 참조)
}

type JsonLdSchema = BlogPostingSchema | WebSiteSchema | WebPageSchema;

function buildJsonLd(schema: JsonLdSchema): Record<string, unknown> {
  if (schema.type === "BlogPosting") {
    const data: Record<string, unknown> = {
      "@context": "https://schema.org",
      "@type": "BlogPosting",
      headline: schema.headline,
      url: schema.url,
      datePublished: schema.datePublished,
    };
    if (schema.description) data.description = schema.description;
    if (schema.dateModified) data.dateModified = schema.dateModified;
    if (schema.image) {
      data.image = {
        "@type": "ImageObject",
        url: schema.image.startsWith("http")
          ? schema.image
          : `${window.location.origin}${schema.image}`,
      };
    }
    if (schema.authorName) {
      data.author = { "@type": "Person", name: schema.authorName };
    }
    if (schema.publisherName) {
      data.publisher = {
        "@type": "Organization",
        name: schema.publisherName,
        ...(schema.publisherLogo
          ? { logo: { "@type": "ImageObject", url: schema.publisherLogo } }
          : {}),
      };
    }
    if (schema.keywords && schema.keywords.length > 0) {
      data.keywords = schema.keywords.join(", ");
    }
    return data;
  }

  // WebPage
  if (schema.type === "WebPage") {
    const data: Record<string, unknown> = {
      "@context": "https://schema.org",
      "@type": "WebPage",
      name: schema.name,
      url: schema.url,
    };
    if (schema.description) data.description = schema.description;
    if (schema.dateModified) data.dateModified = schema.dateModified;
    if (schema.isPartOf) {
      data.isPartOf = { "@type": "WebSite", url: schema.isPartOf };
    }
    return data;
  }

  // WebSite
  return {
    "@context": "https://schema.org",
    "@type": "WebSite",
    name: schema.name,
    url: schema.url,
    ...(schema.description ? { description: schema.description } : {}),
    potentialAction: {
      "@type": "SearchAction",
      target: {
        "@type": "EntryPoint",
        urlTemplate: `${schema.url}/search?q={search_term_string}`,
      },
      "query-input": "required name=search_term_string",
    },
  };
}

export function useJsonLd(schema: JsonLdSchema | null) {
  useEffect(() => {
    if (!schema) return;

    const scriptId = `json-ld-${schema.type}`;
    // 기존 태그 제거 후 재삽입
    document.head.querySelector(`#${scriptId}`)?.remove();

    const script = document.createElement("script");
    script.id = scriptId;
    script.type = "application/ld+json";
    script.textContent = JSON.stringify(buildJsonLd(schema), null, 2);
    document.head.appendChild(script);

    return () => {
      document.head.querySelector(`#${scriptId}`)?.remove();
    };
  }, [schema ? JSON.stringify(schema) : null]); // eslint-disable-line react-hooks/exhaustive-deps
}
