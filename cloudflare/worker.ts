import {
  configureStorageBindings,
  storageFetch,
  type R2BucketBinding,
} from "../server/storage";

interface AssetFetcher {
  fetch(request: Request): Promise<Response>;
}

interface HyperdriveBinding {
  connectionString: string;
}

interface Env {
  ASSETS: AssetFetcher;
  HYPERDRIVE: HyperdriveBinding;
  R2_BUCKET: R2BucketBinding;
  APP_ENV: "preview" | "production";
  STORAGE_PROVIDER: "forge" | "r2";
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
    configureStorageBindings({ R2_BUCKET: env.R2_BUCKET }, env.STORAGE_PROVIDER);
    const { pathname } = new URL(request.url);

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
