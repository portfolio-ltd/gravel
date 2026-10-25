"use client"

import { useEffect, useState } from "react"
import { Check, Laptop, Moon, PanelLeft, PanelTop, RotateCcw, Sun } from "lucide-react"
import { toast } from "sonner"
import { usePreferences } from "@/contexts/PreferencesContext"
import { useOrg } from "@/contexts/OrgContext"
import { useUpdateOrg } from "@/hooks/useOrganizations"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Field, Input, Segmented, Switch } from "@/components/ui/form"
import { SectionCard } from "@/components/ui/page"
import { ACCENT_PRESETS, DEFAULT_ACCENT, type BoardCardFields, type FontChoice, type ThemeMode } from "@/lib/theme"
import { cn } from "@/lib/utils"

const FONTS: { value: FontChoice; label: string; family: string }[] = [
  { value: "inter", label: "Inter", family: "var(--font-inter)" },
  { value: "geist", label: "Geist", family: "var(--font-geist)" },
  { value: "plex", label: "IBM Plex Sans", family: "var(--font-plex)" },
  { value: "system", label: "System", family: "ui-sans-serif, system-ui, sans-serif" },
]

const CARD_FIELDS: { key: keyof BoardCardFields; label: string }[] = [
  { key: "priority", label: "Priority" },
  { key: "type", label: "Type" },
  { key: "stage", label: "Workflow stage" },
  { key: "criteria", label: "Acceptance criteria progress" },
  { key: "questions", label: "Open questions" },
  { key: "tags", label: "Tags" },
  { key: "links", label: "Branch, PR and issue links" },
]

function ThemeCard({ mode, label, icon, active, onClick }: {
  mode: ThemeMode; label: string; icon: React.ReactNode; active: boolean; onClick: () => void
}) {
  const panes = mode === "system" ? [false, true] : [mode === "dark"]
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={cn(
        "group rounded-xl border-2 p-2 text-left transition-all",
        active ? "border-primary shadow-sm shadow-primary/20" : "border-border hover:border-muted-foreground/40",
      )}
    >
      {/* Fixed colors on purpose: this is a picture of each theme, not themed UI */}
      <div className="flex h-16 overflow-hidden rounded-lg border">
        {panes.map((dark, i) => (
          <div key={i} className="flex flex-1 gap-1 p-1.5" style={{ background: dark ? "#18181b" : "#ffffff" }}>
            <div className="w-3 rounded-sm" style={{ background: dark ? "#27272a" : "#f4f4f5" }} />
            <div className="flex flex-1 flex-col gap-1">
              <div className="h-1.5 w-2/3 rounded-full bg-primary" />
              <div className="h-1.5 w-full rounded-full" style={{ background: dark ? "#3f3f46" : "#e4e4e7" }} />
              <div className="h-1.5 w-1/2 rounded-full" style={{ background: dark ? "#3f3f46" : "#e4e4e7" }} />
            </div>
          </div>
        ))}
      </div>
      <div className="mt-2 flex items-center gap-1.5 px-0.5 text-xs font-medium">
        {icon} {label}
        {active && <Check className="ml-auto h-3.5 w-3.5 text-primary" />}
      </div>
    </button>
  )
}

function Preview() {
  return (
    <div className="surface space-y-3 p-4 bg-glow">
      <div className="flex items-center justify-between">
        <p className="text-sm font-semibold">Export invoices as CSV</p>
        <Badge variant="warning">Awaiting approval</Badge>
      </div>
      <p className="text-xs text-muted-foreground">Plan · step 3 of 6 — 2 of 3 acceptance criteria covered.</p>
      <div className="h-1.5 overflow-hidden rounded-full bg-muted">
        <div className="h-full w-2/3 rounded-full bg-primary" />
      </div>
      <div className="flex flex-wrap gap-1.5">
        <Badge variant="purple">plan</Badge>
        <Badge variant="info">feature</Badge>
        <Badge variant="success">tests pass</Badge>
      </div>
      <div className="flex gap-2">
        <Button size="sm">Approve</Button>
        <Button size="sm" variant="outline">Request changes</Button>
      </div>
    </div>
  )
}

