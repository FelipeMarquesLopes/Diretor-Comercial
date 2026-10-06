// DESCOBERTA DE SINDICATOS (via Apollo) — espelho da descoberta ANS das
// operadoras, mas a fonte é o Apollo (não existe uma "ANS" de sindicatos).
//
// Varre organizações do tipo "sindicato" nas REGIÕES onde temos clínicas
// atuantes (Grande São Paulo + Bragança/Atibaia/ABC) e traz as que ainda NÃO
// estão na base — prontas para cadastrar e prospectar. A busca de ORGANIZAÇÕES
// no Apollo NÃO gasta crédito de lead; o crédito só sai ao revelar os contatos
// (no botão "Buscar credenciamento no Apollo", igual às operadoras).

import type { SupabaseClient } from "@supabase/supabase-js";
import { searchCompanies } from "./apollo";

function norm(s: string | null | undefined): string {
  return (s ?? "")
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9 ]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

// REGIÃO de atuação (filtro final por cidade): Grande SP (RMSP) + cidades
// vizinhas onde há clínicas (Bragança Paulista, Atibaia).
const REGIAO = new Set(
  [
    "sao paulo", "guarulhos", "osasco", "barueri", "santo andre",
    "sao bernardo do campo", "sao caetano do sul", "diadema", "maua",
    "ribeirao pires", "rio grande da serra", "mogi das cruzes", "suzano", "poa",
    "itaquaquecetuba", "ferraz de vasconcelos", "aruja", "biritiba mirim",
    "guararema", "salesopolis", "santa isabel", "carapicuiba", "cotia",
    "embu das artes", "embu guacu", "itapecerica da serra", "itapevi", "jandira",
    "juquitiba", "pirapora do bom jesus", "santana de parnaiba",
    "sao lourenco da serra", "taboao da serra", "vargem grande paulista",
    "caieiras", "cajamar", "francisco morato", "franco da rocha", "mairipora",
    "braganca paulista", "atibaia",
  ].map(norm),
);

// Localização passada ao Apollo: o ESTADO de São Paulo (formato padrão do
// Apollo). O recorte fino por cidade é feito depois, de forma TOLERANTE.
const LOCALIZACOES = ["São Paulo, Brazil"];

// Estado de SP (para aceitar organizações sem cidade, mas dentro de SP).
function ehSaoPaulo(uf: string | null | undefined): boolean {
  const s = norm(uf);
  return s === "sao paulo" || s === "sp";
}

export interface CandidatoSindicato {
  apolloId: string;
  name: string;
  cidade: string;
  uf: string;
  domain: string | null;
  website: string | null;
}

export interface DiagSindicatos {
  brutos: number; // quantas orgs o Apollo devolveu
  comCidade: number; // quantas vieram com cidade preenchida
  exemplos: { name: string; city: string; state: string }[]; // amostra crua
}

export async function descobrirSindicatosRegiao(
  supabase: SupabaseClient,
  brand: string,
  opts?: { max?: number; paginas?: number },
): Promise<{ total: number; candidatos: CandidatoSindicato[]; diag: DiagSindicatos }> {
  const max = opts?.max ?? 120;
  const paginas = opts?.paginas ?? 5;

  // Busca organizações "sindicato" no estado de SP (sem filtro de porte —
  // sindicato raramente tem headcount no Apollo).
  const encontrados: Awaited<ReturnType<typeof searchCompanies>> = [];
  for (let page = 1; page <= paginas; page++) {
    const orgs = await searchCompanies({
      name: "sindicato",
      locations: LOCALIZACOES,
      skipEmployeeRanges: true,
      perPage: 100,
      page,
    });
    encontrados.push(...orgs);
    if (orgs.length < 100) break; // acabaram os resultados
  }

  const diag: DiagSindicatos = {
    brutos: encontrados.length,
    comCidade: encontrados.filter((o) => o.city).length,
    exemplos: encontrados.slice(0, 5).map((o) => ({
      name: o.name,
      city: o.city ?? "",
      state: o.state ?? "",
    })),
  };

  // Filtro TOLERANTE: nome cheira a sindicato E (cidade na região OU — quando o
  // Apollo não trouxe cidade — está no estado de SP). Assim não zeramos quando a
  // cidade vem vazia na busca de organizações.
  const naRegiao = encontrados.filter((o) => {
    const pareceSindicato = norm(o.name).includes("sind");
    if (!pareceSindicato) return false;
    const cidadeNorm = norm(o.city);
    if (cidadeNorm) return REGIAO.has(cidadeNorm);
    // sem cidade: aceita se o estado é SP (ou desconhecido) — refinamos depois
    return ehSaoPaulo(o.state) || !o.state;
  });

  // Nomes já cadastrados como SINDICATO na marca ativa (para não duplicar).
  const { data: existentes } = await supabase
    .from("companies")
    .select("name")
    .eq("brand", brand)
    .eq("category", "sindicato")
    .limit(3000);
  const nomesBase = new Set(
    ((existentes as { name: string }[] | null) ?? []).map((e) => norm(e.name)),
  );
  const conhecida = (nome: string): boolean => {
    const n = norm(nome);
    if (nomesBase.has(n)) return true;
    for (const b of nomesBase) {
      if (b.length > 8 && (n.includes(b) || b.includes(n))) return true;
    }
    return false;
  };

  const candidatos: CandidatoSindicato[] = [];
  const vistos = new Set<string>();
  for (const o of naRegiao) {
    const chave = o.apolloId || norm(o.name);
    if (vistos.has(chave)) continue;
    vistos.add(chave);
    if (conhecida(o.name)) continue;
    candidatos.push({
      apolloId: o.apolloId,
      name: o.name,
      cidade: o.city ?? "",
      uf: o.state ?? "",
      domain: o.domain,
      website: o.website,
    });
  }

  // Cidade conhecida da região primeiro; depois por nome.
  candidatos.sort((a, b) => {
    const aReg = REGIAO.has(norm(a.cidade)) ? 0 : 1;
    const bReg = REGIAO.has(norm(b.cidade)) ? 0 : 1;
    if (aReg !== bReg) return aReg - bReg;
    return a.name.localeCompare(b.name, "pt-BR");
  });
  return { total: candidatos.length, candidatos: candidatos.slice(0, max), diag };
}
