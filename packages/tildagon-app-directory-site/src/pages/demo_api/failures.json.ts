import { CachedRegistryManager } from "tildagon-app-directory-api";

const items = await CachedRegistryManager.listErrors();

const data = { items, count: items.length };

export async function GET() {
  return new Response(JSON.stringify(data));
}
