"use client"

import { useEffect, useState } from "react"
import { Check, Pencil, Plus, Sparkles, Trash2, X } from "lucide-react"
import { toast } from "sonner"
import type { AcceptanceCriterion, Task } from "@/types"
import { useSetCriteria } from "@/hooks/useSdlc"
import { errorDetail } from "@/hooks/useTaskExtras"
import { Input } from "@/components/ui/form"
import { Button } from "@/components/ui/button"
import { cn } from "@/lib/utils"

type Draft = Pick<AcceptanceCriterion, "text" | "done"> & { id?: string; source?: AcceptanceCriterion["source"] }

/** Checklist of acceptance criteria. Every change saves immediately. */
export default function CriteriaEditor({ task }: { task: Task }) {
  const save = useSetCriteria(task.id)
  const [items, setItems] = useState<Draft[]>(task.acceptance_criteria ?? [])
  const [editing, setEditing] = useState<number | null>(null)
  const [editText, setEditText] = useState("")
  const [newText, setNewText] = useState("")

  // Server updates (an AI stage revised the list) replace local state
  useEffect(() => { setItems(task.acceptance_criteria ?? []) }, [task.acceptance_criteria])

  function commit(next: Draft[]) {
    const previous = items
    setItems(next)
    save.mutate(next.map(({ id, text, done }) => ({ id, text, done })), {
      onError: (e) => {
        setItems(previous)
        toast.error(errorDetail(e, "Could not save acceptance criteria"))
      },
    })
  }

  function add() {
    const text = newText.trim()
    if (!text) return
    commit([...items, { text, done: false, source: "human" }])
    setNewText("")
  }

  const done = items.filter((c) => c.done).length

  return (
    <div>
      <div className="mb-2 flex items-center justify-between">
        <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Acceptance criteria</h3>
        {items.length > 0 && (
          <span className="text-[11px] text-muted-foreground">{done}/{items.length} met</span>
        )}
      </div>
      {items.length > 0 && (
        <div className="mb-2 h-1 overflow-hidden rounded-full bg-muted" aria-hidden>
          <div className="h-full rounded-full bg-success transition-all" style={{ width: `${(done / items.length) * 100}%` }} />
        </div>
      )}
      <ul className="space-y-1">
        {items.map((c, i) => (
          <li key={c.id ?? `new-${i}`} className="group flex items-start gap-2 rounded-lg px-1.5 py-1 hover:bg-muted/50">
            <input
              type="checkbox"
              checked={c.done}
              onChange={() => commit(items.map((x, j) => (j === i ? { ...x, done: !x.done } : x)))}
              aria-label={`Mark "${c.text}" as ${c.done ? "not met" : "met"}`}
              className="mt-1 h-3.5 w-3.5 shrink-0 accent-[hsl(var(--primary))]"
            />
            {editing === i ? (
              <form
                className="flex flex-1 items-center gap-1"
                onSubmit={(e) => {
                  e.preventDefault()
                  if (editText.trim()) commit(items.map((x, j) => (j === i ? { ...x, text: editText.trim() } : x)))
                  setEditing(null)
                }}
              >
                <Input autoFocus value={editText} onChange={(e) => setEditText(e.target.value)} className="h-7 text-xs"
                  aria-label="Edit criterion" onKeyDown={(e) => e.key === "Escape" && setEditing(null)} />
                <Button type="submit" size="icon" variant="ghost" className="h-7 w-7" aria-label="Save"><Check className="h-3.5 w-3.5" /></Button>
                <Button type="button" size="icon" variant="ghost" className="h-7 w-7" aria-label="Cancel" onClick={() => setEditing(null)}>
                  <X className="h-3.5 w-3.5" />
                </Button>
              </form>
            ) : (
              <>
                <span className={cn("flex-1 text-sm leading-snug", c.done && "text-muted-foreground line-through")}>
                  <span className="mr-1.5 font-mono text-[10px] text-muted-foreground">AC-{i + 1}</span>
                  {c.text}
                  {c.source === "ai" && (
                    <span className="ml-1.5 inline-flex items-center gap-0.5 rounded bg-primary/10 px-1 py-px align-middle text-[9px] font-semibold text-primary"
                      title="Proposed by an AI stage — edit it to make it yours">
                      <Sparkles className="h-2.5 w-2.5" /> AI
                    </span>
                  )}
                </span>
                <div className="flex shrink-0 opacity-0 transition-opacity focus-within:opacity-100 group-hover:opacity-100">
                  <button className="rounded p-1 hover:bg-muted" aria-label="Edit criterion"
                    onClick={() => { setEditing(i); setEditText(c.text) }}>
                    <Pencil className="h-3 w-3" />
                  </button>
                  <button className="rounded p-1 hover:bg-muted hover:text-destructive" aria-label="Delete criterion"
                    onClick={() => commit(items.filter((_, j) => j !== i))}>
                    <Trash2 className="h-3 w-3" />
                  </button>
                </div>
              </>
            )}
          </li>
        ))}
      </ul>
      {items.length === 0 && (
        <p className="mb-2 text-xs text-muted-foreground">
          None yet. Add them yourself, or let the Analyze stage propose some from the description.
        </p>
      )}
      <form className="mt-2 flex gap-2" onSubmit={(e) => { e.preventDefault(); add() }}>
        <Input value={newText} onChange={(e) => setNewText(e.target.value)} placeholder="Given … when … then …"
          className="h-8 text-xs" aria-label="New acceptance criterion" />
        <Button type="submit" size="sm" variant="outline" className="h-8" disabled={!newText.trim() || save.isPending}>
          <Plus className="h-3.5 w-3.5" /> Add
        </Button>
      </form>
    </div>
  )
}
