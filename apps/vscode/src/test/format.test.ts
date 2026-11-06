import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  apiErrorMessage,
  boardWebUrl,
  demoteHeadings,
  latestDocuments,
  projectWebUrl,
  runnerCommand,
  taskMarkdown,
  taskSummary,
  waitingOn,
  type Task,
  type TaskDocument,
} from '../format';

const task = (id: string, status: Task['status'], depends_on: string[] = []): Task => ({
  id,
  title: `Task ${id}`,
  status,
  priority: 'high',
  type: 'feature',
  description: '',
  depends_on,
});

const doc = (kind: string, version: number, body = `${kind} v${version}`): TaskDocument => ({
  id: `${kind}-${version}`,
  kind,
  title: kind[0].toUpperCase() + kind.slice(1),
  body_markdown: body,
  version,
  created_at: `2026-11-0${version}T00:00:00Z`,
});

test('waitingOn counts unfinished, known dependencies only', () => {
  const tasks = [task('a', 'done'), task('b', 'in_progress'), task('c', 'pending', ['a', 'b', 'gone'])];
  assert.deepEqual(waitingOn(tasks[2], tasks).map((t) => t.id), ['b']);
  assert.equal(taskSummary(tasks[2], tasks), 'Pending · high · waiting on 1');
  assert.equal(taskSummary(tasks[1], tasks), 'In progress · high');
});

test('latestDocuments keeps the newest version per kind in method order', () => {
  const docs = [doc('plan', 1), doc('analysis', 1), doc('plan', 3), doc('custom', 1), doc('plan', 2)];
  assert.deepEqual(
    latestDocuments(docs).map((d) => d.id),
    ['analysis-1', 'plan-3', 'custom-1'],
  );
});

test('demoteHeadings skips fenced code', () => {
  const md = '# Title\ntext\n```\n# comment\n```\n## Sub';
  assert.equal(demoteHeadings(md), '## Title\ntext\n```\n# comment\n```\n### Sub');
});

test('taskMarkdown renders criteria, dependencies, PR and documents', () => {
  const dep = task('a', 'qa');
  const t: Task = {
    ...task('b', 'in_progress', ['a']),
    description: 'Do the thing.',
    pr_url: 'https://github.com/o/r/pull/1',
    acceptance_criteria: [
      { id: '1', text: 'Works', done: true },
      { id: '2', text: 'Tested', done: false },
    ],
  };
  const md = taskMarkdown(t, [dep, t], [doc('spec', 1, '# Spec\nBody'), doc('spec', 2, '# Spec\nNewer')], 'Proj');
  assert.match(md, /^# Task b\n/);
  assert.match(md, /\*\*Project:\*\* Proj · \*\*Status:\*\* In progress/);
  assert.match(md, /- \[x\] Works\n- \[ \] Tested/);
  assert.match(md, /- Task a \(QA\)/);
  assert.match(md, /<https:\/\/github.com\/o\/r\/pull\/1>/);
  assert.match(md, /## Spec \(v2\)\n\n## Spec\nNewer/);
  assert.doesNotMatch(md, /Body/);
});

test('apiErrorMessage reads FastAPI detail', () => {
  assert.equal(apiErrorMessage(409, '{"detail":"Run is not waiting for approval"}'), 'Run is not waiting for approval');
  assert.equal(apiErrorMessage(422, '{"detail":[{"msg":"field required"}]}'), 'field required');
  assert.equal(apiErrorMessage(502, '<html>'), 'Request failed (HTTP 502)');
});

test('web URLs and runner command', () => {
  assert.equal(projectWebUrl('https://trygravel.com/', 'p 1'), 'https://trygravel.com/projects?project=p%201');
  assert.equal(boardWebUrl('https://trygravel.com', 'p1'), 'https://trygravel.com/board?project=p1');
  assert.equal(runnerCommand('codex'), 'gravel work --executor codex');
  assert.equal(runnerCommand('codex; rm -rf ~'), 'gravel work');
});
