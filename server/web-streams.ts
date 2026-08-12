import type { Response as ExpressResponse } from "express";

/** Node bridge kept at the Express boundary; Workers can return the Response directly. */
export async function pipeWebResponseToExpress(response: Response, target: ExpressResponse): Promise<void> {
  if (!response.body) {
    target.end();
    return;
  }
  const { Readable } = await import("node:stream");
  await new Promise<void>((resolve, reject) => {
    const stream = Readable.fromWeb(response.body as import("node:stream/web").ReadableStream);
    stream.on("error", reject);
    target.on("finish", resolve);
    stream.pipe(target);
  });
}
