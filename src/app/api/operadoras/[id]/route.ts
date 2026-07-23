import { NextResponse } from "next/server";
import { getServerSupabase } from "@/lib/supabase/server";
import type { Contact } from "@/lib/types";

// PATCH /api/operadoras/[id] — edita a operadora e o contato principal.
// Body: { name?, notes?, contactName?, email?, phone?, isWhatsapp? }
export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  let body: {
    name?: string;
    notes?: string;
    contactName?: string;
    email?: string;
    phone?: string;
    isWhatsapp?: boolean;
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

  // Atualiza os dados da operadora (só o que veio).
  const companyUpdate: Record<string, unknown> = {};
  if (body.name !== undefined) companyUpdate.name = body.name;
  if (body.notes !== undefined) companyUpdate.notes = body.notes;
  if (Object.keys(companyUpdate).length > 0) {
    const { error } = await supabase
      .from("companies")
      .update(companyUpdate)
      .eq("id", id);
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  }

  // Atualiza (ou cria) o contato principal.
  const touchesContact =
    body.contactName !== undefined ||
    body.email !== undefined ||
    body.phone !== undefined ||
    body.isWhatsapp !== undefined;

  if (touchesContact) {
    const hasWhatsapp = Boolean(body.isWhatsapp && body.phone);
    const { data: existing } = await supabase
      .from("contacts")
      .select("*")
      .eq("company_id", id)
      .limit(1);
    const current = (existing as Contact[] | null)?.[0];

    if (current) {
      await supabase
        .from("contacts")
        .update({
          name: body.contactName ?? current.name,
          email: body.email ?? current.email,
          phone: body.phone ?? current.phone,
          is_whatsapp: hasWhatsapp,
        })
        .eq("id", current.id);
    } else if (body.contactName || body.email || body.phone) {
      await supabase.from("contacts").insert({
        company_id: id,
        name: body.contactName || body.name || "Contato",
        email: body.email ?? null,
        phone: body.phone ?? null,
        is_whatsapp: hasWhatsapp,
        is_decision_maker: true,
      });
    }
  }

  await supabase.from("activities").insert({
    company_id: id,
    type: "cadastro",
    description: "Operadora editada pelo CEO.",
  });

  return NextResponse.json({ ok: true });
}

// DELETE /api/operadoras/[id] — exclui a operadora (e tudo ligado a ela:
// contatos, rascunhos, sequências, respostas — via ON DELETE CASCADE).
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
