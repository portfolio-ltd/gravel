# Loop engineering

Agents get better results when they can try, check and try again. Left
open-ended, that turns into a cycle nobody bounded. A **loop** in Gravel is a
named, bounded cycle inside a workflow. You decide what "done" means, who
checks it, how findings flow back, and when to stop.

## The parts of a loop

| Field | Meaning |
|---|---|
| `entry_stage_id` | **Start**: where every pass begins, usually the stage that does the work (Build). |
| `check_stage_id` | **Check**: the stage that judges the pass, usually a verify, test or review stage. A stage checks at most one loop. Start and check may be the same stage (retry one stage until it passes). |
| `goal` | **Exit condition** in plain words. It goes into the run's `LOOP.md`, and the check stage is told to pass only when it holds. |
| `max_iterations` | **Max passes** in one round (1–25). |
| `max_cost_usd` | Optional **budget**: the estimated model spend of the round's runs. Reaching it stops the loop like running out of passes. |
| `on_exhausted` | `ask_human` parks the check's run for a person. Approving it starts a fresh round at the start stage. `proceed` posts the open findings and follows the check stage's success edge. |
| `carry_feedback` | Posts the check's summary or blocking reason on the task before the next pass. Comments reach agents through `COMMENTS.md` and the in-process prompt. |

## How it runs

1. A task reaching the start stage begins **pass 1**. Each run carries the pass
   from stage to stage (`task_runs.loop_id`, `task_runs.loop_iteration`) until
   the check stage has run.
2. If the check **passes** (a completed outcome, or a review/verify verdict of
   `pass`), the task leaves the loop along the check stage's success edge.
   Gates on the check stage still apply.
3. If the check **fails** (`failed` or `blocked`, or a verdict of
   `changes_requested`), the loop replaces the check stage's rework edge. It
   starts the next pass at the start stage, unless the passes or the budget
   are used up. Then `on_exhausted` decides.
4. The stop rule (10 visits to one stage without a human approval) doesn't
   count loop passes, which are bounded by `max_iterations` instead.

Every run inside a loop gets a `LOOP.md` in its bundle (and the same text in
the in-process prompt). It names the pass, the exit condition and the run's part
(do the work, or be the check).

Nested loops aren't supported: a pass in progress keeps its loop until that
loop's check stage has run.

## In the UI

- **Workflows → canvas**: loops are drawn on the right, from the check back to
  the start, with a tinted band over the stages they cover. Click a loop's
  label to edit it, or add one from the toolbar or a stage's **Loops** tab.
- **Loops** (sidebar): every loop in the organization, an explainer, and
  templates that come with loops.
- **Task activity**: runs inside a loop show `pass N`.

## API

```
POST   /api/workflows/{id}/loops
PATCH  /api/workflows/{id}/loops/{loop_id}   # null clears goal / max_cost_usd
DELETE /api/workflows/{id}/loops/{loop_id}
```

`GET /api/workflows/{id}` returns `loops` next to `stages`. Deleting either end
stage deletes the loop. The templates `spec-driven` and `plan-build-review`
come with a Build → Review loop; `build-until-green` with a Build → Test loop
of up to 5 passes.
