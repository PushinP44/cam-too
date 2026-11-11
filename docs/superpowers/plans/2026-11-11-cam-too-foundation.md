# cam-too Foundation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A tested TypeScript engine that turns one photo into a film-look, Instagram-shaped image, plus a minimal web page that does it end to end for one photo, in the browser.

**Architecture:** Pure functions on a float RGB buffer (`ImageF`) with no DOM, so all of the engine is testable in Node. Browser code is a thin adapter (decode, encode) and a Preact page. Looks are validated JSON files. Everything runs on the CPU at output size (1080x1350 by default), not at camera size.

**Tech Stack:** TypeScript (strict), Vite, Preact, Vitest, npm, Node >= 22.12. Use the latest stable version of each at install time and commit `package-lock.json`.

**Spec:** `docs/superpowers/specs/2026-11-11-cam-too-design.md`

**Scope: plan 1 of 5.** In: project setup, image and colour maths, the look file format with three starter films, the engine (tone, colour, halation, grain, vignette, crop, resize, exposure balance), and a one-photo page (add photo, pick film, set strength, hold to compare, save 4:5 JPEG). Out, each its own plan once this one works: (2) sets of up to 20 photos, strip, drag-to-crop, save/share, memory handling; (3) the S3000 camera look, EXIF model check, automatic white balance, the remaining starter films, date stamp; (4) make your own film, `.cube` import/export; (5) installable and offline, HEIC fallback, the no-photo-in-network test, deployment.

**Deliberate change from the spec's pipeline order:** crop and resize come first, so every later step works on at most about 1.4 MP. Look parameters that are lengths are fractions of the short side, so results do not depend on the size. Grain is still applied at output size.

**Commit steps** assume the author has agreed to commits on the working branch. Ask once at the start of execution.

## Global Constraints

- Licence: MIT (already in the repo). Everything bundled must be compatible, and its source and licence recorded.
- No bundled third-party LUT packs in v1.
- Runtime: browser only, TypeScript, static hosting, no backend. Latest two versions of iOS Safari and Android Chrome, plus desktop Chrome, Safari and Firefox.
- Instagram shape: default 4:5 at 1080x1350, with 1:1 and 9:16 also available.
- Output: sRGB JPEG, high quality. Grain and sharpening are tuned at the output size.
- Any photo data leaving the device is a failure. No network call may carry photo data.
- Cloning and running should take minutes with few dependencies.

## Review Focus

Input classes the spec implies that no feature task exercises. Each has a test in the task named.

1. Flat black, flat white, or a 1x1 or 2x2 photo: no NaN, no crash, output inside 0..1 (Tasks 4 and 6).
2. Film strength 0: the result must equal the photo without film (Task 6).
3. A source smaller than the output shape, such as 20x15 into 1080x1350: upscaled to the exact size (Task 5).
4. PNG or WebP with transparent pixels: flattened onto white, not black (Task 1).
5. A 48 MP phone photo: never held as full-size floats; decode shrinks to a working size first (Task 7).

## File map

| File | Responsibility |
|---|---|
| `src/engine/image.ts` | `ImageF` buffer type |
| `src/engine/color.ts` | sRGB maths, 8-bit RGBA conversion |
| `src/engine/look.ts` | `Look` type, `parseLook` validator |
| `src/looks/*.json`, `src/looks/index.ts` | starter looks, `STARTER_LOOKS`, `findLook` |
| `src/engine/tone.ts` | film curve, colour response |
| `src/engine/prng.ts`, `src/engine/spatial.ts` | seeded noise, blur, chroma clean, halation, vignette, grain |
| `src/engine/geometry.ts` | shapes, crop, resize |
| `src/engine/balance.ts`, `develop.ts`, `render.ts` | exposure balance, look pipeline, crop + develop |
| `src/web/*` | decode, encode, sizes, the page |
| `tests/support/synthetic.ts` | test helpers; `tests/golden/*.json` expected looks |

---

### Task 1: Project setup, image buffer, colour maths

**Files:**
- Create: `package.json`, `tsconfig.json`, `vite.config.ts`, `index.html`, `.gitignore`, `README.md`, `.github/workflows/ci.yml`, `src/web/main.tsx` (placeholder that renders "cam-too"), `src/engine/image.ts`, `src/engine/color.ts`
- Test: `tests/engine/color.test.ts`

