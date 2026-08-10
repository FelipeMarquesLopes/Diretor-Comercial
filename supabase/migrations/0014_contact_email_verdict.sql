-- Guarda o VEREDITO de validação do e-mail do contato (ZeroBounce), para as
-- frentes empresa/médico/escola terem o mesmo rigor das operadoras.
--   'valid'     -> caixa existe, seguro enviar
--   'catch_all' -> servidor aceita tudo (não confirma) — tratado como não-seguro
--   'invalid'   -> não existe / não entrega
--   'unknown'   -> não deu para verificar
-- Nulo = ainda não verificado.
alter table contacts add column if not exists email_verdict text;
