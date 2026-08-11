"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { CATEGORY_LABELS, type PartnerCategory } from "@/lib/types";

type UnitAgg = {
  id: string;
  name: string;
  cities: string[];
  total: number;
  parcerias: number;
  porCategoria: Record<string, number>;
};

// Ordem dos segmentos nos cartões.
const SEG_ORDER: PartnerCategory[] = [
  "empresa",
  "operadora",
  "medico",
  "escola",
  "igreja",
];

export default function Territorio() {
  const [unidades, setUnidades] = useState<UnitAgg[]>([]);
  const [fora, setFora] = useState<UnitAgg | null>(null);
  const [loading, setLoading] = useState(true);
  const [msg, setMsg] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      try {
        const r = await fetch("/api/territory");
        const d = await r.json();
        if (d.error) setMsg(d.error);
        else {
          setUnidades(d.unidades ?? []);
          setFora(d.foraDeArea ? { ...d.foraDeArea, id: "fora", name: "Fora das regiões", cities: [] } : null);
        }
      } catch {
        setMsg("Falha ao carregar o mapa.");
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  return (
    <div className="space-y-5">
      <header>
        <h1 className="text-2xl font-semibold text-brand-800">
          Mapa de expansão por unidade
        </h1>
        <p className="text-sm text-brand-800/60">
          Onde estão os leads em torno de cada unidade — proximidade traz
          paciente com mais facilidade. Clique para prospectar mais naquela região.
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
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
          {unidades.map((u) => (
            <div
              key={u.id}
              className="rounded-2xl border border-brand-100 bg-white p-4 shadow-card"
            >
              <div className="flex items-start justify-between gap-3">
                <div>
                  <h2 className="font-semibold text-brand-800">
                    {u.name.replace("MenthalHelp — ", "📍 ")}
                  </h2>
                  <p className="mt-0.5 text-[11px] text-brand-800/40">
                    {u.cities.join(" · ")}
                  </p>
                </div>
                <div className="text-right">
                  <div className="text-2xl font-semibold text-brand-800">
                    {u.total}
                  </div>
                  <div className="text-[11px] text-brand-800/50">leads</div>
                </div>
              </div>

              {/* Quebra por segmento */}
              <div className="mt-3 flex flex-wrap gap-2">
                {SEG_ORDER.map((seg) => {
                  const n = u.porCategoria[seg] ?? 0;
                  if (!n) return null;
                  return (
                    <span
                      key={seg}
                      className="rounded-lg bg-brand-50 px-2 py-1 text-xs text-brand-800"
                    >
                      <b>{n}</b> {CATEGORY_LABELS[seg] ?? seg}
                      {n > 1 ? "s" : ""}
                    </span>
                  );
                })}
                {u.total === 0 && (
                  <span className="text-xs text-brand-800/40">
                    Sem leads nesta região ainda.
                  </span>
                )}
              </div>

              <div className="mt-3 flex items-center justify-between border-t border-brand-50 pt-3">
                <span className="text-xs text-brand-800/50">
                  {u.parcerias} parceria{u.parcerias !== 1 ? "s" : ""} ativa
                  {u.parcerias !== 1 ? "s" : ""}
                </span>
                <Link
                  href="/prospeccao"
                  className="rounded-lg bg-brand-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-brand-700"
                >
                  Prospectar nesta região →
                </Link>
              </div>
            </div>
          ))}

          {fora && fora.total > 0 && (
            <div className="rounded-2xl border border-dashed border-brand-200 bg-brand-50/30 p-4 md:col-span-2">
              <div className="flex items-center justify-between">
                <span className="text-sm font-medium text-brand-800/70">
                  Fora das regiões das unidades
                </span>
                <span className="text-lg font-semibold text-brand-800/60">
                  {fora.total} leads
                </span>
              </div>
              <p className="mt-1 text-xs text-brand-800/40">
                Leads em outras localidades. Continuam válidos — só ficam mais
                longe de uma unidade para o relacionamento presencial.
              </p>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
