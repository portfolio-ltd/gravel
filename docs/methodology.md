# The Gravel method

Gravel moves every task through a **workflow**: an ordered list of stages. Each
stage is executed by an AI engineer (or, for manual stages, by a person) and
may be followed by a human approval gate. The method is encoded in
`apps/api/services/sdlc.py`.

## Principles

1. **Nothing is invented.** When an engineer can't decide something from the
   material it has, it records an *open question* with a suggested owner
   instead of guessing. A refined spec keeps unanswered questions visible.
2. **Plans precede code.** Planning stages write prose plans — no code. Build
   stages implement the approved plan and don't add scope.
3. **Code is checked against the plan.** Review stages compare the change with
   the plan, the accepted decision records, the patterns the plan named, and
   the acceptance criteria.
4. **Knowledge compounds.** Accepted knowledge — decisions, patterns, glossary
   terms, runbooks, conventions — is handed to every run. Runs may propose up
   to three new entries; a person accepts or rejects them.
5. **Humans own the gates.** Approval points are part of the workflow
   definition, not an afterthought.

## Stage roles

A stage's *role* provides default instructions (used when the stage has no
custom instructions), declares which documents it produces, and controls how
its result is interpreted.

| Role | Documents | What it does |
|---|---|---|
| `analyze` | `analysis` | Judges intent, consistency and acceptance criteria (Clear / Needs work). Proposes missing criteria it can justify and records unknowns as questions. |
| `refine` | `spec` | Writes a spec with a narrative, a list of decisions (each with its source) and what is still open. Resolves a question only on a direct, specific answer. Returns the full criteria list. |
| `plan` | `plan`, `scenarios` | Summary, changes by area, risks table, decisions honored or needed, out of scope; plus a Gherkin feature with at least one scenario per criterion. |
| `build` | — | Implements the plan section by section with tests; addresses blocking review findings; never weakens a test. Pushes code and opens a PR. |
| `review` | `review` | Findings marked Blocking or Suggestion under plan adherence, decisions & patterns, acceptance coverage, quality, risks. Verdict `pass` or `changes_requested`. |
| `verify` | `verification` | Pass/Fail with evidence for every criterion. Verdict `pass` or `changes_requested`. |
| `deploy` | — | Deploys using the project's configuration and runbooks. |
| `custom` | — | Your own instructions. Treated as code-writing for runtime push purposes. |

## Gates, questions and rework

- **Approval gate** (`requires_human_approval`): a completed run parks until a
  person approves. *Approve* advances; *Request changes* records the note as a
  comment and sends the task to the stage's rework target (or reruns the
  stage).
- **Open-question gate** (`block_on_open_questions`): if blocking questions are
  still open when the stage completes, the run parks as `needs_human_input`.
  Approval is refused until every blocking question is answered, deferred or
  dismissed; approving then **reruns the stage** so the answers are used.
- **Rework loop** (`rework_target_stage_id`, `max_rework_attempts`): a failed
  run — or a review/verify verdict of `changes_requested` — sends the task back
  to the target stage until the attempt budget runs out, after which it parks
  for a person.
- **Manual stages** (`is_ai_executable = false`) create a checkpoint run that
  parks immediately; approving means "a person did this".

## Acceptance criteria

Each task carries a checklist of criteria with a `source`: `human` or `ai`.
When a stage proposes a revised list, human-written criteria are kept verbatim
and only AI-written ones are replaced. Editing an AI criterion makes it human.

## Documents

Stage documents are versioned per kind (`analysis`, `spec`, `plan`,
`scenarios`, `review`, `verification`, `notes`). A human edit creates a new
version; nothing is overwritten. The latest version of each kind is handed to
later stages.

## Stage result contract

Every stage — in-process or in a runtime — reports one JSON object:

| Field | Meaning |
|---|---|
| `outcome` | `completed`, `needs_human_input`, `blocked` or `failed` |
| `summary` | What was done and how it was verified |
| `blocking_reason` | Why the engineer stopped (empty when completed) |
| `verdict` | `pass`, `changes_requested` or `none` (review/verify only) |
| `documents` | `[{kind, title, body}]` |
| `acceptance_criteria` | The complete revised list, or empty to leave unchanged |
| `open_questions` | `[{question, owner}]` |
| `resolved_questions` | `[{id, answer}]` — ids from `QUESTIONS.md`, answer cites its source |
| `knowledge` | `[{kind, title, body}]` — proposed entries |

## Templates

| Key | Stages |
|---|---|
| `spec-driven` | Analyze → Refine spec ◆ → Plan ◆❓ → Build → Review ↺Build → Verify ◆↺Build |
| `plan-build-review` | Plan ◆❓ → Build → Review ◆↺Build |
| `classic` | Groom ◆ → Build ◆ → Test ◆↺Build → Deploy |

◆ approval gate · ❓ blocks on open questions · ↺ rework target

Projects without a workflow use the legacy four-phase pipeline (grooming,
build, testing, deployment) with a gate after each phase.
