// Lara — assistente do CEO DENTRO do Growth AI.
//
// A Lara conversa com o Felipe e EXECUTA o que ele pede usando "ferramentas"
// (tool use da Anthropic). Cada ferramenta chama exatamente os MESMOS endpoints
// que a interface usa — ou seja, a Lara age "como se fosse o Felipe clicando",
// com as credenciais dele (encaminhamos o cabeçalho de autenticação).
//
// TRAVA SAGRADA (regra inviolável do projeto): a Lara NUNCA envia e-mail. Ela
// PREPARA rascunhos; o disparo continua sendo o clique final do CEO. Por isso
// não existe ferramenta de envio aqui.

import Anthropic from "@anthropic-ai/sdk";
import type {
  MessageParam,
  MessageCreateParamsNonStreaming,
  Tool,
  ToolResultBlockParam,
} from "@anthropic-ai/sdk/resources/messages";

import { MODEL } from "./model";

function client(): Anthropic {
  if (!process.env.ANTHROPIC_API_KEY) {
    throw new Error("Anthropic não configurada (ANTHROPIC_API_KEY).");
  }
  return new Anthropic();
}

const MODELO_LABEL = MODEL.includes("opus-5")
  ? "Claude Opus 5"
  : MODEL.includes("sonnet-5")
    ? "Claude Sonnet 5"
    : MODEL;

const SYSTEM = `Você é a LARA, a assistente comercial pessoal do Felipe (Sócio-Diretor \
da MenthalHelp / Therapy Minds) DENTRO do sistema Growth AI. Você executa o que \
ele pedir usando as ferramentas disponíveis — agindo como se fosse ele mesmo \
operando o sistema.

Você roda sobre o modelo ${MODELO_LABEL} (${MODEL}), da Anthropic. Se o Felipe \
perguntar qual IA/modelo você usa, pode responder isso naturalmente.

Estilo: português do Brasil, direta, cordial e eficiente, como uma secretária \
executiva de confiança. Respostas curtas. Ao concluir uma ação, diga em 1–2 \
frases o que fez e o resultado.

AUTONOMIA: você tem AUTONOMIA para executar o que o Felipe pedir usando as \
ferramentas — inclusive AGIR (atualizar estágio/status no funil e pipeline, \
marcar encaminhamentos, cadastrar, abordar, rejeitar rascunho, excluir). Não \
diga que "não consegue" sem antes verificar suas ferramentas. Para agir sobre um \
parceiro específico, primeiro descubra o id dele com 'listar_empresas' (busca \
por nome), depois use a ferramenta de ação com esse id.

MOSTRAR RASCUNHOS: quando o CEO pedir para VER/analisar/ler um rascunho, use \
'listar_rascunhos' para achar o(s) rascunho(s) e 'ver_rascunho' para pegar o \
TEXTO COMPLETO, e então mostre na conversa o parceiro, o assunto e o corpo do \
e-mail (transcreva o texto do rascunho para ele ler). Nunca diga que não \
consegue puxar o rascunho.

REGRAS INVIOLÁVEIS:
- Você NUNCA envia e-mail. Você PREPARA rascunhos; o envio é sempre o clique \
final do Felipe na aba Rascunhos. Se ele pedir para "enviar", prepare o \
rascunho e avise que está pronto para ele aprovar e disparar.
- Antes de EXCLUIR dados ou de usar 'abordar' (que gasta 1 crédito do Apollo), \
confirme com ele antes.
- Use SEMPRE as ferramentas para obter dados reais e para AGIR — nunca invente \
números, nomes ou status. Se não tiver certeza, consulte com uma ferramenta.
- Se faltar informação para executar (ex: qual categoria prospectar, qual \
cidade), pergunte de forma objetiva em vez de adivinhar.
- Categorias válidas de parceiro: empresa, medico, escola, igreja, sindicato, \
operadora. Prefeituras de licitação: sao-paulo, guarulhos, barueri, braganca.`;

// --- Ferramentas expostas à Lara -------------------------------------------

