import type { R2BucketBinding, StorageData, StorageProvider } from "./storage-adapter-types";

export function createR2StorageProvider(bucket: R2BucketBinding): StorageProvider {
  return {
    async put(key, data: StorageData, contentType) {
      await bucket.put(key, data, { httpMetadata: { contentType } });
    },
    async getDownloadUrl(key) {
      return `/manus-storage/${key}`;
    },
    async fetch(key) {
      const object = await bucket.get(key);
      if (!object) return new Response("Not found", { status: 404 });
      const headers = new Headers();
      if (object.httpMetadata?.contentType) headers.set("Content-Type", object.httpMetadata.contentType);
      if (object.size !== undefined) headers.set("Content-Length", String(object.size));
      return new Response(object.body, { headers });
    },
    async delete(key) {
      await bucket.delete(key);
    },
    async exists(key) {
      return (await bucket.head(key)) !== null;
    },
  };
}
