import { ACCESS_COOKIE, accessToken } from "@/lib/access";

export async function POST(req: Request) {
  const { codigo } = (await req.json().catch(() => ({}))) as { codigo?: string };
  const expected = process.env.ELOTAKE_ACCESS_CODE;
  if (!expected || codigo?.trim() !== expected) {
    await new Promise((r) => setTimeout(r, 800)); // freia tentativas em sequência
    return Response.json({ detail: "código incorreto" }, { status: 401 });
  }
  const res = Response.json({ ok: true });
  res.headers.append(
    "Set-Cookie",
    `${ACCESS_COOKIE}=${await accessToken(expected)}; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=${60 * 60 * 24 * 30}`,
  );
  return res;
}
