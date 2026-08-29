"use client";

import { useCallback, useEffect, useState } from "react";
import {
  PREFEITURAS,
  LICITACAO_STATUS,
  statusLabel,
} from "@/lib/prefeituras";

type Licitacao = {
  id: string;
  prefeitura: string;
  municipio: string | null;
  orgao: string | null;
  unidade: string | null;
  objeto: string;
  modalidade: string | null;
  edital_numero: string | null;
  data_publicacao: string | null;
  data_encerramento: string | null;
  valor_estimado: number | null;
  link: string | null;
  situacao: string | null;
  fonte: string;
  matched_keyword: string | null;
  contato_nome: string | null;
  contato_email: string | null;
  contato_telefone: string | null;
  status: string;
  notes: string | null;
};

function fmtData(iso: string | null): string {
  if (!iso) return "";
  if (/^\d{4}-\d{2}-\d{2}$/.test(iso)) {
    const [y, m, d] = iso.split("-");
    return `${d}/${m}/${y}`;
  }
  return new Date(iso).toLocaleDateString("pt-BR", { timeZone: "America/Sao_Paulo" });
}

function fmtValor(v: number | null): string {
  if (v == null) return "";
  return v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

// Dias até o encerramento (negativo = já encerrou).
function diasAtePrazo(iso: string | null): number | null {
  if (!iso) return null;
  const fim = new Date(iso).getTime();
  return Math.ceil((fim - Date.now()) / (24 * 60 * 60 * 1000));
}

// Ordena: ABERTAS primeiro (prazo mais urgente no topo; sem data no fim das
// abertas), depois as ENCERRADAS (as que encerraram há menos tempo primeiro).
function ordenar(rows: Licitacao[]): Licitacao[] {
  const aberta = (l: Licitacao) => {
    const d = diasAtePrazo(l.data_encerramento);
    return d == null || d >= 0;
  };
  return [...rows].sort((a, b) => {
    const aa = aberta(a);
    const ab = aberta(b);
    if (aa !== ab) return aa ? -1 : 1; // abertas antes das encerradas
    const da = diasAtePrazo(a.data_encerramento);
    const db = diasAtePrazo(b.data_encerramento);
    if (aa) {
      // Abertas: menor prazo primeiro; sem data (null) vai para o fim.
      const va = da == null ? Number.POSITIVE_INFINITY : da;
      const vb = db == null ? Number.POSITIVE_INFINITY : db;
      return va - vb;
    }
    // Encerradas: a que encerrou há menos tempo primeiro (dias menos negativo).
    const va = da == null ? Number.NEGATIVE_INFINITY : da;
    const vb = db == null ? Number.NEGATIVE_INFINITY : db;
    return vb - va;
  });
}

export default function Licitacoes() {
  const [pref, setPref] = useState<string>("todas");
  const [rows, setRows] = useState<Licitacao[]>([]);
  const [loading, setLoading] = useState(true);
  const [buscando, setBuscando] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  // Seleção múltipla para excluir várias de uma vez.
  const [sel, setSel] = useState<Set<string>>(new Set());
  const [excluindo, setExcluindo] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const qs = pref === "todas" ? "" : `?prefeitura=${pref}`;
      const r = await fetch(`/api/licitacoes${qs}`);
      const d = await r.json();
      if (d.error) setMsg(d.error);
      else {
        setRows(ordenar(d.licitacoes ?? []));
        setSel(new Set());
      }
    } finally {
      setLoading(false);
    }
  }, [pref]);

  function toggleSel(id: string) {
    setSel((prev) => {
      const n = new Set(prev);
      if (n.has(id)) n.delete(id);
      else n.add(id);
      return n;
    });
  }
  const todosSel = rows.length > 0 && sel.size === rows.length;
  function toggleTodos() {
    setSel(todosSel ? new Set() : new Set(rows.map((r) => r.id)));
  }
  async function excluirSelecionadas() {
    if (sel.size === 0) return;
    if (!confirm(`Excluir ${sel.size} licitação(ões)? Não dá para desfazer.`))
      return;
    setExcluindo(true);
    try {
      const r = await fetch("/api/licitacoes/bulk-delete", {
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
  }, [load]);

  async function buscarNoPncp() {
    setBuscando(true);
    setMsg("Buscando no PNCP… pode levar alguns segundos.");
    try {
      const r = await fetch("/api/licitacoes/monitor", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(pref === "todas" ? {} : { prefeitura: pref }),
      });
      // Resposta pode não ser JSON (ex: timeout da função na Vercel devolve uma
      // página de erro). Lemos como texto e tentamos parsear com segurança.
      const txt = await r.text();
      let d: {
        error?: string;
        totalNovas?: number;
        porPrefeitura?: {
          nome: string;
          novas: number;
          relevantes: number;
          encontradasNoPncp: number;
          erros: string[];
        }[];
      } = {};
      try {
        d = txt ? JSON.parse(txt) : {};
      } catch {
        setMsg(
          `O servidor não respondeu a tempo (status ${r.status}). A busca em "Todas" pode demorar — tente uma prefeitura por vez.`,
        );
        return;
      }
      if (!r.ok || d.error) {
        setMsg(`Erro: ${d.error ?? `status ${r.status}`}`);
      } else {
        const linhas = (d.porPrefeitura ?? [])
          .map(
            (p: {
              nome: string;
              novas: number;
              relevantes: number;
              encontradasNoPncp: number;
              erros: string[];
            }) =>
              `${p.nome}: ${p.novas} nova(s) · ${p.relevantes} no perfil · ${p.encontradasNoPncp} vistas` +
              (p.erros?.length ? ` ⚠️ ${p.erros.join("; ")}` : ""),
          )
          .join("  |  ");
        setMsg(`✅ ${d.totalNovas} nova(s) no total. ${linhas}`);
        await load();
      }
    } catch (e) {
      setMsg(String(e));
    } finally {
      setBuscando(false);
    }
  }

  const abertas = rows.filter((r) => r.status !== "descartada").length;

  return (
    <div className="space-y-5">
      <header>
        <h1 className="text-2xl font-semibold text-brand-800">
          Licitações & credenciamentos públicos
        </h1>
        <p className="text-sm text-brand-800/60">
          Editais das prefeituras onde a clínica atua — TEA, reabilitação
          (PediaSuite), psicologia e saúde mental que o SUS terceiriza. Fonte
          oficial: PNCP. Nada de dado de paciente.
        </p>
      </header>

      {/* Filtro por prefeitura */}
      <div className="flex flex-wrap gap-2">
        <button
          onClick={() => setPref("todas")}
          className={`rounded-full px-3 py-1 text-sm font-medium ${
            pref === "todas"
              ? "bg-brand-600 text-white"
              : "border border-brand-200 bg-white text-brand-700"
          }`}
        >
          Todas
        </button>
        {PREFEITURAS.map((p) => (
          <button
            key={p.id}
            onClick={() => setPref(p.id)}
            className={`rounded-full px-3 py-1 text-sm font-medium ${
              pref === p.id
                ? "bg-brand-600 text-white"
                : "border border-brand-200 bg-white text-brand-700"
            }`}
            title={`Nossas unidades: ${p.unidades}`}
          >
            {p.nome.replace("Prefeitura de ", "")}
          </button>
        ))}
      </div>

      {/* Ação principal: buscar no PNCP */}
      <div className="flex flex-wrap items-center gap-3 rounded-2xl border border-brand-100 bg-white p-4 shadow-card">
        <button
          onClick={buscarNoPncp}
          disabled={buscando}
          className="rounded-md bg-brand-600 px-4 py-2 text-sm font-medium text-white hover:bg-brand-700 disabled:opacity-50"
        >
          {buscando
            ? "Buscando…"
            : pref === "todas"
              ? "🔎 Buscar novas em todas as prefeituras (PNCP)"
              : `🔎 Buscar novas — ${PREFEITURAS.find((p) => p.id === pref)?.nome.replace("Prefeitura de ", "")}`}
        </button>
        <span className="text-xs text-brand-800/50">
          Vasculha o PNCP (últimos 6 meses) por credenciamento, pregão, dispensa
          etc. e traz só o que casa com o perfil da clínica.
        </span>
      </div>

      {msg && (
        <div className="rounded-xl border border-brand-100 bg-brand-50/60 px-4 py-2.5 text-sm text-brand-800">
          {msg}
        </div>
      )}

      <CadastroManual onCreated={load} />

      <section className="space-y-2">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-gray-500">
            Oportunidades ({abertas} ativa{abertas === 1 ? "" : "s"})
          </h2>
          {rows.length > 0 && (
            <div className="flex items-center gap-3">
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
        </div>
        {loading && <p className="text-sm text-gray-500">Carregando…</p>}
        {!loading && rows.length === 0 && (
          <div className="rounded-xl border border-dashed border-brand-200 px-4 py-10 text-center text-sm text-brand-800/40">
            Nenhuma licitação ainda. Clique em “Buscar novas no PNCP” acima, ou
            cadastre um edital manualmente.
          </div>
        )}
        {rows.map((l) => (
          <LicitacaoCard
            key={l.id}
            licitacao={l}
            onChanged={load}
            selected={sel.has(l.id)}
            onToggleSelect={toggleSel}
          />
        ))}
      </section>
    </div>
  );
}

function LicitacaoCard({
  licitacao,
  onChanged,
  selected,
  onToggleSelect,
}: {
  licitacao: Licitacao;
  onChanged: () => void;
  selected: boolean;
  onToggleSelect: (id: string) => void;
}) {
  const [busy, setBusy] = useState(false);
  const [openContato, setOpenContato] = useState(false);
  const [notes, setNotes] = useState(licitacao.notes ?? "");
  const [cNome, setCNome] = useState(licitacao.contato_nome ?? "");
  const [cEmail, setCEmail] = useState(licitacao.contato_email ?? "");
  const [cTel, setCTel] = useState(licitacao.contato_telefone ?? "");

  const dias = diasAtePrazo(licitacao.data_encerramento);
  const prazoBadge =
    dias == null
      ? null
      : dias < 0
        ? { txt: "encerrada", cls: "bg-gray-100 text-gray-500" }
        : dias <= 7
          ? { txt: `⏰ ${dias}d p/ encerrar`, cls: "bg-red-100 text-red-700" }
          : { txt: `${dias}d p/ encerrar`, cls: "bg-amber-100 text-amber-700" };

  async function patch(payload: Record<string, unknown>) {
    setBusy(true);
    try {
      const r = await fetch(`/api/licitacoes/${licitacao.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const d = await r.json().catch(() => ({}));
      if (!d.error) onChanged();
    } finally {
      setBusy(false);
    }
  }

  async function excluir() {
    if (!confirm("Excluir esta licitação da lista?")) return;
    setBusy(true);
    try {
      await fetch(`/api/licitacoes/${licitacao.id}`, { method: "DELETE" });
      onChanged();
    } finally {
      setBusy(false);
    }
  }

  return (
    <div
      className={`rounded-xl border bg-white p-4 shadow-sm ${
        selected ? "border-red-300 ring-1 ring-red-200" : "border-brand-100"
      }`}
    >
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="flex min-w-0 flex-1 items-start gap-2.5">
          <input
            type="checkbox"
            checked={selected}
            onChange={() => onToggleSelect(licitacao.id)}
            className="mt-1 h-4 w-4 shrink-0"
            title="Selecionar para excluir"
          />
          <div className="min-w-0">
            <p className="text-sm font-medium text-brand-800">{licitacao.objeto}</p>
          <div className="mt-1 flex flex-wrap items-center gap-2 text-[11px] text-brand-800/55">
            {licitacao.modalidade && (
              <span className="rounded bg-brand-50 px-1.5 py-0.5 font-medium">
                {licitacao.modalidade}
              </span>
            )}
            {licitacao.matched_keyword && (
              <span className="rounded bg-emerald-50 px-1.5 py-0.5 text-emerald-700">
                🎯 {licitacao.matched_keyword}
              </span>
            )}
            {prazoBadge && (
              <span className={`rounded px-1.5 py-0.5 font-medium ${prazoBadge.cls}`}>
                {prazoBadge.txt}
              </span>
            )}
            {licitacao.fonte === "manual" && (
              <span className="rounded bg-purple-50 px-1.5 py-0.5 text-purple-700">
                manual
              </span>
            )}
          </div>
          <div className="mt-1 text-xs text-brand-800/50">
            {[licitacao.unidade, licitacao.orgao].filter(Boolean).join(" · ")}
          </div>
          <div className="mt-0.5 text-[11px] text-brand-800/40">
            {[
              licitacao.edital_numero ? `Edital ${licitacao.edital_numero}` : null,
              licitacao.data_publicacao
                ? `pub. ${fmtData(licitacao.data_publicacao)}`
                : null,
              licitacao.data_encerramento
                ? `encerra ${fmtData(licitacao.data_encerramento)}`
                : null,
              licitacao.valor_estimado != null
                ? fmtValor(licitacao.valor_estimado)
                : null,
              licitacao.situacao,
            ]
              .filter(Boolean)
              .join(" · ")}
          </div>
          </div>
        </div>
        <div className="flex shrink-0 flex-col items-end gap-1">
          <select
            value={licitacao.status}
            onChange={(e) => patch({ status: e.target.value })}
            disabled={busy}
            className="rounded-md border border-brand-200 px-2 py-1 text-xs text-brand-800"
          >
            {LICITACAO_STATUS.map((s) => (
              <option key={s.id} value={s.id}>
                {s.label}
              </option>
            ))}
          </select>
          {licitacao.link && (
            <a
              href={licitacao.link}
              target="_blank"
              rel="noreferrer"
              className="text-xs font-medium text-brand-600 underline hover:text-brand-700"
            >
              abrir edital →
            </a>
          )}
          <button
            onClick={excluir}
            disabled={busy}
            className="text-[11px] text-red-600 underline hover:text-red-700 disabled:opacity-50"
          >
            excluir
          </button>
        </div>
      </div>

      {/* Contato da comissão + anotações */}
      <div className="mt-3 border-t border-brand-50 pt-2">
        {!openContato ? (
          <button
            onClick={() => setOpenContato(true)}
            className="text-xs text-brand-600 underline hover:text-brand-700"
          >
            {licitacao.contato_email || licitacao.contato_nome
              ? `📇 Contato: ${[licitacao.contato_nome, licitacao.contato_email].filter(Boolean).join(" · ")} — editar`
              : "+ Adicionar contato da comissão / anotações"}
          </button>
        ) : (
          <div className="space-y-2">
            <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
              <input
                value={cNome}
                onChange={(e) => setCNome(e.target.value)}
                placeholder="Contato (pregoeiro/comissão)"
                className="rounded-md border border-brand-200 px-2 py-1 text-sm"
              />
              <input
                value={cEmail}
                onChange={(e) => setCEmail(e.target.value)}
                placeholder="E-mail da comissão"
                className="rounded-md border border-brand-200 px-2 py-1 text-sm"
              />
              <input
                value={cTel}
                onChange={(e) => setCTel(e.target.value)}
                placeholder="Telefone"
                className="rounded-md border border-brand-200 px-2 py-1 text-sm"
              />
            </div>
            <textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Anotações (documentos exigidos, próximos passos…)"
              rows={2}
              className="w-full rounded-md border border-brand-200 px-2 py-1 text-sm"
            />
            <div className="flex gap-2">
              <button
                onClick={() =>
                  patch({
                    contatoNome: cNome,
                    contatoEmail: cEmail,
                    contatoTelefone: cTel,
                    notes,
                  }).then(() => setOpenContato(false))
                }
                disabled={busy}
                className="rounded-md bg-brand-600 px-3 py-1 text-xs font-medium text-white hover:bg-brand-700 disabled:opacity-50"
              >
                Salvar
              </button>
              <button
                onClick={() => setOpenContato(false)}
                className="text-xs text-gray-400 underline hover:text-gray-600"
              >
                fechar
              </button>
            </div>
          </div>
        )}
        {licitacao.notes && !openContato && (
          <p className="mt-1 text-xs text-brand-800/50">📝 {licitacao.notes}</p>
        )}
      </div>
    </div>
  );
}

function CadastroManual({ onCreated }: { onCreated: () => void }) {
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState<string | null>(null);
  const [f, setF] = useState({
    prefeitura: PREFEITURAS[0].id,
    objeto: "",
    modalidade: "",
    editalNumero: "",
    dataEncerramento: "",
    link: "",
    orgao: "",
    unidade: "",
    contatoNome: "",
    contatoEmail: "",
    contatoTelefone: "",
    notes: "",
  });

  async function salvar(e: React.FormEvent) {
    e.preventDefault();
    if (!f.objeto.trim()) return;
    setBusy(true);
    setNote(null);
    try {
      const r = await fetch("/api/licitacoes", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(f),
      });
      const d = await r.json();
      if (d.error) setNote(`Erro: ${d.error}`);
      else {
        setNote("Licitação cadastrada.");
        setF({ ...f, objeto: "", modalidade: "", editalNumero: "", dataEncerramento: "", link: "", orgao: "", unidade: "", contatoNome: "", contatoEmail: "", contatoTelefone: "", notes: "" });
        onCreated();
      }
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="rounded-2xl border border-dashed border-brand-200 bg-white p-4 shadow-card">
      {!open ? (
        <button
          onClick={() => setOpen(true)}
          className="text-sm font-medium text-brand-600 hover:text-brand-700"
        >
          + Cadastrar edital manualmente (achou num portal da prefeitura)
        </button>
      ) : (
        <form onSubmit={salvar} className="space-y-2">
          <div className="mb-1 flex items-center justify-between">
            <h2 className="font-semibold text-brand-800">Cadastrar edital</h2>
            <button
              type="button"
              onClick={() => setOpen(false)}
              className="text-xs text-gray-400 underline hover:text-gray-600"
            >
              fechar
            </button>
          </div>
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
            <label className="text-sm">
              <span className="text-gray-600">Prefeitura</span>
              <select
                value={f.prefeitura}
                onChange={(e) => setF({ ...f, prefeitura: e.target.value })}
                className="mt-1 w-full rounded-md border border-brand-200 px-3 py-2"
              >
                {PREFEITURAS.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.nome}
                  </option>
                ))}
              </select>
            </label>
            <label className="text-sm">
              <span className="text-gray-600">Modalidade</span>
              <input
                value={f.modalidade}
                onChange={(e) => setF({ ...f, modalidade: e.target.value })}
                placeholder="ex: Credenciamento / Pregão"
                className="mt-1 w-full rounded-md border border-brand-200 px-3 py-2"
              />
            </label>
            <label className="text-sm sm:col-span-2">
              <span className="text-gray-600">Objeto *</span>
              <input
                required
                value={f.objeto}
                onChange={(e) => setF({ ...f, objeto: e.target.value })}
                placeholder="ex: Credenciamento de clínica para atendimento de TEA"
                className="mt-1 w-full rounded-md border border-brand-200 px-3 py-2"
              />
            </label>
            <label className="text-sm">
              <span className="text-gray-600">Nº do edital</span>
              <input
                value={f.editalNumero}
                onChange={(e) => setF({ ...f, editalNumero: e.target.value })}
                className="mt-1 w-full rounded-md border border-brand-200 px-3 py-2"
              />
            </label>
            <label className="text-sm">
              <span className="text-gray-600">Encerramento</span>
              <input
                type="date"
                value={f.dataEncerramento}
                onChange={(e) => setF({ ...f, dataEncerramento: e.target.value })}
                className="mt-1 w-full rounded-md border border-brand-200 px-3 py-2"
              />
            </label>
            <label className="text-sm sm:col-span-2">
              <span className="text-gray-600">Link do edital</span>
              <input
                value={f.link}
                onChange={(e) => setF({ ...f, link: e.target.value })}
                placeholder="https://…"
                className="mt-1 w-full rounded-md border border-brand-200 px-3 py-2"
              />
            </label>
            <label className="text-sm">
              <span className="text-gray-600">Órgão / Secretaria</span>
              <input
                value={f.unidade}
                onChange={(e) => setF({ ...f, unidade: e.target.value })}
                placeholder="ex: Secretaria de Saúde"
                className="mt-1 w-full rounded-md border border-brand-200 px-3 py-2"
              />
            </label>
            <label className="text-sm">
              <span className="text-gray-600">E-mail da comissão</span>
              <input
                value={f.contatoEmail}
                onChange={(e) => setF({ ...f, contatoEmail: e.target.value })}
                className="mt-1 w-full rounded-md border border-brand-200 px-3 py-2"
              />
            </label>
          </div>
          <button
            type="submit"
            disabled={busy || !f.objeto.trim()}
            className="rounded-md bg-brand-600 px-4 py-2 text-sm font-medium text-white hover:bg-brand-700 disabled:opacity-50"
          >
            {busy ? "Salvando…" : "Cadastrar"}
          </button>
          {note && <p className="text-sm text-gray-600">{note}</p>}
        </form>
      )}
    </div>
  );
}