const TOOLS: Tool[] = [
  {
    name: "get_stats",
    description:
      "Números gerais do painel (leads, qualificados, rascunhos pendentes, respostas do dia, parcerias etc.).",
    input_schema: { type: "object", properties: {} },
  },
  {
    name: "get_funil",
    description: "Funil comercial: quantos leads em cada etapa e parcerias por segmento.",
    input_schema: { type: "object", properties: {} },
  },
  {
    name: "listar_empresas",
    description:
      "Lista parceiros/leads. Filtra por categoria (empresa, medico, escola, igreja, sindicato, operadora), status e/ou por nome (q).",
    input_schema: {
      type: "object",
      properties: {
        category: { type: "string", description: "empresa|medico|escola|igreja|sindicato|operadora" },
        status: { type: "string", description: "ex: qualificado, em_negociacao, parceria_ativa" },
        q: { type: "string", description: "busca por nome" },
      },
    },
  },
  {
    name: "listar_rascunhos",
    description:
      "Lista rascunhos de e-mail (com o parceiro, assunto e uma prévia do texto). status opcional: pendente|aprovado|enviado|rejeitado.",
    input_schema: {
      type: "object",
      properties: { status: { type: "string" } },
    },
  },
  {
    name: "ver_rascunho",
    description:
      "Puxa o TEXTO COMPLETO de um rascunho pelo id (assunto + corpo + destinatário), para mostrar ao CEO no chat quando ele pedir para ver/analisar o rascunho.",
    input_schema: {
      type: "object",
      properties: { draftId: { type: "string" } },
      required: ["draftId"],
    },
  },
  {
    name: "listar_tarefas",
    description: "Lista tarefas. status opcional: aberta|concluida.",
    input_schema: {
      type: "object",
      properties: { status: { type: "string" } },
    },
  },
  {
    name: "criar_tarefa",
    description: "Cria uma tarefa para o CEO.",
    input_schema: {
      type: "object",
      properties: {
        title: { type: "string", description: "o que precisa ser feito" },
        detail: { type: "string" },
        due_date: { type: "string", description: "data YYYY-MM-DD (opcional)" },
      },
      required: ["title"],
    },
  },
  {
    name: "concluir_tarefa",
    description: "Marca uma tarefa como concluída pelo id.",
    input_schema: {
      type: "object",
      properties: { id: { type: "string" } },
      required: ["id"],
    },
  },
  {
    name: "prospectar",
    description:
      "Busca novos leads no Apollo e salva os qualificados. NÃO gasta crédito de revelação de e-mail (isso é feito depois, no 'Abordar').",
    input_schema: {
      type: "object",
      properties: {
        category: { type: "string", description: "empresa|medico|escola|igreja|sindicato" },
        keywords: { type: "string", description: "setores/termos, separados por vírgula" },
        estado: { type: "string", description: "ex: Sao Paulo" },
        cidades: { type: "string", description: "cidades separadas por vírgula (opcional)" },
        name: { type: "string", description: "nome específico (opcional)" },
        perPage: { type: "number", description: "quantos resultados (padrão 25)" },
      },
      required: ["category"],
    },
  },
  {
    name: "preparar_rascunho",
    description:
      "Gera (prepara) um rascunho de e-mail para um lead/parceiro pelo id. NÃO envia — fica pendente para o CEO aprovar.",
    input_schema: {
      type: "object",
      properties: {
        companyId: { type: "string" },
        hook: { type: "string", description: "nr1|saude_mental|tea_aba (opcional)" },
      },
      required: ["companyId"],
    },
  },
  {
    name: "listar_licitacoes",
    description: "Lista as licitações/editais salvos. prefeitura opcional: sao-paulo|guarulhos|barueri|braganca.",
    input_schema: {
      type: "object",
      properties: { prefeitura: { type: "string" } },
    },
  },
  {
    name: "buscar_licitacoes",
    description:
      "Vasculha o PNCP por novos editais no perfil da clínica. prefeitura opcional (senão, todas).",
    input_schema: {
      type: "object",
      properties: { prefeitura: { type: "string" } },
    },
  },
  {
    name: "atualizar_estagio",
    description:
      "Move um parceiro no PIPELINE e atualiza o STATUS no funil. Use quando o CEO disser que avançou/fechou/perdeu um parceiro (ex: 'fechamos parceria', 'marcar como parceria ativa'). Estágios válidos por categoria — operadora: novo, contatado, em_conversa, em_credenciamento, implantacao, credenciada(=parceria fechada); empresa: novo, contatado, em_conversa, proposta, contrato, ativa(=fechada); escola/igreja: novo, contatado, em_conversa, reuniao, parceria(=fechada); medico: novo, contatado, em_conversa, visita, encaminhando(=fechada); sindicato: novo, contatado, em_conversa, reuniao, proposta, parceria(=fechada). Para descartar, use stage 'descartado'.",
    input_schema: {
      type: "object",
      properties: {
        companyId: { type: "string" },
        stage: { type: "string", description: "id do estágio (ver lista por categoria)" },
      },
      required: ["companyId", "stage"],
    },
  },
  {
    name: "marcar_encaminhamento",
    description:
      "Registra que um parceiro é fonte de encaminhamento e/ou soma/subtrai indicações. delta +1 para registrar uma nova indicação.",
    input_schema: {
      type: "object",
      properties: {
        companyId: { type: "string" },
        isSource: { type: "boolean" },
        delta: { type: "number", description: "+1, -1..." },
      },
      required: ["companyId"],
    },
  },
  {
    name: "cadastrar_parceiro",
    description:
      "Cadastra manualmente um parceiro (quando o CEO já tem o contato). Entra qualificado, pronto para abordar.",
    input_schema: {
      type: "object",
      properties: {
        name: { type: "string" },
        category: { type: "string", description: "empresa|medico|escola|igreja|sindicato" },
        contactName: { type: "string" },
        title: { type: "string" },
        email: { type: "string" },
        phone: { type: "string" },
        city: { type: "string" },
        notes: { type: "string" },
      },
      required: ["name", "category"],
    },
  },
  {
    name: "excluir_parceiros",
    description:
      "Exclui um ou mais parceiros pelos ids. Ação destrutiva — confirme com o CEO antes.",
    input_schema: {
      type: "object",
      properties: { ids: { type: "array", items: { type: "string" } } },
      required: ["ids"],
    },
  },
  {
    name: "abordar",
    description:
      "Revela o e-mail do decisor (GASTA 1 crédito do Apollo), escreve o rascunho e coloca no follow-up. Confirme com o CEO antes de usar, por causa do custo. NÃO envia — o rascunho fica pendente.",
    input_schema: {
      type: "object",
      properties: {
        companyId: { type: "string" },
        hook: { type: "string", description: "nr1|saude_mental|tea_aba (opcional)" },
      },
      required: ["companyId"],
    },
  },
  {
    name: "rejeitar_rascunho",
    description: "Rejeita (descarta) um rascunho pendente pelo id.",
    input_schema: {
      type: "object",
      properties: { draftId: { type: "string" } },
      required: ["draftId"],
    },
  },
];

