"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import {
  AUTONOMY_LABELS,
  AUTONOMY_DESC,
  actionsByLevel,
  type AutonomyLevel,
} from "@/lib/governance";

interface Stats {
  empresas: number;
  operadoras: number;
  qualificadas: number;
  contatoIniciado: number;
  emNegociacao: number;
  parcerias: number;
  rascunhosPendentes: number;
  aprovados: number;
  enviados: number;
  aguardandoVoce: number;
  respostasHoje: number;
  positivasHoje: number;
  negativasHoje: number;
}

interface ResponseRow {
  id: string;
  company_id: string;
  sentiment: "positivo" | "negativo" | "neutro";
  intent: string | null;
  next_action_at: string | null;
  summary: string | null;
  raw_text: string | null;
  channel: string;
  created_at: string;
  companies: { name: string; category: string | null } | null;
}

// Rótulo curto da intenção detectada pela IA (Fase 1.1).
const INTENT_LABEL: Record<string, string> = {
  oportunidade_ativa: "🔥 Oportunidade ativa",
  documentos_solicitados: "📎 Pediu documentos",
  encaminhamento_setor: "➡️ Encaminhou ao setor",
  duvida: "❓ Fez uma pergunta",
  followup_futuro: "⏰ Follow-up futuro",
  sem_interesse: "🚫 Sem interesse",
  auto_resposta: "🤖 Resposta automática",
  sem_sinal: "• Sem sinal claro",
};

// Assunto em cobrança automática (aguardando retorno; o robô cobra na data).
interface Cobranca {
  key: string;
  name: string;
  date: string;
  isReply: boolean;
}

function fmtDataCurta(iso: string): string {
  return new Date(iso).toLocaleDateString("pt-BR", {
    timeZone: "America/Sao_Paulo",
    day: "2-digit",
    month: "2-digit",
  });
}

