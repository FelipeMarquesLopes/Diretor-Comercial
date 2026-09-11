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

// User-Agent de navegador (o WAF do gov.br descarta requisições "de robô").
const PNCP_UA =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 " +
  "(KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36";

export interface AnexoLicitacao {
  titulo: string;
  url: string;
  tipo: string; // dica de formato: "pdf", "docx", "zip"...
}

// Deduz a extensão/tipo do arquivo pelo nome do documento ou pela URL.
function tipoDoArquivo(titulo: string, url: string): string {
  const alvo = `${titulo} ${url}`.toLowerCase();
  const m = alvo.match(/\.(pdf|docx?|xlsx?|zip|rar|png|jpe?g)\b/);
  return m ? m[1].replace("jpeg", "jpg") : "";
}

// Lista os ANEXOS/documentos de um edital (termo de referência, tabela de
// procedimentos SUS/SIGTAP, etc.) a partir do link do edital no PNCP
// (…/app/editais/{cnpj}/{ano}/{sequencial}). Devolve título + URL de download,
// para a Lara BAIXAR e ler o conteúdo (aprofundar no objeto real da licitação).
export async function arquivosDaLicitacao(
  link: string,
): Promise<AnexoLicitacao[]> {
  const m =
    link.match(/editais\/(\d+)\/(\d+)\/(\d+)/) ??
    link.match(/orgaos\/(\d+)\/compras\/(\d+)\/(\d+)/);
  if (!m) throw new Error("Link do edital em formato inesperado.");
  const [, cnpj, ano, seq] = m;
  // Dois caminhos possíveis da API de documentos do PNCP — tentamos os dois.
  const bases = [
    `https://pncp.gov.br/pncp-api/v1/orgaos/${cnpj}/compras/${ano}/${seq}/arquivos`,
    `https://pncp.gov.br/api/pncp/v1/orgaos/${cnpj}/compras/${ano}/${seq}/arquivos`,
  ];
  for (const base of bases) {
    try {
      const res = await fetch(base, {
        headers: { Accept: "application/json", "User-Agent": PNCP_UA },
        signal: AbortSignal.timeout(12000),
      });
      if (!res.ok) continue;
      const data = (await res.json()) as Array<{
        titulo?: string;
        tipoDocumentoNome?: string;
        url?: string;
        uri?: string;
        sequencialDocumento?: number;
      }>;
      if (Array.isArray(data) && data.length > 0) {
        return data
          .map((d) => {
            const titulo = d.titulo ?? d.tipoDocumentoNome ?? "documento";
            // A própria API traz a URL de download (uri/url). Se não vier,
            // montamos pelo sequencial do documento (endpoint /arquivos/{n}).
            let url = d.uri ?? d.url ?? "";
            if (!url && d.sequencialDocumento != null) {
              url = `${base}/${d.sequencialDocumento}`;
            }
            return { titulo, url, tipo: tipoDoArquivo(titulo, url) };
          })
          .filter((a) => a.url);
      }
    } catch {
      // tenta o próximo caminho
    }
  }
  throw new Error(
    "Não consegui listar os anexos do edital no PNCP. Você pode me colar o link direto do PDF que eu leio.",
  );
}

export interface ArquivoBaixado {
  base64: string;
  mediaType: string;
  nome: string;
  bytes: number;
}

function mediaTypePorNome(nome: string): string {
  const n = nome.toLowerCase();
  if (n.endsWith(".pdf")) return "application/pdf";
  if (n.endsWith(".png")) return "image/png";
  if (n.endsWith(".jpg") || n.endsWith(".jpeg")) return "image/jpeg";
  return "application/octet-stream";
}

// Deriva URLs alternativas de download (as duas bases da API de arquivos do
// PNCP). Assim, se um caminho estiver fora do ar, tentamos o outro.
function urlsAlternativas(url: string): string[] {
  const urls = [url];
  const m = url.match(
    /orgaos\/(\d+)\/compras\/(\d+)\/(\d+)\/arquivos\/(\d+)/,
  );
  if (m) {
    const [, cnpj, ano, seq, doc] = m;
    for (const base of ["pncp-api/v1", "api/pncp/v1"]) {
      const alt = `https://pncp.gov.br/${base}/orgaos/${cnpj}/compras/${ano}/${seq}/arquivos/${doc}`;
      if (!urls.includes(alt)) urls.push(alt);
    }
  }
  return urls;
}

