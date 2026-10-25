"use client"

import { useState } from "react"
import { Bot, Plus, X } from "lucide-react"
import { useEngineers, useCreateEngineer, useUpdateEngineer } from "@/hooks/useEngineers"
import { useMeta } from "@/hooks/useSdlc"
import EngineerCard from "@/components/EngineerCard"
import { Button } from "@/components/ui/button"
import type { Engineer, EngineerCreate } from "@/types"

const TEMPLATES = [
  { value: "frontend", label: "Frontend Engineer", skills: "React, TypeScript, Tailwind CSS, Next.js, testing with Vitest" },
  { value: "backend",  label: "Backend Engineer",  skills: "Python, FastAPI, SQLAlchemy, PostgreSQL, REST API design" },
  { value: "fullstack",label: "Full-stack Engineer",skills: "React + Next.js frontend, Python + FastAPI backend, Postgres, Docker" },
]

function EngineerDialog({
  initial,
  onClose,
  onSave,
}: {
  initial?: Engineer | null
  onClose: () => void
  onSave: (data: EngineerCreate) => void
}) {
  const [name, setName] = useState(initial?.name ?? "")
  const [template, setTemplate] = useState(initial?.template ?? "fullstack")
  const [skills, setSkills] = useState(initial?.skills_markdown ?? TEMPLATES[2].skills)
  const { data: meta } = useMeta()
  const [provider, setProvider] = useState(initial?.model_provider ?? "anthropic")
  const [modelName, setModelName] = useState(initial?.model_name ?? "")
  const providerModels = (meta?.models ?? []).filter((m) => m.provider === provider)
  // New engineers start on the server default (or the provider's first catalog model)
  const effectiveModel = modelName || (provider === "anthropic" && meta?.default_model?.startsWith("claude")
    ? meta.default_model : providerModels[0]?.id ?? "")

  function defaultModelFor(p: string): string {
    const models = (meta?.models ?? []).filter((m) => m.provider === p)
    if (meta && models.some((m) => m.id === meta.default_model)) return meta.default_model
    return models[0]?.id ?? ""
  }

  function handleTemplateChange(t: string) {
    setTemplate(t)
    if (!initial) {
      const tpl = TEMPLATES.find((x) => x.value === t)
      if (tpl) setSkills(tpl.skills)
    }
  }

  return (
    <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4">
      <div className="bg-background rounded-2xl shadow-xl w-full max-w-md">
        <div className="flex items-center justify-between px-5 pt-5 pb-4 border-b">
          <h2 className="font-bold text-base">{initial ? "Edit engineer" : "Create engineer"}</h2>
          <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-muted transition-colors">
            <X className="w-4 h-4" />
          </button>
        </div>
        <div className="p-5 space-y-4">
          <div>
            <label className="text-xs font-medium text-muted-foreground block mb-1.5">Name</label>
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g. Frontend Pete"
              className="w-full text-sm px-3 py-2 rounded-lg border bg-background focus:outline-none focus:ring-1 focus:ring-primary"
            />
          </div>
          <div>
            <label className="text-xs font-medium text-muted-foreground block mb-1.5">Template</label>
            <div className="grid grid-cols-3 gap-2">
              {TEMPLATES.map((t) => (
                <button
                  key={t.value}
                  onClick={() => handleTemplateChange(t.value)}
                  className={`text-xs rounded-lg border px-3 py-2 font-medium transition-colors ${
                    template === t.value ? "bg-primary text-primary-foreground border-primary" : "hover:bg-muted"
                  }`}
                >
                  {t.label.split(" ")[0]}
                </button>
              ))}
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs font-medium text-muted-foreground block mb-1.5">Model provider</label>
              <select
                value={provider}
                onChange={(e) => {
                  setProvider(e.target.value)
                  setModelName(defaultModelFor(e.target.value))
                }}
                className="w-full text-sm px-3 py-2 rounded-lg border bg-background focus:outline-none focus:ring-1 focus:ring-primary"
              >
                <option value="anthropic">Anthropic</option>
                <option value="openai">OpenAI</option>
                <option value="groq">Groq</option>
              </select>
            </div>
            <div>
              <label className="text-xs font-medium text-muted-foreground block mb-1.5">Model</label>
              <input
                value={effectiveModel}
                onChange={(e) => setModelName(e.target.value)}
                list="engineer-models"
                aria-label="Model"
                placeholder="model id"
                className="w-full text-sm px-3 py-2 rounded-lg border bg-background focus:outline-none focus:ring-1 focus:ring-primary font-mono"
              />
              <datalist id="engineer-models">
                {providerModels.map((m) => <option key={m.id} value={m.id}>{m.label}</option>)}
              </datalist>
            </div>
          </div>
          <div>
            <label className="text-xs font-medium text-muted-foreground block mb-1.5">Skills (markdown)</label>
            <textarea
              value={skills}
              onChange={(e) => setSkills(e.target.value)}
              rows={4}
              className="w-full text-sm px-3 py-2 rounded-lg border bg-background focus:outline-none focus:ring-1 focus:ring-primary resize-none font-mono"
            />
          </div>
        </div>
        <div className="px-5 pb-5 flex justify-end gap-2">
          <Button variant="outline" size="sm" onClick={onClose}>Cancel</Button>
          <Button
            size="sm"
            onClick={() => onSave({ name, template, skills_markdown: skills, model_provider: provider, model_name: effectiveModel })}
            disabled={!name.trim() || !effectiveModel.trim()}
          >
            {initial ? "Save changes" : "Create"}
          </Button>
        </div>
      </div>
    </div>
  )
}

