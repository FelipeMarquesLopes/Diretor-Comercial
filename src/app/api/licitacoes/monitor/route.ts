import { NextResponse } from "next/server";
import { getServerSupabase } from "@/lib/supabase/server";
import { PREFEITURAS, findPrefeitura } from "@/lib/prefeituras";
import { monitorarMunicipio, mapLimit } from "@/lib/pncp";

// Buscar no PNCP pode envolver várias páginas/modalidades — dá folga.
export const maxDuration = 60;

// POST /api/licitacoes/monitor — busca manual (botão), prefeitura ou todas.
// Body opcional: { prefeitura?: "guarulhos", dias?: 180 }
export async function POST(req: Request) {
  let body: { prefeitura?: string; dias?: number } = {};
  try {
    body = await req.json();
  } catch {
    body = {};
  }
  return runMonitor(body.prefeitura ?? null, body.dias);
}

// GET /api/licitacoes/monitor — usado pelo CRON diário da Vercel (busca TODAS
// as prefeituras). Rodando de madrugada, sozinho, evita o rate limit do PNCP.
export async function GET(req: Request) {
  // Se CRON_SECRET estiver definido, exige o cabeçalho da Vercel (protege o
  // endpoint). Sem a variável, roda livre (o cron continua funcionando).
  const secret = process.env.CRON_SECRET;
  if (secret) {
    const auth = req.headers.get("authorization");
    if (auth !== `Bearer ${secret}`) {
      return NextResponse.json({ error: "Não autorizado" }, { status: 401 });
    }
  }
  return runMonitor(null);
}

// Núcleo compartilhado: vasculha o PNCP (base oficial) das prefeituras onde a
// clínica atua, filtra pelo perfil de saúde (TEA, reabilitação, psicologia,
// saúde mental...) e salva as oportunidades novas. Dedupe por numero_controle —
// nunca sobrescreve o nosso `status`/notes de acompanhamento.
async function runMonitor(prefeituraId: string | null, dias?: number) {
  let supabase: ReturnType<typeof getServerSupabase>;
  try {
    supabase = getServerSupabase();
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Configuração ausente" },
      { status: 500 },
    );
  }

  // Uma prefeitura específica, ou todas.
  const alvo = prefeituraId
    ? [findPrefeitura(prefeituraId)].filter(Boolean)
    : PREFEITURAS;
  if (alvo.length === 0) {
    return NextResponse.json({ error: "Prefeitura inválida." }, { status: 400 });
  }

  const porPrefeitura: {
    prefeitura: string;
    nome: string;
    encontradasNoPncp: number;
    relevantes: number;
    novas: number;
    erros: string[];
  }[] = [];
  let totalNovas = 0;

  // Prefeituras UMA POR VEZ (e cada município já pacei as modalidades em série).
  // O PNCP tem rate limit (429); processar em série + com respiro é o que evita
  // "Limite de Requisições Excedido". Erro numa prefeitura não derruba as outras.
  // Prazo-limite geral compartilhado por TODAS as prefeituras desta busca: a
  // função devolve o que conseguiu até ~48s e nunca estoura os 60s (evita 504).
  const deadline = Date.now() + 48000;
  const buscas = await mapLimit(alvo, 1, async (pref) => {
    if (!pref) return null;
    try {
      const res = await monitorarMunicipio(pref.ibge, { dias, deadline });
      return { pref, res, erro: null as string | null };
    } catch (err) {
      return {
        pref,
        res: null,
        erro: err instanceof Error ? err.message : "Falha no PNCP",
      };
    }
  });

  for (const b of buscas) {
    if (!b) continue;
    const { pref, res } = b;
    if (!res) {
      porPrefeitura.push({
        prefeitura: pref.id,
        nome: pref.nome,
        encontradasNoPncp: 0,
        relevantes: 0,
        novas: 0,
        erros: [b.erro ?? "Falha no PNCP"],
      });
      continue;
    }

    // Quais já existem (para contar as realmente novas).
    const controles = res.relevantes.map((r) => r.numeroControle);
    const existentes = new Set<string>();
    if (controles.length) {
      const { data: ex } = await supabase
        .from("licitacoes")
        .select("numero_controle")
        .in("numero_controle", controles);
      for (const row of ex ?? [])
        existentes.add((row as { numero_controle: string }).numero_controle);
    }

    let novas = 0;
    for (const op of res.relevantes) {
      const isNova = !existentes.has(op.numeroControle);
      // Upsert só dos campos vindos do PNCP — status/notes/contato ficam intactos
      // nas que já acompanhamos (o default 'nova' cobre as novas).
      const { error } = await supabase.from("licitacoes").upsert(
        {
          prefeitura: pref.id,
          municipio: op.municipio ?? pref.municipio,
          ibge: op.ibge ?? pref.ibge,
          orgao: op.orgao,
          unidade: op.unidade,
          objeto: op.objeto,
          modalidade: op.modalidade,
          numero_controle: op.numeroControle,
          edital_numero: op.editalNumero,
          data_publicacao: op.dataPublicacao
            ? op.dataPublicacao.slice(0, 10)
            : null,
          data_abertura: op.dataAbertura,
          data_encerramento: op.dataEncerramento,
          valor_estimado: op.valorEstimado,
          link: op.link,
          situacao: op.situacao,
          fonte: "pncp",
          matched_keyword: op.matchedKeyword,
        },
        { onConflict: "numero_controle" },
      );
      if (!error && isNova) novas++;
    }

    totalNovas += novas;
    porPrefeitura.push({
      prefeitura: pref.id,
      nome: pref.nome,
      encontradasNoPncp: res.encontradasNoPncp,
      relevantes: res.relevantes.length,
      novas,
      erros: res.erros,
    });
  }

  return NextResponse.json({ ok: true, totalNovas, porPrefeitura });
}
