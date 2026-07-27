import { NextResponse } from "next/server";
import { getServerSupabase } from "@/lib/supabase/server";
import { ensureSequences, generateDraftForSequence } from "@/lib/outreach";
import type { Company, Sequence } from "@/lib/types";

// GET /api/operadoras — lista operadoras com contatos e sequências.
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
    .from("companies")
    .select("*, contacts(*), sequences(*)")
    .eq("category", "operadora")
    .order("created_at", { ascending: false });

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ operadoras: data ?? [] });
}

// POST /api/operadoras — cadastra uma operadora na mão e já prepara os
// primeiros rascunhos (e-mail e, se houver WhatsApp, WhatsApp).
// Body: { name, contactName, email, phone, isWhatsapp, notes?, generateNow? }
export async function POST(req: Request) {
  let body: {
    name?: string;
    contactName?: string;
    email?: string;
    phone?: string;
    isWhatsapp?: boolean;
    notes?: string;
    operatorType?: string;
    briefing?: string;
    generateNow?: boolean;
  };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Body inválido" }, { status: 400 });
  }

  if (!body.name) {
    return NextResponse.json({ error: "Nome da operadora é obrigatório" }, { status: 400 });
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

  // 1. Cria o parceiro (categoria operadora, já qualificado — abordagem manual).
  const { data: company, error: cErr } = await supabase
    .from("companies")
    .insert({
      category: "operadora",
      operator_type: body.operatorType === "ativa" ? "ativa" : "nova",
      briefing: body.briefing ?? null,
      name: body.name,
      status: "qualificado",
      qualified: true,
      notes: body.notes ?? null,
    })
    .select()
    .single<Company>();

  if (cErr || !company) {
    return NextResponse.json(
      { error: cErr?.message ?? "Erro ao criar operadora" },
      { status: 500 },
    );
  }

  // 2. Cria o contato responsável, se informado.
  const hasWhatsapp = Boolean(body.isWhatsapp && body.phone);
  if (body.contactName || body.email || body.phone) {
    await supabase.from("contacts").insert({
      company_id: company.id,
      name: body.contactName || body.name,
      email: body.email ?? null,
      phone: body.phone ?? null,
      is_whatsapp: hasWhatsapp,
      is_decision_maker: true,
    });
  }

  await supabase.from("activities").insert({
    company_id: company.id,
    type: "cadastro",
    description: "Operadora cadastrada manualmente pelo CEO.",
  });

  // 3. Cria as sequências de follow-up (e-mail + WhatsApp se houver).
  await ensureSequences(supabase, company.id, hasWhatsapp);

  // 4. Gera já os primeiros rascunhos (a menos que o CEO peça para não).
  if (body.generateNow !== false) {
    const { data: seqs } = await supabase
      .from("sequences")
      .select("*")
      .eq("company_id", company.id);
    for (const seq of (seqs as Sequence[] | null) ?? []) {
      await generateDraftForSequence(supabase, company, seq);
    }
  }

  return NextResponse.json({ company });
}
