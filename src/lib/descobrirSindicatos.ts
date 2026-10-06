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

// Âncoras de localização passadas ao Apollo (as maiores cidades da região). O
// recorte fino é feito depois por REGIAO.
const ANCORAS = [
  "São Paulo, Brazil", "Guarulhos, Brazil", "Osasco, Brazil", "Barueri, Brazil",
  "Santo André, Brazil", "São Bernardo do Campo, Brazil", "Diadema, Brazil",
  "Mauá, Brazil", "Mogi das Cruzes, Brazil", "Suzano, Brazil",
  "Itaquaquecetuba, Brazil", "Carapicuíba, Brazil", "Cotia, Brazil",
  "Taboão da Serra, Brazil", "Itapevi, Brazil", "Santana de Parnaíba, Brazil",
  "Arujá, Brazil", "Bragança Paulista, Brazil", "Atibaia, Brazil",
  "São Caetano do Sul, Brazil",
];

export interface CandidatoSindicato {
  apolloId: string;
  name: string;
  cidade: string;
  uf: string;
  domain: string | null;
  website: string | null;
}

export async function descobrirSindicatosRegiao(
  supabase: SupabaseClient,
  brand: string,
  opts?: { max?: number; paginas?: number },
): Promise<{ total: number; candidatos: CandidatoSindicato[] }> {
  const max = opts?.max ?? 120;
  const paginas = opts?.paginas ?? 3;

  // Busca organizações "sindicato" na região (sem filtro de porte — sindicato
  // raramente tem headcount no Apollo).
  const encontrados: Awaited<ReturnType<typeof searchCompanies>> = [];
  for (let page = 1; page <= paginas; page++) {
    const orgs = await searchCompanies({
      name: "sindicato",
      locations: ANCORAS,
      skipEmployeeRanges: true,
      perPage: 100,
      page,
    });
    encontrados.push(...orgs);
    if (orgs.length < 100) break; // acabaram os resultados
  }

  // Filtra: país Brasil + cidade na REGIÃO + nome "cheira" a sindicato.
  const naRegiao = encontrados.filter((o) => {
    const cidadeOk = REGIAO.has(norm(o.city));
    const brasil = !o.country || norm(o.country).includes("bra");
    const pareceSindicato = norm(o.name).includes("sindicato") || norm(o.name).includes("sind ");
    return cidadeOk && brasil && pareceSindicato;
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

  candidatos.sort((a, b) => a.name.localeCompare(b.name, "pt-BR"));
  return { total: candidatos.length, candidatos: candidatos.slice(0, max) };
}
