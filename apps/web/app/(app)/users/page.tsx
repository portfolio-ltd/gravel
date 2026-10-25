"use client"

import { useState } from "react"
import { Plus, Search, Trash2, Pencil, Shield, UserCheck, AlertCircle } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Avatar, AvatarFallback } from "@/components/ui/avatar"
import { DropdownMenu, DropdownMenuTrigger, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator } from "@/components/ui/dropdown"
import InviteUserDialog from "@/components/InviteUserDialog"
import EditUserDialog from "@/components/EditUserDialog"
import { useUsers, useDeleteUser } from "@/hooks/useUsers"
import { useAuth } from "@/contexts/AuthContext"
import { cn, getInitials, formatRelativeTime } from "@/lib/utils"
import { toast } from "sonner"
import type { User, UserRole } from "@/types"

const ROLE_COLORS: Record<UserRole, string> = {
  admin:     "bg-rose-100 text-rose-700",
  developer: "bg-blue-100 text-blue-700",
  qa:        "bg-amber-100 text-amber-700",
  product:   "bg-purple-100 text-purple-700",
  devops:    "bg-emerald-100 text-emerald-700",
}

const ROLE_LABELS: Record<UserRole, string> = {
  admin:     "Admin",
  developer: "Developer",
  qa:        "QA",
  product:   "Product",
  devops:    "DevOps",
}

const PERMISSIONS: Record<UserRole, string[]> = {
  admin:     ["Create projects", "Manage users", "Invite members", "Run agent", "Deploy", "Delete anything"],
  developer: ["View projects", "Build tasks", "Review code", "Run agent"],
  qa:        ["View projects", "Test tasks", "Approve tasks"],
  product:   ["Create projects", "Upload PRDs", "Create tasks", "Review"],
  devops:    ["View projects", "Run agent", "Manage deploys & pipelines"],
}

interface UserRowProps {
  user: User
  isSelf: boolean
  onEdit: () => void
  onDelete: () => void
}

function UserRow({ user, isSelf, onEdit, onDelete }: UserRowProps) {
  return (
    <div className="flex items-center gap-4 px-5 py-3.5 hover:bg-muted/50 transition-colors group border-b last:border-b-0">
      <Avatar className="w-9 h-9 shrink-0">
        <AvatarFallback className={cn("text-xs font-semibold", ROLE_COLORS[user.role])}>
          {getInitials(user.name)}
        </AvatarFallback>
      </Avatar>

      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          <p className="text-sm font-medium truncate">{user.name}</p>
          {isSelf && <span className="text-[10px] font-semibold text-primary bg-primary/10 px-1.5 py-0.5 rounded">You</span>}
          {!user.is_active && (
            <span className="text-[10px] font-semibold text-muted-foreground bg-muted px-1.5 py-0.5 rounded flex items-center gap-1">
              <AlertCircle className="w-2.5 h-2.5" /> Inactive
            </span>
          )}
        </div>
        <p className="text-xs text-muted-foreground truncate">{user.email}</p>
      </div>

      <span className={cn("text-xs font-semibold px-2 py-0.5 rounded-full shrink-0", ROLE_COLORS[user.role])}>
        {ROLE_LABELS[user.role]}
      </span>

      <span className="text-xs text-muted-foreground hidden sm:block shrink-0 w-24 text-right">
        {formatRelativeTime(user.created_at)}
      </span>

      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <button className="opacity-0 group-hover:opacity-100 p-1.5 rounded-lg hover:bg-muted transition-all">
            <Pencil className="w-3.5 h-3.5" />
          </button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-40">
          <DropdownMenuItem onClick={onEdit}>
            <Pencil className="w-3.5 h-3.5" /> Edit member
          </DropdownMenuItem>
          {!isSelf && (
            <>
              <DropdownMenuSeparator />
              <DropdownMenuItem className="text-destructive focus:text-destructive" onClick={onDelete}>
                <Trash2 className="w-3.5 h-3.5" /> Remove
              </DropdownMenuItem>
            </>
          )}
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  )
}

