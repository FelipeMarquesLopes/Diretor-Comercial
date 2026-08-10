import { NextResponse } from "next/server";
import { getServerSupabase } from "@/lib/supabase/server";
import { revealPerson, isEmailVerified } from "@/lib/apollo";
import { verifierConfigured, verifyEmail } from "@/lib/emailVerify";
import { getSuppressedSet } from "@/lib/suppression";
import type { Contact } from "@/lib/types";

// Revelar 10+ e-mails no Apollo + validar cada um é pesado.
export const maxDuration = 60;

// POST /api/companies/[id]/reveal-contacts
// Revela e VALIDA os e-mails de todos os decisores de uma empresa/consultório/
// escola de uma vez — para o CEO ver quais dos contatos encontrados têm e-mail
// realmente válido (não cai em spam). Mesmo rigor das operadoras.
// Consome 1 crédito do Apollo por contato revelado + 1 verificação por e-mail.
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

  const { data: contactsData } = await supabase
    .from("contacts")
    .select("*")
    .eq("company_id", id);
  const contatos = (contactsData as Contact[] | null) ?? [];

  // Alvos: os que dá para revelar (têm apollo_id) e ainda não foram resolvidos
  // (sem e-mail e não marcados como indisponíveis).
  const alvos = contatos.filter(
    (c) =>
      c.apollo_id &&
      !c.email &&
      (c.email_status ?? "").toLowerCase() !== "unavailable",
  );

  if (alvos.length === 0) {
    return NextResponse.json({
      ok: true,
      revelados: 0,
      validos: 0,
      invalidos: 0,
      catchAll: 0,
      aviso: "Nada novo para revelar (todos já resolvidos ou sem ID do Apollo).",
    });
  }

  let revelados = 0;
  let validos = 0;
  let invalidos = 0;
  let catchAll = 0;

  for (const c of alvos) {
    let revealed: {
      email: string | null;
      phone: string | null;
      emailStatus: string | null;
    };
    try {
      revealed = await revealPerson(c.apollo_id!);
    } catch {
      continue; // um erro num contato não derruba os demais
    }

    const update: Record<string, unknown> = {};
    if (revealed.phone) update.phone = revealed.phone;

    if (!revealed.email) {
      update.email_status = "unavailable";
      await supabase.from("contacts").update(update).eq("id", c.id);
      continue;
    }

    revelados++;
    const email = revealed.email.toLowerCase();
    update.email = revealed.email;

    let verdict: string;
    const suprimidos = await getSuppressedSet(supabase, [email]);
    if (suprimidos.has(email)) verdict = "invalid";
    else if (isEmailVerified(revealed.emailStatus)) verdict = "valid";
    else if (verifierConfigured()) verdict = await verifyEmail(email);
    else verdict = "unknown";

    update.email_verdict = verdict;
    await supabase.from("contacts").update(update).eq("id", c.id);

    if (verdict === "valid") validos++;
    else if (verdict === "catch_all") catchAll++;
    else invalidos++;
  }

  await supabase.from("activities").insert({
    company_id: id,
    type: "prospeccao",
    description: `Revelação+validação em lote: ${revelados} revelado(s) · ${validos} válido(s) · ${catchAll} catch-all · ${invalidos} inválido(s).`,
  });

  return NextResponse.json({ ok: true, revelados, validos, invalidos, catchAll });
}
