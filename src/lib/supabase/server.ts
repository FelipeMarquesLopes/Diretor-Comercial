import { createClient, SupabaseClient } from "@supabase/supabase-js";

// Cliente Supabase para uso EXCLUSIVO no servidor (API routes / Server
// Components). Usa a service_role key, que tem permissão total — por isso
// nunca deve ser exposta ao navegador.
//
// Para o MVP interno (uso só pelo CEO) isso é suficiente. Quando houver
// múltiplos usuários, trocar por auth do Supabase + RLS.

let cached: SupabaseClient | null = null;

export function getServerSupabase(): SupabaseClient {
  if (cached) return cached;

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!url || !key) {
    throw new Error(
      "Supabase não configurado. Defina NEXT_PUBLIC_SUPABASE_URL e " +
        "SUPABASE_SERVICE_ROLE_KEY no .env.local (veja .env.example).",
    );
  }

  cached = createClient(url, key, {
    auth: { persistSession: false },
  });
  return cached;
}
