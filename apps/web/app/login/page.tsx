"use client"

import { useState } from "react"
import Link from "next/link"
import { useRouter } from "next/navigation"
import { Loader2, Eye, EyeOff, ArrowRight } from "lucide-react"
import { Button } from "@/components/ui/button"
import { AuthShell, authInput } from "@/components/marketing/AuthShell"
import { useAuth } from "@/contexts/AuthContext"

const DEMO_ACCOUNTS = [
  { email: "admin@gravel.dev",  role: "Admin",     color: "bg-rose-100 text-rose-700",    password: "demo1234" },
  { email: "dev@gravel.dev",    role: "Developer",  color: "bg-blue-100 text-blue-700",    password: "demo1234" },
  { email: "qa@gravel.dev",     role: "QA",         color: "bg-amber-100 text-amber-700",  password: "demo1234" },
  { email: "pm@gravel.dev",     role: "Product",    color: "bg-purple-100 text-purple-700", password: "demo1234" },
  { email: "devops@gravel.dev", role: "DevOps",     color: "bg-emerald-100 text-emerald-700", password: "demo1234" },
]

// Seeded demo users exist only on demo/dev deployments — don't advertise them elsewhere
const SHOW_DEMO_ACCOUNTS =
  process.env.NODE_ENV === "development" || process.env.NEXT_PUBLIC_DEMO_ACCOUNTS === "true"

export default function LoginPage() {
  const { login } = useAuth()
  const router = useRouter()
  const [email, setEmail] = useState("")
  const [password, setPassword] = useState("")
  const [showPw, setShowPw] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState("")

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError("")
    setLoading(true)
    const result = await login(email, password)
    setLoading(false)
    if (result.ok) router.push("/home")
    else setError(result.error ?? "Login failed")
  }

  function fillDemo(d: typeof DEMO_ACCOUNTS[0]) {
    setEmail(d.email)
    setPassword(d.password)
    setError("")
  }

  return (
    <AuthShell>
      <div className="mb-8">
        <h1 className="mb-1 text-2xl font-semibold tracking-tight">Welcome back</h1>
        <p className="text-sm text-muted-foreground">Sign in to your workspace</p>
      </div>

      <form onSubmit={handleSubmit} className="space-y-4">
        <div className="space-y-1.5">
          <label className="text-sm font-medium" htmlFor="email">Email</label>
          <input
            id="email" type="email" autoFocus required autoComplete="email"
            className={authInput}
            placeholder="you@company.com"
            value={email}
            onChange={(e) => { setEmail(e.target.value); setError("") }}
          />
        </div>
        <div className="space-y-1.5">
          <div className="flex items-center justify-between">
            <label className="text-sm font-medium" htmlFor="password">Password</label>
            <Link href="/forgot-password" className="text-xs text-primary hover:underline">
              Forgot password?
            </Link>
          </div>
          <div className="relative">
            <input
              id="password" type={showPw ? "text" : "password"} required autoComplete="current-password"
              className={`${authInput} pr-10`}
              placeholder="••••••••"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
            />
            <button type="button" aria-label={showPw ? "Hide password" : "Show password"} onClick={() => setShowPw((v) => !v)} className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground">
              {showPw ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
            </button>
          </div>
        </div>

        {error && (
          <div role="alert" className="rounded-lg border border-destructive/20 bg-destructive/10 px-3 py-2.5 text-sm text-destructive">
            {error}
          </div>
        )}

        <Button type="submit" className="w-full" disabled={loading}>
          {loading ? <><Loader2 className="h-4 w-4 animate-spin" /> Signing in…</> : <>Sign in <ArrowRight className="h-4 w-4" /></>}
        </Button>
      </form>

      {SHOW_DEMO_ACCOUNTS && (
        <div className="mt-8">
          <div className="mb-3 flex items-center gap-3">
            <div className="h-px flex-1 bg-border" />
            <span className="text-xs text-muted-foreground">Demo accounts</span>
            <div className="h-px flex-1 bg-border" />
          </div>
          <div className="flex flex-wrap gap-2">
            {DEMO_ACCOUNTS.map((d) => (
              <button
                key={d.email}
                type="button"
                onClick={() => fillDemo(d)}
                className="flex items-center gap-1.5 rounded-lg border px-2.5 py-1.5 text-xs font-medium transition-colors hover:bg-muted"
              >
                <span className={`rounded-full px-1.5 py-0.5 text-[10px] font-semibold ${d.color}`}>{d.role}</span>
              </button>
            ))}
          </div>
          <p className="mt-2 text-[10px] text-muted-foreground">Click a role to pre-fill. Password: demo1234</p>
        </div>
      )}

      <p className="mt-6 text-center text-sm text-muted-foreground">
        Don&apos;t have an account?{" "}
        <Link href="/signup" className="font-medium text-primary hover:underline">Create one</Link>
      </p>
    </AuthShell>
  )
}
