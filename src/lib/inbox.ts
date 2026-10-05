// Leitura automática das respostas por e-mail (IMAP).
//
// Verifica a caixa de entrada do e-mail da operação, pega as mensagens NÃO
// lidas, e — SOMENTE para remetentes que já estão no nosso cadastro (ou seja,
// tratativas que o sistema iniciou) — usa a IA para classificar
// positivo/negativo/neutro e atualiza o painel. E-mails aleatórios (que não
// batem com nenhum contato cadastrado) são ignorados.

import { ImapFlow } from "imapflow";
import { simpleParser } from "mailparser";
import type { SupabaseClient } from "@supabase/supabase-js";
import { senderConfig, isBrandId, DEFAULT_BRAND, type BrandId } from "./brands";
import { classifyResponse } from "./anthropic";
import { resumeAtAfterNegative } from "./followup";
import { suppressEmail } from "./suppression";
import { recomputeCompanyScore } from "./scoring";
import { nextActionForIntent } from "./nextAction";
import { createTask } from "./tasks";

// Detecta se a mensagem é um RETORNO (NDR / bounce) e extrai os endereços que
// falharam. Bounces chegam nesta mesma caixa, vindos de mailer-daemon/
// postmaster, no formato multipart/report (delivery-status).
function detectBounce(
  fromAddr: string | undefined,
  subject: string,
  rawSource: string,
): { isBounce: boolean; failed: string[] } {
  const from = (fromAddr ?? "").toLowerCase();
  const looksLikeDaemon =
    from.includes("mailer-daemon") ||
    from.includes("postmaster") ||
    from === "" ||
    from.startsWith("no-reply") ||
    from.startsWith("noreply");
  const subjectHit =
    /undeliverable|delivery (status|failure|has failed)|failure notice|returned mail|mail delivery|not delivered|não (foi )?entregue|devolv|falha na entrega/i.test(
      subject,
    );
  const hasDsn =
    /message\/delivery-status|Final-Recipient|Diagnostic-Code|Status:\s*5\.\d/i.test(
      rawSource,
    );

  if (!(looksLikeDaemon || subjectHit || hasDsn)) {
    return { isBounce: false, failed: [] };
  }

  // Extrai os endereços que falharam dos campos oficiais do DSN.
  const failed = new Set<string>();
  const patterns = [
    /X-Failed-Recipients:\s*([^\r\n]+)/gi,
    /Final-Recipient:\s*rfc822;\s*([^\r\n;]+)/gi,
    /Original-Recipient:\s*rfc822;\s*([^\r\n;]+)/gi,
  ];
  for (const re of patterns) {
    let m: RegExpExecArray | null;
    while ((m = re.exec(rawSource))) {
      for (const part of m[1].split(/[,\s;]+/)) {
        const e = part.trim().toLowerCase().replace(/[<>]/g, "");
        if (e.includes("@")) failed.add(e);
      }
    }
  }
  return { isBounce: true, failed: Array.from(failed) };
}

function resolverBrand(b?: string | null): BrandId {
  return isBrandId(b) ? b : DEFAULT_BRAND;
}

// Configuração de LEITURA (IMAP) POR MARCA. Reaproveita as credenciais de ENVIO
// da marca (mesma conta): MenthalHelp = Titan; Therapy Minds = Google Workspace
// (Gmail). O host de IMAP é derivado do host de SMTP (smtp. → imap.); dá para
// sobrescrever por marca com IMAP_HOST / IMAP_HOST_TM e IMAP_PORT / IMAP_PORT_TM.
export function imapConfig(brand?: string | null) {
  const b = resolverBrand(brand);
  const s = senderConfig(b);
  const envHost = b === "therapy_minds" ? process.env.IMAP_HOST_TM : process.env.IMAP_HOST;
  const envPort = b === "therapy_minds" ? process.env.IMAP_PORT_TM : process.env.IMAP_PORT;
  const host = envHost ?? s.host.replace(/^smtp\./, "imap.");
  const port = Number(envPort ?? "993");
  return { host, port, user: s.user, pass: s.pass };
}

