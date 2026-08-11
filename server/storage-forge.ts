import { ENV } from "./_core/env";
import type { StorageData, StorageProvider } from "./storage-adapter-types";

function getForgeConfig() {
  const forgeUrl = ENV.forgeApiUrl;
  const forgeKey = ENV.forgeApiKey;
  if (!forgeUrl || !forgeKey) {
    throw new Error("Storage config missing: set BUILT_IN_FORGE_API_URL and BUILT_IN_FORGE_API_KEY");
  }
  return { forgeUrl: forgeUrl.replace(/\/+$/, ""), forgeKey };
}

async function fetchWithTimeout(url: URL | string, init: RequestInit, timeoutMs: number): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, { ...init, signal: controller.signal });
  } finally {
    clearTimeout(timer);
  }
}

async function presign(method: "get" | "put" | "delete", key: string): Promise<string> {
  const { forgeUrl, forgeKey } = getForgeConfig();
  const url = new URL(`v1/storage/presign/${method}`, `${forgeUrl}/`);
  url.searchParams.set("path", key);
  const response = await fetchWithTimeout(url, { headers: { Authorization: `Bearer ${forgeKey}` } }, 30_000);
  if (!response.ok) {
    const message = await response.text().catch(() => response.statusText);
    throw new Error(`Storage presign failed (${response.status}): ${message}`);
  }
  const payload = (await response.json()) as { url?: string };
  if (!payload.url) throw new Error("Forge returned empty presign URL");
  return payload.url;
}

export const forgeStorageProvider: StorageProvider = {
  async put(key, data, contentType) {
    const url = await presign("put", key);
    const blob = typeof data === "string" ? new Blob([data], { type: contentType }) : new Blob([data as BlobPart], { type: contentType });
    const response = await fetchWithTimeout(url, { method: "PUT", headers: { "Content-Type": contentType }, body: blob }, 120_000);
    if (!response.ok) throw new Error(`Storage upload to S3 failed (${response.status})`);
  },
  getDownloadUrl: key => presign("get", key),
  async fetch(key) {
    return fetch(await presign("get", key));
  },
  async delete(key) {
    const response = await fetchWithTimeout(await presign("delete", key), { method: "DELETE" }, 30_000);
    if (!response.ok) throw new Error(`Storage delete failed (${response.status})`);
  },
  async exists(key) {
    const response = await fetchWithTimeout(await presign("get", key), { method: "GET" }, 30_000);
    if (response.status === 404) return false;
    if (!response.ok) throw new Error(`Storage existence check failed (${response.status})`);
    await response.body?.cancel();
    return true;
  },
};