export default function Dashboard() {
  const [stats, setStats] = useState<Stats | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [running, setRunning] = useState(false);
  const [runMsg, setRunMsg] = useState<string | null>(null);
  const [responses, setResponses] = useState<ResponseRow[]>([]);
  const [cobrancas, setCobrancas] = useState<Cobranca[]>([]);

  function loadStats() {
    fetch("/api/stats")
      .then((r) => r.json())
      .then((d) => (d.error ? setError(d.error) : setStats(d)))
      .catch((e) => setError(String(e)));
    fetch("/api/responses")
      .then((r) => r.json())
      .then((d) => setResponses(d.responses ?? []))
      .catch(() => {});
    // Assuntos em cobrança automática (sequência ativa com data futura).
    fetch("/api/drafts")
      .then((r) => r.json())
      .then((d) => {
        const rows = (d.drafts ?? []) as {
          id: string;
          sequence_id: string | null;
          subject: string | null;
          is_reply?: boolean;
          companies: { name: string } | null;
          sequences: { status: string; next_action_at: string | null } | null;
        }[];
        const vistos = new Set<string>();
        const list: Cobranca[] = rows
          .filter(
            (x) =>
              x.sequences?.status === "ativa" && x.sequences.next_action_at,
          )
          .filter((x) => {
            const k = x.sequence_id ?? x.id;
            if (vistos.has(k)) return false;
            vistos.add(k);
            return true;
          })
          .sort((a, b) =>
            (a.sequences!.next_action_at ?? "").localeCompare(
              b.sequences!.next_action_at ?? "",
            ),
          )
          .map((x) => ({
            key: x.sequence_id ?? x.id,
            name: x.companies?.name ?? "Parceiro",
            date: x.sequences!.next_action_at!,
            isReply: Boolean(x.is_reply),
          }));
        setCobrancas(list);
      })
      .catch(() => {});
  }

  useEffect(() => {
    loadStats();
  }, []);

  async function runFollowup() {
    setRunning(true);
    setRunMsg(null);
    try {
      const r = await fetch("/api/followup/run", { method: "POST" });
      const d = await r.json();
      if (d.error) setRunMsg(`Erro: ${d.error}`);
      else
        setRunMsg(
          `Pronto: ${d.respostas_lidas ?? 0} resposta(s) lida(s), ` +
            `${d.rascunhos_gerados} novo(s) rascunho(s) de follow-up, ` +
            `${d.reativadas} retomada(s).` +
            (d.positivas?.length
              ? ` 🟢 Positivas: ${d.positivas.join(", ")}.`
              : ""),
        );
      loadStats();
    } catch (e) {
      setRunMsg(String(e));
    } finally {
      setRunning(false);
    }
  }

  if (error) {
    return (
      <div className="rounded-lg border border-amber-200 bg-amber-50 p-4 text-sm text-amber-800">
        <p className="font-medium">Não consegui carregar as métricas.</p>
        <p className="mt-1">{error}</p>
        <p className="mt-2 text-amber-700">
          Verifique se o Supabase está configurado no <code>.env.local</code> e
          se o schema foi criado (veja o README).
        </p>
      </div>
    );
  }

  if (!stats) return <p className="text-gray-500">Carregando…</p>;

  return (
    <div className="space-y-6">
      <section>
        <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-gray-500">
          Ação necessária do CEO
        </h2>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <Card
            label="Rascunhos aguardando aprovação"
            value={stats.rascunhosPendentes}
            highlight
            href="/rascunhos"
          />
          <Card label="Aprovados (prontos p/ disparar)" value={stats.aprovados} />
        </div>
      </section>

      {cobrancas.length > 0 && (
        <section>
          <div className="mb-3 flex items-center justify-between">
            <h2 className="text-sm font-semibold uppercase tracking-wide text-gray-500">
              Em cobrança automática ({cobrancas.length})
            </h2>
            <Link
              href="/rascunhos"
              className="text-xs text-brand-600 hover:underline"
            >
              ver em Rascunhos →
            </Link>
          </div>
          <div className="rounded-lg border border-gray-200 bg-white divide-y divide-gray-100">
            {cobrancas.slice(0, 8).map((c) => (
              <div
                key={c.key}
                className="flex items-center justify-between gap-3 px-4 py-2.5 text-sm"
              >
                <span className="flex items-center gap-2 min-w-0">
                  <span className="font-medium text-gray-800 truncate">
                    {c.name}
                  </span>
                  {c.isReply && (
                    <span className="rounded-full bg-brand-100 px-2 py-0.5 text-[10px] font-semibold uppercase text-brand-700">
                      ↩️ Réplica
                    </span>
                  )}
                </span>
                <span className="shrink-0 text-xs font-medium text-amber-700">
                  🔁 cobra {fmtDataCurta(c.date)} se não responderem
                </span>
              </div>
            ))}
            {cobrancas.length > 8 && (
              <p className="px-4 py-2 text-xs text-gray-400">
                +{cobrancas.length - 8} outro(s) — veja todos em “Próximos
                envios”.
              </p>
            )}
          </div>
        </section>
      )}

      <section>
        <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-gray-500">
          Respostas recebidas
        </h2>
        <div className="mb-4 grid grid-cols-3 gap-3">
          <div className="rounded-lg border border-gray-200 bg-white p-4">
            <p className="text-2xl font-bold text-gray-900">{stats.respostasHoje}</p>
            <p className="text-xs text-gray-500">Respostas hoje</p>
          </div>
          <div className="rounded-lg border border-green-200 bg-green-50 p-4">
            <p className="text-2xl font-bold text-green-700">{stats.positivasHoje}</p>
            <p className="text-xs text-green-700">🟢 Positivas hoje</p>
          </div>
          <div className="rounded-lg border border-red-200 bg-red-50 p-4">
            <p className="text-2xl font-bold text-red-700">{stats.negativasHoje}</p>
            <p className="text-xs text-red-700">🔴 Negativas hoje</p>
          </div>
        </div>
        {responses.length === 0 ? (
          <p className="rounded-lg border border-gray-200 bg-white p-4 text-sm text-gray-500">
            Nenhuma resposta ainda. Quando uma operadora responder, ela aparece
            aqui automaticamente — com o nome e se foi positiva ou negativa.
          </p>
        ) : (
          <div className="space-y-2">
            {responses.map((r) => (
              <ResponseItem key={r.id} r={r} onChanged={loadStats} />
            ))}
          </div>
        )}
      </section>

      <section className="rounded-lg border border-gray-200 bg-white p-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <p className="text-sm font-medium text-gray-800">
              Motor (respostas + follow-up)
            </p>
            <p className="text-xs text-gray-500">
              Lê as respostas por e-mail, classifica positivo/negativo e prepara
              os próximos follow-ups. Roda sozinho (veja o README para deixar
              online 24/7). Você também pode rodar agora:
            </p>
          </div>
          <button
            onClick={runFollowup}
            disabled={running}
            className="rounded-md bg-brand-500 px-4 py-2 text-sm font-medium text-white hover:bg-brand-600 disabled:opacity-50"
          >
            {running ? "Rodando…" : "Rodar follow-up agora"}
          </button>
        </div>
        {runMsg && <p className="mt-2 text-sm text-gray-600">{runMsg}</p>}
      </section>

      <section>
        <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-gray-500">
          Pipeline de empresas
        </h2>
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-6">
          <Card label="Operadoras" value={stats.operadoras} href="/operadoras" />
          <Card label="Empresas" value={stats.empresas} href="/prospeccao" />
          <Card label="Contato iniciado" value={stats.contatoIniciado} />
          <Card label="Em negociação" value={stats.emNegociacao} />
          <Card label="Enviadas" value={stats.enviados} />
          <Card label="Parcerias ativas" value={stats.parcerias} />
        </div>
      </section>

      <GovernanceCard />

      <section className="rounded-lg border border-gray-200 bg-white p-4 text-sm text-gray-600">
        <p className="font-medium text-gray-800">Como funciona</p>
        <ol className="mt-2 list-decimal space-y-1 pl-5">
          <li>
            Em <Link href="/prospeccao" className="text-brand-600 underline">Prospecção</Link>,
            busque empresas (100+ funcionários) via Apollo. A IA qualifica automaticamente.
          </li>
          <li>Para uma empresa qualificada, gere um rascunho com um dos ganchos (NR-1, saúde mental, TEA/ABA).</li>
          <li>
            Em <Link href="/rascunhos" className="text-brand-600 underline">Rascunhos</Link>,
            revise, edite se quiser, e aprove. <strong>Nada sai sem sua aprovação.</strong>
          </li>
        </ol>
      </section>
    </div>
  );
}

