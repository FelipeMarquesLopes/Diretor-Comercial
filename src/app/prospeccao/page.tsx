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
  const [location, setLocation] = useState("Sao Paulo, Brazil");
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
    try {
      const r = await fetch("/api/prospect", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          keywords: keywords
            .split(",")
            .map((k) => k.trim())
            .filter(Boolean),
          locations: [location],
          minEmployees,
          withContacts,
        }),
      });
      const d = await r.json();
      if (d.error) {
        setMsg(`Erro: ${d.error}`);
      } else {
        setMsg(`Encontradas ${d.found} empresas, ${d.qualified} qualificadas.`);
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
          <label className="text-sm">
            <span className="text-gray-600">Setores / palavras-chave (vírgula)</span>
            <input
              value={keywords}
              onChange={(e) => setKeywords(e.target.value)}
              placeholder="ex: manufacturing, logistics"
              className="mt-1 w-full rounded-md border border-gray-300 px-3 py-2"
            />
          </label>
          <label className="text-sm">
            <span className="text-gray-600">Localização</span>
            <input
              value={location}
              onChange={(e) => setLocation(e.target.value)}
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
            <CompanyCard key={c.id} company={c} />
          ))}
        </div>
      </section>
    </div>
  );
}

function CompanyCard({ company }: { company: CompanyWithContacts }) {
  const [hook, setHook] = useState<MessageHook>("nr1");
  const [channel, setChannel] = useState<DraftChannel>("email");
  const [state, setState] = useState<"idle" | "gerando" | "ok" | "erro">("idle");
  const [note, setNote] = useState<string | null>(null);

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
            ]
              .filter(Boolean)
              .join(" · ")}
          </p>
          {company.qualification_notes && (
            <p className="mt-1 text-xs text-gray-400">{company.qualification_notes}</p>
          )}
          {company.contacts?.length > 0 && (
            <p className="mt-1 text-xs text-brand-600">
              RH: {company.contacts.map((c) => c.name).join(", ")}
            </p>
          )}
        </div>
        <div className="text-right">
          <span className="inline-block rounded-full bg-brand-100 px-2 py-0.5 text-xs font-medium text-brand-700">
            score {company.qualification_score}
          </span>
          <p className="mt-1 text-xs text-gray-400">
            {STATUS_LABELS[company.status]} · prioridade {company.priority}
          </p>
        </div>
      </div>

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
