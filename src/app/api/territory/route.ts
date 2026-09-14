import { NextResponse } from "next/server";
import { getServerSupabase } from "@/lib/supabase/server";
import { UNITS, unitsForBrand } from "@/lib/units";
import { brandFromRequest } from "@/lib/brands";

export const maxDuration = 60;

// Normaliza para casar cidades com/sem acento ("Bragança" ≈ "Braganca").
function norm(s: string | null | undefined): string {
  return (s ?? "")
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .trim();
}

// A qual unidade (dentre as unidades informadas) um lead pertence. Fase 4.2.
function unitOf(
  city: string | null,
  unitCitySet: { unit: (typeof UNITS)[number]; cities: Set<string> }[],
): string | null {
  const c = norm(city);
  if (!c) return null;
  for (const { unit, cities } of unitCitySet) {
    if (cities.has(c)) return unit.id;
  }
  return null;
}

// GET /api/territory — agrega os leads por UNIDADE e por SEGMENTO, para o mapa
// de expansão ("Alphaville: 37 empresas · 14 operadoras · 63 médicos…"). Só da
// marca ativa (mostra apenas as unidades e os leads daquela marca).
export async function GET(req: Request) {
  const brand = brandFromRequest(req);
  const unidadesMarca = unitsForBrand(brand);
  const unitCitySet = unidadesMarca.map((u) => ({
    unit: u,
    cities: new Set(u.cities.map(norm)),
  }));

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
    .eq("brand", brand)
    .limit(5000);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  type Bucket = {
    total: number;
    parcerias: number;
    porCategoria: Record<string, number>;
  };
  const empty = (): Bucket => ({ total: 0, parcerias: 0, porCategoria: {} });

  const buckets: Record<string, Bucket> = {};
  for (const u of unidadesMarca) buckets[u.id] = empty();
  const foraDeArea = empty();

  for (const row of data ?? []) {
    const uid = unitOf(row.city, unitCitySet);
    const b = uid ? buckets[uid] : foraDeArea;
    b.total++;
    if (row.status === "parceria_ativa") b.parcerias++;
    b.porCategoria[row.category] = (b.porCategoria[row.category] ?? 0) + 1;
  }

  const unidades = unidadesMarca.map((u) => ({
    id: u.id,
    name: u.name,
    cities: u.cities,
    ...buckets[u.id],
  }));

  return NextResponse.json({ unidades, foraDeArea });
}
