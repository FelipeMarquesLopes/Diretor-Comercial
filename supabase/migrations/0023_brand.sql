-- ==========================================================================
-- Growth AI — DUAS MARCAS: MenthalHelp e Therapy Minds
--
-- Mesma estrutura e oferta, divididas por região/unidade. Decisões do CEO:
--   • BASES SEPARADAS  -> cada parceiro pertence a UMA marca (coluna `brand`);
--   • REMETENTE SEPARADO -> o e-mail sai da marca dona do lead (ver brands.ts);
--   • mesma oferta -> o conteúdo do pitch é o mesmo; muda a assinatura/remetente.
--
-- Tudo o que já existe fica na MenthalHelp (default), sem quebrar nada.
-- Rode no editor SQL do Supabase.
-- ==========================================================================

alter table companies
  add column if not exists brand text not null default 'menthalhelp';

create index if not exists idx_companies_brand on companies(brand);

-- Garante que os registros antigos fiquem explicitamente na MenthalHelp.
update companies set brand = 'menthalhelp' where brand is null;

-- Dedupe do Apollo passa a ser POR MARCA: o mesmo órgão (apollo_id) pode existir
-- na MenthalHelp E na Therapy Minds (bases separadas). Trocamos o unique global
-- de apollo_id por um unique composto (apollo_id, brand).
alter table companies drop constraint if exists companies_apollo_id_key;
create unique index if not exists companies_apollo_id_brand_key
  on companies (apollo_id, brand);

-- Mesma lógica para os contatos: o mesmo decisor (apollo_id) pode aparecer na
-- empresa "espelho" da outra marca. Dedup passa a ser (apollo_id, company_id).
alter table contacts drop constraint if exists contacts_apollo_id_key;
create unique index if not exists contacts_apollo_id_company_key
  on contacts (apollo_id, company_id);

