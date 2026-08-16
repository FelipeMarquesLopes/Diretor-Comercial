"use client";

import { createBrowserClient } from "@supabase/ssr";
import { supabaseAnonKey, supabaseUrl } from "@/lib/env";

// Cliente para uso no navegador. Usa a anon key — pública por natureza; o
// que protege os dados é o RLS no banco, não o segredo da chave.

export function getBrowserSupabase() {
  return createBrowserClient(supabaseUrl(), supabaseAnonKey());
}
