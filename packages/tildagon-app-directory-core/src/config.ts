export const config = {
  refreshIntervalMs: parseInt(process.env.REFRESH_INTERVAL_MS || "") || 600_000,
};

/** Refresh interval in seconds, for Cache-Control max-age. */
export function cacheMaxAge(): number {
  return Math.floor(config.refreshIntervalMs / 1000);
}
