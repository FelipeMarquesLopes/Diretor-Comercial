import { NextResponse } from "next/server";
import { getServerSupabase } from "@/lib/supabase/server";

const BUCKET = "contratos";

// POST /api/reajustes/[id]/contract/sign   body: { names: string[] }
// Garante o bucket privado e devolve URLs de upload ASSINADAS — o navegador
// sobe os PDFs direto ao Storage (sem passar pela hospedagem, sem limite de
// ~4,5 MB). Depois chama /contract com os caminhos para a IA analisar.
export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;

  let body: { names?: string[] };
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
      { error: "Máximo de 15 arquivos por análise." },
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

  // Garante o bucket (privado). Se já existir, o erro é ignorado.
  await supabase.storage.createBucket(BUCKET, { public: false });

  const uploads: { path: string; token: string; name: string }[] = [];
  for (let i = 0; i < names.length; i++) {
    const safe = names[i].replace(/[^\w.\-]+/g, "_");
    const path = `${id}/${Date.now()}-${i}-${safe}`;
    const { data, error } = await supabase.storage
      .from(BUCKET)
      .createSignedUploadUrl(path);
    if (error || !data) {
      return NextResponse.json(
        { error: `Falha ao preparar upload de "${names[i]}".` },
        { status: 502 },
      );
    }
    uploads.push({ path: data.path, token: data.token, name: names[i] });
  }

  return NextResponse.json({ uploads });
}
