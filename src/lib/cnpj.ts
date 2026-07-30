// Consulta pública de CNPJ na Receita Federal via BrasilAPI (grátis, sem chave).
//
// Serve de REFORÇO quando o Apollo não tem o e-mail do decisor: o e-mail
// registrado no CNPJ costuma ser o do dono/diretor da empresa (principalmente
// em empresas menores). O CEO cola o CNPJ (que confere em segundos no Google/
// site da empresa), então não há risco de acertar a empresa errada.
//
// Docs: https://brasilapi.com.br/docs#tag/CNPJ
// Fallback: https://minhareceita.org/ (mesmos nomes de campo da Receita).

export interface CnpjInfo {
  cnpj: string;
  razaoSocial: string | null;
  nomeFantasia: string | null;
  email: string | null;
  telefone: string | null;
  municipio: string | null;
  uf: string | null;
}

// Remove tudo que não é dígito (aceita CNPJ com pontos/barra/traço).
export function normalizeCnpj(raw: string): string {
  return (raw ?? "").replace(/\D/g, "");
}

function str(v: unknown): string | null {
  return typeof v === "string" && v.trim() ? v.trim() : null;
}

// Extrai os campos que interessam de uma resposta no formato da Receita
// (BrasilAPI e minhareceita.org compartilham os mesmos nomes de campo).
function parseReceita(cnpj: string, d: Record<string, unknown>): CnpjInfo {
  const email = str(d.email);
  return {
    cnpj,
    razaoSocial: str(d.razao_social) ?? str(d.nome),
    nomeFantasia: str(d.nome_fantasia) ?? str(d.fantasia),
    email: email ? email.toLowerCase() : null,
    telefone: str(d.ddd_telefone_1) ?? str(d.telefone),
    municipio: str(d.municipio),
    uf: str(d.uf),
  };
}

async function tryFetch(url: string): Promise<Record<string, unknown> | null> {
  try {
    const res = await fetch(url, { headers: { Accept: "application/json" } });
    if (res.status === 404) throw new Error("CNPJ não encontrado na Receita.");
    if (!res.ok) return null; // deixa tentar o fallback
    return (await res.json()) as Record<string, unknown>;
  } catch (err) {
    if (err instanceof Error && err.message.includes("não encontrado")) throw err;
    return null; // erro de rede: tenta o fallback
  }
}

/**
 * Busca os dados públicos de um CNPJ na Receita. Tenta a BrasilAPI e, se ela
 * falhar (fora do ar/limite), cai para o minhareceita.org.
 */
export async function lookupCnpj(rawCnpj: string): Promise<CnpjInfo> {
  const cnpj = normalizeCnpj(rawCnpj);
  if (cnpj.length !== 14) {
    throw new Error("CNPJ inválido — precisa ter 14 dígitos.");
  }

  const data =
    (await tryFetch(`https://brasilapi.com.br/api/cnpj/v1/${cnpj}`)) ??
    (await tryFetch(`https://minhareceita.org/${cnpj}`));

  if (!data) {
    throw new Error(
      "Não consegui consultar a Receita agora (BrasilAPI/minhareceita fora do ar). Tente de novo em instantes.",
    );
  }
  return parseReceita(cnpj, data);
}
