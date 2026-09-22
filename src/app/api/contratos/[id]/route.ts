import { NextResponse } from "next/server";
import { getServerSupabase } from "@/lib/supabase/server";

const BUCKET = "contratos";

// DELETE /api/contratos/[id] — remove o contrato (registro + arquivos do Storage).
export async function DELETE(
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

  const { data: contrato } = await supabase
    .from("contracts")
    .select("id, files")
    .eq("id", id)
    .single<{ id: string; files: { path: string }[] | null }>();

  if (contrato?.files?.length) {
    const paths = contrato.files.map((f) => f.path).filter(Boolean);
    if (paths.length) await supabase.storage.from(BUCKET).remove(paths);
  }

  const { error } = await supabase.from("contracts").delete().eq("id", id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
