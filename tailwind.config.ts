import type { Config } from "tailwindcss";

const config: Config = {
  darkMode: ["class"],
  content: ["./index.html", "./src/**/*.{js,ts,jsx,tsx}"],
  theme: {
    container: {
      center: true,
      padding: "1.5rem",
      screens: { "2xl": "1400px" },
    },
    extend: {
      fontFamily: {
        sans: ["Inter", "system-ui", "sans-serif"],
        display: ["Fraunces", "Georgia", "serif"],
        mono: ["JetBrains Mono", "ui-monospace", "monospace"],
      },
      colors: {
        paper: "hsl(var(--paper))",
        ink: {
          DEFAULT: "hsl(var(--ink))",
          soft: "hsl(var(--ink-soft))",
          mute: "hsl(var(--ink-mute))",
        },
        card: "hsl(var(--card))",
        line: "hsl(var(--line))",
        cyan: {
          reg: "hsl(var(--reg-cyan))",
        },
        magenta: {
          reg: "hsl(var(--reg-magenta))",
        },
        yellow: {
          reg: "hsl(var(--reg-yellow))",
        },
        success: "hsl(var(--success))",
        warning: "hsl(var(--warning))",
        danger: "hsl(var(--danger))",
        accent: "hsl(var(--accent))",
      },
      borderRadius: {
        lg: "14px",
        md: "10px",
        sm: "6px",
      },
      boxShadow: {
        paper: "0 1px 0 rgba(27,42,78,0.04), 0 6px 20px -8px rgba(27,42,78,0.14)",
        ink: "0 6px 24px -8px rgba(27,42,78,0.35)",
      },
      keyframes: {
        "fade-in": {
          "0%": { opacity: "0", transform: "translateY(4px)" },
          "100%": { opacity: "1", transform: "translateY(0)" },
        },
        "pulse-dot": {
          "0%,100%": { opacity: "1" },
          "50%": { opacity: "0.35" },
        },
      },
      animation: {
        "fade-in": "fade-in 240ms ease-out both",
        "pulse-dot": "pulse-dot 1.6s ease-in-out infinite",
      },
    },
  },
  plugins: [],
};

export default config;
