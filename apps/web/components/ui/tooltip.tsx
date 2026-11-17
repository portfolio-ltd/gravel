"use client"

import * as React from "react"
import * as TooltipPrimitive from "@radix-ui/react-tooltip"
import { HelpCircle } from "lucide-react"
import { GLOSSARY, type GlossaryKey } from "@/lib/glossary"
import { cn } from "@/lib/utils"

export const TooltipProvider = TooltipPrimitive.Provider

/** Hover/focus tooltip around one focusable child. Empty content renders the child alone. */
export function Tooltip({ content, children, side = "top", align = "center", className }: {
  content: React.ReactNode
  children: React.ReactElement
  side?: "top" | "right" | "bottom" | "left"
  align?: "start" | "center" | "end"
  className?: string
}) {
  if (content === null || content === undefined || content === "") return children
  return (
    <TooltipPrimitive.Root>
      <TooltipPrimitive.Trigger asChild>{children}</TooltipPrimitive.Trigger>
      <TooltipPrimitive.Portal>
        <TooltipPrimitive.Content
          side={side}
          align={align}
          sideOffset={6}
          collisionPadding={8}
          className={cn(
            "z-[70] max-w-xs animate-fade-in rounded-lg border bg-popover px-2.5 py-1.5 text-xs leading-snug text-popover-foreground shadow-md",
            className,
          )}
        >
          {content}
        </TooltipPrimitive.Content>
      </TooltipPrimitive.Portal>
    </TooltipPrimitive.Root>
  )
}

/** The body of a glossary tooltip: the term in bold, then a plain-language explanation. */
export function GlossaryContent({ term }: { term: GlossaryKey }) {
  const entry = GLOSSARY[term]
  return (
    <span className="block">
      <span className="block font-semibold">{entry.term}</span>
      <span className="mt-0.5 block text-muted-foreground">{entry.body}</span>
    </span>
  )
}

/**
 * A small (?) that explains a term on hover or focus. Pass a glossary `term`,
 * or your own `content`.
 */
export function HelpHint({ term, content, label, side = "top", className }: {
  term?: GlossaryKey
  content?: React.ReactNode
  label?: string
  side?: "top" | "right" | "bottom" | "left"
  className?: string
}) {
  const body = term ? <GlossaryContent term={term} /> : content
  const name = label ?? (term ? GLOSSARY[term].term : "this")
  return (
    <Tooltip content={body} side={side}>
      <button
        type="button"
        aria-label={`What is ${name}?`}
        className={cn(
          "inline-flex h-4 w-4 shrink-0 items-center justify-center rounded-full text-muted-foreground/70 transition-colors hover:text-foreground focus-visible:text-foreground",
          className,
        )}
      >
        <HelpCircle className="h-3.5 w-3.5" />
      </button>
    </Tooltip>
  )
}
