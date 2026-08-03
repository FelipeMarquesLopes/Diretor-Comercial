"use client";

import { useEffect, useState } from "react";
import type { Company, Contact } from "@/lib/types";

type AgendaRow = Company & { contacts: Contact[] };

function fmtData(iso: string | null): string {
  if (!iso) return "—";
  // next_followup vem como 'YYYY-MM-DD'; evita fuso montando a data local.
  const [y, m, d] = iso.slice(0, 10).split("-");
  return `${d}/${m}/${y}`;
}

export default function AgendaAberta() {
  const [agendas, setAgendas] = useState<AgendaRow[]>([]);
  const [msg, setMsg] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  // formulário
  const [name, setName] = useState("");
  const [contactName, setContactName] = useState("");
  const [email, setEmail] = useState("");
  const [ccEmails, setCcEmails] = useState("");
  const [phone, setPhone] = useState("");
  const [briefing, setBriefing] = useState("");

  async function load() {
    const r = await fetch("/api/agenda");
    const d = await r.json();
    if (d.error) setMsg(d.error);
    else setAgendas(d.agendas);
  }

  useEffect(() => {
    load();
  }, []);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setMsg(null);
    try {
      const r = await fetch("/api/agenda", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name,
          contactName,
          email,
          ccEmails,
          phone,
          briefing,
        }),
      });
      const d = await r.json();
      if (d.error) {
        setMsg(`Erro: ${d.error}`);
      } else {
        setMsg(
          "Operadora cadastrada na Agenda Aberta — 1º informativo gerado. Veja em Rascunhos.",
        );
        setName("");
        setContactName("");
        setEmail("");
        setCcEmails("");
        setPhone("");
        setBriefing("");
        await load();
      }
    } catch (err) {
      setMsg(String(err));
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="space-y-6">
      <form
        onSubmit={submit}
        className="rounded-lg border border-gray-200 bg-white p-4 shadow-sm"
      >
        <h2 className="mb-1 font-semibold text-gray-800">
          Agenda Aberta — informativo para operadoras
        </h2>
        <p className="mb-3 text-xs text-gray-500">
          Avisa as operadoras parceiras que a MenthalHelp está com{" "}
          <b>agenda aberta</b>, para aumentar a visibilidade e receber mais
          encaminhamentos. O informativo é <b>reenviado a cada 15 dias</b>,
          automaticamente e por tempo indeterminado — com uma mensagem diferente
          a cada vez, sempre reforçando nossas unidades (Guarulhos, Zona Norte /
          Tucuruvi, Zona Sul / Interlagos, Bragança Paulista e Barueri /
          Alphaville). Nada é enviado sem o seu clique final em Rascunhos.
        </p>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <label className="text-sm">
            <span className="text-gray-600">Operadora</span>
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="ex: Amil, Bradesco Saúde…"
              className="mt-1 w-full rounded-md border border-gray-300 px-3 py-2"
              required
            />
          </label>
          <label className="text-sm">
            <span className="text-gray-600">Pessoa responsável</span>
            <input
              value={contactName}
              onChange={(e) => setContactName(e.target.value)}
              placeholder="ex: Maria (relacionamento)"
              className="mt-1 w-full rounded-md border border-gray-300 px-3 py-2"
            />
          </label>
          <label className="text-sm">
            <span className="text-gray-600">E-mail (destinatário principal)</span>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="mt-1 w-full rounded-md border border-gray-300 px-3 py-2"
            />
          </label>
          <label className="text-sm">
            <span className="text-gray-600">Telefone / WhatsApp</span>
            <input
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              placeholder="ex: 11 99999-9999"
              className="mt-1 w-full rounded-md border border-gray-300 px-3 py-2"
            />
          </label>
          <label className="text-sm sm:col-span-2">
            <span className="text-gray-600">Em cópia (CC) — opcional</span>
            <input
              value={ccEmails}
              onChange={(e) => setCcEmails(e.target.value)}
              placeholder="outros e-mails, separados por vírgula"
              className="mt-1 w-full rounded-md border border-gray-300 px-3 py-2"
            />
          </label>
          <label className="text-sm sm:col-span-2">
            <span className="text-gray-600">
              Copy — o foco do informativo desta operadora
            </span>
            <textarea
              value={briefing}
              onChange={(e) => setBriefing(e.target.value)}
              rows={3}
              placeholder="ex: Reforçar que estamos com agenda aberta em Fonoaudiologia e Terapia Ocupacional TEA/ABA nas unidades de Guarulhos e Alphaville. Nos colocar à disposição para agilizar os encaminhamentos."
              className="mt-1 w-full rounded-md border border-gray-300 px-3 py-2"
            />
          </label>
        </div>
        <button
          type="submit"
          disabled={saving}
          className="mt-4 rounded-md bg-brand-500 px-4 py-2 text-sm font-medium text-white hover:bg-brand-600 disabled:opacity-50"
        >
          {saving ? "Cadastrando…" : "Cadastrar e gerar informativo"}
        </button>
        {msg && <p className="mt-3 text-sm text-gray-600">{msg}</p>}
      </form>

      <section>
        <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-gray-500">
          Operadoras na Agenda Aberta ({agendas.length})
        </h2>
        <div className="space-y-3">
          {agendas.length === 0 && (
            <p className="text-sm text-gray-500">
              Nenhuma operadora cadastrada nesta frente ainda.
            </p>
          )}
          {agendas.map((a) => (
            <AgendaCard key={a.id} agenda={a} onChanged={load} />
          ))}
        </div>
      </section>
    </div>
  );
}

