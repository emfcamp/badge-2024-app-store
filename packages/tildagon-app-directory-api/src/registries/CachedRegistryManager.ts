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
  options?: { clock?: () => number },
) {
  const now = options?.clock ?? (() => Date.now());

  // TODO: Move cache to KV
  const AppCache = new Map<string, TildagonAppRelease>();
  const ErrorCache = new Map<string, RegistrySourceFailure>();

  let refreshInProgress = false;
  let lastRefresh: Date | null = null;

  // ── Helpers ──────────────────────────────────────────────

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
    if (cached && equal(cached.id, listingResult.id)) {
      return;
    }

    try {
      const appResult = await source.get(code, listingResult);
      if (Result.isOk(appResult)) {
        AppCache.set(code, TildagonAppReleaseSchema.parse(appResult.value));
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
        // 1. List from all sources in parallel
        const listings = await Promise.all(
          sources.map(async (source) => {
            try {
              const results = await source.list();
              return { source, results, succeeded: true };
            } catch (err) {
              console.error("Source listing failed:", err);
              return { source, results: [], succeeded: false };
            }
          }),
        );

        // 2. Process each listing result
        for (const { source, results, succeeded } of listings) {
          if (!succeeded) continue;

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
            await safelyGetApp(code, source, result.value);
          }
        }

        lastRefresh = new Date(now());
      } finally {
        refreshInProgress = false;
      }
    },

    async listApps(): Promise<TildagonAppRelease[]> {
      // Lazy-init: if cache has never been populated, refresh now.
      // This preserves backward compat until Phase 6 adds startup refresh.
      if (lastRefresh === null && !refreshInProgress) {
        await this.refreshAllSources();
      }

      return Array.from(AppCache.values()).toSorted((a, b) =>
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
        return { type: "success", value: cachedValue };
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
