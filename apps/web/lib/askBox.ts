/**
 * Turn a free-form request typed (or dictated) on Home into a task:
 * the first line becomes the title, everything stays in the description
 * when the title had to be shortened or there is more than one line.
 */
export const TITLE_MAX = 100

export function splitRequest(text: string): { title: string; description: string } {
  const trimmed = text.trim()
  if (!trimmed) return { title: "", description: "" }
  const lines = trimmed.split(/\r?\n/)
  const first = lines[0].trim()
  const rest = lines.slice(1).join("\n").trim()
  if (first.length <= TITLE_MAX) return { title: first, description: rest }
  const cut = first.slice(0, TITLE_MAX)
  const space = cut.lastIndexOf(" ")
  const title = `${(space > TITLE_MAX * 0.6 ? cut.slice(0, space) : cut).replace(/[\s,.;:–-]+$/, "")}…`
  return { title, description: trimmed }
}
