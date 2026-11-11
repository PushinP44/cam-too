/**
 * The longest side, in pixels, of the working copy of a photo. It keeps a 48 MP phone
 * photo from filling a phone's memory, and a 4:5 crop of it still covers the 1080 x 1350 output.
 */
export const WORKING_MAX_LONG_EDGE = 2048;

/**
 * The size to decode a `width` x `height` photo to: the same ratio, with the longer side
 * at most `maxLongEdge`. A photo that is already small enough keeps its size.
 */
export function workingSize(width: number, height: number, maxLongEdge: number): { width: number; height: number } {
  const factor = Math.min(1, maxLongEdge / Math.max(width, height));
  return {
    width: Math.max(1, Math.round(width * factor)),
    height: Math.max(1, Math.round(height * factor)),
  };
}
