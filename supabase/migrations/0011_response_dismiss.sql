-- 0011: arquivar respostas já vistas/tratadas.
--
-- Depois que o CEO vê e/ou age sobre uma resposta, ele pode "fechar" (arquivar)
-- para tirá-la do radar do dashboard. Guardamos a data de arquivamento; o
-- dashboard só lista respostas ainda abertas (dismissed_at is null).

alter table responses
  add column if not exists dismissed_at timestamptz;
