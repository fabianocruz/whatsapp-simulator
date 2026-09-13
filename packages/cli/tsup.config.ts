import { defineConfig } from 'tsup';

/**
 * The published binary. The shebang has to be a banner rather than a line in the source,
 * because `tsx src/cli.ts` during development would otherwise pass it through to the
 * TypeScript parser.
 */
export default defineConfig({
  entry: ['src/cli.ts'],
  format: ['esm'],
  clean: true,
  sourcemap: true,
  banner: { js: '#!/usr/bin/env node' },
  // Our own packages go inside the binary. A CLI that resolves four workspace
  // dependencies at runtime cannot be run before it is published, and a tool nobody can
  // try before shipping is a tool that ships broken. Bundled, `node dist/cli.js` is the
  // same thing the user will run after `npm i -g`.
  noExternal: [/^@dyvit\//],
});
