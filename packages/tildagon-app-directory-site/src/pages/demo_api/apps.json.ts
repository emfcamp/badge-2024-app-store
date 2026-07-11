import type { TildagonAppRelease } from "tildagon-app";
import { CachedRegistryManager } from "tildagon-app-directory-api";

const apps = await CachedRegistryManager.listApps();

const data = {
  items: apps.map((app: TildagonAppRelease) => ({
    ...app,
    manifest: {
      ...app.manifest,
      app: {
        ...app.manifest.app,
        category: app.manifest.app.category[0],
      },
    },
  })),
  count: apps.length,
};

export async function GET() {
  return new Response(JSON.stringify(data), {
    headers: { "Access-Control-Allow-Origin": "*" },
  });
}
