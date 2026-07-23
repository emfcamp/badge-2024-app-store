import { defineConfig } from "astro/config";
import icon from "astro-icon";
import node from "@astrojs/node";

// https://astro.build/config
export default defineConfig({
  adapter: node({
    mode: "middleware",
  }),
  output: "server",
  site: "https://apps.badge.emfcamp.org",
  //base: process.env.CI ? "/badge-2024-app-store" : undefined,
  integrations: [
    icon({ include: { openmoji: ["backhand-index-pointing-down"] } }),
  ],
  vite: {
    ssr: {
      // Don't bundle tildagon-app-directory-api — the Astro SSR pages should
      // use the same CachedRegistryManager singleton as the API server.
      // Otherwise Astro creates a second instance with an independent cache
      // that never gets a heartbeat refresh.
      external: ["tildagon-app-directory-api"],
    },
  },
});