export function isInboxConfigured(brand?: string | null): boolean {
  const { user, pass } = imapConfig(brand);
  return Boolean(user && pass);
}

// Caixas a VARRER: a Inbox + as pastas/labels que o CEO criou (ex: "Retorno
// operadoras"). Pula Enviados/Rascunhos/Lixeira/Spam/Arquivo e, no Gmail, a
// "All Mail" (evita duplicar) e containers não selecionáveis. Assim achamos as
// respostas mesmo quando um filtro move o e-mail para uma pasta própria.
const CAIXAS_IGNORADAS = new Set([
  "\\Sent",
  "\\Drafts",
  "\\Trash",
  "\\Junk",
  "\\All",
  "\\Archive",
  "\\Flagged",
  "\\Important",
]);

export async function listarCaixas(client: ImapFlow): Promise<string[]> {
  const caixas: string[] = [];
  try {
    for (const mb of await client.list()) {
      const su = (mb.specialUse as string | undefined) ?? "";
      if (su && CAIXAS_IGNORADAS.has(su)) continue;
      // pula containers não selecionáveis (ex: "[Gmail]")
      const flags = mb.flags as Set<string> | undefined;
      if (flags?.has("\\Noselect")) continue;
      caixas.push(mb.path);
    }
  } catch {
    // se o provedor não listar, fica só com a Inbox
  }
  // Garante a Inbox e sem duplicatas, com a Inbox primeiro.
  const semInbox = caixas.filter((c) => c.toUpperCase() !== "INBOX");
  return ["INBOX", ...Array.from(new Set(semInbox))];
}

interface ContactRow {
  id: string;
  company_id: string;
  email: string | null;
  companies: { name: string; category: string } | null;
}

// Quantas mensagens processar por rodada (evita estourar o tempo da função).
const MAX_POR_RODADA = 8;

