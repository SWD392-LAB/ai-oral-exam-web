import { Fragment, useCallback, useEffect, useReducer, useRef, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { paths } from '../../app/routes/paths.js'
import { interviewApi } from '../../api/services.js'
import { useMicLevel } from '../../hooks/useMicLevel.js'
import { prefersReducedMotion, useNow } from '../../hooks/useNow.js'
import { useSpeech } from '../../hooks/useSpeech.js'
import { useSpeechRecognition } from '../../hooks/useSpeechRecognition.js'
import { useTimeouts } from '../../hooks/useTimeouts.js'
import { atLeast } from '../../utils/async.js'
import { formatClock, formatTime } from '../../utils/format.js'
import { initialRoom, Phase, roomReducer } from './interviewMachine.js'

const SAVED_MS = 1200 // "Answer saved" stays at least this long before the room moves on
const DONE_MS = 1800
const TURN_MS = 950
const sr = { position: 'absolute', width: '1px', height: '1px', overflow: 'hidden', clip: 'rect(0 0 0 0)', whiteSpace: 'nowrap' }
const lowerFirst = (t) => (t ? t[0].toLowerCase() + t.slice(1) : '')
const words = (t) => (t ? t.split(/\s+/).filter(Boolean) : [])

// FE-INT-01..05: the student's exam room. Typed answers (M1) where the browser cannot transcribe speech.
export default function InterviewRoomPage() {
  const { attemptId } = useParams()
  const navigate = useNavigate()
  const [room, dispatch] = useReducer(roomReducer, initialRoom)
  const now = useNow(500)
  const mic = useMicLevel()
  const stt = useSpeechRecognition()
  const voiceMode = stt.supported && !stt.error && import.meta.env.VITE_ANSWER_INPUT !== 'text'
  const { speak, cancel } = useSpeech()
  const { later } = useTimeouts()
  const [readIdx, setReadIdx] = useState(-1)
  const [typed, setTyped] = useState('')
  const [lastAnswer, setLastAnswer] = useState('')
  const [error, setError] = useState(null)
  const typedRef = useRef(null)

  const { phase, attempt } = room
  const cur = attempt?.current
  const session = attempt?.session
  const limit = session?.timeLimitSeconds ?? 90
  const questionKey = cur ? `${cur.questionIndex}-${cur.followUpNumber}` : ''

  useEffect(() => {
    interviewApi.get(attemptId).then((a) => dispatch({ type: 'LOADED', attempt: a })).catch((e) => setError(e.message))
  }, [attemptId])

  // QUESTION: read the question aloud; the answer clock starts when the reading ends
  useEffect(() => {
    if (phase !== Phase.QUESTION || !cur) return undefined
    setReadIdx(0)
    setLastAnswer('')
    speak(cur.text, { onWord: setReadIdx, onEnd: () => dispatch({ type: 'READ_DONE', at: Date.now() }) })
    return cancel
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [phase, questionKey])

  // LISTENING: start the transcript, or put the cursor in the answer box
  useEffect(() => {
    if (phase !== Phase.LISTENING) return
    setTyped('')
    if (voiceMode) stt.start()
    else typedRef.current?.focus()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [phase, questionKey])

  const submit = useCallback(async () => {
    if (phase !== Phase.LISTENING) return
    const text = voiceMode ? stt.stop() : typed.trim()
    const seconds = Math.min(limit, Math.max(0, Math.round((Date.now() - room.answerStartedAt) / 1000)))
    setLastAnswer(text)
    dispatch({ type: 'SUBMIT', seconds })
    try {
      const res = await atLeast(interviewApi.submit(attemptId, text, seconds), SAVED_MS)
      dispatch({ type: 'OUTCOME', outcome: res.outcome, attempt: res.state })
    } catch (e) {
      setError(e.message)
      dispatch({ type: 'FAILED' })
    }
  }, [phase, voiceMode, stt, typed, limit, room.answerStartedAt, attemptId])

  const left = phase === Phase.LISTENING
    ? Math.max(0, limit - Math.floor((now - room.answerStartedAt) / 1000))
    : phase === Phase.PROCESSING || phase === Phase.QUESTION_DONE ? Math.max(0, limit - (room.answerSeconds ?? 0)) : limit

  // the clock runs out: the answer is submitted automatically
  useEffect(() => { if (phase === Phase.LISTENING && left === 0) submit() }, [phase, left, submit])

  // the session window ends: save what was said, the server closes the attempt
  const sessionOver = !!session && now >= new Date(session.endAt).getTime()
  useEffect(() => {
    if (!sessionOver) return
    if (phase === Phase.LISTENING) submit()
    else if (phase === Phase.QUESTION) { cancel(); interviewApi.get(attemptId).then((a) => dispatch({ type: 'LOADED', attempt: a })) }
  }, [sessionOver, phase, submit, cancel, attemptId])

  useEffect(() => {
    if (phase === Phase.QUESTION_DONE) later(() => dispatch({ type: 'QUESTION_DONE_SHOWN' }), DONE_MS)
    if (phase === Phase.TURN) later(() => dispatch({ type: 'TURN_DONE' }), prefersReducedMotion() ? 450 : TURN_MS)
    if (phase === Phase.COMPLETED) later(() => navigate(paths.attemptDone(attemptId), { replace: true }), lastAnswer ? 900 : 0)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [phase])

  // leaving mid-exam asks first; the attempt cannot be restarted
  useEffect(() => {
    if (phase === Phase.COMPLETED || phase === Phase.WAITING) return undefined
    const warn = (e) => { e.preventDefault(); e.returnValue = '' }
    window.addEventListener('beforeunload', warn)
    return () => window.removeEventListener('beforeunload', warn)
  }, [phase])

  if (!attempt) {
    return (
      <div className="pg-interviewroom" style={{ minHeight: '100vh', display: 'grid', placeItems: 'center', padding: '0 20px', textAlign: 'center' }}>
        <p role={error ? 'alert' : 'status'} style={{ fontSize: '16.5px', color: error ? 'var(--ember-text)' : 'var(--ivory-2)' }}>{error ?? 'Opening your exam…'}</p>
      </div>
    )
  }

  const listening = phase === Phase.LISTENING
  const deciding = phase === Phase.PROCESSING || phase === Phase.QUESTION_DONE
  const turning = phase === Phase.TURN
  const total = session.questionCount
  const maxFu = session.maxFollowUps
  const qIndex = cur?.questionIndex ?? total - 1
  const fu = cur?.followUpNumber ?? 0
  const next = room.next?.current
  const isLast = !!cur && qIndex === total - 1 && fu === maxFu

  // question faces: two during the turn so each keeps its element
  const qFace = (c, mode, cls) => {
    const ws = words(c.text)
    return {
      cls, hidden: cls === 'a-turn-out' ? 'true' : 'false',
      words: ws.map((w, i) => {
        const sp = i < ws.length - 1 ? ' ' : ''
        if (mode === 'unread') return { w, sp, cls: '', c: 'var(--ivory)', o: 0.5 }
        if (mode === 'read') return { w, sp, cls: '', c: 'var(--ivory)', o: 1 }
        if (i === readIdx) return { w, sp, cls: '', c: 'var(--lantern-gold)', o: 1 }
        if (i < readIdx) return { w, sp, cls: 'a-read', c: 'var(--ivory)', o: 1 }
        return { w, sp, cls: '', c: 'var(--ivory)', o: 0.5 }
      }),
      ctxLead: c.type === 'FollowUp' ? `About question ${c.questionIndex + 1}:` : `Question ${c.questionIndex + 1} of ${total}`,
      ctx: c.type === 'FollowUp' ? lowerFirst(c.mainText) : '',
    }
  }
  const said = (text, live, tail) => {
    const a = words(text), b = words(tail)
    const all = a.concat(b)
    return all.map((w, i) => ({ w, sp: i < all.length - 1 ? ' ' : '', c: live && (b.length ? i >= a.length : i >= all.length - 3) ? 'var(--ivory-3)' : 'var(--ivory)' }))
  }
  let qFaces, tFaces
  if (turning && next) {
    qFaces = [qFace(cur, 'read', 'a-turn-out'), qFace(next, 'unread', 'a-turn-in')]
    tFaces = [{ cls: 'a-turn-out', hidden: 'true', said: said(lastAnswer), ell: false, empty: !lastAnswer }, { cls: 'a-turn-in', hidden: 'false', said: [], ell: false, empty: true }]
  } else if (cur) {
    qFaces = [qFace(cur, phase === Phase.QUESTION ? 'live' : 'read', '')]
    let t = { said: [], ell: false, empty: true }
    if (listening && voiceMode) { const s = said(stt.finalText, true, stt.interimText); t = { said: s, ell: s.length > 0, empty: s.length === 0 } }
    else if (deciding || phase === Phase.COMPLETED) t = { said: said(lastAnswer), ell: false, empty: !lastAnswer }
    tFaces = [{ cls: '', hidden: 'false', ...t }]
  } else {
    qFaces = []
    tFaces = [{ cls: '', hidden: 'false', said: said(lastAnswer), ell: false, empty: !lastAnswer }]
  }

  // header progress
  const nodes = Array.from({ length: total }, (_, i) => {
    const num = i + 1
    const done = i < qIndex, nowQ = i === qIndex, nextQ = i > qIndex
    return {
      num, done, now: nowQ, next: nextQ, conn: num > 1, label: `Question ${num}`,
      current: nowQ ? 'step' : 'false', liCls: nextQ ? 'a-hide-sm' : '',
      sr: done ? `Question ${num}, answered` : nextQ ? `Question ${num}, upcoming` : fu ? `, follow-up ${fu} of ${maxFu}, now` : ', now',
    }
  })
  const pips = Array.from({ length: maxFu }, (_, k) => {
    const n = k + 1
    const saved = n < fu || (n === fu && deciding)
    const inProgress = n === fu && !saved
    return { empty: !saved && !inProgress, crescent: inProgress, full: saved, fullCls: n === fu && phase === Phase.PROCESSING ? 'a-moon-fill' : '' }
  })

  // state panel
  let stateTitle = voiceMode ? 'Recording' : 'Your answer'
  let stateSub = voiceMode ? 'AIVES is listening to your answer.' : 'Type your answer, then select Finish answer.'
  let icon = 'rec'
  if (phase === Phase.QUESTION) { stateTitle = 'AIVES is reading'; stateSub = 'Your answer time starts after the question.'; icon = 'read' }
  if (phase === Phase.PROCESSING) { stateTitle = 'Answer saved'; stateSub = 'Your transcript is saved. AIVES is checking your answer.'; icon = 'saved' }
  if (phase === Phase.QUESTION_DONE) {
    const answeredFu = (room.next?.answered?.[qIndex]?.turns ?? []).filter((t) => t.type === 'FollowUp').length
    stateTitle = `Question ${qIndex + 1} complete`
    stateSub = `${answeredFu === 0 ? '' : answeredFu === 1 ? 'The follow-up is answered. ' : 'Both follow-ups are answered. '}Question ${(next?.questionIndex ?? qIndex) + 1} is next.`
    icon = 'saved'
  }
  if (turning && next) {
    if (next.type === 'FollowUp') { stateTitle = `Follow-up ${next.followUpNumber} of ${maxFu}`; stateSub = 'AIVES has a follow-up question.' }
    else { stateTitle = `Question ${next.questionIndex + 1}`; stateSub = 'AIVES reads the next question.' }
    icon = 'read'
  }
  if (phase === Phase.COMPLETED) { stateTitle = 'Answers submitted'; stateSub = 'Your transcript is saved.'; icon = 'saved' }
  if (isLast && listening) stateSub = `Question ${total} · follow‑up ${maxFu} of ${maxFu} · your last answer`

  // timer
  const sec = left
  const warn = listening && sec <= 8
  const mm = Math.floor(sec / 60), ss = sec % 60, tens = Math.floor(ss / 10), ones = ss % 10
  const tick = (v) => (listening ? (v % 2 ? 'a-tick-a' : 'a-tick-b') : '')
  const timerLabel = listening ? 'Time left' : deciding ? 'Stopped' : 'Not started'
  const clockSr = (listening ? '' : `${timerLabel}. `) + (mm ? `${mm} minute ` : '') + `${ss} seconds ` + (listening ? 'left' : 'on the clock')

  // microphone: alive only while the student answers
  const level = listening ? mic.level : 0.04
  const lit = Math.round(level * 18)
  const meter = Array.from({ length: 18 }, (_, i) => ({ h: (5 + i * 0.75).toFixed(2) + 'px', bg: i < lit ? 'var(--ivory)' : 'rgba(246,241,231,0.18)' }))
  const voiceO = listening ? (0.55 + 0.45 * level).toFixed(3) : 0
  const voiceS = (0.88 + 0.24 * (listening ? level : 0)).toFixed(3)

  // earlier in this question
  const earlierTurns = (attempt.answered?.[qIndex]?.turns ?? [])
  const earlier = []
  let fuCount = 0
  for (const t of earlierTurns) {
    if (t.type === 'Main') {
      earlier.push({ who: `Question ${qIndex + 1}`, what: 'read aloud', spoke: true })
      earlier.push({ who: 'Your answer', what: `${t.durationSeconds} s of ${limit} s`, said: true })
    } else {
      fuCount += 1
      earlier.push({ who: `Follow-up ${fuCount}`, what: `${t.durationSeconds} s of ${limit} s`, said: true, cls: 'a-rise' })
    }
  }
  if (!earlier.length) earlier.push({ who: `Question ${qIndex + 1}`, what: phase === Phase.QUESTION ? 'being read aloud' : 'read aloud', spoke: true })

  const minsLeft = Math.max(0, Math.ceil((new Date(session.endAt) - now) / 60000))
  const finishOff = listening ? 'false' : 'true'

  return (
    <div className="pg-interviewroom" style={{ position: 'relative', minHeight: '100vh', display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
      <div aria-hidden="true" style={{ position: 'absolute', inset: '0', pointerEvents: 'none', zIndex: '0' }}>
        <div className="a-light" style={{ left: '6%', top: '60px', width: '760px', height: '420px', opacity: phase === Phase.QUESTION ? 1 : listening ? 0.12 : 0 }}>
          <div className="a-light-ai" style={{ position: 'absolute', inset: '0', borderRadius: '50%', background: 'radial-gradient(closest-side, rgba(245,183,0,0.22), rgba(214,120,30,0.08) 55%, rgba(214,120,30,0) 100%)' }} />
        </div>
        <div className="a-light" style={{ left: '12%', top: '40px', width: '900px', height: '640px', opacity: phase === Phase.PROCESSING ? 0.85 : phase === Phase.QUESTION_DONE ? 0.45 : 0 }}>
          <div className="a-candle" style={{ position: 'absolute', inset: '0', borderRadius: '50%', background: 'radial-gradient(closest-side, rgba(245,183,0,0.30), rgba(220,120,36,0.16) 50%, rgba(220,120,36,0) 100%)' }} />
        </div>
        {turning && (
          <div className="a-light a-flare" style={{ left: '12%', top: '40px', width: '900px', height: '640px', background: 'radial-gradient(closest-side, rgba(245,183,0,0.30), rgba(220,120,36,0.16) 50%, rgba(220,120,36,0) 100%)' }} />
        )}
      </div>
      <header className="a-top a-gutter" style={{ position: 'relative', zIndex: '2', height: '76px', padding: '0 64px', display: 'flex', alignItems: 'center', gap: '40px', borderBottom: '1px solid var(--night-line)' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '18px', minWidth: '0' }}>
          <span style={{ fontSize: '19px', fontWeight: '600', letterSpacing: '0.06em', color: 'var(--ivory)' }}>AIVES</span>
          <span aria-hidden="true" className="a-hide-sm" style={{ width: '1px', height: '22px', background: 'var(--night-line)' }} />
          <span className="a-hide-sm" style={{ display: 'flex', alignItems: 'baseline', gap: '10px', fontSize: '15px', whiteSpace: 'nowrap' }}>
            <span style={{ fontWeight: '400' }}>{session.title}</span>
            <span style={{ color: 'var(--jade)', fontWeight: '400', letterSpacing: '0.02em' }}>{session.courseCode}</span>
          </span>
        </div>
        <ol aria-label={`Exam progress, ${total} questions`} style={{ margin: '0 auto', display: 'flex', alignItems: 'center', fontSize: '14px' }}>
          {nodes.map((n) => (
            <li key={n.num} className={n.liCls} aria-current={n.current} style={{ display: 'flex', alignItems: 'center', whiteSpace: 'nowrap' }}>
              {n.conn && <span aria-hidden="true" style={{ width: 'clamp(14px, 2.8vw, 40px)', height: '1px', margin: '0 clamp(6px, 0.84vw, 12px)', background: 'rgba(246,241,231,0.22)' }} />}
              {n.done && (
                <span aria-hidden="true" style={{ flex: 'none', width: '24px', height: '24px', borderRadius: '50%', background: 'var(--ivory)', display: 'grid', placeItems: 'center' }}>
                  <svg width="13" height="13" viewBox="0 0 12 12" style={{ fill: 'none', stroke: 'var(--night-indigo)', strokeWidth: '2', strokeLinecap: 'round', strokeLinejoin: 'round' }}>
                    <path d="M2.5 6.3 5 8.6 9.6 3.6" />
                  </svg>
                </span>
              )}
              {n.now && (
                <span style={{ display: 'flex', alignItems: 'center', gap: '9px' }}>
                  <span aria-hidden="true" style={{ flex: 'none', width: '24px', height: '24px', borderRadius: '50%', background: 'var(--lantern-gold)', color: 'var(--night-indigo)', display: 'grid', placeItems: 'center', fontSize: '12px', fontWeight: '600' }}>{n.num}</span>
                  <span style={{ fontWeight: '500', color: 'var(--ivory)' }}>
                    {n.label}
                    <span className="a-show-sm" style={{ fontWeight: '400', color: 'var(--ivory-2)' }}>{' '}of {total}</span>
                  </span>
                  <span style={{ display: 'inline-flex', alignItems: 'center', gap: '8px', marginLeft: '6px', paddingLeft: '12px', borderLeft: '1px solid var(--night-line)', color: 'var(--ivory-2)' }}>
                    <span aria-hidden="true" style={{ display: 'inline-flex', alignItems: 'center', gap: '4px' }}>
                      {pips.map((pp, i) => (
                        <Fragment key={i}>
                          {pp.empty && <span style={{ flex: 'none', width: '8px', height: '8px', borderRadius: '50%', border: '1.25px solid var(--ivory-3)' }} />}
                          {pp.crescent && (
                            <svg className="a-pop" width="8" height="8" viewBox="0 0 8 8" aria-hidden="true" style={{ flex: 'none', display: 'block' }}>
                              <circle cx="4" cy="4" r="3.375" style={{ fill: 'none', stroke: 'var(--ivory-3)', strokeWidth: '1.25' }} />
                              <path d="M2.161 1.022A3.5 3.5 0 1 1 2.161 6.978A3 3 0 0 0 2.161 1.022z" style={{ fill: 'var(--ivory)' }} />
                            </svg>
                          )}
                          {pp.full && <span className={pp.fullCls} style={{ flex: 'none', width: '8px', height: '8px', borderRadius: '50%', border: '1.25px solid var(--ivory)', background: 'var(--ivory)' }} />}
                        </Fragment>
                      ))}
                    </span>
                    <span className="a-hide-sm">{fu ? <>Follow-up{' '}{fu}{' '}of {maxFu}</> : 'Main question'}</span>
                  </span>
                </span>
              )}
              {n.next && (
                <span aria-hidden="true" style={{ flex: 'none', width: '24px', height: '24px', borderRadius: '50%', border: '1.5px solid var(--night-edge)', display: 'grid', placeItems: 'center', fontSize: '12px', fontWeight: '500', color: 'var(--ivory-2)' }}>{n.num}</span>
              )}
              <span style={sr}>{n.sr}</span>
            </li>
          ))}
        </ol>
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px', fontSize: '14px', color: 'var(--ivory-2)', whiteSpace: 'nowrap' }}>
          <svg width="17" height="17" viewBox="0 0 20 20" aria-hidden="true" style={{ flex: 'none', fill: 'none', stroke: 'var(--jade)', strokeWidth: '1.6', strokeLinecap: 'round' }}>
            <circle cx="10" cy="10" r="7.6" />
            <path d="M10 5.6V10l2.9 1.9" />
          </svg>
          <span className="a-hide-sm">Closes at {formatTime(session.endAt)}</span>
          <span style={{ fontWeight: '500', color: 'var(--ivory)' }}>{minsLeft} min left</span>
        </div>
      </header>
      <main className="a-gutter a-grid-1-sm a-exam-sm" style={{ position: 'relative', zIndex: '1', flex: '1', display: 'grid', gridTemplateColumns: 'minmax(0, 1fr) 352px', gridTemplateRows: 'auto auto', alignContent: 'start', columnGap: '72px', rowGap: '40px', padding: '0 64px 56px' }}>
        <section aria-label="Current question" className="a-turn-stage" style={{ position: 'relative', minWidth: '0', display: 'grid', marginLeft: 'calc(-1 * clamp(20px, 4.45vw, 64px))', paddingLeft: 'clamp(20px, 4.45vw, 64px)' }}>
          {turning && cur && (
            <div className="a-silhouette a-question" aria-hidden="true" style={{ position: 'absolute', left: 'clamp(20px, 4.45vw, 64px)', top: 'clamp(28px, 4.9vw, 70px)', maxWidth: '920px', fontFamily: 'Alegreya, Georgia, serif', fontWeight: '500', fontSize: '60px', lineHeight: '1.12', letterSpacing: '-0.014em', textWrap: 'balance' }}>
              {cur.text}
            </div>
          )}
          {qFaces.map((f, i) => (
            <div key={`${questionKey}-${i}-${f.cls}`} className={`a-qpad ${f.cls}`} aria-hidden={f.hidden} style={{ gridArea: '1 / 1', display: 'flex', flexDirection: 'column', padding: 'clamp(28px, 4.9vw, 70px) 8px 8px 0' }}>
              <h1 className="a-question" style={{ fontFamily: 'Alegreya, Georgia, serif', fontWeight: '500', fontSize: '60px', lineHeight: '1.12', letterSpacing: '-0.014em', maxWidth: '920px', textWrap: 'balance', color: 'var(--ivory)' }}>
                {f.words.map((w, wi) => (
                  <Fragment key={wi}>
                    <span className={w.cls} style={{ color: w.c, opacity: w.o }}>{w.w}</span>
                    {w.sp}
                  </Fragment>
                ))}
              </h1>
              <p className="a-ctx-sm" style={{ marginTop: '26px', maxWidth: '760px', fontSize: '16.5px', lineHeight: '1.5', fontWeight: '300', color: 'var(--jade)' }}>
                <span style={{ fontWeight: '500' }}>{f.ctxLead}</span>
                {f.ctx && <>{' '}{f.ctx}</>}
              </p>
            </div>
          ))}
        </section>
        <aside aria-label="Answer controls" className="a-aside-sm" style={{ position: 'relative', minWidth: '0', paddingTop: 'clamp(4px, 4.6vw, 66px)', display: 'flex', flexDirection: 'column' }}>
          <div style={{ display: 'grid', gridTemplateColumns: '26px minmax(0, 1fr)', columnGap: '12px', minHeight: '64px' }}>
            <div style={{ width: '26px', height: '26px', marginTop: '3px' }}>
              {icon === 'read' && (
                <svg key="read" className="a-pop" width="26" height="26" viewBox="0 0 26 26" aria-hidden="true" style={{ display: 'block', fill: 'none', stroke: 'var(--lantern-gold)', strokeWidth: '1.7', strokeLinecap: 'round', strokeLinejoin: 'round' }}>
                  <path d="M4 10.2h3.6L12.4 6v14l-4.8-4.2H4z" />
                  <path d="M16.4 9.6a5 5 0 0 1 0 6.8" />
                  <path d="M19.4 6.8a9 9 0 0 1 0 12.4" />
                </svg>
              )}
              {icon === 'rec' && (
                <svg key="rec" className="a-pop" width="26" height="26" viewBox="0 0 26 26" aria-hidden="true" style={{ display: 'block' }}>
                  <circle cx="13" cy="13" r="10" style={{ fill: 'none', stroke: 'var(--lantern-red)', strokeWidth: '1.7' }} />
                  <circle className="a-rec" cx="13" cy="13" r="6.4" style={{ fill: 'var(--lantern-red)' }} />
                </svg>
              )}
              {icon === 'saved' && (
                <svg key="saved" className="a-pop" width="26" height="26" viewBox="0 0 26 26" aria-hidden="true" style={{ display: 'block', fill: 'none', stroke: 'var(--jade)', strokeWidth: '1.8', strokeLinecap: 'round', strokeLinejoin: 'round' }}>
                  <circle cx="13" cy="13" r="10" />
                  <path d="M8.6 13.3l3 3 5.8-6.2" />
                </svg>
              )}
            </div>
            <div role="status" style={{ minWidth: '0' }}>
              <div key={stateTitle + stateSub}>
                <div className="a-rise" style={{ fontSize: '24px', fontWeight: '500', lineHeight: '1.3', letterSpacing: '-0.005em', color: 'var(--ivory)' }}>{stateTitle}</div>
                <div className="a-rise" style={{ marginTop: '2px', fontSize: '15px', lineHeight: '1.45', textWrap: 'balance', color: 'var(--ivory-2)' }}>{stateSub}</div>
              </div>
            </div>
          </div>
          <div role="timer" aria-label="Answer time" className="a-timer-sm" style={{ marginTop: '26px' }}>
            <div className="a-clock a-num" aria-hidden="true" style={{ display: 'flex', alignItems: 'baseline', fontSize: '128px', fontWeight: '200', lineHeight: '0.92', letterSpacing: '-0.02em', color: warn ? 'var(--ember-text)' : 'var(--ivory)', opacity: listening ? 1 : 0.5, transition: 'opacity .3s ease-out, color .2s ease-out' }}>
              <span style={{ display: 'inline-block', width: '0.6em', textAlign: 'center' }}><span className={tick(mm)}>{mm}</span></span>
              <span style={{ display: 'inline-block', width: '0.3em', textAlign: 'center', transform: 'translateY(-0.06em)' }}>:</span>
              <span style={{ display: 'inline-block', width: '0.6em', textAlign: 'center' }}><span className={tick(tens)}>{tens}</span></span>
              <span style={{ display: 'inline-block', width: '0.6em', textAlign: 'center' }}><span className={tick(ones)}>{ones}</span></span>
            </div>
            <span style={sr}>{clockSr}</span>
            {!warn && (
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: '12px', marginTop: '16px', fontSize: '14px', color: 'var(--ivory-2)' }}>
                <span>{timerLabel}</span>
                <span>
                  of{' '}
                  <span style={{ fontWeight: '500', color: 'var(--ivory)' }}>{formatClock(limit)}</span>
                  {' '}per answer
                </span>
              </div>
            )}
            {warn && (
              <p className="a-rise" style={{ display: 'flex', alignItems: 'center', gap: '8px', marginTop: '16px', fontSize: '14px', fontWeight: '500', color: 'var(--ember-text)' }}>
                <svg width="16" height="16" viewBox="0 0 24 24" aria-hidden="true" style={{ flex: 'none', fill: 'none', stroke: 'var(--ember-text)', strokeWidth: '1.9', strokeLinecap: 'round', strokeLinejoin: 'round' }}>
                  <path d="M12 4 21 19.5H3z" />
                  <path d="M12 10v4.5" />
                  <path d="M12 17.2v.01" />
                </svg>
                {sec} seconds left · finish your sentence
              </p>
            )}
            <div aria-hidden="true" style={{ marginTop: '10px', height: '3px', borderRadius: '3px', background: 'rgba(246,241,231,0.14)', overflow: 'hidden' }}>
              <div style={{ height: '100%', borderRadius: '3px', background: warn ? 'var(--lantern-red)' : 'var(--ivory)', transformOrigin: '0 50%', transform: `scaleX(${(sec / limit).toFixed(3)})`, transition: 'transform .4s cubic-bezier(0.25,1,0.5,1)' }} />
            </div>
          </div>
          <button type="button" className="a-btn a-btn-primary a-finish-sm" aria-disabled={finishOff} onClick={submit} style={{ marginTop: '30px', height: '62px', width: '100%', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: '12px', border: '0', borderRadius: '14px', background: 'var(--ivory)', color: 'var(--night-indigo)', fontSize: '18px', fontWeight: '500', boxShadow: '0 10px 28px -12px rgba(0,0,0,0.55)' }}>
            {deciding ? (
              <svg className="a-pop" width="18" height="18" viewBox="0 0 18 18" aria-hidden="true" style={{ flex: 'none', fill: 'none', stroke: 'currentColor', strokeWidth: '2', strokeLinecap: 'round', strokeLinejoin: 'round' }}>
                <path d="M3.8 9.4l3.4 3.3 7-7.4" />
              </svg>
            ) : (
              <svg width="18" height="18" viewBox="0 0 18 18" aria-hidden="true" style={{ flex: 'none' }}>
                <rect x="3.5" y="3.5" width="11" height="11" rx="2.2" style={{ fill: 'currentColor' }} />
              </svg>
            )}
            <span>{deciding ? 'Answer saved' : isLast ? 'Finish answer and submit' : 'Finish answer'}</span>
          </button>
          {error && <p role="alert" className="a-rise" style={{ marginTop: '14px', fontSize: '14px', lineHeight: '1.5', color: 'var(--ember-text)' }}>{error} Your answer is still here; select Finish answer to try again.</p>}
          <div className="a-mic-sm" style={{ marginTop: '26px', display: 'grid', gridTemplateColumns: '20px minmax(0, 1fr) auto', alignItems: 'center', columnGap: '12px', fontSize: '14.5px', color: 'var(--ivory-2)' }}>
            <svg width="20" height="20" viewBox="0 0 20 20" aria-hidden="true" style={{ fill: 'none', stroke: 'currentColor', strokeWidth: '1.6', strokeLinecap: 'round' }}>
              <rect x="7" y="2.5" width="6" height="10" rx="3" />
              <path d="M4.5 9.5a5.5 5.5 0 0 0 11 0M10 15v2.5" />
            </svg>
            <span style={{ minWidth: '0', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{mic.status === 'ok' ? mic.label : mic.status === 'checking' || mic.status === 'idle' ? 'Checking the microphone' : 'Microphone unavailable'}</span>
            <span aria-hidden="true" style={{ display: 'flex', alignItems: 'flex-end', gap: '3px', height: '18px' }}>
              {meter.map((b, i) => <span key={i} style={{ width: '3px', height: b.h, borderRadius: '2px', background: b.bg }} />)}
            </span>
          </div>
        </aside>
        <section aria-labelledby="answer-h" style={{ position: 'relative', minWidth: '0', maxWidth: '820px', marginTop: 'clamp(0px, min(calc(100vh - 880px), calc(100vw - 1000px)), 96px)' }}>
          <div className="a-light a-voice-live" aria-hidden="true" style={{ left: 'calc(45% - 490px)', bottom: '-500px', width: '980px', height: '760px', opacity: voiceO, transform: `scale(${voiceS})`, transition: 'transform .125s linear, opacity .3s ease-out' }}>
            <div style={{ position: 'absolute', inset: '0', borderRadius: '50%', background: 'radial-gradient(closest-side, rgba(245,170,20,0.34), rgba(232,69,44,0.26) 38%, rgba(232,69,44,0.08) 70%, rgba(232,69,44,0) 100%)' }} />
          </div>
          <div style={{ position: 'relative', display: 'flex', alignItems: 'center', gap: '14px', marginBottom: '14px' }}>
            <h2 id="answer-h" style={{ fontSize: '15px', fontWeight: '500', color: 'var(--ivory-2)' }}>Your answer</h2>
            {listening && (
              <span className="a-rise" style={{ display: 'inline-flex', alignItems: 'center', gap: '7px', fontSize: '13px', color: 'var(--ivory-2)' }}>
                <span aria-hidden="true" style={{ width: '7px', height: '7px', borderRadius: '50%', background: 'var(--lantern-red)' }} />
                {voiceMode ? 'Live transcript' : 'Typed answer'}
              </span>
            )}
          </div>
          <div className="a-turn-stage" style={{ position: 'relative', display: 'grid', marginLeft: 'calc(-1 * clamp(20px, 4.45vw, 64px))', paddingLeft: 'clamp(20px, 4.45vw, 64px)' }}>
            {listening && !voiceMode ? (
              <textarea
                ref={typedRef}
                className="a-transcript"
                aria-labelledby="answer-h"
                value={typed}
                onChange={(e) => setTyped(e.target.value)}
                placeholder="Type your answer here."
                rows={4}
                style={{ gridArea: '1 / 1', width: '100%', resize: 'none', border: '0', padding: '0', background: 'transparent', fontSize: '23px', lineHeight: '1.56', fontWeight: '300', minHeight: '144px', color: 'var(--ivory)' }}
              />
            ) : (
              tFaces.map((f, i) => (
                <p key={`${questionKey}-${i}-${f.cls}`} className={`a-transcript ${f.cls}`} aria-live="off" aria-hidden={f.hidden} style={{ gridArea: '1 / 1', display: 'block', fontSize: '23px', lineHeight: '1.56', fontWeight: '300', minHeight: '144px', color: 'var(--ivory)' }}>
                  {f.said.map((s, si) => (
                    <Fragment key={si}>
                      <span className="a-word" style={{ color: s.c }}>{s.w}</span>
                      {s.sp}
                    </Fragment>
                  ))}
                  {f.ell && <span style={{ color: 'var(--ivory-3)' }}>…</span>}
                  {f.empty && <span style={{ color: 'var(--ivory-3)' }}>{voiceMode ? 'Your words appear here as you speak.' : 'You type your answer here once the question has been read.'}</span>}
                </p>
              ))
            )}
          </div>
        </section>
        <section aria-labelledby="earlier-h" className="a-earlier-sm" style={{ position: 'relative', minWidth: '0', gridRow: '2', gridColumn: '2', alignSelf: 'start', marginTop: '0', paddingTop: '22px', borderTop: '1px solid var(--night-line)' }}>
          <h2 id="earlier-h" style={{ marginBottom: '12px', fontSize: '14px', fontWeight: '500', color: 'var(--ivory-2)' }}>Earlier in this question</h2>
          <ul style={{ display: 'grid', gap: '10px' }}>
            {earlier.map((e, i) => (
              <li key={i} className={e.cls ?? ''} style={{ display: 'grid', gridTemplateColumns: '18px minmax(0, 1fr)', columnGap: '12px', alignItems: 'center', fontSize: '14.5px', color: 'var(--ivory-2)' }}>
                {e.spoke ? (
                  <svg width="17" height="17" viewBox="0 0 18 18" aria-hidden="true" style={{ fill: 'none', stroke: 'var(--jade)', strokeWidth: '1.5', strokeLinecap: 'round', strokeLinejoin: 'round' }}>
                    <path d="M2.5 7h2.8l3.9-3.3v10.6L5.3 11H2.5z" />
                    <path d="M12.3 6.6a3.6 3.6 0 0 1 0 4.8" />
                  </svg>
                ) : (
                  <svg width="17" height="17" viewBox="0 0 18 18" aria-hidden="true" style={{ fill: 'none', stroke: 'var(--jade)', strokeWidth: '1.5', strokeLinecap: 'round' }}>
                    <rect x="6.3" y="2" width="5.4" height="9" rx="2.7" />
                    <path d="M4 8.5a5 5 0 0 0 10 0M9 13.5V16" />
                  </svg>
                )}
                <span>
                  <span style={{ fontWeight: '400', color: 'var(--ivory)' }}>{e.who}</span>
                  {' '}·{' '}{e.what}
                </span>
              </li>
            ))}
          </ul>
        </section>
      </main>
    </div>
  )
}
