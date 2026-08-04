import { NextResponse } from "next/server";
import { getServerSupabase } from "@/lib/supabase/server";
import { generateReply } from "@/lib/anthropic";
import { resumeAtAfterNegative } from "@/lib/followup";
import type { Company, Contact } from "@/lib/types";

export const maxDuration = 60;

// POST /api/responses/[id]
// Ações do CEO sobre uma resposta recebida:
//   - "responder": a IA monta uma RÉPLICA (com a orientação do CEO), vira
//     rascunho e a sequência volta ATIVA — ao enviar, a cobrança de 72h
//     recomeça (o assunto não cai no esquecimento).
//   - "encerrar": encerra a sequência (morreu o assunto, sem mais cobrança).
//   - "adiar": pausa e agenda a retomada em 30 dias.
// Body: { action, instruction? }
export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;

  let body: {
    action?: "responder" | "encerrar" | "adiar" | "seguir";
    instruction?: string;
  };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Body inválido" }, { status: 400 });
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

  const { data: resp } = await supabase
    .from("responses")
    .select("id, company_id, raw_text, channel, message_id")
    .eq("id", id)
    .single<{
      id: string;
      company_id: string;
      raw_text: string | null;
      channel: string;
      message_id: string | null;
    }>();
  if (!resp) {
    return NextResponse.json({ error: "Resposta não encontrada" }, { status: 404 });
  }
  const companyId = resp.company_id;

  // --- Encerrar: para de cobrar de vez. ---
  if (body.action === "encerrar") {
    await supabase
      .from("sequences")
      .update({ status: "encerrada", next_action_at: null })
      .eq("company_id", companyId);
    await supabase.from("activities").insert({
      company_id: companyId,
      type: "decisao",
      description: "CEO encerrou o assunto (sem mais cobrança).",
    });
    return NextResponse.json({ ok: true });
  }

  // --- Seguir cobrando: retoma a cobrança automática de 72h (ex: "vamos
  //     analisar"), sem escrever réplica. Conta 72h a partir de agora. ---
  if (body.action === "seguir") {
    const em72h = new Date(Date.now() + 3 * 24 * 60 * 60 * 1000).toISOString();
    await supabase
      .from("sequences")
      .update({ status: "ativa", next_action_at: em72h })
      .eq("company_id", companyId)
      .eq("channel", "email");
    await supabase.from("activities").insert({
      company_id: companyId,
      type: "decisao",
      description: "CEO optou por seguir cobrando (próxima cutucada em 72h).",
    });
    return NextResponse.json({ ok: true });
  }

  // --- Adiar: retoma a cobrança em 30 dias. ---
  if (body.action === "adiar") {
    await supabase
      .from("sequences")
      .update({
        status: "pausada_negativa",
        next_action_at: null,
        resume_at: resumeAtAfterNegative().toISOString(),
      })
      .eq("company_id", companyId);
    await supabase.from("activities").insert({
      company_id: companyId,
      type: "decisao",
      description: "CEO adiou o assunto — retomada em 30 dias.",
    });
    return NextResponse.json({ ok: true });
  }

  // --- Responder pelo sistema: monta a réplica e reativa o ciclo. ---
  if (body.action === "responder") {
    if (!body.instruction || !body.instruction.trim()) {
      return NextResponse.json(
        { error: "Diga o que você quer responder (a orientação da réplica)." },
        { status: 400 },
      );
    }

    const { data: company } = await supabase
      .from("companies")
      .select("*")
      .eq("id", companyId)
      .single<Company>();
    if (!company) {
      return NextResponse.json({ error: "Operadora não encontrada" }, { status: 404 });
    }

    const { data: contacts } = await supabase
      .from("contacts")
      .select("*")
      .eq("company_id", companyId)
      .limit(5);
    const list = (contacts as Contact[] | null) ?? [];
    const contact = list.find((c) => c.email) ?? list[0] ?? null;

    let generated;
    try {
      generated = await generateReply({
        company,
        contact,
        incomingText: resp.raw_text ?? "",
        instruction: body.instruction,
        channel: "email",
      });
    } catch (err) {
      return NextResponse.json(
        { error: err instanceof Error ? err.message : "Erro ao gerar a réplica" },
        { status: 502 },
      );
    }

    // Cria uma NOVA sequência (assunto próprio) só para esta réplica. Assim o
    // controle de automação deste assunto fica INDEPENDENTE dos outros
    // assuntos da mesma operadora (ex: glosas x extensão contratual).
    // A nova sequência já nasce amarrada na mensagem que a operadora enviou
    // (last_message_id = message_id dela) — a réplica responde POR CIMA dela,
    // então o destinatário vê o histórico da conversa.
    const semRe = (generated.subject ?? "")
      .replace(/^\s*(re:\s*)+/i, "")
      .trim();
    const { data: newSeq } = await supabase
      .from("sequences")
      .insert({
        company_id: companyId,
        channel: "email",
        status: "ativa",
        step: 0,
        next_action_at: null,
        last_message_id: resp.message_id ?? null,
        thread_subject: semRe || null,
      })
      .select("id")
      .single<{ id: string }>();

    await supabase.from("drafts").insert({
      company_id: companyId,
      contact_id: contact?.id ?? null,
      channel: "email",
      hook: "nr1", // placeholder; é uma réplica
      subject: generated.subject || null,
      body: generated.body,
      status: "pendente",
      sequence_id: newSeq?.id ?? null,
      step: 0,
    });

    await supabase
      .from("companies")
      .update({ status: "em_negociacao" })
      .eq("id", companyId);

    await supabase.from("activities").insert({
      company_id: companyId,
      type: "resposta",
      description: "CEO respondeu pelo sistema — réplica gerada; ciclo reativado.",
    });

    return NextResponse.json({ ok: true, contato: contact?.name ?? null });
  }

  return NextResponse.json({ error: "Ação inválida" }, { status: 400 });
}
