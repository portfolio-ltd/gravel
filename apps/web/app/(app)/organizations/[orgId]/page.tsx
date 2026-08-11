"use client"

import { use, useState } from "react"
import { useRouter } from "next/navigation"
import { Building2, Trash2, UserPlus, Loader2 } from "lucide-react"
import {
  useOrganization, useUpdateOrg, useDeleteOrg,
  useAddMember, useUpdateMemberRole, useRemoveMember,
} from "@/hooks/useOrganizations"
import { useOrg } from "@/contexts/OrgContext"
import { useAuth } from "@/contexts/AuthContext"
import { useTags, useCreateTag, useDeleteTag } from "@/hooks/useTags"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { toast } from "sonner"
import { formatRelativeTime, getInitials } from "@/lib/utils"
import { Avatar, AvatarFallback } from "@/components/ui/avatar"
import type { OrgRole } from "@/types"

const TAG_SWATCHES = ["#6366f1", "#3b82f6", "#8b5cf6", "#ef4444", "#22c55e", "#f59e0b", "#14b8a6", "#ec4899"]

function TagsManager({ isAdmin }: { isAdmin: boolean }) {
  const { data: tags } = useTags()
  const createTag = useCreateTag()
  const deleteTag = useDeleteTag()
  const [name, setName] = useState("")
  const [color, setColor] = useState(TAG_SWATCHES[0])

  async function handleCreate() {
    if (!name.trim()) return
    try {
      await createTag.mutateAsync({ name: name.trim(), color })
      setName("")
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to create tag")
    }
  }

  return (
    <div className="bg-background rounded-xl border mb-6">
      <div className="px-4 py-3 border-b">
        <h2 className="text-sm font-semibold">Tags</h2>
        <p className="text-xs text-muted-foreground">Label tasks and PRDs; filter the board by tag.</p>
      </div>
      <div className="p-4 flex items-center gap-2 flex-wrap">
        {(tags ?? []).map((tag) => (
          <span
            key={tag.id}
            className="inline-flex items-center gap-1 text-[11px] px-2.5 py-1 rounded-full font-medium group"
            style={{ backgroundColor: `${tag.color}22`, color: tag.color }}
          >
            {tag.name}
            {isAdmin && (
              <button
                onClick={() => deleteTag.mutate(tag.id)}
                className="opacity-40 group-hover:opacity-100 hover:font-bold transition-opacity"
                title="Delete tag"
              >
                ×
              </button>
            )}
          </span>
        ))}
        {(tags ?? []).length === 0 && <p className="text-xs text-muted-foreground">No tags yet.</p>}
      </div>
      {isAdmin && (
        <div className="px-4 py-3 border-t flex items-center gap-2 flex-wrap">
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && handleCreate()}
            placeholder="New tag name…"
            className="flex-1 min-w-[140px] text-sm px-3 py-2 rounded-lg border bg-background focus:outline-none focus:ring-1 focus:ring-primary"
          />
          <div className="flex items-center gap-1">
            {TAG_SWATCHES.map((c) => (
              <button
                key={c}
                onClick={() => setColor(c)}
                className="w-5 h-5 rounded-full border-2 transition-transform hover:scale-110"
                style={{ backgroundColor: c, borderColor: color === c ? "black" : "transparent" }}
              />
            ))}
            <input
              type="color"
              value={color}
              onChange={(e) => setColor(e.target.value)}
              className="w-6 h-6 rounded cursor-pointer border-0 bg-transparent"
              title="Custom color"
            />
          </div>
          <Button size="sm" onClick={handleCreate} disabled={!name.trim() || createTag.isPending}>
            Add tag
          </Button>
        </div>
      )}
    </div>
  )
}

