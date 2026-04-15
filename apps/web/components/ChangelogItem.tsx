import { cn } from "@/lib/utils"
import { formatRelativeTime } from "@/lib/utils"
import type { ChangelogEntry, ChangelogType } from "@/types"

const TYPE_STYLES: Record<ChangelogType, { dot: string; badge: string; label: string }> = {
  added:   { dot: "bg-emerald-500", badge: "bg-emerald-100 text-emerald-700", label: "Added" },
  changed: { dot: "bg-blue-500",    badge: "bg-blue-100 text-blue-700",       label: "Changed" },
  fixed:   { dot: "bg-amber-500",   badge: "bg-amber-100 text-amber-700",     label: "Fixed" },
  infra:   { dot: "bg-purple-500",  badge: "bg-purple-100 text-purple-700",   label: "Infra" },
}

interface ChangelogItemProps {
  entry: ChangelogEntry
  isLast?: boolean
}

export default function ChangelogItem({ entry, isLast }: ChangelogItemProps) {
  const style = TYPE_STYLES[entry.type] ?? TYPE_STYLES.changed

  return (
    <div className="flex gap-3">
      <div className="flex flex-col items-center shrink-0">
        <div className={cn("w-2 h-2 rounded-full mt-1.5 shrink-0", style.dot)} />
        {!isLast && <div className="w-px flex-1 bg-border mt-1" />}
      </div>
      <div className="pb-4 min-w-0">
        <div className="flex items-center gap-2 mb-0.5 flex-wrap">
          <span className={cn("text-[10px] font-semibold px-1.5 py-0.5 rounded", style.badge)}>
            {style.label}
          </span>
          {entry.file_path && (
            <span className="text-[10px] font-mono text-muted-foreground bg-muted px-1.5 py-0.5 rounded truncate max-w-[200px]">
              {entry.file_path}
            </span>
          )}
          <span className="text-[10px] text-muted-foreground ml-auto">{formatRelativeTime(entry.created_at)}</span>
        </div>
        <p className="text-sm text-foreground/90 leading-snug">{entry.message}</p>
      </div>
    </div>
  )
}
