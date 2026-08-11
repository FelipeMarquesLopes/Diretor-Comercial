"use client";

import { useCallback, useEffect, useState } from "react";
import { CATEGORY_LABELS, type PartnerCategory } from "@/lib/types";

type PartnerRow = {
  id: string;
  name: string;
  category: PartnerCategory;
  city: string | null;
  state: string | null;
  status: string;
  is_referral_source: boolean;
  referral_count: number;
};

export default function Encaminhamentos() {
  const [rows, setRows] = useState<PartnerRow[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [msg, setMsg] = useState<string | null>(null);

  // Busca para adicionar um parceiro que ainda não está na lista.
  const [busca, setBusca] = useState("");
  const [resultados, setResultados] = useState<PartnerRow[]>([]);
  const [buscando, setBuscando] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const r = await fetch("/api/referrals");
      const d = await r.json();
      if (d.error) setMsg(d.error);
      else {
        setRows(d.partners ?? []);
        setTotal(d.totalEncaminhamentos ?? 0);
      }
    } catch {
      setMsg("Falha ao carregar.");
    } finally {
      setLoading(false);
    }
  }, []);

  // Busca parceiros por nome (qualquer frente) para incluir na lista.
  useEffect(() => {
    const q = busca.trim();
    if (q.length < 2) {
      setResultados([]);
      return;
    }
    setBuscando(true);
    const t = setTimeout(async () => {
      try {
        const r = await fetch(`/api/companies?q=${encodeURIComponent(q)}`);
        const d = await r.json();
        setResultados((d.companies ?? []).slice(0, 8));
      } catch {
        setResultados([]);
      } finally {
        setBuscando(false);
      }
    }, 300);
    return () => clearTimeout(t);
  }, [busca]);

  async function adicionar(id: string) {
    await fetch(`/api/companies/${id}/referral`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ isSource: true }),
    });
    setBusca("");
    setResultados([]);
    load();
  }

  useEffect(() => {
    load();
  }, [load]);

  async function patch(id: string, payload: { isSource?: boolean; delta?: number }) {
    // Otimista.
    setRows((prev) =>
      prev.map((r) => {
        if (r.id !== id) return r;
        const next = { ...r };
        if (typeof payload.isSource === "boolean")
          next.is_referral_source = payload.isSource;
        if (typeof payload.delta === "number") {
          next.referral_count = Math.max(0, r.referral_count + payload.delta);
          if (next.referral_count > 0) next.is_referral_source = true;
        }
        return next;
      }),
    );
    if (payload.delta)
      setTotal((t) => Math.max(0, t + payload.delta!));
    const r = await fetch(`/api/companies/${id}/referral`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    const d = await r.json().catch(() => ({}));
    if (d.error) {
      setMsg(d.error);
      load();
    }
  }

  const fontes = rows.filter((r) => r.is_referral_source).length;

  return (
    <div className="space-y-5">
      <header>
        <h1 className="text-2xl font-semibold text-brand-800">
          Fontes de encaminhamento
        </h1>
        <p className="text-sm text-brand-800/60">
          Quais parcerias trazem indicações — para focar relacionamento onde há
          retorno. Só a <b>contagem</b> ligada ao parceiro; nenhum dado de paciente.
        </p>
      </header>

      {/* Resumo */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
        <div className="rounded-2xl border border-brand-100 bg-white p-4 shadow-card">
          <div className="text-2xl font-semibold text-brand-800">{total}</div>
          <div className="text-xs text-brand-800/50">encaminhamentos no total</div>
        </div>
        <div className="rounded-2xl border border-brand-100 bg-white p-4 shadow-card">
          <div className="text-2xl font-semibold text-brand-800">{fontes}</div>
          <div className="text-xs text-brand-800/50">parceiros marcados como fonte</div>
        </div>
        <div className="rounded-2xl border border-brand-100 bg-white p-4 shadow-card">
          <div className="text-2xl font-semibold text-brand-800">{rows.length}</div>
          <div className="text-xs text-brand-800/50">parcerias ativas na lista</div>
        </div>
      </div>

      {/* Adicionar um parceiro que ainda não está na lista */}
      <div className="rounded-2xl border border-brand-100 bg-white p-4 shadow-card">
        <span className="mb-1 block text-sm font-medium text-brand-800">
          ＋ Adicionar parceiro que está encaminhando
        </span>
        <p className="mb-2 text-xs text-brand-800/50">
          Um médico, escola, igreja ou empresa já indica pacientes? Busque pelo
          nome e ele entra na lista para você registrar as indicações.
        </p>
        <input
          value={busca}
          onChange={(e) => setBusca(e.target.value)}
          placeholder="Buscar pelo nome do parceiro (ex: Dr. João, Colégio X)…"
          className="w-full rounded-xl border border-brand-200 px-3 py-2 text-sm outline-none focus:border-brand-500"
        />
        {(resultados.length > 0 || (busca.trim().length >= 2 && !buscando)) && (
          <div className="mt-2 divide-y divide-brand-50 overflow-hidden rounded-xl border border-brand-100">
            {resultados.map((c) => (
              <button
                key={c.id}
                onClick={() => adicionar(c.id)}
                className="flex w-full items-center justify-between px-3 py-2 text-left text-sm hover:bg-brand-50"
              >
                <span className="truncate text-brand-800">
                  {c.name}
                  <span className="ml-2 text-xs text-brand-800/40">
                    {CATEGORY_LABELS[c.category] ?? c.category}
                    {[c.city, c.state].filter(Boolean).length
                      ? ` · ${[c.city, c.state].filter(Boolean).join("/")}`
                      : ""}
                  </span>
                </span>
                <span className="shrink-0 text-xs font-medium text-brand-600">
                  adicionar →
                </span>
              </button>
            ))}
            {!resultados.length && busca.trim().length >= 2 && !buscando && (
              <div className="px-3 py-2 text-xs text-brand-800/40">
                Nenhum parceiro encontrado com esse nome. (Ele precisa já existir
                no sistema — cadastre na frente correspondente primeiro.)
              </div>
            )}
          </div>
        )}
      </div>

      {msg && (
        <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-2.5 text-sm text-amber-800">
          {msg}
        </div>
      )}

      <div className="space-y-2">
        {rows.map((r, i) => (
          <div
            key={r.id}
            className="flex items-center gap-3 rounded-xl border border-brand-100 bg-white p-3 shadow-sm"
          >
            <span className="w-6 shrink-0 text-center text-sm font-bold text-brand-800/30">
              {i + 1}
            </span>
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-medium text-brand-800">
                {r.name}
              </p>
              <div className="flex flex-wrap items-center gap-2 text-[11px] text-brand-800/50">
                <span className="rounded bg-brand-50 px-1.5 py-0.5">
                  {CATEGORY_LABELS[r.category] ?? r.category}
                </span>
                {[r.city, r.state].filter(Boolean).join("/") && (
                  <span>{[r.city, r.state].filter(Boolean).join("/")}</span>
                )}
              </div>
            </div>

            {/* Contador de indicações */}
            <div className="flex items-center gap-1.5">
              <button
                onClick={() => patch(r.id, { delta: -1 })}
                disabled={r.referral_count <= 0}
                className="h-7 w-7 rounded-lg border border-brand-200 text-brand-700 hover:bg-brand-50 disabled:opacity-30"
                title="Registrar 1 a menos"
              >
                −
              </button>
              <span className="w-10 text-center text-lg font-semibold text-brand-800">
                {r.referral_count}
              </span>
              <button
                onClick={() => patch(r.id, { delta: 1 })}
                className="h-7 w-7 rounded-lg bg-brand-600 font-bold text-white hover:bg-brand-700"
                title="Registrar 1 encaminhamento"
              >
                +
              </button>
            </div>

            {/* Marcar como fonte */}
            <label className="ml-1 flex shrink-0 items-center gap-1.5 text-xs text-brand-800/60">
              <input
                type="checkbox"
                checked={r.is_referral_source}
                onChange={(e) => patch(r.id, { isSource: e.target.checked })}
                className="h-4 w-4 accent-brand-600"
              />
              fonte
            </label>
          </div>
        ))}
        {!loading && !rows.length && (
          <div className="rounded-xl border border-dashed border-brand-200 px-4 py-10 text-center text-sm text-brand-800/40">
            Ainda não há parcerias ativas nem fontes marcadas. Conforme fechar
            parcerias, elas aparecem aqui para você registrar as indicações.
          </div>
        )}
      </div>
    </div>
  );
}
