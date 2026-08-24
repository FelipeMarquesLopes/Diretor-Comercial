// Frente Licitações — prefeituras onde a MenthalHelp tem unidade e pode firmar
// parceria com o poder público (credenciamento / pregão / chamamento) para
// atender demandas que o SUS terceiriza: TEA, reabilitação neurológica
// intensiva (PediaSuite), psicologia, saúde mental etc.
//
// Definidas em CÓDIGO (mudam raríssimo, como UNITS). O código IBGE é o que o
// PNCP usa para filtrar por município — foram conferidos um a um (errar o
// código traria a cidade errada).
//
// Nada de dado de paciente — é relacionamento comercial com o poder público.

export interface Prefeitura {
  id: string; // estável (vai para licitacoes.prefeitura)
  nome: string; // rótulo na UI
  municipio: string; // nome do município como o PNCP retorna
  ibge: string; // código IBGE de 7 dígitos (conferido)
  unidades: string; // nossas unidades que justificam a atuação (contexto)
}

export const PREFEITURAS: Prefeitura[] = [
  {
    id: "sao-paulo",
    nome: "Prefeitura de São Paulo",
    municipio: "São Paulo",
    ibge: "3550308",
    unidades: "Zona Norte (Tucuruvi) e Zona Sul (Interlagos)",
  },
  {
    id: "guarulhos",
    nome: "Prefeitura de Guarulhos",
    municipio: "Guarulhos",
    ibge: "3518800",
    unidades: "Guarulhos",
  },
  {
    id: "barueri",
    nome: "Prefeitura de Barueri",
    municipio: "Barueri",
    ibge: "3505708",
    unidades: "Barueri (Alphaville)",
  },
  {
    id: "braganca",
    nome: "Prefeitura de Bragança Paulista",
    municipio: "Bragança Paulista",
    ibge: "3507605",
    unidades: "Bragança Paulista",
  },
];

export function findPrefeitura(id: string | null | undefined): Prefeitura | null {
  if (!id) return null;
  return PREFEITURAS.find((p) => p.id === id) ?? null;
}

// Situação de acompanhamento (nossa gestão do funil de licitação).
export const LICITACAO_STATUS: { id: string; label: string }[] = [
  { id: "nova", label: "Nova" },
  { id: "analisando", label: "Analisando" },
  { id: "vamos_participar", label: "Vamos participar" },
  { id: "inscritos", label: "Inscritos" },
  { id: "credenciada", label: "Credenciada / ganha" },
  { id: "descartada", label: "Descartada" },
];

export function statusLabel(id: string): string {
  return LICITACAO_STATUS.find((s) => s.id === id)?.label ?? id;
}
