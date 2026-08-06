import type { Config } from "tailwindcss";

const config: Config = {
  content: [
    "./src/app/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/components/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
      colors: {
        // Paleta MenthalHelp — indigo profundo do logotipo (rosto + wordmark).
        brand: {
          50: "#eef0fb",
          100: "#e0e3f7",
          200: "#c4caef",
          300: "#9fa8e2",
          400: "#7580d0",
          500: "#515dbb",
          600: "#3d47a0",
          700: "#2e3680",
          800: "#262c66", // navy do logotipo
          900: "#1f2352",
        },
        // Arco-íris do "cérebro" — neurodiversidade. Acentos e a faixa premium.
        accent: {
          coral: "#f2897c",
          amber: "#f6c266",
          green: "#8ccb86",
          teal: "#57c2c4",
          blue: "#6aa6e6",
          purple: "#a98fe0",
        },
      },
      boxShadow: {
        // Sombra suave, "cara de premium", para cartões.
        card: "0 1px 2px rgba(38, 44, 102, 0.04), 0 8px 24px -12px rgba(38, 44, 102, 0.18)",
      },
    },
  },
  plugins: [],
};

export default config;
