"use client";

import { useEffect, useState } from "react";
import type { Company, Contact, Sequence, SequenceChannel } from "@/lib/types";
import { SEQUENCE_STATUS_LABELS } from "@/lib/types";

type OperadoraRow = Company & {
  contacts: Contact[];
  sequences: Sequence[];
};

export default function Operadoras() {
  const [operadoras, setOperadoras] = useState<OperadoraRow[]>([]);
  const [msg, setMsg] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  // formulário
  const [name, setName] = useState("");
  const [contactName, setContactName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [isWhatsapp, setIsWhatsapp] = useState(true);
  const [notes, setNotes] = useState("");

  async function load() {
    const r = await fetch("/api/operadoras");
    const d = await r.json();
    if (d.error) setMsg(d.error);
    else setOperadoras(d.operadoras);
  }

  useEffect(() => {
    load();
  }, []);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setMsg(null);
    try {
      const r = await fetch("/api/operadoras", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name,
          contactName,
          email,
          phone,
          isWhatsapp,
          notes,
        }),
      });
      const d = await r.json();
      if (d.error) {
        setMsg(`Erro: ${d.error}`);
      } else {
        setMsg("Operadora cadastrada — rascunhos gerados. Veja em Rascunhos.");
        setName("");
        setContactName("");
        setEmail("");
        setPhone("");
        setNotes("");
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
          Cadastrar operadora de saúde
        </h2>
        <p className="mb-3 text-xs text-gray-500">
          Preencha os dados da pessoa responsável. A IA já monta o rascunho de
          e-mail (e de WhatsApp, se houver número). Você aprova em Rascunhos.
        </p>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <label className="text-sm">
            <span className="text-gray-600">Operadora *</span>
            <input
              required
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="ex: Bradesco Saúde"
              className="mt-1 w-full rounded-md border border-gray-300 px-3 py-2"
            />
          </label>
          <label className="text-sm">
            <span className="text-gray-600">Pessoa responsável</span>
            <input
              value={contactName}
              onChange={(e) => setContactName(e.target.value)}
              placeholder="ex: Maria (credenciamento)"
              className="mt-1 w-full rounded-md border border-gray-300 px-3 py-2"
            />
          </label>
          <label className="text-sm">
            <span className="text-gray-600">E-mail</span>
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
          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={isWhatsapp}
              onChange={(e) => setIsWhatsapp(e.target.checked)}
            />
            <span className="text-gray-600">Este número tem WhatsApp</span>
          </label>
          <label className="text-sm sm:col-span-2">
            <span className="text-gray-600">Observações</span>
            <input
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              className="mt-1 w-full rounded-md border border-gray-300 px-3 py-2"
            />
          </label>
        </div>
        <button
          type="submit"
          disabled={saving}
          className="mt-4 rounded-md bg-brand-500 px-4 py-2 text-sm font-medium text-white hover:bg-brand-600 disabled:opacity-50"
        >
          {saving ? "Salvando…" : "Cadastrar e gerar rascunhos"}
        </button>
        {msg && <p className="mt-3 text-sm text-gray-600">{msg}</p>}
      </form>

      <section>
        <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-gray-500">
          Operadoras cadastradas ({operadoras.length})
        </h2>
        <div className="space-y-3">
          {operadoras.length === 0 && (
            <p className="text-sm text-gray-500">Nenhuma operadora ainda.</p>
          )}
          {operadoras.map((o) => (
            <OperadoraCard key={o.id} op={o} onChanged={load} />
          ))}
        </div>
      </section>
    </div>
  );
}

