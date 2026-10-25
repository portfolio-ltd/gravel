"use client"

import { Check, Eye, EyeOff, SlidersHorizontal } from "lucide-react"
import type { BoardColumn } from "@/types"
import { usePreferences } from "@/contexts/PreferencesContext"
import { DEFAULT_PREFERENCES, type BoardCardFields } from "@/lib/theme"
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger,
} from "@/components/ui/dropdown"
import { Button } from "@/components/ui/button"
import { cn } from "@/lib/utils"

const FIELD_LABELS: Record<keyof BoardCardFields, string> = {
  priority: "Priority",
  type: "Type",
  stage: "Workflow stage",
  criteria: "Acceptance progress",
  questions: "Open questions",
  links: "PR & issue links",
  tags: "Tags",
}

/** Per-user board layout: which chips cards show, density, and hidden columns. */
export default function BoardCustomize({ columns }: { columns: BoardColumn[] }) {
  const { prefs, update } = usePreferences()
  const board = prefs.board

  const setBoard = (patch: Partial<typeof board>) => update({ board: { ...board, ...patch } })
  const toggleField = (key: keyof BoardCardFields) =>
    setBoard({ cardFields: { ...board.cardFields, [key]: !board.cardFields[key] } })
  const toggleColumn = (key: string) =>
    setBoard({
      hiddenColumns: board.hiddenColumns.includes(key)
        ? board.hiddenColumns.filter((k) => k !== key)
        : [...board.hiddenColumns, key],
    })

  // Keep the menu open while toggling
  const keepOpen = (fn: () => void) => (e: Event) => { e.preventDefault(); fn() }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="outline" size="sm" className="h-8">
          <SlidersHorizontal className="h-3.5 w-3.5" /> Customize
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="max-h-[70vh] w-60 overflow-y-auto">
        <DropdownMenuLabel>Card fields</DropdownMenuLabel>
        {(Object.keys(FIELD_LABELS) as (keyof BoardCardFields)[]).map((key) => (
          <DropdownMenuItem key={key} onSelect={keepOpen(() => toggleField(key))} role="menuitemcheckbox"
            aria-checked={board.cardFields[key]}>
            <Check className={cn("h-3.5 w-3.5", !board.cardFields[key] && "invisible")} />
            {FIELD_LABELS[key]}
          </DropdownMenuItem>
        ))}
        <DropdownMenuSeparator />
        <DropdownMenuItem onSelect={keepOpen(() => setBoard({ compactCards: !board.compactCards }))} role="menuitemcheckbox"
          aria-checked={board.compactCards}>
          <Check className={cn("h-3.5 w-3.5", !board.compactCards && "invisible")} />
          Compact cards
        </DropdownMenuItem>
        {columns.length > 0 && (
          <>
            <DropdownMenuSeparator />
            <DropdownMenuLabel>Columns</DropdownMenuLabel>
            {columns.map((col) => {
              const hidden = board.hiddenColumns.includes(col.key)
              return (
                <DropdownMenuItem key={col.key} onSelect={keepOpen(() => toggleColumn(col.key))} role="menuitemcheckbox"
                  aria-checked={!hidden}>
                  {hidden ? <EyeOff className="h-3.5 w-3.5 text-muted-foreground" /> : <Eye className="h-3.5 w-3.5" />}
                  <span className={cn(hidden && "text-muted-foreground")}>{col.label}</span>
                </DropdownMenuItem>
              )
            })}
          </>
        )}
        <DropdownMenuSeparator />
        <DropdownMenuItem onSelect={() => setBoard(DEFAULT_PREFERENCES.board)} className="text-muted-foreground">
          Reset board layout
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
