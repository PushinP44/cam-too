import { createImage, type ImageF } from '../../src/engine/image';

/**
 * A smooth, colourful test photo (linear light): a hue sweep across, fading from near
 * black at the top to full brightness at the bottom, with the three channels a third of
 * a cycle apart.
 */
export function syntheticPhoto(width: number, height: number): ImageF {
  const img = createImage(width, height);
  const lastX = Math.max(width - 1, 1);
  const lastY = Math.max(height - 1, 1);
  for (let y = 0; y < height; y++) {
    const v = y / lastY;
    for (let x = 0; x < width; x++) {
      const u = x / lastX;
      for (let c = 0; c < 3; c++) {
        img.data[(y * width + x) * 3 + c] = (0.5 + 0.5 * Math.sin(2 * Math.PI * (u + c / 3))) * (0.05 + 0.95 * v);
      }
    }
  }
  return img;
}

/** The largest absolute difference between two lists of the same length. */
export function maxAbsDiff(a: ArrayLike<number>, b: ArrayLike<number>): number {
  if (a.length !== b.length) throw new Error(`cannot compare ${a.length} values with ${b.length}`);
  let max = 0;
  for (let i = 0; i < a.length; i++) max = Math.max(max, Math.abs(a[i] - b[i]));
  return max;
}

/**
 * Mean of each channel in each cell of a `cols` x `rows` grid laid over the image,
 * rounded to 3 decimals: row by row, each cell giving r, g, b. The image needs at least
 * one pixel per cell.
 */
export function gridMeans(img: ImageF, cols: number, rows: number): number[] {
  const sums = new Float64Array(cols * rows * 3);
  const counts = new Float64Array(cols * rows);
  for (let y = 0; y < img.height; y++) {
    const row = Math.floor((y * rows) / img.height);
    for (let x = 0; x < img.width; x++) {
      const cell = row * cols + Math.floor((x * cols) / img.width);
      counts[cell]++;
      for (let c = 0; c < 3; c++) sums[cell * 3 + c] += img.data[(y * img.width + x) * 3 + c];
    }
  }
  return Array.from(sums, (sum, i) => Math.round((sum / counts[Math.floor(i / 3)]) * 1000) / 1000);
}
