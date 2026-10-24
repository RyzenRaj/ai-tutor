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
    env: { OPENROUTER_API_KEY: "" },
    timeout: 60_000,
  },
});
