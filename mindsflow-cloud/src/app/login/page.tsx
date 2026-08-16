import { LoginForm } from "@/components/LoginForm";

export const metadata = { title: "Entrar — MindsFlow" };

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ proximo?: string; erro?: string }>;
}) {
  const { proximo, erro } = await searchParams;

  return (
    <div className="mx-auto flex min-h-screen max-w-md flex-col justify-center px-4 py-10">
      <div className="overflow-hidden rounded-2xl border border-brand-100 bg-white shadow-card">
        <div className="brand-flow h-1.5 w-full" />
        <div className="px-6 py-8">
          <div className="text-center">
            <p className="brand-wordmark text-2xl font-bold tracking-tight">
              MindsFlow
            </p>
            <p className="mt-1 text-xs font-medium uppercase tracking-[0.18em] text-brand-400">
              Nuvem
            </p>
          </div>

          {erro ? (
            <p className="mt-6 rounded-xl border border-accent-coral/40 bg-accent-coral/10 px-3 py-2 text-sm text-brand-900">
              {erro}
            </p>
          ) : null}

          <div className="mt-6">
            <LoginForm proximo={proximo ?? "/dashboard"} />
          </div>

          <p className="mt-6 text-center text-xs leading-relaxed text-brand-400">
            Enviamos um link de acesso para o seu e-mail. Não existe senha para
            guardar — o link vale por poucos minutos e só funciona uma vez.
          </p>
        </div>
      </div>
    </div>
  );
}
