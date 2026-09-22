import { NextResponse } from "next/server";
import { getServerSupabase } from "@/lib/supabase/server";
import { analyzeContract } from "@/lib/anthropic";
import { brandFromRequest } from "@/lib/brands";

export const maxDuration = 60;
const BUCKET = "contratos";

// Um contrato tem 12+ meses de vínculo?
function elegivelReajuste(dataInicio: string | null): boolean {
  if (!dataInicio) return false;
  const d = new Date(dataInicio);
  if (isNaN(d.getTime())) return false;
  const limite = new Date();
  limite.setMonth(limite.getMonth() - 12);
  return d.getTime() <= limite.getTime();
}

// GET /api/contratos — lista os contratos da marca ativa (com o parceiro e se
// já está elegível a reajuste, ou seja, 12+ meses de vínculo).
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

  const { data, error } = await supabase
    .from("contracts")
    .select("*, companies(name, category)")
    .eq("brand", brand)
    .order("created_at", { ascending: false })
    .limit(500);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const contratos = (data ?? []).map((c) => ({
    ...c,
    parceiro: (c.companies as { name?: string } | null)?.name ?? null,
    categoria: (c.companies as { category?: string } | null)?.category ?? null,
    elegivel: elegivelReajuste(c.data_inicio as string | null),
  }));
  return NextResponse.json({ contratos });
}

// POST /api/contratos   { companyId, paths: string[], names: string[], notes? }
// Os PDFs já subiram ao Storage (via /contratos/sign). Aqui a IA lê os
// documentos, extrai a DATA DE INÍCIO + a cláusula de reajuste, e registra o
// contrato vinculado ao parceiro, na marca ativa.
export async function POST(req: Request) {
  const brand = brandFromRequest(req);
  let body: {
    companyId?: string;
    paths?: string[];
    names?: string[];
    notes?: string;
  };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Body inválido" }, { status: 400 });
  }
  const paths = (body.paths ?? []).filter((p) => typeof p === "string");
  const names = body.names ?? [];
  if (!body.companyId) {
    return NextResponse.json({ error: "Escolha o parceiro do contrato." }, { status: 400 });
  }
  if (paths.length === 0) {
    return NextResponse.json({ error: "Nenhum arquivo enviado." }, { status: 400 });
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
    .select("id, name")
    .eq("id", body.companyId)
    .single<{ id: string; name: string }>();
  if (!company) {
    return NextResponse.json({ error: "Parceiro não encontrado." }, { status: 404 });
  }

  // Baixa os PDFs do Storage e passa para a IA analisar.
  const pdfs: { base64: string; name: string }[] = [];
  for (let i = 0; i < paths.length; i++) {
    const { data } = await supabase.storage.from(BUCKET).download(paths[i]);
    if (data) {
      const buf = Buffer.from(await data.arrayBuffer());
      pdfs.push({ base64: buf.toString("base64"), name: names[i] ?? `documento ${i + 1}` });
    }
  }

  let analise: Awaited<ReturnType<typeof analyzeContract>> | null = null;
  if (pdfs.length > 0) {
    try {
      analise = await analyzeContract({ pdfs, operadora: company.name });
    } catch {
      analise = null; // registra o contrato mesmo sem a IA (você preenche depois)
    }
  }

  const files = paths.map((p, i) => ({ path: p, name: names[i] ?? `documento ${i + 1}` }));
  const dataInicio =
    analise?.dataInicio && /^\d{4}-\d{2}-\d{2}$/.test(analise.dataInicio)
      ? analise.dataInicio
      : null;

  const { data: contrato, error } = await supabase
    .from("contracts")
    .insert({
      company_id: company.id,
      brand,
      files,
      data_inicio: dataInicio,
      clausula: analise?.clausula ?? null,
      indice: analise?.percentual ?? null,
      janela: analise?.janela ?? null,
      parecer: analise?.parecer ?? null,
      notes: body.notes?.trim() || null,
    })
    .select()
    .single();
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  await supabase.from("activities").insert({
    company_id: company.id,
    type: "cadastro",
    description: `Contrato anexado (${files.length} arquivo(s))${dataInicio ? ` — início ${dataInicio}` : ""}.`,
  });

  return NextResponse.json({ contrato, analiseOk: Boolean(analise) });
}
