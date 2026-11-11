/**
 * Deterministic standard-normal samples: a mulberry32 uniform source fed
 * through the Box-Muller transform. The same seed always gives the same
 * sequence, which keeps film grain reproducible between renders.
 */
export function createGaussian(seed: number): () => number {
  let state = seed >>> 0;
  let spare = 0;
  let hasSpare = false;

  /** mulberry32: uniform in [0, 1). */
  const uniform = (): number => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = Math.imul(state ^ (state >>> 15), state | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };

  return () => {
    // Box-Muller makes two samples per pair of uniforms; hand out the second next time.
    if (hasSpare) {
      hasSpare = false;
      return spare;
    }
    // 1 - uniform() is in (0, 1], so the logarithm is always finite.
    const radius = Math.sqrt(-2 * Math.log(1 - uniform()));
    const angle = 2 * Math.PI * uniform();
    spare = radius * Math.sin(angle);
    hasSpare = true;
    return radius * Math.cos(angle);
  };
}
