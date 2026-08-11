interface AssetFetcher {
  fetch(request: Request): Promise<Response>;
}

interface HyperdriveBinding {
  connectionString: string;
}

interface Env {
  ASSETS: AssetFetcher;
  HYPERDRIVE: HyperdriveBinding;
  R2_BUCKET: unknown;
  APP_ENV: "preview" | "production";
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

    // Phase 1 deliberately does not proxy dynamic traffic to Manus or the DB.
    if (pathname.startsWith("/api/") || pathname.startsWith("/manus-storage/")) {
      return notImplemented();
    }

    return env.ASSETS.fetch(request);
  },
};

export default worker;
