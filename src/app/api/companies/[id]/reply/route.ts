import { NextResponse } from "next/server";
import { getServerSupabase } from "@/lib/supabase/server";
import { generateReply } from "@/lib/anthropic";
import { buildCommercialContext } from "@/lib/memory";
import type { Company, Contact } from "@/lib/types";

export const maxDuration = 60;

// POST /api/companies/[id]/reply  { incomingText, instruction }
// Prepara uma RÉPLICA (rascunho pendente) a um e-mail recebido que NÃO está na
// automação (ex: a Lara leu direto na caixa do Titan). A IA escreve a resposta
// com base no texto recebido + a orientação. Não envia — fica para aprovação.
export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  let body: { incomingText?: string; instruction?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Body inválido" }, { status: 400 });
  }
  if (!body.instruction?.trim()) {
    return NextResponse.json(
      { error: "Diga o que a resposta deve dizer (a orientação)." },
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

  const { data: company } = await supabase
    .from("companies")
    .select("*")
    .eq("id", id)
    .single<Company>();
  if (!company) {
    return NextResponse.json({ error: "Parceiro não encontrado" }, { status: 404 });
  }

  const { data: contacts } = await supabase
    .from("contacts")
    .select("*")
    .eq("company_id", id)
    .limit(5);
  const list = (contacts as Contact[] | null) ?? [];
  const contact = list.find((c) => c.email) ?? list[0] ?? null;

  const history = await buildCommercialContext(supabase, id);

  let generated;
  try {
    generated = await generateReply({
      company,
      contact,
      incomingText: body.incomingText ?? "",
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

  // Reaproveita a sequência de e-mail existente (unique company+channel).
  const semRe = (generated.subject ?? "").replace(/^\s*(re:\s*)+/i, "").trim();
  const { data: existing } = await supabase
    .from("sequences")
    .select("id, thread_subject")
    .eq("company_id", id)
    .eq("channel", "email")
    .maybeSingle<{ id: string; thread_subject: string | null }>();

  let seqId: string;
  if (existing) {
    await supabase
      .from("sequences")
      .update({
        status: "ativa",
        next_action_at: null,
        thread_subject: existing.thread_subject ?? (semRe || null),
      })
      .eq("id", existing.id);
    seqId = existing.id;
  } else {
    const { data: novo, error: seqErr } = await supabase
      .from("sequences")
      .insert({
        company_id: id,
        channel: "email",
        status: "ativa",
        step: 0,
        thread_subject: semRe || null,
      })
      .select("id")
      .single<{ id: string }>();
    if (seqErr || !novo) {
      return NextResponse.json(
        { error: `Não consegui preparar a réplica (${seqErr?.message ?? "sequência"}).` },
        { status: 500 },
      );
    }
    seqId = novo.id;
  }

  const { error: draftErr } = await supabase.from("drafts").insert({
    company_id: id,
    contact_id: contact?.id ?? null,
    channel: "email",
    hook: "nr1",
    subject: generated.subject || null,
    body: generated.body,
    status: "pendente",
    sequence_id: seqId,
    step: 0,
    is_reply: true,
  });
  if (draftErr) {
    return NextResponse.json({ error: draftErr.message }, { status: 500 });
  }

  await supabase.from("activities").insert({
    company_id: id,
    type: "resposta",
    description: "Lara preparou uma réplica a um e-mail lido na caixa.",
  });

  return NextResponse.json({ ok: true, subject: generated.subject });
}
