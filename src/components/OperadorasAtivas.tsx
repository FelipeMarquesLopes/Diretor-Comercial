"use client";

// OPERADORAS ATIVAS — banco de cadastro das operadoras em que JÁ somos
// credenciados, AGRUPADAS por operadora. Cada operadora pode ter VÁRIOS ASSUNTOS
// (tratativas) em aberto ao mesmo tempo — ex: um pedido de extensão de
// procedimento e outra dúvida sobre pedido médico — e cada assunto tem seu
// próprio follow-up de 72h e seu próprio status, separadamente.
//
// Fluxo: você cadastra a operadora (sem disparar nada). Quando precisa tratar
// algo, clica "+ Novo assunto", escreve a copy, confirma o e-mail/CC → gera o
// rascunho (vai para Rascunhos) → entra no follow-up.

import { useEffect, useState } from "react";
import type { Company, Contact, Sequence } from "@/lib/types";
import { SEQUENCE_STATUS_LABELS } from "@/lib/types";

type DraftLite = {
  id: string;
  subject: string | null;
  created_at: string;
  status: string;
};
type Row = Company & {
  contacts: Contact[];
  sequences: Sequence[];
  drafts?: DraftLite[];
};

function norm(s: string) {
  return s
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();
}
function emailSeq(r: Row): Sequence | undefined {
  return r.sequences?.find((s) => s.channel === "email");
}
function assuntoLabel(r: Row): string {
  // 1º: o ASSUNTO do e-mail gerado (subject do rascunho mais recente).
  const drafts = (r.drafts ?? []).filter((d) => d.subject && d.subject.trim());
  if (drafts.length > 0) {
    const maisRecente = drafts
      .slice()
      .sort((a, b) => (b.created_at ?? "").localeCompare(a.created_at ?? ""))[0];
    if (maisRecente?.subject) return maisRecente.subject.trim();
  }
  // 2º: título curto que o CEO deu ao abrir o assunto.
  const m = (r.notes ?? "").match(/^Assunto:\s*(.+)/);
  if (m) return m[1];
  // 3º: 1ª linha da copy (fallback).
  const b = (r.briefing ?? "").trim();
  return b ? b.split("\n")[0].slice(0, 120) : "(assunto do e-mail ainda não gerado)";
}

