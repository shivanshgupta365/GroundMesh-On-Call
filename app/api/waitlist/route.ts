import { env } from "cloudflare:workers";

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export async function POST(request: Request) {
  try {
    const payload = (await request.json()) as { email?: string };
    const email = payload.email?.trim().toLowerCase() ?? "";

    if (!EMAIL_PATTERN.test(email)) {
      return Response.json({ error: "Enter a valid email address." }, { status: 400 });
    }

    await env.DB.prepare(
      "CREATE TABLE IF NOT EXISTS waitlist (id INTEGER PRIMARY KEY AUTOINCREMENT, email TEXT NOT NULL UNIQUE, created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP)"
    ).run();
    await env.DB.prepare(
      "INSERT INTO waitlist (email) VALUES (?) ON CONFLICT(email) DO NOTHING"
    ).bind(email).run();

    return Response.json({ ok: true }, { status: 201 });
  } catch {
    return Response.json({ error: "Unable to join the waitlist." }, { status: 500 });
  }
}
