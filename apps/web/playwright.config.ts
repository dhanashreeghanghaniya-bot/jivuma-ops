import { defineConfig } from '@playwright/test';

const API_HEALTH = 'http://localhost:4000/api/v1/health';
const WEB = 'http://localhost:3000';

/**
 * SPEC 1: smoke tests for the two main flows. They run against the real API
 * and database, so they use a dedicated test salesman that global setup
 * creates and teardown deactivates. Never run them against production.
 */
export default defineConfig({
  testDir: './e2e',
  // One database, one test salesman: the flows must not overlap.
  workers: 1,
  fullyParallel: false,
  // The Supabase pooler can take a few seconds per round trip from here.
  timeout: 180_000,
  expect: { timeout: 20_000 },
  retries: process.env.CI ? 1 : 0,
  reporter: [['list']],
  globalSetup: './e2e/global-setup.ts',
  globalTeardown: './e2e/global-teardown.ts',
  use: {
    baseURL: WEB,
    // The installed Chrome, so no browser download is needed. Set
    // PLAYWRIGHT_CHANNEL=chromium after `npx playwright install chromium` in CI.
    channel: process.env.PLAYWRIGHT_CHANNEL ?? 'chrome',
    locale: 'en-IN',
    timezoneId: 'Asia/Kolkata',
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
    actionTimeout: 30_000,
    navigationTimeout: 60_000,
  },
  webServer: [
    {
      command: 'pnpm --filter @juma/api dev',
      url: API_HEALTH,
      cwd: '../..',
      reuseExistingServer: true,
      timeout: 120_000,
    },
    {
      command: 'pnpm --filter @juma/web dev',
      url: `${WEB}/login`,
      cwd: '../..',
      reuseExistingServer: true,
      timeout: 180_000,
    },
  ],
});
