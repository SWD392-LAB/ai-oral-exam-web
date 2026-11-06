import { useCallback, useEffect, useRef } from 'react'

// Reads text aloud with the browser's speech synthesis (stand-in for the server TTS until M2)
// and reports which word is being read. When the browser gives no word boundaries, or has no
// speech at all, the words advance on a timer so the gold highlight still moves.
export function useSpeech() {
  const timer = useRef(0)
  const cancelled = useRef(false)

  const cancel = useCallback(() => {
    cancelled.current = true
    clearInterval(timer.current)
    try { window.speechSynthesis?.cancel() } catch { /* nothing to cancel */ }
  }, [])

  useEffect(() => cancel, [cancel])

  const speak = useCallback((text, { onWord, onEnd, msPerWord = 330, lang = 'en-US' } = {}) => {
    cancel()
    cancelled.current = false
    const words = text.split(' ')
    const starts = []
    let pos = 0
    for (const w of words) { starts.push(pos); pos += w.length + 1 }
    let idx = -1
    let ended = false
    const end = () => {
      if (ended || cancelled.current) return
      ended = true
      clearInterval(timer.current)
      onWord?.(words.length)
      onEnd?.()
    }
    const runTimer = () => {
      clearInterval(timer.current)
      timer.current = setInterval(() => {
        idx += 1
        if (idx >= words.length) { if (!synth) end(); return }
        onWord?.(idx)
      }, msPerWord)
    }

    const synth = window.speechSynthesis
    if (!synth || typeof window.SpeechSynthesisUtterance === 'undefined') {
      onWord?.(0)
      runTimer()
      return
    }
    const u = new window.SpeechSynthesisUtterance(text)
    u.lang = lang
    u.rate = 1
    let gotBoundary = false
    u.onboundary = (e) => {
      if (e.name && e.name !== 'word') return
      gotBoundary = true
      clearInterval(timer.current)
      let i = starts.findIndex((s, k) => e.charIndex >= s && (k === starts.length - 1 || e.charIndex < starts[k + 1]))
      if (i < 0) i = idx
      idx = i
      onWord?.(i)
    }
    u.onend = end
    u.onerror = end
    onWord?.(0)
    synth.speak(u)
    // fall back to a timer if no word boundaries arrive (some voices never send them)
    setTimeout(() => { if (!gotBoundary && !ended && !cancelled.current) runTimer() }, 700)
    // never hang on a voice that does not finish
    setTimeout(end, words.length * msPerWord + 4000)
  }, [cancel])

  return { speak, cancel }
}
