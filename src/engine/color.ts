import { createImage, type ImageF } from './image';

/** Rec. 709 / sRGB luminance weights for linear-light RGB. */
export const LUMA: readonly [number, number, number] = [0.2126, 0.7152, 0.0722];

/** sRGB-encoded value (0..1) to linear light. */
export function srgbToLinear(v: number): number {
  return v <= 0.04045 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4);
}

/** Linear light to sRGB-encoded value. Input is clamped to 0..1 first. */
export function linearToSrgb(v: number): number {
  // The explicit 0 and 1 returns keep the endpoints exact: the power curve alone gives 0.9999999999999999 at 1.
  if (v <= 0) return 0;
  if (v >= 1) return 1;
  return v <= 0.0031308 ? v * 12.92 : 1.055 * Math.pow(v, 1 / 2.4) - 0.055;
}

export function luminance(r: number, g: number, b: number): number {
  return LUMA[0] * r + LUMA[1] * g + LUMA[2] * b;
}

/** Display (sRGB-encoded) image to linear light. */
export function toLinear(display: ImageF): ImageF {
  const out = createImage(display.width, display.height);
  for (let i = 0; i < display.data.length; i++) out.data[i] = srgbToLinear(display.data[i]);
  return out;
}

/** Linear-light image to display (sRGB-encoded), clamped to 0..1. */
export function toDisplay(linear: ImageF): ImageF {
  const out = createImage(linear.width, linear.height);
  for (let i = 0; i < linear.data.length; i++) out.data[i] = linearToSrgb(linear.data[i]);
  return out;
}

/** 8-bit straight-alpha RGBA, flattened onto white, to a linear-light image. */
export function rgbaToLinear(rgba: Uint8ClampedArray, width: number, height: number): ImageF {
  const out = createImage(width, height);
  for (let p = 0; p < width * height; p++) {
    const a = rgba[p * 4 + 3] / 255;
    for (let c = 0; c < 3; c++) {
      const flattened = (rgba[p * 4 + c] / 255) * a + (1 - a);
      out.data[p * 3 + c] = srgbToLinear(flattened);
    }
  }
  return out;
}

/** Display (sRGB-encoded) image to 8-bit RGBA with alpha 255. */
export function displayToRgba(display: ImageF): Uint8ClampedArray {
  const pixels = display.width * display.height;
  const out = new Uint8ClampedArray(pixels * 4);
  for (let p = 0; p < pixels; p++) {
    for (let c = 0; c < 3; c++) out[p * 4 + c] = Math.round(display.data[p * 3 + c] * 255);
    out[p * 4 + 3] = 255;
  }
  return out;
}
