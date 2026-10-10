import { defineConfig, devices } from '@playwright/test';

// PW_CHANNEL=msedge or PW_CHANNEL=chrome runs against an installed browser instead of Playwright's Chromium.
const channel = process.env['PW_CHANNEL'];

export default defineConfig({
  testDir: 'e2e',
  timeout: 60_000,
  fullyParallel: false,
  workers: 1,
  reporter: 'list',
  use: {
    baseURL: 'http://127.0.0.1:4173/',
    ...devices['Pixel 7'],
    ...(channel ? { channel } : {}),
    trace: 'retain-on-failure',
  },
  webServer: {
    command: 'npm run preview -- --host 127.0.0.1 --port 4173 --strictPort',
    url: 'http://127.0.0.1:4173/',
    reuseExistingServer: false,
    timeout: 60_000,
  },
});
