"use client"

import { useState } from "react"
import { useQueryClient } from "@tanstack/react-query"
import { KeyRound, Laptop, Loader2, Play, Sparkles } from "lucide-react"
import { toast } from "sonner"
import { useAuth } from "@/contexts/AuthContext"
import { usePreferences } from "@/contexts/PreferencesContext"
import { useMeta } from "@/hooks/useSdlc"
import { useApiKeys } from "@/hooks/useUsers"
import { errorDetail } from "@/hooks/useTaskExtras"
import { CommandList } from "@/components/home/ConnectEngineer"
import { Button } from "@/components/ui/button"
import { Field, Input, Select } from "@/components/ui/form"
import { apiFetch } from "@/lib/api"
import { splitRequest } from "@/lib/askBox"
import { type EngineerChoice, projectNameFor, repoUrlOf, runnerCommands } from "@/lib/quickStart"
import { rememberProject } from "@/lib/recentProjects"
import { cn } from "@/lib/utils"
import type { Project, Task } from "@/types"

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000"

const CHOICES: { id: EngineerChoice; icon: typeof Laptop; title: string; hint: string }[] = [
  { id: "machine", icon: Laptop, title: "On my machine", hint: "Your Claude Code or Codex sign-in. No API key." },
  { id: "key", icon: KeyRound, title: "With an API key", hint: "Anthropic, OpenAI or Groq. Runs on this server." },
  { id: "demo", icon: Sparkles, title: "Just show me", hint: "Simulated output, to see the flow." },
]

/**
 * First run, one screen: a repository (optional), what to build, and who does the
 * work. Creates the project with the recommended workflow, adds the task and starts
 * it. Everything it sets can be changed later from the project and Settings.
 */
