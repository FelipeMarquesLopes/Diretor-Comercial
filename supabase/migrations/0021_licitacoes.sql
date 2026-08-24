-- ==========================================================================
-- Growth AI — nova frente: LICITAÇÕES (relacionamento com prefeituras)
--
-- Muitas prefeituras terceirizam para a rede privada demandas que o SUS não
-- atende: TEA, reabilitação neurológica intensiva (PediaSuite), psicologia e
-- saúde mental. Isso sai via editais/credenciamentos publicados no PNCP e nos
-- portais das prefeituras. Esta tabela guarda cada OPORTUNIDADE (não é empresa,
-- por isso é uma tabela própria) para a clínica acompanhar e participar.
--
-- Fonte: PNCP (fonte='pncp', dedupe por numero_controle) ou cadastro manual
-- (fonte='manual'). Nada de dado de paciente — é contratação pública.
--
-- Rode no editor SQL do Supabase. Usa a função set_updated_at() (já existe
-- desde a 0001).
-- ==========================================================================

create table if not exists licitacoes (
  id uuid primary key default gen_random_uuid(),
  prefeitura text not null,             -- id da prefeitura no sistema (ex: 'guarulhos')
  municipio text,                       -- nome do município
  ibge text,                            -- código IBGE do município
  orgao text,                           -- razão social do órgão (ex: Prefeitura/Secretaria)
  unidade text,                         -- unidade compradora (ex: Secretaria de Saúde)
  objeto text not null,                 -- objeto da contratação
  modalidade text,                      -- pregão / credenciamento / dispensa...
  numero_controle text unique,          -- numeroControlePNCP (dedupe); null p/ manual
  edital_numero text,
  data_publicacao date,
  data_abertura timestamptz,
  data_encerramento timestamptz,        -- prazo (usado para alerta)
  valor_estimado numeric,
  link text,                            -- link do edital (PNCP ou portal)
  situacao text,                        -- situação no PNCP
  fonte text not null default 'pncp',   -- 'pncp' | 'manual'
  matched_keyword text,                 -- palavra-chave de saúde que casou
  contato_nome text,                    -- comissão/pregoeiro (do edital)
  contato_email text,
  contato_telefone text,
  status text not null default 'nova',  -- nossa gestão: nova/analisando/vamos_participar/inscritos/credenciada/descartada
  notes text,
  created_by text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_licitacoes_prefeitura on licitacoes(prefeitura);
create index if not exists idx_licitacoes_status on licitacoes(status);
create index if not exists idx_licitacoes_encerramento on licitacoes(data_encerramento);

create trigger licitacoes_set_updated_at
  before update on licitacoes
  for each row execute function set_updated_at();
