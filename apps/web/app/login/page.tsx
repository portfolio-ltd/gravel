"use client"

import { useState } from "react"
import Link from "next/link"
import { useRouter } from "next/navigation"
import { Zap, Loader2, Eye, EyeOff, ArrowRight } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { useAuth } from "@/contexts/AuthContext"

const DEMO_ACCOUNTS = [
  { email: "admin@gravel.dev",  role: "Admin",     color: "bg-rose-100 text-rose-700",    password: "demo1234" },
  { email: "dev@gravel.dev",    role: "Developer",  color: "bg-blue-100 text-blue-700",    password: "demo1234" },
  { email: "qa@gravel.dev",     role: "QA",         color: "bg-amber-100 text-amber-700",  password: "demo1234" },
  { email: "pm@gravel.dev",     role: "Product",    color: "bg-purple-100 text-purple-700", password: "demo1234" },
  { email: "devops@gravel.dev", role: "DevOps",     color: "bg-emerald-100 text-emerald-700", password: "demo1234" },
]

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
    if (result.ok) router.push("/projects")
    else setError(result.error ?? "Login failed")
  }

  function fillDemo(d: typeof DEMO_ACCOUNTS[0]) {
    setEmail(d.email)
    setPassword(d.password)
    setError("")
  }

  return (
    <div className="min-h-screen bg-background flex">
      <div className="hidden lg:flex lg:w-[45%] bg-gradient-to-br from-primary/10 via-primary/5 to-background border-r flex-col justify-between p-10">
        <div className="flex items-center gap-2">
          <div className="w-9 h-9 rounded-xl bg-primary flex items-center justify-center">
            <Zap className="w-5 h-5 text-primary-foreground" />
          </div>
          <span className="font-bold text-lg tracking-tight">Gravel</span>
          <Badge variant="purple" className="text-[10px]">Beta</Badge>
        </div>
        <div>
          <h2 className="text-3xl font-bold tracking-tight mb-4 leading-tight">
            Your AI-powered<br />engineering team.
          </h2>
          <p className="text-muted-foreground leading-relaxed mb-8">
            Upload a PRD. Get a working product. The agent builds, tests, and ships — your team reviews and approves.
          </p>
          <div className="space-y-3">
            {["PRD → tasks in seconds", "Agent builds while you sleep", "Auto QA & deploy pipeline", "Bring your own model keys"].map((item) => (
              <div key={item} className="flex items-center gap-2 text-sm">
                <div className="w-1.5 h-1.5 rounded-full bg-primary" />
                <span className="text-muted-foreground">{item}</span>
              </div>
            ))}
          </div>
        </div>
        <p className="text-xs text-muted-foreground">© 2026 Gravel · Beta</p>
      </div>

      <div className="flex-1 flex flex-col items-center justify-center px-4 py-12">
        <div className="lg:hidden flex items-center gap-2 mb-8">
          <div className="w-8 h-8 rounded-lg bg-primary flex items-center justify-center">
            <Zap className="w-4 h-4 text-primary-foreground" />
          </div>
          <span className="font-bold text-base">Gravel</span>
          <Badge variant="purple" className="text-[10px]">Beta</Badge>
        </div>

        <div className="w-full max-w-sm">
          <div className="mb-8">
            <h1 className="text-2xl font-bold tracking-tight mb-1">Welcome back</h1>
            <p className="text-muted-foreground text-sm">Sign in to your workspace</p>
          </div>

          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="space-y-1.5">
              <label className="text-sm font-medium">Email</label>
              <input
                type="email" autoFocus required
                className="w-full rounded-lg border bg-background px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-ring placeholder:text-muted-foreground"
                placeholder="you@company.com"
                value={email}
                onChange={(e) => { setEmail(e.target.value); setError("") }}
              />
            </div>
            <div className="space-y-1.5">
              <label className="text-sm font-medium">Password</label>
              <div className="relative">
                <input
                  type={showPw ? "text" : "password"} required
                  className="w-full rounded-lg border bg-background px-3 py-2.5 pr-10 text-sm focus:outline-none focus:ring-2 focus:ring-ring placeholder:text-muted-foreground"
                  placeholder="••••••••"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                />
                <button type="button" onClick={() => setShowPw((v) => !v)} className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground">
                  {showPw ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
            </div>

            {error && (
              <div className="rounded-lg bg-destructive/10 border border-destructive/20 px-3 py-2.5 text-sm text-destructive">
                {error}
              </div>
            )}

            <Button type="submit" className="w-full" disabled={loading}>
              {loading ? <><Loader2 className="w-4 h-4 animate-spin" /> Signing in…</> : <>Sign in <ArrowRight className="w-4 h-4" /></>}
            </Button>
          </form>

          <div className="mt-8">
            <div className="flex items-center gap-3 mb-3">
              <div className="flex-1 h-px bg-border" />
              <span className="text-xs text-muted-foreground">Demo accounts</span>
              <div className="flex-1 h-px bg-border" />
            </div>
            <div className="flex flex-wrap gap-2">
              {DEMO_ACCOUNTS.map((d) => (
                <button
                  key={d.email}
                  onClick={() => fillDemo(d)}
                  className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg border text-xs font-medium hover:bg-muted transition-colors"
                >
                  <span className={`px-1.5 py-0.5 rounded-full text-[10px] font-semibold ${d.color}`}>{d.role}</span>
                </button>
              ))}
            </div>
            <p className="text-[10px] text-muted-foreground mt-2">Click a role to pre-fill. Password: demo1234</p>
          </div>

          <p className="mt-6 text-center text-sm text-muted-foreground">
            Don&apos;t have an account?{" "}
            <Link href="/signup" className="text-primary font-medium hover:underline">Sign up free</Link>
          </p>
        </div>
      </div>
    </div>
  )
}
