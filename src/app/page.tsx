"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import {
  AUTONOMY_LABELS,
  AUTONOMY_DESC,
  actionsByLevel,
  type AutonomyLevel,
} from "@/lib/governance";
import { nextActionForIntent } from "@/lib/nextAction";

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

// Mostra quando a Lara revisou os e-mails pela última vez, com um empurrãozinho
// quando já passou de 30 dias (hora de clicar no botão de novo).
function RevisaoInfo({ iso }: { iso: string | null }) {
  if (!iso) {
    return (
      <p className="text-xs text-gray-500 sm:text-right">
        E-mails ainda não revisados pela Lara.
      </p>
    );
  }
  const data = new Date(iso);
  const dias = Math.floor((Date.now() - data.getTime()) / 86_400_000);
  const dataFmt = data.toLocaleDateString("pt-BR", {
    timeZone: "America/Sao_Paulo",
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  });
  const vencido = dias >= 30;
  return (
    <p className={`text-xs sm:text-right ${vencido ? "font-medium text-amber-700" : "text-gray-500"}`}>
      Última revisão da Lara: {dataFmt}
      {dias === 0 ? " (hoje)" : ` (há ${dias} dia${dias === 1 ? "" : "s"})`}
      {vencido ? " — já passou de 30 dias, vale revisar de novo." : ""}
    </p>
  );
}

const CAT_LABEL_REV: Record<string, string> = {
  operadora: "Operadora",
  empresa: "Empresa",
  escola: "Escola",
  medico: "Médico",
  sindicato: "Sindicato",
  igreja: "Igreja",
  agenda_aberta: "Agenda Aberta",
  reajuste: "Reajuste",
};
function catLabel(c: string | null): string {
  return c ? CAT_LABEL_REV[c] ?? c : "Parceiro";
}

