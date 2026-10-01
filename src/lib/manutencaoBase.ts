// REVISÃO MENSAL DA BASE DE PROSPECÇÃO (manutenção automática dos e-mails).
//
// O que a Lara faz, toda rodada, com os parceiros de PROSPECÇÃO (operadoras,
// empresas, escolas, médicos, sindicatos, igrejas — tudo que NÃO é só contrato):
//
//   1. Reverifica o e-mail cadastrado de cada contato (barato — verificador).
//   2. Se o e-mail ainda é válido → só carimba a data e segue.
//   3. Se o e-mail MORREU → usa o Apollo para achar um substituto:
//        a) revela de novo o próprio decisor (o e-mail dele pode ter mudado);
//        b) se não achar, busca outro decisor no mesmo domínio.
//      Achou um e-mail válido? TROCA sozinha e registra na atividade do
//      parceiro. Não achou? Marca o e-mail como inválido e sinaliza.
//
// CUSTO: isto NÃO usa a IA (Anthropic) — é rotina de backend. Gasta créditos do
// VERIFICADOR (1 por e-mail checado) e do APOLLO (1 por revelação) — e o Apollo
// só é tocado nos e-mails que falharam, com teto por rodada. A varredura é
// fatiada (um pouco por dia) para cada contato ser revisto ~1x/mês sem estourar
// o tempo do cron nem os créditos.

import type { SupabaseClient } from "@supabase/supabase-js";
import { revealPerson, searchDecisionMakers, isEmailVerified } from "./apollo";
import { verifierConfigured, verifyEmail, isSendable } from "./emailVerify";
import { getSuppressedSet, suppressEmail } from "./suppression";

const DIA = 86_400_000;

// Categorias que o Apollo sabe buscar decisores por domínio. As demais
// (agenda_aberta, reajuste…) caem no fallback "empresa" só na hora de procurar
// um substituto — a reverificação do e-mail atual vale para todas.
const CATS_APOLLO = ["empresa", "medico", "escola", "operadora", "igreja", "sindicato"] as const;
type CatApollo = (typeof CATS_APOLLO)[number];
function catParaApollo(c: string | null | undefined): CatApollo {
  return (CATS_APOLLO as readonly string[]).includes(c ?? "")
    ? (c as CatApollo)
    : "empresa";
}

type LinhaContato = {
  id: string;
  company_id: string;
  name: string | null;
  title: string | null;
  email: string | null;
  apollo_id: string | null;
  companies: { name?: string | null; domain?: string | null; category?: string | null } | null;
};

export type ResultadoRevisao = {
  processados: number;
  verificados: number;
  trocados: number;
  mortos: number;
  apolloUsados: number;
  trocas: { parceiro: string; de: string; para: string }[];
};