function sleepMs(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

// Baixa um anexo do edital PELO SERVIDOR (com User-Agent de navegador, seguindo
// redirects para o storage do PNCP) e devolve os bytes em base64. É assim que a
// Lara consegue ler o PDF de verdade — sem depender do web_fetch, que não
// alcança o arquivo (link dinâmico / SPA do PNCP).
//
// Robusto contra a instabilidade do PNCP: tenta os caminhos alternativos da API
// e repete com backoff em erros de rede/timeout/429/5xx. Se o servidor devolver
// a página HTML (SPA) em vez do arquivo, avisa que o link falhou. Aceita PDFs
// que venham com content-type genérico (octet-stream) desde que o nome seja .pdf.
export async function baixarArquivoLicitacao(
  url: string,
): Promise<ArquivoBaixado> {
  if (!/^https?:\/\//i.test(url)) {
    throw new Error("URL do anexo inválida.");
  }
  const candidatas = urlsAlternativas(url);
  const MAX = 24 * 1024 * 1024; // 24MB — limite prático para leitura automática
  let ultimoDiag = "sem resposta";

  // Até 3 rodadas (a instabilidade do PNCP costuma passar em segundos), e em
  // cada rodada tentamos todas as URLs candidatas.
  for (let rodada = 0; rodada < 3; rodada++) {
    if (rodada > 0) await sleepMs(rodada * 900); // 0, 900ms, 1800ms

    for (const alvo of candidatas) {
      let res: Response;
      try {
        res = await fetch(alvo, {
          headers: {
            Accept: "*/*",
            "Accept-Language": "pt-BR,pt;q=0.9,en;q=0.8",
            "User-Agent": PNCP_UA,
          },
          redirect: "follow",
          signal: AbortSignal.timeout(30000),
        });
      } catch {
        ultimoDiag = "sem resposta do servidor (timeout)";
        continue; // rede/timeout → tenta a próxima URL / próxima rodada
      }

      // 429/5xx são transitórios: guarda o diagnóstico e deixa o backoff agir.
      if (res.status === 429 || res.status >= 500) {
        ultimoDiag = `servidor do PNCP instável (HTTP ${res.status})`;
        continue;
      }
      if (!res.ok) {
        // 404/403 etc. — erro definitivo desta URL; tenta a alternativa.
        ultimoDiag = `HTTP ${res.status}`;
        continue;
      }

      const ct = (res.headers.get("content-type") ?? "").toLowerCase();
      if (ct.includes("text/html")) {
        ultimoDiag = "voltou uma página do site (HTML), não o arquivo";
        continue;
      }

      const cd = res.headers.get("content-disposition") ?? "";
      const nm = cd.match(/filename\*?=(?:UTF-8'')?"?([^";]+)"?/i);
      let nome = "documento";
      if (nm?.[1]) {
        try {
          nome = decodeURIComponent(nm[1].trim());
        } catch {
          nome = nm[1].trim();
        }
      } else {
        const fromUrl = alvo.split("?")[0].split("/").pop();
        if (fromUrl && /\.[a-z0-9]{2,4}$/i.test(fromUrl)) nome = fromUrl;
      }

      const buf = Buffer.from(await res.arrayBuffer());
      if (buf.length === 0) {
        ultimoDiag = "arquivo veio vazio";
        continue;
      }
      if (buf.length > MAX) {
        throw new Error(
          `Anexo muito grande (${(buf.length / 1e6).toFixed(1)} MB) para leitura automática. Baixe e me mande as páginas relevantes.`,
        );
      }

      // content-type do arquivo. Se vier genérico (octet-stream) mas o nome for
      // .pdf, tratamos como PDF. Última garantia: assinatura "%PDF" no início.
      let mediaType = ct.split(";")[0].trim() || mediaTypePorNome(nome);
      const pareceGenerico = !mediaType || mediaType.includes("octet-stream");
      const ehPdfPeloNome = nome.toLowerCase().endsWith(".pdf");
      const ehPdfPelaAssinatura = buf.subarray(0, 5).toString("latin1") === "%PDF-";
      if (pareceGenerico && (ehPdfPeloNome || ehPdfPelaAssinatura)) {
        mediaType = "application/pdf";
      } else if (pareceGenerico) {
        mediaType = mediaTypePorNome(nome);
      }

      return { base64: buf.toString("base64"), mediaType, nome, bytes: buf.length };
    }
  }

  throw new Error(
    `Não consegui baixar o anexo agora (${ultimoDiag}). O servidor do PNCP costuma oscilar — dá para tentar de novo em alguns minutos, ou você me envia o PDF direto no chat.`,
  );
}

