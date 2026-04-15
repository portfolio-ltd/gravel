"use client"

import { useState } from "react"
import { Plus, Trash2, CheckCircle2, AlertCircle, Eye, EyeOff, Loader2, GitBranch, Server, Link2 } from "lucide-react"
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs"
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import {
  useGitIntegrations, useCreateGitIntegration, useDeleteGitIntegration, useUpdateGitIntegration,
  useDeployEnvironments, useCreateDeployEnvironment, useDeleteDeployEnvironment,
} from "@/hooks/useIntegrations"
import { cn, formatRelativeTime } from "@/lib/utils"
import { toast } from "sonner"
import type { GitProvider, DeployProvider, GitIntegration, DeployEnvironment } from "@/types"

// ── Provider metadata ─────────────────────────────────────────────────────────

const GIT_PROVIDERS: {
  id: GitProvider; label: string; color: string; badge: string; needsBaseUrl: boolean; placeholder: string
}[] = [
  { id: "github",    label: "GitHub",     color: "bg-[#24292e] text-white", badge: "bg-slate-100 text-slate-800", needsBaseUrl: false, placeholder: "ghp_…" },
  { id: "gitlab",    label: "GitLab",     color: "bg-[#fc6d26] text-white", badge: "bg-orange-100 text-orange-800", needsBaseUrl: false, placeholder: "glpat-…" },
  { id: "bitbucket", label: "Bitbucket",  color: "bg-[#0052cc] text-white", badge: "bg-blue-100 text-blue-800", needsBaseUrl: false, placeholder: "App password" },
  { id: "gitea",     label: "Gitea",      color: "bg-[#609926] text-white", badge: "bg-green-100 text-green-800", needsBaseUrl: true,  placeholder: "Access token" },
]

const DEPLOY_PROVIDERS: {
  id: DeployProvider; label: string; color: string; badge: string; fields: { key: string; label: string; placeholder: string; secret?: boolean }[]
}[] = [
  {
    id: "aws", label: "AWS", color: "bg-[#ff9900] text-white", badge: "bg-amber-100 text-amber-800",
    fields: [
      { key: "access_key_id",     label: "Access Key ID",         placeholder: "AKIA…" },
      { key: "secret_access_key", label: "Secret Access Key",     placeholder: "wJalr…", secret: true },
      { key: "account_id",        label: "Account ID (optional)", placeholder: "123456789012" },
    ],
  },
  {
    id: "gcp", label: "GCP", color: "bg-[#4285f4] text-white", badge: "bg-blue-100 text-blue-800",
    fields: [
      { key: "project_id",       label: "Project ID",            placeholder: "my-project-123" },
      { key: "service_account",  label: "Service Account JSON",  placeholder: '{"type": "service_account", …}', secret: true },
    ],
  },
  {
    id: "azure", label: "Azure", color: "bg-[#0078d4] text-white", badge: "bg-sky-100 text-sky-800",
    fields: [
      { key: "tenant_id",     label: "Tenant ID",     placeholder: "xxxxxxxx-…" },
      { key: "client_id",     label: "Client ID",     placeholder: "xxxxxxxx-…" },
      { key: "client_secret", label: "Client Secret", placeholder: "xxxxxxxx~…", secret: true },
    ],
  },
  {
    id: "custom", label: "BYOS", color: "bg-slate-700 text-white", badge: "bg-slate-100 text-slate-700",
    fields: [
      { key: "server_url", label: "Server URL",   placeholder: "https://your-server.com" },
      { key: "ssh_user",   label: "SSH User",     placeholder: "deploy" },
      { key: "ssh_key",    label: "SSH Private Key", placeholder: "-----BEGIN OPENSSH PRIVATE KEY-----", secret: true },
    ],
  },
]

// ── Shared helpers ────────────────────────────────────────────────────────────

