import { NextResponse } from "next/server";
import { getServerSupabase } from "@/lib/supabase/server";
import { criarPedidoReajuste } from "@/lib/reajusteAnual";

export const maxDuration = 60;

// POST /api/contratos/[id]/reajuste
// Prepara AGORA o pedido de reajuste deste contrato (rascunho pendente), mesmo
// fora de Jan-Fev — usado pela Lara ou por um botão. Não envia nada.
export async function POST(
  req: Request,
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

  const r = await criarPedidoReajuste(supabase, id, { force: true });
  if (!r.ok) {
    return NextResponse.json({ error: r.error ?? "Falha ao preparar o reajuste." }, { status: 502 });
  }
  return NextResponse.json({ ok: true });
}
