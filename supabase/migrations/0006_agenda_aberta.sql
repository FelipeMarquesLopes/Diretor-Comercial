-- 0006: categoria "agenda_aberta".
--
-- Nova frente: avisar operadoras parceiras, de forma recorrente (a cada 15
-- dias, por tempo indeterminado), que a MenthalHelp está com AGENDA ABERTA —
-- aumentando a visibilidade e o direcionamento de pacientes. Diferente das
-- outras frentes, NÃO para quando há resposta; o informativo continua sempre.
--
-- OBS: ALTER TYPE ... ADD VALUE precisa rodar fora de uma transação. No SQL
-- Editor do Supabase, rode esta linha sozinha (é o comportamento padrão).

alter type partner_category add value if not exists 'agenda_aberta';
