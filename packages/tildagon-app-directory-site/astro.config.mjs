import { defineConfig } from "astro/config";
import icon from "astro-icon";

// https://astro.build/config
export default defineConfig({
  output: "static",
  site: "https://apps.badge.emfcamp.org",
  //base: process.env.CI ? "/badge-2024-app-store" : undefined,
  integrations: [
    icon({ include: { openmoji: ["backhand-index-pointing-down"] } }),
  ],
});
