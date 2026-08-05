"use client";

import { ProspeccaoView } from "@/components/ProspeccaoView";

// Frente "Escolas": mesma máquina de prospecção do Apollo, no modo escola —
// colégios particulares para parceria clínica ↔ escola. Busca TODO o time
// administrativo (coordenação, direção, orientação, secretaria).
export default function Escolas() {
  return <ProspeccaoView mode="escola" />;
}
