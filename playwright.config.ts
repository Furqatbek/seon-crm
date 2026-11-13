import { defineConfig, devices } from "@playwright/test";

const baseURL = process.env.APP_URL ?? "http://localhost:3000";
// Set when the machine already has a Chromium that Playwright should use as is.
const executablePath = process.env.PLAYWRIGHT_CHROMIUM_PATH;

// End-to-end tests need the app's database with supabase/seed.sql loaded:
// the local stack (npx supabase start) or the dev project in .env.local.
export default defineConfig({
  testDir: "./e2e",
  globalSetup: "./e2e/support/notify-setup.ts",
  globalTeardown: "./e2e/support/notify-teardown.ts",
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  reporter: "list",
  timeout: 90_000,
  expect: { timeout: 15_000 },
  use: {
    baseURL,
    trace: "on-first-retry",
    locale: "en-US",
    timezoneId: "Asia/Tashkent",
    launchOptions: executablePath ? { executablePath } : {},
  },
  projects: [
    {
      name: "desktop-1440",
      use: { ...devices["Desktop Chrome"], viewport: { width: 1440, height: 900 } },
    },
    {
      name: "phone-390",
      use: {
        ...devices["Desktop Chrome"],
        viewport: { width: 390, height: 844 },
        hasTouch: true,
        isMobile: true,
      },
    },
  ],
  webServer: {
    command: "npm run dev",
    url: baseURL,
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
    // Secrets for the two API routes, so the tests can call them. No Telegram
    // or Eskiz credentials are ever set here: nothing real can be sent.
    env: {
      CRON_SECRET: process.env.CRON_SECRET ?? "e2e-cron-secret",
      TELEGRAM_WEBHOOK_SECRET: process.env.TELEGRAM_WEBHOOK_SECRET ?? "e2e-webhook-secret",
      TELEGRAM_BOT_TOKEN: "",
      ESKIZ_EMAIL: "",
      ESKIZ_PASSWORD: "",
    },
  },
});
