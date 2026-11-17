"use client"

import { useState } from "react"
import { AlertTriangle, ArrowUpRight, Eye, EyeOff, Info, Link2, Loader2, Lock, Plug, Plus, Search, ShieldCheck, Unplug } from "lucide-react"
import { toast } from "sonner"
import {
  useCreateDeployEnvironment, useCreateGitIntegration, useDeleteDeployEnvironment, useDeleteGitIntegration,
  useDeployEnvironments, useGitIntegrations, useUpdateDeployEnvironment, useUpdateGitIntegration,
} from "@/hooks/useIntegrations"
import { Button } from "@/components/ui/button"
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown"
import { Field, Input, Segmented, Switch } from "@/components/ui/form"
import { Page, PageHeader } from "@/components/ui/page"
import { Sheet, SheetContent, SheetDescription, SheetTitle } from "@/components/ui/sheet"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { HelpHint, Tooltip } from "@/components/ui/tooltip"
import { apiFetch } from "@/lib/api"
import {
  CATEGORIES, PROVIDERS, RISK_LABEL, buildItems, filterItems, healthOf,
  type Capability, type Health, type IntegrationCategory, type IntegrationItem, type ProviderInfo, type Risk,
} from "@/lib/integrations"
import { cn, formatRelativeTime } from "@/lib/utils"
import type { DeployProvider, GitProvider } from "@/types"

type Connected = Exclude<IntegrationItem, { type: "available" }>

// ── Small pieces ─────────────────────────────────────────────────────────────

function Logo({ provider, size = "md" }: { provider: ProviderInfo; size?: "sm" | "md" }) {
  return (
    <span className={cn(
      "flex shrink-0 items-center justify-center rounded-lg font-bold",
      size === "sm" ? "h-7 w-7 text-[9px]" : "h-9 w-9 text-[10px]",
      provider.color,
    )}>
      {provider.monogram}
    </span>
  )
}

const HEALTH: Record<Health, { label: string; className: string; tip: string }> = {
  connected: { label: "Connected", className: "border-success/30 bg-success/10 text-success", tip: "Active, with a stored credential." },
  disabled: { label: "Disabled", className: "border-border bg-muted text-muted-foreground", tip: "Kept, but engineers don't receive it while disabled." },
  incomplete: { label: "Needs credential", className: "border-warning/40 bg-warning/10 text-warning", tip: "Saved without a token or config — add one in Settings." },
}

function StatusPill({ health }: { health: Health }) {
  const h = HEALTH[health]
  return (
    <Tooltip content={h.tip}>
      <span tabIndex={0} className={cn("shrink-0 rounded-full border px-2 py-0.5 text-[11px] font-medium", h.className)}>{h.label}</span>
    </Tooltip>
  )
}

const RISK_CLASS: Record<Risk, string> = {
  low: "border-success/30 bg-success/10 text-success",
  medium: "border-warning/30 bg-warning/10 text-warning",
  high: "border-destructive/30 bg-destructive/10 text-destructive",
  never: "border-border bg-muted text-muted-foreground",
  stored: "border-border bg-muted text-muted-foreground",
}

const RISK_TIP: Record<Risk, string> = {
  low: "Reads only; nothing changes outside Gravel.",
  medium: "Writes, but to places a person reviews (a branch, a pull request).",
  high: "Can change live systems. Scope the credential tightly.",
  never: "Gravel never does this.",
  stored: "Kept encrypted for your engineers; Gravel's automation doesn't use it yet.",
}

function CapabilityList({ capabilities }: { capabilities: Capability[] }) {
  return (
    <ul className="divide-y overflow-hidden rounded-lg border">
      {capabilities.map((c) => (
        <li key={c.key} className="flex items-center gap-3 px-3 py-2">
          <div className="min-w-0 flex-1">
            <p className="text-sm">{c.label}</p>
            {c.key !== "stored" && <p className="font-mono text-[10px] text-muted-foreground">{c.key}</p>}
          </div>
          {c.note && <span className="hidden text-[11px] text-muted-foreground sm:inline">{c.note}</span>}
          <Tooltip content={RISK_TIP[c.risk]}>
            <span tabIndex={0} className={cn("shrink-0 rounded-full border px-2 py-0.5 text-[10px] font-medium", RISK_CLASS[c.risk])}>{RISK_LABEL[c.risk]}</span>
          </Tooltip>
        </li>
      ))}
    </ul>
  )
}

