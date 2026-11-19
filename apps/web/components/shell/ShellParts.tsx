"use client"

import { useEffect, useState } from "react"
import Link from "next/link"
import { usePathname, useRouter } from "next/navigation"
import { ChevronRight, ChevronsUpDown, Folder, Key, Laptop, LogOut, Moon, Palette, Search, Shield, Sun, Zap } from "lucide-react"
import { useAuth } from "@/contexts/AuthContext"
import { useOrg } from "@/contexts/OrgContext"
import { usePreferences } from "@/contexts/PreferencesContext"
import { useProjects } from "@/hooks/useProjects"
import { Avatar, AvatarFallback } from "@/components/ui/avatar"
import { Tooltip } from "@/components/ui/tooltip"
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger,
} from "@/components/ui/dropdown"
import { NAV, isActive, isMorePage, type NavItem } from "@/lib/nav"
import { RECENT_EVENT, orderRecent, readRecentIds } from "@/lib/recentProjects"
import { cn, getInitials } from "@/lib/utils"

export function BrandMark({ collapsed = false }: { collapsed?: boolean }) {
  const { activeOrg } = useOrg()
  const brand = activeOrg?.appearance?.brandName?.trim() || "Gravel"
  return (
    <Link href="/home" className="flex min-w-0 items-center gap-2.5" aria-label={`${brand} home`}>
      <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-primary text-primary-foreground shadow-sm shadow-primary/30">
        <Zap className="h-4 w-4" />
      </div>
      {!collapsed && <span className="truncate text-sm font-semibold tracking-tight">{brand}</span>}
    </Link>
  )
}

export function SearchButton({ onClick, collapsed = false, className }: { onClick: () => void; collapsed?: boolean; className?: string }) {
  return (
    <Tooltip content={collapsed ? "Search pages, projects and actions (⌘K)" : undefined} side="right">
    <button
      onClick={onClick}
      aria-label="Search (⌘K)"
      className={cn(
        "flex h-8 items-center gap-2 rounded-lg border bg-background/60 text-xs text-muted-foreground transition-colors hover:bg-accent hover:text-foreground",
        collapsed ? "w-8 justify-center" : "w-full px-2.5",
        className,
      )}
    >
      <Search className="h-3.5 w-3.5 shrink-0" />
      {!collapsed && (
        <>
          <span className="flex-1 text-left">Search…</span>
          <span className="kbd">⌘K</span>
        </>
      )}
    </button>
    </Tooltip>
  )
}

export function NavLink({ item, collapsed, badge, onNavigate }: {
  item: NavItem; collapsed?: boolean; badge?: number; onNavigate?: () => void
}) {
  const pathname = usePathname()
  const active = isActive(pathname, item.href)
  const Icon = item.icon
  return (
    <Tooltip
      side="right"
      content={<><span className="block font-semibold">{item.label}</span><span className="text-muted-foreground">{item.hint}</span></>}
    >
    <Link
      href={item.href}
      onClick={onNavigate}
      aria-current={active ? "page" : undefined}
      className={cn(
        "group relative flex items-center gap-2.5 rounded-lg text-sm font-medium transition-colors",
        collapsed ? "h-9 w-9 justify-center" : "h-8 px-2.5",
        active
          ? "bg-primary/10 text-primary"
          : "text-sidebar-foreground/75 hover:bg-accent hover:text-foreground",
      )}
    >
      <Icon className="h-4 w-4 shrink-0" />
      {!collapsed && <span className="truncate">{item.label}</span>}
      {!!badge && badge > 0 && (
        <span className={cn(
          "flex items-center justify-center rounded-full font-semibold tabular-nums",
          collapsed
            ? "absolute -right-0.5 -top-0.5 h-4 min-w-4 bg-destructive px-1 text-[9px] text-destructive-foreground"
            : "ml-auto h-5 min-w-5 bg-primary/15 px-1.5 text-[10px] text-primary",
        )}>
          {badge > 99 ? "99+" : badge}
        </span>
      )}
    </Link>
    </Tooltip>
  )
}

/** The projects you opened last (this browser), topped up with the latest activity. */
export function RecentProjects({ onNavigate }: { onNavigate?: () => void }) {
  const { data: projects } = useProjects()
  const [visited, setVisited] = useState<string[]>([])
  useEffect(() => {
    const sync = () => setVisited(readRecentIds())
    sync()
    window.addEventListener(RECENT_EVENT, sync)
    window.addEventListener("storage", sync)
    return () => {
      window.removeEventListener(RECENT_EVENT, sync)
      window.removeEventListener("storage", sync)
    }
  }, [])
  const recent = orderRecent(projects ?? [], visited, 4)
  if (!recent.length) return null
  return (
    <div className="space-y-0.5">
      <p className="px-2.5 pb-1 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground/70">Recent</p>
      {recent.map((p) => (
        <Link
          key={p.id}
          href={`/projects?project=${p.id}`}
          onClick={onNavigate}
          className="flex h-8 items-center gap-2.5 rounded-lg px-2.5 text-sm text-sidebar-foreground/75 transition-colors hover:bg-accent hover:text-foreground"
        >
          <Folder className="h-4 w-4 shrink-0" />
          <span className="truncate">{p.name}</span>
        </Link>
      ))}
    </div>
  )
}

