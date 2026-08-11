"use client"

import { useState } from "react"
import Link from "next/link"
import { Zap, Loader2, MailCheck } from "lucide-react"
import { apiFetch } from "@/lib/api"
import { Button } from "@/components/ui/button"
import { toast } from "sonner"

export default function ForgotPasswordPage() {
  const [email, setEmail] = useState("")
  const [sending, setSending] = useState(false)
  const [sent, setSent] = useState(false)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setSending(true)
    try {
      await apiFetch("/api/auth/forgot-password", {
        method: "POST",
        body: JSON.stringify({ email }),
      })
      setSent(true)
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Something went wrong")
    } finally {
      setSending(false)
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-muted/30 p-4">
      <div className="w-full max-w-sm bg-background rounded-2xl border shadow-sm p-6">
        <div className="flex items-center gap-2 mb-6">
          <div className="w-8 h-8 rounded-lg bg-primary flex items-center justify-center">
            <Zap className="w-4 h-4 text-primary-foreground" />
          </div>
          <span className="font-bold">Gravel</span>
        </div>

        {sent ? (
          <div className="text-center py-6">
            <MailCheck className="w-10 h-10 text-emerald-600 mx-auto mb-3" />
            <h1 className="font-semibold mb-1">Check your inbox</h1>
            <p className="text-sm text-muted-foreground mb-4">
              If an account exists for <b>{email}</b>, a reset link is on its way.
              It expires in 30 minutes.
            </p>
            <Link href="/login" className="text-sm text-primary hover:underline">Back to sign in</Link>
          </div>
        ) : (
          <>
            <h1 className="font-semibold mb-1">Forgot your password?</h1>
            <p className="text-sm text-muted-foreground mb-5">
              Enter your email and we'll send you a reset link.
            </p>
            <form onSubmit={handleSubmit} className="space-y-4">
              <input
                type="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="you@company.com"
                autoFocus
                className="w-full text-sm px-3 py-2.5 rounded-lg border bg-background focus:outline-none focus:ring-2 focus:ring-ring"
              />
              <Button type="submit" className="w-full" disabled={!email || sending}>
                {sending && <Loader2 className="w-4 h-4 animate-spin" />} Send reset link
              </Button>
            </form>
            <p className="text-xs text-muted-foreground text-center mt-4">
              Remembered it? <Link href="/login" className="text-primary hover:underline">Sign in</Link>
            </p>
          </>
        )}
      </div>
    </div>
  )
}
