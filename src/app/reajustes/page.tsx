"use client";

import { useEffect, useRef, useState } from "react";
import type { Company, Contact } from "@/lib/types";

type ReajusteRow = Company & { contacts: Contact[] };

export default function Reajustes() {
  const [rows, setRows] = useState<ReajusteRow[]>([]);
  const [msg, setMsg] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const [name, setName] = useState("");
  const [contactName, setContactName] = useState("");
  const [email, setEmail] = useState("");
  const [ccEmails, setCcEmails] = useState("");
  const [phone, setPhone] = useState("");
  const [briefing, setBriefing] = useState("");

  async function load() {
    const r = await fetch("/api/reajustes");
    const d = await r.json();
    if (d.error) setMsg(d.error);
    else setRows(d.reajustes);
  }

  useEffect(() => {
    load();
  }, []);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setMsg(null);
    try {
      const r = await fetch("/api/reajustes", {
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
          "Operadora cadastrada. Agora anexe o contrato dela abaixo para a IA analisar o reajuste.",
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
          Reajustes — pedido embasado no contrato
        </h2>
        <p className="mb-3 text-xs text-gray-500">
          Cadastre a operadora e o responsável. Depois <b>anexe o contrato</b>{" "}
          (PDF): a IA analisa a cláusula de reajuste como jurídico + comercial e
          sugere <b>o percentual</b> e <b>a janela/data ideal</b> para pedir. O
          e-mail do pedido é gerado com esse embasamento — você revisa e dispara.
          A cobrança segue <b>a cada 72h</b> até uma resposta clara (um &quot;vamos
          analisar&quot; conta como neutro, então seguimos cobrando).
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
              placeholder="ex: setor de credenciamento/contratos"
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
              Orientação (copy) — opcional
            </span>
            <textarea
              value={briefing}
              onChange={(e) => setBriefing(e.target.value)}
              rows={2}
              placeholder="ex: Pleitear o reajuste anual conforme cláusula. Se possível, reforçar o histórico de bom atendimento."
              className="mt-1 w-full rounded-md border border-gray-300 px-3 py-2"
            />
          </label>
        </div>
        <button
          type="submit"
          disabled={saving}
          className="mt-4 rounded-md bg-brand-500 px-4 py-2 text-sm font-medium text-white hover:bg-brand-600 disabled:opacity-50"
        >
          {saving ? "Cadastrando…" : "Cadastrar operadora"}
        </button>
        {msg && <p className="mt-3 text-sm text-gray-600">{msg}</p>}
      </form>

      <section>
        <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-gray-500">
          Operadoras em reajuste ({rows.length})
        </h2>
        <div className="space-y-3">
          {rows.length === 0 && (
            <p className="text-sm text-gray-500">
              Nenhuma operadora cadastrada nesta frente ainda.
            </p>
          )}
          {rows.map((r) => (
            <ReajusteCard key={r.id} row={r} onChanged={load} />
          ))}
        </div>
      </section>
    </div>
  );
}

function ReajusteCard({
  row,
  onChanged,
}: {
  row: ReajusteRow;
  onChanged: () => void;
}) {
  const contact = row.contacts?.[0];
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  async function analisarContrato() {
    const files = fileRef.current?.files;
    if (!files || files.length === 0) {
      setNote("Escolha o(s) arquivo(s) do contrato (PDF) primeiro.");
      return;
    }
    let total = 0;
    for (const f of Array.from(files)) total += f.size;
    if (total > 4 * 1024 * 1024) {
      setNote(
        "⚠️ Os PDFs somados passam de 4MB e o upload pode falhar. Se der erro, me avise que ajusto o envio.",
      );
    }
    setBusy(true);
    setNote(
      `Analisando ${files.length} documento(s) com a IA… (pode levar até 1 min)`,
    );
    try {
      const fd = new FormData();
      for (const f of Array.from(files)) fd.append("files", f);
      const r = await fetch(`/api/reajustes/${row.id}/contract`, {
        method: "POST",
        body: fd,
      });
      const d = await r.json();
      if (d.error) {
        setNote(`Erro: ${d.error}`);
      } else {
        setNote(
          "✅ Contrato analisado e rascunho do pedido gerado — veja em Rascunhos.",
        );
        onChanged();
      }
    } catch (e) {
      setNote(String(e));
    } finally {
      setBusy(false);
    }
  }

  async function excluir() {
    if (
      !confirm(
        `Excluir "${row.name}" dos Reajustes? Apaga o contrato, os rascunhos e o histórico. Não dá para desfazer.`,
      )
    )
      return;
    setBusy(true);
    try {
      await fetch(`/api/reajustes/${row.id}`, { method: "DELETE" });
      onChanged();
    } finally {
      setBusy(false);
    }
  }

  const temAnalise = Boolean(row.reajuste_percent || row.reajuste_parecer);

  return (
    <div className="rounded-lg border border-gray-200 bg-white p-4 shadow-sm">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="font-medium text-gray-900">{row.name}</p>
          <p className="text-xs text-gray-500">
            {contact?.name ?? "Sem contato"}
            {contact?.email ? ` · ${contact.email}` : ""}
            {contact?.phone ? ` · ${contact.phone}` : ""}
          </p>
          {row.cc_emails && (
            <p className="text-xs text-gray-500">Em cópia: {row.cc_emails}</p>
          )}
        </div>
        <button
          onClick={excluir}
          disabled={busy}
          className="text-xs text-red-600 underline hover:text-red-700 disabled:opacity-50"
        >
          Excluir
        </button>
      </div>

      {/* Parecer da IA (quando já analisado) */}
      {temAnalise && (
        <div className="mt-3 rounded-md border border-brand-100 bg-brand-50 p-3 text-sm">
          <p className="mb-1 text-xs font-semibold uppercase tracking-wide text-brand-700">
            Parecer da IA (revise antes de disparar)
          </p>
          {row.contract_name && (
            <p className="text-xs text-gray-500">
              Contrato: {row.contract_name}
            </p>
          )}
          <p className="mt-1">
            <span className="text-gray-500">Percentual sugerido: </span>
            <span className="font-medium text-gray-800">
              {row.reajuste_percent}
            </span>
          </p>
          <p>
            <span className="text-gray-500">Janela ideal: </span>
            <span className="font-medium text-gray-800">
              {row.reajuste_janela}
            </span>
          </p>
          {row.reajuste_parecer && (
            <p className="mt-1 text-gray-700">{row.reajuste_parecer}</p>
          )}
        </div>
      )}

      {/* Anexar / reanalisar contrato */}
      <div className="mt-3 rounded-md border border-gray-100 bg-gray-50 p-2">
        <p className="mb-1 text-xs text-gray-500">
          {temAnalise
            ? "Reanalisar: anexe o contrato e os adendos/aditivos (pode selecionar vários PDFs):"
            : "Anexe o contrato e os adendos/aditivos (pode selecionar vários PDFs de uma vez):"}
        </p>
        <div className="flex flex-wrap items-center gap-2">
          <input
            ref={fileRef}
            type="file"
            accept="application/pdf,.pdf"
            multiple
            className="text-xs"
          />
          <button
            onClick={analisarContrato}
            disabled={busy}
            className="rounded-md bg-brand-500 px-3 py-1.5 text-sm font-medium text-white hover:bg-brand-600 disabled:opacity-50"
          >
            {busy ? "Analisando…" : "Analisar contrato"}
          </button>
        </div>
        {note && <p className="mt-2 text-xs text-gray-600">{note}</p>}
      </div>
    </div>
  );
}
