import { Card, Stat } from "@/components/Card";
import { getOrgContext } from "@/lib/auth";
import { getServerSupabase } from "@/lib/supabase/server";
import { ROLE_LABEL } from "@/lib/types";
import { criarOrganizacao } from "../organizacao/actions";

export const metadata = { title: "Painel — MindsFlow" };

type LinhaAuditoria = {
  id: number;
  action: string;
  target: string | null;
  created_at: string;
};

export default async function DashboardPage() {
  const { current, role, isAdmin } = await getOrgContext();

  // Primeiro acesso: ainda não existe organização nenhuma.
  if (!current) {
    return (
      <div className="mx-auto max-w-lg">
        <Card
          title="Crie sua primeira organização"
          hint="A organização é o espaço onde ficam os dados e a equipe. Você pode ter mais de uma."
        >
          <form action={criarOrganizacao} className="space-y-3">
            <input
              name="nome"
              required
              className="field"
              placeholder="Ex.: MindsFlow"
              aria-label="Nome da organização"
            />
            <button type="submit" className="btn-primary w-full">
              Criar organização
            </button>
          </form>
        </Card>
      </div>
    );
  }

  const supabase = await getServerSupabase();

  const [{ count: membros }, { count: convites }] = await Promise.all([
    supabase
      .from("memberships")
      .select("id", { count: "exact", head: true })
      .eq("org_id", current.org_id),
    supabase
      .from("invites")
      .select("id", { count: "exact", head: true })
      .eq("org_id", current.org_id)
      .is("accepted_at", null),
  ]);

  // A auditoria só é legível por admin/owner (RLS). Para os demais a
  // consulta volta vazia — sem erro, sem seção na tela.
  const { data: auditoria } = isAdmin
    ? await supabase
        .from("audit_log")
        .select("id, action, target, created_at")
        .eq("org_id", current.org_id)
        .order("created_at", { ascending: false })
        .limit(8)
    : { data: [] as LinhaAuditoria[] };

  return (
    <div className="space-y-6">
      <div className="grid gap-4 sm:grid-cols-3">
        <Stat label="Organização" value={current.organization?.name ?? "—"} />
        <Stat label="Pessoas" value={membros ?? 0} />
        <Stat
          label="Seu papel"
          value={role ? ROLE_LABEL[role] : "—"}
        />
      </div>

      {isAdmin && (convites ?? 0) > 0 ? (
        <Card title="Convites pendentes">
          <p className="text-sm text-brand-600">
            {convites} convite(s) aguardando aceite.{" "}
            <a href="/organizacao" className="font-semibold text-brand-700 underline">
              Ver na tela de organização
            </a>
          </p>
        </Card>
      ) : null}

      <Card
        title="Últimas ações"
        hint="Trilha de auditoria da organização — visível para donos e administradores."
      >
        {(auditoria ?? []).length === 0 ? (
          <p className="text-sm text-brand-400">Nada registrado ainda.</p>
        ) : (
          <ul className="divide-y divide-brand-100">
            {(auditoria as LinhaAuditoria[]).map((linha) => (
              <li key={linha.id} className="flex items-baseline justify-between gap-4 py-2.5">
                <span className="text-sm text-brand-900">
                  <span className="font-medium">{linha.action}</span>
                  {linha.target ? (
                    <span className="text-brand-500"> — {linha.target}</span>
                  ) : null}
                </span>
                <time className="shrink-0 text-xs text-brand-400">
                  {new Date(linha.created_at).toLocaleString("pt-BR")}
                </time>
              </li>
            ))}
          </ul>
        )}
      </Card>

      <Card
        title="Próximos módulos"
        hint="Esta base entrega login, organizações, equipe e auditoria. Os módulos do produto entram a partir daqui."
      >
        <ul className="list-disc space-y-1 pl-5 text-sm text-brand-600">
          <li>Cadastro e área de cada cliente da organização</li>
          <li>Integrações (WhatsApp, e-mail, CRM) e agentes de IA</li>
          <li>Relatórios e indicadores por organização</li>
        </ul>
      </Card>
    </div>
  );
}
