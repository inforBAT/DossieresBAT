import type { Config } from "tailwindcss";

const config: Config = {
  content: [
    "./app/**/*.{js,ts,jsx,tsx,mdx}",
    "./components/**/*.{js,ts,jsx,tsx,mdx}",
    "./lib/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
      colors: {
        ink: "#050505",
        paper: "#ffffff",
        line: "#d8d8d8",
        soft: "#f4f4f4",
        "soft-strong": "#e9e9e9",
        muted: "#5d5d5d",
        moss: "#0f5f2d",
        brick: "#a00000",
        steel: "#050505",
      },
      boxShadow: {
        soft: "0 18px 44px rgba(0, 0, 0, 0.08)",
      },
      borderRadius: {
        none: "0",
        sm: "0",
        DEFAULT: "0",
        md: "0",
        lg: "0",
        xl: "0",
        "2xl": "0",
        full: "9999px",
      },
    },
  },
  plugins: [],
};

export default config;
