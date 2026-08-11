import { NextResponse } from "next/server";
import { getServerSupabase } from "@/lib/supabase/server";
import { UNITS } from "@/lib/units";

export const maxDuration = 60;

// Normaliza para casar cidades com/sem acento ("Bragança" ≈ "Braganca").
function norm(s: string | null | undefined): string {
  return (s ?? "")
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .trim();
}

// Cidades de cada unidade, já normalizadas.
const UNIT_CITY_SET = UNITS.map((u) => ({
  unit: u,
  cities: new Set(u.cities.map(norm)),
}));

// A qual unidade um lead pertence (primeira que casa a cidade). Fase 4.2.
function unitOf(city: string | null): string | null {
  const c = norm(city);
  if (!c) return null;
  for (const { unit, cities } of UNIT_CITY_SET) {
    if (cities.has(c)) return unit.id;
  }
  return null;
}

// GET /api/territory — agrega os leads por UNIDADE e por SEGMENTO, para o mapa
// de expansão ("Alphaville: 37 empresas · 14 operadoras · 63 médicos…").
export async function GET() {
  let supabase: ReturnType<typeof getServerSupabase>;
  try {
    supabase = getServerSupabase();
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Configuração ausente" },
      { status: 500 },
    );
  }

  const { data, error } = await supabase
    .from("companies")
    .select("category, city, status")
    .limit(5000);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  type Bucket = {
    total: number;
    parcerias: number;
    porCategoria: Record<string, number>;
  };
  const empty = (): Bucket => ({ total: 0, parcerias: 0, porCategoria: {} });

  const buckets: Record<string, Bucket> = {};
  for (const u of UNITS) buckets[u.id] = empty();
  const foraDeArea = empty();

  for (const row of data ?? []) {
    const uid = unitOf(row.city);
    const b = uid ? buckets[uid] : foraDeArea;
    b.total++;
    if (row.status === "parceria_ativa") b.parcerias++;
    b.porCategoria[row.category] = (b.porCategoria[row.category] ?? 0) + 1;
  }

  const unidades = UNITS.map((u) => ({
    id: u.id,
    name: u.name,
    cities: u.cities,
    ...buckets[u.id],
  }));

  return NextResponse.json({ unidades, foraDeArea });
}
