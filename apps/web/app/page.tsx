import Link from "next/link"
import { Zap, Bot, Kanban, GitBranch, Shield, AlertTriangle, CheckCircle, ArrowRight, Code2, Database, Cpu, Globe, Users, Settings } from "lucide-react"

const FEATURES = [
  { icon: Bot,           title: "AI Engineers",        desc: "Create named AI agents with custom skills and templates. Launch, stop, and monitor them in real time." },
  { icon: Kanban,        title: "Kanban Board",         desc: "Visualise every task across all projects in one drag-and-drop board. Move tasks between stages." },
  { icon: CheckCircle,   title: "Human Approval Gates", desc: "AI agents pause at key milestones. You approve or reject before work continues." },
  { icon: GitBranch,     title: "GitHub Integration",   desc: "Agents create branches and open PRs on your repos automatically after completing tasks." },
  { icon: Shield,        title: "BYOK Security",        desc: "Bring your own Anthropic, OpenAI, or Groq key. Keys are encrypted at rest, never logged." },
  { icon: Globe,         title: "AWS Deployment",       desc: "Deploy static sites to S3 + CloudFront directly from your project pipeline." },
]

const HOW_IT_WORKS = [
  { n: "01", title: "Upload your PRD",      desc: "Drop a PDF, Markdown, or text spec. Gravel parses it with AI and generates a structured task list." },
  { n: "02", title: "Create AI engineers",  desc: "Spin up named engineers with specific templates (frontend, backend, fullstack) and skill definitions." },
  { n: "03", title: "Start the build",      desc: "Click 'Start build'. Engineers pick up tasks in priority order and execute them via LLM." },
  { n: "04", title: "Review & approve",     desc: "When an agent needs input, you get an alert. Approve or reject to continue the pipeline." },
  { n: "05", title: "QA & review",          desc: "Advance through QA and code review stages. Each stage has role-based guards." },
  { n: "06", title: "Deploy",               desc: "Push to GitHub or deploy to S3/CloudFront with a single click. Full audit trail in changelog." },
]

const MODELS = [
  { name: "Claude Sonnet 4.6",  provider: "Anthropic", tag: "Recommended", color: "border-purple-300 bg-purple-50" },
  { name: "GPT-4o",             provider: "OpenAI",    tag: "Fast",          color: "border-blue-300 bg-blue-50" },
  { name: "Llama 3.3 70B",     provider: "Groq",      tag: "Free tier",     color: "border-emerald-300 bg-emerald-50" },
]

const ROLES = [
  { icon: Settings, role: "Admin",     desc: "Full access. Manage users, projects, engineers, and deployment." },
  { icon: Code2,    role: "Developer", desc: "Build and review tasks. Manage agent runs and approve build outputs." },
  { icon: CheckCircle, role: "QA",     desc: "Run testing phases. Approve or reject AI test results." },
  { icon: Database, role: "Product",   desc: "Create projects, upload PRDs, and monitor progress." },
  { icon: Cpu,      role: "DevOps",    desc: "Manage deployments, AWS credentials, and infrastructure config." },
]

const PLANS = [
  {
    name: "Starter", price: "$0", period: "forever",
    features: ["3 projects", "1 AI engineer", "BYOK required", "Community support"],
    cta: "Get started free", highlight: false,
  },
  {
    name: "Pro", price: "$49", period: "/month",
    features: ["Unlimited projects", "5 AI engineers", "GitHub + AWS integration", "Priority support", "Team up to 10"],
    cta: "Start free trial", highlight: true,
  },
  {
    name: "Enterprise", price: "Custom", period: "",
    features: ["Unlimited everything", "SSO + audit logs", "Dedicated support", "SLA guarantee", "Custom integrations"],
    cta: "Contact us", highlight: false,
  },
]

