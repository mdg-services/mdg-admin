import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
      // Point @dk/shared to source so Vite can tree-shake ESM and we don't
      // depend on the workspace being prebuilt. (The package ships CJS dist
      // for Node consumers; the bundler resolves to TS source instead.)
      '@dk/shared/schemas': path.resolve(
        __dirname,
        '../shared/src/schemas/index.ts',
      ),
      '@dk/shared/types': path.resolve(
        __dirname,
        '../shared/src/types/index.ts',
      ),
      '@dk/shared': path.resolve(__dirname, '../shared/src/index.ts'),
    },
  },
  server: {
    port: 5173,
    host: true,
  },
});