**Interfaces:**
- Produces:
  - `interface ImageF { width: number; height: number; data: Float32Array }`: RGB interleaved, `data.length === width*height*3`. Engine images are **linear-light** unless a function says "display" (sRGB-encoded, 0..1).
  - `createImage(width: number, height: number, fill = 0): ImageF`, `cloneImage(img: ImageF): ImageF`
  - `LUMA: readonly [number, number, number]` = `[0.2126, 0.7152, 0.0722]`
  - `srgbToLinear(v: number): number`, `linearToSrgb(v: number): number` (clamps input to 0..1 first)
  - `luminance(r: number, g: number, b: number): number`
  - `toLinear(display: ImageF): ImageF`, `toDisplay(linear: ImageF): ImageF` (clamps to 0..1)
  - `rgbaToLinear(rgba: Uint8ClampedArray, width: number, height: number): ImageF`: straight alpha flattened onto white, then to linear.
  - `displayToRgba(display: ImageF): Uint8ClampedArray`: alpha 255.

- [ ] **Step 1: Set up the project.** `package.json` scripts: `dev` = `vite`, `build` = `tsc --noEmit && vite build`, `test` = `vitest run`, `bench` = `vitest bench --run`, `typecheck` = `tsc --noEmit`, `check` = `npm run typecheck && npm test`. `engines.node` = `^22.12.0 || ^24.0.0 || >=26.0.0` (vitest's supported range). Dependency: `preact`. Dev dependencies: `vite`, `@preact/preset-vite`, `typescript`, `vitest`. `tsconfig.json`: strict, ES2022, `moduleResolution: bundler`, `jsx: react-jsx` with `jsxImportSource: preact` (follow the preset's docs if they differ), `resolveJsonModule: true`, `types: ["vite/client"]` (for `import.meta.glob`), `lib` ES2022 + DOM, `include` `src` and `tests`. `vite.config.ts` uses the preact preset and `test.include = ['tests/**/*.test.ts']`. CI runs on push and pull request: checkout, Node 22, `npm ci`, `npm run check`, `npm run build`. `README.md`: three lines on what it is, a quick start of exactly `npm install` then `npm run dev`, a link to the spec, MIT. Run `npm install`.
- [ ] **Step 2: Write the failing test** `tests/engine/color.test.ts`:

```ts
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
```

- [ ] **Step 3: Run** `npm test -- tests/engine/color.test.ts`. Expected: FAIL, modules not found.
- [ ] **Step 4: Implement** `src/engine/image.ts` and `src/engine/color.ts` with the signatures above. `srgbToLinear` is the standard piecewise sRGB function.
- [ ] **Step 5: Run** `npm run check` and `npm run build`. Expected: both pass. Commit: `feat: project setup, image buffer and colour maths`.

---

### Task 2: Look format and starter looks

**Files:**
- Create: `src/engine/look.ts`, `src/looks/warm-portrait.json`, `src/looks/cool-night.json`, `src/looks/classic-mono.json`, `src/looks/index.ts`
- Test: `tests/engine/look.test.ts`

**Interfaces:**
- Consumes: nothing.
- Produces:
  - `type Vec3 = [number, number, number]`
  - `interface Look { formatVersion: 1; id: string; name: string; kind: 'camera' | 'film' | 'user'; credits: string; tone: { ev: number; slope: number; pivot: Vec3; black: number; white: number; mono: Vec3 | null }; colour: { saturation: number; shadowTint: Vec3; highlightTint: Vec3 }; halation: { threshold: number; tint: Vec3; amount: number }; grain: { amount: number; size: number }; vignette: number }`
  - `class LookError extends Error { path: string }`
  - `parseLook(json: unknown): Look`: throws `LookError` whose `path` is the dotted field path (`grain.amount`; a top-level typo is reported by its own name).
  - `STARTER_LOOKS: Look[]` (sorted by id), `findLook(id: string): Look | undefined`

