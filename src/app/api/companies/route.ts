import { NextResponse } from "next/server";
import { getServerSupabase } from "@/lib/supabase/server";

// GET /api/companies?status=qualificado
// Lista empresas, opcionalmente filtrando por status. Inclui contatos.
export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const status = searchParams.get("status");
  const category = searchParams.get("category");

  let supabase: ReturnType<typeof getServerSupabase>;
  try {
    supabase = getServerSupabase();
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Configuração ausente" },
      { status: 500 },
    );
  }
  let query = supabase
    .from("companies")
    .select("*, contacts(*)")
    .order("priority", { ascending: false })
    .order("qualification_score", { ascending: false })
    .limit(200);

  if (status) query = query.eq("status", status);
  if (category) query = query.eq("category", category);

  const { data, error } = await query;
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  return NextResponse.json({ companies: data ?? [] });
}
