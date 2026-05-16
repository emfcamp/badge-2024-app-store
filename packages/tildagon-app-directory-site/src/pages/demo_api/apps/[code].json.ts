import type { APIRoute } from "astro";
import { CachedRegistryManager } from "tildagon-app-directory-api";

export const GET: APIRoute = async ({}) => {
  const apps = await CachedRegistryManager.listApps();

  const data = { items: apps, count: apps.length };

  return new Response(JSON.stringify(data));
};

export async function getStaticPaths() {
  const apps = await CachedRegistryManager.listApps();

  const paths = apps.map((app: any) => ({
    params: { code: app.code },
  }));

  return paths;
}
