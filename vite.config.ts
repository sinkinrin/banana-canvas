import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import { readFileSync } from 'node:fs';
import path from 'path';
import { defineConfig } from 'vite';
import { getLocalDataWatchIgnoreGlobs } from './src/lib/devServerWatch';

const packageVersion = (
  JSON.parse(readFileSync(new URL('./package.json', import.meta.url), 'utf8')) as {
    version: string;
  }
).version;

export default defineConfig(() => {
  return {
    plugins: [react(), tailwindcss()],
    define: {
      __APP_VERSION__: JSON.stringify(packageVersion),
    },
    resolve: {
      alias: {
        '@': path.resolve(__dirname, '.'),
      },
    },
    server: {
      // DISABLE_HMR is useful in hosted editors where file watching causes flicker.
      hmr: process.env.DISABLE_HMR !== 'true',
      watch: {
        ignored: getLocalDataWatchIgnoreGlobs(),
      },
    },
  };
});
