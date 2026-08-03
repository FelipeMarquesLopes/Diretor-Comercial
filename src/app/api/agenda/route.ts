import { NextResponse } from "next/server";
import { getServerSupabase } from "@/lib/supabase/server";
import { DIAS_AGENDA_ABERTA, generateAgendaDraft } from "@/lib/outreach";
import type { Company } from "@/lib/types";

// Data (YYYY-MM-DD) daqui a N dias — para o campo `next_followup` (date).
function emDias(dias: number): string {
  const d = new Date();
  d.setDate(d.getDate() + dias);
  return d.toISOString().slice(0, 10);
}

// GET /api/agenda — lista as operadoras da frente "Agenda Aberta".
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
    .select("*, contacts(*)")
    .eq("category", "agenda_aberta")
    .order("created_at", { ascending: false });

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ agendas: data ?? [] });
}

// POST /api/agenda — cadastra uma operadora na frente "Agenda Aberta" e já
// gera o 1º informativo (rascunho). O informativo se repete a cada 15 dias,
// por tempo indeterminado, independente de resposta (motor em /followup/run).
// Body: { name, contactName, email, ccEmails, phone, briefing, generateNow? }
export async function POST(req: Request) {
  let body: {
    name?: string;
    contactName?: string;
    email?: string;
    ccEmails?: string;
    phone?: string;
    briefing?: string;
    notes?: string;
    generateNow?: boolean;
  };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Body inválido" }, { status: 400 });
  }

  if (!body.name) {
    return NextResponse.json(
      { error: "Nome da operadora é obrigatório" },
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

  // 1. Cria o parceiro na categoria agenda_aberta (já qualificado, manual).
  const { data: company, error: cErr } = await supabase
    .from("companies")
    .insert({
      category: "agenda_aberta",
      briefing: body.briefing ?? null,
      cc_emails: body.ccEmails?.trim() || null,
      name: body.name,
      status: "qualificado",
      qualified: true,
      notes: body.notes ?? null,
      // Próximo informativo agendado para daqui a 15 dias (o 1º sai agora).
      next_followup: emDias(DIAS_AGENDA_ABERTA),
    })
    .select()
    .single<Company>();

  if (cErr || !company) {
    return NextResponse.json(
      { error: cErr?.message ?? "Erro ao cadastrar" },
      { status: 500 },
    );
  }

  // 2. Cria o contato responsável, se informado.
  if (body.contactName || body.email || body.phone) {
    await supabase.from("contacts").insert({
      company_id: company.id,
      name: body.contactName || body.name,
      email: body.email ?? null,
      phone: body.phone ?? null,
      is_decision_maker: true,
    });
  }

  await supabase.from("activities").insert({
    company_id: company.id,
    type: "cadastro",
    description: "Operadora cadastrada na frente Agenda Aberta.",
  });

  // 3. Gera já o 1º informativo (a menos que o CEO peça para não).
  if (body.generateNow !== false) {
    await generateAgendaDraft(supabase, company);
  }

  return NextResponse.json({ company });
}
