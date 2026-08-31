import { NextResponse } from "next/server";
import { getServerSupabase } from "@/lib/supabase/server";
import type { Contact } from "@/lib/types";

// POST /api/companies/[id]/contact  { name?, email?, phone?, title? }
// Define/atualiza o contato principal de um parceiro já existente. Usado quando
// a Lara encontra o e-mail em outra fonte (site/Google) e precisa gravá-lo para
// depois preparar o rascunho. Faz upsert do primeiro contato da empresa.
export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  let body: { name?: string; email?: string; phone?: string; title?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Body inválido" }, { status: 400 });
  }
  const email = body.email?.trim().toLowerCase() || null;
  if (email && !email.includes("@")) {
    return NextResponse.json({ error: "E-mail inválido." }, { status: 400 });
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

  const { data: existentes } = await supabase
    .from("contacts")
    .select("*")
    .eq("company_id", id)
    .limit(1);
  const atual = (existentes as Contact[] | null)?.[0];

  if (atual) {
    const { data, error } = await supabase
      .from("contacts")
      .update({
        name: body.name?.trim() || atual.name,
        email: email ?? atual.email,
        phone: body.phone?.trim() || atual.phone,
        title: body.title?.trim() || atual.title,
      })
      .eq("id", atual.id)
      .select()
      .single();
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ ok: true, contact: data });
  }

  const { data, error } = await supabase
    .from("contacts")
    .insert({
      company_id: id,
      name: body.name?.trim() || "Contato",
      email,
      phone: body.phone?.trim() || null,
      title: body.title?.trim() || null,
      is_decision_maker: true,
    })
    .select()
    .single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true, contact: data });
}