function OperadoraCard({ op, onChanged }: { op: OperadoraRow; onChanged: () => void }) {
  const [showResp, setShowResp] = useState(false);
  const [respText, setRespText] = useState("");
  const [respChannel, setRespChannel] = useState<SequenceChannel>("email");
  const [busy, setBusy] = useState(false);
  const contact = op.contacts?.[0];

  // edição da operadora
  const [showEdit, setShowEdit] = useState(false);
  const [eName, setEName] = useState(op.name);
  const [eContact, setEContact] = useState(contact?.name ?? "");
  const [eEmail, setEEmail] = useState(contact?.email ?? "");
  const [ePhone, setEPhone] = useState(contact?.phone ?? "");
  const [eWhats, setEWhats] = useState(contact?.is_whatsapp ?? false);
  const [eNotes, setENotes] = useState(op.notes ?? "");

  async function salvarEdicao() {
    setBusy(true);
    try {
      await fetch(`/api/operadoras/${op.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: eName,
          contactName: eContact,
          email: eEmail,
          phone: ePhone,
          isWhatsapp: eWhats,
          notes: eNotes,
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
        `Excluir a operadora "${op.name}"? Isso apaga também os rascunhos e o histórico dela. Não dá para desfazer.`,
      )
    )
      return;
    setBusy(true);
    try {
      await fetch(`/api/operadoras/${op.id}`, { method: "DELETE" });
      onChanged();
    } finally {
      setBusy(false);
    }
  }

  async function registrarResposta() {
    if (!respText.trim()) return;
    setBusy(true);
    try {
      await fetch("/api/responses", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          companyId: op.id,
          channel: respChannel,
          text: respText,
        }),
      });
      setRespText("");
      setShowResp(false);
      onChanged();
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="rounded-lg border border-gray-200 bg-white p-4 shadow-sm">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="font-medium text-gray-900">{op.name}</p>
          {contact && (
            <p className="text-xs text-gray-500">
              {contact.name}
              {contact.email ? ` · ${contact.email}` : ""}
              {contact.phone ? ` · ${contact.phone}` : ""}
              {contact.is_whatsapp ? " (WhatsApp)" : ""}
            </p>
          )}
        </div>
        <div className="flex items-center gap-2">
          <span className="rounded-full bg-brand-100 px-2 py-0.5 text-xs font-medium text-brand-700">
            {op.status}
          </span>
          <button
            onClick={() => setShowEdit((v) => !v)}
            className="text-xs text-gray-500 underline hover:text-gray-700"
          >
            Editar
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
        <div className="mt-3 space-y-2 rounded-md border border-gray-200 bg-gray-50 p-3">
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
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
              E-mail
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
            <label className="flex items-center gap-2 text-xs text-gray-600">
              <input
                type="checkbox"
                checked={eWhats}
                onChange={(e) => setEWhats(e.target.checked)}
              />
              Este número tem WhatsApp
            </label>
            <label className="text-xs text-gray-600 sm:col-span-2">
              Observações
              <input
                value={eNotes}
                onChange={(e) => setENotes(e.target.value)}
                className="mt-1 w-full rounded-md border border-gray-300 px-2 py-1.5 text-sm"
              />
            </label>
          </div>
          <div className="flex gap-2">
            <button
              onClick={salvarEdicao}
              disabled={busy}
              className="rounded-md bg-brand-500 px-3 py-1.5 text-sm font-medium text-white hover:bg-brand-600 disabled:opacity-50"
            >
              {busy ? "Salvando…" : "Salvar"}
            </button>
            <button
              onClick={() => setShowEdit(false)}
              className="rounded-md border border-gray-300 px-3 py-1.5 text-sm text-gray-600"
            >
              Cancelar
            </button>
          </div>
        </div>
      )}

      <div className="mt-3 flex flex-wrap gap-2">
        {op.sequences
          ?.sort((a, b) => a.channel.localeCompare(b.channel))
          .map((s) => (
            <span
              key={s.id}
              className={`rounded-md px-2 py-1 text-xs ${
                s.status === "aguardando_ceo"
                  ? "bg-green-100 text-green-800"
                  : s.status === "pausada_negativa"
                    ? "bg-gray-100 text-gray-600"
                    : "bg-amber-100 text-amber-800"
              }`}
            >
              {s.channel === "email" ? "E-mail" : "WhatsApp"}:{" "}
              {SEQUENCE_STATUS_LABELS[s.status]}
              {s.step > 0 ? ` · ${s.step} envio(s)` : ""}
            </span>
          ))}
      </div>

      <div className="mt-3">
        {!showResp ? (
          <button
            onClick={() => setShowResp(true)}
            className="text-xs text-brand-600 underline"
          >
            Registrar resposta recebida
          </button>
        ) : (
          <div className="space-y-2 rounded-md border border-gray-200 p-3">
            <div className="flex items-center gap-2">
              <select
                value={respChannel}
                onChange={(e) => setRespChannel(e.target.value as SequenceChannel)}
                className="rounded-md border border-gray-300 px-2 py-1 text-sm"
              >
                <option value="email">E-mail</option>
                <option value="whatsapp">WhatsApp</option>
              </select>
              <span className="text-xs text-gray-500">
                A IA vai entender se foi positivo, negativo ou neutro.
              </span>
            </div>
            <textarea
              value={respText}
              onChange={(e) => setRespText(e.target.value)}
              rows={3}
              placeholder="Cole aqui o que a pessoa respondeu…"
              className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm"
            />
            <div className="flex gap-2">
              <button
                onClick={registrarResposta}
                disabled={busy}
                className="rounded-md bg-brand-500 px-3 py-1.5 text-sm font-medium text-white hover:bg-brand-600 disabled:opacity-50"
              >
                Registrar
              </button>
              <button
                onClick={() => setShowResp(false)}
                className="rounded-md border border-gray-300 px-3 py-1.5 text-sm text-gray-600"
              >
                Cancelar
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
