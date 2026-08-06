import type { Metadata, Viewport } from "next";
import "./globals.css";
import { Nav } from "@/components/Nav";

export const metadata: Metadata = {
  title: "Growth AI — Diretor Comercial Digital",
  description: "Diretor Comercial Digital da MenthalHelp",
  manifest: "/manifest.webmanifest",
  // Ícone do app quando adicionado à tela inicial do iPhone.
  icons: { apple: "/apple-touch-icon.png", icon: "/icon-192.png" },
  // Faz abrir em tela cheia (como app) no iPhone.
  appleWebApp: {
    capable: true,
    title: "Growth AI",
    statusBarStyle: "default",
  },
};

export const viewport: Viewport = {
  themeColor: "#262c66",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="pt-BR">
      <body className="min-h-screen antialiased">
        <div className="mx-auto max-w-6xl px-4 py-6 sm:py-8">
          {/* Cabeçalho premium: cartão branco com faixa multicolor da marca */}
          <header className="overflow-hidden rounded-2xl border border-brand-100 bg-white shadow-card">
            <div className="brand-rainbow h-1.5 w-full" />
            <div className="flex flex-col items-center gap-3 px-6 py-6 text-center">
              {/* Logos das duas marcas, lado a lado */}
              <div className="flex items-center justify-center gap-5 sm:gap-8">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src="/logo.png"
                  alt="Clínica Multidisciplinar MenthalHelp"
                  className="h-20 w-auto sm:h-24"
                />
                <span
                  aria-hidden
                  className="h-14 w-px bg-brand-100 sm:h-16"
                />
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src="/therapy-minds.png"
                  alt="Therapy Minds"
                  className="h-20 w-auto sm:h-24"
                />
              </div>
              <div>
                <p className="brand-wordmark text-lg font-bold tracking-tight sm:text-xl">
                  Growth AI
                </p>
                <p className="text-xs font-medium uppercase tracking-[0.18em] text-brand-400">
                  Diretor Comercial Digital
                </p>
              </div>
            </div>
          </header>
          <div className="mt-5">
            <Nav />
          </div>
          <main className="mt-6">{children}</main>
        </div>
      </body>
    </html>
  );
}