Validation rules: `formatVersion` is 1; `id` matches `^[a-z0-9]+(-[a-z0-9]+)*$`; `name` and `credits` non-empty strings; `kind` is one of the three; every number finite and in range: `ev` -3..3, `slope` 0.05..0.5, `pivot` each -2..2, `black` 0..0.2, `white` 0.8..1 and greater than `black`, `mono` null or three numbers 0..1, `saturation` 0..2, tints each -0.1..0.1 (`halation.tint` each 0..1), `halation.threshold` 0..2, `halation.amount` 0..2, `grain.amount` 0..0.2, `grain.size` 0.3..3, `vignette` 0..0.6. Any unknown field is rejected. `grain.size` is the blur sigma in pixels at a 1080 px short side.

The three looks (all `kind: "film"`, credits `"cam-too contributors, MIT"`, `tone.ev` 0, `tone.white` 0.99, `tone.black` 0.015):

| id (name) | slope | pivot | mono | saturation | shadowTint | highlightTint | halation threshold / tint / amount | grain amount / size | vignette |
|---|---|---|---|---|---|---|---|---|---|
| `warm-portrait` (Warm Portrait) | 0.20 | -0.60, -0.50, -0.37 | null | 0.95 | 0.010, 0.008, 0.005 | 0.010, 0.004, -0.008 | 0.75 / 1, 0.40, 0.15 / 0.25 | 0.012 / 0.6 | 0.18 |
| `cool-night` (Cool Night) | 0.21 | -0.25, -0.40, -0.70 | null | 1.05 | -0.010, 0.008, 0.025 | 0.012, 0.002, -0.010 | 0.50 / 1, 0.22, 0.06 / 0.95 | 0.026 / 0.75 | 0.25 |
| `classic-mono` (Classic Mono) | 0.23 | -0.45 x3 | 0.35, 0.50, 0.15 | 0 | 0, 0, 0 | 0, 0, 0 | 0.75 / 1, 1, 1 / 0.12 | 0.045 / 0.8 | 0.30 |

- [ ] **Step 1: Write the failing test** `tests/engine/look.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { parseLook, LookError } from '../../src/engine/look';
import { STARTER_LOOKS, findLook } from '../../src/looks';
import warm from '../../src/looks/warm-portrait.json';

const files = import.meta.glob('../../src/looks/*.json', { eager: true, import: 'default' });

it('accepts every shipped look, and each id matches its file name', () => {
  for (const [path, json] of Object.entries(files)) expect(parseLook(json).id).toBe(path.split('/').pop()!.replace('.json', ''));
});
it('ships three looks with unique ids', () => {
  expect(STARTER_LOOKS).toHaveLength(3);
  expect(new Set(STARTER_LOOKS.map(l => l.id)).size).toBe(3);
  expect(findLook('classic-mono')?.tone.mono).toEqual([0.35, 0.5, 0.15]);
  expect(findLook('nope')).toBeUndefined();
});
const cases: [string, (l: any) => void][] = [
  ['id', l => { delete l.id; }],
  ['kind', l => { l.kind = 'banana'; }],
  ['formatVersion', l => { l.formatVersion = 2; }],
  ['grain.amount', l => { l.grain.amount = -1; }],
  ['tone.pivot', l => { l.tone.pivot = [0, 0]; }],
  ['tone.black', l => { l.tone.black = 0.99; }],
  ['halation.tint', l => { l.halation.tint = [2, 0, 0]; }],
  ['vigentte', l => { l.vigentte = 0.1; }],
];
it.each(cases)('rejects a bad %s and names the field', (path, mutate) => {
  const l = structuredClone(warm); mutate(l);
  try { parseLook(l); throw new Error('no error'); }
  catch (e) { expect(e).toBeInstanceOf(LookError); expect((e as LookError).path).toBe(path); }
});
```

- [ ] **Step 2: Run** `npm test -- tests/engine/look.test.ts`. Expected: FAIL.
- [ ] **Step 3: Implement** `look.ts` to the signatures and rules above, write the three JSON files from the table, and `src/looks/index.ts` (`import.meta.glob('./*.json', { eager: true, import: 'default' })`, parse each with `parseLook`, sort by id).
- [ ] **Step 4: Run** `npm run check`. Expected: PASS. Commit: `feat: look format and three starter looks`.

---

### Task 3: Tone and colour

**Files:**
- Create: `src/engine/tone.ts`
- Test: `tests/engine/tone.test.ts`

