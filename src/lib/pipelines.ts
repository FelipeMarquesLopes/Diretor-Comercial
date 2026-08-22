// Fase 2.1 — Pipelines por segmento (Kanban).
//
// Cada segmento tem seus próprios ESTÁGIOS, definidos aqui em código (mesmo
// espírito do MODE_CONFIG da prospecção: barato, versionado, explícito — sem
// tabela de seed). Cada estágio aponta para um `status` UNIVERSAL do funil
// (companies.status), o que permite RECONCILIAR os dois: mover o card muda o
// stage fino e, junto, o status coarse que o resto do sistema já consulta.
//
// Princípio inviolável do projeto: isto rege a NEGOCIAÇÃO com o parceiro
// (operadora, empresa, escola, médico, igreja). Nunca há dado de paciente.

import type { CompanyStatus, PartnerCategory } from "./types";

export interface PipelineStage {
  id: string; // estável — vai para companies.stage
  label: string; // rótulo na coluna do Kanban
  // Status universal correspondente (reconciliação com companies.status).
  status: CompanyStatus;
  // Marca o estágio "ganho" (parceria/credenciamento fechado) — usado na UI.
  won?: boolean;
}

// Categorias que têm pipeline de negociação (Kanban).
export type PipelineCategory =
  | "operadora"
  | "empresa"
  | "escola"
  | "medico"
  | "igreja"
  | "sindicato";

const OPERADORA: PipelineStage[] = [
  { id: "novo", label: "Mapeada", status: "mapeado" },
  { id: "contatado", label: "Contato feito", status: "contato_iniciado" },
  { id: "em_conversa", label: "Em conversa", status: "em_negociacao" },
  { id: "em_credenciamento", label: "Em credenciamento", status: "em_negociacao" },
  { id: "implantacao", label: "Implantação", status: "em_negociacao" },
  { id: "credenciada", label: "Credenciada", status: "parceria_ativa", won: true },
];

const EMPRESA: PipelineStage[] = [
  { id: "novo", label: "Mapeada", status: "mapeado" },
  { id: "contatado", label: "Contato feito", status: "contato_iniciado" },
  { id: "em_conversa", label: "Em conversa", status: "em_negociacao" },
  { id: "proposta", label: "Proposta enviada", status: "em_negociacao" },
  { id: "contrato", label: "Contrato", status: "em_negociacao" },
  { id: "ativa", label: "Parceria ativa", status: "parceria_ativa", won: true },
];

const ESCOLA: PipelineStage[] = [
  { id: "novo", label: "Mapeada", status: "mapeado" },
  { id: "contatado", label: "Contato feito", status: "contato_iniciado" },
  { id: "em_conversa", label: "Em conversa", status: "em_negociacao" },
  { id: "reuniao", label: "Reunião marcada", status: "em_negociacao" },
  { id: "parceria", label: "Parceria firmada", status: "parceria_ativa", won: true },
];

const MEDICO: PipelineStage[] = [
  { id: "novo", label: "Mapeado", status: "mapeado" },
  { id: "contatado", label: "Contato feito", status: "contato_iniciado" },
  { id: "em_conversa", label: "Em conversa", status: "em_negociacao" },
  { id: "visita", label: "Visita / reunião", status: "em_negociacao" },
  { id: "encaminhando", label: "Encaminhando", status: "parceria_ativa", won: true },
];

const IGREJA: PipelineStage[] = [
  { id: "novo", label: "Mapeada", status: "mapeado" },
  { id: "contatado", label: "Contato feito", status: "contato_iniciado" },
  { id: "em_conversa", label: "Em conversa", status: "em_negociacao" },
  { id: "reuniao", label: "Reunião com liderança", status: "em_negociacao" },
  { id: "parceria", label: "Rede de apoio ativa", status: "parceria_ativa", won: true },
];

const SINDICATO: PipelineStage[] = [
  { id: "novo", label: "Mapeado", status: "mapeado" },
  { id: "contatado", label: "Contato feito", status: "contato_iniciado" },
  { id: "em_conversa", label: "Em conversa", status: "em_negociacao" },
  { id: "reuniao", label: "Reunião com a diretoria", status: "em_negociacao" },
  { id: "proposta", label: "Proposta de convênio", status: "em_negociacao" },
  { id: "parceria", label: "Convênio ativo", status: "parceria_ativa", won: true },
];

export const PIPELINES: Record<PipelineCategory, PipelineStage[]> = {
  operadora: OPERADORA,
  empresa: EMPRESA,
  escola: ESCOLA,
  medico: MEDICO,
  igreja: IGREJA,
  sindicato: SINDICATO,
};

export const PIPELINE_LABELS: Record<PipelineCategory, string> = {
  operadora: "Operadoras",
  empresa: "Empresas",
  escola: "Escolas",
  medico: "Médicos",
  igreja: "Igrejas",
  sindicato: "Sindicatos",
};

export function hasPipeline(category: string): category is PipelineCategory {
  return category in PIPELINES;
}

export function stagesFor(category: string): PipelineStage[] {
  return hasPipeline(category) ? PIPELINES[category] : [];
}

export function findStage(
  category: string,
  stageId: string | null | undefined,
): PipelineStage | null {
  if (!stageId) return null;
  return stagesFor(category).find((s) => s.id === stageId) ?? null;
}

// Status universal correspondente a um estágio (reconciliação).
export function statusForStage(category: string, stageId: string): CompanyStatus | null {
  return findStage(category, stageId)?.status ?? null;
}

// Estágio PADRÃO derivado do status universal — para cards que ainda não têm
// `stage` explícito (dados antigos, ou recém-criados). Escolhe o primeiro
// estágio compatível com o status coarse.
export function defaultStageForStatus(
  category: string,
  status: CompanyStatus,
): string | null {
  const stages = stagesFor(category);
  if (!stages.length) return null;
  // "qualificado" ainda é topo do funil → cai no primeiro estágio (novo).
  if (status === "qualificado") return stages[0].id;
  // "parceria_ativa" → o estágio ganho (último).
  if (status === "parceria_ativa") {
    const won = [...stages].reverse().find((s) => s.won);
    return (won ?? stages[stages.length - 1]).id;
  }
  const match = stages.find((s) => s.status === status);
  return (match ?? stages[0]).id;
}

// Estágio EFETIVO de um card: usa o explícito se houver; senão deriva do status.
export function resolveStageId(
  category: string,
  stage: string | null | undefined,
  status: CompanyStatus,
): string | null {
  if (stage && findStage(category, stage)) return stage;
  return defaultStageForStatus(category, status);
}
