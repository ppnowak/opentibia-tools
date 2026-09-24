import { defineConfig } from 'vite';

/** Bundles the CLI into dist-cli/opentibia-tools.mjs (runtime deps stay external). */
export default defineConfig({
  build: {
    ssr: 'src/cli/index.ts',
    outDir: 'dist-cli',
    emptyOutDir: true,
    target: 'node18',
    minify: false,
    sourcemap: false,
    rollupOptions: {
      output: { entryFileNames: 'opentibia-tools.mjs', banner: '#!/usr/bin/env node' },
    },
  },
});
