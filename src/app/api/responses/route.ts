import { NextResponse } from "next/server";
import { getServerSupabase } from "@/lib/supabase/server";
import { classifyResponse } from "@/lib/anthropic";
import { resumeAtAfterNegative } from "@/lib/followup";
import type { ResponseSentiment, SequenceChannel } from "@/lib/types";

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
  if (!body.sentiment) {
    try {
      const c = await classifyResponse(text);
      sentiment = c.sentiment;
      summary = c.summary;
    } catch {
      // se a IA falhar, guarda como neutro para o CEO revisar
    }
  }

  await supabase.from("responses").insert({
    company_id: companyId,
    channel,
    sentiment,
    summary,
    raw_text: text,
  });

  // Ajusta a máquina conforme o tom.
  if (sentiment === "positivo") {
    // Para tudo e chama o CEO.
    await supabase
      .from("sequences")
      .update({ status: "aguardando_ceo", next_action_at: null })
      .eq("company_id", companyId);
    await supabase
      .from("companies")
      .update({ status: "em_negociacao" })
      .eq("id", companyId);
  } else if (sentiment === "negativo") {
    // Pausa e agenda retomada em 30 dias.
    await supabase
      .from("sequences")
      .update({
        status: "pausada_negativa",
        next_action_at: null,
        resume_at: resumeAtAfterNegative().toISOString(),
      })
      .eq("company_id", companyId);
  }

  await supabase.from("activities").insert({
    company_id: companyId,
    type: "resposta",
    description: `Resposta (${channel}) classificada como ${sentiment}${summary ? `: ${summary}` : ""}.`,
  });

  return NextResponse.json({ sentiment, summary });
}
