"use client";

import {
  OperadoraWorkspace,
  OPERADORA_CAPTACAO_CFG,
} from "@/components/OperadoraWorkspace";

// Operadoras CAPTAÇÃO: operadoras que queremos credenciar (em prospecção) +
// a descoberta de operadoras novas na ANS (Grande SP).
export default function OperadorasCaptacao() {
  return <OperadoraWorkspace cfg={OPERADORA_CAPTACAO_CFG} />;
}
