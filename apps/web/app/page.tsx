import Link from "next/link"
import {
  ArrowRight, BookOpen, Bot, FileSearch, GitBranch, GitPullRequest, HelpCircle, KeyRound, Lock,
  Palette, RotateCcw, ScrollText, ShieldCheck, Sparkles, Workflow,
} from "lucide-react"
import { GitHubIcon, GITHUB_URL, Logo } from "@/components/marketing/Brand"
import NavCta from "@/components/marketing/NavCta"
import PipelineMock from "@/components/marketing/PipelineMock"

const STEPS = [
  { icon: FileSearch, title: "Analyze", desc: "Is the request well-defined? Gaps and missing acceptance criteria surface before anyone plans." },
  { icon: ScrollText, title: "Refine spec", desc: "Answers and comments fold into a clear spec. What nobody has decided stays visibly open." },
  { icon: Workflow, title: "Plan", desc: "A prose plan — changes, risks, decisions, out of scope — plus a Gherkin scenario per criterion." },
  { icon: GitPullRequest, title: "Build", desc: "An AI engineer implements the approved plan on a task branch, with tests, and opens a PR." },
  { icon: ShieldCheck, title: "Review", desc: "The change is checked against the plan, your decision records and patterns. Blocking findings loop back to build." },
  { icon: Sparkles, title: "Verify", desc: "Evidence for every acceptance criterion, then a human signs off." },
]

const PRINCIPLES = [
  { icon: HelpCircle, title: "Nothing is invented", desc: "When an engineer can't decide, it records an open question with an owner. Blocking questions hold the plan until someone answers." },
  { icon: Lock, title: "Humans own the gates", desc: "Approve or request changes wherever your workflow says. Every gate lands on the Attention page, the board and the task." },
  { icon: BookOpen, title: "Knowledge compounds", desc: "Decision records, patterns, glossary, runbooks and conventions ground every run. AI proposes new entries; people accept them." },
  { icon: RotateCcw, title: "Code answers to the plan", desc: "Review compares the diff to the approved plan and acceptance criteria — and sends it back when it falls short." },
]

const FEATURES = [
  { icon: Bot, title: "Engineer runtimes", desc: "Containerized agents claim work, clone your repo, run an agentic CLI and push task branches. No runtime? The API runs stages in-process." },
  { icon: GitBranch, title: "GitHub Issues import", desc: "Pull issues in as tasks — acceptance criteria included — and post each stage's result back to the issue." },
  { icon: Workflow, title: "Workflows you own", desc: "Start from a template or design your own stages, roles, gates, rework loops and engineer assignments." },
  { icon: KeyRound, title: "Bring your own keys", desc: "Anthropic (Claude Opus 5.5 by default), OpenAI or Groq. Keys are encrypted at rest; every call is costed in a usage ledger." },
  { icon: Palette, title: "Make it yours", desc: "Light or dark, any accent, density, radius, fonts, sidebar or top bar, board card fields — synced across devices." },
  { icon: ShieldCheck, title: "Self-host everything", desc: "One docker compose up. Postgres, Redis, API, web. Multi-tenant orgs, roles and audit trail included." },
]

const INSTALL = `git clone ${GITHUB_URL}.git && cd gravel
cp .env.example .env   # set SECRET_KEY and ENCRYPTION_KEY
docker compose up --build -d
open http://localhost:3000`

