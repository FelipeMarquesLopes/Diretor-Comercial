import { NextResponse } from "next/server";
import { getServerSupabase } from "@/lib/supabase/server";
import { revealPerson, isEmailVerified } from "@/lib/apollo";
import { verifierConfigured, verifyEmail, isSendable } from "@/lib/emailVerify";
import { getSuppressedSet } from "@/lib/suppression";
import { ensureSequences, generateDraftForSequence } from "@/lib/outreach";
import type { Company, Contact, MessageHook, Sequence } from "@/lib/types";

// Export para maxDuration (revelar + validar + IA pode passar do padrão).
export const maxDuration = 60;

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
  // Prioriza o melhor decisor para abordar:
  //   1) RH / Gente / Benefícios (quem cuida de convênios nas empresas)
  //   2) Dono / sócio / diretor / CEO (decisor da parceria)
  //   3) qualquer outro
  // Empate: prefere quem já tem e-mail; senão quem tem apollo_id (revelável).
  function rankTitle(title: string | null): number {
    const t = (title ?? "").toLowerCase();
    if (
      /\b(rh|recursos humanos|human resources|\bhr\b|people|gente|benef)/.test(t)
    ) {
      return 0;
    }
    if (
      /(ceo|founder|owner|president|presidente|propriet|s[óo]cio|diretor|diretora|managing)/.test(
        t,
      )
    ) {
      return 1;
    }
    return 2;
  }
  // Quão "alcançável" é o e-mail deste contato (menor = melhor).
  // Prioriza quem já foi VALIDADO (verdict) e evita os conhecidos como inválidos.
  function reachRank(c: Contact): number {
    const v = (c.email_verdict ?? "").toLowerCase();
    if (c.email) {
      if (v === "valid") return 0; // revelado e validado — o melhor
      if (v === "catch_all") return 1;
      if (v === "invalid") return 8; // conhecido ruim — evita
      return 0.5; // tem e-mail, ainda sem veredito (será validado no abordar)
    }
    const s = (c.email_status ?? "").toLowerCase();
    if (s.includes("verified") || s.includes("likely")) return 2; // revelável
    if (c.apollo_id && s !== "unavailable") return 3; // vale tentar revelar
    return 9; // Apollo não tem e-mail
  }
  const target = [...contacts].sort((a, b) => {
    // 1º prioriza quem tem e-mail alcançável (senão não adianta o cargo);
    // 2º desempata pelo cargo (RH > liderança > outros).
    const byReach = reachRank(a) - reachRank(b);
    if (byReach !== 0) return byReach;
    return rankTitle(a.title) - rankTitle(b.title);
  })[0];

  if (!target) {
    return NextResponse.json(
      {
        error:
          "Esta empresa não tem nenhum decisor encontrado. Rode a busca marcando 'Buscar decisores'.",
      },
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

  // MESMA proteção das operadoras — vale para empresas, médicos e escolas:
  // 1) nunca abordar quem está na lista de bloqueio (retorno/descadastro).
  const suprimidos = await getSuppressedSet(supabase, [target.email]);
  if (suprimidos.has(target.email.toLowerCase())) {
    return NextResponse.json(
      {
        error:
          "O e-mail deste decisor está na lista de bloqueio (retornou antes / pediu descadastro). Escolha outro contato.",
      },
      { status: 409 },
    );
  }
  // 2) se não é verificado pelo Apollo e há verificador, confirma a caixa antes
  //    de gerar rascunho — evita bounce (e não queima a conta de envio).
  if (!isEmailVerified(target.email_status) && verifierConfigured()) {
    const vr = await verifyEmail(target.email);
    if (!isSendable(vr)) {
      return NextResponse.json(
        {
          error: `O e-mail revelado (${target.email}) não passou na validação (${vr}) — provável caixa inativa. Tente outro contato desta empresa ou cadastre o e-mail certo.`,
        },
        { status: 422 },
      );
    }
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
