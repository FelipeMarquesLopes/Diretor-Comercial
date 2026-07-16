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

export interface Company {
  id: string;
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
  is_decision_maker: boolean;
  created_at: string;
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
