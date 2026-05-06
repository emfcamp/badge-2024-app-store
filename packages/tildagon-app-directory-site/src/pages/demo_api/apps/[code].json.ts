import type { APIRoute } from "astro";
import { CachedRegistryManager } from "tildagon-app-directory-api";

export const GET: APIRoute = async ({ params }) => {
  const apps = await CachedRegistryManager.listApps();

  const data = { items: apps, count: apps.length };

  return new Response(JSON.stringify(data));
};

export async function getStaticPaths() {
  const res = await fetch("http://localhost:3000/v1/apps");
  const apps = await res.json();

  const paths = apps.items.map((app: any) => ({
    params: { code: app.code },
  }));

  return paths;
}
