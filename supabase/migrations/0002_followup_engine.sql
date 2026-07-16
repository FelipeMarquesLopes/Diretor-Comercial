-- ==========================================================================
-- Growth AI — motor de follow-up + categorias de parceiro
-- Rode este SQL DEPOIS do 0001_init.sql, no editor SQL do Supabase.
--
-- O que este arquivo adiciona:
--  1. Categoria do parceiro (operadora / empresa / escola / médico) — para o
--     mesmo sistema controlar as 3 frentes num painel só.
--  2. "Sequências" de follow-up: para cada parceiro e cada canal (e-mail e
--     WhatsApp), o sistema guarda em que passo está e quando preparar a
--     próxima cutucada.
--  3. "Respostas": quando alguém responde, guardamos e a IA classifica se foi
--     positivo, negativo ou neutro.
-- ==========================================================================

-- 1. Categoria do parceiro ---------------------------------------------------

create type partner_category as enum ('operadora', 'empresa', 'escola', 'medico');

alter table companies
  add column category partner_category not null default 'empresa';

-- Flag indicando se o telefone do contato é WhatsApp (para o canal WhatsApp).
alter table contacts
  add column is_whatsapp boolean not null default false;

-- 2. Sequências de follow-up -------------------------------------------------

create type sequence_channel as enum ('email', 'whatsapp');

create type sequence_status as enum (
  'ativa',             -- cutucando: sistema vai preparar a próxima mensagem
  'aguardando_ceo',    -- houve resposta POSITIVA; passa a bola para o CEO
  'pausada_negativa',  -- resposta NEGATIVA; retomar contato em 30 dias
  'encerrada'          -- parceria fechada, ou descartado de vez
);

create table sequences (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references companies(id) on delete cascade,
  channel sequence_channel not null,
  status sequence_status not null default 'ativa',
  step int not null default 0,           -- quantas mensagens já saíram neste canal
  next_action_at timestamptz,            -- quando preparar a próxima (null = aguardando envio de um rascunho já pronto)
  last_sent_at timestamptz,              -- quando saiu a última mensagem
  resume_at timestamptz,                 -- quando retomar (após resposta negativa)
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (company_id, channel)
);

create index idx_sequences_next_action on sequences(next_action_at);
create index idx_sequences_status on sequences(status);
create index idx_sequences_resume on sequences(resume_at);

create trigger sequences_set_updated_at
  before update on sequences
  for each row execute function set_updated_at();

-- 3. Respostas recebidas (inbound) ------------------------------------------

create type response_sentiment as enum ('positivo', 'negativo', 'neutro');

create table responses (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references companies(id) on delete cascade,
  channel sequence_channel not null,
  sentiment response_sentiment not null,
  summary text,                          -- resumo curto (feito pela IA)
  raw_text text,                         -- texto original da resposta
  created_at timestamptz not null default now()
);

create index idx_responses_company on responses(company_id);

-- 4. Ligar rascunhos ao motor de follow-up ----------------------------------

alter table drafts add column sequence_id uuid references sequences(id) on delete set null;
alter table drafts add column step int not null default 0;
