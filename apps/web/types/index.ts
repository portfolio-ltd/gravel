export type UserRole = "admin" | "developer" | "qa" | "product" | "devops"
export type ProjectStatus = "setup" | "running" | "qa" | "review" | "done" | "deployed"
export type TaskStatus = "pending" | "in_progress" | "qa" | "done"
export type TaskPriority = "high" | "medium" | "low"
export type TaskType = "feature" | "bug" | "design" | "infra"
export type ChangelogType = "added" | "changed" | "fixed" | "infra"

export interface User {
  id: string
  name: string
  email: string
  role: UserRole
  is_active: boolean
  created_at: string
}

export interface ApiKeysMasked {
  openai?: string | null
  anthropic?: string | null
  groq?: string | null
}

export interface DesignFile {
  id: string
  filename: string
  file_path: string
}

export interface Project {
  id: string
  name: string
  status: ProjectStatus
  prd_file_path: string | null
  progress: number
  owner_id: string
  default_model: string
  created_at: string
  updated_at: string
  design_files: DesignFile[]
}

export interface ProjectDetail extends Project {
  tasks: Task[]
  changelog: ChangelogEntry[]
}

export interface Task {
  id: string
  project_id: string
  title: string
  description: string
  status: TaskStatus
  priority: TaskPriority
  type: TaskType
  position: number
  created_at: string
  updated_at: string
}

export interface ChangelogEntry {
  id: string
  project_id: string
  message: string
  type: ChangelogType
  file_path: string | null
  author_id: string | null
  created_at: string
}

export interface PaginatedChangelog {
  items: ChangelogEntry[]
  total: number
  page: number
  page_size: number
}

export interface TokenResponse {
  access_token: string
  token_type: string
  refresh_token: string
}

export class ApiError extends Error {
  constructor(public status: number, public detail: string) {
    super(detail)
  }
}

// ── Integrations ──────────────────────────────────────────────────────────────

export type GitProvider = "github" | "gitlab" | "bitbucket" | "gitea"
export type DeployProvider = "aws" | "gcp" | "azure" | "custom"

export interface GitIntegration {
  id: string
  owner_id: string
  provider: GitProvider
  name: string
  base_url: string | null
  default_branch: string
  is_active: boolean
  has_token: boolean
  created_at: string
  updated_at: string
}

export interface GitIntegrationCreate {
  provider: GitProvider
  name: string
  base_url?: string
  access_token?: string
  default_branch?: string
}

export interface DeployEnvironment {
  id: string
  owner_id: string
  project_id: string | null
  name: string
  provider: DeployProvider
  region: string | null
  is_active: boolean
  has_config: boolean
  created_at: string
  updated_at: string
}

export interface DeployEnvCreate {
  name: string
  provider: DeployProvider
  region?: string
  project_id?: string
  config?: Record<string, string>
}
