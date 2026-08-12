import sharp from "sharp";
import type { ImageMetadata, ImageTransformer, ImageTransformOptions } from "./image-transform";

export const sharpImageTransformer: ImageTransformer = {
  metadata(input: Uint8Array): Promise<ImageMetadata> {
    return sharp(input).metadata();
  },

  async toWebP(input: Uint8Array, options: ImageTransformOptions = {}): Promise<Uint8Array> {
    let pipeline = sharp(input);
    if (options.width) {
      pipeline = pipeline.resize({
        width: options.width,
        withoutEnlargement: options.withoutEnlargement ?? true,
      });
    }
    return pipeline.webp({ quality: options.quality ?? 82 }).toBuffer();
  },
};
