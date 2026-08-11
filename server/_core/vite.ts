import express, { type Express } from "express";
import fs from "fs";
import { type Server } from "http";
import { nanoid } from "nanoid";
import path from "path";
import { createServer as createViteServer } from "vite";
import viteConfig from "../../vite.config";
import { resolveMetaData, injectMetaTags, injectHeadScripts } from "../metaInjector";
import { findRedirectTarget, getPostById } from "../db";
import crypto from "crypto";

// manus-runtime 인라인 스크립트를 외부 파일로 분리하여 브라우저 캐시 활용
// 366KB 인라인 스크립트 → 외부 파일 + 브라우저 캐시 = FCP/LCP 대폭 개선
let _manusRuntimeHash: string | null = null;
let _manusRuntimeContent: string | null = null;

function getManusRuntimeInfo(): { hash: string; content: string } | null {
  if (_manusRuntimeHash && _manusRuntimeContent) {
    return { hash: _manusRuntimeHash, content: _manusRuntimeContent };
  }
  // 여러 경로 후보를 순서대로 탐색 (개발/배포 환경 모두 지원)
  const RUNTIME_REL = '.pnpm/vite-plugin-manus-runtime@0.0.57/node_modules/vite-plugin-manus-runtime/runtime_dist/manus-runtime.js';
  const candidates = [
    // 배포 환경: 서버 번들이 dist/에 위치, node_modules는 프로젝트 루트에 있음
    path.resolve(process.cwd(), 'node_modules', RUNTIME_REL),
    // 개발 환경: import.meta.dirname = server/_core, node_modules는 2단계 위
    path.resolve(import.meta.dirname, '../../node_modules', RUNTIME_REL),
    // 배포 환경 대안: import.meta.dirname = dist, node_modules는 1단계 위
    path.resolve(import.meta.dirname, '../node_modules', RUNTIME_REL),
  ];
  for (const runtimePath of candidates) {
    try {
      if (fs.existsSync(runtimePath)) {
        const content = fs.readFileSync(runtimePath, 'utf-8');
        const hash = crypto.createHash('md5').update(content).digest('hex').slice(0, 8);
        _manusRuntimeHash = hash;
        _manusRuntimeContent = content;
        return { hash, content };
      }
    } catch {
      // 이 경로 실패 시 다음 후보 시도
    }
  }
  return null;
}

/**
 * manus-runtime 인라인 스크립트를 외부 파일 참조로 교체
 * <script id="manus-runtime">...366KB...</script>
 * → <script src="/manus-runtime-{hash}.js" defer></script>
 */
function externalizeManusRuntime(html: string): string {
  const runtimeInfo = getManusRuntimeInfo();
  if (!runtimeInfo) return html;
  // id="manus-runtime" 인라인 스크립트를 외부 파일 참조로 교체
  return html.replace(
    /<script[^>]*id="manus-runtime"[^>]*>[\s\S]*?<\/script>/,
    `<script src="/manus-runtime-${runtimeInfo.hash}.js" defer></script>`
  );
}

/**
 * 존재하지 않는 게시글/페이지 slug 요청인지 판별합니다.
 * resolveMetaData가 null을 반환하는 경우 = DB에 해당 게시물이 없음 = Soft 404 방지
 * SPA 라우트(/admin, /write, /drafts 등)는 null이어도 200을 반환해야 하므로
 * /p/:slug, /post/:id, /page/:slug 패턴만 404로 처리합니다.
 */
