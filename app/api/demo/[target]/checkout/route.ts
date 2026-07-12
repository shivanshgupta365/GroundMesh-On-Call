import { checkoutFor, type Target } from "@/lib/demo";

export const runtime = "nodejs";

export async function POST(_: Request, { params }: { params: Promise<{ target: string }> }) {
  const { target } = await params;
  if (target !== "production" && target !== "preview") return Response.json({ error: "Unknown target" }, { status: 404 });
  const result = await checkoutFor(target as Target);
  return Response.json(result, { status: result.status });
}
