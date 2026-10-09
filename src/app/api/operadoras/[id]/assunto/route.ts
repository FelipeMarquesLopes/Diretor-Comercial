import { NextResponse } from "next/server";
import { getServerSupabase } from "@/lib/supabase/server";
import { ensureSequences, generateDraftForSequence } from "@/lib/outreach";
import type { Company, Contact, Sequence } from "@/lib/types";

export const maxDuration = 60;

// POST /api/operadoras/[id]/assunto
// Abre um NOVO ASSUNTO (tratativa) com uma operadora ATIVA já cadastrada. Cada
// assunto é uma tratativa INDEPENDENTE (com seu próprio follow-up de 72h e seu
// próprio status), então criamos uma nova "linha" da operadora — mesmo nome,
// mesmo analista — com a copy daquele assunto, e geramos o 1º rascunho.
// `id` = qualquer linha já existente daquela operadora (para copiar nome/contato).
// Body: { briefing, titulo?, email?, contactName?, cc? }
export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  let body: {
    briefing?: string;
    titulo?: string;
    email?: string;
    contactName?: string;
    cc?: string;
  };
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

  // Operadora de referência (para copiar nome, marca e contato do analista).
  const { data: base } = await supabase
    .from("companies")
    .select("*")
    .eq("id", id)
    .single<Company>();
  if (!base) {
    return NextResponse.json({ error: "Operadora não encontrada." }, { status: 404 });
  }

  const { data: baseContacts } = await supabase
    .from("contacts")
    .select("*")
    .eq("company_id", id)
    .limit(5);
  const baseContact =
    ((baseContacts as Contact[] | null) ?? []).find((c) => c.email) ??
    (baseContacts as Contact[] | null)?.[0] ??
    null;

  const email = body.email?.trim() || baseContact?.email || "";
  const contactName = body.contactName?.trim() || baseContact?.name || "Analista";
  if (!email) {
    return NextResponse.json(
      { error: "Informe o e-mail do analista para iniciar o assunto." },
      { status: 400 },
    );
  }

  // Cria a NOVA tratativa (linha própria da operadora, com a copy do assunto).
  const titulo = (body.titulo ?? "").trim();
  const { data: nova, error: cErr } = await supabase
    .from("companies")
    .insert({
      name: base.name,
      brand: base.brand,
      category: "operadora",
      operator_type: "ativa",
      briefing,
      cc_emails: body.cc?.trim() || null,
      status: "qualificado",
      qualified: true,
      notes: titulo ? `Assunto: ${titulo}` : null,
    })
    .select("*")
    .single<Company>();
  if (cErr || !nova) {
    return NextResponse.json(
      { error: cErr?.message ?? "Erro ao criar o assunto." },
      { status: 500 },
    );
  }

  // Copia o analista (destinatário) + telefones.
  await supabase.from("contacts").insert({
    company_id: nova.id,
    name: contactName,
    email,
    phone: baseContact?.phone ?? null,
    phone2: (baseContact as { phone2?: string | null } | null)?.phone2 ?? null,
    is_decision_maker: true,
  });

  // Sequência + 1º rascunho (entra no follow-up de 72h).
  await ensureSequences(supabase, nova.id, false);
  const { data: seqs } = await supabase
    .from("sequences")
    .select("*")
    .eq("company_id", nova.id)
    .eq("channel", "email")
    .limit(1);
  const seq = (seqs as Sequence[] | null)?.[0];

  let rascunhoOk = false;
  if (seq) {
    try {
      const r = await generateDraftForSequence(supabase, nova, seq);
      rascunhoOk = Boolean(r?.ok);
    } catch {
      rascunhoOk = false;
    }
  }

  await supabase.from("activities").insert({
    company_id: nova.id,
    type: "rascunho",
    description: `Novo assunto com ${base.name}: "${(titulo || briefing).slice(0, 140)}". Rascunho ${rascunhoOk ? "gerado (pendente)" : "não gerado agora"}.`,
  });

  return NextResponse.json({ id: nova.id, rascunhoOk, email });
}
