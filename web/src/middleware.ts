import { createServerClient } from "@supabase/ssr";
import { type NextRequest, NextResponse } from "next/server";
import { supabaseEnabled, supabasePublishableKey, supabaseUrl } from "@/lib/supabase/config";

// Renova a sessão de login a cada requisição e manda para /entrar quem não está logado.
export async function middleware(request: NextRequest) {
  if (!supabaseEnabled()) return NextResponse.next();

  let response = NextResponse.next({ request });
  const supabase = createServerClient(supabaseUrl, supabasePublishableKey, {
    cookies: {
      getAll: () => request.cookies.getAll(),
      setAll(toSet, headers) {
        for (const { name, value } of toSet) request.cookies.set(name, value);
        response = NextResponse.next({ request });
        for (const { name, value, options } of toSet) response.cookies.set(name, value, options);
        for (const [key, value] of Object.entries(headers)) response.headers.set(key, value);
      },
    },
  });
  const { data } = await supabase.auth.getClaims();
  if (data?.claims?.sub) return response;

  const { pathname } = request.nextUrl;
  if (pathname === "/entrar" || pathname.startsWith("/auth/")) return response;
  if (pathname.startsWith("/api/")) {
    return NextResponse.json({ detail: "faça login para continuar" }, { status: 401 });
  }
  const url = request.nextUrl.clone();
  url.pathname = "/entrar";
  url.search = `?next=${encodeURIComponent(pathname)}`;
  return NextResponse.redirect(url);
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};
