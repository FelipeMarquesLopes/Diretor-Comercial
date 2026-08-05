import { NextResponse } from "next/server";
import { getServerSupabase } from "@/lib/supabase/server";
import {
  searchCompanies,
  searchDecisionMakers,
  revealPerson,
} from "@/lib/apollo";
import type { Company, Contact } from "@/lib/types";

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

    return NextResponse.json({ ok: true, email: revealed.email, name: contactName });
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
