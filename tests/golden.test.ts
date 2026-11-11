import { describe, it, expect } from 'vitest';
import { mkdirSync, writeFileSync } from 'node:fs';
import { render } from '../src/engine/render';
import { SHAPES } from '../src/engine/geometry';
import { STARTER_LOOKS } from '../src/looks';
import { syntheticPhoto, gridMeans, maxAbsDiff } from './support/synthetic';

const goldens = import.meta.glob<number[]>('./golden/*.json', { eager: true, import: 'default' });
const GOLDEN_DIR = new URL('./golden/', import.meta.url);

describe('golden renders', () => {
  it.each(STARTER_LOOKS)('$id renders as it did when the golden file was made', look => {
    const out = render(syntheticPhoto(160, 200), {
      shape: SHAPES['4:5'], offset: { x: 0.5, y: 0.5 }, scale: 0.1, look, strength: 1, seed: 1,
    });
    const means = gridMeans(out, 6, 8);

    // Run with UPDATE_GOLDEN=1 to write the golden files from the current engine instead of comparing.
    if (import.meta.env.UPDATE_GOLDEN) {
      mkdirSync(GOLDEN_DIR, { recursive: true });
      writeFileSync(new URL(`${look.id}.json`, GOLDEN_DIR), `${JSON.stringify(means)}\n`);
      return;
    }
    const golden = goldens[`./golden/${look.id}.json`];
    expect(golden, `tests/golden/${look.id}.json is missing; run with UPDATE_GOLDEN=1 to create it`).toBeDefined();
    expect(maxAbsDiff(means, golden!)).toBeLessThan(0.005);
  });
});
