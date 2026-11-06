// Pure helpers: no vscode import, so they run under `node --test`.

export type TaskStatus = 'pending' | 'in_progress' | 'qa' | 'done';

export interface Criterion {
  id?: string;
  text: string;
  done: boolean;
}

export interface Task {
  id: string;
  project_id?: string;
  title: string;
  status: TaskStatus;
  priority: string;
  type: string;
  description: string;
  pr_url?: string | null;
  depends_on?: string[];
  acceptance_criteria?: Criterion[];
}

export interface Project {
  id: string;
  name: string;
  status: string;
  progress: number;
  repo_url?: string | null;
}

export interface ProjectDetail extends Project {
  tasks: Task[];
}

export interface TaskDocument {
  id: string;
  kind: string;
  title: string;
  body_markdown: string;
  version: number;
  created_at: string;
}

export interface AttentionTask {
  task_id: string;
  task_title: string;
  project_id: string;
  project_name: string;
  run_id: string;
  outcome: string;
  blocking_reason: string | null;
  blocked_since: string;
}

const STATUS_LABELS: Record<string, string> = {
  pending: 'Pending',
  in_progress: 'In progress',
  qa: 'QA',
  done: 'Done',
};

export function statusLabel(status: string): string {
  return STATUS_LABELS[status] ?? status;
}

/** Dependencies that exist in `tasks` and are not done. Unknown ids (deleted tasks) don't block. */
export function waitingOn(task: Task, tasks: Task[]): Task[] {
  const byId = new Map(tasks.map((t) => [t.id, t]));
  return (task.depends_on ?? [])
    .map((id) => byId.get(id))
    .filter((t): t is Task => t !== undefined && t.status !== 'done');
}

/** One-line description for a task row, e.g. "In progress · high · waiting on 2". */
export function taskSummary(task: Task, tasks: Task[]): string {
  const parts = [statusLabel(task.status), task.priority];
  const waiting = waitingOn(task, tasks).length;
  if (waiting > 0 && task.status !== 'done') parts.push(`waiting on ${waiting}`);
  return parts.join(' · ');
}

// The order the spec-driven method produces documents in; other kinds follow.
const KIND_ORDER = ['analysis', 'spec', 'plan', 'scenarios', 'review', 'verification', 'notes'];

/** Latest version of each document kind, in method order. */
export function latestDocuments(docs: TaskDocument[]): TaskDocument[] {
  const latest = new Map<string, TaskDocument>();
  for (const doc of docs) {
    const current = latest.get(doc.kind);
    if (!current || doc.version > current.version) latest.set(doc.kind, doc);
  }
  const rank = (kind: string) => {
    const i = KIND_ORDER.indexOf(kind);
    return i === -1 ? KIND_ORDER.length : i;
  };
  return [...latest.values()].sort(
    (a, b) => rank(a.kind) - rank(b.kind) || a.created_at.localeCompare(b.created_at),
  );
}

/** Push ATX headings down one level (outside code fences) so a document's own H1 nests under its section. */
export function demoteHeadings(markdown: string): string {
  let fence: string | null = null;
  return markdown
    .split('\n')
    .map((line) => {
      const marker = /^\s{0,3}(`{3,}|~{3,})/.exec(line)?.[1];
      if (marker) {
        if (fence === null) fence = marker[0];
        else if (marker[0] === fence) fence = null;
        return line;
      }
      if (fence === null && /^#{1,5}\s/.test(line)) return `#${line}`;
      return line;
    })
    .join('\n');
}

/** The single markdown document shown by "Open task". */
export function taskMarkdown(
  task: Task,
  tasks: Task[],
  docs: TaskDocument[],
  projectName?: string,
): string {
  const out: string[] = [`# ${task.title}`, ''];
  const meta = [
    `**Status:** ${statusLabel(task.status)}`,
    `**Priority:** ${task.priority}`,
    `**Type:** ${task.type}`,
  ];
  if (projectName) meta.unshift(`**Project:** ${projectName}`);
  out.push(meta.join(' · '), '');

  out.push('## Description', '', task.description.trim() || '_No description._', '');

  const criteria = task.acceptance_criteria ?? [];
  out.push('## Acceptance criteria', '');
  if (criteria.length === 0) out.push('_None yet._');
  for (const c of criteria) out.push(`- [${c.done ? 'x' : ' '}] ${c.text}`);
  out.push('');

  const deps = task.depends_on ?? [];
  if (deps.length > 0) {
    const byId = new Map(tasks.map((t) => [t.id, t]));
    out.push('## Dependencies', '');
    for (const id of deps) {
      const dep = byId.get(id);
      out.push(dep ? `- ${dep.title} (${statusLabel(dep.status)})` : `- ${id} (not found)`);
    }
    out.push('');
  }

  if (task.pr_url) out.push('## Pull request', '', `<${task.pr_url}>`, '');

  for (const doc of latestDocuments(docs)) {
    out.push(`## ${doc.title || doc.kind} (v${doc.version})`, '', demoteHeadings(doc.body_markdown.trim()), '');
  }
  return out.join('\n');
}

/** The text to show for an API error body: FastAPI's `detail` (string or validation list), else the status. */
export function apiErrorMessage(status: number, body: string): string {
  try {
    const detail = (JSON.parse(body) as { detail?: unknown }).detail;
    if (typeof detail === 'string' && detail) return detail;
    if (Array.isArray(detail)) {
      const msgs = detail
        .map((d) => (d && typeof d === 'object' && 'msg' in d ? String((d as { msg: unknown }).msg) : ''))
        .filter(Boolean);
      if (msgs.length > 0) return msgs.join('; ');
    }
  } catch {
    // not JSON; fall through
  }
  return `Request failed (HTTP ${status})`;
}

export function joinUrl(base: string, path: string): string {
  return `${base.replace(/\/+$/, '')}/${path.replace(/^\/+/, '')}`;
}

export function projectWebUrl(webUrl: string, projectId: string): string {
  return joinUrl(webUrl, `projects?project=${encodeURIComponent(projectId)}`);
}

export function boardWebUrl(webUrl: string, projectId: string): string {
  return joinUrl(webUrl, `board?project=${encodeURIComponent(projectId)}`);
}

export const EXECUTORS = ['claude-code', 'codex', 'opencode'] as const;

/** The runner command line. Unknown executors are dropped rather than passed to a shell. */
export function runnerCommand(executor: string | undefined): string {
  return executor && (EXECUTORS as readonly string[]).includes(executor)
    ? `gravel work --executor ${executor}`
    : 'gravel work';
}
