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
  // Aceita 1 ou vários arquivos (contrato original + adendos/aditivos).
  const files = [
    ...form.getAll("files"),
    ...form.getAll("file"),
  ].filter((f): f is File => f instanceof File);
  if (files.length === 0) {
    return NextResponse.json(
      { error: "Anexe pelo menos um contrato (PDF)." },
      { status: 400 },
    );
  }
  for (const f of files) {
    if (f.type && !f.type.toLowerCase().includes("pdf")) {
      return NextResponse.json(
        { error: `"${f.name}" não é PDF. Anexe apenas PDFs.` },
        { status: 400 },
      );
    }
  }

  const docs: { buf: Buffer; name: string }[] = [];
  let total = 0;
  for (const f of files) {
    const buf = Buffer.from(await f.arrayBuffer());
    total += buf.length;
    docs.push({ buf, name: f.name || "contrato.pdf" });
  }
  if (total > 25 * 1024 * 1024) {
    return NextResponse.json(
      { error: "Os PDFs somados estão muito grandes (máx. ~25 MB no total)." },
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

  const paths: string[] = [];
  for (const d of docs) {
    const safeName = d.name.replace(/[^\w.\-]+/g, "_");
    const path = `${id}/${Date.now()}-${safeName}`;
    const up = await supabase.storage
      .from(BUCKET)
      .upload(path, d.buf, { contentType: "application/pdf", upsert: true });
    if (up.error) {
      return NextResponse.json(
        { error: `Falha ao guardar "${d.name}": ${up.error.message}` },
        { status: 502 },
      );
    }
    paths.push(path);
  }

  // Análise da IA (advogado + comercial) com TODOS os documentos juntos.
  let analysis;
  try {
    analysis = await analyzeContract({
      pdfs: docs.map((d) => ({ base64: d.buf.toString("base64"), name: d.name })),
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
