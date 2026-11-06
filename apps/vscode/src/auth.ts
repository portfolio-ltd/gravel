import * as vscode from 'vscode';
import { ApiError, type GravelClient } from './api';

const sleep = (ms: number, token: vscode.CancellationToken) =>
  new Promise<void>((resolve) => {
    const timer = setTimeout(done, ms);
    const sub = token.onCancellationRequested(done);
    function done() {
      clearTimeout(timer);
      sub.dispose();
      resolve();
    }
  });

type Outcome = { status: string; access_token?: string; message?: string };

async function finishSignIn(client: GravelClient, token: string): Promise<void> {
  await client.setToken(token);
  try {
    const me = await client.me(token);
    void vscode.window.showInformationMessage(`Signed in to Gravel as ${me.name || me.email}.`);
  } catch {
    void vscode.window.showInformationMessage('Signed in to Gravel.');
  }
}

/** Device login: the user approves a short code in the browser while we poll for the token. */
export async function signIn(client: GravelClient): Promise<void> {
  const start = await client.deviceStart().catch((err: Error) => {
    void vscode.window.showErrorMessage(`Gravel sign-in failed: ${err.message}`);
    return undefined;
  });
  if (!start) return;

  const openBrowser = () => vscode.env.openExternal(vscode.Uri.parse(start.verification_uri_complete));
  void vscode.window
    .showInformationMessage(
      `Your Gravel sign-in code is ${start.user_code}. Confirm it in the browser to sign in.`,
      'Open Browser',
      'Copy Code',
    )
    .then(async (choice) => {
      if (choice === 'Open Browser') await openBrowser();
      if (choice === 'Copy Code') await vscode.env.clipboard.writeText(start.user_code);
    });

  const outcome = await vscode.window.withProgress<Outcome>(
    {
      location: vscode.ProgressLocation.Notification,
      title: `Waiting for you to approve code ${start.user_code} in the browser`,
      cancellable: true,
    },
    async (_progress, cancel) => {
      let interval = Math.max(1, start.interval || 5);
      const deadline = Date.now() + (start.expires_in || 900) * 1000;
      while (!cancel.isCancellationRequested) {
        await sleep(interval * 1000, cancel);
        if (cancel.isCancellationRequested) break;
        if (Date.now() > deadline) return { status: 'expired' };
        try {
          const res = await client.deviceToken(start.device_code);
          if (res.status === 'slow_down') interval += 5;
          else if (res.status !== 'pending') return res;
        } catch (err) {
          // Network blips and 5xx: keep polling until the code expires.
          if (err instanceof ApiError && (err.status === 0 || err.status >= 500)) continue;
          return { status: 'error', message: (err as Error).message };
        }
      }
      return { status: 'cancelled' };
    },
  );

  switch (outcome.status) {
    case 'approved':
      if (typeof outcome.access_token === 'string' && outcome.access_token) {
        await finishSignIn(client, outcome.access_token);
      } else {
        void vscode.window.showErrorMessage('Gravel sign-in was approved but no token came back.');
      }
      return;
    case 'denied':
      void vscode.window.showWarningMessage('Gravel sign-in was denied in the browser.');
      return;
    case 'expired':
      void vscode.window.showWarningMessage('The Gravel sign-in code expired. Run "Gravel: Sign In" again.');
      return;
    case 'cancelled':
      return;
    case 'error':
      void vscode.window.showErrorMessage(
        `Gravel sign-in failed: ${outcome.message ?? 'unknown error'}`,
      );
      return;
    default:
      void vscode.window.showErrorMessage(`Gravel sign-in stopped: ${outcome.status}.`);
  }
}

export async function signInWithToken(client: GravelClient): Promise<void> {
  const token = await vscode.window.showInputBox({
    title: 'Gravel API token',
    prompt: 'Create one in Gravel under Settings → API tokens.',
    placeHolder: 'grv_...',
    password: true,
    ignoreFocusOut: true,
    validateInput: (v) => (v.trim().startsWith('grv_') ? undefined : 'Gravel API tokens start with grv_'),
  });
  if (!token) return;
  try {
    await client.me(token.trim());
  } catch (err) {
    const msg = err instanceof ApiError && err.status === 401 ? 'the token was not accepted' : (err as Error).message;
    void vscode.window.showErrorMessage(`Gravel sign-in failed: ${msg}`);
    return;
  }
  await finishSignIn(client, token.trim());
}

export async function signOut(client: GravelClient): Promise<void> {
  await client.clearToken();
  void vscode.window.showInformationMessage('Signed out of Gravel.');
}
