-- ==========================================================================
-- Operadoras: separar "novas" (captação) de "ativas" (relacionamento),
-- e adicionar o campo de briefing (o que a IA deve enviar, escrito pelo CEO).
-- Rode DEPOIS do 0002.
-- ==========================================================================

-- Tipo da operadora: 'nova' (captar credenciamento) ou 'ativa' (parceira atual:
-- extensões, reajustes, inclusão de endereços). Vale só para category=operadora.
alter table companies
  add column operator_type text not null default 'nova';

-- Briefing / observações: o CEO descreve o que a IA deve comunicar naquele
-- parceiro (uma espécie de copy/orientação). A IA segue isso ao gerar o e-mail.
alter table companies
  add column briefing text;
