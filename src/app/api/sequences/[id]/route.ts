import { NextResponse } from "next/server";
import { getServerSupabase } from "@/lib/supabase/server";

// POST /api/sequences/[id]  { action }
// Muda manualmente o estado da automação de um assunto (o CEO decide quando
// quiser, direto no e-mail enviado):
//   - "seguir":   volta a cobrar a cada 72h (próxima cutucada em 72h).
//   - "standby":  fica parado 30 dias e retoma depois.
//   - "encerrar": encerra de vez (sem mais cobrança).
export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;

  let body: { action?: "seguir" | "standby" | "encerrar" };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Body inválido" }, { status: 400 });
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

  let update: Record<string, unknown>;
  let descricao: string;
  if (body.action === "seguir") {
    const em72h = new Date(Date.now() + 3 * 24 * 60 * 60 * 1000).toISOString();
    update = { status: "ativa", next_action_at: em72h, resume_at: null };
    descricao = "CEO reativou a cobrança (próxima cutucada em 72h).";
  } else if (body.action === "standby") {
    const em30d = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString();
    update = {
      status: "pausada_negativa",
      next_action_at: null,
      resume_at: em30d,
    };
    descricao = "CEO colocou em stand by (retoma em 30 dias).";
  } else if (body.action === "encerrar") {
    update = { status: "encerrada", next_action_at: null };
    descricao = "CEO encerrou o assunto (sem mais cobrança).";
  } else {
    return NextResponse.json({ error: "Ação inválida" }, { status: 400 });
  }

  const { data: seq, error } = await supabase
    .from("sequences")
    .update(update)
    .eq("id", id)
    .select("company_id")
    .single<{ company_id: string }>();
  if (error || !seq) {
    return NextResponse.json(
      { error: error?.message ?? "Sequência não encontrada" },
      { status: 404 },
    );
  }

  await supabase.from("activities").insert({
    company_id: seq.company_id,
    type: "decisao",
    description: descricao,
  });

  return NextResponse.json({ ok: true });
}
