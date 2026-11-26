import { defineConfig, devices } from '@playwright/test'

/**
 * End-to-end tests. They run against their own Vite dev server on :5199 so they never clash with the one you use
 * on :5173.
 *
 * - `npm run test:e2e`: the default suite. Every /api call is answered by e2e/mock-api.ts, so no backend is needed
 *   and results don't depend on Yahoo or market hours.
 * - `npm run test:e2e:live`: a short smoke test against the real API on :5080 (start it first).
 */
const PORT = 5199

export default defineConfig({
  testDir: './e2e',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  reporter: [['list'], ['html', { open: 'never' }]],
  use: {
    baseURL: `http://localhost:${PORT}`,
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
    viewport: { width: 1440, height: 900 },
  },
  projects: [
    {
      name: 'mocked',
      testIgnore: /live\//,
      use: { ...devices['Desktop Chrome'], viewport: { width: 1440, height: 900 } },
    },
    {
      name: 'live',
      testMatch: /live\/.*\.spec\.ts/,
      use: { ...devices['Desktop Chrome'], viewport: { width: 1440, height: 900 } },
    },
  ],
  webServer: {
    command: `npx vite --port ${PORT} --strictPort`,
    url: `http://localhost:${PORT}`,
    reuseExistingServer: !process.env.CI,
    timeout: 60_000,
  },
})
