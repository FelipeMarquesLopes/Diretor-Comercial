// Cliente da API pública do PNCP (Portal Nacional de Contratações Públicas) —
// a base OFICIAL e gratuita de editais/licitações da Lei 14.133/2021. É aqui
// que as prefeituras publicam pregões, credenciamentos, dispensas etc.
//
// Docs: https://pncp.gov.br/api/consulta (endpoint de consulta pública).
// Não exige chave. Filtramos por município (código IBGE) + modalidade + data e,
// no nosso lado, por PALAVRAS-CHAVE de saúde (o que a clínica sabe atender).
//
// IMPORTANTE (honestidade): não deu para testar a API a partir do ambiente de
// desenvolvimento (proxy bloqueia o host). Em produção (Vercel) o acesso é
// liberado. O código é defensivo: cada modalidade é buscada isolada, erros são
// coletados e devolvidos como diagnóstico — assim a 1ª execução real já mostra
// se algum parâmetro precisa de ajuste.

const PNCP_BASE = "https://pncp.gov.br/api/consulta/v1";

// Modalidades relevantes para contratar/credenciar uma clínica (código do PNCP).
export const MODALIDADES: { id: number; nome: string }[] = [
  { id: 12, nome: "Credenciamento" },
  { id: 6, nome: "Pregão Eletrônico" },
  { id: 4, nome: "Concorrência Eletrônica" },
  { id: 8, nome: "Dispensa" },
  { id: 9, nome: "Inexigibilidade" },
  { id: 10, nome: "Manifestação de Interesse" },
];

// Palavras-chave (sem acento, minúsculas) do que a MenthalHelp atende. Termos
// longos casam por trecho; termos curtos/ambíguos casam por palavra inteira.
const KW_TRECHO = [
  "autis",
  "espectro",
  "reabilit",
  "fisioterap",
  "fonoaudiolog",
  "terapia ocupacional",
  "psicolog",
  "psicopedag",
  "saude mental",
  "neurolog",
  "neuropediat",
  "neuropsic",
  "multidisciplinar",
  "ambulatorial",
  "transtorno",
  "terapias",
  "terapeutico",
];
const KW_PALAVRA = ["tea"]; // palavra inteira, senão casa "sistema", "proteina"...

function norm(s: string): string {
  return (s ?? "")
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase();
}

// Retorna a palavra-chave que casou (para transparência) ou null.
export function matchKeyword(objeto: string): string | null {
  const o = norm(objeto);
  for (const kw of KW_TRECHO) {
    if (o.includes(kw)) return kw;
  }
  for (const kw of KW_PALAVRA) {
    if (new RegExp(`\\b${kw}\\b`).test(o)) return kw;
  }
  return null;
}

function yyyymmdd(d: Date): string {
  return `${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, "0")}${String(
    d.getDate(),
  ).padStart(2, "0")}`;
}

// Registro cru do PNCP (só os campos que usamos).
interface RawContratacao {
  numeroControlePNCP?: string;
  objetoCompra?: string;
  modalidadeNome?: string;
  dataPublicacaoPncp?: string;
  dataAberturaProposta?: string | null;
  dataEncerramentoProposta?: string | null;
  situacaoCompraNome?: string;
  valorTotalEstimado?: number | null;
  anoCompra?: number;
  sequencialCompra?: number;
  numeroCompra?: string;
  linkSistemaOrigem?: string | null;
  orgaoEntidade?: { razaoSocial?: string; cnpj?: string };
  unidadeOrgao?: {
    nomeUnidade?: string;
    municipioNome?: string;
    ufSigla?: string;
    codigoIbge?: string | number;
  };
}

// Oportunidade já normalizada para o nosso banco.
export interface PncpOportunidade {
  numeroControle: string;
  objeto: string;
  modalidade: string | null;
  orgao: string | null;
  unidade: string | null;
  municipio: string | null;
  ibge: string | null;
  dataPublicacao: string | null;
  dataAbertura: string | null;
  dataEncerramento: string | null;
  valorEstimado: number | null;
  editalNumero: string | null;
  link: string;
  situacao: string | null;
  matchedKeyword: string;
}

function linkDoEdital(r: RawContratacao): string {
  const cnpj = r.orgaoEntidade?.cnpj;
  if (cnpj && r.anoCompra && r.sequencialCompra) {
    return `https://pncp.gov.br/app/editais/${cnpj}/${r.anoCompra}/${r.sequencialCompra}`;
  }
  if (r.linkSistemaOrigem) return r.linkSistemaOrigem;
  return "https://pncp.gov.br/app/editais";
}

function mapContratacao(r: RawContratacao): PncpOportunidade | null {
  const objeto = r.objetoCompra ?? "";
  const matched = matchKeyword(objeto);
  if (!matched) return null; // fora do perfil da clínica
  const numeroControle = r.numeroControlePNCP ?? "";
  if (!numeroControle) return null;
  return {
    numeroControle,
    objeto,
    modalidade: r.modalidadeNome ?? null,
    orgao: r.orgaoEntidade?.razaoSocial ?? null,
    unidade: r.unidadeOrgao?.nomeUnidade ?? null,
    municipio: r.unidadeOrgao?.municipioNome ?? null,
    ibge:
      r.unidadeOrgao?.codigoIbge != null
        ? String(r.unidadeOrgao.codigoIbge)
        : null,
    dataPublicacao: r.dataPublicacaoPncp ?? null,
    dataAbertura: r.dataAberturaProposta ?? null,
    dataEncerramento: r.dataEncerramentoProposta ?? null,
    valorEstimado: r.valorTotalEstimado ?? null,
    editalNumero: r.numeroCompra ?? null,
    link: linkDoEdital(r),
    situacao: r.situacaoCompraNome ?? null,
    matchedKeyword: matched,
  };
}

