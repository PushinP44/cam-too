import type { ImageF } from './image';
import type { Look } from './look';
import { cropAndResize, type Shape } from './geometry';
import { develop } from './develop';

export interface RenderOptions {
  shape: Shape;
  /** Where the crop sits along the axis with spare room, 0..1 on each axis (see `cropRect`). */
  offset: { x: number; y: number };
  /** Output size as a fraction of the shape's full size; 1 is full size. */
  scale: number;
  look: Look | null;
  strength: number;
  seed: number;
}

/**
 * The whole pipeline: crops the linear-light working image to the shape, resizes it to
 * `scale`, balances exposure and applies the look. Returns a display (sRGB-encoded) image.
 */
export function render(work: ImageF, opts: RenderOptions): ImageF {
  const { shape, offset, scale, look, strength, seed } = opts;
  return develop(cropAndResize(work, shape, offset, scale), { look, strength, seed, balance: true });
}
