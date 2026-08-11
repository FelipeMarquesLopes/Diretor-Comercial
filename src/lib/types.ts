// Tipos de domínio do Growth AI (frente de empresas).
// Espelham o schema em supabase/migrations/0001_init.sql.

export type CompanyStatus =
  | "mapeado"
  | "qualificado"
  | "contato_iniciado"
  | "em_negociacao"
  | "parceria_ativa"
  | "descartado";

export type CommercialThesis = "a_descobrir" | "credenciada" | "alavanca";

export type MessageHook = "nr1" | "saude_mental" | "tea_aba";

export type DraftChannel = "email" | "whatsapp";

export type DraftStatus = "pendente" | "aprovado" | "rejeitado" | "enviado";

// Categoria do parceiro — o mesmo sistema controla as 3 frentes.
export type PartnerCategory =
  | "operadora"
  | "empresa"
  | "escola"
  | "medico"
  | "igreja"
  | "agenda_aberta"
  | "reajuste";

export type SequenceChannel = "email" | "whatsapp";

export type SequenceStatus =
  | "ativa"
  | "aguardando_ceo"
  | "pausada_negativa"
  | "agendada"
  | "encerrada";

export type ResponseSentiment = "positivo" | "negativo" | "neutro";

export interface Sequence {
  id: string;
  company_id: string;
  channel: SequenceChannel;
  status: SequenceStatus;
  step: number;
  next_action_at: string | null;
  last_sent_at: string | null;
  resume_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface PartnerResponse {
  id: string;
  company_id: string;
  channel: SequenceChannel;
  sentiment: ResponseSentiment;
  summary: string | null;
  raw_text: string | null;
  created_at: string;
}

// Só para operadoras: "nova" (captação) ou "ativa" (relacionamento).
export type OperatorType = "nova" | "ativa";

export interface Company {
  id: string;
  category: PartnerCategory;
  operator_type: OperatorType;
  briefing: string | null;
  cc_emails: string | null;
  contract_path: string | null;
  contract_name: string | null;
  reajuste_parecer: string | null;
  reajuste_percent: string | null;
  reajuste_janela: string | null;
  apollo_id: string | null;
  name: string;
  domain: string | null;
  website: string | null;
  industry: string | null;
  employee_count: number | null;
  city: string | null;
  state: string | null;
  country: string | null;
  linkedin_url: string | null;
  logo_url: string | null;
  phone: string | null;
  status: CompanyStatus;
  qualification_score: number;
  qualified: boolean;
  qualification_notes: string | null;
  offers_health_benefit: boolean | null;
  health_operator: string | null;
  commercial_thesis: CommercialThesis;
  priority: number;
  next_followup: string | null;
  notes: string | null;
  created_at: string;
  updated_at: string;
}

export interface Contact {
  id: string;
  company_id: string;
  apollo_id: string | null;
  name: string;
  title: string | null;
  email: string | null;
  phone: string | null;
  linkedin_url: string | null;
  email_status: string | null;
  // Veredito da validação do e-mail (ZeroBounce): valid | catch_all | invalid |
  // unknown | null (não verificado).
  email_verdict: string | null;
  is_decision_maker: boolean;
  is_whatsapp: boolean;
  created_at: string;
}

export interface DraftAttachment {
  path: string;
  name: string;
}

export interface Draft {
  id: string;
  company_id: string;
  contact_id: string | null;
  channel: DraftChannel;
  hook: MessageHook;
  subject: string | null;
  body: string;
  status: DraftStatus;
  attachments: DraftAttachment[];
  sequence_id: string | null;
  step: number;
  is_reply: boolean;
  approved_by: string | null;
  approved_at: string | null;
  sent_at: string | null;
  created_at: string;
}

// Rótulos amigáveis para a UI
export const HOOK_LABELS: Record<MessageHook, string> = {
  nr1: "NR-1 (riscos psicossociais)",
  saude_mental: "Saúde mental corporativa",
  tea_aba: "TEA / ciência ABA",
};

export const STATUS_LABELS: Record<CompanyStatus, string> = {
  mapeado: "Mapeado",
  qualificado: "Qualificado",
  contato_iniciado: "Contato iniciado",
  em_negociacao: "Em negociação",
  parceria_ativa: "Parceria ativa",
  descartado: "Descartado",
};

export const THESIS_LABELS: Record<CommercialThesis, string> = {
  a_descobrir: "A descobrir",
  credenciada: "Operadora credenciada",
  alavanca: "Alavanca (não-credenciada)",
};

export const CATEGORY_LABELS: Record<PartnerCategory, string> = {
  operadora: "Operadora de saúde",
  empresa: "Empresa",
  escola: "Escola",
  medico: "Médico prescritor",
  igreja: "Igreja",
  agenda_aberta: "Agenda Aberta",
  reajuste: "Reajuste",
};

export const SEQUENCE_STATUS_LABELS: Record<SequenceStatus, string> = {
  ativa: "Cutucando",
  aguardando_ceo: "Aguardando você",
  pausada_negativa: "Pausada (retoma em 30 dias)",
  agendada: "Retomada agendada",
  encerrada: "Encerrada",
};
