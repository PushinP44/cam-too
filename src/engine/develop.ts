import type { ImageF } from './image';
import { toDisplay } from './color';
import type { Look } from './look';
import { autoBalance } from './balance';
import { applyTone } from './tone';
import { applyGrain, applyHalation, applyVignette, cleanChroma } from './spatial';

export interface DevelopOptions {
  /** The look to apply, or null to keep the plain photo. */
  look: Look | null;
  /** How much of the look to apply, 0 (none) to 1 (all); more than 1 counts as 1. */
  strength: number;
  /** Seeds the film grain: the same seed always gives the same grain. */
  seed: number;
  /** Whether to even out exposure first. */
  balance: boolean;
}

/**
 * Develops a linear-light photo into a display (sRGB-encoded) image clamped to 0..1.
 * The look is applied as a whole and then blended in over the plain photo by `strength`.
 * Returns a new image; the input is left alone.
 */
export function develop(linear: ImageF, opts: DevelopOptions): ImageF {
  const { look, seed } = opts;
  const strength = Math.min(opts.strength, 1);

  const lin = opts.balance ? autoBalance(linear) : linear;
  const base = toDisplay(lin);
  if (!look || strength <= 0) return base;

  const film = applyVignette(applyGrain(applyTone(applyHalation(cleanChroma(lin), look), look), look, seed), look.vignette);
  // Both images are new and now ours to change: clamp the film, then blend it into the base.
  for (let i = 0; i < film.data.length; i++) {
    const f = Math.min(1, Math.max(0, film.data[i]));
    base.data[i] += strength * (f - base.data[i]);
  }
  return base;
}
