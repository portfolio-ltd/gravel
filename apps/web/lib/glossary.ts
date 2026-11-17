/**
 * Plain-language explanations of Gravel's terms, shown in tooltips (HelpHint)
 * across the app. One place, so the same word always means the same thing.
 */
export const GLOSSARY = {
  workflow: {
    term: "Workflow",
    body: "The route a task takes from idea to done: an ordered set of stages, who runs each one, where people sign off, and where work loops.",
  },
  stage: {
    term: "Stage",
    body: "One step of a workflow, such as Plan, Build or Review. Each task runs one stage at a time.",
  },
  role: {
    term: "Stage role",
    body: "What kind of work the stage does. The role brings default instructions and decides which documents the stage produces.",
  },
  aiStage: {
    term: "Run by AI",
    body: "An AI engineer does this stage. Turn it off for a manual checkpoint that a person completes and approves.",
  },
  gate: {
    term: "Approval gate",
    body: "After the stage finishes, the task waits in Attention until a person approves it. Engineers never approve their own work.",
  },
  waitQuestions: {
    term: "Wait for open questions",
    body: "Holds the stage's result while the task has unanswered blocking questions, so nobody guesses.",
  },
  engineer: {
    term: "Engineer",
    body: "An AI worker that picks up stage runs: in a Docker container, on your own machine through the gravel CLI, or inside the server.",
  },
  model: {
    term: "Model",
    body: "The LLM a stage uses. The stage's choice wins over the engineer's, which wins over the project default.",
  },
  harness: {
    term: "Harness",
    body: "The rig around an agent run: which subagents it may call, how it routes work, its test gate and turn limits.",
  },
  successEdge: {
    term: "On success",
    body: "Where the task goes when this stage succeeds. By default, the next stage in order; pick another to skip ahead or branch back.",
  },
  reworkEdge: {
    term: "On failure (rework)",
    body: "Where a failed stage sends the task to be fixed, up to its max attempts. If the stage checks a loop, the loop decides instead.",
  },
  maxAttempts: {
    term: "Max attempts",
    body: "How many times the rework edge may send the task back before a person has to look at it.",
  },
  stopRule: {
    term: "Stop rule",
    body: "A safety net: a task that enters the same stage 10 times without a human approval is parked for a person. Loop passes are counted by their loop instead.",
  },
  instructions: {
    term: "Stage instructions",
    body: "What the engineer is told to do in this stage. Leave empty to use the role's default instructions.",
  },
  loop: {
    term: "Loop",
    body: "A bounded cycle: work, check, repeat until the exit condition holds. Each pass carries the check's findings forward, and the loop stops after its pass limit or budget.",
  },
  loopEngineering: {
    term: "Loop engineering",
    body: "Designing the feedback loops agents work in: what “done” means, who checks it, how findings flow back, and when to stop and ask a person.",
  },
  loopEntry: {
    term: "Loop start",
    body: "The stage each new pass begins at, usually the stage that does the work (Build).",
  },
  loopCheck: {
    term: "Check stage",
    body: "The stage that decides whether the pass met the exit condition, usually a test, verify or review stage. Passing leaves the loop; failing starts the next pass.",
  },
  loopPass: {
    term: "Pass",
    body: "One trip from the loop's start stage to its check stage.",
  },
  exitCondition: {
    term: "Exit condition",
    body: "What must be true to leave the loop, in plain words. The check stage is told to pass only when it holds.",
  },
  maxPasses: {
    term: "Max passes",
    body: "The most passes one round of the loop may take before the exhaustion rule applies.",
  },
  loopBudget: {
    term: "Budget",
    body: "An optional cap on the estimated model spend for one round of the loop. When reached, the loop stops as if out of passes.",
  },
  onExhausted: {
    term: "When the loop runs out",
    body: "Ask a person (the task waits in Attention; approving starts a fresh round), or proceed down the success path with the open findings noted.",
  },
  carryFeedback: {
    term: "Carry feedback",
    body: "Posts the check's findings on the task before the next pass, so the engineer fixes exactly what failed.",
  },
  project: {
    term: "Project",
    body: "A repository plus its tasks. A project can follow a workflow; without one it uses groom → build → test → deploy.",
  },
  board: {
    term: "Board",
    body: "Every task as a card, in a lane for its current stage.",
  },
  attention: {
    term: "Attention",
    body: "Everything waiting on a person: approvals, manual checkpoints, blocked runs and open questions.",
  },
  prd: {
    term: "PRD",
    body: "A product requirements document. Gravel can turn one into tasks with acceptance criteria.",
  },
  knowledge: {
    term: "Knowledge",
    body: "Decisions, patterns, conventions and runbooks your engineers read before they work.",
  },
  runner: {
    term: "Local runner",
    body: "Your own machine doing stage runs with the gravel CLI and the AI tools you already use.",
  },
  integration: {
    term: "Integration",
    body: "A connection to an outside service. Credentials are encrypted at rest and only reach engineers that need them.",
  },
} as const

export type GlossaryKey = keyof typeof GLOSSARY
