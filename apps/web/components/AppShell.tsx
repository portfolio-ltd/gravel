"use client"

import { useEffect, useState } from "react"
import Link from "next/link"
import { usePathname } from "next/navigation"
import { Bell, Menu, PanelLeftClose, PanelLeftOpen, Search, X } from "lucide-react"
import { useAuth } from "@/contexts/AuthContext"
import { useOrg } from "@/contexts/OrgContext"
import { usePreferences } from "@/contexts/PreferencesContext"
import { useAttentionTasks } from "@/hooks/useBoard"
import OrgSwitcher from "@/components/OrgSwitcher"
import CommandPalette from "@/components/shell/CommandPalette"
import { BrandMark, NavGroups, SearchButton, ThemeToggle, UserMenu } from "@/components/shell/ShellParts"
import { NAV, isActive } from "@/lib/nav"
import { cn } from "@/lib/utils"

function VerifyEmailBanner() {
  const [sent, setSent] = useState(false)
  const [dismissed, setDismissed] = useState(false)
  if (dismissed) return null

  async function resend() {
    try {
      const { apiFetch } = await import("@/lib/api")
      await apiFetch("/api/auth/resend-verification", { method: "POST" })
      setSent(true)
    } catch {
      /* banner is best-effort */
    }
  }

  return (
    <div className="flex items-center gap-2 border-b border-amber-200 bg-amber-50 px-4 py-1.5 text-xs text-amber-800">
      <Bell className="h-3.5 w-3.5 shrink-0" />
      <span>Please verify your email address.</span>
      {sent ? (
        <span className="font-medium">Verification email sent — check your inbox.</span>
      ) : (
        <button onClick={resend} className="font-semibold underline hover:no-underline">Resend email</button>
      )}
      <button onClick={() => setDismissed(true)} aria-label="Dismiss" className="ml-auto rounded p-0.5 hover:bg-amber-100">
        <X className="h-3.5 w-3.5" />
      </button>
    </div>
  )
}

function AttentionBell({ count }: { count: number }) {
  return (
    <Link
      href="/attention"
      aria-label={`Attention${count ? ` (${count})` : ""}`}
      className="relative flex h-8 w-8 items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
    >
      <Bell className="h-4 w-4" />
      {count > 0 && <span className="absolute right-1.5 top-1.5 h-1.5 w-1.5 rounded-full bg-destructive" />}
    </Link>
  )
}

