import { useCallback, useEffect, useRef, useState } from 'react'

const Recognition = typeof window !== 'undefined' ? (window.SpeechRecognition || window.webkitSpeechRecognition) : undefined

// Live transcript from the browser's speech recognition, a stand-in for the server STT until M2.
// `supported` is false in browsers without it; the exam room then takes a typed answer.
export function useSpeechRecognition({ lang = 'en-US' } = {}) {
  const [finalText, setFinalText] = useState('')
  const [interimText, setInterimText] = useState('')
  const [error, setError] = useState(null)
  const rec = useRef(null)
  const active = useRef(false)
  const heard = useRef({ final: '', interim: '' })

  // stops listening and returns everything heard, words still being recognised included
  const stop = useCallback(() => {
    active.current = false
    try { rec.current?.stop() } catch { /* already stopped */ }
    rec.current = null
    return `${heard.current.final} ${heard.current.interim}`.trim()
  }, [])

  useEffect(() => () => {
    active.current = false
    try { rec.current?.abort() } catch { /* gone */ }
  }, [])

  const start = useCallback(() => {
    if (!Recognition) return
    heard.current = { final: '', interim: '' }
    setFinalText('')
    setInterimText('')
    setError(null)
    active.current = true
    const run = () => {
      const r = new Recognition()
      r.lang = lang
      r.continuous = true
      r.interimResults = true
      r.onresult = (e) => {
        let interim = ''
        for (let i = e.resultIndex; i < e.results.length; i++) {
          const t = e.results[i][0].transcript
          if (e.results[i].isFinal) heard.current.final = `${heard.current.final} ${t}`.trim()
          else interim += t
        }
        heard.current.interim = interim.trim()
        setFinalText(heard.current.final)
        setInterimText(heard.current.interim)
      }
      r.onerror = (e) => {
        if (['not-allowed', 'service-not-allowed', 'network', 'audio-capture'].includes(e.error)) {
          active.current = false
          setError(e.error)
        }
      }
      // recognition ends by itself after a silence; keep listening until the answer is finished
      r.onend = () => { if (active.current) { try { run() } catch { active.current = false } } }
      rec.current = r
      r.start()
    }
    try { run() } catch (e) { setError(e?.message ?? 'failed') }
  }, [lang])

  return { supported: !!Recognition, finalText, interimText, error, start, stop }
}
