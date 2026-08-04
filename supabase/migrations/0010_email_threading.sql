-- 0010: threading de e-mail (manter a conversa amarrada).
--
-- Para que follow-ups e réplicas cheguem NA MESMA conversa do destinatário
-- (com histórico/contexto), guardamos o Message-ID do último e-mail do assunto
-- e o assunto "raiz" da thread na sequência; e o Message-ID da mensagem que a
-- operadora nos enviou, para responder por cima dela.

alter table sequences
  add column if not exists last_message_id text,
  add column if not exists thread_subject text;

alter table responses
  add column if not exists message_id text;
