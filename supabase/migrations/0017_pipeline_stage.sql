-- Fase 2.1 — Pipelines por segmento (Kanban).
--
-- Mantemos `companies.status` como o funil UNIVERSAL (todo o sistema já o
-- consulta). Adicionamos `companies.stage`: o estágio FINO, específico do
-- segmento (operadora: em_credenciamento/implantacao; empresa: proposta/
-- contrato; etc.). Os estágios são definidos em CÓDIGO (src/lib/pipelines.ts),
-- então não há tabela de seed — só a coluna. Ao mover um card, o `stage` muda
-- e o `status` universal é RECONCILIADO automaticamente (nunca divergem).
alter table companies add column if not exists stage text;

-- Índice para agrupar o board por estágio rapidamente.
create index if not exists idx_companies_stage on companies(stage);
