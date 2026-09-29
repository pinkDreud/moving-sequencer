// Renders public/icons/icon.svg to the PNG sizes the manifest and iOS need. Run: node scripts/make-icons.mjs
import { readFile } from 'node:fs/promises';
import { chromium } from '@playwright/test';

const svg = await readFile(new URL('../public/icons/icon.svg', import.meta.url), 'utf8');
const out = (name) => new URL(`../public/icons/${name}`, import.meta.url).pathname;

// Maskable icons are cropped to a circle/squircle by the OS: keep the artwork inside the central 80 % safe zone.
const maskable = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512"><rect width="512" height="512" fill="#16161d"/>
  <g transform="translate(51.2 51.2) scale(0.8)">${svg.replace(/<svg[^>]*>|<\/svg>/g, '')}</g></svg>`;

const browser = await chromium.launch();
const page = await browser.newPage();
for (const [name, size, source] of [
  ['icon-192.png', 192, svg],
  ['icon-512.png', 512, svg],
  ['icon-512-maskable.png', 512, maskable],
  ['apple-touch-icon.png', 180, maskable],
]) {
  await page.setViewportSize({ width: size, height: size });
  await page.setContent(
    `<style>html,body{margin:0;background:transparent}svg{display:block;width:${size}px;height:${size}px}</style>${source}`,
  );
  await page.screenshot({ path: out(name), omitBackground: true });
}
await browser.close();
