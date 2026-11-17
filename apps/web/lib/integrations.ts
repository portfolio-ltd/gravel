/**
 * The integrations catalog: what each provider is, what Gravel actually does
 * with it today, and what engineers may do through it. Nothing here is
 * aspirational — "stored" providers are kept encrypted but not yet used by
 * Gravel's own automation.
 */
import type { DeployEnvironment, DeployProvider, GitIntegration, GitProvider } from "@/types"

export type IntegrationKind = "git" | "deploy"
export type IntegrationCategory = "Code" | "Cloud" | "Server"
export type Risk = "low" | "medium" | "high" | "never" | "stored"

export interface Capability {
  key: string
  label: string
  risk: Risk
  note?: string
}

export interface ProviderInfo {
  id: GitProvider | DeployProvider
  kind: IntegrationKind
  label: string
  category: IntegrationCategory
  /** Logo tile classes */
  color: string
  monogram: string
  blurb: string
  /** What Gravel does with it today, in one or two sentences */
  usage: string
  /** True when Gravel's own automation uses it; false = stored for later / for your agents */
  active: boolean
  capabilities: Capability[]
  tokenPlaceholder?: string
  needsBaseUrl?: boolean
  fields?: { key: string; label: string; placeholder: string; secret?: boolean }[]
}

const STORED: Capability[] = [
  { key: "stored", label: "Stored encrypted; no automatic use yet", risk: "stored" },
]

export const PROVIDERS: ProviderInfo[] = [
  {
    id: "github", kind: "git", label: "GitHub", category: "Code", color: "bg-[#24292e] text-white", monogram: "GH",
    blurb: "Repositories, branches and pull requests for your engineers.",
    usage: "Docker engineers receive the token to clone, push a branch per task and open a pull request. It also imports GitHub issues as tasks.",
    active: true, tokenPlaceholder: "ghp_…",
    capabilities: [
      { key: "repo:read", label: "Clone and read repositories", risk: "low" },
      { key: "issues:read", label: "Import issues as tasks", risk: "low" },
      { key: "branch:write", label: "Push a branch per task", risk: "medium" },
      { key: "pull_requests:write", label: "Open pull requests", risk: "medium" },
      { key: "merge", label: "Merge to the default branch", risk: "never", note: "People merge" },
    ],
  },
  {
    id: "gitlab", kind: "git", label: "GitLab", category: "Code", color: "bg-[#fc6d26] text-white", monogram: "GL",
    blurb: "Merge requests and CI for GitLab.com or self-managed.",
    usage: "Stored encrypted. Gravel's built-in Git automation uses GitHub today; GitLab import is tracked in issue #8.",
    active: false, tokenPlaceholder: "glpat-…", capabilities: STORED,
  },
  {
    id: "bitbucket", kind: "git", label: "Bitbucket", category: "Code", color: "bg-[#0052cc] text-white", monogram: "BB",
    blurb: "Repositories on Bitbucket Cloud.",
    usage: "Stored encrypted. Gravel's built-in Git automation uses GitHub today.",
    active: false, tokenPlaceholder: "App password", capabilities: STORED,
  },
  {
    id: "gitea", kind: "git", label: "Gitea", category: "Code", color: "bg-[#609926] text-white", monogram: "GT",
    blurb: "Self-hosted Git with Gitea or Forgejo.",
    usage: "Stored encrypted. Gravel's built-in Git automation uses GitHub today.",
    active: false, tokenPlaceholder: "Access token", needsBaseUrl: true, capabilities: STORED,
  },
  {
    id: "aws", kind: "deploy", label: "AWS", category: "Cloud", color: "bg-[#ff9900] text-white", monogram: "AWS",
    blurb: "Static deploys to S3 with CloudFront invalidation.",
    usage: "Docker engineers receive these credentials as environment variables, so tools inside their container can use them. The deploy endpoint uploads a build to S3 and invalidates CloudFront.",
    active: true,
    capabilities: [
      { key: "s3:put", label: "Upload builds to S3", risk: "high" },
      { key: "cloudfront:invalidate", label: "Invalidate CloudFront", risk: "medium" },
      { key: "env", label: "Available to tools inside engineer containers", risk: "high", note: "Scope the IAM key tightly" },
    ],
    fields: [
      { key: "access_key_id", label: "Access key ID", placeholder: "AKIA…" },
      { key: "secret_access_key", label: "Secret access key", placeholder: "wJalr…", secret: true },
      { key: "bucket", label: "S3 bucket", placeholder: "my-site-bucket" },
      { key: "distribution_id", label: "CloudFront distribution (optional)", placeholder: "E2ABC…" },
    ],
  },
  {
    id: "gcp", kind: "deploy", label: "Google Cloud", category: "Cloud", color: "bg-[#4285f4] text-white", monogram: "GCP",
    blurb: "A service account for Google Cloud projects.",
    usage: "Stored encrypted. Gravel doesn't deploy to Google Cloud automatically yet.",
    active: false, capabilities: STORED,
    fields: [
      { key: "project_id", label: "Project ID", placeholder: "my-project-123" },
      { key: "service_account", label: "Service account JSON", placeholder: '{"type": "service_account", …}', secret: true },
    ],
  },
  {
    id: "azure", kind: "deploy", label: "Azure", category: "Cloud", color: "bg-[#0078d4] text-white", monogram: "AZ",
    blurb: "A service principal for Azure subscriptions.",
    usage: "Stored encrypted. Gravel doesn't deploy to Azure automatically yet.",
    active: false, capabilities: STORED,
    fields: [
      { key: "tenant_id", label: "Tenant ID", placeholder: "xxxxxxxx-…" },
      { key: "client_id", label: "Client ID", placeholder: "xxxxxxxx-…" },
      { key: "client_secret", label: "Client secret", placeholder: "xxxxxxxx~…", secret: true },
    ],
  },
  {
    id: "custom", kind: "deploy", label: "Your server", category: "Server", color: "bg-slate-700 text-white", monogram: "SSH",
    blurb: "Any machine you reach over SSH.",
    usage: "Stored encrypted. Gravel doesn't deploy over SSH automatically yet.",
    active: false, capabilities: STORED,
    fields: [
      { key: "server_url", label: "Server URL", placeholder: "https://your-server.com" },
      { key: "ssh_user", label: "SSH user", placeholder: "deploy" },
      { key: "ssh_key", label: "SSH private key", placeholder: "-----BEGIN OPENSSH PRIVATE KEY-----", secret: true },
    ],
  },
]

