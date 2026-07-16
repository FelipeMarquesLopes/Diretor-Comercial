"use client";

import { useEffect, useState } from "react";
import Link from "next/link";

interface Stats {
  empresas: number;
  qualificadas: number;
  contatoIniciado: number;
  emNegociacao: number;
  parcerias: number;
  rascunhosPendentes: number;
  aprovados: number;
  enviados: number;
}

export default function Dashboard() {
  const [stats, setStats] = useState<Stats | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetch("/api/stats")
      .then((r) => r.json())
      .then((d) => (d.error ? setError(d.error) : setStats(d)))
      .catch((e) => setError(String(e)));
  }, []);

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
          <Card label="Aprovados (prontos p/ disparar)" value={stats.aprovados} />
          <Card label="Em negociação" value={stats.emNegociacao} />
        </div>
      </section>

      <section>
        <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-gray-500">
          Pipeline de empresas
        </h2>
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-5">
          <Card label="Mapeadas" value={stats.empresas} />
          <Card label="Qualificadas" value={stats.qualificadas} href="/prospeccao" />
          <Card label="Contato iniciado" value={stats.contatoIniciado} />
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
