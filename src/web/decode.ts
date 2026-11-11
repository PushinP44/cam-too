import type { ImageF } from '../engine/image';
import { rgbaToLinear } from '../engine/color';
import { WORKING_MAX_LONG_EDGE, workingSize } from './sizes';

/**
 * Opens a photo as a linear-light working image, upright and in sRGB, at most
 * `maxLongEdge` on its longer side. The browser does the decoding and the shrinking, so
 * a full-size float image is never built. Rejects if the file is not an image it can open.
 */
export async function decodeFile(file: Blob, maxLongEdge = WORKING_MAX_LONG_EDGE): Promise<ImageF> {
  const bitmap = await createImageBitmap(file, { imageOrientation: 'from-image' });
  const { width, height } = workingSize(bitmap.width, bitmap.height, maxLongEdge);

  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  try {
    // 'srgb' makes the browser convert a Display P3 photo, so the pixels we read are sRGB.
    const context = canvas.getContext('2d', { colorSpace: 'srgb', willReadFrequently: true });
    try {
      if (!context) throw new Error('A 2D canvas is not available');
      context.imageSmoothingQuality = 'high';
      context.drawImage(bitmap, 0, 0, width, height);
    } finally {
      // Closed as soon as it has been drawn (or has failed to be), before the pixels are read.
      bitmap.close();
    }
    return rgbaToLinear(context.getImageData(0, 0, width, height).data, width, height);
  } finally {
    // Frees the canvas's pixel memory now instead of when the garbage collector gets to it.
    canvas.width = 0;
    canvas.height = 0;
  }
}
