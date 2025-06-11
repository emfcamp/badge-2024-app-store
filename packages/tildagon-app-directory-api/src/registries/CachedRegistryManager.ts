import { Result } from "../models";
import type { RegistrySourceFailure } from "./RegistrySource";
import { GitHubRegistry } from "./sources/github";
import {
  TildagonAppReleaseIdentifier,
  type TildagonAppRelease,
} from "tildagon-app";

import { disallowedApps } from "./disallowlist";

// TODO: Move cache to KV
const AppCache = new Map<string, TildagonAppRelease>();
const ErrorCache = new Map<string, RegistrySourceFailure>();

const SOURCES = [GitHubRegistry];

export const CachedRegistryManager = {
  async listApps() {
    await Promise.all(
      SOURCES.map(async (source) => {
        return await Promise.all(
          (await source.list())

            .map((result) => {
              if (result.type === "failure") {
                ErrorCache.set(
                  TildagonAppReleaseIdentifier.toAppCode(result.failure.id),
                  result.failure
                );
              }
              return result;
            })
            .filter((result) => result.type === "success")
            .map(async (result) => {
              if (result.type === "success") {
                const code = TildagonAppReleaseIdentifier.toAppCode(
                  result.value.id
                );

                const disallowReason = disallowedApps.find((disallowSpec) => {
                  return Object.entries(disallowSpec).every(([key, value]) => {
                    return result.value.id.hasOwnProperty(key)
                      ? result.value.id[key as keyof typeof result.value.id] ===
                          value
                      : true;
                  });
                });

                if (disallowReason) {
                  ErrorCache.set(code, {
                    id: result.value.id,
                    reason: `Ban: ${JSON.stringify(disallowReason, null, 2)}`,
                  });
                  return "done";
                }

                // Early exit if we already have this release
                if (AppCache.has(code)) {
                  const cachedApp = AppCache.get(code);
                  if (!Bun.deepEquals(cachedApp?.id, result.value.id)) {
                    ErrorCache.set(code, {
                      id: result.value.id,
                      reason: `Hash collision with ${code} - ${cachedApp?.manifest.app.name}`,
                    });
                  }
                  return "done";
                }

                // Here's where we would emit a "we found a new app" event

                const appResult = await source.get(code, result.value);
                if (Result.isNotOk(appResult)) {
                  ErrorCache.set(code, appResult.failure);
                } else if (Result.isOk(appResult)) {
                  AppCache.set(code, appResult.value);
                }
              }
              return "done";
            })
        );
      })
    );

    return Array.from(AppCache.values()).toSorted((a, b) =>
      a.manifest.app.name
        .toLowerCase()
        .localeCompare(b.manifest.app.name.toLowerCase())
    );
  },

  async getApp(
    key: string
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
};