**Interfaces:**
- Consumes: `ImageF`, `createImage`, `LUMA`, `Look`, `findLook`.
- Produces:
  - `filmCurve(x: number, slope: number, pivot: number, black: number, white: number): number` = `black + (white - black) / (1 + exp(-k * (log2(max(x, 1e-6) / 0.18) - pivot)))` with `k = 4 * slope / (white - black)`.
  - `applyTone(linear: ImageF, look: Look): ImageF`: linear in, **display** out, new image. Steps: multiply by `2^ev`; apply `filmCurve` per channel with that channel's pivot, or once on `dot(mono, rgb)` copied to all three channels when `mono` is set; `L` = `LUMA`-weighted luma of the curve output; `out = L + saturation * (out - L)`; `out += (1 - L) * shadowTint + L * highlightTint`. No clamping.

- [ ] **Step 1: Write the failing test** `tests/engine/tone.test.ts`:

```ts
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
```

- [ ] **Step 2: Run** `npm test -- tests/engine/tone.test.ts`. Expected: FAIL.
- [ ] **Step 3: Implement** `filmCurve` and `applyTone` to the formulas above.
- [ ] **Step 4: Run** `npm run check`. Expected: PASS. Commit: `feat: film curve and colour response`.

---

### Task 4: Spatial effects

**Files:**
- Create: `src/engine/prng.ts`, `src/engine/spatial.ts`
- Test: `tests/engine/spatial.test.ts`

**Interfaces:**
- Consumes: `ImageF`, `createImage`, `cloneImage`, `LUMA`, `Look`, `findLook`. Below, `S = min(width, height)`.
- Produces:
  - `createGaussian(seed: number): () => number`: deterministic standard-normal samples (mulberry32 plus Box-Muller).
  - `gaussianBlurPlane(plane: Float32Array, width: number, height: number, sigma: number): Float32Array`: separable, edges reflected, kernel radius `round(3*sigma)`; `sigma < 0.3` returns an unchanged copy.
  - `cleanChroma(linear: ImageF): ImageF`: `Y = 0.299R + 0.587G + 0.114B`, `cb = B - Y`, `cr = R - Y`; blur `cb` and `cr` with sigma `0.0012*S` and `Y` with `0.00045*S`; rebuild `R = Y + cr`, `B = Y + cb`, `G = (Y - 0.299R - 0.114B) / 0.587`; clamp at 0.
  - `applyHalation(linear: ImageF, look: Look): ImageF`: `hot = max(luma - threshold, 0)` per pixel; `glow = 0.6*blur(hot, 0.0045*S) + 0.4*blur(hot, 0.0135*S)`; `out = in + glow * tint * amount` per channel.
  - `applyVignette(display: ImageF, amount: number): ImageF`: `factor = 1 - amount * r2^1.2`, `r2 = (u^2 + v^2) / 2`, `u = 2*(x+0.5)/width - 1`, `v` likewise with height; multiplies all channels.
  - `applyGrain(display: ImageF, look: Look, seed: number): ImageF`: per channel `g = 0.8*mono + 0.2*channelNoise` from `createGaussian(seed)`, blurred with sigma `look.grain.size * S / 1080`, divided by its overall standard deviation (skip the division when std < 1e-9); `out += g * look.grain.amount * (0.4 + 2.4*L*(1-L))` where `L` is the display luma clamped to 0..1.

- [ ] **Step 1: Write the failing test** `tests/engine/spatial.test.ts`:

```ts
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
  it('is a no-op at amount 0', () => expect(applyVignette(createImage(5, 5, 0.4), 0).data[7]).toBeCloseTo(0.4, 9));
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
  it('survives a 1x1 image', () => { for (const v of applyGrain(createImage(1, 1, 0.5), look, 1).data) expect(Number.isFinite(v)).toBe(true); });
  it('is a no-op at amount 0', () => expect(Array.from(applyGrain(createImage(4, 4, 0.4), { ...look, grain: { amount: 0, size: 0.8 } }, 1).data)).toEqual(Array.from(createImage(4, 4, 0.4).data)));
});
```

- [ ] **Step 2: Run** `npm test -- tests/engine/spatial.test.ts`. Expected: FAIL.
- [ ] **Step 3: Implement** `prng.ts` and `spatial.ts` to the definitions above. Every function returns a new image and leaves its input untouched.
- [ ] **Step 4: Run** `npm run check`. Expected: PASS. Commit: `feat: blur, halation, vignette and seeded grain`.

