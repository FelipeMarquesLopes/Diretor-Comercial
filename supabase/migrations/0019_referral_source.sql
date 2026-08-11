-- Fase 5 — Parceiro como FONTE DE ENCAMINHAMENTO (sem dado de paciente).
--
-- Reescopada por decisão do CEO: NADA de cadastro ou controle de paciente.
-- Só marcamos, de forma AGREGADA, quais parceiros (médico, escola, igreja, RH)
-- são boas fontes de indicação — e um CONTADOR simples de quantos
-- encaminhamentos cada um gerou (entrada manual do comercial). Nenhum nome,
-- contato ou dado de paciente. É só B2B: dado do parceiro.
alter table companies add column if not exists is_referral_source boolean not null default false;
alter table companies add column if not exists referral_count int not null default 0;

create index if not exists idx_companies_referral on companies(is_referral_source);
