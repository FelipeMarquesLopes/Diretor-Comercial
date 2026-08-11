import { NextResponse } from "next/server";
import { getServerSupabase } from "@/lib/supabase/server";
import { findStage } from "@/lib/pipelines";

export const maxDuration = 60;

// GET /api/funnel — funil comercial ponta a ponta (Fase 6.1), para a visão de
// diretoria: onde está o gargalo e onde está o dinheiro. Agrega sobre os dados
// que já existem (companies + stage + contacts + responses). Sem PII.
export async function GET() {
  let supabase: ReturnType<typeof getServerSupabase>;
  try {
    supabase = getServerSupabase();
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Configuração ausente" },
      { status: 500 },
    );
  }

  const [{ data: companies }, { data: validContacts }, { data: responses }] =
    await Promise.all([
      supabase.from("companies").select("category, status, stage").limit(5000),
      supabase
        .from("contacts")
        .select("company_id")
        .eq("email_verdict", "valid")
        .limit(8000),
      supabase.from("responses").select("company_id, sentiment").limit(8000),
    ]);

  const comps = companies ?? [];

  // Alcançáveis: parceiros DISTINTOS com ao menos um e-mail válido.
  const comEmailValido = new Set(
    (validContacts ?? []).map((c) => c.company_id),
  ).size;

  // Responderam: parceiros DISTINTOS com resposta; e com resposta positiva.
  const respByCompany = new Map<string, boolean>(); // companyId -> temPositiva
  for (const r of responses ?? []) {
    const prev = respByCompany.get(r.company_id) ?? false;
    respByCompany.set(r.company_id, prev || r.sentiment === "positivo");
  }
  const responderam = respByCompany.size;
  const respostasPositivas = [...respByCompany.values()].filter(Boolean).length;

  // Contagens por status.
  const byStatus = (s: string) => comps.filter((c) => c.status === s).length;
  const prospectados =
    byStatus("contato_iniciado") + byStatus("em_negociacao") + byStatus("parceria_ativa");
  const emNegociacao = byStatus("em_negociacao");
  const parcerias = byStatus("parceria_ativa");

  // Estágios avançados: reunião/visita/proposta/contrato/credenciamento/implantação.
  const AVANCADOS = new Set([
    "reuniao",
    "visita",
    "proposta",
    "contrato",
    "em_credenciamento",
    "implantacao",
  ]);
  let reuniaoProposta = 0;
  let credenciamentos = 0;
  for (const c of comps) {
    if (c.stage && AVANCADOS.has(c.stage)) reuniaoProposta++;
    // Operadora credenciada = credenciamento fechado.
    const st = c.stage ? findStage(c.category, c.stage) : null;
    if (c.category === "operadora" && (c.stage === "credenciada" || (st?.won && c.status === "parceria_ativa")))
      credenciamentos++;
  }

  // Parcerias por segmento (onde está o dinheiro).
  const parceriasPorSegmento: Record<string, number> = {};
  for (const c of comps) {
    if (c.status === "parceria_ativa") {
      parceriasPorSegmento[c.category] = (parceriasPorSegmento[c.category] ?? 0) + 1;
    }
  }

  // Funil em ordem (cada etapa é um degrau até a receita).
  const etapas = [
    { key: "leads", label: "Leads mapeados", value: comps.length },
    { key: "email_valido", label: "Com e-mail válido", value: comEmailValido },
    { key: "prospectados", label: "Prospectados (contato feito)", value: prospectados },
    { key: "responderam", label: "Responderam", value: responderam },
    { key: "positivas", label: "Resposta positiva", value: respostasPositivas },
    { key: "negociacao", label: "Em negociação", value: emNegociacao },
    { key: "reuniao_proposta", label: "Reunião / proposta", value: reuniaoProposta },
    { key: "parcerias", label: "Parcerias ativas", value: parcerias },
    { key: "credenciamentos", label: "Credenciamentos", value: credenciamentos },
  ];

  return NextResponse.json({ etapas, parceriasPorSegmento });
}
