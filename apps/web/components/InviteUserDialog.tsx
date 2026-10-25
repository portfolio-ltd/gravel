"use client"

import { useState } from "react"
import { Loader2 } from "lucide-react"
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import { cn } from "@/lib/utils"
import { useInviteUser } from "@/hooks/useUsers"
import { toast } from "sonner"
import type { UserRole } from "@/types"

const ROLES: { value: UserRole; label: string; desc: string; color: string }[] = [
  { value: "admin",     label: "Admin",     desc: "Full access + user mgmt",    color: "border-rose-300 bg-rose-50 text-rose-700" },
  { value: "developer", label: "Developer", desc: "Build tasks, review code",    color: "border-blue-300 bg-blue-50 text-blue-700" },
  { value: "qa",        label: "QA",        desc: "Test & approve tasks",        color: "border-amber-300 bg-amber-50 text-amber-700" },
  { value: "product",   label: "Product",   desc: "Create projects, upload PRDs",color: "border-purple-300 bg-purple-50 text-purple-700" },
  { value: "devops",    label: "DevOps",    desc: "Manage deploys & pipelines",  color: "border-emerald-300 bg-emerald-50 text-emerald-700" },
]

interface InviteUserDialogProps {
  open: boolean
  onOpenChange: (v: boolean) => void
}

export default function InviteUserDialog({ open, onOpenChange }: InviteUserDialogProps) {
  const [name, setName] = useState("")
  const [email, setEmail] = useState("")
  const [role, setRole] = useState<UserRole>("developer")
  const invite = useInviteUser()

  function reset() {
    setName("")
    setEmail("")
    setRole("developer")
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    try {
      await invite.mutateAsync({ name: name.trim(), email: email.trim(), role })
      toast.success(`Invitation sent to ${email}`)
      onOpenChange(false)
      reset()
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : "Failed to invite user"
      toast.error(message)
    }
  }

  return (
    <Dialog open={open} onOpenChange={(v) => { if (!invite.isPending) { onOpenChange(v); if (!v) reset() } }}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Invite team member</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-1.5">
            <label className="text-sm font-medium">Full name</label>
            <input
              autoFocus required
              className="w-full rounded-lg border bg-background px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-ring placeholder:text-muted-foreground"
              placeholder="Alex Rivera"
              value={name} onChange={(e) => setName(e.target.value)}
            />
          </div>
          <div className="space-y-1.5">
            <label className="text-sm font-medium">Work email</label>
            <input
              type="email" required
              className="w-full rounded-lg border bg-background px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-ring placeholder:text-muted-foreground"
              placeholder="alex@company.com"
              value={email} onChange={(e) => setEmail(e.target.value)}
            />
          </div>
          <div className="space-y-1.5">
            <label className="text-sm font-medium">Role</label>
            <div className="grid grid-cols-1 gap-2">
              {ROLES.map((r) => (
                <button
                  key={r.value}
                  type="button"
                  onClick={() => setRole(r.value)}
                  className={cn(
                    "text-left rounded-xl border-2 px-3 py-2 flex items-center gap-3 transition-all",
                    role === r.value ? r.color : "border-border hover:border-muted-foreground/40"
                  )}
                >
                  <div className={cn("w-3.5 h-3.5 rounded-full border-2 shrink-0 flex items-center justify-center",
                    role === r.value ? "border-current" : "border-muted-foreground/40"
                  )}>
                    {role === r.value && <div className="w-1.5 h-1.5 rounded-full bg-current" />}
                  </div>
                  <div>
                    <span className="text-xs font-semibold">{r.label}</span>
                    <span className="text-xs text-muted-foreground ml-2">{r.desc}</span>
                  </div>
                </button>
              ))}
            </div>
          </div>
          <div className="flex gap-2 pt-1">
            <Button type="button" variant="outline" className="flex-1" onClick={() => { onOpenChange(false); reset() }}>
              Cancel
            </Button>
            <Button type="submit" className="flex-1" disabled={invite.isPending || !name || !email}>
              {invite.isPending ? <><Loader2 className="w-4 h-4 animate-spin" /> Inviting…</> : "Send invite"}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  )
}
