import { Counter, Gauge, Histogram, Registry } from "prom-client";

export const register = new Registry();

// ── HTTP ────────────────────────────────────────────────────

export const httpRequestsTotal = new Counter({
  name: "app_store_http_requests_total",
  help: "Total HTTP requests handled",
  labelNames: ["method", "route", "status"],
  registers: [register],
});

export const httpRequestDuration = new Histogram({
  name: "app_store_http_request_duration_seconds",
  help: "HTTP request duration in seconds",
  labelNames: ["method", "route"],
  buckets: [0.01, 0.05, 0.1, 0.25, 0.5, 1, 2.5, 5, 10],
  registers: [register],
});

// ── Response cache ──────────────────────────────────────────

export const responseCacheHits = new Counter({
  name: "app_store_response_cache_hits_total",
  help: "Response cache hits",
  registers: [register],
});

export const responseCacheMisses = new Counter({
  name: "app_store_response_cache_misses_total",
  help: "Response cache misses",
  registers: [register],
});

export const responseCacheBypass = new Counter({
  name: "app_store_response_cache_bypass_total",
  help: "Response cache bypassed because a refresh was in progress",
  registers: [register],
});

// ── App cache ───────────────────────────────────────────────

export const appCacheSize = new Gauge({
  name: "app_store_apps_total",
  help: "Number of apps in cache",
  labelNames: ["service"],
  registers: [register],
});

export const errorCacheSize = new Gauge({
  name: "app_store_errors_total",
  help: "Number of apps in error cache",
  registers: [register],
});

/** Info metric — set to 1 for each app so operators can join app metadata */
export const appInfo = new Gauge({
  name: "app_store_app_info",
  help: "App metadata for joining with other metrics",
  labelNames: ["service", "app_code", "name", "author", "category"],
  registers: [register],
});

// ── Refresh ─────────────────────────────────────────────────

export const refreshTotal = new Counter({
  name: "app_store_refresh_total",
  help: "Total refresh attempts",
  labelNames: ["status"],
  registers: [register],
});

export const refreshDuration = new Histogram({
  name: "app_store_refresh_duration_seconds",
  help: "Time to complete a full refresh of all sources",
  buckets: [1, 5, 10, 30, 60, 120, 300, 600],
  registers: [register],
});

export const refreshLastSuccess = new Gauge({
  name: "app_store_refresh_last_success_timestamp_seconds",
  help: "Unix timestamp of the last successful refresh",
  registers: [register],
});

export const refreshInProgress = new Gauge({
  name: "app_store_refresh_in_progress",
  help: "1 if a refresh is currently running, 0 otherwise",
  registers: [register],
});

// ── Source API calls ────────────────────────────────────────

export const sourceApiRequests = new Counter({
  name: "app_store_source_api_requests_total",
  help: "Total API calls to registry sources (GitHub, Codeberg, etc.)",
  labelNames: ["service", "operation", "status"],
  registers: [register],
});

export const sourceApiDuration = new Histogram({
  name: "app_store_source_api_duration_seconds",
  help: "Duration of API calls to registry sources",
  labelNames: ["service", "operation"],
  buckets: [0.1, 0.5, 1, 2, 5, 10, 30, 60],
  registers: [register],
});

// ── Process ─────────────────────────────────────────────────

export const processUptime = new Gauge({
  name: "app_store_process_uptime_seconds",
  help: "Process uptime in seconds",
  registers: [register],
});

export const heapBytesUsed = new Gauge({
  name: "app_store_nodejs_heap_bytes_used",
  help: "Node.js heap memory used in bytes",
  registers: [register],
});

// ── Downloads ───────────────────────────────────────────────

/**
 * Incremented each time the /v1/apps/:code/download endpoint is hit,
 * regardless of whether the tarball is cached or redirected to origin.
 * Labels: service (github/codeberg), app_code.
 */
export const downloadsTotal = new Counter({
  name: "app_store_downloads_total",
  help: "Total app download requests",
  labelNames: ["service", "app_code"],
  registers: [register],
});

// ── Helpers ─────────────────────────────────────────────────

/** Update process-level gauges (call before serving /metrics). */
export function refreshProcessMetrics(): void {
  processUptime.set(process.uptime());
  heapBytesUsed.set(process.memoryUsage().heapUsed);
}

/**
 * Normalize a request path into a route pattern for metric labels.
 * e.g. /v1/apps/12345678 → /v1/apps/:code
 */
export function normalizeRoute(path: string): string {
  return path.replace(/\/v1\/apps\/\d{8}/g, "/v1/apps/:code");
}
