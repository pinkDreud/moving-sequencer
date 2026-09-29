/// <reference types="vitest/config" />
import { defineConfig } from 'vite';
import { svelte } from '@sveltejs/vite-plugin-svelte';
import { VitePWA } from 'vite-plugin-pwa';

const pwa = VitePWA({
  // New builds take over on the next visit, without a prompt.
  registerType: 'autoUpdate',
  includeAssets: ['icons/apple-touch-icon.png', 'icons/icon.svg'],
  manifest: {
    name: 'Moving Sequencer',
    short_name: 'Sequencer',
    description: 'Rearrange sounds while they play.',
    start_url: '/moving-sequencer/',
    scope: '/moving-sequencer/',
    display: 'standalone',
    theme_color: '#16161d',
    background_color: '#16161d',
    icons: [
      { src: 'icons/icon-192.png', sizes: '192x192', type: 'image/png' },
      { src: 'icons/icon-512.png', sizes: '512x512', type: 'image/png' },
      { src: 'icons/icon-512-maskable.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
    ],
  },
  workbox: { globPatterns: ['**/*.{js,css,html,png,svg}'] },
});

// GitHub Pages serves the site from /moving-sequencer/; dev and preview use the same base.
export default defineConfig(() => ({
  base: '/moving-sequencer/',
  plugins: [svelte(), pwa],
  resolve: process.env.VITEST ? { conditions: ['browser'] } : undefined,
  test: {
    environment: 'jsdom',
    include: ['src/**/*.test.ts'],
    setupFiles: ['./vitest-setup.ts'],
  },
}));
