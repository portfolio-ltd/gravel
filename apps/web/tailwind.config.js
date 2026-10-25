/** @type {import('tailwindcss').Config} */
const colors = require("tailwindcss/colors")
const plugin = require("tailwindcss/plugin")

// Every palette hue is routed through a CSS variable so the whole UI —
// including utility classes like `bg-amber-50 text-amber-700` — adapts to
// dark mode. In dark mode light tints become deep tints and dark text
// becomes light text, preserving contrast without per-component dark: rules.
const HUES = [
  "slate", "gray", "zinc", "neutral", "stone", "red", "orange", "amber", "yellow", "lime", "green",
  "emerald", "teal", "cyan", "sky", "blue", "indigo", "violet", "purple", "fuchsia", "pink", "rose",
]
const SHADES = [50, 100, 200, 300, 400, 500, 600, 700, 800, 900, 950]
const DARK_SHADE = { 50: 950, 100: 900, 200: 800, 300: 600, 400: 400, 500: 500, 600: 500, 700: 400, 800: 300, 900: 200, 950: 100 }

const rgb = (hex) => {
  const n = parseInt(hex.replace("#", ""), 16)
  return `${(n >> 16) & 255} ${(n >> 8) & 255} ${n & 255}`
}

const palette = Object.fromEntries(HUES.map((hue) => [
  hue,
  Object.fromEntries(SHADES.map((s) => [s, `rgb(var(--c-${hue}-${s}) / <alpha-value>)`])),
]))

const paletteVars = plugin(({ addBase }) => {
  const light = {}
  const dark = {}
  for (const hue of HUES) {
    for (const s of SHADES) {
      light[`--c-${hue}-${s}`] = rgb(colors[hue][s])
      dark[`--c-${hue}-${s}`] = rgb(colors[hue][DARK_SHADE[s]])
    }
  }
  addBase({ ":root": light, ".dark": dark })
})

const token = (name) => ({
  DEFAULT: `hsl(var(--${name}) / <alpha-value>)`,
  foreground: `hsl(var(--${name}-foreground) / <alpha-value>)`,
})

module.exports = {
  darkMode: ["class"],
  content: [
    "./app/**/*.{ts,tsx}",
    "./components/**/*.{ts,tsx}",
    "./lib/**/*.{ts,tsx}",
    "./hooks/**/*.{ts,tsx}",
    "./contexts/**/*.{ts,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        ...palette,
        border: "hsl(var(--border) / <alpha-value>)",
        input: "hsl(var(--input) / <alpha-value>)",
        ring: "hsl(var(--ring) / <alpha-value>)",
        background: "hsl(var(--background) / <alpha-value>)",
        foreground: "hsl(var(--foreground) / <alpha-value>)",
        primary: token("primary"),
        secondary: token("secondary"),
        destructive: token("destructive"),
        muted: token("muted"),
        accent: token("accent"),
        card: token("card"),
        popover: token("popover"),
        success: token("success"),
        warning: token("warning"),
        info: token("info"),
        sidebar: {
          DEFAULT: "hsl(var(--sidebar) / <alpha-value>)",
          foreground: "hsl(var(--sidebar-foreground) / <alpha-value>)",
          border: "hsl(var(--sidebar-border) / <alpha-value>)",
        },
      },
      fontFamily: {
        sans: ["var(--font-sans)", "ui-sans-serif", "system-ui", "sans-serif"],
        mono: ["var(--font-mono)", "ui-monospace", "SFMono-Regular", "monospace"],
      },
      borderRadius: {
        xl: "calc(var(--radius) + 4px)",
        lg: "var(--radius)",
        md: "calc(var(--radius) - 2px)",
        sm: "calc(var(--radius) - 4px)",
      },
      keyframes: {
        "slide-in": {
          from: { opacity: "0", transform: "translateY(-8px)" },
          to: { opacity: "1", transform: "translateY(0)" },
        },
        "slide-in-right": {
          from: { opacity: "0", transform: "translateX(24px)" },
          to: { opacity: "1", transform: "translateX(0)" },
        },
        "fade-in": { from: { opacity: "0" }, to: { opacity: "1" } },
        shimmer: { "100%": { transform: "translateX(100%)" } },
      },
      animation: {
        "slide-in": "slide-in 0.2s ease-out",
        "slide-in-right": "slide-in-right 0.22s cubic-bezier(0.16, 1, 0.3, 1)",
        "fade-in": "fade-in 0.15s ease-out",
      },
    },
  },
  plugins: [paletteVars],
}
