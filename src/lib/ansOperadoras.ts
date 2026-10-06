// DESCOBERTA DE OPERADORAS VIA ANS (Fase 1 — cadastro de operadoras ativas).
//
// Usa o arquivo público "Relatório de Operadoras Ativas" da ANS (Dados Abertos)
// para achar operadoras DE SAÚDE com sede na Grande São Paulo que AINDA NÃO
// estão na nossa base — prontas para cadastrar e prospectar.
//
// É Fase 1: filtra por SEDE na Grande SP (ótimo para operadoras regionais, que
// é o alvo — HBC, São Miguel, etc.). A Fase 2 (ranking por nº de vidas por
// município) cruza com o arquivo de beneficiários da ANS.
//
// OBS: o arquivo é pequeno e estável. URL sobrescrevível por ANS_CADOP_URL.

import type { SupabaseClient } from "@supabase/supabase-js";

const CADOP_URL =
  process.env.ANS_CADOP_URL ??
  "https://dadosabertos.ans.gov.br/FTP/PDA/operadoras_de_plano_de_saude_ativas/Relatorio_cadop.csv";

// Municípios da Região Metropolitana de São Paulo (Grande SP) — 39 cidades.
const GRANDE_SP = [
  "sao paulo", "guarulhos", "osasco", "barueri", "santo andre",
  "sao bernardo do campo", "sao caetano do sul", "diadema", "maua",
  "ribeirao pires", "rio grande da serra", "mogi das cruzes", "suzano", "poa",
  "itaquaquecetuba", "ferraz de vasconcelos", "aruja", "biritiba mirim",
  "guararema", "salesopolis", "santa isabel", "carapicuiba", "cotia",
  "embu das artes", "embu guacu", "itapecerica da serra", "itapevi", "jandira",
  "juquitiba", "pirapora do bom jesus", "santana de parnaiba",
  "sao lourenco da serra", "taboao da serra", "vargem grande paulista",
  "caieiras", "cajamar", "francisco morato", "franco da rocha", "mairipora",
];
const GRANDE_SP_SET = new Set(GRANDE_SP);

// Remove acentos/maiúsculas/pontuação para comparar nomes e cidades.
function norm(s: string | null | undefined): string {
  return (s ?? "")
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9 ]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export interface OperadoraAns {
  registroAns: string;
  cnpj: string;
  razaoSocial: string;
  nomeFantasia: string;
  modalidade: string;
  cidade: string;
  uf: string;
}

// Modalidade é de SAÚDE? (exclui odontológicas e administradoras de benefícios)
function ehSaude(modalidade: string): boolean {
  const m = norm(modalidade);
  if (!m) return true; // sem info: não descarta
  if (m.includes("odonto")) return false;
  if (m.includes("administradora")) return false;
  return true;
}

// Faz o parse tolerante do CSV da ANS (delimitador ';', cabeçalho em PT).
function parseCadop(texto: string): OperadoraAns[] {
  const linhas = texto.split(/\r?\n/).filter((l) => l.trim().length > 0);
  if (linhas.length < 2) return [];
  const header = linhas[0].replace(/^﻿/, "").split(";").map((h) => norm(h));

  const idx = (chaves: string[]): number =>
    header.findIndex((h) => chaves.some((k) => h === k || h.includes(k)));

  const iReg = idx(["registro ans", "registro operadora", "registro_ans", "registro"]);
  const iCnpj = idx(["cnpj"]);
  const iRazao = idx(["razao social", "razao"]);
  const iFant = idx(["nome fantasia", "fantasia"]);
  const iMod = idx(["modalidade"]);
  const iCidade = idx(["cidade", "municipio"]);
  const iUf = header.findIndex((h) => h === "uf");

  const out: OperadoraAns[] = [];
  for (let i = 1; i < linhas.length; i++) {
    const c = linhas[i].split(";");
    const get = (n: number) => (n >= 0 && n < c.length ? c[n].trim().replace(/^"|"$/g, "") : "");
    out.push({
      registroAns: get(iReg),
      cnpj: get(iCnpj),
      razaoSocial: get(iRazao),
      nomeFantasia: get(iFant),
      modalidade: get(iMod),
      cidade: get(iCidade),
      uf: get(iUf),
    });
  }
  return out;
}

export async function baixarOperadorasAtivas(): Promise<OperadoraAns[]> {
  const res = await fetch(CADOP_URL, {
    headers: { "User-Agent": "GrowthAI/1.0", Accept: "text/csv,*/*" },
  });
  if (!res.ok) {
    throw new Error(`ANS respondeu ${res.status} ao baixar o cadastro de operadoras.`);
  }
  // O arquivo recente vem em UTF-8; decodificamos explicitamente.
  const buf = Buffer.from(await res.arrayBuffer());
  const texto = buf.toString("utf8");
  return parseCadop(texto);
}

export interface CandidatoOperadora extends OperadoraAns {
  jaNaBase: boolean;
}

// Descobre operadoras de SAÚDE com sede na Grande SP que NÃO estão na base da
// marca ativa. Retorna ordenado por nome (Fase 2 ordenará por vidas).
export async function descobrirOperadorasGrandeSP(
  supabase: SupabaseClient,
  brand: string,
  opts?: { max?: number; incluirJaNaBase?: boolean },
): Promise<{ total: number; candidatos: CandidatoOperadora[] }> {
  const max = opts?.max ?? 100;

  const todas = await baixarOperadorasAtivas();

  // Filtra: saúde + UF SP + sede na Grande SP.
  const naRegiao = todas.filter(
    (o) =>
      norm(o.uf) === "sp" &&
      GRANDE_SP_SET.has(norm(o.cidade)) &&
      ehSaude(o.modalidade) &&
      (o.razaoSocial || o.nomeFantasia),
  );

  // Nomes já cadastrados como operadora NA MARCA ATIVA (para não duplicar).
  const { data: existentes } = await supabase
    .from("companies")
    .select("name")
    .eq("brand", brand)
    .eq("category", "operadora")
    .limit(2000);
  const nomesBase = new Set(
    ((existentes as { name: string }[] | null) ?? []).map((e) => norm(e.name)),
  );
  const ehConhecida = (o: OperadoraAns): boolean => {
    const fant = norm(o.nomeFantasia);
    const razao = norm(o.razaoSocial);
    if (fant && nomesBase.has(fant)) return true;
    if (razao && nomesBase.has(razao)) return true;
    // match parcial: algum nome da base contido no nome da operadora (>5 letras)
    for (const n of nomesBase) {
      if (n.length > 5 && (fant.includes(n) || razao.includes(n))) return true;
    }
    return false;
  };

  const candidatos: CandidatoOperadora[] = [];
  const vistos = new Set<string>();
  for (const o of naRegiao) {
    const chave = o.cnpj || o.registroAns || norm(o.razaoSocial);
    if (vistos.has(chave)) continue;
    vistos.add(chave);
    const jaNaBase = ehConhecida(o);
    if (jaNaBase && !opts?.incluirJaNaBase) continue;
    candidatos.push({ ...o, jaNaBase });
  }

  candidatos.sort((a, b) =>
    (a.nomeFantasia || a.razaoSocial).localeCompare(b.nomeFantasia || b.razaoSocial, "pt-BR"),
  );

  return { total: candidatos.length, candidatos: candidatos.slice(0, max) };
}
