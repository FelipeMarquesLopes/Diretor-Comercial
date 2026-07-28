import { NextResponse } from "next/server";
import { getServerSupabase } from "@/lib/supabase/server";

// DELETE /api/companies/[id] — remove uma empresa (e tudo ligado a ela:
// contatos, rascunhos, sequências — via ON DELETE CASCADE).
// Usado para o CEO descartar empresas que não fazem sentido.
export async function DELETE(
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
  const { error } = await supabase.from("companies").delete().eq("id", id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
