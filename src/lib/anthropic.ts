// Geração de rascunhos e leitura de respostas com a API da Anthropic.
//
// REGRA INEGOCIÁVEL (brief, seção 4): a IA só PREPARA. E-mail só sai com o
// clique do CEO. (O WhatsApp, via API oficial, segue o funil aprovado.)

import Anthropic from "@anthropic-ai/sdk";
import { CLINIC_SERVICES, EMAIL_SIGNATURE, MENTHAL_UNITS } from "./branding";
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
      if (company.operator_type === "ativa") {
        return (
          "Alvo: uma OPERADORA de saúde que JÁ É PARCEIRA da MenthalHelp. " +
          "Escreva ao analista/contato dela para tratar uma SOLICITAÇÃO de " +
          "relacionamento — normalmente inclusão de endereços/unidades no " +
          "credenciamento, extensão de procedimentos (ex: Fisioterapia, " +
          "Musicoterapia) ou reajuste contratual. Faça o pedido de forma " +
          "objetiva, cordial e clara. NÃO faça apresentação de captação: eles " +
          "já nos conhecem. Siga exatamente o que o CEO pedir nas instruções."
        );
      }
      return (
        "Alvo: uma OPERADORA de saúde NOVA (ainda não é parceira). Objetivo: " +
        "apresentar a clínica e abrir conversa para CREDENCIAMENTO — a " +
        "MenthalHelp quer ser credenciada e atender os beneficiários. Destaque " +
        "qualidade clínica, capacidade (3.000+ pacientes/mês, várias " +
        "unidades) e a expertise em TEA/ABA. Tom institucional e respeitoso."
      );
    case "reajuste":
      return (
        "Alvo: uma OPERADORA PARCEIRA — objetivo é SOLICITAR REAJUSTE " +
        "contratual, embasado na cláusula de reajuste do contrato. " +
        (company.reajuste_percent
          ? `Percentual pleiteado (da análise da cláusula): ${company.reajuste_percent}. `
          : "") +
        (company.reajuste_janela
          ? `Janela/data-base do reajuste: ${company.reajuste_janela}. `
          : "") +
        "Escreva um pedido FORMAL, cordial e objetivo, citando o embasamento " +
        "contratual (cláusula/índice) e o percentual pleiteado, com tom de " +
        "parceria de longo prazo. Nunca ameace, pressione ou soe agressivo."
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
- NÃO escreva assinatura, nome, cargo, telefone, CNPJ nem lista de serviços —
  isso é adicionado automaticamente pelo sistema. Termine com uma frase de
  fechamento simples (ex: "Fico à disposição.").

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

  // Briefing do CEO: o que ele quer que seja enviado (copy/orientação).
  const briefingLine = company.briefing?.trim()
    ? `\n\nINSTRUÇÕES DO CEO (siga à risca — é exatamente o que ele quer ` +
      `comunicar):\n"""${company.briefing.trim()}"""`
    : "";

  const userPrompt = `Escreva o rascunho.

Canal: ${channel === "email" ? "E-mail" : "WhatsApp"}
Parceiro: ${company.name}${company.industry ? ` (${company.industry})` : ""}${
    company.city ? `, ${company.city}${company.state ? "/" + company.state : ""}` : ""
  }.
${contactLine}

${categoryBriefing(company, hook)}${briefingLine}${followUpLine}

Gere o assunto e o corpo seguindo as diretrizes do sistema.`;

  const parsed = parseJsonObject(await ask(SYSTEM_PROMPT, userPrompt)) as Partial<GeneratedDraft>;
  if (typeof parsed.body !== "string") {
    throw new Error("A IA retornou JSON sem o campo 'body'.");
  }

  let body = parsed.body.trim();
  if (channel === "email") {
    // Serviços só na apresentação inicial (primeiro e-mail).
    if (step === 0) body += `\n\n${CLINIC_SERVICES}`;
    // Assinatura em TODOS os e-mails.
    body += `\n\n${EMAIL_SIGNATURE}`;
  }

  return {
    subject: channel === "whatsapp" ? "" : (parsed.subject ?? ""),
    body,
  };
}

