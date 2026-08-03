import { NextResponse } from "next/server";
import { getServerSupabase } from "@/lib/supabase/server";
import { analyzeContract } from "@/lib/anthropic";
import { generateDraftForSequence } from "@/lib/outreach";
import type { Company, Sequence } from "@/lib/types";

// A análise de PDF pela IA pode demorar — damos mais tempo.
export const maxDuration = 60;

const BUCKET = "contratos";

// POST /api/reajustes/[id]/contract  (multipart/form-data, campo "file")
// Sobe o contrato (PDF) para o Storage, a IA analisa a cláusula de reajuste
// (percentual + janela ideal + parecer) e gera o 1º rascunho do pedido.
export async function POST(
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

  let form: FormData;
  try {
    form = await req.formData();
  } catch {
    return NextResponse.json({ error: "Envio inválido" }, { status: 400 });
  }
  const file = form.get("file");
  if (!(file instanceof File)) {
    return NextResponse.json(
      { error: "Anexe o arquivo do contrato (PDF)." },
      { status: 400 },
    );
  }
  if (file.type && !file.type.toLowerCase().includes("pdf")) {
    return NextResponse.json(
      { error: "O contrato precisa ser um PDF." },
      { status: 400 },
    );
  }

  const buf = Buffer.from(await file.arrayBuffer());
  if (buf.length > 20 * 1024 * 1024) {
    return NextResponse.json(
      { error: "Contrato muito grande (máx. ~20 MB)." },
      { status: 413 },
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

  // Garante o bucket (privado). Se já existir, o erro é ignorado.
  await supabase.storage.createBucket(BUCKET, { public: false });

  const safeName = (file.name || "contrato.pdf").replace(/[^\w.\-]+/g, "_");
  const path = `${id}/${Date.now()}-${safeName}`;
  const up = await supabase.storage
    .from(BUCKET)
    .upload(path, buf, { contentType: "application/pdf", upsert: true });
  if (up.error) {
    return NextResponse.json(
      { error: `Falha ao guardar o contrato: ${up.error.message}` },
      { status: 502 },
    );
  }

  // Análise da IA (advogado + comercial).
  let analysis;
  try {
    analysis = await analyzeContract({
      pdfBase64: buf.toString("base64"),
      operadora: company.name,
      briefing: company.briefing,
    });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Erro ao analisar o contrato" },
      { status: 502 },
    );
  }

  await supabase
    .from("companies")
    .update({
      contract_path: path,
      contract_name: file.name ?? "contrato.pdf",
      reajuste_parecer: analysis.parecer,
      reajuste_percent: analysis.percentual,
      reajuste_janela: analysis.janela,
    })
    .eq("id", id);

  await supabase.from("activities").insert({
    company_id: id,
    type: "analise",
    description: `Contrato analisado pela IA. Percentual sugerido: ${analysis.percentual}. Janela: ${analysis.janela}.`,
  });

  // Gera o 1º rascunho do pedido de reajuste (com o percentual analisado).
  const updated: Company = {
    ...company,
    reajuste_percent: analysis.percentual,
    reajuste_janela: analysis.janela,
  };
  const { data: seqs } = await supabase
    .from("sequences")
    .select("*")
    .eq("company_id", id)
    .eq("channel", "email");
  const emailSeq = (seqs as Sequence[] | null)?.[0];
  if (emailSeq) {
    await generateDraftForSequence(supabase, updated, emailSeq);
  }

  return NextResponse.json({ ok: true, analysis });
}
