import { describe, it, expect } from 'vitest';
import { SHAPES, cropRect, resizeArea, cropAndResize } from '../../src/engine/geometry';
import { createImage } from '../../src/engine/image';
import { maxAbsDiff } from '../support/synthetic';

const gradient = (w: number, h: number) => { const i = createImage(w, h); for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) i.data.fill(x / (w - 1), (y * w + x) * 3, (y * w + x) * 3 + 3); return i; };
const rampDown = (w: number, h: number) => { const i = createImage(w, h); for (let y = 0; y < h; y++) i.data.fill(y / (h - 1), y * w * 3, (y + 1) * w * 3); return i; };
const grey = (w: number, h: number, values: number[]) => { const i = createImage(w, h); values.forEach((v, p) => i.data.fill(v, p * 3, p * 3 + 3)); return i; };
const mean = (a: Float32Array) => a.reduce((x, y) => x + y) / a.length;
const mid = { x: 0.5, y: 0.5 };

it('defines the three shapes', () => {
  expect([SHAPES['4:5'].width, SHAPES['4:5'].height]).toEqual([1080, 1350]);
  expect([SHAPES['1:1'].width, SHAPES['1:1'].height]).toEqual([1080, 1080]);
  expect([SHAPES['9:16'].width, SHAPES['9:16'].height]).toEqual([1080, 1920]);
});
describe('cropRect', () => {
  it('crops landscape to 4:5 and slides with the offset', () => {
    expect(cropRect(4000, 3000, SHAPES['4:5'], mid)).toEqual({ x: 800, y: 0, width: 2400, height: 3000 });
    expect(cropRect(4000, 3000, SHAPES['4:5'], { x: 0, y: 0.5 }).x).toBe(0);
    expect(cropRect(4000, 3000, SHAPES['4:5'], { x: 1, y: 0.5 }).x).toBe(1600);
  });
  it('crops portrait to 4:5 on the vertical axis', () => {
    expect(cropRect(3000, 4000, SHAPES['4:5'], mid)).toEqual({ x: 0, y: 125, width: 3000, height: 3750 });
    expect(cropRect(3000, 4000, SHAPES['4:5'], { x: 0.5, y: 1 }).y).toBe(250);
  });
  it('crops landscape to a square', () => expect(cropRect(4000, 3000, SHAPES['1:1'], mid)).toEqual({ x: 500, y: 0, width: 3000, height: 3000 }));
  it('clamps offsets outside 0..1', () => expect(cropRect(4000, 3000, SHAPES['4:5'], { x: 5, y: -2 }).x).toBe(1600));
});
describe('resizeArea', () => {
  it('averages when shrinking', () => { const i = createImage(2, 2); i.data.set([0, 0, 0, 1, 1, 1, 1, 1, 1, 0, 0, 0]); expect(resizeArea(i, 1, 1).data[0]).toBeCloseTo(0.5, 6); });
  it('keeps a flat image flat when growing', () => { const o = resizeArea(createImage(1, 1, 0.3), 3, 3); expect(o.width).toBe(3); for (const v of o.data) expect(v).toBeCloseTo(0.3, 6); });
  it('returns exact dimensions', () => { const o = resizeArea(createImage(7, 5, 0.5), 3, 2); expect([o.width, o.height, o.data.length]).toEqual([3, 2, 18]); });
  it('weights partly covered pixels by their share', () => expect(Array.from(resizeArea(grey(3, 1, [0, 3, 6]), 2, 1).data.filter((_, i) => i % 3 === 0))).toEqual([1, 5]));
  it('interpolates between pixel centres when growing', () => expect(Array.from(resizeArea(grey(2, 1, [0, 1]), 4, 1).data.filter((_, i) => i % 3 === 0))).toEqual([0, 0.25, 0.75, 1]));
  it('shrinks one axis while growing the other', () => expect(Array.from(resizeArea(grey(2, 2, [0, 0, 1, 1]), 1, 4).data.filter((_, i) => i % 3 === 0))).toEqual([0, 0.25, 0.75, 1]));
});
describe('cropAndResize', () => {
  it('produces the shape size times the scale', () => {
    const a = cropAndResize(createImage(40, 30, 0.5), SHAPES['4:5'], mid, 0.1); expect([a.width, a.height]).toEqual([108, 135]);
  });
  it('upscales a source smaller than the shape to the exact size', () => {
    const o = cropAndResize(gradient(20, 15), SHAPES['4:5'], mid); expect([o.width, o.height]).toEqual([1080, 1350]);
    expect(o.data.every(Number.isFinite)).toBe(true);
  });
  it('lets the offset choose what is kept', () => {
    const g = gradient(40, 30);
    expect(mean(cropAndResize(g, SHAPES['4:5'], { x: 0, y: 0.5 }, 0.05).data)).toBeLessThan(mean(cropAndResize(g, SHAPES['4:5'], { x: 1, y: 0.5 }, 0.05).data));
  });
  it('lets the vertical offset choose what is kept, and matches cropping first', () => {
    const g = rampDown(30, 40);
    const top = cropAndResize(g, SHAPES['4:5'], { x: 0.5, y: 0 }, 0.05);
    const bottom = cropAndResize(g, SHAPES['4:5'], { x: 0.5, y: 1 }, 0.05);
    expect(mean(top.data)).toBeLessThan(mean(bottom.data));
    // The 4:5 crop of 30x40 is 30x38 (37.5 rounds up), so at y offset 1 it starts at row 2 and ends at the last row.
    const crop = createImage(30, 38);
    crop.data.set(g.data.subarray(2 * 30 * 3));
    expect(maxAbsDiff(bottom.data, resizeArea(crop, 54, 68).data)).toBeLessThan(1e-6);
  });
  it('matches cropping first and then resizing', () => {
    // 800x600 to a 0.1-scale 4:5 shrinks both axes; the 480x600 crop at offset x 0.25 starts at x = 80.
    const g = gradient(800, 600);
    const crop = createImage(480, 600);
    for (let y = 0; y < 600; y++) crop.data.set(g.data.subarray((y * 800 + 80) * 3, (y * 800 + 560) * 3), y * 480 * 3);
    const direct = cropAndResize(g, SHAPES['4:5'], { x: 0.25, y: 0.5 }, 0.1);
    expect(direct.data).toEqual(resizeArea(crop, 108, 135).data);
  });
});
