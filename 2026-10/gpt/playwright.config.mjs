import { defineConfig, devices } from "@playwright/test";

const port = process.env.PLAYWRIGHT_PORT ?? "4174";
export default defineConfig({
  testDir: "./tests/browser",
  fullyParallel: true,
  workers: 2,
  timeout: 30_000,
  retries: 0,
  reporter: "list",
  use: {
    baseURL: `http://127.0.0.1:${port}`,
    reducedMotion: "reduce",
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
  },
  projects: [
    { name: "phone-chromium", use: { ...devices["Pixel 7"] } },
    { name: "phone-webkit", use: { ...devices["iPhone 13"] } },
    { name: "desktop-chromium", use: { ...devices["Desktop Chrome"], viewport: { width: 1280, height: 900 } } },
  ],
  webServer: {
    command: "node scripts/serve.mjs",
    url: `http://127.0.0.1:${port}`,
    env: { PORT: port, HOST: "127.0.0.1" },
    reuseExistingServer: false,
    timeout: 15_000,
  },
});
