import { defineConfig } from "astro/config";

// https://astro.build/config
export default defineConfig({
  output: "static",
  site: "https://apps.badge.emfcamp.org",
  //base: process.env.CI ? "/badge-2024-app-store" : undefined,
});
