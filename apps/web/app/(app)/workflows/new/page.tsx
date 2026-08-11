"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"
import { GitBranch, Plus, X, Loader2 } from "lucide-react"
import { useCreateWorkflow } from "@/hooks/useWorkflows"
import { Button } from "@/components/ui/button"
import { toast } from "sonner"

export default function NewWorkflowPage() {
  const router = useRouter()
  const createWorkflow = useCreateWorkflow()
  const [name, setName] = useState("")
  const [description, setDescription] = useState("")
  const [stageNames, setStageNames] = useState<string[]>(["Grooming", "Build", "Testing"])

  async function handleCreate() {
    try {
      const wf = await createWorkflow.mutateAsync({
        name,
        description: description || undefined,
        stages: stageNames.filter((s) => s.trim()).map((s) => ({ name: s.trim() })),
      })
      toast.success("Workflow created — configure the stages next")
      router.push(`/workflows/${wf.id}`)
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to create workflow")
    }
  }

  return (
    <div className="h-full overflow-y-auto p-6">
      <div className="max-w-xl mx-auto">
        <div className="flex items-center gap-2 mb-6">
          <GitBranch className="w-5 h-5 text-primary" />
          <h1 className="text-xl font-bold">New workflow</h1>
        </div>

        <div className="space-y-4">
          <div>
            <label className="text-xs font-medium text-muted-foreground block mb-1.5">Name</label>
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g. Standard SDLC Pipeline"
              className="w-full text-sm px-3 py-2 rounded-lg border bg-background focus:outline-none focus:ring-1 focus:ring-primary"
            />
          </div>
          <div>
            <label className="text-xs font-medium text-muted-foreground block mb-1.5">Description</label>
            <input
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="What this pipeline is for"
              className="w-full text-sm px-3 py-2 rounded-lg border bg-background focus:outline-none focus:ring-1 focus:ring-primary"
            />
          </div>
          <div>
            <label className="text-xs font-medium text-muted-foreground block mb-1.5">Stages (in order)</label>
            <div className="space-y-2">
              {stageNames.map((s, i) => (
                <div key={i} className="flex gap-2 items-center">
                  <span className="text-xs text-muted-foreground w-5 text-right">{i + 1}.</span>
                  <input
                    value={s}
                    onChange={(e) => setStageNames((prev) => prev.map((v, j) => (j === i ? e.target.value : v)))}
                    className="flex-1 text-sm px-3 py-2 rounded-lg border bg-background focus:outline-none focus:ring-1 focus:ring-primary"
                  />
                  <button
                    onClick={() => setStageNames((prev) => prev.filter((_, j) => j !== i))}
                    className="p-1.5 rounded-lg hover:bg-muted text-muted-foreground"
                  >
                    <X className="w-3.5 h-3.5" />
                  </button>
                </div>
              ))}
            </div>
            <Button
              size="sm" variant="outline" className="mt-2"
              onClick={() => setStageNames((prev) => [...prev, ""])}
            >
              <Plus className="w-3.5 h-3.5" /> Add stage
            </Button>
            <p className="text-[11px] text-muted-foreground mt-2">
              Engineers, approval gates, rework loops, and per-stage instructions are configured in the editor after creation.
            </p>
          </div>

          <div className="flex justify-end gap-2 pt-2">
            <Button variant="outline" size="sm" onClick={() => router.push("/workflows")}>Cancel</Button>
            <Button size="sm" onClick={handleCreate} disabled={!name.trim() || createWorkflow.isPending}>
              {createWorkflow.isPending && <Loader2 className="w-3.5 h-3.5 animate-spin" />} Create
            </Button>
          </div>
        </div>
      </div>
    </div>
  )
}