function OrgBranding() {
  const { activeOrg } = useOrg()
  const updateOrg = useUpdateOrg()
  const [brandName, setBrandName] = useState("")
  const [accent, setAccent] = useState<string>("")

  useEffect(() => {
    setBrandName(activeOrg?.appearance?.brandName ?? "")
    setAccent(activeOrg?.appearance?.accent ?? "")
  }, [activeOrg])

  if (!activeOrg || activeOrg.role !== "admin") return null

  async function save() {
    if (!activeOrg) return
    try {
      await updateOrg.mutateAsync({
        id: activeOrg.id,
        appearance: { brandName: brandName.trim() || null, accent: accent || null },
      })
      toast.success("Organization branding saved")
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not save branding")
    }
  }

  return (
    <SectionCard
      title="Organization branding"
      description={`Defaults for everyone in ${activeOrg.name}. Members can still pick their own accent.`}
      actions={<Button size="sm" onClick={save} disabled={updateOrg.isPending}>Save branding</Button>}
    >
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Product name in the sidebar" hint="Leave empty to show “Gravel”.">
          <Input value={brandName} maxLength={40} onChange={(e) => setBrandName(e.target.value)} placeholder="Gravel" />
        </Field>
        <Field label="Default accent">
          <div className="flex items-center gap-2">
            <input
              type="color"
              aria-label="Organization accent color"
              value={accent || DEFAULT_ACCENT}
              onChange={(e) => setAccent(e.target.value)}
              className="h-9 w-12 cursor-pointer rounded-lg border bg-background p-1"
            />
            <Input value={accent} onChange={(e) => setAccent(e.target.value)} placeholder={DEFAULT_ACCENT} className="font-mono" />
            {accent && <Button variant="ghost" size="sm" onClick={() => setAccent("")}>Clear</Button>}
          </div>
        </Field>
      </div>
    </SectionCard>
  )
}

