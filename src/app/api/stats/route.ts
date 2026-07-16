import { NextResponse } from "next/server";
import { getServerSupabase } from "@/lib/supabase/server";

// GET /api/stats — métricas para o dashboard executivo.
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

  async function count(table: string, filter?: [string, string]) {
    let q = supabase.from(table).select("*", { count: "exact", head: true });
    if (filter) q = q.eq(filter[0], filter[1]);
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
  ] = await Promise.all([
    count("companies", ["category", "empresa"]),
    count("companies", ["category", "operadora"]),
    count("companies", ["status", "qualificado"]),
    count("companies", ["status", "contato_iniciado"]),
    count("companies", ["status", "em_negociacao"]),
    count("companies", ["status", "parceria_ativa"]),
    count("drafts", ["status", "pendente"]),
    count("drafts", ["status", "aprovado"]),
    count("drafts", ["status", "enviado"]),
    count("sequences", ["status", "aguardando_ceo"]),
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
  });
}
