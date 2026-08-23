"use client";

import { useEffect, useState } from "react";
import type { Company, Contact, MessageHook } from "@/lib/types";
import { HOOK_LABELS, STATUS_LABELS } from "@/lib/types";
import { UNITS } from "@/lib/units";

type CompanyWithContacts = Company & { contacts: Contact[] };

// Marcamos "unavailable" só DEPOIS de tentar revelar sem sucesso — aí sim o
// Apollo não tem e-mail e não vale mais gastar crédito com este contato.
function emailUnavailable(status: string | null): boolean {
  return (status ?? "").toLowerCase() === "unavailable";
}

// Selo do veredito de validação do e-mail (ZeroBounce).
function verdictInfo(
  v: string | null,
): { label: string; cls: string } | null {
  switch ((v ?? "").toLowerCase()) {
    case "valid":
      return { label: "✓ válido", cls: "bg-green-100 text-green-700" };
    case "catch_all":
      return { label: "• catch-all", cls: "bg-amber-100 text-amber-700" };
    case "invalid":
      return { label: "⚠ inválido", cls: "bg-red-100 text-red-700" };
    case "unknown":
      return { label: "? não confirmado", cls: "bg-gray-100 text-gray-600" };
    default:
      return null;
  }
}

export type ProspeccaoMode =
  | "empresa"
  | "medico"
  | "escola"
  | "igreja"
  | "sindicato";

interface ModeConfig {
  noun: string;
  minEmployees: number;
  notKeywords: string;
  heading: string;
  subtitle: string;
  presets: readonly (readonly [string, string])[];
  sectionTitle: string;
  contactLabel: string;
  cadRotulo: string;
  cadNomeLabel: string;
  cadContatoPlaceholder: string;
  cadCargoPlaceholder: string;
  // Busca por NOME (não por keyword tags) — para segmentos que o Apollo indexa
  // melhor pelo nome do que por setor (ex: sindicatos têm "Sindicato" no nome).
  searchByName?: boolean;
  // Valor inicial do "só com decisor". Sindicato começa desmarcado: muitos não
  // têm domínio/decisor no Apollo, então mostramos a organização mesmo assim.
  defaultOnlyWithContact?: boolean;
}

