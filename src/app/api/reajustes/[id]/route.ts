import { NextResponse } from "next/server";
import { getServerSupabase } from "@/lib/supabase/server";
import type { Contact } from "@/lib/types";

// PATCH /api/reajustes/[id] — edita a operadora da frente Reajustes.
export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  let body: {
    name?: string;
    briefing?: string;
    ccEmails?: string;
    notes?: string;
    contactName?: string;
    email?: string;
    phone?: string;
    // Permite o CEO ajustar manualmente o parecer da IA se quiser.
    reajustePercent?: string;
    reajusteJanela?: string;
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

  const companyUpdate: Record<string, unknown> = {};
  if (body.name !== undefined) companyUpdate.name = body.name;
  if (body.notes !== undefined) companyUpdate.notes = body.notes;
  if (body.briefing !== undefined) companyUpdate.briefing = body.briefing;
  if (body.ccEmails !== undefined)
    companyUpdate.cc_emails = body.ccEmails.trim() || null;
  if (body.reajustePercent !== undefined)
    companyUpdate.reajuste_percent = body.reajustePercent || null;
  if (body.reajusteJanela !== undefined)
    companyUpdate.reajuste_janela = body.reajusteJanela || null;
  if (Object.keys(companyUpdate).length > 0) {
    const { error } = await supabase
      .from("companies")
      .update(companyUpdate)
      .eq("id", id);
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  }

  const touchesContact =
    body.contactName !== undefined ||
    body.email !== undefined ||
    body.phone !== undefined;

  if (touchesContact) {
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
        })
        .eq("id", current.id);
    } else if (body.contactName || body.email || body.phone) {
      await supabase.from("contacts").insert({
        company_id: id,
        name: body.contactName || body.name || "Contato",
        email: body.email ?? null,
        phone: body.phone ?? null,
        is_decision_maker: true,
      });
    }
  }

  return NextResponse.json({ ok: true });
}

// DELETE /api/reajustes/[id] — remove a operadora da frente (cascade).
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