---

### Task 5: Geometry

**Files:**
- Create: `src/engine/geometry.ts`
- Test: `tests/engine/geometry.test.ts`

**Interfaces:**
- Consumes: `ImageF`, `createImage`.
- Produces:
  - `type ShapeId = '4:5' | '1:1' | '9:16'`, `interface Shape { id: ShapeId; width: number; height: number }`, `SHAPES: Record<ShapeId, Shape>` = 1080x1350, 1080x1080, 1080x1920.
  - `interface CropRect { x: number; y: number; width: number; height: number }` (integer source pixels)
  - `cropRect(srcWidth: number, srcHeight: number, shape: Shape, offset: { x: number; y: number }): CropRect`: the largest rectangle of the shape's ratio that fits; `offset` 0..1 (clamped) picks where in the spare room it sits, 0.5 centred; size by `round`, position by `round(offset * spare)`.
  - `resizeArea(img: ImageF, width: number, height: number): ImageF`: area average when shrinking, bilinear when growing, exact output size.
  - `cropAndResize(img: ImageF, shape: Shape, offset: { x: number; y: number }, scale = 1): ImageF`: output `round(shape.width*scale)` by `round(shape.height*scale)`.

- [ ] **Step 1: Write the failing test** `tests/engine/geometry.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { SHAPES, cropRect, resizeArea, cropAndResize } from '../../src/engine/geometry';
import { createImage } from '../../src/engine/image';

const gradient = (w: number, h: number) => { const i = createImage(w, h); for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) i.data.fill(x / (w - 1), (y * w + x) * 3, (y * w + x) * 3 + 3); return i; };
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
});
describe('cropAndResize', () => {
  it('produces the shape size times the scale', () => {
    const a = cropAndResize(createImage(40, 30, 0.5), SHAPES['4:5'], mid, 0.1); expect([a.width, a.height]).toEqual([108, 135]);
  });
  it('upscales a source smaller than the shape to the exact size', () => {
    const o = cropAndResize(gradient(20, 15), SHAPES['4:5'], mid); expect([o.width, o.height]).toEqual([1080, 1350]);
    for (const v of o.data) expect(Number.isFinite(v)).toBe(true);
  });
  it('lets the offset choose what is kept', () => {
    const g = gradient(40, 30);
    expect(mean(cropAndResize(g, SHAPES['4:5'], { x: 0, y: 0.5 }, 0.05).data)).toBeLessThan(mean(cropAndResize(g, SHAPES['4:5'], { x: 1, y: 0.5 }, 0.05).data));
  });
});
```

- [ ] **Step 2: Run** `npm test -- tests/engine/geometry.test.ts`. Expected: FAIL.
- [ ] **Step 3: Implement** `geometry.ts` to the signatures above; `resizeArea` as two separable passes with fractional pixel coverage when shrinking.
- [ ] **Step 4: Run** `npm run check`. Expected: PASS. Commit: `feat: shapes, crop and resize`.

---

### Task 6: Balance, develop, render, golden tests

**Files:**
- Create: `src/engine/balance.ts`, `src/engine/develop.ts`, `src/engine/render.ts`, `tests/support/synthetic.ts`, `tests/golden/warm-portrait.json`, `tests/golden/cool-night.json`, `tests/golden/classic-mono.json`
- Test: `tests/engine/pipeline.test.ts`, `tests/golden.test.ts`, `tests/engine/render.bench.ts`

