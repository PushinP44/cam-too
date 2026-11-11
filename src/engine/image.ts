/**
 * Floating-point RGB image, interleaved (r, g, b, r, g, b, ...).
 * `data.length === width * height * 3`.
 *
 * Engine images are linear-light unless a function says "display"
 * (sRGB-encoded, 0..1).
 */
export interface ImageF {
  width: number;
  height: number;
  data: Float32Array;
}

export function createImage(width: number, height: number, fill = 0): ImageF {
  const data = new Float32Array(width * height * 3).fill(fill);
  return { width, height, data };
}

export function cloneImage(img: ImageF): ImageF {
  return { width: img.width, height: img.height, data: new Float32Array(img.data) };
}
