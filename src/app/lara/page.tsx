"use client";

import { useEffect, useRef, useState } from "react";

type Msg = { role: "user" | "assistant"; content: string; acoes?: string[] };

const SUGESTOES = [
  "Como está o funil hoje?",
  "Quantos rascunhos pendentes eu tenho?",
  "Cria uma tarefa: ligar pra SCSBP amanhã",
  "Busca novas licitações em Guarulhos",
  "Prospecta sindicatos de metalúrgicos em SP",
];

export default function Lara() {
  const [msgs, setMsgs] = useState<Msg[]>([
    {
      role: "assistant",
      content:
        "Oi, Felipe! Sou a Lara, sua assistente aqui no Growth AI. Posso consultar o funil, prospectar, buscar licitações, criar tarefas e preparar rascunhos — é só pedir. (Lembrando: e-mail eu preparo, mas o envio é sempre o seu clique final.)",
    },
  ]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const fimRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    fimRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [msgs, loading]);

  async function enviar(texto: string) {
    const t = texto.trim();
    if (!t || loading) return;
    const novo: Msg[] = [...msgs, { role: "user", content: t }];
    setMsgs(novo);
    setInput("");
    setLoading(true);
    try {
      // Envia só o histórico de conversa (user/assistant), sem a saudação inicial.
      const historico = novo
        .filter((_, i) => i > 0)
        .map((m) => ({ role: m.role, content: m.content }));
      const r = await fetch("/api/lara", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ messages: historico }),
      });
      const d = await r.json().catch(() => ({}));
      if (d.error) {
        setMsgs((m) => [
          ...m,
          { role: "assistant", content: `Ops, deu um erro: ${d.error}` },
        ]);
      } else {
        setMsgs((m) => [
          ...m,
          { role: "assistant", content: d.reply, acoes: d.acoes },
        ]);
      }
    } catch (e) {
      setMsgs((m) => [
        ...m,
        { role: "assistant", content: `Falha de conexão: ${String(e)}` },
      ]);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="mx-auto flex h-[calc(100vh-2rem)] max-w-2xl flex-col">
      <header className="mb-3 flex items-center gap-3">
        <div className="flex h-10 w-10 items-center justify-center rounded-full bg-gradient-to-br from-brand-500 to-purple-500 text-lg font-semibold text-white">
          L
        </div>
        <div>
          <h1 className="text-lg font-semibold text-brand-800">Lara</h1>
          <p className="text-xs text-brand-800/50">
            Sua assistente no Growth AI — peça o que precisar
          </p>
        </div>
      </header>

      <div className="flex-1 space-y-3 overflow-y-auto rounded-2xl border border-brand-100 bg-white p-4 shadow-card">
        {msgs.map((m, i) => (
          <div
            key={i}
            className={`flex ${m.role === "user" ? "justify-end" : "justify-start"}`}
          >
            <div
              className={`max-w-[85%] whitespace-pre-wrap rounded-2xl px-3.5 py-2 text-sm ${
                m.role === "user"
                  ? "bg-brand-600 text-white"
                  : "bg-brand-50 text-brand-900"
              }`}
            >
              {m.content}
              {m.acoes && m.acoes.length > 0 && (
                <div className="mt-1.5 flex flex-wrap gap-1">
                  {Array.from(new Set(m.acoes)).map((a) => (
                    <span
                      key={a}
                      className="rounded-full bg-white/70 px-1.5 py-0.5 text-[10px] font-medium text-brand-700"
                    >
                      🔧 {a}
                    </span>
                  ))}
                </div>
              )}
            </div>
          </div>
        ))}
        {loading && (
          <div className="flex justify-start">
            <div className="rounded-2xl bg-brand-50 px-3.5 py-2 text-sm text-brand-800/60">
              Lara está trabalhando…
            </div>
          </div>
        )}
        <div ref={fimRef} />
      </div>

      {msgs.length <= 1 && (
        <div className="mt-2 flex flex-wrap gap-2">
          {SUGESTOES.map((s) => (
            <button
              key={s}
              onClick={() => enviar(s)}
              className="rounded-full border border-brand-200 bg-white px-3 py-1 text-xs text-brand-700 hover:bg-brand-50"
            >
              {s}
            </button>
          ))}
        </div>
      )}

      <form
        onSubmit={(e) => {
          e.preventDefault();
          enviar(input);
        }}
        className="mt-2 flex items-center gap-2"
      >
        <input
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder="Peça algo à Lara…"
          disabled={loading}
          className="flex-1 rounded-full border border-brand-200 px-4 py-2.5 text-sm outline-none focus:border-brand-500 disabled:opacity-60"
        />
        <button
          type="submit"
          disabled={loading || !input.trim()}
          className="rounded-full bg-brand-600 px-4 py-2.5 text-sm font-medium text-white hover:bg-brand-700 disabled:opacity-50"
        >
          Enviar
        </button>
      </form>
    </div>
  );
}
