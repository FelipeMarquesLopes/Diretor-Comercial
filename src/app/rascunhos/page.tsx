"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { Draft, DraftStatus } from "@/lib/types";
import { CATEGORY_LABELS, HOOK_LABELS } from "@/lib/types";

type DraftRow = Draft & {
  companies: {
    name: string;
    industry: string | null;
    city: string | null;
    cc_emails: string | null;
    category: string | null;
    operator_type: string | null;
    next_followup: string | null;
  } | null;
  contacts: { name: string; title: string | null; email: string | null } | null;
  sequences: {
    next_action_at: string | null;
    status: string;
    resume_at: string | null;
  } | null;
};

// Data + hora no formato brasileiro (fuso de São Paulo). Ex: 31/07/2026 14:20
function fmtDataHora(iso: string | null): string {
  if (!iso) return "";
  return new Date(iso).toLocaleString("pt-BR", {
    timeZone: "America/Sao_Paulo",
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

// Só a data (sem hora). Ex: 03/08/2026
function fmtData(iso: string | null): string {
  if (!iso) return "";
  // Data pura (YYYY-MM-DD, ex: next_followup): formata sem fuso para não
  // "voltar um dia" na conversão de horário.
  if (/^\d{4}-\d{2}-\d{2}$/.test(iso)) {
    const [y, m, d] = iso.split("-");
    return `${d}/${m}/${y}`;
  }
  return new Date(iso).toLocaleDateString("pt-BR", {
    timeZone: "America/Sao_Paulo",
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  });
}

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

  // Filtros em cascata: categoria → (tipo, se operadora) → parceiro específico.
  const [catFilter, setCatFilter] = useState<string>("todas");
  const [tipoFilter, setTipoFilter] = useState<string>("todos");
  const [companyFilter, setCompanyFilter] = useState<string>("todas");

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

  // Categorias presentes nos rascunhos carregados (para o 1º filtro).
  const categoriasPresentes = Array.from(
    new Set(drafts.map((d) => d.companies?.category).filter(Boolean)),
  ) as string[];

  // Aplica categoria + tipo antes de listar os parceiros do 3º filtro.
  const porCatETipo = drafts.filter((d) => {
    if (catFilter !== "todas" && d.companies?.category !== catFilter) return false;
    if (
      catFilter === "operadora" &&
      tipoFilter !== "todos" &&
      d.companies?.operator_type !== tipoFilter
    )
      return false;
    return true;
  });

  // Parceiros distintos que casam com categoria+tipo (para o 3º filtro).
  const parceiros = Array.from(
    new Map(
      porCatETipo
        .filter((d) => d.companies)
        .map((d) => [d.company_id, d.companies!.name] as const),
    ).entries(),
  ).sort((a, b) => a[1].localeCompare(b[1]));

  const filtrados = porCatETipo.filter(
    (d) => companyFilter === "todas" || d.company_id === companyFilter,
  );

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

      {/* Filtros em cascata: categoria → tipo (se operadora) → parceiro */}
      {drafts.length > 0 && (
        <div className="flex flex-wrap items-center gap-2 rounded-lg border border-gray-200 bg-white p-3">
          <span className="text-xs font-medium uppercase tracking-wide text-gray-400">
            Filtrar:
          </span>
          <select
            value={catFilter}
            onChange={(e) => {
              setCatFilter(e.target.value);
              setTipoFilter("todos");
              setCompanyFilter("todas");
            }}
            className="rounded-md border border-gray-300 px-2 py-1 text-sm"
          >
            <option value="todas">Todas as frentes</option>
            {categoriasPresentes.map((c) => (
              <option key={c} value={c}>
                {CATEGORY_LABELS[c as keyof typeof CATEGORY_LABELS] ?? c}
              </option>
            ))}
          </select>

          {catFilter === "operadora" && (
            <select
              value={tipoFilter}
              onChange={(e) => {
                setTipoFilter(e.target.value);
                setCompanyFilter("todas");
              }}
              className="rounded-md border border-gray-300 px-2 py-1 text-sm"
            >
              <option value="todos">Captação e relacionamento</option>
              <option value="nova">Captação (novas)</option>
              <option value="ativa">Relacionamento (ativas)</option>
            </select>
          )}

          {parceiros.length > 1 && (
            <select
              value={companyFilter}
              onChange={(e) => setCompanyFilter(e.target.value)}
              className="rounded-md border border-gray-300 px-2 py-1 text-sm"
            >
              <option value="todas">Todos os parceiros</option>
              {parceiros.map(([id, nome]) => (
                <option key={id} value={id}>
                  {nome}
                </option>
              ))}
            </select>
          )}

          {(catFilter !== "todas" ||
            tipoFilter !== "todos" ||
            companyFilter !== "todas") && (
            <button
              onClick={() => {
                setCatFilter("todas");
                setTipoFilter("todos");
                setCompanyFilter("todas");
              }}
              className="text-xs text-gray-500 underline hover:text-gray-700"
            >
              limpar
            </button>
          )}

          <span className="ml-auto text-xs text-gray-400">
            {filtrados.length} e-mail(s)
          </span>
        </div>
      )}

      {error && (
        <div className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-800">
          {error}
        </div>
      )}

      {filtrados.length === 0 && !error && (
        <p className="text-sm text-gray-500">Nenhum rascunho neste filtro.</p>
      )}

      {filtrados.map((d) => (
        <DraftCard key={d.id} draft={d} onChanged={load} />
      ))}
    </div>
  );
}

function DraftCard({ draft, onChanged }: { draft: DraftRow; onChanged: () => void }) {
  const [subject, setSubject] = useState(draft.subject ?? "");
  const [body, setBody] = useState(draft.body);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const anexos = draft.attachments ?? [];
  const dirty = subject !== (draft.subject ?? "") || body !== draft.body;

  // Anexa documento(s) ao rascunho (sobe direto ao Storage, sem limite).
  async function anexar() {
    const files = fileRef.current?.files ? Array.from(fileRef.current.files) : [];
    if (files.length === 0) return;
    setBusy(true);
    setErr(null);
    try {
      const signRes = await fetch(`/api/drafts/${draft.id}/attachments/sign`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ names: files.map((f) => f.name) }),
      });
      const signData = await signRes.json();
      if (signData.error) {
        setErr(signData.error);
        return;
      }
      const uploads: { path: string; signedUrl: string; name: string }[] =
        signData.uploads;
      for (let i = 0; i < files.length; i++) {
        const put = await fetch(uploads[i].signedUrl, {
          method: "PUT",
          headers: { "x-upsert": "true" },
          body: files[i],
        });
        if (!put.ok) {
          setErr(`Erro ao enviar "${files[i].name}" (código ${put.status}).`);
          return;
        }
      }
      const reg = await fetch(`/api/drafts/${draft.id}/attachments`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          paths: uploads.map((u) => u.path),
          names: files.map((f) => f.name),
        }),
      });
      const regData = await reg.json().catch(() => ({}));
      if (regData.error) setErr(regData.error);
      else {
        if (fileRef.current) fileRef.current.value = "";
        onChanged();
      }
    } catch (e) {
      setErr(String(e));
    } finally {
      setBusy(false);
    }
  }

  async function removerAnexo(path: string) {
    setBusy(true);
    setErr(null);
    try {
      await fetch(
        `/api/drafts/${draft.id}/attachments?path=${encodeURIComponent(path)}`,
        { method: "DELETE" },
      );
      onChanged();
    } finally {
      setBusy(false);
    }
  }

  // Muda o estado da automação deste assunto (só quando há sequência).
  async function mudarAutomacao(action: "seguir" | "standby" | "encerrar") {
    if (!draft.sequence_id) return;
    if (action === "encerrar" && !confirm("Encerrar este assunto? O sistema para de cobrar retorno."))
      return;
    setBusy(true);
    setErr(null);
    try {
      const r = await fetch(`/api/sequences/${draft.sequence_id}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action }),
      });
      const d = await r.json().catch(() => ({}));
      if (d.error) setErr(d.error);
      else onChanged();
    } finally {
      setBusy(false);
    }
  }

  async function act(
    action: "aprovar" | "rejeitar" | "enviar" | "enviar_email" | "editar",
  ) {
    setBusy(true);
    setErr(null);
    try {
      const r = await fetch(`/api/drafts/${draft.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(
          action === "editar" ? { action, subject, body } : { action },
        ),
      });
      const d = await r.json().catch(() => ({}));
      if (d.error) {
        setErr(d.error);
      } else {
        onChanged();
      }
    } finally {
      setBusy(false);
    }
  }

  async function excluir() {
    if (!confirm("Excluir este rascunho de vez? Não dá para desfazer.")) return;
    setBusy(true);
    setErr(null);
    try {
      const r = await fetch(`/api/drafts/${draft.id}`, { method: "DELETE" });
      const d = await r.json().catch(() => ({}));
      if (d.error) setErr(d.error);
      else onChanged();
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
            {draft.companies?.category === "agenda_aberta"
              ? CATEGORY_LABELS.agenda_aberta
              : draft.companies?.category === "reajuste"
                ? CATEGORY_LABELS.reajuste
                : HOOK_LABELS[draft.hook]}
          </p>
          {/* Destinatário — para o CEO ver PRA QUEM vai antes de disparar */}
          {draft.channel === "email" ? (
            draft.contacts?.email ? (
              <p className="mt-1 text-sm">
                <span className="text-gray-500">Para: </span>
                <span className="font-medium text-brand-700">
                  {draft.contacts.email}
                </span>
                {draft.contacts?.name && (
                  <span className="text-xs text-gray-500">
                    {" "}
                    ({draft.contacts.name}
                    {draft.contacts.title ? ` · ${draft.contacts.title}` : ""})
                  </span>
                )}
              </p>
            ) : (
              <p className="mt-1 text-sm font-medium text-red-600">
                ⚠️ Sem e-mail do destinatário — revele pelo &quot;Abordar&quot;
                (empresa) ou cadastre o e-mail (operadora) antes de enviar.
              </p>
            )
          ) : (
            <p className="mt-1 text-xs text-gray-500">
              {draft.contacts?.name
                ? `Para: ${draft.contacts.name}`
                : "Destinatário no WhatsApp"}
            </p>
          )}

          {/* Em cópia (CC) — outras pessoas que também recebem o e-mail. */}
          {draft.channel === "email" && draft.companies?.cc_emails && (
            <p className="mt-0.5 text-xs text-gray-500">
              Em cópia: {draft.companies.cc_emails}
            </p>
          )}

          {/* Assunto — para distinguir (nova operadora, relacionamento, etc.).
              No pendente o assunto já aparece editável abaixo. */}
          {draft.channel === "email" &&
            draft.subject &&
            draft.status !== "pendente" && (
              <p className="mt-1 text-sm">
                <span className="text-gray-500">Assunto: </span>
                <span className="font-medium text-gray-800">
                  {draft.subject}
                </span>
              </p>
            )}

          {/* Data + hora do envio */}
          {draft.sent_at && (
            <p className="mt-1 text-xs font-medium text-blue-700">
              📤 Enviado em {fmtDataHora(draft.sent_at)}
            </p>
          )}

          {/* Próximo envio / situação da sequência de follow-up */}
          {draft.sequences?.status === "aguardando_ceo" && (
            <p className="mt-0.5 text-xs font-medium text-green-700">
              ✅ Teve resposta — aguardando você (follow-up automático pausado)
            </p>
          )}
          {draft.sequences?.status === "pausada_negativa" &&
            draft.sequences.resume_at && (
              <p className="mt-0.5 text-xs text-gray-500">
                ⏸ Pausado (resposta negativa) — retoma em{" "}
                {fmtData(draft.sequences.resume_at)}
              </p>
            )}
          {draft.sequences?.status === "ativa" &&
            draft.sequences.next_action_at && (
              <p className="mt-0.5 text-xs font-medium text-amber-700">
                🔁 Próximo envio (se ninguém responder):{" "}
                {fmtData(draft.sequences.next_action_at)}
              </p>
            )}
          {/* Agenda Aberta: informativo recorrente a cada 15 dias. */}
          {draft.companies?.category === "agenda_aberta" &&
            draft.companies.next_followup && (
              <p className="mt-0.5 text-xs font-medium text-amber-700">
                🔁 Próximo informativo (a cada 15 dias):{" "}
                {fmtData(draft.companies.next_followup)}
              </p>
            )}
        </div>
        <div className="flex items-center gap-2">
          <span
            className={`rounded-full px-2 py-0.5 text-xs font-medium ${statusColor[draft.status]}`}
          >
            {draft.status}
          </span>
          <button
            onClick={excluir}
            disabled={busy}
            className="text-xs text-red-600 underline hover:text-red-700 disabled:opacity-50"
          >
            Excluir
          </button>
        </div>
      </div>

      {/* Controle manual da automação deste assunto (e-mail já enviado) */}
      {draft.channel === "email" &&
        draft.sequence_id &&
        draft.status === "enviado" && (
          <div className="mb-2 flex flex-wrap items-center gap-2 rounded-md border border-gray-100 bg-gray-50 p-2">
            <span className="text-xs font-medium text-gray-500">
              Automação:
            </span>
            <button
              onClick={() => mudarAutomacao("seguir")}
              disabled={busy}
              className="rounded-md border border-brand-300 px-2 py-1 text-xs font-medium text-brand-700 hover:bg-brand-50 disabled:opacity-50"
            >
              🔁 Follow-up 72h
            </button>
            <button
              onClick={() => mudarAutomacao("standby")}
              disabled={busy}
              className="rounded-md border border-gray-300 px-2 py-1 text-xs font-medium text-gray-600 hover:bg-gray-100 disabled:opacity-50"
            >
              ⏳ Stand by 30 dias
            </button>
            <button
              onClick={() => mudarAutomacao("encerrar")}
              disabled={busy}
              className="rounded-md border border-gray-300 px-2 py-1 text-xs font-medium text-gray-600 hover:bg-gray-100 disabled:opacity-50"
            >
              ✖️ Encerrar assunto
            </button>
          </div>
        )}

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

      {/* Anexos — documentos que vão junto no e-mail */}
      {draft.channel === "email" && (
        <div className="mt-2 rounded-md border border-gray-100 bg-gray-50 p-2">
          <p className="text-xs font-semibold uppercase tracking-wide text-gray-500">
            📎 Anexos {anexos.length > 0 ? `(${anexos.length})` : ""}
          </p>
          {anexos.length > 0 && (
            <ul className="mt-1 space-y-1">
              {anexos.map((a) => (
                <li
                  key={a.path}
                  className="flex items-center justify-between gap-2 text-xs text-gray-700"
                >
                  <span className="min-w-0 truncate">📄 {a.name}</span>
                  {draft.status === "pendente" && (
                    <button
                      onClick={() => removerAnexo(a.path)}
                      disabled={busy}
                      className="text-red-600 hover:text-red-700 disabled:opacity-50"
                      title="Remover anexo"
                    >
                      remover
                    </button>
                  )}
                </li>
              ))}
            </ul>
          )}
          {draft.status === "pendente" && (
            <div className="mt-2 flex flex-wrap items-center gap-2">
              <input ref={fileRef} type="file" multiple className="text-xs" />
              <button
                onClick={anexar}
                disabled={busy}
                className="rounded-md border border-brand-300 px-2 py-1 text-xs font-medium text-brand-700 hover:bg-brand-50 disabled:opacity-50"
              >
                {busy ? "Anexando…" : "Anexar documento"}
              </button>
            </div>
          )}
        </div>
      )}

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
          {draft.channel === "email" ? (
            <button
              onClick={() => act("enviar_email")}
              disabled={busy || dirty}
              title={dirty ? "Salve a edição antes de aprovar" : ""}
              className="rounded-md bg-green-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-green-700 disabled:opacity-50"
            >
              {busy ? "Enviando…" : "Aprovar e enviar"}
            </button>
          ) : (
            <button
              onClick={() => act("aprovar")}
              disabled={busy || dirty}
              title={dirty ? "Salve a edição antes de aprovar" : ""}
              className="rounded-md bg-green-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-green-700 disabled:opacity-50"
            >
              Aprovar
            </button>
          )}
          <button
            onClick={() => act("rejeitar")}
            disabled={busy}
            className="rounded-md border border-gray-300 px-3 py-1.5 text-sm font-medium text-gray-600 hover:bg-gray-50 disabled:opacity-50"
          >
            Rejeitar
          </button>
        </div>
      )}

      {draft.status === "aprovado" && draft.channel === "email" && (
        <div className="mt-3 flex flex-wrap items-center gap-2">
          <button
            onClick={() => act("enviar_email")}
            disabled={busy}
            className="rounded-md bg-blue-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50"
          >
            {busy ? "Enviando…" : "Enviar pelo Gmail"}
          </button>
          <span className="text-xs text-gray-500">
            Este é o seu clique final: o e-mail sai da sua conta do Gmail.
          </span>
        </div>
      )}

      {draft.status === "aprovado" && draft.channel === "whatsapp" && (
        <div className="mt-3 flex flex-wrap items-center gap-2">
          <span className="text-xs text-gray-500">
            Aprovado — envie e marque como enviado:
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

      {err && <p className="mt-2 text-xs text-red-600">{err}</p>}
    </div>
  );
}
