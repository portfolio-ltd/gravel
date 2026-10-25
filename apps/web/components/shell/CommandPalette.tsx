"use client"

import { useEffect, useState } from "react"
import { useRouter } from "next/navigation"
import { Command } from "cmdk"
import {
  FolderKanban, Laptop, LogOut, Monitor, Moon, PanelLeft, PanelTop, Palette, Plus, Search, Sun,
} from "lucide-react"
import { useAuth } from "@/contexts/AuthContext"
import { usePreferences } from "@/contexts/PreferencesContext"
import { useProjects } from "@/hooks/useProjects"
import { ACCENT_PRESETS } from "@/lib/theme"
import { NAV } from "@/lib/nav"

/** Global ⌘K / Ctrl+K palette: jump anywhere, switch theme and layout. */
export default function CommandPalette({ open, onOpenChange }: { open: boolean; onOpenChange: (v: boolean) => void }) {
  const router = useRouter()
  const { user, logout } = useAuth()
  const { prefs, update } = usePreferences()
  const { data: projects } = useProjects()
  const [search, setSearch] = useState("")

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault()
        onOpenChange(!open)
      }
    }
    window.addEventListener("keydown", onKey)
    return () => window.removeEventListener("keydown", onKey)
  }, [open, onOpenChange])

  useEffect(() => { if (!open) setSearch("") }, [open])

  function run(action: () => void) {
    onOpenChange(false)
    action()
  }

  const item =
    "flex cursor-pointer items-center gap-2.5 rounded-md px-2.5 py-2 text-sm text-foreground/90 " +
    "aria-selected:bg-accent aria-selected:text-foreground data-[disabled=true]:opacity-50"
  const group =
    "px-1.5 py-1 [&_[cmdk-group-heading]]:px-2 [&_[cmdk-group-heading]]:pb-1 [&_[cmdk-group-heading]]:pt-2 " +
    "[&_[cmdk-group-heading]]:text-[10px] [&_[cmdk-group-heading]]:font-semibold [&_[cmdk-group-heading]]:uppercase " +
    "[&_[cmdk-group-heading]]:tracking-wider [&_[cmdk-group-heading]]:text-muted-foreground"

  return (
    <Command.Dialog
      open={open}
      onOpenChange={onOpenChange}
      label="Command palette"
      overlayClassName="fixed inset-0 z-[60] bg-black/50 backdrop-blur-sm animate-fade-in"
      contentClassName="fixed left-1/2 top-[14vh] z-[61] w-[min(640px,calc(100vw-2rem))] -translate-x-1/2 overflow-hidden rounded-xl border bg-popover text-popover-foreground shadow-2xl animate-slide-in"
    >
      <div className="flex items-center gap-2 border-b px-3.5">
        <Search className="h-4 w-4 shrink-0 text-muted-foreground" />
        <Command.Input
          value={search}
          onValueChange={setSearch}
          placeholder="Search pages, projects and actions…"
          className="h-12 w-full bg-transparent text-sm outline-none placeholder:text-muted-foreground"
        />
        <span className="kbd">esc</span>
      </div>
      <Command.List className="max-h-[min(420px,60vh)] overflow-y-auto p-1">
        <Command.Empty className="py-10 text-center text-sm text-muted-foreground">No results.</Command.Empty>

        <Command.Group heading="Go to" className={group}>
          {NAV.flatMap((g) => g.items)
            .filter((n) => !n.adminOnly || user?.role === "admin")
            .map((n) => (
              <Command.Item key={n.href} value={`${n.label} ${n.keywords ?? ""}`} onSelect={() => run(() => router.push(n.href))} className={item}>
                <n.icon className="h-4 w-4 text-muted-foreground" /> {n.label}
              </Command.Item>
            ))}
        </Command.Group>

        {projects && projects.length > 0 && (
          <Command.Group heading="Projects" className={group}>
            {projects.slice(0, 20).map((p) => (
              <Command.Item key={p.id} value={`project ${p.name}`} onSelect={() => run(() => router.push(`/projects?project=${p.id}`))} className={item}>
                <FolderKanban className="h-4 w-4 text-muted-foreground" /> {p.name}
                <span className="ml-auto text-[11px] capitalize text-muted-foreground">{p.status}</span>
              </Command.Item>
            ))}
          </Command.Group>
        )}

        <Command.Group heading="Actions" className={group}>
          <Command.Item value="new project create" onSelect={() => run(() => router.push("/projects?new=1"))} className={item}>
            <Plus className="h-4 w-4 text-muted-foreground" /> New project
          </Command.Item>
          <Command.Item value="new workflow template" onSelect={() => run(() => router.push("/workflows"))} className={item}>
            <Plus className="h-4 w-4 text-muted-foreground" /> New workflow from a template
          </Command.Item>
          <Command.Item value="customize appearance theme accent" onSelect={() => run(() => router.push("/settings?tab=appearance"))} className={item}>
            <Palette className="h-4 w-4 text-muted-foreground" /> Customize appearance…
          </Command.Item>
        </Command.Group>

        <Command.Group heading="Theme" className={group}>
          {([["light", "Light", Sun], ["dark", "Dark", Moon], ["system", "Match system", Laptop]] as const).map(([value, label, Icon]) => (
            <Command.Item key={value} value={`theme ${label}`} onSelect={() => run(() => update({ theme: value }))} className={item}>
              <Icon className="h-4 w-4 text-muted-foreground" /> {label} theme
              {prefs.theme === value && <span className="ml-auto text-[11px] text-primary">current</span>}
            </Command.Item>
          ))}
          {ACCENT_PRESETS.map((a) => (
            <Command.Item key={a.hex} value={`accent color ${a.name}`} onSelect={() => run(() => update({ accent: a.hex }))} className={item}>
              <span className="h-3.5 w-3.5 rounded-full border" style={{ background: a.hex }} /> {a.name} accent
            </Command.Item>
          ))}
        </Command.Group>

        <Command.Group heading="Layout" className={group}>
          <Command.Item value="layout sidebar navigation" onSelect={() => run(() => update({ navLayout: "sidebar" }))} className={item}>
            <PanelLeft className="h-4 w-4 text-muted-foreground" /> Sidebar navigation
          </Command.Item>
          <Command.Item value="layout top bar navigation" onSelect={() => run(() => update({ navLayout: "topbar" }))} className={item}>
            <PanelTop className="h-4 w-4 text-muted-foreground" /> Top bar navigation
          </Command.Item>
          <Command.Item value="toggle collapse sidebar" onSelect={() => run(() => update({ sidebarCollapsed: !prefs.sidebarCollapsed }))} className={item}>
            <Monitor className="h-4 w-4 text-muted-foreground" /> {prefs.sidebarCollapsed ? "Expand" : "Collapse"} sidebar
          </Command.Item>
        </Command.Group>

        <Command.Group heading="Account" className={group}>
          <Command.Item value="sign out log out" onSelect={() => run(async () => { await logout(); router.push("/") })} className={item}>
            <LogOut className="h-4 w-4 text-muted-foreground" /> Sign out
          </Command.Item>
        </Command.Group>
      </Command.List>
    </Command.Dialog>
  )
}
