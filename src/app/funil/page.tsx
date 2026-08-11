"use client";

import { useEffect, useState } from "react";
import { CATEGORY_LABELS, type PartnerCategory } from "@/lib/types";

type Etapa = { key: string; label: string; value: number };

export default function Funil() {
  const [etapas, setEtapas] = useState<Etapa[]>([]);
  const [porSeg, setPorSeg] = useState<Record<string, number>>({});
  const [loading, setLoading] = useState(true);
  const [msg, setMsg] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      try {
        const r = await fetch("/api/funnel");
        const d = await r.json();
        if (d.error) setMsg(d.error);
        else {
          setEtapas(d.etapas ?? []);
          setPorSeg(d.parceriasPorSegmento ?? {});
        }
      } catch {
        setMsg("Falha ao carregar o funil.");
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  const topo = etapas[0]?.value || 0;
  const maxBar = Math.max(...etapas.map((e) => e.value), 1);

  return (
    <div className="space-y-5">
      <header>
        <h1 className="text-2xl font-semibold text-brand-800">Funil executivo</h1>
        <p className="text-sm text-brand-800/60">
          Do lead à receita — onde está o gargalo e onde está o dinheiro.
        </p>
      </header>

      {msg && (
        <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-2.5 text-sm text-amber-800">
          {msg}
        </div>
      )}

      {loading ? (
        <p className="text-sm text-brand-800/50">Carregando…</p>
      ) : (
        <>
          {/* Funil em degraus */}
          <div className="space-y-2 rounded-2xl border border-brand-100 bg-white p-5 shadow-card">
            {etapas.map((e, i) => {
              const pctTopo = topo ? Math.round((e.value / topo) * 100) : 0;
              const prev = i > 0 ? etapas[i - 1].value : e.value;
              const conv = prev ? Math.round((e.value / prev) * 100) : 100;
              const width = Math.max(4, Math.round((e.value / maxBar) * 100));
              return (
                <div key={e.key} className="flex items-center gap-3">
                  <div className="w-44 shrink-0 text-sm text-brand-800/70">
                    {e.label}
                  </div>
                  <div className="flex-1">
                    <div
                      className="flex h-8 items-center rounded-lg bg-gradient-to-r from-brand-600 to-brand-400 px-2.5 text-sm font-semibold text-white transition-all"
                      style={{ width: `${width}%` }}
                    >
                      {e.value}
                    </div>
                  </div>
                  <div className="w-28 shrink-0 text-right text-[11px] text-brand-800/50">
                    {i === 0 ? (
                      "100% (topo)"
                    ) : (
                      <>
                        {pctTopo}% do topo
                        <span
                          className={`ml-1 ${conv >= 50 ? "text-emerald-600" : conv >= 20 ? "text-amber-600" : "text-red-500"}`}
                          title="Conversão da etapa anterior"
                        >
                          ({conv}%)
                        </span>
                      </>
                    )}
                  </div>
                </div>
              );
            })}
          </div>

          {/* Onde está o dinheiro: parcerias por segmento */}
          <div className="rounded-2xl border border-brand-100 bg-white p-5 shadow-card">
            <h2 className="mb-3 font-semibold text-brand-800">
              Parcerias ativas por segmento
            </h2>
            {Object.keys(porSeg).length ? (
              <div className="flex flex-wrap gap-2">
                {Object.entries(porSeg)
                  .sort((a, b) => b[1] - a[1])
                  .map(([seg, n]) => (
                    <span
                      key={seg}
                      className="rounded-lg bg-emerald-50 px-3 py-1.5 text-sm text-emerald-800"
                    >
                      <b>{n}</b>{" "}
                      {CATEGORY_LABELS[seg as PartnerCategory] ?? seg}
                    </span>
                  ))}
              </div>
            ) : (
              <p className="text-sm text-brand-800/40">
                Ainda sem parcerias ativas registradas.
              </p>
            )}
          </div>
        </>
      )}
    </div>
  );
}
