import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import path from 'path';
import { defineConfig } from 'vite';
import { getLocalDataWatchIgnoreGlobs } from './src/lib/devServerWatch';

export default defineConfig(() => {
  return {
    plugins: [react(), tailwindcss()],
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
