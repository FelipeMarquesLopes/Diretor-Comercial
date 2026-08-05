import { NextResponse } from "next/server";
import { getServerSupabase } from "@/lib/supabase/server";
import {
  searchCompanies,
  searchDecisionMakers,
  revealPerson,
} from "@/lib/apollo";
import { ensureSequences, generateDraftForSequence } from "@/lib/outreach";
import type { Company, Contact, Sequence } from "@/lib/types";

// Depois que o destinatário é definido (via Apollo), garante que exista UM
// rascunho pendente já endereçado — apagando pendentes antigos (montados no
// cadastro, quando ainda não havia e-mail) para não duplicar.
async function regenerarRascunho(
  supabase: ReturnType<typeof getServerSupabase>,
  company: Company,
): Promise<{ ok: boolean; error?: string }> {
  await ensureSequences(supabase, company.id, false);
  const { data: seqs } = await supabase
    .from("sequences")
    .select("*")
    .eq("company_id", company.id)
    .eq("channel", "email");
  const emailSeq = (seqs as Sequence[] | null)?.[0];
  if (!emailSeq) return { ok: false, error: "Sequência de e-mail não encontrada." };

  // Remove rascunhos de e-mail ainda pendentes (não enviados) desta operadora.
  await supabase
    .from("drafts")
    .delete()
    .eq("company_id", company.id)
    .eq("channel", "email")
    .eq("status", "pendente");

  return generateDraftForSequence(supabase, company, emailSeq, "nr1");
}

