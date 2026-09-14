import { NextResponse } from "next/server";
import { getServerSupabase } from "@/lib/supabase/server";
import { createTask } from "@/lib/tasks";
import { brandFromRequest } from "@/lib/brands";

// GET /api/tasks?status=aberta — lista tarefas com o nome do parceiro, só da
// marca ativa. Tarefas SEM parceiro (company_id nulo) aparecem em qualquer
// marca (são gerais do CEO).
export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const status = searchParams.get("status") ?? "aberta";
  const brand = brandFromRequest(req);

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
    .from("tasks")
    .select("*, companies(name, category, brand)")
    .order("due_date", { ascending: true, nullsFirst: false })
    .order("created_at", { ascending: false })
    .limit(400);
  if (status !== "todas") query = query.eq("status", status);

  const { data, error } = await query;
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  // Tarefas da marca ativa + as gerais (sem parceiro vinculado).
  const tasks = (data ?? []).filter((t) => {
    const b = (t.companies as { brand?: string } | null)?.brand;
    return !b || b === brand;
  });
  return NextResponse.json({ tasks });
}

// POST /api/tasks — cria uma tarefa manual (do CEO).
// Body: { title, detail?, companyId?, level?, dueDate? }
export async function POST(req: Request) {
  let body: {
    title?: string;
    detail?: string;
    companyId?: string;
    level?: number;
    dueDate?: string;
    createdBy?: string;
  };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Body inválido" }, { status: 400 });
  }
  if (!body.title?.trim()) {
    return NextResponse.json({ error: "Título é obrigatório" }, { status: 400 });
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

  const r = await createTask(supabase, {
    title: body.title,
    detail: body.detail ?? null,
    companyId: body.companyId ?? null,
    level: body.level ?? 1,
    dueDate: body.dueDate ?? null,
    createdBy: body.createdBy ?? "ceo",
  });
  if (!r.ok) return NextResponse.json({ error: r.error }, { status: 500 });
  return NextResponse.json({ ok: true, id: r.id });
}
