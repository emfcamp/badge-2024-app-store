import { CachedRegistryManager } from "tildagon-app-directory-api";

export async function GET() {
  const data = await CachedRegistryManager.listApps();

  const escapeXml = (s: string): string =>
    s
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&apos;");

  const items = data
    .toSorted(
      (a, b) =>
        new Date(b.releaseTime).getTime() - new Date(a.releaseTime).getTime(),
    )
    .slice(0, 50)
    .map(
      (app) => `    <item>
      <title>${escapeXml(app.manifest.app.name)}</title>
      <link>https://apps.badge.emfcamp.org/apps/${app.code}</link>
      <description>${escapeXml(app.manifest.metadata.description)}</description>
      <author>${escapeXml(app.manifest.metadata.author)}</author>
${app.manifest.app.category.map((cat) => `      <category>${escapeXml(cat)}</category>`).join("\n")}
      <pubDate>${new Date(app.releaseTime).toUTCString()}</pubDate>
      <guid isPermaLink="false">${app.code}</guid>
    </item>`,
    )
    .join("\n");

  const rss = `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0" xmlns:atom="http://www.w3.org/2005/Atom">
  <channel>
    <title>Tildagon App Store</title>
    <link>https://apps.badge.emfcamp.org</link>
    <description>Latest apps for the Tildagon badge</description>
    <atom:link href="https://apps.badge.emfcamp.org/rss.xml" rel="self" type="application/rss+xml"/>
    <lastBuildDate>${new Date().toUTCString()}</lastBuildDate>
${items}
  </channel>
</rss>`;

  return new Response(rss, {
    headers: { "Content-Type": "application/rss+xml; charset=utf-8" },
  });
}
