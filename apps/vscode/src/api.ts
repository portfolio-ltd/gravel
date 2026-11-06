import * as vscode from 'vscode';
import {
  apiErrorMessage,
  joinUrl,
  type AttentionTask,
  type Project,
  type ProjectDetail,
  type TaskDocument,
} from './format';

export class ApiError extends Error {
  constructor(
    readonly status: number,
    message: string,
  ) {
    super(message);
  }
}

export interface DeviceStart {
  device_code: string;
  user_code: string;
  verification_uri: string;
  verification_uri_complete: string;
  interval: number;
  expires_in: number;
}

export interface DeviceToken {
  status: 'pending' | 'slow_down' | 'approved' | 'denied' | 'expired' | string;
  access_token?: string;
}

export interface Me {
  id: string;
  name: string;
  email: string;
}

export function settings() {
  const cfg = vscode.workspace.getConfiguration('gravel');
  return {
    apiUrl: cfg.get<string>('apiUrl', 'https://api.trygravel.com').trim(),
    webUrl: cfg.get<string>('webUrl', 'https://trygravel.com').trim(),
    refreshSeconds: cfg.get<number>('refreshSeconds', 60),
    runnerExecutor: cfg.get<string>('runnerExecutor', 'claude-code'),
    orgId: cfg.get<string>('orgId', '').trim(),
  };
}

// Tokens are keyed by API URL so one server's token is never sent to another.
const secretKey = (apiUrl: string) => `gravel.token:${apiUrl.replace(/\/+$/, '')}`;

export class GravelClient {
  private readonly changed = new vscode.EventEmitter<void>();
  /** Fires when the stored token changes (sign in, sign out, another window). */
  readonly onDidChangeAuth = this.changed.event;
  private unauthorizedPrompted = false;

  constructor(private readonly secrets: vscode.SecretStorage) {
    secrets.onDidChange((e) => {
      if (e.key === secretKey(settings().apiUrl)) this.changed.fire();
    });
  }

  token(): Thenable<string | undefined> {
    return this.secrets.get(secretKey(settings().apiUrl));
  }

  async setToken(token: string): Promise<void> {
    this.unauthorizedPrompted = false;
    await this.secrets.store(secretKey(settings().apiUrl), token);
    this.changed.fire();
  }

  async clearToken(): Promise<void> {
    await this.secrets.delete(secretKey(settings().apiUrl));
    this.changed.fire();
  }

  async request<T>(method: string, path: string, body?: unknown, token?: string): Promise<T> {
    const { apiUrl, orgId } = settings();
    const bearer = token ?? (await this.token());
    const headers: Record<string, string> = { Accept: 'application/json' };
    if (body !== undefined) headers['Content-Type'] = 'application/json';
    if (bearer) headers.Authorization = `Bearer ${bearer}`;
    if (orgId) headers['X-Org-Id'] = orgId;

    let res: Response;
    try {
      res = await fetch(joinUrl(apiUrl, path), {
        method,
        headers,
        body: body === undefined ? undefined : JSON.stringify(body),
      });
    } catch (err) {
      throw new ApiError(0, `Could not reach ${apiUrl}: ${(err as Error).message}`);
    }
    const text = await res.text();
    if (!res.ok) {
      if (res.status === 401 && bearer && token === undefined) this.promptSignIn();
      throw new ApiError(res.status, apiErrorMessage(res.status, text));
    }
    return (text ? JSON.parse(text) : undefined) as T;
  }

  // Shown once per session expiry so auto-refresh doesn't stack notifications.
  private promptSignIn(): void {
    if (this.unauthorizedPrompted) return;
    this.unauthorizedPrompted = true;
    void vscode.window
      .showWarningMessage('Your Gravel session is no longer valid. Sign in again.', 'Sign In', 'Use API Token')
      .then((choice) => {
        if (choice === 'Sign In') void vscode.commands.executeCommand('gravel.signIn');
        if (choice === 'Use API Token') void vscode.commands.executeCommand('gravel.signInWithToken');
      });
  }

  me(token?: string) {
    return this.request<Me>('GET', '/api/auth/me', undefined, token);
  }
  deviceStart() {
    return this.request<DeviceStart>('POST', '/api/auth/device/start', { client_name: 'VS Code' }, '');
  }
  projects() {
    return this.request<Project[]>('GET', '/api/projects');
  }
  project(id: string) {
    return this.request<ProjectDetail>('GET', `/api/projects/${encodeURIComponent(id)}`);
  }
  documents(taskId: string) {
    return this.request<TaskDocument[]>('GET', `/api/tasks/${encodeURIComponent(taskId)}/documents`);
  }
  attention() {
    return this.request<AttentionTask[]>('GET', '/api/overview/attention-tasks');
  }
  approve(runId: string, note: string | null) {
    return this.request('POST', `/api/task-runs/${encodeURIComponent(runId)}/approve`, { note });
  }
  requestChanges(runId: string, note: string) {
    return this.request('POST', `/api/task-runs/${encodeURIComponent(runId)}/reject`, { note, rework: true });
  }

  /** The token endpoint answers with a `status` even on non-2xx responses, so read the body either way. */
  async deviceToken(deviceCode: string): Promise<DeviceToken> {
    const { apiUrl } = settings();
    let res: Response;
    try {
      res = await fetch(joinUrl(apiUrl, '/api/auth/device/token'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
        body: JSON.stringify({ device_code: deviceCode }),
      });
    } catch (err) {
      throw new ApiError(0, `Could not reach ${apiUrl}: ${(err as Error).message}`);
    }
    const text = await res.text();
    let parsed: Partial<DeviceToken> = {};
    try {
      parsed = JSON.parse(text) as Partial<DeviceToken>;
    } catch {
      // handled below
    }
    if (typeof parsed.status === 'string') return parsed as DeviceToken;
    throw new ApiError(res.status, apiErrorMessage(res.status, text));
  }
}
