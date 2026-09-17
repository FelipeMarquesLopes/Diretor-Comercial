import { NextResponse } from "next/server";
import { getServerSupabase } from "@/lib/supabase/server";
import { getBrand } from "@/lib/brands";
import type { Company } from "@/lib/types";

export const maxDuration = 30;

// POST /api/drafts/[id]/rewrite  { subject?, body }
// Reescreve DIRETAMENTE o assunto e/ou o corpo de um rascunho — dá à Lara
// controle fino da copy (além da regeneração por template). O corpo é salvo
// como veio, garantindo apenas a ASSINATURA da marca no fim (adiciona se faltar,
// não duplica). O rascunho continua "pendente" — envio só com o clique do CEO.
export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  let body: { subject?: string; body?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Body inválido" }, { status: 400 });
  }
  if (!body.body?.trim() && body.subject === undefined) {
    return NextResponse.json(
      { error: "Envie ao menos o corpo (body) ou o assunto (subject)." },
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

  const { data: draft } = await supabase
    .from("drafts")
    .select("id, channel, company_id, companies(brand)")
    .eq("id", id)
    .single<{
      id: string;
      channel: string;
      company_id: string;
      companies: { brand?: string } | null;
    }>();
  if (!draft) {
    return NextResponse.json({ error: "Rascunho não encontrado" }, { status: 404 });
  }

  const update: Record<string, unknown> = { status: "pendente" };
  if (body.subject !== undefined) update.subject = body.subject;

  if (body.body?.trim()) {
    let novoCorpo = body.body.trim();
    // Garante a assinatura da marca (só e-mail) sem duplicar.
    if (draft.channel === "email") {
      const brand = getBrand(draft.companies?.brand);
      const ultimaLinha = brand.signature.trim().split("\n").pop() ?? "";
      const jaTemAssinatura =
        ultimaLinha.length > 0 && novoCorpo.includes(ultimaLinha);
      if (!jaTemAssinatura) novoCorpo += `\n\n${brand.signature}`;
    }
    update.body = novoCorpo;
  }

  const { error } = await supabase.from("drafts").update(update).eq("id", id);
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  await supabase.from("activities").insert({
    company_id: draft.company_id,
    type: "rascunho",
    description: "Lara reescreveu a copy do rascunho (assunto/corpo).",
  });

  return NextResponse.json({ ok: true });
}
