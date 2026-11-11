import { describe, it, expect } from 'vitest';
import { srgbToLinear, linearToSrgb, luminance, toLinear, toDisplay, rgbaToLinear, displayToRgba } from '../../src/engine/color';
import { createImage } from '../../src/engine/image';

describe('sRGB transfer', () => {
  it.each([[0, 0], [1, 1], [0.5, 0.2140411]])('srgbToLinear(%d) = %d', (s, l) => expect(srgbToLinear(s)).toBeCloseTo(l, 6));
  it('linearToSrgb inverts srgbToLinear', () => { for (const v of [0, 0.001, 0.2, 0.5, 1]) expect(linearToSrgb(srgbToLinear(v))).toBeCloseTo(v, 6); });
  it('clamps outside 0..1', () => { expect(linearToSrgb(-0.2)).toBe(0); expect(linearToSrgb(3)).toBe(1); });
  it('weights green most in luminance', () => { expect(luminance(1, 1, 1)).toBeCloseTo(1, 9); expect(luminance(0, 1, 0)).toBeCloseTo(0.7152, 9); });
});
describe('buffers', () => {
  it('createImage fills width*height*3 samples', () => { const i = createImage(4, 3, 0.25); expect(i.data.length).toBe(36); expect(i.data[35]).toBe(0.25); });
  it('toLinear then toDisplay round-trips', () => { const i = createImage(2, 2, 0.6); expect(toDisplay(toLinear(i)).data[5]).toBeCloseTo(0.6, 6); });
});
describe('RGBA conversion', () => {
  it('flattens a half-transparent red pixel onto white', () => {
    const img = rgbaToLinear(new Uint8ClampedArray([255, 0, 0, 128]), 1, 1);
    expect(img.data[0]).toBeCloseTo(1, 6);
    expect(img.data[1]).toBeCloseTo(srgbToLinear(127 / 255), 6);   // 255 - 128 = 127
  });
  it('turns a fully transparent pixel white', () => {
    expect(Array.from(rgbaToLinear(new Uint8ClampedArray([0, 0, 0, 0]), 1, 1).data)).toEqual([1, 1, 1]);
  });
  it('writes 8-bit RGBA with alpha 255', () => {
    expect(Array.from(displayToRgba(createImage(1, 1, 0.5)))).toEqual([128, 128, 128, 255]);
  });
});
