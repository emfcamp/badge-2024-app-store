import { CachedRegistryManager } from "tildagon-app-directory-api";

const apps = await CachedRegistryManager.listApps();

const data = { items: apps, count: apps.length };

export async function GET() {
  return new Response(JSON.stringify(data));
}
