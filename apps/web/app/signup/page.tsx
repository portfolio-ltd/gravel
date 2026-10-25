"use client"

import { useState } from "react"
import Link from "next/link"
import { useRouter } from "next/navigation"
import { Loader2, Eye, EyeOff, ArrowRight, CheckCircle2 } from "lucide-react"
import { Button } from "@/components/ui/button"
import { AuthShell, authInput } from "@/components/marketing/AuthShell"
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
    if (result.ok) router.push("/home")
    else setError(result.error ?? "Signup failed")
  }

  return (
    <AuthShell>
      <div className="flex items-center gap-2 mb-6">
        {["Account", "Your role"].map((s, i) => (
          <div key={s} className="flex items-center gap-2">
            <div className={cn("w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold transition-all",
              (step === "account" && i === 0) || (step === "role" && i === 1) ? "bg-primary text-primary-foreground"
              : step === "role" && i === 0 ? "bg-success text-success-foreground"
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
          {step === "account" ? "Your workspace and personal organization are created instantly." : "This sets your default permissions and view."}
        </p>
      </div>

      <form onSubmit={handleSubmit} className="space-y-4">
        {step === "account" ? (
          <>
            <div className="space-y-1.5">
              <label className="text-sm font-medium">Full name</label>
              <input autoFocus required
                className={authInput}
                placeholder="Alex Rivera" value={name} onChange={(e) => setName(e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <label className="text-sm font-medium">Work email</label>
              <input type="email" required
                className={authInput}
                placeholder="you@company.com" value={email}
                onChange={(e) => { setEmail(e.target.value); setError("") }} />
            </div>
            <div className="space-y-1.5">
              <label className="text-sm font-medium">Password</label>
              <div className="relative">
                <input type={showPw ? "text" : "password"} required minLength={6}
                  className={`${authInput} pr-10`}
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
    </AuthShell>
  )
}
