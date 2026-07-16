import type { Metadata } from "next";
import "./globals.css";
import { Nav } from "@/components/Nav";

export const metadata: Metadata = {
  title: "Growth AI — Diretor Comercial Digital",
  description: "Prospecção de empresas da MenthalHelp",
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
          <header className="mb-6">
            <h1 className="text-2xl font-bold text-brand-700">Growth AI</h1>
            <p className="text-sm text-gray-500">
              Diretor Comercial Digital · MenthalHelp · Frente de empresas
            </p>
          </header>
          <Nav />
          <main className="mt-6">{children}</main>
        </div>
      </body>
    </html>
  );
}
