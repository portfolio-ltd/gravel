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
  email_verified_at: string | null
  preferences?: Record<string, unknown> | null
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
  repo_url: string | null
  default_branch: string
  workflow_id: string | null
  issues_repo: string | null
  post_issue_comments: boolean
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
  branch_name: string | null
  pr_url: string | null
  deploy_url: string | null
  workflow_stage_id: string | null
  rework_count: number
  acceptance_criteria: AcceptanceCriterion[]
  external_source: string | null
  external_id: string | null
  external_url: string | null
  /** Task graph: ids of tasks in the same project that must be done first */
  depends_on: string[]
  tags: Tag[]
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

// ── Engineers ─────────────────────────────────────────────────────────────────

export type EngineerStatus = "idle" | "running" | "stopped" | "error"

export interface EngineerRuntime {
  id: string
  container_id: string | null
  container_name: string | null
  status_message: string | null
  current_task_run_id: string | null
  started_at: string
  stopped_at: string | null
  last_heartbeat_at: string | null
  is_active: boolean
}

export interface Engineer {
  id: string
  name: string
  template: string
  skills_markdown: string | null
  status: EngineerStatus
  owner_id: string
  model_provider: string
  model_name: string
  created_at: string
  runtimes: EngineerRuntime[]
}

export interface EngineerCreate {
  name: string
  template: string
  skills_markdown?: string
  model_provider?: string
  model_name?: string
}

// ── Task Runs ─────────────────────────────────────────────────────────────────

export type TaskRunPhase = "grooming" | "build" | "testing" | "deployment"
export type TaskRunOutcome =
  | "grooming_complete" | "build_complete" | "testing_complete" | "deployment_complete"
  | "needs_human_input" | "blocked" | "failed"
export type CommentAuthorType = "human" | "ai"
export type ArtifactType = "screenshot" | "log" | "test_result"

export interface TaskRunLog {
  id: string
  task_run_id: string
  message: string
  level: string
  created_at: string
}

export interface EvidenceArtifact {
  id: string
  task_run_id: string
  artifact_type: ArtifactType
  file_path: string
  filename: string
  created_at: string
}

export interface TaskRun {
  id: string
  task_id: string
  engineer_id: string | null
  phase: TaskRunPhase
  workflow_stage_id: string | null
  attempt_number: number
  harness_id?: string | null
  outcome: TaskRunOutcome | null
  blocking_reason: string | null
  summary: string | null
  approval_required: boolean
  approved_at: string | null
  started_at: string
  claimed_at: string | null
  completed_at: string | null
  last_heartbeat_at: string | null
  logs?: TaskRunLog[]
  artifacts?: EvidenceArtifact[]
}

export interface TaskComment {
  id: string
  task_id: string
  task_run_id: string | null
  author_id: string | null
  author_type: CommentAuthorType
  body: string
  action_flag: string | null
  created_at: string
}

// ── Board ─────────────────────────────────────────────────────────────────────

export interface BoardColumn {
  key: string
  label: string
  status: string | null
  stage_id: string | null
  tasks: Task[]
}

export interface BoardData {
  columns: BoardColumn[]
}

export interface AttentionTask {
  task_id: string
  task_title: string
  project_id: string
  project_name: string
  run_id: string
  outcome: string
  blocking_reason: string | null
  blocked_since: string
}

export interface WorkspaceMetrics {
  total_projects: number
  engineers_running: number
  total_tasks: number
  blocked_tasks: number
  total_tokens: number
  total_cost_usd: number
}

export interface TokenSummary {
  tokens_in: number
  tokens_out: number
  cost_usd: number
  calls: number
}

// ── Organizations ─────────────────────────────────────────────────────────────

export type OrgRole = "admin" | "member"

export interface Organization {
  id: string
  name: string
  slug: string
  role: OrgRole
  member_count: number
  appearance?: OrgAppearanceSettings | null
  created_at: string
}

export interface OrgAppearanceSettings {
  accent?: string | null
  brandName?: string | null
}

export interface OrgMember {
  user_id: string
  name: string
  email: string
  role: OrgRole
  joined_at: string
}

export interface OrganizationDetail {
  id: string
  name: string
  slug: string
  appearance?: OrgAppearanceSettings | null
  created_at: string
  members: OrgMember[]
}

// ── Tags ──────────────────────────────────────────────────────────────────────

export interface Tag {
  id: string
  organization_id: string
  name: string
  color: string
  created_at: string
}

