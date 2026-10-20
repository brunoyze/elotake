import { NextResponse } from "next/server";
import { supabaseEnabled } from "@/lib/supabase/config";
import { sessionClient } from "@/lib/supabase/server";

export async function POST(request: Request) {
  if (supabaseEnabled()) await (await sessionClient()).auth.signOut();
  return NextResponse.redirect(new URL("/entrar", request.url), 303);
}
