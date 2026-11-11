import { it, expect } from 'vitest';
import { workingSize, WORKING_MAX_LONG_EDGE } from '../../src/web/sizes';

it.each([
  [6000, 4000, { width: 2048, height: 1365 }],
  [8064, 6048, { width: 2048, height: 1536 }],   // a 48 MP phone photo
  [3000, 4000, { width: 1536, height: 2048 }],
  [800, 600, { width: 800, height: 600 }],       // never enlarged
])('workingSize(%d, %d)', (w, h, want) => expect(workingSize(w, h, WORKING_MAX_LONG_EDGE)).toEqual(want));
