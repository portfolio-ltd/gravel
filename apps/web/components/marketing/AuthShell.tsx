import { CheckCircle2 } from "lucide-react"
import { Logo } from "@/components/marketing/Brand"
import PipelineMock from "@/components/marketing/PipelineMock"

const POINTS = [
  "Specs and plans before code — gaps become owned questions",
  "AI engineers build, review and verify behind human gates",
  "Bring your own model keys; self-host the whole stack",
]

/** Split layout for sign-in / sign-up: brand story on the left, form on the right. */
export function AuthShell({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-screen bg-background">
      <aside className="relative hidden flex-col justify-between overflow-hidden border-r bg-glow p-10 lg:flex lg:w-[46%]">
        <div className="pointer-events-none absolute inset-0 bg-grid opacity-40 [mask-image:radial-gradient(ellipse_at_top,black,transparent_70%)]" />
        <Logo className="relative" />
        <div className="relative space-y-8">
          <div>
            <h2 className="text-3xl font-semibold leading-tight tracking-tight">
              Ship from spec,<br /><span className="text-gradient">not from guesswork.</span>
            </h2>
            <ul className="mt-6 space-y-3">
              {POINTS.map((p) => (
                <li key={p} className="flex items-start gap-2.5 text-sm text-muted-foreground">
                  <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-primary" /> {p}
                </li>
              ))}
            </ul>
          </div>
          <PipelineMock compact className="max-w-sm" />
        </div>
        <p className="relative text-xs text-muted-foreground">Open source · Apache-2.0</p>
      </aside>

      <main className="flex flex-1 flex-col items-center justify-center px-4 py-12">
        <Logo className="mb-8 lg:hidden" />
        <div className="w-full max-w-sm animate-fade-in">{children}</div>
      </main>
    </div>
  )
}

/** Centered card for short flows (forgot / reset password, email verification). */
export function AuthCard({ children }: { children: React.ReactNode }) {
  return (
    <div className="relative flex min-h-screen items-center justify-center bg-background bg-glow p-4">
      <div className="w-full max-w-sm animate-fade-in">
        <Logo className="mb-6" />
        <div className="surface p-6 shadow-xl shadow-primary/5">{children}</div>
      </div>
    </div>
  )
}

export const authInput =
  "w-full rounded-lg border border-input bg-background px-3 py-2.5 text-sm shadow-sm transition-colors " +
  "placeholder:text-muted-foreground/70 focus:outline-none focus:ring-2 focus:ring-ring/40 focus:border-ring"
