"use client";

import { OperadoraWorkspace, SINDICATO_CFG } from "@/components/OperadoraWorkspace";

// Frente "Sindicatos": a parceria com um sindicato é do mesmo tipo de uma
// operadora (credenciamento/convênio) — então usa a MESMA máquina de prospecção
// das operadoras (cadastro nova/ativa, briefing, busca de contatos no Apollo,
// gerar rascunho, registrar resposta), no modo sindicato. Falamos com a
// diretoria e o setor de convênios/benefícios. Nunca há dado de paciente — o
// parceiro é a entidade sindical.
export default function Sindicatos() {
  return <OperadoraWorkspace cfg={SINDICATO_CFG} />;
}
