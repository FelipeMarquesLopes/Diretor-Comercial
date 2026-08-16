import { Card } from "@/components/Card";
import { CopyLink } from "@/components/CopyLink";
import { getCurrentUser, getOrgContext } from "@/lib/auth";
import { getServerSupabase } from "@/lib/supabase/server";
import { ROLE_LABEL, type Invite, type MemberRole } from "@/lib/types";
import { siteUrl } from "@/lib/env";
import {
  alterarPapel,
  convidarMembro,
  criarOrganizacao,
  removerMembro,
  revogarConvite,
} from "./actions";

export const metadata = { title: "Organização — MindsFlow" };

type MembroNaTela = {
  id: string;
  user_id: string;
  role: MemberRole;
  created_at: string;
  profile: { email: string | null; full_name: string | null } | null;
};

export default async function OrganizacaoPage() {
  const { current, isAdmin } = await getOrgContext();
  const user = await getCurrentUser();

  if (!current) {
    return (
      <div className="mx-auto max-w-lg">
        <Card title="Crie sua primeira organização">
          <form action={criarOrganizacao} className="space-y-3">
            <input name="nome" required className="field" placeholder="Ex.: MindsFlow" />
            <button type="submit" className="btn-primary w-full">
              Criar organização
            </button>
          </form>
        </Card>
      </div>
    );
  }

  const supabase = await getServerSupabase();

  const { data: membros } = await supabase
    .from("memberships")
    .select("id, user_id, role, created_at, profile:profiles(email, full_name)")
    .eq("org_id", current.org_id)
    .order("created_at", { ascending: true });

  const { data: convites } = isAdmin
    ? await supabase
        .from("invites")
        .select("*")
        .eq("org_id", current.org_id)
        .is("accepted_at", null)
        .order("created_at", { ascending: false })
    : { data: [] as Invite[] };

  const lista = (membros ?? []) as unknown as MembroNaTela[];

  return (
    <div className="space-y-6">
      <Card
        title={current.organization?.name ?? "Organização"}
        hint={`Identificador: ${current.organization?.slug ?? "—"}`}
      >
        <p className="text-sm text-brand-600">
          Você é <strong>{ROLE_LABEL[current.role]}</strong> nesta organização.
        </p>
      </Card>

      <Card title="Equipe" hint={`${lista.length} pessoa(s)`}>
        <ul className="divide-y divide-brand-100">
          {lista.map((m) => {
            const souEu = m.user_id === user?.id;

            return (
              <li
                key={m.id}
                className="flex flex-wrap items-center justify-between gap-3 py-3"
              >
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium text-brand-900">
                    {m.profile?.full_name || m.profile?.email || m.user_id}
                    {souEu ? (
                      <span className="ml-2 text-xs font-normal text-brand-400">
                        (você)
                      </span>
                    ) : null}
                  </p>
                  <p className="truncate text-xs text-brand-400">
                    {m.profile?.email ?? "—"}
                  </p>
                </div>

                {isAdmin ? (
                  <div className="flex items-center gap-2">
                    <form action={alterarPapel} className="flex items-center gap-2">
                      <input type="hidden" name="membership_id" value={m.id} />
                      <select
                        name="role"
                        defaultValue={m.role}
                        className="field w-auto py-1.5 text-xs"
                        aria-label="Papel"
                      >
                        <option value="owner">Dono</option>
                        <option value="admin">Administrador</option>
                        <option value="member">Membro</option>
                      </select>
                      <button type="submit" className="btn-ghost py-1.5 text-xs">
                        Salvar
                      </button>
                    </form>

                    <form action={removerMembro}>
                      <input type="hidden" name="membership_id" value={m.id} />
                      <button
                        type="submit"
                        className="btn-ghost py-1.5 text-xs text-accent-coral"
                      >
                        Remover
                      </button>
                    </form>
                  </div>
                ) : (
                  <span className="text-xs font-medium text-brand-500">
                    {ROLE_LABEL[m.role]}
                  </span>
                )}
              </li>
            );
          })}
        </ul>
      </Card>

      {isAdmin ? (
        <Card
          title="Convidar pessoa"
          hint="O convite gera um link. Envie você mesmo por e-mail ou WhatsApp — a nuvem ainda não dispara e-mails."
        >
          <form action={convidarMembro} className="flex flex-wrap items-end gap-3">
            <label className="min-w-[220px] flex-1">
              <span className="mb-1 block text-xs font-medium text-brand-500">
                E-mail
              </span>
              <input
                name="email"
                type="email"
                required
                className="field"
                placeholder="pessoa@empresa.com.br"
              />
            </label>
            <label>
              <span className="mb-1 block text-xs font-medium text-brand-500">
                Papel
              </span>
              <select name="role" defaultValue="member" className="field w-auto">
                <option value="member">Membro</option>
                <option value="admin">Administrador</option>
                <option value="owner">Dono</option>
              </select>
            </label>
            <button type="submit" className="btn-primary">
              Gerar convite
            </button>
          </form>

          {(convites ?? []).length > 0 ? (
            <ul className="mt-5 divide-y divide-brand-100 border-t border-brand-100">
              {(convites as Invite[]).map((c) => (
                <li
                  key={c.id}
                  className="flex flex-wrap items-center justify-between gap-3 py-3"
                >
                  <div className="min-w-0">
                    <p className="truncate text-sm text-brand-900">{c.email}</p>
                    <p className="text-xs text-brand-400">
                      {ROLE_LABEL[c.role]} · vence em{" "}
                      {new Date(c.expires_at).toLocaleDateString("pt-BR")}
                    </p>
                  </div>
                  <div className="flex items-center gap-2">
                    <CopyLink url={`${siteUrl()}/convite/${c.token}`} />
                    <form action={revogarConvite}>
                      <input type="hidden" name="invite_id" value={c.id} />
                      <button
                        type="submit"
                        className="btn-ghost py-1.5 text-xs text-accent-coral"
                      >
                        Revogar
                      </button>
                    </form>
                  </div>
                </li>
              ))}
            </ul>
          ) : null}
        </Card>
      ) : null}

      <Card
        title="Nova organização"
        hint="Útil para separar clientes, unidades ou ambientes de teste."
      >
        <form action={criarOrganizacao} className="flex flex-wrap items-end gap-3">
          <label className="min-w-[220px] flex-1">
            <span className="mb-1 block text-xs font-medium text-brand-500">
              Nome
            </span>
            <input name="nome" required className="field" placeholder="Ex.: Unidade Centro" />
          </label>
          <button type="submit" className="btn-ghost">
            Criar
          </button>
        </form>
      </Card>
    </div>
  );
}