// ── PRDs ──────────────────────────────────────────────────────────────────────

export type PRDStatus = "draft" | "in_review" | "approved" | "converted" | "archived"

export interface PRDListItem {
  id: string
  organization_id: string
  title: string
  summary: string | null
  status: PRDStatus
  created_by_user_id: string | null
  comment_count: number
  tags: Tag[]
  created_at: string
  updated_at: string
}

export interface PRDComment {
  id: string
  prd_id: string
  author_id: string | null
  author_type: CommentAuthorType
  body: string
  created_at: string
}

export interface PRD extends PRDListItem {
  body_markdown: string
  comments: PRDComment[]
}

export interface PRDChatResponse {
  reply: string
  updated_body: string | null
  model: string
  tokens_in: number
  tokens_out: number
}

// ── Workflows ─────────────────────────────────────────────────────────────────

export interface WorkflowStage {
  id: string
  workflow_id: string
  name: string
  stage_order: number
  role: StageRoleKey
  block_on_open_questions: boolean
  assigned_engineer_id: string | null
  requires_human_approval: boolean
  is_ai_executable: boolean
  stage_instructions: string | null
  /** Model override for this stage; null inherits engineer → project → server default */
  model: string | null
  max_rework_attempts: number
  rework_target_stage_id: string | null
  /** Success edge; null = the next stage by order */
  next_stage_id: string | null
  /** Agent harness for this stage's runs; null = the org default, then the built-in one */
  harness_id: string | null
  created_at: string
  updated_at: string
}

export interface Workflow {
  id: string
  owner_id: string
  name: string
  description: string | null
  template_key: string | null
  created_at: string
  updated_at: string
  stages: WorkflowStage[]
}

export interface WorkflowStageCreate {
  name: string
  stage_order?: number
  role?: StageRoleKey
  block_on_open_questions?: boolean
  assigned_engineer_id?: string | null
  requires_human_approval?: boolean
  is_ai_executable?: boolean
  stage_instructions?: string | null
  model?: string | null
  max_rework_attempts?: number
  rework_target_stage_id?: string | null
  next_stage_id?: string | null
  harness_id?: string | null
}

export interface WorkflowCreate {
  name: string
  description?: string
  stages?: WorkflowStageCreate[]
}

// ── Spec-driven SDLC ─────────────────────────────────────────────────────────

export type StageRoleKey = "analyze" | "refine" | "plan" | "build" | "review" | "verify" | "deploy" | "custom"
export type DocumentKind = "analysis" | "spec" | "plan" | "scenarios" | "review" | "verification" | "notes"
export type QuestionStatus = "open" | "answered" | "deferred" | "dismissed"
export type KnowledgeKind = "decision" | "pattern" | "glossary" | "runbook" | "convention" | "wiki"
export type KnowledgeStatus = "proposed" | "accepted" | "deprecated" | "rejected"

export interface AcceptanceCriterion {
  id: string
  text: string
  done: boolean
  source: "human" | "ai"
}

export interface TaskDocument {
  id: string
  task_id: string
  kind: DocumentKind
  title: string
  body_markdown: string
  version: number
  author_type: CommentAuthorType
  author_id: string | null
  task_run_id: string | null
  workflow_stage_id: string | null
  created_at: string
}

export interface OpenQuestion {
  id: string
  task_id: string
  question: string
  owner: string | null
  status: QuestionStatus
  blocking: boolean
  answer: string | null
  answered_by_id: string | null
  answered_at: string | null
  author_type: CommentAuthorType
  created_at: string
}

export interface KnowledgeEntry {
  id: string
  organization_id: string
  project_id: string | null
  kind: KnowledgeKind
  title: string
  body_markdown: string
  status: KnowledgeStatus
  number: number | null
  label: string
  /** URL-safe name unique per org: what [[wikilinks]] and the Obsidian export use */
  slug: string | null
  /** Wiki hierarchy: the entry this one sits under */
  parent_id: string | null
  author_type: CommentAuthorType
  created_by_id: string | null
  source_task_id: string | null
  created_at: string
  updated_at: string
}

export interface KnowledgeRef {
  id: string
  title: string
  kind: KnowledgeKind
  status: KnowledgeStatus
  slug: string | null
  label: string
}

export interface KnowledgeLinks {
  outgoing: KnowledgeRef[]
  backlinks: KnowledgeRef[]
  children: KnowledgeRef[]
  unresolved: string[]
}

