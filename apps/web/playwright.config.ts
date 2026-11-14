import { defineConfig, devices } from '@playwright/test';

// The server is started by CI (the built standalone app) before the tests run.
export default defineConfig({
  testDir: './e2e',
  fullyParallel: false,
  workers: 1,
  retries: 0,
  timeout: 60_000,
  reporter: process.env.CI
    ? [['github'], ['list'], ['json', { outputFile: 'test-results.json' }]]
    : [['list'], ['html', { open: 'never', outputFolder: 'playwright-report' }]],
  use: {
    baseURL: process.env.BASE_URL ?? 'http://localhost:3000',
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
  },
  projects: [{
    name: 'chromium',
    // PW_CHROMIUM lets a machine with its own Chromium run the suite without downloading a browser.
    use: { ...devices['Desktop Chrome'], ...(process.env.PW_CHROMIUM ? { launchOptions: { executablePath: process.env.PW_CHROMIUM } } : {}) },
  }],
});
