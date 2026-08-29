import { NextResponse } from "next/server";
import { getServerSupabase } from "@/lib/supabase/server";
import { unsuppressEmail } from "@/lib/suppression";

// POST /api/suppression/unblock  { email }
// Remove um e-mail da lista de bloqueio (decisão consciente do CEO). Se voltar
// a dar bounce, a captura por IMAP o re-suprime automaticamente.
export async function POST(req: Request) {
  let body: { email?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Body inválido" }, { status: 400 });
  }
  const email = (body.email ?? "").trim();
  if (!email.includes("@")) {
    return NextResponse.json({ error: "E-mail inválido" }, { status: 400 });
  }

  let supabase: ReturnType<typeof getServerSupabase>;
  try {
    supabase = getServerSupabase();
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Configuração ausente" },
      { status: 500 },
    );
  }

  await unsuppressEmail(supabase, email);
  return NextResponse.json({ ok: true, email });
}
