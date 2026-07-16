-- ==========================================================================
-- Growth AI — schema inicial (frente de EMPRESAS)
-- Rode este SQL no editor SQL do seu projeto Supabase.
-- ==========================================================================

-- Tipos (enums) do pipeline -------------------------------------------------

-- Status do pipeline comercial (do brief, seção 5.1)
create type company_status as enum (
  'mapeado',            -- descoberto via Apollo, ainda não qualificado/contactado
  'qualificado',        -- passou nos critérios, pronto para abordagem
  'contato_iniciado',   -- rascunho aprovado e enviado (manualmente)
  'em_negociacao',      -- houve resposta / avançou
  'parceria_ativa',     -- fechado
  'descartado'          -- não faz sentido seguir
);

-- Qual das duas teses comerciais (brief, seção 3)
create type commercial_thesis as enum (
  'a_descobrir',        -- ainda não sabemos a operadora
  'credenciada',        -- operadora que a clínica JÁ atende
  'alavanca'            -- operadora não-credenciada; usar empresa como alavanca
);

-- Gancho de abordagem (brief, seção 3)
create type message_hook as enum (
  'nr1',                -- NR-1 / riscos psicossociais (urgência regulatória)
  'saude_mental',       -- saúde mental corporativa / redução de afastamento
  'tea_aba'             -- TEA e ciência ABA (colaboradores com filhos no espectro)
);

create type draft_channel as enum ('email', 'whatsapp');

create type draft_status as enum (
  'pendente',           -- aguardando aprovação humana (regra inegociável)
  'aprovado',           -- CEO aprovou; pronto para disparar
  'rejeitado',          -- CEO descartou o rascunho
  'enviado'             -- marcado como enviado (manualmente por enquanto)
);

-- Tabela: empresas prospectadas ---------------------------------------------

create table companies (
  id uuid primary key default gen_random_uuid(),
  apollo_id text unique,                     -- id da organização no Apollo (dedupe)
  name text not null,
  domain text,
  website text,
  industry text,
  employee_count int,                        -- critério: 100+ (brief, seção 3)
  city text,
  state text,
  country text default 'Brasil',
  linkedin_url text,
  logo_url text,
  phone text,

  -- Qualificação
  status company_status not null default 'mapeado',
  qualification_score int not null default 0,  -- 0-100 (ver lib/qualify.ts)
  qualified boolean not null default false,
  qualification_notes text,

  -- Descoberta junto ao RH (brief, seção 3): oferecem convênio? qual operadora?
  offers_health_benefit boolean,              -- null = a descobrir
  health_operator text,                       -- nome da operadora, se conhecida
  commercial_thesis commercial_thesis not null default 'a_descobrir',

  -- Gestão comercial
  priority int not null default 3,            -- 1 (baixa) a 5 (alta)
  next_followup date,
  notes text,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index idx_companies_status on companies(status);
create index idx_companies_priority on companies(priority desc);

-- Tabela: contatos (pessoas do RH nas empresas) -----------------------------

create table contacts (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references companies(id) on delete cascade,
  apollo_id text unique,
  name text not null,
  title text,                                 -- cargo
  email text,
  phone text,
  linkedin_url text,
  is_decision_maker boolean not null default false,
  created_at timestamptz not null default now()
);

create index idx_contacts_company on contacts(company_id);

-- Tabela: rascunhos de mensagem (aguardando aprovação) ----------------------
-- REGRA INEGOCIÁVEL: nada sai automaticamente. A IA cria; o humano aprova.

create table drafts (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references companies(id) on delete cascade,
  contact_id uuid references contacts(id) on delete set null,
  channel draft_channel not null default 'email',
  hook message_hook not null default 'nr1',
  subject text,                               -- assunto (e-mail)
  body text not null,                         -- corpo da mensagem
  status draft_status not null default 'pendente',
  approved_by text,                           -- quem aprovou (e-mail do CEO)
  approved_at timestamptz,
  sent_at timestamptz,
  created_at timestamptz not null default now()
);

create index idx_drafts_status on drafts(status);
create index idx_drafts_company on drafts(company_id);

-- Tabela: histórico / linha do tempo ----------------------------------------

create table activities (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references companies(id) on delete cascade,
  type text not null,                         -- ex: 'prospeccao', 'rascunho', 'aprovacao'
  description text not null,
  created_at timestamptz not null default now()
);

create index idx_activities_company on activities(company_id);

-- Trigger para manter updated_at em companies -------------------------------

create or replace function set_updated_at()
returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

create trigger companies_set_updated_at
  before update on companies
  for each row execute function set_updated_at();
