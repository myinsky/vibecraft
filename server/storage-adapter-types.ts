export type StorageData = Buffer | Uint8Array | string;

export interface StorageResult {
  key: string;
  url: string;
}

export interface StorageProvider {
  put(key: string, data: StorageData, contentType: string): Promise<void>;
  getDownloadUrl(key: string): Promise<string>;
  fetch(key: string): Promise<Response>;
  delete(key: string): Promise<void>;
  exists(key: string): Promise<boolean>;
}

export interface R2ObjectBodyLike {
  body: ReadableStream<Uint8Array>;
  size?: number;
  httpMetadata?: { contentType?: string };
}

export interface R2BucketBinding {
  put(key: string, value: ArrayBuffer | ArrayBufferView | string | ReadableStream, options?: { httpMetadata?: { contentType?: string } }): Promise<unknown>;
  get(key: string): Promise<R2ObjectBodyLike | null>;
  head(key: string): Promise<unknown | null>;
  delete(key: string): Promise<void>;
}

export interface StorageBindings {
  R2_BUCKET?: R2BucketBinding;
}