function SecretInput({ value, onChange, placeholder, label }: { value: string; onChange: (v: string) => void; placeholder: string; label: string }) {
  const [show, setShow] = useState(false)
  return (
    <div className="relative">
      <Input type={show ? "text" : "password"} value={value} onChange={(e) => onChange(e.target.value)} placeholder={placeholder}
        autoComplete="off" aria-label={label} className="pr-9 font-mono" />
      <button type="button" onClick={() => setShow((v) => !v)} aria-label={show ? "Hide" : "Show"}
        className="absolute right-2.5 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground">
        {show ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
      </button>
    </div>
  )
}

// ── Connect dialog ───────────────────────────────────────────────────────────

function ConnectDialog({ provider, onClose }: { provider: ProviderInfo | null; onClose: () => void }) {
  const createGit = useCreateGitIntegration()
  const createDeploy = useCreateDeployEnvironment()
  const [name, setName] = useState("")
  const [token, setToken] = useState("")
  const [baseUrl, setBaseUrl] = useState("")
  const [branch, setBranch] = useState("main")
  const [region, setRegion] = useState("")
  const [fields, setFields] = useState<Record<string, string>>({})
  const pending = createGit.isPending || createDeploy.isPending

  function close() {
    if (pending) return
    setName(""); setToken(""); setBaseUrl(""); setBranch("main"); setRegion(""); setFields({})
    onClose()
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    if (!provider) return
    try {
      if (provider.kind === "git") {
        await createGit.mutateAsync({
          provider: provider.id as GitProvider, name: name.trim() || provider.label, access_token: token || undefined,
          base_url: provider.needsBaseUrl ? baseUrl : undefined, default_branch: branch || "main",
        })
      } else {
        const config = Object.fromEntries(Object.entries(fields).filter(([, v]) => v.trim()))
        await createDeploy.mutateAsync({
          provider: provider.id as DeployProvider, name: name.trim() || "production", region: region || undefined,
          config: Object.keys(config).length ? config : undefined,
        })
      }
      toast.success(`${provider.label} connected`)
      close()
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to connect")
    }
  }

  return (
    <Dialog open={!!provider} onOpenChange={(v) => { if (!v) close() }}>
      <DialogContent className="max-h-[90vh] max-w-lg overflow-y-auto">
        {provider && (
          <>
            <DialogHeader>
              <DialogTitle>Connect {provider.label}</DialogTitle>
              <DialogDescription>
                Gravel keeps the credential encrypted at rest and never shows it again. {provider.active
                  ? "Only engineers that need it receive it, inside their runtime."
                  : "Gravel's automation doesn't use it yet; it's kept for your engineers."}
              </DialogDescription>
            </DialogHeader>
            <div className="flex items-center gap-2" aria-hidden>
              <Logo provider={provider} size="sm" />
              <ArrowUpRight className="h-3.5 w-3.5 rotate-45 text-muted-foreground" />
              <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-primary/10 text-primary"><ShieldCheck className="h-4 w-4" /></span>
            </div>
            <form onSubmit={submit} className="space-y-3">
              <Field label={provider.kind === "git" ? "Display name" : "Environment name"}>
                <Input autoFocus value={name} onChange={(e) => setName(e.target.value)}
                  placeholder={provider.kind === "git" ? `${provider.label} — my org` : "production"} />
              </Field>
              {provider.kind === "git" ? (
                <>
                  {provider.needsBaseUrl && (
                    <Field label="Base URL"><Input value={baseUrl} onChange={(e) => setBaseUrl(e.target.value)} placeholder="https://git.example.com" /></Field>
                  )}
                  <Field label="Personal access token" hint="Grant repository read/write and pull requests; nothing more is needed.">
                    <SecretInput label="Personal access token" value={token} onChange={setToken} placeholder={provider.tokenPlaceholder ?? ""} />
                  </Field>
                  <Field label="Default branch"><Input value={branch} onChange={(e) => setBranch(e.target.value)} placeholder="main" /></Field>
                </>
              ) : (
                <>
                  {provider.id !== "custom" && (
                    <Field label="Region"><Input value={region} onChange={(e) => setRegion(e.target.value)}
                      placeholder={provider.id === "aws" ? "us-east-1" : provider.id === "gcp" ? "us-central1" : "eastus"} /></Field>
                  )}
                  {provider.fields?.map((f) => (
                    <Field key={f.key} label={f.label}>
                      {f.secret
                        ? <SecretInput label={f.label} value={fields[f.key] ?? ""} onChange={(v) => setFields((x) => ({ ...x, [f.key]: v }))} placeholder={f.placeholder} />
                        : <Input value={fields[f.key] ?? ""} onChange={(e) => setFields((x) => ({ ...x, [f.key]: e.target.value }))} placeholder={f.placeholder} />}
                    </Field>
                  ))}
                </>
              )}
              <div>
                <p className="mb-1.5 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">What engineers may do</p>
                <CapabilityList capabilities={provider.capabilities} />
              </div>
              <p className="flex items-start gap-2 rounded-lg bg-muted px-3 py-2 text-xs text-muted-foreground">
                <Info className="mt-0.5 h-3.5 w-3.5 shrink-0" /> Disconnecting later deletes the stored credential at once.
              </p>
              <div className="flex justify-end gap-2">
                <Button type="button" variant="outline" size="sm" onClick={close}>Cancel</Button>
                <Button type="submit" size="sm" disabled={pending}>
                  {pending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Link2 className="h-3.5 w-3.5" />} Connect {provider.label}
                </Button>
              </div>
            </form>
          </>
        )}
      </DialogContent>
    </Dialog>
  )
}

// ── Disconnect dialog ────────────────────────────────────────────────────────

function DisconnectDialog({ item, onClose, onDone }: { item: Connected | null; onClose: () => void; onDone: () => void }) {
  const delGit = useDeleteGitIntegration()
  const delDeploy = useDeleteDeployEnvironment()
  const [typed, setTyped] = useState("")
  const pending = delGit.isPending || delDeploy.isPending
  if (!item) return null
  const label = item.provider.label
  const impact = item.type === "git"
    ? (item.provider.id === "github"
      ? ["Engineers launched from now on won't get GitHub access (running containers keep it until restarted).",
        "Importing GitHub issues as tasks stops unless another GitHub connection is active.",
        "The stored token is deleted. Revoke it in GitHub too if it was shared."]
      : ["The stored token is deleted."])
    : (item.provider.id === "aws"
      ? ["Engineers launched from now on won't get these AWS credentials.", "Deploys through this environment stop.", "The stored credentials are deleted."]
      : ["The stored credentials are deleted."])

  async function confirm() {
    if (!item) return
    try {
      if (item.type === "git") await delGit.mutateAsync(item.row.id)
      else await delDeploy.mutateAsync(item.row.id)
      toast.success(`${item.row.name} disconnected`)
      setTyped("")
      onDone()
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to disconnect")
    }
  }

  return (
    <Dialog open onOpenChange={(v) => { if (!v && !pending) { setTyped(""); onClose() } }}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-destructive/10 text-destructive"><Unplug className="h-4 w-4" /></span>
            Disconnect {item.row.name}?
          </DialogTitle>
          <DialogDescription>Gravel deletes this {label} connection right away.</DialogDescription>
        </DialogHeader>
        <div className="rounded-lg border bg-muted/40 p-3">
          <p className="mb-1.5 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Impact</p>
          <ul className="space-y-1.5 text-sm">
            {impact.map((t) => <li key={t} className="flex gap-2"><AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0 text-warning" /> {t}</li>)}
          </ul>
        </div>
        <Field label={`Type ${item.row.name} to confirm`}>
          <Input value={typed} onChange={(e) => setTyped(e.target.value)} autoFocus aria-label="Confirm the connection name" />
        </Field>
        <div className="flex justify-end gap-2">
          <Button variant="outline" size="sm" onClick={() => { setTyped(""); onClose() }} disabled={pending}>Keep connected</Button>
          <Button variant="destructive" size="sm" onClick={confirm} disabled={pending || typed.trim() !== item.row.name}>
            {pending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Unplug className="h-3.5 w-3.5" />} Disconnect
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  )
}

// ── Detail drawer ────────────────────────────────────────────────────────────

function Stat({ label, value, hint }: { label: string; value: React.ReactNode; hint?: string }) {
  return (
    <div className="rounded-lg border bg-muted/30 px-3 py-2">
      <p className="flex items-center gap-1 text-[11px] text-muted-foreground">{label}{hint && <HelpHint content={hint} label={label} />}</p>
      <p className="mt-0.5 truncate text-sm font-semibold">{value}</p>
    </div>
  )
}

function TestConnection({ item }: { item: Extract<IntegrationItem, { type: "git" }> }) {
  const [url, setUrl] = useState(item.row.base_url ?? "")
  const [state, setState] = useState<{ ok: boolean; text: string } | null>(null)
  const [busy, setBusy] = useState(false)
  async function run() {
    if (!url.trim()) return
    setBusy(true)
    try {
      const res = await apiFetch<{ ok: boolean; full_name?: string; error?: string }>(
        `/api/integrations/git/${item.row.id}/verify?repo_url=${encodeURIComponent(url.trim())}`)
      setState(res.ok ? { ok: true, text: `Reached ${res.full_name}` } : { ok: false, text: res.error?.slice(0, 160) ?? "Failed" })
    } catch (e) {
      setState({ ok: false, text: e instanceof Error ? e.message : "Connection test failed" })
    } finally {
      setBusy(false)
    }
  }
  return (
    <div className="space-y-2">
      <p className="flex items-center gap-1 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
        Test access <HelpHint content="Checks that the token can read this repository. Nothing is written." label="Test access" />
      </p>
      <div className="flex gap-2">
        <Input value={url} onChange={(e) => setUrl(e.target.value)} placeholder="https://github.com/owner/repo" className="flex-1" aria-label="Repository URL to test" />
        <Button size="sm" variant="outline" className="h-9" onClick={run} disabled={busy || !url.trim() || !item.row.has_token}>
          {busy && <Loader2 className="h-3.5 w-3.5 animate-spin" />} Test
        </Button>
      </div>
      {state && <p className={cn("text-xs", state.ok ? "text-success" : "text-destructive")}>{state.text}</p>}
    </div>
  )
}

function DetailSheet({ item, onClose, onDisconnect }: { item: Connected | null; onClose: () => void; onDisconnect: (i: Connected) => void }) {
  const updateGit = useUpdateGitIntegration()
  const updateDeploy = useUpdateDeployEnvironment()
  const [name, setName] = useState("")
  const [secret, setSecret] = useState("")
  const [branchOrRegion, setBranchOrRegion] = useState("")
  const [lastKey, setLastKey] = useState<string | null>(null)
  if (item && item.key !== lastKey) {
    setLastKey(item.key)
    setName(item.row.name)
    setSecret("")
    setBranchOrRegion(item.type === "git" ? item.row.default_branch : item.row.region ?? "")
  }
  const pending = updateGit.isPending || updateDeploy.isPending

  async function save() {
    if (!item) return
    try {
      if (item.type === "git") {
        await updateGit.mutateAsync({ id: item.row.id, name: name.trim() || item.row.name, ...(secret ? { access_token: secret } : {}),
          ...(branchOrRegion.trim() && branchOrRegion !== item.row.default_branch ? { default_branch: branchOrRegion.trim() } : {}) })
      } else {
        await updateDeploy.mutateAsync({ id: item.row.id, name: name.trim() || item.row.name, region: branchOrRegion.trim() || undefined })
      }
      setSecret("")
      toast.success("Changes saved")
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to save")
    }
  }

  async function toggle(active: boolean) {
    if (!item) return
    try {
      if (item.type === "git") await updateGit.mutateAsync({ id: item.row.id, is_active: active })
      else await updateDeploy.mutateAsync({ id: item.row.id, is_active: active })
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to update")
    }
  }

  return (
    <Sheet open={!!item} onOpenChange={(v) => { if (!v) onClose() }}>
      <SheetContent>
        {item && (
          <>
            <div className="flex items-start gap-3 border-b px-5 py-4 pr-12">
              <Logo provider={item.provider} />
              <div className="min-w-0 flex-1">
                <SheetTitle className="truncate text-base font-semibold">{item.row.name}</SheetTitle>
                <SheetDescription className="text-xs text-muted-foreground">
                  {item.provider.label} · connected {formatRelativeTime(item.row.created_at)}
                </SheetDescription>
              </div>
              <StatusPill health={healthOf(item)!} />
            </div>

            <Tabs defaultValue="overview" className="flex min-h-0 flex-1 flex-col">
              <TabsList className="mx-5 mt-3 grid h-9 grid-cols-3">
                <TabsTrigger value="overview" className="text-xs">Overview</TabsTrigger>
                <TabsTrigger value="access" className="gap-1 text-xs">
                  Access <span className="rounded-full bg-muted-foreground/15 px-1.5 text-[10px]">{item.provider.capabilities.length}</span>
                </TabsTrigger>
                <TabsTrigger value="settings" className="text-xs">Settings</TabsTrigger>
              </TabsList>
              <div className="min-h-0 flex-1 overflow-y-auto px-5 pb-5">
                <TabsContent value="overview" className="mt-4 space-y-4">
                  <div className="grid grid-cols-3 gap-2">
                    <Stat label="Status" value={HEALTH[healthOf(item)!].label} />
                    {item.type === "git"
                      ? <Stat label="Default branch" value={item.row.default_branch} hint="Engineers branch from and open pull requests against this branch." />
                      : <Stat label="Region" value={item.row.region ?? "—"} />}
                    <Stat label="Credential" value={(item.type === "git" ? item.row.has_token : item.row.has_config) ? "Stored" : "Missing"}
                      hint="Encrypted at rest. The UI never shows it again; replace it in Settings." />
                  </div>
                  <div>
                    <p className="mb-1.5 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">What Gravel does with it</p>
                    <p className="text-sm text-muted-foreground">{item.provider.usage}</p>
                  </div>
                  {item.type === "git" && item.provider.id === "github" && <TestConnection item={item} />}
                </TabsContent>

                <TabsContent value="access" className="mt-4 space-y-3">
                  <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">What engineers may do</p>
                  <CapabilityList capabilities={item.provider.capabilities} />
                  <p className="flex items-start gap-2 text-xs text-muted-foreground">
                    <Lock className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                    Gravel uses the credential only for the actions above. What the provider itself allows depends on the token’s
                    own scopes — grant the least it needs.
                  </p>
                </TabsContent>

                <TabsContent value="settings" className="mt-4 space-y-4">
                  <div className="flex items-start justify-between gap-3 rounded-lg border bg-muted/20 px-3 py-2.5">
                    <div>
                      <p className="text-sm font-medium">Active</p>
                      <p className="text-[11px] text-muted-foreground">Off keeps it stored, but engineers launched while it’s off don’t receive it.</p>
                    </div>
                    <Switch checked={item.row.is_active} onChange={toggle} label="Active" className="mt-0.5" />
                  </div>
                  <Field label="Display name"><Input value={name} onChange={(e) => setName(e.target.value)} /></Field>
                  <Field label={item.type === "git" ? "Default branch" : "Region"}>
                    <Input value={branchOrRegion} onChange={(e) => setBranchOrRegion(e.target.value)} />
                  </Field>
                  {item.type === "git" && (
                    <Field label="Replace token" hint="Leave empty to keep the current one.">
                      <SecretInput label="New token" value={secret} onChange={setSecret} placeholder={item.provider.tokenPlaceholder ?? "New token"} />
                    </Field>
                  )}
                </TabsContent>
              </div>
            </Tabs>

            <div className="flex items-center gap-2 border-t px-5 py-3">
              <Button variant="ghost" size="sm" className="text-destructive hover:bg-destructive/10 hover:text-destructive" onClick={() => onDisconnect(item)}>
                <Unplug className="h-3.5 w-3.5" /> Disconnect
              </Button>
              <div className="flex-1" />
              <Button size="sm" onClick={save} disabled={pending}>
                {pending && <Loader2 className="h-3.5 w-3.5 animate-spin" />} Save changes
              </Button>
            </div>
          </>
        )}
      </SheetContent>
    </Sheet>
  )
}

// ── Cards ────────────────────────────────────────────────────────────────────

function IntegrationCard({ item, onManage, onConnect }: { item: IntegrationItem; onManage: (i: Connected) => void; onConnect: (p: ProviderInfo) => void }) {
  const health = healthOf(item)
  const p = item.provider
  return (
    <div className="surface flex flex-col p-4 transition-shadow hover:shadow-md">
      <div className="flex items-start gap-3">
        <Logo provider={p} />
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-semibold">{item.type === "available" ? p.label : item.row.name}</p>
          <p className="text-xs text-muted-foreground">{item.type === "available" ? p.category : `${p.label} · ${p.category}`}</p>
        </div>
        {health ? <StatusPill health={health} /> : (
          !p.active && (
            <Tooltip content={RISK_TIP.stored}>
              <span tabIndex={0} className="shrink-0 rounded-full border px-2 py-0.5 text-[11px] text-muted-foreground">Storage only</span>
            </Tooltip>
          )
        )}
      </div>
      <p className="mt-3 line-clamp-2 flex-1 text-xs text-muted-foreground">{p.blurb}</p>
      <div className="mt-3 flex items-center justify-between border-t pt-2.5 text-xs">
        {item.type === "available" ? (
          <>
            <span className="text-muted-foreground">{p.active ? "Used by Gravel’s engineers" : "Kept for your engineers"}</span>
            <Button size="sm" variant="outline" className="h-7" onClick={() => onConnect(p)}><Link2 className="h-3 w-3" /> Connect</Button>
          </>
        ) : (
          <>
            <span className="truncate text-muted-foreground">
              {item.type === "git" ? `branch ${item.row.default_branch}` : item.row.region ? `region ${item.row.region}` : "no region"}
              {" · "}added {formatRelativeTime(item.row.created_at)}
            </span>
            <button onClick={() => onManage(item)} className="inline-flex shrink-0 items-center gap-0.5 font-medium hover:text-primary">
              Manage <ArrowUpRight className="h-3 w-3" />
            </button>
          </>
        )}
      </div>
    </div>
  )
}

// ── Page ─────────────────────────────────────────────────────────────────────

export default function IntegrationsPage() {
  const { data: git, isLoading: gitLoading } = useGitIntegrations()
  const { data: deploy, isLoading: deployLoading } = useDeployEnvironments()
  const [status, setStatus] = useState<"all" | "connected" | "available">("all")
  const [category, setCategory] = useState<IntegrationCategory | "all">("all")
  const [query, setQuery] = useState("")
  const [connecting, setConnecting] = useState<ProviderInfo | null>(null)
  const [managing, setManaging] = useState<string | null>(null)
  const [disconnecting, setDisconnecting] = useState<Connected | null>(null)

  const items = buildItems(git ?? [], deploy ?? [])
  const connectedCount = items.filter((i) => i.type !== "available").length
  const shown = filterItems(items, { status, category, query })
  const managed = items.find((i) => i.key === managing) as Connected | undefined
  const loading = gitLoading || deployLoading

  return (
    <Page>
      <PageHeader
        icon={<Plug className="h-4 w-4" />}
        title="Integrations"
        help="integration"
        description="Connect the services your engineers work with, and see exactly what they may do with each."
        actions={
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button size="sm"><Plus className="h-3.5 w-3.5" /> Connect</Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-56">
              {CATEGORIES.map((c, i) => (
                <div key={c}>
                  {i > 0 && <DropdownMenuSeparator />}
                  <DropdownMenuLabel>{c}</DropdownMenuLabel>
                  {PROVIDERS.filter((p) => p.category === c).map((p) => (
                    <DropdownMenuItem key={p.id} onClick={() => setConnecting(p)}>
                      <Logo provider={p} size="sm" /> {p.label}
                    </DropdownMenuItem>
                  ))}
                </div>
              ))}
            </DropdownMenuContent>
          </DropdownMenu>
        }
      />

      <div className="mb-4 flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
        <div className="no-scrollbar flex gap-1.5 overflow-x-auto">
          {(["all", ...CATEGORIES] as const).map((c) => (
            <button key={c} onClick={() => setCategory(c)}
              className={cn("shrink-0 rounded-full border px-3 py-1 text-xs font-medium transition-colors",
                category === c ? "border-foreground bg-foreground text-background" : "bg-background text-muted-foreground hover:text-foreground")}>
              {c === "all" ? "All categories" : c}
            </button>
          ))}
        </div>
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
          <Segmented
            size="sm"
            value={status}
            onChange={setStatus}
            options={[
              { value: "all", label: <>All <span className="text-muted-foreground">{items.length}</span></> },
              { value: "connected", label: <>Connected <span className="text-muted-foreground">{connectedCount}</span></> },
              { value: "available", label: <>Available <span className="text-muted-foreground">{items.length - connectedCount}</span></> },
            ]}
          />
          <div className="relative">
            <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
            <Input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search integrations" aria-label="Search integrations" className="h-8 pl-8 text-xs sm:w-52" />
          </div>
        </div>
      </div>

      {loading ? (
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          {[0, 1, 2, 3].map((i) => <div key={i} className="surface h-40 animate-pulse bg-muted/40" />)}
        </div>
      ) : shown.length ? (
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          {shown.map((item) => (
            <IntegrationCard key={item.key} item={item} onManage={(i) => setManaging(i.key)} onConnect={setConnecting} />
          ))}
        </div>
      ) : (
        <p className="rounded-xl border border-dashed py-12 text-center text-sm text-muted-foreground">Nothing matches — clear the search or pick another filter.</p>
      )}

      <div className="surface mt-6 flex flex-col gap-3 p-4 sm:flex-row sm:items-center">
        <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-muted"><Lock className="h-4 w-4" /></span>
        <div className="min-w-0 flex-1">
          <p className="text-sm font-semibold">How credentials are handled</p>
          <p className="text-xs text-muted-foreground">
            Encrypted at rest and never shown again. Docker engineers receive an active GitHub token and AWS keys as environment
            variables when they launch; local runners use your own machine’s credentials instead.
          </p>
        </div>
        <a href="https://github.com/portfolio-ltd/gravel/blob/main/docs/self-hosting.md" target="_blank" rel="noreferrer"
          className="inline-flex shrink-0 items-center gap-1 text-xs font-medium hover:text-primary">
          Read the docs <ArrowUpRight className="h-3 w-3" />
        </a>
      </div>

      <ConnectDialog provider={connecting} onClose={() => setConnecting(null)} />
      <DetailSheet item={managed ?? null} onClose={() => setManaging(null)} onDisconnect={(i) => setDisconnecting(i)} />
      <DisconnectDialog item={disconnecting} onClose={() => setDisconnecting(null)} onDone={() => { setDisconnecting(null); setManaging(null) }} />
    </Page>
  )
}