function SecretField({ label, value, onChange, placeholder }: {
  label: string; value: string; onChange: (v: string) => void; placeholder: string
}) {
  const [show, setShow] = useState(false)
  return (
    <div className="space-y-1.5">
      <label className="text-sm font-medium">{label}</label>
      <div className="relative">
        <input
          type={show ? "text" : "password"}
          className="w-full rounded-lg border bg-background px-3 py-2.5 pr-10 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-ring placeholder:text-muted-foreground placeholder:font-sans"
          placeholder={placeholder}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          autoComplete="off"
        />
        <button type="button" onClick={() => setShow(v => !v)} className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground">
          {show ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
        </button>
      </div>
    </div>
  )
}

// ── Connect Git dialog ────────────────────────────────────────────────────────

function ConnectGitDialog({ provider, open, onOpenChange }: {
  provider: (typeof GIT_PROVIDERS)[0] | null; open: boolean; onOpenChange: (v: boolean) => void
}) {
  const [name, setName] = useState("")
  const [token, setToken] = useState("")
  const [baseUrl, setBaseUrl] = useState("")
  const [branch, setBranch] = useState("main")
  const create = useCreateGitIntegration()

  function reset() { setName(""); setToken(""); setBaseUrl(""); setBranch("main") }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!provider) return
    try {
      await create.mutateAsync({
        provider: provider.id,
        name: name.trim() || provider.label,
        access_token: token || undefined,
        base_url: provider.needsBaseUrl ? baseUrl : undefined,
        default_branch: branch,
      })
      toast.success(`${provider.label} connected`)
      onOpenChange(false)
      reset()
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : "Failed to connect")
    }
  }

  return (
    <Dialog open={open} onOpenChange={(v) => { if (!create.isPending) { onOpenChange(v); if (!v) reset() } }}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <span className={cn("text-xs font-bold px-2 py-1 rounded", provider?.color)}>{provider?.label}</span>
            Connect repository
          </DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-1.5">
            <label className="text-sm font-medium">Display name</label>
            <input
              autoFocus
              className="w-full rounded-lg border bg-background px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-ring placeholder:text-muted-foreground"
              placeholder={`My ${provider?.label} repos`}
              value={name} onChange={(e) => setName(e.target.value)}
            />
          </div>
          {provider?.needsBaseUrl && (
            <div className="space-y-1.5">
              <label className="text-sm font-medium">Base URL</label>
              <input
                className="w-full rounded-lg border bg-background px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
                placeholder="http://gitea.example.com"
                value={baseUrl} onChange={(e) => setBaseUrl(e.target.value)}
              />
            </div>
          )}
          <SecretField
            label="Personal Access Token"
            value={token} onChange={setToken}
            placeholder={provider?.placeholder ?? ""}
          />
          <div className="space-y-1.5">
            <label className="text-sm font-medium">Default branch</label>
            <input
              className="w-full rounded-lg border bg-background px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
              placeholder="main"
              value={branch} onChange={(e) => setBranch(e.target.value)}
            />
          </div>
          <p className="text-xs text-muted-foreground bg-muted rounded-lg px-3 py-2.5">
            Your token is encrypted at rest using Fernet symmetric encryption. It is never exposed in the UI or logs.
          </p>
          <div className="flex gap-2 pt-1">
            <Button type="button" variant="outline" className="flex-1" onClick={() => { onOpenChange(false); reset() }}>Cancel</Button>
            <Button type="submit" className="flex-1" disabled={create.isPending}>
              {create.isPending ? <><Loader2 className="w-4 h-4 animate-spin" /> Connecting…</> : "Connect"}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  )
}

// ── Add Deploy dialog ─────────────────────────────────────────────────────────

