// Voice input (speech → text) via the browser's Web Speech API.
// Nothing leaves Gravel's servers: recognition runs in the browser (Chrome,
// Edge and Safari ship it; Firefox does not). English only for now — see the
// "Voice input: more languages" issue for adding locales.

export interface DictationLanguage {
  code: string
  label: string
}

/** Languages offered in Settings. Add a locale here once it has been tested. */
export const DICTATION_LANGUAGES: readonly DictationLanguage[] = [
  { code: "en-US", label: "English (United States)" },
  { code: "en-GB", label: "English (United Kingdom)" },
  { code: "en-IN", label: "English (India)" },
  { code: "en-AU", label: "English (Australia)" },
]

export const DEFAULT_DICTATION_LANGUAGE = "en-US"

export function isDictationLanguage(code: unknown): code is string {
  return typeof code === "string" && DICTATION_LANGUAGES.some((lang) => lang.code === code)
}

// TypeScript's DOM lib declares the result types but not the recognizer
// itself (it is still vendor-prefixed in Chromium), so declare what we use.
export interface SpeechRecognitionLike extends EventTarget {
  lang: string
  continuous: boolean
  interimResults: boolean
  maxAlternatives: number
  start(): void
  stop(): void
  abort(): void
  onresult: ((event: SpeechRecognitionEventLike) => void) | null
  onerror: ((event: SpeechRecognitionErrorLike) => void) | null
  onend: (() => void) | null
  onstart: (() => void) | null
}

export interface SpeechRecognitionEventLike {
  resultIndex: number
  results: SpeechRecognitionResultList
}

export interface SpeechRecognitionErrorLike {
  error: string
  message?: string
}

export type SpeechRecognitionCtor = new () => SpeechRecognitionLike

/** The recognizer constructor, or null when this browser has none. */
export function getSpeechRecognition(): SpeechRecognitionCtor | null {
  if (typeof window === "undefined") return null
  const w = window as unknown as { SpeechRecognition?: SpeechRecognitionCtor; webkitSpeechRecognition?: SpeechRecognitionCtor }
  return w.SpeechRecognition ?? w.webkitSpeechRecognition ?? null
}

/**
 * Split a recognition event into the text that is final (safe to insert) and
 * the interim guess still being revised.
 */
export function splitResults(event: SpeechRecognitionEventLike): { final: string; interim: string } {
  let final = ""
  let interim = ""
  for (let i = event.resultIndex; i < event.results.length; i++) {
    const result = event.results[i]
    const text = result[0]?.transcript ?? ""
    if (result.isFinal) final += text
    else interim += text
  }
  return { final: final.trim(), interim: interim.trim() }
}

/**
 * Append dictated text to what the user already typed: one space between
 * words, nothing extra after a newline or at the start of an empty field.
 */
export function appendTranscript(existing: string, transcript: string): string {
  const spoken = transcript.trim()
  if (!spoken) return existing
  if (!existing) return spoken
  if (/\s$/.test(existing)) return existing + spoken
  return `${existing} ${spoken}`
}

/** A sentence for the toast when recognition stops with an error. */
export function describeDictationError(code: string): string {
  switch (code) {
    case "not-allowed":
    case "service-not-allowed":
      return "Microphone access was blocked. Allow it for this site in your browser and try again."
    case "audio-capture":
      return "No microphone was found."
    case "network":
      return "Speech recognition needs a network connection in this browser."
    case "language-not-supported":
      return "This browser does not support the selected dictation language."
    case "no-speech":
      return "No speech was heard."
    case "aborted":
      return "Dictation stopped."
    default:
      return "Dictation failed. Try again or type instead."
  }
}
