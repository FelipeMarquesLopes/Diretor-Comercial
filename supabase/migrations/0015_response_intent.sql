-- Fase 1.1 — Interpretação rica das respostas.
--
-- Guarda a INTENÇÃO da resposta (mais fina que positivo/negativo/neutro) e a
-- data da próxima ação sugerida (ex: "me procure em outubro").
alter table responses add column if not exists intent text;
alter table responses add column if not exists next_action_at timestamptz;

-- Novo estado da sequência: AGENDADA — o parceiro pediu para ser procurado numa
-- data futura. O motor reativa na data (mesmo mecanismo do resume_at), mas sem
-- rotular como "negativa".
alter type sequence_status add value if not exists 'agendada';
