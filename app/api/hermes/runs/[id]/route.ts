import { hermesRunEvents, stopHermesRun } from "@/lib/hermes";
export const runtime = "nodejs";
export async function GET(_: Request, { params }: { params: Promise<{ id: string }> }) { const { id } = await params; return Response.json(await hermesRunEvents(id)); }
export async function POST(_: Request, { params }: { params: Promise<{ id: string }> }) { const { id } = await params; return Response.json(await stopHermesRun(id)); }
