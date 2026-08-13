import {
  configureStorageBindings,
  storageFetch,
  type R2BucketBinding,
} from "../server/storage";
import { configureRuntimeEnv, type RuntimeEnv } from "../server/runtime-env";
import {
  checkDatabaseConnection,
  configureDatabaseBindings,
  type DatabaseProviderName,
  type HyperdriveBinding,
} from "../server/database-adapter";

interface AssetFetcher {
  fetch(request: Request): Promise<Response>;
}

interface Env {
  ASSETS: AssetFetcher;
  HYPERDRIVE?: HyperdriveBinding;
  R2_BUCKET: R2BucketBinding;
  APP_ENV: "preview" | "production";
  STORAGE_PROVIDER: "forge" | "r2";
  DATABASE_PROVIDER: DatabaseProviderName;
  DB_HEALTH_TOKEN?: string;
  DB_HOST?: string;
  DB_PORT?: string;
  DB_USER?: string;
  DB_PASSWORD?: string;
  DB_NAME?: string;
  DATABASE_URL?: string;
  JWT_SECRET?: string;
  OAUTH_SERVER_URL?: string;
  OWNER_OPEN_ID?: string;
  BUILT_IN_FORGE_API_URL?: string;
  BUILT_IN_FORGE_API_KEY?: string;
  GEMINI_API_KEY?: string;
  GOOGLE_API_KEY?: string;
  GOOGLE_INDEXING_SERVICE_ACCOUNT_KEY?: string;
}

function notImplemented(): Response {
  return Response.json(
    {
      error: "cloudflare_adapter_not_implemented",
      message: "Dynamic routes remain on the existing Manus service during Phase 1.",
    },
    { status: 501, headers: { "Cache-Control": "no-store" } },
  );
}

const worker = {
  async fetch(request: Request, env: Env): Promise<Response> {
    const { pathname } = new URL(request.url);

    // Public liveness probe. It deliberately does not initialize or query the DB.
    if (pathname === "/api/health" && request.method === "GET") {
      return Response.json(
        { status: "ok" },
        { status: 200, headers: { "Cache-Control": "no-store" } },
      );
    }

    configureRuntimeEnv(env as unknown as RuntimeEnv);
    configureStorageBindings({ R2_BUCKET: env.R2_BUCKET }, env.STORAGE_PROVIDER);
    const databaseBindings = {
      HYPERDRIVE: env.HYPERDRIVE,
      DB_HOST: env.DB_HOST,
      DB_PORT: env.DB_PORT,
      DB_USER: env.DB_USER,
      DB_PASSWORD: env.DB_PASSWORD,
      DB_NAME: env.DB_NAME,
    };
    configureDatabaseBindings(databaseBindings, env.DATABASE_PROVIDER);

    if (pathname === "/api/internal/db-health" && request.method === "GET") {
      const expected = env.DB_HEALTH_TOKEN;
      const supplied = request.headers.get("Authorization");
      if (!expected || supplied !== `Bearer ${expected}`) {
        return new Response("Not found", { status: 404 });
      }
      try {
        const healthy = await checkDatabaseConnection({
          bindings: databaseBindings,
          provider: env.DATABASE_PROVIDER,
        });
        return Response.json(
          { status: healthy ? "ok" : "unavailable", provider: env.DATABASE_PROVIDER },
          { status: healthy ? 200 : 503, headers: { "Cache-Control": "no-store" } },
        );
      } catch (error) {
        console.error("[DB health] connection failed", error);
        return Response.json(
          { status: "unavailable", provider: env.DATABASE_PROVIDER },
          { status: 503, headers: { "Cache-Control": "no-store" } },
        );
      }
    }

    if (pathname.startsWith("/manus-storage/")) {
      const key = decodeURIComponent(pathname.slice("/manus-storage/".length));
      if (!key) return new Response("Missing storage key", { status: 400 });
      return storageFetch(key);
    }

    // Dynamic application routes remain fail-closed until the Worker adapter exists.
    if (pathname.startsWith("/api/")) {
      return notImplemented();
    }

    return env.ASSETS.fetch(request);
  },
};

export default worker;
