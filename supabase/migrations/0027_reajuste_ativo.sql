-- ==========================================================================
-- Growth AI — aba REAJUSTES = quem já está em processo de reajuste
--
-- Quando a Lara (ou a campanha de Jan-Fev) prepara um pedido de reajuste a
-- partir de um contrato, o parceiro passa a aparecer na aba REAJUSTES —
-- independente da categoria/frente de origem (operadora prospectada ou
-- credenciado só de contrato). Assim a aba Reajustes vira a lista de quem
-- estamos REALMENTE cobrando reajuste; quem não está lá, ainda não começou.
--
-- Rode no editor SQL do Supabase.
-- ==========================================================================

alter table companies
  add column if not exists reajuste_ativo boolean not null default false;

create index if not exists idx_companies_reajuste_ativo on companies(reajuste_ativo);