export default function LandingPage() {
  return (
    <div className="min-h-screen bg-background text-foreground">
      {/* Nav */}
      <header className="sticky top-0 z-40 border-b bg-background/75 backdrop-blur-md">
        <div className="mx-auto flex h-14 max-w-6xl items-center gap-6 px-4 sm:px-6">
          <Logo />
          <nav className="hidden items-center gap-5 text-sm text-muted-foreground md:flex">
            <a href="#how-it-works" className="hover:text-foreground">How it works</a>
            <a href="#principles" className="hover:text-foreground">Principles</a>
            <a href="#features" className="hover:text-foreground">Features</a>
            <a href="#self-host" className="hover:text-foreground">Self-host</a>
          </nav>
          <div className="ml-auto flex items-center gap-2">
            <a href={GITHUB_URL} target="_blank" rel="noopener noreferrer" aria-label="Gravel on GitHub"
               className="hidden rounded-lg p-2 text-muted-foreground hover:bg-muted hover:text-foreground sm:inline-flex">
              <GitHubIcon className="h-4 w-4" />
            </a>
            <NavCta />
          </div>
        </div>
      </header>

      {/* Hero */}
      <section className="relative overflow-hidden bg-glow">
        <div className="pointer-events-none absolute inset-0 bg-grid opacity-50 [mask-image:radial-gradient(ellipse_at_top,black,transparent_65%)]" />
        <div className="relative mx-auto grid max-w-6xl items-center gap-12 px-4 pb-20 pt-16 sm:px-6 lg:grid-cols-[1.05fr_1fr] lg:pt-24">
          <div>
            <a href={GITHUB_URL} target="_blank" rel="noopener noreferrer"
               className="inline-flex items-center gap-2 rounded-full border bg-background/70 px-3 py-1 text-xs font-medium shadow-sm hover:bg-muted">
              <span className="rounded-full bg-primary/15 px-1.5 py-0.5 text-[10px] font-semibold text-primary">Open source</span>
              Apache-2.0 · self-hostable <ArrowRight className="h-3 w-3" />
            </a>
            <h1 className="mt-6 text-4xl font-semibold leading-[1.05] tracking-tight sm:text-5xl lg:text-6xl">
              AI engineers that<br /><span className="text-gradient">ship from spec.</span>
            </h1>
            <p className="mt-6 max-w-xl text-lg leading-relaxed text-muted-foreground">
              Gravel turns a PRD or your GitHub issues into analyzed specs, reviewed plans and verified code.
              AI does the engineering; your team approves every gate.
            </p>
            <div className="mt-8 flex flex-wrap items-center gap-3">
              <Link href="/signup" className="inline-flex items-center gap-2 rounded-xl bg-primary px-5 py-3 text-sm font-semibold text-primary-foreground shadow-lg shadow-primary/25 hover:bg-primary/90">
                Start building <ArrowRight className="h-4 w-4" />
              </Link>
              <a href={GITHUB_URL} target="_blank" rel="noopener noreferrer"
                 className="inline-flex items-center gap-2 rounded-xl border bg-background px-5 py-3 text-sm font-semibold hover:bg-muted">
                <GitHubIcon className="h-4 w-4" /> Star on GitHub
              </a>
            </div>
            <p className="mt-4 text-xs text-muted-foreground">
              Runs fully offline in simulated mode — no API key needed to try the whole flow.
            </p>
          </div>
          <PipelineMock className="lg:ml-auto lg:w-full lg:max-w-md" />
        </div>
      </section>

      {/* How it works */}
      <section id="how-it-works" className="border-t">
        <div className="mx-auto max-w-6xl px-4 py-20 sm:px-6">
          <SectionHeading eyebrow="How it works" title="One method, six stages, your gates"
            body="Every task moves through a workflow you control. This is the default spec-driven template — rearrange it, drop stages, or start from a lighter one." />
          <ol className="mt-12 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {STEPS.map((s, i) => (
              <li key={s.title} className="surface group relative p-5 transition-shadow hover:shadow-lg hover:shadow-primary/5">
                <div className="flex items-center gap-3">
                  <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-primary/10 text-primary">
                    <s.icon className="h-[18px] w-[18px]" />
                  </span>
                  <span className="font-mono text-xs text-muted-foreground">0{i + 1}</span>
                </div>
                <h3 className="mt-4 font-semibold">{s.title}</h3>
                <p className="mt-1.5 text-sm leading-relaxed text-muted-foreground">{s.desc}</p>
              </li>
            ))}
          </ol>
        </div>
      </section>

      {/* Principles */}
      <section id="principles" className="border-t bg-muted/30">
        <div className="mx-auto max-w-6xl px-4 py-20 sm:px-6">
          <SectionHeading eyebrow="Principles" title="Speed without guesswork"
            body="Agents are fast. Gravel makes them accountable to a spec, a plan and your team's accumulated knowledge." />
          <div className="mt-12 grid gap-6 md:grid-cols-2">
            {PRINCIPLES.map((p) => (
              <div key={p.title} className="flex gap-4">
                <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border bg-background text-primary shadow-sm">
                  <p.icon className="h-5 w-5" />
                </span>
                <div>
                  <h3 className="font-semibold">{p.title}</h3>
                  <p className="mt-1 text-sm leading-relaxed text-muted-foreground">{p.desc}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Features */}
      <section id="features" className="border-t">
        <div className="mx-auto max-w-6xl px-4 py-20 sm:px-6">
          <SectionHeading eyebrow="Features" title="Everything an AI engineering team needs" />
          <div className="mt-12 grid gap-px overflow-hidden rounded-2xl border bg-border sm:grid-cols-2 lg:grid-cols-3">
            {FEATURES.map((f) => (
              <div key={f.title} className="bg-card p-6">
                <f.icon className="h-5 w-5 text-primary" />
                <h3 className="mt-4 font-semibold">{f.title}</h3>
                <p className="mt-1.5 text-sm leading-relaxed text-muted-foreground">{f.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Self-host */}
      <section id="self-host" className="border-t bg-glow">
        <div className="mx-auto grid max-w-6xl items-center gap-10 px-4 py-20 sm:px-6 lg:grid-cols-2">
          <div>
            <SectionHeading align="left" eyebrow="Self-host" title="Running in about a minute"
              body="Postgres, Redis, the API and the web app in one compose file. Add engineer runtimes from the dashboard when you're ready for real code changes." />
            <div className="mt-6 flex flex-wrap gap-3">
              <Link href="/signup" className="inline-flex items-center gap-2 rounded-xl bg-primary px-5 py-2.5 text-sm font-semibold text-primary-foreground hover:bg-primary/90">
                Create an account <ArrowRight className="h-4 w-4" />
              </Link>
              <a href={`${GITHUB_URL}/blob/main/docs/self-hosting.md`} target="_blank" rel="noopener noreferrer"
                 className="inline-flex items-center gap-2 rounded-xl border bg-background px-5 py-2.5 text-sm font-semibold hover:bg-muted">
                Self-hosting guide
              </a>
            </div>
          </div>
          <div className="surface overflow-hidden shadow-xl shadow-primary/5">
            <div className="flex items-center gap-2 border-b bg-muted/40 px-4 py-2.5">
              <span className="h-2.5 w-2.5 rounded-full bg-rose-400" />
              <span className="h-2.5 w-2.5 rounded-full bg-amber-400" />
              <span className="h-2.5 w-2.5 rounded-full bg-emerald-400" />
              <span className="ml-2 font-mono text-[11px] text-muted-foreground">terminal</span>
            </div>
            <pre className="overflow-x-auto p-5 font-mono text-xs leading-relaxed">
              {INSTALL.split("\n").map((line) => (
                <div key={line}>
                  <span className="select-none text-primary">$ </span>
                  {line.split("#")[0]}
                  {line.includes("#") && <span className="text-muted-foreground">#{line.split("#")[1]}</span>}
                </div>
              ))}
            </pre>
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer className="border-t">
        <div className="mx-auto flex max-w-6xl flex-col items-center justify-between gap-4 px-4 py-8 text-sm text-muted-foreground sm:flex-row sm:px-6">
          <div className="flex items-center gap-3">
            <Logo size="sm" />
            <span>Open source under the Apache License 2.0</span>
          </div>
          <div className="flex items-center gap-5">
            <a href={GITHUB_URL} target="_blank" rel="noopener noreferrer" className="hover:text-foreground">GitHub</a>
            <a href={`${GITHUB_URL}/blob/main/docs/methodology.md`} target="_blank" rel="noopener noreferrer" className="hover:text-foreground">Method</a>
            <Link href="/login" className="hover:text-foreground">Sign in</Link>
            <Link href="/signup" className="hover:text-foreground">Sign up</Link>
          </div>
        </div>
      </footer>
    </div>
  )
}

function SectionHeading({ eyebrow, title, body, align = "center" }: {
  eyebrow: string; title: string; body?: string; align?: "center" | "left"
}) {
  return (
    <div className={align === "center" ? "mx-auto max-w-2xl text-center" : "max-w-xl"}>
      <p className="text-xs font-semibold uppercase tracking-widest text-primary">{eyebrow}</p>
      <h2 className="mt-3 text-3xl font-semibold tracking-tight sm:text-4xl">{title}</h2>
      {body && <p className="mt-4 text-base leading-relaxed text-muted-foreground">{body}</p>}
    </div>
  )
}
