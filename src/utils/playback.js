// Shared by the lecturer's review and the student's report: when each word of an answer is
// spoken (spread over the answer's length, pauses after punctuation) and the waveform bars.

export const WAVE_BARS = 56

export function wordTiming(text, dur) {
  const ws = (text ?? '').split(' ').filter(Boolean)
  const wt = ws.map((w) => 0.6 + w.replace(/[^A-Za-z]/g, '').length * 0.12 + (/[.,;]$/.test(w) ? 0.9 : 0))
  const tot = wt.reduce((a, b) => a + b, 0) || 1
  let t = Math.min(1.2, dur * 0.1)
  const k = Math.max(0.1, dur - 2 * t) / tot
  return ws.map((w, i) => { const s = t; t += wt[i] * k; return { w, s, e: t } })
}

// heights in px (8..38), the same for a given seed on every render
export function waveBars(seed) {
  return Array.from({ length: WAVE_BARS }, (_, i) => {
    const x = Math.sin((i + seed * 7.3) * 12.9898) * 43758.5453
    const r = x - Math.floor(x)
    const env = 0.45 + 0.55 * Math.abs(Math.sin(i * 0.37 + seed))
    return Math.round(8 + 30 * env * (0.55 + 0.45 * r))
  })
}
