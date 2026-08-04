"use client";

import { ProspeccaoView } from "@/components/ProspeccaoView";

// Frente "Médicos" (iscas de marketing): mesma máquina de prospecção do Apollo,
// no modo médico — consultórios/médicos prescritores para rede de encaminhamento.
export default function Medicos() {
  return <ProspeccaoView mode="medico" />;
}
