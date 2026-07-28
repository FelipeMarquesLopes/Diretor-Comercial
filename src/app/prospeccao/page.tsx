"use client";

import { useEffect, useState } from "react";
import type { Company, Contact, MessageHook } from "@/lib/types";
import { HOOK_LABELS, STATUS_LABELS } from "@/lib/types";

type CompanyWithContacts = Company & { contacts: Contact[] };

export default function Prospeccao() {
  const [companies, setCompanies] = useState<CompanyWithContacts[]>([]);
  const [loading, setLoading] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  // formulário de busca
  const [keywords, setKeywords] = useState("");
  const [notKeywords, setNotKeywords] = useState("");
  const [nome, setNome] = useState("");
  const [estado, setEstado] = useState("Sao Paulo");
  const [cidades, setCidades] = useState("");
  const [minEmployees, setMinEmployees] = useState(100);
  const [maxEmployees, setMaxEmployees] = useState<string>("");
  const [perPage, setPerPage] = useState(25);
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
    // monta as localizações: uma por cidade (+ estado + Brazil); se não houver
    // cidade, usa só o estado.
    const cidadeList = cidades
      .split(",")
      .map((c) => c.trim())
      .filter(Boolean);
    const locations =
      cidadeList.length > 0
        ? cidadeList.map((c) =>
            [c, estado.trim(), "Brazil"].filter(Boolean).join(", "),
          )
        : [[estado.trim(), "Brazil"].filter(Boolean).join(", ")];
    try {
      const r = await fetch("/api/prospect", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          keywords: keywords
            .split(",")
            .map((k) => k.trim())
            .filter(Boolean),
          notKeywords: notKeywords
            .split(",")
            .map((k) => k.trim())
            .filter(Boolean),
          name: nome.trim() || undefined,
          locations,
          minEmployees,
          maxEmployees: maxEmployees.trim() ? Number(maxEmployees) : undefined,
          perPage,
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
        <h2 className="mb-1 font-semibold text-gray-800">
          Buscar empresas no Apollo
        </h2>
        <p className="mb-3 text-xs text-gray-500">
          Quanto mais detalhes, melhores os resultados. Atalhos:
        </p>
        {/* Atalhos de preenchimento rápido */}
        <div className="mb-3 flex flex-wrap gap-2">
          {(
            [
              ["🏭 Indústrias", "manufacturing, indústria, metalurgia, fábrica"],
              ["🚚 Transporte/Logística", "transporte, logística, distribuição"],
              ["🏫 Escolas/Colégios", "escola, colégio, educação, ensino"],
              ["🛒 Varejo", "varejo, supermercado, comércio"],
              ["🏥 Saúde", "hospital, clínica, saúde"],
            ] as const
          ).map(([label, kw]) => (
            <button
              key={label}
              type="button"
              onClick={() => setKeywords(kw)}
              className="rounded-full border border-gray-200 bg-gray-50 px-2.5 py-1 text-xs text-gray-600 hover:bg-gray-100"
            >
              {label}
            </button>
          ))}
        </div>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <label className="text-sm sm:col-span-2">
            <span className="text-gray-600">Setores / palavras-chave — INCLUIR (vírgula)</span>
            <input
              value={keywords}
              onChange={(e) => setKeywords(e.target.value)}
              placeholder="ex: metalurgia, indústria, transporte"
              className="mt-1 w-full rounded-md border border-gray-300 px-3 py-2"
            />
          </label>
          <label className="text-sm sm:col-span-2">
            <span className="text-gray-600">Palavras-chave a EXCLUIR (vírgula)</span>
            <input
              value={notKeywords}
              onChange={(e) => setNotKeywords(e.target.value)}
              placeholder="ex: escola, consultoria (não trazer esses)"
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
            <span className="text-gray-600">Cidades (uma ou várias, vírgula)</span>
            <input
              value={cidades}
              onChange={(e) => setCidades(e.target.value)}
              placeholder="ex: Guarulhos, Bragança Paulista (vazio = estado todo)"
              className="mt-1 w-full rounded-md border border-gray-300 px-3 py-2"
            />
          </label>
          <label className="text-sm">
            <span className="text-gray-600">Funcionários — mínimo</span>
            <input
              type="number"
              value={minEmployees}
              onChange={(e) => setMinEmployees(Number(e.target.value))}
              min={1}
              className="mt-1 w-full rounded-md border border-gray-300 px-3 py-2"
            />
          </label>
          <label className="text-sm">
            <span className="text-gray-600">Funcionários — máximo (opcional)</span>
            <input
              type="number"
              value={maxEmployees}
              onChange={(e) => setMaxEmployees(e.target.value)}
              min={1}
              placeholder="ex: 2000 (vazio = sem limite)"
              className="mt-1 w-full rounded-md border border-gray-300 px-3 py-2"
            />
          </label>
          <label className="text-sm">
            <span className="text-gray-600">Nome específico (opcional)</span>
            <input
              value={nome}
              onChange={(e) => setNome(e.target.value)}
              placeholder="ex: Ambev"
              className="mt-1 w-full rounded-md border border-gray-300 px-3 py-2"
            />
          </label>
          <label className="text-sm">
            <span className="text-gray-600">Quantos resultados por busca</span>
            <select
              value={perPage}
              onChange={(e) => setPerPage(Number(e.target.value))}
              className="mt-1 w-full rounded-md border border-gray-300 px-3 py-2"
            >
              <option value={10}>10</option>
              <option value={25}>25</option>
              <option value={50}>50</option>
              <option value={100}>100</option>
            </select>
          </label>
          <label className="flex items-center gap-2 text-sm sm:col-span-2">
            <input
              type="checkbox"
              checked={withContacts}
              onChange={(e) => setWithContacts(e.target.checked)}
            />
            <span className="text-gray-600">Buscar contatos do RH também (grátis)</span>
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
  const [state, setState] = useState<"idle" | "gerando" | "ok" | "erro">("idle");
  const [note, setNote] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  // "Abordar": revela o e-mail (1 crédito) + escreve + entra no follow-up.
  async function abordar() {
    if (
      !confirm(
        `Abordar "${company.name}"? Isso revela o e-mail do decisor (1 crédito do Apollo), escreve o rascunho e coloca no follow-up. O envio só sai com o seu clique depois.`,
      )
    )
      return;
    setState("gerando");
    setNote(null);
    setBusy(true);
    try {
      const r = await fetch("/api/prospect/abordar", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ companyId: company.id, hook }),
      });
      const d = await r.json();
      if (d.error) {
        setState("erro");
        setNote(d.error);
      } else {
        setState("ok");
        setNote(
          `Decisor: ${d.contato} · ${d.email} — rascunho criado. Veja em Rascunhos e dê o clique final.`,
        );
      }
      onChanged();
    } catch (e) {
      setState("erro");
      setNote(String(e));
    } finally {
      setBusy(false);
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
        <button
          onClick={abordar}
          disabled={busy || state === "gerando"}
          className="rounded-md bg-brand-500 px-3 py-1 text-sm font-medium text-white hover:bg-brand-600 disabled:opacity-50"
          title="Revela o e-mail do decisor (1 crédito), escreve o e-mail e coloca no follow-up"
        >
          {state === "gerando" ? "Abordando…" : "Abordar (revelar + escrever)"}
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
