// Fase 3.1 — Máquina de estados: resposta → próxima ação SEGURA.
//
// A partir da INTENÇÃO da resposta (Fase 1.1), o sistema recomenda o próximo
// passo, SEMPRE dentro da governança (Fase 1.5):
//   N1 = a IA executa sozinha (agendar, enriquecer, criar tarefa de apoio);
//   N2 = a IA PREPARA e você aprova (réplica, documentos, cobrança);
//   N3 = sempre 100% humano (proposta, contrato, condições financeiras).
//
// Esta função é PURA e explicável — não dispara nada. Quem age são as rotas,
// respeitando o nível. Nada que fale com o parceiro sai sem o seu clique.

import type { ResponseIntent } from "./anthropic";
import type { AutonomyLevel } from "./governance";

export interface NextAction {
  // Rótulo curto para o card ("Ação sugerida").
  label: string;
  // Nível de governança que rege ESTA ação.
  level: AutonomyLevel;
  // Explicação de 1 frase do porquê.
  hint: string;
  // Se N1 deve criar uma tarefa de apoio para o comercial, o título dela.
  autoTaskTitle?: string;
}

const MAP: Record<ResponseIntent, NextAction> = {
  oportunidade_ativa: {
    label: "Avançar: preparar réplica e conduzir para reunião/proposta",
    level: 2,
    hint: "A IA escreve a réplica; a decisão comercial (proposta/condições) é sempre sua (N3).",
  },
  documentos_solicitados: {
    label: "Preparar envio de documentos (CNPJ, apresentação, valores)",
    level: 2,
    hint: "A IA monta a resposta com os documentos; você confere e dispara.",
  },
  encaminhamento_setor: {
    label: "Registrar o contato do setor indicado e replicar",
    level: 2,
    hint: "Chegamos mais perto do decisor certo. Cadastre o novo contato e a IA replica.",
    autoTaskTitle: "Identificar e cadastrar o contato do setor/pessoa indicada na resposta",
  },
  duvida: {
    label: "Preparar resposta à dúvida do parceiro",
    level: 2,
    hint: "A IA responde diretamente ao ponto levantado; você aprova o envio.",
  },
  followup_futuro: {
    label: "Retomada agendada — nada a fazer agora",
    level: 1,
    hint: "O sistema pausa a cobrança e reativa sozinho na data pedida.",
  },
  sem_interesse: {
    label: "Pausar e retomar em 30 dias",
    level: 1,
    hint: "Sem interesse agora; o sistema tenta de novo mais adiante.",
  },
  auto_resposta: {
    label: "Aguardar um retorno real",
    level: 1,
    hint: "Foi resposta automática (férias/recebido). Sem ação comercial.",
  },
  sem_sinal: {
    label: "Revisar manualmente",
    level: 1,
    hint: "Sem sinal claro de interesse ou recusa. Dê uma olhada quando puder.",
  },
};

// Fallback quando não há intenção classificada (IA falhou ou dado antigo).
const FALLBACK: NextAction = {
  label: "Revisar a resposta",
  level: 1,
  hint: "Ainda não classificada — abra para decidir o próximo passo.",
};

export function nextActionForIntent(
  intent: ResponseIntent | string | null | undefined,
): NextAction {
  if (intent && intent in MAP) return MAP[intent as ResponseIntent];
  return FALLBACK;
}
