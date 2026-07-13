import { CachedRegistryManager } from "tildagon-app-directory-api";

export async function GET() {
  const items = await CachedRegistryManager.listErrors();
  const data = { items, count: items.length };
  return new Response(JSON.stringify(data), {
    headers: { "Access-Control-Allow-Origin": "*" },
  });
}
