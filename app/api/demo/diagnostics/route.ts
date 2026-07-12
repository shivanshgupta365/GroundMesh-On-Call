import { diagnostics } from "@/lib/demo";

export const runtime = "nodejs";

export async function GET() {
  return Response.json(await diagnostics());
}
