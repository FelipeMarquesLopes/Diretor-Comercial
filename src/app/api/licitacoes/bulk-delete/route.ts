import { NextResponse } from "next/server";
import { getServerSupabase } from "@/lib/supabase/server";

// POST /api/licitacoes/bulk-delete  { ids: string[] }
// Exclui várias licitações de uma vez (seleção múltipla na lista).
export async function POST(req: Request) {
  let body: { ids?: string[] };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Body inválido" }, { status: 400 });
  }
  const ids = Array.isArray(body.ids) ? body.ids.filter(Boolean) : [];
  if (ids.length === 0) {
    return NextResponse.json({ error: "Nenhum item selecionado." }, { status: 400 });
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

  const { error } = await supabase.from("licitacoes").delete().in("id", ids);
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  return NextResponse.json({ ok: true, excluidas: ids.length });
}
