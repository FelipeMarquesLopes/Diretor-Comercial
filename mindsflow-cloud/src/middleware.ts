import { createServerClient, type CookieOptions } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

// O middleware faz duas coisas em toda navegação:
//
// 1. Renova o token da sessão e repassa os cookies atualizados — sem isso a
//    pessoa é deslogada quando o access token vence.
// 2. Barra o acesso às áreas internas para quem não está logado.
//
// A checagem de RLS continua no banco: isto aqui é só a porta da frente.

const ROTAS_PROTEGIDAS = ["/dashboard", "/organizacao", "/convite"];

export async function middleware(request: NextRequest) {
  let response = NextResponse.next({ request });

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  // Sem Supabase configurado não há sessão para renovar nem o que proteger —
  // deixa passar para o app mostrar a tela de "configure o ambiente".
  if (!url || !anonKey) return response;

  const supabase = createServerClient(url, anonKey, {
    cookies: {
      getAll() {
        return request.cookies.getAll();
      },
      setAll(cookiesToSet: { name: string; value: string; options: CookieOptions }[]) {
        cookiesToSet.forEach(({ name, value }) => {
          request.cookies.set(name, value);
        });
        response = NextResponse.next({ request });
        cookiesToSet.forEach(({ name, value, options }) => {
          response.cookies.set(name, value, options);
        });
      },
    },
  });

  const {
    data: { user },
  } = await supabase.auth.getUser();

  const { pathname } = request.nextUrl;
  const protegida = ROTAS_PROTEGIDAS.some(
    (rota) => pathname === rota || pathname.startsWith(`${rota}/`),
  );

  if (!user && protegida) {
    const login = request.nextUrl.clone();
    login.pathname = "/login";
    // Guarda para onde a pessoa queria ir, e devolve depois do login.
    login.searchParams.set("proximo", pathname);
    return NextResponse.redirect(login);
  }

  if (user && pathname === "/login") {
    const dashboard = request.nextUrl.clone();
    dashboard.pathname = "/dashboard";
    dashboard.search = "";
    return NextResponse.redirect(dashboard);
  }

  return response;
}

export const config = {
  // Roda em tudo, menos arquivos estáticos e imagens.
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)",
  ],
};
