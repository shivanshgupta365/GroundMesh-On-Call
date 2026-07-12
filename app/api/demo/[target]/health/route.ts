import { healthFor, type Target } from "@/lib/demo";

export const runtime = "nodejs";

export async function GET(_: Request, { params }: { params: Promise<{ target: Target }> }) {
  const { target } = await params;
  if (target !== "production" && target !== "preview") return Response.json({ error: "Unknown target" }, { status: 404 });
  return Response.json(await healthFor(target));
}
