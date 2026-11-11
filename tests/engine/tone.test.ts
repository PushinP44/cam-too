import { describe, it, expect } from 'vitest';
import { filmCurve, applyTone } from '../../src/engine/tone';
import { findLook } from '../../src/looks';
import { createImage } from '../../src/engine/image';

const warm = findLook('warm-portrait')!, mono = findLook('classic-mono')!;
const px = (r: number, g: number, b: number) => { const i = createImage(1, 1); i.data.set([r, g, b]); return i; };

describe('filmCurve', () => {
  it('maps mid grey to the middle of the range', () => expect(filmCurve(0.18, 0.2, 0, 0, 1)).toBeCloseTo(0.5, 9));
  it('moves with the pivot', () => expect(filmCurve(0.18 * 2 ** 0.5, 0.2, 0.5, 0, 1)).toBeCloseTo(0.5, 9));
  it('rises with exposure', () => {
    let prev = -1;
    for (const x of [0, 0.001, 0.01, 0.1, 0.18, 0.5, 1, 4]) { const y = filmCurve(x, 0.2, -0.5, 0.015, 0.99); expect(y).toBeGreaterThan(prev); prev = y; }
  });
  it('stays finite and inside black..white at the extremes', () => {
    for (const x of [0, 1e-12, 1e9]) { const y = filmCurve(x, 0.2, 0, 0.015, 0.99); expect(Number.isFinite(y)).toBe(true); expect(y).toBeGreaterThanOrEqual(0.015 - 1e-9); expect(y).toBeLessThanOrEqual(0.99 + 1e-9); }
  });
});
describe('applyTone', () => {
  it('gives the warm look a warm cast on grey', () => { const o = applyTone(px(.18, .18, .18), warm).data; expect(o[0]).toBeGreaterThan(o[2]); });
  it('returns equal channels for a mono look', () => { const o = applyTone(px(1, 0.2, 0.1), mono).data; expect(o[0]).toBeCloseTo(o[1], 9); expect(o[1]).toBeCloseTo(o[2], 9); });
  it('removes colour at saturation 0 with neutral pivots and tints', () => {
    const flat = { ...warm, tone: { ...warm.tone, pivot: [-0.5, -0.5, -0.5] as [number, number, number] }, colour: { saturation: 0, shadowTint: [0, 0, 0] as [number, number, number], highlightTint: [0, 0, 0] as [number, number, number] } };
    const o = applyTone(px(0.5, 0.2, 0.1), flat).data; expect(o[0]).toBeCloseTo(o[2], 9);
  });
  it('raises the output with ev', () => {
    const up = { ...warm, tone: { ...warm.tone, ev: 1 } };
    expect(applyTone(px(.18, .18, .18), up).data[1]).toBeGreaterThan(applyTone(px(.18, .18, .18), warm).data[1]);
  });
  it('does not modify its input', () => { const i = px(.3, .2, .1); applyTone(i, warm); expect(Array.from(i.data)).toEqual([expect.closeTo(.3, 6), expect.closeTo(.2, 6), expect.closeTo(.1, 6)]); });
});
