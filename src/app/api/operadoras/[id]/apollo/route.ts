import { NextResponse } from "next/server";
import { getServerSupabase } from "@/lib/supabase/server";
import {
  searchCompanies,
  searchDecisionMakers,
  revealPerson,
  isEmailVerified,
} from "@/lib/apollo";
import {
  verifierConfigured,
  verifyEmail,
  isSendable,
} from "@/lib/emailVerify";
import type { Company, Contact } from "@/lib/types";

// Revelar até 25 e-mails no Apollo é pesado — sem isto a função roda no
// tempo-limite padrão (~10s). A GERAÇÃO do rascunho fica numa rota à parte
// (/draft) de propósito, para não competir pelo mesmo tempo de execução.
export const maxDuration = 60;

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
    people?: {
      apolloId: string;
      name?: string;
      title?: string;
      emailStatus?: string | null;
    }[];
    // Se true (padrão), só revela/usa e-mails VERIFICADOS pelo Apollo — evita
    // bounces que ameaçam a reputação e a conta de envio.
    onlyVerified?: boolean;
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
    let revealed: {
      email: string | null;
      phone: string | null;
      emailStatus: string | null;
    };
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

    // Se não é verificado pelo Apollo e há verificador, checa antes de aceitar.
    if (!isEmailVerified(revealed.emailStatus) && verifierConfigured()) {
      const vr = await verifyEmail(revealed.email);
      if (!isSendable(vr)) {
        return NextResponse.json(
          {
            error: `O e-mail revelado (${revealed.email}) não passou na verificação (${vr}) — provavelmente a caixa não está ativa. Não usei, para não gerar retorno (bounce).`,
          },
          { status: 422 },
        );
      }
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

    // O rascunho é gerado numa chamada separada (/draft) pelo cliente.
    return NextResponse.json({
      ok: true,
      email: revealed.email,
      name: contactName,
    });
  }

  // --- Ação: USAR TODOS — revela todos de uma vez, 1º = Para, resto = CC ------
  if (body.action === "usar_todos") {
    const onlyVerified = body.onlyVerified !== false;
    let alvo = (body.people ?? []).filter((p) => p.apolloId);
    const pediram = alvo.length;
    const verifierOn = verifierConfigured();

    // Estratégia de deliverability:
    //  - COM verificador: revela todos e depois checa os não-verificados,
    //    enviando só para os que EXISTEM (sem gerar bounce).
    //  - SEM verificador: revela só os já-verificados pelo Apollo (seguro).
    if (!verifierOn && onlyVerified) {
      alvo = alvo.filter((p) => isEmailVerified(p.emailStatus));
    }

    if (alvo.length === 0) {
      return NextResponse.json(
        {
          error: `Nenhum dos ${pediram} contatos tem e-mail VERIFICADO pelo Apollo, e não há verificador configurado. Enviar para os não verificados causa retorno (bounce) e pode suspender a conta de envio — por isso não revelamos.`,
        },
        { status: 422 },
      );
    }

    // Revela em paralelo (consome 1 crédito do Apollo por contato revelável).
    const revelados = await Promise.all(
      alvo.map(async (p) => {
        try {
          const r = await revealPerson(p.apolloId);
          return {
            name: p.name,
            title: p.title,
            email: r.email,
            phone: r.phone,
            apolloVerified:
              isEmailVerified(r.emailStatus) || isEmailVerified(p.emailStatus),
          };
        } catch {
          return {
            name: p.name,
            title: p.title,
            email: null,
            phone: null,
            apolloVerified: false,
          };
        }
      }),
    );

    // Os que vieram com e-mail, sem duplicar.
    const unicos: {
      name?: string;
      title?: string;
      email: string;
      phone: string | null;
      apolloVerified: boolean;
    }[] = [];
    const vistos = new Set<string>();
    for (const r of revelados) {
      if (!r.email) continue;
      const key = r.email.toLowerCase();
      if (vistos.has(key)) continue;
      vistos.add(key);
      unicos.push({ ...r, email: r.email });
    }

    // Verifica (em paralelo) os que o Apollo NÃO garantiu, quando há
    // verificador. Só entram os enviáveis (válido ou catch-all).
    const naoVerificados = verifierOn
      ? unicos.filter((r) => !r.apolloVerified)
      : [];
    const verifMap = new Map<string, boolean>();
    if (naoVerificados.length > 0) {
      await Promise.all(
        naoVerificados.map(async (r) => {
          const vr = await verifyEmail(r.email);
          verifMap.set(r.email.toLowerCase(), isSendable(vr));
        }),
      );
    }

    const comEmail: { name?: string; title?: string; email: string; phone: string | null }[] =
      [];
    let invalidos = 0;
    for (const r of unicos) {
      const enviavel = r.apolloVerified
        ? true
        : verifierOn
          ? verifMap.get(r.email.toLowerCase()) === true
          : false;
      if (enviavel) {
        comEmail.push({ name: r.name, title: r.title, email: r.email, phone: r.phone });
      } else {
        invalidos++;
      }
    }
    const checados = naoVerificados.length;

    if (comEmail.length === 0) {
      return NextResponse.json(
        {
          error: verifierOn
            ? `Nenhum e-mail passou na verificação (${checados} checado(s), todos inválidos/inativos). Provavelmente essas pessoas não têm mais caixa ativa nesta operadora.`
            : "O Apollo não conseguiu revelar nenhum e-mail verificado desta lista.",
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

    // O rascunho é gerado numa chamada separada (/draft) pelo cliente.
    return NextResponse.json({
      ok: true,
      principal: { name: nomePrincipal, email: principal.email },
      ccCount: ccFinal.length,
      enviaveis: comEmail.length,
      checados,
      invalidos,
      pedidos: pediram,
      verifierAtivo: verifierOn,
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
    // Com verificador ativo, dá para enviar também para não-verificados que
    // passem na checagem — a UI usa isso para adaptar o botão.
    verifierAtivo: verifierConfigured(),
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
