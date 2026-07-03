import { defineConfig } from "astro/config";
import icon from "astro-icon";
import node from "@astrojs/node";

// Use static mode for GitHub Pages, server mode for Docker SSR
const isStatic = process.env.APP_STORE_STATIC === "true";

// https://astro.build/config
export default defineConfig({
  ...(isStatic
    ? { output: "static" }
    : {
        adapter: node({
          mode: "standalone",
        }),
        output: "server",
      }),
  site: "https://apps.badge.emfcamp.org",
  //base: process.env.CI ? "/badge-2024-app-store" : undefined,
  integrations: [
    icon({ include: { openmoji: ["backhand-index-pointing-down"] } }),
  ],
});
