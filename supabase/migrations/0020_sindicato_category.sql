-- ==========================================================================
-- Growth AI — nova frente: SINDICATOS
--
-- Sindicato agrega MILHARES de associados (indústria, comércio, professores,
-- metalúrgicos, caminhoneiros…). Uma única parceria pode valer por centenas de
-- leads: convênio com desconto para associados E/OU repasse (o associado paga
-- ao sindicato e ele repassa os atendimentos à clínica).
--
-- OBS: ALTER TYPE ... ADD VALUE precisa rodar FORA de uma transação (igual às
-- migrações 0006/0007/0016). No editor SQL do Supabase, rode este arquivo
-- sozinho.
--
-- Nada de dado de paciente — é prospecção comercial (o parceiro é o sindicato).
-- ==========================================================================

alter type partner_category add value if not exists 'sindicato';