export function NavGroups({ collapsed, attentionCount, onNavigate }: {
  collapsed?: boolean; attentionCount: number; onNavigate?: () => void
}) {
  const { user } = useAuth()
  const pathname = usePathname()
  const { prefs, update } = usePreferences()
  // "More" stays open while you're on one of its pages, so the current page is always visible
  const moreOpen = prefs.navMore || isMorePage(pathname)
  const visible = (group: (typeof NAV)[number]) => group.items.filter((i) => !i.adminOnly || user?.role === "admin")
  const renderGroup = (group: (typeof NAV)[number]) => {
    const items = visible(group)
    if (!items.length) return null
    return (
      <div key={group.label} className={cn("space-y-0.5", collapsed && "flex flex-col items-center")}>
        {!collapsed && group.label && (
          <p className="px-2.5 pb-1 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground/70">
            {group.label}
          </p>
        )}
        {collapsed && group.label && <div className="mx-auto mb-1 h-px w-5 bg-sidebar-border" aria-hidden />}
        {items.map((item) => (
          <NavLink
            key={item.href}
            item={item}
            collapsed={collapsed}
            onNavigate={onNavigate}
            badge={item.badge === "attention" ? attentionCount : undefined}
          />
        ))}
      </div>
    )
  }
  return (
    <nav className="space-y-4">
      {NAV.filter((g) => !g.more).map(renderGroup)}
      {!collapsed && <RecentProjects onNavigate={onNavigate} />}
      <div className={cn(collapsed && "flex flex-col items-center")}>
        <Tooltip side="right" content={moreOpen ? "Hide the advanced pages" : "Board, PRDs, workflows, loops, engineers, harnesses, integrations and team"}>
          <button
            type="button"
            onClick={() => update({ navMore: !moreOpen })}
            aria-expanded={moreOpen}
            className={cn(
              "flex items-center gap-2.5 rounded-lg text-sm font-medium text-sidebar-foreground/75 transition-colors hover:bg-accent hover:text-foreground",
              collapsed ? "h-9 w-9 justify-center" : "h-8 w-full px-2.5",
            )}
          >
            <ChevronRight className={cn("h-4 w-4 shrink-0 transition-transform", moreOpen && "rotate-90")} />
            {!collapsed && <span>More</span>}
          </button>
        </Tooltip>
      </div>
      {moreOpen && NAV.filter((g) => g.more).map(renderGroup)}
    </nav>
  )
}

export function ThemeToggle({ className }: { className?: string }) {
  const { prefs, update } = usePreferences()
  const next = prefs.theme === "light" ? "dark" : prefs.theme === "dark" ? "system" : "light"
  const Icon = prefs.theme === "light" ? Sun : prefs.theme === "dark" ? Moon : Laptop
  return (
    <Tooltip content={`Theme: ${prefs.theme} — click for ${next}`}>
    <button
      onClick={() => update({ theme: next })}
      aria-label={`Switch theme to ${next}`}
      className={cn("flex h-8 w-8 items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-accent hover:text-foreground", className)}
    >
      <Icon className="h-4 w-4" />
    </button>
    </Tooltip>
  )
}

export function UserMenu({ compact = false, align = "end" }: { compact?: boolean; align?: "start" | "end" }) {
  const { user, logout } = useAuth()
  const router = useRouter()
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button className={cn(
          "flex min-w-0 items-center gap-2 rounded-lg transition-colors hover:bg-accent",
          compact ? "p-1" : "w-full border bg-background/60 px-2 py-1.5 shadow-sm",
        )}>
          <Avatar className="h-7 w-7">
            <AvatarFallback className="bg-primary/15 text-[10px] font-semibold text-primary">
              {getInitials(user?.name ?? "U")}
            </AvatarFallback>
          </Avatar>
          {!compact && (
            <>
              <div className="min-w-0 flex-1 text-left">
                <p className="truncate text-xs font-medium leading-tight">{user?.name}</p>
                <p className="truncate text-[10px] text-muted-foreground">{user?.email}</p>
              </div>
              <ChevronsUpDown className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
            </>
          )}
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align={align} className="w-56">
        <DropdownMenuLabel>
          <p className="font-semibold text-foreground">{user?.name}</p>
          <p className="truncate font-normal text-muted-foreground">{user?.email}</p>
        </DropdownMenuLabel>
        <DropdownMenuSeparator />
        <DropdownMenuItem onClick={() => router.push("/settings?tab=appearance")}>
          <Palette className="h-4 w-4" /> Appearance
        </DropdownMenuItem>
        <DropdownMenuItem onClick={() => router.push("/settings?tab=models")}>
          <Key className="h-4 w-4" /> API keys & models
        </DropdownMenuItem>
        {user?.role === "admin" && (
          <DropdownMenuItem onClick={() => router.push("/users")}>
            <Shield className="h-4 w-4" /> User management
          </DropdownMenuItem>
        )}
        <DropdownMenuSeparator />
        <DropdownMenuItem
          onClick={async () => { await logout(); router.push("/") }}
          className="text-destructive focus:text-destructive"
        >
          <LogOut className="h-4 w-4" /> Sign out
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
