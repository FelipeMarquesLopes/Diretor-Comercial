# LGPD — Growth AI (prospecção comercial B2B)

Este sistema é **exclusivamente comercial**. Não trata dado clínico, de paciente
nem dado sensível de saúde. Os dados pessoais tratados são de **contato
profissional B2B** (nome, e-mail corporativo, cargo, telefone comercial) de
decisores em operadoras, empresas, escolas e clínicas — obtidos de fontes
profissionais (Apollo) para fins de prospecção comercial.

## Base legal
**Legítimo interesse** (LGPD, art. 7º, IX / art. 10) para contato comercial B2B,
com salvaguardas: finalidade específica (oferta de parceria/serviço), dado
mínimo necessário, e via de oposição simples (opt-out).

## Salvaguardas implementadas
- **Opt-out em todo e-mail:** rodapé automático convidando a responder "SAIR".
- **Descadastro automático:** respostas pedindo para sair são detectadas pelo
  leitor de caixa e o e-mail vai para a lista de supressão (`suppressed_emails`,
  `reason = 'unsubscribe'`) — nunca mais recebe disparo.
- **Supressão de retornos (bounce):** e-mails que voltam são bloqueados
  automaticamente (`reason = 'bounce'`).
- **Bloqueio no envio:** antes de todo disparo, o destinatário (e o CC) é
  checado contra a lista de supressão.
- **Consentimento humano:** nenhum e-mail sai sem aprovação do responsável.

## A revisar (quando escalar)
- **Retenção/minimização:** definir prazo para descartar contatos que nunca
  responderam (ex.: 12–24 meses) e rotina de limpeza.
- **Registro de tratamento:** manter este documento atualizado como registro
  das operações (art. 37).
- **Requisições do titular:** procedimento para acesso/correção/eliminação
  quando solicitado por um contato.
- **Encarregado (DPO):** designar responsável de contato para questões de dados.

> Este documento é um registro operacional, não parecer jurídico. Para volume
> alto ou dúvidas específicas, validar com assessoria jurídica.