export default function OrganizationDetailPage({ params }: { params: Promise<{ orgId: string }> }) {
  const { orgId } = use(params)
  const router = useRouter()
  const { user } = useAuth()
  const { orgs } = useOrg()
  const { data: org, isLoading } = useOrganization(orgId)
  const updateOrg = useUpdateOrg()
  const deleteOrg = useDeleteOrg()
  const addMember = useAddMember()
  const updateRole = useUpdateMemberRole()
  const removeMember = useRemoveMember()
  const [inviteEmail, setInviteEmail] = useState("")

  const myRole = orgs.find((o) => o.id === orgId)?.role
  const isAdmin = myRole === "admin"

  async function handleInvite() {
    if (!inviteEmail.trim()) return
    try {
      await addMember.mutateAsync({ orgId, email: inviteEmail.trim() })
      toast.success(`${inviteEmail.trim()} added`)
      setInviteEmail("")
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to add member")
    }
  }

  async function handleRole(userId: string, role: OrgRole) {
    try {
      await updateRole.mutateAsync({ orgId, userId, role })
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to change role")
    }
  }

  async function handleRemove(userId: string, email: string) {
    if (!confirm(`Remove ${email} from this organization?`)) return
    try {
      await removeMember.mutateAsync({ orgId, userId })
      toast.success("Member removed")
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to remove member")
    }
  }

  async function handleDelete() {
    if (!org) return
    if (!confirm(`Delete organization "${org.name}"? Projects must be moved out first.`)) return
    try {
      await deleteOrg.mutateAsync(orgId)
      toast.success("Organization deleted")
      router.push("/organizations")
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to delete organization")
    }
  }

  if (isLoading || !org) {
    return <div className="p-6 text-sm text-muted-foreground">Loading organization…</div>
  }

  return (
    <div className="h-full overflow-y-auto p-6">
      <div className="max-w-3xl mx-auto">
        <div className="flex items-center gap-2 mb-1">
          <Building2 className="w-5 h-5 text-primary" />
          {isAdmin ? (
            <input
              defaultValue={org.name}
              onBlur={(e) => {
                const v = e.target.value.trim()
                if (v && v !== org.name) {
                  updateOrg.mutate({ id: orgId, name: v }, {
                    onSuccess: () => toast.success("Renamed"),
                    onError: (err) => toast.error(err instanceof Error ? err.message : "Rename failed"),
                  })
                }
              }}
              className="text-xl font-bold bg-transparent focus:outline-none focus:ring-1 focus:ring-primary rounded px-1 flex-1"
            />
          ) : (
            <h1 className="text-xl font-bold">{org.name}</h1>
          )}
        </div>
        <button onClick={() => router.push("/organizations")} className="text-xs text-muted-foreground hover:text-foreground mb-6">
          ← Back to organizations
        </button>

        {/* Members */}
        <div className="bg-background rounded-xl border mb-6">
          <div className="px-4 py-3 border-b flex items-center justify-between">
            <h2 className="text-sm font-semibold">Members ({org.members.length})</h2>
          </div>
          <div className="divide-y">
            {org.members.map((m) => (
              <div key={m.user_id} className="px-4 py-3 flex items-center gap-3">
                <Avatar className="w-8 h-8">
                  <AvatarFallback className="text-[10px]">{getInitials(m.name)}</AvatarFallback>
                </Avatar>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium truncate">
                    {m.name} {m.user_id === user?.id && <span className="text-xs text-muted-foreground">(you)</span>}
                  </p>
                  <p className="text-xs text-muted-foreground truncate">{m.email}</p>
                </div>
                <span className="text-[10px] text-muted-foreground hidden sm:block">
                  joined {formatRelativeTime(m.joined_at)}
                </span>
                {isAdmin ? (
                  <select
                    value={m.role}
                    onChange={(e) => handleRole(m.user_id, e.target.value as OrgRole)}
                    className="text-xs px-2 py-1 rounded-lg border bg-background"
                  >
                    <option value="admin">admin</option>
                    <option value="member">member</option>
                  </select>
                ) : (
                  <Badge variant="outline" className="text-[10px]">{m.role}</Badge>
                )}
                {(isAdmin || m.user_id === user?.id) && (
                  <button
                    onClick={() => handleRemove(m.user_id, m.email)}
                    className="p-1.5 rounded-lg hover:bg-destructive/10 text-muted-foreground hover:text-destructive"
                    title={m.user_id === user?.id ? "Leave organization" : "Remove member"}
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                )}
              </div>
            ))}
          </div>
          {isAdmin && (
            <div className="px-4 py-3 border-t flex gap-2">
              <input
                value={inviteEmail}
                onChange={(e) => setInviteEmail(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && handleInvite()}
                placeholder="teammate@company.com"
                className="flex-1 text-sm px-3 py-2 rounded-lg border bg-background focus:outline-none focus:ring-1 focus:ring-primary"
              />
              <Button size="sm" onClick={handleInvite} disabled={!inviteEmail.trim() || addMember.isPending}>
                {addMember.isPending ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <UserPlus className="w-3.5 h-3.5" />}
                Add member
              </Button>
            </div>
          )}
        </div>

        {/* Tags */}
        <TagsManager isAdmin={isAdmin} />

        {/* Danger zone */}
        {isAdmin && (
          <div className="rounded-xl border border-destructive/30 p-4 flex items-center justify-between">
            <div>
              <p className="text-sm font-semibold">Delete organization</p>
              <p className="text-xs text-muted-foreground">Projects must be moved or deleted first.</p>
            </div>
            <Button size="sm" variant="destructive" onClick={handleDelete} disabled={deleteOrg.isPending}>
              <Trash2 className="w-3.5 h-3.5" /> Delete
            </Button>
          </div>
        )}
      </div>
    </div>
  )
}