export interface KnowledgeImportResult {
  created: number
  updated: number
  skipped: number
  titles: string[]
}

// ── Knowledge map ────────────────────────────────────────────────────────────

export type MapNodeType = "knowledge" | "task" | "prd" | "project" | "link" | "module"
export type MapEdgeType = "wikilink" | "mentions" | "proposed" | "parent" | "scope" | "depends" | "link" | "import"

export interface MapNode {
  id: string
  type: MapNodeType
  label: string
  href?: string
  kind?: string
  status?: string
  slug?: string | null
  project_id?: string | null
  url?: string
  purpose?: string
  degree: number
}

export interface MapEdge {
  source: string
  target: string
  type: MapEdgeType
}

export interface KnowledgeMap {
  nodes: MapNode[]
  edges: MapEdge[]
  unresolved: { source: string; targets: string[] }[]
  counts: Record<MapNodeType, number>
}

// ── External links ───────────────────────────────────────────────────────────

export type LinkEntityType = "project" | "task" | "prd" | "knowledge"
export type LinkKind = "docs" | "design" | "ticket" | "dashboard" | "repo" | "spec" | "other"

export interface ExternalLinkItem {
  id: string
  organization_id: string
  entity_type: LinkEntityType
  entity_id: string
  url: string
  title: string
  kind: LinkKind
  description: string | null
  created_by_id: string | null
  created_at: string
  updated_at: string
}

// ── Agent harnesses ──────────────────────────────────────────────────────────

export type HarnessExecutor = "any" | "claude-code" | "opencode" | "llm"

export interface HarnessAgent {
  description: string
  prompt: string
  tools?: string[] | null
  model?: string | null
  /** Stage roles this subagent is offered to (empty = every role) */
  roles?: string[] | null
}

export interface AgentHarness {
  id: string
  organization_id: string
  owner_id: string | null
  name: string
  description: string | null
  template_key: string | null
  executor: HarnessExecutor
  roles: string[]
  agents: Record<string, HarnessAgent>
  routing: Record<string, string>
  instructions_markdown: string | null
  test_gate: boolean
  max_review_rounds: number
  max_turns: number
  allowed_tools: string[] | null
  disallowed_tools: string[] | null
  is_default: boolean
  created_at: string
  updated_at: string
}

export type HarnessInput = Omit<AgentHarness, "id" | "organization_id" | "owner_id" | "template_key" | "created_at" | "updated_at">

export interface HarnessTemplate {
  key: string
  name: string
  description: string
  executor: HarnessExecutor
  roles: string[]
  agents: string[]
  test_gate: boolean
  max_turns: number
}

export interface HarnessPreview {
  role: string
  files: Record<string, string>
}

export interface ModelOption {
  id: string
  label: string
  provider: "anthropic" | "openai" | "groq"
  note: string
}

export interface StageRole {
  key: StageRoleKey
  label: string
  description: string
  produces: DocumentKind[]
  default_instructions: string
}

export interface WorkflowTemplateStage {
  name: string
  role: StageRoleKey
  requires_human_approval: boolean
  is_ai_executable: boolean
  block_on_open_questions: boolean
  rework_to: string | null
  max_rework_attempts: number
}

export interface WorkflowTemplate {
  key: string
  name: string
  description: string
  recommended: boolean
  stages: WorkflowTemplateStage[]
}

export interface Meta {
  default_model: string
  models: ModelOption[]
  stage_roles: StageRole[]
  workflow_templates: WorkflowTemplate[]
}

export interface IssueImportResult {
  created: number
  updated: number
  skipped: number
  total: number
  authenticated: boolean
}

// ── Code graph ───────────────────────────────────────────────────────────────

export type CodeGraphStatus = "pending" | "building" | "ready" | "failed"

export interface CodeModule {
  id: string
  label: string
  files: number
  lines: number
  languages: string[]
  key_files: string[]
  externals: string[]
  purpose: string
}

export interface CodeGraphData {
  stats: { files: number; lines: number; languages: Record<string, number> }
  stack: string[]
  commands: { cwd: string; name: string; run: string }[]
  entry_points: string[]
  modules: CodeModule[]
  edges: { source: string; target: string; weight: number }[]
}

export interface CodeGraph {
  project_id: string
  status: CodeGraphStatus
  repo_url: string | null
  ref: string | null
  commit_sha: string | null
  graph: CodeGraphData | null
  summary_markdown: string | null
  error: string | null
  built_at: string | null
  updated_at: string
}
