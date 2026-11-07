import { defineConfig } from "@playwright/test";

export default defineConfig({
  testDir: "e2e",
  workers: 1,
  use: { baseURL: "http://127.0.0.1:5191", viewport: { width: 1440, height: 900 } },
  webServer: { command: "npm run web", url: "http://127.0.0.1:5191", reuseExistingServer: true },
});
