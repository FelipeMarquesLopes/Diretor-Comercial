"use client";

import { OperadorasAtivas } from "@/components/OperadorasAtivas";

// Operadoras ATIVAS: banco de cadastro das operadoras em que já somos
// credenciados. O relacionamento (copy + follow-up) começa só no botão
// "Iniciar relacionamento" de cada card.
export default function OperadorasAtivasPage() {
  return <OperadorasAtivas />;
}
