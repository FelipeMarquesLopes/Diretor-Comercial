import { cookies } from "next/headers";
import type { User } from "@supabase/supabase-js";
import { getServerSupabase } from "@/lib/supabase/server";
import type { MemberRole, MembershipWithOrg } from "@/lib/types";

// Sessão e contexto de organização.
//
// A pessoa pode pertencer a várias organizações; a "atual" fica num cookie.
// Se o cookie apontar para uma organização da qual ela não é mais membro (ou
// se não houver cookie), caímos na primeira da lista — nunca num estado sem
// organização quando existe pelo menos uma.

export const ORG_COOKIE = "mf_org";

/** Usuário logado, ou null. */
export async function getCurrentUser(): Promise<User | null> {
  const supabase = await getServerSupabase();
  // getUser() valida o token no servidor do Supabase. Diferente de
  // getSession(), que confia no cookie — por isso não usamos aquele aqui.
  const { data } = await supabase.auth.getUser();
  return data.user ?? null;
}

/** Organizações da pessoa logada, com o papel dela em cada uma. */
export async function getMemberships(): Promise<MembershipWithOrg[]> {
  const supabase = await getServerSupabase();

  const { data, error } = await supabase
    .from("memberships")
    .select("id, org_id, user_id, role, created_at, organization:organizations(*)")
    .order("created_at", { ascending: true });

  if (error) throw new Error(`Falha ao carregar organizações: ${error.message}`);

  // O PostgREST devolve o relacionamento como objeto; o tipo gerado pelo
  // supabase-js não sabe disso, daí o cast.
  return (data ?? []) as unknown as MembershipWithOrg[];
}

export type OrgContext = {
  memberships: MembershipWithOrg[];
  current: MembershipWithOrg | null;
  role: MemberRole | null;
  isAdmin: boolean;
};

/** Organização atual (cookie) + a lista completa, para o seletor da barra. */
export async function getOrgContext(): Promise<OrgContext> {
  const memberships = await getMemberships();
  const cookieStore = await cookies();
  const wanted = cookieStore.get(ORG_COOKIE)?.value;

  const current =
    memberships.find((m) => m.org_id === wanted) ?? memberships[0] ?? null;

  const role = current?.role ?? null;

  return {
    memberships,
    current,
    role,
    isAdmin: role === "owner" || role === "admin",
  };
}
