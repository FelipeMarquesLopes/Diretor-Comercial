"use client";

// OPERADORAS ATIVAS — banco de cadastro das operadoras em que JÁ somos
// credenciados. Primeiro você só CADASTRA (operadora + analista + e-mail +
// telefone), sem disparar nada. Quando precisar tratar um assunto (extensão de
// procedimento/unidade, dúvida de regra/pedido, etc.), clica em "Iniciar
// relacionamento": escreve a copy do assunto, confirma o e-mail e o CC, e gera
// o rascunho — que entra na automação de 72h como de costume.

import { useEffect, useState } from "react";
import type { Company, Contact, Sequence } from "@/lib/types";
import { SEQUENCE_STATUS_LABELS } from "@/lib/types";

type Row = Company & { contacts: Contact[]; sequences: Sequence[] };

export function OperadorasAtivas() {
  const [lista, setLista] = useState<Row[]>([]);
  const [msg, setMsg] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const [name, setName] = useState("");
  const [analista, setAnalista] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [notes, setNotes] = useState("");

  async function load() {
    try {
      const r = await fetch("/api/operadoras?categoria=operadora");
      const d = await r.json();
      if (d.error) {
        setMsg(d.error);
        return;
      }
      const ativas = ((d.operadoras ?? []) as Row[]).filter(
        (o) => (o.operator_type ?? "nova") === "ativa",
      );
      setLista(ativas);
    } catch (e) {
      setMsg(String(e));
    }
  }
  useEffect(() => {
    load();
  }, []);

  async function cadastrar(e: React.FormEvent) {
    e.preventDefault();
    if (name.trim().length < 2) {
      setMsg("Informe o nome da operadora.");
      return;
    }
    setSaving(true);
    setMsg(null);
    try {
      const r = await fetch("/api/operadoras", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          categoria: "operadora",
          operatorType: "ativa",
          cadastroApenas: true,
          name: name.trim(),
          contactName: analista.trim() || undefined,
          email: email.trim() || undefined,
          phone: phone.trim() || undefined,
          isWhatsapp: false,
          notes: notes.trim() || undefined,
        }),
      });
      const d = await r.json();
      if (d.error) setMsg(`Erro: ${d.error}`);
      else {
        setMsg("Operadora cadastrada (sem disparo). Use 'Iniciar relacionamento' quando quiser tratar um assunto.");
        setName("");
        setAnalista("");
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
        onSubmit={cadastrar}
        className="rounded-lg border border-gray-200 bg-white p-4 shadow-sm"
      >
        <h2 className="mb-1 font-semibold text-gray-800">
          Cadastrar operadora ativa (já credenciados)
        </h2>
        <p className="mb-3 text-xs text-gray-500">
          Só cadastro — nada é enviado agora. Guarde a operadora, o analista, o
          e-mail e o telefone. Quando precisar tratar algo, use{" "}
          <b>Iniciar relacionamento</b> no card.
        </p>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <label className="text-sm">
            <span className="text-gray-600">Operadora *</span>
            <input
              required
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="ex: Amil, SulAmérica Saúde…"
              className="mt-1 w-full rounded-md border border-gray-300 px-3 py-2"
            />
          </label>
          <label className="text-sm">
            <span className="text-gray-600">Analista / contato</span>
            <input
              value={analista}
              onChange={(e) => setAnalista(e.target.value)}
              placeholder="ex: Márcia Regina"
              className="mt-1 w-full rounded-md border border-gray-300 px-3 py-2"
            />
          </label>
          <label className="text-sm">
            <span className="text-gray-600">E-mail do analista</span>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="ex: marcia@amil.com.br"
              className="mt-1 w-full rounded-md border border-gray-300 px-3 py-2"
            />
          </label>
          <label className="text-sm">
            <span className="text-gray-600">Telefone</span>
            <input
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              placeholder="ex: 11 99999-9999"
              className="mt-1 w-full rounded-md border border-gray-300 px-3 py-2"
            />
          </label>
          <label className="text-sm sm:col-span-2">
            <span className="text-gray-600">Observações internas (opcional)</span>
            <input
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="ex: código de prestador, unidades credenciadas…"
              className="mt-1 w-full rounded-md border border-gray-300 px-3 py-2"
            />
          </label>
        </div>
        <button
          type="submit"
          disabled={saving}
          className="mt-4 rounded-md bg-brand-500 px-4 py-2 text-sm font-medium text-white hover:bg-brand-600 disabled:opacity-50"
        >
          {saving ? "Salvando…" : "Cadastrar operadora"}
        </button>
        {msg && <p className="mt-3 text-sm text-gray-600">{msg}</p>}
      </form>

      <section className="space-y-3">
        <h2 className="text-sm font-semibold text-brand-800">
          {lista.length} operadora(s) ativa(s) cadastrada(s)
        </h2>
        {lista.length === 0 ? (
          <p className="text-sm text-gray-500">
            Nenhuma operadora ativa ainda. Cadastre a primeira acima.
          </p>
        ) : (
          lista.map((op) => <AtivaCard key={op.id} op={op} onChanged={load} />)
        )}
      </section>
    </div>
  );
}

