import { parseLook, type Look } from '../engine/look';

const files = import.meta.glob('./*.json', { eager: true, import: 'default' });

/** The looks shipped with the app, validated at load and sorted by id. */
export const STARTER_LOOKS: Look[] = Object.values(files)
  .map(json => parseLook(json))
  .sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));

export function findLook(id: string): Look | undefined {
  return STARTER_LOOKS.find(look => look.id === id);
}
