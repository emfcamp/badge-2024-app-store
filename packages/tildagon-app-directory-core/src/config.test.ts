import { describe, test, expect, beforeEach, jest } from "@jest/globals";

// config.ts reads from process.env at import time, so we control it
// by setting env vars before the dynamic import in each test.

const OLD_ENV = { ...process.env };

beforeEach(() => {
  // Reset env to a clean state before each test
  process.env = { ...OLD_ENV };
  delete process.env.REFRESH_INTERVAL_MS;
  // Clear the module cache so config re-evaluates with fresh env
  jest.resetModules();
});

describe("config", () => {
  test("default refresh interval is 600000ms (10 minutes)", async () => {
    const { config } = await import("./config.js");
    expect(config.refreshIntervalMs).toBe(600_000);
  });

  test("respects REFRESH_INTERVAL_MS env var", async () => {
    process.env.REFRESH_INTERVAL_MS = "300000";
    const { config } = await import("./config.js");
    expect(config.refreshIntervalMs).toBe(300_000);
  });

  test("falls back to default when REFRESH_INTERVAL_MS is not a number", async () => {
    process.env.REFRESH_INTERVAL_MS = "not-a-number";
    const { config } = await import("./config.js");
    expect(config.refreshIntervalMs).toBe(600_000);
  });

  test("falls back to default when REFRESH_INTERVAL_MS is empty string", async () => {
    process.env.REFRESH_INTERVAL_MS = "";
    const { config } = await import("./config.js");
    expect(config.refreshIntervalMs).toBe(600_000);
  });
});

describe("cacheMaxAge", () => {
  test("returns refresh interval in seconds (default)", async () => {
    const { cacheMaxAge } = await import("./config.js");
    // 600,000ms / 1000 = 600s
    expect(cacheMaxAge()).toBe(600);
  });

  test("returns refresh interval in seconds (custom)", async () => {
    process.env.REFRESH_INTERVAL_MS = "120000";
    const { cacheMaxAge } = await import("./config.js");
    // 120,000ms / 1000 = 120s
    expect(cacheMaxAge()).toBe(120);
  });

  test("returns integer seconds even for non-round intervals", async () => {
    process.env.REFRESH_INTERVAL_MS = "12345";
    const { cacheMaxAge } = await import("./config.js");
    // 12,345ms / 1000 = 12.345 → floor = 12
    expect(cacheMaxAge()).toBe(12);
  });
});
