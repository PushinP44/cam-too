export type Vec3 = [number, number, number];

/**
 * A look is a small set of numbers describing a camera or film rendering.
 * It is stored as JSON and validated by `parseLook`.
 */
export interface Look {
  formatVersion: 1;
  id: string;
  name: string;
  kind: 'camera' | 'film' | 'user';
  credits: string;
  tone: {
    /** Exposure shift in stops, applied before the curve. */
    ev: number;
    /** Steepness of the film curve; shared by all channels. */
    slope: number;
    /** Per-channel curve pivot, in stops relative to mid-grey. */
    pivot: Vec3;
    /** Output level the curve settles to in the deep shadows. */
    black: number;
    /** Output level the curve settles to in the highlights. */
    white: number;
    /** Channel weights for a monochrome look, or null to keep colour. */
    mono: Vec3 | null;
  };
  colour: {
    /** 1 leaves colour as is, 0 removes it. */
    saturation: number;
    /** Added to the shadows, per channel. */
    shadowTint: Vec3;
    /** Added to the highlights, per channel. */
    highlightTint: Vec3;
  };
  halation: { threshold: number; tint: Vec3; amount: number };
  /** `size` is the blur sigma in pixels at a 1080 px short side. */
  grain: { amount: number; size: number };
  vignette: number;
}

/** Thrown by `parseLook`; `path` is the dotted path of the offending field. */
export class LookError extends Error {
  readonly path: string;

  constructor(path: string, message: string) {
    super(path ? `${path}: ${message}` : message);
    this.name = 'LookError';
    this.path = path;
  }
}

const KINDS: readonly string[] = ['camera', 'film', 'user'];
const ID_PATTERN = /^[a-z0-9]+(-[a-z0-9]+)*$/;

function fail(path: string, value: unknown, expected: string): LookError {
  return new LookError(path, value === undefined ? 'is required' : `must be ${expected}`);
}

function child(path: string, key: string): string {
  return path ? `${path}.${key}` : key;
}

/** Checks `value` is a plain object with no keys beyond `keys`. */
function object(value: unknown, path: string, keys: readonly string[]): Record<string, unknown> {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) throw fail(path, value, 'an object');
  for (const key of Object.keys(value)) {
    if (!keys.includes(key)) throw new LookError(child(path, key), 'is not a known field');
  }
  return value as Record<string, unknown>;
}

function text(value: unknown, path: string): string {
  if (typeof value !== 'string' || value.trim() === '') throw fail(path, value, 'a non-empty string');
  return value;
}

function num(value: unknown, path: string, min: number, max: number): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) throw fail(path, value, 'a finite number');
  if (value < min || value > max) throw new LookError(path, `must be between ${min} and ${max}`);
  return value;
}

function vec3(value: unknown, path: string, min: number, max: number): Vec3 {
  if (!Array.isArray(value) || value.length !== 3) throw fail(path, value, 'an array of three numbers');
  return [num(value[0], path, min, max), num(value[1], path, min, max), num(value[2], path, min, max)];
}

/** Validates untrusted JSON and returns a new `Look`. Throws `LookError` naming the first bad field. */
export function parseLook(json: unknown): Look {
  const top = object(json, '', [
    'formatVersion', 'id', 'name', 'kind', 'credits', 'tone', 'colour', 'halation', 'grain', 'vignette',
  ]);
  if (top.formatVersion !== 1) throw fail('formatVersion', top.formatVersion, '1');

  const id = text(top.id, 'id');
  if (!ID_PATTERN.test(id)) throw new LookError('id', 'must be lower-case words joined by hyphens, like "warm-portrait"');
  const name = text(top.name, 'name');
  if (typeof top.kind !== 'string' || !KINDS.includes(top.kind)) throw fail('kind', top.kind, 'camera, film or user');
  const kind = top.kind as Look['kind'];
  const credits = text(top.credits, 'credits');

  const t = object(top.tone, 'tone', ['ev', 'slope', 'pivot', 'black', 'white', 'mono']);
  const black = num(t.black, 'tone.black', 0, 0.2);
  const white = num(t.white, 'tone.white', 0.8, 1);
  // Implied by the two ranges today; kept so the invariant survives a range edit.
  if (white <= black) throw new LookError('tone.white', 'must be greater than tone.black');
  const tone: Look['tone'] = {
    ev: num(t.ev, 'tone.ev', -3, 3),
    slope: num(t.slope, 'tone.slope', 0.05, 0.5),
    pivot: vec3(t.pivot, 'tone.pivot', -2, 2),
    black,
    white,
    mono: t.mono === null ? null : vec3(t.mono, 'tone.mono', 0, 1),
  };

  const c = object(top.colour, 'colour', ['saturation', 'shadowTint', 'highlightTint']);
  const colour: Look['colour'] = {
    saturation: num(c.saturation, 'colour.saturation', 0, 2),
    shadowTint: vec3(c.shadowTint, 'colour.shadowTint', -0.1, 0.1),
    highlightTint: vec3(c.highlightTint, 'colour.highlightTint', -0.1, 0.1),
  };

  const h = object(top.halation, 'halation', ['threshold', 'tint', 'amount']);
  const halation: Look['halation'] = {
    threshold: num(h.threshold, 'halation.threshold', 0, 2),
    tint: vec3(h.tint, 'halation.tint', 0, 1),
    amount: num(h.amount, 'halation.amount', 0, 2),
  };

  const g = object(top.grain, 'grain', ['amount', 'size']);
  const grain: Look['grain'] = {
    amount: num(g.amount, 'grain.amount', 0, 0.2),
    size: num(g.size, 'grain.size', 0.3, 3),
  };

  const vignette = num(top.vignette, 'vignette', 0, 0.6);

  return { formatVersion: 1, id, name, kind, credits, tone, colour, halation, grain, vignette };
}
