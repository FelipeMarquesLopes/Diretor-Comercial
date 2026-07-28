"use client";

import { useEffect, useState } from "react";
import type { Company, Contact, MessageHook, DraftChannel } from "@/lib/types";
import { HOOK_LABELS, STATUS_LABELS } from "@/lib/types";

type CompanyWithContacts = Company & { contacts: Contact[] };

export default function Prospeccao() {
  const [companies, setCompanies] = useState<CompanyWithContacts[]>([]);
  const [loading, setLoading] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  // formulário de busca
  const [keywords, setKeywords] = useState("");
  const [estado, setEstado] = useState("Sao Paulo");
  const [cidade, setCidade] = useState("");
  const [minEmployees, setMinEmployees] = useState(100);
  const [withContacts, setWithContacts] = useState(true);

  async function loadCompanies() {
    const r = await fetch("/api/companies?status=qualificado&category=empresa");
    const d = await r.json();
    if (d.error) setMsg(d.error);
    else setCompanies(d.companies);
  }

  useEffect(() => {
    loadCompanies();
  }, []);

  async function runProspect(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setMsg(null);
    // monta a localização a partir de cidade + estado (+ Brazil)
    const local = [cidade.trim(), estado.trim(), "Brazil"]
      .filter(Boolean)
      .join(", ");
    try {
      const r = await fetch("/api/prospect", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          keywords: keywords
            .split(",")
            .map((k) => k.trim())
            .filter(Boolean),
          locations: [local],
          minEmployees,
          withContacts,
        }),
      });
      const d = await r.json();
      if (d.error) {
        setMsg(`Erro: ${d.error}`);
      } else {
        let m = `Encontradas ${d.found} empresas, ${d.qualified} qualificadas`;
        if (withContacts) m += ` · ${d.contatosRh ?? 0} contato(s) de RH`;
        m += ".";
        if (d.avisoContatos) m += ` ⚠️ RH: ${d.avisoContatos}`;
        setMsg(m);
        await loadCompanies();
      }
    } catch (err) {
      setMsg(String(err));
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="space-y-6">
      <form
        onSubmit={runProspect}
        className="rounded-lg border border-gray-200 bg-white p-4 shadow-sm"
      >
        <h2 className="mb-3 font-semibold text-gray-800">
          Buscar empresas no Apollo
        </h2>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <label className="text-sm sm:col-span-2">
            <span className="text-gray-600">Setores / palavras-chave (vírgula)</span>
            <input
              value={keywords}
              onChange={(e) => setKeywords(e.target.value)}
              placeholder="ex: manufacturing, logistics, metalurgia"
              className="mt-1 w-full rounded-md border border-gray-300 px-3 py-2"
            />
          </label>
          <label className="text-sm">
            <span className="text-gray-600">Estado</span>
            <input
              value={estado}
              onChange={(e) => setEstado(e.target.value)}
              placeholder="ex: Sao Paulo"
              className="mt-1 w-full rounded-md border border-gray-300 px-3 py-2"
            />
          </label>
          <label className="text-sm">
            <span className="text-gray-600">Município / cidade</span>
            <input
              value={cidade}
              onChange={(e) => setCidade(e.target.value)}
              placeholder="ex: Guarulhos (deixe vazio p/ o estado todo)"
              className="mt-1 w-full rounded-md border border-gray-300 px-3 py-2"
            />
          </label>
          <label className="text-sm">
            <span className="text-gray-600">Mínimo de funcionários</span>
            <input
              type="number"
              value={minEmployees}
              onChange={(e) => setMinEmployees(Number(e.target.value))}
              min={1}
              className="mt-1 w-full rounded-md border border-gray-300 px-3 py-2"
            />
          </label>
          <label className="flex items-center gap-2 text-sm sm:mt-6">
            <input
              type="checkbox"
              checked={withContacts}
              onChange={(e) => setWithContacts(e.target.checked)}
            />
            <span className="text-gray-600">Buscar contatos do RH também</span>
          </label>
        </div>
        <button
          type="submit"
          disabled={loading}
          className="mt-4 rounded-md bg-brand-500 px-4 py-2 text-sm font-medium text-white hover:bg-brand-600 disabled:opacity-50"
        >
          {loading ? "Buscando…" : "Prospectar"}
        </button>
        {msg && <p className="mt-3 text-sm text-gray-600">{msg}</p>}
      </form>

      <section>
        <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-gray-500">
          Empresas qualificadas ({companies.length})
        </h2>
        <div className="space-y-3">
          {companies.length === 0 && (
            <p className="text-sm text-gray-500">
              Nenhuma empresa qualificada ainda. Rode uma busca acima.
            </p>
          )}
          {companies.map((c) => (
            <CompanyCard key={c.id} company={c} onChanged={loadCompanies} />
          ))}
        </div>
      </section>
    </div>
  );
}

