import { getIncident } from "@/lib/incidents";
export const runtime = "nodejs";
export async function GET() { return Response.json(getIncident()); }
