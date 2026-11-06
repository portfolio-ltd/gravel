import * as vscode from 'vscode';
import { ApiError, type GravelClient } from './api';
import {
  statusLabel,
  taskSummary,
  waitingOn,
  type AttentionTask,
  type Project,
  type ProjectDetail,
  type Task,
} from './format';

export type ProjectNode = { kind: 'project'; project: Project };
export type TaskNode = { kind: 'task'; task: Task; project: ProjectDetail };
export type GateNode = { kind: 'gate'; gate: AttentionTask };
type MessageNode = { kind: 'message'; text: string; icon: string };
export type Node = ProjectNode | TaskNode | GateNode | MessageNode;

function errorNode(err: unknown): MessageNode {
  const text =
    err instanceof ApiError && err.status === 401
      ? 'Session expired. Run "Gravel: Sign In".'
      : `Could not load: ${(err as Error).message}`;
  return { kind: 'message', text, icon: 'error' };
}

const STATUS_ICONS: Record<string, [string, string?]> = {
  pending: ['circle-large-outline'],
  in_progress: ['play-circle', 'charts.blue'],
  qa: ['beaker', 'charts.purple'],
  done: ['pass-filled', 'testing.iconPassed'],
};

function statusIcon(status: string): vscode.ThemeIcon {
  const [id, color] = STATUS_ICONS[status] ?? ['circle-large-outline'];
  return new vscode.ThemeIcon(id, color ? new vscode.ThemeColor(color) : undefined);
}

function messageItem(node: MessageNode): vscode.TreeItem {
  const item = new vscode.TreeItem(node.text);
  item.iconPath = new vscode.ThemeIcon(node.icon);
  return item;
}

abstract class Provider implements vscode.TreeDataProvider<Node> {
  protected readonly emitter = new vscode.EventEmitter<Node | undefined>();
  readonly onDidChangeTreeData = this.emitter.event;

  constructor(
    protected readonly client: GravelClient,
    protected readonly isSignedIn: () => boolean,
  ) {}

  refresh(): void {
    this.emitter.fire(undefined);
  }

  abstract getTreeItem(node: Node): vscode.TreeItem;
  abstract getChildren(node?: Node): Promise<Node[]>;
}

export class ProjectsProvider extends Provider {
  /** Project details fetched on expand; `openTask` reads tasks from here. */
  readonly details = new Map<string, ProjectDetail>();

  override refresh(): void {
    this.details.clear();
    super.refresh();
  }

  getTreeItem(node: Node): vscode.TreeItem {
    if (node.kind === 'project') {
      const { project } = node;
      const item = new vscode.TreeItem(project.name, vscode.TreeItemCollapsibleState.Collapsed);
      item.id = `project:${project.id}`;
      item.description = `${project.status} · ${project.progress}%`;
      item.tooltip = project.repo_url ? `${project.name}\n${project.repo_url}` : project.name;
      item.iconPath = new vscode.ThemeIcon('project');
      item.contextValue = 'project';
      return item;
    }
    if (node.kind === 'task') {
      const { task, project } = node;
      const item = new vscode.TreeItem(task.title);
      item.id = `task:${task.id}`;
      item.description = taskSummary(task, project.tasks);
      const blockers = task.status === 'done' ? [] : waitingOn(task, project.tasks);
      const lines = [`${task.title}`, `${statusLabel(task.status)} · ${task.priority} · ${task.type}`];
      if (blockers.length > 0) lines.push(`Waiting on: ${blockers.map((b) => b.title).join(', ')}`);
      item.tooltip = lines.join('\n');
      item.iconPath = statusIcon(task.status);
      item.contextValue = 'task';
      item.command = { command: 'gravel.openTask', title: 'Open Task', arguments: [node] };
      return item;
    }
    if (node.kind === 'message') return messageItem(node);
    throw new Error(`unexpected node ${node.kind}`);
  }

  async getChildren(node?: Node): Promise<Node[]> {
    if (!this.isSignedIn()) return [];
    try {
      if (!node) {
        const projects = await this.client.projects();
        return projects.map((project) => ({ kind: 'project', project }));
      }
      if (node.kind === 'project') {
        const detail = await this.client.project(node.project.id);
        this.details.set(detail.id, detail);
        if (detail.tasks.length === 0) return [{ kind: 'message', text: 'No tasks yet', icon: 'info' }];
        return detail.tasks.map((task) => ({ kind: 'task', task, project: detail }));
      }
      return [];
    } catch (err) {
      return [errorNode(err)];
    }
  }
}

export class GatesProvider extends Provider {
  /** Called with the number of gates after each load, for the view badge. */
  onCount: (count: number) => void = () => undefined;

  getTreeItem(node: Node): vscode.TreeItem {
    if (node.kind === 'gate') {
      const { gate } = node;
      const item = new vscode.TreeItem(gate.task_title);
      item.id = `gate:${gate.run_id}`;
      item.description = `${gate.project_name} · ${gate.outcome}`;
      const since = new Date(gate.blocked_since);
      const lines = [gate.task_title, `${gate.project_name} · ${gate.outcome}`];
      if (gate.blocking_reason) lines.push(gate.blocking_reason);
      if (!Number.isNaN(since.getTime())) lines.push(`Waiting since ${since.toLocaleString()}`);
      item.tooltip = lines.join('\n');
      item.iconPath = new vscode.ThemeIcon(
        gate.blocking_reason ? 'warning' : 'bell',
        new vscode.ThemeColor(gate.blocking_reason ? 'list.warningForeground' : 'charts.yellow'),
      );
      item.contextValue = 'gate';
      item.command = { command: 'gravel.openTask', title: 'Open Task', arguments: [node] };
      return item;
    }
    if (node.kind === 'message') return messageItem(node);
    throw new Error(`unexpected node ${node.kind}`);
  }

  async getChildren(node?: Node): Promise<Node[]> {
    if (node) return [];
    if (!this.isSignedIn()) {
      this.onCount(0);
      return [];
    }
    try {
      const gates = await this.client.attention();
      this.onCount(gates.length);
      return gates.map((gate) => ({ kind: 'gate', gate }));
    } catch (err) {
      this.onCount(0);
      return [errorNode(err)];
    }
  }
}
