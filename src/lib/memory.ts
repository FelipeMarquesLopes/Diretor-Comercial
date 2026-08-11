// Memória comercial (Fase 1.2).
//
// Monta um resumo do HISTÓRICO real com um parceiro (o que já foi enviado, o
// que ele respondeu, decisões tomadas) para a IA ler ANTES de escrever — assim
// as abordagens dão continuidade, não repetem o que já foi dito, e reconhecem
// quando estamos retomando após um tempo.

import type { SupabaseClient } from "@supabase/supabase-js";

function fmt(iso: string): string {
  return new Date(iso).toLocaleDateString("pt-BR", {
    timeZone: "America/Sao_Paulo",
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  });
}

// Só os eventos que representam a CONVERSA (envios, respostas, decisões,
// retornos) — não a lida interna (descoberta, geração de rascunho, cadastro).
const TIPOS_RELEVANTES = new Set([
  "aprovacao",
  "resposta",
  "decisao",
  "bounce",
  "unsubscribe",
]);

/**
 * Devolve um texto compacto com o histórico do parceiro (mais antigo → mais
 * novo). String vazia quando não houve conversa real ainda (parceiro novo) —
 * aí a IA trata como primeiro contato, como hoje.
 */
export async function buildCommercialContext(
  supabase: SupabaseClient,
  companyId: string,
  opts?: { limit?: number; maxChars?: number },
): Promise<string> {
  const limit = opts?.limit ?? 20;
  const maxChars = opts?.maxChars ?? 1800;

  const { data } = await supabase
    .from("activities")
    .select("type, description, created_at")
    .eq("company_id", companyId)
    .order("created_at", { ascending: false })
    .limit(limit);

  const rows = (data ?? []) as {
    type: string;
    description: string;
    created_at: string;
  }[];

  const relevantes = rows.filter((a) => TIPOS_RELEVANTES.has(a.type));
  if (relevantes.length === 0) return "";

  const linhas = relevantes
    .slice()
    .reverse() // cronológico
    .map((a) => `- ${fmt(a.created_at)}: ${a.description}`)
    .join("\n");

  return linhas.length > maxChars
    ? linhas.slice(linhas.length - maxChars) // mantém o mais recente
    : linhas;
}
