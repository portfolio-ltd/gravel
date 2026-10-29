"use client"

import { useEffect, useState, useRef } from "react"
import { Loader2, Upload, FileText, X, CheckCircle2, ChevronRight, Zap, Github, Sparkles } from "lucide-react"
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import { Progress } from "@/components/ui/progress"
import { Field, Input, Select, Switch } from "@/components/ui/form"
import { cn } from "@/lib/utils"
import { useCreateProject } from "@/hooks/useProjects"
import { useWorkflows } from "@/hooks/useWorkflows"
import { useUploadFile, useParseAgent } from "@/hooks/useAgent"
import { useMeta } from "@/hooks/useSdlc"
import { usePreferences } from "@/contexts/PreferencesContext"
import { toast } from "sonner"
import type { Project } from "@/types"

/** "tpl:<template key>" | "wf:<workflow id>" | "default" */
type WorkflowChoice = string

type Step = "name" | "upload" | "parsing" | "preview"

interface ParsedTask {
  title: string
  description: string
  priority: string
  type: string
}

interface CreateProjectDialogProps {
  open: boolean
  onOpenChange: (v: boolean) => void
  onCreated?: (project: Project) => void
}

/** https://github.com/owner/repo for an "owner/repo" or GitHub URL input; undefined when blank. */
function repoUrlOf(input: string): string | undefined {
  const v = input.trim().replace(/\.git$/, "").replace(/\/+$/, "")
  if (!v) return undefined
  if (/^https?:\/\//.test(v)) return v
  return `https://github.com/${v.replace(/^github\.com\//, "")}`
}

export default function CreateProjectDialog({ open, onOpenChange, onCreated }: CreateProjectDialogProps) {
  const [step, setStep] = useState<Step>("name")
  const [name, setName] = useState("")
  const { data: meta } = useMeta()
  const { prefs } = usePreferences()
  const { data: workflows } = useWorkflows()
  const preferredModel = prefs.defaultModel ?? meta?.default_model ?? ""
  const recommendedTemplate = meta?.workflow_templates.find((t) => t.recommended) ?? meta?.workflow_templates[0]
  const initialWorkflow: WorkflowChoice = recommendedTemplate ? `tpl:${recommendedTemplate.key}` : "default"
  const [model, setModel] = useState("")
  const [workflowChoice, setWorkflowChoice] = useState<WorkflowChoice>("")
  const [showIssues, setShowIssues] = useState(false)
  const [issuesRepo, setIssuesRepo] = useState("")
  const [postComments, setPostComments] = useState(false)
  const [syncIssues, setSyncIssues] = useState(true)
  const [project, setProject] = useState<Project | null>(null)
  const [parsedTasks, setParsedTasks] = useState<ParsedTask[]>([])
  const [prdFile, setPrdFile] = useState<File | null>(null)
  const [parseProgress, setParseProgress] = useState(0)
  const fileInputRef = useRef<HTMLInputElement>(null)

  const createProject = useCreateProject()
  const uploadFile = useUploadFile()
  const parseAgent = useParseAgent()

  // Defaults arrive asynchronously (meta + preferences); fill them once
  useEffect(() => { if (!model && preferredModel) setModel(preferredModel) }, [model, preferredModel])
  useEffect(() => { if (!workflowChoice && meta) setWorkflowChoice(initialWorkflow) }, [workflowChoice, meta, initialWorkflow])

  function reset() {
    setStep("name")
    setName("")
    setModel(preferredModel)
    setWorkflowChoice(initialWorkflow)
    setShowIssues(false)
    setIssuesRepo("")
    setPostComments(false)
    setSyncIssues(true)
    setProject(null)
    setParsedTasks([])
    setPrdFile(null)
    setParseProgress(0)
  }

  function handleClose() {
    onOpenChange(false)
    setTimeout(reset, 300)
  }

  async function handleCreateAndUpload(skipPrd = false) {
    if (!name.trim()) return
    const file = skipPrd ? null : prdFile
    let created: Project | null = null
    try {
      const proj = await createProject.mutateAsync({
        name: name.trim(),
        default_model: model || undefined,
        workflow_id: workflowChoice.startsWith("wf:") ? workflowChoice.slice(3) : undefined,
        workflow_template: workflowChoice.startsWith("tpl:") ? workflowChoice.slice(4) : undefined,
        // An existing repo: mapped into a code graph (repo_url) and, optionally, its issues synced
        repo_url: repoUrlOf(issuesRepo),
        issues_repo: issuesRepo.trim() && syncIssues ? issuesRepo.trim() : undefined,
        post_issue_comments: issuesRepo.trim() && syncIssues ? postComments : undefined,
      })
      created = proj
      setProject(proj)
      if (!file) {
        // Nothing to parse — the project is ready for manual tasks or an issue import
        toast.success(`Created ${proj.name}`)
        onCreated?.(proj)
        handleClose()
        return
      }
      await uploadFile.mutateAsync({ projectId: proj.id, file, fileType: "prd" })
      // Start parsing with progress animation
      setStep("parsing")
      let prog = 0
      const interval = setInterval(() => {
        prog = Math.min(prog + Math.random() * 15, 90)
        setParseProgress(Math.round(prog))
      }, 400)

      const result = await parseAgent.mutateAsync({ project_id: proj.id, model }) as { tasks: Array<{ title: string; description: string; priority: string; type: string }> }
      clearInterval(interval)
      setParseProgress(100)
      setParsedTasks(result.tasks)
      setTimeout(() => setStep("preview"), 400)
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : "Failed to create project"
      toast.error(message)
      // If the project already exists, don't strand the user on a form that would create a duplicate
      if (created) {
        onCreated?.(created)
        handleClose()
      } else {
        setStep("name")
      }
    }
  }

  function handleDone() {
    if (project) onCreated?.(project)
    handleClose()
  }

  const isCreating = createProject.isPending || uploadFile.isPending || parseAgent.isPending

  return (
    <Dialog open={open} onOpenChange={(v) => { if (!v && !isCreating) handleClose() }}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <div className="w-7 h-7 rounded-lg bg-primary flex items-center justify-center">
              <Zap className="w-3.5 h-3.5 text-primary-foreground" />
            </div>
            {step === "name"    && "New project"}
            {step === "upload"  && "Upload files (optional)"}
            {step === "parsing" && "Parsing PRD…"}
            {step === "preview" && "Tasks ready"}
          </DialogTitle>
        </DialogHeader>

        {/* Step: name + model */}
        {step === "name" && (
          <div className="space-y-4">
            <Field label="Project name">
              <Input
                autoFocus
                placeholder="My awesome app"
                value={name}
                onChange={(e) => setName(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && name.trim() && setStep("upload")}
              />
            </Field>
            <Field
              label="Workflow"
              hint={workflowChoice.startsWith("tpl:")
                ? meta?.workflow_templates.find((t) => `tpl:${t.key}` === workflowChoice)?.description
                : workflowChoice === "default" ? "Groom → build → test → deploy, with a gate after each phase." : undefined}
            >
              <Select value={workflowChoice} onChange={(e) => setWorkflowChoice(e.target.value)}>
                {(meta?.workflow_templates.length ?? 0) > 0 && (
                  <optgroup label="Templates">
                    {meta!.workflow_templates.map((t) => (
                      <option key={t.key} value={`tpl:${t.key}`}>{t.name}{t.recommended ? " (recommended)" : ""}</option>
                    ))}
                  </optgroup>
                )}
                {(workflows ?? []).length > 0 && (
                  <optgroup label="Your workflows">
                    {workflows!.map((wf) => (
                      <option key={wf.id} value={`wf:${wf.id}`}>{wf.name} ({wf.stages.length} stages)</option>
                    ))}
                  </optgroup>
                )}
                <option value="default">Default pipeline</option>
              </Select>
            </Field>
            <div className="space-y-1.5">
              <span className="text-xs font-medium text-foreground/80">Default model</span>
              <div className="grid max-h-52 grid-cols-1 gap-2 overflow-y-auto pr-0.5 sm:grid-cols-2">
                {(meta?.models ?? []).map((m) => (
                  <button
                    key={m.id}
                    type="button"
                    onClick={() => setModel(m.id)}
                    aria-pressed={model === m.id}
                    className={cn(
                      "rounded-xl border-2 px-3 py-2 text-left transition-all",
                      model === m.id ? "border-primary bg-primary/5" : "border-border hover:border-muted-foreground/40"
                    )}
                  >
                    <p className="flex items-center gap-1 text-xs font-semibold">
                      {m.label}
                      {m.id === meta?.default_model && <Sparkles className="h-3 w-3 text-primary" aria-label="server default" />}
                    </p>
                    <p className="text-[10px] text-muted-foreground">{m.note}</p>
                  </button>
                ))}
                {!meta && [0, 1, 2, 3].map((i) => <div key={i} className="h-12 animate-pulse rounded-xl bg-muted" />)}
              </div>
            </div>
            <div className="rounded-xl border">
              <button
                type="button"
                onClick={() => setShowIssues((v) => !v)}
                aria-expanded={showIssues}
                className="flex w-full items-center gap-2 px-3 py-2.5 text-left text-xs font-medium"
              >
                <Github className="h-3.5 w-3.5" /> Start from an existing GitHub repository
                <span className="font-normal text-muted-foreground">— optional</span>
                <ChevronRight className={cn("ml-auto h-3.5 w-3.5 transition-transform", showIssues && "rotate-90")} />
              </button>
              {showIssues && (
                <div className="space-y-3 border-t px-3 py-3">
                  <Field label="Repository" hint="owner/repo or a GitHub URL. Gravel maps its code into a graph that grounds every run; private repos need a GitHub integration.">
                    <Input value={issuesRepo} onChange={(e) => setIssuesRepo(e.target.value)} placeholder="acme/web" className="font-mono text-xs" />
                  </Field>
                  <div className="flex items-center justify-between gap-3">
                    <span className="text-xs">Sync its issues (import them from the project page)</span>
                    <Switch checked={syncIssues} onChange={setSyncIssues} disabled={!issuesRepo.trim()} label="Sync its issues" />
                  </div>
                  <div className="flex items-center justify-between gap-3">
                    <span className="text-xs">Post stage results as issue comments</span>
                    <Switch checked={postComments} onChange={setPostComments} disabled={!issuesRepo.trim() || !syncIssues} label="Post stage results as issue comments" />
                  </div>
                </div>
              )}
            </div>
            <div className="flex justify-end pt-1">
              <Button disabled={!name.trim()} onClick={() => setStep("upload")}>
                Continue <ChevronRight className="w-4 h-4" />
              </Button>
            </div>
          </div>
        )}

        {/* Step: upload */}
        {step === "upload" && (
          <div className="space-y-4">
            <p className="text-sm text-muted-foreground">
              Attach a PRD or design file and the agent will generate tasks automatically. You can skip this and add tasks manually later.
            </p>

            <input
              ref={fileInputRef}
              type="file"
              className="hidden"
              accept=".pdf,.md,.txt,.png,.jpg,.jpeg,.fig"
              onChange={(e) => setPrdFile(e.target.files?.[0] ?? null)}
            />

            {prdFile ? (
              <div className="flex items-center gap-3 rounded-xl border bg-muted/50 px-4 py-3">
                <FileText className="w-5 h-5 text-primary shrink-0" />
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium truncate">{prdFile.name}</p>
                  <p className="text-xs text-muted-foreground">{(prdFile.size / 1024).toFixed(1)} KB</p>
                </div>
                <button onClick={() => setPrdFile(null)} className="p-1 rounded hover:bg-muted">
                  <X className="w-4 h-4 text-muted-foreground" />
                </button>
              </div>
            ) : (
              <button
                onClick={() => fileInputRef.current?.click()}
                className="w-full rounded-xl border-2 border-dashed border-border hover:border-primary/50 hover:bg-primary/5 transition-all px-6 py-8 flex flex-col items-center gap-2 text-center"
              >
                <Upload className="w-7 h-7 text-muted-foreground" />
                <p className="text-sm font-medium">Drop a file or click to browse</p>
                <p className="text-xs text-muted-foreground">PDF, Markdown, TXT, PNG, JPG, Figma</p>
              </button>
            )}

            <div className="flex justify-between pt-1">
              <Button variant="outline" onClick={() => setStep("name")}>Back</Button>
              <div className="flex gap-2">
                <Button variant="outline" onClick={() => { setPrdFile(null); void handleCreateAndUpload(true) }} disabled={isCreating}>
                  {isCreating ? <Loader2 className="w-4 h-4 animate-spin" /> : "Skip & create"}
                </Button>
                <Button onClick={() => handleCreateAndUpload()} disabled={isCreating || !prdFile}>
                  {isCreating ? <Loader2 className="w-4 h-4 animate-spin" /> : <>Parse PRD <Zap className="w-4 h-4" /></>}
                </Button>
              </div>
            </div>
          </div>
        )}

        {/* Step: parsing animation */}
        {step === "parsing" && (
          <div className="py-8 flex flex-col items-center gap-5">
            <div className="w-16 h-16 rounded-2xl bg-primary/10 flex items-center justify-center">
              <Zap className="w-8 h-8 text-primary animate-pulse" />
            </div>
            <div className="text-center">
              <p className="font-semibold mb-1">Analyzing your PRD…</p>
              <p className="text-sm text-muted-foreground">The agent is generating tasks from your document.</p>
            </div>
            <div className="w-full max-w-xs">
              <Progress value={parseProgress} className="h-2" />
              <p className="text-xs text-muted-foreground text-center mt-2">{parseProgress}%</p>
            </div>
          </div>
        )}

        {/* Step: preview */}
        {step === "preview" && (
          <div className="space-y-4">
            <div className="flex items-center gap-2 rounded-lg bg-success/10 px-3 py-2 text-success">
              <CheckCircle2 className="w-4 h-4 shrink-0" />
              <p className="text-sm font-medium">{parsedTasks.length} tasks generated successfully</p>
            </div>
            <div className="space-y-2 max-h-64 overflow-y-auto no-scrollbar pr-1">
              {parsedTasks.map((t, i) => (
                <div key={i} className="rounded-xl border bg-muted/30 px-3 py-2.5">
                  <div className="flex items-center gap-2 mb-0.5">
                    <span className={cn(
                      "text-[10px] font-semibold px-1.5 py-0.5 rounded",
                      t.priority === "high" ? "bg-rose-100 text-rose-700"
                        : t.priority === "medium" ? "bg-amber-100 text-amber-700"
                        : "bg-slate-100 text-slate-600"
                    )}>{t.priority}</span>
                    <span className="text-[10px] text-muted-foreground bg-muted px-1.5 py-0.5 rounded">{t.type}</span>
                  </div>
                  <p className="text-sm font-medium">{t.title}</p>
                  {t.description && <p className="text-xs text-muted-foreground mt-0.5 line-clamp-2">{t.description}</p>}
                </div>
              ))}
            </div>
            <div className="flex justify-end pt-1">
              <Button onClick={handleDone}>
                Open project <ChevronRight className="w-4 h-4" />
              </Button>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  )
}
