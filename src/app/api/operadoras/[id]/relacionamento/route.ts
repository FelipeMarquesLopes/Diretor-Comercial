import { NextResponse } from "next/server";
import { getServerSupabase } from "@/lib/supabase/server";
import { ensureSequences, generateDraftForSequence } from "@/lib/outreach";
import type { Company, Contact, Sequence } from "@/lib/types";

// Gerar o rascunho com a IA pode demorar alguns segundos.
export const maxDuration = 60;

// POST /api/operadoras/[id]/relacionamento
// Inicia (ou retoma) o relacionamento com uma operadora ATIVA já cadastrada:
// grava a COPY do assunto (briefing), confirma o e-mail do analista e o CC,
// garante a sequência de follow-up e gera o PRIMEIRO rascunho (vai para a aba
// Rascunhos). A partir daí entra na automação de 72h como de costume.
// Body: { briefing, email?, contactName?, cc? }
export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  let body: { briefing?: string; email?: string; contactName?: string; cc?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Body inválido" }, { status: 400 });
  }
  const briefing = (body.briefing ?? "").trim();
  if (briefing.length < 3) {
    return NextResponse.json(
      { error: "Escreva o assunto que você quer tratar (a copy)." },
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

  // Grava a copy do assunto + o CC na operadora.
  const { error: upErr } = await supabase
    .from("companies")
    .update({ briefing, cc_emails: body.cc?.trim() || null })
    .eq("id", id);
  if (upErr) return NextResponse.json({ error: upErr.message }, { status: 500 });

  // Confirma/atualiza o e-mail (e nome) do analista.
  const { data: existing } = await supabase
    .from("contacts")
    .select("*")
    .eq("company_id", id)
    .limit(1);
  const current = (existing as Contact[] | null)?.[0];
  const email = body.email?.trim();
  if (current) {
    await supabase
      .from("contacts")
      .update({
        email: email || current.email,
        name: body.contactName?.trim() || current.name,
      })
      .eq("id", current.id);
  } else if (email) {
    await supabase.from("contacts").insert({
      company_id: id,
      name: body.contactName?.trim() || "Analista",
      email,
      is_decision_maker: true,
    });
  }

  // Precisa de um e-mail de destino para prosseguir.
  const destino = email || current?.email;
  if (!destino) {
    return NextResponse.json(
      { error: "Informe o e-mail do analista para iniciar o relacionamento." },
      { status: 400 },
    );
  }

  // Garante a sequência de e-mail e gera o primeiro rascunho com a copy.
  await ensureSequences(supabase, id, false);
  const { data: company } = await supabase
    .from("companies")
    .select("*")
    .eq("id", id)
    .single<Company>();
  const { data: seqs } = await supabase
    .from("sequences")
    .select("*")
    .eq("company_id", id)
    .eq("channel", "email")
    .limit(1);
  const seq = (seqs as Sequence[] | null)?.[0];

  let rascunhoOk = false;
  if (company && seq) {
    try {
      const r = await generateDraftForSequence(supabase, company, seq);
      rascunhoOk = Boolean(r?.ok);
    } catch {
      rascunhoOk = false;
    }
  }

  await supabase.from("activities").insert({
    company_id: id,
    type: "rascunho",
    description: `Relacionamento iniciado: "${briefing.slice(0, 140)}". Rascunho ${rascunhoOk ? "gerado (pendente de aprovação)" : "não pôde ser gerado agora"}.`,
  });

  return NextResponse.json({ ok: true, rascunhoOk, destino });
}
