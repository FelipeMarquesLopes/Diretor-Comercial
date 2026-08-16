import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";

// A raiz não tem conteúdo próprio: manda para o painel (se logado) ou para o
// login. Quando existir uma página de vendas/marketing, ela entra aqui.

export default async function Home() {
  const user = await getCurrentUser();
  redirect(user ? "/dashboard" : "/login");
}
