import type { Config } from "tailwindcss";

const config: Config = {
  content: [
    "./src/app/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/components/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
      colors: {
        // Paleta MenthalHelp (placeholder — ajustar à marca real)
        brand: {
          50: "#eef6f6",
          100: "#d6ebeb",
          500: "#1f8a8a",
          600: "#176d6d",
          700: "#125656",
        },
      },
    },
  },
  plugins: [],
};

export default config;
