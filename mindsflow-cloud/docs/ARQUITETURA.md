# Arquitetura — Nuvem MindsFlow

Documento curto de decisões. O objetivo é que daqui a seis meses ninguém
precise adivinhar *por que* está assim.

## Decisões e o motivo

### 1. Multi-tenant por linha, não por banco

Todas as organizações dividem as mesmas tabelas; o que separa é a coluna
`org_id` mais as políticas de RLS.

**Por quê:** um banco por cliente multiplica migrations, backups e custo —
inviável para dezenas de organizações pequenas. Se um dia aparecer um cliente
que exija banco isolado por contrato, ele vira exceção, não a regra.

**O preço:** todo `select` depende do RLS estar certo. Por isso as regras
ficam no banco e não no código: um endpoint esquecido não vaza dado.

### 2. RLS em vez de filtro no aplicativo

Nenhuma tela precisa lembrar de `where org_id = ...` para ficar segura.

**Por quê:** filtro no código é uma linha esquecida de distância do vazamento.
No banco, a regra vale para a API REST do Supabase, para um script, para o
console — para tudo.

**Cuidado:** consultar `memberships` dentro de uma política *de*
`memberships` gera recursão infinita. Daí as funções `security definer`
(`is_org_member`, `is_org_admin`, `shares_org_with`), que rodam com o
privilégio do dono e escapam da política.

### 3. Login por link mágico

Sem senha.

**Por quê:** a operação é pequena e distribuída (clínicas, parceiros). Senha
significa política de senha, reset, vazamento e suporte. O link some sozinho.

**Quando revisar:** se surgir necessidade de acesso por app móvel offline ou
de SSO corporativo (aí, Google/Microsoft OAuth no mesmo Supabase Auth).

### 4. anon key no servidor, service_role só na exceção

O cliente de servidor (`lib/supabase/server.ts`) usa a **anon key** com a
sessão da pessoa, então passa pelo RLS igual ao navegador.

**Por quê:** o padrão preguiçoso é usar `service_role` no servidor "porque é
servidor" — e aí toda rota vira um bypass de segurança. A `service_role`
(`lib/supabase/admin.ts`) fica marcada com `server-only` e reservada para
jobs sem usuário logado.

### 5. Organização ativa em cookie

Quem pertence a várias organizações troca pelo seletor no cabeçalho; a
escolha vai para o cookie `mf_org` (httpOnly).

**Por quê:** simples e sobrevive à navegação. O cookie **não** é fonte de
autoridade: o `trocarOrganizacao` confere o vínculo, e o RLS confere de novo.

### 6. Auditoria desde o primeiro dia

`audit_log` já nasce junto do schema, mesmo com pouca coisa registrada.

**Por quê:** auditoria adicionada depois nunca cobre o passado. Se dado de
paciente entrar nesta nuvem, a pergunta "quem viu o quê" vai aparecer — e a
resposta precisa existir.

## Como adicionar um módulo

1. **Tabela** com `org_id uuid not null references organizations(id) on delete cascade`.
2. **RLS ligado** e política no padrão:
   ```sql
   alter table minha_tabela enable row level security;

   create policy minha_tabela_membro on minha_tabela
     for select using (public.is_org_member(org_id));

   create policy minha_tabela_escrita on minha_tabela
     for all using (public.is_org_admin(org_id))
     with check (public.is_org_admin(org_id));
   ```
3. **Tipo** em `src/lib/types.ts`.
4. **Tela** em `src/app/(app)/meu-modulo/page.tsx`, lendo a organização com
   `getOrgContext()`.
5. **Item de menu** em `src/components/Nav.tsx`.

## O que ainda não existe (e é consciente)

- **E-mail transacional** — o convite gera link, mas quem envia é uma pessoa.
- **Testes automatizados** — a base é pequena; quando entrar regra de
  negócio, começar pelos testes das funções SQL.
- **Rate limiting** — o Supabase limita o envio de e-mail de login, o que
  cobre o abuso mais óbvio nesta fase.
- **Migrations versionadas por ferramenta** — hoje é SQL rodado à mão no
  editor. Ao passar de dois ou três arquivos, adotar a CLI do Supabase.