// --- Execução das ferramentas (chamando os próprios endpoints) --------------

type Ctx = { origin: string; auth: string | null };

async function api(
  ctx: Ctx,
  method: "GET" | "POST" | "PATCH" | "DELETE",
  path: string,
  body?: unknown,
): Promise<unknown> {
  const headers: Record<string, string> = { "Content-Type": "application/json" };
  if (ctx.auth) headers["Authorization"] = ctx.auth; // age com as credenciais do CEO
  const res = await fetch(`${ctx.origin}${path}`, {
    method,
    headers,
    body: body ? JSON.stringify(body) : undefined,
  });
  const txt = await res.text();
  let json: unknown = null;
  try {
    json = txt ? JSON.parse(txt) : null;
  } catch {
    return { erro: `Resposta não-JSON (status ${res.status}).` };
  }
  return json;
}

// Compacta listas grandes para não estourar o contexto do modelo.
function enxugar<T extends Record<string, unknown>>(
  arr: unknown,
  campos: string[],
  limite = 40,
): unknown[] {
  if (!Array.isArray(arr)) return [];
  return arr.slice(0, limite).map((row) => {
    const r = row as T;
    const out: Record<string, unknown> = {};
    for (const c of campos) out[c] = r[c];
    return out;
  });
}

async function executar(
  ctx: Ctx,
  name: string,
  input: Record<string, unknown>,
): Promise<unknown> {
  switch (name) {
    case "get_stats":
      return api(ctx, "GET", "/api/stats");
    case "get_funil":
      return api(ctx, "GET", "/api/funnel");
    case "listar_empresas": {
      const p = new URLSearchParams();
      if (input.category) p.set("category", String(input.category));
      if (input.status) p.set("status", String(input.status));
      if (input.q) p.set("q", String(input.q));
      const d = (await api(ctx, "GET", `/api/companies?${p}`)) as {
        companies?: unknown[];
      };
      return {
        total: d.companies?.length ?? 0,
        empresas: enxugar(d.companies, [
          "id",
          "name",
          "category",
          "status",
          "city",
          "state",
          "qualification_score",
          "priority",
        ]),
      };
    }
    case "listar_rascunhos": {
      const p = new URLSearchParams();
      if (input.status) p.set("status", String(input.status));
      const d = (await api(ctx, "GET", `/api/drafts?${p}`)) as {
        drafts?: Record<string, unknown>[];
      };
      const lista = (d.drafts ?? []).slice(0, 20).map((r) => ({
        id: r.id,
        empresa: (r.companies as { name?: string } | null)?.name ?? null,
        subject: r.subject,
        status: r.status,
        channel: r.channel,
        is_reply: r.is_reply,
        blocked: r.blocked,
        previa:
          typeof r.body === "string" ? r.body.slice(0, 220) : null,
      }));
      return { total: d.drafts?.length ?? 0, rascunhos: lista };
    }
    case "ver_rascunho": {
      const d = (await api(ctx, "GET", `/api/drafts/${input.draftId}`)) as {
        draft?: Record<string, unknown>;
        error?: string;
      };
      if (d.error || !d.draft) return { erro: d.error ?? "Rascunho não encontrado." };
      const r = d.draft;
      return {
        id: r.id,
        empresa: (r.companies as { name?: string } | null)?.name ?? null,
        para: (r.contacts as { email?: string } | null)?.email ?? null,
        assunto: r.subject,
        corpo: r.body,
        status: r.status,
        canal: r.channel,
      };
    }
    case "listar_tarefas": {
      const p = new URLSearchParams();
      if (input.status) p.set("status", String(input.status));
      const d = (await api(ctx, "GET", `/api/tasks?${p}`)) as { tasks?: unknown[] };
      return {
        total: d.tasks?.length ?? 0,
        tarefas: enxugar(d.tasks, ["id", "title", "status", "due_date", "level", "created_by"]),
      };
    }
    case "criar_tarefa":
      return api(ctx, "POST", "/api/tasks", {
        title: input.title,
        detail: input.detail ?? null,
        dueDate: input.due_date ?? undefined,
        createdBy: "lara",
      });
    case "concluir_tarefa":
      return api(ctx, "PATCH", `/api/tasks/${input.id}`, { status: "concluida" });
    case "prospectar": {
      const cidadeList = String(input.cidades ?? "")
        .split(",")
        .map((c) => c.trim())
        .filter(Boolean);
      const estado = String(input.estado ?? "Sao Paulo").trim();
      const locations =
        cidadeList.length > 0
          ? cidadeList.map((c) => [c, estado, "Brazil"].filter(Boolean).join(", "))
          : [[estado, "Brazil"].filter(Boolean).join(", ")];
      return api(ctx, "POST", "/api/prospect", {
        category: input.category,
        keywords: String(input.keywords ?? "")
          .split(",")
          .map((k) => k.trim())
          .filter(Boolean),
        name: input.name || undefined,
        locations,
        perPage: input.perPage ?? 25,
        onlyWithContact: input.category !== "sindicato",
      });
    }
    case "preparar_rascunho":
      return api(ctx, "POST", "/api/drafts", {
        companyId: input.companyId,
        hook: input.hook ?? "saude_mental",
      });
    case "listar_licitacoes": {
      const p = new URLSearchParams();
      if (input.prefeitura) p.set("prefeitura", String(input.prefeitura));
      const d = (await api(ctx, "GET", `/api/licitacoes?${p}`)) as {
        licitacoes?: unknown[];
      };
      return {
        total: d.licitacoes?.length ?? 0,
        licitacoes: enxugar(d.licitacoes, [
          "id",
          "objeto",
          "modalidade",
          "municipio",
          "data_encerramento",
          "status",
          "link",
        ]),
      };
    }
    case "buscar_licitacoes":
      return api(ctx, "POST", "/api/licitacoes/monitor", {
        prefeitura: input.prefeitura || undefined,
      });
    case "atualizar_estagio":
      return api(ctx, "POST", `/api/companies/${input.companyId}/stage`, {
        stage: input.stage,
      });
    case "marcar_encaminhamento":
      return api(ctx, "POST", `/api/companies/${input.companyId}/referral`, {
        isSource: input.isSource,
        delta: input.delta,
      });
    case "cadastrar_parceiro":
      return api(ctx, "POST", "/api/companies", {
        name: input.name,
        category: input.category,
        contactName: input.contactName,
        title: input.title,
        email: input.email,
        phone: input.phone,
        city: input.city,
        notes: input.notes,
      });
    case "excluir_parceiros":
      return api(ctx, "POST", "/api/companies/bulk-delete", { ids: input.ids });
    case "abordar":
      return api(ctx, "POST", "/api/prospect/abordar", {
        companyId: input.companyId,
        hook: input.hook ?? "saude_mental",
      });
    case "rejeitar_rascunho":
      return api(ctx, "PATCH", `/api/drafts/${input.draftId}`, {
        action: "rejeitar",
      });
    default:
      return { erro: `Ferramenta desconhecida: ${name}` };
  }
}

