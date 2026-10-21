import { NextResponse } from "next/server";
import { getServerSupabase } from "@/lib/supabase/server";

// POST /api/operadoras/[id]/mover-ativa
// Reclassifica um cadastro existente para OPERADORA ATIVA (categoria=operadora,
// tipo=ativa), SEM perder os contatos/CC já cadastrados. Usado para corrigir um
// parceiro que caiu na categoria errada (ex: foi para "empresa").
export async function POST(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
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
    .select("id, name")
    .eq("id", id)
    .single<{ id: string; name: string }>();
  if (!company) {
    return NextResponse.json({ error: "Parceiro não encontrado." }, { status: 404 });
  }

  const { error } = await supabase
    .from("companies")
    .update({
      category: "operadora",
      operator_type: "ativa",
      contract_only: false,
    })
    .eq("id", id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  await supabase.from("activities").insert({
    company_id: id,
    type: "cadastro",
    description: `${company.name} movido para Operadoras Ativas (categoria corrigida).`,
  });

  return NextResponse.json({ ok: true, id, name: company.name });
}
