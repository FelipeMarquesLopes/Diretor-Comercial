import { NextResponse } from "next/server";
import { getServerSupabase } from "@/lib/supabase/server";

// POST /api/companies/[id]/referral
// Fase 5 — marca/desmarca o parceiro como FONTE DE ENCAMINHAMENTO e ajusta o
// CONTADOR agregado de indicações. Body: { isSource?: boolean, delta?: number }.
// Sem nenhum dado de paciente — só a contagem ligada ao parceiro (B2B).
export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  let body: { isSource?: boolean; delta?: number };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Body inválido" }, { status: 400 });
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
    .select("id, name, is_referral_source, referral_count")
    .eq("id", id)
    .single();
  if (e0 || !company) {
    return NextResponse.json({ error: "Parceiro não encontrado" }, { status: 404 });
  }

  const update: { is_referral_source?: boolean; referral_count?: number } = {};
  if (typeof body.isSource === "boolean") {
    update.is_referral_source = body.isSource;
    // Marcar como fonte implica contar pelo menos as indicações registradas.
  }
  if (typeof body.delta === "number" && body.delta !== 0) {
    update.referral_count = Math.max(0, (company.referral_count ?? 0) + body.delta);
    // Se registrou indicação, é porque é fonte.
    if (update.referral_count > 0) update.is_referral_source = true;
  }

  if (!Object.keys(update).length) {
    return NextResponse.json({ error: "Nada para atualizar" }, { status: 400 });
  }

  const { error: e1 } = await supabase.from("companies").update(update).eq("id", id);
  if (e1) return NextResponse.json({ error: e1.message }, { status: 500 });

  await supabase.from("activities").insert({
    company_id: id,
    type: "encaminhamento",
    description:
      typeof body.delta === "number" && body.delta !== 0
        ? `Encaminhamentos ajustados (${body.delta > 0 ? "+" : ""}${body.delta}) → total ${update.referral_count}.`
        : `Fonte de encaminhamento: ${update.is_referral_source ? "sim" : "não"}.`,
  });

  return NextResponse.json({
    ok: true,
    is_referral_source: update.is_referral_source ?? company.is_referral_source,
    referral_count: update.referral_count ?? company.referral_count,
  });
}
