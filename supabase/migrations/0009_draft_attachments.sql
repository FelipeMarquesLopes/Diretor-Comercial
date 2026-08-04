-- 0009: anexos do rascunho de e-mail.
--
-- Permite anexar documentos (ex: os que a operadora pediu) ao rascunho para
-- irem junto no disparo. Guardado como lista JSON de { path, name } — os
-- arquivos ficam no bucket privado "anexos" do Storage.

alter table drafts
  add column if not exists attachments jsonb not null default '[]'::jsonb;
