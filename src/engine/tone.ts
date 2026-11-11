import { createImage, type ImageF } from './image';
import { LUMA } from './color';
import type { Look } from './look';

/** Mid-grey in linear light; the curve's pivot is measured in stops from here. */
const MID_GREY = 0.18;

/**
 * S-shaped film response. Takes scene-linear `x` and returns a display value
 * between `black` and `white`. `slope` is the gradient at the pivot (output per
 * stop) and `pivot` is the exposure, in stops from mid-grey, that lands halfway
 * between `black` and `white`. Non-positive input is treated as a tiny value, so
 * the result is always finite.
 */
export function filmCurve(x: number, slope: number, pivot: number, black: number, white: number): number {
  const range = white - black;
  const k = (4 * slope) / range;
  const stops = Math.log2(Math.max(x, 1e-6) / MID_GREY);
  return black + range / (1 + Math.exp(-k * (stops - pivot)));
}

/**
 * Applies a look's tone and colour response. Linear-light in, display
 * (sRGB-encoded) out, as a new image; the input is left alone. The result is
 * not clamped, so it can fall slightly outside 0..1 once tints are added.
 */
export function applyTone(linear: ImageF, look: Look): ImageF {
  const { ev, slope, pivot, black, white, mono } = look.tone;
  const { saturation, shadowTint, highlightTint } = look.colour;
  const gain = 2 ** ev;
  // A monochrome look has one curve; its pivot is the mean of the three.
  const monoPivot = (pivot[0] + pivot[1] + pivot[2]) / 3;

  const out = createImage(linear.width, linear.height);
  const src = linear.data;
  const dst = out.data;
  const rgb = [0, 0, 0];

  for (let i = 0; i < src.length; i += 3) {
    const r = src[i] * gain;
    const g = src[i + 1] * gain;
    const b = src[i + 2] * gain;

    if (mono) {
      const v = filmCurve(mono[0] * r + mono[1] * g + mono[2] * b, slope, monoPivot, black, white);
      rgb[0] = rgb[1] = rgb[2] = v;
    } else {
      rgb[0] = filmCurve(r, slope, pivot[0], black, white);
      rgb[1] = filmCurve(g, slope, pivot[1], black, white);
      rgb[2] = filmCurve(b, slope, pivot[2], black, white);
    }

    const l = LUMA[0] * rgb[0] + LUMA[1] * rgb[1] + LUMA[2] * rgb[2];
    for (let c = 0; c < 3; c++) {
      const v = l + saturation * (rgb[c] - l);
      dst[i + c] = v + (1 - l) * shadowTint[c] + l * highlightTint[c];
    }
  }
  return out;
}
