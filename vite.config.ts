import { defineConfig } from 'vite';

export default defineConfig({
  base: './',
  build: {
    target: 'es2022',
    // Phaser (~1.2 MB) is loaded from jsDelivr through the import map in index.html,
    // so the deployed app bundle stays tiny. Dev mode still serves it from node_modules.
    rollupOptions: {
      external: ['phaser'],
    },
  },
});
