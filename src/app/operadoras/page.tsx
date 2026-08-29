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
  // Seleção múltipla para excluir várias de uma vez.
  const [sel, setSel] = useState<Set<string>>(new Set());
  const [excluindo, setExcluindo] = useState(false);

  // filtro: novas / ativas / todas
  const [filtro, setFiltro] = useState<"nova" | "ativa" | "todas">("nova");

  // formulário
  const [name, setName] = useState("");
  const [operatorType, setOperatorType] = useState<"nova" | "ativa">("nova");
  const [briefing, setBriefing] = useState("");
  const [contactName, setContactName] = useState("");
  const [email, setEmail] = useState("");
  const [ccEmails, setCcEmails] = useState("");
  const [phone, setPhone] = useState("");
  const [isWhatsapp, setIsWhatsapp] = useState(true);
  const [notes, setNotes] = useState("");

  async function load() {
    const r = await fetch("/api/operadoras");
    const d = await r.json();
    if (d.error) setMsg(d.error);
    else {
      setOperadoras(d.operadoras);
      setSel(new Set());
    }
  }

  function toggleSel(id: string) {
    setSel((prev) => {
      const n = new Set(prev);
      if (n.has(id)) n.delete(id);
      else n.add(id);
      return n;
    });
  }
  async function excluirSelecionadas() {
    if (sel.size === 0) return;
    if (!confirm(`Excluir ${sel.size} operadora(s)? Não dá para desfazer.`))
      return;
    setExcluindo(true);
    try {
      const r = await fetch("/api/companies/bulk-delete", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ids: Array.from(sel) }),
      });
      const d = await r.json().catch(() => ({}));
      if (d.error) setMsg(`Erro ao excluir: ${d.error}`);
      else await load();
    } finally {
      setExcluindo(false);
    }
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
          operatorType,
          briefing,
          contactName,
          email,
          ccEmails,
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
        setBriefing("");
        setContactName("");
        setEmail("");
        setCcEmails("");
        setPhone("");
        setNotes("");
        setFiltro(operatorType);
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
          <b>Nova</b> = captar credenciamento. <b>Ativa</b> = parceira atual
          (extensão, reajuste, inclusão de endereços). No <b>briefing</b> você
          diz o que a IA deve enviar — ela monta o e-mail a partir disso.
        </p>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <label className="text-sm">
            <span className="text-gray-600">Tipo *</span>
            <select
              value={operatorType}
              onChange={(e) => setOperatorType(e.target.value as "nova" | "ativa")}
              className="mt-1 w-full rounded-md border border-gray-300 px-3 py-2"
            >
              <option value="nova">Operadora nova (captação)</option>
              <option value="ativa">Operadora ativa (relacionamento)</option>
            </select>
          </label>
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
            <span className="text-gray-600">E-mail (destinatário principal)</span>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="mt-1 w-full rounded-md border border-gray-300 px-3 py-2"
            />
          </label>
          <label className="text-sm sm:col-span-2">
            <span className="text-gray-600">
              Em cópia (CC) — opcional
            </span>
            <input
              value={ccEmails}
              onChange={(e) => setCcEmails(e.target.value)}
              placeholder="outros e-mails, separados por vírgula (ex: joao@x.com, ana@x.com)"
              className="mt-1 w-full rounded-md border border-gray-300 px-3 py-2"
            />
            <span className="mt-1 block text-xs text-gray-400">
              Manda a apresentação para 2-3 pessoas de uma vez, num disparo só.
            </span>
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
            <span className="text-gray-600">
              Briefing — o que a IA deve enviar (a "copy")
            </span>
            <textarea
              value={briefing}
              onChange={(e) => setBriefing(e.target.value)}
              rows={3}
              placeholder={
                operatorType === "ativa"
                  ? "ex: Somos credenciados só em Guarulhos e Zona Norte. Pedir inclusão das unidades de Bragança e Alphaville, e extensão de Fisioterapia e Musicoterapia para todas. Falar com o analista Fulano."
                  : "ex: Apresentar a clínica e pedir credenciamento. Destacar TEA/ABA e capacidade de atendimento. Convidar para uma conversa."
              }
              className="mt-1 w-full rounded-md border border-gray-300 px-3 py-2"
            />
          </label>
          <label className="text-sm sm:col-span-2">
            <span className="text-gray-600">Observações internas (opcional)</span>
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
        <div className="mb-3 flex gap-2">
          {(
            [
              ["nova", "Novas"],
              ["ativa", "Ativas"],
              ["todas", "Todas"],
            ] as const
          ).map(([key, label]) => {
            const n =
              key === "todas"
                ? operadoras.length
                : operadoras.filter((o) => (o.operator_type ?? "nova") === key).length;
            return (
              <button
                key={key}
                onClick={() => setFiltro(key)}
                className={`rounded-md px-3 py-1.5 text-sm font-medium ${
                  filtro === key
                    ? "bg-brand-500 text-white"
                    : "bg-white text-gray-600 border border-gray-200 hover:bg-gray-50"
                }`}
              >
                {label} ({n})
              </button>
            );
          })}
        </div>
        {(() => {
          const lista =
            filtro === "todas"
              ? operadoras
              : operadoras.filter((o) => (o.operator_type ?? "nova") === filtro);
          const todosSel = lista.length > 0 && lista.every((o) => sel.has(o.id));
          const toggleTodos = () =>
            setSel(todosSel ? new Set() : new Set(lista.map((o) => o.id)));
          return (
            <>
              {lista.length > 0 && (
                <div className="mb-2 flex items-center justify-end gap-3">
                  <label className="flex items-center gap-1.5 text-xs text-gray-600">
                    <input
                      type="checkbox"
                      checked={todosSel}
                      onChange={toggleTodos}
                      className="h-4 w-4"
                    />
                    Selecionar todas
                  </label>
                  {sel.size > 0 && (
                    <button
                      onClick={excluirSelecionadas}
                      disabled={excluindo}
                      className="rounded-md bg-red-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-red-700 disabled:opacity-50"
                    >
                      {excluindo
                        ? "Excluindo…"
                        : `Excluir selecionadas (${sel.size})`}
                    </button>
                  )}
                </div>
              )}
              <div className="space-y-3">
                {lista.length === 0 ? (
                  <p className="text-sm text-gray-500">
                    Nenhuma operadora nesta aba.
                  </p>
                ) : (
                  lista.map((o) => (
                    <OperadoraCard
                      key={o.id}
                      op={o}
                      onChanged={load}
                      selected={sel.has(o.id)}
                      onToggleSelect={toggleSel}
                    />
                  ))
                )}
              </div>
            </>
          );
        })()}
      </section>
    </div>
  );
}

