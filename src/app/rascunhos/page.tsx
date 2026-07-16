"use client";

import { useCallback, useEffect, useState } from "react";
import type { Draft, DraftStatus } from "@/lib/types";
import { HOOK_LABELS } from "@/lib/types";

type DraftRow = Draft & {
  companies: { name: string; industry: string | null; city: string | null } | null;
  contacts: { name: string; title: string | null; email: string | null } | null;
};

const FILTERS: { key: DraftStatus | "todos"; label: string }[] = [
  { key: "pendente", label: "Pendentes" },
  { key: "aprovado", label: "Aprovados" },
  { key: "enviado", label: "Enviados" },
  { key: "rejeitado", label: "Rejeitados" },
  { key: "todos", label: "Todos" },
];

export default function Rascunhos() {
  const [filter, setFilter] = useState<DraftStatus | "todos">("pendente");
  const [drafts, setDrafts] = useState<DraftRow[]>([]);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    const qs = filter === "todos" ? "" : `?status=${filter}`;
    const r = await fetch(`/api/drafts${qs}`);
    const d = await r.json();
    if (d.error) setError(d.error);
    else {
      setError(null);
      setDrafts(d.drafts);
    }
  }, [filter]);

  useEffect(() => {
    load();
  }, [load]);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap gap-2">
        {FILTERS.map((f) => (
          <button
            key={f.key}
            onClick={() => setFilter(f.key)}
            className={`rounded-full px-3 py-1 text-sm font-medium ${
              filter === f.key
                ? "bg-brand-500 text-white"
                : "bg-white text-gray-600 border border-gray-200"
            }`}
          >
            {f.label}
          </button>
        ))}
      </div>

      {error && (
        <div className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-800">
          {error}
        </div>
      )}

      {drafts.length === 0 && !error && (
        <p className="text-sm text-gray-500">Nenhum rascunho neste filtro.</p>
      )}

      {drafts.map((d) => (
        <DraftCard key={d.id} draft={d} onChanged={load} />
      ))}
    </div>
  );
}

function DraftCard({ draft, onChanged }: { draft: DraftRow; onChanged: () => void }) {
  const [subject, setSubject] = useState(draft.subject ?? "");
  const [body, setBody] = useState(draft.body);
  const [busy, setBusy] = useState(false);
  const dirty = subject !== (draft.subject ?? "") || body !== draft.body;

  async function act(action: "aprovar" | "rejeitar" | "enviar" | "editar") {
    setBusy(true);
    try {
      await fetch(`/api/drafts/${draft.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(
          action === "editar" ? { action, subject, body } : { action },
        ),
      });
      onChanged();
    } finally {
      setBusy(false);
    }
  }

  const statusColor: Record<DraftStatus, string> = {
    pendente: "bg-amber-100 text-amber-800",
    aprovado: "bg-green-100 text-green-800",
    enviado: "bg-blue-100 text-blue-800",
    rejeitado: "bg-gray-100 text-gray-600",
  };

  const whatsappLink =
    draft.channel === "whatsapp"
      ? `https://wa.me/?text=${encodeURIComponent(body)}`
      : null;

  return (
    <div className="rounded-lg border border-gray-200 bg-white p-4 shadow-sm">
      <div className="mb-2 flex items-start justify-between gap-3">
        <div>
          <p className="font-medium text-gray-900">
            {draft.companies?.name ?? "Empresa"}
          </p>
          <p className="text-xs text-gray-500">
            {draft.channel === "email" ? "E-mail" : "WhatsApp"} ·{" "}
            {HOOK_LABELS[draft.hook]}
            {draft.contacts?.name ? ` · para ${draft.contacts.name}` : ""}
          </p>
        </div>
        <span
          className={`rounded-full px-2 py-0.5 text-xs font-medium ${statusColor[draft.status]}`}
        >
          {draft.status}
        </span>
      </div>

      {draft.channel === "email" && (
        <input
          value={subject}
          onChange={(e) => setSubject(e.target.value)}
          placeholder="Assunto"
          disabled={draft.status !== "pendente"}
          className="mb-2 w-full rounded-md border border-gray-300 px-3 py-2 text-sm disabled:bg-gray-50"
        />
      )}
      <textarea
        value={body}
        onChange={(e) => setBody(e.target.value)}
        rows={6}
        disabled={draft.status !== "pendente"}
        className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm disabled:bg-gray-50"
      />

      {draft.status === "pendente" && (
        <div className="mt-3 flex flex-wrap gap-2">
          {dirty && (
            <button
              onClick={() => act("editar")}
              disabled={busy}
              className="rounded-md border border-gray-300 px-3 py-1.5 text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-50"
            >
              Salvar edição
            </button>
          )}
          <button
            onClick={() => act("aprovar")}
            disabled={busy || dirty}
            title={dirty ? "Salve a edição antes de aprovar" : ""}
            className="rounded-md bg-green-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-green-700 disabled:opacity-50"
          >
            Aprovar
          </button>
          <button
            onClick={() => act("rejeitar")}
            disabled={busy}
            className="rounded-md border border-gray-300 px-3 py-1.5 text-sm font-medium text-gray-600 hover:bg-gray-50 disabled:opacity-50"
          >
            Rejeitar
          </button>
        </div>
      )}

      {draft.status === "aprovado" && (
        <div className="mt-3 flex flex-wrap items-center gap-2">
          <span className="text-xs text-gray-500">
            Aprovado — dispare manualmente e marque como enviado:
          </span>
          {whatsappLink && (
            <a
              href={whatsappLink}
              target="_blank"
              rel="noreferrer"
              className="rounded-md border border-gray-300 px-3 py-1.5 text-sm text-brand-600 hover:bg-gray-50"
            >
              Abrir no WhatsApp
            </a>
          )}
          <button
            onClick={() => act("enviar")}
            disabled={busy}
            className="rounded-md bg-blue-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50"
          >
            Marcar como enviado
          </button>
        </div>
      )}
    </div>
  );
}
