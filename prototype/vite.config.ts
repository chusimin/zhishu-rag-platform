import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { viteSingleFile } from 'vite-plugin-singlefile';

// Single inlined HTML + HashRouter: the built file opens straight from disk (file://).
export default defineConfig({
  base: './',
  plugins: [react(), viteSingleFile()],
  server: { host: '127.0.0.1' },
});
