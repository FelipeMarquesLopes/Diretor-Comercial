import { NextResponse } from "next/server";
import { getServerSupabase } from "@/lib/supabase/server";
import { revealPerson } from "@/lib/apollo";
import { ensureSequences, generateDraftForSequence } from "@/lib/outreach";
import type { Company, Contact, MessageHook, Sequence } from "@/lib/types";

// POST /api/prospect/abordar
// Fluxo de "abordar uma empresa" num clique:
//   1. Escolhe o decisor de RH da empresa.
//   2. REVELA o e-mail dele no Apollo (1 crédito) — só agora, porque o CEO
//      decidiu contatar esta empresa.
//   3. Cria as sequências de follow-up (e-mail) e gera o rascunho.
// Nada é enviado: o rascunho fica aguardando o clique final do CEO.
// Body: { companyId, hook? }
export async function POST(req: Request) {
  let body: { companyId?: string; hook?: MessageHook };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Body inválido" }, { status: 400 });
  }
  if (!body.companyId) {
    return NextResponse.json({ error: "companyId é obrigatório" }, { status: 400 });
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

  const { data: company } = await supabase
    .from("companies")
    .select("*, contacts(*)")
    .eq("id", body.companyId)
    .single<Company & { contacts: Contact[] }>();

  if (!company) {
    return NextResponse.json({ error: "Empresa não encontrada" }, { status: 404 });
  }

  const contacts = company.contacts ?? [];
  // Melhor decisor: já com e-mail, senão um com apollo_id (para revelar).
  const target =
    contacts.find((c) => c.email) ??
    contacts.find((c) => c.apollo_id) ??
    contacts[0];

  if (!target) {
    return NextResponse.json(
      { error: "Esta empresa não tem contato de RH. Rode a busca com 'Buscar RH'." },
      { status: 400 },
    );
  }

  // Revela o e-mail se ainda não temos.
  if (!target.email && target.apollo_id) {
    try {
      const r = await revealPerson(target.apollo_id);
      if (r.email || r.phone) {
        await supabase
          .from("contacts")
          .update({ email: r.email ?? target.email, phone: r.phone ?? target.phone })
          .eq("id", target.id);
        target.email = r.email ?? target.email;
        target.phone = r.phone ?? target.phone;
      }
    } catch (err) {
      return NextResponse.json(
        { error: err instanceof Error ? err.message : "Erro ao revelar e-mail" },
        { status: 502 },
      );
    }
  }

  if (!target.email) {
    return NextResponse.json(
      {
        error:
          "O Apollo não tinha o e-mail deste decisor para revelar. Tente outra empresa ou contato.",
      },
      { status: 422 },
    );
  }

  // Cria a sequência de e-mail e gera o rascunho (entra no follow-up).
  await ensureSequences(supabase, company.id, false);
  const { data: seqs } = await supabase
    .from("sequences")
    .select("*")
    .eq("company_id", company.id)
    .eq("channel", "email");
  const emailSeq = (seqs as Sequence[] | null)?.[0];

  if (emailSeq) {
    const res = await generateDraftForSequence(
      supabase,
      company,
      emailSeq,
      body.hook ?? "nr1",
    );
    if (!res.ok) {
      return NextResponse.json(
        { error: res.error ?? "Erro ao gerar rascunho", email: target.email },
        { status: 502 },
      );
    }
  }

  // Move a empresa para "contato iniciado".
  await supabase
    .from("companies")
    .update({ status: "contato_iniciado" })
    .eq("id", company.id);

  return NextResponse.json({
    ok: true,
    contato: target.name,
    email: target.email,
    phone: target.phone,
  });
}