// --- Informativo recorrente de "Agenda Aberta" -----------------------------

const AGENDA_SYSTEM = `Você é o assistente de RELACIONAMENTO da MenthalHelp, \
clínica multidisciplinar de saúde mental e neurodesenvolvimento (forte \
expertise em TEA/ABA), com mais de 3.000 pacientes/mês.

Escreva o RASCUNHO de um E-MAIL INFORMATIVO, curto e caloroso, para uma \
OPERADORA DE SAÚDE PARCEIRA, avisando que a MenthalHelp está com AGENDA ABERTA \
para receber novos beneficiários. O objetivo é aumentar a visibilidade e \
facilitar o direcionamento de pacientes. NÃO é cobrança nem venda, e NÃO exige \
resposta — é um aviso de parceria.

Diretrizes:
- Português do Brasil. Tom MUITO HUMANO, cordial e de PARCERIA: uma clínica que \
se coloca à disposição para ajudar a operadora com as demandas de atendimento \
dos beneficiários.
- Deixe claro que temos AGENDA ABERTA e capacidade para receber encaminhamentos.
- CITE as unidades/regiões (todas as que forem informadas), pode variar a forma.
- Incorpore com naturalidade o FOCO que o CEO pedir (ex: qual especialidade \
está com agenda aberta).
- VARIE o texto a cada envio: abertura, estrutura e fechamento diferentes. \
NUNCA repita frases prontas nem pareça um modelo automático.
- Curto (~120 a 150 palavras). Sem pressão, sem CAIXA ALTA, sem parecer robô.
- NÃO escreva assinatura, nome, cargo, telefone, CNPJ nem lista de serviços — \
o sistema adiciona automaticamente.
- Termine se colocando à disposição (ex: "Seguimos à disposição para o que \
precisarem.").

FORMATO DE SAÍDA: responda SOMENTE com JSON válido, sem texto antes/depois e \
sem blocos de código: {"subject": "<assunto>", "body": "<corpo>"}`;

// Ângulos de abertura para forçar variação a cada envio.
const AGENDA_ANGLES = [
  "Abra agradecendo a parceria e a confiança de sempre.",
  "Abra destacando o cuidado e o acolhimento aos beneficiários.",
  "Abra pela novidade concreta: temos vagas/agenda aberta agora.",
  "Abra pela capacidade de atendimento nas unidades.",
  "Abra reforçando a disponibilidade para agilizar os encaminhamentos.",
  "Abra valorizando o trabalho conjunto para atender melhor os beneficiários.",
];

/**
 * Gera o informativo recorrente de "agenda aberta" para uma operadora parceira.
 * Cada chamada tende a produzir um texto diferente (ângulo sorteado + instrução
 * explícita de variar). Sempre reforça as unidades e incorpora a copy do CEO.
 */
export async function generateAgendaInformativo(opts: {
  company: Company;
  contact?: Contact | null;
}): Promise<GeneratedDraft> {
  const { company, contact } = opts;

  const contactLine = contact
    ? `Contato: ${contact.name}${contact.title ? `, ${contact.title}` : ""}.`
    : "Contato específico não identificado — trate de forma cordial e geral.";

  const briefingLine = company.briefing?.trim()
    ? `\n\nFOCO QUE O CEO QUER COMUNICAR (incorpore com naturalidade):\n"""${company.briefing.trim()}"""`
    : "";

  const angle = AGENDA_ANGLES[Math.floor(Math.random() * AGENDA_ANGLES.length)];

  const userPrompt = `Escreva o informativo de agenda aberta.

Operadora parceira: ${company.name}.
${contactLine}

Unidades/regiões da MenthalHelp (reforce todas, pode variar a forma):
- ${MENTHAL_UNITS.join("\n- ")}
${briefingLine}

Variação desta vez: ${angle}
Lembre-se: precisa soar diferente de envios anteriores.

Gere o assunto e o corpo seguindo as diretrizes do sistema.`;

  const parsed = parseJsonObject(
    await ask(AGENDA_SYSTEM, userPrompt),
  ) as Partial<GeneratedDraft>;
  if (typeof parsed.body !== "string") {
    throw new Error("A IA retornou JSON sem o campo 'body'.");
  }

  // Assinatura em todos os e-mails (unidades já entram no corpo pela IA).
  const body = `${parsed.body.trim()}\n\n${EMAIL_SIGNATURE}`;
  return { subject: parsed.subject ?? "MenthalHelp — agenda aberta", body };
}

