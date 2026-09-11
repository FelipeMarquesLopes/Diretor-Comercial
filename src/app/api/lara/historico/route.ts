import { NextResponse } from "next/server";
import { carregarHistorico, limparHistorico } from "@/lib/laraMemory";

// GET /api/lara/historico — devolve as mensagens salvas (para o chat continuar
// de onde parou ao abrir/recarregar a página).
export async function GET() {
  try {
    const mensagens = await carregarHistorico(60);
    return NextResponse.json({ mensagens });
  } catch {
    // Sem memória disponível — chat começa em branco, sem quebrar.
    return NextResponse.json({ mensagens: [] });
  }
}

// DELETE /api/lara/historico — "nova conversa": apaga o histórico (não mexe nos
// fatos de memória de longo prazo).
export async function DELETE() {
  try {
    await limparHistorico();
    return NextResponse.json({ ok: true });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Falha ao limpar" },
      { status: 500 },
    );
  }
}
