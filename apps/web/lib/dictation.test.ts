import { describe, it, expect } from "vitest"
import {
  appendTranscript,
  DEFAULT_DICTATION_LANGUAGE,
  describeDictationError,
  DICTATION_LANGUAGES,
  getSpeechRecognition,
  isDictationLanguage,
  splitResults,
} from "./dictation"

describe("appendTranscript", () => {
  it("fills an empty field with the spoken text", () => {
    expect(appendTranscript("", "  hello world ")).toBe("hello world")
  })
  it("separates spoken text from typed text with one space", () => {
    expect(appendTranscript("Ship it", "tomorrow")).toBe("Ship it tomorrow")
    expect(appendTranscript("Ship it ", "tomorrow")).toBe("Ship it tomorrow")
  })
  it("continues directly after a newline", () => {
    expect(appendTranscript("## Context\n", "we need exports")).toBe("## Context\nwe need exports")
  })
  it("ignores empty transcripts", () => {
    expect(appendTranscript("keep", "   ")).toBe("keep")
  })
})

describe("splitResults", () => {
  function result(transcript: string, isFinal: boolean) {
    return { 0: { transcript, confidence: 1 }, length: 1, isFinal, item: () => ({ transcript, confidence: 1 }) }
  }
  it("separates final text from the interim guess, starting at resultIndex", () => {
    const results = [result("old ", true), result("approve the plan", true), result("and ship", false)]
    const event = { resultIndex: 1, results: results as unknown as SpeechRecognitionResultList }
    expect(splitResults(event)).toEqual({ final: "approve the plan", interim: "and ship" })
  })
})

describe("languages", () => {
  it("offers English only, with the default included", () => {
    expect(DICTATION_LANGUAGES.every((lang) => lang.code.startsWith("en-"))).toBe(true)
    expect(isDictationLanguage(DEFAULT_DICTATION_LANGUAGE)).toBe(true)
    expect(isDictationLanguage("fr-FR")).toBe(false)
    expect(isDictationLanguage(undefined)).toBe(false)
  })
})

describe("environment", () => {
  it("reports no recognizer outside a browser", () => {
    expect(getSpeechRecognition()).toBeNull()
  })
  it("explains blocked microphones and falls back to a generic message", () => {
    expect(describeDictationError("not-allowed")).toMatch(/Microphone access/)
    expect(describeDictationError("something-new")).toMatch(/Dictation failed/)
  })
})