function ResponseItem({
  r,
  onChanged,
}: {
  r: ResponseRow;
  onChanged: () => void;
}) {
  const [mode, setMode] = useState<"idle" | "replying">("idle");
  const [instruction, setInstruction] = useState("");
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState<string | null>(null);

  async function act(
    action: "responder" | "encerrar" | "adiar" | "seguir" | "fechar",
  ) {
    if (action === "responder" && !instruction.trim()) {
      setNote("Escreva o que você quer responder.");
      return;
    }
    if (action === "encerrar" && !confirm("Encerrar este assunto? O sistema para de cobrar retorno.")) return;
    setBusy(true);
    setNote(null);
    try {
      const res = await fetch(`/api/responses/${r.id}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(
          action === "responder" ? { action, instruction } : { action },
        ),
      });
      const d = await res.json().catch(() => ({}));
      if (d.error) {
        setNote(`Erro: ${d.error}`);
      } else if (action === "responder") {
        setNote("✅ Réplica criada em Rascunhos. Revise e dispare — a cobrança de 72h recomeça ao enviar.");
        setMode("idle");
        setInstruction("");
      } else if (action === "encerrar") {
        setNote("Assunto encerrado.");
      } else if (action === "seguir") {
        setNote("Seguindo a cobrança — próxima cutucada em 72h.");
      } else {
        setNote("Adiado — o sistema retoma a cobrança em 30 dias.");
      }
      onChanged();
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="rounded-lg border border-gray-200 bg-white p-3">
      <div className="flex items-start gap-3">
        <span
          className={`mt-0.5 rounded-full px-2 py-0.5 text-xs font-medium ${
            r.sentiment === "positivo"
              ? "bg-green-100 text-green-800"
              : r.sentiment === "negativo"
                ? "bg-red-100 text-red-700"
                : "bg-gray-100 text-gray-600"
          }`}
        >
          {r.sentiment === "positivo"
            ? "🟢 Positivo"
            : r.sentiment === "negativo"
              ? "🔴 Negativo"
              : "⚪ Neutro"}
        </span>
        <div className="min-w-0 flex-1">
          <p className="text-sm font-medium text-gray-900">
            {r.companies?.name ?? "Operadora"}
            <span className="ml-2 text-xs font-normal text-gray-400">
              {r.channel === "whatsapp" ? "WhatsApp" : "E-mail"} ·{" "}
              {new Date(r.created_at).toLocaleDateString("pt-BR")}
            </span>
          </p>
          {r.summary && <p className="text-xs text-gray-500">{r.summary}</p>}

          {/* Intenção detectada + próxima ação (Fase 1.1) */}
          {(r.intent || r.next_action_at) && (
            <div className="mt-1 flex flex-wrap items-center gap-2">
              {r.intent && INTENT_LABEL[r.intent] && (
                <span className="rounded-full bg-brand-100 px-2 py-0.5 text-[11px] font-semibold text-brand-700">
                  {INTENT_LABEL[r.intent]}
                </span>
              )}
              {r.next_action_at && (
                <span className="text-[11px] font-medium text-amber-700">
                  ⏰ Retomada agendada:{" "}
                  {new Date(r.next_action_at).toLocaleDateString("pt-BR", {
                    timeZone: "America/Sao_Paulo",
                    day: "2-digit",
                    month: "2-digit",
                    year: "numeric",
                  })}{" "}
                  — o sistema retoma sozinho nessa data
                </span>
              )}
            </div>
          )}

          {/* Ações — para nada cair no esquecimento */}
          <div className="mt-2 flex flex-wrap gap-2">
            <button
              onClick={() => setMode(mode === "replying" ? "idle" : "replying")}
              disabled={busy}
              className="rounded-md bg-brand-500 px-2.5 py-1 text-xs font-medium text-white hover:bg-brand-600 disabled:opacity-50"
            >
              ✍️ Responder pelo sistema
            </button>
            <button
              onClick={() => act("seguir")}
              disabled={busy}
              className="rounded-md border border-gray-300 px-2.5 py-1 text-xs font-medium text-gray-600 hover:bg-gray-50 disabled:opacity-50"
              title="Ex: responderam 'vamos analisar' — retoma a cobrança automática de 72h sem escrever réplica"
            >
              🔁 Seguir cobrando
            </button>
            <button
              onClick={() => act("adiar")}
              disabled={busy}
              className="rounded-md border border-gray-300 px-2.5 py-1 text-xs font-medium text-gray-600 hover:bg-gray-50 disabled:opacity-50"
            >
              ⏳ Retomar em 30 dias
            </button>
            <button
              onClick={() => act("encerrar")}
              disabled={busy}
              className="rounded-md border border-gray-300 px-2.5 py-1 text-xs font-medium text-gray-600 hover:bg-gray-50 disabled:opacity-50"
            >
              ✖️ Encerrar assunto
            </button>
          </div>

          {mode === "replying" && (
            <div className="mt-2 rounded-md border border-gray-100 bg-gray-50 p-2">
              <p className="mb-1 text-xs text-gray-500">
                O que você quer responder? A IA monta o e-mail com base na
                mensagem deles + na sua orientação.
              </p>
              <textarea
                value={instruction}
                onChange={(e) => setInstruction(e.target.value)}
                rows={3}
                placeholder="ex: Contestar a negativa da glosa. Argumentar que o procedimento foi autorizado previamente e pedir reanálise formal, anexando o número da guia."
                className="w-full rounded-md border border-gray-300 px-2 py-1.5 text-sm"
              />
              <button
                onClick={() => act("responder")}
                disabled={busy || !instruction.trim()}
                className="mt-2 rounded-md bg-green-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-green-700 disabled:opacity-50"
              >
                {busy ? "Gerando…" : "Gerar réplica"}
              </button>
            </div>
          )}

          {note && <p className="mt-2 text-xs text-gray-600">{note}</p>}
        </div>
        <button
          onClick={() => act("fechar")}
          disabled={busy}
          className="shrink-0 text-xs text-gray-400 hover:text-gray-600 disabled:opacity-50"
          title="Já vi/tratei — tirar do radar"
        >
          ✕ Fechar
        </button>
      </div>
    </div>
  );
}

// Governança da automação (Fase 1.5): mostra ao CEO o que a IA faz sozinha,
// o que ela prepara para aprovação e o que é sempre 100% humano.
function GovernanceCard() {
  const [open, setOpen] = useState(false);
  const cor: Record<AutonomyLevel, string> = {
    1: "border-green-200 bg-green-50",
    2: "border-brand-200 bg-brand-50",
    3: "border-gray-300 bg-gray-50",
  };
  const dot: Record<AutonomyLevel, string> = {
    1: "bg-green-500",
    2: "bg-brand-500",
    3: "bg-gray-500",
  };
  return (
    <section className="rounded-lg border border-gray-200 bg-white p-4">
      <button
        onClick={() => setOpen((v) => !v)}
        className="flex w-full items-center justify-between gap-3 text-left"
      >
        <div>
          <p className="text-sm font-medium text-gray-800">
            🛡️ Governança da automação
          </p>
          <p className="text-xs text-gray-500">
            O que a IA faz sozinha, o que ela prepara p/ você aprovar, e o que é
            sempre 100% humano. Nada sai sem o seu clique.
          </p>
        </div>
        <span className="shrink-0 text-xs text-brand-600 underline">
          {open ? "ocultar" : "ver níveis"}
        </span>
      </button>
      {open && (
        <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-3">
          {([1, 2, 3] as AutonomyLevel[]).map((lvl) => (
            <div key={lvl} className={`rounded-lg border p-3 ${cor[lvl]}`}>
              <p className="flex items-center gap-2 text-xs font-bold uppercase tracking-wide text-gray-700">
                <span className={`h-2 w-2 rounded-full ${dot[lvl]}`} />
                Nível {lvl}
              </p>
              <p className="mt-0.5 text-sm font-semibold text-gray-800">
                {AUTONOMY_LABELS[lvl]}
              </p>
              <p className="mt-0.5 text-xs text-gray-500">{AUTONOMY_DESC[lvl]}</p>
              <ul className="mt-2 space-y-1">
                {actionsByLevel(lvl).map((a) => (
                  <li key={a.key} className="text-xs text-gray-600">
                    • {a.label}
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
      )}
    </section>
  );
}

function Card({
  label,
  value,
  highlight,
  href,
}: {
  label: string;
  value: number;
  highlight?: boolean;
  href?: string;
}) {
  const inner = (
    <div
      className={`rounded-lg border p-4 shadow-sm transition ${
        highlight
          ? "border-brand-300 bg-brand-50"
          : "border-gray-200 bg-white"
      } ${href ? "hover:shadow" : ""}`}
    >
      <p className="text-2xl font-bold text-brand-700">{value}</p>
      <p className="mt-1 text-xs text-gray-500">{label}</p>
    </div>
  );
  return href ? <Link href={href}>{inner}</Link> : inner;
}
