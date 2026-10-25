"use client"

import { useState } from "react"
import Link from "next/link"
import { Building2, Plus, X, Loader2, Users } from "lucide-react"
import { useOrganizations, useCreateOrg } from "@/hooks/useOrganizations"
import { useOrg } from "@/contexts/OrgContext"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { toast } from "sonner"
import { cn } from "@/lib/utils"

function CreateOrgDialog({ onClose }: { onClose: () => void }) {
  const [name, setName] = useState("")
  const createOrg = useCreateOrg()

  async function handleCreate() {
    try {
      await createOrg.mutateAsync({ name: name.trim() })
      toast.success("Organization created")
      onClose()
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to create organization")
    }
  }

  return (
    <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4">
      <div className="bg-background rounded-2xl shadow-xl w-full max-w-sm">
        <div className="flex items-center justify-between px-5 pt-5 pb-4 border-b">
          <h2 className="font-bold text-base">New organization</h2>
          <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-muted transition-colors">
            <X className="w-4 h-4" />
          </button>
        </div>
        <div className="p-5">
          <label className="text-xs font-medium text-muted-foreground block mb-1.5">Name</label>
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && name.trim() && handleCreate()}
            placeholder="e.g. Acme Engineering"
            autoFocus
            className="w-full text-sm px-3 py-2 rounded-lg border bg-background focus:outline-none focus:ring-1 focus:ring-primary"
          />
        </div>
        <div className="px-5 pb-5 flex justify-end gap-2">
          <Button variant="outline" size="sm" onClick={onClose}>Cancel</Button>
          <Button size="sm" onClick={handleCreate} disabled={!name.trim() || createOrg.isPending}>
            {createOrg.isPending && <Loader2 className="w-3.5 h-3.5 animate-spin" />} Create
          </Button>
        </div>
      </div>
    </div>
  )
}

export default function OrganizationsPage() {
  const { data: orgs, isLoading } = useOrganizations()
  const { activeOrg, setActiveOrg } = useOrg()
  const [showCreate, setShowCreate] = useState(false)

  return (
    <div className="h-full overflow-y-auto p-6">
      <div className="max-w-3xl mx-auto">
        <div className="flex items-center justify-between mb-6">
          <div className="flex items-center gap-2">
            <Building2 className="w-5 h-5 text-primary" />
            <h1 className="text-xl font-bold">Organizations</h1>
          </div>
          <Button size="sm" onClick={() => setShowCreate(true)}>
            <Plus className="w-3.5 h-3.5" /> New organization
          </Button>
        </div>

        <p className="text-sm text-muted-foreground mb-6">
          Organizations own your projects, engineers, workflows, PRDs, and tags. Members share
          everything inside; the switcher in the header changes which organization you're working in.
        </p>

        {isLoading ? (
          <div className="text-sm text-muted-foreground">Loading organizations…</div>
        ) : (
          <div className="space-y-3">
            {(orgs ?? []).map((org) => (
              <div
                key={org.id}
                className={cn(
                  "bg-background rounded-xl border p-4 flex items-center gap-4 transition-all",
                  activeOrg?.id === org.id && "border-primary/50 bg-primary/[0.03]"
                )}
              >
                <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center shrink-0">
                  <Building2 className="w-5 h-5 text-primary" />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <Link href={`/organizations/${org.id}`} className="font-semibold text-sm hover:underline">
                      {org.name}
                    </Link>
                    <Badge variant="outline" className="text-[10px]">{org.role}</Badge>
                    {activeOrg?.id === org.id && (
                      <span className="text-[10px] text-primary font-medium">active</span>
                    )}
                  </div>
                  <p className="text-xs text-muted-foreground flex items-center gap-1 mt-0.5">
                    <Users className="w-3 h-3" /> {org.member_count} member{org.member_count !== 1 ? "s" : ""} · {org.slug}
                  </p>
                </div>
                {activeOrg?.id !== org.id && (
                  <Button size="sm" variant="outline" onClick={() => setActiveOrg(org.id)}>
                    Switch to
                  </Button>
                )}
              </div>
            ))}
          </div>
        )}
      </div>

      {showCreate && <CreateOrgDialog onClose={() => setShowCreate(false)} />}
    </div>
  )
}