export async function checkInbox(
  supabase: SupabaseClient,
  brand?: string | null,
): Promise<{ processadas: number; positivas: string[]; bounces: number }> {
  const marca = resolverBrand(brand);
  const { host, port, user, pass } = imapConfig(marca);
  if (!user || !pass) return { processadas: 0, positivas: [], bounces: 0 };

  const client = new ImapFlow({
    host,
    port,
    secure: true,
    auth: { user, pass },
    logger: false,
  });

  const positivas: string[] = [];
  let processadas = 0;
  let bounces = 0;

  await client.connect();
  try {
    // Varre a Inbox E as pastas próprias (ex: "Retorno operadoras"), para pegar
    // respostas que um filtro moveu para fora da Inbox.
    const caixas = await listarCaixas(client);
    for (const caixa of caixas) {
      if (processadas + bounces >= MAX_POR_RODADA) break; // teto por rodada
      let lock!: Awaited<ReturnType<typeof client.getMailboxLock>>;
      try {
        lock = await client.getMailboxLock(caixa);
      } catch {
        continue; // pasta não selecionável — pula
      }
      try {
        const uids = await client.search({ seen: false }, { uid: true });
        if (!uids || uids.length === 0) continue;
        const restante = MAX_POR_RODADA - (processadas + bounces);
        for (const uid of uids.slice(0, restante)) {
        const msg = await client.fetchOne(uid, { source: true }, { uid: true });
        if (!msg || !msg.source) continue;

        const parsed = await simpleParser(msg.source as Buffer);
        const fromAddr = Array.isArray(parsed.from?.value)
          ? parsed.from?.value[0]?.address?.toLowerCase()
          : undefined;

        // 1) RETORNO (bounce): captura antes de tudo. Marca o(s) endereço(s)
        //    que falharam na lista de supressão — nunca mais disparamos p/ eles.
        const rawSource = (msg.source as Buffer).toString("utf8");
        const bounce = detectBounce(fromAddr, parsed.subject ?? "", rawSource);
        if (bounce.isBounce) {
          for (const email of bounce.failed) {
            // Tenta vincular ao cadastro (para contexto), sem exigir.
            const { data: c } = await supabase
              .from("contacts")
              .select("company_id, companies!inner(brand)")
              .ilike("email", email)
              .eq("companies.brand", marca)
              .limit(1);
            const companyId =
              (c as { company_id: string }[] | null)?.[0]?.company_id ?? null;
            await suppressEmail(supabase, {
              email,
              reason: "bounce",
              bounceType: "hard",
              source: "inbox_ndr",
              companyId,
              subject: parsed.subject ?? null,
            });
            if (companyId) {
              await supabase.from("activities").insert({
                company_id: companyId,
                type: "bounce",
                description: `E-mail retornou (bounce): ${email}. Bloqueado para novos envios.`,
              });
            }
            bounces++;
          }
          await client.messageFlagsAdd(uid, ["\\Seen"], { uid: true });
          continue;
        }

        if (!fromAddr) continue;

        // Só processa se o remetente estiver no nosso cadastro.
        const { data } = await supabase
          .from("contacts")
          .select("id, company_id, email, companies!inner(name, category, brand)")
          .ilike("email", fromAddr)
          .eq("companies.brand", marca)
          .limit(1);
        const match = (data as unknown as ContactRow[] | null)?.[0];
        if (!match || !match.company_id || !match.companies) {
          // e-mail aleatório — não faz parte do trabalho; ignora (deixa não lido).
          continue;
        }

        // Pedido de DESCADASTRO (LGPD): se a resposta pede para sair, bloqueia
        // o e-mail, encerra a cadência e nem gasta IA classificando.
        const respLower = (
          parsed.text?.trim() ||
          parsed.subject ||
          ""
        )
          .toLowerCase()
          .slice(0, 500);
        const curto = respLower.length <= 40;
        const pediuSair =
          /\bunsubscribe\b|descadastr|remover?\s+(meu|o)\s+(e-?mail|contato|cadastro)|me\s+(remov|retir|tir)|não\s+quero\s+(mais\s+)?receber|nao\s+quero\s+(mais\s+)?receber|parar?\s+de\s+(me\s+)?(receber|enviar)|pare\s+de\s+(me\s+)?enviar|cancelar\s+(o\s+)?recebimento/i.test(
            respLower,
          ) ||
          (curto && /\bsair\b/.test(respLower));

        if (pediuSair && match.email) {
          await suppressEmail(supabase, {
            email: match.email,
            reason: "unsubscribe",
            source: "inbox_reply",
            companyId: match.company_id,
            subject: parsed.subject ?? null,
          });
          await supabase
            .from("sequences")
            .update({ status: "pausada_negativa", next_action_at: null, resume_at: null })
            .eq("company_id", match.company_id);
          await supabase.from("responses").insert({
            company_id: match.company_id,
            channel: "email",
            sentiment: "negativo",
            summary: "Pediu descadastro (opt-out) — e-mail bloqueado.",
            raw_text: (parsed.text ?? parsed.subject ?? "").slice(0, 2000),
            message_id: parsed.messageId ?? null,
          });
          await supabase.from("activities").insert({
            company_id: match.company_id,
            type: "unsubscribe",
            description: `Descadastro solicitado por ${match.email}. Bloqueado para novos envios.`,
          });
          await client.messageFlagsAdd(uid, ["\\Seen"], { uid: true });
          processadas++;
          continue;
        }

        // Lê o corpo: texto puro; se vier vazio, usa o HTML sem as tags;
        // por último, o assunto. Assim o agente não "vê só o assunto".
        const htmlStripped = parsed.html
          ? String(parsed.html)
              .replace(/<style[\s\S]*?<\/style>/gi, " ")
              .replace(/<[^>]+>/g, " ")
              .replace(/&nbsp;/gi, " ")
              .replace(/\s+/g, " ")
              .trim()
          : "";
        const text = (
          parsed.text?.trim() ||
          htmlStripped ||
          parsed.subject ||
          ""
        ).slice(0, 4000);
        let sentiment: "positivo" | "negativo" | "neutro" = "neutro";
        let summary = "";
        let intent: string | null = null;
        let followUpDate: string | null = null;
        try {
          const c = await classifyResponse(text, match.companies.category);
          sentiment = c.sentiment;
          summary = c.summary;
          intent = c.intent;
          followUpDate = c.followUpDate;
        } catch {
          // se a IA falhar, guarda como neutro para revisão manual
        }

        // "Me procure em outubro" → data concreta da retomada automática.
        const nextActionIso =
          intent === "followup_futuro" && followUpDate
            ? new Date(`${followUpDate}T12:00:00Z`).toISOString()
            : null;

        await supabase.from("responses").insert({
          company_id: match.company_id,
          channel: "email",
          sentiment,
          intent,
          next_action_at: nextActionIso,
          summary,
          raw_text: text,
          message_id: parsed.messageId ?? null, // p/ responder na mesma thread
        });

        // ENCADEAMENTO: a resposta do parceiro entra na cadeia da conversa e
        // passa a ser a ÚLTIMA mensagem — assim nosso próximo e-mail responde a
        // ELA (In-Reply-To) e tudo fica num histórico só (como os parceiros pedem).
        if (parsed.messageId) {
          const { data: seqRow } = await supabase
            .from("sequences")
            .select("id, thread_refs")
            .eq("company_id", match.company_id)
            .eq("channel", "email")
            .maybeSingle<{ id: string; thread_refs: string | null }>();
          if (seqRow) {
            const cadeia = [seqRow.thread_refs?.trim(), parsed.messageId]
              .filter((x): x is string => Boolean(x))
              .join(" ")
              .trim();
            await supabase
              .from("sequences")
              .update({ last_message_id: parsed.messageId, thread_refs: cadeia || null })
              .eq("id", seqRow.id);
          }
        }

        // A partir da INTENÇÃO, o motor decide o próximo passo (Nível 1 —
        // apoio automático). Disparo de mensagem continua sendo Nível 2.
        if (nextActionIso) {
          // Follow-up futuro: pausa a cobrança e AGENDA a retomada na data
          // pedida (o motor reativa sozinho quando a data chegar).
          await supabase
            .from("sequences")
            .update({
              status: "agendada",
              next_action_at: null,
              resume_at: nextActionIso,
            })
            .eq("company_id", match.company_id);
        } else if (sentiment === "negativo") {
          // Sem interesse: pausa e agenda retomada automática em 30 dias.
          await supabase
            .from("sequences")
            .update({
              status: "pausada_negativa",
              next_action_at: null,
              resume_at: resumeAtAfterNegative().toISOString(),
            })
            .eq("company_id", match.company_id);
        } else {
          // Oportunidade ativa / dúvida / neutra: aguarda decisão do CEO.
          await supabase
            .from("sequences")
            .update({ status: "aguardando_ceo", next_action_at: null })
            .eq("company_id", match.company_id);
          if (sentiment === "positivo") {
            await supabase
              .from("companies")
              .update({ status: "em_negociacao" })
              .eq("id", match.company_id);
            positivas.push(match.companies.name);
          }
        }

        await supabase.from("activities").insert({
          company_id: match.company_id,
          type: "resposta",
          description: `Resposta automática (e-mail) classificada como ${sentiment}${summary ? `: ${summary}` : ""}.`,
        });

        // Lead scoring v2 (Fase 2.3): a resposta muda a temperatura do lead.
        await recomputeCompanyScore(supabase, match.company_id).catch(() => {});

        // Máquina de estados (Fase 3.1): se a ação recomendada pede uma tarefa
        // humana (ex: cadastrar o contato do setor indicado), a IA a cria (N1).
        const rec = nextActionForIntent(intent);
        if (rec.autoTaskTitle) {
          await createTask(
            supabase,
            {
              companyId: match.company_id,
              title: rec.autoTaskTitle,
              detail: summary || null,
              level: 1,
              createdBy: "ia",
            },
            { dedupeOpen: true },
          ).catch(() => {});
        }

        // Marca como lida para não processar de novo.
        await client.messageFlagsAdd(uid, ["\\Seen"], { uid: true });
        processadas++;
        }
      } finally {
        lock.release();
      }
    }
  } finally {
    await client.logout();
  }

  return { processadas, positivas, bounces };
}
