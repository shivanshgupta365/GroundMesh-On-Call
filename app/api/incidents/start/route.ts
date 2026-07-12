import { startIncident } from "@/lib/incidents";
export const runtime = "nodejs";
export async function POST(request: Request) { return Response.json(startIncident(new URL(request.url).origin), { status: 202 }); }
