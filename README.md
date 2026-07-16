# Growth AI — Diretor Comercial Digital (MenthalHelp)

Sistema que automatiza **todo o trabalho operacional que antecede uma
negociação** — pesquisar, qualificar, contatar, nutrir e agendar. O fechamento
continua humano (do CEO).

Regra inegociável: **nenhuma mensagem sai automaticamente** — a IA prepara o
rascunho e um humano aprova com um clique.

Frentes já no sistema:

- **Operadoras de saúde** — você cadastra o contato na mão; a IA monta os
  rascunhos e cuida do follow-up.
- **Empresas** — descoberta automática via Apollo.io (100+ funcionários).
- **Escolas / médicos** — previstos (mesma mecânica), a habilitar.

**Motor de follow-up** (o "cérebro"): para cada parceiro, o sistema cutuca em
dois canais até obter resposta — **e-mail de 3 em 3 dias, sem limite**;
**WhatsApp escalonado (3h → 24h → 48h → 72h)**. Ao chegar resposta, a IA entende
o tom: **positiva** → chama o CEO; **negativa** → pausa e retoma em 30 dias;
**sem resposta** → segue cutucando.

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
2. No projeto, abra **SQL Editor** e rode, **nesta ordem**:
   - [`supabase/migrations/0001_init.sql`](supabase/migrations/0001_init.sql)
   - [`supabase/migrations/0002_followup_engine.sql`](supabase/migrations/0002_followup_engine.sql)

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

## Próximos passos

- **Conectar o Gmail** — para o clique do CEO realmente disparar o e-mail e para
  o sistema ler as respostas automaticamente (hoje as respostas são registradas
  na tela de Operadoras).
- **WhatsApp Business API** — para envio/leitura automáticos no funil escalonado
  (exige conta Meta Business, número aprovado e modelos de mensagem).
- **Publicar (deploy) + job diário** — para o motor de follow-up rodar sozinho
  todo dia. Hoje há o botão "Rodar follow-up agora" no dashboard para acionar
  manualmente.
- **Escolas e médicos** — habilitar as frentes restantes (mesma mecânica).
- **Autenticação** (Supabase Auth + RLS) quando houver mais de um usuário.

## Deploy

Deployável na **Vercel**: conecte o repositório, configure as mesmas variáveis
de ambiente e faça o deploy. O Supabase e o Apollo continuam como serviços
externos.
