import AdmZip from "adm-zip";
import type { ZipArchive } from "./zip-adapter";

export function openNodeZipArchive(data: Uint8Array): ZipArchive {
  const archive = new AdmZip(Buffer.from(data));
  return {
    entries: () => archive.getEntries().map(entry => ({
      entryName: entry.entryName,
      isDirectory: entry.isDirectory,
      getData: () => entry.getData(),
    })),
  };
}
