"use server";

import { cookies } from "next/headers";
import { revalidatePath } from "next/cache";
import { ORG_COOKIE, getMemberships } from "@/lib/auth";

/**
 * Troca a organização ativa. Só aceita organizações das quais a pessoa é
 * membro — o cookie vem do navegador e, portanto, não é confiável.
 */
export async function trocarOrganizacao(formData: FormData) {
  const orgId = String(formData.get("org_id") ?? "");
  const memberships = await getMemberships();

  if (!memberships.some((m) => m.org_id === orgId)) {
    throw new Error("Organização inválida.");
  }

  const cookieStore = await cookies();
  cookieStore.set(ORG_COOKIE, orgId, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 60 * 60 * 24 * 365,
  });

  revalidatePath("/", "layout");
}
