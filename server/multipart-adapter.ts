export interface MultipartFile {
  fieldName: string;
  filename: string;
  contentType: string;
  bytes: Uint8Array;
}

export interface MultipartPayload {
  fields: Record<string, string[]>;
  files: MultipartFile[];
}

/** Worker-native multipart parser. Existing Express routes continue using multer. */
export async function parseWorkerMultipart(request: Request): Promise<MultipartPayload> {
  const form = await request.formData();
  const fields: Record<string, string[]> = {};
  const files: MultipartFile[] = [];

  for (const [fieldName, value] of form.entries()) {
    if (typeof value === "string") {
      (fields[fieldName] ??= []).push(value);
      continue;
    }
    files.push({
      fieldName,
      filename: value.name,
      contentType: value.type || "application/octet-stream",
      bytes: new Uint8Array(await value.arrayBuffer()),
    });
  }
  return { fields, files };
}