**Interfaces:**
- Consumes: everything from Tasks 1 to 5.
- Produces:
  - `autoBalance(linear: ImageF): ImageF`: exposure only. `key` = geometric mean of per-pixel luminance (each floored at 1e-4); `stops = clamp(0.5 * log2(0.18 / key), -1, 1)`; multiply every sample by `2^stops`. (White balance comes in plan 3.)
  - `interface DevelopOptions { look: Look | null; strength: number; seed: number; balance: boolean }`
  - `develop(linear: ImageF, opts: DevelopOptions): ImageF`: returns **display**, clamped to 0..1. Order: `lin = balance ? autoBalance(src) : src`; `base = toDisplay(lin)`; with no look or `strength <= 0` return `base`; otherwise `film` = `applyVignette(applyGrain(applyTone(applyHalation(cleanChroma(lin), look), look), look, seed), look.vignette)` clamped to 0..1; result `base + strength * (film - base)`, with `strength` clamped to 1.
  - `interface RenderOptions { shape: Shape; offset: { x: number; y: number }; scale: number; look: Look | null; strength: number; seed: number }`
  - `render(work: ImageF, opts: RenderOptions): ImageF`: `cropAndResize(work, shape, offset, scale)` then `develop(…, { look, strength, seed, balance: true })`. Returns display.
  - Test helpers in `tests/support/synthetic.ts`: `syntheticPhoto(width: number, height: number): ImageF` (linear; with `u = x / max(width-1, 1)`, `v = y / max(height-1, 1)`: channel `c` = `(0.5 + 0.5*sin(2π(u + c/3))) * (0.05 + 0.95*v)`), `maxAbsDiff(a: ArrayLike<number>, b: ArrayLike<number>): number`, `gridMeans(img: ImageF, cols: number, rows: number): number[]` (mean per cell and channel, rounded to 3 decimals).

- [ ] **Step 1: Write the failing tests** `tests/engine/pipeline.test.ts`:

```ts
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
  it.each(STARTER_LOOKS)('stays finite and inside 0..1 on flat or tiny photos ($id)', look => {
    for (const img of [createImage(8, 8, 0), createImage(8, 8, 1), createImage(1, 1, 0.5), createImage(2, 2, 0.18)])
      for (const v of develop(img, { look, strength: 1, seed: 1, balance: true }).data) { expect(Number.isFinite(v)).toBe(true); expect(v).toBeGreaterThanOrEqual(0); expect(v).toBeLessThanOrEqual(1); }
  });
});
describe('render', () => {
  it('returns the shape size times the scale', () => { const o = render(syntheticPhoto(160, 120), { shape: SHAPES['1:1'], offset: mid, scale: 0.1, look: warm, strength: 1, seed: 1 }); expect([o.width, o.height]).toEqual([108, 108]); });
  it('works on a tiny source', () => { const o = render(syntheticPhoto(20, 15), { shape: SHAPES['4:5'], offset: mid, scale: 0.1, look: warm, strength: 1, seed: 1 }); expect([o.width, o.height]).toEqual([108, 135]); });
});
```

  and `tests/golden.test.ts`: for each of `STARTER_LOOKS`, `render(syntheticPhoto(160, 200), { shape: SHAPES['4:5'], offset: {x: 0.5, y: 0.5}, scale: 0.1, look, strength: 1, seed: 1 })`, take `gridMeans(out, 6, 8)`, and expect `maxAbsDiff` against `tests/golden/<id>.json` below 0.005. When `process.env.UPDATE_GOLDEN` is set, write the file instead of comparing. `tests/engine/render.bench.ts`: one `bench` that renders a `syntheticPhoto(2048, 1536)` into `SHAPES['4:5']` at scale 1 with `warm-portrait`.

- [ ] **Step 2: Run** `npm test -- tests/engine/pipeline.test.ts`. Expected: FAIL.
- [ ] **Step 3: Implement** `balance.ts`, `develop.ts`, `render.ts` and the test helpers to the definitions above.
- [ ] **Step 4: Run** `npm test -- tests/engine/pipeline.test.ts`. Expected: PASS.
- [ ] **Step 5: Create the golden files** with `UPDATE_GOLDEN=1 npm test -- tests/golden.test.ts`, then run `npm test`. Expected: PASS, three files in `tests/golden/`. Run `npm run bench` and note the milliseconds in the commit message.
- [ ] **Step 6: Commit:** `feat: exposure balance, develop pipeline, render and golden tests`.

---

### Task 7: Browser adapter and the one-photo page

**Files:**
- Create: `src/web/sizes.ts`, `src/web/decode.ts`, `src/web/encode.ts`, `src/web/app.tsx`, `src/web/styles.css`
- Modify: `src/web/main.tsx`, `index.html`
- Test: `tests/web/sizes.test.ts`

