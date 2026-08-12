export interface ImageTransformOptions {
  width?: number;
  quality?: number;
  withoutEnlargement?: boolean;
}

export interface ImageMetadata {
  width?: number;
  height?: number;
}

export interface ImageTransformer {
  metadata(input: Uint8Array): Promise<ImageMetadata>;
  toWebP(input: Uint8Array, options?: ImageTransformOptions): Promise<Uint8Array>;
}

class LazyNodeImageTransformer implements ImageTransformer {
  async metadata(input: Uint8Array): Promise<ImageMetadata> {
    const { sharpImageTransformer } = await import("./image-transform-sharp");
    return sharpImageTransformer.metadata(input);
  }

  async toWebP(input: Uint8Array, options?: ImageTransformOptions): Promise<Uint8Array> {
    const { sharpImageTransformer } = await import("./image-transform-sharp");
    return sharpImageTransformer.toWebP(input, options);
  }
}

let transformer: ImageTransformer = new LazyNodeImageTransformer();

export function configureImageTransformer(next: ImageTransformer): void {
  transformer = next;
}

export function getImageTransformer(): ImageTransformer {
  return transformer;
}
