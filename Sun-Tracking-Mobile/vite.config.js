import { defineConfig } from 'vite';

export default defineConfig({
  // Relative base so Capacitor WebViews load assets from the local bundle
  base: './',
  server: {
    port: 5174,
    open: true,
  },
  build: {
    outDir: 'dist',
    emptyOutDir: true,
  },
});
