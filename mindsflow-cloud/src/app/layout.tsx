import type { Metadata, Viewport } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "MindsFlow — Nuvem",
  description: "Plataforma na nuvem da MindsFlow",
};

export const viewport: Viewport = {
  themeColor: "#26306c",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="pt-BR">
      <body className="min-h-screen antialiased">{children}</body>
    </html>
  );
}
