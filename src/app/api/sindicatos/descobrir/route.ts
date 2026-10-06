import { NextResponse } from "next/server";
import { getServerSupabase } from "@/lib/supabase/server";
import { brandFromRequest } from "@/lib/brands";
import { descobrirSindicatosRegiao } from "@/lib/descobrirSindicatos";
import { ensureSequences } from "@/lib/outreach";

// Buscar organizações no Apollo (várias páginas) pode demorar alguns segundos.
export const maxDuration = 60;

// GET /api/sindicatos/descobrir — descobre sindicatos da Grande SP (via Apollo)
// que ainda não estão na base da marca ativa.
export async function GET(req: Request) {
  const brand = brandFromRequest(req);
  let supabase: ReturnType<typeof getServerSupabase>;
  try {
    supabase = getServerSupabase();
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Configuração ausente" },
      { status: 500 },
    );
  }
  try {
    const r = await descobrirSindicatosRegiao(supabase, brand, { max: 120 });
    return NextResponse.json(r);
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Falha ao consultar o Apollo" },
      { status: 502 },
    );
  }
}

// POST /api/sindicatos/descobrir — cadastra UM sindicato na prospecção da marca
// ativa. Guarda apollo_id/domínio para o "Buscar credenciamento no Apollo" já
// achar os contatos direto (sem nova busca de organização).
export async function POST(req: Request) {
  const brand = brandFromRequest(req);
  let body: {
    name?: string;
    cidade?: string;
    apolloId?: string;
    domain?: string | null;
  };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Body inválido" }, { status: 400 });
  }
  const nome = body.name?.trim() ?? "";
  if (nome.length < 2) {
    return NextResponse.json({ error: "Nome do sindicato é obrigatório." }, { status: 400 });
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

  // Evita duplicar: por apollo_id (na marca) ou por nome exato.
  if (body.apolloId) {
    const { data: porApollo } = await supabase
      .from("companies")
      .select("id")
      .eq("brand", brand)
      .eq("apollo_id", body.apolloId)
      .limit(1)
      .maybeSingle<{ id: string }>();
    if (porApollo) return NextResponse.json({ id: porApollo.id, jaExistia: true });
  }
  const { data: porNome } = await supabase
    .from("companies")
    .select("id")
    .eq("brand", brand)
    .eq("category", "sindicato")
    .ilike("name", nome)
    .limit(1)
    .maybeSingle<{ id: string }>();
  if (porNome) return NextResponse.json({ id: porNome.id, jaExistia: true });

  const { data: company, error } = await supabase
    .from("companies")
    .insert({
      category: "sindicato",
      brand,
      operator_type: "nova",
      name: nome,
      city: body.cidade?.trim() || null,
      apollo_id: body.apolloId || null,
      domain: body.domain || null,
      status: "qualificado",
      qualified: true,
      notes: "Descoberto via Apollo (sindicatos da Grande SP).",
    })
    .select("id, name")
    .single<{ id: string; name: string }>();

  if (error || !company) {
    return NextResponse.json(
      { error: error?.message ?? "Erro ao cadastrar o sindicato." },
      { status: 500 },
    );
  }

  await supabase.from("activities").insert({
    company_id: company.id,
    type: "cadastro",
    description: "Sindicato cadastrado a partir da descoberta (Apollo · Grande SP).",
  });
  await ensureSequences(supabase, company.id, false);

  return NextResponse.json({ id: company.id, jaExistia: false });
}
