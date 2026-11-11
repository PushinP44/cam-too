import type { JSX } from 'preact';
import { useEffect, useId, useMemo, useRef, useState } from 'preact/hooks';
import type { ImageF } from '../engine/image';
import type { Look } from '../engine/look';
import { render } from '../engine/render';
import { SHAPES } from '../engine/geometry';
import { STARTER_LOOKS } from '../looks';
import { decodeFile } from './decode';
import { drawDisplay, encodeJpeg } from './encode';

const SHAPE = SHAPES['4:5'];
const CENTRE = { x: 0.5, y: 0.5 };
const SEED = 1;
const PREVIEW_SCALE = 0.4;
const SAVE_SCALE = 1;
const DEFAULT_STRENGTH = 70;
/** How long the preview waits after the last change before it renders again. */
const PREVIEW_DELAY_MS = 60;
/** How long a download's object URL stays valid; some browsers read it after the click returns. */
const OBJECT_URL_LIFETIME_MS = 10_000;

/**
 * The 4:5 crop of `work` at `scale`, with `look` at `strength` (0..100). A null look gives
 * no film; `balance` false also skips the exposure balance, which leaves the crop untouched.
 */
function renderCrop(work: ImageF, scale: number, look: Look | null, strength: number, balance = true): ImageF {
  return render(work, { shape: SHAPE, offset: CENTRE, scale, look, strength: strength / 100, seed: SEED, balance });
}

/** Resolves once the browser has had the chance to paint what changed so far. */
function afterPaint(): Promise<void> {
  return new Promise(resolve => requestAnimationFrame(() => setTimeout(resolve, 0)));
}

/** The keys that hold the preview, as the pointer does. */
const isHoldKey = (key: string) => key === ' ' || key === 'Enter';

function download(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  link.click();
  setTimeout(() => URL.revokeObjectURL(url), OBJECT_URL_LIFETIME_MS);
}

interface StartProps {
  opening: boolean;
  error: string | null;
  onFile: (file: File) => void;
}

function Start({ opening, error, onFile }: StartProps): JSX.Element {
  const input = useRef<HTMLInputElement>(null);
  return (
    <section class="start">
      <input
        ref={input}
        type="file"
        accept="image/jpeg,image/png,image/webp"
        hidden
        onChange={event => {
          const field = event.currentTarget;
          const file = field.files?.[0];
          // Clearing the field lets the same file be chosen again after a failure.
          field.value = '';
          if (file) onFile(file);
        }}
      />
      <button type="button" class="primary" disabled={opening} onClick={() => input.current?.click()}>
        {opening ? 'Opening…' : 'Add a photo'}
      </button>
      <p class="note">It never leaves this device.</p>
      {error && (
        <p class="error" role="alert">
          {error}
        </p>
      )}
    </section>
  );
}

function Editor({ work, onChoose }: { work: ImageF; onChoose: () => void }): JSX.Element {
  const [look, setLook] = useState<Look | null>(null);
  const [strength, setStrength] = useState(DEFAULT_STRENGTH);
  const [holding, setHolding] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const canvas = useRef<HTMLCanvasElement>(null);
  const filmId = useId();
  const strengthId = useId();

  // Two crops are made once per photo: the untouched original, which holding the preview
  // shows, and the one for "None", which is only balanced for exposure.
  const original = useMemo(() => renderCrop(work, PREVIEW_SCALE, null, 0, false), [work]);
  const unfilmed = useMemo(() => renderCrop(work, PREVIEW_SCALE, null, 0), [work]);
  // The film preview follows the controls after a short pause. Until it catches up the
  // previous one stays on screen, so dragging the slider does not flicker.
  const [filmed, setFilmed] = useState<ImageF | null>(null);
  useEffect(() => {
    if (!look) {
      setFilmed(null);
      return;
    }
    const timer = setTimeout(() => setFilmed(renderCrop(work, PREVIEW_SCALE, look, strength)), PREVIEW_DELAY_MS);
    return () => clearTimeout(timer);
  }, [work, look, strength]);

  const shown = holding ? original : look ? (filmed ?? unfilmed) : unfilmed;
  useEffect(() => {
    if (canvas.current) drawDisplay(canvas.current, shown);
  }, [shown]);

  async function save(): Promise<void> {
    setSaving(true);
    setError(null);
    try {
      // A full-size render takes over a second and blocks the page, so let "Saving…" show first.
      await afterPaint();
      const blob = await encodeJpeg(renderCrop(work, SAVE_SCALE, look, strength));
      download(blob, `cam-too-${look?.id ?? 'no-film'}.jpg`);
    } catch {
      setError('That photo could not be saved. Try again.');
    } finally {
      setSaving(false);
    }
  }

  return (
    <section class="edit">
      <button
        type="button"
        class="preview"
        aria-label="Photo preview. Hold to see the original."
        onPointerDown={event => {
          if (event.button !== 0) return;
          // Capturing the pointer ends the hold even if the finger or mouse leaves the photo.
          event.currentTarget.setPointerCapture(event.pointerId);
          setHolding(true);
        }}
        onPointerUp={() => setHolding(false)}
        onPointerCancel={() => setHolding(false)}
        onKeyDown={event => {
          if (!isHoldKey(event.key)) return;
          event.preventDefault();
          setHolding(true);
        }}
        onKeyUp={event => {
          if (isHoldKey(event.key)) setHolding(false);
        }}
        onBlur={() => setHolding(false)}
        onContextMenu={event => event.preventDefault()}
      >
        <canvas ref={canvas} />
      </button>
      <p class="hint">Hold the photo to see the original.</p>

      <div class="field">
        <h2 class="label" id={filmId}>
          Film
        </h2>
        <div class="chips" role="group" aria-labelledby={filmId}>
          <button type="button" class="chip" aria-pressed={look === null} onClick={() => setLook(null)}>
            None
          </button>
          {STARTER_LOOKS.map(starter => (
            <button
              key={starter.id}
              type="button"
              class="chip"
              aria-pressed={look === starter}
              onClick={() => setLook(starter)}
            >
              {starter.name}
            </button>
          ))}
        </div>
      </div>

      <div class="field">
        <label class="label" for={strengthId}>
          Film strength <span aria-hidden="true">{strength}</span>
        </label>
        <input
          id={strengthId}
          type="range"
          min="0"
          max="100"
          step="1"
          value={strength}
          onInput={event => setStrength(event.currentTarget.valueAsNumber)}
        />
      </div>

      <button type="button" class="primary" disabled={saving} onClick={save}>
        {saving ? 'Saving…' : 'Save photo'}
      </button>
      {error && (
        <p class="error" role="alert">
          {error}
        </p>
      )}
      <button type="button" class="secondary" disabled={saving} onClick={onChoose}>
        Choose another photo
      </button>
    </section>
  );
}

export function App(): JSX.Element {
  const [work, setWork] = useState<ImageF | null>(null);
  const [opening, setOpening] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function open(file: File): Promise<void> {
    setOpening(true);
    setError(null);
    try {
      setWork(await decodeFile(file));
    } catch {
      setError('That photo could not be opened. Try a JPEG or PNG.');
    } finally {
      setOpening(false);
    }
  }

  return (
    <main class="app">
      <header class="bar">
        <h1>cam-too</h1>
      </header>
      {/* Leaving the editor drops the working image and cancels its pending preview timer. */}
      {work ? <Editor work={work} onChoose={() => setWork(null)} /> : <Start opening={opening} error={error} onFile={open} />}
    </main>
  );
}
