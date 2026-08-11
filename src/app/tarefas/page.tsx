"use client";

import { useCallback, useEffect, useState } from "react";
import { AUTONOMY_LABELS, type AutonomyLevel } from "@/lib/governance";

type TaskRow = {
  id: string;
  company_id: string | null;
  title: string;
  detail: string | null;
  level: number;
  due_date: string | null;
  status: "aberta" | "concluida";
  created_by: string | null;
  created_at: string;
  companies: { name: string; category: string | null } | null;
};

export default function Tarefas() {
  const [rows, setRows] = useState<TaskRow[]>([]);
  const [filtro, setFiltro] = useState<"aberta" | "concluida" | "todas">("aberta");
  const [loading, setLoading] = useState(true);
  const [msg, setMsg] = useState<string | null>(null);

  // Formulário de nova tarefa.
  const [title, setTitle] = useState("");
  const [detail, setDetail] = useState("");
  const [dueDate, setDueDate] = useState("");
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const r = await fetch(`/api/tasks?status=${filtro}`);
      const d = await r.json();
      if (d.error) setMsg(d.error);
      else setRows(d.tasks ?? []);
    } catch {
      setMsg("Falha ao carregar tarefas.");
    } finally {
      setLoading(false);
    }
  }, [filtro]);

  useEffect(() => {
    load();
  }, [load]);

  async function addTask(e: React.FormEvent) {
    e.preventDefault();
    if (!title.trim()) return;
    setSaving(true);
    setMsg(null);
    try {
      const r = await fetch("/api/tasks", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title,
          detail: detail || undefined,
          dueDate: dueDate || undefined,
          createdBy: "ceo",
        }),
      });
      const d = await r.json();
      if (d.error) setMsg(d.error);
      else {
        setTitle("");
        setDetail("");
        setDueDate("");
        load();
      }
    } finally {
      setSaving(false);
    }
  }

  async function toggle(t: TaskRow) {
    const status = t.status === "concluida" ? "aberta" : "concluida";
    setRows((prev) => prev.map((x) => (x.id === t.id ? { ...x, status } : x)));
    await fetch(`/api/tasks/${t.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status }),
    });
    if (filtro !== "todas") load();
  }

  async function remove(t: TaskRow) {
    if (!confirm("Excluir esta tarefa?")) return;
    setRows((prev) => prev.filter((x) => x.id !== t.id));
    await fetch(`/api/tasks/${t.id}`, { method: "DELETE" });
  }

  const abertas = rows.filter((r) => r.status === "aberta").length;

  return (
    <div className="space-y-5">
      <header>
        <h1 className="text-2xl font-semibold text-brand-800">Tarefas</h1>
        <p className="text-sm text-brand-800/60">
          Ações humanas de relacionamento — visitar um médico, enviar documentos,
          registrar um contato indicado. A IA cria as de apoio; você cria as suas.
        </p>
      </header>

      {/* Nova tarefa */}
      <form
        onSubmit={addTask}
        className="rounded-2xl border border-brand-100 bg-white p-4 shadow-card"
      >
        <div className="flex flex-col gap-3 sm:flex-row">
          <input
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="Ex: Visitar Dr. João (neuropediatra) na unidade Alphaville"
            className="flex-1 rounded-xl border border-brand-200 px-3 py-2 text-sm outline-none focus:border-brand-500"
          />
          <input
            type="date"
            value={dueDate}
            onChange={(e) => setDueDate(e.target.value)}
            className="rounded-xl border border-brand-200 px-3 py-2 text-sm text-brand-800/70 outline-none focus:border-brand-500"
          />
          <button
            type="submit"
            disabled={saving || !title.trim()}
            className="rounded-xl bg-brand-600 px-4 py-2 text-sm font-medium text-white hover:bg-brand-700 disabled:opacity-40"
          >
            Adicionar
          </button>
        </div>
        <input
          value={detail}
          onChange={(e) => setDetail(e.target.value)}
          placeholder="Detalhe (opcional)"
          className="mt-2 w-full rounded-xl border border-brand-200 px-3 py-2 text-sm outline-none focus:border-brand-500"
        />
      </form>

      {/* Filtro */}
      <div className="flex items-center gap-2">
        {(["aberta", "concluida", "todas"] as const).map((f) => (
          <button
            key={f}
            onClick={() => setFiltro(f)}
            className={`rounded-lg px-3 py-1.5 text-sm font-medium ${
              filtro === f
                ? "bg-brand-600 text-white"
                : "text-brand-800/60 hover:bg-brand-50"
            }`}
          >
            {f === "aberta" ? "Abertas" : f === "concluida" ? "Concluídas" : "Todas"}
          </button>
        ))}
        <span className="ml-auto text-sm text-brand-800/50">
          {loading ? "…" : `${abertas} aberta${abertas !== 1 ? "s" : ""}`}
        </span>
      </div>

      {msg && (
        <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-2.5 text-sm text-amber-800">
          {msg}
        </div>
      )}

      <div className="space-y-2">
        {rows.map((t) => (
          <div
            key={t.id}
            className={`flex items-start gap-3 rounded-xl border p-3 ${
              t.status === "concluida"
                ? "border-gray-200 bg-gray-50"
                : "border-brand-100 bg-white shadow-sm"
            }`}
          >
            <input
              type="checkbox"
              checked={t.status === "concluida"}
              onChange={() => toggle(t)}
              className="mt-0.5 h-4 w-4 shrink-0 accent-brand-600"
            />
            <div className="min-w-0 flex-1">
              <p
                className={`text-sm font-medium ${
                  t.status === "concluida"
                    ? "text-gray-400 line-through"
                    : "text-brand-800"
                }`}
              >
                {t.title}
              </p>
              {t.detail && (
                <p className="text-xs text-brand-800/50">{t.detail}</p>
              )}
              <div className="mt-1 flex flex-wrap items-center gap-2 text-[11px] text-brand-800/50">
                {t.companies?.name && (
                  <span className="rounded bg-brand-50 px-1.5 py-0.5">
                    {t.companies.name}
                  </span>
                )}
                {t.created_by === "ia" && (
                  <span
                    className="rounded bg-emerald-50 px-1.5 py-0.5 text-emerald-700"
                    title={AUTONOMY_LABELS[t.level as AutonomyLevel] ?? ""}
                  >
                    criada pela IA
                  </span>
                )}
                {t.due_date && (
                  <span className="text-amber-700">
                    prazo{" "}
                    {new Date(`${t.due_date}T12:00:00Z`).toLocaleDateString("pt-BR", {
                      day: "2-digit",
                      month: "2-digit",
                    })}
                  </span>
                )}
              </div>
            </div>
            <button
              onClick={() => remove(t)}
              className="shrink-0 rounded-lg px-2 py-1 text-xs text-brand-800/30 hover:bg-red-50 hover:text-red-600"
              title="Excluir"
            >
              ✕
            </button>
          </div>
        ))}
        {!loading && !rows.length && (
          <div className="rounded-xl border border-dashed border-brand-200 px-4 py-10 text-center text-sm text-brand-800/40">
            Nenhuma tarefa {filtro === "aberta" ? "aberta" : "aqui"}.
          </div>
        )}
      </div>
    </div>
  );
}
