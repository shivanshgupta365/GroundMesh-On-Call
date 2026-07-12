import { startHermesRun } from "@/lib/hermes";

export const runtime = "nodejs";

export async function POST(request: Request) {
  try {
    const body = await request.json() as { input?: unknown };
    if (typeof body.input !== "string" || body.input.trim().length === 0) {
      return Response.json({ error: "A non-empty run input is required." }, { status: 400 });
    }
    return Response.json(await startHermesRun(body.input));
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : "Unable to start Hermes run." }, { status: 503 });
  }
}
