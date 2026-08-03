"use client";

import { createClient, SupabaseClient } from "@supabase/supabase-js";

// Cliente Supabase para o NAVEGADOR — usa a chave anon (pública). Serve para
// subir arquivos grandes DIRETO ao Storage (via URL de upload assinada),
// contornando o limite de tamanho de requisição da hospedagem.

let cached: SupabaseClient | null = null;

export function getBrowserSupabase(): SupabaseClient {
  if (cached) return cached;
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !key) {
    throw new Error("Supabase (navegador) não configurado.");
  }
  cached = createClient(url, key, { auth: { persistSession: false } });
  return cached;
}
