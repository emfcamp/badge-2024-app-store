import { CachedRegistryManager } from "tildagon-app-directory-core";

const items = await CachedRegistryManager.listErrors();

const data = { items, count: items.length };

export async function GET() {
  return new Response(JSON.stringify(data), {
    headers: { "Access-Control-Allow-Origin": "*" },
  });
}
