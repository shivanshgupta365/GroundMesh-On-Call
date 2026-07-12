import { resetDemo } from "@/lib/incidents";
export const runtime = "nodejs";
export async function POST() {
  try { return Response.json(await resetDemo()); }
  catch (error) { return Response.json({ error: error instanceof Error ? error.message : "Unable to reset." }, { status: 409 }); }
}
