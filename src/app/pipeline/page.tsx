"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import type { Company, Contact } from "@/lib/types";
import {
  PIPELINES,
  PIPELINE_LABELS,
  resolveStageId,
  type PipelineCategory,
} from "@/lib/pipelines";

type Row = Company & { contacts: Contact[] };

const CATEGORIES = Object.keys(PIPELINES) as PipelineCategory[];

export default function Pipeline() {
  const [category, setCategory] = useState<PipelineCategory>("operadora");
  const [rows, setRows] = useState<Row[]>([]);
  const [loading, setLoading] = useState(true);
  const [msg, setMsg] = useState<string | null>(null);
  const [dragId, setDragId] = useState<string | null>(null);

  const stages = PIPELINES[category];

  const load = useCallback(async () => {
    setLoading(true);
    setMsg(null);
    try {
      const r = await fetch(`/api/companies?category=${category}`);
      const d = await r.json();
      if (d.error) setMsg(d.error);
      else setRows(d.companies ?? []);
    } catch {
      setMsg("Falha ao carregar o pipeline.");
    } finally {
      setLoading(false);
    }
  }, [category]);

  useEffect(() => {
    load();
  }, [load]);

  // Agrupa os cards por estágio efetivo (explícito ou derivado do status).
  const byStage = useMemo(() => {
    const map: Record<string, Row[]> = {};
    for (const s of stages) map[s.id] = [];
    const outros: Row[] = [];
    for (const row of rows) {
      if (row.status === "descartado") continue; // fora do board
      const sid = resolveStageId(category, row.stage, row.status);
      if (sid && map[sid]) map[sid].push(row);
      else outros.push(row);
    }
    if (outros.length && stages[0]) map[stages[0].id].push(...outros);
    return map;
  }, [rows, stages, category]);

  async function moveTo(id: string, stageId: string) {
    // Otimista: atualiza local antes da resposta.
    setRows((prev) =>
      prev.map((r) => (r.id === id ? { ...r, stage: stageId } : r)),
    );
    try {
      const r = await fetch(`/api/companies/${id}/stage`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ stage: stageId }),
      });
      const d = await r.json();
      if (d.error) {
        setMsg(d.error);
        load(); // reverte para o estado real
      } else {
        // Sincroniza status reconciliado sem recarregar tudo.
        setRows((prev) =>
          prev.map((x) => (x.id === id ? { ...x, status: d.status, stage: d.stage } : x)),
        );
      }
    } catch {
      setMsg("Falha ao mover o card.");
      load();
    }
  }

  const total = rows.filter((r) => r.status !== "descartado").length;

  return (
    <div className="space-y-5">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold text-brand-800">Pipeline</h1>
          <p className="text-sm text-brand-800/60">
            Conduza cada negociação até o fim. Arraste o card ou use as setas para
            avançar o estágio — o funil geral é atualizado sozinho.
          </p>
        </div>
        <div className="text-sm text-brand-800/60">
          {loading ? "Carregando…" : `${total} em jogo`}
        </div>
      </header>

      {/* Abas por segmento */}
      <div className="flex flex-wrap gap-1 rounded-2xl border border-brand-100 bg-white p-1.5 shadow-card">
        {CATEGORIES.map((c) => {
          const active = c === category;
          return (
            <button
              key={c}
              onClick={() => setCategory(c)}
              className={`rounded-xl px-3.5 py-2 text-sm font-medium transition-all ${
                active
                  ? "bg-brand-600 text-white shadow-[0_4px_12px_-4px_rgba(38,44,102,0.5)]"
                  : "text-brand-800/70 hover:bg-brand-50 hover:text-brand-800"
              }`}
            >
              {PIPELINE_LABELS[c]}
            </button>
          );
        })}
      </div>

      {msg && (
        <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-2.5 text-sm text-amber-800">
          {msg}
        </div>
      )}

      {/* Board */}
      <div className="flex gap-3 overflow-x-auto pb-2">
        {stages.map((stage, i) => {
          const cards = byStage[stage.id] ?? [];
          return (
            <div
              key={stage.id}
              onDragOver={(e) => {
                if (dragId) e.preventDefault();
              }}
              onDrop={() => {
                if (dragId) moveTo(dragId, stage.id);
                setDragId(null);
              }}
              className={`flex w-72 shrink-0 flex-col rounded-2xl border p-2.5 ${
                stage.won
                  ? "border-emerald-200 bg-emerald-50/40"
                  : "border-brand-100 bg-brand-50/40"
              }`}
            >
              <div className="flex items-center justify-between px-1 pb-2">
                <span
                  className={`text-sm font-semibold ${
                    stage.won ? "text-emerald-700" : "text-brand-800"
                  }`}
                >
                  {stage.label}
                </span>
                <span className="rounded-full bg-white px-2 py-0.5 text-xs font-medium text-brand-800/60 shadow-sm">
                  {cards.length}
                </span>
              </div>

              <div className="flex flex-col gap-2">
                {cards.map((c) => (
                  <PipelineCard
                    key={c.id}
                    row={c}
                    canBack={i > 0}
                    canFwd={i < stages.length - 1}
                    onBack={() => moveTo(c.id, stages[i - 1].id)}
                    onFwd={() => moveTo(c.id, stages[i + 1].id)}
                    onDragStart={() => setDragId(c.id)}
                    onDragEnd={() => setDragId(null)}
                  />
                ))}
                {!cards.length && (
                  <div className="rounded-xl border border-dashed border-brand-200 px-3 py-6 text-center text-xs text-brand-800/40">
                    Vazio
                  </div>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function PipelineCard({
  row,
  canBack,
  canFwd,
  onBack,
  onFwd,
  onDragStart,
  onDragEnd,
}: {
  row: Row;
  canBack: boolean;
  canFwd: boolean;
  onBack: () => void;
  onFwd: () => void;
  onDragStart: () => void;
  onDragEnd: () => void;
}) {
  const region = [row.city, row.state].filter(Boolean).join(" · ");
  const validos = (row.contacts ?? []).filter((c) => c.email_verdict === "valid").length;
  return (
    <div
      draggable
      onDragStart={onDragStart}
      onDragEnd={onDragEnd}
      className="group cursor-grab rounded-xl border border-brand-100 bg-white p-3 shadow-sm transition-shadow hover:shadow-card active:cursor-grabbing"
    >
      <div className="flex items-start justify-between gap-2">
        <span className="text-sm font-semibold leading-tight text-brand-800">
          {row.name}
        </span>
        {row.priority >= 4 && (
          <span className="shrink-0 rounded-full bg-amber-100 px-1.5 py-0.5 text-[10px] font-bold text-amber-700">
            P{row.priority}
          </span>
        )}
      </div>
      {region && <p className="mt-0.5 text-xs text-brand-800/50">{region}</p>}

      <div className="mt-2 flex items-center gap-2 text-[11px] text-brand-800/50">
        <span className="rounded bg-brand-50 px-1.5 py-0.5">
          score {row.qualification_score}
        </span>
        {validos > 0 && (
          <span className="rounded bg-emerald-50 px-1.5 py-0.5 text-emerald-700">
            {validos} e-mail{validos > 1 ? "s" : ""} ✓
          </span>
        )}
      </div>

      <div className="mt-2.5 flex items-center justify-between opacity-60 transition-opacity group-hover:opacity-100">
        <button
          disabled={!canBack}
          onClick={onBack}
          title="Voltar estágio"
          className="rounded-lg px-2 py-1 text-sm text-brand-800/70 hover:bg-brand-50 disabled:opacity-30"
        >
          ←
        </button>
        <button
          disabled={!canFwd}
          onClick={onFwd}
          title="Avançar estágio"
          className="rounded-lg px-2 py-1 text-sm font-medium text-brand-600 hover:bg-brand-50 disabled:opacity-30"
        >
          Avançar →
        </button>
      </div>
    </div>
  );
}
