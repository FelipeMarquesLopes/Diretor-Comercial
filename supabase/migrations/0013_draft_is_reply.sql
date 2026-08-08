-- Marca rascunhos que são RÉPLICA (resposta do CEO a um retorno recebido),
-- para o painel deixar claro que a réplica entrou na cobrança de 72h.
alter table drafts add column if not exists is_reply boolean not null default false;
