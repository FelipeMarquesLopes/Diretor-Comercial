-- ==========================================================================
-- Growth AI — MEMÓRIA DA LARA
--
-- Duas camadas de memória para a assistente:
--
-- 1) lara_mensagens — a CONVERSA persistida. Hoje o chat vive só no navegador
--    (some ao recarregar/trocar de aparelho). Guardando aqui, a Lara continua
--    de onde parou, em qualquer dispositivo, e o servidor passa a ser a fonte
--    da verdade do histórico. NÃO guardamos o base64 dos anexos (é pesado) —
--    só o nome/tipo, para referência.
--
-- 2) lara_memoria — FATOS DE LONGO PRAZO que a Lara deve lembrar para sempre
--    (ex: "fechamos credenciamento com a Elaine da Unimed Bandeirantes",
--    preferências de abordagem, decisões do Felipe). São poucos, curados, e
--    injetados no início de toda conversa — assim ela "sabe" sem reler tudo.
--
-- Sem dado de paciente. Rode no editor SQL do Supabase.
-- ==========================================================================

create table if not exists lara_mensagens (
  id uuid primary key default gen_random_uuid(),
  role text not null check (role in ('user', 'assistant')),
  content text not null default '',
  acoes jsonb,                          -- ferramentas usadas (transparência)
  anexos jsonb,                         -- [{nome, mediaType}] — SEM base64
  created_at timestamptz not null default now()
);

create index if not exists idx_lara_mensagens_created on lara_mensagens(created_at);

create table if not exists lara_memoria (
  id uuid primary key default gen_random_uuid(),
  chave text unique,                    -- rótulo curto p/ atualizar/remover
  conteudo text not null,               -- o fato em si
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_lara_memoria_updated on lara_memoria(updated_at desc);

create trigger lara_memoria_set_updated_at
  before update on lara_memoria
  for each row execute function set_updated_at();
