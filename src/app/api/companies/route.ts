import { NextResponse } from "next/server";
import { getServerSupabase } from "@/lib/supabase/server";
import { verifierConfigured, verifyEmail, isSendable } from "@/lib/emailVerify";
import { getSuppressedSet } from "@/lib/suppression";

export const maxDuration = 60;

// GET /api/companies?status=qualificado
// Lista empresas, opcionalmente filtrando por status. Inclui contatos.
export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const status = searchParams.get("status");
  const category = searchParams.get("category");
  const q = searchParams.get("q"); // busca por nome (ex: seletor de parceiro)

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
    .from("companies")
    .select("*, contacts(*)")
    .order("priority", { ascending: false })
    .order("qualification_score", { ascending: false })
    .limit(200);

  if (status) query = query.eq("status", status);
  if (category) query = query.eq("category", category);
  if (q && q.trim()) query = query.ilike("name", `%${q.trim()}%`);

  const { data, error } = await query;
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  return NextResponse.json({ companies: data ?? [] });
}

// POST /api/companies — cadastra manualmente uma empresa/consultório/escola
// (quando o Apollo não acha, mas o CEO já tem o contato). Ela entra na lista
// como "qualificada" e o CEO clica "Abordar" para gerar o rascunho.
// Body: { name, category, contactName?, title?, email?, phone?, city?, notes? }
export async function POST(req: Request) {
  let body: {
    name?: string;
    category?: string;
    contactName?: string;
    title?: string;
    email?: string;
    phone?: string;
    city?: string;
    state?: string;
    notes?: string;
  };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Body inválido" }, { status: 400 });
  }

  if (!body.name?.trim()) {
    return NextResponse.json({ error: "Nome é obrigatório" }, { status: 400 });
  }

  const category: "empresa" | "medico" | "escola" | "igreja" =
    body.category === "medico"
      ? "medico"
      : body.category === "escola"
        ? "escola"
        : body.category === "igreja"
          ? "igreja"
          : "empresa";

  let supabase: ReturnType<typeof getServerSupabase>;
  try {
    supabase = getServerSupabase();
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Configuração ausente" },
      { status: 500 },
    );
  }

  // Valida o e-mail informado ANTES de criar (evita cadastro órfão e protege a
  // conta de envio): bloqueio e verificador — mesma régua das operadoras.
  const emailManual = body.email?.trim().toLowerCase();
  if (emailManual && emailManual.includes("@")) {
    const suprimidos = await getSuppressedSet(supabase, [emailManual]);
    if (suprimidos.has(emailManual)) {
      return NextResponse.json(
        { error: "Este e-mail está na lista de bloqueio (retornou/descadastro). Use outro." },
        { status: 409 },
      );
    }
    if (verifierConfigured()) {
      const vr = await verifyEmail(emailManual);
      if (!isSendable(vr)) {
        return NextResponse.json(
          { error: `O e-mail não passou na validação (${vr}) — provável caixa inativa. Confira o endereço.` },
          { status: 422 },
        );
      }
    }
  }

  // Cria já qualificada (cadastro manual = decisão do CEO de abordar).
  const { data: company, error: cErr } = await supabase
    .from("companies")
    .insert({
      category,
      name: body.name.trim(),
      city: body.city?.trim() || null,
      state: body.state?.trim() || null,
      status: "qualificado",
      qualified: true,
      qualification_score: 100,
      priority: 5,
      qualification_notes: "Cadastro manual pelo CEO.",
      notes: body.notes?.trim() || null,
    })
    .select()
    .single();

  if (cErr || !company) {
    return NextResponse.json(
      { error: cErr?.message ?? "Erro ao cadastrar" },
      { status: 500 },
    );
  }

  // Contato (se informado) — já com e-mail, então o "Abordar" pula a revelação.
  if (body.contactName?.trim() || body.email?.trim() || body.phone?.trim()) {
    await supabase.from("contacts").insert({
      company_id: company.id,
      name: body.contactName?.trim() || body.name.trim(),
      title: body.title?.trim() || null,
      email: body.email?.trim() || null,
      phone: body.phone?.trim() || null,
      is_decision_maker: true,
    });
  }

  await supabase.from("activities").insert({
    company_id: company.id,
    type: "cadastro",
    description: "Cadastrado manualmente pelo CEO (fora do Apollo).",
  });

  return NextResponse.json({ company });
}
