import { NextResponse } from "next/server";
import { getServerSupabase } from "@/lib/supabase/server";
import {
  DIAS_AGENDA_ABERTA,
  generateAgendaDraft,
  generateDraftForSequence,
} from "@/lib/outreach";
import { checkInbox, isInboxConfigured } from "@/lib/inbox";
import type { Company, Sequence } from "@/lib/types";

// Data (YYYY-MM-DD) daqui a N dias.
function emDias(dias: number): string {
  const d = new Date();
  d.setDate(d.getDate() + dias);
  return d.toISOString().slice(0, 10);
}

// Este endpoint pode demorar (lê e-mails + IA). Damos mais tempo.
export const maxDuration = 60;

// /api/followup/run
// O "motor" completo, que roda periodicamente (robô) e:
//   1. Lê as respostas por e-mail e classifica (positivo/negativo/neutro).
//   2. Reativa sequências pausadas por resposta negativa cujo prazo de 30
//      dias já venceu.
//   3. Gera o próximo rascunho de follow-up para toda sequência ativa cuja
//      hora chegou.
//
// Nada é ENVIADO aqui — os rascunhos ficam aguardando o clique do CEO.
//
// Aceita POST (botão manual no dashboard) e GET (robô/cron).
export async function GET() {
  return run();
}

export async function POST() {
  return run();
}

async function run() {
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

  // 0. Ler as respostas por e-mail (só de contatos cadastrados) e classificar.
  let respostas = 0;
  let positivas: string[] = [];
  if (isInboxConfigured()) {
    try {
      const r = await checkInbox(supabase);
      respostas = r.processadas;
      positivas = r.positivas;
    } catch {
      // se o IMAP falhar numa rodada, segue o resto do motor
    }
  }

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

  // 3. Agenda Aberta: informativo recorrente a cada 15 dias, PARA SEMPRE
  //    (independe de resposta). Só prepara um novo se não houver informativo
  //    pendente da operadora (evita acúmulo se o CEO ainda não enviou).
  const hoje = new Date().toISOString().slice(0, 10);
  const { data: agendas } = await supabase
    .from("companies")
    .select("*")
    .eq("category", "agenda_aberta")
    .lte("next_followup", hoje);

  let informativos = 0;
  for (const c of (agendas as Company[] | null) ?? []) {
    const { count } = await supabase
      .from("drafts")
      .select("id", { count: "exact", head: true })
      .eq("company_id", c.id)
      .eq("status", "pendente");
    if ((count ?? 0) > 0) continue; // já tem um informativo aguardando envio

    const res = await generateAgendaDraft(supabase, c);
    if (res.ok) {
      await supabase
        .from("companies")
        .update({ next_followup: emDias(DIAS_AGENDA_ABERTA) })
        .eq("id", c.id);
      informativos++;
    }
  }

  return NextResponse.json({
    respostas_lidas: respostas,
    positivas,
    reativadas,
    rascunhos_gerados: gerados,
    informativos_agenda: informativos,
  });
}
