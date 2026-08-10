// Governança da automação (Fase 1.5).
//
// Define os NÍVEIS DE AUTONOMIA do sistema e classifica cada ação. É a fonte
// da verdade: a UI mostra ao CEO o que a IA faz sozinha, o que ela prepara para
// aprovação e o que é sempre 100% humano.
//
// PRINCÍPIO DE ESCOPO (inviolável): este é um sistema COMERCIAL de prospecção.
// O foco é encontrar e abordar DECISORES que trazem pacientes (RH, credenciamento,
// direção de escola, pastor, médico encaminhador…). NUNCA trata dado, cadastro
// ou controle de paciente.

export type AutonomyLevel = 1 | 2 | 3;

export const AUTONOMY_LABELS: Record<AutonomyLevel, string> = {
  1: "Automático — a IA executa",
  2: "A IA prepara · você aprova",
  3: "Sempre 100% humano",
};

export const AUTONOMY_DESC: Record<AutonomyLevel, string> = {
  1: "Tarefas de apoio, sem risco comercial. Rodam sozinhas.",
  2: "Tudo que fala com o parceiro. A IA escreve; nada sai sem o seu clique.",
  3: "Decisões comerciais e jurídicas. A IA não toca — é sempre você.",
};

export interface GovernanceAction {
  key: string;
  label: string;
  level: AutonomyLevel;
}

// Registro das ações do sistema por nível. Novas ações entram aqui.
export const GOVERNANCE_ACTIONS: GovernanceAction[] = [
  // Nível 1 — a IA executa automaticamente (apoio, sem risco comercial)
  { key: "descobrir", label: "Descobrir e enriquecer leads (Apollo)", level: 1 },
  { key: "validar", label: "Validar e-mails (ZeroBounce)", level: 1 },
  { key: "score", label: "Qualificar e pontuar leads", level: 1 },
  { key: "classificar", label: "Ler e classificar as respostas recebidas", level: 1 },
  { key: "agendar", label: "Agendar follow-up e reativação", level: 1 },
  { key: "suprimir", label: "Bloquear retorno (bounce) e descadastro", level: 1 },
  { key: "tarefa", label: "Criar tarefas para o comercial", level: 1 },

  // Nível 2 — a IA prepara, o humano aprova (tudo que fala com o parceiro)
  { key: "abordagem", label: "Escrever a abordagem inicial", level: 2 },
  { key: "replica", label: "Escrever a réplica a uma resposta", level: 2 },
  { key: "followup_msg", label: "Escrever a mensagem de cobrança (follow-up)", level: 2 },
  { key: "enviar", label: "Disparar qualquer e-mail", level: 2 },
  { key: "documentos", label: "Anexar e enviar documentos", level: 2 },

  // Nível 3 — sempre 100% humano (decisão comercial/jurídica)
  { key: "negociacao", label: "Negociação financeira e de condições", level: 3 },
  { key: "proposta", label: "Aceite de proposta", level: 3 },
  { key: "contrato", label: "Contrato e questões jurídicas", level: 3 },
  { key: "compromisso", label: "Compromissos comerciais formais", level: 3 },
];

export function actionsByLevel(level: AutonomyLevel): GovernanceAction[] {
  return GOVERNANCE_ACTIONS.filter((a) => a.level === level);
}
