import { NextResponse } from "next/server";
import { getServerSupabase } from "@/lib/supabase/server";
import { revisarBaseEmailsCompleto, contarPendentes } from "@/lib/manutencaoBase";

// Revisar e-mails revela no Apollo + verifica — pode demorar. Usamos o tempo
// máximo e fazemos a varredura em lotes até o prazo.
export const maxDuration = 60;

// Data da ÚLTIMA revisão feita pela Lara = o carimbo mais recente que ela deixou
// nos contatos (email_checked_at). É isso que o painel mostra ("última
// atualização feita pela Lara").
async function ultimaRevisao(
  supabase: ReturnType<typeof getServerSupabase>,
): Promise<string | null> {
  const { data } = await supabase
    .from("contacts")
    .select("email_checked_at")
    .not("email_checked_at", "is", null)
    .order("email_checked_at", { ascending: false })
    .limit(1)
    .maybeSingle<{ email_checked_at: string | null }>();
  return data?.email_checked_at ?? null;
}

// GET /api/manutencao/emails — só a data da última revisão (para o painel).
export async function GET() {
  let supabase: ReturnType<typeof getServerSupabase>;
  try {
    supabase = getServerSupabase();
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Configuração ausente" },
      { status: 500 },
    );
  }
  try {
    return NextResponse.json({
      ultimaRevisao: await ultimaRevisao(supabase),
      pendentes: await contarPendentes(supabase),
    });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Falha" },
      { status: 500 },
    );
  }
}

// POST /api/manutencao/emails   { maxApollo? }
// Dispara AGORA a revisão dos e-mails da base de prospecção das DUAS marcas:
// reverifica os e-mails vencidos, acha substituto no Apollo nos que morreram/
// faltam, troca sozinha e corrige os rascunhos parados. Faz o máximo possível
// numa chamada (lotes dentro de ~45s). Usado pela Lara e por um botão manual.
export async function POST(req: Request) {
  let supabase: ReturnType<typeof getServerSupabase>;
  try {
    supabase = getServerSupabase();
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Configuração ausente" },
      { status: 500 },
    );
  }

  let body: { maxApollo?: number } = {};
  try {
    body = await req.json();
  } catch {
    // corpo opcional
  }

  try {
    const r = await revisarBaseEmailsCompleto(supabase, {
      deadlineMs: 45_000,
      maxApollo: Math.min(Math.max(body.maxApollo ?? 25, 0), 60),
    });
    return NextResponse.json({ ok: true, ...r, ultimaRevisao: await ultimaRevisao(supabase) });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Falha na revisão" },
      { status: 500 },
    );
  }
}
