-- ==========================================================================
-- Growth AI — parceiros SÓ DE CONTRATO (credenciados), fora da prospecção
--
-- Os contratos anexados no banco de contratos são de parceiros com quem já
-- somos CREDENCIADOS (ex: Unimed Guarulhos) — eles nunca passaram pela
-- prospecção e NÃO devem receber automação nem aparecer nas abas de captação/
-- operadoras. Marcamos esses registros com contract_only = true, e as listas de
-- prospecção passam a escondê-los. Eles servem só ao banco de contratos +
-- reajuste (a Lara trabalha o reajuste em cima deles).
--
-- Rode no editor SQL do Supabase.
-- ==========================================================================

alter table companies
  add column if not exists contract_only boolean not null default false;

create index if not exists idx_companies_contract_only on companies(contract_only);
