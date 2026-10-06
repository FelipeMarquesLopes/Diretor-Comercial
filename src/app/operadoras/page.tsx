"use client";

import { OperadoraWorkspace, OPERADORA_CFG } from "@/components/OperadoraWorkspace";

// Operadoras: a máquina de prospecção (cadastro nova/ativa, briefing, busca de
// contatos de credenciamento no Apollo, gerar rascunho, registrar resposta) +
// a descoberta de operadoras novas na ANS (Grande SP).
export default function Operadoras() {
  return <OperadoraWorkspace cfg={OPERADORA_CFG} />;
}