// POST /api/operadoras/[id]/apollo
// Usa o Apollo para achar contatos do SETOR DE CREDENCIAMENTO / COMERCIAL de
// uma operadora de saúde (gerente/analista/auxiliar de credenciamento, etc).
//
// Duas ações:
//   { action: "buscar" }
//     -> resolve o domínio da operadora (pelo nome, se ainda não tiver) e
//        devolve a lista de contatos de credenciamento encontrados (SEM gastar
//        crédito: o e-mail só é revelado no "usar").
//   { action: "usar", apolloId, name?, title? }
//     -> revela o e-mail desse contato (1 crédito) e o define como o contato
//        PRINCIPAL da operadora (destinatário do disparo). O rascunho já
//        existente passa a mandar para esse e-mail.
export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  let body: {
    action?: string;
    apolloId?: string;
    name?: string;
    title?: string;
    // Para a ação "usar_todos": a lista de contatos a revelar de uma vez.
    people?: { apolloId: string; name?: string; title?: string }[];
  };
  try {
    body = await req.json();
  } catch {
    body = {};
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
    .select("*")
    .eq("id", id)
    .single<Company>();

  if (!company) {
    return NextResponse.json(
      { error: "Operadora não encontrada" },
      { status: 404 },
    );
  }

  // --- Ação: USAR um contato encontrado (revela + define como principal) -----
  if (body.action === "usar") {
    if (!body.apolloId) {
      return NextResponse.json(
        { error: "apolloId é obrigatório" },
        { status: 400 },
      );
    }
    let revealed: { email: string | null; phone: string | null };
    try {
      revealed = await revealPerson(body.apolloId);
    } catch (err) {
      return NextResponse.json(
        { error: err instanceof Error ? err.message : "Erro ao revelar e-mail" },
        { status: 502 },
      );
    }
    if (!revealed.email) {
      return NextResponse.json(
        {
          error:
            "O Apollo não tinha o e-mail deste contato para revelar. Tente outro da lista.",
        },
        { status: 422 },
      );
    }

    // Define como o contato PRINCIPAL (o disparo usa o 1º contato com e-mail).
    const { data: existing } = await supabase
      .from("contacts")
      .select("*")
      .eq("company_id", id)
      .limit(1);
    const current = (existing as Contact[] | null)?.[0];
    const contactName = body.name || current?.name || "Credenciamento";

    if (current) {
      await supabase
        .from("contacts")
        .update({
          name: contactName,
          title: body.title ?? current.title,
          email: revealed.email,
          phone: revealed.phone ?? current.phone,
        })
        .eq("id", current.id);
    } else {
      await supabase.from("contacts").insert({
        company_id: id,
        name: contactName,
        title: body.title ?? null,
        email: revealed.email,
        phone: revealed.phone,
        is_decision_maker: true,
      });
    }

    await supabase.from("activities").insert({
      company_id: id,
      type: "cadastro",
      description: `Contato de credenciamento definido via Apollo: ${contactName} · ${revealed.email}.`,
    });

    // Gera o rascunho já endereçado para o clique final do CEO.
    const draft = await regenerarRascunho(supabase, company);

    return NextResponse.json({
      ok: true,
      email: revealed.email,
      name: contactName,
      draftGerado: draft.ok,
      draftErro: draft.ok ? undefined : draft.error,
    });
  }

  // --- Ação: USAR TODOS — revela todos de uma vez, 1º = Para, resto = CC ------
  if (body.action === "usar_todos") {
    const alvo = (body.people ?? []).filter((p) => p.apolloId);
    if (alvo.length === 0) {
      return NextResponse.json(
        { error: "Nenhum contato para revelar." },
        { status: 400 },
      );
    }

    // Revela todos em paralelo (consome 1 crédito por contato revelável).
    const revelados = await Promise.all(
      alvo.map(async (p) => {
        try {
          const r = await revealPerson(p.apolloId);
          return { name: p.name, title: p.title, email: r.email, phone: r.phone };
        } catch {
          return { name: p.name, title: p.title, email: null, phone: null };
        }
      }),
    );

    // Só os que realmente vieram com e-mail, sem duplicar.
    const comEmail: { name?: string; title?: string; email: string; phone: string | null }[] =
      [];
    const vistos = new Set<string>();
    for (const r of revelados) {
      if (!r.email) continue;
      const key = r.email.toLowerCase();
      if (vistos.has(key)) continue;
      vistos.add(key);
      comEmail.push({ name: r.name, title: r.title, email: r.email, phone: r.phone });
    }

    if (comEmail.length === 0) {
      return NextResponse.json(
        {
          error:
            "O Apollo não conseguiu revelar nenhum e-mail desta lista. Tente outros contatos.",
        },
        { status: 422 },
      );
    }

    // 1º revelado = destinatário principal (Para); o resto entra em cópia (CC).
    const principal = comEmail[0];
    const ccNovos = comEmail.slice(1).map((c) => c.email);

    // Junta com o CC que já existia (sem duplicar e sem repetir o principal).
    const ccExistente = (company.cc_emails ?? "")
      .split(",")
      .map((e) => e.trim())
      .filter(Boolean);
    const ccFinal: string[] = [];
    const ccVistos = new Set<string>([principal.email.toLowerCase()]);
    for (const e of [...ccExistente, ...ccNovos]) {
      const key = e.toLowerCase();
      if (ccVistos.has(key)) continue;
      ccVistos.add(key);
      ccFinal.push(e);
    }

    // Define o contato principal (Para).
    const { data: existing } = await supabase
      .from("contacts")
      .select("*")
      .eq("company_id", id)
      .limit(1);
    const current = (existing as Contact[] | null)?.[0];
    const nomePrincipal = principal.name || current?.name || "Credenciamento";
    if (current) {
      await supabase
        .from("contacts")
        .update({
          name: nomePrincipal,
          title: principal.title ?? current.title,
          email: principal.email,
          phone: principal.phone ?? current.phone,
        })
        .eq("id", current.id);
    } else {
      await supabase.from("contacts").insert({
        company_id: id,
        name: nomePrincipal,
        title: principal.title ?? null,
        email: principal.email,
        phone: principal.phone,
        is_decision_maker: true,
      });
    }

    // Salva o CC na operadora (o disparo do rascunho já usa cc_emails).
    await supabase
      .from("companies")
      .update({ cc_emails: ccFinal.join(", ") || null })
      .eq("id", id);

    await supabase.from("activities").insert({
      company_id: id,
      type: "cadastro",
      description: `Credenciamento (Apollo): ${nomePrincipal} como destinatário e ${ccFinal.length} em cópia — num disparo só.`,
    });

    // Gera UM rascunho já endereçado (Para + CC) para o clique final do CEO.
    const draft = await regenerarRascunho(supabase, company);

    return NextResponse.json({
      ok: true,
      principal: { name: nomePrincipal, email: principal.email },
      ccCount: ccFinal.length,
      revelados: comEmail.length,
      pedidos: alvo.length,
      draftGerado: draft.ok,
      draftErro: draft.ok ? undefined : draft.error,
    });
  }

  // --- Ação: BUSCAR (padrão) — acha os contatos de credenciamento ------------
  // 1) Resolve o domínio: usa o já salvo ou descobre pelo nome no Apollo.
  let domain = company.domain;
  if (!domain) {
    try {
      const orgs = await searchCompanies({
        name: company.name,
        locations: ["Brazil"],
        minEmployees: 1,
        perPage: 1,
      });
      domain = orgs[0]?.domain ?? null;
      if (domain) {
        await supabase
          .from("companies")
          .update({ domain })
          .eq("id", id);
      }
    } catch (err) {
      return NextResponse.json(
        { error: err instanceof Error ? err.message : "Erro no Apollo" },
        { status: 502 },
      );
    }
  }

  if (!domain) {
    return NextResponse.json(
      {
        error:
          "Não encontrei o domínio desta operadora no Apollo pelo nome. Confira o nome (ex: 'Bradesco Saúde') ou cadastre o e-mail manualmente na edição.",
      },
      { status: 404 },
    );
  }

  let people;
  try {
    people = await searchDecisionMakers(domain, 25, "operadora");
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Erro no Apollo" },
      { status: 502 },
    );
  }

  return NextResponse.json({
    domain,
    total: people.length,
    // Só devolvemos o necessário para escolher (sem gastar crédito).
    people: people.map((p) => ({
      apolloId: p.apolloId,
      name: p.name,
      title: p.title,
      emailStatus: p.emailStatus,
      alreadyEmail: Boolean(p.email),
    })),
  });
}