function isPostOrPageRoute(pathname: string): boolean {
  return /^\/p\/[^/?#]+/.test(pathname) ||
    /^\/post\/\d+/.test(pathname) ||
    /^\/page\/[^/?#]+/.test(pathname);
}

export async function setupVite(app: Express, server: Server) {
  const serverOptions = {
    middlewareMode: true,
    hmr: { server },
    allowedHosts: true as const,
  };

  const vite = await createViteServer({
    ...viteConfig,
    configFile: false,
    server: serverOptions,
    appType: "custom",
  });

  app.use(vite.middlewares);
  app.use("*", async (req, res, next) => {
    const url = req.originalUrl;

    try {
      const clientTemplate = path.resolve(
        import.meta.dirname,
        "../..",
        "client",
        "index.html"
      );

      // always reload the index.html file from disk incase it changes
      let template = await fs.promises.readFile(clientTemplate, "utf-8");
      template = template.replace(
        `src="/src/main.tsx"`,
        `src="/src/main.tsx?v=${nanoid()}"`
      );
      let page = await vite.transformIndexHtml(url, template);

      // 서버 사이드 메타 태그 주입 (네이버·다음·SNS 봇 지원)
      const pathname = url.split("?")[0];

      // 301 리디렉션: /post/:id 접근 시 /p/:slug로 영구 리다이렉트 (SEO 중복 URL 방지)
      const postIdMatch = pathname.match(/^\/post\/(\d+)/);
      if (postIdMatch) {
        const postId = parseInt(postIdMatch[1], 10);
        const post = await getPostById(postId);
        if (post) {
          const canonicalSlug = post.customSlug || post.slug;
          if (canonicalSlug) {
            res.redirect(301, `/p/${encodeURIComponent(canonicalSlug)}`);
            return;
          }
        }
        // slug가 없는 경우 그냥 통과 (404 처리는 아래에서)
      }

      // 301 리디렉션: /p/:slug 요청이 slug_history에 있으면 새 URL로 리디렉션
      const slugMatch = pathname.match(/^\/p\/([^/?#]+)/);
      if (slugMatch) {
        const requestedSlug = decodeURIComponent(slugMatch[1]);
        const redirectTarget = await findRedirectTarget(requestedSlug);
        if (redirectTarget && redirectTarget !== requestedSlug) {
          const newUrl = `/p/${encodeURIComponent(redirectTarget)}`;
          res.redirect(301, newUrl);
          return;
        }
      }

      // resolveMetaData와 injectHeadScripts를 병렬로 실행 (TTFB 개선: 직렬 → 병렬)
      const [meta, headScriptedPage] = await Promise.all([
        resolveMetaData(pathname),
        injectHeadScripts(page),
      ]);
      page = headScriptedPage;
      // 게시글/페이지 라우트인데 DB에 없으면 HTTP 404 반환 (Soft 404 방지)
      if (meta === null && isPostOrPageRoute(pathname)) {
        res.status(404).set({ "Content-Type": "text/html" }).end(page);
        return;
      }
      if (meta) {
        page = injectMetaTags(page, meta);
        // ⚠️ noscript+숨겨진 H1 방식 제거 (구글 애드센스 정책 위반)
        // H1은 프론트엔드 React에서 렌더링됨 — JSON-LD headline + meta description으로 콘텐츠 제공 충분
        // 글 0개 태그 등 statusCode가 지정된 경우 해당 HTTP 코드로 응답 (페이지 자체를 생성하지 않음)
        if (meta.statusCode && meta.statusCode !== 200) {
          res.status(meta.statusCode).set({ "Content-Type": "text/html" }).end(page);
          return;
        }
      }

      res.status(200).set({ "Content-Type": "text/html" }).end(page);
    } catch (e) {
      vite.ssrFixStacktrace(e as Error);
      next(e);
    }
  });
}

// ===== index.html 메모리 캐시 (TTFB 개선) =====
// 배포 환경에서 매 요청마다 디스크에서 읽는 대신 메모리에 캐시
// 새 배포 시 프로세스가 재시작되므로 캐시 무효화 불필요
let _indexHtmlCache: string | null = null;
async function getIndexHtml(indexPath: string): Promise<string> {
  if (_indexHtmlCache) return _indexHtmlCache;
  const html = await fs.promises.readFile(indexPath, "utf-8");
  if (process.env.NODE_ENV !== "development") {
    _indexHtmlCache = html; // 프로덕션에서만 캐시 (개발 중에는 항상 최신 파일 사용)
  }
  return html;
}

// ===== URL별 메타 태그 캐시 (TTFB 개선) =====
// resolveMetaData는 DB 조회 + probeImageSize 네트워크 요청을 포함하므로 캐시 필수
// stale-while-revalidate 패턴: TTL 만료 후에도 stale 기간 동안 캐시 반환 + 백그라운드 갱신
// → 캐시 만료 시 사용자가 느린 응답을 받지 않도록 개선 (TTFB 2초 → ~0ms)
interface MetaCache { html: string; ts: number; refreshing?: boolean; }
const metaHtmlCache = new Map<string, MetaCache>();
const META_CACHE_TTL_HOME = 5 * 60_000;   // 홈/카테고리/태그: 5분 (60초 → 5분: TTFB 개선)
const META_CACHE_TTL_POST = 15 * 60_000;  // 게시물 상세: 15분 (5분 → 15분: TTFB 개선)
const META_CACHE_STALE_HOME = 10 * 60_000; // stale 허용 추가 시간 (홈)
const META_CACHE_STALE_POST = 30 * 60_000; // stale 허용 추가 시간 (게시물)
const META_CACHE_MAX = 300;

function getMetaCacheTtl(pathname: string): number {
  if (/^\/p\/|\/post\//.test(pathname)) return META_CACHE_TTL_POST;
  return META_CACHE_TTL_HOME;
}
function getMetaCacheStale(pathname: string): number {
  if (/^\/p\/|\/post\//.test(pathname)) return META_CACHE_STALE_POST;
  return META_CACHE_STALE_HOME;
}

/** 메타 태그 캐시 무효화 (게시물 등록/수정/삭제 시 호출) */
export function invalidateMetaHtmlCache(pathname?: string) {
  if (pathname) {
    metaHtmlCache.delete(pathname);
  } else {
    metaHtmlCache.clear();
  }
}

export function serveStatic(app: Express) {
  const distPath =
    process.env.NODE_ENV === "development"
      ? path.resolve(import.meta.dirname, "../..", "dist", "public")
      : path.resolve(import.meta.dirname, "public");

  if (!fs.existsSync(distPath)) {
    console.error(
      `Could not find the build directory: ${distPath}, make sure to build the client first`
    );
  }

  // manus-runtime 외부 파일 서빙 (366KB 인라인 → 외부 파일 + 브라우저 캐시)
  // 파일명에 해시가 포함되어 있어 1년 캐시 적용 가능
  app.get(/^\/manus-runtime-[a-f0-9]+\.js$/, (req, res) => {
    const runtimeInfo = getManusRuntimeInfo();
    if (!runtimeInfo) {
      res.status(404).end();
      return;
    }
    const expectedPath = `/manus-runtime-${runtimeInfo.hash}.js`;
    if (req.path !== expectedPath) {
      res.status(404).end();
      return;
    }
    res.setHeader('Content-Type', 'application/javascript; charset=utf-8');
    res.setHeader('Cache-Control', 'public, max-age=31536000, immutable');
    res.send(`window.__MANUS_HOST_DEV__ = false;\n${runtimeInfo.content}`);
  });

  // 정적 자산(JS/CSS/이미지)에 장기 캐시 헤더 적용 (해시 파일명으로 캐시 무효화)
  app.use(express.static(distPath, {
    setHeaders(res, filePath) {
      if (filePath.includes('/assets/')) {
        // /assets/ 하위 파일은 해시 포함 → 1년 캐시
        res.setHeader('Cache-Control', 'public, max-age=31536000, immutable');
      } else if (
        filePath.endsWith('.ico') ||
        filePath.endsWith('.png') ||
        filePath.endsWith('.webp') ||
        filePath.endsWith('.jpg') ||
        filePath.endsWith('.jpeg') ||
        filePath.endsWith('.svg') ||
        filePath.endsWith('.woff2') ||
        filePath.endsWith('.woff') ||
        filePath.endsWith('.xml')
      ) {
        // favicon, 이미지, 폰트, sitemap 등은 1일 캐시
        res.setHeader('Cache-Control', 'public, max-age=86400, stale-while-revalidate=3600');
      } else {
        // index.html 등은 캐시 안 함
        res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
      }
    },
  }));

  // fall through to index.html if the file doesn't exist
  // 서버 사이드 메타 태그 주입 (네이버·다음·SNS 봇 지원)
  app.use("*", async (req, res) => {
    const indexPath = path.resolve(distPath, "index.html");
    try {
      const rawUrl = req.originalUrl;
      const pathname = rawUrl.split("?")[0];

      // 내부 시스템 파라미터(?manus_scraper=1 등)가 붙은 URL은 301 리다이렉트로 파라미터 제거
      // 이렇게 하면 구글이 파라미터 없는 정식 URL만 색인하게 됨 (중복 콘텐츠 방지)
      const queryString = rawUrl.includes('?') ? rawUrl.slice(rawUrl.indexOf('?') + 1) : '';
      const hasScraperParam = queryString.split('&').some(p => p.startsWith('manus_scraper='));
      if (hasScraperParam) {
        // 파라미터를 제거한 나머지 쿼리스트링 유지 (다른 파라미터는 보존)
        const remainingQuery = queryString.split('&').filter(p => !p.startsWith('manus_scraper=')).join('&');
        const cleanUrl = remainingQuery ? `${pathname}?${remainingQuery}` : pathname;
        res.redirect(301, cleanUrl);
        return;
      }

      // 301 리디렉션: /post/:id 접근 시 /p/:slug로 영구 리다이렉트 (SEO 중복 URL 방지)
      const postIdMatchProd = pathname.match(/^\/post\/(\d+)/);
      if (postIdMatchProd) {
        const postId = parseInt(postIdMatchProd[1], 10);
        const post = await getPostById(postId);
        if (post) {
          const canonicalSlug = post.customSlug || post.slug;
          if (canonicalSlug) {
            res.redirect(301, `/p/${encodeURIComponent(canonicalSlug)}`);
            return;
          }
        }
        // slug가 없는 경우 그냥 통과 (404 처리는 아래에서)
      }

      // 301 리디렉션: /p/:slug 요청이 slug_history에 있으면 새 URL로 리디렉션
      const slugMatchProd = pathname.match(/^\/p\/([^/?#]+)/);
      if (slugMatchProd) {
        const requestedSlug = decodeURIComponent(slugMatchProd[1]);
        const redirectTarget = await findRedirectTarget(requestedSlug);
        if (redirectTarget && redirectTarget !== requestedSlug) {
          const newUrl = `/p/${encodeURIComponent(redirectTarget)}`;
          res.redirect(301, newUrl);
          return;
        }
      }

      // URL별 메타 HTML 캐시 확인 (stale-while-revalidate 패턴)
      // TTL 내: 즉시 반환 / TTL 초과 + stale 기간 내: 즉시 반환 + 백그라운드 갱신
      // stale 기간 초과: 동기 갱신 (불가피한 경우만)
      const now = Date.now();
      const cachedEntry = metaHtmlCache.get(pathname);
      if (cachedEntry) {
        const age = now - cachedEntry.ts;
        const ttl = getMetaCacheTtl(pathname);
        const stale = getMetaCacheStale(pathname);
        if (age < ttl) {
          // 신선한 캐시 - 즉시 반환
          res.status(200).set({ "Content-Type": "text/html" }).send(cachedEntry.html);
          return;
        } else if (age < ttl + stale && !cachedEntry.refreshing) {
          // stale 캐시 - 즉시 반환 + 백그라운드 갱신
          res.status(200).set({ "Content-Type": "text/html" }).send(cachedEntry.html);
          cachedEntry.refreshing = true;
          // 백그라운드에서 캐시 갱신 (응답 후 실행)
          setImmediate(async () => {
            try {
              let freshHtml = await getIndexHtml(indexPath);
              const [freshMeta, freshHeadHtml] = await Promise.all([
                resolveMetaData(pathname),
                injectHeadScripts(freshHtml),
              ]);
              freshHtml = freshHeadHtml;
              if (freshMeta) {
                freshHtml = injectMetaTags(freshHtml, freshMeta);
              }
              // manus-runtime 인라인 스크립트 → 외부 파일 참조로 교체 (FCP/LCP 개선)
              freshHtml = externalizeManusRuntime(freshHtml);
              metaHtmlCache.set(pathname, { html: freshHtml, ts: Date.now() });
            } catch {
              // 갱신 실패 시 기존 캐시 유지 (refreshing 플래그만 해제)
              const existing = metaHtmlCache.get(pathname);
              if (existing) existing.refreshing = false;
            }
          });
          return;
        }
      }

      // index.html 메모리 캐시에서 읽기 (디스크 I/O 제거)
      let html = await getIndexHtml(indexPath);

      // resolveMetaData와 injectHeadScripts를 병렬로 실행 (TTFB 개선: 직렬 → 병렬)
      const [meta, headScriptedHtml] = await Promise.all([
        resolveMetaData(pathname),
        injectHeadScripts(html),
      ]);
      html = headScriptedHtml;
      // 게시글/페이지 라우트인데 DB에 없으면 HTTP 404 반환 (Soft 404 방지)
      if (meta === null && isPostOrPageRoute(pathname)) {
        res.status(404).set({ "Content-Type": "text/html" }).send(html);
        return;
      }
      if (meta) {
        html = injectMetaTags(html, meta);
        // 글 0개 태그 등 statusCode가 지정된 경우 해당 HTTP 코드로 응답 (페이지 자체를 생성하지 않음)
        if (meta.statusCode && meta.statusCode !== 200) {
          res.status(meta.statusCode).set({ "Content-Type": "text/html" }).send(html);
          return;
        }
      }
      // manus-runtime 인라인 스크립트 → 외부 파일 참조로 교체 (FCP/LCP 개선)
      html = externalizeManusRuntime(html);

      // 메타 HTML 캐시에 저장 (LRU: 최대 300개)
      if (metaHtmlCache.size >= META_CACHE_MAX) {
        const oldestKey = metaHtmlCache.keys().next().value;
        if (oldestKey) metaHtmlCache.delete(oldestKey);
      }
      metaHtmlCache.set(pathname, { html, ts: now });

      res.status(200).set({ "Content-Type": "text/html" }).send(html);
    } catch {
      res.sendFile(indexPath);
    }
  });
}
