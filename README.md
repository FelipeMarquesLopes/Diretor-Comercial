# Growth AI — Diretor Comercial Digital (MenthalHelp / Therapy Minds)

Motor de prospecção e relacionamento comercial (SDR) para as clínicas
**MenthalHelp / Therapy Minds** (saúde mental e neurodesenvolvimento, forte
expertise em TEA/ABA; unidades em Guarulhos, Zona Norte de SP, Zona Sul de SP,
Bragança Paulista e Alphaville/Barueri).

Automatiza **todo o trabalho operacional que antecede uma negociação** —
pesquisar, qualificar, personalizar, contatar, nutrir e acompanhar. O
fechamento continua humano (do CEO).

## Regras inegociáveis do projeto

1. **Nada de dado de paciente, em nenhum ponto.** O sistema é 100% de
   prospecção **comercial**: o alvo são os decisores que trazem pacientes (RH,
   credenciamento, direção escolar, liderança de igreja, médicos, diretoria de
   sindicato, secretaria de saúde de prefeitura) — nunca cadastro/controle de
   pacientes.
2. **Nenhuma mensagem sai sozinha.** A IA só **prepara** o rascunho; um humano
   aprova com um clique final.
3. **Baixo custo.** Só Apollo e Anthropic (Claude) são pagos. E-mail via SMTP
   próprio (Titan). Verificação de e-mail via ZeroBounce.

## Frentes de prospecção

Cada frente usa a **mesma máquina** (busca → qualificação → personalização →
rascunho → aprovação → follow-up), com a "tese" e os cargos-alvo adaptados:

| Frente | O que faz | Fonte dos contatos |
|---|---|---|
| **Operadoras** | Credenciamento (nova) e relacionamento (ativa: inclusões, extensões, reajuste) | Cadastro manual |
| **Reajustes** | Pedido formal de reajuste embasado na cláusula do contrato | A partir da operadora |
| **Empresas** | Saúde mental preventiva p/ colaboradores, com **custo zero** (via convênio faturado no credenciamento) — reduz afastamentos | Apollo (RH, saúde ocupacional, diretoria) |
| **Escolas** | Parceria clínica↔escola: leva profissionais ao colégio p/ avaliar alunos (dislexia, TDAH, TEA), apoiar a equipe e as famílias | Apollo (direção, coordenação, orientação) |
| **Médicos** | Rede de encaminhamento: a clínica como retaguarda multidisciplinar na região do médico | Apollo (médico, direção clínica) |
| **Igrejas** | Rede de apoio às famílias (indicação quando o acolhimento pastoral encontra caso clínico) | Apollo (liderança, ação social) |
| **Sindicatos** | Convênio para os associados (desconto e/ou repasse), no espírito de um credenciamento | Apollo (busca por **nome**, diretoria/convênios) |
| **Licitações** | Editais/credenciamentos públicos das prefeituras onde a clínica atua (TEA, reabilitação/PediaSuite, psicologia, saúde mental) | **PNCP** (automático, diário) |
| **Agenda Aberta** | Informativo recorrente (a cada 15 dias) às operadoras parceiras | Cadastro manual |

## O "cérebro" — como funciona

- **Prospecção (Apollo)** — busca organizações por setor/localização (ou por
  nome, no caso de sindicatos), e os **decisores** de cada uma. O e-mail só é
  **revelado** (1 crédito) no clique de **"Abordar"**.
- **Qualificação (`qualify.ts`)** — score 0–100 + prioridade 1–5 por regras,
  com peso forte para **proximidade das unidades** (proximidade = mais
  paciente). Determinístico, barato e explicável.
- **Personalização (`personalize.ts`)** — monta o "por que ESTA organização
  conversaria conosco" de forma determinística (segmento + unidade próxima +
  sinais do lead), usado como fio condutor do rascunho.
- **Rascunho (`anthropic.ts`, Claude)** — escreve e-mail/WhatsApp com a tese do
  segmento. Nunca inclui assinatura/serviços (o sistema injeta).
- **Validação de e-mail (ZeroBounce)** — só "valid" é disparável; e-mails que
  deram bounce/descadastro entram numa **lista de bloqueio** (supressão).
- **Motor de follow-up** — cadência por segmento (empresa/operadora 3 dias,
  escola 4, médico/sindicato 5, igreja 7). Ao chegar resposta, a IA classifica
  a **intenção** e recomenda a próxima ação com nível de **governança
  (N1/N2/N3)**: positiva → chama o CEO; negativa → pausa e retoma em 30 dias;
  sem resposta → segue cutucando. Roda sozinho via cron diário.

## Telas

Prospecção: **Empresas · Médicos · Escolas · Igrejas · Sindicatos** ·
**Operadoras · Reajustes · Agenda Aberta**. Gestão: **Dashboard** (o que
precisa de você), **Funil** (conversão por etapa), **Pipeline** (Kanban por
segmento), **Territórios** (leads por unidade), **Tarefas**,
**Encaminhamentos** (quais parceiros indicam), **Licitações** e **Rascunhos**
(aprovação e disparo).

