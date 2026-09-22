"use client";

import { useEffect, useState } from "react";

type Parceiro = { id: string; name: string; category: string };
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
  const [busca, setBusca] = useState("");
  const [resultados, setResultados] = useState<Parceiro[]>([]);
  const [parceiro, setParceiro] = useState<Parceiro | null>(null);
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

  // Busca de parceiro (por nome), na marca ativa.
  useEffect(() => {
    const q = busca.trim();
    if (q.length < 2) {
      setResultados([]);
      return;
    }
    const t = setTimeout(async () => {
      try {
        const r = await fetch(`/api/companies?q=${encodeURIComponent(q)}`);
        const d = await r.json();
        setResultados(
          (d.companies ?? []).slice(0, 8).map((c: Parceiro) => ({
            id: c.id,
            name: c.name,
            category: c.category,
          })),
        );
      } catch {
        setResultados([]);
      }
    }, 300);
    return () => clearTimeout(t);
  }, [busca]);

  async function subir() {
    if (!parceiro) {
      setMsg("Escolha o parceiro do contrato.");
      return;
    }
    if (arquivos.length === 0) {
      setMsg("Selecione ao menos um PDF do contrato.");
      return;
    }
    setEnviando(true);
    setMsg("Subindo e lendo o contrato com a IA…");
    try {
      // 1) URLs assinadas
      const sign = await fetch("/api/contratos/sign", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          names: arquivos.map((f) => f.name),
          companyId: parceiro.id,
        }),
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

      // 3) Registra + IA analisa
      const reg = await fetch("/api/contratos", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          companyId: parceiro.id,
          paths: sd.uploads.map((u: { path: string }) => u.path),
          names: sd.uploads.map((u: { name: string }) => u.name),
        }),
      });
      const rd = await reg.json();
      if (rd.error) throw new Error(rd.error);

      setMsg(
        rd.analiseOk
          ? "Contrato anexado e lido pela IA (data e cláusula extraídas)."
          : "Contrato anexado. A IA não conseguiu ler tudo — confira a data depois.",
      );
      setParceiro(null);
      setBusca("");
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

  const elegiveis = contratos.filter((c) => c.elegivel).length;

  return (
    <div className="mx-auto max-w-4xl">
      <h1 className="text-xl font-semibold text-brand-800">Contratos</h1>
      <p className="mt-1 text-sm text-brand-800/60">
        Banco de contratos dos parceiros. A IA lê o PDF e extrai a data de início
        e a cláusula de reajuste. Todo Jan–Fev, a Lara prepara os pedidos de
        reajuste dos contratos com 12+ meses.
      </p>

      {/* Upload */}
      <div className="mt-4 rounded-2xl border border-brand-100 bg-white p-4 shadow-card">
        <h2 className="text-sm font-semibold text-brand-800">Anexar contrato</h2>
        <div className="mt-3">
          <label className="mb-1 block text-xs font-medium text-brand-800/70">
            Parceiro (busque pelo nome)
          </label>
          {parceiro ? (
            <div className="flex items-center gap-2">
              <span className="rounded-full bg-brand-50 px-3 py-1 text-sm text-brand-800">
                {parceiro.name}
                {parceiro.category ? ` · ${CAT_LABEL[parceiro.category] ?? parceiro.category}` : ""}
              </span>
              <button
                onClick={() => setParceiro(null)}
                className="text-xs text-brand-500 hover:text-red-500"
              >
                trocar
              </button>
            </div>
          ) : (
            <>
              <input
                value={busca}
                onChange={(e) => setBusca(e.target.value)}
                placeholder="ex: Bradesco Saúde, Colégio X, Dr. Fulano…"
                className="w-full rounded-lg border border-brand-200 px-3 py-2 text-sm outline-none focus:border-brand-500"
              />
              {resultados.length > 0 && (
                <div className="mt-1 rounded-lg border border-brand-100 bg-white">
                  {resultados.map((r) => (
                    <button
                      key={r.id}
                      onClick={() => {
                        setParceiro(r);
                        setResultados([]);
                      }}
                      className="block w-full px-3 py-2 text-left text-sm hover:bg-brand-50"
                    >
                      {r.name}
                      <span className="text-brand-800/50">
                        {" "}
                        · {CAT_LABEL[r.category] ?? r.category}
                      </span>
                    </button>
                  ))}
                </div>
              )}
            </>
          )}
        </div>

        <div className="mt-3">
          <label className="mb-1 block text-xs font-medium text-brand-800/70">
            PDF do contrato (pode incluir adendos/aditivos)
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
      <div className="mt-5 flex items-center justify-between">
        <h2 className="text-sm font-semibold text-brand-800">
          {contratos.length} contrato(s)
        </h2>
        {elegiveis > 0 && (
          <span className="rounded-full bg-amber-100 px-2.5 py-1 text-xs font-medium text-amber-700">
            {elegiveis} com 12+ meses (reajuste elegível)
          </span>
        )}
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
                {c.elegivel && (
                  <span className="ml-2 rounded-full bg-amber-100 px-2 py-0.5 text-[11px] font-medium text-amber-700">
                    reajuste elegível
                  </span>
                )}
              </div>
              <button
                onClick={() => excluir(c.id)}
                className="text-xs text-brand-400 hover:text-red-500"
              >
                excluir
              </button>
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
            <div className="mt-1 text-[11px] text-brand-800/40">
              {c.files?.map((f) => f.name).join(", ")}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
