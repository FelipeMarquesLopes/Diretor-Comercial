// Reajuste anual a partir do BANCO DE CONTRATOS.
//
// Um contrato com 12+ meses de vínculo fica "elegível". Todo Jan-Fev, o motor
// varre esses contratos e prepara um PEDIDO DE REAJUSTE (rascunho pendente) para
// o parceiro — com a IA usando a cláusula/índice/janela que ela extraiu do PDF.
// Nada é enviado: fica aguardando o clique do CEO. `reajuste_year` evita repetir
// no mesmo ano.

import type { SupabaseClient } from "@supabase/supabase-js";
import { generateReajusteRequest } from "./anthropic";
import { ensureSequences } from "./outreach";
import type { Company, Contact, Contract, Sequence } from "./types";

// Um contrato tem 12+ meses de vínculo?
export function contratoElegivel(dataInicio: string | null): boolean {
  if (!dataInicio) return false;
  const d = new Date(dataInicio);
  if (isNaN(d.getTime())) return false;
  const limite = new Date();
  limite.setMonth(limite.getMonth() - 12);
  return d.getTime() <= limite.getTime();
}

// Prepara o pedido de reajuste de UM contrato (rascunho pendente). Idempotente
// por ano: se já foi gerado neste ano, não repete.
export async function criarPedidoReajuste(
  supabase: SupabaseClient,
  contractId: string,
  opts?: { force?: boolean },
): Promise<{ ok: boolean; error?: string; skipped?: boolean }> {
  const { data: contract } = await supabase
    .from("contracts")
    .select("*")
    .eq("id", contractId)
    .single<Contract>();
  if (!contract || !contract.company_id) {
    return { ok: false, error: "Contrato/parceiro não encontrado." };
  }

  const anoAtual = new Date().getFullYear();
  if (!opts?.force && contract.reajuste_year === anoAtual) {
    return { ok: true, skipped: true }; // já gerado neste ano
  }

  const { data: company } = await supabase
    .from("companies")
    .select("*")
    .eq("id", contract.company_id)
    .single<Company>();
  if (!company) return { ok: false, error: "Parceiro não encontrado." };

  const { data: contacts } = await supabase
    .from("contacts")
    .select("*")
    .eq("company_id", company.id)
    .limit(5);
  const list = (contacts as Contact[] | null) ?? [];
  const contact = list.find((c) => c.email) ?? list[0] ?? null;

  let generated;
  try {
    generated = await generateReajusteRequest({
      company,
      contact,
      indice: contract.indice,
      janela: contract.janela,
      parecer: contract.parecer,
    });
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : "Erro na IA" };
  }

  // Sequência de e-mail (reaproveita se já existir).
  await ensureSequences(supabase, company.id, false);
  const { data: seqs } = await supabase
    .from("sequences")
    .select("id")
    .eq("company_id", company.id)
    .eq("channel", "email")
    .limit(1);
  const seqId = (seqs as Pick<Sequence, "id">[] | null)?.[0]?.id ?? null;

  const { error: draftErr } = await supabase.from("drafts").insert({
    company_id: company.id,
    contact_id: contact?.id ?? null,
    channel: "email",
    hook: "nr1",
    subject: generated.subject || null,
    body: generated.body,
    status: "pendente",
    sequence_id: seqId,
    step: 0,
  });
  if (draftErr) return { ok: false, error: draftErr.message };

  await supabase
    .from("contracts")
    .update({ reajuste_year: anoAtual })
    .eq("id", contract.id);

  await supabase.from("activities").insert({
    company_id: company.id,
    type: "rascunho",
    description: "Pedido de reajuste anual preparado a partir do contrato (aguardando aprovação).",
  });

  return { ok: true };
}

// Varre TODOS os contratos elegíveis (12+ meses) que ainda não tiveram pedido
// neste ano e prepara os rascunhos. Usado pela campanha automática de Jan-Fev.
export async function varrerReajustesAnuais(
  supabase: SupabaseClient,
  opts?: { max?: number },
): Promise<{ preparados: number; erros: number }> {
  const max = opts?.max ?? 15; // teto por rodada (evita estourar o tempo do cron)
  const anoAtual = new Date().getFullYear();
  const corte = new Date();
  corte.setMonth(corte.getMonth() - 12);
  const corteISO = corte.toISOString().slice(0, 10);

  const { data } = await supabase
    .from("contracts")
    .select("id, data_inicio, reajuste_year")
    .not("data_inicio", "is", null)
    .lte("data_inicio", corteISO)
    .limit(200);

  const elegiveis = (data as { id: string; reajuste_year: number | null }[] | null ?? []).filter(
    (c) => c.reajuste_year !== anoAtual,
  );

  let preparados = 0;
  let erros = 0;
  for (const c of elegiveis.slice(0, max)) {
    const r = await criarPedidoReajuste(supabase, c.id);
    if (r.ok && !r.skipped) preparados++;
    else if (!r.ok) erros++;
  }
  return { preparados, erros };
}
