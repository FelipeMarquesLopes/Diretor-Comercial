// REVISÃO MENSAL DA BASE DE PROSPECÇÃO (manutenção automática dos e-mails).
//
// Roda para AS DUAS marcas (MenthalHelp e Therapy Minds) — não filtra por marca,
// então cuida de toda a base de uma vez.
//
// O que a Lara faz, toda rodada, com os parceiros de PROSPECÇÃO (operadoras,
// empresas, escolas, médicos, sindicatos, igrejas — tudo que NÃO é só contrato):
//
//   1. Reverifica o e-mail cadastrado de cada contato (barato — verificador).
//   2. Só considera MORTO o que é comprovadamente morto: suprimido (bounce/
//      descadastro) OU reprovado como "invalid" pelo verificador. "catch_all" e
//      "unknown" são MANTIDOS (podem ser hiccup do verificador ou domínio que
//      aceita tudo).
//   3. Nos mortos (ou nos contatos SEM e-mail), usa o Apollo para achar um
//      e-mail bom — e SÓ troca se o novo e-mail for aprovado pelo verificador.
//   4. Se o parceiro tinha RASCUNHO parado, corrige o rascunho para o novo
//      contato/e-mail. Sem IA.
//
// TRAVAS DE SEGURANÇA (para NUNCA churnar a base por defeito do verificador):
//   A. DISJUNTOR: se o verificador reprovar uma fração anormal da amostra
//      (> LIMITE_ANOMALIA de uma leva com MIN_AMOSTRA+ e-mails), assumimos que
//      ele está com problema e NÃO trocamos nada por causa dele (deixa para a
//      próxima rodada, sem carimbar) — só bounces reais e faltantes seguem.
//   B. O e-mail NOVO precisa passar no verificador como válido (se quebrado,
//      ele reprova o novo também → nenhuma troca acontece).
//   C. TETO de trocas por rodada (cinto de segurança extra).
//
// CUSTO: NÃO usa a IA (Anthropic). Gasta VERIFICADOR (1 por e-mail checado) e
// APOLLO (1 por revelação, só nos mortos/faltantes, com teto por rodada).

import type { SupabaseClient } from "@supabase/supabase-js";
import { revealPerson, searchDecisionMakers, isEmailVerified } from "./apollo";
import { verifierConfigured, verifyEmail, isSendable } from "./emailVerify";
import { getSuppressedSet, suppressEmail } from "./suppression";

const DIA = 86_400_000;

// Disjuntor: a partir de MIN_AMOSTRA e-mails testados numa leva, se mais de
// LIMITE_ANOMALIA deles forem "invalid", o verificador é considerado suspeito.
const MIN_AMOSTRA = 8;
const LIMITE_ANOMALIA = 0.5;

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
  trocados: number; // e-mail morto substituído
  vinculados: number; // contato sem e-mail que ganhou um
  mortos: number; // morto e sem substituto
  segurados: number; // reprovados segurados pelo disjuntor (não mexidos)
  rascunhosCorrigidos: number;
  apolloUsados: number;
  suspeitaVerificador: boolean;
  trocas: { parceiro: string; de: string; para: string }[];
};

function vazio(): ResultadoRevisao {
  return {
    processados: 0,
    verificados: 0,
    trocados: 0,
    vinculados: 0,
    mortos: 0,
    segurados: 0,
    rascunhosCorrigidos: 0,
    apolloUsados: 0,
    suspeitaVerificador: false,
    trocas: [],
  };
}

