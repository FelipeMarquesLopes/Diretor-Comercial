import { NextResponse } from "next/server";
import { getServerSupabase } from "@/lib/supabase/server";
import { buildCommercialContext } from "@/lib/memory";
import type { Company } from "@/lib/types";

export const maxDuration = 30;

// GET /api/companies/[id]/historico
// Devolve o CONTEXTO comercial do parceiro para a Lara analisar a continuidade:
// linha do tempo (atividades), respostas recebidas (ex: uma negativa anterior)
// e os últimos e-mails ENVIADOS (assunto + corpo). É o que permite a Lara
// "dar sequência" ao que já foi tratado, sem repetir nem contradizer o histórico.
export async function GET(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;

  let supabase: ReturnType<typeof getServerSupabase>;
  try {
    supabase = getServerSupabase();
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Configuração ausente" },
      { status: 500 },
    );
  }

  const { data: company } = await supabase
    .from("companies")
    .select("id, name, category, brand, status, stage")
    .eq("id", id)
    .single<
      Pick<Company, "id" | "name" | "category" | "brand" | "status" | "stage">
    >();
  if (!company) {
    return NextResponse.json({ error: "Parceiro não encontrado" }, { status: 404 });
  }

  const [historico, respostasRes, enviadosRes, seqRes] = await Promise.all([
    buildCommercialContext(supabase, id, { limit: 30, maxChars: 3000 }),
    supabase
      .from("responses")
      .select("sentiment, intent, summary, raw_text, created_at")
      .eq("company_id", id)
      .order("created_at", { ascending: false })
      .limit(8),
    supabase
      .from("drafts")
      .select("subject, body, sent_at, channel")
      .eq("company_id", id)
      .eq("status", "enviado")
      .order("sent_at", { ascending: false })
      .limit(5),
    supabase
      .from("sequences")
      .select("channel, status, step, next_action_at, resume_at, last_sent_at")
      .eq("company_id", id),
  ]);

  const respostas = (respostasRes.data ?? []).map((r) => ({
    sentimento: r.sentiment,
    intencao: r.intent,
    resumo: r.summary,
    trecho: (r.raw_text ?? "").slice(0, 600),
    data: r.created_at,
  }));

  const enviados = (enviadosRes.data ?? []).map((d) => ({
    assunto: d.subject,
    corpo: (d.body ?? "").slice(0, 1200),
    enviadoEm: d.sent_at,
    canal: d.channel,
  }));

  return NextResponse.json({
    parceiro: {
      id: company.id,
      nome: company.name,
      categoria: company.category,
      marca: company.brand,
      status: company.status,
      estagio: company.stage,
    },
    historico, // linha do tempo (texto)
    respostas, // respostas recebidas (ex: negativa anterior)
    enviados, // últimos e-mails que saíram (assunto + corpo)
    sequencias: seqRes.data ?? [],
  });
}
