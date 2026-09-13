import { defineConfig } from 'tsup';

/**
 * Published artifacts.
 *
 * The package resolves to `src/index.ts` during development, which is what lets Next's
 * transpilePackages and vitest consume the workspace without a build step. npm consumers
 * get none of that, so `publishConfig` swaps the entry points to these files at publish
 * time: ESM, CJS and declarations.
 */
export default defineConfig({
  entry: ['src/index.ts'],
  format: ['esm', 'cjs'],
  dts: true,
  clean: true,
  sourcemap: true,
  treeshake: true,
});
