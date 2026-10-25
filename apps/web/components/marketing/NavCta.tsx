"use client"

import Link from "next/link"
import { ArrowRight } from "lucide-react"
import { useAuth } from "@/contexts/AuthContext"

/** Signed-in visitors go straight to their dashboard; everyone else gets sign-in / sign-up. */
export default function NavCta() {
  const { user, isLoading } = useAuth()
  if (!isLoading && user) {
    return (
      <Link href="/home" className="inline-flex items-center gap-1.5 rounded-lg bg-primary px-3.5 py-1.5 text-sm font-medium text-primary-foreground shadow-sm hover:bg-primary/90">
        Open Gravel <ArrowRight className="h-3.5 w-3.5" />
      </Link>
    )
  }
  return (
    <>
      <Link href="/login" className="rounded-lg px-3 py-1.5 text-sm font-medium hover:bg-muted">Sign in</Link>
      <Link href="/signup" className="rounded-lg bg-primary px-3.5 py-1.5 text-sm font-medium text-primary-foreground shadow-sm hover:bg-primary/90">
        Get started
      </Link>
    </>
  )
}
