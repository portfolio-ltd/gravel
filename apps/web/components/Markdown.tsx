"use client"

import ReactMarkdown from "react-markdown"
import remarkGfm from "remark-gfm"
import { cn } from "@/lib/utils"

/**
 * Renders untrusted markdown (AI output, issue bodies) safely: react-markdown
 * never injects raw HTML, and links open in a new tab without referrer.
 */
export default function Markdown({ children, className }: { children: string; className?: string }) {
  return (
    <div className={cn("prose-gravel", className)}>
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        components={{
          a: ({ href, children }) => (
            <a href={href} target="_blank" rel="noopener noreferrer nofollow">{children}</a>
          ),
        }}
      >
        {children}
      </ReactMarkdown>
    </div>
  )
}

/** Gherkin is shown as code with keyword highlighting rather than as markdown. */
export function Gherkin({ source, className }: { source: string; className?: string }) {
  const keyword = /^(\s*)(Feature|Background|Scenario Outline|Scenario|Examples|Rule|Given|When|Then|And|But)(:?)(.*)$/
  return (
    <pre className={cn("overflow-x-auto rounded-lg border bg-muted/40 p-3 font-mono text-xs leading-relaxed", className)}>
      {source.split("\n").map((line, i) => {
        const m = keyword.exec(line)
        if (line.trim().startsWith("#")) {
          return <div key={i} className="text-muted-foreground">{line || " "}</div>
        }
        if (!m) return <div key={i}>{line || " "}</div>
        const structural = ["Feature", "Background", "Scenario", "Scenario Outline", "Examples", "Rule"].includes(m[2])
        return (
          <div key={i}>
            {m[1]}
            <span className={structural ? "font-semibold text-primary" : "font-semibold text-info"}>{m[2]}</span>
            {m[3]}
            <span>{m[4]}</span>
          </div>
        )
      })}
    </pre>
  )
}
