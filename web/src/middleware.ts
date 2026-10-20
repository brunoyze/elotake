import { type NextRequest, NextResponse } from "next/server";
import { ACCESS_COOKIE, hasAccess } from "@/lib/access";

export async function middleware(request: NextRequest) {
  if (await hasAccess(request.cookies.get(ACCESS_COOKIE)?.value)) return NextResponse.next();
  if (request.nextUrl.pathname.startsWith("/api/")) {
    return NextResponse.json({ detail: "sem acesso" }, { status: 401 });
  }
  const url = request.nextUrl.clone();
  url.pathname = "/entrar";
  url.search = `?next=${encodeURIComponent(request.nextUrl.pathname)}`;
  return NextResponse.redirect(url);
}

export const config = {
  matcher: ["/((?!entrar|api/entrar|_next/static|_next/image|favicon.ico).*)"],
};
