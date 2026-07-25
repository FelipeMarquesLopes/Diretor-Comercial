import type { MetadataRoute } from "next";

// "Manifesto" do app — faz o sistema virar um app instalável na tela inicial
// (iPhone/Android), com ícone, nome e abertura em tela cheia.
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Growth AI — MenthalHelp",
    short_name: "Growth AI",
    description: "Diretor Comercial Digital da MenthalHelp",
    start_url: "/",
    display: "standalone",
    background_color: "#ffffff",
    theme_color: "#0d9488",
    icons: [
      { src: "/icon-192.png", sizes: "192x192", type: "image/png" },
      { src: "/icon-512.png", sizes: "512x512", type: "image/png" },
      {
        src: "/icon-512.png",
        sizes: "512x512",
        type: "image/png",
        purpose: "maskable",
      },
    ],
  };
}
