import { useCallback, useEffect, useRef, useState } from 'react'

// Live microphone level (0..1) from getUserMedia + an AnalyserNode.
// status: 'idle' | 'checking' | 'ok' | 'blocked' | 'missing'
export function useMicLevel({ autoStart = true, deviceId } = {}) {
  const [status, setStatus] = useState('idle')
  const [level, setLevel] = useState(0)
  const [devices, setDevices] = useState([])
  const [label, setLabel] = useState('')
  const stream = useRef(null)
  const ctx = useRef(null)
  const raf = useRef(0)

  const stop = useCallback(() => {
    cancelAnimationFrame(raf.current)
    stream.current?.getTracks().forEach((t) => t.stop())
    stream.current = null
    ctx.current?.close().catch(() => {})
    ctx.current = null
  }, [])

  const start = useCallback(async (id) => {
    stop()
    if (!navigator.mediaDevices?.getUserMedia) { setStatus('missing'); return }
    setStatus('checking')
    try {
      const s = await navigator.mediaDevices.getUserMedia({ audio: id ? { deviceId: { exact: id } } : true })
      stream.current = s
      const track = s.getAudioTracks()[0]
      setLabel(track?.label || 'Microphone')
      const list = await navigator.mediaDevices.enumerateDevices()
      setDevices(list.filter((d) => d.kind === 'audioinput').map((d, i) => ({ id: d.deviceId, label: d.label || `Microphone ${i + 1}` })))
      const AC = window.AudioContext || window.webkitAudioContext
      const ac = new AC()
      ctx.current = ac
      const src = ac.createMediaStreamSource(s)
      const an = ac.createAnalyser()
      an.fftSize = 512
      src.connect(an)
      const buf = new Uint8Array(an.fftSize)
      let last = 0
      const loop = (t) => {
        raf.current = requestAnimationFrame(loop)
        if (t - last < 120) return // 8 updates a second is enough for the meter
        last = t
        an.getByteTimeDomainData(buf)
        let sum = 0
        for (let i = 0; i < buf.length; i++) { const v = (buf[i] - 128) / 128; sum += v * v }
        setLevel(Math.min(1, Math.sqrt(sum / buf.length) * 4.2))
      }
      raf.current = requestAnimationFrame(loop)
      setStatus('ok')
    } catch (e) {
      setStatus(e?.name === 'NotFoundError' ? 'missing' : 'blocked')
    }
  }, [stop])

  useEffect(() => {
    if (autoStart) start(deviceId)
    return stop
  }, [autoStart, deviceId, start, stop])

  return { status, level, devices, label, start, stop }
}
