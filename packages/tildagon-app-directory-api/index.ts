export { CachedRegistryManager } from "./src/registries/index.ts";
import { CachedRegistryManager } from "./src/registries/index.ts";
import { config, cacheMaxAge } from "./src/config.ts";
import { createResponseCache } from "./src/responseCache.ts";
import { Hono } from "hono";
import type { AppFilters } from "./src/registries/CachedRegistryManager";
import {
  createServer,
  type IncomingMessage,
  type ServerResponse,
} from "node:http";
import { writeFileSync, existsSync, readFileSync, statSync } from "node:fs";
import { extname, join, normalize, resolve } from "node:path";
import { Readable } from "node:stream";

// ── Response cache ──────────────────────────────────────────

const responseCache = createResponseCache({
  ttlMs: config.refreshIntervalMs,
});

// ── Hono app (API routes) ───────────────────────────────────

const api = new Hono();

// Response cache middleware — skip for health/status
api.use("*", async (c, next) => {
  if (c.req.path === "/v1/health" || c.req.path === "/v1/status") {
    return next();
  }

  const cached = responseCache.get(c.req.path);
  if (cached) {
    c.header("Content-Type", cached.contentType);
    c.header("Cache-Control", `public, max-age=${cacheMaxAge()}`);
    c.status(cached.status as 200);
    return c.body(cached.body);
  }

  await next();

  if (c.res.ok) {
    const body = await c.res.clone().text();
    responseCache.set(c.req.path, {
      body,
      contentType: c.res.headers.get("Content-Type") || "application/json",
      status: c.res.status,
      cachedAt: Date.now(),
    });
  }
});

// GET /v1/apps/:code
api.get("/v1/apps/:code", async (c) => {
  const code = c.req.param("code");
  const app = await CachedRegistryManager.getApp(code);
  if (app.type === "success") {
    return c.json(app.value);
  }
  return c.json(app.failure, 404);
});

// GET /v1/apps
api.get("/v1/apps", async (c) => {
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

  const apps = await CachedRegistryManager.listApps(
    Object.keys(filters).length > 0 ? filters : undefined,
  );
  return c.json({ items: apps, count: apps.length });
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
  return c.json(CachedRegistryManager.getStatus());
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
  if (url.pathname.startsWith("/v1")) {
    const webRes = await api.fetch(
      new Request(url, {
        method: req.method,
        headers: req.headers as Record<string, string>,
      }),
    );
    res.statusCode = webRes.status;
    webRes.headers.forEach((v, k) => res.setHeader(k, v));
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

  // Step 1: Blocking initial refresh — ensures cache is never empty
  console.log("Running initial refresh...");
  await CachedRegistryManager.refreshAllSources();
  console.log(
    `Initial refresh done. ${CachedRegistryManager.getStatus().cacheSize} apps loaded.`,
  );

  // Step 2: Heartbeat
  setInterval(() => {
    CachedRegistryManager.refreshAllSources().catch((err) =>
      console.error("Heartbeat refresh failed:", err),
    );
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