// Config por segmento — adicionar um novo segmento é só mais uma entrada aqui.
const MODE_CONFIG: Record<ProspeccaoMode, ModeConfig> = {
  empresa: {
    noun: "empresa(s)",
    minEmployees: 100,
    notKeywords: "",
    heading: "Buscar empresas no Apollo",
    subtitle: "Quanto mais detalhes, melhores os resultados. Atalhos:",
    presets: [
      ["🏭 Indústrias", "manufacturing, indústria, metalurgia, fábrica"],
      ["🚚 Transporte/Logística", "transporte, logística, distribuição"],
      ["🏫 Escolas/Colégios", "escola, colégio, educação, ensino"],
      ["🛒 Varejo", "varejo, supermercado, comércio"],
      ["🏥 Saúde", "hospital, clínica, saúde"],
    ],
    sectionTitle: "Empresas qualificadas",
    contactLabel:
      "Só trazer empresas com decisor encontrado — RH, saúde ocupacional, dono, diretor (o e-mail é revelado ao Abordar) — recomendado",
    cadRotulo: "empresa",
    cadNomeLabel: "Nome da empresa",
    cadContatoPlaceholder: "ex: Maria (RH)",
    cadCargoPlaceholder: "ex: Gerente de RH",
  },
  medico: {
    noun: "consultório(s)",
    minEmployees: 1,
    notKeywords: "",
    heading: "Buscar médicos / consultórios no Apollo (rede de encaminhamento)",
    subtitle:
      "Médicos prescritores (neuro, psiquiatria, pediatria…) para rede de encaminhamento. Atalhos por especialidade:",
    presets: [
      ["🧠 Neuro", "neurologia, neurologista, neuropediatria"],
      ["🧩 Psiquiatria", "psiquiatria, psiquiatra, saúde mental"],
      ["👶 Pediatria", "pediatria, pediatra, neuropediatra"],
      ["🩺 Clínicas", "clínica médica, consultório, ambulatório"],
      ["👵 Geriatria", "geriatria, geriatra"],
    ],
    sectionTitle: "Médicos / consultórios",
    contactLabel:
      "Só trazer consultórios com contato encontrado — médico, direção clínica, dono (o e-mail é revelado ao Abordar) — recomendado",
    cadRotulo: "médico / consultório",
    cadNomeLabel: "Nome do consultório/médico",
    cadContatoPlaceholder: "ex: Dr. Paulo",
    cadCargoPlaceholder: "ex: Diretor Clínico",
  },
  escola: {
    noun: "escola(s)",
    minEmployees: 1,
    notKeywords:
      "prefeitura, municipal, estadual, secretaria de educação, federal, público, pública",
    heading: "Buscar escolas / colégios no Apollo (parceria clínica ↔ escola)",
    subtitle:
      "Escolas particulares (rede pública já vem excluída). Buscamos TODO o time administrativo — coordenação, direção, orientação, secretaria. Atalhos por segmento:",
    presets: [
      ["🏫 Colégios particulares", "colégio particular, escola particular, ensino privado"],
      ["🎒 Ed. Infantil", "educação infantil, creche, pré-escola, berçário"],
      ["📚 Fundamental/Médio", "ensino fundamental, ensino médio, colégio"],
      ["🌱 Bilíngue/Montessori", "escola bilíngue, montessoriana, escola construtivista"],
      ["🧩 Inclusiva/Especial", "escola inclusiva, educação especial, inclusão"],
    ],
    sectionTitle: "Escolas / colégios",
    contactLabel:
      "Só trazer escolas com contato encontrado — coordenação, direção, orientação (o e-mail é revelado ao Abordar) — recomendado",
    cadRotulo: "escola / colégio",
    cadNomeLabel: "Nome da escola",
    cadContatoPlaceholder: "ex: Ana (coordenação)",
    cadCargoPlaceholder: "ex: Coordenadora Pedagógica",
  },
  igreja: {
    noun: "igreja(s)",
    minEmployees: 1,
    notKeywords: "",
    heading: "Buscar igrejas no Apollo (rede de apoio às famílias)",
    subtitle:
      "Igrejas e comunidades para parceria institucional — a clínica como apoio às famílias em situações que vão além do acolhimento pastoral. Falamos com a liderança e a assistência social. Atalhos:",
    presets: [
      ["⛪ Igrejas", "igreja, comunidade, paróquia, congregação"],
      ["🙏 Assistência social", "ação social, assistência social, projeto social"],
      ["👨‍👩‍👧 Família", "ministério de família, aconselhamento familiar"],
      ["✝️ Católica", "paróquia, diocese, pastoral"],
      ["📖 Evangélica", "igreja evangélica, ministério, congregação"],
    ],
    sectionTitle: "Igrejas / comunidades",
    contactLabel:
      "Só trazer igrejas com contato encontrado — pastor, liderança, assistência social (o e-mail é revelado ao Abordar) — recomendado",
    cadRotulo: "igreja / comunidade",
    cadNomeLabel: "Nome da igreja",
    cadContatoPlaceholder: "ex: Pr. João (liderança)",
    cadCargoPlaceholder: "ex: Pastor / Coord. de ação social",
  },
  sindicato: {
    noun: "sindicato(s)",
    minEmployees: 1,
    notKeywords: "",
    searchByName: true,
    defaultOnlyWithContact: false,
    heading: "Buscar sindicatos no Apollo (convênio para os associados)",
    subtitle:
      "Sindicatos agregam milhares de associados — uma parceria vale por centenas de leads. A busca é por NOME (todo sindicato tem 'Sindicato' no nome) e sem filtro de porte. Escolha um atalho ou digite o termo (ex: 'sindicato metalúrgicos'):",
    presets: [
      ["🏢 Todos", "sindicato"],
      ["🏭 Indústria", "sindicato indústria"],
      ["🏪 Comércio/Comerciários", "sindicato comerciários"],
      ["👷 Metalúrgicos", "sindicato metalúrgicos"],
      ["🚚 Caminhoneiros/Transporte", "sindicato transporte"],
      ["👩‍🏫 Professores", "sindicato professores"],
      ["🏗️ Construção civil", "sindicato construção civil"],
      ["⚕️ Servidores/Saúde", "sindicato servidores"],
    ],
    sectionTitle: "Sindicatos",
    contactLabel:
      "Só trazer sindicatos com decisor encontrado — presidente, diretoria, convênios/benefícios, administrativo (deixe DESMARCADO para ver também os sem contato no Apollo)",
    cadRotulo: "sindicato",
    cadNomeLabel: "Nome do sindicato",
    cadContatoPlaceholder: "ex: Carlos (convênios)",
    cadCargoPlaceholder: "ex: Coordenador de Convênios / Presidente",
  },
};

