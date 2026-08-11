"use client";

import { ProspeccaoView } from "@/components/ProspeccaoView";

// Frente "Igrejas" (rede de apoio às famílias): mesma máquina de prospecção,
// no modo igreja — parceria institucional com a liderança para indicar a
// clínica em situações que vão além do acolhimento pastoral.
export default function Igrejas() {
  return <ProspeccaoView mode="igreja" />;
}
