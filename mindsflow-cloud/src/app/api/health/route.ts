import { NextResponse } from "next/server";
import { getServerSupabase } from "@/lib/supabase/server";

// Sonda de saúde: responde se o app está de pé e se o banco responde.
// Útil para monitoramento externo e para conferir um deploy novo.

export const dynamic = "force-dynamic";

export async function GET() {
  const checagens: Record<string, string> = { app: "ok" };
  let status = 200;

  try {
    const supabase = await getServerSupabase();
    const { error } = await supabase
      .from("organizations")
      .select("id", { count: "exact", head: true });

    // Um erro de permissão significa que o banco respondeu — é o RLS
    // funcionando com uma requisição sem sessão. Isso é "ok".
    checagens.banco = error && error.code !== "42501" ? `erro: ${error.message}` : "ok";
  } catch (e) {
    checagens.banco = e instanceof Error ? `erro: ${e.message}` : "erro";
  }

  if (Object.values(checagens).some((v) => v.startsWith("erro"))) status = 503;

  return NextResponse.json({ status: status === 200 ? "ok" : "degradado", checagens }, { status });
}
