"use client"

import { useState } from "react"
import Link from "next/link"
import { useRouter } from "next/navigation"
import { Zap, Loader2, Eye, EyeOff, ArrowRight, CheckCircle2 } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { useAuth } from "@/contexts/AuthContext"
import { cn } from "@/lib/utils"

type UserRole = "admin" | "developer" | "qa" | "product" | "devops"

const ROLES: { value: UserRole; label: string; desc: string; color: string }[] = [
  { value: "admin",     label: "Admin",     desc: "Full access + user management",    color: "border-rose-300 bg-rose-50 text-rose-700" },
  { value: "developer", label: "Developer", desc: "Build tasks, review code",          color: "border-blue-300 bg-blue-50 text-blue-700" },
  { value: "qa",        label: "QA",        desc: "Test & approve tasks",              color: "border-amber-300 bg-amber-50 text-amber-700" },
  { value: "product",   label: "Product",   desc: "Create projects, upload PRDs",      color: "border-purple-300 bg-purple-50 text-purple-700" },
  { value: "devops",    label: "DevOps",    desc: "Manage deploys & pipelines",        color: "border-emerald-300 bg-emerald-50 text-emerald-700" },
]

export default function SignupPage() {
  const { signup } = useAuth()
  const router = useRouter()
  const [name, setName] = useState("")
  const [email, setEmail] = useState("")
  const [password, setPassword] = useState("")
  const [role, setRole] = useState<UserRole>("developer")
  const [showPw, setShowPw] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState("")
  const [step, setStep] = useState<"account" | "role">("account")

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (step === "account") { setStep("role"); return }
    setError("")
    setLoading(true)
    const result = await signup(name, email, password, role)
    setLoading(false)
    if (result.ok) router.push("/projects")
    else setError(result.error ?? "Signup failed")
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
          <div className="inline-flex items-center gap-1.5 bg-emerald-100 text-emerald-700 rounded-full px-3 py-1 text-xs font-semibold mb-6">
            <CheckCircle2 className="w-3.5 h-3.5" /> Free forever plan available
          </div>
          <h2 className="text-3xl font-bold tracking-tight mb-4 leading-tight">Start shipping in minutes.</h2>
          <p className="text-muted-foreground leading-relaxed mb-8">
            No credit card. No setup fees. Bring your own model keys and keep full control of your data.
          </p>
          <div className="space-y-4">
            {[
              { title: "Free plan", desc: "3 projects, 50 agent runs/month" },
              { title: "BYOK", desc: "Use your own OpenAI or Anthropic keys" },
              { title: "Beta pricing locked", desc: "Sign up now, keep this price forever" },
            ].map((item) => (
              <div key={item.title} className="flex items-start gap-3">
                <div className="w-5 h-5 rounded-full bg-primary/20 flex items-center justify-center shrink-0 mt-0.5">
                  <CheckCircle2 className="w-3 h-3 text-primary" />
                </div>
                <div>
                  <p className="text-sm font-medium">{item.title}</p>
                  <p className="text-xs text-muted-foreground">{item.desc}</p>
                </div>
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
          <div className="flex items-center gap-2 mb-6">
            {["Account", "Your role"].map((s, i) => (
              <div key={s} className="flex items-center gap-2">
                <div className={cn("w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold transition-all",
                  (step === "account" && i === 0) || (step === "role" && i === 1) ? "bg-primary text-primary-foreground"
                  : step === "role" && i === 0 ? "bg-emerald-500 text-white"
                  : "bg-muted text-muted-foreground"
                )}>
                  {step === "role" && i === 0 ? <CheckCircle2 className="w-3.5 h-3.5" /> : i + 1}
                </div>
                <span className={cn("text-xs font-medium",
                  ((step === "account" && i === 0) || (step === "role" && i === 1)) ? "text-foreground" : "text-muted-foreground"
                )}>{s}</span>
                {i === 0 && <div className="w-6 h-px bg-border" />}
              </div>
            ))}
          </div>

          <div className="mb-6">
            <h1 className="text-2xl font-bold tracking-tight mb-1">
              {step === "account" ? "Create your account" : "What's your role?"}
            </h1>
            <p className="text-muted-foreground text-sm">
              {step === "account" ? "Free forever · No credit card required" : "This sets your default permissions and view."}
            </p>
          </div>

          <form onSubmit={handleSubmit} className="space-y-4">
            {step === "account" ? (
              <>
                <div className="space-y-1.5">
                  <label className="text-sm font-medium">Full name</label>
                  <input autoFocus required
                    className="w-full rounded-lg border bg-background px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-ring placeholder:text-muted-foreground"
                    placeholder="Alex Rivera" value={name} onChange={(e) => setName(e.target.value)} />
                </div>
                <div className="space-y-1.5">
                  <label className="text-sm font-medium">Work email</label>
                  <input type="email" required
                    className="w-full rounded-lg border bg-background px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-ring placeholder:text-muted-foreground"
                    placeholder="you@company.com" value={email}
                    onChange={(e) => { setEmail(e.target.value); setError("") }} />
                </div>
                <div className="space-y-1.5">
                  <label className="text-sm font-medium">Password</label>
                  <div className="relative">
                    <input type={showPw ? "text" : "password"} required minLength={6}
                      className="w-full rounded-lg border bg-background px-3 py-2.5 pr-10 text-sm focus:outline-none focus:ring-2 focus:ring-ring placeholder:text-muted-foreground"
                      placeholder="Min. 6 characters" value={password} onChange={(e) => setPassword(e.target.value)} />
                    <button type="button" onClick={() => setShowPw((v) => !v)} className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground">
                      {showPw ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                    </button>
                  </div>
                </div>
                <Button type="submit" className="w-full" disabled={!name || !email || !password}>
                  Continue <ArrowRight className="w-4 h-4" />
                </Button>
              </>
            ) : (
              <>
                <div className="space-y-2">
                  {ROLES.map((r) => (
                    <button key={r.value} type="button" onClick={() => setRole(r.value)}
                      className={cn("w-full text-left rounded-xl border-2 p-3.5 transition-all flex items-center gap-3",
                        role === r.value ? r.color : "border-border hover:border-muted-foreground/40")}>
                      <div className={cn("w-4 h-4 rounded-full border-2 shrink-0 flex items-center justify-center transition-all",
                        role === r.value ? "border-current" : "border-muted-foreground/40")}>
                        {role === r.value && <div className="w-2 h-2 rounded-full bg-current" />}
                      </div>
                      <div>
                        <p className="text-sm font-semibold">{r.label}</p>
                        <p className="text-xs text-muted-foreground">{r.desc}</p>
                      </div>
                    </button>
                  ))}
                </div>
                {error && (
                  <div className="rounded-lg bg-destructive/10 border border-destructive/20 px-3 py-2.5 text-sm text-destructive">{error}</div>
                )}
                <div className="flex gap-2 pt-1">
                  <Button type="button" variant="outline" className="flex-1" onClick={() => setStep("account")}>Back</Button>
                  <Button type="submit" className="flex-1" disabled={loading}>
                    {loading ? <><Loader2 className="w-4 h-4 animate-spin" /> Creating…</> : "Create account"}
                  </Button>
                </div>
              </>
            )}
          </form>

          <p className="mt-6 text-center text-sm text-muted-foreground">
            Already have an account?{" "}
            <Link href="/login" className="text-primary font-medium hover:underline">Sign in</Link>
          </p>
        </div>
      </div>
    </div>
  )
}
