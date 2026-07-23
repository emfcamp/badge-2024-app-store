export { CachedRegistryManager } from "tildagon-app-directory-core";
import { CachedRegistryManager, config } from "tildagon-app-directory-core";
import { createResponseCache } from "./src/responseCache.ts";
import { Hono } from "hono";
import type { Context } from "hono";
import type { AppFilters } from "tildagon-app-directory-core";
import {
  register,
  httpRequestsTotal,
  httpRequestDuration,
  responseCacheHits,
  responseCacheMisses,
  responseCacheBypass,
  refreshProcessMetrics,
  normalizeRoute,
  downloadsTotal,
  refreshTotal,
  refreshDuration,
  refreshLastSuccess,
  refreshLastSuccessByService,
  refreshInProgress,
  refreshAppsUpdated,
  sourceApiRequests,
  sourceApiDuration,
  appCacheSize,
  errorCacheSize,
  appInfo,
} from "./src/metrics.js";
import {
  createServer,
  type IncomingMessage,
  type ServerResponse,
} from "node:http";
import {
  writeFileSync,
  existsSync,
  readFileSync,
  statSync,
  createReadStream,
  createWriteStream,
  mkdirSync,
} from "node:fs";
import { extname, join, normalize, resolve, dirname } from "node:path";
import type { TildagonAppRelease } from "tildagon-app";
import { Readable } from "node:stream";
import { pipeline } from "node:stream/promises";
import { randomUUID } from "node:crypto";

// ── Container identity ─────────────────────────────────────

const containerId = randomUUID().slice(0, 8);

function escapeXml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

// ── Git commit hash ────────────────────────────────────────

let commitSha = "unknown";
try {
  commitSha = readFileSync("/app/commit.txt", "utf-8").trim();
} catch {
  // Not running in Docker or file not found — use "unknown"
}

// ── Response cache ──────────────────────────────────────────

/** Refresh interval in seconds, for Cache-Control max-age. */
function cacheMaxAge(): number {
  return Math.floor(config.refreshIntervalMs / 1000);
}

const responseCache = createResponseCache({
  ttlMs: config.refreshIntervalMs,
});

// ── Helpers ──────────────────────────────────────────────────

// ── Helpers ──────────────────────────────────────────────────

/** Get the base URL (proto + host) from the request context, respecting proxies. */
function getBaseUrl(c: Context): string {
  const proto = c.req.header("x-forwarded-proto") || "http";
  const host = c.req.header("host")!;
  return `${proto}://${host}`;
}

/** Rewrite an app's tarballUrl to point at our proxy/cache endpoint. */
function proxyTarballUrl(
  app: TildagonAppRelease,
  baseUrl: string,
): TildagonAppRelease {
  const rh = app.id.releaseHash || "unknown";
  return {
    ...app,
    tarballUrl: `${baseUrl}/v1/tarballs/${app.code}-${rh}.tar.gz`,
  };
}

function parseAppFilters(c: Context): AppFilters | undefined {
  const filters: AppFilters = {};
  const category = c.req.query("category");
  const author = c.req.query("author");
  const license = c.req.query("license");
  const service = c.req.query("service");
  const vid = c.req.query("vid");
  const pid = c.req.query("pid");
  const frontboard = c.req.query("frontboard");
  const q = c.req.query("q");
  if (category) filters.category = category;
  if (author) filters.author = author;
  if (license) filters.license = license;
  if (service) filters.service = service;
  if (vid) filters.vid = vid;
  if (pid) filters.pid = pid;
  if (frontboard) filters.frontboard = frontboard;
  if (q) filters.q = q;

  const caps = c.req.queries("capability");
  if (caps && caps.length > 0) filters.capabilities = caps;

  const requiredCaps = c.req.queries("required_capability");
  if (requiredCaps && requiredCaps.length > 0)
    filters.required_capabilities = requiredCaps;

  const supportedCaps = c.req.queries("supported_capability");
  if (supportedCaps && supportedCaps.length > 0)
    filters.supported_capabilities = supportedCaps;

  return Object.keys(filters).length > 0 ? filters : undefined;
}

// ── Wire metrics into the shared CachedRegistryManager singleton ─

CachedRegistryManager.setMetrics({
  refreshTotal,
  refreshDuration,
  refreshLastSuccess,
  refreshLastSuccessByService,
  refreshInProgress,
  refreshAppsUpdated,
  sourceApiRequests,
  sourceApiDuration,
  appCacheSize,
  errorCacheSize,
  appInfo,
});

