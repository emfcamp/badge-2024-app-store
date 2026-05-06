export { CachedRegistryManager } from "./src/registries/index.ts";
import { CachedRegistryManager } from "./src/registries/index.ts";
import { createServer } from "node:http";
import { writeFileSync } from "node:fs";

function parseUrlSegments(url: string) {
  const urlSegments = new URL(`http://example.com${url}`).pathname.split("/");
  return urlSegments.slice(1);
}

async function handleApps(urlSegments: string[], request: Request) {
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
    case "failures":
      const failures = await CachedRegistryManager.listErrors();
      return new Response(
        JSON.stringify({ items: failures, count: failures.length }),
        { status: 200, headers: { "Content-Type": "application/json" } },
      );
    default:
      return new Response("Not found", { status: 404 });
  }
}

// Only start the server if this file is run directly (not imported)
if (import.meta.url === `file://${process.argv[1]}`) {
  const PORT = process.env.PORT || 3000;
  const server = createServer(async (req, res) => {
    const urlSegments = parseUrlSegments(req.url!);

    const response = await (async () => {
      switch (urlSegments[0]) {
        case "v1":
          return await routeAPI(
            urlSegments.slice(1),
            new Request(`http://${req.headers.host}${req.url!}`, { method: req.method, headers: req.headers }),
          );
        default:
          return new Response("Not found", { status: 404 });
      }
    })();

    res.statusCode = response.status;
    res.setHeader(
      "Content-Type",
      response.headers.get("Content-Type") || "text/plain",
    );
    res.end(await response.text());
  });

  server.listen(PORT, () => {
    const pidFile = `${process.cwd()}/.server.pid`;
    writeFileSync(pidFile, process.pid.toString());
    console.log(`Server process pid: ${process.pid}`);
    console.log(`Server running at ${PORT}`);
  });

  server.setTimeout(120000);
}
