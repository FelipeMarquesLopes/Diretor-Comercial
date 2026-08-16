// Leitura das variáveis de ambiente com erro claro quando faltar alguma.
//
// A checagem é feita na hora do uso (não no import) de propósito: assim o
// `next build` não quebra num ambiente sem as chaves, e quem esquecer de
// configurar recebe uma mensagem que diz exatamente o que fazer.

function required(name: string, value: string | undefined): string {
  if (!value) {
    throw new Error(
      `Variável de ambiente ${name} não definida. ` +
        "Copie o .env.example para .env.local e preencha (veja o README).",
    );
  }
  return value;
}

export function supabaseUrl(): string {
  return required(
    "NEXT_PUBLIC_SUPABASE_URL",
    process.env.NEXT_PUBLIC_SUPABASE_URL,
  );
}

export function supabaseAnonKey(): string {
  return required(
    "NEXT_PUBLIC_SUPABASE_ANON_KEY",
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
  );
}

export function supabaseServiceRoleKey(): string {
  return required(
    "SUPABASE_SERVICE_ROLE_KEY",
    process.env.SUPABASE_SERVICE_ROLE_KEY,
  );
}

/** URL pública do app — usada para montar o link de retorno do login. */
export function siteUrl(): string {
  return process.env.NEXT_PUBLIC_SITE_URL || "http://localhost:3000";
}
