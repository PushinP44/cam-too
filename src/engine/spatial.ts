import { cloneImage, createImage, type ImageF } from './image';
import { luminance } from './color';
import { createGaussian } from './prng';
import type { Look } from './look';

/** Below this a Gaussian is narrower than a pixel and the blur would change nothing visible. */
const MIN_SIGMA = 0.3;

// Weights of the luma/chroma split used by `cleanChroma` (Rec. 601, not the Rec. 709 `LUMA`).
const Y_R = 0.299;
const Y_G = 0.587;
const Y_B = 0.114;

/** Mirrors index `i` back into 0..n-1 with the edge pixel repeated (-1 gives 0, n gives n-1). Safe for any offset. */
function reflect(i: number, n: number): number {
  const period = 2 * n;
  const m = ((i % period) + period) % period;
  return m < n ? m : period - 1 - m;
}

function gaussianKernel(sigma: number, radius: number): Float64Array {
  const kernel = new Float64Array(2 * radius + 1);
  let sum = 0;
  for (let k = -radius; k <= radius; k++) {
    const v = Math.exp(-(k * k) / (2 * sigma * sigma));
    kernel[k + radius] = v;
    sum += v;
  }
  for (let i = 0; i < kernel.length; i++) kernel[i] /= sum;
  return kernel;
}

/**
 * Separable Gaussian blur of one `width` x `height` plane. Edges are reflected
 * and the kernel radius is `round(3 * sigma)`. Returns a new plane; a `sigma`
 * below 0.3 returns an unchanged copy.
 */
export function gaussianBlurPlane(plane: Float32Array, width: number, height: number, sigma: number): Float32Array {
  if (!(sigma >= MIN_SIGMA)) return new Float32Array(plane);

  const radius = Math.round(3 * sigma);
  const kernel = gaussianKernel(sigma, radius);
  const taps = kernel.length;

  // Horizontal pass. Each row is copied into a padded buffer with reflected
  // ends, so the inner loop needs no bounds checks.
  const across = new Float32Array(width * height);
  const padded = new Float32Array(width + 2 * radius);
  for (let y = 0; y < height; y++) {
    const row = y * width;
    padded.set(plane.subarray(row, row + width), radius);
    for (let j = 0; j < radius; j++) {
      padded[j] = plane[row + reflect(j - radius, width)];
      padded[radius + width + j] = plane[row + reflect(width + j, width)];
    }
    for (let x = 0; x < width; x++) {
      let acc = 0;
      for (let k = 0; k < taps; k++) acc += kernel[k] * padded[x + k];
      across[row + x] = acc;
    }
  }

  // Vertical pass, one output row at a time so memory is read in order.
  const out = new Float32Array(width * height);
  const acc = new Float64Array(width);
  for (let y = 0; y < height; y++) {
    acc.fill(0);
    for (let k = 0; k < taps; k++) {
      const src = reflect(y + k - radius, height) * width;
      const weight = kernel[k];
      for (let x = 0; x < width; x++) acc[x] += weight * across[src + x];
    }
    out.set(acc, y * width);
  }
  return out;
}

/**
 * Softens colour noise without softening detail: colour differences are
 * blurred more than brightness. Linear-light in and out, as a new image.
 */
export function cleanChroma(linear: ImageF): ImageF {
  const { width, height } = linear;
  const s = Math.min(width, height);
  const src = linear.data;
  const pixels = width * height;

  const y = new Float32Array(pixels);
  const cb = new Float32Array(pixels);
  const cr = new Float32Array(pixels);
  for (let p = 0; p < pixels; p++) {
    const r = src[p * 3];
    const b = src[p * 3 + 2];
    const luma = Y_R * r + Y_G * src[p * 3 + 1] + Y_B * b;
    y[p] = luma;
    cb[p] = b - luma;
    cr[p] = r - luma;
  }

  const ySoft = gaussianBlurPlane(y, width, height, 0.00045 * s);
  const cbSoft = gaussianBlurPlane(cb, width, height, 0.0012 * s);
  const crSoft = gaussianBlurPlane(cr, width, height, 0.0012 * s);

  const out = createImage(width, height);
  const dst = out.data;
  for (let p = 0; p < pixels; p++) {
    const luma = ySoft[p];
    const r = luma + crSoft[p];
    const b = luma + cbSoft[p];
    const g = (luma - Y_R * r - Y_B * b) / Y_G;
    dst[p * 3] = Math.max(r, 0);
    dst[p * 3 + 1] = Math.max(g, 0);
    dst[p * 3 + 2] = Math.max(b, 0);
  }
  return out;
}

/**
 * Film halation: light above the look's threshold bleeds into a tinted glow.
 * Linear-light in and out, as a new image.
 */
