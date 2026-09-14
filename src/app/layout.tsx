import type { Metadata, Viewport } from "next";
import "./globals.css";
import { Nav } from "@/components/Nav";
import { BrandHeader } from "@/components/BrandHeader";

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
          {/* Cabeçalho premium com as duas marcas — clicar na logo troca a
              marca ativa; no 1º acesso, pede para escolher. */}
          <BrandHeader />
          <div className="mt-5">
            <Nav />
          </div>
          <main className="mt-6">{children}</main>
        </div>
      </body>
    </html>
  );
}
