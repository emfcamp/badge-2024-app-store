import type { APIRoute } from "astro";

export const GET: APIRoute = async ({ params }) => {
  const directory = await fetch(`http://localhost:3000/v1/apps/${params.code}`);
  const data = await directory.json();
  return new Response(JSON.stringify(data));
};

export async function getStaticPaths() {
  const res = await fetch("http://localhost:3000/v1/apps");
  const apps = await res.json();

  const paths = apps.items.map((app: any) => ({
    params: { code: app.code },
  }));

  return paths;
}
