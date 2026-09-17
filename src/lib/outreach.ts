// Utilitários de servidor que costuram a IA + o banco + o motor de follow-up.
// Usados pelas rotas de API (nunca no navegador).

import type { SupabaseClient } from "@supabase/supabase-js";
import { generateDraft, generateAgendaInformativo, reviewFollowupDraft } from "./anthropic";
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

  const { data: novoDraft } = await supabase
    .from("drafts")
    .insert({
      company_id: company.id,
      contact_id: contact?.id ?? null,
      channel: sequence.channel,
      hook,
      subject: generated.subject || null,
      body: generated.body,
      status: "pendente",
      sequence_id: sequence.id,
      step: sequence.step,
    })
    .select("id")
    .single<{ id: string }>();

  // CONFERÊNCIA DA LARA (só follow-ups por e-mail): relê o histórico (último
  // enviado + respostas) e AJUSTA o rascunho para dar continuidade correta —
  // sem repetir, reconhecendo uma negativa anterior etc. Continua pendente.
  // Defensivo: qualquer falha aqui não quebra o motor (o rascunho já existe).
  if (novoDraft && sequence.step > 0 && sequence.channel === "email") {
    try {
      const [{ data: enviado }, { data: respostas }] = await Promise.all([
        supabase
          .from("drafts")
          .select("subject, body")
          .eq("company_id", company.id)
          .eq("status", "enviado")
          .order("sent_at", { ascending: false })
          .limit(1)
          .maybeSingle<{ subject: string | null; body: string | null }>(),
        supabase
          .from("responses")
          .select("sentiment, summary, raw_text")
          .eq("company_id", company.id)
          .order("created_at", { ascending: false })
          .limit(5),
      ]);
      const review = await reviewFollowupDraft({
        company,
        subject: generated.subject || "",
        body: generated.body,
        lastSent: enviado ?? null,
        responses: (respostas ?? []).map((r) => ({
          sentiment: r.sentiment as string,
          summary: (r.summary as string | null) ?? null,
          trecho: ((r.raw_text as string | null) ?? "").slice(0, 400),
        })),
      });
      if (review.changed) {
        await supabase
          .from("drafts")
          .update({ subject: review.subject || null, body: review.body })
          .eq("id", novoDraft.id);
        await supabase.from("activities").insert({
          company_id: company.id,
          type: "rascunho",
          description:
            "Lara revisou o follow-up e ajustou a copy para dar continuidade ao histórico.",
        });
      }
    } catch {
      // revisão é um extra; se falhar, o rascunho original segue pendente
    }
  }

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
