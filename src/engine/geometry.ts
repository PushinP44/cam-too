import { createImage, type ImageF } from './image';

export type ShapeId = '4:5' | '1:1' | '9:16';

/** An output shape: its id and its size in pixels at full scale. */
export interface Shape {
  id: ShapeId;
  width: number;
  height: number;
}

export const SHAPES: Record<ShapeId, Shape> = {
  '4:5': { id: '4:5', width: 1080, height: 1350 },
  '1:1': { id: '1:1', width: 1080, height: 1080 },
  '9:16': { id: '9:16', width: 1080, height: 1920 },
};

/** A rectangle in whole source pixels. */
export interface CropRect {
  x: number;
  y: number;
  width: number;
  height: number;
}

const clamp01 = (v: number) => Math.min(1, Math.max(0, v));

/**
 * The largest rectangle of the shape's ratio that fits inside the source. The spare room
 * along the one axis that has any is shared out by `offset` (each part 0..1, clamped):
 * 0 puts the rectangle at the start, 1 at the end, 0.5 centres it.
 */
export function cropRect(srcWidth: number, srcHeight: number, shape: Shape, offset: { x: number; y: number }): CropRect {
  // Compare the ratios by cross-multiplying, so no division can round the wrong way.
  const sourceIsWider = srcWidth * shape.height >= srcHeight * shape.width;
  const width = sourceIsWider ? Math.round((srcHeight * shape.width) / shape.height) : srcWidth;
  const height = sourceIsWider ? srcHeight : Math.round((srcWidth * shape.height) / shape.width);
  return {
    x: Math.round(clamp01(offset.x) * (srcWidth - width)),
    y: Math.round(clamp01(offset.y) * (srcHeight - height)),
    width,
    height,
  };
}

/**
 * How one axis is resampled: output sample `i` is the weighted sum of the consecutive
 * source samples `first[i]`, `first[i] + 1`, ..., using `weights[from[i]]` up to (not
 * including) `weights[from[i + 1]]`. The weights of one output sample add up to 1.
 */
interface Taps {
  first: Int32Array;
  from: Int32Array;
  weights: Float64Array;
}

/**
 * Taps that turn `size` source samples, starting at `origin`, into `outSize` samples.
 * Shrinking averages each output sample's whole span of the source, with fractional
 * coverage at the two ends. Growing (or keeping the size) interpolates linearly between
 * the two nearest source samples, taking pixel centres as the sample positions.
 */
function buildTaps(origin: number, size: number, outSize: number): Taps {
  const scale = size / outSize;
  const first = new Int32Array(outSize);
  const from = new Int32Array(outSize + 1);
  // A span of `scale` source samples touches at most ceil(scale) + 1 of them; growing needs 2.
  const weights = new Float64Array(outSize * (Math.ceil(scale) + 1));
  let n = 0;

  for (let i = 0; i < outSize; i++) {
    from[i] = n;
    if (outSize < size) {
      const lo = i * scale;
      const hi = Math.min((i + 1) * scale, size);
      const a = Math.floor(lo);
      const b = Math.min(Math.ceil(hi), size);
      first[i] = origin + a;
      const start = n;
      let sum = 0;
      for (let s = a; s < b; s++) {
        const w = Math.min(hi, s + 1) - Math.max(lo, s);
        weights[n++] = w;
        sum += w;
      }
      for (let k = start; k < n; k++) weights[k] /= sum;
    } else {
      const c = Math.min(size - 1, Math.max(0, (i + 0.5) * scale - 0.5));
      const a = Math.floor(c);
      const f = c - a;
      first[i] = origin + a;
      weights[n++] = 1 - f;
      // A nonzero fraction means `a` is not the last sample, so `a + 1` exists.
      if (f > 0) weights[n++] = f;
    }
  }
  from[outSize] = n;
  return { first, from, weights };
}

/** Resamples the `rect` part of `img` to `width` x `height`, a horizontal pass and then a vertical one. */
function resample(img: ImageF, rect: CropRect, width: number, height: number): ImageF {
  const across = buildTaps(rect.x, rect.width, width);
  // The horizontal pass keeps only the crop's rows, so the vertical taps count from its top.
  const down = buildTaps(0, rect.height, height);
  const src = img.data;
  const rowLength = width * 3;

  const wide = new Float32Array(rowLength * rect.height);
  for (let y = 0; y < rect.height; y++) {
    const srcRow = (rect.y + y) * img.width * 3;
    const wideRow = y * rowLength;
    for (let x = 0; x < width; x++) {
      let r = 0;
      let g = 0;
      let b = 0;
      let p = srcRow + across.first[x] * 3;
      for (let k = across.from[x]; k < across.from[x + 1]; k++, p += 3) {
        const w = across.weights[k];
        r += w * src[p];
        g += w * src[p + 1];
        b += w * src[p + 2];
      }
      const o = wideRow + x * 3;
      wide[o] = r;
      wide[o + 1] = g;
      wide[o + 2] = b;
    }
  }

  const out = createImage(width, height);
  const row = new Float64Array(rowLength);
  for (let y = 0; y < height; y++) {
    row.fill(0);
    let wideRow = down.first[y];
    for (let k = down.from[y]; k < down.from[y + 1]; k++, wideRow++) {
      const w = down.weights[k];
      const base = wideRow * rowLength;
      for (let i = 0; i < rowLength; i++) row[i] += w * wide[base + i];
    }
    out.data.set(row, y * rowLength);
  }
  return out;
}

/**
 * Resizes to exactly `width` x `height` (whole pixels, at least 1). Each axis is
 * averaged over its covered span when it shrinks and interpolated linearly when it
 * grows, so the two axes can differ. Returns a new image.
 */
export function resizeArea(img: ImageF, width: number, height: number): ImageF {
  return resample(img, { x: 0, y: 0, width: img.width, height: img.height }, width, height);
}

/**
 * Crops `img` to the shape's ratio (see `cropRect`) and resizes the crop to
 * `round(shape.width * scale)` x `round(shape.height * scale)`, without making an
 * intermediate copy of the crop. Returns a new image.
 */
export function cropAndResize(img: ImageF, shape: Shape, offset: { x: number; y: number }, scale = 1): ImageF {
  const rect = cropRect(img.width, img.height, shape, offset);
  return resample(img, rect, Math.round(shape.width * scale), Math.round(shape.height * scale));
}