export interface LaraTurn {
  role: "user" | "assistant";
  content: string;
}

export interface LaraResult {
  reply: string;
  acoes: string[]; // nomes das ferramentas que a Lara usou (transparência)
}

// Roda um turno da Lara: recebe o histórico da conversa, deixa o modelo pensar
// e usar ferramentas (em loop) e devolve a resposta final + as ações feitas.
export async function runLara(
  ctx: Ctx,
  turns: LaraTurn[],
): Promise<LaraResult> {
  const messages: MessageParam[] = turns.map((t) => ({
    role: t.role,
    content: t.content,
  }));
  const acoes: string[] = [];
  const anthropic = client();

  for (let i = 0; i < 6; i++) {
    const resp = await anthropic.messages.create({
      model: MODEL,
      max_tokens: 4000,
      // Esforço médio: a Lara raciocina o suficiente para pedidos vagos, mas
      // sem "pensar demais" (mantém a resposta rápida no chat).
      output_config: { effort: "medium" },
      system: SYSTEM,
      tools: TOOLS,
      messages,
    } as MessageCreateParamsNonStreaming);

    if (resp.stop_reason === "tool_use") {
      messages.push({ role: "assistant", content: resp.content });
      const results: ToolResultBlockParam[] = [];
      for (const block of resp.content) {
        if (block.type === "tool_use") {
          acoes.push(block.name);
          let out: unknown;
          try {
            out = await executar(ctx, block.name, (block.input ?? {}) as Record<string, unknown>);
          } catch (e) {
            out = { erro: e instanceof Error ? e.message : "falha na ferramenta" };
          }
          results.push({
            type: "tool_result",
            tool_use_id: block.id,
            content: JSON.stringify(out).slice(0, 6000),
          });
        }
      }
      messages.push({ role: "user", content: results });
      continue;
    }

    // Resposta final (texto).
    const texto = resp.content
      .filter((b) => b.type === "text")
      .map((b) => (b.type === "text" ? b.text : ""))
      .join("\n")
      .trim();
    return { reply: texto || "(sem resposta)", acoes };
  }

  return {
    reply:
      "Fiz várias etapas, mas precisei parar por segurança (muitos passos). Pode me pedir de novo, de forma mais direta?",
    acoes,
  };
}