type ApolloPerson = {
  apolloId: string;
  name: string;
  title: string | null;
  emailStatus: string | null;
  alreadyEmail: boolean;
  linkedinUrl: string | null;
};

// Só "verified" é seguro de enviar. Adivinhados (guessed/unverified) voltam
// (bounce) e ameaçam a reputação e a conta de envio.
function isVerified(status: string | null): boolean {
  return (status ?? "").toLowerCase().trim() === "verified";
}

function OperadoraCard({
  op,
  onChanged,
  selected,
  onToggleSelect,
}: {
  op: OperadoraRow;
  onChanged: () => void;
  selected: boolean;
  onToggleSelect: (id: string) => void;
}) {
  const [showResp, setShowResp] = useState(false);
  const [respText, setRespText] = useState("");
  const [respChannel, setRespChannel] = useState<SequenceChannel>("email");
  const [busy, setBusy] = useState(false);
  const contact = op.contacts?.[0];

  // Apollo: achar contatos do setor de credenciamento/comercial.
  const [showApollo, setShowApollo] = useState(false);
  const [apolloBusy, setApolloBusy] = useState(false);
  const [apolloNote, setApolloNote] = useState<string | null>(null);
  const [apolloPeople, setApolloPeople] = useState<ApolloPerson[] | null>(null);
  // Verificador de e-mail ligado? (permite enviar também para não-verificados
  // que passem na checagem).
  const [verifierAtivo, setVerifierAtivo] = useState(false);
  // Cadastro manual de e-mail (achado no LinkedIn) por contato.
  const [manualFor, setManualFor] = useState<string | null>(null);
  const [manualEmail, setManualEmail] = useState("");

  async function salvarEmailManual(p: ApolloPerson) {
    const email = manualEmail.trim();
    if (!email.includes("@")) return;
    setApolloBusy(true);
    setApolloNote("Validando e salvando o e-mail…");
    try {
      const r = await fetch(`/api/operadoras/${op.id}/apollo`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "email_manual",
          name: p.name,
          title: p.title,
          email,
        }),
      });
      const txt = await r.text();
      let d: { ok?: boolean; error?: string; mode?: string; email?: string } = {};
      try {
        d = txt ? JSON.parse(txt) : {};
      } catch {
        setApolloNote(`Erro: o servidor respondeu ${r.status}.`);
        return;
      }
      if (!r.ok || d.error) {
        setApolloNote(`Erro: ${d.error ?? `resposta ${r.status}`}`);
        return;
      }
      // Se virou o destinatário principal, já gera o rascunho.
      let draftMsg = "";
      if (d.mode === "principal") draftMsg = await gerarRascunho();
      setApolloNote(
        d.mode === "principal"
          ? `${p.name} definido como destinatário (${d.email}).${draftMsg}`
          : `${p.name} (${d.email}) adicionado em cópia (CC).`,
      );
      setManualFor(null);
      setManualEmail("");
      onChanged();
    } catch (err) {
      setApolloNote(String(err));
    } finally {
      setApolloBusy(false);
    }
  }

  async function buscarCredenciamento() {
    setShowApollo(true);
    setApolloBusy(true);
    setApolloNote(null);
    try {
      const r = await fetch(`/api/operadoras/${op.id}/apollo`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "buscar" }),
      });
      const d = await r.json();
      if (d.error) {
        setApolloNote(d.error);
        setApolloPeople([]);
      } else {
        setApolloPeople(d.people ?? []);
        setVerifierAtivo(Boolean(d.verifierAtivo));
        setApolloNote(
          `${d.total ?? 0} contato(s) de credenciamento/comercial em ${d.domain}. O e-mail é revelado (1 crédito) só quando você clicar "Usar".` +
            (d.verifierAtivo
              ? " Verificador de e-mail ATIVO: dá para revelar todos — só os que existem entram no disparo."
              : ""),
        );
      }
    } catch (err) {
      setApolloNote(String(err));
    } finally {
      setApolloBusy(false);
    }
  }

  // Gera o rascunho numa chamada à parte (não compete com os reveals do Apollo).
  // Devolve uma frase de status para anexar à mensagem.
  async function gerarRascunho(): Promise<string> {
    try {
      const r = await fetch(`/api/companies/${op.id}/draft`, { method: "POST" });
      const txt = await r.text();
      let d: { ok?: boolean; error?: string } = {};
      try {
        d = txt ? JSON.parse(txt) : {};
      } catch {
        return ` ⚠️ Rascunho não gerou (resposta ${r.status} do servidor). Tente de novo em alguns segundos.`;
      }
      if (r.ok && d.ok) {
        return " Rascunho gerado — confirme o envio em Rascunhos.";
      }
      return ` ⚠️ Destinatário definido, mas o rascunho não gerou: ${d.error ?? `erro ${r.status}`}.`;
    } catch (err) {
      return ` ⚠️ Rascunho não gerou (falha de rede: ${String(err)}).`;
    }
  }

  // Botão "Gerar rascunho": reexecuta só a etapa da IA (quando falhou), sem
  // refazer Apollo/verificação. Serve para qualquer cadastro com destinatário.
  async function regerarRascunho() {
    setApolloBusy(true);
    setApolloNote("Gerando rascunho…");
    try {
      const msg = await gerarRascunho();
      setApolloNote(msg.trim());
      onChanged();
    } finally {
      setApolloBusy(false);
    }
  }

  async function usarTodos() {
    const lista = apolloPeople ?? [];
    // Com verificador: revela todos (a checagem filtra os inativos).
    // Sem verificador: só os já-verificados pelo Apollo.
    const enviaveis = verifierAtivo
      ? lista
      : lista.filter((p) => isVerified(p.emailStatus));
    if (enviaveis.length === 0) {
      setApolloNote(
        "Nenhum contato com e-mail VERIFICADO nesta lista, e o verificador não está configurado. Enviar para não verificados causa retorno (bounce). Cadastre o e-mail certo na edição da operadora, ou ative o verificador.",
      );
      return;
    }
    const msg = verifierAtivo
      ? `Revelar e VALIDAR os ${enviaveis.length} contatos? Consome até ${enviaveis.length} créditos do Apollo + verificações. Só os e-mails que EXISTEM entram (1º = Para, resto = CC), num disparo só. Os inativos são descartados antes — sem risco de retorno.`
      : `Revelar o e-mail dos ${enviaveis.length} contatos VERIFICADOS (de ${lista.length})? Consome até ${enviaveis.length} créditos do Apollo. O 1º vira o destinatário (Para) e os demais entram em cópia (CC). Os não verificados ficam de fora para não gerar retorno (bounce).`;
    if (!confirm(msg)) return;
    setApolloBusy(true);
    setApolloNote(
      verifierAtivo
        ? "Revelando e validando os e-mails… pode levar alguns segundos."
        : "Revelando os e-mails verificados… pode levar alguns segundos.",
    );
    try {
      const r = await fetch(`/api/operadoras/${op.id}/apollo`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "usar_todos",
          onlyVerified: !verifierAtivo,
          people: lista.map((p) => ({
            apolloId: p.apolloId,
            name: p.name,
            title: p.title,
            emailStatus: p.emailStatus,
          })),
        }),
      });
      const txt = await r.text();
      let d: {
        error?: string;
        principal?: { name?: string; email?: string };
        ccCount?: number;
        enviaveis?: number;
        checados?: number;
        invalidos?: number;
        catchAll?: number;
        pedidos?: number;
      } = {};
      try {
        d = txt ? JSON.parse(txt) : {};
      } catch {
        setApolloNote(
          `Erro: o servidor respondeu ${r.status} (provável tempo esgotado). Tente de novo.`,
        );
        return;
      }
      if (!r.ok || d.error) {
        setApolloNote(`Erro: ${d.error ?? `resposta ${r.status}`}`);
        return;
      }
      setApolloNote(
        `${d.enviaveis} e-mail(s) aprovado(s) para envio. Gerando rascunho…`,
      );
      const draftMsg = await gerarRascunho();
      const detalhe = verifierAtivo
        ? `${d.enviaveis} VÁLIDO(s) de ${d.pedidos} entraram (${d.invalidos ?? 0} descartado(s)${d.catchAll ? `, sendo ${d.catchAll} catch-all que dão retorno` : ""}).`
        : `${d.enviaveis} verificado(s) de ${d.pedidos}.`;
      setApolloNote(
        `Pronto: ${d.principal?.name} (${d.principal?.email}) como destinatário e ${d.ccCount} em cópia (CC). ${detalhe}` +
          draftMsg,
      );
      setShowApollo(false);
      onChanged();
    } catch (err) {
      setApolloNote(String(err));
    } finally {
      setApolloBusy(false);
    }
  }

  async function usarCredenciamento(p: ApolloPerson) {
    const ok = isVerified(p.emailStatus);
    const aviso = ok
      ? ""
      : "\n\n⚠️ ATENÇÃO: este e-mail NÃO é verificado (o Apollo adivinhou). Ele pode voltar (bounce) e prejudicar a reputação/conta de envio. Use só se tiver certeza de que o endereço existe.";
    if (
      !confirm(
        `Usar "${p.name}"${p.title ? ` (${p.title})` : ""} como contato de credenciamento? Isso revela o e-mail (1 crédito do Apollo) e o define como destinatário da operadora.${aviso}`,
      )
    )
      return;
    setApolloBusy(true);
    setApolloNote(null);
    try {
      const r = await fetch(`/api/operadoras/${op.id}/apollo`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "usar",
          apolloId: p.apolloId,
          name: p.name,
          title: p.title,
        }),
      });
      const txt = await r.text();
      let d: { error?: string; name?: string; email?: string } = {};
      try {
        d = txt ? JSON.parse(txt) : {};
      } catch {
        setApolloNote(`Erro: o servidor respondeu ${r.status}. Tente de novo.`);
        return;
      }
      if (!r.ok || d.error) {
        setApolloNote(`Erro: ${d.error ?? `resposta ${r.status}`}`);
        return;
      }
      const draftMsg = await gerarRascunho();
      setApolloNote(`Destinatário definido: ${d.name} · ${d.email}.` + draftMsg);
      setShowApollo(false);
      onChanged();
    } catch (err) {
      setApolloNote(String(err));
    } finally {
      setApolloBusy(false);
    }
  }

  // edição da operadora
  const [showEdit, setShowEdit] = useState(false);
  const [eName, setEName] = useState(op.name);
  const [eType, setEType] = useState<"nova" | "ativa">(
    (op.operator_type as "nova" | "ativa") ?? "nova",
  );
  const [eBriefing, setEBriefing] = useState(op.briefing ?? "");
  const [eContact, setEContact] = useState(contact?.name ?? "");
  const [eEmail, setEEmail] = useState(contact?.email ?? "");
  const [eCcEmails, setECcEmails] = useState(op.cc_emails ?? "");
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
          operatorType: eType,
          briefing: eBriefing,
          contactName: eContact,
          email: eEmail,
          ccEmails: eCcEmails,
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
    <div
      className={`rounded-lg border bg-white p-4 shadow-sm ${
        selected ? "border-red-300 ring-1 ring-red-200" : "border-gray-200"
      }`}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-start gap-2.5">
          <input
            type="checkbox"
            checked={selected}
            onChange={() => onToggleSelect(op.id)}
            className="mt-1 h-4 w-4 shrink-0"
            title="Selecionar para excluir"
          />
          <div>
          <p className="flex items-center gap-2 font-medium text-gray-900">
            {op.name}
            <span
              className={`rounded px-1.5 py-0.5 text-[10px] font-semibold uppercase ${
                (op.operator_type ?? "nova") === "ativa"
                  ? "bg-teal-100 text-teal-700"
                  : "bg-indigo-100 text-indigo-700"
              }`}
            >
              {(op.operator_type ?? "nova") === "ativa" ? "Ativa" : "Nova"}
            </span>
          </p>
          {contact && (
            <p className="text-xs text-gray-500">
              {contact.name}
              {contact.email ? ` · ${contact.email}` : ""}
              {contact.phone ? ` · ${contact.phone}` : ""}
              {contact.is_whatsapp ? " (WhatsApp)" : ""}
            </p>
          )}
          {op.briefing && (
            <p className="mt-1 line-clamp-2 text-xs italic text-gray-400">
              Briefing: {op.briefing}
            </p>
          )}
          </div>
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
              Tipo
              <select
                value={eType}
                onChange={(e) => setEType(e.target.value as "nova" | "ativa")}
                className="mt-1 w-full rounded-md border border-gray-300 px-2 py-1.5 text-sm"
              >
                <option value="nova">Nova (captação)</option>
                <option value="ativa">Ativa (relacionamento)</option>
              </select>
            </label>
            <label className="text-xs text-gray-600">
              Operadora
              <input
                value={eName}
                onChange={(e) => setEName(e.target.value)}
                className="mt-1 w-full rounded-md border border-gray-300 px-2 py-1.5 text-sm"
              />
            </label>
            <label className="text-xs text-gray-600 sm:col-span-2">
              Briefing — o que a IA deve enviar
              <textarea
                value={eBriefing}
                onChange={(e) => setEBriefing(e.target.value)}
                rows={3}
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
            <label className="text-xs text-gray-600 sm:col-span-2">
              Em cópia (CC) — opcional
              <input
                value={eCcEmails}
                onChange={(e) => setECcEmails(e.target.value)}
                placeholder="outros e-mails, separados por vírgula"
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

      {/* Apollo: achar o setor de credenciamento/comercial da operadora */}
      <div className="mt-3">
        {!showApollo ? (
          <button
            onClick={buscarCredenciamento}
            disabled={apolloBusy}
            className="text-xs text-brand-600 underline hover:text-brand-700 disabled:opacity-50"
            title="Busca no Apollo gerente/analista/auxiliar de credenciamento e comercial desta operadora"
          >
            🔎 Buscar credenciamento no Apollo
          </button>
        ) : (
          <div className="space-y-2 rounded-md border border-gray-200 bg-gray-50 p-3">
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold uppercase tracking-wide text-gray-500">
                Credenciamento / comercial (Apollo)
              </span>
              <button
                onClick={() => setShowApollo(false)}
                className="text-xs text-gray-400 underline hover:text-gray-600"
              >
                fechar
              </button>
            </div>
            {apolloBusy && !apolloPeople && (
              <p className="text-xs text-gray-500">Buscando no Apollo…</p>
            )}
            {apolloPeople && apolloPeople.length > 0 && (() => {
              const verif = apolloPeople.filter((p) => isVerified(p.emailStatus));
              const total = apolloPeople.length;
              return (
                <>
                  <button
                    onClick={usarTodos}
                    disabled={
                      apolloBusy || (!verifierAtivo && verif.length === 0)
                    }
                    className="w-full rounded-md bg-brand-500 px-3 py-2 text-sm font-medium text-white hover:bg-brand-600 disabled:opacity-50"
                    title="Monta um único rascunho (1º = Para, resto = CC)"
                  >
                    {verifierAtivo
                      ? `✉️ Revelar e validar os ${total} e colocar em cópia (CC)`
                      : `✉️ Revelar os ${verif.length} VERIFICADOS e colocar em cópia (CC)`}
                  </button>
                  <p className="text-[11px] text-gray-400">
                    {verifierAtivo
                      ? "Todos são revelados e checados — só os e-mails que EXISTEM entram no disparo (os inativos são descartados antes, sem bounce). Ou revele um a um abaixo:"
                      : "Só e-mails ✓ verificados entram — os adivinhados voltam (bounce) e podem suspender a conta de envio. Ou revele um a um abaixo:"}
                  </p>
                </>
              );
            })()}
            {apolloPeople && apolloPeople.length > 0 && (
              <div className="space-y-1.5">
                {[...apolloPeople]
                  .sort(
                    (a, b) =>
                      Number(isVerified(b.emailStatus)) -
                      Number(isVerified(a.emailStatus)),
                  )
                  .map((p) => {
                    const ok = isVerified(p.emailStatus);
                    // Com verificador ligado, um "não verificado" do Apollo não
                    // é beco sem saída: ele vai ser CHECADO no clique.
                    const aValidar = !ok && verifierAtivo;
                    const manualOpen = manualFor === p.apolloId;
                    const linkedin =
                      p.linkedinUrl ||
                      `https://www.google.com/search?q=${encodeURIComponent(
                        `${p.name} ${op.name} LinkedIn`,
                      )}`;
                    return (
                      <div
                        key={p.apolloId}
                        className="rounded-md border border-gray-100 bg-white p-2"
                      >
                        <div className="flex flex-wrap items-center justify-between gap-2 text-sm">
                          <div className="min-w-0">
                            <span className="font-medium text-gray-800">{p.name}</span>
                            {p.title && (
                              <span className="text-xs text-gray-500"> · {p.title}</span>
                            )}
                            <span
                              className={`ml-1 rounded px-1.5 py-0.5 text-[10px] font-semibold ${
                                ok
                                  ? "bg-green-100 text-green-700"
                                  : aValidar
                                    ? "bg-blue-100 text-blue-700"
                                    : "bg-amber-100 text-amber-700"
                              }`}
                              title={
                                ok
                                  ? "E-mail verificado pelo Apollo — seguro de enviar"
                                  : aValidar
                                    ? "Vai ser checado no verificador ao clicar — só entra se existir"
                                    : "Não verificado (adivinhado) — risco de retorno (bounce)"
                              }
                            >
                              {ok
                                ? "✓ verificado"
                                : aValidar
                                  ? "• a validar"
                                  : "⚠ não verificado"}
                            </span>
                          </div>
                          <button
                            onClick={() => usarCredenciamento(p)}
                            disabled={apolloBusy}
                            className={`rounded-md border px-2 py-1 text-xs font-medium disabled:opacity-50 ${
                              ok || aValidar
                                ? "border-brand-300 text-brand-700 hover:bg-brand-50"
                                : "border-amber-300 text-amber-700 hover:bg-amber-50"
                            }`}
                            title={
                              ok
                                ? "Revela o e-mail (1 crédito) e define como destinatário"
                                : aValidar
                                  ? "Revela, valida no verificador e usa só se existir"
                                  : "E-mail não verificado — pode voltar (bounce). Use só se tiver certeza."
                            }
                          >
                            {ok
                              ? "Usar (revelar e-mail)"
                              : aValidar
                                ? "Usar (validar e-mail)"
                                : "Usar mesmo assim"}
                          </button>
                        </div>
                        {/* "Quem contatar": LinkedIn + cadastro do e-mail achado */}
                        <div className="mt-1.5 flex flex-wrap items-center gap-3 text-xs">
                          <a
                            href={linkedin}
                            target="_blank"
                            rel="noreferrer"
                            className="font-medium text-brand-600 hover:underline"
                          >
                            {p.linkedinUrl ? "🔗 Ver no LinkedIn" : "🔍 Buscar no Google"}
                          </a>
                          <button
                            onClick={() => {
                              setManualFor(manualOpen ? null : p.apolloId);
                              setManualEmail("");
                            }}
                            className="text-gray-500 underline hover:text-gray-700"
                          >
                            {manualOpen ? "cancelar" : "＋ já tenho o e-mail dele(a)"}
                          </button>
                        </div>
                        {manualOpen && (
                          <div className="mt-2 flex flex-wrap items-center gap-2">
                            <input
                              value={manualEmail}
                              onChange={(e) => setManualEmail(e.target.value)}
                              placeholder="nome@operadora.com.br"
                              className="w-56 rounded-md border border-gray-300 px-2 py-1 text-sm"
                            />
                            <button
                              onClick={() => salvarEmailManual(p)}
                              disabled={apolloBusy || !manualEmail.includes("@")}
                              className="rounded-md bg-brand-500 px-2 py-1 text-xs font-medium text-white hover:bg-brand-600 disabled:opacity-50"
                            >
                              {apolloBusy ? "Validando…" : "Validar e usar"}
                            </button>
                          </div>
                        )}
                      </div>
                    );
                  })}
              </div>
            )}
            {apolloPeople && apolloPeople.length === 0 && !apolloBusy && (
              <p className="text-xs text-gray-500">
                Nenhum contato de credenciamento encontrado.
              </p>
            )}
            {apolloNote && (
              <p className="text-xs text-gray-500">{apolloNote}</p>
            )}
          </div>
        )}
      </div>

      {/* Ação de retomada: gerar o rascunho de novo (quando a IA falhou) */}
      {contact?.email && (
        <div className="mt-3">
          <button
            onClick={regerarRascunho}
            disabled={apolloBusy}
            className="rounded-lg border border-brand-300 px-3 py-1.5 text-xs font-medium text-brand-700 hover:bg-brand-50 disabled:opacity-50"
            title="Reescreve o rascunho de e-mail com a IA (substitui o pendente). Use quando o rascunho não gerou."
          >
            📝 Gerar rascunho
          </button>
        </div>
      )}

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
