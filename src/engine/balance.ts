import { createImage, type ImageF } from './image';
import { luminance } from './color';

/** The brightness an average scene is balanced towards, in linear light. */
const MID_GREY = 0.18;
/** Luminance is floored here before the average, so black pixels cannot drag it to nothing. */
const LUMINANCE_FLOOR = 1e-4;
/** The most exposure change balance may make, in stops, either way. */
const MAX_STOPS = 1;

/**
 * Evens out exposure. The photo's key is the geometric mean of its luminance; the photo is
 * moved half the way (in stops) towards the key landing on mid-grey, by at most one stop
 * either way, so a deliberately dark or bright photo stays that way. Linear-light in and
 * out, as a new image. White balance is not handled here.
 */
export function autoBalance(linear: ImageF): ImageF {
  const { width, height } = linear;
  const src = linear.data;
  const pixels = width * height;

  let sumOfLogs = 0;
  for (let i = 0; i < src.length; i += 3) {
    sumOfLogs += Math.log(Math.max(luminance(src[i], src[i + 1], src[i + 2]), LUMINANCE_FLOOR));
  }
  const key = Math.exp(sumOfLogs / pixels);
  const stops = Math.min(MAX_STOPS, Math.max(-MAX_STOPS, 0.5 * Math.log2(MID_GREY / key)));
  const gain = 2 ** stops;

  const out = createImage(width, height);
  const dst = out.data;
  for (let i = 0; i < src.length; i++) dst[i] = src[i] * gain;
  return out;
}
