import { NextResponse } from "next/server";
import { runLara, type LaraTurn } from "@/lib/lara";

// A Lara pode encadear várias ferramentas (Apollo, PNCP, IA) — dá folga.
export const maxDuration = 60;

// POST /api/lara  { messages: [{role, content}] }
// Roda um turno da assistente Lara. Ela age com as credenciais do CEO: pegamos
// o cabeçalho de autenticação desta requisição (o navegador já o envia por
// causa do login básico) e repassamos às ferramentas.
export async function POST(req: Request) {
  let body: { messages?: LaraTurn[] };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Body inválido" }, { status: 400 });
  }
  const turns = Array.isArray(body.messages) ? body.messages : [];
  if (turns.length === 0) {
    return NextResponse.json({ error: "Sem mensagens." }, { status: 400 });
  }

  const origin = new URL(req.url).origin;
  const auth = req.headers.get("authorization");

  try {
    const result = await runLara({ origin, auth }, turns);
    return NextResponse.json(result);
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Erro na Lara" },
      { status: 500 },
    );
  }
}
