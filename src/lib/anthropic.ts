// Geração de rascunhos e leitura de respostas com a API da Anthropic.
//
// REGRA INEGOCIÁVEL (brief, seção 4): a IA só PREPARA. E-mail só sai com o
// clique do CEO. (O WhatsApp, via API oficial, segue o funil aprovado.)

import Anthropic from "@anthropic-ai/sdk";
import type {
  Company,
  Contact,
  DraftChannel,
  MessageHook,
  ResponseSentiment,
} from "./types";

const MODEL = process.env.ANTHROPIC_MODEL ?? "claude-opus-4-8";

let client: Anthropic | null = null;
function getClient(): Anthropic {
  if (!process.env.ANTHROPIC_API_KEY) {
    throw new Error(
      "Anthropic não configurada. Defina ANTHROPIC_API_KEY no .env.local.",
    );
  }
  client ??= new Anthropic();
  return client;
}

// Contexto de cada gancho (usado principalmente para empresas).
const HOOK_BRIEFING: Record<MessageHook, string> = {
  nr1:
    "Gancho NR-1: a atualização da NR-1 obriga empresas a gerenciar riscos " +
    "psicossociais (estresse, burnout, assédio). O prazo de adequação " +
    "(26/mai/2026) JÁ PASSOU — é urgência regulatória real. Posicione a " +
    "MenthalHelp como parceira para essa adequação.",
  saude_mental:
    "Gancho saúde mental corporativa: foco em reduzir afastamentos (INSS/CID " +
    "F), presenteísmo e turnover com um programa estruturado.",
  tea_aba:
    "Gancho TEA/ABA: muitos colaboradores têm filhos com autismo. A " +
    "MenthalHelp tem forte expertise em TEA e ciência ABA.",
};

// Contexto por tipo de parceiro (a "tese" da abordagem muda).
function categoryBriefing(company: Company, hook: MessageHook): string {
  switch (company.category) {
    case "operadora":
      return (
        "Alvo: uma OPERADORA de saúde. Objetivo: apresentar a clínica e abrir " +
        "conversa para CREDENCIAMENTO / parceria — a MenthalHelp quer ser " +
        "credenciada e atender os beneficiários da operadora. Destaque " +
        "qualidade clínica, capacidade (3.000+ pacientes/mês, várias " +
        "unidades) e a expertise em TEA/ABA. Tom institucional e respeitoso."
      );
    case "escola":
      return (
        "Alvo: uma ESCOLA/colégio (falar com a coordenação). Objetivo: " +
        "parceria institucional e canal de cuidado para alunos e famílias — " +
        "avaliação e acompanhamento em saúde mental e neurodesenvolvimento " +
        "(forte em TEA/ABA). Tom acolhedor e educativo."
      );
    case "medico":
      return (
        "Alvo: um MÉDICO prescritor (neuro, psiquiatra, pediatra, " +
        "neuropediatra ou geriatra). Objetivo: rede de encaminhamento mútuo. " +
        "Tom colega-a-colega, técnico e cordial."
      );
    default:
      // empresa
      return `Alvo: uma EMPRESA (falar com o RH). ${HOOK_BRIEFING[hook]}`;
  }
}

const SYSTEM_PROMPT = `Você é o assistente comercial da MenthalHelp, uma clínica \
multidisciplinar de saúde mental e neurodesenvolvimento (forte expertise em \
TEA/ABA), com mais de 3.000 pacientes/mês e unidades em Guarulhos, Zona Norte \
de SP, Bragança Paulista e Alphaville.

Seu trabalho é escrever o RASCUNHO de uma mensagem de abordagem comercial, para \
um humano revisar e aprovar antes de enviar.

Diretrizes de escrita:
- Português do Brasil, tom profissional, cordial e consultivo — nunca "vendedor".
- Curto: e-mail no máximo ~130 palavras; WhatsApp ainda mais curto e direto.
- Personalize com o nome do parceiro e (se houver) o nome/cargo do contato.
- Mostre valor concreto e feche com um convite leve para uma conversa de 15-20 min.
- Não invente dados. Se não souber algo, não afirme.
- Nunca use linguagem alarmista ou pressão. Nada em CAIXA ALTA gritando.

FORMATO DE SAÍDA: responda SOMENTE com um objeto JSON válido, sem texto antes \
ou depois e sem blocos de código. Campos exatos:
{"subject": "<assunto do e-mail; string vazia para WhatsApp>", "body": "<corpo>"}`;

