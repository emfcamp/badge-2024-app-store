import { Result } from "../models";
import type { RegistrySourceFailure, RegistrySource } from "./RegistrySource";
import { GitHubRegistry } from "./sources/github";
import { DummyRegistry } from "./sources/dummy";
import {
  TildagonAppReleaseIdentifier,
  type TildagonAppRelease,
  TildagonAppReleaseSchema,
} from "tildagon-app";

import { disallowedApps } from "./disallowlist";
import { CodebergRegistry } from "./sources/codeberg";
import equal from "fast-deep-equal/es6";
import { writeFileSync, readFileSync, existsSync, mkdirSync, unlinkSync } from "node:fs";
import { join } from "node:path";
import { createWriteStream } from "node:fs";
import { pipeline } from "node:stream/promises";
import {
  refreshTotal,
  refreshDuration,
  refreshLastSuccess,
  refreshInProgress as refreshInProgressGauge,
  sourceApiRequests,
  sourceApiDuration,
  appCacheSize,
  errorCacheSize,
} from "../metrics.js";

export interface AppFilters {
  category?: string;
  author?: string;
  license?: string;
  capabilities?: string[];
  vid?: string;
  pid?: string;
  frontboard?: string;
  service?: string;
  q?: string;
}

if (process.env.APP_STORE_MOCK === "true") {
  console.log("Mocking the app store data");
} else {
  console.log("Using real data");
}

const DEFAULT_SOURCES: RegistrySource<any>[] =
  process.env.APP_STORE_MOCK === "true"
    ? [DummyRegistry]
    : [GitHubRegistry, CodebergRegistry];

/**
 * Creates a CachedRegistryManager that orchestrates listing and fetching
 * apps from the given registry sources. Sources are injected so the
 * manager can be tested with mock registries.
 */
