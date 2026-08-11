import "dotenv/config";
import compression from "compression";
import express from "express";
import cookieParser from "cookie-parser";
import { createServer } from "http";
import net from "net";
import { createExpressMiddleware } from "@trpc/server/adapters/express";
import { registerOAuthRoutes } from "./oauth";
import { registerStorageProxy } from "./storageProxy";
import { appRouter } from "../routers";
import { createContext } from "./context";
import { serveStatic, setupVite } from "./vite";
import { registerUploadRoutes, registerDownloadRoute } from "../upload";
import { registerPublishApiRoutes } from "../publish-api";
import { registerSitemapRoute, registerRobotsRoute, registerSitemapPurgeRoute } from "../sitemap";
import { registerRssRoute } from "../rss";
import { registerIndexNowKeyRoute } from "../indexnow";
import { registerScheduledPublishRoute } from "../scheduled-publish";
import { registerScheduledBackupRoute } from "../scheduled-backup";
import { registerScheduledTrashCleanupRoute } from "../scheduled-trash-cleanup";
import { registerCoupangImageProxy } from "../coupang-image-proxy";
import { registerVibecraftImageProxy } from "../vibecraft-image-proxy";
import { registerKakaoSdkProxy } from "../kakao-sdk-proxy";
import { registerPageHtmlServeRoute } from "../page-html-serve";
import { registerApiProxyRoutes } from "../api-proxy";
import { getSiteConfigAll, getLatestPosts, getHomeSections, getNavItemsFromDb } from "../db";

/**
 * 서버 시작 시 캐시 워밍업 (첫 번째 요청 TTFB 개선)
 * TiDB Serverless는 유휴 시 슬립에 들어가 웨이크업 지연이 발생함
 * 서버 시작 직후 주요 쿼리를 실행하여 캐시를 미리 체우면
 * 첫 번째 실제 사용자 요청도 캐시 히트로 보다 빠르게 응답 가능
 */
async function warmupCache(): Promise<void> {
  try {
    await Promise.all([
      getSiteConfigAll(),
      getLatestPosts(10),
      getHomeSections(),
      getNavItemsFromDb(), // getHomeInitialData에서 사용
    ]);
    console.log('[Cache] Warmup complete');
  } catch (e) {
    console.warn('[Cache] Warmup skipped:', (e as Error).message);
  }
}

function isPortAvailable(port: number): Promise<boolean> {
  return new Promise(resolve => {
    const server = net.createServer();
    server.listen(port, () => {
      server.close(() => resolve(true));
    });
    server.on("error", () => resolve(false));
  });
}

async function findAvailablePort(startPort: number = 3000): Promise<number> {
  for (let port = startPort; port < startPort + 20; port++) {
    if (await isPortAvailable(port)) {
      return port;
    }
  }
  throw new Error(`No available port found starting from ${startPort}`);
}

async function startServer() {
  const app = express();
  const server = createServer(app);
  // gzip 압축: JS/CSS/HTML 응답 크기 감소로 FCP/LCP 개선
  app.use(compression({ level: 6, threshold: 1024 }));

  // ── SEO URL 정규화 미들웨어 ──────────────────────────────────────────────
  // www.vibecraftx.com을 정식 도메인으로 사용 (Cloudflare에서 non-www → www 리디렉션 처리)

  // 2) trailing slash 제거 (/ 제외) — /p/slug/ → /p/slug
  //    홈(/)은 제외, API/정적 파일도 제외
  app.use((req, res, next) => {
    const url = req.originalUrl;
    // API, 정적 파일, 홈은 제외
    if (url === '/' || url.startsWith('/api/') || url.startsWith('/manus-storage/') || url.includes('.')) {
      return next();
    }
    // 경로 끝에 / 가 있으면 제거 후 301 리다이렉트
    const [pathname, query] = url.split('?');
    if (pathname.endsWith('/')) {
      const cleanPath = pathname.replace(/\/+$/, '') || '/';
      const redirectUrl = query ? `${cleanPath}?${query}` : cleanPath;
      return res.redirect(301, redirectUrl);
    }
    next();
  });
  // Configure body parser with larger size limit for file uploads
  app.use(express.json({ limit: "50mb" }));
  app.use(express.urlencoded({ limit: "50mb", extended: true }));
  // Cookie parser for session authentication in upload routes
  app.use(cookieParser());
  registerStorageProxy(app);
  registerOAuthRoutes(app);
  registerUploadRoutes(app);
  registerDownloadRoute(app);
  registerPublishApiRoutes(app);

  // 빌드 버전 체크 엔드포인트: 프론트엔드가 주기적으로 폴링하여 새 배포 감지
  // BUILD_HASH 환경변수가 없으면 서버 시작 시간으로 대체 (개발환경에서는 항상 다름)
  const BUILD_HASH = process.env.BUILD_HASH || `dev-${Date.now().toString(36)}`;
  app.get('/api/version', (_req, res) => {
    res.set('Cache-Control', 'no-store, no-cache, must-revalidate');
    res.json({ hash: BUILD_HASH });
  });

  registerRobotsRoute(app);
  registerSitemapRoute(app);
  registerSitemapPurgeRoute(app);
  registerRssRoute(app);
  registerIndexNowKeyRoute(app);
  registerScheduledPublishRoute(app);
  registerScheduledBackupRoute(app);
  registerScheduledTrashCleanupRoute(app);
  registerCoupangImageProxy(app);
  registerVibecraftImageProxy(app);
  registerKakaoSdkProxy(app);
  registerPageHtmlServeRoute(app);
  registerApiProxyRoutes(app);
  // tRPC API
  app.use(
    "/api/trpc",
    createExpressMiddleware({
      router: appRouter,
      createContext,
      // 공개 API(posts.list, admin.getNavItems, admin.getSiteConfig 등)에 Cache-Control 헤더 추가
      // TTFB 개선: CDN/프록시가 60초 캐시, 브라우저가 10초 stale-while-revalidate
      responseMeta(opts) {
        const { ctx, errors, type } = opts;
        // 에러가 있거나 mutation이면 캐시 안 함
        if (errors.length > 0 || type !== "query") return {};
        // 로그인한 사용자의 요청은 캐시 안 함 (개인화 데이터)
        if (ctx?.user) return {};
        return {
          headers: new Headers({
            "Cache-Control": "public, max-age=10, stale-while-revalidate=60",
          }),
        };
      },
    })
  );
  // development mode uses Vite, production mode uses static files
  if (process.env.NODE_ENV === "development") {
    await setupVite(app, server);
  } else {
    serveStatic(app);
  }

  const preferredPort = parseInt(process.env.PORT || "3000");
  const port = await findAvailablePort(preferredPort);

  if (port !== preferredPort) {
    console.log(`Port ${preferredPort} is busy, using port ${port} instead`);
  }

  server.listen(port, () => {
    console.log(`Server running on http://localhost:${port}/`);
    // 서버 시작 후 비동기로 캐시 워밍업 (서버 시작을 늘리지 않음)
    warmupCache();
    // TiDB Serverless 슬립 방지: 3분마다 가벼운 핑 쿼리로 DB 연결 유지
    // TiDB 무료 플랜은 5분 무활동 시 슬립 진입 → 3분 주기로 선제 방지
    setInterval(async () => {
      try {
        await getSiteConfigAll(); // 캐시된 쿼리로 DB 연결 유지 (실제 DB 부하 최소화)
      } catch {
        // 핑 실패 시 무시 (서버 동작에 영향 없음)
      }
    }, 3 * 60_000); // 3분 간격
  });
}

startServer().catch(console.error);
