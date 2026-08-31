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
  Tool,
  ToolResultBlockParam,
} from "@anthropic-ai/sdk/resources/messages";

const MODEL = process.env.ANTHROPIC_MODEL ?? "claude-opus-4-8";

function client(): Anthropic {
  if (!process.env.ANTHROPIC_API_KEY) {
    throw new Error("Anthropic não configurada (ANTHROPIC_API_KEY).");
  }
  return new Anthropic();
}

const SYSTEM = `Você é a LARA, a assistente comercial pessoal do Felipe (Sócio-Diretor \
da MenthalHelp / Therapy Minds) DENTRO do sistema Growth AI. Você executa o que \
ele pedir usando as ferramentas disponíveis — agindo como se fosse ele mesmo \
operando o sistema.

Estilo: português do Brasil, direta, cordial e eficiente, como uma secretária \
executiva de confiança. Respostas curtas. Ao concluir uma ação, diga em 1–2 \
frases o que fez e o resultado.

REGRAS INVIOLÁVEIS:
- Você NUNCA envia e-mail. Você PREPARA rascunhos; o envio é sempre o clique \
final do Felipe na aba Rascunhos. Se ele pedir para "enviar", prepare o \
rascunho e avise que está pronto para ele aprovar e disparar.
- Antes de qualquer ação que EXCLUA dados em massa, confirme com ele antes.
- Use SEMPRE as ferramentas para obter dados reais — nunca invente números, \
nomes ou status. Se não tiver certeza, consulte com uma ferramenta.
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
    description: "Lista rascunhos de e-mail. status opcional: pendente|aprovado|enviado|rejeitado.",
    input_schema: {
      type: "object",
      properties: { status: { type: "string" } },
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
];

// --- Execução das ferramentas (chamando os próprios endpoints) --------------

type Ctx = { origin: string; auth: string | null };

async function api(
  ctx: Ctx,
  method: "GET" | "POST" | "PATCH",
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
      const d = (await api(ctx, "GET", `/api/drafts?${p}`)) as { drafts?: unknown[] };
      return {
        total: d.drafts?.length ?? 0,
        rascunhos: enxugar(d.drafts, ["id", "subject", "status", "channel", "is_reply", "blocked"]),
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

  for (let i = 0; i < 8; i++) {
    const resp = await anthropic.messages.create({
      model: MODEL,
      max_tokens: 1500,
      system: SYSTEM,
      tools: TOOLS,
      messages,
    });

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
