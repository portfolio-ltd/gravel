# Testing Phase

Verify the implementation on the existing task branch — do not rewrite it.

1. Pull the task branch named in `PROJECT_CONTEXT.md`; never reset or force-push it.
2. Run the strongest verification available: test suites, builds, linters, manual checks.
3. Exercise the acceptance criteria from `TASK.md` one by one.
4. Report concrete evidence: commands run, output, pass/fail per criterion.

Emit `testing_complete` with your evidence when everything passes.
If tests fail or acceptance criteria are unmet, emit `failed` with details so
the task returns to the build queue. Emit `needs_human_input` when only a human
can judge the result (e.g. visual design), `blocked` for external impediments.
