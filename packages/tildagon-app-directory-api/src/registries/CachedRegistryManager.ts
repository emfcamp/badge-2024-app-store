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

if (process.env.APP_STORE_MOCK) {
  console.log("Mocking the app store data");
} else {
  console.log("Using real data");
}

const DEFAULT_SOURCES: RegistrySource<any>[] = process.env.APP_STORE_MOCK
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

    try {
      const appResult = await source.get(code, listingResult);
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

  return {
    /**
     * Fetch all apps from all sources and rebuild the cache.
     * Skips if a refresh is already in progress.
     */
    async refreshAllSources(): Promise<void> {
      if (refreshInProgress) return;
      refreshInProgress = true;

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
              const results = await source.list();
              listingCache.set(sourceIndex, { results, fetchedAt: ts });
              return { source, sourceIndex, results, succeeded: true };
            } catch (err) {
              console.error("Source listing failed:", err);
              return { source, sourceIndex, results: [], succeeded: false };
            }
          }),
        );

        // 2. Track seen codes per source for deletion detection
        const seenBySource = new Map<number, Set<string>>();
        for (const { sourceIndex } of listings) {
          seenBySource.set(sourceIndex, new Set());
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
      } finally {
        refreshInProgress = false;
      }
    },

    async listApps(): Promise<TildagonAppRelease[]> {
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

      return Array.from(AppCache.values())
        .map((e) => e.app)
        .toSorted((a, b) =>
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
      return {
        cacheSize: AppCache.size,
        errorCount: ErrorCache.size,
        lastRefresh: lastRefresh?.toISOString() ?? null,
        refreshInProgress,
      };
    },
  };
}

/** Default singleton instance wired to the real/dummy registry sources. */
export const CachedRegistryManager =
  createCachedRegistryManager(DEFAULT_SOURCES);
