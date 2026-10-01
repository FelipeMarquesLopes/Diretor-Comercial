import { NextResponse } from "next/server";
import { getServerSupabase } from "@/lib/supabase/server";
import { revisarBaseEmails } from "@/lib/manutencaoBase";

// Revisar e-mails revela no Apollo + verifica — pode demorar.
export const maxDuration = 60;

// POST /api/manutencao/emails   { max?, maxApollo? }
// Dispara um LOTE da revisão mensal dos e-mails da base de prospecção:
// reverifica os e-mails vencidos e, nos que morreram, acha um substituto no
// Apollo e troca sozinha. Usado pela Lara (sob demanda) e por um botão manual.
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

  let body: { max?: number; maxApollo?: number } = {};
  try {
    body = await req.json();
  } catch {
    // corpo opcional
  }

  try {
    const r = await revisarBaseEmails(supabase, {
      max: Math.min(Math.max(body.max ?? 40, 1), 80),
      maxApollo: Math.min(Math.max(body.maxApollo ?? 12, 0), 25),
    });
    return NextResponse.json({ ok: true, ...r });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Falha na revisão" },
      { status: 500 },
    );
  }
}
