import { CachedRegistryManager } from "../src/registries";
import { join } from "path";
import { writeFileSync } from "node:fs";

const apps = await CachedRegistryManager.listApps();

console.log(JSON.stringify(apps, null, 2));
writeFileSync(
  join(process.env.GITHUB_WORKSPACE || "", "apps.json"),
  JSON.stringify(apps, null, 2),
);
