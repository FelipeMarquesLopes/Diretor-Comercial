# Governança da automação — Growth AI

Política que define **o que a IA faz sozinha, o que ela prepara para aprovação e
o que é sempre 100% humano**. É a base de confiança para escalar a automação sem
perder o controle comercial.

Fonte da verdade em código: `src/lib/governance.ts` (a UI lê deste registro).

## Princípio de escopo (inviolável)

Este é um sistema **comercial de prospecção de parcerias**. O foco é **encontrar e
abordar decisores que trazem pacientes** — RH e saúde ocupacional em empresas,
credenciamento/rede em operadoras/seguradoras/autogestões, direção e coordenação
em escolas, liderança em igrejas, médicos encaminhadores.

**Nunca** trata dado, cadastro ou controle de paciente. Não há prontuário,
faturamento clínico nem PII de paciente em nenhum ponto. Toda evolução respeita
isso — se um dia medirmos encaminhamento por parceiro, será de forma **agregada,
sem identificar pacientes**.

## Os três níveis de autonomia

### Nível 1 — a IA executa automaticamente
Tarefas de apoio, sem risco comercial.
- Descobrir e enriquecer leads (Apollo)
- Validar e-mails (ZeroBounce)
- Qualificar e pontuar leads (scoring)
- Ler e classificar as respostas recebidas
- Agendar follow-up e reativação
- Bloquear retorno (bounce) e descadastro
- Criar tarefas para o comercial

### Nível 2 — a IA prepara, o humano aprova
Tudo que **fala com o parceiro**. A IA escreve; **nada sai sem o clique do CEO**.
- Escrever a abordagem inicial
- Escrever a réplica a uma resposta
- Escrever a mensagem de cobrança (follow-up)
- Disparar qualquer e-mail
- Anexar e enviar documentos

### Nível 3 — sempre 100% humano
Decisões comerciais e jurídicas. A IA **não toca**.
- Negociação financeira e de condições
- Aceite de proposta
- Contrato e questões jurídicas
- Compromissos comerciais formais

## Regra de segurança
Na dúvida sobre o nível de uma ação nova, ela nasce no **Nível 2 ou 3** (mais
conservador). Só sobe para o Nível 1 quando ficar claro que é apoio sem risco.