export const CATEGORIES: IntegrationCategory[] = ["Code", "Cloud", "Server"]

export const RISK_LABEL: Record<Risk, string> = {
  low: "Low risk",
  medium: "Medium",
  high: "High impact",
  never: "Never",
  stored: "Stored",
}

export function providerInfo(id: string): ProviderInfo {
  return PROVIDERS.find((p) => p.id === id) ?? PROVIDERS[0]
}

/** One card on the page: a connection you have, or a provider you could connect. */
export type IntegrationItem =
  | { type: "git"; key: string; provider: ProviderInfo; row: GitIntegration }
  | { type: "deploy"; key: string; provider: ProviderInfo; row: DeployEnvironment }
  | { type: "available"; key: string; provider: ProviderInfo }

export type Health = "connected" | "disabled" | "incomplete"

export function healthOf(item: IntegrationItem): Health | null {
  if (item.type === "available") return null
  if (!item.row.is_active) return "disabled"
  const hasSecret = item.type === "git" ? item.row.has_token : item.row.has_config
  return hasSecret ? "connected" : "incomplete"
}

export function buildItems(git: GitIntegration[], deploy: DeployEnvironment[]): IntegrationItem[] {
  const items: IntegrationItem[] = [
    ...git.map((row) => ({ type: "git" as const, key: `git:${row.id}`, provider: providerInfo(row.provider), row })),
    ...deploy.map((row) => ({ type: "deploy" as const, key: `deploy:${row.id}`, provider: providerInfo(row.provider), row })),
  ]
  const used = new Set(items.map((i) => i.provider.id))
  for (const p of PROVIDERS) if (!used.has(p.id)) items.push({ type: "available", key: `available:${p.id}`, provider: p })
  return items
}

export function filterItems(items: IntegrationItem[], opts: {
  status: "all" | "connected" | "available"; category: IntegrationCategory | "all"; query: string
}): IntegrationItem[] {
  const q = opts.query.trim().toLowerCase()
  return items.filter((i) => {
    if (opts.status === "connected" && i.type === "available") return false
    if (opts.status === "available" && i.type !== "available") return false
    if (opts.category !== "all" && i.provider.category !== opts.category) return false
    if (!q) return true
    const name = i.type === "available" ? "" : i.row.name
    return [i.provider.label, i.provider.blurb, i.provider.category, name].some((s) => s.toLowerCase().includes(q))
  })
}
