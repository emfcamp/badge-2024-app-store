import { CachedRegistryManager } from "./src/registries";

function parseUrlSegments(url: string) {
  const urlSegments = new URL(url).pathname.split("/");
  return urlSegments.slice(1);
}

const PORT = process.env.PORT || 3000;
const server = Bun.serve({
  port: PORT,
  routes: {
    "/v1/apps": async (req) => {
      const apps = await CachedRegistryManager.listApps();

      return new Response(JSON.stringify({ items: apps, count: apps.length }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      });
    },
    "/v1/apps/:id": async (req) => {
      const code = req.params.id;
      const app = await CachedRegistryManager.getApp(code);
      return new Response(
        JSON.stringify(app.type === "success" ? app.value : app.failure),
        {
          status: app.type === "success" ? 200 : 404,
          headers: { "Content-Type": "application/json" },
        },
      );
    },
    "/v1/failures": async () => {
      const failures = await CachedRegistryManager.listErrors();
      return new Response(
        JSON.stringify({ items: failures, count: failures.length }),
        { status: 200, headers: { "Content-Type": "application/json" } },
      );
    },
  },
  async fetch(request) {
    return new Response("Not found", { status: 404 });
  },
  idleTimeout: 120,
});

const pidFile = `${process.cwd()}/.server.pid`;
Bun.write(pidFile, process.pid.toString());
console.log(`Server process pid: ${process.pid}`);
console.log(`Server running at ${server.url}`);