// Revisa um LOTE de contatos de prospecção cuja checagem está vencida (28+ dias
// ou nunca checada). Idempotente e seguro para rodar todo dia: só pega os
// vencidos, então cada contato é revisto ~1x/mês.
export async function revisarBaseEmails(
  supabase: SupabaseClient,
  opts?: { max?: number; maxApollo?: number },
): Promise<ResultadoRevisao> {
  const max = opts?.max ?? 40; // contatos reverificados por rodada
  const maxApollo = opts?.maxApollo ?? 12; // teto de revelações Apollo por rodada
  const cutoff = new Date(Date.now() - 28 * DIA).toISOString();

  const res: ResultadoRevisao = {
    processados: 0,
    verificados: 0,
    trocados: 0,
    mortos: 0,
    apolloUsados: 0,
    trocas: [],
  };

  // Contatos de parceiros de PROSPECÇÃO (contract_only=false) que têm e-mail e
  // cuja última checagem está vencida. `!inner` garante o filtro no join.
  const { data, error } = await supabase
    .from("contacts")
    .select(
      "id, company_id, name, title, email, apollo_id, companies!inner(name, domain, category, contract_only)",
    )
    .eq("companies.contract_only", false)
    .not("email", "is", null)
    .or(`email_checked_at.is.null,email_checked_at.lt.${cutoff}`)
    .limit(max);

  if (error) throw new Error(error.message);
  const linhas = (data as unknown as LinhaContato[] | null) ?? [];
  res.processados = linhas.length;

  const verificar = verifierConfigured();

  for (const c of linhas) {
    const agora = new Date().toISOString();
    const emailAtual = (c.email ?? "").trim();
    if (!emailAtual) {
      await carimbar(supabase, c.id, agora);
      continue;
    }
    const emailLower = emailAtual.toLowerCase();

    // 1) O e-mail atual ainda serve? (verificador + lista de supressão)
    let vivo: boolean;
    const suprimidos = await getSuppressedSet(supabase, [emailLower]);
    if (suprimidos.has(emailLower)) {
      vivo = false; // já deu bounce/descadastro antes — está morto
    } else if (verificar) {
      const vr = await verifyEmail(emailLower);
      res.verificados++;
      vivo = isSendable(vr);
    } else {
      // Sem verificador configurado não dá para afirmar que morreu — mantém.
      vivo = true;
    }

    if (vivo) {
      await supabase
        .from("contacts")
        .update({ email_checked_at: agora, email_verdict: "valid" })
        .eq("id", c.id);
      continue;
    }

    // 2) E-mail morto → procura substituto no Apollo (se ainda há orçamento).
    const parceiro = c.companies?.name ?? "parceiro";
    const domain = c.companies?.domain ?? null;
    const categoria = c.companies?.category ?? null;
    let novo: { email: string; apolloId?: string | null; name?: string | null; title?: string | null; phone?: string | null } | null = null;

    // 2a) Revela de novo o MESMO decisor — o e-mail dele pode ter mudado.
    if (!novo && c.apollo_id && res.apolloUsados < maxApollo) {
      res.apolloUsados++;
      novo = await tentarRevelar(c.apollo_id, emailLower, verificar);
    }

    // 2b) Nada? Busca OUTRO decisor no mesmo domínio e revela até achar um bom.
    if (!novo && domain && res.apolloUsados < maxApollo) {
      try {
        const pessoas = await searchDecisionMakers(domain, 5, catParaApollo(categoria));
        for (const p of pessoas) {
          if (res.apolloUsados >= maxApollo) break;
          if (!p.apolloId) continue;
          // Se o Apollo já entrega o e-mail verificado, aproveita sem revelar.
          if (p.email && isEmailVerified(p.emailStatus)) {
            if (p.email.toLowerCase() !== emailLower && (await emailBom(p.email, verificar))) {
              novo = { email: p.email, apolloId: p.apolloId, name: p.name, title: p.title };
              break;
            }
          }
          res.apolloUsados++;
          const r = await tentarRevelar(p.apolloId, emailLower, verificar);
          if (r) {
            novo = { ...r, apolloId: p.apolloId, name: p.name, title: p.title };
            break;
          }
        }
      } catch {
        // falha de busca não derruba a rodada
      }
    }

    // 3) Aplica o resultado.
    if (novo) {
      // Suprime o e-mail morto (não voltamos a tentar enviar para ele).
      await suppressEmail(supabase, {
        email: emailLower,
        reason: "manual",
        source: "revisao_mensal",
        companyId: c.company_id,
      });
      await supabase
        .from("contacts")
        .update({
          email: novo.email,
          email_verdict: "valid",
          email_status: "verified",
          email_checked_at: agora,
          apollo_id: novo.apolloId ?? c.apollo_id,
          name: novo.name ?? c.name,
          title: novo.title ?? c.title,
          ...(novo.phone ? { phone: novo.phone } : {}),
        })
        .eq("id", c.id);
      await supabase.from("activities").insert({
        company_id: c.company_id,
        type: "prospeccao",
        description: `Revisão mensal: o e-mail ${emailAtual} não respondia mais — a Lara atualizou para ${novo.email} (encontrado no Apollo).`,
      });
      res.trocados++;
      res.trocas.push({ parceiro, de: emailAtual, para: novo.email });
    } else {
      // Sem substituto: marca inválido e carimba (só tenta de novo no próximo
      // ciclo, não todo dia) e registra para o CEO ver.
      await supabase
        .from("contacts")
        .update({ email_verdict: "invalid", email_checked_at: agora })
        .eq("id", c.id);
      await supabase.from("activities").insert({
        company_id: c.company_id,
        type: "prospeccao",
        description: `Revisão mensal: o e-mail ${emailAtual} parou de funcionar e a Lara não achou substituto no Apollo. Vale conferir manualmente.`,
      });
      res.mortos++;
    }
  }

  return res;
}

// Revela um apolloId e devolve o e-mail SE for diferente do atual e passar na
// validação. Caso contrário, null.
async function tentarRevelar(
  apolloId: string,
  emailAtualLower: string,
  verificar: boolean,
): Promise<{ email: string; phone: string | null } | null> {
  try {
    const r = await revealPerson(apolloId);
    if (!r.email) return null;
    if (r.email.toLowerCase() === emailAtualLower) return null; // mesmo e-mail morto
    // Verificado pelo Apollo já basta; senão, passa pelo verificador.
    if (isEmailVerified(r.emailStatus) || (await emailBom(r.email, verificar))) {
      return { email: r.email, phone: r.phone };
    }
    return null;
  } catch {
    return null;
  }
}

// O e-mail é bom o bastante para enviar? (usa o verificador quando existe)
async function emailBom(email: string, verificar: boolean): Promise<boolean> {
  if (!verificar) return true; // sem verificador, aceita (melhor que o morto)
  return isSendable(await verifyEmail(email.toLowerCase()));
}

async function carimbar(supabase: SupabaseClient, contactId: string, agora: string) {
  await supabase.from("contacts").update({ email_checked_at: agora }).eq("id", contactId);
}
