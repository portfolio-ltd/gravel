"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"
import { GitBranch, Plus, X, Loader2 } from "lucide-react"
import { useCreateWorkflow, useCreateWorkflowFromTemplate } from "@/hooks/useWorkflows"
import { useMeta } from "@/hooks/useSdlc"
import { Button } from "@/components/ui/button"
import { Field, Input, Select } from "@/components/ui/form"
import { Page, PageHeader, SectionCard } from "@/components/ui/page"
import { TemplateCard } from "@/components/workflow/Pipeline"
import { toast } from "sonner"
import type { StageRoleKey } from "@/types"

interface DraftStage {
  name: string
  role: StageRoleKey
}

export default function NewWorkflowPage() {
  const router = useRouter()
  const { data: meta } = useMeta()
  const createWorkflow = useCreateWorkflow()
  const fromTemplate = useCreateWorkflowFromTemplate()
  const [name, setName] = useState("")
  const [description, setDescription] = useState("")
  const [stages, setStages] = useState<DraftStage[]>([
    { name: "Plan", role: "plan" },
    { name: "Build", role: "build" },
    { name: "Review", role: "review" },
  ])
  const [pendingKey, setPendingKey] = useState<string | null>(null)

  async function handleTemplate(key: string) {
    setPendingKey(key)
    try {
      const wf = await fromTemplate.mutateAsync({ template_key: key, name: name.trim() || undefined })
      toast.success(`Created “${wf.name}”`)
      router.push(`/workflows/${wf.id}`)
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to create workflow")
    } finally {
      setPendingKey(null)
    }
  }

  async function handleCreate() {
    try {
      const wf = await createWorkflow.mutateAsync({
        name: name.trim(),
        description: description || undefined,
        stages: stages.filter((s) => s.name.trim()).map((s) => ({ name: s.name.trim(), role: s.role })),
      })
      toast.success("Workflow created — configure the stages next")
      router.push(`/workflows/${wf.id}`)
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to create workflow")
    }
  }

  function patchStage(i: number, patch: Partial<DraftStage>) {
    setStages((prev) => prev.map((s, j) => (j === i ? { ...s, ...patch } : s)))
  }

  return (
    <Page>
      <PageHeader
        icon={<GitBranch className="h-4 w-4" />}
        title="New workflow"
        description="Start from a proven template, or lay out your own stages."
      />

      <div className="grid gap-6 lg:grid-cols-[1fr_380px]">
        <div className="space-y-3">
          <h2 className="text-sm font-semibold">Templates</h2>
          <div className="grid gap-3 md:grid-cols-2">
            {(meta?.workflow_templates ?? []).map((tpl) => (
              <TemplateCard
                key={tpl.key}
                template={tpl}
                pending={pendingKey === tpl.key}
                onUse={() => handleTemplate(tpl.key)}
                actionLabel="Create from template"
              />
            ))}
          </div>
          <p className="text-[11px] text-muted-foreground">
            A name entered on the right is used for the template copy too.
          </p>
        </div>

        <SectionCard title="Blank workflow" description="Roles, gates and rework loops are configured in the editor next.">
          <div className="space-y-4">
            <Field label="Name">
              <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Mobile release pipeline" />
            </Field>
            <Field label="Description">
              <Input value={description} onChange={(e) => setDescription(e.target.value)} placeholder="What this pipeline is for" />
            </Field>
            <div className="space-y-2">
              <p className="text-xs font-medium text-foreground/80">Stages, in order</p>
              {stages.map((s, i) => (
                <div key={i} className="flex items-center gap-2">
                  <span className="w-4 text-right text-xs text-muted-foreground">{i + 1}.</span>
                  <Input
                    value={s.name}
                    onChange={(e) => patchStage(i, { name: e.target.value })}
                    aria-label={`Stage ${i + 1} name`}
                    className="flex-1"
                  />
                  <Select
                    value={s.role}
                    onChange={(e) => patchStage(i, { role: e.target.value as StageRoleKey })}
                    aria-label={`Stage ${i + 1} role`}
                    className="w-28 text-xs"
                  >
                    {(meta?.stage_roles ?? []).map((r) => <option key={r.key} value={r.key}>{r.label}</option>)}
                    {!meta && <option value={s.role}>{s.role}</option>}
                  </Select>
                  <button
                    onClick={() => setStages((prev) => prev.filter((_, j) => j !== i))}
                    className="rounded-lg p-1.5 text-muted-foreground hover:bg-muted"
                    aria-label={`Remove stage ${i + 1}`}
                  >
                    <X className="h-3.5 w-3.5" />
                  </button>
                </div>
              ))}
              <Button size="sm" variant="outline" onClick={() => setStages((prev) => [...prev, { name: "", role: "custom" }])}>
                <Plus className="h-3.5 w-3.5" /> Add stage
              </Button>
            </div>
            <div className="flex justify-end gap-2 border-t pt-4">
              <Button variant="outline" size="sm" onClick={() => router.push("/workflows")}>Cancel</Button>
              <Button size="sm" onClick={handleCreate} disabled={!name.trim() || createWorkflow.isPending}>
                {createWorkflow.isPending && <Loader2 className="h-3.5 w-3.5 animate-spin" />} Create
              </Button>
            </div>
          </div>
        </SectionCard>
      </div>
    </Page>
  )
}
