import { defineConfig, type Plugin } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

/**
 * The dependencies that never change between our deploys, pulled out of the
 * entry chunk and grouped by package.
 *
 * The point is repeat visits, not first paint. Every one of these is reached
 * from `main.tsx` or the login screen, so they load at first paint either way
 * and splitting them costs nothing there — the entry HTML preloads all of them
 * in parallel. What it buys is that shipping an admin-side change no longer
 * invalidates ~160 kB of React, the router, the query client and socket.io in
 * everybody's cache; only the app chunk's hash moves.
 *
 * Two rules kept this honest, and both are easy to break later:
 *
 * 1. Never put a package in a group with a different load moment. A manual
 *    chunk is fetched as soon as ANYTHING in it is needed, so dropping one
 *    lazily-reached package into an eager group drags it to first paint — which
 *    is exactly the regression this whole pass exists to undo. Every group
 *    below is eager-only.
 * 2. No catch-all `vendor` bucket. Sweeping the rest of node_modules into one
 *    chunk would put ajv, lodash and @rjsf — 300 kB that only two dialogs ever
 *    open — back on the first-paint path. Anything not named here is left to
 *    Rollup, which places it with whatever actually imports it.
 */
const VENDOR_CHUNKS: Record<string, string> = {
  react: 'vendor-react',
  'react-dom': 'vendor-react',
  scheduler: 'vendor-react',
  'react-router': 'vendor-react',
  'react-router-dom': 'vendor-react',
  '@remix-run/router': 'vendor-react',
  '@tanstack/react-query': 'vendor-query',
  '@tanstack/query-core': 'vendor-query',
  'socket.io-client': 'vendor-socket',
  'socket.io-parser': 'vendor-socket',
  'engine.io-client': 'vendor-socket',
  'engine.io-parser': 'vendor-socket',
  'react-hook-form': 'vendor-form',
  '@hookform/resolvers': 'vendor-form',
};

/** The package a module id belongs to, or undefined outside node_modules. */
function packageOf(id: string): string | undefined {
  const m = /node_modules\/((?:@[^/]+\/)?[^/]+)/.exec(id);
  return m?.[1];
}

function manualChunks(id: string): string | undefined {
  const pkg = packageOf(id);
  return pkg ? VENDOR_CHUNKS[pkg] : undefined;
}

/**
 * Preconnect to whatever origin VITE_API_BASE_URL points at, read at build time
 * so no host is hardcoded. Emits nothing when the var is unset, malformed, or
 * already same-origin — a wrong preconnect costs a wasted socket, a missing one
 * costs only what it would have saved.
 *
 * `crossorigin` is load-bearing, not decoration: every call this app makes to
 * the API is a CORS fetch, and a connection opened without the attribute lands
 * in a different pool and is never reused — the preconnect would be theatre.
 */
function apiPreconnect(): Plugin {
  let origin: string | null = null;
  return {
    name: 'api-preconnect',
    configResolved(config) {
      const raw = config.env.VITE_API_BASE_URL as string | undefined;
      try {
        origin = raw ? new URL(raw).origin : null;
      } catch {
        origin = null;
      }
    },
    transformIndexHtml() {
      if (!origin) return [];
      return [
        {
          tag: 'link',
          attrs: { rel: 'dns-prefetch', href: origin },
          injectTo: 'head-prepend' as const,
        },
        {
          tag: 'link',
          attrs: { rel: 'preconnect', href: origin, crossorigin: '' },
          injectTo: 'head-prepend' as const,
        },
      ];
    },
  };
}

export default defineConfig({
  plugins: [react(), apiPreconnect()],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
      // Point @dk/shared to source so Vite can tree-shake ESM and we don't
      // depend on the workspace being prebuilt. (The package ships CJS dist
      // for Node consumers; the bundler resolves to TS source instead.)
      '@dk/shared/schemas': path.resolve(
        __dirname,
        './shared/src/schemas/index.ts',
      ),
      '@dk/shared/types': path.resolve(
        __dirname,
        './shared/src/types/index.ts',
      ),
      '@dk/shared': path.resolve(__dirname, './shared/src/index.ts'),
    },
  },
  build: {
    rollupOptions: {
      output: { manualChunks },
    },
  },
  server: {
    port: 5173,
    host: true,
  },
});
