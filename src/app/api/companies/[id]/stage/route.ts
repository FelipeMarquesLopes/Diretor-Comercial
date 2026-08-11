import { NextResponse } from "next/server";
import { getServerSupabase } from "@/lib/supabase/server";
import { findStage, statusForStage } from "@/lib/pipelines";

// POST /api/companies/[id]/stage  { stage: string }
// Move o card no Kanban: grava o estágio fino em companies.stage E reconcilia
// o status universal (companies.status) de acordo com o mapeamento do segmento.
// Registra a mudança na linha do tempo (activities).
export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;

  let body: { stage?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Body inválido" }, { status: 400 });
  }
  const stageId = body.stage?.trim();
  if (!stageId) {
    return NextResponse.json({ error: "Estágio é obrigatório" }, { status: 400 });
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

  const { data: company, error: e0 } = await supabase
    .from("companies")
    .select("id, category, stage")
    .eq("id", id)
    .single();
  if (e0 || !company) {
    return NextResponse.json({ error: "Parceiro não encontrado" }, { status: 404 });
  }

  const stage = findStage(company.category, stageId);
  if (!stage) {
    return NextResponse.json(
      { error: `Estágio "${stageId}" não pertence ao segmento ${company.category}` },
      { status: 400 },
    );
  }

  const newStatus = statusForStage(company.category, stageId);
  const { error: e1 } = await supabase
    .from("companies")
    .update({ stage: stageId, status: newStatus, updated_at: new Date().toISOString() })
    .eq("id", id);
  if (e1) {
    return NextResponse.json({ error: e1.message }, { status: 500 });
  }

  await supabase.from("activities").insert({
    company_id: id,
    type: "pipeline",
    description: `Movido no pipeline para "${stage.label}".`,
  });

  return NextResponse.json({ ok: true, stage: stageId, status: newStatus });
}
