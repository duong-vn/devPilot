import { defineConfig } from "@playwright/test";

export default defineConfig({
  testDir: "./tests/e2e",
  fullyParallel: false,
  workers: 1,
  retries: 0,
  timeout: 30_000,
  use: {
    baseURL: process.env.TEST_BASE_URL ?? "http://localhost:3000",
    trace: "retain-on-failure",
  },
  reporter: [["list"]],
});
