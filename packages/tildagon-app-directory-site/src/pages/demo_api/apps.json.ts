import type { TildagonAppRelease } from "tildagon-app";
import { CachedRegistryManager } from "tildagon-app-directory-core";
import type { APIContext } from "astro";

const apps = await CachedRegistryManager.listApps();

function buildData(baseUrl: string) {
  return {
    items: apps.map((app: TildagonAppRelease) => {
      const rh = app.id.releaseHash || "unknown";
      return {
        ...app,
        tarballUrl: `${baseUrl}/v1/tarballs/${app.code}-${rh}.tar.gz`,
        manifest: {
          ...app.manifest,
          app: {
            ...app.manifest.app,
            category: app.manifest.app.category[0],
          },
        },
      };
    }),
    count: apps.length,
  };
}

export async function GET(context: APIContext) {
  // Astro.site is the production URL from config (https://apps.badge.emfcamp.org).
  // In SSR mode we use it directly; in static mode it's baked into the output.
  const baseUrl = context.site?.origin ?? "https://apps.badge.emfcamp.org";
  return new Response(JSON.stringify(buildData(baseUrl)), {
    headers: { "Access-Control-Allow-Origin": "*" },
  });
}
