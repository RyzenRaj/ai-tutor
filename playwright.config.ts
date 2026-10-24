import { defineConfig, devices } from "@playwright/test";

const PORT = 3100;

export default defineConfig({
  testDir: "tests/e2e",
  fullyParallel: false,
  retries: process.env.CI ? 1 : 0,
  reporter: "list",
  use: { baseURL: `http://127.0.0.1:${PORT}`, trace: "retain-on-failure" },
  projects: [
    { name: "desktop", use: { ...devices["Desktop Chrome"] } },
    { name: "mobile", use: { ...devices["Pixel 7"] }, testMatch: /smoke/ },
  ],
  webServer: {
    // Runs the production build with live AI disabled, so E2E is deterministic.
    command: `npm run start -- -p ${PORT}`,
    url: `http://127.0.0.1:${PORT}`,
    // Reusing a server can silently test a stale build; opt in with PW_REUSE_SERVER=1.
    reuseExistingServer: process.env.PW_REUSE_SERVER === "1",
    // Live AI off (deterministic fixtures); E2E shares one anonymous rate-limit bucket, so raise it.
    env: { OPENROUTER_API_KEY: "", RATE_LIMIT_PER_MINUTE: "1000" },
    timeout: 60_000,
  },
});
