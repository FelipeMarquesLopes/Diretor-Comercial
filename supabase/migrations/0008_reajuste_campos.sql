-- 0008: campos da frente "Reajustes" (rode DEPOIS da 0007).
--
-- Guardam o contrato anexado e o parecer da IA (percentual sugerido, janela
-- ideal e o parecer completo) para embasar o pedido de reajuste.

alter table companies
  add column if not exists contract_path text,
  add column if not exists contract_name text,
  add column if not exists reajuste_parecer text,
  add column if not exists reajuste_percent text,
  add column if not exists reajuste_janela text;
