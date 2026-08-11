import { jsxLocPlugin } from "@builder.io/vite-plugin-jsx-loc";
import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import fs from "node:fs";
import path from "node:path";
import { defineConfig, type Plugin, type ViteDevServer } from "vite";
import { vitePluginManusRuntime } from "vite-plugin-manus-runtime";
import { visualizer } from "rollup-plugin-visualizer";

// =============================================================================
// Manus Debug Collector - Vite Plugin
// Writes browser logs directly to files, trimmed when exceeding size limit
// =============================================================================

const PROJECT_ROOT = import.meta.dirname;
const LOG_DIR = path.join(PROJECT_ROOT, ".manus-logs");
const MAX_LOG_SIZE_BYTES = 1 * 1024 * 1024; // 1MB per log file
const TRIM_TARGET_BYTES = Math.floor(MAX_LOG_SIZE_BYTES * 0.6); // Trim to 60% to avoid constant re-trimming

type LogSource = "browserConsole" | "networkRequests" | "sessionReplay";

function ensureLogDir() {
  if (!fs.existsSync(LOG_DIR)) {
    fs.mkdirSync(LOG_DIR, { recursive: true });
  }
}

function trimLogFile(logPath: string, maxSize: number) {
  try {
    if (!fs.existsSync(logPath) || fs.statSync(logPath).size <= maxSize) {
      return;
    }

    const lines = fs.readFileSync(logPath, "utf-8").split("\n");
    const keptLines: string[] = [];
    let keptBytes = 0;

    // Keep newest lines (from end) that fit within 60% of maxSize
    const targetSize = TRIM_TARGET_BYTES;
    for (let i = lines.length - 1; i >= 0; i--) {
      const lineBytes = Buffer.byteLength(`${lines[i]}\n`, "utf-8");
      if (keptBytes + lineBytes > targetSize) break;
      keptLines.unshift(lines[i]);
      keptBytes += lineBytes;
    }

    fs.writeFileSync(logPath, keptLines.join("\n"), "utf-8");
  } catch {
    /* ignore trim errors */
  }
}

function writeToLogFile(source: LogSource, entries: unknown[]) {
  if (entries.length === 0) return;

  ensureLogDir();
  const logPath = path.join(LOG_DIR, `${source}.log`);

  // Format entries with timestamps
  const lines = entries.map((entry) => {
    const ts = new Date().toISOString();
    return `[${ts}] ${JSON.stringify(entry)}`;
  });

  // Append to log file
  fs.appendFileSync(logPath, `${lines.join("\n")}\n`, "utf-8");

  // Trim if exceeds max size
  trimLogFile(logPath, MAX_LOG_SIZE_BYTES);
}

/**
 * Vite plugin to collect browser debug logs
 * - POST /__manus__/logs: Browser sends logs, written directly to files
 * - Files: browserConsole.log, networkRequests.log, sessionReplay.log
 * - Auto-trimmed when exceeding 1MB (keeps newest entries)
 */
function vitePluginManusDebugCollector(): Plugin {
  return {
    name: "manus-debug-collector",

    transformIndexHtml(html) {
      if (process.env.NODE_ENV === "production") {
        return html;
      }
      return {
        html,
        tags: [
          {
            tag: "script",
            attrs: {
              src: "/__manus__/debug-collector.js",
              defer: true,
            },
            injectTo: "head",
          },
        ],
      };
    },

    configureServer(server: ViteDevServer) {
      // POST /__manus__/logs: Browser sends logs (written directly to files)
      server.middlewares.use("/__manus__/logs", (req, res, next) => {
        if (req.method !== "POST") {
          return next();
        }

        const handlePayload = (payload: any) => {
          // Write logs directly to files
          if (payload.consoleLogs?.length > 0) {
            writeToLogFile("browserConsole", payload.consoleLogs);
          }
          if (payload.networkRequests?.length > 0) {
            writeToLogFile("networkRequests", payload.networkRequests);
          }
          if (payload.sessionEvents?.length > 0) {
            writeToLogFile("sessionReplay", payload.sessionEvents);
          }

          res.writeHead(200, { "Content-Type": "application/json" });
          res.end(JSON.stringify({ success: true }));
        };

        const reqBody = (req as { body?: unknown }).body;
        if (reqBody && typeof reqBody === "object") {
          try {
            handlePayload(reqBody);
          } catch (e) {
            res.writeHead(400, { "Content-Type": "application/json" });
            res.end(JSON.stringify({ success: false, error: String(e) }));
          }
          return;
        }

        let body = "";
        req.on("data", (chunk) => {
          body += chunk.toString();
        });

        req.on("end", () => {
          try {
            const payload = JSON.parse(body);
            handlePayload(payload);
          } catch (e) {
            res.writeHead(400, { "Content-Type": "application/json" });
            res.end(JSON.stringify({ success: false, error: String(e) }));
          }
        });
      });
    },
  };
}

/**
 * CSS를 동기 로드로 유지합니다.
 * 이전에 비동기 CSS 로드(onload 패턴)를 사용했으나,
 * CSS가 없는 상태에서 React가 렌더링을 시작하면 스타일 적용 시 전체 레이아웃이 밀려
 * CLS 0.461이 발생했습니다.
 * CSS를 동기 로드하면 FCP가 약간 느려지지만 CLS가 0에 가깝게 개선됩니다.
 * 데스크탑에서는 CSS(~8KB gzip)가 빠르게 로드되므로 FCP 영향이 최소화됩니다.
 */

