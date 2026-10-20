// Supabase: contas e banco de dados.
// Sem estas variáveis (desenvolvimento local), o app roda sem login, com um usuário
// local e os dados em JSON no armazenamento.

export const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "";
export const supabasePublishableKey =
  process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ?? process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? "";

export const supabaseEnabled = () => Boolean(supabaseUrl && supabasePublishableKey);
