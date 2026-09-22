"use client";

import { useEffect, useState } from "react";

type Parceiro = {
  id: string;
  name: string;
  category: string;
  contract_only?: boolean;
  city?: string | null;
};
type Contrato = {
  id: string;
  parceiro: string | null;
  categoria: string | null;
  files: { path: string; name: string }[];
  data_inicio: string | null;
  indice: string | null;
  janela: string | null;
  parecer: string | null;
  elegivel: boolean;
  em_reajuste: boolean;
  created_at: string;
};

const CAT_LABEL: Record<string, string> = {
  operadora: "Operadora",
  empresa: "Empresa",
  escola: "Escola",
  medico: "Médico",
  sindicato: "Sindicato",
  igreja: "Igreja",
  reajuste: "Reajuste",
  agenda_aberta: "Agenda Aberta",
};

export default function Contratos() {
  const [contratos, setContratos] = useState<Contrato[]>([]);
  const [carregando, setCarregando] = useState(true);
  const [nome, setNome] = useState("");
  const [email, setEmail] = useState("");
  const [arquivos, setArquivos] = useState<File[]>([]);
  const [enviando, setEnviando] = useState(false);
  const [msg, setMsg] = useState("");

  async function carregar() {
    setCarregando(true);
    try {
      const r = await fetch("/api/contratos");
      const d = await r.json();
      setContratos(Array.isArray(d.contratos) ? d.contratos : []);
    } catch {
      setContratos([]);
    }
    setCarregando(false);
  }
  useEffect(() => {
    carregar();
  }, []);

  async function subir() {
    const nomeLimpo = nome.trim();
    if (nomeLimpo.length < 2) {
      setMsg("Digite o nome da operadora/parceiro do contrato.");
      return;
    }
    if (arquivos.length === 0) {
      setMsg("Selecione ao menos um PDF do contrato.");
      return;
    }
    setEnviando(true);
    setMsg("Subindo e lendo os documentos com a IA…");
    try {
      // 1) URLs assinadas
      const sign = await fetch("/api/contratos/sign", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ names: arquivos.map((f) => f.name) }),
      });
      const sd = await sign.json();
      if (!sd.uploads) throw new Error(sd.error ?? "Falha ao preparar upload.");

      // 2) PUT direto no Storage
      for (let i = 0; i < sd.uploads.length; i++) {
        const up = sd.uploads[i];
        const put = await fetch(up.signedUrl, {
          method: "PUT",
          headers: { "Content-Type": "application/pdf" },
          body: arquivos[i],
        });
        if (!put.ok) throw new Error(`Falha ao subir "${up.name}".`);
      }

      // 3) Registra + IA analisa (usa/cria o parceiro pelo NOME — sem dropdown)
      const reg = await fetch("/api/contratos", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          newName: nomeLimpo,
          email: email.trim() || undefined,
          paths: sd.uploads.map((u: { path: string }) => u.path),
          names: sd.uploads.map((u: { name: string }) => u.name),
        }),
      });
      const rd = await reg.json();
      if (rd.error) throw new Error(rd.error);

      setMsg(
        rd.analiseOk
          ? "Documentos lidos pela IA (data, cláusula e proposta abaixo). Decida quando gerar o pedido."
          : "Contrato anexado. A IA não conseguiu ler tudo — confira a data depois.",
      );
      setNome("");
      setEmail("");
      setArquivos([]);
      carregar();
    } catch (e) {
      setMsg(`Erro: ${e instanceof Error ? e.message : String(e)}`);
    }
    setEnviando(false);
  }

  async function excluir(id: string) {
    if (!confirm("Excluir este contrato e seus arquivos?")) return;
    await fetch(`/api/contratos/${id}`, { method: "DELETE" });
    carregar();
  }

  const [preparando, setPreparando] = useState<string | null>(null);
  async function prepararReajuste(id: string) {
    setPreparando(id);
    setMsg("");
    try {
      const r = await fetch(`/api/contratos/${id}/reajuste`, { method: "POST" });
      const d = await r.json();
      if (d.error) throw new Error(d.error);
      setMsg("Pedido de reajuste preparado (rascunho pendente) e registrado na aba Reajustes.");
      carregar();
    } catch (e) {
      setMsg(`Erro ao preparar reajuste: ${e instanceof Error ? e.message : String(e)}`);
    }
    setPreparando(null);
  }

  async function prepararTodos() {
    const alvos = contratos.filter((c) => c.elegivel && !c.em_reajuste && c.parceiro);
    if (alvos.length === 0) return;
    if (!confirm(`Preparar o pedido de reajuste de ${alvos.length} contrato(s) elegível(is)?`)) {
      return;
    }
    setPreparando("todos");
    setMsg(`Preparando ${alvos.length} pedido(s) de reajuste…`);
    let ok = 0;
    for (const c of alvos) {
      try {
        const r = await fetch(`/api/contratos/${c.id}/reajuste`, { method: "POST" });
        const d = await r.json();
        if (!d.error) ok++;
      } catch {
        // segue para o próximo
      }
    }
    setMsg(`${ok} de ${alvos.length} pedido(s) de reajuste preparados (rascunhos pendentes).`);
    setPreparando(null);
    carregar();
  }

  const elegiveis = contratos.filter((c) => c.elegivel && !c.em_reajuste).length;

  return (
    <div className="mx-auto max-w-4xl">
      <h1 className="text-xl font-semibold text-brand-800">Reajustes</h1>
      <p className="mt-1 text-sm text-brand-800/60">
        Banco de contratos + reajuste, num lugar só. Anexe o contrato do parceiro
        (a IA lê o PDF e extrai a data de início e a cláusula). Contratos com 12+
        meses ficam elegíveis — prepare o pedido de reajuste aqui (ou peça à Lara)
        e ele entra na cobrança. Todo Jan–Fev o sistema prepara os elegíveis
        automaticamente.
      </p>

      {/* Upload */}
      <div className="mt-4 rounded-2xl border border-brand-100 bg-white p-4 shadow-card">
        <h2 className="text-sm font-semibold text-brand-800">Anexar contrato</h2>
        <div className="mt-3">
          <label className="mb-1 block text-xs font-medium text-brand-800/70">
            De qual operadora/parceiro é este contrato?
          </label>
          <input
            value={nome}
            onChange={(e) => setNome(e.target.value)}
            placeholder="ex: Amil, Unimed Guarulhos, Bradesco Saúde…"
            className="w-full rounded-lg border border-brand-200 px-3 py-2 text-sm outline-none focus:border-brand-500"
          />
        </div>

        <div className="mt-3">
          <label className="mb-1 block text-xs font-medium text-brand-800/70">
            E-mail de quem vai tratar o reajuste (opcional)
          </label>
          <input
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="ex: marcia.souza@amil.com.br"
            className="w-full rounded-lg border border-brand-200 px-3 py-2 text-sm outline-none focus:border-brand-500"
          />
        </div>

        <div className="mt-3">
          <label className="mb-1 block text-xs font-medium text-brand-800/70">
            PDFs do vínculo — selecione TODOS de uma vez: o contrato original +
            os aditivos/extensões (a IA analisa tudo em conjunto, ponta a ponta)
          </label>
          <input
            type="file"
            accept="application/pdf"
            multiple
            onChange={(e) => setArquivos(Array.from(e.target.files ?? []))}
            className="text-sm"
          />
        </div>

        <button
          onClick={subir}
          disabled={enviando}
          className="mt-4 rounded-lg bg-brand-600 px-4 py-2 text-sm font-medium text-white hover:bg-brand-700 disabled:opacity-50"
        >
          {enviando ? "Processando…" : "Anexar e ler com a IA"}
        </button>
        {msg && <p className="mt-2 text-xs text-brand-800/70">{msg}</p>}
      </div>

      {/* Lista */}
      <div className="mt-5 flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-sm font-semibold text-brand-800">
          {contratos.length} contrato(s)
        </h2>
        <div className="flex items-center gap-2">
          {elegiveis > 0 && (
            <span className="rounded-full bg-amber-100 px-2.5 py-1 text-xs font-medium text-amber-700">
              {elegiveis} elegível(is) sem cobrança
            </span>
          )}
          {elegiveis > 0 && (
            <button
              onClick={prepararTodos}
              disabled={preparando === "todos"}
              className="rounded-md bg-brand-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-brand-700 disabled:opacity-50"
            >
              {preparando === "todos" ? "Preparando…" : "Preparar todos os elegíveis"}
            </button>
          )}
        </div>
      </div>

      <div className="mt-2 space-y-2">
        {carregando && <p className="text-sm text-brand-800/50">Carregando…</p>}
        {!carregando && contratos.length === 0 && (
          <p className="text-sm text-brand-800/50">
            Nenhum contrato ainda. Anexe o primeiro acima.
          </p>
        )}
        {contratos.map((c) => (
          <div
            key={c.id}
            className="rounded-xl border border-brand-100 bg-white p-3 shadow-card"
          >
            <div className="flex items-start justify-between gap-2">
              <div>
                <span className="font-medium text-brand-800">
                  {c.parceiro ?? "(parceiro removido)"}
                </span>
                {c.categoria && (
                  <span className="ml-2 rounded-full bg-brand-50 px-2 py-0.5 text-[11px] text-brand-700">
                    {CAT_LABEL[c.categoria] ?? c.categoria}
                  </span>
                )}
                {c.elegivel && !c.em_reajuste && (
                  <span className="ml-2 rounded-full bg-amber-100 px-2 py-0.5 text-[11px] font-medium text-amber-700">
                    reajuste elegível
                  </span>
                )}
                {c.em_reajuste && (
                  <span className="ml-2 rounded-full bg-green-100 px-2 py-0.5 text-[11px] font-medium text-green-700">
                    em cobrança de reajuste
                  </span>
                )}
              </div>
              <div className="flex items-center gap-2">
                {!c.em_reajuste && c.parceiro && (
                  <button
                    onClick={() => prepararReajuste(c.id)}
                    disabled={preparando === c.id}
                    className="rounded-md bg-brand-600 px-2.5 py-1 text-xs font-medium text-white hover:bg-brand-700 disabled:opacity-50"
                  >
                    {preparando === c.id ? "Preparando…" : "Preparar reajuste"}
                  </button>
                )}
                <button
                  onClick={() => excluir(c.id)}
                  className="text-xs text-brand-400 hover:text-red-500"
                >
                  excluir
                </button>
              </div>
            </div>
            <div className="mt-1 text-xs text-brand-800/70">
              {c.data_inicio ? (
                <>Início do vínculo: <b>{c.data_inicio}</b></>
              ) : (
                <span className="text-amber-700">Data de início não identificada — confira o PDF.</span>
              )}
              {c.indice && <> · Índice: {c.indice}</>}
              {c.janela && <> · Janela: {c.janela}</>}
            </div>
            {c.parecer && (
              <p className="mt-1 text-xs text-brand-800/60">{c.parecer}</p>
            )}
            {c.elegivel && !c.em_reajuste && (
              <p className="mt-1 text-[11px] text-brand-800/50">
                Elegível a reajuste. Clique em <b>Preparar reajuste</b> para gerar
                o pedido agora, ou aguarde a campanha automática de janeiro.
              </p>
            )}
            <div className="mt-1 text-[11px] text-brand-800/40">
              {c.files?.map((f) => f.name).join(", ")}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
