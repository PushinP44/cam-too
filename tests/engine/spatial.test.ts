import { describe, it, expect } from 'vitest';
import { createGaussian } from '../../src/engine/prng';
import { gaussianBlurPlane, cleanChroma, applyHalation, applyVignette, applyGrain } from '../../src/engine/spatial';
import { createImage } from '../../src/engine/image';
import { findLook } from '../../src/looks';

const std = (a: ArrayLike<number>) => { let m = 0; for (let i = 0; i < a.length; i++) m += a[i]!; m /= a.length; let s = 0; for (let i = 0; i < a.length; i++) s += (a[i]! - m) ** 2; return Math.sqrt(s / a.length); };
const channel = (img: { data: Float32Array }, c: number) => Float32Array.from({ length: img.data.length / 3 }, (_, i) => img.data[i * 3 + c]!);

describe('createGaussian', () => {
  it('is deterministic for a seed', () => { const a = createGaussian(7), b = createGaussian(7); for (let i = 0; i < 5; i++) expect(a()).toBe(b()); });
  it('has mean 0 and std 1', () => { const g = createGaussian(3); const s = Float32Array.from({ length: 20000 }, () => g()); expect(Math.abs(s.reduce((x, y) => x + y) / s.length)).toBeLessThan(0.03); expect(std(s)).toBeCloseTo(1, 1); });
});
describe('gaussianBlurPlane', () => {
  it('keeps a constant plane constant', () => { const b = gaussianBlurPlane(new Float32Array(100).fill(0.7), 10, 10, 2); for (const v of b) expect(v).toBeCloseTo(0.7, 5); });
  it('preserves energy and stays symmetric', () => { const p = new Float32Array(81); p[40] = 1; const b = gaussianBlurPlane(p, 9, 9, 1.5); expect(b.reduce((x, y) => x + y)).toBeCloseTo(1, 5); expect(b[4 * 9 + 3]).toBeCloseTo(b[4 * 9 + 5]!, 6); });
  it('returns an unchanged copy for sigma 0', () => { const p = Float32Array.from([1, 2, 3, 4]); expect(Array.from(gaussianBlurPlane(p, 2, 2, 0))).toEqual([1, 2, 3, 4]); });
});
describe('cleanChroma', () => {
  it('leaves a flat colour alone', () => { const i = createImage(32, 32); for (let p = 0; p < 1024; p++) i.data.set([0.4, 0.3, 0.2], p * 3); const o = cleanChroma(i); expect(o.data[0]).toBeCloseTo(0.4, 5); expect(o.data[1]).toBeCloseTo(0.3, 5); expect(o.data[2]).toBeCloseTo(0.2, 5); });
  it('never returns negative values', () => { const g = createGaussian(1), i = createImage(32, 32); for (let k = 0; k < i.data.length; k++) i.data[k] = Math.abs(g()) * 0.2; for (const v of cleanChroma(i).data) expect(v).toBeGreaterThanOrEqual(0); });
  it('smooths colour more than brightness, and clamps what the smoothing pushes below zero', () => {
    // At 600 px the chroma sigma is 0.72, so it is blurred; the luma sigma is 0.27, under the 0.3 cut-off, so it is left alone.
    const n = 600, edge = n / 2, i = createImage(n, n);
    for (let y = 0; y < n; y++) for (let x = 0; x < n; x++) i.data.set(x < edge ? [1, 0, 0] : [0, 0, 1], (y * n + x) * 3);
    const o = cleanChroma(i).data, at = (x: number, c: number) => o[(100 * n + x) * 3 + c]!;
    let lowest = Infinity; for (let k = 0; k < o.length; k++) lowest = Math.min(lowest, o[k]!);
    expect(lowest).toBeGreaterThanOrEqual(0);
    expect(at(edge, 1)).toBe(0);                                                                                      // unclamped, green on the first blue pixel is about -0.04
    expect(0.299 * at(edge - 1, 0) + 0.587 * at(edge - 1, 1) + 0.114 * at(edge - 1, 2)).toBeCloseTo(0.299, 4);       // brightness is still a hard step
    expect(at(edge - 1, 0)).toBeLessThan(0.9); expect(at(edge, 0)).toBeGreaterThan(0.1);                              // but red has bled across the edge
  });
});
describe('applyHalation', () => {
  const look = findLook('cool-night')!;
  const spot = () => { const i = createImage(201, 201, 0.01); i.data.set([1, 1, 1], (100 * 201 + 100) * 3); return i; };
  it('does nothing when nothing is above the threshold', () => { const i = createImage(16, 16, 0.4); expect(Array.from(applyHalation(i, look).data)).toEqual(Array.from(i.data)); });
  it('spreads red-orange light around a bright spot', () => {
    const o = applyHalation(spot(), look).data, n = (100 * 201 + 101) * 3;
    expect(o[n]! - 0.01).toBeGreaterThan(o[n + 2]! - 0.01);   // red gains more than blue
    expect(o[n]! - 0.01).toBeGreaterThan(o[0]! - 0.01);       // nearer pixel gains more than the far corner
  });
  it('is a no-op at amount 0', () => { const i = spot(); expect(Array.from(applyHalation(i, { ...look, halation: { ...look.halation, amount: 0 } }).data)).toEqual(Array.from(i.data)); });
});
describe('applyVignette', () => {
  it('darkens corners more than edges and keeps the centre', () => {
    const o = applyVignette(createImage(65, 65, 0.5), 0.3).data, at = (x: number, y: number) => o[(y * 65 + x) * 3]!;
    expect(at(32, 32)).toBeCloseTo(0.5, 9); expect(at(0, 0)).toBeLessThan(at(0, 32)); expect(at(0, 32)).toBeLessThan(at(32, 32));
  });
  it('is a no-op at amount 0', () => expect(applyVignette(createImage(5, 5, 0.4), 0).data[7]).toBeCloseTo(0.4, 7));
});
describe('applyGrain', () => {
  const look = { ...findLook('warm-portrait')!, grain: { amount: 0.05, size: 0.8 } };
  it('is deterministic per seed and differs between seeds', () => {
    const i = createImage(16, 16, 0.5);
    expect(Array.from(applyGrain(i, look, 1).data)).toEqual(Array.from(applyGrain(i, look, 1).data));
    expect(Array.from(applyGrain(i, look, 1).data)).not.toEqual(Array.from(applyGrain(i, look, 2).data));
  });
  it('has about the requested strength on mid grey and keeps the mean', () => {
    const r = channel(applyGrain(createImage(128, 128, 0.5), look, 1), 0);
    expect(std(r) / 0.05).toBeGreaterThan(0.9); expect(std(r) / 0.05).toBeLessThan(1.1); expect(Math.abs(r.reduce((x, y) => x + y) / r.length - 0.5)).toBeLessThan(0.005);
  });
  // The blur only runs when size * S / 1080 >= 0.3 (S >= 405 at size 0.8); 420 px clears that, so the blur and the post-blur normalisation both run.
  // Size 3 smooths strongly, so normalising by the pre-blur deviation instead would show here as weak grain.
  it.each([0.8, 3])('keeps the requested strength and mean once the blur is active (size %s)', size => {
    const img = applyGrain(createImage(420, 420, 0.5), { ...look, grain: { amount: 0.05, size } }, 1);
    for (const c of [0, 1, 2]) {
      const r = channel(img, c);
      expect(std(r) / 0.05).toBeGreaterThan(0.9); expect(std(r) / 0.05).toBeLessThan(1.1); expect(Math.abs(r.reduce((x, y) => x + y) / r.length - 0.5)).toBeLessThan(0.005);
    }
  });
  it('survives a 1x1 image', () => { for (const v of applyGrain(createImage(1, 1, 0.5), look, 1).data) expect(Number.isFinite(v)).toBe(true); });
  it('is a no-op at amount 0', () => expect(Array.from(applyGrain(createImage(4, 4, 0.4), { ...look, grain: { amount: 0, size: 0.8 } }, 1).data)).toEqual(Array.from(createImage(4, 4, 0.4).data)));
});