export default function QuickStart({ onStarted }: { onStarted: (projectId: string, taskId: string) => void }) {
  const qc = useQueryClient()
  const { user } = useAuth()
  const { prefs, update } = usePreferences()
  const { data: meta } = useMeta()
  const { data: keys } = useApiKeys(user?.id)
  const savedKey = !!(keys && (keys.anthropic || keys.openai || keys.groq))
  const [repo, setRepo] = useState("")
  const [request, setRequest] = useState("")
  const [choice, setChoice] = useState<EngineerChoice>("machine")
  const [provider, setProvider] = useState<"anthropic" | "openai" | "groq">("anthropic")
  const [apiKey, setApiKey] = useState("")
  const [busy, setBusy] = useState(false)

  const { title, description } = splitRequest(request)
  const needsKey = choice === "key" && !savedKey && !apiKey.trim()
  const ready = title.length > 0 && !needsKey && !busy

  async function start(e: React.FormEvent) {
    e.preventDefault()
    if (!ready || !user) return
    setBusy(true)
    try {
      if (choice === "key" && apiKey.trim()) {
        await apiFetch(`/api/users/${user.id}/api-keys`, { method: "PUT", body: JSON.stringify({ [provider]: apiKey.trim() }) })
        qc.invalidateQueries({ queryKey: ["api-keys"] })
      }
      // The API reads runOn when it queues work, so save it before starting (update() alone is debounced)
      const next = { ...prefs, runOn: choice === "machine" ? ("machine" as const) : null }
      await apiFetch("/api/users/me/preferences", { method: "PUT", body: JSON.stringify({ preferences: next }) })
      update({ runOn: next.runOn })

      const template = meta?.workflow_templates.find((t) => t.recommended) ?? meta?.workflow_templates[0]
      const project = await apiFetch<Project>("/api/projects", {
        method: "POST",
        body: JSON.stringify({
          name: projectNameFor(repo), repo_url: repoUrlOf(repo), workflow_template: template?.key,
          default_model: prefs.defaultModel ?? meta?.default_model,
        }),
      })
      const task = await apiFetch<Task>(`/api/projects/${project.id}/tasks`, {
        method: "POST", body: JSON.stringify({ title, description }),
      })
      await apiFetch(`/api/projects/${project.id}/tasks/${task.id}/start`, { method: "POST" })
      rememberProject(project.id)
      for (const key of ["projects", "tasks", "project", "board", "running", "metrics"]) {
        qc.invalidateQueries({ queryKey: [key] })
      }
      toast.success(choice === "machine" ? "Queued. It starts when your runner is online." : "Started. The first stage is running.")
      onStarted(project.id, task.id)
    } catch (err) {
      toast.error(errorDetail(err, "Could not start"))
    } finally {
      setBusy(false)
    }
  }

  return (
    <form onSubmit={start} className="surface mb-6 overflow-hidden" aria-label="Start your first task">
      <div className="border-b bg-glow px-5 py-4">
        <h2 className="text-base font-semibold">Give your engineers their first task</h2>
        <p className="mt-0.5 text-sm text-muted-foreground">
          They analyze it, ask what is unclear, plan, build and review. You approve the plan and the result.
        </p>
      </div>
      <div className="grid gap-5 p-5 lg:grid-cols-2">
        <div className="space-y-4">
          <Field label="What should they build?">
            <textarea
              value={request}
              onChange={(e) => setRequest(e.target.value)}
              rows={4}
              autoFocus
              placeholder="Add a CSV export to the invoices page, with a test."
              className="w-full resize-none rounded-lg border bg-background px-3 py-2 text-sm leading-relaxed placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring"
            />
          </Field>
          <Field label="GitHub repository" hint="Optional. Gravel maps the code first so engineers follow what is already there. Private repos need a GitHub token under Integrations.">
            <Input value={repo} onChange={(e) => setRepo(e.target.value)} placeholder="owner/repo" className="font-mono text-xs" />
          </Field>
        </div>
        <div className="space-y-3">
          <p className="text-xs font-medium">Who does the work?</p>
          <div role="radiogroup" aria-label="Who does the work?" className="space-y-2">
            {CHOICES.map((c) => (
              <button
                key={c.id}
                type="button"
                role="radio"
                aria-checked={choice === c.id}
                onClick={() => setChoice(c.id)}
                className={cn(
                  "flex w-full items-start gap-3 rounded-lg border px-3 py-2.5 text-left transition-colors",
                  choice === c.id ? "border-primary bg-primary/5" : "hover:bg-accent/60",
                )}
              >
                <c.icon className={cn("mt-0.5 h-4 w-4 shrink-0", choice === c.id ? "text-primary" : "text-muted-foreground")} />
                <span>
                  <span className="block text-sm font-medium">{c.title}</span>
                  <span className="block text-xs text-muted-foreground">
                    {c.id === "key" && savedKey ? "Uses the key you already saved." : c.hint}
                  </span>
                </span>
              </button>
            ))}
          </div>
          {choice === "machine" && (
            <div className="rounded-lg border bg-muted/30 p-3">
              <p className="mb-2 text-xs text-muted-foreground">After you press Start, run these in a terminal:</p>
              <CommandList commands={runnerCommands(API_URL)} />
            </div>
          )}
          {choice === "key" && !savedKey && (
            <div className="grid grid-cols-[8rem_1fr] gap-2">
              <Select value={provider} onChange={(e) => setProvider(e.target.value as typeof provider)} aria-label="Provider">
                <option value="anthropic">Anthropic</option>
                <option value="openai">OpenAI</option>
                <option value="groq">Groq</option>
              </Select>
              <Input type="password" value={apiKey} onChange={(e) => setApiKey(e.target.value)} placeholder="API key"
                aria-label="API key" autoComplete="off" spellCheck={false} className="font-mono text-xs" />
            </div>
          )}
        </div>
      </div>
      <div className="flex items-center justify-between gap-3 border-t px-5 py-3">
        <p className="text-xs text-muted-foreground">
          Creates a project with the recommended workflow. You can change everything later.
        </p>
        <Button type="submit" disabled={!ready}>
          {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Play className="h-4 w-4" />} Start
        </Button>
      </div>
    </form>
  )
}