export default function UsersPage() {
  const { data: users = [], isLoading } = useUsers()
  const deleteUser = useDeleteUser()
  const { user: currentUser } = useAuth()
  const [search, setSearch] = useState("")
  const [inviteOpen, setInviteOpen] = useState(false)
  const [editUser, setEditUser] = useState<User | null>(null)

  if (currentUser?.role !== "admin") {
    return (
      <div className="flex-1 flex flex-col items-center justify-center gap-3 p-8 text-center">
        <div className="w-12 h-12 rounded-2xl bg-muted flex items-center justify-center">
          <Shield className="w-6 h-6 text-muted-foreground" />
        </div>
        <p className="text-sm font-medium">Admin access required</p>
        <p className="text-xs text-muted-foreground">Only admins can manage team members.</p>
      </div>
    )
  }

  const filtered = users.filter(
    (u) =>
      u.name.toLowerCase().includes(search.toLowerCase()) ||
      u.email.toLowerCase().includes(search.toLowerCase()) ||
      u.role.toLowerCase().includes(search.toLowerCase())
  )

  const roleCounts = users.reduce<Record<string, number>>((acc, u) => {
    acc[u.role] = (acc[u.role] ?? 0) + 1
    return acc
  }, {})

  async function handleDelete(user: User) {
    if (!confirm(`Remove "${user.name}" from the team?`)) return
    try {
      await deleteUser.mutateAsync(user.id)
      toast.success("Member removed")
    } catch { toast.error("Failed to remove member") }
  }

  return (
    <div className="h-full overflow-y-auto no-scrollbar">
      <div className="max-w-5xl mx-auto p-6 space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-xl font-bold">Team</h1>
            <p className="text-sm text-muted-foreground">{users.length} member{users.length !== 1 ? "s" : ""}</p>
          </div>
          <Button onClick={() => setInviteOpen(true)}>
            <Plus className="w-4 h-4" /> Invite member
          </Button>
        </div>

        {/* Role stats */}
        <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
          {(Object.keys(ROLE_LABELS) as UserRole[]).map((role) => (
            <div key={role} className="rounded-xl border bg-card px-4 py-3 text-center">
              <p className="text-2xl font-bold">{roleCounts[role] ?? 0}</p>
              <p className={cn("text-xs font-semibold mt-0.5 px-2 py-0.5 rounded-full inline-block", ROLE_COLORS[role])}>
                {ROLE_LABELS[role]}
              </p>
            </div>
          ))}
        </div>

        {/* Search */}
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <input
            className="w-full rounded-xl border bg-background pl-9 pr-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-ring placeholder:text-muted-foreground"
            placeholder="Search by name, email, or role…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>

        {/* Members table */}
        <div className="rounded-2xl border bg-card overflow-hidden">
          <div className="flex items-center px-5 py-3 border-b bg-muted/50">
            <p className="text-xs font-semibold text-muted-foreground flex-1">Member</p>
            <p className="text-xs font-semibold text-muted-foreground w-24 shrink-0">Role</p>
            <p className="text-xs font-semibold text-muted-foreground hidden sm:block w-24 text-right shrink-0">Joined</p>
            <div className="w-8" />
          </div>

          {isLoading ? (
            Array.from({ length: 5 }).map((_, i) => (
              <div key={i} className="h-16 border-b last:border-b-0 px-5 flex items-center gap-4">
                <div className="w-9 h-9 rounded-full bg-muted animate-pulse" />
                <div className="flex-1 space-y-1.5">
                  <div className="h-3 rounded bg-muted animate-pulse w-32" />
                  <div className="h-2.5 rounded bg-muted animate-pulse w-48" />
                </div>
              </div>
            ))
          ) : filtered.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-12 text-center">
              <UserCheck className="w-7 h-7 text-muted-foreground mb-2" />
              <p className="text-sm text-muted-foreground">
                {search ? "No members match your search" : "No team members yet"}
              </p>
            </div>
          ) : (
            filtered.map((u) => (
              <UserRow
                key={u.id}
                user={u}
                isSelf={u.id === currentUser?.id}
                onEdit={() => setEditUser(u)}
                onDelete={() => handleDelete(u)}
              />
            ))
          )}
        </div>

        {/* Permissions matrix */}
        <div className="rounded-2xl border bg-card overflow-hidden">
          <div className="px-5 py-4 border-b">
            <h3 className="text-sm font-semibold">Permissions reference</h3>
            <p className="text-xs text-muted-foreground mt-0.5">What each role can do</p>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b bg-muted/30">
                  <th className="text-left px-5 py-3 text-xs font-semibold text-muted-foreground">Capability</th>
                  {(Object.keys(ROLE_LABELS) as UserRole[]).map((role) => (
                    <th key={role} className="px-4 py-3 text-center">
                      <span className={cn("text-[10px] font-semibold px-1.5 py-0.5 rounded", ROLE_COLORS[role])}>
                        {ROLE_LABELS[role]}
                      </span>
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {[
                  "Create projects",
                  "Manage users",
                  "Invite members",
                  "Upload PRDs",
                  "Run agent",
                  "Build tasks",
                  "Test tasks",
                  "Review",
                  "Deploy",
                  "Delete anything",
                ].map((cap) => (
                  <tr key={cap} className="border-b last:border-b-0 hover:bg-muted/30 transition-colors">
                    <td className="px-5 py-2.5 text-xs text-muted-foreground">{cap}</td>
                    {(Object.keys(ROLE_LABELS) as UserRole[]).map((role) => (
                      <td key={role} className="px-4 py-2.5 text-center">
                        {PERMISSIONS[role].includes(cap) ? (
                          <span className="text-emerald-600 text-base leading-none">✓</span>
                        ) : (
                          <span className="text-muted-foreground/30 text-base leading-none">–</span>
                        )}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      <InviteUserDialog open={inviteOpen} onOpenChange={setInviteOpen} />
      <EditUserDialog user={editUser} open={!!editUser} onOpenChange={(v) => { if (!v) setEditUser(null) }} />
    </div>
  )
}
