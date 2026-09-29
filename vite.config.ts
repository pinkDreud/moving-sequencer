/// <reference types="vitest/config" />
import { defineConfig } from 'vite';
import { svelte } from '@sveltejs/vite-plugin-svelte';
import basicSsl from '@vitejs/plugin-basic-ssl';

// GitHub Pages serves the site from /moving-sequencer/; dev and preview use the same base.
// `--mode https` (npm run dev:https): self-signed HTTPS, so phones on the LAN get a secure context (mic).
export default defineConfig(({ mode }) => ({
  base: '/moving-sequencer/',
  plugins: [svelte(), mode === 'https' && basicSsl()],
  resolve: process.env.VITEST ? { conditions: ['browser'] } : undefined,
  test: {
    environment: 'jsdom',
    include: ['src/**/*.test.ts'],
    setupFiles: ['./vitest-setup.ts'],
  },
}));
