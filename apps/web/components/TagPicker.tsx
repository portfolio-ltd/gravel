"use client"

import { useState } from "react"
import { Tag as TagIcon, Check } from "lucide-react"
import { useTags } from "@/hooks/useTags"
import TagChip from "@/components/TagChip"
import { cn } from "@/lib/utils"
import type { Tag } from "@/types"

interface Props {
  selected: Tag[]
  onChange: (tagIds: string[]) => void
  disabled?: boolean
}

export default function TagPicker({ selected, onChange, disabled }: Props) {
  const { data: allTags } = useTags()
  const [open, setOpen] = useState(false)
  const selectedIds = new Set(selected.map((t) => t.id))

  function toggle(tagId: string) {
    const next = new Set(selectedIds)
    if (next.has(tagId)) next.delete(tagId)
    else next.add(tagId)
    onChange([...next])
  }

  return (
    <div className="relative">
      <div className="flex items-center gap-1.5 flex-wrap">
        {selected.map((t) => <TagChip key={t.id} tag={t} />)}
        <button
          onClick={() => !disabled && setOpen((v) => !v)}
          className="flex items-center gap-1 text-[10px] px-2 py-1 rounded-full border border-dashed text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
        >
          <TagIcon className="w-2.5 h-2.5" /> {selected.length ? "Edit" : "Add tags"}
        </button>
      </div>

      {open && (
        <>
          <div className="fixed inset-0 z-40" onClick={() => setOpen(false)} />
          <div className="absolute z-50 mt-1 w-52 rounded-xl border bg-background shadow-lg p-1.5 max-h-56 overflow-y-auto">
            {(allTags ?? []).length === 0 && (
              <p className="text-xs text-muted-foreground p-2">
                No tags yet — create them on the organization page.
              </p>
            )}
            {(allTags ?? []).map((tag) => (
              <button
                key={tag.id}
                onClick={() => toggle(tag.id)}
                className={cn(
                  "w-full flex items-center gap-2 px-2 py-1.5 rounded-lg text-xs hover:bg-muted transition-colors",
                  selectedIds.has(tag.id) && "font-medium"
                )}
              >
                <Check className={cn("w-3 h-3", selectedIds.has(tag.id) ? "opacity-100" : "opacity-0")} />
                <span className="w-2 h-2 rounded-full shrink-0" style={{ backgroundColor: tag.color }} />
                <span className="truncate">{tag.name}</span>
              </button>
            ))}
          </div>
        </>
      )}
    </div>
  )
}
