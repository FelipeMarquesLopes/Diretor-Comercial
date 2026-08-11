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
import { classifyResponse } from "./anthropic";
import { resumeAtAfterNegative } from "./followup";
import { suppressEmail } from "./suppression";
import { recomputeCompanyScore } from "./scoring";

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

function imapConfig() {
  const host =
    process.env.IMAP_HOST ??
    (process.env.SMTP_HOST
      ? process.env.SMTP_HOST.replace(/^smtp\./, "imap.")
      : "imap.titan.email");
  const port = Number(process.env.IMAP_PORT ?? "993");
  const user = process.env.SMTP_USER ?? process.env.GMAIL_USER;
  const pass = process.env.SMTP_PASSWORD ?? process.env.GMAIL_APP_PASSWORD;
  return { host, port, user, pass };
}

export function isInboxConfigured(): boolean {
  const { user, pass } = imapConfig();
  return Boolean(user && pass);
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
): Promise<{ processadas: number; positivas: string[]; bounces: number }> {
  const { host, port, user, pass } = imapConfig();
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
    const lock = await client.getMailboxLock("INBOX");
    try {
      const uids = await client.search({ seen: false }, { uid: true });
      if (!uids || uids.length === 0) return { processadas, positivas, bounces };

      for (const uid of uids.slice(0, MAX_POR_RODADA)) {
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
              .select("company_id")
              .ilike("email", email)
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
          .select("id, company_id, email, companies(name, category)")
          .ilike("email", fromAddr)
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

        // Marca como lida para não processar de novo.
        await client.messageFlagsAdd(uid, ["\\Seen"], { uid: true });
        processadas++;
      }
    } finally {
      lock.release();
    }
  } finally {
    await client.logout();
  }

  return { processadas, positivas, bounces };
}
