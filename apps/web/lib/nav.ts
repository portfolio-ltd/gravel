import {
  BookOpen, Bot, Building2, FileText, FolderKanban, GitBranch, Inbox, Kanban, LayoutDashboard, Plug,
  Settings, Users, Waypoints, Wrench, type LucideIcon,
} from "lucide-react"

export interface NavItem {
  href: string
  label: string
  icon: LucideIcon
  keywords?: string
  badge?: "attention"
  adminOnly?: boolean
}

export interface NavGroup {
  label: string
  items: NavItem[]
}

// One source for the sidebar, the top bar and the command palette.
export const NAV: NavGroup[] = [
  {
    label: "Workspace",
    items: [
      { href: "/home", label: "Home", icon: LayoutDashboard, keywords: "dashboard overview" },
      { href: "/projects", label: "Projects", icon: FolderKanban, keywords: "repo tasks prd" },
      { href: "/board", label: "Board", icon: Kanban, keywords: "kanban tasks" },
      { href: "/attention", label: "Attention", icon: Inbox, keywords: "approvals gates blocked inbox", badge: "attention" },
    ],
  },
  {
    label: "Plan",
    items: [
      { href: "/prds", label: "PRDs", icon: FileText, keywords: "requirements product spec" },
      { href: "/knowledge", label: "Knowledge", icon: BookOpen, keywords: "decisions adr patterns glossary runbooks conventions wiki" },
      { href: "/map", label: "Map", icon: Waypoints, keywords: "graph knowledge map wikilinks backlinks obsidian" },
    ],
  },
  {
    label: "Configure",
    items: [
      { href: "/workflows", label: "Workflows", icon: GitBranch, keywords: "stages pipeline templates roles" },
      { href: "/engineers", label: "Engineers", icon: Bot, keywords: "agents runtimes containers" },
      { href: "/harnesses", label: "Harnesses", icon: Wrench, keywords: "subagents routing test gate tools turns agent harness" },
      { href: "/integrations", label: "Integrations", icon: Plug, keywords: "github gitlab deploy aws" },
    ],
  },
  {
    label: "Admin",
    items: [
      { href: "/organizations", label: "Organization", icon: Building2, keywords: "members tags branding" },
      { href: "/users", label: "Team", icon: Users, keywords: "users roles invite", adminOnly: true },
      { href: "/settings", label: "Settings", icon: Settings, keywords: "appearance theme api keys models" },
    ],
  },
]

export function isActive(pathname: string, href: string): boolean {
  return pathname === href || pathname.startsWith(`${href}/`)
}