function CompanyCard({
  company,
  onChanged,
}: {
  company: CompanyWithContacts;
  onChanged: () => void;
}) {
  const [hook, setHook] = useState<MessageHook>("nr1");
  const [channel, setChannel] = useState<DraftChannel>("email");
  const [state, setState] = useState<"idle" | "gerando" | "ok" | "erro">("idle");
  const [note, setNote] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function gerar() {
    setState("gerando");
    setNote(null);
    try {
      const r = await fetch("/api/drafts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ companyId: company.id, hook, channel }),
      });
      const d = await r.json();
      if (d.error) {
        setState("erro");
        setNote(d.error);
      } else {
        setState("ok");
        setNote("Rascunho criado — veja na aba Rascunhos.");
      }
    } catch (e) {
      setState("erro");
      setNote(String(e));
    }
  }

  async function excluir() {
    if (!confirm(`Excluir a empresa "${company.name}"? Não dá para desfazer.`))
      return;
    setBusy(true);
    try {
      await fetch(`/api/companies/${company.id}`, { method: "DELETE" });
      onChanged();
    } finally {
      setBusy(false);
    }
  }

  async function revelar(contactId: string) {
    setBusy(true);
    setNote(null);
    try {
      const r = await fetch(`/api/contacts/${contactId}/reveal`, {
        method: "POST",
      });
      const d = await r.json();
      if (d.error) setNote(`Erro ao revelar: ${d.error}`);
      else if (!d.revealed) setNote("O Apollo não tinha e-mail/telefone deste contato.");
      onChanged();
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="rounded-lg border border-gray-200 bg-white p-4 shadow-sm">
      <div className="flex items-start justify-between gap-4">
        <div>
          <p className="font-medium text-gray-900">{company.name}</p>
          <p className="text-xs text-gray-500">
            {[
              company.industry,
              company.employee_count ? `${company.employee_count} func.` : null,
              [company.city, company.state].filter(Boolean).join("/"),
              company.phone,
            ]
              .filter(Boolean)
              .join(" · ")}
          </p>
          {company.qualification_notes && (
            <p className="mt-1 text-xs text-gray-400">{company.qualification_notes}</p>
          )}
        </div>
        <div className="flex flex-col items-end gap-1">
          <span className="inline-block rounded-full bg-brand-100 px-2 py-0.5 text-xs font-medium text-brand-700">
            score {company.qualification_score}
          </span>
          <p className="text-xs text-gray-400">
            {STATUS_LABELS[company.status]} · prio {company.priority}
          </p>
          <button
            onClick={excluir}
            disabled={busy}
            className="text-xs text-red-600 underline hover:text-red-700 disabled:opacity-50"
          >
            Excluir
          </button>
        </div>
      </div>

      {/* Contatos de RH (decisores) */}
      {company.contacts?.length > 0 && (
        <div className="mt-3 rounded-md border border-gray-100 bg-gray-50 p-2">
          <p className="mb-1 text-xs font-semibold uppercase tracking-wide text-gray-500">
            Contatos de RH
          </p>
          <div className="space-y-1.5">
            {company.contacts.map((c) => (
              <div
                key={c.id}
                className="flex flex-wrap items-center justify-between gap-2 text-sm"
              >
                <div className="min-w-0">
                  <span className="font-medium text-gray-800">{c.name}</span>
                  {c.title && (
                    <span className="text-xs text-gray-500"> · {c.title}</span>
                  )}
                  <div className="text-xs text-gray-500">
                    {c.email ? (
                      <span className="text-brand-700">{c.email}</span>
                    ) : (
                      <span className="italic text-gray-400">e-mail não revelado</span>
                    )}
                    {c.phone ? ` · ${c.phone}` : ""}
                  </div>
                </div>
                {!c.email && c.apollo_id && (
                  <button
                    onClick={() => revelar(c.id)}
                    disabled={busy}
                    className="rounded-md border border-brand-300 px-2 py-1 text-xs font-medium text-brand-700 hover:bg-brand-50 disabled:opacity-50"
                    title="Revela e-mail/telefone via Apollo (consome 1 crédito)"
                  >
                    Revelar e-mail
                  </button>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      <div className="mt-3 flex flex-wrap items-center gap-2">
        <select
          value={hook}
          onChange={(e) => setHook(e.target.value as MessageHook)}
          className="rounded-md border border-gray-300 px-2 py-1 text-sm"
        >
          {Object.entries(HOOK_LABELS).map(([k, v]) => (
            <option key={k} value={k}>
              {v}
            </option>
          ))}
        </select>
        <select
          value={channel}
          onChange={(e) => setChannel(e.target.value as DraftChannel)}
          className="rounded-md border border-gray-300 px-2 py-1 text-sm"
        >
          <option value="email">E-mail</option>
          <option value="whatsapp">WhatsApp</option>
        </select>
        <button
          onClick={gerar}
          disabled={state === "gerando"}
          className="rounded-md bg-brand-500 px-3 py-1 text-sm font-medium text-white hover:bg-brand-600 disabled:opacity-50"
        >
          {state === "gerando" ? "Gerando…" : "Gerar rascunho"}
        </button>
        {note && (
          <span
            className={`text-xs ${state === "erro" ? "text-red-600" : "text-green-600"}`}
          >
            {note}
          </span>
        )}
      </div>
    </div>
  );
}
