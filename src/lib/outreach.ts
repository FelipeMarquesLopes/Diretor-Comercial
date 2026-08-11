// Utilitários de servidor que costuram a IA + o banco + o motor de follow-up.
// Usados pelas rotas de API (nunca no navegador).

import type { SupabaseClient } from "@supabase/supabase-js";
import { generateDraft, generateAgendaInformativo } from "./anthropic";
import { buildCommercialContext } from "./memory";
import { buildPersonalizationAngle } from "./personalize";
import { nextActionAt } from "./followup";
import type {
  Company,
  Contact,
  MessageHook,
  Sequence,
  SequenceChannel,
} from "./types";

// Intervalo do informativo recorrente de "agenda aberta": 15 dias, para sempre.
export const DIAS_AGENDA_ABERTA = 15;

/**
 * Gera um rascunho do informativo de "agenda aberta" (e-mail) para a operadora,
 * escolhendo o melhor contato com e-mail. Não cria sequência: a recorrência é
 * controlada por company.next_followup. Devolve se conseguiu gerar.
 */
export async function generateAgendaDraft(
  supabase: SupabaseClient,
  company: Company,
): Promise<{ ok: boolean; error?: string }> {
  const { data: contacts } = await supabase
    .from("contacts")
    .select("*")
    .eq("company_id", company.id)
    .limit(5);
  const list = (contacts as Contact[] | null) ?? [];
  const contact = list.find((c) => c.email) ?? list[0] ?? null;

  let generated;
  try {
    generated = await generateAgendaInformativo({ company, contact });
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : "Erro na IA" };
  }

  await supabase.from("drafts").insert({
    company_id: company.id,
    contact_id: contact?.id ?? null,
    channel: "email",
    hook: "nr1", // placeholder; o conteúdo é o informativo de agenda aberta
    subject: generated.subject || null,
    body: generated.body,
    status: "pendente",
  });
  return { ok: true };
}

/**
 * Garante que exista uma sequência (ativa) para o parceiro em cada canal.
 * WhatsApp só é criado se houver um contato marcado como WhatsApp.
 */
export async function ensureSequences(
  supabase: SupabaseClient,
  companyId: string,
  hasWhatsapp: boolean,
): Promise<void> {
  const channels: SequenceChannel[] = ["email"];
  if (hasWhatsapp) channels.push("whatsapp");

  for (const channel of channels) {
    await supabase.from("sequences").upsert(
      {
        company_id: companyId,
        channel,
        status: "ativa",
        step: 0,
        next_action_at: new Date().toISOString(),
      },
      { onConflict: "company_id,channel", ignoreDuplicates: true },
    );
  }
}

/**
 * Gera um rascunho para uma sequência e o deixa "pendente" (aguardando o
 * clique do CEO, no caso de e-mail). Enquanto o rascunho não for enviado, a
 * sequência fica com next_action_at = null (não regeramos duplicado).
 */
export async function generateDraftForSequence(
  supabase: SupabaseClient,
  company: Company,
  sequence: Sequence,
  hook: MessageHook = "nr1",
): Promise<{ ok: boolean; error?: string }> {
  // Melhor contato para este canal.
  const { data: contacts } = await supabase
    .from("contacts")
    .select("*")
    .eq("company_id", company.id)
    .limit(5);
  const list = (contacts as Contact[] | null) ?? [];
  const contact =
    sequence.channel === "whatsapp"
      ? list.find((c) => c.is_whatsapp) ?? null
      : list.find((c) => c.email) ?? list[0] ?? null;

  // Memória comercial: histórico real com este parceiro (Fase 1.2).
  const history = await buildCommercialContext(supabase, company.id);
  // Ângulo de personalização (Fase 2.2): só pesa na 1ª abordagem (step 0).
  const angle = sequence.step === 0 ? buildPersonalizationAngle(company) : undefined;

  let generated;
  try {
    generated = await generateDraft({
      company,
      contact,
      hook,
      channel: sequence.channel,
      step: sequence.step,
      history,
      angle,
    });
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : "Erro na IA" };
  }

  await supabase.from("drafts").insert({
    company_id: company.id,
    contact_id: contact?.id ?? null,
    channel: sequence.channel,
    hook,
    subject: generated.subject || null,
    body: generated.body,
    status: "pendente",
    sequence_id: sequence.id,
    step: sequence.step,
  });

  // Rascunho pendente → não regerar até que este seja enviado.
  await supabase
    .from("sequences")
    .update({ next_action_at: null })
    .eq("id", sequence.id);

  await supabase.from("activities").insert({
    company_id: company.id,
    type: "rascunho",
    description: `Rascunho de ${sequence.channel} (passo ${sequence.step + 1}) gerado pela IA, aguardando aprovação.`,
  });

  return { ok: true };
}

/**
 * Avança a sequência depois que uma mensagem foi de fato enviada:
 * conta +1, marca o horário e agenda a próxima cutucada.
 */
export async function advanceSequenceAfterSend(
  supabase: SupabaseClient,
  sequenceId: string,
): Promise<void> {
  const { data } = await supabase
    .from("sequences")
    .select("*, companies(category)")
    .eq("id", sequenceId)
    .single<Sequence & { companies: { category: string } | null }>();
  if (!data) return;

  const category = data.companies?.category;
  const newStep = data.step + 1;
  const now = new Date();
  await supabase
    .from("sequences")
    .update({
      step: newStep,
      last_sent_at: now.toISOString(),
      // Cadência por segmento (Fase 3.2).
      next_action_at: nextActionAt(data.channel, newStep, now, category).toISOString(),
      status: "ativa",
    })
    .eq("id", sequenceId);
}
