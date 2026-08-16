"use server";

import { cookies } from "next/headers";
import { revalidatePath } from "next/cache";
import { getServerSupabase } from "@/lib/supabase/server";
import { ORG_COOKIE, getOrgContext } from "@/lib/auth";
import type { MemberRole, Organization } from "@/lib/types";

// Ações da tela de organização.
//
// Nenhuma delas confia no que veio do formulário para decidir permissão: a
// autorização real está nas políticas de RLS do banco. O que fazemos aqui é
// dar mensagem de erro decente e evitar chamadas que o banco recusaria.

function slugify(texto: string): string {
  return texto
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "") // tira acentos
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 40);
}

function sufixo(): string {
  return Math.random().toString(36).slice(2, 6);
}

export async function criarOrganizacao(formData: FormData) {
  const nome = String(formData.get("nome") ?? "").trim();
  if (!nome) throw new Error("Informe o nome da organização.");

  const supabase = await getServerSupabase();
  const base = slugify(nome) || "org";

  // O slug é único. Se já existir um igual, tenta de novo com um sufixo
  // curto em vez de devolver um erro de banco na cara da pessoa.
  let criada: Organization | null = null;
  let ultimoErro = "";

  for (const slug of [base, `${base}-${sufixo()}`, `${base}-${sufixo()}`]) {
    const { data, error } = await supabase.rpc("create_organization", {
      p_name: nome,
      p_slug: slug,
    });

    if (!error) {
      criada = data as Organization;
      break;
    }
    ultimoErro = error.message;
    if (!error.message.includes("duplicate key")) break;
  }

  if (!criada) {
    throw new Error(`Não foi possível criar a organização: ${ultimoErro}`);
  }

  // Já entra na organização recém-criada.
  const cookieStore = await cookies();
  cookieStore.set(ORG_COOKIE, criada.id, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 60 * 60 * 24 * 365,
  });

  revalidatePath("/", "layout");
}

export async function convidarMembro(formData: FormData) {
  const email = String(formData.get("email") ?? "").trim().toLowerCase();
  const role = String(formData.get("role") ?? "member") as MemberRole;

  if (!email.includes("@")) throw new Error("Informe um e-mail válido.");
  if (!["owner", "admin", "member"].includes(role)) {
    throw new Error("Papel inválido.");
  }

  const { current } = await getOrgContext();
  if (!current) throw new Error("Nenhuma organização ativa.");

  const supabase = await getServerSupabase();
  const { data: user } = await supabase.auth.getUser();

  const { error } = await supabase.from("invites").insert({
    org_id: current.org_id,
    email,
    role,
    invited_by: user.user?.id ?? null,
  });

  if (error) throw new Error(`Não foi possível convidar: ${error.message}`);

  revalidatePath("/organizacao");
}

export async function revogarConvite(formData: FormData) {
  const id = String(formData.get("invite_id") ?? "");
  if (!id) throw new Error("Convite não informado.");

  const supabase = await getServerSupabase();
  const { error } = await supabase.from("invites").delete().eq("id", id);
  if (error) throw new Error(`Não foi possível revogar: ${error.message}`);

  revalidatePath("/organizacao");
}

export async function alterarPapel(formData: FormData) {
  const id = String(formData.get("membership_id") ?? "");
  const role = String(formData.get("role") ?? "") as MemberRole;

  if (!id) throw new Error("Vínculo não informado.");
  if (!["owner", "admin", "member"].includes(role)) {
    throw new Error("Papel inválido.");
  }

  const supabase = await getServerSupabase();

  // Uma organização sem dono fica órfã: ninguém consegue mais convidar nem
  // alterar nada. Por isso o último owner não pode ser rebaixado.
  if (role !== "owner") await garantirQueNaoEOUltimoDono(id);

  const { error } = await supabase
    .from("memberships")
    .update({ role })
    .eq("id", id);

  if (error) throw new Error(`Não foi possível alterar o papel: ${error.message}`);

  revalidatePath("/organizacao");
}

export async function removerMembro(formData: FormData) {
  const id = String(formData.get("membership_id") ?? "");
  if (!id) throw new Error("Vínculo não informado.");

  await garantirQueNaoEOUltimoDono(id);

  const supabase = await getServerSupabase();
  const { error } = await supabase.from("memberships").delete().eq("id", id);
  if (error) throw new Error(`Não foi possível remover: ${error.message}`);

  revalidatePath("/organizacao");
}

async function garantirQueNaoEOUltimoDono(membershipId: string) {
  const supabase = await getServerSupabase();

  const { data: alvo, error } = await supabase
    .from("memberships")
    .select("id, org_id, role")
    .eq("id", membershipId)
    .single();

  if (error || !alvo) throw new Error("Vínculo não encontrado.");
  if (alvo.role !== "owner") return;

  const { count } = await supabase
    .from("memberships")
    .select("id", { count: "exact", head: true })
    .eq("org_id", alvo.org_id)
    .eq("role", "owner");

  if ((count ?? 0) <= 1) {
    throw new Error(
      "Esta é a única pessoa dona da organização. Promova outra a dono antes.",
    );
  }
}
