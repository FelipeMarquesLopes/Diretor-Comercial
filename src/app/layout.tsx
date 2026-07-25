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
  themeColor: "#0d9488",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="pt-BR">
      <body className="min-h-screen antialiased">
        <div className="mx-auto max-w-6xl px-4 py-6">
          <header className="mb-6 flex flex-col items-center text-center">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src="/logo.png"
              alt="Clínica Multidisciplinar MenthalHelp"
              className="h-24 w-auto sm:h-28"
            />
            <p className="mt-2 text-sm font-semibold tracking-wide text-brand-700">
              Growth AI · Diretor Comercial Digital
            </p>
          </header>
          <Nav />
          <main className="mt-6">{children}</main>
        </div>
      </body>
    </html>
  );
}