export default function AppearanceSettings() {
  const { prefs, update, reset, orgAppearance } = usePreferences()
  const activeAccent = prefs.accent ?? orgAppearance?.accent ?? DEFAULT_ACCENT

  return (
    <div className="space-y-5">
      <div className="grid gap-5 lg:grid-cols-[1fr_320px]">
        <div className="space-y-5">
          <SectionCard title="Theme" description="Light, dark, or follow your operating system.">
            <div className="grid grid-cols-3 gap-3">
              <ThemeCard mode="light" label="Light" icon={<Sun className="h-3.5 w-3.5" />} active={prefs.theme === "light"} onClick={() => update({ theme: "light" })} />
              <ThemeCard mode="dark" label="Dark" icon={<Moon className="h-3.5 w-3.5" />} active={prefs.theme === "dark"} onClick={() => update({ theme: "dark" })} />
              <ThemeCard mode="system" label="System" icon={<Laptop className="h-3.5 w-3.5" />} active={prefs.theme === "system"} onClick={() => update({ theme: "system" })} />
            </div>
          </SectionCard>

          <SectionCard title="Accent color" description="Used for primary actions, focus rings and highlights.">
            <div className="flex flex-wrap items-center gap-2.5">
              {ACCENT_PRESETS.map((a) => {
                const active = activeAccent.toLowerCase() === a.hex
                return (
                  <button
                    key={a.hex}
                    type="button"
                    title={a.name}
                    aria-label={`${a.name} accent`}
                    aria-pressed={active}
                    onClick={() => update({ accent: a.hex })}
                    className={cn(
                      "flex h-8 w-8 items-center justify-center rounded-full ring-offset-2 ring-offset-background transition-transform hover:scale-110",
                      active && "ring-2 ring-foreground/60",
                    )}
                    style={{ background: a.hex }}
                  >
                    {active && <Check className="h-4 w-4 text-white" />}
                  </button>
                )
              })}
              <label className="flex h-8 cursor-pointer items-center gap-2 rounded-full border px-2.5 text-xs font-medium hover:bg-accent">
                <input
                  type="color"
                  value={activeAccent}
                  onChange={(e) => update({ accent: e.target.value })}
                  className="h-5 w-5 cursor-pointer rounded-full border-0 bg-transparent p-0"
                  aria-label="Custom accent color"
                />
                Custom
              </label>
              {prefs.accent && (
                <Button variant="ghost" size="sm" onClick={() => update({ accent: null })}>
                  {orgAppearance?.accent ? "Use organization accent" : "Reset"}
                </Button>
              )}
            </div>
          </SectionCard>

          <SectionCard title="Layout & density">
            <div className="grid gap-5 sm:grid-cols-2">
              <Field label="Navigation">
                <div className="grid grid-cols-2 gap-2">
                  {([["sidebar", "Sidebar", PanelLeft], ["topbar", "Top bar", PanelTop]] as const).map(([value, label, Icon]) => (
                    <button
                      key={value}
                      type="button"
                      aria-pressed={prefs.navLayout === value}
                      onClick={() => update({ navLayout: value })}
                      className={cn(
                        "flex items-center gap-2 rounded-lg border-2 px-3 py-2 text-xs font-medium transition-all",
                        prefs.navLayout === value ? "border-primary bg-primary/5" : "border-border hover:border-muted-foreground/40",
                      )}
                    >
                      <Icon className="h-4 w-4" /> {label}
                    </button>
                  ))}
                </div>
              </Field>
              <Field label="Density" hint="Scales text and spacing across the app.">
                <Segmented
                  value={prefs.density}
                  onChange={(density) => update({ density })}
                  options={[{ value: "compact", label: "Compact" }, { value: "default", label: "Default" }, { value: "comfortable", label: "Roomy" }]}
                />
              </Field>
              <Field label="Corner radius">
                <Segmented
                  value={prefs.radius}
                  onChange={(radius) => update({ radius })}
                  options={[{ value: "sharp", label: "Sharp" }, { value: "default", label: "Default" }, { value: "round", label: "Round" }]}
                />
              </Field>
              <div className="space-y-3">
                <label className="flex items-center justify-between gap-3 text-sm">
                  Collapsed sidebar
                  <Switch checked={prefs.sidebarCollapsed} onChange={(v) => update({ sidebarCollapsed: v })} label="Collapsed sidebar" />
                </label>
                <label className="flex items-center justify-between gap-3 text-sm">
                  Reduce motion
                  <Switch checked={prefs.reduceMotion} onChange={(v) => update({ reduceMotion: v })} label="Reduce motion" />
                </label>
              </div>
            </div>
          </SectionCard>

          <SectionCard title="Typeface">
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
              {FONTS.map((f) => (
                <button
                  key={f.value}
                  type="button"
                  aria-pressed={prefs.font === f.value}
                  onClick={() => update({ font: f.value })}
                  className={cn(
                    "rounded-xl border-2 px-3 py-3 text-left transition-all",
                    prefs.font === f.value ? "border-primary bg-primary/5" : "border-border hover:border-muted-foreground/40",
                  )}
                >
                  <span className="block text-2xl font-semibold leading-none" style={{ fontFamily: f.family }}>Aa</span>
                  <span className="mt-2 block text-xs text-muted-foreground" style={{ fontFamily: f.family }}>{f.label}</span>
                </button>
              ))}
            </div>
          </SectionCard>

          <SectionCard title="Board cards" description="Choose what each task card shows.">
            <div className="grid gap-x-6 gap-y-3 sm:grid-cols-2">
              {CARD_FIELDS.map(({ key, label }) => (
                <label key={key} className="flex items-center justify-between gap-3 text-sm">
                  {label}
                  <Switch
                    checked={prefs.board.cardFields[key]}
                    label={label}
                    onChange={(v) => update({ board: { ...prefs.board, cardFields: { ...prefs.board.cardFields, [key]: v } } })}
                  />
                </label>
              ))}
              <label className="flex items-center justify-between gap-3 text-sm">
                Compact cards
                <Switch checked={prefs.board.compactCards} label="Compact cards"
                  onChange={(v) => update({ board: { ...prefs.board, compactCards: v } })} />
              </label>
            </div>
          </SectionCard>
        </div>

        <div className="space-y-3 lg:sticky lg:top-0 lg:self-start">
          <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground">Live preview</p>
          <Preview />
          <Button variant="outline" size="sm" className="w-full" onClick={() => { reset(); toast.success("Appearance reset to defaults") }}>
            <RotateCcw className="h-3.5 w-3.5" /> Reset appearance
          </Button>
          <p className="text-[11px] text-muted-foreground">
            Saved to your account and applied on every device you sign in to.
          </p>
        </div>
      </div>

      <OrgBranding />
    </div>
  )
}