function AgendaCard({
  agenda,
  onChanged,
}: {
  agenda: AgendaRow;
  onChanged: () => void;
}) {
  const contact = agenda.contacts?.[0];
  const [busy, setBusy] = useState(false);
  const [showEdit, setShowEdit] = useState(false);
  const [eName, setEName] = useState(agenda.name);
  const [eContact, setEContact] = useState(contact?.name ?? "");
  const [eEmail, setEEmail] = useState(contact?.email ?? "");
  const [eCc, setECc] = useState(agenda.cc_emails ?? "");
  const [ePhone, setEPhone] = useState(contact?.phone ?? "");
  const [eBriefing, setEBriefing] = useState(agenda.briefing ?? "");

  async function salvar() {
    setBusy(true);
    try {
      await fetch(`/api/agenda/${agenda.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: eName,
          contactName: eContact,
          email: eEmail,
          ccEmails: eCc,
          phone: ePhone,
          briefing: eBriefing,
        }),
      });
      setShowEdit(false);
      onChanged();
    } finally {
      setBusy(false);
    }
  }

  async function excluir() {
    if (
      !confirm(
        `Excluir "${agenda.name}" da Agenda Aberta? Isso apaga os rascunhos e o histórico dela. Não dá para desfazer.`,
      )
    )
      return;
    setBusy(true);
    try {
      await fetch(`/api/agenda/${agenda.id}`, { method: "DELETE" });
      onChanged();
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="rounded-lg border border-gray-200 bg-white p-4 shadow-sm">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="font-medium text-gray-900">{agenda.name}</p>
          <p className="text-xs text-gray-500">
            {contact?.name ?? "Sem contato"}
            {contact?.email ? ` · ${contact.email}` : ""}
            {contact?.phone ? ` · ${contact.phone}` : ""}
          </p>
          {agenda.cc_emails && (
            <p className="text-xs text-gray-500">Em cópia: {agenda.cc_emails}</p>
          )}
          {agenda.briefing && (
            <p className="mt-1 text-xs text-gray-400">
              Copy: {agenda.briefing}
            </p>
          )}
          <p className="mt-1 text-xs font-medium text-amber-700">
            🔁 Próximo informativo (a cada 15 dias): {fmtData(agenda.next_followup)}
          </p>
        </div>
        <div className="flex flex-col items-end gap-1">
          <button
            onClick={() => setShowEdit((v) => !v)}
            disabled={busy}
            className="text-xs text-brand-600 underline hover:text-brand-700 disabled:opacity-50"
          >
            {showEdit ? "Fechar" : "Editar"}
          </button>
          <button
            onClick={excluir}
            disabled={busy}
            className="text-xs text-red-600 underline hover:text-red-700 disabled:opacity-50"
          >
            Excluir
          </button>
        </div>
      </div>

      {showEdit && (
        <div className="mt-3 grid grid-cols-1 gap-2 rounded-md border border-gray-200 bg-gray-50 p-3 sm:grid-cols-2">
          <label className="text-xs text-gray-600">
            Operadora
            <input
              value={eName}
              onChange={(e) => setEName(e.target.value)}
              className="mt-1 w-full rounded-md border border-gray-300 px-2 py-1.5 text-sm"
            />
          </label>
          <label className="text-xs text-gray-600">
            Pessoa responsável
            <input
              value={eContact}
              onChange={(e) => setEContact(e.target.value)}
              className="mt-1 w-full rounded-md border border-gray-300 px-2 py-1.5 text-sm"
            />
          </label>
          <label className="text-xs text-gray-600">
            E-mail (destinatário principal)
            <input
              value={eEmail}
              onChange={(e) => setEEmail(e.target.value)}
              className="mt-1 w-full rounded-md border border-gray-300 px-2 py-1.5 text-sm"
            />
          </label>
          <label className="text-xs text-gray-600">
            Telefone / WhatsApp
            <input
              value={ePhone}
              onChange={(e) => setEPhone(e.target.value)}
              className="mt-1 w-full rounded-md border border-gray-300 px-2 py-1.5 text-sm"
            />
          </label>
          <label className="text-xs text-gray-600 sm:col-span-2">
            Em cópia (CC) — opcional
            <input
              value={eCc}
              onChange={(e) => setECc(e.target.value)}
              placeholder="outros e-mails, separados por vírgula"
              className="mt-1 w-full rounded-md border border-gray-300 px-2 py-1.5 text-sm"
            />
          </label>
          <label className="text-xs text-gray-600 sm:col-span-2">
            Copy — o foco do informativo
            <textarea
              value={eBriefing}
              onChange={(e) => setEBriefing(e.target.value)}
              rows={3}
              className="mt-1 w-full rounded-md border border-gray-300 px-2 py-1.5 text-sm"
            />
          </label>
          <div className="sm:col-span-2">
            <button
              onClick={salvar}
              disabled={busy}
              className="rounded-md bg-brand-500 px-3 py-1.5 text-sm font-medium text-white hover:bg-brand-600 disabled:opacity-50"
            >
              {busy ? "Salvando…" : "Salvar"}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