// ── Hono app (API routes) ───────────────────────────────────

const api = new Hono();

// HTTP metrics middleware — runs first so all responses are measured
api.use("*", async (c, next) => {
  c.header("Access-Control-Allow-Origin", "*");
  c.header("X-Container-Id", containerId);
  const start = Date.now();
  await next();
  const duration = (Date.now() - start) / 1000;
  const route = normalizeRoute(c.req.routePath || c.req.path);
  const status = String(c.res.status);
  httpRequestsTotal.inc({ method: c.req.method, route, status });
  httpRequestDuration.observe({ method: c.req.method, route }, duration);
});

// CORS preflight — all API routes
api.options("*", (c) => {
  c.header("Access-Control-Allow-Origin", "*");
  c.header("Access-Control-Allow-Methods", "GET, OPTIONS");
  c.header("Access-Control-Allow-Headers", "Content-Type");
  return c.body(null, 204);
});

// Response cache middleware — skip for health/status/metrics and during refresh
api.use("*", async (c, next) => {
  if (
    c.req.path === "/v1/health" ||
    c.req.path === "/v1/status" ||
    c.req.path === "/metrics" ||
    c.req.path.startsWith("/v1/tarballs")
  ) {
    return next();
  }

  // During a refresh, skip the response cache entirely — AppCache may be
  // partially populated. Use a short TTL so nginx doesn't hold on to a
  // mid-refresh snapshot.
  if (CachedRegistryManager.getStatus().refreshInProgress) {
    responseCacheBypass.inc();
    await next();
    c.header("Cache-Control", "private, max-age=5");
    return;
  }

  const cached = responseCache.get(c.req.url);
  if (cached) {
    responseCacheHits.inc();
    c.header("Content-Type", cached.contentType);
    c.header("Cache-Control", `public, max-age=${cacheMaxAge()}`);
    c.status(cached.status as 200);
    return c.body(cached.body);
  }

  await next();

  responseCacheMisses.inc();
  if (c.res.ok) {
    const body = await c.res.clone().text();
    responseCache.set(c.req.url, {
      body,
      contentType: c.res.headers.get("Content-Type") || "application/json",
      status: c.res.status,
      cachedAt: Date.now(),
    });
  }
});

// GET /v1/apps/rss
api.get("/v1/apps/rss", async (c) => {
  const filters = parseAppFilters(c);
  const apps = await CachedRegistryManager.listApps(filters);

  const sorted = apps.toSorted(
    (a, b) =>
      new Date(b.releaseTime).getTime() - new Date(a.releaseTime).getTime(),
  );

  const items = sorted
    .slice(0, 50)
    .map(
      (app) => `
    <item>
      <title>${escapeXml(app.manifest.app.name)}</title>
      <link>https://apps.badge.emfcamp.org/apps/${app.code}</link>
      <description>${escapeXml(app.manifest.metadata.description)}</description>
      <author>${escapeXml(app.manifest.metadata.author)}</author>
      ${app.manifest.app.category.map((cat) => `      <category>${escapeXml(cat)}</category>`).join("\n")}
      <pubDate>${new Date(app.releaseTime).toUTCString()}</pubDate>
      <guid isPermaLink="false">${app.code}</guid>
    </item>`,
    )
    .join("");

  const rss = `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0" xmlns:atom="http://www.w3.org/2005/Atom">
  <channel>
    <title>Tildagon App Store${filters ? ` — Filtered` : ""}</title>
    <link>https://apps.badge.emfcamp.org</link>
    <description>Latest apps for the Tildagon badge${filters ? ` (filtered)` : ""}</description>
    <atom:link href="https://apps.badge.emfcamp.org${c.req.url}" rel="self" type="application/rss+xml"/>
    <lastBuildDate>${new Date().toUTCString()}</lastBuildDate>${items}
  </channel>
</rss>`;

  c.header("Content-Type", "application/rss+xml; charset=utf-8");
  return c.body(rss);
});

// GET /v1/apps/:code/download — count + redirect to cached tarball
api.get("/v1/apps/:code/download", async (c) => {
  const code = c.req.param("code");
  const app = await CachedRegistryManager.getApp(code);
  if (app.type !== "success") {
    return c.json(app.failure, 404);
  }

  const rh = app.value.id.releaseHash || "unknown";

  downloadsTotal.inc({
    service: app.value.id.service,
    app_code: code,
  });

  // If not cached yet, fetch from origin before redirecting
  if (!CachedRegistryManager.hasCachedTarball(code, rh)) {
    const originUrl = CachedRegistryManager.getOriginTarballUrl(code, rh);
    if (originUrl) {
      await CachedRegistryManager.downloadTarball(code, rh, originUrl);
    }
  }

  const redirectUrl = `${getBaseUrl(c)}/v1/tarballs/${code}-${rh}.tar.gz`;
  return c.redirect(redirectUrl, 302);
});

