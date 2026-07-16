# Growth AI — Diretor Comercial Digital (MenthalHelp)

Sistema que automatiza **todo o trabalho operacional que antecede uma
negociação** — pesquisar, qualificar, contatar, nutrir e agendar. O fechamento
continua humano (do CEO).

Esta é a **frente de prospecção de empresas** (100+ funcionários), a primeira
frente do projeto. Regra inegociável: **nenhuma mensagem sai automaticamente** —
a IA prepara o rascunho e um humano aprova com um clique.

## Stack

- **Next.js 15** (App Router) + **TypeScript** + **Tailwind**
- **Supabase** (Postgres) — banco de dados
- **Apollo.io** (API REST) — descoberta de empresas e contatos do RH
- **Anthropic** (`claude-opus-4-8`) — geração dos rascunhos

## O fluxo

```
Prospecção (Apollo) → Qualificação (IA) → Rascunho (IA, com ganchos)
   → Aprovação humana → Envio manual → acompanhamento no dashboard
```

Ganchos de abordagem: **NR-1** (riscos psicossociais), **saúde mental
corporativa** e **TEA/ABA**.

## Setup

### 1. Instalar dependências

```bash
npm install
```

### 2. Criar o banco no Supabase

1. Crie um projeto grátis em <https://supabase.com>.
2. No projeto, abra **SQL Editor** e rode o conteúdo de
   [`supabase/migrations/0001_init.sql`](supabase/migrations/0001_init.sql).

### 3. Configurar variáveis de ambiente

```bash
cp .env.example .env.local
```

Preencha o `.env.local`:

| Variável | Onde pegar |
|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` / `NEXT_PUBLIC_SUPABASE_ANON_KEY` / `SUPABASE_SERVICE_ROLE_KEY` | Supabase → Project Settings → API |
| `ANTHROPIC_API_KEY` | <https://console.anthropic.com> |
| `APOLLO_API_KEY` | <https://developer.apollo.io> (precisa do **plano Basic**) |

> ⚠️ O plano **free** do Apollo **não libera** busca de empresas/pessoas. Sem o
> plano Basic, a prospecção retorna erro — o resto do app (rascunhos, aprovação)
> continua funcionando com dados inseridos manualmente.

### 4. Rodar

```bash
npm run dev
```

Abra <http://localhost:3000>.

## Como usar

1. **Prospecção** — busque empresas por setor/localização (100+ funcionários por
   padrão). A IA qualifica e pontua cada uma automaticamente.
2. Para uma empresa qualificada, escolha um gancho e o canal e clique em
   **Gerar rascunho**.
3. **Rascunhos** — revise, edite se quiser, e **Aprove**. Depois dispare
   manualmente (o botão do WhatsApp abre a conversa com o texto pronto) e marque
   como enviado.
4. **Dashboard** — acompanha o pipeline e o que precisa da sua ação.

## Estrutura

```
src/
├── app/
│   ├── page.tsx              # Dashboard executivo
│   ├── prospeccao/page.tsx   # Busca + qualificação
│   ├── rascunhos/page.tsx    # Aprovação de rascunhos
│   └── api/                  # Rotas de servidor
│       ├── prospect/         # busca Apollo + qualifica + persiste
│       ├── companies/        # lista empresas
│       ├── drafts/           # gera/lista/aprova rascunhos
│       └── stats/            # métricas do dashboard
├── lib/
│   ├── apollo.ts             # adaptador da API do Apollo
│   ├── qualify.ts            # scoring de qualificação
│   ├── anthropic.ts          # geração de rascunho com IA
│   ├── types.ts              # tipos de domínio
│   └── supabase/server.ts    # cliente Supabase (servidor)
└── components/Nav.tsx
supabase/migrations/0001_init.sql   # schema do banco
```

## Próximos passos (fora do MVP desta frente)

- Autenticação (hoje o app é de uso interno único; adicionar Supabase Auth + RLS).
- Integração real de **Gmail** (criar rascunho) e **WhatsApp Business API** (envio).
- Enriquecimento: descobrir convênio/operadora junto ao RH e definir a tese
  comercial (credenciada × alavanca) por empresa.
- Replicar o modelo para as frentes de **operadoras**, **escolas** e **médicos**.
- Automação contínua (jobs agendados) para prospecção recorrente.

## Deploy

Deployável na **Vercel**: conecte o repositório, configure as mesmas variáveis
de ambiente e faça o deploy. O Supabase e o Apollo continuam como serviços
externos.