export function applyHalation(linear: ImageF, look: Look): ImageF {
  const { threshold, tint, amount } = look.halation;
  if (amount === 0) return cloneImage(linear);

  const { width, height } = linear;
  const s = Math.min(width, height);
  const src = linear.data;
  const pixels = width * height;

  const hot = new Float32Array(pixels);
  let anyHot = false;
  for (let p = 0; p < pixels; p++) {
    const over = luminance(src[p * 3], src[p * 3 + 1], src[p * 3 + 2]) - threshold;
    if (over > 0) {
      hot[p] = over;
      anyHot = true;
    }
  }
  if (!anyHot) return cloneImage(linear);

  const tight = gaussianBlurPlane(hot, width, height, 0.0045 * s);
  const wide = gaussianBlurPlane(hot, width, height, 0.0135 * s);

  const out = createImage(width, height);
  const dst = out.data;
  for (let p = 0; p < pixels; p++) {
    const glow = (0.6 * tight[p] + 0.4 * wide[p]) * amount;
    dst[p * 3] = src[p * 3] + glow * tint[0];
    dst[p * 3 + 1] = src[p * 3 + 1] + glow * tint[1];
    dst[p * 3 + 2] = src[p * 3 + 2] + glow * tint[2];
  }
  return out;
}

/**
 * Darkens towards the corners: `1 - amount * r2^1.2`, where `r2` is 0 at the
 * centre and 1 at the corners. Display (sRGB-encoded) in and out, as a new image.
 */
export function applyVignette(display: ImageF, amount: number): ImageF {
  if (amount === 0) return cloneImage(display);

  const { width, height } = display;
  const src = display.data;
  const out = createImage(width, height);
  const dst = out.data;

  const columnSq = new Float64Array(width);
  for (let x = 0; x < width; x++) {
    const u = (2 * (x + 0.5)) / width - 1;
    columnSq[x] = u * u;
  }

  for (let y = 0; y < height; y++) {
    const v = (2 * (y + 0.5)) / height - 1;
    const rowSq = v * v;
    for (let x = 0; x < width; x++) {
      const factor = 1 - amount * Math.pow((columnSq[x] + rowSq) / 2, 1.2);
      const i = (y * width + x) * 3;
      dst[i] = src[i] * factor;
      dst[i + 1] = src[i + 1] * factor;
      dst[i + 2] = src[i + 2] * factor;
    }
  }
  return out;
}

/** Population standard deviation about the mean. */
function standardDeviation(values: Float32Array): number {
  let mean = 0;
  for (let i = 0; i < values.length; i++) mean += values[i];
  mean /= values.length;
  let sum = 0;
  for (let i = 0; i < values.length; i++) {
    const d = values[i] - mean;
    sum += d * d;
  }
  return Math.sqrt(sum / values.length);
}

/**
 * Seeded film grain. Each channel gets noise that is mostly shared with the
 * other channels (so it reads as luminance grain) plus a little of its own,
 * blurred to the look's grain size and scaled to unit strength. Grain is
 * strongest in the mid-tones. Display (sRGB-encoded) in and out, as a new
 * image; the same seed always gives the same grain.
 */
export function applyGrain(display: ImageF, look: Look, seed: number): ImageF {
  const { amount, size } = look.grain;
  if (amount === 0) return cloneImage(display);

  const { width, height } = display;
  const src = display.data;
  const pixels = width * height;
  const sigma = (size * Math.min(width, height)) / 1080;
  const nextGaussian = createGaussian(seed);

  // Per-pixel strength: the grain amount, weighted towards the mid-tones.
  const strength = new Float32Array(pixels);
  for (let p = 0; p < pixels; p++) {
    const l = Math.min(Math.max(luminance(src[p * 3], src[p * 3 + 1], src[p * 3 + 2]), 0), 1);
    strength[p] = amount * (0.4 + 2.4 * l * (1 - l));
  }

  const mono = new Float32Array(pixels);
  for (let p = 0; p < pixels; p++) mono[p] = nextGaussian();

  const out = cloneImage(display);
  const dst = out.data;
  const noise = new Float32Array(pixels);
  for (let c = 0; c < 3; c++) {
    for (let p = 0; p < pixels; p++) noise[p] = 0.8 * mono[p] + 0.2 * nextGaussian();
    const grain = gaussianBlurPlane(noise, width, height, sigma);
    const deviation = standardDeviation(grain);
    const scale = deviation < 1e-9 ? 1 : 1 / deviation;
    for (let p = 0; p < pixels; p++) dst[p * 3 + c] += grain[p] * scale * strength[p];
  }
  return out;
}
