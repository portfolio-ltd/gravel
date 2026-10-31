// Appearance preferences: types, defaults, and how they reach the DOM.
// Stored locally (instant, pre-paint) and synced to the server so they follow
// the user across devices. Org admins can set a default accent and brand name.

export type ThemeMode = "light" | "dark" | "system"
export type Density = "compact" | "default" | "comfortable"
export type Radius = "sharp" | "default" | "round"
export type FontChoice = "inter" | "geist" | "plex" | "system"
export type NavLayout = "sidebar" | "topbar"

import { DEFAULT_DICTATION_LANGUAGE, isDictationLanguage } from "@/lib/dictation"

export interface BoardCardFields {
  priority: boolean
  type: boolean
  tags: boolean
  stage: boolean
  criteria: boolean
  questions: boolean
  links: boolean
}

export interface Preferences {
  theme: ThemeMode
  accent: string | null // hex; null = org default, else Gravel violet
  density: Density
  radius: Radius
  font: FontChoice
  navLayout: NavLayout
  sidebarCollapsed: boolean
  reduceMotion: boolean
  /** Preselected model for new projects; null = the server's DEFAULT_MODEL */
  defaultModel: string | null
  /** BCP 47 tag for voice input (Web Speech API); only English variants are offered today */
  dictationLang: string
  board: {
    cardFields: BoardCardFields
    compactCards: boolean
    hiddenColumns: string[]
  }
  home: { widgets: string[] }
}

export interface OrgAppearance {
  accent?: string | null
  brandName?: string | null
}

export const ACCENT_PRESETS: { name: string; hex: string }[] = [
  { name: "Violet", hex: "#7c3aed" },
  { name: "Indigo", hex: "#4f46e5" },
  { name: "Blue", hex: "#2563eb" },
  { name: "Sky", hex: "#0284c7" },
  { name: "Teal", hex: "#0d9488" },
  { name: "Emerald", hex: "#059669" },
  { name: "Amber", hex: "#d97706" },
  { name: "Orange", hex: "#ea580c" },
  { name: "Rose", hex: "#e11d48" },
  { name: "Pink", hex: "#db2777" },
  { name: "Slate", hex: "#475569" },
]

export const DEFAULT_ACCENT = "#7c3aed"

export const HOME_WIDGETS = [
  { id: "metrics", label: "Workspace metrics" },
  { id: "attention", label: "Needs your attention" },
  { id: "pipeline", label: "Pipeline at a glance" },
  { id: "projects", label: "Active projects" },
  { id: "knowledge", label: "Knowledge to review" },
] as const

export const DEFAULT_PREFERENCES: Preferences = {
  theme: "system",
  accent: null,
  density: "default",
  radius: "default",
  font: "inter",
  navLayout: "sidebar",
  sidebarCollapsed: false,
  reduceMotion: false,
  defaultModel: null,
  dictationLang: DEFAULT_DICTATION_LANGUAGE,
  board: {
    cardFields: { priority: true, type: true, tags: true, stage: true, criteria: true, questions: true, links: true },
    compactCards: false,
    hiddenColumns: [],
  },
  home: { widgets: HOME_WIDGETS.map((w) => w.id) },
}

export const STORAGE_KEY = "gravel.preferences"

/** Deep-merge stored (possibly partial / older) preferences over the defaults. */
export function normalizePreferences(raw: unknown): Preferences {
  const p = (raw && typeof raw === "object" ? raw : {}) as Partial<Preferences>
  return {
    ...DEFAULT_PREFERENCES,
    ...p,
    dictationLang: isDictationLanguage(p.dictationLang) ? p.dictationLang : DEFAULT_DICTATION_LANGUAGE,
    board: {
      ...DEFAULT_PREFERENCES.board,
      ...(p.board ?? {}),
      cardFields: { ...DEFAULT_PREFERENCES.board.cardFields, ...(p.board?.cardFields ?? {}) },
    },
    home: { widgets: Array.isArray(p.home?.widgets) ? p.home!.widgets : DEFAULT_PREFERENCES.home.widgets },
  }
}

