import { NextResponse } from "next/server";
import { getServerSupabase } from "@/lib/supabase/server";

// GET /api/referrals — parceiros que são (ou podem ser) FONTE DE
// ENCAMINHAMENTO: parcerias ativas + qualquer um já marcado como fonte.
// Ordenado por quantidade de indicações (as que "valem ouro" no topo).
// Fase 5 — agregado, sem PII.
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
    .select(
      "id, name, category, city, state, status, is_referral_source, referral_count",
    )
    .or("is_referral_source.eq.true,status.eq.parceria_ativa")
    .order("referral_count", { ascending: false })
    .order("name", { ascending: true })
    .limit(300);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const rows = data ?? [];
  const total = rows.reduce((s, r) => s + (r.referral_count ?? 0), 0);
  return NextResponse.json({ partners: rows, totalEncaminhamentos: total });
}
