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
    .select("*, companies(name, category, reajuste_ativo)")
    .eq("brand", brand)
    .order("created_at", { ascending: false })
    .limit(500);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const contratos = (data ?? []).map((c) => ({
    ...c,
    parceiro: (c.companies as { name?: string } | null)?.name ?? null,
    categoria: (c.companies as { category?: string } | null)?.category ?? null,
    em_reajuste:
      (c.companies as { reajuste_ativo?: boolean } | null)?.reajuste_ativo ?? false,
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
    newName?: string; // criar parceiro credenciado na hora (fora da prospecção)
    email?: string; // contato de credenciamento (para o reajuste depois)
    contactName?: string;
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
  if (!body.companyId && !body.newName?.trim()) {
    return NextResponse.json(
      { error: "Informe o parceiro (existente) ou o nome do novo parceiro." },
      { status: 400 },
    );
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

  // Resolve o parceiro: usa o existente OU cria um CREDENCIADO na hora (fora da
  // prospecção — contract_only=true, já parceria ativa, sem automação).
  let company: { id: string; name: string } | null = null;
  if (body.companyId) {
    const { data } = await supabase
      .from("companies")
      .select("id, name")
      .eq("id", body.companyId)
      .single<{ id: string; name: string }>();
    company = data ?? null;
  } else if (body.newName?.trim()) {
    const nome = body.newName.trim();
    // Evita DUPLICAR: se já existe um CREDENCIADO com esse nome exato na marca,
    // usa o existente. Não toca nos registros de prospecção (mundos separados).
    const { data: existente } = await supabase
      .from("companies")
      .select("id, name")
      .eq("brand", brand)
      .eq("contract_only", true)
      .ilike("name", nome)
      .limit(1)
      .maybeSingle<{ id: string; name: string }>();
    if (existente) {
      company = existente;
      // Se informou e-mail e o parceiro não tem contato com e-mail, adiciona.
      if (body.email?.trim()) {
        const { data: temContato } = await supabase
          .from("contacts")
          .select("id")
          .eq("company_id", existente.id)
          .not("email", "is", null)
          .limit(1);
        if (!temContato || temContato.length === 0) {
          await supabase.from("contacts").insert({
            company_id: existente.id,
            name: body.contactName?.trim() || existente.name,
            email: body.email.trim(),
            is_decision_maker: true,
          });
        }
      }
    } else {
      const { data, error: cErr } = await supabase
        .from("companies")
        .insert({
          name: nome,
          brand,
          category: "operadora",
          contract_only: true, // credenciado — não entra na prospecção/automação
          status: "parceria_ativa",
          qualified: true,
          commercial_thesis: "credenciada",
          notes: "Parceiro credenciado (banco de contratos).",
        })
        .select("id, name")
        .single<{ id: string; name: string }>();
      if (cErr || !data) {
        return NextResponse.json(
          { error: cErr?.message ?? "Não consegui criar o parceiro." },
          { status: 500 },
        );
      }
      company = data;
      if (body.email?.trim()) {
        await supabase.from("contacts").insert({
          company_id: company.id,
          name: body.contactName?.trim() || company.name,
          email: body.email.trim(),
          is_decision_maker: true,
        });
      }
    }
  }
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
