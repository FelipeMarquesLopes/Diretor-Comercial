-- ==========================================================================
-- Growth AI — BANCO DE CONTRATOS + REAJUSTE ANUAL
--
-- Guarda os contratos dos parceiros (operadoras, empresas, escolas, médicos,
-- sindicatos, licitações), POR MARCA (MenthalHelp / Therapy Minds). Cada
-- registro pode ter 1+ arquivos (contrato original + adendos). A IA lê o PDF e
-- extrai a DATA DE INÍCIO do vínculo + a cláusula de reajuste (índice/janela).
--
-- Uso: todo Jan-Fev o motor varre os contratos com 12+ meses e prepara os
-- pedidos de reajuste (rascunhos pendentes) — o campo reajuste_year evita
-- repetir no mesmo ano.
--
-- Os arquivos ficam no bucket privado 'contratos' (Storage). Rode no Supabase.
-- ==========================================================================

create table if not exists contracts (
  id uuid primary key default gen_random_uuid(),
  company_id uuid references companies(id) on delete cascade,
  brand text not null default 'menthalhelp',
  files jsonb not null default '[]',   -- [{ path, name }] no Storage 'contratos'
  data_inicio date,                    -- início do vínculo (extraído pela IA)
  clausula text,                       -- resumo da cláusula de reajuste
  indice text,                         -- índice/percentual sugerido
  janela text,                         -- janela ideal para pedir o reajuste
  parecer text,                        -- parecer curto (jurídico + comercial)
  reajuste_year integer,               -- ano em que já geramos o pedido (idempotência)
  notes text,
  created_at timestamptz not null default now()
);

create index if not exists idx_contracts_company on contracts(company_id);
create index if not exists idx_contracts_brand on contracts(brand);
create index if not exists idx_contracts_data on contracts(data_inicio);
