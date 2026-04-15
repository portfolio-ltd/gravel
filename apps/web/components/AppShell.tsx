"use client"

import { useState } from "react"
import Link from "next/link"
import { usePathname, useRouter } from "next/navigation"
import { Zap, LayoutDashboard, Users, Settings, LogOut, Menu, X, ChevronDown, Key, Bell, Shield, Plug } from "lucide-react"
import { useAuth } from "@/contexts/AuthContext"
import { Avatar, AvatarFallback } from "@/components/ui/avatar"
import { Badge } from "@/components/ui/badge"
import { DropdownMenu, DropdownMenuTrigger, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuSeparator } from "@/components/ui/dropdown"
import { cn, getInitials } from "@/lib/utils"

const ROLE_COLORS: Record<string, string> = {
  admin: "bg-rose-100 text-rose-700",
  developer: "bg-blue-100 text-blue-700",
  qa: "bg-amber-100 text-amber-700",
  product: "bg-purple-100 text-purple-700",
  devops: "bg-emerald-100 text-emerald-700",
}

const NAV = [
  { to: "/projects",     icon: <LayoutDashboard className="w-4 h-4" />, label: "Projects" },
  { to: "/users",        icon: <Users className="w-4 h-4" />,           label: "Team",         adminOnly: true },
  { to: "/integrations", icon: <Plug className="w-4 h-4" />,            label: "Integrations" },
  { to: "/settings",     icon: <Settings className="w-4 h-4" />,        label: "Settings" },
]

export default function AppShell({ children }: { children: React.ReactNode }) {
  const { user, logout } = useAuth()
  const pathname = usePathname()
  const router = useRouter()
  const [mobileOpen, setMobileOpen] = useState(false)

  async function handleLogout() {
    await logout()
    router.push("/")
  }

  const visibleNav = NAV.filter((n) => !n.adminOnly || user?.role === "admin")

  return (
    <div className="h-screen flex flex-col bg-background overflow-hidden">
      <header className="h-14 border-b shrink-0 flex items-center px-4 gap-3 bg-background/90 backdrop-blur-sm z-30">
        <Link href="/projects" className="flex items-center gap-2">
          <div className="w-8 h-8 rounded-lg bg-primary flex items-center justify-center shrink-0">
            <Zap className="w-4 h-4 text-primary-foreground" />
          </div>
          <span className="font-bold text-sm tracking-tight hidden sm:block">Gravel</span>
          <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded-full bg-purple-100 text-purple-700 hidden sm:inline">Beta</span>
        </Link>

        <nav className="hidden sm:flex items-center gap-1 ml-4">
          {visibleNav.map((n) => (
            <Link
              key={n.to}
              href={n.to}
              className={cn(
                "flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-medium transition-colors",
                pathname === n.to || (n.to !== "/projects" && pathname.startsWith(n.to))
                  ? "bg-primary/10 text-primary"
                  : "text-muted-foreground hover:text-foreground hover:bg-muted"
              )}
            >
              {n.icon} {n.label}
            </Link>
          ))}
        </nav>

        <div className="flex-1" />

        <button className="relative p-2 rounded-lg hover:bg-muted transition-colors">
          <Bell className="w-4 h-4" />
          <span className="absolute top-1.5 right-1.5 w-1.5 h-1.5 rounded-full bg-primary" />
        </button>

        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button className="flex items-center gap-2 px-2 py-1.5 rounded-xl hover:bg-muted transition-colors">
              <Avatar className="w-7 h-7">
                <AvatarFallback className={cn("text-[10px]", ROLE_COLORS[user?.role ?? "developer"])}>
                  {getInitials(user?.name ?? "U")}
                </AvatarFallback>
              </Avatar>
              <div className="hidden sm:block text-left">
                <p className="text-xs font-medium leading-none">{user?.name}</p>
                <p className="text-[10px] text-muted-foreground capitalize">{user?.role}</p>
              </div>
              <ChevronDown className="w-3.5 h-3.5 text-muted-foreground hidden sm:block" />
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-52">
            <DropdownMenuLabel>
              <p className="font-semibold text-foreground">{user?.name}</p>
              <p className="text-muted-foreground font-normal">{user?.email}</p>
            </DropdownMenuLabel>
            <DropdownMenuSeparator />
            <DropdownMenuItem onClick={() => router.push("/settings")}>
              <Key className="w-4 h-4" /> API Keys & Model
            </DropdownMenuItem>
            {user?.role === "admin" && (
              <DropdownMenuItem onClick={() => router.push("/users")}>
                <Shield className="w-4 h-4" /> User Management
              </DropdownMenuItem>
            )}
            <DropdownMenuSeparator />
            <DropdownMenuItem onClick={handleLogout} className="text-destructive focus:text-destructive">
              <LogOut className="w-4 h-4" /> Sign out
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>

        <button className="sm:hidden p-2 rounded-lg hover:bg-muted transition-colors" onClick={() => setMobileOpen((v) => !v)}>
          {mobileOpen ? <X className="w-4 h-4" /> : <Menu className="w-4 h-4" />}
        </button>
      </header>

      {mobileOpen && (
        <div className="sm:hidden border-b bg-background z-20">
          <nav className="flex flex-col p-2 gap-1">
            {visibleNav.map((n) => (
              <Link
                key={n.to}
                href={n.to}
                onClick={() => setMobileOpen(false)}
                className={cn(
                  "flex items-center gap-2 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors",
                  pathname === n.to ? "bg-primary/10 text-primary" : "text-muted-foreground hover:text-foreground hover:bg-muted"
                )}
              >
                {n.icon} {n.label}
              </Link>
            ))}
            <button
              onClick={handleLogout}
              className="flex items-center gap-2 px-3 py-2.5 rounded-lg text-sm font-medium text-destructive hover:bg-destructive/10 transition-colors"
            >
              <LogOut className="w-4 h-4" /> Sign out
            </button>
          </nav>
        </div>
      )}

      <main className="flex-1 overflow-hidden">{children}</main>
    </div>
  )
}
