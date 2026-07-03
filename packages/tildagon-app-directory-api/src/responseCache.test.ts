import { describe, test, expect } from "@jest/globals";
import { createResponseCache } from "./responseCache.js";

describe("responseCache", () => {
  test("get returns null for missing key", () => {
    const cache = createResponseCache({
      ttlMs: 60_000,
      clock: () => 0,
    });
    expect(cache.get("/foo")).toBeNull();
  });

  test("get returns entry when fresh", () => {
    const cache = createResponseCache({
      ttlMs: 60_000,
      clock: () => 0,
    });
    cache.set("/foo", {
      body: "hello",
      contentType: "text/plain",
      status: 200,
      cachedAt: 0,
    });

    const entry = cache.get("/foo");
    expect(entry).not.toBeNull();
    expect(entry!.body).toBe("hello");
    expect(entry!.status).toBe(200);
  });

  test("get returns null when expired", () => {
    const clock = { now: 0 };
    const cache = createResponseCache({
      ttlMs: 60_000,
      clock: () => clock.now,
    });
    cache.set("/foo", {
      body: "hello",
      contentType: "text/plain",
      status: 200,
      cachedAt: 0,
    });

    // Advance past TTL
    clock.now = 60_001;
    expect(cache.get("/foo")).toBeNull();
  });

  test("expired entry is evicted from cache", () => {
    const clock = { now: 0 };
    const cache = createResponseCache({
      ttlMs: 60_000,
      clock: () => clock.now,
    });
    cache.set("/foo", {
      body: "hello",
      contentType: "text/plain",
      status: 200,
      cachedAt: 0,
    });

    clock.now = 60_001;
    cache.get("/foo"); // should evict

    // Verify it's gone
    expect(cache.get("/foo")).toBeNull();
  });

  test("set overwrites existing entry for same key", () => {
    const cache = createResponseCache({
      ttlMs: 60_000,
      clock: () => 0,
    });
    cache.set("/foo", {
      body: "v1",
      contentType: "text/plain",
      status: 200,
      cachedAt: 0,
    });
    cache.set("/foo", {
      body: "v2",
      contentType: "text/plain",
      status: 200,
      cachedAt: 0,
    });

    expect(cache.get("/foo")!.body).toBe("v2");
  });
});
