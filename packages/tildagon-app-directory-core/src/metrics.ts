/**
 * Metrics hooks that the API server can wire up to prom-client.
 * In the core library, all calls are no-ops (via optional chaining).
 * The API server passes real prom-client metrics to `createCachedRegistryManager`.
 */
export interface MetricsCollector {
  refreshTotal?: { inc(obj: { status: string }): void };
  refreshDuration?: { observe(seconds: number): void };
  refreshLastSuccess?: { set(ts: number): void };
  refreshLastSuccessByService?: {
    set(labels: { service: string }, ts: number): void;
  };
  refreshInProgress?: { set(v: number): void };
  refreshAppsUpdated?: {
    reset(): void;
    set(labels: { service: string }, v: number): void;
  };
  sourceApiRequests?: {
    inc(labels: { service: string; operation: string; status: string }): void;
  };
  sourceApiDuration?: {
    observe(
      labels: { service: string; operation: string },
      seconds: number,
    ): void;
  };
  appCacheSize?: {
    set(labels: { service: string }, count: number): void;
  };
  errorCacheSize?: { set(count: number): void };
  appInfo?: {
    reset(): void;
    set(
      labels: {
        service: string;
        app_code: string;
        name: string;
        author: string;
        category: string;
      },
      v: number,
    ): void;
  };
}
