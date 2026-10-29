import { describe, expect, it } from "vitest"
import { parseWikilinks, rewriteWikilinks } from "./wikilinks"

describe("wikilinks", () => {
  it("rewrites targets, aliases and headings into markdown links", () => {
    expect(rewriteWikilinks("See [[Invoice]] and [[invoice|a bill]] at [[Exports#Why]].")).toBe(
      "See [Invoice](/knowledge/by-slug/Invoice) and [a bill](/knowledge/by-slug/invoice) at [Exports](/knowledge/by-slug/Exports#Why).",
    )
  })

  it("leaves code alone", () => {
    const md = "Use `[[not a link]]` and\n```\n[[also not]]\n```\nbut [[Yes]]"
    expect(rewriteWikilinks(md)).toContain("`[[not a link]]`")
    expect(rewriteWikilinks(md)).toContain("[[also not]]")
    expect(rewriteWikilinks(md)).toContain("[Yes](/knowledge/by-slug/Yes)")
    expect(parseWikilinks(md)).toEqual(["Yes"])
  })

  it("lists unique targets in order", () => {
    expect(parseWikilinks("[[B]] [[A|x]] [[B#h]] [[C]]")).toEqual(["B", "A", "C"])
  })
})