export function readLocalPreferences(): Preferences {
  try {
    return normalizePreferences(JSON.parse(localStorage.getItem(STORAGE_KEY) ?? "null"))
  } catch {
    return DEFAULT_PREFERENCES
  }
}

export function writeLocalPreferences(prefs: Preferences): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(prefs))
  } catch {
    /* private mode / quota — preferences still apply for this session */
  }
}

/** "#7c3aed" → [h, s, l] (degrees, %, %) */
export function hexToHsl(hex: string): [number, number, number] | null {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex.trim())
  if (!m) return null
  const n = parseInt(m[1], 16)
  const r = ((n >> 16) & 255) / 255, g = ((n >> 8) & 255) / 255, b = (n & 255) / 255
  const max = Math.max(r, g, b), min = Math.min(r, g, b)
  const l = (max + min) / 2
  let h = 0, s = 0
  if (max !== min) {
    const d = max - min
    s = l > 0.5 ? d / (2 - max - min) : d / (max + min)
    h = max === r ? (g - b) / d + (g < b ? 6 : 0) : max === g ? (b - r) / d + 2 : (r - g) / d + 4
    h *= 60
  }
  return [Math.round(h), Math.round(s * 100), Math.round(l * 100)]
}

export function resolveDark(theme: ThemeMode): boolean {
  if (theme === "system") {
    return typeof window !== "undefined" && window.matchMedia("(prefers-color-scheme: dark)").matches
  }
  return theme === "dark"
}

/** Push preferences onto <html>: dark class, data attributes, accent variables. */
export function applyPreferences(prefs: Preferences, org?: OrgAppearance | null): void {
  const root = document.documentElement
  const dark = resolveDark(prefs.theme)
  root.classList.toggle("dark", dark)
  root.dataset.density = prefs.density
  root.dataset.radius = prefs.radius
  root.dataset.font = prefs.font
  root.dataset.motion = prefs.reduceMotion ? "reduce" : "full"
  const accent = prefs.accent || org?.accent || DEFAULT_ACCENT
  const hsl = hexToHsl(accent) ?? hexToHsl(DEFAULT_ACCENT)!
  const [h, s, l] = hsl
  const lightness = dark ? Math.min(l + 8, 72) : l
  root.style.setProperty("--primary", `${h} ${s}% ${lightness}%`)
  root.style.setProperty("--ring", `${h} ${s}% ${lightness}%`)
  // Readable text on the accent: dark text on very light accents
  root.style.setProperty("--primary-foreground", lightness > 68 ? "224 30% 10%" : "0 0% 100%")
}

/**
 * Inline <head> script: applies stored preferences before first paint so the
 * page never flashes the wrong theme. Kept dependency-free and tiny.
 */
export const THEME_BOOT_SCRIPT = `(function(){try{
var p=JSON.parse(localStorage.getItem(${JSON.stringify(STORAGE_KEY)})||"{}"),r=document.documentElement;
var t=p.theme||"system",d=t==="dark"||(t==="system"&&matchMedia("(prefers-color-scheme: dark)").matches);
r.classList.toggle("dark",d);r.dataset.density=p.density||"default";r.dataset.radius=p.radius||"default";
r.dataset.font=p.font||"inter";r.dataset.motion=p.reduceMotion?"reduce":"full";
var a=p.accent||localStorage.getItem("gravel.orgAccent")||"${DEFAULT_ACCENT}",m=/^#?([0-9a-f]{6})$/i.exec(a);
if(m){var n=parseInt(m[1],16),R=(n>>16&255)/255,G=(n>>8&255)/255,B=(n&255)/255,x=Math.max(R,G,B),y=Math.min(R,G,B),l=(x+y)/2,h=0,s=0;
if(x!==y){var e=x-y;s=l>.5?e/(2-x-y):e/(x+y);h=(x===R?(G-B)/e+(G<B?6:0):x===G?(B-R)/e+2:(R-G)/e+4)*60}
var L=Math.round(l*100);if(d)L=Math.min(L+8,72);var v=Math.round(h)+" "+Math.round(s*100)+"% "+L+"%";
r.style.setProperty("--primary",v);r.style.setProperty("--ring",v);r.style.setProperty("--primary-foreground",L>68?"224 30% 10%":"0 0% 100%")}
}catch(e){}})();`
