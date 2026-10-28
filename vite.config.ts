import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  // Relative asset paths: the static build works from any sub-path (GitHub Pages, Netlify…).
  base: './',
  // The CodeMirror chunk (~170 kB gzipped) is lazy-loaded, so its size is acceptable.
  build: { chunkSizeWarningLimit: 600 },
});
