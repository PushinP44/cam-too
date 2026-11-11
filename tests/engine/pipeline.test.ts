import { describe, it, expect } from 'vitest';
import { autoBalance } from '../../src/engine/balance';
import { develop } from '../../src/engine/develop';
import { render } from '../../src/engine/render';
import { toDisplay } from '../../src/engine/color';
import { createImage } from '../../src/engine/image';
import { SHAPES } from '../../src/engine/geometry';
import { STARTER_LOOKS, findLook } from '../../src/looks';
import { syntheticPhoto, maxAbsDiff } from '../support/synthetic';

const warm = findLook('warm-portrait')!;
const mid = { x: 0.5, y: 0.5 };

describe('autoBalance', () => {
  it.each([[0.045, 0.09], [0.09, 0.09 * 2 ** 0.5], [0.18, 0.18], [0.72, 0.36]])('moves a uniform %d to %d', (a, b) =>
    expect(autoBalance(createImage(8, 8, a)).data[0]).toBeCloseTo(b, 6));
  it('keeps flat black black and flat white finite', () => {
    expect(Array.from(autoBalance(createImage(4, 4, 0)).data).every(v => v === 0)).toBe(true);
    expect(autoBalance(createImage(4, 4, 1)).data[0]).toBeCloseTo(0.5, 6);
  });
  it('pulls two exposures of one scene closer together', () => {
    const a = autoBalance(createImage(4, 4, 0.09)).data[0]!, b = autoBalance(createImage(4, 4, 0.36)).data[0]!;
    expect(b / a).toBeLessThanOrEqual(2.01);
  });
});
describe('develop', () => {
  const src = syntheticPhoto(64, 80);
  it('equals the balanced photo at strength 0 and with no look', () => {
    const want = toDisplay(autoBalance(src)).data;
    expect(maxAbsDiff(develop(src, { look: warm, strength: 0, seed: 1, balance: true }).data, want)).toBeLessThan(1e-6);
    expect(maxAbsDiff(develop(src, { look: null, strength: 1, seed: 1, balance: true }).data, want)).toBeLessThan(1e-6);
  });
  it('equals the plain photo with balance off and strength 0', () =>
    expect(maxAbsDiff(develop(src, { look: warm, strength: 0, seed: 1, balance: false }).data, toDisplay(src).data)).toBeLessThan(1e-6));
  it('is deterministic per seed and differs between seeds', () => {
    const o = (seed: number) => develop(src, { look: warm, strength: 1, seed, balance: true }).data;
    expect(maxAbsDiff(o(1), o(1))).toBe(0); expect(maxAbsDiff(o(1), o(2))).toBeGreaterThan(0);
  });
  it('blends the look in by strength and counts a strength above 1 as 1', () => {
    const at = (strength: number) => develop(src, { look: warm, strength, seed: 1, balance: true }).data;
    const none = at(0), half = at(0.5), full = at(1);
    expect(maxAbsDiff(at(2), full)).toBe(0);
    expect(maxAbsDiff(half, none.map((v, i) => (v + full[i]!) / 2))).toBeLessThan(1e-6);
  });
  it.each(STARTER_LOOKS)('stays finite and inside 0..1 on flat or tiny photos ($id)', look => {
    for (const img of [createImage(8, 8, 0), createImage(8, 8, 1), createImage(1, 1, 0.5), createImage(2, 2, 0.18)])
      for (const v of develop(img, { look, strength: 1, seed: 1, balance: true }).data) { expect(Number.isFinite(v)).toBe(true); expect(v).toBeGreaterThanOrEqual(0); expect(v).toBeLessThanOrEqual(1); }
  });
});
describe('render', () => {
  it('returns the shape size times the scale', () => { const o = render(syntheticPhoto(160, 120), { shape: SHAPES['1:1'], offset: mid, scale: 0.1, look: warm, strength: 1, seed: 1 }); expect([o.width, o.height]).toEqual([108, 108]); });
  it('works on a tiny source', () => { const o = render(syntheticPhoto(20, 15), { shape: SHAPES['4:5'], offset: mid, scale: 0.1, look: warm, strength: 1, seed: 1 }); expect([o.width, o.height]).toEqual([108, 135]); });
});