// Modalidades relevantes para contratar/credenciar uma clínica (código do PNCP).
// Enxuto de propósito: o PNCP tem rate limit (429), então cada modalidade a
// menos é uma requisição a menos. Estas 4 cobrem o que interessa (credenciar,
// pregão, dispensa e concorrência — que trazem, ex., o "Parque do Autista").
export const MODALIDADES: { id: number; nome: string }[] = [
  { id: 12, nome: "Credenciamento" },
  { id: 6, nome: "Pregão Eletrônico" },
  { id: 8, nome: "Dispensa" },
  { id: 4, nome: "Concorrência Eletrônica" },
];

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

// Palavras-chave (sem acento, minúsculas) do que a MenthalHelp atende.
//
// FORTES: específicas do nosso perfil — se casarem, MANTÊM o edital mesmo que
// haja alguma palavra negativa (ex: "reabilitação neurológica").
const KW_FORTE_TRECHO = [
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
];
const KW_FORTE_PALAVRA = ["tea"]; // palavra inteira, senão casa "sistema" etc.

// AMPLAS: sinalizam saúde/terapia, mas são ambíguas — só valem se NÃO houver
// nenhuma palavra negativa no objeto (senão pegam diálise, oncologia etc.).
const KW_AMPLA_TRECHO = [
  "multidisciplinar",
  "ambulatorial",
  "transtorno",
  "terapias",
  "terapeutico",
];

// NEGATIVAS: áreas de saúde que NÃO são o nosso perfil. Derrubam um edital que
// só casou por palavra AMPLA (ex: "terapia renal substitutiva ambulatorial").
const KW_NEGATIVA = [
  "renal",
  "dialise",
  "hemodialise",
  "nefrolog",
  "oncolog",
  "quimioterap",
  "radioterap",
  "hemodinam",
  "obstetr",
  "odontolog",
  "veterinar",
];

function norm(s: string): string {
  return (s ?? "")
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase();
}

