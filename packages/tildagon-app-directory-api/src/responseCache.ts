export interface CachedResponse {
  body: string;
  contentType: string;
  status: number;
  cachedAt: number;
}

export interface ResponseCache {
  get(key: string): CachedResponse | null;
  set(key: string, entry: CachedResponse): void;
}

export function createResponseCache(options: {
  ttlMs: number;
  clock?: () => number;
}): ResponseCache {
  const now = options.clock ?? (() => Date.now());
  const cache = new Map<string, CachedResponse>();

  return {
    get(key: string): CachedResponse | null {
      const entry = cache.get(key);
      if (!entry) return null;
      if (now() - entry.cachedAt > options.ttlMs) {
        cache.delete(key);
        return null;
      }
      return entry;
    },

    set(key: string, entry: CachedResponse): void {
      cache.set(key, entry);
    },
  };
}
