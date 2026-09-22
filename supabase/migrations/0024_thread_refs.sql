-- ==========================================================================
-- Growth AI — ENCADEAMENTO DE E-MAIL (thread) mais robusto
--
-- Para todo o follow-up ficar na MESMA conversa (um histórico só, como os
-- parceiros pedem), guardamos a CADEIA completa de Message-IDs da thread
-- (nossos envios + as respostas do parceiro). O cabeçalho References passa a
-- carregar essa cadeia inteira, e o In-Reply-To aponta para a ÚLTIMA mensagem
-- da conversa (inclusive a resposta do parceiro) — é o que faz Gmail/Outlook/
-- Titan agruparem tudo num único e-mail.
--
-- Rode no editor SQL do Supabase.
-- ==========================================================================

alter table sequences
  add column if not exists thread_refs text; -- Message-IDs separados por espaço
