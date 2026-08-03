import { NextResponse } from "next/server";
import { getServerSupabase } from "@/lib/supabase/server";
import { generateDraft } from "@/lib/anthropic";
import type { Company, Contact, DraftChannel, MessageHook } from "@/lib/types";

// GET /api/drafts?status=pendente
// Lista rascunhos, com dados da empresa e do contato.
export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const status = searchParams.get("status");

  let supabase: ReturnType<typeof getServerSupabase>;
  try {
    supabase = getServerSupabase();
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Configuração ausente" },
      { status: 500 },
    );
  }
  let query = supabase
    .from("drafts")
    .select(
      "*, companies(name, industry, city, state, cc_emails, category, next_followup), contacts(name, title, email), sequences(next_action_at, status, resume_at)",
    )
    .order("created_at", { ascending: false })
    .limit(200);

  if (status) query = query.eq("status", status);

  const { data, error } = await query;
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  return NextResponse.json({ drafts: data ?? [] });
}

// POST /api/drafts
// Gera um rascunho para uma empresa via IA. Body: { companyId, hook, channel }
export async function POST(req: Request) {
  let body: { companyId?: string; hook?: MessageHook; channel?: DraftChannel };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Body inválido" }, { status: 400 });
  }

  const { companyId, hook = "nr1", channel = "email" } = body;
  if (!companyId) {
    return NextResponse.json({ error: "companyId é obrigatório" }, { status: 400 });
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

  const { data: company, error: cErr } = await supabase
    .from("companies")
    .select("*")
    .eq("id", companyId)
    .single<Company>();

  if (cErr || !company) {
    return NextResponse.json({ error: "Empresa não encontrada" }, { status: 404 });
  }

  // Pega o melhor contato do RH, se houver.
  const { data: contacts } = await supabase
    .from("contacts")
    .select("*")
    .eq("company_id", companyId)
    .limit(1);
  const contact = (contacts?.[0] as Contact | undefined) ?? null;

  let generated;
  try {
    generated = await generateDraft({ company, contact, hook, channel });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Erro na IA" },
      { status: 502 },
    );
  }

  const { data: draft, error: dErr } = await supabase
    .from("drafts")
    .insert({
      company_id: companyId,
      contact_id: contact?.id ?? null,
      channel,
      hook,
      subject: generated.subject || null,
      body: generated.body,
      status: "pendente",
    })
    .select()
    .single();

  if (dErr || !draft) {
    return NextResponse.json(
      { error: dErr?.message ?? "Erro ao salvar rascunho" },
      { status: 500 },
    );
  }

  await supabase.from("activities").insert({
    company_id: companyId,
    type: "rascunho",
    description: `Rascunho (${channel}, gancho ${hook}) gerado pela IA, aguardando aprovação.`,
  });

  return NextResponse.json({ draft });
}
