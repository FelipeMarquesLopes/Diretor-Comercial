-- 0004: guarda o STATUS do e-mail do contato no Apollo (antes de revelar).
--
-- O Apollo informa, já na busca (sem gastar crédito), se tem um e-mail para
-- aquela pessoa e qual a confiabilidade: "verified", "likely to engage",
-- "unverified", "unavailable"... Guardamos isso para o painel mostrar quais
-- decisores TÊM e-mail para revelar — assim o CEO não gasta clique/crédito à
-- toa e sabe para qual e-mail vai a apresentação.

alter table contacts
  add column if not exists email_status text;