export function createCachedRegistryManager(
  sources: RegistrySource<any>[],
  options?: { clock?: () => number; refreshIntervalMs?: number },
) {
  const now = options?.clock ?? (() => Date.now());
  const refreshIntervalMs = options?.refreshIntervalMs ?? 600_000;

  // ── Disk cache ──────────────────────────────────────────

  const CACHE_DIR = process.env.CACHE_DIR || "/app/cache";
  const CACHE_FILE = join(CACHE_DIR, "store.json");
  const TARBALL_DIR = join(CACHE_DIR, "tarballs");

  interface DiskCacheData {
    apps: { sourceIndex: number; app: TildagonAppRelease }[];
    errors: { code: string; failure: RegistrySourceFailure }[];
    lastRefresh: string | null;
  }

  function saveToDisk(): void {
    try {
      if (!existsSync(CACHE_DIR)) {
        mkdirSync(CACHE_DIR, { recursive: true });
      }
      const data: DiskCacheData = {
        apps: Array.from(AppCache.entries()).map(([, entry]) => ({
          sourceIndex: entry.sourceIndex,
          app: entry.app,
        })),
        errors: Array.from(ErrorCache.entries()).map(([code, failure]) => ({
          code,
          failure,
        })),
        lastRefresh: lastRefresh?.toISOString() ?? null,
      };
      writeFileSync(CACHE_FILE, JSON.stringify(data));
    } catch (err) {
      console.warn("Failed to save cache to disk:", err);
    }
  }

  function loadFromDisk(): boolean {
    try {
      if (!existsSync(CACHE_FILE)) return false;
      const raw: DiskCacheData = JSON.parse(
        readFileSync(CACHE_FILE, "utf-8"),
      );

      for (const { sourceIndex, app } of raw.apps) {
        try {
          const validated = TildagonAppReleaseSchema.parse(app);
          AppCache.set(app.code, { app: validated, sourceIndex });
        } catch {
          console.warn(`Skipping invalid app in disk cache: ${app.code}`);
        }
      }

      for (const { code, failure } of raw.errors) {
        ErrorCache.set(code, failure);
      }

      if (raw.lastRefresh) {
        lastRefresh = new Date(raw.lastRefresh);
      }

      console.log(
        `Loaded ${AppCache.size} apps and ${ErrorCache.size} errors from disk cache`,
      );
      return true;
    } catch (err) {
      console.warn("Failed to load cache from disk:", err);
      return false;
    }
  }

  // ── Tarball cache ───────────────────────────────────────

  function tarballPath(code: string): string {
    return join(TARBALL_DIR, `${code}.tar.gz`);
  }

  function isTarballCached(code: string): boolean {
    return existsSync(tarballPath(code));
  }

  function invalidateTarball(code: string): void {
    const path = tarballPath(code);
    if (existsSync(path)) {
      try {
        unlinkSync(path);
      } catch (err) {
        console.warn(`Failed to delete cached tarball ${code}:`, err);
      }
    }
  }

  async function fetchAndCacheTarball(
    code: string,
    url: string,
  ): Promise<void> {
    try {
      if (!existsSync(TARBALL_DIR)) {
        mkdirSync(TARBALL_DIR, { recursive: true });
      }
      const response = await fetch(url);
      if (!response.ok || !response.body) {
        throw new Error(`Fetch failed: ${response.status}`);
      }
      const dest = tarballPath(code);
      await pipeline(response.body, createWriteStream(dest));
    } catch (err) {
      console.warn(`Failed to cache tarball for ${code}:`, err);
    }
  }

  // TODO: Move cache to KV
  const AppCache = new Map<
    string,
    { app: TildagonAppRelease; sourceIndex: number }
  >();
  const ErrorCache = new Map<string, RegistrySourceFailure>();

  /** Cached listing results per source index, for TTL-based short-circuit. */
  const listingCache = new Map<
    number,
    {
      results: Awaited<ReturnType<RegistrySource<any>["list"]>>;
      fetchedAt: number;
    }
  >();

  let refreshInProgress = false;
  let lastRefresh: Date | null = null;

  // ── Helpers ──────────────────────────────────────────────

  function isStale(): boolean {
    return (
      lastRefresh === null || now() - lastRefresh.getTime() > refreshIntervalMs
    );
  }

  function checkDisallowlist(id: TildagonAppReleaseIdentifier): string | null {
    const match = disallowedApps.find((spec) =>
      Object.entries(spec).every(([key, value]) => {
        if (Object.prototype.hasOwnProperty.call(id, key)) {
          return id[key as keyof typeof id] === value;
        }
        return true;
      }),
    );
    return match ? `Ban: ${JSON.stringify(match, null, 2)}` : null;
  }

  async function safelyGetApp(
    code: string,
    sourceIndex: number,
    source: RegistrySource<any>,
    listingResult: { id: TildagonAppReleaseIdentifier } & Record<string, any>,
  ): Promise<void> {
    // Disallowlist check
    const banReason = checkDisallowlist(listingResult.id);
    if (banReason) {
      ErrorCache.set(code, {
        id: listingResult.id,
        reason: banReason,
      });
      return;
    }

    // Skip if already cached with the same releaseHash
    const cached = AppCache.get(code);
    if (cached && equal(cached.app.id, listingResult.id)) {
      return;
    }

    // New release — invalidate old cached tarball
    if (cached) {
      invalidateTarball(code);
    }

    try {
      const getStart = Date.now();
      const appResult = await source.get(code, listingResult);
      sourceApiDuration.observe(
        { service: source.serviceName, operation: "get" },
        (Date.now() - getStart) / 1000,
      );
      sourceApiRequests.inc({
        service: source.serviceName,
        operation: "get",
        status: Result.isOk(appResult) ? "success" : "failure",
      });
      if (Result.isOk(appResult)) {
        AppCache.set(code, {
          app: TildagonAppReleaseSchema.parse(appResult.value),
          sourceIndex,
        });
        ErrorCache.delete(code);
      } else {
        ErrorCache.set(code, appResult.failure);
        AppCache.delete(code);
      }
    } catch (err) {
      ErrorCache.set(code, {
        id: listingResult.id,
        reason: err instanceof Error ? err.message : "Unexpected error",
      });
    }
  }

  // ── Public API ───────────────────────────────────────────

  /** Update Prometheus gauges from current cache state. */
  function updateCacheMetrics(): void {
    const byService: Record<string, number> = {};
    for (const [, entry] of AppCache) {
      const svc = entry.app.id.service;
      byService[svc] = (byService[svc] || 0) + 1;
    }
    for (const [svc, count] of Object.entries(byService)) {
      appCacheSize.set({ service: svc }, count);
    }
    errorCacheSize.set(ErrorCache.size);
  }

  return {
    /**
     * Fetch all apps from all sources and rebuild the cache.
     * Skips if a refresh is already in progress.
     */
    async refreshAllSources(): Promise<void> {
      if (refreshInProgress) return;
      refreshInProgress = true;
      refreshInProgressGauge.set(1);

      const refreshStart = Date.now();
      try {
        const ts = now();

        // 1. List from all sources in parallel, using listing cache if fresh
        const listings = await Promise.all(
          sources.map(async (source, sourceIndex) => {
            // Check listing cache
            const cachedListing = listingCache.get(sourceIndex);
            if (
              cachedListing &&
              ts - cachedListing.fetchedAt < refreshIntervalMs
            ) {
              return {
                source,
                sourceIndex,
                results: cachedListing.results,
                succeeded: true,
              };
            }

            try {
              const listStart = Date.now();
              const results = await source.list();
              sourceApiDuration.observe(
                { service: source.serviceName, operation: "list" },
                (Date.now() - listStart) / 1000,
              );
              sourceApiRequests.inc({
                service: source.serviceName,
                operation: "list",
                status: "success",
              });
              listingCache.set(sourceIndex, { results, fetchedAt: ts });
              return { source, sourceIndex, results, succeeded: true };
            } catch (err) {
              sourceApiRequests.inc({
                service: source.serviceName,
                operation: "list",
                status: "error",
              });
              console.error("Source listing failed:", err);
              return { source, sourceIndex, results: [], succeeded: false };
            }
          }),
        );

        // 2. Track seen codes per source for deletion detection
        const seenBySource = new Map<number, Set<string>>();
        for (const { sourceIndex, succeeded } of listings) {
          if (succeeded) {
            seenBySource.set(sourceIndex, new Set());
          }
        }

        // 3. Process each listing result
        for (const { source, sourceIndex, results, succeeded } of listings) {
          if (!succeeded) continue;
          const seen = seenBySource.get(sourceIndex)!;

          for (const result of results) {
            if (result.type === "failure") {
              const code = TildagonAppReleaseIdentifier.toAppCode(
                result.failure.id,
              );
              ErrorCache.set(code, result.failure);
              continue;
            }

            const code = TildagonAppReleaseIdentifier.toAppCode(
              result.value.id,
            );
            seen.add(code);
            await safelyGetApp(code, sourceIndex, source, result.value);
          }
        }

        // 4. Delete apps whose source succeeded but no longer lists them
        for (const [code, entry] of AppCache) {
          const seen = seenBySource.get(entry.sourceIndex);
          if (seen && !seen.has(code)) {
            AppCache.delete(code);
            ErrorCache.delete(code);
          }
        }

        lastRefresh = new Date(ts);

        // Record refresh success metrics
        refreshDuration.observe((Date.now() - refreshStart) / 1000);
        refreshTotal.inc({ status: "success" });
        refreshLastSuccess.set(ts / 1000);
        updateCacheMetrics();
        saveToDisk();
      } catch (err) {
        refreshTotal.inc({ status: "failure" });
        throw err;
      } finally {
        refreshInProgress = false;
        refreshInProgressGauge.set(0);
      }
    },

    async listApps(filters?: AppFilters): Promise<TildagonAppRelease[]> {
      // Lazy-init: if cache has never been populated, refresh now.
      if (lastRefresh === null && !refreshInProgress) {
        await this.refreshAllSources();
      }

      // SWR: if stale and no refresh already in progress, fire background refresh
      if (isStale() && !refreshInProgress) {
        this.refreshAllSources().catch((err) =>
          console.error("SWR background refresh failed:", err),
        );
      }

      let apps = Array.from(AppCache.values()).map((e) => e.app);

      if (filters) {
        apps = apps.filter((app) => {
          if (filters.category) {
            const cats = filters.category.split(",");
            if (
              !cats.some((c) => app.manifest.app.category.includes(c as any))
            ) {
              return false;
            }
          }
          if (filters.author) {
            const authors = filters.author
              .split(",")
              .map((a) => a.toLowerCase());
            if (!authors.includes(app.manifest.metadata.author.toLowerCase())) {
              return false;
            }
          }
          if (filters.license) {
            const licenses = filters.license
              .split(",")
              .map((l) => l.toLowerCase());
            if (
              !licenses.includes(app.manifest.metadata.license.toLowerCase())
            ) {
              return false;
            }
          }
          if (filters.service) {
            const services = filters.service.split(",");
            if (!services.includes(app.id.service)) {
              return false;
            }
          }
          if (filters.capabilities) {
            const appCaps = app.manifest.metadata.capabilities ?? [];
            const hasAll = filters.capabilities.every((capGroup) => {
              const orCaps = capGroup.split(",");
              return orCaps.some((c) =>
                appCaps.some(
                  (assoc) =>
                    typeof assoc.feature === "string" && assoc.feature === c,
                ),
              );
            });
            if (!hasAll) return false;
          }
          if (filters.vid || filters.pid) {
            const appCaps = app.manifest.metadata.capabilities ?? [];
            const hasMatch = appCaps.some(
              (assoc) =>
                typeof assoc.feature === "object" &&
                "vid" in assoc.feature &&
                "pid" in assoc.feature &&
                (!filters.vid || assoc.feature.vid === filters.vid) &&
                (!filters.pid || assoc.feature.pid === filters.pid),
            );
            if (!hasMatch) return false;
          }
          if (filters.frontboard) {
            const appCaps = app.manifest.metadata.capabilities ?? [];
            const hasMatch = appCaps.some(
              (assoc) =>
                typeof assoc.feature === "object" &&
                "name" in assoc.feature &&
                assoc.feature.name === filters.frontboard,
            );
            if (!hasMatch) return false;
          }
          if (filters.q) {
            const q = filters.q.toLowerCase();
            const inName = app.manifest.app.name.toLowerCase().includes(q);
            const inDesc = app.manifest.metadata.description
              .toLowerCase()
              .includes(q);
            if (!inName && !inDesc) return false;
          }
          return true;
        });
      }

      return apps.toSorted((a, b) =>
        a.manifest.app.name
          .toLowerCase()
          .localeCompare(b.manifest.app.name.toLowerCase()),
      );
    },

    async getApp(
      key: string,
    ): Promise<Result<TildagonAppRelease, RegistrySourceFailure>> {
      const cachedValue = AppCache.get(key);
      if (cachedValue) {
        return { type: "success", value: cachedValue.app };
      }
      return {
        type: "failure",
        failure: ErrorCache.get(key) || {
          id: { owner: "", title: "", service: "github" },
          reason: "Not found",
        },
      };
    },

    async listErrors() {
      return Array.from(ErrorCache.values());
    },

    getStatus() {
      const byService: Record<string, number> = {};
      for (const [, entry] of AppCache) {
        const svc = entry.app.id.service;
        byService[svc] = (byService[svc] || 0) + 1;
      }
      return {
        cacheSize: AppCache.size,
        byService,
        errorCount: ErrorCache.size,
        lastRefresh: lastRefresh?.toISOString() ?? null,
        refreshInProgress,
      };
    },

    /** Update Prometheus gauges from the current cache state. */
    refreshCacheMetrics(): void {
      const byService: Record<string, number> = {};
      for (const [, entry] of AppCache) {
        const svc = entry.app.id.service;
        byService[svc] = (byService[svc] || 0) + 1;
      }
      for (const [svc, count] of Object.entries(byService)) {
        appCacheSize.set({ service: svc }, count);
      }
      errorCacheSize.set(ErrorCache.size);
    },

    /** Load cache from disk. Returns true if a cache file was found and loaded. */
    loadFromDisk(): boolean {
      return loadFromDisk();
    },

    /** Check if a tarball is cached on disk for the given app code. */
    hasCachedTarball(code: string): boolean {
      return isTarballCached(code);
    },

    /** Get the filesystem path to a cached tarball. */
    getCachedTarballPath(code: string): string {
      return tarballPath(code);
    },

    /** Download a tarball from a URL and cache it on disk (fire-and-forget). */
    downloadTarball(code: string, url: string): void {
      fetchAndCacheTarball(code, url);
    },
  };
}

/** Default singleton instance wired to the real/dummy registry sources. */
export const CachedRegistryManager =
  createCachedRegistryManager(DEFAULT_SOURCES);
