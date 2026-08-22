"use client";

import { ProspeccaoView } from "@/components/ProspeccaoView";

// Frente "Sindicatos": mesma máquina de prospecção, no modo sindicato — um
// sindicato agrega milhares de associados, então uma parceria (convênio com
// desconto e/ou repasse) vale por centenas de leads. Falamos com a diretoria e
// o setor de convênios/benefícios. Nunca há dado de paciente — o parceiro é a
// entidade sindical.
export default function Sindicatos() {
  return <ProspeccaoView mode="sindicato" />;
}
