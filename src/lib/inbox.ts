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
): Promise<{ processadas: number; positivas: string[] }> {
  const { host, port, user, pass } = imapConfig();
  if (!user || !pass) return { processadas: 0, positivas: [] };

  const client = new ImapFlow({
    host,
    port,
    secure: true,
    auth: { user, pass },
    logger: false,
  });

  const positivas: string[] = [];
  let processadas = 0;

  await client.connect();
  try {
    const lock = await client.getMailboxLock("INBOX");
    try {
      const uids = await client.search({ seen: false }, { uid: true });
      if (!uids || uids.length === 0) return { processadas, positivas };

      for (const uid of uids.slice(0, MAX_POR_RODADA)) {
        const msg = await client.fetchOne(uid, { source: true }, { uid: true });
        if (!msg || !msg.source) continue;

        const parsed = await simpleParser(msg.source as Buffer);
        const fromAddr = Array.isArray(parsed.from?.value)
          ? parsed.from?.value[0]?.address?.toLowerCase()
          : undefined;
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

        const text = (parsed.text || parsed.subject || "").slice(0, 4000);
        let sentiment: "positivo" | "negativo" | "neutro" = "neutro";
        let summary = "";
        try {
          const c = await classifyResponse(text);
          sentiment = c.sentiment;
          summary = c.summary;
        } catch {
          // se a IA falhar, guarda como neutro para revisão manual
        }

        await supabase.from("responses").insert({
          company_id: match.company_id,
          channel: "email",
          sentiment,
          summary,
          raw_text: text,
        });

        if (sentiment === "positivo") {
          await supabase
            .from("sequences")
            .update({ status: "aguardando_ceo", next_action_at: null })
            .eq("company_id", match.company_id);
          await supabase
            .from("companies")
            .update({ status: "em_negociacao" })
            .eq("id", match.company_id);
          positivas.push(match.companies.name);
        } else if (sentiment === "negativo") {
          await supabase
            .from("sequences")
            .update({
              status: "pausada_negativa",
              next_action_at: null,
              resume_at: resumeAtAfterNegative().toISOString(),
            })
            .eq("company_id", match.company_id);
        }

        await supabase.from("activities").insert({
          company_id: match.company_id,
          type: "resposta",
          description: `Resposta automática (e-mail) classificada como ${sentiment}${summary ? `: ${summary}` : ""}.`,
        });

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

  return { processadas, positivas };
}