// --- Análise de contrato para REAJUSTE (advogado + comercial) --------------

const ANALYSIS_SYSTEM = `Você é um assistente que analisa CONTRATOS de \
credenciamento entre a clínica MenthalHelp e OPERADORAS DE SAÚDE, combinando a \
visão de um ADVOGADO (leitura da cláusula) e de um SETOR COMERCIAL (estratégia \
de reajuste). Sua análise é um APOIO à decisão do CEO — não é parecer jurídico \
definitivo.

Podem ser anexados VÁRIOS documentos: o CONTRATO ORIGINAL e seus ADENDOS/\
ADITIVOS (extensões, alterações ao longo do tempo). Considere TODOS em conjunto: \
um adendo mais recente PREVALECE sobre o contrato original na parte que ele \
altera. Baseie a cláusula de reajuste na versão mais atual/vigente.

Leia os documentos em anexo e identifique a CLÁUSULA DE REAJUSTE vigente. Determine:
1. O ÍNDICE/critério de reajuste previsto (ex: IPCA, IGP-M, percentual fixo, \
negociação anual) e o percentual que faz sentido pleitear com base nele.
2. A JANELA/DATA ideal para enviar o pedido de reajuste (ex: data-base/aniversário \
do contrato, antecedência exigida em cláusula, periodicidade permitida).
3. Um PARECER curto e prático (2-4 frases) unindo o lado jurídico e o comercial.

Se o contrato não trouxer a informação com clareza, diga isso honestamente no \
campo correspondente (não invente números nem datas).

FORMATO DE SAÍDA: responda SOMENTE com JSON válido, sem texto antes/depois e \
sem blocos de código:
{"clausula": "<resumo da cláusula de reajuste>", "percentual": "<percentual/índice sugerido>", "janela": "<janela/data ideal para pedir>", "parecer": "<parecer curto jurídico+comercial>"}`;

export interface ContractAnalysis {
  clausula: string;
  percentual: string;
  janela: string;
  parecer: string;
}

/**
 * Analisa um contrato (PDF em base64) e devolve um parecer de reajuste:
 * cláusula, percentual/índice sugerido, janela ideal e um parecer curto.
 */
export async function analyzeContract(opts: {
  pdfs: { base64: string; name: string }[];
  operadora: string;
  briefing?: string | null;
}): Promise<ContractAnalysis> {
  const lista = opts.pdfs
    .map((p, i) => `${i + 1}) ${p.name}`)
    .join("\n");
  const userText =
    `Operadora: ${opts.operadora}.\n` +
    `Documentos anexados (nesta ordem — considere original + adendos/aditivos ` +
    `em conjunto, o mais recente prevalece):\n${lista}\n` +
    (opts.briefing?.trim()
      ? `Contexto/orientação do CEO: """${opts.briefing.trim()}"""\n`
      : "") +
    `Analise os documentos e devolva o parecer no formato pedido.`;

  const docBlocks = opts.pdfs.map((p) => ({
    type: "document" as const,
    source: {
      type: "base64" as const,
      media_type: "application/pdf" as const,
      data: p.base64,
    },
  }));

  const response = await getClient().messages.create({
    model: MODEL,
    max_tokens: 1500,
    system: ANALYSIS_SYSTEM,
    messages: [
      {
        role: "user",
        content: [...docBlocks, { type: "text", text: userText }],
      },
    ],
  });
  const text = response.content.find((b) => b.type === "text");
  if (!text || text.type !== "text") {
    throw new Error("A IA não retornou texto ao analisar o contrato.");
  }
  const p = parseJsonObject(text.text) as Partial<ContractAnalysis>;
  return {
    clausula: p.clausula ?? "Não identificado no contrato.",
    percentual: p.percentual ?? "Não identificado — definir manualmente.",
    janela: p.janela ?? "Não identificada — definir manualmente.",
    parecer: p.parecer ?? "",
  };
}