**Interfaces:**
- Consumes: `ImageF`, `rgbaToLinear`, `displayToRgba`, `render`, `RenderOptions`, `SHAPES`, `STARTER_LOOKS`, `Look`.
- Produces:
  - `WORKING_MAX_LONG_EDGE = 2048`
  - `workingSize(width: number, height: number, maxLongEdge: number): { width: number; height: number }`: keeps the ratio, never enlarges, rounds each side.
  - `decodeFile(file: Blob, maxLongEdge = WORKING_MAX_LONG_EDGE): Promise<ImageF>`: linear. `createImageBitmap(file, { imageOrientation: 'from-image' })`, draw into a canvas of `workingSize(...)` using a 2D context with `colorSpace: 'srgb'` and `willReadFrequently: true`, call `bitmap.close()` straight after drawing, read pixels, `rgbaToLinear`. Never builds a full-size float image.
  - `encodeJpeg(display: ImageF, quality = 0.92): Promise<Blob>`: canvas `putImageData(displayToRgba(...))`, `toBlob('image/jpeg', quality)`; rejects if the blob is null.
  - `App(): JSX.Element`.

The page (layout A, mobile first, dark): header "cam-too". **Start:** an "Add a photo" button over a hidden file input (`accept="image/jpeg,image/png,image/webp"`) and the line "It never leaves this device." A decode failure shows "That photo could not be opened. Try a JPEG or PNG." **Edit:** a preview of the 4:5 render at `scale: 0.4` (centred crop, seed 1, balance on); a Film row with "None" and one button per `STARTER_LOOKS` (the chosen one highlighted); a "Film strength" slider 0..100, default 70; holding the preview (pointer down) shows the same crop with no film until release; re-render the preview 60 ms after the last change. **Save:** renders at `scale: 1`, encodes, and downloads `cam-too-<look id or original>.jpg` through an object URL; the button is disabled and reads "Saving…" while it works.

- [ ] **Step 1: Write the failing test** `tests/web/sizes.test.ts`:

```ts
import { it, expect } from 'vitest';
import { workingSize, WORKING_MAX_LONG_EDGE } from '../../src/web/sizes';

it.each([
  [6000, 4000, { width: 2048, height: 1365 }],
  [8064, 6048, { width: 2048, height: 1536 }],   // a 48 MP phone photo
  [3000, 4000, { width: 1536, height: 2048 }],
  [800, 600, { width: 800, height: 600 }],       // never enlarged
])('workingSize(%d, %d)', (w, h, want) => expect(workingSize(w, h, WORKING_MAX_LONG_EDGE)).toEqual(want));
```

- [ ] **Step 2: Run** `npm test -- tests/web/sizes.test.ts`. Expected: FAIL.
- [ ] **Step 3: Implement** `sizes.ts`, then `decode.ts`, `encode.ts`, `app.tsx`, `styles.css` and wire `main.tsx` and `index.html`, to the contracts above.
- [ ] **Step 4: Run** `npm run check` and `npm run build`. Expected: both pass.
- [ ] **Step 5: Check by hand.** `npm run dev`, open the printed URL in desktop Chrome, and confirm each line:
  1. A camera JPEG opens and the preview appears within about a second as a 4:5 crop.
  2. Each film changes the look; strength 0 matches "None"; strength 100 is strongest.
  3. Holding the preview shows the plain photo, and releasing brings the film back.
  4. Save downloads a JPEG of exactly 1080x1350 (`sips -g pixelWidth -g pixelHeight <file>`), upright, within a few seconds.
  5. A portrait phone photo (EXIF rotated) opens upright.
  6. A PNG with a transparent area shows white there.
  7. A 12 MP or larger photo opens without freezing the tab.
  8. The three films resemble the throwaway test: Warm Portrait clean and warm, Cool Night cool with red glow round bright lights, Classic Mono grainy black and white. If tuning a look changes it, regenerate with `UPDATE_GOLDEN=1 npm test -- tests/golden.test.ts` and commit the new numbers.
  9. On an iPhone, run `npm run dev -- --host`, open the network URL in Safari on the same Wi-Fi, and repeat 1, 2, 4 and 5. With "None" selected, an iPhone (Display P3) photo looks the same as it does in Photos.
- [ ] **Step 6: Commit:** `feat: one-photo page with decode, preview and save`. Then write plan 2 (sets) with the author.
