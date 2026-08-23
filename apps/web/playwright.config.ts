import { defineConfig, devices } from '@playwright/test';

const baseURL = process.env.CLOUDBRIDGE_E2E_URL ?? 'http://127.0.0.1:8080';

/**
 * E2E against a running CloudBridge stack (see README "Tests").
 * The suite does not start docker compose itself — CI/local runs are
 * expected to have `docker compose up -d` already done, with two `local`
 * remotes (`e2e-src`, `e2e-dst`) so the flow needs no cloud credentials.
 */
export default defineConfig({
  testDir: './e2e',
  timeout: 30_000,
  expect: { timeout: 8000 },
  fullyParallel: false,
  workers: 1,
  retries: process.env.CI ? 1 : 0,
  reporter: [['list']],
  use: {
    baseURL,
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
  },
  projects: [
    {
      name: 'chromium',
      // PLAYWRIGHT_BROWSERS_PATH (set in this repo's environment) is enough
      // for Playwright to resolve its own chromium build; no explicit
      // executablePath needed.
      use: { ...devices['Desktop Chrome'] },
    },
  ],
});