// --- Leitura/classificação de respostas ------------------------------------

const CLASSIFY_SYSTEM = `Você é um AGENTE ESPECIALISTA em ler as respostas de \
operadoras de saúde (e outros parceiros) às abordagens comerciais da \
MenthalHelp (clínica multidisciplinar, credenciamento). Sua função é separar a \
QUALIDADE de cada resposta com precisão.

Classifique como "positivo" quando a pessoa demonstra QUALQUER interesse ou \
pede QUALQUER informação para avançar, incluindo (mas não só):
- pergunta quais TERAPIAS/serviços a clínica oferece;
- pede IMAGENS/fotos da clínica;
- pede VALORES/preços/tabela;
- pede DOCUMENTAÇÃO da clínica (CNPJ, alvará, certificações, contrato etc.);
- pede QUALQUER informação complementar sobre a clínica;
- diz que tem INTERESSE e quer avançar no CREDENCIAMENTO;
- pede reunião/apresentação/proposta;
- ENCAMINHA/REPASSA para outro responsável ou indica outra pessoa/setor/e-mail \
para tratar (isso é avanço: chegamos mais perto do decisor certo).

Classifique como "negativo" quando: recusa, diz que não tem interesse, que não \
credencia no momento, ou pede para não contatar/descadastrar.

Classifique como "neutro" apenas quando: for resposta automática (ex: "estou \
de férias", "recebemos seu e-mail"), ou não houver nenhum sinal de interesse \
nem recusa clara.

Na dúvida entre positivo e neutro, se houver QUALQUER pedido de informação \
sobre a clínica, considere POSITIVO.

Se for encaminhamento, no resumo diga para quem/qual setor foi repassado, se \
essa informação aparecer.

FORMATO: responda SOMENTE com JSON válido:
{"sentiment": "positivo|negativo|neutro", "summary": "<resumo em 1 frase>"}`;

export interface ClassifiedResponse {
  sentiment: ResponseSentiment;
  summary: string;
}

// Ajuste de contexto por frente. No REAJUSTE, um "vamos analisar/estamos
// avaliando/encaminhamos ao setor" é NEUTRO (ainda não decidiram) — para o
// motor seguir cobrando a cada 72h até um SIM ou NÃO claro.
const REAJUSTE_CLASSIFY_EXTRA = `

CONTEXTO ESPECÍFICO — este é um pedido de REAJUSTE contratual:
- "positivo" = a operadora ACEITA o reajuste, propõe um percentual concreto, ou \
pede documentos/dados para EFETIVAR o reajuste.
- "negativo" = recusa o reajuste ou nega o pedido.
- "neutro" = qualquer acusar de recebimento SEM decisão: "vamos analisar", \
"estamos avaliando", "encaminhamos ao setor responsável", "retornaremos". \
Isso NÃO é positivo — ainda não há decisão, então seguimos cobrando.`;

export async function classifyResponse(
  text: string,
  category?: string,
): Promise<ClassifiedResponse> {
  const system =
    category === "reajuste"
      ? CLASSIFY_SYSTEM + REAJUSTE_CLASSIFY_EXTRA
      : CLASSIFY_SYSTEM;
  const raw = await ask(system, `Resposta recebida:\n"""${text}"""`, 300);
  const parsed = parseJsonObject(raw) as Partial<ClassifiedResponse>;
  const sentiment: ResponseSentiment =
    parsed.sentiment === "positivo" || parsed.sentiment === "negativo"
      ? parsed.sentiment
      : "neutro";
  return { sentiment, summary: parsed.summary ?? "" };
}
