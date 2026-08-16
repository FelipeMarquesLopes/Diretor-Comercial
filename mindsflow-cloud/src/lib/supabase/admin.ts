import "server-only";

import { createClient, SupabaseClient } from "@supabase/supabase-js";
import { supabaseServiceRoleKey, supabaseUrl } from "@/lib/env";

// Cliente administrativo: usa a service_role, que IGNORA o RLS.
//
// Use só onde não há alternativa (ex.: gravar auditoria, jobs agendados sem
// usuário logado). Toda chamada aqui é responsabilidade sua: o banco não vai
// te proteger. O `server-only` acima faz o build falhar se este arquivo for
// importado por engano num componente de cliente.

let cached: SupabaseClient | null = null;

export function getAdminSupabase(): SupabaseClient {
  if (cached) return cached;

  cached = createClient(supabaseUrl(), supabaseServiceRoleKey(), {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  return cached;
}
