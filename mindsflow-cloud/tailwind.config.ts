import type { Config } from "tailwindcss";

const config: Config = {
  content: [
    "./src/app/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/components/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
      colors: {
        // Paleta provisória da MindsFlow — indigo profundo como cor base.
        // Ao definir a identidade oficial, troque só estes valores: todo o
        // app usa `brand-*`, então a marca muda por aqui.
        brand: {
          50: "#eef1fc",
          100: "#dfe4f9",
          200: "#c2cbf2",
          300: "#9ba9e8",
          400: "#7183da",
          500: "#4d60c6",
          600: "#3a4baa",
          700: "#2d3a87",
          800: "#26306c",
          900: "#1e2656",
        },
        // Acentos do "flow" — usados em gráficos, tags e na faixa do topo.
        accent: {
          teal: "#3fb8b0",
          blue: "#5b9ee6",
          purple: "#9b8ae0",
          green: "#77c58a",
          amber: "#f0be5f",
          coral: "#ef8a7d",
        },
      },
      boxShadow: {
        card: "0 1px 2px rgba(30, 38, 86, 0.04), 0 8px 24px -12px rgba(30, 38, 86, 0.18)",
      },
    },
  },
  plugins: [],
};

export default config;
