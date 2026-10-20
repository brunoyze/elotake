// Volta do link mágico e do Google: troca o código pela sessão e segue para o app.
import type { EmailOtpType } from "@supabase/supabase-js";
import { NextResponse } from "next/server";
import { sessionClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const url = new URL(request.url);
  const next = url.searchParams.get("next");
  const target = next?.startsWith("/") && !next.startsWith("//") ? next : "/";
  const code = url.searchParams.get("code");
  const tokenHash = url.searchParams.get("token_hash");
  const type = url.searchParams.get("type") as EmailOtpType | null;

  const supabase = await sessionClient();
  const { error } = code
    ? await supabase.auth.exchangeCodeForSession(code)
    : tokenHash && type
      ? await supabase.auth.verifyOtp({ token_hash: tokenHash, type })
      : { error: new Error("link incompleto") };

  if (error) return NextResponse.redirect(new URL("/entrar?erro=link", url.origin));
  return NextResponse.redirect(new URL(target, url.origin));
}
