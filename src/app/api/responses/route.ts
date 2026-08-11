import { NextResponse } from "next/server";
import { getServerSupabase } from "@/lib/supabase/server";
import { classifyResponse } from "@/lib/anthropic";
import { resumeAtAfterNegative } from "@/lib/followup";
import { recomputeCompanyScore } from "@/lib/scoring";
import { nextActionForIntent } from "@/lib/nextAction";
import { createTask } from "@/lib/tasks";
import type { ResponseSentiment, SequenceChannel } from "@/lib/types";

// GET /api/responses — respostas recebidas (mais recentes), com o nome da
// operadora. Usado no dashboard para apontar quem respondeu.
export async function GET() {
  let supabase: ReturnType<typeof getServerSupabase>;
  try {
    supabase = getServerSupabase();
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Configuração ausente" },
      { status: 500 },
    );
  }

  const { data, error } = await supabase
    .from("responses")
    .select(
      "id, company_id, sentiment, intent, next_action_at, summary, raw_text, channel, created_at, companies(name, category)",
    )
    .is("dismissed_at", null) // só as respostas ainda abertas (não arquivadas)
    .order("created_at", { ascending: false })
    .limit(30);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ responses: data ?? [] });
}

// POST /api/responses
// Registra uma resposta recebida de um parceiro e deixa a IA entender o tom.
// Depois ajusta o motor de follow-up:
//   - positivo  -> para de cutucar e CHAMA O CEO (aguardando_ceo).
//   - negativo  -> pausa e agenda retomada em 30 dias.
//   - neutro    -> mantém o follow-up correndo.
//
// Quando o Gmail e o WhatsApp estiverem conectados, esta rota será chamada
// automaticamente ao chegar uma resposta. Por enquanto ela também serve para
// o CEO registrar respostas na mão.
export async function POST(req: Request) {
  let body: {
    companyId?: string;
    channel?: SequenceChannel;
    text?: string;
    sentiment?: ResponseSentiment; // opcional: força a classificação
  };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Body inválido" }, { status: 400 });
  }

  const { companyId, channel = "email", text } = body;
  if (!companyId || !text) {
    return NextResponse.json(
      { error: "companyId e text são obrigatórios" },
      { status: 400 },
    );
  }

  let supabase: ReturnType<typeof getServerSupabase>;
  try {
    supabase = getServerSupabase();
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Configuração ausente" },
      { status: 500 },
    );
  }

  // Classifica (a menos que já venha classificado).
  let sentiment: ResponseSentiment = body.sentiment ?? "neutro";
  let summary = "";
  let intent: string | null = null;
  let followUpDate: string | null = null;
  if (!body.sentiment) {
    try {
      const c = await classifyResponse(text);
      sentiment = c.sentiment;
      summary = c.summary;
      intent = c.intent;
      followUpDate = c.followUpDate;
    } catch {
      // se a IA falhar, guarda como neutro para o CEO revisar
    }
  }

  const nextActionIso =
    intent === "followup_futuro" && followUpDate
      ? new Date(`${followUpDate}T12:00:00Z`).toISOString()
      : null;

  await supabase.from("responses").insert({
    company_id: companyId,
    channel,
    sentiment,
    intent,
    next_action_at: nextActionIso,
    summary,
    raw_text: text,
  });

  // A intenção decide o próximo passo (Nível 1 — apoio automático).
  if (nextActionIso) {
    await supabase
      .from("sequences")
      .update({ status: "agendada", next_action_at: null, resume_at: nextActionIso })
      .eq("company_id", companyId);
  } else if (sentiment === "negativo") {
    await supabase
      .from("sequences")
      .update({
        status: "pausada_negativa",
        next_action_at: null,
        resume_at: resumeAtAfterNegative().toISOString(),
      })
      .eq("company_id", companyId);
  } else {
    await supabase
      .from("sequences")
      .update({ status: "aguardando_ceo", next_action_at: null })
      .eq("company_id", companyId);
    if (sentiment === "positivo") {
      await supabase
        .from("companies")
        .update({ status: "em_negociacao" })
        .eq("id", companyId);
    }
  }

  await supabase.from("activities").insert({
    company_id: companyId,
    type: "resposta",
    description: `Resposta (${channel}) classificada como ${sentiment}${summary ? `: ${summary}` : ""}.`,
  });

  // Lead scoring v2 (Fase 2.3): a resposta muda a temperatura do lead.
  await recomputeCompanyScore(supabase, companyId).catch(() => {});

  // Máquina de estados (Fase 3.1): cria tarefa humana quando a ação pede (N1).
  const rec = nextActionForIntent(intent);
  if (rec.autoTaskTitle) {
    await createTask(
      supabase,
      {
        companyId,
        title: rec.autoTaskTitle,
        detail: summary || null,
        level: 1,
        createdBy: "ia",
      },
      { dedupeOpen: true },
    ).catch(() => {});
  }

  return NextResponse.json({ sentiment, summary });
}
