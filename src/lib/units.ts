// Fase 4.1 / 4.3-lite — Unidades como pontos de expansão (raio de captação).
//
// Cada unidade MenthalHelp/Therapy Minds é um ponto de captação: prospectar
// PERTO dela traz leads que geram paciente com mais facilidade (proximidade =
// ouro). O CEO quer buscar num RAIO DE ~20 km da unidade (ideal para médicos
// encaminhadores e clínicas parceiras da vizinhança).
//
// LIMITAÇÃO HONESTA: o Apollo filtra por MUNICÍPIO, não por coordenada/raio em
// km. Então aproximamos o "raio de 20 km" pela lista de MUNICÍPIOS cujo centro
// cai dentro de ~20 km da unidade — cobre o objetivo sem API de geocoding paga.
// Um círculo exato ("a 2,3 km do endereço") exigiria geocoding (Fase 4.3).
//
// Definidas em CÓDIGO (mudam raríssimo, como MENTHAL_UNITS/PIPELINES). Nada de
// dado de paciente — é geografia comercial.

export interface Unit {
  id: string;
  name: string; // como aparece no seletor
  estado: string; // UF para o filtro do Apollo
  radiusKm: number; // raio de captação pretendido (aprox. via municípios)
  // Municípios dentro de ~radiusKm da unidade (o Apollo filtra por cidade).
  cities: string[];
}

// Raio de captação padrão pedido pelo CEO.
export const DEFAULT_RADIUS_KM = 20;

export const UNITS: Unit[] = [
  {
    id: "guarulhos",
    name: "MenthalHelp — Guarulhos",
    estado: "Sao Paulo",
    radiusKm: 20,
    cities: [
      "Guarulhos",
      "Sao Paulo",
      "Aruja",
      "Itaquaquecetuba",
      "Santa Isabel",
      "Ferraz de Vasconcelos",
      "Poa",
      "Mairipora",
    ],
  },
  {
    id: "zona-norte",
    name: "MenthalHelp — Zona Norte SP (Tucuruvi)",
    estado: "Sao Paulo",
    radiusKm: 20,
    cities: [
      "Sao Paulo",
      "Guarulhos",
      "Caieiras",
      "Mairipora",
      "Franco da Rocha",
      "Osasco",
    ],
  },
  {
    id: "zona-sul",
    name: "MenthalHelp — Zona Sul SP (Interlagos)",
    estado: "Sao Paulo",
    radiusKm: 20,
    cities: [
      "Sao Paulo",
      "Diadema",
      "Sao Bernardo do Campo",
      "Santo Andre",
      "Sao Caetano do Sul",
      "Taboao da Serra",
      "Embu das Artes",
    ],
  },
  {
    id: "braganca",
    name: "MenthalHelp — Bragança Paulista",
    estado: "Sao Paulo",
    radiusKm: 20,
    cities: [
      "Braganca Paulista",
      "Atibaia",
      "Itatiba",
      "Jarinu",
      "Vargem",
      "Pinhalzinho",
      "Nazare Paulista",
      "Bom Jesus dos Perdoes",
    ],
  },
  {
    id: "alphaville",
    name: "MenthalHelp — Barueri (Alphaville)",
    estado: "Sao Paulo",
    radiusKm: 20,
    cities: [
      "Barueri",
      "Osasco",
      "Santana de Parnaiba",
      "Carapicuiba",
      "Jandira",
      "Itapevi",
      "Cotia",
      "Pirapora do Bom Jesus",
    ],
  },
];

export function findUnit(id: string | null | undefined): Unit | null {
  if (!id) return null;
  return UNITS.find((u) => u.id === id) ?? null;
}
