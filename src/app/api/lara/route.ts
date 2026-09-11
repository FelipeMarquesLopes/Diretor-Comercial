import { NextResponse } from "next/server";
import { runLara, type LaraTurn, type LaraAnexo } from "@/lib/lara";
import {
  carregarHistorico,
  historicoParaTurnos,
  salvarMensagem,
} from "@/lib/laraMemory";

// A Lara pode encadear várias ferramentas (Apollo, PNCP, IA) — dá folga.
export const maxDuration = 60;

// POST /api/lara
//   Novo formato:  { message: { content, anexos? } }  (o servidor carrega o
//                  histórico do banco e persiste a conversa — memória)
//   Compat antigo: { messages: [{role, content, anexos?}] }  (sem persistência)
//
// Ela age com as credenciais do CEO: pegamos o cabeçalho de autenticação desta
// requisição (o navegador já o envia por causa do login básico) e repassamos às
// ferramentas.
export async function POST(req: Request) {
  let body: {
    message?: { content?: string; anexos?: LaraAnexo[] };
    messages?: LaraTurn[];
  };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Body inválido" }, { status: 400 });
  }

  const origin = new URL(req.url).origin;
  const auth = req.headers.get("authorization");

  try {
    // --- Formato NOVO: uma mensagem; o servidor guarda a memória. ---
    if (body.message && typeof body.message.content !== "undefined") {
      const content = String(body.message.content ?? "").trim();
      const anexos = Array.isArray(body.message.anexos)
        ? body.message.anexos
        : undefined;
      if (!content && (!anexos || anexos.length === 0)) {
        return NextResponse.json({ error: "Mensagem vazia." }, { status: 400 });
      }

      const historico = historicoParaTurnos(await carregarHistorico(40));
      const atual: LaraTurn = { role: "user", content, anexos };
      const turns = [...historico, atual];

      const result = await runLara({ origin, auth }, turns);

      // Persiste a troca (o anexo é salvo só como nome/tipo, sem base64).
      await salvarMensagem({ role: "user", content, anexos });
      await salvarMensagem({
        role: "assistant",
        content: result.reply,
        acoes: result.acoes,
      });

      return NextResponse.json(result);
    }

    // --- Compat: histórico completo enviado pelo cliente (sem persistir). ---
    const turns = Array.isArray(body.messages) ? body.messages : [];
    if (turns.length === 0) {
      return NextResponse.json({ error: "Sem mensagens." }, { status: 400 });
    }
    const result = await runLara({ origin, auth }, turns);
    return NextResponse.json(result);
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Erro na Lara" },
      { status: 500 },
    );
  }
}
