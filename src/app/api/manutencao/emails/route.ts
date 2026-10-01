import { NextResponse } from "next/server";
import { getServerSupabase } from "@/lib/supabase/server";
import { revisarBaseEmailsCompleto } from "@/lib/manutencaoBase";

// Revisar e-mails revela no Apollo + verifica — pode demorar. Usamos o tempo
// máximo e fazemos a varredura em lotes até o prazo.
export const maxDuration = 60;

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
    return NextResponse.json({ ok: true, ...r });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Falha na revisão" },
      { status: 500 },
    );
  }
}
