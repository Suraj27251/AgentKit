import { defineConfig, devices } from '@playwright/test';

// Standardize the E2E server on the app's documented development port (3000)
// so baseURL and the Playwright-started server always agree. See README:
// "npm run dev" then open http://localhost:3000.
const PORT = '3000';
const BASE_URL = `http://localhost:${PORT}`;
const DEMO_USERNAME = process.env.DEMO_USERNAME || 'demo';
const DEMO_PASSWORD = process.env.DEMO_PASSWORD || 'demo';
const TEST_SESSION_PASSWORD = 'test-session-password-at-least-32-chars';

export default defineConfig({
  testDir: './tests',
  timeout: 30 * 1000,
  expect: {
    timeout: 5000
  },
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: process.env.CI ? 1 : undefined,
  reporter: 'html',
  use: {
    baseURL: BASE_URL,
    trace: 'on-first-retry',
  },

  webServer: {
    // Playwright starts the app itself, so no manual `npm run dev` is needed.
    // Local runs use the dev server; CI builds a production bundle and serves
    // it. Locally an already-running server on the port is reused, while CI
    // always starts its own (never reuses a developer's local server).
    command: process.env.CI
      ? `npm run build && npm run start -- -p ${PORT}`
      : `npm run dev -- -p ${PORT}`,
    url: BASE_URL,
    reuseExistingServer: !process.env.CI,
    timeout: 120 * 1000,
    env: {
      ...process.env,
      SESSION_PASSWORD: process.env.SESSION_PASSWORD || TEST_SESSION_PASSWORD,
      DEMO_AUTH_ENABLED: process.env.DEMO_AUTH_ENABLED || 'true',
      DEMO_USERNAME,
      DEMO_PASSWORD,
    },
  },

  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },
  ],
});
