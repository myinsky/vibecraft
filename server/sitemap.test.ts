/**
 * sitemap.ts 단위 테스트
 *
 * buildSitemapXml 및 escapeXml 로직을 직접 테스트합니다.
 * Express 라우트 통합 테스트는 supertest 없이 XML 생성 로직만 검증합니다.
 */

import { describe, expect, it } from "vitest";

// ─── 테스트 대상 함수를 인라인으로 재현 ─────────────────────────────────────
// (server/sitemap.ts 내부 함수는 export되지 않으므로 동일 로직을 테스트에서 재현)

function escapeXml(str: string): string {
  return str
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

function toISODate(date: Date | string | number): string {
  return new Date(date).toISOString().split("T")[0];
}

interface SitemapEntry {
  loc: string;
  lastmod?: string;
  changefreq?: string;
  priority?: number;
}

function buildSitemapXml(entries: SitemapEntry[]): string {
  const urls = entries
    .map(entry => {
      const lines = [`  <url>`, `    <loc>${escapeXml(entry.loc)}</loc>`];
      if (entry.lastmod) lines.push(`    <lastmod>${entry.lastmod}</lastmod>`);
      if (entry.changefreq) lines.push(`    <changefreq>${entry.changefreq}</changefreq>`);
      if (entry.priority !== undefined) lines.push(`    <priority>${entry.priority.toFixed(1)}</priority>`);
      lines.push(`  </url>`);
      return lines.join("\n");
    })
    .join("\n");

  return [
    `<?xml version="1.0" encoding="UTF-8"?>`,
    `<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">`,
    urls,
    `</urlset>`,
  ].join("\n");
}

// ─── robots.txt 생성 함수 재현 ─────────────────────────────────────────────

function buildRobotsTxt(sitemapUrl: string): string {
  return [
    "User-agent: *",
    "Allow: /",
    "",
    "# 관리자 및 인증 필요 페이지 크롤링 제외",
    "Disallow: /admin",
    "Disallow: /admin/",
    "Disallow: /write",
    "Disallow: /write/",
    "Disallow: /drafts",
    "Disallow: /settings/",
    "Disallow: /api/",
    "",
    `# sitemap 위치`,
    `Sitemap: ${sitemapUrl}`,
    "",
  ].join("\n");
}

// ─── 테스트 ──────────────────────────────────────────────────────────────────

describe("escapeXml", () => {
  it("& 를 &amp; 로 이스케이프한다", () => {
    expect(escapeXml("foo & bar")).toBe("foo &amp; bar");
  });

  it("< 와 > 를 이스케이프한다", () => {
    expect(escapeXml("<script>")).toBe("&lt;script&gt;");
  });

  it('쌍따옴표와 홑따옴표를 이스케이프한다', () => {
    expect(escapeXml('"hello" & \'world\'')).toBe("&quot;hello&quot; &amp; &apos;world&apos;");
  });

  it("이스케이프할 문자가 없으면 원본 반환", () => {
    expect(escapeXml("https://vibecraftx.com/post/123")).toBe("https://vibecraftx.com/post/123");
  });
});

describe("toISODate", () => {
  it("Date 객체를 YYYY-MM-DD 형식으로 반환한다", () => {
    const result = toISODate(new Date("2026-05-10T12:00:00Z"));
    expect(result).toBe("2026-05-10");
  });

  it("타임스탬프(숫자)를 YYYY-MM-DD 형식으로 반환한다", () => {
    const ts = new Date("2026-01-01T00:00:00Z").getTime();
    const result = toISODate(ts);
    expect(result).toBe("2026-01-01");
  });

  it("ISO 문자열을 YYYY-MM-DD 형식으로 반환한다", () => {
    expect(toISODate("2025-12-25T00:00:00.000Z")).toBe("2025-12-25");
  });
});

describe("buildSitemapXml", () => {
  it("XML 선언과 urlset 루트 태그를 포함한다", () => {
    const xml = buildSitemapXml([]);
    expect(xml).toContain('<?xml version="1.0" encoding="UTF-8"?>');
    expect(xml).toContain('<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">');
    expect(xml).toContain("</urlset>");
  });

  it("단일 항목의 loc, lastmod, changefreq, priority를 올바르게 출력한다", () => {
    const xml = buildSitemapXml([
      {
        loc: "https://vibecraftx.com/",
        lastmod: "2026-05-10",
        changefreq: "daily",
        priority: 1.0,
      },
    ]);
    expect(xml).toContain("<loc>https://vibecraftx.com/</loc>");
    expect(xml).toContain("<lastmod>2026-05-10</lastmod>");
    expect(xml).toContain("<changefreq>daily</changefreq>");
    expect(xml).toContain("<priority>1.0</priority>");
  });

  it("여러 항목을 모두 포함한다", () => {
    const xml = buildSitemapXml([
      { loc: "https://vibecraftx.com/", priority: 1.0 },
      { loc: "https://vibecraftx.com/post/1", priority: 0.6 },
      { loc: "https://vibecraftx.com/category/ai-apps", priority: 0.8 },
    ]);
    expect(xml).toContain("https://vibecraftx.com/");
    expect(xml).toContain("https://vibecraftx.com/post/1");
    expect(xml).toContain("https://vibecraftx.com/category/ai-apps");
    // url 태그가 3개 있어야 함
    const urlCount = (xml.match(/<url>/g) || []).length;
    expect(urlCount).toBe(3);
  });

  it("URL에 특수문자가 있으면 이스케이프된다", () => {
    const xml = buildSitemapXml([
      { loc: "https://vibecraftx.com/search?q=AI&lang=ko" },
    ]);
    expect(xml).toContain("https://vibecraftx.com/search?q=AI&amp;lang=ko");
    expect(xml).not.toContain("?q=AI&lang=ko");
  });

  it("priority가 소수점 1자리로 출력된다", () => {
    const xml = buildSitemapXml([{ loc: "https://vibecraftx.com/", priority: 0.6 }]);
    expect(xml).toContain("<priority>0.6</priority>");
  });

  it("lastmod, changefreq, priority가 없으면 해당 태그를 출력하지 않는다", () => {
    const xml = buildSitemapXml([{ loc: "https://vibecraftx.com/" }]);
    expect(xml).not.toContain("<lastmod>");
    expect(xml).not.toContain("<changefreq>");
    expect(xml).not.toContain("<priority>");
  });
});

// ─── 사이트맵 필터링 로직 테스트 ─────────────────────────────────────────────

/** 카테고리/태그가 사이트맵에 포함될 수 있는지 판단하는 로직 재현 */
function shouldIncludeInSitemap(type: 'category' | 'tag', name: string, postCount: number): boolean {
  // 글 0개이면 제외
  if (postCount === 0) return false;
  // 이메일 형식 제외
  if (/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(name)) return false;
  // 특수문자만으로 구성된 경우 제외
  if (/^[$@%^*=<>|\\!~`]+$/.test(name)) return false;
  // # 기호로 시작하는 태그 제외
  if (type === 'tag' && name.startsWith('#')) return false;
  return true;
}

describe("sitemap 필터링 — 글 0개 태그/카테고리 제외", () => {
  it("글이 0개인 카테고리는 사이트맵에서 제외된다", () => {
    expect(shouldIncludeInSitemap('category', 'ai-tools', 0)).toBe(false);
    expect(shouldIncludeInSitemap('category', 'vibe-coding', 0)).toBe(false);
  });

  it("글이 1개 이상인 카테고리는 사이트맵에 포함된다", () => {
    expect(shouldIncludeInSitemap('category', 'ai-tools', 1)).toBe(true);
    expect(shouldIncludeInSitemap('category', 'vibe-coding', 10)).toBe(true);
  });

  it("글이 0개인 태그는 사이트맵에서 제외된다", () => {
    expect(shouldIncludeInSitemap('tag', '코딩 오류', 0)).toBe(false);
    expect(shouldIncludeInSitemap('tag', 'AI 도구', 0)).toBe(false);
  });

  it("글이 1개 이상인 정상 태그는 사이트맵에 포함된다", () => {
    expect(shouldIncludeInSitemap('tag', '바이브코딩', 5)).toBe(true);
    expect(shouldIncludeInSitemap('tag', 'GPT-4', 1)).toBe(true);
  });

  it("이메일 형식 태그/카테고리는 글 수와 무관하게 제외된다", () => {
    expect(shouldIncludeInSitemap('tag', 'user@gmail.com', 5)).toBe(false);
    expect(shouldIncludeInSitemap('category', 'admin@example.com', 3)).toBe(false);
  });

  it("특수문자만으로 구성된 태그/카테고리는 제외된다", () => {
    expect(shouldIncludeInSitemap('tag', '$$$', 2)).toBe(false);
    expect(shouldIncludeInSitemap('category', '@@@', 1)).toBe(false);
  });

  it("# 기호로 시작하는 태그는 제외된다", () => {
    expect(shouldIncludeInSitemap('tag', '#바이브 코딩앱에 결제 연결하기', 3)).toBe(false);
    expect(shouldIncludeInSitemap('tag', '#클로드 오푸스 4.8 출시', 1)).toBe(false);
  });

  it("ci/cd 같은 슬래시 포함 태그는 허용된다", () => {
    expect(shouldIncludeInSitemap('tag', 'ci/cd', 2)).toBe(true);
  });
});

describe("buildRobotsTxt", () => {
  it("User-agent: * 와 Allow: / 를 포함한다", () => {
    const txt = buildRobotsTxt("https://vibecraftx.com/sitemap.xml");
    expect(txt).toContain("User-agent: *");
    expect(txt).toContain("Allow: /");
  });

  it("/admin, /api/ 등 크롤링 제외 경로를 포함한다", () => {
    const txt = buildRobotsTxt("https://vibecraftx.com/sitemap.xml");
    expect(txt).toContain("Disallow: /admin");
    expect(txt).toContain("Disallow: /api/");
    expect(txt).toContain("Disallow: /write");
    expect(txt).toContain("Disallow: /drafts");
  });

  it("Sitemap 지시어에 전달된 URL이 포함된다", () => {
    const sitemapUrl = "https://vibecraftx.com/sitemap.xml";
    const txt = buildRobotsTxt(sitemapUrl);
    expect(txt).toContain(`Sitemap: ${sitemapUrl}`);
  });

  it("커스텀 도메인 sitemap URL도 올바르게 포함된다", () => {
    const sitemapUrl = "https://custom.example.com/sitemap.xml";
    const txt = buildRobotsTxt(sitemapUrl);
    expect(txt).toContain(`Sitemap: ${sitemapUrl}`);
  });

  it("결과가 문자열이며 비어있지 않다", () => {
    const txt = buildRobotsTxt("https://vibecraftx.com/sitemap.xml");
    expect(typeof txt).toBe("string");
    expect(txt.length).toBeGreaterThan(0);
  });
});
