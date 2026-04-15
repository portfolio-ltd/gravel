"use client"

import { useState, useRef } from "react"
import { Loader2, Upload, FileText, X, CheckCircle2, ChevronRight, Zap } from "lucide-react"
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import { Progress } from "@/components/ui/progress"
import { cn } from "@/lib/utils"
import { useCreateProject } from "@/hooks/useProjects"
import { useUploadFile, useParseAgent } from "@/hooks/useAgent"
import { toast } from "sonner"
import type { Project } from "@/types"

const MODELS = [
  { value: "claude-sonnet-4-6",      label: "Claude Sonnet 4.6",  note: "Recommended" },
  { value: "claude-opus-4-6",        label: "Claude Opus 4.6",    note: "Most capable" },
  { value: "gpt-4o",                 label: "GPT-4o",             note: "OpenAI" },
  { value: "llama-3.3-70b-versatile",label: "Llama 3.3 70B",      note: "Groq (fast)" },
]

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

export default function CreateProjectDialog({ open, onOpenChange, onCreated }: CreateProjectDialogProps) {
  const [step, setStep] = useState<Step>("name")
  const [name, setName] = useState("")
  const [model, setModel] = useState("claude-sonnet-4-6")
  const [project, setProject] = useState<Project | null>(null)
  const [parsedTasks, setParsedTasks] = useState<ParsedTask[]>([])
  const [prdFile, setPrdFile] = useState<File | null>(null)
  const [parseProgress, setParseProgress] = useState(0)
  const fileInputRef = useRef<HTMLInputElement>(null)

  const createProject = useCreateProject()
  const uploadFile = useUploadFile()
  const parseAgent = useParseAgent()

  function reset() {
    setStep("name")
    setName("")
    setModel("claude-sonnet-4-6")
    setProject(null)
    setParsedTasks([])
    setPrdFile(null)
    setParseProgress(0)
  }

  function handleClose() {
    onOpenChange(false)
    setTimeout(reset, 300)
  }

  async function handleCreateAndUpload() {
    if (!name.trim()) return
    try {
      const proj = await createProject.mutateAsync({ name: name.trim(), default_model: model })
      setProject(proj)
      if (prdFile) {
        await uploadFile.mutateAsync({ projectId: proj.id, file: prdFile, fileType: "prd" })
      }
      // Start parsing with progress animation
      setStep("parsing")
      let prog = 0
      const interval = setInterval(() => {
        prog = Math.min(prog + Math.random() * 15, 90)
        setParseProgress(Math.round(prog))
      }, 400)

      const result = await parseAgent.mutateAsync({ project_id: proj.id, model })
      clearInterval(interval)
      setParseProgress(100)
      setParsedTasks(result.tasks)
      setTimeout(() => setStep("preview"), 400)
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : "Failed to create project"
      toast.error(message)
      setStep("name")
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
            <div className="space-y-1.5">
              <label className="text-sm font-medium">Project name</label>
              <input
                autoFocus
                className="w-full rounded-lg border bg-background px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-ring placeholder:text-muted-foreground"
                placeholder="My awesome app"
                value={name}
                onChange={(e) => setName(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && name.trim() && setStep("upload")}
              />
            </div>
            <div className="space-y-1.5">
              <label className="text-sm font-medium">Default model</label>
              <div className="grid grid-cols-2 gap-2">
                {MODELS.map((m) => (
                  <button
                    key={m.value}
                    type="button"
                    onClick={() => setModel(m.value)}
                    className={cn(
                      "text-left rounded-xl border-2 px-3 py-2.5 transition-all",
                      model === m.value
                        ? "border-primary bg-primary/5"
                        : "border-border hover:border-muted-foreground/40"
                    )}
                  >
                    <p className="text-xs font-semibold">{m.label}</p>
                    <p className="text-[10px] text-muted-foreground">{m.note}</p>
                  </button>
                ))}
              </div>
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
                <Button variant="outline" onClick={handleCreateAndUpload} disabled={isCreating}>
                  {isCreating ? <Loader2 className="w-4 h-4 animate-spin" /> : "Skip & create"}
                </Button>
                <Button onClick={handleCreateAndUpload} disabled={isCreating || !prdFile}>
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
            <div className="flex items-center gap-2 text-emerald-700 bg-emerald-50 rounded-lg px-3 py-2">
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
