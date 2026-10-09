-- Segundo telefone do contato (ex: celular + telefone fixo).
-- O 'phone' guarda o celular/principal; o 'phone2' o fixo (ou vice-versa).
alter table contacts
  add column if not exists phone2 text;
