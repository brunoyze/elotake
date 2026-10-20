// Código de acesso: enquanto não há login, quem tem o código usa o app.
// Sem ELOTAKE_ACCESS_CODE (desenvolvimento), o app fica aberto.

export const ACCESS_COOKIE = "elotake_acesso";

export async function accessToken(code: string): Promise<string> {
  const data = new TextEncoder().encode(`elotake:${code}`);
  const hash = await crypto.subtle.digest("SHA-256", data);
  return Array.from(new Uint8Array(hash), (b) => b.toString(16).padStart(2, "0")).join("");
}

export async function hasAccess(cookieValue: string | undefined): Promise<boolean> {
  const code = process.env.ELOTAKE_ACCESS_CODE;
  if (!code) return true;
  return Boolean(cookieValue) && cookieValue === (await accessToken(code));
}

export async function requestHasAccess(request: Request): Promise<boolean> {
  const cookie = request.headers
    .get("cookie")
    ?.split(";")
    .map((c) => c.trim().split("="))
    .find(([k]) => k === ACCESS_COOKIE)?.[1];
  return hasAccess(cookie);
}
