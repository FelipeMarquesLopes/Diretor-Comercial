import { NextResponse } from "next/server";
import { getServerSupabase } from "@/lib/supabase/server";
import { generateDraftForSequence } from "@/lib/outreach";
import type { Company, Sequence } from "@/lib/types";

// POST /api/followup/run
// O "motor": roda periodicamente (por enquanto manualmente ou por um job
// diário quando o sistema estiver publicado) e:
//   1. Reativa sequências pausadas por resposta negativa cujo prazo de 30
//      dias já venceu.
//   2. Gera o próximo rascunho para toda sequência ativa cuja hora chegou.
//
// Nada é enviado aqui — só são criados rascunhos aguardando o clique do CEO.
export async function POST() {
  let supabase: ReturnType<typeof getServerSupabase>;
  try {
    supabase = getServerSupabase();
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Configuração ausente" },
      { status: 500 },
    );
  }

  const now = new Date().toISOString();

  // 1. Reativar sequências cujo prazo de retomada (30 dias) venceu.
  const { data: toResume } = await supabase
    .from("sequences")
    .select("id")
    .eq("status", "pausada_negativa")
    .lte("resume_at", now);

  let reativadas = 0;
  for (const s of (toResume as { id: string }[] | null) ?? []) {
    await supabase
      .from("sequences")
      .update({ status: "ativa", next_action_at: now })
      .eq("id", s.id);
    reativadas++;
  }

  // 2. Gerar próximos rascunhos para sequências ativas cuja hora chegou.
  const { data: due } = await supabase
    .from("sequences")
    .select("*, companies(*)")
    .eq("status", "ativa")
    .not("next_action_at", "is", null)
    .lte("next_action_at", now);

  let gerados = 0;
  const rows =
    (due as (Sequence & { companies: Company | null })[] | null) ?? [];
  for (const row of rows) {
    if (!row.companies) continue;
    // `row` inclui o join `companies`, mas é compatível com Sequence.
    const res = await generateDraftForSequence(supabase, row.companies, row);
    if (res.ok) gerados++;
  }

  return NextResponse.json({ reativadas, rascunhos_gerados: gerados });
}