function AddDeployDialog({ provider, open, onOpenChange }: {
  provider: (typeof DEPLOY_PROVIDERS)[0] | null; open: boolean; onOpenChange: (v: boolean) => void
}) {
  const [name, setName] = useState("")
  const [region, setRegion] = useState("")
  const [fields, setFields] = useState<Record<string, string>>({})
  const create = useCreateDeployEnvironment()

  function reset() { setName(""); setRegion(""); setFields({}) }
  function setField(key: string, val: string) { setFields(f => ({ ...f, [key]: val })) }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!provider) return
    try {
      await create.mutateAsync({
        provider: provider.id,
        name: name.trim() || "production",
        region: region || undefined,
        config: Object.keys(fields).length > 0 ? fields : undefined,
      })
      toast.success(`${provider.label} environment added`)
      onOpenChange(false)
      reset()
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : "Failed to add environment")
    }
  }

  return (
    <Dialog open={open} onOpenChange={(v) => { if (!create.isPending) { onOpenChange(v); if (!v) reset() } }}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <span className={cn("text-xs font-bold px-2 py-1 rounded", provider?.color)}>{provider?.label}</span>
            Add environment
          </DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-1.5">
            <label className="text-sm font-medium">Environment name</label>
            <input
              autoFocus required
              className="w-full rounded-lg border bg-background px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-ring placeholder:text-muted-foreground"
              placeholder="production"
              value={name} onChange={(e) => setName(e.target.value)}
            />
          </div>
          {provider?.id !== "custom" && (
            <div className="space-y-1.5">
              <label className="text-sm font-medium">Region</label>
              <input
                className="w-full rounded-lg border bg-background px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-ring placeholder:text-muted-foreground"
                placeholder={provider?.id === "aws" ? "us-east-1" : provider?.id === "gcp" ? "us-central1" : "eastus"}
                value={region} onChange={(e) => setRegion(e.target.value)}
              />
            </div>
          )}
          {provider?.fields.map((f) => (
            f.secret
              ? <SecretField key={f.key} label={f.label} value={fields[f.key] ?? ""} onChange={(v) => setField(f.key, v)} placeholder={f.placeholder} />
              : (
                <div key={f.key} className="space-y-1.5">
                  <label className="text-sm font-medium">{f.label}</label>
                  <input
                    className="w-full rounded-lg border bg-background px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-ring placeholder:text-muted-foreground"
                    placeholder={f.placeholder}
                    value={fields[f.key] ?? ""} onChange={(e) => setField(f.key, e.target.value)}
                  />
                </div>
              )
          ))}
          <p className="text-xs text-muted-foreground bg-muted rounded-lg px-3 py-2.5">
            Credentials are encrypted at rest. Gravel never sends them to third-party services.
          </p>
          <div className="flex gap-2 pt-1">
            <Button type="button" variant="outline" className="flex-1" onClick={() => { onOpenChange(false); reset() }}>Cancel</Button>
            <Button type="submit" className="flex-1" disabled={create.isPending || !name.trim()}>
              {create.isPending ? <><Loader2 className="w-4 h-4 animate-spin" /> Adding…</> : "Add environment"}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  )
}

// ── Source control tab ────────────────────────────────────────────────────────

function GitIntegrationRow({ row }: { row: GitIntegration }) {
  const del = useDeleteGitIntegration()
  const update = useUpdateGitIntegration()
  const meta = GIT_PROVIDERS.find(p => p.id === row.provider)

  async function handleDelete() {
    if (!confirm(`Remove "${row.name}"?`)) return
    try { await del.mutateAsync(row.id); toast.success("Integration removed") }
    catch { toast.error("Failed to remove") }
  }

  return (
    <div className="flex items-center gap-4 px-5 py-4 hover:bg-muted/30 transition-colors group border-b last:border-b-0">
      <div className={cn("w-8 h-8 rounded-lg flex items-center justify-center text-[10px] font-bold shrink-0", meta?.color)}>
        {row.provider.slice(0, 2).toUpperCase()}
      </div>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          <p className="text-sm font-semibold">{row.name}</p>
          <span className={cn("text-[10px] font-semibold px-1.5 py-0.5 rounded", meta?.badge)}>{meta?.label}</span>
          {row.is_active
            ? <span className="text-[10px] text-emerald-600 flex items-center gap-0.5"><CheckCircle2 className="w-3 h-3" /> Active</span>
            : <span className="text-[10px] text-muted-foreground flex items-center gap-0.5"><AlertCircle className="w-3 h-3" /> Inactive</span>}
        </div>
        <p className="text-xs text-muted-foreground">
          Branch: {row.default_branch}
          {row.base_url && <> · {row.base_url}</>}
          {!row.has_token && <span className="text-amber-500 ml-2">⚠ No token</span>}
        </p>
      </div>
      <span className="text-xs text-muted-foreground hidden sm:block shrink-0">{formatRelativeTime(row.created_at)}</span>
      <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
        <button
          onClick={() => update.mutate({ id: row.id, is_active: !row.is_active })}
          className="p-1.5 rounded-lg hover:bg-muted text-xs text-muted-foreground hover:text-foreground"
          title={row.is_active ? "Disable" : "Enable"}
        >
          {row.is_active ? "Disable" : "Enable"}
        </button>
        <button onClick={handleDelete} className="p-1.5 rounded-lg hover:bg-destructive/10 text-muted-foreground hover:text-destructive">
          <Trash2 className="w-3.5 h-3.5" />
        </button>
      </div>
    </div>
  )
}

