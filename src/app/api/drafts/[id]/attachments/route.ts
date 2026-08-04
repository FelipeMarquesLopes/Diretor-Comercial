import { NextResponse } from "next/server";
import { getServerSupabase } from "@/lib/supabase/server";
import type { DraftAttachment } from "@/lib/types";

const BUCKET = "anexos";

// POST /api/drafts/[id]/attachments  { paths: string[], names: string[] }
// Registra os anexos (já subidos ao Storage) no rascunho.
export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;

  let body: { paths?: string[]; names?: string[] };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Body inválido" }, { status: 400 });
  }
  const paths = (body.paths ?? []).filter((p) => typeof p === "string");
  const names = body.names ?? [];
  if (paths.length === 0) {
    return NextResponse.json({ error: "Nenhum anexo informado." }, { status: 400 });
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
    .select("attachments")
    .eq("id", id)
    .single<{ attachments: DraftAttachment[] | null }>();
  if (!draft) {
    return NextResponse.json({ error: "Rascunho não encontrado" }, { status: 404 });
  }

  const novos: DraftAttachment[] = paths.map((path, i) => ({
    path,
    name: names[i] || path.split("/").pop() || "documento",
  }));
  const attachments = [...(draft.attachments ?? []), ...novos];

  await supabase.from("drafts").update({ attachments }).eq("id", id);
  return NextResponse.json({ attachments });
}

// DELETE /api/drafts/[id]/attachments?path=...  — remove um anexo.
export async function DELETE(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const path = new URL(req.url).searchParams.get("path");
  if (!path) {
    return NextResponse.json({ error: "path é obrigatório" }, { status: 400 });
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
    .select("attachments")
    .eq("id", id)
    .single<{ attachments: DraftAttachment[] | null }>();
  if (!draft) {
    return NextResponse.json({ error: "Rascunho não encontrado" }, { status: 404 });
  }

  const attachments = (draft.attachments ?? []).filter((a) => a.path !== path);
  await supabase.from("drafts").update({ attachments }).eq("id", id);
  await supabase.storage.from(BUCKET).remove([path]); // limpa do Storage
  return NextResponse.json({ attachments });
}
