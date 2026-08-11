/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{js,ts,jsx,tsx}"],
  theme: {
    extend: {
      colors: {
        cream: {
          50: "#FDFBF6",
          100: "#FBF7EE",
          200: "#F4EDDD",
          300: "#E9DFC6",
        },
        ink: {
          900: "#1B1917",
          700: "#3D3733",
          500: "#6E655D",
          300: "#A79E93",
        },
        ember: {
          50: "#FEF3EC",
          100: "#FDE2CE",
          400: "#FB923C",
          500: "#F97316",
          600: "#EA580C",
          700: "#C2410C",
        },
      },
      fontFamily: {
        serif: ['"Instrument Serif"', "ui-serif", "Georgia", "serif"],
        sans: ['"Inter"', "ui-sans-serif", "system-ui", "sans-serif"],
        mono: ['"JetBrains Mono"', "ui-monospace", "monospace"],
      },
      boxShadow: {
        soft: "0 1px 2px rgba(27,25,23,0.04), 0 4px 12px rgba(27,25,23,0.06)",
        pop: "0 2px 4px rgba(27,25,23,0.06), 0 12px 32px rgba(27,25,23,0.10)",
      },
      borderRadius: {
        xl2: "14px",
      },
    },
  },
  plugins: [],
};