function SourceControlTab() {
  const { data: integrations = [], isLoading } = useGitIntegrations()
  const [connectProvider, setConnectProvider] = useState<(typeof GIT_PROVIDERS)[0] | null>(null)

  return (
    <div className="space-y-6">
      {/* Provider cards */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {GIT_PROVIDERS.map((p) => {
          const count = integrations.filter(i => i.provider === p.id).length
          return (
            <button
              key={p.id}
              onClick={() => setConnectProvider(p)}
              className="rounded-2xl border bg-card p-4 text-left hover:shadow-md hover:border-primary/40 transition-all group"
            >
              <div className={cn("w-10 h-10 rounded-xl flex items-center justify-center text-sm font-bold mb-3", p.color)}>
                {p.label.slice(0, 2)}
              </div>
              <p className="text-sm font-semibold">{p.label}</p>
              <p className="text-xs text-muted-foreground mt-0.5">
                {count > 0 ? `${count} connected` : "Not connected"}
              </p>
              <div className="mt-3 flex items-center gap-1 text-xs text-primary font-medium opacity-0 group-hover:opacity-100 transition-opacity">
                <Plus className="w-3 h-3" /> Connect
              </div>
            </button>
          )
        })}
      </div>

      {/* Connected list */}
      <div className="rounded-2xl border bg-card overflow-hidden">
        <div className="px-5 py-3.5 border-b bg-muted/30 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <GitBranch className="w-4 h-4 text-muted-foreground" />
            <h3 className="text-sm font-semibold">Connected repositories</h3>
          </div>
          <span className="text-xs text-muted-foreground">{integrations.length} total</span>
        </div>
        {isLoading ? (
          Array.from({ length: 2 }).map((_, i) => (
            <div key={i} className="h-16 border-b last:border-b-0 px-5 flex items-center gap-4">
              <div className="w-8 h-8 rounded-lg bg-muted animate-pulse" />
              <div className="flex-1 space-y-1.5">
                <div className="h-3 rounded bg-muted animate-pulse w-36" />
                <div className="h-2.5 rounded bg-muted animate-pulse w-52" />
              </div>
            </div>
          ))
        ) : integrations.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-12 gap-2 text-center">
            <Link2 className="w-7 h-7 text-muted-foreground" />
            <p className="text-sm text-muted-foreground">No integrations yet — click a provider above to connect</p>
          </div>
        ) : (
          integrations.map(row => <GitIntegrationRow key={row.id} row={row} />)
        )}
      </div>

      <ConnectGitDialog
        provider={connectProvider}
        open={!!connectProvider}
        onOpenChange={(v) => { if (!v) setConnectProvider(null) }}
      />
    </div>
  )
}

// ── Deploy environments tab ────────────────────────────────────────────────────

function DeployEnvRow({ row }: { row: DeployEnvironment }) {
  const del = useDeleteDeployEnvironment()
  const meta = DEPLOY_PROVIDERS.find(p => p.id === row.provider)

  async function handleDelete() {
    if (!confirm(`Remove "${row.name}" environment?`)) return
    try { await del.mutateAsync(row.id); toast.success("Environment removed") }
    catch { toast.error("Failed to remove") }
  }

  return (
    <div className="flex items-center gap-4 px-5 py-4 hover:bg-muted/30 transition-colors group border-b last:border-b-0">
      <div className={cn("w-8 h-8 rounded-lg flex items-center justify-center text-[10px] font-bold shrink-0", meta?.color)}>
        {row.provider === "custom" ? "⚙" : row.provider.slice(0, 3).toUpperCase()}
      </div>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          <p className="text-sm font-semibold">{row.name}</p>
          <span className={cn("text-[10px] font-semibold px-1.5 py-0.5 rounded", meta?.badge)}>{meta?.label}</span>
          {row.is_active
            ? <span className="text-[10px] text-emerald-600 flex items-center gap-0.5"><CheckCircle2 className="w-3 h-3" /> Active</span>
            : <span className="text-[10px] text-muted-foreground flex items-center gap-0.5"><AlertCircle className="w-3 h-3" /> Inactive</span>}
        </div>
        <p className="text-xs text-muted-foreground">
          {row.region && <>Region: {row.region} · </>}
          {row.has_config ? "Credentials stored" : <span className="text-amber-500">No credentials</span>}
          {row.project_id && <> · Project-scoped</>}
        </p>
      </div>
      <span className="text-xs text-muted-foreground hidden sm:block shrink-0">{formatRelativeTime(row.created_at)}</span>
      <button onClick={handleDelete} className="p-1.5 rounded-lg hover:bg-destructive/10 text-muted-foreground hover:text-destructive opacity-0 group-hover:opacity-100 transition-opacity">
        <Trash2 className="w-3.5 h-3.5" />
      </button>
    </div>
  )
}

