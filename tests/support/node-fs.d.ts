// The project has no Node type definitions (and takes no dependency for them). This declares
// the two Node calls the golden test uses to write golden files, and nothing more.
declare module 'node:fs' {
  export function mkdirSync(path: URL, options: { recursive: true }): void;
  export function writeFileSync(path: URL, data: string): void;
}
