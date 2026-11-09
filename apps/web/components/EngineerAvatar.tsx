import { Bot } from "lucide-react"
import { engineerHue } from "@/lib/agentTime"
import { cn, getInitials } from "@/lib/utils"

const SIZES = {
  xs: "h-4 w-4 text-[8px]",
  sm: "h-6 w-6 text-[10px]",
  md: "h-9 w-9 text-xs",
}

/**
 * An engineer's badge: initials on a colour derived from its id, so the same
 * agent looks the same on Home, the board and in task panels. No engineer
 * (a queued run) gets a neutral robot.
 */
export default function EngineerAvatar({ id, name, size = "sm", className }: {
  id?: string | null
  name?: string | null
  size?: keyof typeof SIZES
  className?: string
}) {
  if (!id || !name) {
    return (
      <span aria-hidden className={cn("flex shrink-0 items-center justify-center rounded-full bg-muted text-muted-foreground", SIZES[size], className)}>
        <Bot className="h-[60%] w-[60%]" />
      </span>
    )
  }
  const hue = engineerHue(id)
  return (
    <span
      aria-hidden
      title={name}
      className={cn(
        "flex shrink-0 items-center justify-center rounded-full font-semibold",
        "bg-[hsl(var(--eng-hue)_70%_50%/0.16)] text-[hsl(var(--eng-hue)_65%_38%)]",
        "dark:bg-[hsl(var(--eng-hue)_70%_55%/0.22)] dark:text-[hsl(var(--eng-hue)_80%_72%)]",
        SIZES[size], className,
      )}
      style={{ "--eng-hue": hue } as React.CSSProperties}
    >
      {getInitials(name)}
    </span>
  )
}