export interface GeneratedDraft {
  subject: string;
  body: string;
}

function parseJsonObject(text: string): Record<string, unknown> {
  const start = text.indexOf("{");
  const end = text.lastIndexOf("}");
  if (start === -1 || end === -1 || end <= start) {
    throw new Error("A IA não retornou JSON válido.");
  }
  return JSON.parse(text.slice(start, end + 1));
}

async function ask(system: string, user: string, maxTokens = 1024): Promise<string> {
  const response = await getClient().messages.create({
    model: MODEL,
    max_tokens: maxTokens,
    system,
    messages: [{ role: "user", content: user }],
  });
  const text = response.content.find((b) => b.type === "text");
  if (!text || text.type !== "text") {
    throw new Error("Resposta inesperada da IA (sem bloco de texto).");
  }
  return text.text;
}

/**
 * Gera o rascunho de uma mensagem. Se `step > 0`, é uma cobrança de
 * follow-up (a pessoa ainda não respondeu) — o tom muda para uma lembrança
 * educada, sem repetir tudo.
 */
export async function generateDraft(opts: {
  company: Company;
  contact?: Contact | null;
  hook: MessageHook;
  channel: DraftChannel;
  step?: number;
}): Promise<GeneratedDraft> {
  const { company, contact, hook, channel, step = 0 } = opts;

  const contactLine = contact
    ? `Contato: ${contact.name}${contact.title ? `, ${contact.title}` : ""}.`
    : "Contato específico ainda não identificado — trate de forma geral.";

  const followUpLine =
    step > 0
      ? `\nEsta é a ${step + 1}ª mensagem (follow-up). A pessoa ainda NÃO ` +
        "respondeu às anteriores. Escreva uma cobrança curta, leve e educada, " +
        "retomando o assunto sem repetir tudo. Nunca soe insistente ou irritado."
      : "";

  const userPrompt = `Escreva o rascunho.

Canal: ${channel === "email" ? "E-mail" : "WhatsApp"}
Parceiro: ${company.name}${company.industry ? ` (${company.industry})` : ""}${
    company.city ? `, ${company.city}${company.state ? "/" + company.state : ""}` : ""
  }.
${contactLine}

${categoryBriefing(company, hook)}${followUpLine}

Gere o assunto e o corpo seguindo as diretrizes do sistema.`;

  const parsed = parseJsonObject(await ask(SYSTEM_PROMPT, userPrompt)) as Partial<GeneratedDraft>;
  if (typeof parsed.body !== "string") {
    throw new Error("A IA retornou JSON sem o campo 'body'.");
  }
  return {
    subject: channel === "whatsapp" ? "" : (parsed.subject ?? ""),
    body: parsed.body,
  };
}

// --- Leitura/classificação de respostas ------------------------------------

const CLASSIFY_SYSTEM = `Você analisa a resposta de um possível parceiro a uma \
abordagem comercial da MenthalHelp e classifica a INTENÇÃO.

- "positivo": demonstrou interesse, abriu porta, pediu reunião/proposta, ou \
qualquer sinal verde para avançar a parceria.
- "negativo": recusou, não tem interesse agora, pediu para não contatar.
- "neutro": resposta automática, dúvida simples, ou sem sinal claro.

FORMATO: responda SOMENTE com JSON válido:
{"sentiment": "positivo|negativo|neutro", "summary": "<resumo em 1 frase>"}`;

export interface ClassifiedResponse {
  sentiment: ResponseSentiment;
  summary: string;
}

export async function classifyResponse(text: string): Promise<ClassifiedResponse> {
  const raw = await ask(CLASSIFY_SYSTEM, `Resposta recebida:\n"""${text}"""`, 300);
  const parsed = parseJsonObject(raw) as Partial<ClassifiedResponse>;
  const sentiment: ResponseSentiment =
    parsed.sentiment === "positivo" || parsed.sentiment === "negativo"
      ? parsed.sentiment
      : "neutro";
  return { sentiment, summary: parsed.summary ?? "" };
}
