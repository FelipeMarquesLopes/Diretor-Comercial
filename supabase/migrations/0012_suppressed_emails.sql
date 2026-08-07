-- Sequência 1 — Lista de supressão (deliverability / proteção da conta de envio)
--
-- Registra e-mails que NÃO devem mais receber disparo: retornos (bounce)
-- capturados automaticamente da caixa, além de descadastros/bloqueios manuais.
-- Antes de todo envio, o sistema consulta esta lista e pula quem estiver aqui.
--
-- O e-mail é sempre gravado em MINÚSCULAS (a aplicação normaliza) e é UNIQUE,
-- para o upsert por e-mail funcionar e nunca duplicar.

create table if not exists suppressed_emails (
  id uuid primary key default gen_random_uuid(),
  email text not null unique,             -- sempre minúsculo
  reason text not null default 'bounce',  -- 'bounce' | 'manual' | 'unsubscribe'
  bounce_type text,                       -- 'hard' | 'soft' | null
  source text,                            -- 'inbox_ndr' | 'manual' | ...
  company_id uuid references companies(id) on delete set null,
  times integer not null default 1,       -- quantas vezes bateu/voltou
  last_subject text,                      -- assunto do último retorno (contexto)
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists suppressed_emails_company_idx
  on suppressed_emails (company_id);
