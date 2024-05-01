import { CachedRegistryManager } from "../src/registries";
import { join } from "path";

const apps = await CachedRegistryManager.listApps();

console.log(JSON.stringify(apps, null, 2));
Bun.write(
  join(process.env.GITHUB_WORKSPACE, "apps.json"),
  JSON.stringify(apps, null, 2)
);
