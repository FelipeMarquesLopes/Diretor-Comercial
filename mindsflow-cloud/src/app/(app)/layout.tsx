import { redirect } from "next/navigation";
import { Nav } from "@/components/Nav";
import { OrgSwitcher } from "@/components/OrgSwitcher";
import { getCurrentUser, getOrgContext } from "@/lib/auth";
import { trocarOrganizacao } from "./actions";

// Shell das áreas internas: cabeçalho da marca, seletor de organização e
// menu. O middleware já barra quem não está logado; o redirect aqui é o
// cinto de segurança para o caso de a rota escapar do matcher.

export default async function AppLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const user = await getCurrentUser();
  if (!user) redirect("/login");

  const { memberships, current } = await getOrgContext();

  return (
    <div className="mx-auto max-w-6xl px-4 py-6 sm:py-8">
      <header className="overflow-hidden rounded-2xl border border-brand-100 bg-white shadow-card">
        <div className="brand-flow h-1.5 w-full" />
        <div className="flex flex-col gap-4 px-5 py-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <p className="brand-wordmark text-lg font-bold tracking-tight">
              MindsFlow
            </p>
            <p className="text-[11px] font-medium uppercase tracking-[0.18em] text-brand-400">
              Nuvem
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-3">
            {memberships.length > 1 ? (
              <OrgSwitcher
                memberships={memberships}
                currentId={current?.org_id ?? ""}
                action={trocarOrganizacao}
              />
            ) : null}

            <span className="hidden text-xs text-brand-400 sm:inline">
              {user.email}
            </span>

            <form action="/auth/signout" method="post">
              <button type="submit" className="btn-ghost">
                Sair
              </button>
            </form>
          </div>
        </div>
      </header>

      <div className="mt-5">
        <Nav />
      </div>

      <main className="mt-6">{children}</main>
    </div>
  );
}