export function ProspeccaoView({
  mode = "empresa",
}: {
  mode?: ProspeccaoMode;
}) {
  const cfg = MODE_CONFIG[mode];
  const category = mode;
  const noun = cfg.noun;

  const [companies, setCompanies] = useState<CompanyWithContacts[]>([]);
  const [loading, setLoading] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  // formulário de busca
  const [keywords, setKeywords] = useState("");
  // Alguns segmentos já vêm com exclusões (ex: escola exclui rede pública).
  const [notKeywords, setNotKeywords] = useState(cfg.notKeywords);
  const [nome, setNome] = useState("");
  const [estado, setEstado] = useState("Sao Paulo");
  const [cidades, setCidades] = useState("");
  // Fase 4.1 — unidade selecionada para busca por região (proximidade).
  const [unidade, setUnidade] = useState<string | null>(null);
  const [minEmployees, setMinEmployees] = useState(cfg.minEmployees);
  const [maxEmployees, setMaxEmployees] = useState<string>("");
  const [perPage, setPerPage] = useState(25);
  const [onlyWithContact, setOnlyWithContact] = useState(
    cfg.defaultOnlyWithContact ?? true,
  );

  async function loadCompanies() {
    const r = await fetch(
      `/api/companies?status=qualificado&category=${category}`,
    );
    const d = await r.json();
    if (d.error) setMsg(d.error);
    else setCompanies(d.companies);
  }

  useEffect(() => {
    loadCompanies();
  }, []);

  async function runProspect(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setMsg(null);
    // monta as localizações: uma por cidade (+ estado + Brazil); se não houver
    // cidade, usa só o estado.
    const cidadeList = cidades
      .split(",")
      .map((c) => c.trim())
      .filter(Boolean);
    const locations =
      cidadeList.length > 0
        ? cidadeList.map((c) =>
            [c, estado.trim(), "Brazil"].filter(Boolean).join(", "),
          )
        : [[estado.trim(), "Brazil"].filter(Boolean).join(", ")];
    // Modo "busca por nome" (sindicato): o que está no campo de palavras-chave
    // vira o NOME procurado (o Apollo acha sindicato pelo nome, não por tag), e
    // não filtramos por porte.
    const searchByName = cfg.searchByName === true;
    const nomeBusca = searchByName
      ? nome.trim() || keywords.trim() || "sindicato"
      : nome.trim() || undefined;
    try {
      const r = await fetch("/api/prospect", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          keywords: searchByName
            ? []
            : keywords
                .split(",")
                .map((k) => k.trim())
                .filter(Boolean),
          notKeywords: notKeywords
            .split(",")
            .map((k) => k.trim())
            .filter(Boolean),
          name: nomeBusca,
          locations,
          minEmployees,
          maxEmployees: maxEmployees.trim() ? Number(maxEmployees) : undefined,
          skipEmployees: searchByName,
          perPage,
          onlyWithContact,
          category,
        }),
      });
      const d = await r.json();
      if (d.error) {
        setMsg(`Erro: ${d.error}`);
      } else {
        let m = `${d.qualified} ${noun} com contato`;
        m += ` · ${d.contatosDecisores ?? 0} decisor(es)`;
        if (onlyWithContact && d.puladasSemDecisor) {
          m += ` · ${d.puladasSemDecisor} descartada(s) sem decisor`;
        }
        m += ".";
        // Diagnóstico quando ninguém passou: mostra ONDE o funil vazou.
        if ((d.qualified ?? 0) === 0) {
          m +=
            ` [diagnóstico: ${d.encontradasNoApollo ?? 0} achadas no Apollo · ` +
            `${d.qualificadasSemDominio ?? 0} sem domínio · ` +
            `${d.empresasComDecisor ?? 0} com decisor · ` +
            `${d.decisoresEncontrados ?? 0} decisores no total]`;
        }
        if (d.avisoContatos) m += ` ⚠️ Decisores: ${d.avisoContatos}`;
        setMsg(m);
        await loadCompanies();
      }
    } catch (err) {
      setMsg(String(err));
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="space-y-6">
      <form
        onSubmit={runProspect}
        className="rounded-lg border border-gray-200 bg-white p-4 shadow-sm"
      >
        <h2 className="mb-1 font-semibold text-gray-800">{cfg.heading}</h2>
        <p className="mb-3 text-xs text-gray-500">{cfg.subtitle}</p>
        {/* Atalhos de preenchimento rápido */}
        <div className="mb-3 flex flex-wrap gap-2">
          {cfg.presets.map(([label, kw]) => (
            <button
              key={label}
              type="button"
              onClick={() => setKeywords(kw)}
              className="rounded-full border border-gray-200 bg-gray-50 px-2.5 py-1 text-xs text-gray-600 hover:bg-gray-100"
            >
              {label}
            </button>
          ))}
        </div>

        {/* Fase 4.1/4.3-lite — buscar no RAIO de ~20 km de uma unidade
            (proximidade = mais paciente). Preenche estado + os municípios
            dentro do raio para o Apollo filtrar por localização. */}
        <div className="mb-3">
          <span className="mb-1 block text-xs font-medium text-brand-800/70">
            📍 Buscar no raio de ~20&nbsp;km de uma unidade
          </span>
          <div className="flex flex-wrap gap-2">
            {UNITS.map((u) => {
              const active = unidade === u.id;
              return (
                <button
                  key={u.id}
                  type="button"
                  onClick={() => {
                    if (active) {
                      setUnidade(null);
                      setCidades("");
                    } else {
                      setUnidade(u.id);
                      setEstado(u.estado);
                      setCidades(u.cities.join(", "));
                    }
                  }}
                  className={`rounded-full px-2.5 py-1 text-xs font-medium transition-colors ${
                    active
                      ? "bg-brand-600 text-white"
                      : "border border-brand-200 bg-white text-brand-700 hover:bg-brand-50"
                  }`}
                >
                  {u.name.replace("MenthalHelp — ", "")}
                </button>
              );
            })}
          </div>
          {unidade && (
            <p className="mt-1.5 text-[11px] text-brand-800/50">
              Raio ~
              {UNITS.find((u) => u.id === unidade)?.radiusKm ?? 20}&nbsp;km — busca
              nos municípios:{" "}
              <span className="text-brand-700">
                {UNITS.find((u) => u.id === unidade)?.cities.join(" · ")}
              </span>
              . O Apollo filtra por município (não por km exato); ajuste as
              cidades abaixo se quiser.
            </p>
          )}
        </div>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <label className="text-sm sm:col-span-2">
            <span className="text-gray-600">
              {cfg.searchByName
                ? "Nome / termo a buscar (ex: sindicato metalúrgicos)"
                : "Setores / palavras-chave — INCLUIR (vírgula)"}
            </span>
            <input
              value={keywords}
              onChange={(e) => setKeywords(e.target.value)}
              placeholder={
                cfg.searchByName
                  ? "ex: sindicato metalúrgicos"
                  : "ex: metalurgia, indústria, transporte"
              }
              className="mt-1 w-full rounded-md border border-gray-300 px-3 py-2"
            />
          </label>
          <label className="text-sm sm:col-span-2">
            <span className="text-gray-600">Palavras-chave a EXCLUIR (vírgula)</span>
            <input
              value={notKeywords}
              onChange={(e) => setNotKeywords(e.target.value)}
              placeholder="ex: escola, consultoria (não trazer esses)"
              className="mt-1 w-full rounded-md border border-gray-300 px-3 py-2"
            />
          </label>
          <label className="text-sm">
            <span className="text-gray-600">Estado</span>
            <input
              value={estado}
              onChange={(e) => setEstado(e.target.value)}
              placeholder="ex: Sao Paulo"
              className="mt-1 w-full rounded-md border border-gray-300 px-3 py-2"
            />
          </label>
          <label className="text-sm">
            <span className="text-gray-600">Cidades (uma ou várias, vírgula)</span>
            <input
              value={cidades}
              onChange={(e) => setCidades(e.target.value)}
              placeholder="ex: Guarulhos, Bragança Paulista (vazio = estado todo)"
              className="mt-1 w-full rounded-md border border-gray-300 px-3 py-2"
            />
          </label>
          <label className="text-sm">
            <span className="text-gray-600">Funcionários — mínimo</span>
            <input
              type="number"
              value={minEmployees}
              onChange={(e) => setMinEmployees(Number(e.target.value))}
              min={1}
              className="mt-1 w-full rounded-md border border-gray-300 px-3 py-2"
            />
          </label>
          <label className="text-sm">
            <span className="text-gray-600">Funcionários — máximo (opcional)</span>
            <input
              type="number"
              value={maxEmployees}
              onChange={(e) => setMaxEmployees(e.target.value)}
              min={1}
              placeholder="ex: 2000 (vazio = sem limite)"
              className="mt-1 w-full rounded-md border border-gray-300 px-3 py-2"
            />
          </label>
          <label className="text-sm">
            <span className="text-gray-600">Nome específico (opcional)</span>
            <input
              value={nome}
              onChange={(e) => setNome(e.target.value)}
              placeholder="ex: Ambev"
              className="mt-1 w-full rounded-md border border-gray-300 px-3 py-2"
            />
          </label>
          <label className="text-sm">
            <span className="text-gray-600">Quantos resultados por busca</span>
            <select
              value={perPage}
              onChange={(e) => setPerPage(Number(e.target.value))}
              className="mt-1 w-full rounded-md border border-gray-300 px-3 py-2"
            >
              <option value={10}>10</option>
              <option value={25}>25</option>
              <option value={50}>50</option>
              <option value={100}>100</option>
            </select>
          </label>
          <label className="flex items-center gap-2 text-sm sm:col-span-2">
            <input
              type="checkbox"
              checked={onlyWithContact}
              onChange={(e) => setOnlyWithContact(e.target.checked)}
            />
            <span className="text-gray-600">{cfg.contactLabel}</span>
          </label>
        </div>
        <button
          type="submit"
          disabled={loading}
          className="mt-4 rounded-md bg-brand-500 px-4 py-2 text-sm font-medium text-white hover:bg-brand-600 disabled:opacity-50"
        >
          {loading ? "Buscando…" : "Prospectar"}
        </button>
        {msg && <p className="mt-3 text-sm text-gray-600">{msg}</p>}
      </form>

      <ManualCadastro mode={mode} onCreated={loadCompanies} />

      <section>
        <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-gray-500">
          {cfg.sectionTitle} ({companies.length})
        </h2>
        <div className="space-y-3">
          {companies.length === 0 && (
            <p className="text-sm text-gray-500">
              Nada por aqui ainda. Rode uma busca acima.
            </p>
          )}
          {companies.map((c) => (
            <CompanyCard key={c.id} company={c} onChanged={loadCompanies} />
          ))}
        </div>
      </section>
    </div>
  );
}

