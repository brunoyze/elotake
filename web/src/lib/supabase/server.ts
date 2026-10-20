import { createServerClient } from "@supabase/ssr";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { cookies } from "next/headers";
import { supabasePublishableKey, supabaseUrl } from "./config";

/** Cliente com a sessão de quem está usando o app (lê e renova os cookies de login). */
export async function sessionClient() {
  const store = await cookies();
  return createServerClient(supabaseUrl, supabasePublishableKey, {
    cookies: {
      getAll: () => store.getAll(),
      setAll(toSet) {
        try {
          for (const { name, value, options } of toSet) store.set(name, value, options);
        } catch {
          // Em Server Components não dá para gravar cookies; o middleware renova a sessão.
        }
      },
    },
  });
}

let admin: SupabaseClient | null = null;

/** Cliente da API com a chave secreta: ignora o RLS, então sempre filtre por user_id. */
export function adminClient(): SupabaseClient {
  const key = process.env.SUPABASE_SECRET_KEY ?? process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!key) throw new Error("falta SUPABASE_SECRET_KEY");
  admin ??= createClient(supabaseUrl, key, { auth: { persistSession: false, autoRefreshToken: false } });
  return admin;
}
