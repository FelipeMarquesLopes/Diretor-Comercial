import { redirect } from "next/navigation";
import { Card } from "@/components/Card";
import { getServerSupabase } from "@/lib/supabase/server";

export const metadata = { title: "Convite — MindsFlow" };

// Quem chega aqui já está logado (o middleware garante). A validação do
// convite — se venceu, se já foi usado, se é do e-mail certo — fica toda na
// função accept_invite() do banco.

export default async function ConvitePage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;

  async function aceitar() {
    "use server";

    const supabase = await getServerSupabase();
    const { error } = await supabase.rpc("accept_invite", { p_token: token });
    if (error) throw new Error(error.message);

    redirect("/dashboard");
  }

  return (
    <div className="mx-auto max-w-lg">
      <Card
        title="Você recebeu um convite"
        hint="Ao aceitar, sua conta passa a ter acesso aos dados desta organização."
      >
        <form action={aceitar}>
          <button type="submit" className="btn-primary w-full">
            Aceitar convite
          </button>
        </form>
      </Card>
    </div>
  );
}