export function OperadorasAtivas() {
  const [rows, setRows] = useState<Row[]>([]);
  const [msg, setMsg] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const [name, setName] = useState("");
  const [analista, setAnalista] = useState("");
  const [email, setEmail] = useState("");
  const [cc, setCc] = useState("");
  const [celular, setCelular] = useState("");
  const [fixo, setFixo] = useState("");
  const [notes, setNotes] = useState("");

  async function load() {
    try {
      const r = await fetch("/api/operadoras?categoria=operadora");
      const d = await r.json();
      if (d.error) return setMsg(d.error);
      setRows(
        ((d.operadoras ?? []) as Row[]).filter(
          (o) => (o.operator_type ?? "nova") === "ativa",
        ),
      );
    } catch (e) {
      setMsg(String(e));
    }
  }
  useEffect(() => {
    load();
  }, []);

  async function cadastrar(e: React.FormEvent) {
    e.preventDefault();
    if (name.trim().length < 2) return setMsg("Informe o nome da operadora.");
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
          ccEmails: cc.trim() || undefined,
          phone: celular.trim() || undefined,
          phone2: fixo.trim() || undefined,
          isWhatsapp: false,
          notes: notes.trim() || undefined,
        }),
      });
      const d = await r.json();
      if (d.error) setMsg(`Erro: ${d.error}`);
      else {
        setMsg("Operadora cadastrada (sem disparo). Abra um assunto quando quiser tratar algo.");
        setName("");
        setAnalista("");
        setEmail("");
        setCc("");
        setCelular("");
        setFixo("");
        setNotes("");
        await load();
      }
    } catch (err) {
      setMsg(String(err));
    } finally {
      setSaving(false);
    }
  }

  // Agrupa as linhas por nome da operadora.
  const grupos = new Map<string, Row[]>();
  for (const r of rows) {
    const k = norm(r.name);
    (grupos.get(k) ?? grupos.set(k, []).get(k)!).push(r);
  }
  const lista = Array.from(grupos.values()).sort((a, b) =>
    a[0].name.localeCompare(b[0].name, "pt-BR"),
  );

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
          Só cadastro — nada é enviado agora. Depois, em cada operadora, você abre
          um ou mais <b>assuntos</b> (cada um com seu próprio follow-up).
        </p>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <label className="text-sm">
            <span className="text-gray-600">Operadora *</span>
            <input required value={name} onChange={(e) => setName(e.target.value)} placeholder="ex: Amil, SulAmérica Saúde…" className="mt-1 w-full rounded-md border border-gray-300 px-3 py-2" />
          </label>
          <label className="text-sm">
            <span className="text-gray-600">Analista / contato</span>
            <input value={analista} onChange={(e) => setAnalista(e.target.value)} placeholder="ex: Márcia Regina" className="mt-1 w-full rounded-md border border-gray-300 px-3 py-2" />
          </label>
          <label className="text-sm">
            <span className="text-gray-600">E-mail principal (destinatário)</span>
            <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="ex: marcia@amil.com.br" className="mt-1 w-full rounded-md border border-gray-300 px-3 py-2" />
          </label>
          <label className="text-sm sm:col-span-2">
            <span className="text-gray-600">E-mails em cópia (CC) — pode colocar vários</span>
            <input value={cc} onChange={(e) => setCc(e.target.value)} placeholder="separe por vírgula: ana@amil.com.br, joao@amil.com.br" className="mt-1 w-full rounded-md border border-gray-300 px-3 py-2" />
          </label>
          <label className="text-sm">
            <span className="text-gray-600">Celular</span>
            <input value={celular} onChange={(e) => setCelular(e.target.value)} placeholder="ex: 11 99999-9999" className="mt-1 w-full rounded-md border border-gray-300 px-3 py-2" />
          </label>
          <label className="text-sm">
            <span className="text-gray-600">Telefone fixo</span>
            <input value={fixo} onChange={(e) => setFixo(e.target.value)} placeholder="ex: 11 2382-4087" className="mt-1 w-full rounded-md border border-gray-300 px-3 py-2" />
          </label>
          <label className="text-sm sm:col-span-2">
            <span className="text-gray-600">Observações internas (opcional)</span>
            <input value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="ex: código de prestador, unidades credenciadas…" className="mt-1 w-full rounded-md border border-gray-300 px-3 py-2" />
          </label>
        </div>
        <button type="submit" disabled={saving} className="mt-4 rounded-md bg-brand-500 px-4 py-2 text-sm font-medium text-white hover:bg-brand-600 disabled:opacity-50">
          {saving ? "Salvando…" : "Cadastrar operadora"}
        </button>
        {msg && <p className="mt-3 text-sm text-gray-600">{msg}</p>}
      </form>

      <section className="space-y-3">
        <h2 className="text-sm font-semibold text-brand-800">
          {lista.length} operadora(s) ativa(s)
        </h2>
        {lista.length === 0 ? (
          <p className="text-sm text-gray-500">
            Nenhuma operadora ativa ainda. Cadastre a primeira acima.
          </p>
        ) : (
          lista.map((g) => <OperadoraGrupo key={g[0].id} grupo={g} onChanged={load} />)
        )}
      </section>
    </div>
  );
}

