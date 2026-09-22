import { NextResponse } from "next/server";
import { getServerSupabase } from "@/lib/supabase/server";

const BUCKET = "contratos";

// POST /api/contratos/sign   body: { names: string[], companyId?: string }
// Devolve URLs de upload ASSINADAS — o navegador sobe os PDFs direto ao Storage
// (bucket privado 'contratos'), sem limite de ~4,5 MB. Depois chama /contratos
// com os caminhos para a IA analisar e registrar o contrato.
export async function POST(req: Request) {
  let body: { names?: string[]; companyId?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Body inválido" }, { status: 400 });
  }
  const names = (body.names ?? []).filter((n) => typeof n === "string");
  if (names.length === 0) {
    return NextResponse.json({ error: "Nenhum arquivo informado." }, { status: 400 });
  }
  if (names.length > 15) {
    return NextResponse.json(
      { error: "Máximo de 15 arquivos por contrato." },
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

  await supabase.storage.createBucket(BUCKET, { public: false });

  const prefixo = (body.companyId ?? "geral").replace(/[^\w.\-]+/g, "_");
  const base = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "";
  const uploads: { path: string; signedUrl: string; name: string }[] = [];
  for (let i = 0; i < names.length; i++) {
    const safe = names[i].replace(/[^\w.\-]+/g, "_");
    const path = `${prefixo}/${Date.now()}-${i}-${safe}`;
    const { data, error } = await supabase.storage
      .from(BUCKET)
      .createSignedUploadUrl(path);
    if (error || !data) {
      return NextResponse.json(
        { error: `Falha ao preparar upload de "${names[i]}".` },
        { status: 502 },
      );
    }
    const signedUrl = data.signedUrl.startsWith("http")
      ? data.signedUrl
      : `${base}${data.signedUrl}`;
    uploads.push({ path: data.path, signedUrl, name: names[i] });
  }

  return NextResponse.json({ uploads });
}
