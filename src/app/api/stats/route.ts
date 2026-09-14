import { NextResponse } from "next/server";
import { getServerSupabase } from "@/lib/supabase/server";
import { brandFromRequest } from "@/lib/brands";

// GET /api/stats — métricas para o dashboard executivo, SÓ da marca ativa.
export async function GET(req: Request) {
  const brand = brandFromRequest(req);

  let supabase: ReturnType<typeof getServerSupabase>;
  try {
    supabase = getServerSupabase();
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Configuração ausente" },
      { status: 500 },
    );
  }

  // Contagem em companies (a própria tabela tem `brand`).
  async function countCompanies(filter?: [string, string]) {
    let q = supabase
      .from("companies")
      .select("*", { count: "exact", head: true })
      .eq("brand", brand);
    if (filter) q = q.eq(filter[0], filter[1]);
    const { count: c } = await q;
    return c ?? 0;
  }

  // Contagem em tabelas filhas (drafts/sequences): filtra pela marca da empresa
  // via join interno (companies!inner + companies.brand).
  async function countByBrand(table: string, filter?: [string, string]) {
    let q = supabase
      .from(table)
      .select("*, companies!inner(brand)", { count: "exact", head: true })
      .eq("companies.brand", brand);
    if (filter) q = q.eq(filter[0], filter[1]);
    const { count: c } = await q;
    return c ?? 0;
  }

  // Início do dia de HOJE no fuso do Brasil (UTC-3, sem horário de verão).
  const nowBrt = new Date(Date.now() - 3 * 3600 * 1000);
  const startTodayISO = new Date(
    Date.UTC(nowBrt.getUTCFullYear(), nowBrt.getUTCMonth(), nowBrt.getUTCDate(), 3, 0, 0),
  ).toISOString();

  // Respostas recebidas HOJE (total e por sentimento) — só da marca ativa.
  async function countRespostasHoje(sentiment?: string) {
    let q = supabase
      .from("responses")
      .select("*, companies!inner(brand)", { count: "exact", head: true })
      .eq("companies.brand", brand)
      .gte("created_at", startTodayISO);
    if (sentiment) q = q.eq("sentiment", sentiment);
    const { count: c } = await q;
    return c ?? 0;
  }

  const [
    empresas,
    operadoras,
    qualificadas,
    contatoIniciado,
    emNegociacao,
    parcerias,
    rascunhosPendentes,
    aprovados,
    enviados,
    aguardandoVoce,
    respostasHoje,
    positivasHoje,
    negativasHoje,
  ] = await Promise.all([
    countCompanies(["category", "empresa"]),
    countCompanies(["category", "operadora"]),
    countCompanies(["status", "qualificado"]),
    countCompanies(["status", "contato_iniciado"]),
    countCompanies(["status", "em_negociacao"]),
    countCompanies(["status", "parceria_ativa"]),
    countByBrand("drafts", ["status", "pendente"]),
    countByBrand("drafts", ["status", "aprovado"]),
    countByBrand("drafts", ["status", "enviado"]),
    countByBrand("sequences", ["status", "aguardando_ceo"]),
    countRespostasHoje(),
    countRespostasHoje("positivo"),
    countRespostasHoje("negativo"),
  ]);

  return NextResponse.json({
    empresas,
    operadoras,
    qualificadas,
    contatoIniciado,
    emNegociacao,
    parcerias,
    rascunhosPendentes,
    aprovados,
    enviados,
    aguardandoVoce,
    respostasHoje,
    positivasHoje,
    negativasHoje,
  });
}
