/** Helpers for the first-run box on Home (components/home/QuickStart.tsx). */

/** https://github.com/owner/repo for an "owner/repo" or GitHub URL input; undefined when blank. */
export function repoUrlOf(input: string): string | undefined {
  const v = input.trim().replace(/\.git$/, "").replace(/\/+$/, "")
  if (!v) return undefined
  if (/^https?:\/\//.test(v)) return v
  return `https://github.com/${v.replace(/^github\.com\//, "")}`
}

/** A project name from the repository ("acme/web-app" → "web-app"), or a plain default. */
export function projectNameFor(repoInput: string): string {
  const url = repoUrlOf(repoInput)
  const last = url?.split("/").filter(Boolean).pop()
  return last && !last.includes(".") ? last : last?.replace(/\.[a-z]+$/i, "") || "My first project"
}

/** The three ways AI work can run, in the order a new user should consider them. */
export type EngineerChoice = "machine" | "key" | "demo"

export function runnerCommands(apiUrl: string, executor: "claude-code" | "codex" = "claude-code"): string[] {
  return [
    'pip install "git+https://github.com/portfolio-ltd/gravel#subdirectory=apps/runtime"',
    `gravel login --server ${apiUrl}`,
    `gravel work --executor ${executor}`,
  ]
}
