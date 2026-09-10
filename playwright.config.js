import { createHash } from "node:crypto";
import { defineConfig, devices } from "@playwright/test";

// A port is machine-wide, but this repository is now checked out in several
// worktrees at once. A hardcoded port let Playwright reuse a vite server
// belonging to a *different* checkout: the suite then loaded that checkout's
// index.html and still reported green. Deriving the port from this checkout's
// path keeps it stable across runs here and distinct per worktree. Override
// with PW_PORT when a port has to be pinned by hand.
const HOST = "127.0.0.1";
const PORT = Number(process.env.PW_PORT) || derivePort(process.cwd());
const ORIGIN = `http://${HOST}:${PORT}`;

function derivePort(dir) {
  const digest = createHash("sha1").update(dir).digest();
  return 41000 + (digest.readUInt16BE(0) % 2000);
}

export default defineConfig({
  testDir: "./tests",
  testIgnore: "live/**",
  fullyParallel: true,
  forbidOnly: Boolean(process.env.CI),
  retries: process.env.CI ? 2 : 0,
  workers: process.env.CI ? 1 : undefined,
  reporter: process.env.CI ? "github" : "list",
  use: {
    baseURL: ORIGIN,
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
    video: "on-first-retry",
  },
  webServer: {
    // --strictPort so a genuine collision fails loudly rather than sliding to
    // the next free port, and reuseExistingServer: false so Playwright owns
    // the lifecycle of the only server the suite is allowed to talk to.
    command: `npm run dev -- --host ${HOST} --port ${PORT} --strictPort`,
    url: ORIGIN,
    reuseExistingServer: false,
    timeout: 30_000,
  },
  projects: [
    {
      name: "chromium",
      use: { ...devices["Desktop Chrome"] },
    },
  ],
});
