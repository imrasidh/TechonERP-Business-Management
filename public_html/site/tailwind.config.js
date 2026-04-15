/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{js,ts,jsx,tsx}"],
  theme: {
    extend: {
      fontFamily: {
        sans: ['"Inter"', "system-ui", "sans-serif"],
      },
      colors: {
        brand: {
          50: "#f0f9f4",
          100: "#d8f0e4",
          200: "#b8e0cc",
          300: "#8fccb0",
          400: "#5eb08a",
          500: "#3d8f6c",
          600: "#2d7356",
          700: "#255c47",
          800: "#0f5132",
          900: "#0a3622",
          950: "#051f14",
        },
      },
      boxShadow: {
        soft: "0 1px 2px rgba(15, 81, 50, 0.08)",
        glow: "0 0 80px -20px rgba(61, 143, 108, 0.45)",
        "glow-lg": "0 0 120px -30px rgba(45, 115, 86, 0.55)",
        glass: "inset 0 1px 0 0 rgba(255,255,255,0.06)",
      },
      backgroundImage: {
        "page-dark":
          "linear-gradient(180deg, #05110c 0%, #020806 45%, #000000 100%)",
        "hero-mesh":
          "radial-gradient(ellipse 80% 50% at 70% 20%, rgba(45, 115, 86, 0.35) 0%, transparent 55%), radial-gradient(ellipse 60% 40% at 20% 80%, rgba(15, 81, 50, 0.25) 0%, transparent 50%)",
      },
    },
  },
  plugins: [],
};
