# MindsFlow — Nuvem

Base da plataforma na nuvem da MindsFlow: **login sem senha, organizações
(multi-tenant), equipe com papéis, convites e trilha de auditoria** — tudo
com isolamento de dados garantido pelo banco.

É a fundação sobre a qual os módulos do produto entram. O que já está pronto
é o que todo sistema em nuvem precisa ter antes de qualquer funcionalidade:
quem entra, de qual organização, com qual permissão, e o registro do que foi
feito.

## O que já funciona

| Recurso | Como |
|---|---|
| Login | Link mágico por e-mail (Supabase Auth) — sem senha para vazar |
| Organizações | Cada organização é um inquilino isolado; a pessoa pode ter várias |
| Papéis | Dono, Administrador e Membro |
| Convites | Geram um link com validade de 14 dias, de uso único |
| Isolamento | **RLS** no Postgres — a regra vive no banco, não no aplicativo |
| Auditoria | Tabela `audit_log` por organização, legível por dono/admin |
| Saúde | `GET /api/health` responde se app e banco estão de pé |

## Stack

- **Next.js 15** (App Router) + **TypeScript** + **Tailwind**
- **Supabase** — Postgres, Auth e RLS
- Deploy na **Vercel**

Mesma stack do Growth AI (Diretor Comercial), de propósito: um padrão só para
manter, e o que se aprende num projeto vale no outro.

## Setup

### 1. Dependências

```bash
npm install
```

### 2. Criar o banco no Supabase

1. Crie um projeto em <https://supabase.com>.
2. Abra **SQL Editor** e rode
   [`supabase/migrations/0001_init.sql`](supabase/migrations/0001_init.sql).

Isso cria as tabelas, as funções e **liga o RLS** em todas elas.

### 3. Variáveis de ambiente

```bash
cp .env.example .env.local
```

| Variável | Onde pegar |
|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` / `NEXT_PUBLIC_SUPABASE_ANON_KEY` / `SUPABASE_SERVICE_ROLE_KEY` | Supabase → Project Settings → API |
| `NEXT_PUBLIC_SITE_URL` | `http://localhost:3000` em dev; a URL do deploy em produção |

> A `service_role` ignora o RLS. Ela fica só no servidor e não vai para o
> navegador — nunca a coloque numa variável com prefixo `NEXT_PUBLIC_`.

### 4. Liberar a URL de retorno do login

No Supabase → **Authentication → URL Configuration**, adicione em
*Redirect URLs*:

```
http://localhost:3000/auth/callback
https://SEU-DOMINIO/auth/callback
```

Sem isso o link do e-mail volta com erro.

### 5. Rodar

```bash
npm run dev
```

Abra <http://localhost:3000>. Informe seu e-mail, clique no link que chegar e
crie a primeira organização — você entra nela como **Dono**.

## Como a segurança funciona

O isolamento não depende de o código lembrar de filtrar por organização. Cada
tabela tem políticas de RLS que respondem a uma pergunta só: *quem está
pedindo é membro desta organização?* Se não for, a linha simplesmente não
existe para ela — mesmo chamando a API do Supabase direto, por fora do app.

Duas funções sustentam isso (`security definer`, para não cair em recursão):

- `is_org_member(org)` — leitura
- `is_org_admin(org)` — gestão de equipe e convites

E duas operações passam obrigatoriamente por função, porque precisam ser
atômicas:

- `create_organization(nome, slug)` — cria a organização **e** o vínculo de
  dono na mesma transação (senão a organização nasceria órfã e invisível)
- `accept_invite(token)` — confere validade, uso único e e-mail antes de
  criar o vínculo

## Estrutura

```
src/
├── app/
│   ├── page.tsx                    # raiz → painel ou login
│   ├── login/page.tsx              # link mágico
│   ├── auth/callback/route.ts      # retorno do e-mail (PKCE e token_hash)
│   ├── auth/signout/route.ts       # sair (POST)
│   ├── (app)/                      # área logada (cabeçalho + menu)
│   │   ├── dashboard/page.tsx      # painel + primeira organização
│   │   ├── organizacao/            # equipe, papéis e convites
│   │   └── convite/[token]/        # aceite de convite
│   └── api/health/route.ts         # sonda de saúde
├── lib/
│   ├── auth.ts                     # sessão + organização ativa (cookie)
│   ├── env.ts                      # variáveis com erro explicativo
│   ├── types.ts                    # tipos do domínio
│   └── supabase/{client,server,admin}.ts
├── components/                     # Card, Nav, OrgSwitcher, formulários
└── middleware.ts                   # renova sessão + barra rota protegida
supabase/migrations/0001_init.sql   # schema + RLS
```

## Deploy (Vercel)

1. Importe o repositório na Vercel.
2. Configure as mesmas variáveis do `.env.local` (com `NEXT_PUBLIC_SITE_URL`
   apontando para a URL do deploy).
3. Adicione a URL de callback no Supabase (passo 4 acima).

## Próximos passos

- **Envio de e-mail do convite** — hoje o link é gerado e copiado na mão.
- **Domínio próprio** e página pública da MindsFlow na raiz.
- **Módulos do produto** — cada um entra como uma pasta em `src/app/(app)/`,
  com suas tabelas sempre carregando `org_id` e políticas de RLS no mesmo
  padrão das existentes.
- **Dados sensíveis (LGPD)** — se entrar informação de paciente, revisar
  retenção, criptografia em repouso e o que a auditoria precisa registrar.
