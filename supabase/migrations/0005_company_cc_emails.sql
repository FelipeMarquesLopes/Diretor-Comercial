-- 0005: e-mails em CÓPIA (CC) opcionais para os disparos.
--
-- Ao cadastrar/editar uma operadora, o CEO pode informar outras pessoas para
-- entrarem em cópia no e-mail (além do e-mail de monitoramento do próprio CEO).
-- Assim dá para falar com 2-3 pessoas de uma vez, num disparo só.
-- Guardado como texto (e-mails separados por vírgula).

alter table companies
  add column if not exists cc_emails text;
