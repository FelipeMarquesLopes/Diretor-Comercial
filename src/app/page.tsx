"use client";

import { useEffect, useState } from "react";
import Link from "next/link";

interface Stats {
  empresas: number;
  operadoras: number;
  qualificadas: number;
  contatoIniciado: number;
  emNegociacao: number;
  parcerias: number;
  rascunhosPendentes: number;
  aprovados: number;
  enviados: number;
  aguardandoVoce: number;
}

interface ResponseRow {
  id: string;
  sentiment: "positivo" | "negativo" | "neutro";
  summary: string | null;
  channel: string;
  created_at: string;
  companies: { name: string } | null;
}

export default function Dashboard() {
  const [stats, setStats] = useState<Stats | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [running, setRunning] = useState(false);
  const [runMsg, setRunMsg] = useState<string | null>(null);
  const [responses, setResponses] = useState<ResponseRow[]>([]);

  function loadStats() {
    fetch("/api/stats")
      .then((r) => r.json())
      .then((d) => (d.error ? setError(d.error) : setStats(d)))
      .catch((e) => setError(String(e)));
    fetch("/api/responses")
      .then((r) => r.json())
      .then((d) => setResponses(d.responses ?? []))
      .catch(() => {});
  }

  useEffect(() => {
    loadStats();
  }, []);

  async function runFollowup() {
    setRunning(true);
    setRunMsg(null);
    try {
      const r = await fetch("/api/followup/run", { method: "POST" });
      const d = await r.json();
      if (d.error) setRunMsg(`Erro: ${d.error}`);
      else
        setRunMsg(
          `Pronto: ${d.respostas_lidas ?? 0} resposta(s) lida(s), ` +
            `${d.rascunhos_gerados} novo(s) rascunho(s) de follow-up, ` +
            `${d.reativadas} retomada(s).` +
            (d.positivas?.length
              ? ` 🟢 Positivas: ${d.positivas.join(", ")}.`
              : ""),
        );
      loadStats();
    } catch (e) {
      setRunMsg(String(e));
    } finally {
      setRunning(false);
    }
  }

  if (error) {
    return (
      <div className="rounded-lg border border-amber-200 bg-amber-50 p-4 text-sm text-amber-800">
        <p className="font-medium">Não consegui carregar as métricas.</p>
        <p className="mt-1">{error}</p>
        <p className="mt-2 text-amber-700">
          Verifique se o Supabase está configurado no <code>.env.local</code> e
          se o schema foi criado (veja o README).
        </p>
      </div>
    );
  }

  if (!stats) return <p className="text-gray-500">Carregando…</p>;

  return (
    <div className="space-y-6">
      <section>
        <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-gray-500">
          Ação necessária do CEO
        </h2>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
          <Card
            label="Rascunhos aguardando aprovação"
            value={stats.rascunhosPendentes}
            highlight
            href="/rascunhos"
          />
          <Card
            label="Respostas positivas — você precisa entrar"
            value={stats.aguardandoVoce}
            highlight
          />
          <Card label="Aprovados (prontos p/ disparar)" value={stats.aprovados} />
        </div>
      </section>

      <section>
        <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-gray-500">
          Respostas recebidas
        </h2>
        {responses.length === 0 ? (
          <p className="rounded-lg border border-gray-200 bg-white p-4 text-sm text-gray-500">
            Nenhuma resposta ainda. Quando uma operadora responder, ela aparece
            aqui automaticamente — com o nome e se foi positiva ou negativa.
          </p>
        ) : (
          <div className="space-y-2">
            {responses.map((r) => (
              <div
                key={r.id}
                className="flex items-start gap-3 rounded-lg border border-gray-200 bg-white p-3"
              >
                <span
                  className={`mt-0.5 rounded-full px-2 py-0.5 text-xs font-medium ${
                    r.sentiment === "positivo"
                      ? "bg-green-100 text-green-800"
                      : r.sentiment === "negativo"
                        ? "bg-red-100 text-red-700"
                        : "bg-gray-100 text-gray-600"
                  }`}
                >
                  {r.sentiment === "positivo"
                    ? "🟢 Positivo"
                    : r.sentiment === "negativo"
                      ? "🔴 Negativo"
                      : "⚪ Neutro"}
                </span>
                <div className="min-w-0">
                  <p className="text-sm font-medium text-gray-900">
                    {r.companies?.name ?? "Operadora"}
                    <span className="ml-2 text-xs font-normal text-gray-400">
                      {r.channel === "whatsapp" ? "WhatsApp" : "E-mail"} ·{" "}
                      {new Date(r.created_at).toLocaleDateString("pt-BR")}
                    </span>
                  </p>
                  {r.summary && (
                    <p className="text-xs text-gray-500">{r.summary}</p>
                  )}
                  {r.sentiment === "positivo" && (
                    <p className="text-xs font-medium text-green-700">
                      👉 Hora de você entrar e assumir a conversa!
                    </p>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </section>

      <section className="rounded-lg border border-gray-200 bg-white p-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <p className="text-sm font-medium text-gray-800">
              Motor (respostas + follow-up)
            </p>
            <p className="text-xs text-gray-500">
              Lê as respostas por e-mail, classifica positivo/negativo e prepara
              os próximos follow-ups. Roda sozinho (veja o README para deixar
              online 24/7). Você também pode rodar agora:
            </p>
          </div>
          <button
            onClick={runFollowup}
            disabled={running}
            className="rounded-md bg-brand-500 px-4 py-2 text-sm font-medium text-white hover:bg-brand-600 disabled:opacity-50"
          >
            {running ? "Rodando…" : "Rodar follow-up agora"}
          </button>
        </div>
        {runMsg && <p className="mt-2 text-sm text-gray-600">{runMsg}</p>}
      </section>

      <section>
        <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-gray-500">
          Pipeline de empresas
        </h2>
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-6">
          <Card label="Operadoras" value={stats.operadoras} href="/operadoras" />
          <Card label="Empresas" value={stats.empresas} href="/prospeccao" />
          <Card label="Contato iniciado" value={stats.contatoIniciado} />
          <Card label="Em negociação" value={stats.emNegociacao} />
          <Card label="Enviadas" value={stats.enviados} />
          <Card label="Parcerias ativas" value={stats.parcerias} />
        </div>
      </section>

      <section className="rounded-lg border border-gray-200 bg-white p-4 text-sm text-gray-600">
        <p className="font-medium text-gray-800">Como funciona</p>
        <ol className="mt-2 list-decimal space-y-1 pl-5">
          <li>
            Em <Link href="/prospeccao" className="text-brand-600 underline">Prospecção</Link>,
            busque empresas (100+ funcionários) via Apollo. A IA qualifica automaticamente.
          </li>
          <li>Para uma empresa qualificada, gere um rascunho com um dos ganchos (NR-1, saúde mental, TEA/ABA).</li>
          <li>
            Em <Link href="/rascunhos" className="text-brand-600 underline">Rascunhos</Link>,
            revise, edite se quiser, e aprove. <strong>Nada sai sem sua aprovação.</strong>
          </li>
        </ol>
      </section>
    </div>
  );
}

function Card({
  label,
  value,
  highlight,
  href,
}: {
  label: string;
  value: number;
  highlight?: boolean;
  href?: string;
}) {
  const inner = (
    <div
      className={`rounded-lg border p-4 shadow-sm transition ${
        highlight
          ? "border-brand-300 bg-brand-50"
          : "border-gray-200 bg-white"
      } ${href ? "hover:shadow" : ""}`}
    >
      <p className="text-2xl font-bold text-brand-700">{value}</p>
      <p className="mt-1 text-xs text-gray-500">{label}</p>
    </div>
  );
  return href ? <Link href={href}>{inner}</Link> : inner;
}