function AtivaCard({ op, onChanged }: { op: Row; onChanged: () => void }) {
  const contato = op.contacts?.[0];
  const seq = op.sequences?.find((s) => s.channel === "email");

  const [showRel, setShowRel] = useState(false);
  const [showEdit, setShowEdit] = useState(false);
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState<string | null>(null);

  // Iniciar relacionamento
  const [briefing, setBriefing] = useState("");
  const [relEmail, setRelEmail] = useState(contato?.email ?? "");
  const [relCc, setRelCc] = useState(op.cc_emails ?? "");

  // Edição do cadastro
  const [eName, setEName] = useState(op.name);
  const [eAnalista, setEAnalista] = useState(contato?.name ?? "");
  const [eEmail, setEEmail] = useState(contato?.email ?? "");
  const [ePhone, setEPhone] = useState(contato?.phone ?? "");

  async function iniciarRelacionamento() {
    if (briefing.trim().length < 3) {
      setNote("Escreva o assunto que você quer tratar (a copy).");
      return;
    }
    setBusy(true);
    setNote("Gerando o rascunho com a IA…");
    try {
      const r = await fetch(`/api/operadoras/${op.id}/relacionamento`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          briefing: briefing.trim(),
          email: relEmail.trim() || undefined,
          cc: relCc.trim() || undefined,
        }),
      });
      const d = await r.json();
      if (d.error) {
        setNote(`Erro: ${d.error}`);
        return;
      }
      setNote(
        d.rascunhoOk
          ? `Rascunho gerado para ${d.destino} — aprove na aba Rascunhos. A partir daí entra no follow-up de 72h.`
          : "Relacionamento iniciado, mas a IA não gerou o rascunho agora. Tente de novo em instantes.",
      );
      setBriefing("");
      setShowRel(false);
      onChanged();
    } catch (e) {
      setNote(String(e));
    } finally {
      setBusy(false);
    }
  }

  async function salvarEdicao() {
    setBusy(true);
    try {
      const r = await fetch(`/api/operadoras/${op.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: eName,
          contactName: eAnalista,
          email: eEmail,
          phone: ePhone,
        }),
      });
      const d = await r.json().catch(() => ({}));
      if (d.error) setNote(`Erro: ${d.error}`);
      else {
        setShowEdit(false);
        onChanged();
      }
    } finally {
      setBusy(false);
    }
  }

  async function excluir() {
    if (!confirm(`Excluir a operadora "${op.name}"? Apaga o histórico e os rascunhos dela.`))
      return;
    setBusy(true);
    try {
      await fetch(`/api/operadoras/${op.id}`, { method: "DELETE" });
      onChanged();
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="rounded-xl border border-brand-100 bg-white p-4 shadow-card">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <span className="font-semibold text-brand-800">{op.name}</span>
            <span className="rounded-full bg-green-100 px-2 py-0.5 text-[11px] font-medium text-green-700">
              ativa
            </span>
            {seq && (
              <span className="rounded-full bg-amber-100 px-2 py-0.5 text-[11px] font-medium text-amber-700">
                E-mail: {SEQUENCE_STATUS_LABELS[seq.status] ?? seq.status}
                {typeof seq.step === "number" && seq.step > 0 ? ` · ${seq.step} envio(s)` : ""}
              </span>
            )}
          </div>
          <p className="mt-1 text-xs text-brand-800/70">
            {contato?.name ? <b>{contato.name}</b> : "Sem analista"}
            {contato?.email ? ` · ${contato.email}` : " · sem e-mail"}
            {contato?.phone ? ` · ${contato.phone}` : ""}
          </p>
          {op.notes && <p className="mt-1 text-[11px] text-brand-800/50">{op.notes}</p>}
        </div>
        <div className="flex shrink-0 items-center gap-2 text-xs">
          <button onClick={() => setShowEdit((v) => !v)} className="text-brand-600 hover:underline">
            Editar
          </button>
          <button onClick={excluir} className="text-brand-400 hover:text-red-500">
            Excluir
          </button>
        </div>
      </div>

      {/* Ação principal */}
      <div className="mt-3">
        <button
          onClick={() => {
            setShowRel((v) => !v);
            setRelEmail(contato?.email ?? "");
            setRelCc(op.cc_emails ?? "");
          }}
          className="rounded-md bg-brand-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-brand-700"
        >
          {showRel ? "Fechar" : "▶ Iniciar relacionamento"}
        </button>
      </div>

      {/* Painel: iniciar relacionamento */}
      {showRel && (
        <div className="mt-3 space-y-2 rounded-lg border border-brand-100 bg-brand-50/40 p-3">
          <label className="block text-xs font-medium text-brand-800/70">
            Qual assunto você quer tratar? (a copy — a IA monta o e-mail a partir disso)
            <textarea
              value={briefing}
              onChange={(e) => setBriefing(e.target.value)}
              rows={3}
              placeholder="ex: Pedir extensão de Musicoterapia e Psicomotricidade (TEA) para as unidades de Guarulhos e Alphaville; nosso código de prestador é 69989826."
              className="mt-1 w-full rounded-md border border-gray-300 px-3 py-2 text-sm"
            />
          </label>
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
            <label className="block text-xs font-medium text-brand-800/70">
              Confirmar e-mail do destinatário
              <input
                type="email"
                value={relEmail}
                onChange={(e) => setRelEmail(e.target.value)}
                placeholder="e-mail do analista"
                className="mt-1 w-full rounded-md border border-gray-300 px-3 py-2 text-sm"
              />
            </label>
            <label className="block text-xs font-medium text-brand-800/70">
              Em cópia (CC) — opcional
              <input
                value={relCc}
                onChange={(e) => setRelCc(e.target.value)}
                placeholder="outros e-mails, separados por vírgula"
                className="mt-1 w-full rounded-md border border-gray-300 px-3 py-2 text-sm"
              />
            </label>
          </div>
          <button
            onClick={iniciarRelacionamento}
            disabled={busy}
            className="rounded-md bg-brand-600 px-3 py-2 text-sm font-medium text-white hover:bg-brand-700 disabled:opacity-50"
          >
            {busy ? "Gerando…" : "Gerar rascunho e iniciar follow-up"}
          </button>
        </div>
      )}

      {/* Painel: editar cadastro */}
      {showEdit && (
        <div className="mt-3 grid grid-cols-1 gap-2 rounded-lg border border-brand-100 bg-gray-50 p-3 sm:grid-cols-2">
          <label className="text-xs text-gray-600">
            Operadora
            <input value={eName} onChange={(e) => setEName(e.target.value)} className="mt-1 w-full rounded-md border border-gray-300 px-2 py-1.5 text-sm" />
          </label>
          <label className="text-xs text-gray-600">
            Analista
            <input value={eAnalista} onChange={(e) => setEAnalista(e.target.value)} className="mt-1 w-full rounded-md border border-gray-300 px-2 py-1.5 text-sm" />
          </label>
          <label className="text-xs text-gray-600">
            E-mail
            <input value={eEmail} onChange={(e) => setEEmail(e.target.value)} className="mt-1 w-full rounded-md border border-gray-300 px-2 py-1.5 text-sm" />
          </label>
          <label className="text-xs text-gray-600">
            Telefone
            <input value={ePhone} onChange={(e) => setEPhone(e.target.value)} className="mt-1 w-full rounded-md border border-gray-300 px-2 py-1.5 text-sm" />
          </label>
          <div className="sm:col-span-2">
            <button onClick={salvarEdicao} disabled={busy} className="rounded-md bg-brand-500 px-3 py-1.5 text-xs font-medium text-white hover:bg-brand-600 disabled:opacity-50">
              {busy ? "Salvando…" : "Salvar"}
            </button>
          </div>
        </div>
      )}

      {note && <p className="mt-2 text-xs text-brand-800/70">{note}</p>}
    </div>
  );
}
