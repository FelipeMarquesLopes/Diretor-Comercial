-- ─────────────────────────────────────────────────────────────────────────
-- Nuvem MindsFlow — schema inicial (multi-tenant)
--
-- Modelo: uma "organização" é o inquilino (tenant). Toda pessoa acessa a
-- nuvem por meio de um vínculo (membership) com uma ou mais organizações.
-- Nenhum dado é visível fora da organização: quem garante isso é o RLS
-- (Row Level Security) — as regras ficam no banco, não no aplicativo, então
-- valem mesmo se alguém chamar a API direto.
--
-- Rode este arquivo no Supabase → SQL Editor.
-- ─────────────────────────────────────────────────────────────────────────

create extension if not exists pgcrypto;

-- ── Tipos ────────────────────────────────────────────────────────────────

do $$
begin
  if not exists (select 1 from pg_type where typname = 'member_role') then
    create type member_role as enum ('owner', 'admin', 'member');
  end if;
end
$$;

-- ── Tabelas ──────────────────────────────────────────────────────────────

-- Perfil da pessoa. Espelha auth.users (que é gerenciada pelo Supabase) com
-- os campos que o aplicativo precisa exibir.
create table if not exists profiles (
  user_id    uuid primary key references auth.users (id) on delete cascade,
  email      text,
  full_name  text,
  created_at timestamptz not null default now()
);

-- O inquilino. Uma clínica, uma empresa parceira, uma unidade.
create table if not exists organizations (
  id         uuid primary key default gen_random_uuid(),
  name       text not null,
  slug       text not null unique,
  created_at timestamptz not null default now()
);

-- O vínculo pessoa ↔ organização, com o papel dentro dela.
create table if not exists memberships (
  id         uuid primary key default gen_random_uuid(),
  org_id     uuid not null references organizations (id) on delete cascade,
  user_id    uuid not null references auth.users (id) on delete cascade,
  role       member_role not null default 'member',
  created_at timestamptz not null default now(),
  unique (org_id, user_id)
);

create index if not exists memberships_user_idx on memberships (user_id);
create index if not exists memberships_org_idx on memberships (org_id);

-- Chave estrangeira redundante de propósito: é ela que permite ao PostgREST
-- (a API do Supabase) trazer o perfil junto com o vínculo numa consulta só,
-- em vez de o aplicativo fazer N buscas para montar a lista da equipe.
do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'memberships_profile_fkey'
  ) then
    alter table memberships
      add constraint memberships_profile_fkey
      foreign key (user_id) references profiles (user_id) on delete cascade;
  end if;
end
$$;

-- Convite para entrar numa organização. O convidado usa o token uma vez.
create table if not exists invites (
  id         uuid primary key default gen_random_uuid(),
  org_id     uuid not null references organizations (id) on delete cascade,
  email      text not null,
  role       member_role not null default 'member',
  token      text not null unique default encode(gen_random_bytes(24), 'hex'),
  invited_by uuid references auth.users (id) on delete set null,
  accepted_at timestamptz,
  expires_at timestamptz not null default now() + interval '14 days',
  created_at timestamptz not null default now()
);

create index if not exists invites_email_idx on invites (lower(email));

