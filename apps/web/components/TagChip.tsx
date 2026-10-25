import type { Tag } from "@/types"
import { cn } from "@/lib/utils"

export default function TagChip({ tag, size = "sm" }: { tag: Tag; size?: "xs" | "sm" }) {
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-full font-medium leading-none",
        size === "xs" ? "text-[9px] px-1.5 py-0.5" : "text-[10px] px-2 py-1"
      )}
      style={{ backgroundColor: `${tag.color}22`, color: tag.color }}
    >
      {tag.name}
    </span>
  )
}
