import { test } from 'vitest';
import { render } from '../../src/engine/render';
import { SHAPES } from '../../src/engine/geometry';
import { findLook } from '../../src/looks';
import { syntheticPhoto } from '../support/synthetic';

const source = syntheticPhoto(2048, 1536);
const look = findLook('warm-portrait')!;

test('render 2048x1536 into 4:5 at scale 1 with warm-portrait', async ({ bench }) => {
  // One render takes about a second, so the defaults (64 runs and 16 warm-ups) would outlast the test timeout.
  await bench('render', () => {
    render(source, { shape: SHAPES['4:5'], offset: { x: 0.5, y: 0.5 }, scale: 1, look, strength: 1, seed: 1 });
  }).run({ iterations: 5, time: 0, warmupIterations: 2, warmupTime: 0 });
});
