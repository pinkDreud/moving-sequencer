import { defineConfig, devices } from '@playwright/test';

// Parallel agents in separate worktrees must use different ports (PW_PORT), or they test each other's builds.
const port = Number(process.env.PW_PORT ?? 4173);
const url = `http://localhost:${port}/moving-sequencer/`;

export default defineConfig({
  testDir: 'tests/e2e',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? 'github' : 'list',
  use: {
    baseURL: url,
    trace: 'on-first-retry',
  },
  projects: [
    { name: 'chromium', use: { ...devices['Desktop Chrome'] } },
    { name: 'webkit', use: { ...devices['Desktop Safari'] } },
    { name: 'mobile-chrome', use: { ...devices['Pixel 7'] } },
    { name: 'mobile-safari', use: { ...devices['iPhone 15'] } },
  ],
  webServer: {
    command: `npm run build && npm run preview -- --port ${port} --strictPort`,
    url,
    reuseExistingServer: false,
    timeout: 120_000,
  },
});
