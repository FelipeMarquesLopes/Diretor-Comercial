import type { Metadata, Viewport } from "next";
import "./globals.css";
import { AppShell } from "@/components/AppShell";

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
        {/* App shell premium: menu lateral à esquerda + conteúdo à direita.
            O seletor de marca e o gate de primeiro acesso ficam na sidebar. */}
        <AppShell>{children}</AppShell>
      </body>
    </html>
  );
}
