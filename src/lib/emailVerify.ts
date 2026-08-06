// Verificação de e-mail (deliverability).
//
// Antes de enviar para um endereço que o Apollo só ADIVINHOU (não verificado),
// perguntamos a um serviço verificador se a caixa está ATIVA — sem enviar nada.
// Assim disparamos só para quem existe, e não geramos retorno (bounce) que
// ameaça a reputação do domínio e a conta de envio (Titan/HostGator).
//
// Suporta dois provedores (escolha um, crie a conta e ponha a chave no .env):
//   EMAIL_VERIFIER_PROVIDER = "zerobounce" | "millionverifier"
//   EMAIL_VERIFIER_API_KEY  = <sua chave>
//
// Sem a chave, a verificação fica desligada (o sistema volta a mandar só para
// os já-verificados pelo Apollo).

export type VerifyResult = "valid" | "catch_all" | "invalid" | "unknown";

export function verifierConfigured(): boolean {
  return Boolean(process.env.EMAIL_VERIFIER_API_KEY);
}

function provider(): "zerobounce" | "millionverifier" {
  return process.env.EMAIL_VERIFIER_PROVIDER === "millionverifier"
    ? "millionverifier"
    : "zerobounce";
}

// "Enviável sem risco de bounce": SOMENTE válido (a caixa existe de fato).
// Catch-all é traiçoeiro: o servidor aceita na entrega mas devolve depois
// (bounce assíncrono) se a caixa não existe — e o Titan conta esse retorno.
// Por isso NÃO enviamos para catch-all/desconhecido/inválido.
export function isSendable(r: VerifyResult): boolean {
  return r === "valid";
}

export async function verifyEmail(email: string): Promise<VerifyResult> {
  const key = process.env.EMAIL_VERIFIER_API_KEY;
  if (!key) return "unknown";
  try {
    if (provider() === "millionverifier") {
      return await verifyMillionVerifier(email, key);
    }
    return await verifyZeroBounce(email, key);
  } catch {
    // Falha na verificação → tratamos como desconhecido (não enviamos).
    return "unknown";
  }
}

// Verifica vários em paralelo. Devolve um mapa email -> resultado.
export async function verifyEmails(
  emails: string[],
): Promise<Map<string, VerifyResult>> {
  const unicos = Array.from(new Set(emails.map((e) => e.toLowerCase())));
  const pares = await Promise.all(
    unicos.map(async (e) => [e, await verifyEmail(e)] as const),
  );
  return new Map(pares);
}

// --- ZeroBounce ------------------------------------------------------------
// GET /v2/validate -> { status: "valid"|"invalid"|"catch-all"|"unknown"|
//   "spamtrap"|"abuse"|"do_not_mail" }
async function verifyZeroBounce(email: string, key: string): Promise<VerifyResult> {
  const url =
    `https://api.zerobounce.net/v2/validate?api_key=${encodeURIComponent(key)}` +
    `&email=${encodeURIComponent(email)}`;
  const res = await fetch(url, { headers: { "Cache-Control": "no-cache" } });
  if (!res.ok) return "unknown";
  const data = (await res.json()) as { status?: string };
  switch ((data.status ?? "").toLowerCase()) {
    case "valid":
      return "valid";
    case "catch-all":
      return "catch_all";
    case "invalid":
    case "spamtrap":
    case "abuse":
    case "do_not_mail":
      return "invalid";
    default:
      return "unknown";
  }
}

// --- MillionVerifier -------------------------------------------------------
// GET /api/v3/ -> { result: "ok"|"catch_all"|"unknown"|"invalid"|"disposable" }
async function verifyMillionVerifier(
  email: string,
  key: string,
): Promise<VerifyResult> {
  const url =
    `https://api.millionverifier.com/api/v3/?api=${encodeURIComponent(key)}` +
    `&email=${encodeURIComponent(email)}`;
  const res = await fetch(url, { headers: { "Cache-Control": "no-cache" } });
  if (!res.ok) return "unknown";
  const data = (await res.json()) as { result?: string };
  switch ((data.result ?? "").toLowerCase()) {
    case "ok":
      return "valid";
    case "catch_all":
      return "catch_all";
    case "invalid":
    case "disposable":
      return "invalid";
    default:
      return "unknown";
  }
}
