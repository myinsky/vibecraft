export interface ZipEntry {
  entryName: string;
  isDirectory: boolean;
  getData(): Buffer;
}

export interface ZipArchive {
  entries(): ZipEntry[];
}

/** Node implementation is loaded lazily so Worker bundles can replace this boundary. */
export async function openZipArchive(data: Uint8Array): Promise<ZipArchive> {
  const { openNodeZipArchive } = await import("./zip-node");
  return openNodeZipArchive(data);
}