export default function LandingPage() {
  return (
    <div className="min-h-screen bg-background text-foreground">
      {/* Nav */}
      <nav className="sticky top-0 z-50 border-b bg-background/90 backdrop-blur-sm">
        <div className="max-w-6xl mx-auto px-4 h-14 flex items-center justify-between">
          <Link href="/" className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-lg bg-primary flex items-center justify-center">
              <Zap className="w-4 h-4 text-primary-foreground" />
            </div>
            <span className="font-bold text-sm">Gravel</span>
            <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded-full bg-purple-100 text-purple-700">Beta</span>
          </Link>
          <div className="hidden sm:flex items-center gap-6 text-sm">
            <a href="#features" className="text-muted-foreground hover:text-foreground transition-colors">Features</a>
            <a href="#how-it-works" className="text-muted-foreground hover:text-foreground transition-colors">How it works</a>
            <a href="#pricing" className="text-muted-foreground hover:text-foreground transition-colors">Pricing</a>
          </div>
          <div className="flex items-center gap-2">
            <Link href="/login" className="text-sm px-3 py-1.5 rounded-lg hover:bg-muted transition-colors font-medium">
              Sign in
            </Link>
            <Link href="/signup" className="text-sm px-4 py-1.5 rounded-lg bg-primary text-primary-foreground font-medium hover:bg-primary/90 transition-colors">
              Get started
            </Link>
          </div>
        </div>
      </nav>

      {/* Hero */}
      <section className="max-w-6xl mx-auto px-4 pt-24 pb-20 text-center">
        <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full border bg-muted/50 text-xs font-medium text-muted-foreground mb-6">
          <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
          Now in open beta — free to try
        </div>
        <h1 className="text-4xl sm:text-6xl font-black tracking-tight mb-6 leading-[1.1]">
          Run an AI engineering team<br />
          <span className="text-primary">with human oversight</span>
        </h1>
        <p className="text-lg text-muted-foreground max-w-2xl mx-auto mb-8">
          Upload your PRD. Spin up AI engineers. Watch tasks get built, tested, and deployed — with approval gates at every critical step.
        </p>
        <div className="flex items-center justify-center gap-3 flex-wrap mb-12">
          <Link href="/signup" className="flex items-center gap-2 px-6 py-3 rounded-xl bg-primary text-primary-foreground font-semibold hover:bg-primary/90 transition-colors">
            Start building free <ArrowRight className="w-4 h-4" />
          </Link>
          <Link href="/login" className="flex items-center gap-2 px-6 py-3 rounded-xl border font-semibold hover:bg-muted transition-colors">
            View demo
          </Link>
        </div>
        <div className="flex items-center justify-center gap-2 flex-wrap">
          {["Setup", "Building", "QA", "Review", "Done", "Deployed"].map((stage, i) => (
            <div key={stage} className="flex items-center gap-2">
              <span className="text-xs px-3 py-1 rounded-full border bg-background font-medium">{stage}</span>
              {i < 5 && <span className="text-muted-foreground text-xs">→</span>}
            </div>
          ))}
        </div>
      </section>

      {/* Features */}
      <section id="features" className="max-w-6xl mx-auto px-4 py-20">
        <h2 className="text-2xl font-bold text-center mb-3">Everything your AI team needs</h2>
        <p className="text-muted-foreground text-center mb-12">Built for teams that want real output, not just chat.</p>
        <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-5">
          {FEATURES.map(({ icon: Icon, title, desc }) => (
            <div key={title} className="rounded-2xl border p-5 hover:shadow-md transition-all">
              <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center mb-4">
                <Icon className="w-5 h-5 text-primary" />
              </div>
              <h3 className="font-semibold mb-2">{title}</h3>
              <p className="text-sm text-muted-foreground">{desc}</p>
            </div>
          ))}
        </div>
      </section>

      {/* How it works */}
      <section id="how-it-works" className="bg-muted/40 py-20">
        <div className="max-w-4xl mx-auto px-4">
          <h2 className="text-2xl font-bold text-center mb-3">How it works</h2>
          <p className="text-muted-foreground text-center mb-12">From idea to deployment in minutes.</p>
          <div className="space-y-6">
            {HOW_IT_WORKS.map(({ n, title, desc }) => (
              <div key={n} className="flex gap-5 items-start">
                <div className="w-10 h-10 rounded-xl bg-primary text-primary-foreground flex items-center justify-center text-sm font-black shrink-0">
                  {n}
                </div>
                <div>
                  <h3 className="font-semibold mb-1">{title}</h3>
                  <p className="text-sm text-muted-foreground">{desc}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* BYOK */}
      <section className="max-w-6xl mx-auto px-4 py-20">
        <h2 className="text-2xl font-bold text-center mb-3">Bring Your Own Key</h2>
        <p className="text-muted-foreground text-center mb-10">Your API keys are Fernet-encrypted at rest. Choose any model.</p>
        <div className="flex flex-wrap gap-4 justify-center">
          {MODELS.map(({ name, provider, tag, color }) => (
            <div key={name} className={`rounded-2xl border-2 p-5 min-w-[200px] ${color}`}>
              <div className="text-[10px] font-semibold text-muted-foreground mb-1">{provider}</div>
              <div className="font-bold text-sm mb-2">{name}</div>
              <span className="text-[10px] px-2 py-0.5 rounded-full border bg-background font-medium">{tag}</span>
            </div>
          ))}
        </div>
      </section>

      {/* Roles */}
      <section className="bg-muted/40 py-20">
        <div className="max-w-6xl mx-auto px-4">
          <h2 className="text-2xl font-bold text-center mb-3">Built for the whole team</h2>
          <p className="text-muted-foreground text-center mb-10">5 roles with distinct permissions — everyone has their place.</p>
          <div className="grid sm:grid-cols-3 lg:grid-cols-5 gap-4">
            {ROLES.map(({ icon: Icon, role, desc }) => (
              <div key={role} className="bg-background rounded-2xl border p-4 text-center">
                <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center mx-auto mb-3">
                  <Icon className="w-5 h-5 text-primary" />
                </div>
                <h3 className="font-semibold text-sm mb-1">{role}</h3>
                <p className="text-xs text-muted-foreground">{desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Pricing */}
      <section id="pricing" className="max-w-6xl mx-auto px-4 py-20">
        <h2 className="text-2xl font-bold text-center mb-3">Simple pricing</h2>
        <p className="text-muted-foreground text-center mb-12">Start free. Scale when you need it.</p>
        <div className="grid sm:grid-cols-3 gap-6">
          {PLANS.map(({ name, price, period, features, cta, highlight }) => (
            <div key={name} className={`rounded-2xl border p-6 flex flex-col ${highlight ? "border-primary bg-primary/5 shadow-lg scale-[1.02]" : ""}`}>
              <h3 className="font-bold text-lg mb-1">{name}</h3>
              <div className="flex items-baseline gap-1 mb-5">
                <span className="text-3xl font-black">{price}</span>
                <span className="text-sm text-muted-foreground">{period}</span>
              </div>
              <ul className="space-y-2 flex-1 mb-6">
                {features.map((f) => (
                  <li key={f} className="flex items-center gap-2 text-sm">
                    <CheckCircle className="w-4 h-4 text-emerald-500 shrink-0" />
                    {f}
                  </li>
                ))}
              </ul>
              <Link
                href="/signup"
                className={`text-center py-2.5 rounded-xl font-semibold text-sm transition-colors ${
                  highlight
                    ? "bg-primary text-primary-foreground hover:bg-primary/90"
                    : "border hover:bg-muted"
                }`}
              >
                {cta}
              </Link>
            </div>
          ))}
        </div>
      </section>

      {/* CTA */}
      <section className="bg-primary py-20 text-primary-foreground">
        <div className="max-w-2xl mx-auto px-4 text-center">
          <h2 className="text-3xl font-black mb-4">Ready to build with AI?</h2>
          <p className="opacity-80 mb-8">Join teams using Gravel to ship faster with AI engineers and human oversight.</p>
          <Link href="/signup" className="inline-flex items-center gap-2 px-8 py-3 rounded-xl bg-background text-foreground font-bold hover:bg-muted transition-colors">
            Get started free <ArrowRight className="w-4 h-4" />
          </Link>
        </div>
      </section>

      {/* Footer */}
      <footer className="border-t py-8">
        <div className="max-w-6xl mx-auto px-4 flex items-center justify-between flex-wrap gap-4">
          <div className="flex items-center gap-2">
            <div className="w-6 h-6 rounded bg-primary flex items-center justify-center">
              <Zap className="w-3 h-3 text-primary-foreground" />
            </div>
            <span className="text-sm font-bold">Gravel</span>
          </div>
          <p className="text-xs text-muted-foreground">© 2026 Gravel. Beta software — use at your own risk.</p>
          <div className="flex gap-4 text-xs text-muted-foreground">
            <Link href="/login" className="hover:text-foreground transition-colors">Sign in</Link>
            <Link href="/signup" className="hover:text-foreground transition-colors">Sign up</Link>
          </div>
        </div>
      </footer>
    </div>
  )
}
