import { NextResponse } from "next/server";
import { getServerSupabase } from "@/lib/supabase/server";
import { analyzeContract } from "@/lib/anthropic";
import type { Company } from "@/lib/types";

// A análise de PDF pela IA pode demorar — damos mais tempo.
export const maxDuration = 60;

const BUCKET = "contratos";

// POST /api/reajustes/[id]/contract   body: { paths: string[], names: string[] }
// Os PDFs já foram subidos direto ao Storage (via /contract/sign). Aqui só
// recebemos os caminhos, baixamos do Storage (sem limite de requisição), a IA
// analisa a cláusula de reajuste (percentual + janela + parecer) e geramos o
// 1º rascunho do pedido.
export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;

  let body: { paths?: string[]; names?: string[] };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Body inválido" }, { status: 400 });
  }
  const paths = (body.paths ?? []).filter((p) => typeof p === "string");
  const names = body.names ?? [];
  if (paths.length === 0) {
    return NextResponse.json(
      { error: "Nenhum contrato para analisar." },
      { status: 400 },
    );
  }

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
    .select("*")
    .eq("id", id)
    .single<Company>();
  if (!company) {
    return NextResponse.json({ error: "Operadora não encontrada" }, { status: 404 });
  }

  // Baixa cada PDF do Storage e converte para base64 (para a IA).
  const docs: { base64: string; name: string }[] = [];
  for (let i = 0; i < paths.length; i++) {
    const nome = names[i] || paths[i].split("/").pop() || "contrato.pdf";
    const { data, error } = await supabase.storage.from(BUCKET).download(paths[i]);
    if (error || !data) {
      return NextResponse.json(
        { error: `Falha ao ler "${nome}" do armazenamento.` },
        { status: 502 },
      );
    }
    const buf = Buffer.from(await data.arrayBuffer());
    docs.push({ base64: buf.toString("base64"), name: nome });
  }

  // Análise da IA (advogado + comercial) com TODOS os documentos juntos.
  let analysis;
  try {
    analysis = await analyzeContract({
      pdfs: docs,
      operadora: company.name,
      briefing: company.briefing,
    });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Erro ao analisar os contratos" },
      { status: 502 },
    );
  }

  await supabase
    .from("companies")
    .update({
      contract_path: paths.join(" ; "),
      contract_name: docs.map((d) => d.name).join(" ; "),
      reajuste_parecer: analysis.parecer,
      reajuste_percent: analysis.percentual,
      reajuste_janela: analysis.janela,
    })
    .eq("id", id);

  await supabase.from("activities").insert({
    company_id: id,
    type: "analise",
    description: `Contratos analisados pela IA (${docs.length}). Percentual sugerido: ${analysis.percentual}. Janela: ${analysis.janela}.`,
  });

  // O rascunho do pedido é gerado numa chamada separada (/draft) para manter
  // cada requisição leve e dentro do limite de tempo da hospedagem.
  return NextResponse.json({ ok: true, analysis });
}
