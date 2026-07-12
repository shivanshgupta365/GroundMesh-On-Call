import { hermesHealth } from "@/lib/hermes";
export const runtime = "nodejs";
export async function GET() { return Response.json(await hermesHealth()); }
