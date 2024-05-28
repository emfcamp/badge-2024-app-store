const directory = await fetch("http://localhost:3000/v1/failures");
const data = await directory.json();

export async function GET() {
  return new Response(JSON.stringify(data));
}
