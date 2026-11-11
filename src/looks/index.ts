import { parseLook, type Look } from '../engine/look';

/**
 * Parses the look files (path to parsed JSON, as `import.meta.glob` gives them) and
 * returns the looks sorted by id. A bad file stops the load with an error that names the
 * file and the field; the `LookError` itself is the error's `cause`.
 */
export function loadLooks(files: Record<string, unknown>): Look[] {
  return Object.entries(files)
    .map(([path, json]) => {
      try {
        return parseLook(json);
      } catch (error) {
        throw new Error(`${path}: ${error instanceof Error ? error.message : String(error)}`, { cause: error });
      }
    })
    .sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
}

/** The looks shipped with the app, validated at load and sorted by id. */
export const STARTER_LOOKS: Look[] = loadLooks(import.meta.glob('./*.json', { eager: true, import: 'default' }));

export function findLook(id: string): Look | undefined {
  return STARTER_LOOKS.find(look => look.id === id);
}
