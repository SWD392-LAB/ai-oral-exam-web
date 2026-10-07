import { Fragment, useEffect, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { paths } from '../../app/routes/paths.js'
import { interviewApi } from '../../api/services.js'
import { useLoad } from '../../hooks/useLoad.js'
import { useMicLevel } from '../../hooks/useMicLevel.js'
import { useNow } from '../../hooks/useNow.js'
import { useSpeech } from '../../hooks/useSpeech.js'
import { formatDay, formatTime } from '../../utils/format.js'
import './ExamLobby.css'

const SAMPLE = 'This is how AIVES reads each question aloud, one word at a time.'
const BARS = 36
const HEAR_LEVEL = 0.14
const HEAR_MS = 700

const sr = { position: 'absolute', width: '1px', height: '1px', overflow: 'hidden', clip: 'rect(0 0 0 0)' }

export default function ExamLobbyPage() {
  const { sessionId } = useParams()
  const navigate = useNavigate()
  const now = useNow(1000)
  const { data: session } = useLoad(() => interviewApi.mySession(sessionId), [sessionId])
  const [deviceId, setDeviceId] = useState(undefined)
  const mic = useMicLevel({ deviceId })
  const [history, setHistory] = useState(() => Array(BARS).fill(0))
  const [heardFor, setHeardFor] = useState(0)
  const { speak, cancel } = useSpeech()
  const [sample, setSample] = useState({ shown: false, playing: false, idx: -1 })
  const [starting, setStarting] = useState(false)
  const [startError, setStartError] = useState(null)

  // the meter scrolls: each new level enters on the right
  useEffect(() => {
    if (mic.status !== 'ok') return
    setHistory((h) => [...h.slice(1), mic.level])
    setHeardFor((ms) => (mic.level > HEAR_LEVEL ? ms + 125 : ms))
  }, [mic.level, mic.status])

  useEffect(() => cancel, [cancel])

  const ok = mic.status === 'ok'
  const heard = ok && heardFor >= HEAR_MS
  const listening = ok && !heard
  const checking = mic.status === 'checking' || mic.status === 'idle'
  const blocked = mic.status === 'blocked' || mic.status === 'missing'
  const titles = { ok: heard ? 'We can hear you' : 'Listening', blocked: 'AIVES cannot hear you', checking: 'Checking access' }
  const access = ok ? 'ok' : blocked ? 'blocked' : 'checking'
  const deviceName = mic.devices.find((d) => d.id === deviceId)?.label ?? mic.label ?? 'Your microphone'
  const subs = {
    ok: heard ? `${deviceName} is ready.` : 'Say a few words, like your name.',
    blocked: mic.status === 'missing' ? 'No microphone was found on this device.' : 'Your browser is blocking the microphone.',
    checking: 'Asking your browser for the microphone.',
  }

  const playSample = () => {
    if (sample.playing) return
    setSample({ shown: true, playing: true, idx: 0 })
    speak(SAMPLE, {
      msPerWord: 170,
      onWord: (i) => setSample((p) => ({ ...p, idx: i })),
      onEnd: () => setSample((p) => ({ ...p, playing: false })),
    })
  }
  const sw = SAMPLE.split(' ')
  const sampleWords = sw.map((w, i) => ({
    w, sp: i < sw.length - 1 ? ' ' : '',
    cls: sample.playing && i < sample.idx ? 'a-read' : '',
    c: sample.playing && i === sample.idx ? 'var(--lantern-gold)' : 'var(--ivory)',
    o: !sample.playing || i <= sample.idx ? 1 : 0.5,
  }))

  const open = session?.phase === 'Open now'
  const taken = !!session?.attempt
  const canStart = heard && open && !taken && !starting
  const start = async () => {
    if (!canStart) return
    setStarting(true)
    setStartError(null)
    try {
      const state = await interviewApi.start(sessionId)
      navigate(paths.attempt(state.attemptId), { replace: true })
    } catch (err) {
      setStartError(err.message)
      setStarting(false)
    }
  }

  let startNote = heard ? 'Starting uses your one attempt. The first question is read aloud right away.' : 'Start opens once AIVES can hear you. Starting uses your one attempt.'
  if (session && taken) startNote = 'You have already used your one attempt for this session.'
  else if (session && !open) startNote = session.phase === 'Closed' ? 'This session has closed.' : `This session opens ${formatDay(session.startAt, now).toLowerCase()} at ${formatTime(session.startAt)}.`

  const minsLeft = session ? Math.max(0, Math.ceil((new Date(session.endAt) - now) / 60000)) : 0
  const day = session ? formatDay(session.startAt, now) : ''
  const dayText = ['Today', 'Tomorrow', 'Yesterday'].includes(day) ? day.toLowerCase() : day
  const qCount = session?.questionCount ?? 0

  return (
    <div className="pg-examlobby" style={{ position: 'relative', minHeight: '100vh', display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
      <div aria-hidden="true" style={{ position: 'absolute', inset: '0', pointerEvents: 'none', zIndex: '0' }}>
        <div style={{ position: 'absolute', inset: '0', opacity: sample.playing ? 1 : 0, transition: 'opacity .8s ease-out' }}>
          <div className="a-light a-light-ai" style={{ left: '-6%', top: '470px', width: '820px', height: '420px', background: 'radial-gradient(closest-side, rgba(245,183,0,0.22), rgba(214,120,30,0.08) 55%, rgba(214,120,30,0) 100%)' }} />
        </div>
      </div>
      <header className="a-top a-gutter" style={{ position: 'relative', zIndex: '2', height: '76px', padding: '0 64px', display: 'flex', alignItems: 'center', gap: '40px', borderBottom: '1px solid var(--night-line)', animation: 'aives-fade .5s ease-out both' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '18px', minWidth: '0' }}>
          <span style={{ fontSize: '19px', fontWeight: '600', letterSpacing: '0.06em' }}>AIVES</span>
          <span aria-hidden="true" className="a-hide-sm" style={{ width: '1px', height: '22px', background: 'var(--night-line)' }} />
          <span className="a-hide-sm" style={{ display: 'flex', alignItems: 'baseline', gap: '10px', fontSize: '15px', whiteSpace: 'nowrap' }}>
            <span style={{ fontWeight: '400' }}>{session?.title}</span>
            <span style={{ color: 'var(--jade)', fontWeight: '400', letterSpacing: '0.02em' }}>{session?.courseCode}</span>
          </span>
        </div>
        <ol className="a-hide-sm" aria-label={`Exam progress, ${qCount} questions, not started`} style={{ margin: '0 auto', display: 'flex', alignItems: 'center', fontSize: '14px' }}>
          {Array.from({ length: qCount }, (_, i) => (
            <Fragment key={i}>
              {i > 0 && <li aria-hidden="true" style={{ width: '40px', height: '1px', margin: '0 12px', background: 'rgba(246,241,231,0.22)' }} />}
              <li style={{ display: 'flex' }}>
                <span aria-hidden="true" style={{ width: '24px', height: '24px', borderRadius: '50%', border: '1.5px solid var(--night-edge)', display: 'grid', placeItems: 'center', fontSize: '12px', fontWeight: '500', color: 'var(--ivory-2)' }}>
                  {i + 1}
                </span>
              </li>
            </Fragment>
          ))}
        </ol>
        <div style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: '10px', fontSize: '14px', color: 'var(--ivory-2)', whiteSpace: 'nowrap' }}>
          <svg width="17" height="17" viewBox="0 0 20 20" aria-hidden="true" style={{ fill: 'none', stroke: 'var(--jade)', strokeWidth: '1.6', strokeLinecap: 'round' }}>
            <circle cx="10" cy="10" r="7.6" />
            <path d="M10 5.6V10l2.9 1.9" />
          </svg>
          {session && <span className="a-hide-sm">Closes at {formatTime(session.endAt)}</span>}
          {session && open && <span style={{ fontWeight: '500', color: 'var(--ivory)' }}>{minsLeft} min left</span>}
        </div>
      </header>
      <main className="a-gutter a-grid-1-sm" style={{ position: 'relative', zIndex: '1', flex: '1', width: '100%', maxWidth: '1440px', margin: '0 auto', display: 'grid', gridTemplateColumns: 'minmax(0, 1fr) 380px', columnGap: '96px', rowGap: '48px', alignContent: 'start', padding: '48px 64px 88px' }}>
        <div className="a-rise" style={{ gridColumn: '1 / -1', minWidth: '0', display: 'flex', flexDirection: 'column' }}>
          <Link className="a-link" to={paths.studentHome} style={{ alignSelf: 'flex-start', display: 'inline-flex', alignItems: 'center', gap: '6px', minHeight: '44px', fontSize: '14px', color: 'var(--ivory-2)' }}>
            <svg width="16" height="16" viewBox="0 0 24 24" aria-hidden="true" style={{ fill: 'none', stroke: 'currentColor', strokeWidth: '1.75', strokeLinecap: 'round', strokeLinejoin: 'round' }}>
              <path d="m15 18-6-6 6-6" />
            </svg>
            Back to my exams
          </Link>
          <h1 id="lobby-title" className="a-display" style={{ marginTop: '20px', fontFamily: 'Alegreya, Georgia, serif', fontWeight: '500', fontSize: '52px', lineHeight: '1.08', letterSpacing: '-0.012em' }}>
            Before you start
          </h1>
          {session && (
            <p style={{ marginTop: '14px', fontSize: '16.5px', lineHeight: '1.5', color: 'var(--ivory-2)' }}>
              {session.title}, {dayText} {formatTime(session.startAt)} to {formatTime(session.endAt)}{' '}
              <span aria-hidden="true" style={{ color: 'var(--night-edge)' }}>·</span>
              {' '}{qCount} questions{' '}
              <span aria-hidden="true" style={{ color: 'var(--night-edge)' }}>·</span>
              {' '}answered by voice
            </p>
          )}
        </div>
        <section aria-labelledby="rules-title" style={{ minWidth: '0' }}>
          <h2 id="rules-title" style={sr}>How this exam works</h2>
          <ul className="a-rise" style={{ maxWidth: '760px', animationDelay: '60ms' }}>
            <li className="a-rule" style={{ display: 'grid', gridTemplateColumns: '22px minmax(0, 1fr)', columnGap: '20px', padding: '22px 0', borderTop: '1px solid var(--night-line)' }}>
              <svg width="22" height="22" viewBox="0 0 24 24" aria-hidden="true" style={{ marginTop: '4px', fill: 'none', stroke: 'var(--ivory-2)', strokeWidth: '1.75', strokeLinecap: 'round', strokeLinejoin: 'round' }}>
                <path d="M15 3h4a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2h-4" />
                <path d="m10 17 5-5-5-5" />
                <path d="M15 12H3" />
              </svg>
              <p className="a-rule-p" style={{ fontSize: '18px', lineHeight: '1.6', color: 'var(--ivory-2)' }}>
                <span style={{ fontWeight: '400', color: 'var(--ivory)' }}>One attempt.</span>
                {' '}Once you start, you cannot restart the exam.
              </p>
            </li>
            <li className="a-rule" style={{ display: 'grid', gridTemplateColumns: '22px minmax(0, 1fr)', columnGap: '20px', padding: '22px 0', borderTop: '1px solid var(--night-line)' }}>
              <svg width="22" height="22" viewBox="0 0 20 20" aria-hidden="true" style={{ marginTop: '4px', fill: 'none', stroke: 'var(--jade)', strokeWidth: '1.6', strokeLinecap: 'round' }}>
                <circle cx="10" cy="10" r="7.6" />
                <path d="M10 5.6V10l2.9 1.9" />
              </svg>
              <p className="a-rule-p" style={{ fontSize: '18px', lineHeight: '1.6', color: 'var(--ivory-2)' }}>
                <span style={{ fontWeight: '400', color: 'var(--ivory)' }}>The session closes at {session ? formatTime(session.endAt) : ''}.</span>
                {' '}If you are still answering then, your attempt stops, and questions you have not reached count as 0.
              </p>
            </li>
            <li className="a-rule" style={{ display: 'grid', gridTemplateColumns: '22px minmax(0, 1fr)', columnGap: '20px', padding: '22px 0', borderTop: '1px solid var(--night-line)' }}>
              <svg width="22" height="22" viewBox="0 0 24 24" aria-hidden="true" style={{ marginTop: '4px', fill: 'none', stroke: 'var(--ivory-2)', strokeWidth: '1.75', strokeLinecap: 'round', strokeLinejoin: 'round' }}>
                <path d="M10 2h4" />
                <path d="M12 14l3-3" />
                <circle cx="12" cy="14" r="8" />
              </svg>
              <p className="a-rule-p" style={{ fontSize: '18px', lineHeight: '1.6', color: 'var(--ivory-2)' }}>
                <span style={{ fontWeight: '400', color: 'var(--ivory)' }}>{session?.timeLimitSeconds ?? 90} seconds per answer,</span>
                {' '}follow-up answers included. The clock is always on screen, and you can finish an answer early.
              </p>
            </li>
            <li className="a-rule" style={{ display: 'grid', gridTemplateColumns: '22px minmax(0, 1fr)', columnGap: '20px', padding: '22px 0', borderTop: '1px solid var(--night-line)' }}>
              <svg width="22" height="22" viewBox="0 0 26 26" aria-hidden="true" style={{ marginTop: '4px', fill: 'none', stroke: sample.playing ? 'var(--lantern-gold)' : 'var(--ivory-2)', strokeWidth: '1.7', strokeLinecap: 'round', strokeLinejoin: 'round', transition: 'stroke .3s ease-out' }}>
                <path d="M4 10.2h3.6L12.4 6v14l-4.8-4.2H4z" />
                <path d="M16.4 9.6a5 5 0 0 1 0 6.8" />
                <path d="M19.4 6.8a9 9 0 0 1 0 12.4" />
              </svg>
              <div style={{ minWidth: '0' }}>
                <p className="a-rule-p" style={{ fontSize: '18px', lineHeight: '1.6', color: 'var(--ivory-2)' }}>
                  <span style={{ fontWeight: '400', color: 'var(--ivory)' }}>Questions are read aloud</span>
                  {' '}and shown on screen. After your answer, AIVES may ask up to {session?.maxFollowUps ?? 2} follow-up questions about it.
                </p>
                {sample.shown && (
                  <p className="a-rise" aria-live="polite" style={{ marginTop: '16px', maxWidth: '34em', fontFamily: 'Alegreya, Georgia, serif', fontWeight: '500', fontSize: '26px', lineHeight: '1.28' }}>
                    {sampleWords.map((w, i) => (
                      <Fragment key={i}>
                        <span className={w.cls} style={{ color: w.c, opacity: w.o, transition: 'opacity .2s ease-out' }}>{w.w}</span>
                        {w.sp}
                      </Fragment>
                    ))}
                  </p>
                )}
                <button type="button" className="a-btn a-btn-quiet" onClick={playSample} aria-disabled={sample.playing} style={{ marginTop: '10px', marginLeft: '-14px', height: '44px', padding: '0 14px', display: 'inline-flex', alignItems: 'center', gap: '10px', border: '0', borderRadius: '10px', background: 'transparent', color: 'var(--ivory-2)', fontSize: '15px', fontWeight: '500' }}>
                  {sample.playing ? (
                    <svg width="18" height="18" viewBox="0 0 18 18" aria-hidden="true">
                      <rect x="4" y="7" width="2" height="4" rx="1" className="a-candle" style={{ fill: 'var(--lantern-gold)' }} />
                      <rect x="8" y="4" width="2" height="10" rx="1" style={{ fill: 'var(--lantern-gold)' }} />
                      <rect x="12" y="6" width="2" height="6" rx="1" className="a-candle" style={{ fill: 'var(--lantern-gold)' }} />
                    </svg>
                  ) : (
                    <svg width="18" height="18" viewBox="0 0 18 18" aria-hidden="true">
                      <path d="M5.5 3.6v10.8L14 9z" style={{ fill: 'none', stroke: 'currentColor', strokeWidth: '1.6', strokeLinejoin: 'round' }} />
                    </svg>
                  )}
                  <span>{sample.playing ? 'Reading the sample' : sample.shown ? 'Hear it again' : 'Hear how it sounds'}</span>
                </button>
              </div>
            </li>
            <li className="a-rule" style={{ display: 'grid', gridTemplateColumns: '22px minmax(0, 1fr)', columnGap: '20px', padding: '22px 0', borderTop: '1px solid var(--night-line)', borderBottom: '1px solid var(--night-line)' }}>
              <svg width="22" height="22" viewBox="0 0 20 20" aria-hidden="true" style={{ marginTop: '4px', fill: 'none', stroke: 'var(--ivory-2)', strokeWidth: '1.6', strokeLinecap: 'round' }}>
                <rect x="7" y="2.5" width="6" height="10" rx="3" />
                <path d="M4.5 9.5a5.5 5.5 0 0 0 11 0M10 15v2.5" />
              </svg>
              <p className="a-rule-p" style={{ fontSize: '18px', lineHeight: '1.6', color: 'var(--ivory-2)' }}>
                <span style={{ fontWeight: '400', color: 'var(--ivory)' }}>Your voice is recorded</span>
                {' '}and kept with your exam record, so your lecturer can check every score against what you said.
              </p>
            </li>
          </ul>
        </section>
        <aside aria-labelledby="mic-title" className="a-rise" style={{ position: 'relative', minWidth: '0', paddingTop: '22px', borderTop: '1px solid var(--night-line)', display: 'flex', flexDirection: 'column', animationDelay: '120ms' }}>
          <div aria-hidden="true" style={{ position: 'absolute', left: 'calc(50% - 490px)', top: '0', width: '980px', height: '760px', zIndex: '-1', pointerEvents: 'none', opacity: ok ? (0.3 + 0.7 * mic.level).toFixed(2) : 0, transition: 'opacity .5s ease-out' }}>
            <div className="a-light a-light-voice" style={{ left: '0', top: '0', width: '100%', height: '100%', background: 'radial-gradient(closest-side, rgba(245,170,20,0.34), rgba(232,69,44,0.26) 38%, rgba(232,69,44,0.08) 70%, rgba(232,69,44,0) 100%)' }} />
          </div>
          <h2 id="mic-title" style={{ fontSize: '15px', fontWeight: '500', color: 'var(--ivory-2)' }}>Microphone check</h2>
          <div style={{ marginTop: '14px', position: 'relative' }}>
            <label htmlFor="mic-device" style={sr}>Microphone</label>
            <select id="mic-device" className="a-field" value={deviceId ?? mic.devices[0]?.id ?? ''} onChange={(e) => { setHeardFor(0); setDeviceId(e.target.value) }} style={{ width: '100%', height: '48px', padding: '0 40px 0 44px', borderRadius: '12px', border: '1px solid var(--night-edge)', background: 'var(--night-field)', fontSize: '16px', fontWeight: '400', color: 'var(--ivory)' }}>
              {mic.devices.length === 0 && <option value="">{blocked ? 'No microphone available' : 'Microphone'}</option>}
              {mic.devices.map((d) => <option key={d.id} value={d.id}>{d.label}</option>)}
            </select>
            <svg width="20" height="20" viewBox="0 0 20 20" aria-hidden="true" style={{ position: 'absolute', left: '14px', top: '14px', pointerEvents: 'none', fill: 'none', stroke: 'var(--ivory-2)', strokeWidth: '1.6', strokeLinecap: 'round' }}>
              <rect x="7" y="2.5" width="6" height="10" rx="3" />
              <path d="M4.5 9.5a5.5 5.5 0 0 0 11 0M10 15v2.5" />
            </svg>
            <svg width="16" height="16" viewBox="0 0 24 24" aria-hidden="true" style={{ position: 'absolute', right: '14px', top: '16px', pointerEvents: 'none', fill: 'none', stroke: 'var(--ivory-2)', strokeWidth: '2', strokeLinecap: 'round', strokeLinejoin: 'round' }}>
              <path d="m6 9 6 6 6-6" />
            </svg>
          </div>
          <div aria-live="polite" style={{ marginTop: '32px', display: 'grid', gridTemplateColumns: '26px minmax(0, 1fr)', columnGap: '12px', minHeight: '64px' }}>
            {listening && (
              <svg className="a-pop" width="26" height="26" viewBox="0 0 26 26" aria-hidden="true" style={{ marginTop: '3px' }}>
                <circle cx="13" cy="13" r="10" style={{ fill: 'none', stroke: 'var(--lantern-red)', strokeWidth: '1.7' }} />
                <circle className="a-rec" cx="13" cy="13" r="6.4" style={{ fill: 'var(--lantern-red)' }} />
              </svg>
            )}
            {heard && (
              <svg className="a-pop" width="26" height="26" viewBox="0 0 26 26" aria-hidden="true" style={{ marginTop: '3px', fill: 'none', stroke: 'var(--jade)', strokeWidth: '1.8', strokeLinecap: 'round', strokeLinejoin: 'round' }}>
                <circle cx="13" cy="13" r="10" />
                <path d="M8.6 13.3l3 3 5.8-6.2" />
              </svg>
            )}
            {checking && (
              <svg className="a-candle" width="26" height="26" viewBox="0 0 16 16" aria-hidden="true" style={{ marginTop: '3px' }}>
                <circle cx="8" cy="8" r="6.25" style={{ fill: 'none', stroke: 'var(--ivory-2)', strokeWidth: '1.2', strokeDasharray: '2.45 2.45' }} />
              </svg>
            )}
            {blocked && (
              <svg className="a-pop" width="26" height="26" viewBox="0 0 24 24" aria-hidden="true" style={{ marginTop: '3px', fill: 'none', stroke: 'var(--ember-text)', strokeWidth: '1.75', strokeLinecap: 'round', strokeLinejoin: 'round' }}>
                <rect x="9" y="2.5" width="6" height="11" rx="3" />
                <path d="M5.5 10.5a6.5 6.5 0 0 0 11.4 4.3M18.4 11.6c.07-.36.1-.73.1-1.1M12 17v4M3 3l18 18" />
              </svg>
            )}
            <div key={titles[access]} className={{ blocked: 'a-rise', checking: 'a-tick-b', ok: heard ? 'a-tick-b' : 'a-tick-a' }[access]} style={{ fontSize: '24px', fontWeight: '500', lineHeight: '1.3' }}>
              {titles[access]}
            </div>
            <div style={{ gridColumn: '2', fontSize: '15px', lineHeight: '1.45', color: 'var(--ivory-2)' }}>{subs[access]}</div>
          </div>
          {ok && (
            <div role="meter" aria-label="Microphone level" aria-valuemin="0" aria-valuemax="100" aria-valuenow={Math.round(mic.level * 100)} style={{ marginTop: '22px', height: '64px', display: 'flex', alignItems: 'center', gap: '3px' }}>
              {history.map((v, i) => (
                <span key={i} style={{ flex: '1', minWidth: '2px', height: '56px', borderRadius: '2px', background: v > HEAR_LEVEL ? 'var(--ivory)' : 'rgba(246,241,231,0.22)', transform: `scaleY(${Math.max(0.05, v).toFixed(3)})`, transition: 'transform .14s linear, background-color .2s ease-out' }} />
              ))}
            </div>
          )}
          {blocked && (
            <div role="alert" className="a-rise" style={{ marginTop: '22px', display: 'grid', gridTemplateColumns: '18px minmax(0, 1fr)', columnGap: '12px', rowGap: '10px', padding: '16px 16px 14px', borderRadius: '12px', background: 'var(--red-wash-night)', border: '1px solid rgba(255,106,79,0.4)' }}>
              <svg width="18" height="18" viewBox="0 0 24 24" aria-hidden="true" style={{ marginTop: '2px', fill: 'none', stroke: 'var(--ember-text)', strokeWidth: '1.75', strokeLinecap: 'round', strokeLinejoin: 'round' }}>
                <path d="M12 4 21 19.5H3z" />
                <path d="M12 10v4.5" />
                <path d="M12 17.2v.01" />
              </svg>
              <p style={{ fontSize: '14.5px', lineHeight: '1.5' }}>
                <span style={{ fontWeight: '500', color: 'var(--ember-text)' }}>{mic.status === 'missing' ? 'No microphone found.' : 'Microphone access is off.'}</span>
                {' '}{mic.status === 'missing' ? 'Plug in a microphone, then try again:' : 'Allow it for this site, then try again:'}
              </p>
              <ol style={{ gridColumn: '2', display: 'flex', flexDirection: 'column', gap: '6px', fontSize: '14.5px', lineHeight: '1.45', color: 'var(--ivory-2)' }}>
                {(mic.status === 'missing'
                  ? ['Connect a headset or a USB microphone.', 'Check that the system sees it.', 'Select Try again below.']
                  : ['Select the lock icon beside the web address.', 'Set Microphone to Allow.', 'Select Try again below.']
                ).map((t, i) => (
                  <li key={t} style={{ display: 'grid', gridTemplateColumns: '18px minmax(0, 1fr)' }}>
                    <span style={{ color: 'var(--ivory)', fontWeight: '500' }}>{i + 1}</span>
                    <span>{t}</span>
                  </li>
                ))}
              </ol>
              <button type="button" className="a-btn a-btn-secondary" onClick={() => { setHeardFor(0); mic.start(deviceId) }} style={{ gridColumn: '2', justifySelf: 'start', marginTop: '4px', height: '44px', padding: '0 18px', display: 'inline-flex', alignItems: 'center', gap: '10px', borderRadius: '12px', border: '1px solid var(--night-edge)', background: 'transparent', color: 'var(--ivory)', fontSize: '15px', fontWeight: '500' }}>
                <svg width="18" height="18" viewBox="0 0 16 16" aria-hidden="true" style={{ fill: 'none', stroke: 'currentColor', strokeWidth: '1.5', strokeLinecap: 'round', strokeLinejoin: 'round' }}>
                  <path d="M2.6 8a5.4 5.4 0 1 0 1.6-3.8" />
                  <path d="M2.4 2.4v3.2h3.2" />
                </svg>
                Try again
              </button>
            </div>
          )}
          <div style={{ marginTop: '40px', paddingTop: '28px', borderTop: '1px solid var(--night-line)', display: 'flex', flexDirection: 'column', gap: '14px' }}>
            <button type="button" className="a-btn a-btn-primary" onClick={start} aria-disabled={!canStart} aria-busy={starting} style={{ height: '62px', width: '100%', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: '12px', border: '0', borderRadius: '14px', background: 'var(--ivory)', color: 'var(--night-indigo)', fontSize: '18px', fontWeight: '500', textDecoration: 'none', boxShadow: '0 10px 28px -12px rgba(0,0,0,0.55)' }}>
              Start exam
              <svg width="18" height="18" viewBox="0 0 24 24" aria-hidden="true" style={{ fill: 'none', stroke: 'currentColor', strokeWidth: '2', strokeLinecap: 'round', strokeLinejoin: 'round' }}>
                <path d="M5 12h14" />
                <path d="m13 6 6 6-6 6" />
              </svg>
            </button>
            {startError ? (
              <p role="alert" className="a-rise" style={{ fontSize: '14px', lineHeight: '1.5', color: 'var(--ember-text)' }}>{startError}</p>
            ) : (
              <p key={startNote} className={heard ? 'a-rise' : ''} style={{ fontSize: '14px', lineHeight: '1.5', color: 'var(--ivory-2)' }}>{startNote}</p>
            )}
          </div>
        </aside>
      </main>
    </div>
  )
}