async function fetchPagina(
  modalidade: number,
  ibge: string,
  dataInicial: string,
  dataFinal: string,
  pagina: number,
): Promise<{ registros: RawContratacao[]; paginasRestantes: number }> {
  const url =
    `${PNCP_BASE}/contratacoes/publicacao?dataInicial=${dataInicial}` +
    `&dataFinal=${dataFinal}&codigoModalidadeContratacao=${modalidade}` +
    `&codigoMunicipioIbge=${ibge}&pagina=${pagina}&tamanhoPagina=50`;
  const res = await fetch(url, {
    headers: {
      Accept: "application/json, text/plain, */*",
      "Accept-Language": "pt-BR,pt;q=0.9,en;q=0.8",
      // O WAF do gov.br DESCARTA (não responde) requisições sem User-Agent de
      // navegador — o que causava o "aborted due to timeout" em toda chamada.
      // Enviamos um User-Agent de navegador real para passar pelo WAF.
      "User-Agent":
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 " +
        "(KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36",
    },
    // Timeout por chamada: se o PNCP travar, esta requisição falha sozinha
    // (vira diagnóstico) em vez de segurar a busca inteira até o timeout da
    // função na Vercel.
    signal: AbortSignal.timeout(12000),
  });
  // 204 = sem conteúdo naquele filtro; tratamos como vazio (não é erro).
  if (res.status === 204) return { registros: [], paginasRestantes: 0 };
  if (!res.ok) {
    const txt = await res.text().catch(() => "");
    throw new Error(`PNCP ${res.status}: ${txt.slice(0, 160)}`);
  }
  const json = (await res.json()) as {
    data?: RawContratacao[];
    paginasRestantes?: number;
  };
  const registros = Array.isArray(json?.data) ? json.data : [];
  const paginasRestantes = Number(json?.paginasRestantes ?? 0);
  return { registros, paginasRestantes };
}

export interface MonitorResult {
  encontradasNoPncp: number; // total cru (antes do filtro de saúde)
  relevantes: PncpOportunidade[]; // passaram no filtro de palavra-chave
  erros: string[];
}

/**
 * Busca no PNCP as contratações de um município (por IBGE), em várias
 * modalidades, nos últimos `dias`, e devolve só as que casam com o perfil da
 * clínica. Defensivo: erros por modalidade viram diagnóstico, não quebram tudo.
 */
export async function monitorarMunicipio(
  ibge: string,
  opts?: { dias?: number; maxPaginasPorModalidade?: number },
): Promise<MonitorResult> {
  const dias = opts?.dias ?? 180;
  const maxPaginas = opts?.maxPaginasPorModalidade ?? 2;
  const dataFinal = yyyymmdd(new Date());
  const dataInicial = yyyymmdd(new Date(Date.now() - dias * 24 * 60 * 60 * 1000));

  // Uma tarefa por modalidade (a paginação é sequencial DENTRO da modalidade),
  // mas as modalidades rodam EM PARALELO — corta o tempo de dezenas de chamadas
  // em série para poucas rodadas. Erro de uma modalidade não derruba as outras.
  const tarefas = MODALIDADES.map(async (m) => {
    const rel: PncpOportunidade[] = [];
    let vistas = 0;
    let erro: string | null = null;
    let pagina = 1;
    for (;;) {
      let page;
      try {
        page = await fetchPagina(m.id, ibge, dataInicial, dataFinal, pagina);
      } catch (err) {
        erro = `${m.nome}: ${err instanceof Error ? err.message : "falha"}`;
        break;
      }
      vistas += page.registros.length;
      for (const r of page.registros) {
        const rawIbge =
          r.unidadeOrgao?.codigoIbge != null
            ? String(r.unidadeOrgao.codigoIbge)
            : null;
        if (rawIbge && rawIbge !== ibge) continue;
        const op = mapContratacao(r);
        if (op) rel.push(op);
      }
      if (page.paginasRestantes <= 0 || pagina >= maxPaginas) break;
      pagina++;
    }
    return { rel, vistas, erro };
  });

  const resultados = await Promise.all(tarefas);

  let encontradasNoPncp = 0;
  const relevantes: PncpOportunidade[] = [];
  const erros: string[] = [];
  const vistos = new Set<string>();
  for (const res of resultados) {
    encontradasNoPncp += res.vistas;
    if (res.erro) erros.push(res.erro);
    for (const op of res.rel) {
      if (vistos.has(op.numeroControle)) continue;
      vistos.add(op.numeroControle);
      relevantes.push(op);
    }
  }

  return { encontradasNoPncp, relevantes, erros };
}
