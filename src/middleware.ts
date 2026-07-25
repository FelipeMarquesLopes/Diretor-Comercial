import { NextRequest, NextResponse } from "next/server";

// Proteção de acesso do sistema.
//
// Quando publicado na internet, o app fica acessível por um link. Sem isso,
// qualquer pessoa com o link entraria. Então exigimos um usuário e senha
// (definidos em APP_USER / APP_PASSWORD) para tudo.
//
// Exceção: o robô diário de follow-up (Vercel Cron) chama /api/followup/run
// com um segredo próprio (CRON_SECRET) e passa direto.
//
// Se APP_USER/APP_PASSWORD não estiverem definidos (ex: no seu computador
// durante o desenvolvimento), o app fica aberto — nenhuma trava.

export function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;
  const authHeader = req.headers.get("authorization");

  // 1. Robô de follow-up com o segredo do cron passa direto.
  if (pathname === "/api/followup/run" && process.env.CRON_SECRET) {
    if (authHeader === `Bearer ${process.env.CRON_SECRET}`) {
      return NextResponse.next();
    }
  }

  const user = process.env.APP_USER;
  const pass = process.env.APP_PASSWORD;

  // 2. Sem senha configurada → app aberto (modo desenvolvimento).
  if (!user || !pass) return NextResponse.next();

  // 3. Confere usuário e senha (autenticação básica do navegador).
  if (authHeader?.startsWith("Basic ")) {
    try {
      const decoded = atob(authHeader.slice(6));
      const sep = decoded.indexOf(":");
      const u = decoded.slice(0, sep);
      const p = decoded.slice(sep + 1);
      if (u === user && p === pass) return NextResponse.next();
    } catch {
      // cabeçalho malformado — cai no 401 abaixo
    }
  }

  // 4. Pede login.
  return new NextResponse("Autenticação necessária", {
    status: 401,
    headers: { "WWW-Authenticate": 'Basic realm="Growth AI"' },
  });
}

// Aplica a tudo, menos arquivos estáticos e os assets do app (ícone/manifesto).
export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|manifest.webmanifest|apple-touch-icon.png|icon-192.png|icon-512.png|icon.svg).*)",
  ],
};