function OperadoraGrupo({ grupo, onChanged }: { grupo: Row[]; onChanged: () => void }) {
  // Representante = a "ficha" da operadora (linha sem assunto/sequência, se
  // houver); senão, a primeira. Dela sai o analista e o Editar/Excluir ficha.
  const ficha = grupo.find((r) => !emailSeq(r)) ?? grupo[0];
  const contato =
    ficha.contacts?.[0] ?? grupo.find((r) => r.contacts?.[0])?.contacts?.[0];
  const assuntos = grupo.filter((r) => emailSeq(r) || (r.briefing ?? "").trim());

  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState<string | null>(null);
  const [showNovo, setShowNovo] = useState(false);
  const [showEdit, setShowEdit] = useState(false);

  // Novo assunto
  const [titulo, setTitulo] = useState("");
  const [copy, setCopy] = useState("");
  const [novoEmail, setNovoEmail] = useState(contato?.email ?? "");
  const [novoCc, setNovoCc] = useState("");

  // Editar ficha
  const [eName, setEName] = useState(ficha.name);
  const [eAnalista, setEAnalista] = useState(contato?.name ?? "");
  const [eEmail, setEEmail] = useState(contato?.email ?? "");
  const [eCc, setECc] = useState(ficha.cc_emails ?? "");
  const [ePhone, setEPhone] = useState(contato?.phone ?? "");
  const [ePhone2, setEPhone2] = useState(contato?.phone2 ?? "");

  async function criarAssunto() {
    if (copy.trim().length < 3) return setNote("Escreva o que quer tratar (a copy).");
    setBusy(true);
    setNote("Gerando o rascunho com a IA…");
    try {
      const r = await fetch(`/api/operadoras/${ficha.id}/assunto`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          titulo: titulo.trim() || undefined,
          briefing: copy.trim(),
          email: novoEmail.trim() || undefined,
          cc: novoCc.trim() || undefined,
        }),
      });
      const d = await r.json();
      if (d.error) return setNote(`Erro: ${d.error}`);
      setNote(
        d.rascunhoOk
          ? `Assunto aberto para ${d.email} — aprove o rascunho na aba Rascunhos. Entra no follow-up de 72h.`
          : "Assunto aberto, mas a IA não gerou o rascunho agora. Tente de novo.",
      );
      setTitulo("");
      setCopy("");
      setShowNovo(false);
      onChanged();
    } catch (e) {
      setNote(String(e));
    } finally {
      setBusy(false);
    }
  }

  async function salvarFicha() {
    setBusy(true);
    try {
      const r = await fetch(`/api/operadoras/${ficha.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: eName,
          contactName: eAnalista,
          email: eEmail,
          ccEmails: eCc,
          phone: ePhone,
          phone2: ePhone2,
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

  async function excluirAssunto(id: string) {
    if (!confirm("Excluir este assunto? Apaga o follow-up e os rascunhos dele.")) return;
    setBusy(true);
    try {
      await fetch(`/api/operadoras/${id}`, { method: "DELETE" });
      onChanged();
    } finally {
      setBusy(false);
    }
  }

  async function excluirOperadora() {
    if (!confirm(`Excluir a operadora "${ficha.name}" e TODOS os seus assuntos? Não dá para desfazer.`)) return;
    setBusy(true);
    try {
      for (const r of grupo) {
        await fetch(`/api/operadoras/${r.id}`, { method: "DELETE" });
      }
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
            <span className="text-base font-semibold text-brand-800">{ficha.name}</span>
            <span className="rounded-full bg-green-100 px-2 py-0.5 text-[11px] font-medium text-green-700">
              ativa
            </span>
            <span className="rounded-full bg-brand-50 px-2 py-0.5 text-[11px] text-brand-700">
              {assuntos.length} assunto(s)
            </span>
          </div>
          <p className="mt-1 text-xs text-brand-800/70">
            {contato?.name ? <b>{contato.name}</b> : "Sem analista"}
            {contato?.email ? ` · ${contato.email}` : " · sem e-mail"}
            {contato?.phone ? ` · 📱 ${contato.phone}` : ""}
            {contato?.phone2 ? ` · ☎ ${contato.phone2}` : ""}
          </p>
          {ficha.cc_emails && (
            <p className="mt-0.5 text-[11px] text-brand-800/50">
              Em cópia: {ficha.cc_emails}
            </p>
          )}
        </div>
        <div className="flex shrink-0 items-center gap-2 text-xs">
          <button onClick={() => setShowEdit((v) => !v)} className="text-brand-600 hover:underline">Editar</button>
          <button onClick={excluirOperadora} className="text-brand-400 hover:text-red-500">Excluir</button>
        </div>
      </div>

      {/* Lista de ASSUNTOS (tratativas separadas) */}
      {assuntos.length > 0 && (
        <div className="mt-3 space-y-1.5">
          {assuntos.map((a) => {
            const seq = emailSeq(a);
            return (
              <div key={a.id} className="flex items-start justify-between gap-2 rounded-lg border border-brand-100 bg-brand-50/40 px-3 py-2">
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium text-brand-800">
                    📌 {assuntoLabel(a)}
                  </p>
                  <p className="mt-0.5 text-[11px] text-brand-800/60">
                    {seq
                      ? `${SEQUENCE_STATUS_LABELS[seq.status] ?? seq.status}${typeof seq.step === "number" && seq.step > 0 ? ` · ${seq.step} envio(s)` : ""}`
                      : "aguardando"}
                  </p>
                </div>
                <button onClick={() => excluirAssunto(a.id)} className="shrink-0 text-[11px] text-brand-400 hover:text-red-500">
                  excluir
                </button>
              </div>
            );
          })}
        </div>
      )}

      {/* Botão + painel: novo assunto */}
      <div className="mt-3">
        <button
          onClick={() => {
            setShowNovo((v) => !v);
            setNovoEmail(contato?.email ?? "");
            setNovoCc(ficha.cc_emails ?? "");
          }}
          className="rounded-md bg-brand-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-brand-700"
        >
          {showNovo ? "Fechar" : "+ Novo assunto"}
        </button>
      </div>

      {showNovo && (
        <div className="mt-3 space-y-2 rounded-lg border border-brand-100 bg-brand-50/40 p-3">
          <label className="block text-xs font-medium text-brand-800/70">
            Título do assunto (curto — só para você identificar)
            <input
              value={titulo}
              onChange={(e) => setTitulo(e.target.value)}
              placeholder="ex: Extensão de Musicoterapia TEA"
              className="mt-1 w-full rounded-md border border-gray-300 px-3 py-2 text-sm"
            />
          </label>
          <label className="block text-xs font-medium text-brand-800/70">
            O que você quer tratar? (a copy — a IA monta o e-mail a partir disso)
            <textarea
              value={copy}
              onChange={(e) => setCopy(e.target.value)}
              rows={3}
              placeholder="ex: Pedir extensão de Musicoterapia e Psicomotricidade (TEA) para Guarulhos e Alphaville; código de prestador 69989826."
              className="mt-1 w-full rounded-md border border-gray-300 px-3 py-2 text-sm"
            />
          </label>
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
            <label className="block text-xs font-medium text-brand-800/70">
              Confirmar e-mail do destinatário
              <input type="email" value={novoEmail} onChange={(e) => setNovoEmail(e.target.value)} placeholder="e-mail do analista" className="mt-1 w-full rounded-md border border-gray-300 px-3 py-2 text-sm" />
            </label>
            <label className="block text-xs font-medium text-brand-800/70">
              Em cópia (CC) — opcional
              <input value={novoCc} onChange={(e) => setNovoCc(e.target.value)} placeholder="outros e-mails, separados por vírgula" className="mt-1 w-full rounded-md border border-gray-300 px-3 py-2 text-sm" />
            </label>
          </div>
          <button onClick={criarAssunto} disabled={busy} className="rounded-md bg-brand-600 px-3 py-2 text-sm font-medium text-white hover:bg-brand-700 disabled:opacity-50">
            {busy ? "Gerando…" : "Abrir assunto e gerar rascunho"}
          </button>
        </div>
      )}

      {/* Editar ficha */}
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
            E-mail principal
            <input value={eEmail} onChange={(e) => setEEmail(e.target.value)} className="mt-1 w-full rounded-md border border-gray-300 px-2 py-1.5 text-sm" />
          </label>
          <label className="text-xs text-gray-600 sm:col-span-2">
            E-mails em cópia (CC) — vários, separados por vírgula
            <input value={eCc} onChange={(e) => setECc(e.target.value)} placeholder="ana@amil.com.br, joao@amil.com.br" className="mt-1 w-full rounded-md border border-gray-300 px-2 py-1.5 text-sm" />
          </label>
          <label className="text-xs text-gray-600">
            Celular
            <input value={ePhone} onChange={(e) => setEPhone(e.target.value)} className="mt-1 w-full rounded-md border border-gray-300 px-2 py-1.5 text-sm" />
          </label>
          <label className="text-xs text-gray-600">
            Telefone fixo
            <input value={ePhone2} onChange={(e) => setEPhone2(e.target.value)} className="mt-1 w-full rounded-md border border-gray-300 px-2 py-1.5 text-sm" />
          </label>
          <div className="sm:col-span-2">
            <button onClick={salvarFicha} disabled={busy} className="rounded-md bg-brand-500 px-3 py-1.5 text-xs font-medium text-white hover:bg-brand-600 disabled:opacity-50">
              {busy ? "Salvando…" : "Salvar"}
            </button>
          </div>
        </div>
      )}

      {note && <p className="mt-2 text-xs text-brand-800/70">{note}</p>}
    </div>
  );
}
