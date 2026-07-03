export { CachedRegistryManager } from "./src/registries/index.ts";
import { CachedRegistryManager } from "./src/registries/index.ts";
import { config, cacheMaxAge } from "./src/config.ts";
import { createResponseCache } from "./src/responseCache.ts";
import { createServer } from "node:http";
import { writeFileSync } from "node:fs";

// ── Response cache ──────────────────────────────────────────

const responseCache = createResponseCache({
  ttlMs: config.refreshIntervalMs,
});

// ── Route handlers ──────────────────────────────────────────

async function handleApps(urlSegments: string[], _request: Request) {
  if (urlSegments[0]) {
    const code = urlSegments[0];
    const app = await CachedRegistryManager.getApp(code);
    return new Response(
      JSON.stringify(app.type === "success" ? app.value : app.failure),
      {
        status: app.type === "success" ? 200 : 404,
        headers: { "Content-Type": "application/json" },
      },
    );
  }

  const apps = await CachedRegistryManager.listApps();

  return new Response(JSON.stringify({ items: apps, count: apps.length }), {
    status: 200,
    headers: { "Content-Type": "application/json" },
  });
}

async function routeAPI(urlSegments: string[], request: Request) {
  switch (urlSegments[0]) {
    case "apps":
      return await handleApps(urlSegments.slice(1), request);
    case "failures": {
      const failures = await CachedRegistryManager.listErrors();
      return new Response(
        JSON.stringify({ items: failures, count: failures.length }),
        { status: 200, headers: { "Content-Type": "application/json" } },
      );
    }
    case "health":
      return new Response(
        JSON.stringify({
          status: "ok",
          uptime: process.uptime(),
        }),
        { status: 200, headers: { "Content-Type": "application/json" } },
      );
    case "status":
      return new Response(JSON.stringify(CachedRegistryManager.getStatus()), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      });
    default:
      return new Response("Not found", { status: 404 });
  }
}

// ── Main entry point ────────────────────────────────────────

async function main() {
  const PORT = process.env.PORT || 3000;

  // Step 1: Blocking initial refresh — ensures cache is never empty
  console.log("Running initial refresh...");
  await CachedRegistryManager.refreshAllSources();
  console.log(
    `Initial refresh done. ${CachedRegistryManager.getStatus().cacheSize} apps loaded.`,
  );

  // Step 2: Simple heartbeat
  setInterval(() => {
    CachedRegistryManager.refreshAllSources().catch((err) =>
      console.error("Heartbeat refresh failed:", err),
    );
  }, config.refreshIntervalMs);

  // Step 3: Load Astro SSR handler (production)
  let astroHandler: ((req: any, res: any) => void) | null = null;
  try {
    const handlerPath = "../tildagon-app-directory-site/dist/server/entry.mjs";
    const astroEntry = await import(handlerPath);
    astroHandler = astroEntry.handler;
    console.log("Astro SSR handler loaded.");
  } catch {
    console.warn("Astro SSR handler not found — serving API only");
  }

  // Step 4: Start server only AFTER cache is populated
  const server = createServer(async (req, res) => {
    const url = new URL(req.url!, `http://${req.headers.host}`);
    const segments = url.pathname.split("/").filter(Boolean);

    // Skip response cache for health/status (always live)
    const isUncached =
      url.pathname === "/v1/health" || url.pathname === "/v1/status";

    if (!isUncached) {
      const cached = responseCache.get(url.pathname);
      if (cached) {
        res.statusCode = cached.status;
        res.setHeader("Content-Type", cached.contentType);
        res.setHeader("Cache-Control", `public, max-age=${cacheMaxAge()}`);
        res.end(cached.body);
        return;
      }
    }

    // API routes
    if (segments[0] === "v1") {
      const response = await routeAPI(
        segments.slice(1),
        new Request(url, {
          method: req.method,
          headers: req.headers as any,
        }),
      );
      const body = await response.text();
      const contentType =
        response.headers.get("Content-Type") || "application/json";

      if (!isUncached) {
        responseCache.set(url.pathname, {
          body,
          contentType,
          status: response.status,
          cachedAt: Date.now(),
        });
      }

      res.statusCode = response.status;
      res.setHeader("Content-Type", contentType);
      if (!isUncached) {
        res.setHeader("Cache-Control", `public, max-age=${cacheMaxAge()}`);
      }
      res.end(body);
      return;
    }

    // Everything else → Astro SSR
    if (astroHandler) {
      astroHandler(req, res);
      return;
    }

    res.statusCode = 404;
    res.end("Not found");
  });

  server.listen(PORT, () => {
    const pidFile = `${process.cwd()}/.server.pid`;
    writeFileSync(pidFile, process.pid.toString());
    console.log(`Server process pid: ${process.pid}`);
    console.log(`Server running at http://localhost:${PORT}`);
  });

  server.setTimeout(120_000);
}

// Only start the server if this file is run directly (not imported)
if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch((err) => {
    console.error("Fatal startup error:", err);
    process.exit(1);
  });
}
