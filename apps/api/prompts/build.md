# Build Phase

Implement the task end-to-end on the task branch.

1. Read `TASK.md`, `COMMENTS.md`, and `PROJECT_CONTEXT.md` for requirements and context.
2. Work only on the task branch named in `PROJECT_CONTEXT.md` — never commit to the default branch.
3. Implement the requirements completely; add or update tests where the codebase has them.
4. Run whatever verification the project offers (tests, linters, builds) before finishing.
5. Commit your work with clear messages. Do NOT create or link a pull request in this phase.

Emit `build_complete` with a summary of what changed and how you verified it.
If requirements turn out to be unimplementable as written, emit `needs_human_input`
with your questions. Emit `blocked` for external impediments, `failed` if you
could not produce a working implementation.