// GET /v1/apps/:code
api.get("/v1/apps/:code", async (c) => {
  const code = c.req.param("code");
  const app = await CachedRegistryManager.getApp(code);
  if (app.type === "success") {
    return c.json(proxyTarballUrl(app.value, getBaseUrl(c)));
  }
  return c.json(app.failure, 404);
});

// GET /v1/apps
api.get("/v1/apps", async (c) => {
  const filters = parseAppFilters(c);
  const apps = await CachedRegistryManager.listApps(filters);
  return c.json({
    items: apps.map((a) => proxyTarballUrl(a, getBaseUrl(c))),
    count: apps.length,
  });
});

// GET /v1/failures
api.get("/v1/failures", async (c) => {
  const failures = await CachedRegistryManager.listErrors();
  return c.json({ items: failures, count: failures.length });
});

// GET /v1/health
api.get("/v1/health", (c) => {
  return c.json({ status: "ok", uptime: process.uptime() });
});

// GET /v1/status
api.get("/v1/status", (c) => {
  return c.json({ ...CachedRegistryManager.getStatus(), commit: commitSha });
});

// GET /v1/tarballs/:filename — serve cached tarballs from disk,
// fetching from origin and caching on miss.
api.get("/v1/tarballs/:filename", async (c) => {
  const filename = c.req.param("filename");
  const match = filename.match(/^(\d{8})-(.+)\.tar\.gz$/);
  if (!match) return c.notFound();
  const code = match[1]!;
  const releaseHash = match[2]!;

  // Fetch from origin and cache on miss
  if (!CachedRegistryManager.hasCachedTarball(code, releaseHash)) {
    const originUrl = CachedRegistryManager.getOriginTarballUrl(
      code,
      releaseHash,
    );
    if (!originUrl) return c.notFound();

    try {
      const dest = CachedRegistryManager.getCachedTarballPath(
        code,
        releaseHash,
      );
      const dir = dirname(dest);
      if (!existsSync(dir)) mkdirSync(dir, { recursive: true });

      const response = await fetch(originUrl);
      if (!response.ok || !response.body) {
        return c.json({ error: "Upstream fetch failed" }, 502);
      }
      await pipeline(response.body, createWriteStream(dest));
    } catch (err) {
      console.warn(`Failed to fetch tarball for ${code}:`, err);
      return c.json({ error: "Failed to fetch tarball" }, 502);
    }
  }

  const path = CachedRegistryManager.getCachedTarballPath(code, releaseHash);
  if (!existsSync(path)) return c.notFound();

  c.header("Content-Type", "application/gzip");
  c.header("Cache-Control", "public, max-age=31536000, immutable");
  return c.body(Readable.toWeb(createReadStream(path)) as ReadableStream);
});

// GET /metrics
api.get("/metrics", async (c) => {
  refreshProcessMetrics();
  CachedRegistryManager.refreshCacheMetrics();
  c.header("Content-Type", register.contentType);
  return c.body(await register.metrics());
});

// ── Astro SSR ───────────────────────────────────────────────

const clientDistDir = resolve(
  import.meta.dirname!,
  "../tildagon-app-directory-site/dist/client",
);

let astroHandler: ((req: IncomingMessage, res: ServerResponse) => void) | null =
  null;

// ── Static file helpers ─────────────────────────────────────

const mimeTypes: Record<string, string> = {
  ".css": "text/css",
  ".js": "application/javascript",
  ".mjs": "application/javascript",
  ".json": "application/json",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".avif": "image/avif",
  ".jxl": "image/jxl",
  ".webp": "image/webp",
  ".woff": "font/woff",
  ".woff2": "font/woff2",
  ".ico": "image/x-icon",
  ".html": "text/html; charset=utf-8",
};