// Cadastro manual: quando o Apollo não acha, mas o CEO já tem o contato.
// Cria a empresa/consultório/escola já qualificada; o CEO clica "Abordar".
function ManualCadastro({
  mode,
  onCreated,
}: {
  mode: ProspeccaoMode;
  onCreated: () => void;
}) {
  const cfg = MODE_CONFIG[mode];
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState<string | null>(null);

  const [name, setName] = useState("");
  const [contactName, setContactName] = useState("");
  const [title, setTitle] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [city, setCity] = useState("");
  const [notes, setNotes] = useState("");

  const rotulo = cfg.cadRotulo;

  async function salvar(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim()) return;
    setBusy(true);
    setNote(null);
    try {
      const r = await fetch("/api/companies", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name,
          category: mode,
          contactName,
          title,
          email,
          phone,
          city,
          notes,
        }),
      });
      const d = await r.json();
      if (d.error) {
        setNote(`Erro: ${d.error}`);
      } else {
        setNote(
          `"${name}" cadastrada. Aparece na lista abaixo — clique "Abordar" para gerar o rascunho.`,
        );
        setName("");
        setContactName("");
        setTitle("");
        setEmail("");
        setPhone("");
        setCity("");
        setNotes("");
        onCreated();
      }
    } catch (err) {
      setNote(String(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="rounded-lg border border-dashed border-gray-300 bg-white p-4 shadow-sm">
      {!open ? (
        <button
          onClick={() => setOpen(true)}
          className="text-sm font-medium text-brand-600 hover:text-brand-700"
        >
          + Cadastrar {rotulo} manualmente (fora do Apollo)
        </button>
      ) : (
        <form onSubmit={salvar}>
          <div className="mb-3 flex items-center justify-between">
            <h2 className="font-semibold text-gray-800">
              Cadastrar {rotulo} manualmente
            </h2>
            <button
              type="button"
              onClick={() => setOpen(false)}
              className="text-xs text-gray-400 underline hover:text-gray-600"
            >
              fechar
            </button>
          </div>
          <p className="mb-3 text-xs text-gray-500">
            Para quando você já tem o contato e o Apollo não achou. Entra na
            mesma automação: revisão, follow-up e clique final seu.
          </p>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <label className="text-sm sm:col-span-2">
              <span className="text-gray-600">{cfg.cadNomeLabel} *</span>
              <input
                required
                value={name}
                onChange={(e) => setName(e.target.value)}
                className="mt-1 w-full rounded-md border border-gray-300 px-3 py-2"
              />
            </label>
            <label className="text-sm">
              <span className="text-gray-600">Pessoa de contato</span>
              <input
                value={contactName}
                onChange={(e) => setContactName(e.target.value)}
                placeholder={cfg.cadContatoPlaceholder}
                className="mt-1 w-full rounded-md border border-gray-300 px-3 py-2"
              />
            </label>
            <label className="text-sm">
              <span className="text-gray-600">Cargo</span>
              <input
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder={cfg.cadCargoPlaceholder}
                className="mt-1 w-full rounded-md border border-gray-300 px-3 py-2"
              />
            </label>
            <label className="text-sm">
              <span className="text-gray-600">E-mail (destinatário)</span>
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="contato@dominio.com.br"
                className="mt-1 w-full rounded-md border border-gray-300 px-3 py-2"
              />
            </label>
            <label className="text-sm">
              <span className="text-gray-600">Telefone (opcional)</span>
              <input
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                placeholder="ex: 11 99999-9999"
                className="mt-1 w-full rounded-md border border-gray-300 px-3 py-2"
              />
            </label>
            <label className="text-sm">
              <span className="text-gray-600">Cidade (opcional)</span>
              <input
                value={city}
                onChange={(e) => setCity(e.target.value)}
                className="mt-1 w-full rounded-md border border-gray-300 px-3 py-2"
              />
            </label>
            <label className="text-sm">
              <span className="text-gray-600">Observações (opcional)</span>
              <input
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                className="mt-1 w-full rounded-md border border-gray-300 px-3 py-2"
              />
            </label>
          </div>
          <button
            type="submit"
            disabled={busy || !name.trim()}
            className="mt-4 rounded-md bg-brand-500 px-4 py-2 text-sm font-medium text-white hover:bg-brand-600 disabled:opacity-50"
          >
            {busy ? "Salvando…" : "Cadastrar"}
          </button>
        </form>
      )}
      {note && <p className="mt-3 text-sm text-gray-600">{note}</p>}
    </div>
  );
}

function CompanyCard({
  company,
  onChanged,
}: {
  company: CompanyWithContacts;
  onChanged: () => void;
}) {
  const [hook, setHook] = useState<MessageHook>("saude_mental");
  const [state, setState] = useState<"idle" | "gerando" | "ok" | "erro">("idle");
  const [note, setNote] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [cnpj, setCnpj] = useState("");
  const [showCnpj, setShowCnpj] = useState(false);

  // "Abordar": revela o e-mail (1 crédito) + escreve + entra no follow-up.
  async function abordar() {
    if (
      !confirm(
        `Abordar "${company.name}"? Isso revela o e-mail do decisor (1 crédito do Apollo), escreve o rascunho e coloca no follow-up. O envio só sai com o seu clique depois.`,
      )
    )
      return;
    setState("gerando");
    setNote(null);
    setBusy(true);
    try {
      const r = await fetch("/api/prospect/abordar", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ companyId: company.id, hook }),
      });
      const d = await r.json();
      if (d.error) {
        setState("erro");
        setNote(d.error);
      } else {
        setState("ok");
        setNote(
          `Decisor: ${d.contato} · ${d.email} — rascunho criado. Veja em Rascunhos e dê o clique final.`,
        );
      }
      onChanged();
    } catch (e) {
      setState("erro");
      setNote(String(e));
    } finally {
      setBusy(false);
    }
  }

  // "Gerar rascunho": reexecuta só a etapa da IA (quando falhou), sem refazer
  // Apollo/revelação. Só faz sentido quando já há um contato com e-mail.
  async function gerarRascunho() {
    setBusy(true);
    setNote(null);
    try {
      const r = await fetch(`/api/companies/${company.id}/draft`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ hook }),
      });
      const txt = await r.text();
      let d: { ok?: boolean; error?: string } = {};
      try {
        d = txt ? JSON.parse(txt) : {};
      } catch {
        setState("erro");
        setNote(`O servidor respondeu ${r.status}. Tente de novo.`);
        return;
      }
      if (r.ok && d.ok) {
        setState("ok");
        setNote("Rascunho gerado — confirme o envio em Rascunhos.");
      } else {
        setState("erro");
        setNote(d.error ?? `Não gerou (erro ${r.status}).`);
      }
      onChanged();
    } catch (e) {
      setState("erro");
      setNote(String(e));
    } finally {
      setBusy(false);
    }
  }

  async function excluir() {
    if (!confirm(`Excluir a empresa "${company.name}"? Não dá para desfazer.`))
      return;
    setBusy(true);
    try {
      await fetch(`/api/companies/${company.id}`, { method: "DELETE" });
      onChanged();
    } finally {
      setBusy(false);
    }
  }

  async function revelar(contactId: string) {
    setBusy(true);
    setNote(null);
    try {
      const r = await fetch(`/api/contacts/${contactId}/reveal`, {
        method: "POST",
      });
      const d = await r.json();
      if (d.error) setNote(`Erro ao revelar: ${d.error}`);
      else if (!d.revealed)
        setNote("O Apollo não tinha e-mail/telefone deste contato.");
      else if (d.verdict && d.verdict !== "valid")
        setNote(
          `E-mail revelado, mas a validação deu "${d.verdict}" — melhor não enviar (risco de retorno). Tente outro contato.`,
        );
      onChanged();
    } finally {
      setBusy(false);
    }
  }

  // Revela + valida TODOS os decisores de uma vez (para ver quais têm e-mail
  // realmente válido). Mesmo rigor das operadoras.
  async function revelarTodos() {
    const alvos = (company.contacts ?? []).filter(
      (c) => !c.email && c.apollo_id && !emailUnavailable(c.email_status),
    );
    if (alvos.length === 0) {
      setNote("Nada novo para revelar (contatos já resolvidos).");
      return;
    }
    if (
      !confirm(
        `Revelar e VALIDAR ${alvos.length} contato(s) de uma vez? Consome até ${alvos.length} créditos do Apollo + as verificações. Você verá quais e-mails são válidos.`,
      )
    )
      return;
    setBusy(true);
    setNote("Revelando e validando… pode levar alguns segundos.");
    try {
      const r = await fetch(`/api/companies/${company.id}/reveal-contacts`, {
        method: "POST",
      });
      const d = await r.json();
      if (d.error) setNote(`Erro: ${d.error}`);
      else
        setNote(
          `${d.revelados} revelado(s): ✓ ${d.validos} válido(s) · ${d.catchAll} catch-all · ${d.invalidos} inválido(s). O "Abordar" já prioriza os válidos.`,
        );
      onChanged();
    } catch (e) {
      setNote(String(e));
    } finally {
      setBusy(false);
    }
  }

  // Reforço grátis: puxa o e-mail registrado no CNPJ (Receita), sem Apollo.
  async function puxarCnpj() {
    if (!cnpj.trim()) return;
    setBusy(true);
    setNote(null);
    try {
      const r = await fetch(`/api/companies/${company.id}/cnpj-email`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ cnpj }),
      });
      const d = await r.json();
      if (d.error) {
        setState("erro");
        setNote(d.error);
      } else if (!d.email) {
        setState("erro");
        setNote(
          `${d.razaoSocial ?? "Empresa"} (${[d.municipio, d.uf].filter(Boolean).join("/")}) — ${d.aviso ?? "sem e-mail na Receita."}`,
        );
      } else {
        setState("ok");
        setNote(
          `E-mail do CNPJ: ${d.email} — ${d.razaoSocial ?? ""} adicionado como contato. Já dá para Abordar.`,
        );
        setCnpj("");
        setShowCnpj(false);
      }
      onChanged();
    } catch (e) {
      setState("erro");
      setNote(String(e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="rounded-lg border border-gray-200 bg-white p-4 shadow-sm">
      <div className="flex items-start justify-between gap-4">
        <div>
          <p className="font-medium text-gray-900">{company.name}</p>
          <p className="text-xs text-gray-500">
            {[
              company.industry,
              company.employee_count ? `${company.employee_count} func.` : null,
              [company.city, company.state].filter(Boolean).join("/"),
              company.phone,
            ]
              .filter(Boolean)
              .join(" · ")}
          </p>
          {company.qualification_notes && (
            <p className="mt-1 text-xs text-gray-400">{company.qualification_notes}</p>
          )}
        </div>
        <div className="flex flex-col items-end gap-1">
          <span className="inline-block rounded-full bg-brand-100 px-2 py-0.5 text-xs font-medium text-brand-700">
            score {company.qualification_score}
          </span>
          <p className="text-xs text-gray-400">
            {STATUS_LABELS[company.status]} · prio {company.priority}
          </p>
          <button
            onClick={excluir}
            disabled={busy}
            className="text-xs text-red-600 underline hover:text-red-700 disabled:opacity-50"
          >
            Excluir
          </button>
        </div>
      </div>

      {/* Decisores (RH, dono, diretor, sócio) */}
      {company.contacts?.length > 0 && (
        <div className="mt-3 rounded-md border border-gray-100 bg-gray-50 p-2">
          <div className="mb-1 flex items-center justify-between gap-2">
            <p className="text-xs font-semibold uppercase tracking-wide text-gray-500">
              Decisores
            </p>
            {company.contacts.some(
              (c) => !c.email && c.apollo_id && !emailUnavailable(c.email_status),
            ) && (
              <button
                onClick={revelarTodos}
                disabled={busy}
                className="rounded-md border border-brand-300 px-2 py-0.5 text-[11px] font-medium text-brand-700 hover:bg-brand-50 disabled:opacity-50"
                title="Revela e valida o e-mail de todos os decisores (mostra quais são válidos)"
              >
                🔎 Revelar e validar todos
              </button>
            )}
          </div>
          <div className="space-y-1.5">
            {company.contacts.map((c) => {
              const vb = verdictInfo(c.email_verdict);
              return (
                <div
                  key={c.id}
                  className="flex flex-wrap items-center justify-between gap-2 text-sm"
                >
                  <div className="min-w-0">
                    <span className="font-medium text-gray-800">{c.name}</span>
                    {c.title && (
                      <span className="text-xs text-gray-500"> · {c.title}</span>
                    )}
                    <div className="text-xs text-gray-500">
                      {c.email ? (
                        <>
                          <span className="text-brand-700">{c.email}</span>
                          {vb && (
                            <span
                              className={`ml-1 rounded px-1.5 py-0.5 text-[10px] font-semibold ${vb.cls}`}
                            >
                              {vb.label}
                            </span>
                          )}
                        </>
                      ) : emailUnavailable(c.email_status) ? (
                        <span className="italic text-gray-400">
                          sem e-mail no Apollo (já tentamos revelar)
                        </span>
                      ) : (
                        <span className="italic text-gray-500">
                          e-mail revelado ao Abordar (1 crédito)
                        </span>
                      )}
                      {c.phone ? ` · ${c.phone}` : ""}
                    </div>
                  </div>
                  {!c.email &&
                    c.apollo_id &&
                    !emailUnavailable(c.email_status) && (
                      <button
                        onClick={() => revelar(c.id)}
                        disabled={busy}
                        className="rounded-md border border-brand-300 px-2 py-1 text-xs font-medium text-brand-700 hover:bg-brand-50 disabled:opacity-50"
                        title="Revela e VALIDA o e-mail via Apollo + ZeroBounce (consome 1 crédito)"
                      >
                        Revelar e validar
                      </button>
                    )}
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Reforço grátis: e-mail do CNPJ (Receita), quando o Apollo não tem */}
      <div className="mt-3">
        {!showCnpj ? (
          <button
            onClick={() => setShowCnpj(true)}
            disabled={busy}
            className="text-xs text-gray-500 underline hover:text-gray-700 disabled:opacity-50"
          >
            + Puxar e-mail do CNPJ (Receita, grátis)
          </button>
        ) : (
          <div className="rounded-md border border-gray-100 bg-gray-50 p-2">
            <p className="mb-1 text-xs text-gray-500">
              Cole o CNPJ desta empresa (acha no Google/site). Puxamos o e-mail
              registrado na Receita — sem gastar crédito do Apollo.
            </p>
            <div className="flex flex-wrap items-center gap-2">
              <input
                value={cnpj}
                onChange={(e) => setCnpj(e.target.value)}
                placeholder="00.000.000/0000-00"
                className="w-48 rounded-md border border-gray-300 px-2 py-1 text-sm"
              />
              <button
                onClick={puxarCnpj}
                disabled={busy || !cnpj.trim()}
                className="rounded-md border border-brand-300 px-2 py-1 text-xs font-medium text-brand-700 hover:bg-brand-50 disabled:opacity-50"
              >
                {busy ? "Consultando…" : "Puxar e-mail"}
              </button>
              <button
                onClick={() => {
                  setShowCnpj(false);
                  setCnpj("");
                }}
                disabled={busy}
                className="text-xs text-gray-400 underline hover:text-gray-600"
              >
                cancelar
              </button>
            </div>
          </div>
        )}
      </div>

      <div className="mt-3 flex flex-wrap items-center gap-2">
        <select
          value={hook}
          onChange={(e) => setHook(e.target.value as MessageHook)}
          className="rounded-md border border-gray-300 px-2 py-1 text-sm"
        >
          {Object.entries(HOOK_LABELS).map(([k, v]) => (
            <option key={k} value={k}>
              {v}
            </option>
          ))}
        </select>
        <button
          onClick={abordar}
          disabled={busy || state === "gerando"}
          className="rounded-md bg-brand-500 px-3 py-1 text-sm font-medium text-white hover:bg-brand-600 disabled:opacity-50"
          title="Revela o e-mail do decisor (1 crédito), escreve o e-mail e coloca no follow-up"
        >
          {state === "gerando" ? "Abordando…" : "Abordar (revelar + escrever)"}
        </button>
        {company.contacts?.some((c) => c.email) && (
          <button
            onClick={gerarRascunho}
            disabled={busy}
            className="rounded-md border border-brand-300 px-3 py-1 text-sm font-medium text-brand-700 hover:bg-brand-50 disabled:opacity-50"
            title="Reescreve o rascunho de e-mail com a IA (substitui o pendente). Use quando o rascunho não gerou."
          >
            📝 Gerar rascunho
          </button>
        )}
        {note && (
          <span
            className={`text-xs ${state === "erro" ? "text-red-600" : "text-green-600"}`}
          >
            {note}
          </span>
        )}
      </div>
    </div>
  );
}
