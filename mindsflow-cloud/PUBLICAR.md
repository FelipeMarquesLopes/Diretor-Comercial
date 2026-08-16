# Como publicar esta pasta como repositório próprio

Este projeto foi versionado dentro do repositório `Diretor-Comercial`
(branch `claude/mindsflow-cloud-repo-01h60v`, pasta `mindsflow-cloud/`)
porque o acesso automatizado ao GitHub nesta sessão está limitado àquele
repositório — não foi possível criar `mindsflow-cloud` pela API.

Publicar leva dois minutos. Escolha **um** dos caminhos.

## Caminho A — pelo navegador + terminal (recomendado)

1. Crie o repositório vazio em <https://github.com/new>:
   - **Nome:** `mindsflow-cloud`
   - **Visibilidade:** Private
   - **Não** marque "Add a README", "Add .gitignore" nem licença — o
     repositório precisa nascer vazio.

2. No seu computador:

```bash
# 1. Baixa só a pasta do projeto
git clone --branch claude/mindsflow-cloud-repo-01h60v --depth 1 \
  https://github.com/FelipeMarquesLopes/Diretor-Comercial.git /tmp/dc-mindsflow

# 2. Leva a pasta para onde você guarda seus projetos
mv /tmp/dc-mindsflow/mindsflow-cloud ~/mindsflow-cloud
rm -rf /tmp/dc-mindsflow
cd ~/mindsflow-cloud

# 3. Começa o histórico do repositório novo
git init
git add .
git commit -m "Base da nuvem MindsFlow: auth, organizações, equipe e auditoria"
git branch -M main
git remote add origin https://github.com/FelipeMarquesLopes/mindsflow-cloud.git
git push -u origin main
```

3. Siga o [README](README.md) a partir do passo 1 (`npm install`).

## Caminho B — dar acesso e deixar o Claude publicar

Se preferir que eu faça, libere o repositório novo para o Claude em
<https://claude.ai/admin-settings/claude-in-slack> (ou crie o repositório
vazio e me avise) — a partir daí eu envio o código direto.

## Depois de publicar

- Importe o repositório na **Vercel** e configure as variáveis do
  `.env.example`.
- No Supabase, rode `supabase/migrations/0001_init.sql` e adicione a URL de
  callback (README, passo 4).
- Pode apagar a pasta `mindsflow-cloud/` do repositório `Diretor-Comercial`
  para não manter dois lugares com o mesmo código.
