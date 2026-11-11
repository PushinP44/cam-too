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
