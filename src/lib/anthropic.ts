// Geração de rascunhos de abordagem comercial com a API da Anthropic.
//
// REGRA INEGOCIÁVEL (brief, seção 4): a IA só PREPARA o rascunho. Nada é
// enviado automaticamente — um humano aprova o disparo depois.

import Anthropic from "@anthropic-ai/sdk";
import type { Company, Contact, DraftChannel, MessageHook } from "./types";

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

// Contexto de cada gancho — vira instrução para o modelo.
const HOOK_BRIEFING: Record<MessageHook, string> = {
  nr1:
    "Gancho NR-1: a atualização da NR-1 obriga empresas a gerenciar riscos " +
    "psicossociais (estresse, burnout, assédio). O prazo de adequação " +
    "(26/mai/2026) JÁ PASSOU — é urgência regulatória real, não prevenção " +
    "futura. Posicione a MenthalHelp como parceira para essa adequação.",
  saude_mental:
    "Gancho saúde mental corporativa: foco em reduzir afastamentos (INSS/CID " +
    "F), presenteísmo e turnover com um programa estruturado de saúde mental.",
  tea_aba:
    "Gancho TEA/ABA: muitos colaboradores têm filhos com autismo. A " +
    "MenthalHelp tem forte expertise em TEA e ciência ABA — um diferencial " +
    "de cuidado que empresas podem oferecer como benefício.",
};

const SYSTEM_PROMPT = `Você é o assistente comercial da MenthalHelp, uma clínica \
multidisciplinar de saúde mental e neurodesenvolvimento (forte expertise em \
TEA/ABA), com mais de 3.000 pacientes/mês e unidades em Guarulhos, Zona Norte \
de SP, Bragança Paulista e Alphaville.

Seu trabalho é escrever o RASCUNHO de uma primeira abordagem comercial para o \
RH de uma empresa, para um humano revisar e aprovar antes de enviar.

Diretrizes de escrita:
- Português do Brasil, tom profissional, cordial e consultivo — nunca "vendedor".
- Curto: no máximo ~130 palavras no corpo. Fácil de ler no celular.
- Personalize com o nome da empresa e (se houver) o nome e cargo do contato.
- Abra com contexto relevante ao gancho, mostre valor concreto (redução de \
afastamento, adequação regulatória, cuidado a colaboradores), e feche com um \
convite leve para uma conversa de 15-20 min. Sem prometer preços.
- Não invente dados sobre a empresa. Se não souber algo, não afirme.
- Para WhatsApp: ainda mais curto, sem assunto, tom levemente mais direto.
- Nunca use linguagem alarmista ou pressão. Nada de "URGENTE" em caixa alta.

FORMATO DE SAÍDA: responda SOMENTE com um objeto JSON válido, sem texto antes
ou depois, sem blocos de código markdown. O objeto tem exatamente estes campos:
{"subject": "<assunto do e-mail; string vazia para WhatsApp>", "body": "<corpo da mensagem>"}`;

export interface GeneratedDraft {
  subject: string;
  body: string;
}

// Extrai o objeto JSON da resposta do modelo, tolerando cercas de código
// ou texto extra por precaução.
function parseDraftJson(text: string): GeneratedDraft {
  const start = text.indexOf("{");
  const end = text.lastIndexOf("}");
  if (start === -1 || end === -1 || end <= start) {
    throw new Error("A IA não retornou JSON válido.");
  }
  const obj = JSON.parse(text.slice(start, end + 1)) as Partial<GeneratedDraft>;
  if (typeof obj.body !== "string") {
    throw new Error("A IA retornou JSON sem o campo 'body'.");
  }
  return { subject: typeof obj.subject === "string" ? obj.subject : "", body: obj.body };
}

export async function generateDraft(opts: {
  company: Company;
  contact?: Contact | null;
  hook: MessageHook;
  channel: DraftChannel;
}): Promise<GeneratedDraft> {
  const { company, contact, hook, channel } = opts;

  const contactLine = contact
    ? `Contato no RH: ${contact.name}${contact.title ? `, ${contact.title}` : ""}.`
    : "Contato específico ainda não identificado — trate de forma geral ao RH.";

  const userPrompt = `Escreva o rascunho de abordagem.

Canal: ${channel === "email" ? "E-mail" : "WhatsApp"}
Empresa: ${company.name}${company.industry ? ` (setor: ${company.industry})` : ""}${
    company.employee_count ? `, ~${company.employee_count} funcionários` : ""
  }${company.city ? `, ${company.city}${company.state ? "/" + company.state : ""}` : ""}.
${contactLine}

${HOOK_BRIEFING[hook]}

Gere o assunto e o corpo seguindo as diretrizes do sistema.`;

  const response = await getClient().messages.create({
    model: MODEL,
    max_tokens: 1024,
    system: SYSTEM_PROMPT,
    messages: [{ role: "user", content: userPrompt }],
  });

  const text = response.content.find((b) => b.type === "text");
  if (!text || text.type !== "text") {
    throw new Error("Resposta inesperada da IA (sem bloco de texto).");
  }

  const parsed = parseDraftJson(text.text);
  return {
    subject: channel === "whatsapp" ? "" : parsed.subject,
    body: parsed.body,
  };
}
