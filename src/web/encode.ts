import { displayToRgba } from '../engine/color';
import type { ImageF } from '../engine/image';

/** Paints a display (sRGB-encoded) image onto `canvas`, resizing the canvas to fit it. */
export function drawDisplay(canvas: HTMLCanvasElement, display: ImageF): void {
  canvas.width = display.width;
  canvas.height = display.height;
  const context = canvas.getContext('2d', { colorSpace: 'srgb' });
  if (!context) throw new Error('A 2D canvas is not available');
  const pixels = context.createImageData(display.width, display.height);
  pixels.data.set(displayToRgba(display));
  context.putImageData(pixels, 0, 0);
}

/** Encodes a display (sRGB-encoded) image as a JPEG. Rejects if the browser cannot encode it. */
export async function encodeJpeg(display: ImageF, quality = 0.92): Promise<Blob> {
  const canvas = document.createElement('canvas');
  drawDisplay(canvas, display);
  return new Promise((resolve, reject) => {
    canvas.toBlob(
      blob => (blob ? resolve(blob) : reject(new Error('The browser could not encode the photo as a JPEG'))),
      'image/jpeg',
      quality,
    );
  });
}
