import { NextResponse } from "next/server";
import { getServerSupabase } from "@/lib/supabase/server";
import { brandFromRequest } from "@/lib/brands";
import { descobrirOperadorasGrandeSP } from "@/lib/ansOperadoras";
import { ensureSequences } from "@/lib/outreach";

// Baixar/parsear o cadastro da ANS pode demorar alguns segundos.
export const maxDuration = 60;

// GET /api/ans/operadoras — descobre operadoras de saúde da Grande SP (ANS) que
// ainda não estão na base da marca ativa.
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
    const r = await descobrirOperadorasGrandeSP(supabase, brand, { max: 100 });
    return NextResponse.json(r);
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Falha ao consultar a ANS" },
      { status: 502 },
    );
  }
}

// POST /api/ans/operadoras — cadastra UMA operadora da ANS na prospecção da
// marca ativa (categoria operadora, nova, qualificada). Depois é só revelar os
// contatos de credenciamento no botão do Apollo.
export async function POST(req: Request) {
  const brand = brandFromRequest(req);
  let body: {
    name?: string;
    nomeFantasia?: string;
    cidade?: string;
    registroAns?: string;
    cnpj?: string;
    modalidade?: string;
  };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Body inválido" }, { status: 400 });
  }
  const nome = (body.nomeFantasia?.trim() || body.name?.trim() || "").trim();
  if (nome.length < 2) {
    return NextResponse.json({ error: "Nome da operadora é obrigatório." }, { status: 400 });
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

  // Evita duplicar: se já existe operadora com esse nome na marca, não recria.
  const { data: existente } = await supabase
    .from("companies")
    .select("id, name")
    .eq("brand", brand)
    .eq("category", "operadora")
    .ilike("name", nome)
    .limit(1)
    .maybeSingle<{ id: string; name: string }>();
  if (existente) {
    return NextResponse.json({ id: existente.id, jaExistia: true });
  }

  const nota = [
    "Descoberta via ANS (Grande SP).",
    body.registroAns ? `Registro ANS: ${body.registroAns}.` : "",
    body.cnpj ? `CNPJ: ${body.cnpj}.` : "",
    body.modalidade ? `Modalidade: ${body.modalidade}.` : "",
  ]
    .filter(Boolean)
    .join(" ");

  const { data: company, error } = await supabase
    .from("companies")
    .insert({
      category: "operadora",
      brand,
      operator_type: "nova",
      name: nome,
      city: body.cidade?.trim() || null,
      status: "qualificado",
      qualified: true,
      notes: nota,
    })
    .select("id, name")
    .single<{ id: string; name: string }>();

  if (error || !company) {
    return NextResponse.json(
      { error: error?.message ?? "Erro ao cadastrar a operadora." },
      { status: 500 },
    );
  }

  await supabase.from("activities").insert({
    company_id: company.id,
    type: "cadastro",
    description: `Operadora cadastrada a partir da descoberta ANS (Grande SP).${body.registroAns ? ` Registro ANS ${body.registroAns}.` : ""}`,
  });
  await ensureSequences(supabase, company.id, false);

  return NextResponse.json({ id: company.id, jaExistia: false });
}
