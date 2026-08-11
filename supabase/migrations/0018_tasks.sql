-- Fase 3.2 — Tarefas para o comercial.
--
-- Ações HUMANAS que o sistema não executa: relacionamento presencial
-- (visitar um médico/igreja), enviar documentos, ligar, registrar um contato
-- indicado. A IA cria tarefas de APOIO (Nível 1); o CEO também cria as suas.
-- Nunca há dado de paciente aqui — é gestão comercial.
create table if not exists tasks (
  id uuid primary key default gen_random_uuid(),
  company_id uuid references companies(id) on delete cascade,  -- opcional (tarefa solta)
  title text not null,
  detail text,
  level int not null default 1,          -- nível de governança (1/2/3)
  due_date date,                         -- prazo (opcional)
  status text not null default 'aberta', -- aberta | concluida
  created_by text,                       -- 'ia' | e-mail do CEO
  created_at timestamptz not null default now(),
  completed_at timestamptz
);

create index if not exists idx_tasks_status on tasks(status);
create index if not exists idx_tasks_company on tasks(company_id);
