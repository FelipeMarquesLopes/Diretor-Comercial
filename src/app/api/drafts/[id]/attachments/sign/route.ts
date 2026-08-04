import { NextResponse } from "next/server";
import { getServerSupabase } from "@/lib/supabase/server";

const BUCKET = "anexos";

// POST /api/drafts/[id]/attachments/sign  { names: string[] }
// Devolve URLs de upload assinadas — o navegador sobe os documentos direto ao
// Storage (sem limite de tamanho da hospedagem). Depois /attachments registra.
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
  if (names.length > 10) {
    return NextResponse.json({ error: "Máximo de 10 anexos por vez." }, { status: 400 });
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

  const base = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "";
  const uploads: { path: string; signedUrl: string; name: string }[] = [];
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
    const signedUrl = data.signedUrl.startsWith("http")
      ? data.signedUrl
      : `${base}${data.signedUrl}`;
    uploads.push({ path: data.path, signedUrl, name: names[i] });
  }

  return NextResponse.json({ uploads });
}