// Relatório da revisão de e-mails: vai somando o que a Lara atualizou a cada
// clique (a varredura é fatiada). No fim, você tem a lista completa.
function RelatorioRevisao({
  relatorio,
  concluida,
  onLimpar,
}: {
  relatorio: {
    vinculos: { parceiro: string; categoria: string | null; para: string }[];
    trocas: { parceiro: string; categoria: string | null; de: string; para: string }[];
    semSubstituto: { parceiro: string; categoria: string | null; email: string }[];
  };
  concluida: boolean;
  onLimpar: () => void;
}) {
  const { vinculos, trocas, semSubstituto } = relatorio;
  const total = vinculos.length + trocas.length + semSubstituto.length;
  if (total === 0) return null;
  return (
    <div className="mt-3 rounded-xl border border-brand-100 bg-brand-50/50 p-3">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold text-brand-800">
          {concluida ? "Relatório da revisão (concluída)" : "Relatório parcial da revisão"}
        </h3>
        <button onClick={onLimpar} className="text-xs text-brand-400 hover:text-brand-700">
          limpar
        </button>
      </div>

      {vinculos.length > 0 && (
        <div className="mt-2">
          <p className="text-xs font-medium text-green-700">
            ✅ {vinculos.length} e-mail(s) novo(s) vinculado(s)
          </p>
          <ul className="mt-1 space-y-0.5">
            {vinculos.map((v, i) => (
              <li key={`v${i}`} className="text-xs text-gray-700">
                <span className="rounded bg-white px-1.5 py-0.5 text-[10px] text-brand-700">
                  {catLabel(v.categoria)}
                </span>{" "}
                <b>{v.parceiro}</b> → {v.para}
              </li>
            ))}
          </ul>
        </div>
      )}

      {trocas.length > 0 && (
        <div className="mt-2">
          <p className="text-xs font-medium text-amber-700">
            🔄 {trocas.length} e-mail(s) trocado(s) (o antigo parou de funcionar)
          </p>
          <ul className="mt-1 space-y-0.5">
            {trocas.map((t, i) => (
              <li key={`t${i}`} className="text-xs text-gray-700">
                <span className="rounded bg-white px-1.5 py-0.5 text-[10px] text-brand-700">
                  {catLabel(t.categoria)}
                </span>{" "}
                <b>{t.parceiro}</b>: <s className="text-gray-400">{t.de}</s> → {t.para}
              </li>
            ))}
          </ul>
        </div>
      )}

      {semSubstituto.length > 0 && (
        <div className="mt-2">
          <p className="text-xs font-medium text-red-600">
            ⚠️ {semSubstituto.length} sem substituto (conferir manualmente)
          </p>
          <ul className="mt-1 space-y-0.5">
            {semSubstituto.map((s, i) => (
              <li key={`s${i}`} className="text-xs text-gray-700">
                <span className="rounded bg-white px-1.5 py-0.5 text-[10px] text-brand-700">
                  {catLabel(s.categoria)}
                </span>{" "}
                <b>{s.parceiro}</b>: {s.email}
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}

export default function Dashboard() {
  const [stats, setStats] = useState<Stats | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [running, setRunning] = useState(false);
  const [runMsg, setRunMsg] = useState<string | null>(null);
  const [revisando, setRevisando] = useState(false);
  const [revisarMsg, setRevisarMsg] = useState<string | null>(null);
  const [ultimaRevisao, setUltimaRevisao] = useState<string | null>(null);
  const [relatorio, setRelatorio] = useState<{
    vinculos: { parceiro: string; categoria: string | null; para: string }[];
    trocas: { parceiro: string; categoria: string | null; de: string; para: string }[];
    semSubstituto: { parceiro: string; categoria: string | null; email: string }[];
  }>({ vinculos: [], trocas: [], semSubstituto: [] });
  const [revisaoConcluida, setRevisaoConcluida] = useState(false);
  const [responses, setResponses] = useState<ResponseRow[]>([]);
  const [cobrancas, setCobrancas] = useState<Cobranca[]>([]);
  const [reativar, setReativar] = useState<
    { id: string; name: string; category: string; dias: number | null }[]
  >([]);

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
    // Oportunidades abandonadas (interesse sem interação há muitos dias).
    fetch("/api/reactivation")
      .then((r) => r.json())
      .then((d) => setReativar(d.oportunidades ?? []))
      .catch(() => {});
  }

  useEffect(() => {
    loadStats();
    fetch("/api/manutencao/emails")
      .then((r) => r.json())
      .then((d) => setUltimaRevisao(d.ultimaRevisao ?? null))
      .catch(() => {});
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

  // UM clique = varredura COMPLETA. O botão chama o motor em sequência sozinho
  // (cada chamada respeita o limite de 60s da Vercel) até terminar a base toda,
  // mostrando o progresso e montando o relatório final.
  async function revisarEmails() {
    setRevisando(true);
    // Começa do zero para o relatório final ficar limpo.
    const acc = {
      vinculos: [] as { parceiro: string; categoria: string | null; para: string }[],
      trocas: [] as { parceiro: string; categoria: string | null; de: string; para: string }[],
      semSubstituto: [] as { parceiro: string; categoria: string | null; email: string }[],
    };
    setRelatorio({ vinculos: [], trocas: [], semSubstituto: [] });
    setRevisaoConcluida(false);
    setRevisarMsg("Revisando a base inteira (as duas clínicas)… pode levar alguns minutos. Pode deixar esta aba aberta.");

    let totVinc = 0;
    let totTroc = 0;
    let totMortos = 0;
    let ciclos = 0;
    try {
      while (true) {
        ciclos++;
        const r = await fetch("/api/manutencao/emails", { method: "POST" });
        const d = await r.json();

        if (d.error) {
          setRevisarMsg(`Erro: ${d.error}`);
          break;
        }

        // Acumula o relatório.
        acc.vinculos.push(...((d.vinculos ?? []) as typeof acc.vinculos));
        acc.trocas.push(...((d.trocas ?? []) as typeof acc.trocas));
        acc.semSubstituto.push(...((d.semSubstituto ?? []) as typeof acc.semSubstituto));
        setRelatorio({
          vinculos: [...acc.vinculos],
          trocas: [...acc.trocas],
          semSubstituto: [...acc.semSubstituto],
        });
        totVinc += d.vinculados ?? 0;
        totTroc += d.trocados ?? 0;
        totMortos += d.mortos ?? 0;
        if (d.ultimaRevisao) setUltimaRevisao(d.ultimaRevisao);

        if (d.suspeitaVerificador) {
          setRevisarMsg(
            `⚠️ Parei por segurança: o verificador reprovou muitos e-mails de uma vez, ` +
              `o que indica que ELE pode estar com defeito (não a sua base). ` +
              `Não troquei nada por isso. Verifique a chave/saldo do verificador e rode de novo.`,
          );
          break;
        }

        if (d.concluido !== false) {
          setRevisarMsg(
            `✅ Varredura completa: ${totTroc} e-mail(s) trocado(s), ` +
              `${totVinc} novo(s) vinculado(s), ${totMortos} sem substituto.`,
          );
          setRevisaoConcluida(true);
          break;
        }

        // Ainda tem base — continua sozinho, mostrando o progresso.
        setRevisarMsg(
          `Revisando… já foram ${totVinc} vinculado(s) e ${totTroc} trocado(s). Continuando a varredura…`,
        );

        // Trava de segurança contra loop infinito (não deveria acontecer).
        if (ciclos >= 200) {
          setRevisarMsg(
            `Parei após muitos ciclos por segurança (${totVinc} vinculado(s), ${totTroc} trocado(s)). ` +
              `Clique de novo para continuar, se precisar.`,
          );
          break;
        }
      }
      loadStats();
    } catch (e) {
      setRevisarMsg(`Conexão interrompida (${String(e)}). O que já foi revisado está salvo — clique de novo para continuar de onde parou.`);
    } finally {
      setRevisando(false);
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

      {reativar.length > 0 && (
        <section>
          <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-gray-500">
            Reativar oportunidades ({reativar.length})
          </h2>
          <p className="mb-2 text-xs text-gray-500">
            Demonstraram interesse mas ficaram sem interação. Reative para a IA
            gerar uma retomada já com o histórico — você aprova antes de enviar.
          </p>
          <div className="rounded-lg border border-gray-200 bg-white divide-y divide-gray-100">
            {reativar.map((o) => (
              <ReativarItem key={o.id} o={o} onChanged={loadStats} />
            ))}
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
          <div className="flex flex-col gap-2 sm:items-end">
            <button
              onClick={runFollowup}
              disabled={running}
              className="rounded-md bg-brand-500 px-4 py-2 text-sm font-medium text-white hover:bg-brand-600 disabled:opacity-50"
            >
              {running ? "Rodando…" : "Rodar follow-up agora"}
            </button>
            <button
              onClick={revisarEmails}
              disabled={revisando}
              className="rounded-md border border-brand-300 px-4 py-2 text-sm font-medium text-brand-700 hover:bg-brand-50 disabled:opacity-50"
            >
              {revisando ? "Revisando…" : "Revisar e-mails da base agora"}
            </button>
            <RevisaoInfo iso={ultimaRevisao} />
          </div>
        </div>
        {runMsg && <p className="mt-2 text-sm text-gray-600">{runMsg}</p>}
        {revisarMsg && <p className="mt-2 text-sm text-gray-600">{revisarMsg}</p>}
        <RelatorioRevisao
          relatorio={relatorio}
          concluida={revisaoConcluida}
          onLimpar={() => {
            setRelatorio({ vinculos: [], trocas: [], semSubstituto: [] });
            setRevisaoConcluida(false);
          }}
        />
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

          {/* Ação sugerida pela máquina de estados (Fase 3.1) */}
          {r.intent &&
            (() => {
              const rec = nextActionForIntent(r.intent);
              return (
                <p className="mt-1 text-[11px] text-brand-800/70">
                  <span
                    className={`mr-1.5 rounded px-1.5 py-0.5 font-bold ${
                      rec.level === 1
                        ? "bg-emerald-100 text-emerald-700"
                        : rec.level === 2
                          ? "bg-amber-100 text-amber-700"
                          : "bg-red-100 text-red-700"
                    }`}
                    title={AUTONOMY_LABELS[rec.level]}
                  >
                    N{rec.level}
                  </span>
                  <span className="font-medium">Ação sugerida:</span> {rec.label}
                </p>
              );
            })()}

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

// Oportunidade abandonada: reativar gera um rascunho de retomada (Fase 1.4).
function ReativarItem({
  o,
  onChanged,
}: {
  o: { id: string; name: string; category: string; dias: number | null };
  onChanged: () => void;
}) {
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState<string | null>(null);
  async function reativar() {
    setBusy(true);
    setNote(null);
    try {
      const r = await fetch("/api/reactivation", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ companyId: o.id }),
      });
      const d = await r.json().catch(() => ({}));
      if (d.error) setNote(`Erro: ${d.error}`);
      else {
        setNote("Rascunho de retomada gerado — veja em Rascunhos.");
        onChanged();
      }
    } finally {
      setBusy(false);
    }
  }
  return (
    <div className="flex items-center justify-between gap-3 px-4 py-2.5 text-sm">
      <span className="min-w-0">
        <span className="font-medium text-gray-800">{o.name}</span>
        {o.dias != null && (
          <span className="ml-2 text-xs text-gray-500">
            parado há {o.dias} dias
          </span>
        )}
        {note && <span className="ml-2 text-xs text-brand-600">{note}</span>}
      </span>
      <button
        onClick={reativar}
        disabled={busy}
        className="shrink-0 rounded-md border border-brand-300 px-3 py-1 text-xs font-medium text-brand-700 hover:bg-brand-50 disabled:opacity-50"
      >
        {busy ? "Reativando…" : "🔄 Reativar"}
      </button>
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
