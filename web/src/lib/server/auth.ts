// Quem está usando o app.
// Com Supabase: a sessão de login (link mágico ou Google). Sem Supabase
// (desenvolvimento local): sempre o mesmo usuário local.

import { supabaseEnabled } from "@/lib/supabase/config";
import { sessionClient } from "@/lib/supabase/server";

export type User = { id: string; email: string };

export const LOCAL_USER: User = { id: "local", email: "local" };

export async function currentUser(): Promise<User | null> {
  if (!supabaseEnabled()) return LOCAL_USER;
  const supabase = await sessionClient();
  const { data } = await supabase.auth.getClaims();
  const claims = data?.claims;
  if (!claims?.sub) return null;
  return { id: claims.sub, email: (claims.email as string | undefined) ?? "" };
}

/** Envolve uma rota da API: exige login e responde 401 sem ele. */
export function withUser<A extends unknown[]>(
  handler: (user: User, req: Request, ...rest: A) => Promise<Response>,
) {
  return async (req: Request, ...rest: A): Promise<Response> => {
    const user = await currentUser();
    if (!user) return Response.json({ detail: "faça login para continuar" }, { status: 401 });
    return handler(user, req, ...rest);
  };
}
