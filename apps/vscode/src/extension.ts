import * as vscode from 'vscode';
import { GravelClient, settings } from './api';
import { signIn, signInWithToken, signOut } from './auth';
import { boardWebUrl, projectWebUrl, runnerCommand, taskMarkdown, type Task } from './format';
import { GatesProvider, ProjectsProvider, type Node } from './trees';

const RUNNER_TERMINAL = 'Gravel runner';
const RUNTIME_DOCS = 'https://github.com/portfolio-ltd/gravel/tree/main/apps/runtime';

export function activate(context: vscode.ExtensionContext): void {
  const client = new GravelClient(context.secrets);
  let signedIn = false;

  const projects = new ProjectsProvider(client, () => signedIn);
  const gates = new GatesProvider(client, () => signedIn);
  const projectsView = vscode.window.createTreeView('gravel.projects', { treeDataProvider: projects });
  const gatesView = vscode.window.createTreeView('gravel.gates', { treeDataProvider: gates });
  gates.onCount = (count) => {
    gatesView.badge = count > 0 ? { value: count, tooltip: `${count} waiting on you` } : undefined;
  };

  const refresh = () => {
    projects.refresh();
    gates.refresh();
  };

  const syncAuth = async () => {
    signedIn = Boolean(await client.token());
    await vscode.commands.executeCommand('setContext', 'gravel.signedIn', signedIn);
    refresh();
  };

  let timer: NodeJS.Timeout | undefined;
  const schedule = () => {
    if (timer) clearInterval(timer);
    timer = undefined;
    const seconds = settings().refreshSeconds;
    if (seconds > 0) timer = setInterval(() => signedIn && refresh(), Math.max(seconds, 5) * 1000);
  };

  const withNode = <T extends Node['kind']>(kinds: T[], fn: (node: Extract<Node, { kind: T }>) => unknown) =>
    (node?: Node) => {
      if (node && (kinds as string[]).includes(node.kind)) return fn(node as Extract<Node, { kind: T }>);
      void vscode.window.showInformationMessage('Pick an item in the Gravel views to use this command.');
      return undefined;
    };

  const report = (err: unknown) => void vscode.window.showErrorMessage(`Gravel: ${(err as Error).message}`);

  context.subscriptions.push(
    projectsView,
    gatesView,
    client.onDidChangeAuth(() => void syncAuth()),
    vscode.workspace.onDidChangeConfiguration((e) => {
      if (e.affectsConfiguration('gravel.apiUrl')) void syncAuth();
      else if (e.affectsConfiguration('gravel.orgId')) refresh();
      if (e.affectsConfiguration('gravel.refreshSeconds')) schedule();
    }),
    { dispose: () => timer && clearInterval(timer) },

    vscode.commands.registerCommand('gravel.signIn', () => signIn(client)),
    vscode.commands.registerCommand('gravel.signInWithToken', () => signInWithToken(client)),
    vscode.commands.registerCommand('gravel.signOut', () => signOut(client)),
    vscode.commands.registerCommand('gravel.refresh', refresh),

    vscode.commands.registerCommand(
      'gravel.openTask',
      withNode(['task', 'gate'], async (node) => {
        const projectId = node.kind === 'task' ? node.project.id : node.gate.project_id;
        const taskId = node.kind === 'task' ? node.task.id : node.gate.task_id;
        try {
          const [project, docs] = await vscode.window.withProgress(
            { location: vscode.ProgressLocation.Window, title: 'Gravel: loading task' },
            () => Promise.all([client.project(projectId), client.documents(taskId)]),
          );
          const task = project.tasks.find((t: Task) => t.id === taskId);
          if (!task) {
            void vscode.window.showWarningMessage('That task no longer exists.');
            return;
          }
          const doc = await vscode.workspace.openTextDocument({
            language: 'markdown',
            content: taskMarkdown(task, project.tasks, docs, project.name),
          });
          await vscode.window.showTextDocument(doc, { preview: true });
          await vscode.commands.executeCommand('markdown.showPreview', doc.uri);
        } catch (err) {
          report(err);
        }
      }),
    ),

    vscode.commands.registerCommand('gravel.openInBrowser', (node?: Node) => {
      const { webUrl } = settings();
      let url = webUrl;
      if (node?.kind === 'project') url = projectWebUrl(webUrl, node.project.id);
      else if (node?.kind === 'task') url = boardWebUrl(webUrl, node.project.id);
      else if (node?.kind === 'gate') url = boardWebUrl(webUrl, node.gate.project_id);
      return vscode.env.openExternal(vscode.Uri.parse(url));
    }),

    vscode.commands.registerCommand(
      'gravel.approve',
      withNode(['gate'], async ({ gate }) => {
        const note = await vscode.window.showInputBox({
          title: `Approve: ${gate.task_title}`,
          prompt: 'Optional note for the record. Press Enter to approve, Escape to cancel.',
          ignoreFocusOut: true,
        });
        if (note === undefined) return;
        try {
          await vscode.window.withProgress(
            { location: vscode.ProgressLocation.Notification, title: `Approving ${gate.task_title}` },
            () => client.approve(gate.run_id, note.trim() || null),
          );
          void vscode.window.showInformationMessage(`Approved "${gate.task_title}".`);
        } catch (err) {
          report(err);
        }
        refresh();
      }),
    ),

    vscode.commands.registerCommand(
      'gravel.requestChanges',
      withNode(['gate'], async ({ gate }) => {
        const note = await vscode.window.showInputBox({
          title: `Request changes: ${gate.task_title}`,
          prompt: 'What needs to change? The task goes back for rework with this note.',
          ignoreFocusOut: true,
          validateInput: (v) => (v.trim() ? undefined : 'A note is required.'),
        });
        if (!note?.trim()) return;
        try {
          await vscode.window.withProgress(
            { location: vscode.ProgressLocation.Notification, title: `Requesting changes on ${gate.task_title}` },
            () => client.requestChanges(gate.run_id, note.trim()),
          );
          void vscode.window.showInformationMessage(`Requested changes on "${gate.task_title}".`);
        } catch (err) {
          report(err);
        }
        refresh();
      }),
    ),

    vscode.commands.registerCommand('gravel.startRunner', async () => {
      const existing = vscode.window.terminals.find((t) => t.name === RUNNER_TERMINAL && t.exitStatus === undefined);
      if (existing) {
        existing.show();
        return;
      }
      const terminal = vscode.window.createTerminal({ name: RUNNER_TERMINAL });
      terminal.show();
      terminal.sendText(runnerCommand(settings().runnerExecutor));
      const choice = await vscode.window.showInformationMessage(
        'The runner uses the gravel CLI (pip install ./apps/runtime). If it says you are not signed in, run "gravel login" in that terminal first, then "gravel work" again.',
        'Runtime Docs',
      );
      if (choice) await vscode.env.openExternal(vscode.Uri.parse(RUNTIME_DOCS));
    }),
  );

  schedule();
  void syncAuth();
}

export function deactivate(): void {}
