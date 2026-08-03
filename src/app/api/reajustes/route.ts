import { NextResponse } from "next/server";
import { getServerSupabase } from "@/lib/supabase/server";
import { ensureSequences } from "@/lib/outreach";
import type { Company } from "@/lib/types";

// GET /api/reajustes — lista as operadoras da frente "Reajustes".
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
    .eq("category", "reajuste")
    .order("created_at", { ascending: false });

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ reajustes: data ?? [] });
}

// POST /api/reajustes — cadastra a operadora para pedido de reajuste.
// NÃO gera rascunho ainda: primeiro o CEO anexa o contrato (rota /contract),
// a IA analisa (percentual + janela) e só então geramos o pedido.
// A cobrança é a cada 72h (sequência de e-mail padrão) até um SIM/NÃO claro.
// Body: { name, contactName, email, ccEmails, phone, briefing, notes? }
export async function POST(req: Request) {
  let body: {
    name?: string;
    contactName?: string;
    email?: string;
    ccEmails?: string;
    phone?: string;
    briefing?: string;
    notes?: string;
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

  const { data: company, error: cErr } = await supabase
    .from("companies")
    .insert({
      category: "reajuste",
      briefing: body.briefing ?? null,
      cc_emails: body.ccEmails?.trim() || null,
      name: body.name,
      status: "qualificado",
      qualified: true,
      notes: body.notes ?? null,
    })
    .select()
    .single<Company>();

  if (cErr || !company) {
    return NextResponse.json(
      { error: cErr?.message ?? "Erro ao cadastrar" },
      { status: 500 },
    );
  }

  if (body.contactName || body.email || body.phone) {
    await supabase.from("contacts").insert({
      company_id: company.id,
      name: body.contactName || body.name,
      email: body.email ?? null,
      phone: body.phone ?? null,
      is_decision_maker: true,
    });
  }

  // Sequência de e-mail (cobrança a cada 72h — o intervalo padrão de e-mail).
  await ensureSequences(supabase, company.id, false);

  await supabase.from("activities").insert({
    company_id: company.id,
    type: "cadastro",
    description: "Operadora cadastrada na frente Reajustes.",
  });

  return NextResponse.json({ company });
}
