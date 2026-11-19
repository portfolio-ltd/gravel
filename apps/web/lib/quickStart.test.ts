import { describe, expect, it } from "vitest"
import { projectNameFor, repoUrlOf, runnerCommands } from "./quickStart"

describe("quickStart helpers", () => {
  it("normalizes repository input", () => {
    expect(repoUrlOf("acme/web-app")).toBe("https://github.com/acme/web-app")
    expect(repoUrlOf("github.com/acme/web-app/")).toBe("https://github.com/acme/web-app")
    expect(repoUrlOf("https://github.com/acme/web-app.git")).toBe("https://github.com/acme/web-app")
    expect(repoUrlOf("  ")).toBeUndefined()
  })

  it("names the project after the repository", () => {
    expect(projectNameFor("acme/web-app")).toBe("web-app")
    expect(projectNameFor("https://github.com/acme/site.io")).toBe("site")
    expect(projectNameFor("")).toBe("My first project")
  })

  it("builds the three runner commands for this server", () => {
    const cmds = runnerCommands("https://api.example.com", "codex")
    expect(cmds).toHaveLength(3)
    expect(cmds[1]).toBe("gravel login --server https://api.example.com")
    expect(cmds[2]).toBe("gravel work --executor codex")
  })
})
