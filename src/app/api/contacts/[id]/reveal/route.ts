import { NextResponse } from "next/server";
import { getServerSupabase } from "@/lib/supabase/server";
import { revealPerson } from "@/lib/apollo";
import type { Contact } from "@/lib/types";

// POST /api/contacts/[id]/reveal
// "Revela" (enriquece) o e-mail/telefone do contato via Apollo. Consome 1
// crédito do Apollo. Só é chamado quando o CEO decide revelar aquele decisor.
export async function POST(
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

  const { data: contact } = await supabase
    .from("contacts")
    .select("*")
    .eq("id", id)
    .single<Contact>();

  if (!contact) {
    return NextResponse.json({ error: "Contato não encontrado" }, { status: 404 });
  }
  if (!contact.apollo_id) {
    return NextResponse.json(
      { error: "Este contato não tem ID do Apollo para revelar." },
      { status: 400 },
    );
  }

  let revealed;
  try {
    revealed = await revealPerson(contact.apollo_id);
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Erro no Apollo" },
      { status: 502 },
    );
  }

  const update: Record<string, unknown> = {};
  if (revealed.email) update.email = revealed.email;
  if (revealed.phone) update.phone = revealed.phone;
  // Se o Apollo não devolveu e-mail, marca como indisponível para o painel
  // não oferecer "Revelar" de novo (não gasta crédito à toa).
  if (!revealed.email) update.email_status = "unavailable";

  if (Object.keys(update).length > 0) {
    await supabase.from("contacts").update(update).eq("id", id);
  }

  return NextResponse.json({
    email: revealed.email,
    phone: revealed.phone,
    revealed: Boolean(revealed.email || revealed.phone),
  });
}