function DeployTab() {
  const { data: envs = [], isLoading } = useDeployEnvironments()
  const [addProvider, setAddProvider] = useState<(typeof DEPLOY_PROVIDERS)[0] | null>(null)

  return (
    <div className="space-y-6">
      {/* Provider cards */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {DEPLOY_PROVIDERS.map((p) => {
          const count = envs.filter(e => e.provider === p.id).length
          return (
            <button
              key={p.id}
              onClick={() => setAddProvider(p)}
              className="rounded-2xl border bg-card p-4 text-left hover:shadow-md hover:border-primary/40 transition-all group"
            >
              <div className={cn("w-10 h-10 rounded-xl flex items-center justify-center text-sm font-bold mb-3", p.color)}>
                {p.id === "custom" ? "⚙" : p.label.slice(0, 3)}
              </div>
              <p className="text-sm font-semibold">{p.label}</p>
              <p className="text-xs text-muted-foreground mt-0.5">
                {count > 0 ? `${count} environment${count > 1 ? "s" : ""}` : "Not configured"}
              </p>
              <div className="mt-3 flex items-center gap-1 text-xs text-primary font-medium opacity-0 group-hover:opacity-100 transition-opacity">
                <Plus className="w-3 h-3" /> Add environment
              </div>
            </button>
          )
        })}
      </div>

      {/* Environments list */}
      <div className="rounded-2xl border bg-card overflow-hidden">
        <div className="px-5 py-3.5 border-b bg-muted/30 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Server className="w-4 h-4 text-muted-foreground" />
            <h3 className="text-sm font-semibold">Deploy environments</h3>
          </div>
          <span className="text-xs text-muted-foreground">{envs.length} total</span>
        </div>
        {isLoading ? (
          Array.from({ length: 2 }).map((_, i) => (
            <div key={i} className="h-16 border-b last:border-b-0 px-5 flex items-center gap-4">
              <div className="w-8 h-8 rounded-lg bg-muted animate-pulse" />
              <div className="flex-1 space-y-1.5">
                <div className="h-3 rounded bg-muted animate-pulse w-32" />
                <div className="h-2.5 rounded bg-muted animate-pulse w-48" />
              </div>
            </div>
          ))
        ) : envs.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-12 gap-2 text-center">
            <Server className="w-7 h-7 text-muted-foreground" />
            <p className="text-sm text-muted-foreground">No environments yet — click a provider above to add one</p>
          </div>
        ) : (
          envs.map(row => <DeployEnvRow key={row.id} row={row} />)
        )}
      </div>

      <AddDeployDialog
        provider={addProvider}
        open={!!addProvider}
        onOpenChange={(v) => { if (!v) setAddProvider(null) }}
      />
    </div>
  )
}

// ── Page ─────────────────────────────────────────────────────────────────────

export default function IntegrationsPage() {
  return (
    <div className="h-full overflow-y-auto no-scrollbar">
      <div className="max-w-4xl mx-auto p-6 space-y-6">
        <div>
          <h1 className="text-xl font-bold">Integrations</h1>
          <p className="text-sm text-muted-foreground">Connect source control providers and configure deployment environments. Actual sync and deploy actions come in a future release.</p>
        </div>

        <Tabs defaultValue="git">
          <TabsList className="mb-6">
            <TabsTrigger value="git" className="flex items-center gap-1.5">
              <GitBranch className="w-3.5 h-3.5" /> Source Control
            </TabsTrigger>
            <TabsTrigger value="deploy" className="flex items-center gap-1.5">
              <Server className="w-3.5 h-3.5" /> Deploy Environments
            </TabsTrigger>
          </TabsList>
          <TabsContent value="git"><SourceControlTab /></TabsContent>
          <TabsContent value="deploy"><DeployTab /></TabsContent>
        </Tabs>
      </div>
    </div>
  )
}
