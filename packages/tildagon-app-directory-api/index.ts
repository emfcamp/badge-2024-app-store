import { CachedRegistryManager } from "./src/registries";

function parseUrlSegments(url: string) {
  const urlSegments = new URL(url).pathname.split("/");
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
      }
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
        { status: 200, headers: { "Content-Type": "application/json" } }
      );
    default:
      return new Response("Not found", { status: 404 });
  }
}

const server = Bun.serve({
  port: process.env.PORT || 3000,
  async fetch(request) {
    const urlSegments = parseUrlSegments(request.url);

    switch (urlSegments[0]) {
      case "v1":
        return await routeAPI(urlSegments.slice(1), request);
      default:
        return new Response("Not found", { status: 404 });
    }
  },
});

const pidFile = `${process.cwd()}/.server.pid`;
Bun.write(pidFile, process.pid.toString());
console.log(`Server process pid: ${process.pid}`);
console.log(`Server running at ${server.port}`);
