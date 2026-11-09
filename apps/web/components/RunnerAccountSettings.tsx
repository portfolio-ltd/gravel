"use client"

import { useEffect, useState } from "react"
import { KeyRound, Loader2 } from "lucide-react"
import { toast } from "sonner"
import { useRunnerAccounts } from "@/hooks/useBoard"
import { useUpdateProject } from "@/hooks/useProjects"
import { errorDetail } from "@/hooks/useTaskExtras"
import { Button } from "@/components/ui/button"
import { Field, Input } from "@/components/ui/form"
import { SectionCard } from "@/components/ui/page"
import type { Project } from "@/types"

/**
 * Pin a project to one AI account: only `gravel work --account <label>`
 * runners take its runs, and nothing runs in-process for it.
 */
export default function RunnerAccountSettings({ project }: { project: Project }) {
  const update = useUpdateProject(project.id)
  const { data: accounts } = useRunnerAccounts()
  const [value, setValue] = useState(project.runner_account ?? "")
  useEffect(() => setValue(project.runner_account ?? ""), [project.runner_account])

  const known = [...new Set((accounts ?? []).map((a) => a.account).filter((a): a is string => !!a))].sort()
  const normalized = value.trim().replace(/\s+/g, " ").toLowerCase()
  const dirty = normalized !== (project.runner_account ?? "")
  const online = !!normalized && (accounts ?? []).some((a) => a.account === normalized && a.runners.some((r) => r.online))

  async function save(next: string | null) {
    try {
      await update.mutateAsync({ runner_account: next })
      toast.success(next ? `Runs of this project now go to the '${next}' account` : "Any engineer can take this project's runs")
    } catch (e) {
      toast.error(errorDetail(e, "Could not save"))
    }
  }

  return (
    <SectionCard
      title={<span className="inline-flex items-center gap-2"><KeyRound className="h-4 w-4 text-muted-foreground" /> Runs on</span>}
      description="Pin this project to one of your AI accounts. Only runners started with gravel work --account <label> take its runs, and none of them run on the server. Leave empty to let any engineer take them."
    >
      <div className="flex flex-wrap items-end gap-2">
        <Field label="Account label" className="min-w-0 flex-1">
          <Input
            value={value}
            onChange={(e) => setValue(e.target.value)}
            placeholder="Any engineer"
            list={`accounts-${project.id}`}
            className="font-mono text-xs"
          />
          <datalist id={`accounts-${project.id}`}>
            {known.map((a) => <option key={a} value={a} />)}
          </datalist>
        </Field>
        <Button size="sm" onClick={() => save(normalized || null)} disabled={!dirty || update.isPending}>
          {update.isPending && <Loader2 className="h-3.5 w-3.5 animate-spin" />} Save
        </Button>
        {project.runner_account && (
          <Button size="sm" variant="ghost" onClick={() => save(null)} disabled={update.isPending}>Unpin</Button>
        )}
      </div>
      {normalized && (
        <p className="mt-2 text-xs text-muted-foreground">
          {online
            ? <>A runner signed in to <b className="font-medium text-foreground">{normalized}</b> is online.</>
            : <>No runner for <b className="font-medium text-foreground">{normalized}</b> is online. Runs will wait until you start one: <code className="rounded bg-muted px-1">gravel work --account {normalized}</code></>}
        </p>
      )}
    </SectionCard>
  )
}
