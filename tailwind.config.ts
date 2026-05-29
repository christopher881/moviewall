import type { Config } from "tailwindcss";

const config: Config = {
  content: [
    "./app/**/*.{ts,tsx}",
    "./components/**/*.{ts,tsx}"
  ],
  theme: {
    extend: {
      colors: {
        ink: {
          950: "#08090b",
          900: "#0b0d10",
          850: "#101317",
          800: "#14181d",
          700: "#1c2127",
          600: "#262c34",
          500: "#3a414b"
        },
        gold: {
          DEFAULT: "#c9a961",
          400: "#d6bb78",
          500: "#c9a961",
          600: "#a98a48"
        },
        teal: {
          DEFAULT: "#3fb6a8",
          400: "#54c6b8",
          500: "#3fb6a8",
          600: "#2e8d82"
        }
      },
      fontFamily: {
        sans: ["ui-sans-serif", "system-ui", "-apple-system", "Segoe UI", "Roboto", "Helvetica", "Arial", "sans-serif"]
      },
      borderRadius: {
        xl2: "1.25rem"
      },
      boxShadow: {
        card: "0 1px 0 rgba(255,255,255,0.04) inset, 0 8px 24px rgba(0,0,0,0.4)"
      }
    }
  },
  plugins: []
};

export default config;