function tryServeStatic(url: URL, res: ServerResponse): boolean {
  const filePath = join(clientDistDir, url.pathname);
  const normalizedPath = normalize(filePath);

  if (!normalizedPath.startsWith(clientDistDir)) return false;

  try {
    if (existsSync(normalizedPath) && statSync(normalizedPath).isFile()) {
      const content = readFileSync(normalizedPath);
      const ext = extname(normalizedPath).toLowerCase();
      const contentType = mimeTypes[ext] || "application/octet-stream";
      const isHashed = url.pathname.startsWith("/static/");
      const maxAge = isHashed ? 31536000 : 3600;

      res.statusCode = 200;
      res.setHeader("Content-Type", contentType);
      res.setHeader(
        "Cache-Control",
        `public, max-age=${maxAge}${isHashed ? ", immutable" : ""}`,
      );
      res.end(content);
      return true;
    }
  } catch {
    // File doesn't exist or can't be read — not a static file
  }

  return false;
}

// ── Request routing ─────────────────────────────────────────

async function handleRequest(req: IncomingMessage, res: ServerResponse) {
  const url = new URL(req.url!, `http://${req.headers.host}`);

  // API routes → Hono
  if (url.pathname.startsWith("/v1") || url.pathname === "/metrics") {
    const webRes = await api.fetch(
      new Request(url, {
        method: req.method,
        headers: req.headers as Record<string, string>,
      }),
    );
    res.statusCode = webRes.status;
    webRes.headers.forEach((v, k) => res.setHeader(k, v));
    // Badge firmware bug: only accepts Location with capital L.
    // Web Standard Headers API lowercases all names, so re-set it.
    const location = webRes.headers.get("location");
    if (location) {
      res.setHeader("Location", location);
    }
    if (webRes.body) {
      streamBody(webRes.body, res);
    } else {
      res.end();
    }
    return;
  }

  // No Astro SSR → 404
  if (!astroHandler) {
    res.statusCode = 404;
    res.end("Not found");
    return;
  }

  // Static file → serve directly
  if (tryServeStatic(url, res)) return;

  // Everything else → Astro SSR
  astroHandler(req, res);
}

function streamBody(body: ReadableStream<Uint8Array>, res: ServerResponse) {
  const reader = body.getReader();
  const stream = new Readable({
    async read() {
      try {
        const { done, value } = await reader.read();
        if (done) {
          this.push(null);
        } else {
          this.push(Buffer.from(value));
        }
      } catch (err) {
        this.destroy(err as Error);
      }
    },
  });
  stream.pipe(res);
}

// ── Main entry point ────────────────────────────────────────

async function main() {
  const PORT = parseInt(process.env.PORT || "3000", 10);

  // Step 1: Load cache from disk (if available), then run initial refresh.
  // If a disk cache exists, serve from it immediately while doing the initial
  // fetch in the background (cold start with stale data, then warm up).
  // If no disk cache exists, block until the initial fetch completes.
  const loadedFromDisk = CachedRegistryManager.loadFromDisk();
  if (!loadedFromDisk) {
    console.log("No disk cache found, running initial refresh...");
    await CachedRegistryManager.refreshAllSources();
    console.log(
      `Initial refresh done. ${CachedRegistryManager.getStatus().cacheSize} apps loaded.`,
    );
  } else {
    console.log(
      `Disk cache loaded with ${CachedRegistryManager.getStatus().cacheSize} apps — starting background refresh.`,
    );
    // Fire-and-forget: serve stale data now, warm up in the background
    CachedRegistryManager.refreshAllSources().catch((err) =>
      console.error("Background refresh after disk cache load failed:", err),
    );
  }

  // Step 2: Heartbeat — clear response cache after each successful refresh
  setInterval(async () => {
    try {
      await CachedRegistryManager.refreshAllSources();
      responseCache.clear();
    } catch (err) {
      console.error("Heartbeat refresh failed:", err);
    }
  }, config.refreshIntervalMs);

  // Step 3: Load Astro SSR handler (production)
  try {
    const handlerPath = "../tildagon-app-directory-site/dist/server/entry.mjs";
    const astroEntry = await import(handlerPath);
    astroHandler = astroEntry.handler;
    console.log("Astro SSR handler loaded.");
  } catch (err) {
    console.warn("Astro SSR handler not found — serving API only:", err);
  }
  const server = createServer(handleRequest);
  server.setTimeout(120_000);

  server.listen(PORT, () => {
    const pidFile = `${process.cwd()}/.server.pid`;
    writeFileSync(pidFile, process.pid.toString());
    console.log(`Server process pid: ${process.pid}`);
    console.log(`Server running at http://localhost:${PORT}`);
  });
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch((err) => {
    console.error("Fatal startup error:", err);
    process.exit(1);
  });
}
