"use client"

import { Suspense, useState } from "react"
import Link from "next/link"
import { useRouter, useSearchParams } from "next/navigation"
import { Zap, Loader2 } from "lucide-react"
import { apiFetch } from "@/lib/api"
import { Button } from "@/components/ui/button"
import { toast } from "sonner"

function ResetPasswordForm() {
  const router = useRouter()
  const token = useSearchParams().get("token") ?? ""
  const [password, setPassword] = useState("")
  const [confirm, setConfirm] = useState("")
  const [saving, setSaving] = useState(false)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (password !== confirm) {
      toast.error("Passwords don't match")
      return
    }
    setSaving(true)
    try {
      await apiFetch("/api/auth/reset-password", {
        method: "POST",
        body: JSON.stringify({ token, password }),
      })
      toast.success("Password updated — sign in with your new password")
      router.push("/login")
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Reset failed")
    } finally {
      setSaving(false)
    }
  }

  if (!token) {
    return (
      <div className="text-center py-6">
        <h1 className="font-semibold mb-1">Invalid link</h1>
        <p className="text-sm text-muted-foreground mb-4">This reset link is missing its token.</p>
        <Link href="/forgot-password" className="text-sm text-primary hover:underline">Request a new one</Link>
      </div>
    )
  }

  return (
    <>
      <h1 className="font-semibold mb-1">Choose a new password</h1>
      <p className="text-sm text-muted-foreground mb-5">At least 8 characters.</p>
      <form onSubmit={handleSubmit} className="space-y-4">
        <input
          type="password"
          required
          minLength={8}
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          placeholder="New password"
          autoFocus
          className="w-full text-sm px-3 py-2.5 rounded-lg border bg-background focus:outline-none focus:ring-2 focus:ring-ring"
        />
        <input
          type="password"
          required
          value={confirm}
          onChange={(e) => setConfirm(e.target.value)}
          placeholder="Confirm new password"
          className="w-full text-sm px-3 py-2.5 rounded-lg border bg-background focus:outline-none focus:ring-2 focus:ring-ring"
        />
        <Button type="submit" className="w-full" disabled={password.length < 8 || saving}>
          {saving && <Loader2 className="w-4 h-4 animate-spin" />} Update password
        </Button>
      </form>
    </>
  )
}

export default function ResetPasswordPage() {
  return (
    <div className="min-h-screen flex items-center justify-center bg-muted/30 p-4">
      <div className="w-full max-w-sm bg-background rounded-2xl border shadow-sm p-6">
        <div className="flex items-center gap-2 mb-6">
          <div className="w-8 h-8 rounded-lg bg-primary flex items-center justify-center">
            <Zap className="w-4 h-4 text-primary-foreground" />
          </div>
          <span className="font-bold">Gravel</span>
        </div>
        <Suspense>
          <ResetPasswordForm />
        </Suspense>
      </div>
    </div>
  )
}
