"use client";

import {
  OperadoraWorkspace,
  OPERADORA_ATIVA_CFG,
} from "@/components/OperadoraWorkspace";

// Operadoras ATIVAS: operadoras em que JÁ somos credenciados — relacionamento
// (extensão de procedimentos, reajuste, inclusão de endereços/unidades).
export default function OperadorasAtivas() {
  return <OperadoraWorkspace cfg={OPERADORA_ATIVA_CFG} />;
}
