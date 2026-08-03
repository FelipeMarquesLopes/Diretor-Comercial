import { NextResponse } from "next/server";
import { getServerSupabase } from "@/lib/supabase/server";
import { generateDraftForSequence } from "@/lib/outreach";
import type { Company, Sequence } from "@/lib/types";

export const maxDuration = 60;

// POST /api/reajustes/[id]/draft
// Gera o rascunho do pedido de reajuste (usa o percentual/janela já analisados).
// Fica separado da análise do contrato para cada requisição ser rápida.
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
    .select("*")
    .eq("id", id)
    .single<Company>();
  if (!company) {
    return NextResponse.json({ error: "Operadora não encontrada" }, { status: 404 });
  }

  const { data: seqs } = await supabase
    .from("sequences")
    .select("*")
    .eq("company_id", id)
    .eq("channel", "email");
  const emailSeq = (seqs as Sequence[] | null)?.[0];
  if (!emailSeq) {
    return NextResponse.json(
      { error: "Sequência de e-mail não encontrada." },
      { status: 400 },
    );
  }

  const res = await generateDraftForSequence(supabase, company, emailSeq);
  if (!res.ok) {
    return NextResponse.json(
      { error: res.error ?? "Erro ao gerar o rascunho" },
      { status: 502 },
    );
  }
  return NextResponse.json({ ok: true });
}
