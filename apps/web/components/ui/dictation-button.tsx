"use client"

import { Mic, Square } from "lucide-react"
import { toast } from "sonner"
import { useDictation } from "@/hooks/useDictation"
import { cn } from "@/lib/utils"

interface Props {
  /** Receives each final spoken phrase; append it with `appendTranscript`. */
  onText: (text: string) => void
  /** Shown next to the mic while a phrase is still being recognised. */
  showInterim?: boolean
  size?: "sm" | "default"
  className?: string
}

/**
 * Microphone toggle for a text field. Renders nothing in browsers without
 * speech recognition so layouts stay unchanged there.
 */
export default function DictationButton({ onText, showInterim = true, size = "default", className }: Props) {
  const { supported, listening, interim, toggle } = useDictation(onText, (m) => toast.error(m))
  if (!supported) return null
  const box = size === "sm" ? "h-7 w-7" : "h-8 w-8"
  const icon = size === "sm" ? "h-3.5 w-3.5" : "h-4 w-4"
  return (
    <span className={cn("inline-flex min-w-0 items-center gap-2", className)}>
      {showInterim && listening && (
        <span className="truncate text-[11px] italic text-muted-foreground" aria-live="polite">
          {interim || "Listening…"}
        </span>
      )}
      <button
        type="button"
        onClick={(e) => { e.stopPropagation(); toggle() }}
        aria-pressed={listening}
        aria-label={listening ? "Stop dictation" : "Dictate"}
        title={listening ? "Stop dictation" : "Dictate (English) — speech is turned into text in your browser"}
        className={cn(
          "relative inline-flex shrink-0 items-center justify-center rounded-md border transition-colors",
          "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/40",
          box,
          listening
            ? "border-destructive/40 bg-destructive/10 text-destructive"
            : "border-input bg-background text-muted-foreground hover:bg-accent hover:text-foreground",
        )}
      >
        {listening && <span className="absolute inset-0 animate-ping rounded-md bg-destructive/20 motion-reduce:hidden" aria-hidden />}
        {listening ? <Square className={cn(icon, "relative fill-current")} /> : <Mic className={cn(icon, "relative")} />}
      </button>
    </span>
  )
}
