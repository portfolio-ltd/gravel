"use client"

import { useCallback, useEffect, useRef, useState } from "react"
import { usePreferences } from "@/contexts/PreferencesContext"
import {
  describeDictationError,
  getSpeechRecognition,
  splitResults,
  type SpeechRecognitionLike,
} from "@/lib/dictation"

export interface Dictation {
  /** False in browsers without the Web Speech API (e.g. Firefox). */
  supported: boolean
  listening: boolean
  /** The phrase currently being recognised; cleared once it is final. */
  interim: string
  start: () => void
  stop: () => void
  toggle: () => void
}

/**
 * Speech → text for one input. `onText` receives each final phrase; the
 * caller appends it to its value (see `appendTranscript`). Recognition runs
 * in the browser in the language chosen under Settings → Profile.
 */
export function useDictation(onText: (text: string) => void, onError?: (message: string) => void): Dictation {
  const { prefs } = usePreferences()
  const [supported, setSupported] = useState(false)
  const [listening, setListening] = useState(false)
  const [interim, setInterim] = useState("")
  const recognizer = useRef<SpeechRecognitionLike | null>(null)
  const onTextRef = useRef(onText)
  const onErrorRef = useRef(onError)
  onTextRef.current = onText
  onErrorRef.current = onError

  useEffect(() => { setSupported(getSpeechRecognition() !== null) }, [])

  // Stop the microphone when the input unmounts
  useEffect(() => () => { recognizer.current?.abort(); recognizer.current = null }, [])

  const stop = useCallback(() => {
    recognizer.current?.stop()
  }, [])

  const start = useCallback(() => {
    const Ctor = getSpeechRecognition()
    if (!Ctor || recognizer.current) return
    const rec = new Ctor()
    rec.lang = prefs.dictationLang
    rec.continuous = true
    rec.interimResults = true
    rec.maxAlternatives = 1
    rec.onstart = () => setListening(true)
    rec.onresult = (event) => {
      const { final, interim: partial } = splitResults(event)
      if (final) onTextRef.current(final)
      setInterim(partial)
    }
    rec.onerror = (event) => {
      // "aborted" is us stopping; "no-speech" just ends the session quietly
      if (event.error !== "aborted" && event.error !== "no-speech") onErrorRef.current?.(describeDictationError(event.error))
    }
    rec.onend = () => {
      recognizer.current = null
      setListening(false)
      setInterim("")
    }
    recognizer.current = rec
    try {
      rec.start()
    } catch {
      recognizer.current = null
      onErrorRef.current?.(describeDictationError("unknown"))
    }
  }, [prefs.dictationLang])

  const toggle = useCallback(() => {
    if (recognizer.current) stop()
    else start()
  }, [start, stop])

  return { supported, listening, interim, start, stop, toggle }
}