const plugins = [react(), tailwindcss(), jsxLocPlugin(), vitePluginManusRuntime(), vitePluginManusDebugCollector(), visualizer({ filename: 'dist/stats.html', open: false, gzipSize: true }) as Plugin];

export default defineConfig({
  plugins,
  resolve: {
    alias: {
      "@": path.resolve(import.meta.dirname, "client", "src"),
      "@shared": path.resolve(import.meta.dirname, "shared"),
      "@assets": path.resolve(import.meta.dirname, "attached_assets"),
    },
    // React가 여러 경로로 중복 번들되는 것을 방지
    dedupe: ['react', 'react-dom', 'react/jsx-runtime', 'react/jsx-dev-runtime'],
  },
  envDir: path.resolve(import.meta.dirname),
  root: path.resolve(import.meta.dirname, "client"),
  publicDir: path.resolve(import.meta.dirname, "client", "public"),
  build: {
    outDir: path.resolve(import.meta.dirname, "dist/public"),
    emptyOutDir: true,
    chunkSizeWarningLimit: 1000,
    // build.target: es2022로 설정 - 최신 브라우저 대상 최적화 (번들 크기 감소)
    // es2022: class static blocks, top-level await, at() 등 최신 문법 네이티브 지원
    // → esbuild가 폴리필 변환 없이 그대로 출력하여 번들 크기 감소
    target: 'es2022',
    // 소스맵 활성화: 프로덕션 오류 추적 가능 (hidden 모드로 번들에 URL 노출 없이 생성)
    sourcemap: 'hidden',
    // CSS를 주 번들에 인라인하지 않고 별도 파일로 분리 (렌더 블로킹 감소)
    cssCodeSplit: true,
    // lightningcss: esbuild보다 빠른 CSS 미니파이어 (사용되지 않는 CSS 제거 개선)
    cssMinify: 'lightningcss',
    // modulePreload 비활성화: streamdown+shiki(612KB) 등 대형 lazy 청크가
    // 초기 진입점의 mapDeps를 통해 불필요하게 preload되는 것을 방지
    // 이로 인해 FCP/TBT 크게 개선
    modulePreload: false,
    rollupOptions: {
      output: {
        manualChunks(id) {
          // React 코어 — 항상 필요 (scheduler, use-sync-external-store 포함)
          // 주의: react-vendor가 다른 청크(mermaid 등)에 의존하지 않도록
          // 공통 헬퍼(interopRequireDefault 등)가 react-vendor에 포함되어야 함
          if (
            id.includes('node_modules/react/') ||
            id.includes('node_modules/react-dom/') ||
            id.includes('node_modules/scheduler/') ||
            id.includes('node_modules/use-sync-external-store/')
          ) {
            return 'react-vendor';
          }
          // tRPC + React Query — 항상 필요
          if (id.includes('@trpc/') || id.includes('@tanstack/react-query')) {
            return 'trpc-vendor';
          }
          // Radix UI + shadcn + clsx + tailwind-merge + lucide-react — 항상 필요
          // clsx/tailwind-merge는 cn() 유틸리티를 통해 초기 로드 경로에서 사용됨
          // lucide-react는 여러 컴포넌트에서 사용되므로 ui-vendor에 포함
          // 이것들이 markdown-runtime에 포함되면 index.js → markdown-runtime 정적 의존성이 생겨
          // 9.8MB markdown-runtime이 초기 로드에 포함되어 흰 화면 발생
          if (
            id.includes('@radix-ui/') ||
            id.includes('node_modules/clsx/') ||
            id.includes('node_modules/tailwind-merge/') ||
            id.includes('node_modules/lucide-react/')
          ) {
            return 'ui-vendor';
          }
          // TipTap 에디터 — WritePage에서만 필요
          if (id.includes('@tiptap/') || id.includes('prosemirror')) {
            return 'tiptap-editor';
          }
          // CodeMirror — WritePage에서만 필요
          if (id.includes('@codemirror/') || id.includes('@lezer/')) {
            return 'codemirror-editor';
          }
          // streamdown/shiki/katex/parse5/hast-util 등 markdown 라이브러리:
          // manualChunks로 강제 분리 시 Rollup이 공통 헬퍼 함수(_)를 markdown-runtime에서
          // export하고 index.js가 이를 정적으로 import하여 9.8MB가 초기 로드에 포함됨
          // 해결책: manualChunks 설정을 제거하여 Rollup이 자동으로 lazy 청크에 포함시키도록 함
          // (PostDetail, AIChatBox, AnalyticsPage lazy 청크에 포함 → 초기 로드에는 없음)
          // mermaid는 순환 의존성 문제로 manualChunks에서 제외
        },
      },
    },
  },
  server: {
    host: true,
    allowedHosts: [
      ".manuspre.computer",
      ".manus.computer",
      ".manus-asia.computer",
      ".manuscomputer.ai",
      ".manusvm.computer",
      "localhost",
      "127.0.0.1",
    ],
    fs: {
      strict: true,
      deny: ["**/.*"],
    },
  },
});