export default function AppShell({ children }: { children: React.ReactNode }) {
  const { user } = useAuth()
  const pathname = usePathname()
  const { activeOrg } = useOrg()
  const { prefs, update, setOrgAppearance } = usePreferences()
  const [mobileOpen, setMobileOpen] = useState(false)
  const [paletteOpen, setPaletteOpen] = useState(false)
  const { data: attentionTasks } = useAttentionTasks()
  const attentionCount = attentionTasks?.length ?? 0
  const collapsed = prefs.sidebarCollapsed

  // The active org's branding is the default accent for members who haven't picked one
  useEffect(() => { setOrgAppearance(activeOrg?.appearance ?? null) }, [activeOrg, setOrgAppearance])
  useEffect(() => { setMobileOpen(false) }, [pathname])

  const currentLabel = NAV.flatMap((g) => g.items).find((i) => isActive(pathname, i.href))?.label

  const mobileDrawer = mobileOpen && (
    <div className="fixed inset-0 z-50 md:hidden">
      <div className="absolute inset-0 bg-black/50 animate-fade-in" onClick={() => setMobileOpen(false)} />
      <aside className="absolute inset-y-0 left-0 flex w-72 max-w-[85vw] flex-col border-r bg-sidebar animate-slide-in">
        <div className="flex h-14 items-center justify-between px-4">
          <BrandMark />
          <button onClick={() => setMobileOpen(false)} aria-label="Close menu" className="rounded-lg p-1.5 hover:bg-accent">
            <X className="h-4 w-4" />
          </button>
        </div>
        <div className="space-y-3 px-3 pb-3">
          <OrgSwitcher />
          <SearchButton onClick={() => { setMobileOpen(false); setPaletteOpen(true) }} />
        </div>
        <div className="flex-1 overflow-y-auto px-3 pb-4">
          <NavGroups attentionCount={attentionCount} onNavigate={() => setMobileOpen(false)} />
        </div>
        <div className="border-t p-3"><UserMenu align="start" /></div>
      </aside>
    </div>
  )

  if (prefs.navLayout === "topbar") {
    const flat = NAV.flatMap((g) => g.items).filter((i) => !i.adminOnly || user?.role === "admin")
    const primary = flat.filter((i) => ["Workspace", "Plan"].includes(NAV.find((g) => g.items.includes(i))!.label))
    const secondary = flat.filter((i) => !primary.includes(i))
    return (
      <div className="flex h-screen flex-col overflow-hidden bg-background">
        <header className="z-30 flex h-14 shrink-0 items-center gap-3 border-b bg-background/85 px-4 backdrop-blur">
          <button className="rounded-lg p-1.5 hover:bg-accent md:hidden" onClick={() => setMobileOpen(true)} aria-label="Open menu">
            <Menu className="h-4 w-4" />
          </button>
          <BrandMark />
          <div className="hidden w-44 md:block"><OrgSwitcher /></div>
          <nav className="no-scrollbar ml-2 hidden items-center gap-0.5 overflow-x-auto md:flex">
            {[...primary, ...secondary].map((item) => {
              const active = isActive(pathname, item.href)
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  aria-current={active ? "page" : undefined}
                  className={cn(
                    "relative flex shrink-0 items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-sm font-medium transition-colors",
                    active ? "bg-primary/10 text-primary" : "text-muted-foreground hover:bg-accent hover:text-foreground",
                  )}
                >
                  <item.icon className="h-4 w-4" />
                  <span className="hidden lg:inline">{item.label}</span>
                  {item.badge === "attention" && attentionCount > 0 && (
                    <span className="flex h-4 min-w-4 items-center justify-center rounded-full bg-destructive px-1 text-[9px] font-bold text-destructive-foreground">
                      {attentionCount}
                    </span>
                  )}
                </Link>
              )
            })}
          </nav>
          <div className="flex-1" />
          <SearchButton onClick={() => setPaletteOpen(true)} className="hidden w-52 sm:flex" />
          <AttentionBell count={attentionCount} />
          <ThemeToggle />
          <UserMenu compact />
        </header>
        {user && user.email_verified_at === null && <VerifyEmailBanner />}
        <main className="flex-1 overflow-hidden">{children}</main>
        {mobileDrawer}
        <CommandPalette open={paletteOpen} onOpenChange={setPaletteOpen} />
      </div>
    )
  }

  return (
    <div className="flex h-screen overflow-hidden bg-background">
      <aside
        className={cn(
          "hidden shrink-0 flex-col border-r border-sidebar-border bg-sidebar transition-[width] duration-200 md:flex",
          collapsed ? "w-[60px]" : "w-60",
        )}
      >
        <div className={cn("flex h-14 items-center", collapsed ? "justify-center" : "justify-between px-4")}>
          <BrandMark collapsed={collapsed} />
          {!collapsed && (
            <button
              onClick={() => update({ sidebarCollapsed: true })}
              aria-label="Collapse sidebar"
              className="rounded-md p-1 text-muted-foreground hover:bg-accent hover:text-foreground"
            >
              <PanelLeftClose className="h-4 w-4" />
            </button>
          )}
        </div>
        <div className={cn("space-y-2 pb-3", collapsed ? "flex flex-col items-center px-2" : "px-3")}>
          {!collapsed && <OrgSwitcher />}
          <SearchButton onClick={() => setPaletteOpen(true)} collapsed={collapsed} />
        </div>
        <div className={cn("flex-1 overflow-y-auto pb-4", collapsed ? "px-2" : "px-3")}>
          <NavGroups collapsed={collapsed} attentionCount={attentionCount} />
        </div>
        <div className={cn("space-y-1 border-t border-sidebar-border p-2", collapsed && "flex flex-col items-center")}>
          {collapsed ? (
            <>
              <button
                onClick={() => update({ sidebarCollapsed: false })}
                aria-label="Expand sidebar"
                className="flex h-8 w-8 items-center justify-center rounded-lg text-muted-foreground hover:bg-accent hover:text-foreground"
              >
                <PanelLeftOpen className="h-4 w-4" />
              </button>
              <ThemeToggle />
              <UserMenu compact align="start" />
            </>
          ) : (
            <div className="flex items-center gap-1">
              <div className="min-w-0 flex-1"><UserMenu align="start" /></div>
              <ThemeToggle />
            </div>
          )}
        </div>
      </aside>

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="z-30 flex h-12 shrink-0 items-center gap-2 border-b bg-background/85 px-3 backdrop-blur md:hidden">
          <button className="rounded-lg p-1.5 hover:bg-accent" onClick={() => setMobileOpen(true)} aria-label="Open menu">
            <Menu className="h-4 w-4" />
          </button>
          <span className="truncate text-sm font-semibold">{currentLabel ?? "Gravel"}</span>
          <div className="flex-1" />
          <button onClick={() => setPaletteOpen(true)} aria-label="Search" className="rounded-lg p-1.5 text-muted-foreground hover:bg-accent">
            <Search className="h-4 w-4" />
          </button>
          <AttentionBell count={attentionCount} />
        </header>
        {user && user.email_verified_at === null && <VerifyEmailBanner />}
        <main className="flex-1 overflow-hidden">{children}</main>
      </div>
      {mobileDrawer}
      <CommandPalette open={paletteOpen} onOpenChange={setPaletteOpen} />
    </div>
  )
}
