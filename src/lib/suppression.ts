// Lista de supressão — proteção da conta de envio (deliverability).
//
// Centraliza a leitura/escrita da tabela `suppressed_emails`. Regras:
//  - E-mail SEMPRE normalizado (minúsculo, sem espaços) — a coluna é UNIQUE.
//  - `suppressEmail` faz upsert manual (incrementa `times` se já existir).
//  - `getSuppressedSet` recebe uma lista de candidatos e devolve só os que
//    estão suprimidos (uma consulta só), para filtrar destinatários no envio.

import type { SupabaseClient } from "@supabase/supabase-js";

export function normalizeEmail(email: string | null | undefined): string {
  return (email ?? "").trim().toLowerCase();
}

// Marca um e-mail para NÃO receber mais disparos. Idempotente.
export async function suppressEmail(
  supabase: SupabaseClient,
  opts: {
    email: string;
    reason?: "bounce" | "manual" | "unsubscribe";
    bounceType?: "hard" | "soft" | null;
    source?: string;
    companyId?: string | null;
    subject?: string | null;
  },
): Promise<void> {
  const email = normalizeEmail(opts.email);
  if (!email || !email.includes("@")) return;

  const { data: existing } = await supabase
    .from("suppressed_emails")
    .select("id, times")
    .eq("email", email)
    .maybeSingle();

  if (existing) {
    await supabase
      .from("suppressed_emails")
      .update({
        times: (existing.times ?? 1) + 1,
        updated_at: new Date().toISOString(),
        last_subject: opts.subject ?? null,
      })
      .eq("id", existing.id);
    return;
  }

  await supabase.from("suppressed_emails").insert({
    email,
    reason: opts.reason ?? "bounce",
    bounce_type: opts.bounceType ?? null,
    source: opts.source ?? null,
    company_id: opts.companyId ?? null,
    last_subject: opts.subject ?? null,
  });
}

// De uma lista de candidatos, devolve o conjunto (minúsculo) dos que estão
// suprimidos. Usado no envio para pular destinatários bloqueados.
export async function getSuppressedSet(
  supabase: SupabaseClient,
  emails: (string | null | undefined)[],
): Promise<Set<string>> {
  const lista = Array.from(
    new Set(emails.map(normalizeEmail).filter((e) => e.includes("@"))),
  );
  if (lista.length === 0) return new Set();

  const { data } = await supabase
    .from("suppressed_emails")
    .select("email")
    .in("email", lista);

  return new Set((data ?? []).map((r: { email: string }) => r.email));
}

// Remove um e-mail da lista de bloqueio (o CEO decidiu que está OK reenviar).
// Se o e-mail voltar a dar bounce, a captura por IMAP o re-suprime sozinha.
export async function unsuppressEmail(
  supabase: SupabaseClient,
  email: string,
): Promise<void> {
  const e = normalizeEmail(email);
  if (!e || !e.includes("@")) return;
  await supabase.from("suppressed_emails").delete().eq("email", e);
}

export async function isSuppressed(
  supabase: SupabaseClient,
  email: string,
): Promise<boolean> {
  const set = await getSuppressedSet(supabase, [email]);
  return set.has(normalizeEmail(email));
}
