// Fase 4.1 — Unidades como pontos de expansão (inteligência territorial).
//
// Cada unidade MenthalHelp/Therapy Minds é um ponto de captação: prospectar
// PERTO dela traz leads que geram paciente com mais facilidade (proximidade =
// ouro, como no lead scoring). Definimos as unidades em CÓDIGO (mudam
// raríssimo, como MENTHAL_UNITS/PIPELINES) com a REGIÃO de captação — os
// municípios vizinhos que o Apollo consegue filtrar por localização.
//
// Uso: o seletor "buscar perto da unidade" pré-preenche estado + cidades da
// busca. Nada de dado de paciente — é geografia comercial.

export interface Unit {
  id: string;
  name: string; // como aparece no seletor
  estado: string; // UF para o filtro do Apollo
  // Municípios de captação (o Apollo filtra por cidade; bairros de SP não são
  // distinguíveis, então a Grande SP entra por municípios vizinhos).
  cities: string[];
}

export const UNITS: Unit[] = [
  {
    id: "guarulhos",
    name: "MenthalHelp — Guarulhos",
    estado: "Sao Paulo",
    cities: ["Guarulhos", "Aruja", "Santa Isabel"],
  },
  {
    id: "zona-norte",
    name: "MenthalHelp — Zona Norte SP (Tucuruvi)",
    estado: "Sao Paulo",
    cities: ["Sao Paulo", "Guarulhos", "Caieiras", "Mairipora"],
  },
  {
    id: "zona-sul",
    name: "MenthalHelp — Zona Sul SP (Interlagos)",
    estado: "Sao Paulo",
    cities: ["Sao Paulo", "Diadema", "Sao Bernardo do Campo", "Taboao da Serra"],
  },
  {
    id: "braganca",
    name: "MenthalHelp — Bragança Paulista",
    estado: "Sao Paulo",
    cities: ["Braganca Paulista", "Atibaia", "Itatiba", "Jarinu"],
  },
  {
    id: "alphaville",
    name: "MenthalHelp — Barueri (Alphaville)",
    estado: "Sao Paulo",
    cities: ["Barueri", "Osasco", "Santana de Parnaiba", "Carapicuiba", "Jandira"],
  },
];

export function findUnit(id: string | null | undefined): Unit | null {
  if (!id) return null;
  return UNITS.find((u) => u.id === id) ?? null;
}
