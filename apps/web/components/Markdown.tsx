"use client"

import Link from "next/link"
import ReactMarkdown from "react-markdown"
import remarkGfm from "remark-gfm"
import { cn } from "@/lib/utils"
import { rewriteWikilinks } from "@/lib/wikilinks"

/**
 * Renders untrusted markdown (AI output, issue bodies) safely: react-markdown
 * never injects raw HTML, external links open in a new tab without referrer,
 * and [[wikilinks]] become in-app links to the knowledge base.
 */
export default function Markdown({ children, className }: { children: string; className?: string }) {
  return (
    <div className={cn("prose-gravel", className)}>
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        components={{
          a: ({ href, children }) => {
            // "/x" is in-app; "//evil.example" is protocol-relative and external
            if (href?.startsWith("/") && !href.startsWith("//")) {
              const wiki = href.startsWith("/knowledge/by-slug/")
              return <Link href={href} className={wiki ? "wikilink" : undefined}>{children}</Link>
            }
            return <a href={href} target="_blank" rel="noopener noreferrer nofollow">{children}</a>
          },
        }}
      >
        {rewriteWikilinks(children)}
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
