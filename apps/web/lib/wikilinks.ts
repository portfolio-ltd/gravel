/**
 * Obsidian-style wikilinks in markdown: [[Target]], [[Target|alias]], [[Target#Heading]].
 *
 * The API resolves targets by slug or title; the UI turns them into links to
 * /knowledge/by-slug/<target>, which redirects to the entry (or offers to
 * create it when nothing matches).
 */
export const WIKILINK_RE = /\[\[([^[\]|#]+?)(?:#([^[\]|]*))?(?:\|([^[\]]+?))?\]\]/g

export function wikiHref(target: string): string {
  return `/knowledge/by-slug/${encodeURIComponent(target.trim())}`
}

/** Rewrites wikilinks into ordinary markdown links so react-markdown can render them. */
export function rewriteWikilinks(markdown: string): string {
  // Skip fenced code blocks: a [[x]] inside ``` is code, not a link
  const parts = markdown.split(/(```[\s\S]*?```|`[^`\n]*`)/g)
  return parts.map((part, i) => {
    if (i % 2 === 1) return part
    return part.replace(WIKILINK_RE, (_m, target: string, heading: string | undefined, alias: string | undefined) => {
      const label = (alias ?? target).trim()
      return `[${label}](${wikiHref(target)}${heading ? `#${encodeURIComponent(heading.trim())}` : ""})`
    })
  }).join("")
}

/** Link targets in order of appearance, duplicates removed. */
export function parseWikilinks(markdown: string): string[] {
  const seen: string[] = []
  for (const m of rewriteWikilinksSource(markdown).matchAll(WIKILINK_RE)) {
    const target = m[1].trim()
    if (target && !seen.includes(target)) seen.push(target)
  }
  return seen
}

function rewriteWikilinksSource(markdown: string): string {
  return markdown.split(/(```[\s\S]*?```|`[^`\n]*`)/g).filter((_, i) => i % 2 === 0).join("\n")
}