## Stack e integrações

- **Next.js 15** (App Router) + **TypeScript** + **Tailwind**, deploy na
  **Vercel**.
- **Supabase** (Postgres + Storage) — banco e anexos.
- **Apollo.io** (REST) — descoberta de organizações e decisores.
- **Anthropic** (`claude-opus-4-8`) — geração de rascunhos, réplicas e
  classificação de respostas.
- **SMTP (Titan)** — envio dos e-mails (no clique do CEO). **IMAP** — leitura
  das respostas e captura de bounces.
- **ZeroBounce** — verificação de e-mail.
- **PNCP** (Portal Nacional de Contratações Públicas) — API pública oficial de
  licitações (sem chave).

## Setup

### 1. Dependências

```bash
npm install
```

### 2. Banco (Supabase)

No **SQL Editor** do Supabase, rode as migrações em ordem:
`supabase/migrations/0001_init.sql` … `0021_licitacoes.sql`.

> As migrações que fazem `ALTER TYPE ... ADD VALUE` (0006, 0007, 0016, 0020)
> precisam rodar **isoladas** (fora de transação).

### 3. Variáveis de ambiente

```bash
cp .env.example .env.local
```

| Variável | Para quê |
|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` / `NEXT_PUBLIC_SUPABASE_ANON_KEY` / `SUPABASE_SERVICE_ROLE_KEY` | Supabase → Settings → API |
| `ANTHROPIC_API_KEY` / `ANTHROPIC_MODEL` | IA (Claude). Modelo padrão `claude-opus-4-8` |
| `APOLLO_API_KEY` | Apollo (plano **Basic**) |
| `SMTP_HOST` / `SMTP_PORT` / `SMTP_USER` / `SMTP_PASSWORD` / `SMTP_FROM_NAME` | Envio de e-mail (Titan) |
| `IMAP_HOST` / `IMAP_PORT` | Leitura de respostas/bounces (usa `SMTP_USER`/`SMTP_PASSWORD`) |
| `EMAIL_VERIFIER_PROVIDER` / `EMAIL_VERIFIER_API_KEY` | ZeroBounce |
| `EMAIL_DAILY_CAP` | Teto de envios/24h (proteção da reputação; padrão 50) |
| `APP_USER` / `APP_PASSWORD` | Login do painel |
| `CRON_SECRET` | (Opcional) protege os endpoints de cron |

### 4. Rodar

```bash
npm run dev   # http://localhost:3000
```

## Automação (Vercel Cron)

`vercel.json` agenda dois jobs diários:

- `/api/followup/run` (12h UTC) — lê respostas, reativa sequências e prepara os
  próximos follow-ups.
- `/api/licitacoes/monitor` (8h UTC / ~5h BRT) — vasculha o PNCP das 4
  prefeituras e salva os editais novos no perfil da clínica (roda de madrugada,
  sozinho, para respeitar o rate limit do PNCP).

> Plano **Hobby** da Vercel permite 2 crons diários — exatamente os dois acima.

## Estrutura

```
src/
├── app/
│   ├── page.tsx                # Dashboard
│   ├── funil / pipeline / territorio / tarefas / encaminhamentos
│   ├── prospeccao / medicos / escolas / igrejas / sindicatos
│   ├── operadoras / reajustes / agenda / licitacoes / rascunhos
│   └── api/                    # rotas de servidor (prospect, drafts, responses,
│       │                       #   companies, sequences, tasks, referrals,
│       │                       #   territory, funnel, licitacoes, followup…)
├── lib/
│   ├── apollo.ts               # busca de organizações e decisores
│   ├── qualify.ts / scoring.ts # qualificação e lead scoring
│   ├── personalize.ts          # ângulo de personalização
│   ├── anthropic.ts            # geração de rascunhos/réplicas (IA)
│   ├── outreach.ts / followup.ts / inbox.ts   # motor de follow-up
│   ├── pipelines.ts / nextAction.ts / governance.ts
│   ├── units.ts / prefeituras.ts   # geografia (unidades e prefeituras)
│   ├── pncp.ts                 # cliente da API de licitações (PNCP)
│   ├── emailVerify.ts / suppression.ts / email.ts
│   └── types.ts, branding.ts, supabase/server.ts
├── components/Nav.tsx
supabase/migrations/0001…0021   # schema do banco
docs/GOVERNANCA.md, docs/LGPD.md
```

## Governança e LGPD

Ações são classificadas em **N1** (a IA pode preparar sozinha), **N2** (prepara,
mas exige aprovação) e **N3** (sempre humana). Ver `docs/GOVERNANCA.md`. O
sistema **não coleta nem armazena dados de paciente** — ver `docs/LGPD.md`.
