import { NextResponse } from "next/server";
import { getServerSupabase } from "@/lib/supabase/server";
import { LICITACAO_STATUS } from "@/lib/prefeituras";

// PATCH /api/licitacoes/[id]
// Atualiza o acompanhamento (status), anotações e o contato da comissão.
// Body: { status?, notes?, contatoNome?, contatoEmail?, contatoTelefone? }
export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  let body: {
    status?: string;
    notes?: string;
    contatoNome?: string;
    contatoEmail?: string;
    contatoTelefone?: string;
  };
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

  const update: Record<string, unknown> = {};
  if (body.status !== undefined) {
    if (!LICITACAO_STATUS.some((s) => s.id === body.status)) {
      return NextResponse.json({ error: "Status inválido." }, { status: 400 });
    }
    update.status = body.status;
  }
  if (body.notes !== undefined) update.notes = body.notes.trim() || null;
  if (body.contatoNome !== undefined)
    update.contato_nome = body.contatoNome.trim() || null;
  if (body.contatoEmail !== undefined)
    update.contato_email = body.contatoEmail.trim() || null;
  if (body.contatoTelefone !== undefined)
    update.contato_telefone = body.contatoTelefone.trim() || null;

  if (Object.keys(update).length === 0) {
    return NextResponse.json({ error: "Nada para atualizar." }, { status: 400 });
  }

  const { data, error } = await supabase
    .from("licitacoes")
    .update(update)
    .eq("id", id)
    .select()
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ licitacao: data });
}

// DELETE /api/licitacoes/[id] — remove de vez (ex: cadastro manual errado).
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
  const { error } = await supabase.from("licitacoes").delete().eq("id", id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
