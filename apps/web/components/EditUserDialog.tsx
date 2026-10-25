"use client"

import { useState, useEffect } from "react"
import { Loader2 } from "lucide-react"
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import { cn } from "@/lib/utils"
import { useUpdateUser } from "@/hooks/useUsers"
import { toast } from "sonner"
import type { User, UserRole } from "@/types"

const ROLES: { value: UserRole; label: string; color: string }[] = [
  { value: "admin",     label: "Admin",     color: "border-rose-300 bg-rose-50 text-rose-700" },
  { value: "developer", label: "Developer", color: "border-blue-300 bg-blue-50 text-blue-700" },
  { value: "qa",        label: "QA",        color: "border-amber-300 bg-amber-50 text-amber-700" },
  { value: "product",   label: "Product",   color: "border-purple-300 bg-purple-50 text-purple-700" },
  { value: "devops",    label: "DevOps",    color: "border-emerald-300 bg-emerald-50 text-emerald-700" },
]

interface EditUserDialogProps {
  user: User | null
  open: boolean
  onOpenChange: (v: boolean) => void
}

export default function EditUserDialog({ user, open, onOpenChange }: EditUserDialogProps) {
  const [name, setName] = useState("")
  const [role, setRole] = useState<UserRole>("developer")
  const update = useUpdateUser()

  useEffect(() => {
    if (user) {
      setName(user.name)
      setRole(user.role)
    }
  }, [user])

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!user) return
    try {
      await update.mutateAsync({ id: user.id, name: name.trim(), role })
      toast.success("User updated")
      onOpenChange(false)
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : "Failed to update user"
      toast.error(message)
    }
  }

  return (
    <Dialog open={open} onOpenChange={(v) => { if (!update.isPending) onOpenChange(v) }}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle>Edit member</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-1.5">
            <label className="text-sm font-medium">Name</label>
            <input
              autoFocus required
              className="w-full rounded-lg border bg-background px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
              value={name} onChange={(e) => setName(e.target.value)}
            />
          </div>
          <div className="space-y-1.5">
            <label className="text-sm font-medium">Role</label>
            <div className="flex flex-wrap gap-2">
              {ROLES.map((r) => (
                <button
                  key={r.value}
                  type="button"
                  onClick={() => setRole(r.value)}
                  className={cn(
                    "px-3 py-1.5 rounded-lg border-2 text-xs font-semibold transition-all",
                    role === r.value ? r.color : "border-border hover:border-muted-foreground/40"
                  )}
                >
                  {r.label}
                </button>
              ))}
            </div>
          </div>
          <div className="flex gap-2 pt-1">
            <Button type="button" variant="outline" className="flex-1" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button type="submit" className="flex-1" disabled={update.isPending || !name.trim()}>
              {update.isPending ? <><Loader2 className="w-4 h-4 animate-spin" /> Saving…</> : "Save changes"}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  )
}