export default function EngineersPage() {
  const { data: engineers, isLoading } = useEngineers()
  const createEngineer = useCreateEngineer()
  const updateEngineer = useUpdateEngineer()
  const [showCreate, setShowCreate] = useState(false)
  const [editTarget, setEditTarget] = useState<Engineer | null>(null)

  function handleCreate(data: EngineerCreate) {
    createEngineer.mutate(data, { onSuccess: () => setShowCreate(false) })
  }

  function handleEdit(data: EngineerCreate) {
    if (!editTarget) return
    updateEngineer.mutate({ id: editTarget.id, ...data }, { onSuccess: () => setEditTarget(null) })
  }

  return (
    <div className="h-full overflow-y-auto p-6">
      <div className="max-w-5xl mx-auto">
        <div className="flex items-center justify-between mb-6">
          <div className="flex items-center gap-2">
            <Bot className="w-5 h-5 text-primary" />
            <h1 className="text-xl font-bold">Engineers</h1>
            {engineers && (
              <span className="text-xs text-muted-foreground bg-muted rounded-full px-2 py-0.5">
                {engineers.filter((e) => e.status === "running").length} running
              </span>
            )}
          </div>
          <Button size="sm" onClick={() => setShowCreate(true)}>
            <Plus className="w-3.5 h-3.5" /> New engineer
          </Button>
        </div>

        {isLoading ? (
          <div className="text-sm text-muted-foreground">Loading engineers…</div>
        ) : engineers && engineers.length > 0 ? (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {engineers.map((eng) => (
              <EngineerCard key={eng.id} engineer={eng} onEdit={setEditTarget} />
            ))}
          </div>
        ) : (
          <div className="flex flex-col items-center justify-center py-20 text-center">
            <div className="w-16 h-16 rounded-2xl bg-muted flex items-center justify-center mb-4">
              <Bot className="w-8 h-8 text-muted-foreground" />
            </div>
            <h2 className="font-semibold mb-1">No engineers yet</h2>
            <p className="text-sm text-muted-foreground mb-4">Create your first AI engineer to start automating tasks.</p>
            <Button size="sm" onClick={() => setShowCreate(true)}>
              <Plus className="w-3.5 h-3.5" /> Create engineer
            </Button>
          </div>
        )}
      </div>

      {showCreate && <EngineerDialog onClose={() => setShowCreate(false)} onSave={handleCreate} />}
      {editTarget && <EngineerDialog initial={editTarget} onClose={() => setEditTarget(null)} onSave={handleEdit} />}
    </div>
  )
}