// Revisa um LOTE de contatos de prospecção (das DUAS marcas) cuja checagem está
// vencida (28+ dias ou nunca checada). Idempotente e seguro para rodar todo
// dia: só pega os vencidos, então cada contato é revisto ~1x/mês.
export async function revisarBaseEmails(
  supabase: SupabaseClient,
  opts?: { max?: number; maxApollo?: number; tetoTrocas?: number },
): Promise<ResultadoRevisao> {
  const max = opts?.max ?? 40; // contatos por rodada
  const maxApollo = opts?.maxApollo ?? 12; // teto de revelações Apollo por rodada
  const tetoTrocas = opts?.tetoTrocas ?? 20; // teto de trocas+vínculos por rodada
  const cutoff = new Date(Date.now() - 28 * DIA).toISOString();

  const res = vazio();

  // Contatos de parceiros de PROSPECÇÃO (contract_only=false), de QUALQUER marca,
  // cuja checagem está vencida E que têm e-mail OU apollo_id (dá para agir).
  const { data, error } = await supabase
    .from("contacts")
    .select(
      "id, company_id, name, title, email, apollo_id, companies!inner(name, domain, category, contract_only)",
    )
    .eq("companies.contract_only", false)
    .or(`email_checked_at.is.null,email_checked_at.lt.${cutoff}`)
    .or("email.not.is.null,apollo_id.not.is.null")
    .limit(max);

  if (error) throw new Error(error.message);
  const linhas = (data as unknown as LinhaContato[] | null) ?? [];
  res.processados = linhas.length;

  const verificar = verifierConfigured();

  // ===== PASSO 1: classifica. Age já nos VIVOS (carimba). Enfileira os alvos.
  type Alvo = { c: LinhaContato; tipo: "bounce" | "verif" | "faltando" };
  const fila: Alvo[] = [];
  let invalidosVerif = 0;

  for (const c of linhas) {
    const agora = new Date().toISOString();
    const emailAtual = (c.email ?? "").trim();
    const temEmail = emailAtual.length > 0;
    const emailLower = emailAtual.toLowerCase();

    if (temEmail) {
      const suprimidos = await getSuppressedSet(supabase, [emailLower]);
      if (suprimidos.has(emailLower)) {
        fila.push({ c, tipo: "bounce" }); // bounce/descadastro real — morto seguro
        continue;
      }
      if (verificar) {
        const verdict = await verifyEmail(emailLower);
        res.verificados++;
        if (verdict === "invalid") {
          invalidosVerif++;
          fila.push({ c, tipo: "verif" });
          continue;
        }
        // vivo (valid/catch_all/unknown) → mantém e carimba
        await supabase
          .from("contacts")
          .update({ email_checked_at: agora, email_verdict: verdict })
          .eq("id", c.id);
        continue;
      }
      // Sem verificador não dá para afirmar que morreu → mantém e carimba.
      await supabase.from("contacts").update({ email_checked_at: agora }).eq("id", c.id);
      continue;
    }

    // Sem e-mail (mas com apollo_id) → candidato a VINCULAR um e-mail novo.
    fila.push({ c, tipo: "faltando" });
  }

  // ===== DISJUNTOR: verificador reprovou fração anormal? então está suspeito.
  const suspeitaVerificador =
    verificar &&
    res.verificados >= MIN_AMOSTRA &&
    invalidosVerif / res.verificados > LIMITE_ANOMALIA;
  res.suspeitaVerificador = suspeitaVerificador;

  // ===== PASSO 2: age nos alvos (com as travas).
  for (const { c, tipo } of fila) {
    const agora = new Date().toISOString();
    const emailAtual = (c.email ?? "").trim();
    const temEmail = emailAtual.length > 0;
    const emailLower = emailAtual.toLowerCase();

    // TRAVA A: verificador suspeito → NÃO mexe nos reprovados por ele (deixa
    // para a próxima rodada, sem carimbar). Bounces reais e faltantes seguem.
    if (tipo === "verif" && suspeitaVerificador) {
      res.segurados++;
      continue;
    }

    // TRAVA C: teto de trocas/vínculos por rodada — para de agir, resto fica
    // para a próxima (sem carimbar, para não perder).
    if (res.trocados + res.vinculados >= tetoTrocas) break;
    // Orçamento de Apollo esgotado → idem (não marca inválido sem tentar).
    if (res.apolloUsados >= maxApollo) break;

    const parceiro = c.companies?.name ?? "parceiro";
    const domain = c.companies?.domain ?? null;
    const categoria = c.companies?.category ?? null;
    let novo:
      | { email: string; apolloId?: string | null; name?: string | null; title?: string | null; phone?: string | null }
      | null = null;

    // 2a) Revela de novo o MESMO decisor — o e-mail dele pode ter mudado/aparecido.
    if (c.apollo_id && res.apolloUsados < maxApollo) {
      res.apolloUsados++;
      const r = await tentarRevelar(c.apollo_id, emailLower, verificar);
      if (r) novo = { ...r };
    }

    // 2b) Nada? Busca OUTRO decisor no mesmo domínio e revela até achar um bom.
    if (!novo && domain && res.apolloUsados < maxApollo) {
      try {
        const pessoas = await searchDecisionMakers(domain, 5, catParaApollo(categoria));
        for (const p of pessoas) {
          if (res.apolloUsados >= maxApollo) break;
          if (!p.apolloId) continue;
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
      if (temEmail) {
        // suprime o e-mail morto (não voltamos a tentar enviar para ele)
        await suppressEmail(supabase, {
          email: emailLower,
          reason: "manual",
          source: "revisao_mensal",
          companyId: c.company_id,
        });
      }
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

      // 4) Corrige rascunhos parados do parceiro (religar contato + nome). Sem IA.
      const corrigidos = await corrigirRascunhos(
        supabase,
        c.company_id,
        c.id,
        c.name,
        novo.name ?? c.name,
      );
      res.rascunhosCorrigidos += corrigidos;

      await supabase.from("activities").insert({
        company_id: c.company_id,
        type: "prospeccao",
        description: temEmail
          ? `Revisão mensal: o e-mail ${emailAtual} não respondia mais — a Lara atualizou para ${novo.email} (Apollo)${corrigidos ? ` e corrigiu ${corrigidos} rascunho(s)` : ""}.`
          : `Revisão mensal: a Lara encontrou e vinculou o e-mail ${novo.email} (Apollo) para destravar a prospecção${corrigidos ? ` e corrigiu ${corrigidos} rascunho(s)` : ""}.`,
      });

      if (temEmail) {
        res.trocados++;
        res.trocas.push({ parceiro, de: emailAtual, para: novo.email });
      } else {
        res.vinculados++;
      }
    } else {
      // Tentou e não achou substituto.
      if (temEmail) {
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
      } else {
        // Sem e-mail e Apollo não achou — carimba para não reprocessar todo dia.
        await supabase
          .from("contacts")
          .update({ email_status: "unavailable", email_checked_at: agora })
          .eq("id", c.id);
      }
    }
  }

  return res;
}

// Corrige os RASCUNHOS pendentes (e-mail) do parceiro para o contato atualizado:
// religa rascunhos sem contato a este contato e troca o nome antigo pelo novo na
// saudação/assunto. Não toca em rascunhos de outro contato válido. Sem IA.
async function corrigirRascunhos(
  supabase: SupabaseClient,
  companyId: string,
  contactId: string,
  nomeAntigo: string | null,
  nomeNovo: string | null,
): Promise<number> {
  const { data } = await supabase
    .from("drafts")
    .select("id, subject, body, contact_id")
    .eq("company_id", companyId)
    .eq("channel", "email")
    .eq("status", "pendente");
  const rascunhos =
    (data as { id: string; subject: string | null; body: string; contact_id: string | null }[] | null) ?? [];

  let n = 0;
  for (const d of rascunhos) {
    // Pertence a OUTRO contato válido? não mexe.
    if (d.contact_id && d.contact_id !== contactId) continue;
    const upd: Record<string, unknown> = {};
    if (!d.contact_id) upd.contact_id = contactId;
    if (nomeAntigo && nomeNovo && nomeAntigo.trim() && nomeAntigo !== nomeNovo) {
      if (d.subject) upd.subject = substituirNome(d.subject, nomeAntigo, nomeNovo);
      upd.body = substituirNome(d.body, nomeAntigo, nomeNovo);
    }
    if (Object.keys(upd).length > 0) {
      await supabase.from("drafts").update(upd).eq("id", d.id);
      n++;
    }
  }
  return n;
}

// Troca o nome antigo pelo novo (nome completo e primeiro nome) num texto.
function substituirNome(texto: string, antigo: string, novo: string): string {
  const esc = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  let out = texto;
  const full = antigo.trim();
  if (full) out = out.replace(new RegExp(esc(full), "g"), novo.trim());
  const primeiroAntigo = full.split(/\s+/)[0];
  const primeiroNovo = novo.trim().split(/\s+/)[0];
  if (primeiroAntigo && primeiroNovo && primeiroAntigo !== primeiroNovo) {
    out = out.replace(new RegExp(`\\b${esc(primeiroAntigo)}\\b`, "g"), primeiroNovo);
  }
  return out;
}

// Revela um apolloId e devolve o e-mail SE for diferente do atual e for BOM.
// TRAVA B: quando o verificador existe, o e-mail NOVO precisa passar nele como
// válido (não basta o Apollo dizer "verified"). Assim, verificador quebrado =
// nenhuma troca. Sem verificador, confiamos no status do Apollo.
async function tentarRevelar(
  apolloId: string,
  emailAtualLower: string,
  verificar: boolean,
): Promise<{ email: string; phone: string | null } | null> {
  try {
    const r = await revealPerson(apolloId);
    if (!r.email) return null;
    if (emailAtualLower && r.email.toLowerCase() === emailAtualLower) return null; // mesmo e-mail morto
    const bom = verificar
      ? isSendable(await verifyEmail(r.email.toLowerCase())) // nosso verificador manda
      : isEmailVerified(r.emailStatus); // sem verificador, confia no Apollo
    return bom ? { email: r.email, phone: r.phone } : null;
  } catch {
    return null;
  }
}

// Varre a base inteira em lotes, respeitando um prazo (tempo do cron) e um teto
// GLOBAL de Apollo. Usado pelo disparo "rodar agora" — faz o máximo possível
// numa chamada só. Devolve o total somado + se ainda sobrou base para a próxima.
export async function revisarBaseEmailsCompleto(
  supabase: SupabaseClient,
  opts?: { deadlineMs?: number; maxApollo?: number; loteMax?: number },
): Promise<ResultadoRevisao & { concluido: boolean }> {
  const deadline = Date.now() + (opts?.deadlineMs ?? 45_000);
  let apolloRestante = opts?.maxApollo ?? 25;
  const loteMax = opts?.loteMax ?? 40;

  const total = vazio();
  let concluido = true;

  while (Date.now() < deadline && apolloRestante > 0) {
    const r = await revisarBaseEmails(supabase, {
      max: loteMax,
      maxApollo: apolloRestante,
      tetoTrocas: 20,
    });
    total.processados += r.processados;
    total.verificados += r.verificados;
    total.trocados += r.trocados;
    total.vinculados += r.vinculados;
    total.mortos += r.mortos;
    total.segurados += r.segurados;
    total.rascunhosCorrigidos += r.rascunhosCorrigidos;
    total.apolloUsados += r.apolloUsados;
    total.trocas.push(...r.trocas);
    apolloRestante -= r.apolloUsados;

    // Disjuntor disparou numa leva → PARA tudo e sinaliza (não insiste).
    if (r.suspeitaVerificador) {
      total.suspeitaVerificador = true;
      concluido = false;
      break;
    }

    if (r.processados === 0) break; // base limpa — nada vencido sobrando
    if (r.processados < loteMax) {
      concluido = true; // último pedaço de vencidos
      break;
    }
    concluido = false; // havia lote cheio; pode ter mais — o loop continua
  }

  return { ...total, concluido };
}
