import { NextResponse, type NextRequest } from "next/server";
import type { EmailOtpType } from "@supabase/supabase-js";
import { getServerSupabase } from "@/lib/supabase/server";

// Ponto de retorno do link de acesso enviado por e-mail.
//
// O Supabase manda um de dois formatos, dependendo da configuração do
// projeto: `code` (fluxo PKCE) ou `token_hash` + `type`. Tratamos os dois
// para o login funcionar sem depender de qual está ligado.

export async function GET(request: NextRequest) {
  const { searchParams, origin } = request.nextUrl;

  const code = searchParams.get("code");
  const tokenHash = searchParams.get("token_hash");
  const type = searchParams.get("type") as EmailOtpType | null;

  // Só aceita caminho interno — evita virar redirecionador para fora.
  const bruto = searchParams.get("proximo") ?? "/dashboard";
  const proximo = bruto.startsWith("/") && !bruto.startsWith("//")
    ? bruto
    : "/dashboard";

  const supabase = await getServerSupabase();

  if (code) {
    const { error } = await supabase.auth.exchangeCodeForSession(code);
    if (!error) return NextResponse.redirect(`${origin}${proximo}`);
    return falhou(origin, error.message);
  }

  if (tokenHash && type) {
    const { error } = await supabase.auth.verifyOtp({
      type,
      token_hash: tokenHash,
    });
    if (!error) return NextResponse.redirect(`${origin}${proximo}`);
    return falhou(origin, error.message);
  }

  return falhou(origin, "Link de acesso inválido ou incompleto.");
}

function falhou(origin: string, mensagem: string) {
  const url = new URL("/login", origin);
  url.searchParams.set(
    "erro",
    `Não foi possível entrar: ${mensagem}. Peça um link novo.`,
  );
  return NextResponse.redirect(url);
}
