import { defineConfig } from "astro/config";

// https://astro.build/config
export default defineConfig({
  output: "static",
  site: "https://emfcamp.github.io/",
  //base: process.env.CI ? "/badge-2024-app-store" : undefined,
});
