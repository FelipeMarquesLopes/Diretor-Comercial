import { NextResponse } from "next/server";
import { getServerSupabase } from "@/lib/supabase/server";

// POST /api/drafts/[id]/recipient  { email }
// Troca o e-mail do CONTATO vinculado a este rascunho — direto da tela de
// Rascunhos (mais prático que ir editar o cadastro). Como o e-mail é lido do
// contato na hora do envio, a correção vale para este rascunho e para os
// próximos envios automaticamente.
export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  let body: { email?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Body inválido" }, { status: 400 });
  }
  const email = (body.email ?? "").trim().toLowerCase();
  if (!email.includes("@") || email.length < 5) {
    return NextResponse.json({ error: "Digite um e-mail válido." }, { status: 400 });
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
    .select("contact_id, company_id")
    .eq("id", id)
    .single<{ contact_id: string | null; company_id: string }>();
  if (!draft?.contact_id) {
    return NextResponse.json(
      { error: "Este rascunho não tem um contato vinculado para editar." },
      { status: 400 },
    );
  }

  const { error } = await supabase
    .from("contacts")
    .update({ email })
    .eq("id", draft.contact_id);
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  await supabase.from("activities").insert({
    company_id: draft.company_id,
    type: "cadastro",
    description: `E-mail do contato corrigido pelo CEO (via rascunho) para ${email}.`,
  });

  return NextResponse.json({ ok: true, email });
}
