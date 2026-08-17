import { NextResponse } from "next/server";
import { getServerSupabase } from "@/lib/supabase/server";
import { generateReply } from "@/lib/anthropic";
import { buildCommercialContext } from "@/lib/memory";
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
    action?: "responder" | "encerrar" | "adiar" | "seguir" | "fechar";
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

  // Arquiva a resposta (tira do radar do dashboard).
  const arquivar = () =>
    supabase
      .from("responses")
      .update({ dismissed_at: new Date().toISOString() })
      .eq("id", id);

  // --- Fechar: só arquiva (o CEO viu e não quer mais no radar). ---
  if (body.action === "fechar") {
    await arquivar();
    return NextResponse.json({ ok: true });
  }

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
    await arquivar();
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
    await arquivar();
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
    await arquivar();
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

    const history = await buildCommercialContext(supabase, companyId);

    let generated;
    try {
      generated = await generateReply({
        company,
        contact,
        incomingText: resp.raw_text ?? "",
        instruction: body.instruction,
        channel: "email",
        history,
      });
    } catch (err) {
      return NextResponse.json(
        { error: err instanceof Error ? err.message : "Erro ao gerar a réplica" },
        { status: 502 },
      );
    }

    // Reaproveita a sequência de e-mail EXISTENTE desta empresa. O banco só
    // permite UMA sequência por empresa+canal (unique(company_id, channel)),
    // e todo o resto do sistema (seguir/encerrar/adiar) trata a sequência por
    // company_id — então criar outra aqui esbarrava na trava de unicidade
    // ("sequences_company_id_channel_key"). A réplica REATIVA o mesmo assunto:
    // volta a sequência para "ativa" e amarra na mensagem que a empresa enviou
    // (last_message_id = message_id dela), para a réplica responder por cima e
    // o destinatário ver o histórico. Se (raro) não existir sequência, cria.
    const semRe = (generated.subject ?? "")
      .replace(/^\s*(re:\s*)+/i, "")
      .trim();

    const { data: existing } = await supabase
      .from("sequences")
      .select("id, thread_subject")
      .eq("company_id", companyId)
      .eq("channel", "email")
      .maybeSingle<{ id: string; thread_subject: string | null }>();

    let seqId: string;
    const createdNew = !existing;
    if (existing) {
      const { error: upErr } = await supabase
        .from("sequences")
        .update({
          status: "ativa",
          next_action_at: null,
          last_message_id: resp.message_id ?? null,
          // mantém o assunto-raiz da conversa; só define se ainda não houver.
          thread_subject: existing.thread_subject ?? (semRe || null),
        })
        .eq("id", existing.id);
      if (upErr) {
        // NÃO arquiva a resposta — ela segue no painel para tentar de novo.
        return NextResponse.json(
          {
            error: `Não consegui preparar a réplica (${upErr.message}). A resposta continua no painel.`,
          },
          { status: 500 },
        );
      }
      seqId = existing.id;
    } else {
      const { data: newSeq, error: seqErr } = await supabase
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

      if (seqErr || !newSeq) {
        // NÃO arquiva a resposta — ela segue no painel para você tentar de novo.
        return NextResponse.json(
          {
            error: `Não consegui preparar a réplica (${seqErr?.message ?? "sequência"}). A resposta continua no painel.`,
          },
          { status: 500 },
        );
      }
      seqId = newSeq.id;
    }

    const { error: draftErr } = await supabase.from("drafts").insert({
      company_id: companyId,
      contact_id: contact?.id ?? null,
      channel: "email",
      hook: "nr1", // placeholder; é uma réplica
      subject: generated.subject || null,
      body: generated.body,
      status: "pendente",
      sequence_id: seqId,
      step: 0,
      is_reply: true,
    });

    if (draftErr) {
      // Só desfaz a sequência se ela foi CRIADA agora (não apaga a sequência
      // real da empresa quando reaproveitamos a existente). Mantém a resposta
      // no painel (não arquiva) para nova tentativa.
      if (createdNew) {
        await supabase.from("sequences").delete().eq("id", seqId);
      }
      return NextResponse.json(
        {
          error: `Não consegui criar o rascunho da réplica (${draftErr.message}). A resposta continua no painel — tente de novo.`,
        },
        { status: 500 },
      );
    }

    // Só agora que a réplica existe: atualiza status, registra e arquiva.
    await supabase
      .from("companies")
      .update({ status: "em_negociacao" })
      .eq("id", companyId);

    await supabase.from("activities").insert({
      company_id: companyId,
      type: "resposta",
      description: "CEO respondeu pelo sistema — réplica gerada; ciclo reativado.",
    });
    await arquivar();

    return NextResponse.json({ ok: true, contato: contact?.name ?? null });
  }

  return NextResponse.json({ error: "Ação inválida" }, { status: 400 });
}