// Retorna a palavra-chave que casou (para transparência) ou null se está fora
// do perfil da clínica.
export function matchKeyword(objeto: string): string | null {
  const o = norm(objeto);

  // 1) Sinal FORTE vence sempre (mantém, mesmo com palavra negativa junto).
  for (const kw of KW_FORTE_TRECHO) {
    if (o.includes(kw)) return kw;
  }
  for (const kw of KW_FORTE_PALAVRA) {
    if (new RegExp(`\\b${kw}\\b`).test(o)) return kw;
  }

  // 2) Sinal AMPLO só vale se não houver nenhuma palavra negativa.
  const temNegativa = KW_NEGATIVA.some((n) => o.includes(n));
  if (!temNegativa) {
    for (const kw of KW_AMPLA_TRECHO) {
      if (o.includes(kw)) return kw;
    }
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
  deadline: number,
): Promise<{ registros: RawContratacao[]; paginasRestantes: number }> {
  const url =
    `${PNCP_BASE}/contratacoes/publicacao?dataInicial=${dataInicial}` +
    `&dataFinal=${dataFinal}&codigoModalidadeContratacao=${modalidade}` +
    `&codigoMunicipioIbge=${ibge}&pagina=${pagina}&tamanhoPagina=50`;
  const headers = {
    Accept: "application/json, text/plain, */*",
    "Accept-Language": "pt-BR,pt;q=0.9,en;q=0.8",
    // O WAF do gov.br DESCARTA (não responde) requisições sem User-Agent de
    // navegador — o que causava "aborted due to timeout" em toda chamada.
    "User-Agent":
      "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 " +
      "(KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36",
  };

  // Rate limit do PNCP (429). Estratégia: FALHAR RÁPIDO. No máximo 2 tentativas,
  // timeout curto (8s), e uma espera curta no 429 — mas SEMPRE respeitando o
  // prazo-limite geral (deadline). Assim a função nunca estoura os 60s da Vercel
  // (que virava 504). Se o tempo acabar, desiste desta modalidade (vira aviso).
  let ultimoErro = "falha";
  for (let tentativa = 0; tentativa < 2; tentativa++) {
    if (Date.now() > deadline) throw new Error("tempo esgotado");
    if (tentativa > 0) await sleep(1200);
    const restante = deadline - Date.now();
    if (restante < 1500) throw new Error("tempo esgotado");
    let res: Response;
    try {
      res = await fetch(url, {
        headers,
        signal: AbortSignal.timeout(Math.min(8000, restante)),
      });
    } catch {
      ultimoErro = "sem resposta (timeout)";
      continue;
    }
    // 204 = sem conteúdo naquele filtro; tratamos como vazio (não é erro).
    if (res.status === 204) return { registros: [], paginasRestantes: 0 };
    if (res.status === 429) {
      ultimoErro = "limite de requisições (429)";
      continue; // rate limit → uma tentativa a mais (após a espera acima)
    }
    if (!res.ok) throw new Error(`PNCP ${res.status}`);
    const json = (await res.json().catch(() => ({}))) as {
      data?: RawContratacao[];
      paginasRestantes?: number;
    };
    const registros = Array.isArray(json?.data) ? json.data : [];
    const paginasRestantes = Number(json?.paginasRestantes ?? 0);
    return { registros, paginasRestantes };
  }
  throw new Error(`PNCP: ${ultimoErro}`);
}

export interface MonitorResult {
  encontradasNoPncp: number; // total cru (antes do filtro de saúde)
  relevantes: PncpOportunidade[]; // passaram no filtro de palavra-chave
  erros: string[];
}

// Executa `fn` sobre os itens com no máximo `limite` em paralelo. O PNCP (WAF
// do gov.br) derruba rajadas de muitas conexões simultâneas — então limitamos.
export async function mapLimit<T, R>(
  items: T[],
  limite: number,
  fn: (item: T, index: number) => Promise<R>,
): Promise<R[]> {
  const results: R[] = new Array(items.length);
  let i = 0;
  async function worker() {
    while (i < items.length) {
      const idx = i++;
      results[idx] = await fn(items[idx], idx);
    }
  }
  const n = Math.max(1, Math.min(limite, items.length));
  await Promise.all(Array.from({ length: n }, () => worker()));
  return results;
}

/**
 * Busca no PNCP as contratações de um município (por IBGE), em várias
 * modalidades, nos últimos `dias`, e devolve só as que casam com o perfil da
 * clínica. Defensivo: erros por modalidade viram diagnóstico, não quebram tudo.
 */
export async function monitorarMunicipio(
  ibge: string,
  opts?: { dias?: number; maxPaginasPorModalidade?: number; deadline?: number },
): Promise<MonitorResult> {
  const dias = opts?.dias ?? 180;
  const maxPaginas = opts?.maxPaginasPorModalidade ?? 1;
  // Prazo-limite geral: nunca ultrapassar isto (default ~45s a partir de agora).
  // Garante que a função retorne ANTES dos 60s da Vercel (evita 504).
  const deadline = opts?.deadline ?? Date.now() + 45000;
  const dataFinal = yyyymmdd(new Date());
  const dataInicial = yyyymmdd(new Date(Date.now() - dias * 24 * 60 * 60 * 1000));

  // Modalidades EM SÉRIE (1 por vez, com respiro) — o PNCP tem rate limit (429).
  // Cada modalidade respeita o deadline; se o tempo acabar, vira aviso e segue.
  const resultados = await mapLimit(MODALIDADES, 1, async (m, idx) => {
    const rel: PncpOportunidade[] = [];
    let vistas = 0;
    let erro: string | null = null;
    if (Date.now() > deadline) return { rel, vistas, erro: `${m.nome}: tempo esgotado` };
    if (idx > 0) await sleep(300);
    let pagina = 1;
    for (;;) {
      let page;
      try {
        page = await fetchPagina(m.id, ibge, dataInicial, dataFinal, pagina, deadline);
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
