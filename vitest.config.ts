/// <reference types="vitest" />
import { defineConfig, mergeConfig } from 'vitest/config';

import viteConfig from './vite.config';

/*
 * Tests for the team app, starting with the voice recorder. They reuse the app's
 * Vite config (the '@/…' and '@dk/shared' paths, the React plugin), the same way
 * the dealer app's tests do.
 *
 * Vitest, jsdom and Testing Library come from the shared install at the root of
 * the mdg-service folder, not from this app's package.json: the Vercel build never
 * runs tests, and tsconfig.json leaves test files out, so a deploy cannot fail for
 * want of them. Run from mdg-admin/:  npx vitest run
 */
export default mergeConfig(
  viteConfig,
  defineConfig({
    test: {
      environment: 'jsdom',
      setupFiles: ['./vitest.setup.ts'],
      css: false,
      restoreMocks: true,
      clearMocks: true,
      unstubGlobals: true,
      include: ['src/**/*.{test,spec}.{ts,tsx}'],
    },
  }),
);
