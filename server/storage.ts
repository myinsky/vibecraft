import { forgeStorageProvider } from "./storage-forge";
import { createR2StorageProvider } from "./storage-r2";
import type { StorageBindings, StorageData, StorageProvider, StorageResult } from "./storage-adapter-types";

export type StorageProviderName = "forge" | "r2";

let bindings: StorageBindings = {};
let providerOverride: StorageProviderName | undefined;

export function configureStorageBindings(nextBindings: StorageBindings, provider?: StorageProviderName): void {
  bindings = nextBindings;
  providerOverride = provider;
}

export function getStorageProviderName(): StorageProviderName {
  const provider = (providerOverride ?? process.env.STORAGE_PROVIDER ?? "forge").toLowerCase();
  if (provider !== "forge" && provider !== "r2") throw new Error(`Unsupported STORAGE_PROVIDER: ${provider}`);
  return provider;
}

function getProvider(): StorageProvider {
  if (getStorageProviderName() === "forge") return forgeStorageProvider;
  if (!bindings.R2_BUCKET) throw new Error("R2 storage selected but the R2_BUCKET binding was not configured");
  return createR2StorageProvider(bindings.R2_BUCKET);
}

function normalizeKey(relKey: string): string {
  return relKey.replace(/^\/+/, "");
}

function appendHashSuffix(relKey: string): string {
  const hash = crypto.randomUUID().replace(/-/g, "").slice(0, 8);
  const lastDot = relKey.lastIndexOf(".");
  return lastDot === -1 ? `${relKey}_${hash}` : `${relKey.slice(0, lastDot)}_${hash}${relKey.slice(lastDot)}`;
}

export async function storagePut(relKey: string, data: StorageData, contentType = "application/octet-stream"): Promise<StorageResult> {
  const key = appendHashSuffix(normalizeKey(relKey));
  await getProvider().put(key, data, contentType);
  return { key, url: `/manus-storage/${key}` };
}

export async function storageGet(relKey: string): Promise<StorageResult> {
  const key = normalizeKey(relKey);
  return { key, url: `/manus-storage/${key}` };
}

export async function storageGetSignedUrl(relKey: string): Promise<string> {
  return getProvider().getDownloadUrl(normalizeKey(relKey));
}

export async function storageFetch(relKey: string): Promise<Response> {
  return getProvider().fetch(normalizeKey(relKey));
}

export async function storageDelete(relKey: string): Promise<void> {
  await getProvider().delete(normalizeKey(relKey));
}

export async function storageExists(relKey: string): Promise<boolean> {
  return getProvider().exists(normalizeKey(relKey));
}

export type { R2BucketBinding, StorageBindings } from "./storage-adapter-types";
