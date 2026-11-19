import {
  BookOpen, Bot, Building2, FileText, FolderKanban, GitBranch, Inbox, Kanban, LayoutDashboard, Plug, Repeat,
  Settings, Users, Waypoints, Wrench, type LucideIcon,
} from "lucide-react"

export interface NavItem {
  href: string
  label: string
  icon: LucideIcon
  /** One plain sentence: what you do on this page (sidebar tooltip, command palette) */
  hint: string
  keywords?: string
  badge?: "attention"
  adminOnly?: boolean
}

export interface NavGroup {
  /** Empty for the unlabeled top group */
  label: string
  /** Hidden behind the sidebar's "More" until opened */
  more?: boolean
  items: NavItem[]
}

// One source for the sidebar, the top bar and the command palette.
// The first group is everything a new user needs: see what's happening, give
// engineers work, read what they know, set up. The rest sits behind "More"
// (`more: true`) until someone goes looking for it; the command palette lists all.
export const NAV: NavGroup[] = [
  {
    label: "",
    items: [
      { href: "/home", label: "Home", icon: LayoutDashboard, hint: "Ask for work, see what is running, and approve what waits on you.", keywords: "dashboard overview approvals", badge: "attention" },
      { href: "/projects", label: "Projects", icon: FolderKanban, hint: "Repositories and their tasks. Start here to give engineers work.", keywords: "repo tasks prd" },
      { href: "/knowledge", label: "Knowledge", icon: BookOpen, hint: "Decisions, patterns and runbooks your engineers read before they work.", keywords: "decisions adr patterns glossary runbooks conventions wiki" },
      { href: "/settings", label: "Settings", icon: Settings, hint: "Your appearance, API keys, CLI tokens and models.", keywords: "appearance theme api keys models tokens cli" },
    ],
  },
  {
    label: "Work",
    more: true,
    items: [
      { href: "/attention", label: "Attention", icon: Inbox, hint: "Approvals, manual checkpoints, blocked runs and open questions waiting on a person.", keywords: "approvals gates blocked inbox", badge: "attention" },
      { href: "/board", label: "Board", icon: Kanban, hint: "Every task as a card, in a lane for its current stage.", keywords: "kanban tasks" },
      { href: "/prds", label: "PRDs", icon: FileText, hint: "Requirements documents that Gravel turns into tasks.", keywords: "requirements product spec" },
      { href: "/map", label: "Map", icon: Waypoints, hint: "How knowledge, tasks and code link to each other, as a graph.", keywords: "graph knowledge map wikilinks backlinks obsidian" },
    ],
  },
  {
    label: "Build",
    more: true,
    items: [
      { href: "/workflows", label: "Workflows", icon: GitBranch, hint: "Design the stages a task moves through, on a canvas.", keywords: "stages pipeline templates roles canvas" },
      { href: "/loops", label: "Loops", icon: Repeat, hint: "Loop engineering: bounded work → check → repeat cycles with exit conditions.", keywords: "loop engineering iterate retry until green exit condition passes budget" },
      { href: "/engineers", label: "Engineers", icon: Bot, hint: "The AI workers that run stages: containers, local runners and AI accounts.", keywords: "agents runtimes containers runners" },
      { href: "/harnesses", label: "Harnesses", icon: Wrench, hint: "Subagents, routing, test gates and limits around each agent run.", keywords: "subagents routing test gate tools turns agent harness" },
    ],
  },
  {
    label: "Manage",
    more: true,
    items: [
      { href: "/integrations", label: "Integrations", icon: Plug, hint: "Connect GitHub and deploy targets; see what engineers may do with them.", keywords: "github gitlab deploy aws connect" },
      { href: "/organizations", label: "Organization", icon: Building2, hint: "Members, tags and branding for this organization.", keywords: "members tags branding" },
      { href: "/users", label: "Team", icon: Users, hint: "Invite people and set their roles.", keywords: "users roles invite", adminOnly: true },
    ],
  },
]

/** Is this page one of the items behind "More"? Then the sidebar opens that section. */
export function isMorePage(pathname: string): boolean {
  return NAV.some((g) => g.more && g.items.some((i) => isActive(pathname, i.href)))
}

export function isActive(pathname: string, href: string): boolean {
  return pathname === href || pathname.startsWith(`${href}/`)
}