-- Trilha de auditoria: quem fez o quê, em qual organização. Cresce sempre;
-- é a base para investigar qualquer coisa depois (e exigência de LGPD na
-- prática, quando houver dado sensível de paciente na nuvem).
create table if not exists audit_log (
  id         bigserial primary key,
  org_id     uuid references organizations (id) on delete cascade,
  actor_id   uuid references auth.users (id) on delete set null,
  action     text not null,
  target     text,
  metadata   jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists audit_log_org_idx on audit_log (org_id, created_at desc);

-- ── Funções auxiliares ───────────────────────────────────────────────────
--
-- São `security definer` de propósito: rodam com os privilégios do dono da
-- função e por isso conseguem consultar `memberships` sem cair na própria
-- política de RLS (o que geraria recursão infinita).

create or replace function public.is_org_member(p_org uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from memberships m
    where m.org_id = p_org and m.user_id = auth.uid()
  );
$$;

create or replace function public.is_org_admin(p_org uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from memberships m
    where m.org_id = p_org
      and m.user_id = auth.uid()
      and m.role in ('owner', 'admin')
  );
$$;

-- "Esta pessoa divide alguma organização comigo?" — usada para deixar a
-- equipe ver o nome e o e-mail uns dos outros, e nada além disso.
create or replace function public.shares_org_with(p_user uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from memberships eu
    join memberships outro on outro.org_id = eu.org_id
    where eu.user_id = auth.uid() and outro.user_id = p_user
  );
$$;

-- Cria a organização e já vincula quem criou como `owner`, numa transação
-- só. Sem isso haveria uma janela em que a organização existe sem dono —
-- e, por RLS, ninguém conseguiria mais enxergá-la.
create or replace function public.create_organization(p_name text, p_slug text)
returns organizations
language plpgsql
security definer
set search_path = public
as $$
declare
  v_org organizations;
begin
  if auth.uid() is null then
    raise exception 'É preciso estar autenticado para criar uma organização.';
  end if;

  if coalesce(trim(p_name), '') = '' then
    raise exception 'O nome da organização é obrigatório.';
  end if;

  insert into organizations (name, slug)
  values (trim(p_name), lower(trim(p_slug)))
  returning * into v_org;

  insert into memberships (org_id, user_id, role)
  values (v_org.id, auth.uid(), 'owner');

  insert into audit_log (org_id, actor_id, action, target)
  values (v_org.id, auth.uid(), 'organization.created', v_org.name);

  return v_org;
end;
$$;

-- Aceita um convite. Confere se o token existe, não venceu, não foi usado e
-- se pertence ao e-mail de quem está logado.
create or replace function public.accept_invite(p_token text)
returns organizations
language plpgsql
security definer
set search_path = public
as $$
declare
  v_invite invites;
  v_org    organizations;
  v_email  text;
begin
  if auth.uid() is null then
    raise exception 'É preciso estar autenticado para aceitar um convite.';
  end if;

  select email into v_email from auth.users where id = auth.uid();

  select * into v_invite from invites where token = p_token;

  if v_invite.id is null then
    raise exception 'Convite não encontrado.';
  end if;
  if v_invite.accepted_at is not null then
    raise exception 'Este convite já foi usado.';
  end if;
  if v_invite.expires_at < now() then
    raise exception 'Este convite venceu.';
  end if;
  if lower(v_invite.email) <> lower(v_email) then
    raise exception 'Este convite foi enviado para outro e-mail.';
  end if;

  insert into memberships (org_id, user_id, role)
  values (v_invite.org_id, auth.uid(), v_invite.role)
  on conflict (org_id, user_id) do nothing;

  update invites set accepted_at = now() where id = v_invite.id;

  insert into audit_log (org_id, actor_id, action, target)
  values (v_invite.org_id, auth.uid(), 'invite.accepted', v_invite.email);

  select * into v_org from organizations where id = v_invite.org_id;
  return v_org;
end;
$$;

-- Toda pessoa que se cadastra ganha um perfil automaticamente.
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (user_id, email, full_name)
  values (
    new.id,
    new.email,
    coalesce(new.raw_user_meta_data ->> 'full_name', split_part(new.email, '@', 1))
  )
  on conflict (user_id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- Quem já tinha conta antes desta migration também precisa de perfil: sem
-- ele, o vínculo com a organização não pode ser criado (a chave estrangeira
-- de memberships aponta para profiles).
insert into public.profiles (user_id, email, full_name)
select
  u.id,
  u.email,
  coalesce(u.raw_user_meta_data ->> 'full_name', split_part(u.email, '@', 1))
from auth.users u
on conflict (user_id) do nothing;

-- ── RLS ──────────────────────────────────────────────────────────────────

alter table profiles      enable row level security;
alter table organizations enable row level security;
alter table memberships   enable row level security;
alter table invites       enable row level security;
alter table audit_log     enable row level security;

-- profiles: cada pessoa enxerga e edita o próprio perfil.
drop policy if exists profiles_select_own on profiles;
create policy profiles_select_own on profiles
  for select using (user_id = auth.uid());

-- ...e enxerga também quem divide organização com ela (para a tela de
-- equipe). Políticas de SELECT se somam: vale esta OU a de cima.
drop policy if exists profiles_select_colegas on profiles;
create policy profiles_select_colegas on profiles
  for select using (public.shares_org_with(user_id));

drop policy if exists profiles_update_own on profiles;
create policy profiles_update_own on profiles
  for update using (user_id = auth.uid()) with check (user_id = auth.uid());

-- organizations: quem é membro vê; quem é admin/owner edita.
-- A criação passa obrigatoriamente pela função create_organization().
drop policy if exists organizations_select_member on organizations;
create policy organizations_select_member on organizations
  for select using (public.is_org_member(id));

drop policy if exists organizations_update_admin on organizations;
create policy organizations_update_admin on organizations
  for update using (public.is_org_admin(id)) with check (public.is_org_admin(id));

-- memberships: membro vê a equipe; admin/owner gerencia.
drop policy if exists memberships_select_member on memberships;
create policy memberships_select_member on memberships
  for select using (public.is_org_member(org_id));

drop policy if exists memberships_write_admin on memberships;
create policy memberships_write_admin on memberships
  for all using (public.is_org_admin(org_id)) with check (public.is_org_admin(org_id));

-- invites: só admin/owner da organização enxerga e cria.
-- Quem foi convidado não precisa ler a tabela: usa accept_invite(token).
drop policy if exists invites_admin on invites;
create policy invites_admin on invites
  for all using (public.is_org_admin(org_id)) with check (public.is_org_admin(org_id));

-- audit_log: leitura para admin/owner. Escrita só pelo servidor/funções.
drop policy if exists audit_log_select_admin on audit_log;
create policy audit_log_select_admin on audit_log
  for select using (public.is_org_admin(org_id));
