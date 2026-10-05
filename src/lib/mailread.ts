// Leitura sob demanda da caixa de entrada (Titan/IMAP), para a Lara.
//
// Diferente do inbox.ts (que só captura respostas de contatos JÁ cadastrados,
// para a automação), aqui a Lara pode ABRIR a caixa e ler QUALQUER e-mail
// recente — inclusive os que ficaram de fora da automação (ex: uma resposta que
// chegou em cópia). Somente LEITURA; nada é apagado ou movido.

import { ImapFlow } from "imapflow";
import { simpleParser } from "mailparser";
import { imapConfig, listarCaixas } from "./inbox";

export interface EmailResumo {
  uid: number;
  caixa: string; // pasta onde está (ex: "INBOX", "Retorno operadoras")
  de: string;
  assunto: string;
  data: string | null;
}

function conectar(brand?: string | null): ImapFlow {
  const { host, port, user, pass } = imapConfig(brand);
  if (!user || !pass) {
    throw new Error("Caixa de e-mail não configurada (IMAP) para esta marca.");
  }
  return new ImapFlow({ host, port, secure: true, auth: { user, pass }, logger: false });
}

// Lista os e-mails recentes da caixa (últimos ~30 dias), com filtros opcionais
// por remetente e/ou termo (assunto/corpo). `brand` escolhe a caixa (marca ativa).
export async function listarEmails(
  opts?: {
    termo?: string;
    remetente?: string;
    max?: number;
  },
  brand?: string | null,
): Promise<EmailResumo[]> {
  const max = Math.min(Math.max(opts?.max ?? 15, 1), 30);
  const client = conectar(brand);
  await client.connect();
  try {
    const criteria: Record<string, unknown> = {
      since: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000),
    };
    if (opts?.remetente?.trim()) criteria.from = opts.remetente.trim();
    if (opts?.termo?.trim()) criteria.text = opts.termo.trim();

    const caixas = await listarCaixas(client);
    const vistos = new Set<string>(); // dedupe por Message-ID (Gmail repete em labels)
    const out: EmailResumo[] = [];

    for (const caixa of caixas) {
      let lock!: Awaited<ReturnType<typeof client.getMailboxLock>>;
      try {
        lock = await client.getMailboxLock(caixa);
      } catch {
        continue; // pasta não selecionável — pula
      }
      try {
        let uids = (await client.search(criteria, { uid: true })) || [];
        if (uids.length === 0) continue;
        uids = uids.slice(-max); // os mais recentes desta pasta
        for await (const msg of client.fetch(uids, { envelope: true }, { uid: true })) {
          const env = msg.envelope;
          const mid = env?.messageId ?? `${caixa}:${msg.uid}`;
          if (vistos.has(mid)) continue;
          vistos.add(mid);
          const f = env?.from?.[0];
          out.push({
            uid: msg.uid,
            caixa,
            de: f ? `${f.name ?? ""} <${f.address ?? ""}>`.trim() : "",
            assunto: env?.subject ?? "(sem assunto)",
            data: env?.date ? new Date(env.date).toISOString() : null,
          });
        }
      } finally {
        lock.release();
      }
    }

    out.sort((a, b) => (b.data ?? "").localeCompare(a.data ?? ""));
    return out.slice(0, max);
  } finally {
    await client.logout().catch(() => {});
  }
}

// Lê o conteúdo completo de um e-mail pelo uid.
export async function lerEmail(
  uid: number,
  brand?: string | null,
  caixa?: string | null,
): Promise<{
  de: string;
  para: string;
  cc: string;
  assunto: string;
  data: string | null;
  texto: string;
} | null> {
  const client = conectar(brand);
  await client.connect();
  try {
    const lock = await client.getMailboxLock(caixa?.trim() || "INBOX");
    try {
      const msg = await client.fetchOne(uid, { source: true }, { uid: true });
      if (!msg || !msg.source) return null;
      const p = await simpleParser(msg.source as Buffer);
      const fmt = (v: unknown): string => {
        const a = v as { text?: string } | undefined;
        return a?.text ?? "";
      };
      return {
        de: fmt(p.from),
        para: fmt(p.to),
        cc: fmt(p.cc),
        assunto: p.subject ?? "(sem assunto)",
        data: p.date ? p.date.toISOString() : null,
        texto: (p.text ?? "").trim().slice(0, 8000),
      };
    } finally {
      lock.release();
    }
  } finally {
    await client.logout().catch(() => {});
  }
}
