-- Revisão mensal dos e-mails da base de PROSPECÇÃO.
--
-- A Lara revisa toda a base de parceiros uma vez por mês: reverifica se o
-- e-mail cadastrado ainda é válido e, quando um morre, usa o Apollo para achar
-- um substituto e troca sozinha. Para não pesar (tempo do cron + créditos do
-- Apollo), a varredura é feita um pouco por dia: cada contato é revisto quando
-- sua última checagem está com 28+ dias. Esta coluna guarda esse "carimbo".
alter table contacts
  add column if not exists email_checked_at timestamptz;

-- Índice para achar rápido quem está "vencido" (nunca checado vem primeiro).
create index if not exists idx_contacts_email_checked_at
  on contacts (email_checked_at nulls first);
