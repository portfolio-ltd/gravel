"use client"

import { Suspense, useEffect, useState } from "react"
import Link from "next/link"
import { useSearchParams } from "next/navigation"
import { Loader2, MailCheck, MailX } from "lucide-react"
import { apiFetch } from "@/lib/api"
import { AuthCard } from "@/components/marketing/AuthShell"

function VerifyEmailBody() {
  const token = useSearchParams().get("token") ?? ""
  const [state, setState] = useState<"working" | "done" | "failed">("working")
  const [email, setEmail] = useState("")

  useEffect(() => {
    if (!token) {
      setState("failed")
      return
    }
    apiFetch<{ email: string }>("/api/auth/verify-email", {
      method: "POST",
      body: JSON.stringify({ token }),
    })
      .then((res) => {
        setEmail(res.email)
        setState("done")
      })
      .catch(() => setState("failed"))
  }, [token])

  if (state === "working") {
    return (
      <div className="text-center py-6">
        <Loader2 className="w-8 h-8 animate-spin text-primary mx-auto mb-3" />
        <p className="text-sm text-muted-foreground">Confirming your email…</p>
      </div>
    )
  }

  if (state === "failed") {
    return (
      <div className="text-center py-6">
        <MailX className="w-10 h-10 text-destructive mx-auto mb-3" />
        <h1 className="font-semibold mb-1">Verification failed</h1>
        <p className="text-sm text-muted-foreground mb-4">
          This link is invalid or has expired. You can request a new one from Settings after signing in.
        </p>
        <Link href="/login" className="text-sm text-primary hover:underline">Go to sign in</Link>
      </div>
    )
  }

  return (
    <div className="text-center py-6">
      <MailCheck className="w-10 h-10 text-success mx-auto mb-3" />
      <h1 className="font-semibold mb-1">Email confirmed</h1>
      <p className="text-sm text-muted-foreground mb-4">
        {email} is verified. You're all set.
      </p>
      <Link href="/home" className="text-sm text-primary hover:underline">Open the app</Link>
    </div>
  )
}

export default function VerifyEmailPage() {
  return (
    <AuthCard>
      <Suspense>
        <VerifyEmailBody />
      </Suspense>
    </AuthCard>
  )
}
