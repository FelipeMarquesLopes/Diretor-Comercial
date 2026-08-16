import { createServerClient, type CookieOptions } from "@supabase/ssr";
import { cookies } from "next/headers";
import { supabaseAnonKey, supabaseUrl } from "@/lib/env";

// Cliente para Server Components, Server Actions e Route Handlers.
//
// Continua usando a anon key: as consultas rodam com a identidade da pessoa
// logada e passam pelo RLS. É o comportamento que queremos em quase tudo —
// a service_role (ver admin.ts) fica reservada para o que precisa escapar do
// RLS de propósito.

export async function getServerSupabase() {
  const cookieStore = await cookies();

  return createServerClient(supabaseUrl(), supabaseAnonKey(), {
    cookies: {
      getAll() {
        return cookieStore.getAll();
      },
      // O tipo vem anotado à mão porque `cookies` aceita uma união de
      // formatos (novo e antigo) e o TypeScript não infere dentro dela.
      setAll(cookiesToSet: { name: string; value: string; options: CookieOptions }[]) {
        try {
          cookiesToSet.forEach(({ name, value, options }) => {
            cookieStore.set(name, value, options);
          });
        } catch {
          // Server Components não podem escrever cookies. Tudo bem: o
          // middleware já renovou a sessão antes desta renderização.
        }
      },
    },
  });
}
