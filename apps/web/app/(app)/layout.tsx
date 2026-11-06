"use client"

import { useEffect } from "react"
import { useRouter } from "next/navigation"
import { Loader2 } from "lucide-react"
import AppShell from "@/components/AppShell"
import { OrgProvider } from "@/contexts/OrgContext"
import { useAuth } from "@/contexts/AuthContext"

export default function AppLayout({ children }: { children: React.ReactNode }) {
  const { user, isLoading } = useAuth()
  const router = useRouter()

  // Nothing below may query the API until the session is restored — otherwise
  // every query fires unauthenticated first and races the token refresh.
  useEffect(() => {
    // Keep where they were going (e.g. a /cli?code=… device login link) for after sign-in
    if (!isLoading && !user) {
      router.replace(`/login?next=${encodeURIComponent(window.location.pathname + window.location.search)}`)
    }
  }, [isLoading, user, router])

  if (isLoading || !user) {
    return (
      <div className="flex h-screen items-center justify-center bg-background">
        <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" aria-label="Loading" />
      </div>
    )
  }

  return (
    <OrgProvider>
      <AppShell>{children}</AppShell>
    </OrgProvider>
  )
}
