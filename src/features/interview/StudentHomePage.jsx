import { useEffect } from 'react'
import { Link } from 'react-router-dom'
import { paths } from '../../app/routes/paths.js'
import { interviewApi } from '../../api/services.js'
import { StudentTopBar } from '../../components/TopBar.jsx'
import { SampleNote } from '../../components/SampleNote.jsx'
import { useLoad } from '../../hooks/useLoad.js'
import { useMergeState } from '../../hooks/useMergeState.js'
import { useNow } from '../../hooks/useNow.js'
import { useTimeouts } from '../../hooks/useTimeouts.js'
import { formatDay, formatScore, formatTime, formatWindow, pad2 } from '../../utils/format.js'
import './StudentHome.css'

const ROW = { display: 'grid', gridTemplateColumns: 'minmax(0, 1.5fr) minmax(0, 1fr) minmax(0, 1.2fr) 150px', columnGap: '32px', alignItems: 'center' }

const Crescent = ({ color, size = 14 }) => (
  <svg width={size} height={size} viewBox="0 0 16 16" aria-hidden="true" style={{ flex: 'none' }}>
    <circle cx="8" cy="8" r="6.25" style={{ fill: 'none', stroke: color, strokeWidth: '1.5' }} />
    <path d="M8 1.75a6.25 6.25 0 0 1 0 12.5a2.6 6.25 0 0 0 0-12.5z" style={{ fill: color }} />
  </svg>
)
const Disc = ({ color, size = 14, full = false }) => (
  <svg width={size} height={size} viewBox="0 0 16 16" aria-hidden="true" style={{ flex: 'none' }}>
    <circle cx="8" cy="8" r="6.25" style={{ fill: full ? color : 'none', stroke: color, strokeWidth: '1.5' }} />
  </svg>
)

const opensIn = (startAt, now) => {
  const days = Math.round((new Date(startAt).setHours(0, 0, 0, 0) - new Date(now).setHours(0, 0, 0, 0)) / 864e5)
  if (days <= 0) return `Opens at ${formatTime(startAt)}`
  return days === 1 ? 'Opens tomorrow' : `Opens in ${days} days`
}

export default function StudentHomePage() {
  const now = useNow(1000)
  const { data, reload } = useLoad(() => interviewApi.mySessions(), [])
  const [s, setState] = useMergeState({ rules: 'closed', status: {}, check: 'idle' })
  const { later } = useTimeouts()

  const list = data ?? []
  const open = list.find((x) => x.phase === 'Open now' && (!x.attempt || x.attempt.status === 'InProgress'))
  const upcoming = list.filter((x) => x.phase === 'Published').sort((a, b) => new Date(a.startAt) - new Date(b.startAt))
  const finished = list
    .filter((x) => x !== open && (x.attempt || x.phase === 'Closed'))
    .sort((a, b) => new Date(b.attempt?.endedAt ?? b.endAt) - new Date(a.attempt?.endedAt ?? a.endAt))
  const hasExams = !!data && (open || upcoming.length || finished.length)

  // the time-window countdown: only the digit that changed drops in
  let digits = [], timerAria = '', remain = 1, nowX = '0%'
  if (open) {
    const end = new Date(open.endAt).getTime(), start = new Date(open.startAt).getTime()
    const left = Math.max(0, Math.round((end - now) / 1000))
    const str = pad2(Math.floor(left / 60)) + pad2(left % 60)
    const before = pad2(Math.floor((left + 1) / 60)) + pad2((left + 1) % 60)
    const tick = left % 2 ? 'a-tick-a' : 'a-tick-b'
    digits = str.split('').map((d, i) => ({ v: d, cls: before.length === str.length && before[i] !== d ? tick : '' }))
    const frac = Math.min(1, (now - start) / (end - start))
    remain = (1 - frac).toFixed(4)
    nowX = (frac * 100).toFixed(2) + '%'
    timerAria = `${Math.ceil(left / 60)} minutes left in the time window. Closes at ${formatTime(open.endAt)}.`
  }

  // when the window closes, read the list again: the session moves to Finished
  const closed = !!open && new Date(open.endAt).getTime() <= now
  useEffect(() => { if (closed) reload(true) }, [closed, reload])

  const toggleRules = () => {
    if (s.rules === 'open') { setState({ rules: 'closing' }); later(() => setState({ rules: 'closed' }), 200) }
    else setState({ rules: 'open' })
  }
  const toggleStatus = (id) => {
    const cur = s.status[id] ?? 'closed'
    if (cur === 'open') { setState((p) => ({ status: { ...p.status, [id]: 'closing' } })); later(() => setState((p) => ({ status: { ...p.status, [id]: 'closed' } })), 200) }
    else setState((p) => ({ status: { ...p.status, [id]: 'open' } }))
  }
  const checkAgain = () => {
    if (s.check === 'checking') return
    setState({ check: 'checking' })
    reload(true).finally(() => later(() => setState({ check: 'done' }), 600))
  }

  const minutesOf = (x) => Math.round(x.timeLimitSeconds)
  const counts = [open ? '1 open now' : null, upcoming.length ? `${upcoming.length} upcoming` : null, finished.length ? `${finished.length} finished` : null].filter(Boolean).join(' · ')

  return (
    <div className="pg-studenthome" style={{ position: 'relative', minHeight: '100vh', display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
      <StudentTopBar current="home" />
      <main className="a-gutter" style={{ position: 'relative', zIndex: '1', flex: '1', width: '100%', maxWidth: '1312px', margin: '0 auto', padding: '56px 64px 72px', display: 'flex', flexDirection: 'column' }}>
        <div className="a-wrap-sm" style={{ display: 'flex', alignItems: 'baseline', gap: '12px 24px', flexWrap: 'wrap' }}>
          <h1 className="a-title a-rise" style={{ fontFamily: 'Alegreya, Georgia, serif', fontWeight: '500', fontSize: '44px', lineHeight: '1.08', letterSpacing: '-0.012em' }}>
            My exams
          </h1>
          {hasExams && (
            <p className="a-rise" style={{ fontSize: '16.5px', color: 'var(--ivory-2)' }}>
              {counts}
            </p>
          )}
        </div>

        {hasExams && open && (
          <section aria-labelledby="open-name" className="a-grid-1-sm a-rise" style={{ animationDelay: '60ms', marginTop: '56px', display: 'grid', gridTemplateColumns: 'minmax(0, 1fr) 400px', columnGap: '72px', rowGap: '40px', alignItems: 'start' }}>
            <div style={{ display: 'flex', flexDirection: 'column', minWidth: '0' }}>
              <p style={{ display: 'flex', alignItems: 'center', gap: '10px', fontSize: '15px', fontWeight: '500', color: 'var(--ember-text)' }}>
                <Crescent color="var(--lantern-red)" size={20} />
                {open.attempt ? 'In progress' : 'Open now'}
              </p>
              <h2 id="open-name" className="a-display" style={{ marginTop: '18px', fontFamily: 'Alegreya, Georgia, serif', fontWeight: '500', fontSize: '52px', lineHeight: '1.08', letterSpacing: '-0.012em', textWrap: 'balance' }}>
                {open.title}
              </h2>
              <p style={{ marginTop: '12px', fontSize: '16.5px', color: 'var(--jade)' }}>
                <span style={{ fontWeight: '500' }}>{open.courseCode}</span>
                {' '}· {open.courseName}
              </p>
              <p style={{ marginTop: '28px', maxWidth: '40em', fontSize: '16px', lineHeight: '1.5', color: 'var(--ivory-2)' }}>
                <span style={{ color: 'var(--ivory)', fontWeight: '400' }}>One attempt.</span>
                {' '}{open.questionCount} questions · {minutesOf(open)} s per answer · up to {open.maxFollowUps} follow-ups per question
              </p>
              <div className="a-wrap-sm" style={{ marginTop: '32px', display: 'flex', alignItems: 'center', gap: '12px 16px' }}>
                <Link to={open.attempt ? paths.attempt(open.attempt.id) : paths.lobby(open.id)} className="a-btn a-btn-primary a-full-sm" style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: '10px', height: '52px', padding: '0 24px', borderRadius: '14px', background: 'var(--ivory)', color: 'var(--night-indigo)', fontSize: '16px', fontWeight: '500', textDecoration: 'none', boxShadow: '0 10px 28px -12px rgba(0,0,0,0.55)' }}>
                  <svg width="18" height="18" viewBox="0 0 24 24" aria-hidden="true" style={{ fill: 'none', stroke: 'currentColor', strokeWidth: '1.9', strokeLinecap: 'round', strokeLinejoin: 'round' }}>
                    <rect x="9" y="2.5" width="6" height="12" rx="3" />
                    <path d="M5 11a7 7 0 0 0 14 0" />
                    <path d="M12 18v3.5" />
                  </svg>
                  {open.attempt ? 'Continue exam' : 'Start exam'}
                </Link>
                <button type="button" className="a-btn a-btn-quiet a-full-sm" aria-expanded={s.rules === 'open'} aria-controls="open-rules" onClick={toggleRules} style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: '10px', height: '44px', padding: '0 14px', border: '0', borderRadius: '10px', background: 'transparent', color: 'var(--ivory-2)', fontSize: '15px', fontWeight: '500' }}>
                  {s.rules === 'open' ? 'Hide the rules' : 'Read the rules'}
                  <svg width="18" height="18" viewBox="0 0 24 24" aria-hidden="true" style={{ fill: 'none', stroke: 'currentColor', strokeWidth: '1.9', strokeLinecap: 'round', strokeLinejoin: 'round', transform: `rotate(${s.rules === 'open' ? 180 : 0}deg)`, transition: 'transform .4s cubic-bezier(0.34,1.32,0.64,1)' }}>
                    <path d="m6 9 6 6 6-6" />
                  </svg>
                </button>
              </div>
              {s.rules !== 'closed' && (
                <ul id="open-rules" className={`${s.rules === 'closing' ? 'sh-out' : 'a-rise'} a-grid-1-sm`} style={{ marginTop: '28px', paddingTop: '22px', borderTop: '1px solid var(--night-line)', display: 'grid', gridTemplateColumns: 'minmax(0, 1fr) minmax(0, 1fr)', gap: '16px 40px', maxWidth: '760px', fontSize: '15px', lineHeight: '1.5', color: 'var(--ivory-2)' }}>
                  <li style={{ display: 'grid', gridTemplateColumns: '18px minmax(0, 1fr)', columnGap: '12px' }}>
                    <svg width="18" height="18" viewBox="0 0 24 24" aria-hidden="true" style={{ marginTop: '2px', fill: 'none', stroke: 'var(--jade)', strokeWidth: '1.75', strokeLinecap: 'round', strokeLinejoin: 'round' }}>
                      <circle cx="12" cy="12" r="9" />
                      <path d="M12 7v5l3 2" />
                    </svg>
                    <span>
                      <span style={{ color: 'var(--ivory)', fontWeight: '400' }}>The session closes at {formatTime(open.endAt)}</span>
                      {' '}and stops attempts in progress. Questions not reached count as 0.
                    </span>
                  </li>
                  <li style={{ display: 'grid', gridTemplateColumns: '18px minmax(0, 1fr)', columnGap: '12px' }}>
                    <svg width="18" height="18" viewBox="0 0 24 24" aria-hidden="true" style={{ marginTop: '2px', fill: 'none', stroke: 'var(--jade)', strokeWidth: '1.75', strokeLinecap: 'round', strokeLinejoin: 'round' }}>
                      <path d="M12 3v3" />
                      <path d="M12 12l4-4" />
                      <circle cx="12" cy="13.5" r="7.5" />
                    </svg>
                    <span>
                      <span style={{ color: 'var(--ivory)', fontWeight: '400' }}>{open.timeLimitSeconds} seconds per answer,</span>
                      {' '}follow-ups included.
                    </span>
                  </li>
                  <li style={{ display: 'grid', gridTemplateColumns: '18px minmax(0, 1fr)', columnGap: '12px' }}>
                    <svg width="18" height="18" viewBox="0 0 24 24" aria-hidden="true" style={{ marginTop: '2px', fill: 'none', stroke: 'var(--jade)', strokeWidth: '1.75', strokeLinecap: 'round', strokeLinejoin: 'round' }}>
                      <path d="M4 10.2h3.6L12.4 6v12l-4.8-4.2H4z" />
                      <path d="M16.4 9.6a5 5 0 0 1 0 4.8" />
                      <path d="M19.4 7a9 9 0 0 1 0 10" />
                    </svg>
                    <span>
                      Each question is read aloud and shown on screen. AIVES may ask{' '}
                      <span style={{ color: 'var(--ivory)', fontWeight: '400' }}>up to {open.maxFollowUps} follow-ups.</span>
                    </span>
                  </li>
                  <li style={{ display: 'grid', gridTemplateColumns: '18px minmax(0, 1fr)', columnGap: '12px' }}>
                    <svg width="18" height="18" viewBox="0 0 24 24" aria-hidden="true" style={{ marginTop: '2px', fill: 'none', stroke: 'var(--jade)', strokeWidth: '1.75', strokeLinecap: 'round', strokeLinejoin: 'round' }}>
                      <rect x="9" y="2.5" width="6" height="12" rx="3" />
                      <path d="M5 11a7 7 0 0 0 14 0" />
                      <path d="M12 18v3.5" />
                    </svg>
                    <span>
                      <span style={{ color: 'var(--ivory)', fontWeight: '400' }}>Your voice is recorded and kept</span>
                      {' '}with the transcript for your lecturer.
                    </span>
                  </li>
                </ul>
              )}
            </div>
            <div role="timer" aria-label={timerAria} style={{ display: 'flex', flexDirection: 'column', paddingTop: '6px' }}>
              <p style={{ display: 'flex', alignItems: 'center', gap: '10px', fontSize: '14px', fontWeight: '500', color: 'var(--ivory-2)' }}>
                <svg width="17" height="17" viewBox="0 0 20 20" aria-hidden="true" style={{ fill: 'none', stroke: 'var(--jade)', strokeWidth: '1.6', strokeLinecap: 'round' }}>
                  <circle cx="10" cy="10" r="7.6" />
                  <path d="M10 5.6V10l2.9 1.9" />
                </svg>
                Left in the time window
              </p>
              <div className="a-num a-score-xl" aria-hidden="true" style={{ marginTop: '14px', display: 'flex', alignItems: 'baseline', fontSize: '72px', fontWeight: '200', lineHeight: '0.95', letterSpacing: '-0.02em', color: 'var(--ivory)' }}>
                <span style={{ display: 'flex', alignItems: 'baseline' }}>
                  {digits.map((d, i) => (
                    <span key={i} style={{ display: 'contents' }}>
                      {i === digits.length - 2 && (
                        <span style={{ display: 'inline-block', width: '0.3em', textAlign: 'center', transform: 'translateY(-0.06em)' }}>:</span>
                      )}
                      <span style={{ display: 'inline-block', width: '0.6em', textAlign: 'center', overflow: 'hidden' }}>
                        <span key={d.v + i} className={d.cls}>{d.v}</span>
                      </span>
                    </span>
                  ))}
                </span>
              </div>
              <div aria-hidden="true" style={{ marginTop: '26px', position: 'relative', height: '3px', borderRadius: '3px', background: 'rgba(246,241,231,0.18)' }}>
                <div className="sh-shrink" style={{ position: 'absolute', inset: '0', borderRadius: '3px', background: 'var(--ivory)', transformOrigin: '100% 50%', transform: `scaleX(${remain})` }} />
                <div className="sh-slide" style={{ position: 'absolute', top: '-5px', left: '0', width: '100%', height: '13px', transform: `translateX(${nowX})` }}>
                  <span style={{ position: 'absolute', left: '-6.5px', top: '0', width: '13px', height: '13px', borderRadius: '50%', background: 'var(--lantern-red)', boxShadow: '0 0 0 4px var(--night-indigo)' }} />
                </div>
              </div>
              <div style={{ marginTop: '12px', display: 'flex', justifyContent: 'space-between', fontSize: '13.5px', color: 'var(--ivory-2)' }}>
                <span>Opened {formatTime(open.startAt)}</span>
                <span>
                  Closes{' '}
                  <span style={{ fontWeight: '500', color: 'var(--ivory)' }}>{formatTime(open.endAt)}</span>
                </span>
              </div>
              <p style={{ marginTop: '22px', fontSize: '14.5px', lineHeight: '1.5', color: 'var(--ivory-2)' }}>
                {formatWindow(open.startAt, open.endAt, now)}. At {formatTime(open.endAt)} the session closes and stops any attempt still in progress.
              </p>
            </div>
          </section>
        )}

        {hasExams && upcoming.length > 0 && (
          <section aria-labelledby="up-h" className="a-rise" style={{ animationDelay: '120ms', marginTop: open ? '88px' : '56px' }}>
            <div style={{ display: 'flex', alignItems: 'baseline', gap: '14px', paddingBottom: '14px', borderBottom: '1px solid var(--night-line)' }}>
              <h2 id="up-h" style={{ fontSize: '24px', fontWeight: '500', lineHeight: '1.3', letterSpacing: '-0.005em' }}>Upcoming</h2>
              <span style={{ fontSize: '14px', color: 'var(--ivory-3)' }}>{upcoming.length}</span>
            </div>
            <ul>
              {upcoming.map((x) => (
                <li key={x.id} className="a-row a-grid-1-sm" style={{ ...ROW, rowGap: '10px', padding: '20px 0', borderBottom: '1px solid var(--night-line)' }}>
                  <span style={{ display: 'flex', flexDirection: 'column', gap: '3px', minWidth: '0' }}>
                    <span style={{ fontSize: '16.5px', fontWeight: '500' }}>{x.title}</span>
                    <span style={{ fontSize: '14px', color: 'var(--jade)' }}>{x.courseCode} · {x.courseName}</span>
                  </span>
                  <span style={{ display: 'flex', alignItems: 'baseline', gap: '10px', flexWrap: 'wrap' }}>
                    <span className="a-num" style={{ fontSize: '20px', fontWeight: '300', lineHeight: '1.2' }}>{formatDay(x.startAt, now)}</span>
                    <span style={{ fontSize: '13.5px', color: 'var(--ivory-2)' }}>{formatTime(x.startAt)} to {formatTime(x.endAt)}</span>
                  </span>
                  <span style={{ display: 'inline-flex', alignItems: 'center', gap: '9px', fontSize: '14.5px', color: 'var(--ivory-2)' }}>
                    <Disc color="var(--ivory-2)" />
                    {opensIn(x.startAt, now)}
                  </span>
                  <span className="a-hide-sm" />
                </li>
              ))}
            </ul>
          </section>
        )}

        {hasExams && finished.length > 0 && (
          <section aria-labelledby="done-h" className="a-rise" style={{ animationDelay: '120ms', marginTop: open || upcoming.length ? '72px' : '56px' }}>
            <div style={{ display: 'flex', alignItems: 'baseline', gap: '14px', paddingBottom: '14px', borderBottom: '1px solid var(--night-line)' }}>
              <h2 id="done-h" style={{ fontSize: '24px', fontWeight: '500', lineHeight: '1.3', letterSpacing: '-0.005em' }}>Finished</h2>
              <span style={{ fontSize: '14px', color: 'var(--ivory-3)' }}>{finished.length}</span>
            </div>
            <ul>
              {finished.map((x) => {
                const a = x.attempt
                const head = (
                  <span style={{ display: 'flex', flexDirection: 'column', gap: '3px', minWidth: '0' }}>
                    <span style={{ fontSize: '16.5px', fontWeight: '500' }}>{x.title}</span>
                    <span style={{ fontSize: '14px', color: 'var(--jade)' }}>{x.courseCode} · {x.courseName}</span>
                  </span>
                )
                const taken = (
                  <span style={{ display: 'flex', alignItems: 'baseline', gap: '10px', flexWrap: 'wrap' }}>
                    <span style={{ fontSize: '13.5px', color: 'var(--ivory-2)' }}>{a ? 'Taken' : 'Closed'}</span>
                    <span className="a-num" style={{ fontSize: '20px', fontWeight: '300', lineHeight: '1.2' }}>{formatDay(a?.endedAt ?? x.endAt, now)}</span>
                  </span>
                )
                if (a?.status === 'Finalized') {
                  return (
                    <li key={x.id} className="a-row a-grid-1-sm" style={{ ...ROW, rowGap: '12px', padding: '22px 0', borderBottom: '1px solid var(--night-line)' }}>
                      {head}
                      {taken}
                      <span style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                        <span className="a-num" style={{ display: 'flex', alignItems: 'baseline', gap: '8px' }}>
                          <span style={{ fontSize: '56px', fontWeight: '200', lineHeight: '1', letterSpacing: '-0.02em' }}>{formatScore(a.finalScore)}</span>
                          <span style={{ fontSize: '18px', fontWeight: '300', color: 'var(--ivory-2)' }}>/ 10</span>
                        </span>
                        <span style={{ display: 'inline-flex', alignItems: 'center', gap: '9px', fontSize: '14.5px', color: 'var(--ivory)' }}>
                          <Disc color="var(--ivory)" full />
                          Final score, confirmed
                        </span>
                      </span>
                      <Link to={paths.report(a.id)} className="a-btn a-btn-secondary sh-act" style={{ justifySelf: 'end', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: '8px', height: '44px', padding: '0 18px', borderRadius: '12px', border: '1px solid var(--night-edge)', background: 'transparent', color: 'var(--ivory)', fontSize: '15px', fontWeight: '500', textDecoration: 'none', whiteSpace: 'nowrap' }}>
                        View report
                      </Link>
                    </li>
                  )
                }
                if (!a) {
                  return (
                    <li key={x.id} className="a-row a-grid-1-sm" style={{ ...ROW, rowGap: '12px', padding: '22px 0', borderBottom: '1px solid var(--night-line)' }}>
                      {head}
                      {taken}
                      <span style={{ display: 'inline-flex', alignItems: 'center', gap: '9px', fontSize: '14.5px', color: 'var(--ivory-2)' }}>
                        <Disc color="var(--ivory-2)" />
                        No attempt, counts as 0
                      </span>
                      <span className="a-hide-sm" />
                    </li>
                  )
                }
                const st = s.status[x.id] ?? 'closed'
                return (
                  <li key={x.id} className="a-row" style={{ padding: '22px 0', borderBottom: '1px solid var(--night-line)' }}>
                    <div className="a-grid-1-sm" style={{ ...ROW, rowGap: '12px' }}>
                      {head}
                      {taken}
                      <span style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                        <span style={{ display: 'inline-flex', alignItems: 'center', gap: '9px', fontSize: '14.5px', color: 'var(--ivory)' }}>
                          <Crescent color="var(--lantern-gold)" />
                          Waiting for your lecturer
                        </span>
                        <span style={{ paddingLeft: '23px', fontSize: '13.5px', color: 'var(--ivory-3)' }}>No score until it is confirmed</span>
                      </span>
                      <button type="button" className="a-btn a-btn-quiet sh-act" aria-expanded={st === 'open'} aria-controls={`status-${x.id}`} onClick={() => toggleStatus(x.id)} style={{ justifySelf: 'end', display: 'inline-flex', alignItems: 'center', gap: '8px', height: '44px', padding: '0 14px', border: '0', borderRadius: '10px', background: 'transparent', color: 'var(--ivory-2)', fontSize: '15px', fontWeight: '500', whiteSpace: 'nowrap' }}>
                        {st === 'open' ? 'Hide status' : 'See status'}
                        <svg width="16" height="16" viewBox="0 0 24 24" aria-hidden="true" style={{ fill: 'none', stroke: 'currentColor', strokeWidth: '1.9', strokeLinecap: 'round', strokeLinejoin: 'round', transform: `rotate(${st === 'open' ? 90 : 0}deg)`, transition: 'transform .4s cubic-bezier(0.34,1.32,0.64,1)' }}>
                          <path d="m9 6 6 6-6 6" />
                        </svg>
                      </button>
                    </div>
                    {st !== 'closed' && (
                      <ol id={`status-${x.id}`} aria-label="What happens to your attempt" className={st === 'closing' ? 'sh-out' : 'a-rise'} style={{ marginTop: '22px', padding: '20px 0 4px 0', borderTop: '1px solid var(--night-line)', display: 'flex', flexDirection: 'column' }}>
                        <li style={{ display: 'grid', gridTemplateColumns: '26px minmax(0, 1fr)', columnGap: '14px', paddingBottom: '28px', position: 'relative' }}>
                          <span aria-hidden="true" style={{ position: 'absolute', left: '12.5px', top: '30px', bottom: '4px', width: '1px', background: 'rgba(246,241,231,0.22)' }} />
                          <svg width="20" height="20" viewBox="0 0 16 16" aria-hidden="true" style={{ margin: '2px 0 0 3px' }}>
                            <circle cx="8" cy="8" r="6.25" style={{ fill: 'var(--ivory)', stroke: 'var(--ivory)', strokeWidth: '1.5' }} />
                          </svg>
                          <div>
                            <p style={{ fontSize: '16px', fontWeight: '500' }}>{a.endReason === 'SessionClosed' ? 'Stopped when the session closed' : 'Exam submitted'}</p>
                            <p style={{ marginTop: '2px', fontSize: '14px', color: 'var(--ivory-2)' }}>{formatDay(a.endedAt, now)}</p>
                          </div>
                        </li>
                        <li style={{ display: 'grid', gridTemplateColumns: '26px minmax(0, 1fr)', columnGap: '14px', paddingBottom: '28px', position: 'relative' }}>
                          <span aria-hidden="true" style={{ position: 'absolute', left: '12.5px', top: '30px', bottom: '4px', width: '1px', background: 'rgba(246,241,231,0.22)' }} />
                          <svg width="20" height="20" viewBox="0 0 16 16" aria-hidden="true" style={{ margin: '2px 0 0 3px' }}>
                            <circle cx="8" cy="8" r="6.25" style={{ fill: 'none', stroke: 'var(--lantern-gold)', strokeWidth: '1.5' }} />
                            <path d="M8 1.75a6.25 6.25 0 0 1 0 12.5a2.6 6.25 0 0 0 0-12.5z" style={{ fill: 'var(--lantern-gold)' }} />
                          </svg>
                          <div>
                            <p style={{ fontSize: '16px', fontWeight: '500' }}>The AI suggested a score for each question</p>
                            <p style={{ marginTop: '2px', fontSize: '14px', color: 'var(--ivory-2)' }}>Suggestions only. You see them with your report.</p>
                          </div>
                        </li>
                        <li aria-current="step" style={{ display: 'grid', gridTemplateColumns: '26px minmax(0, 1fr)', columnGap: '14px' }}>
                          <svg width="20" height="20" viewBox="0 0 16 16" aria-hidden="true" style={{ margin: '2px 0 0 3px' }}>
                            <circle cx="8" cy="8" r="6.25" style={{ fill: 'none', stroke: 'var(--ivory-2)', strokeWidth: '1.5' }} />
                          </svg>
                          <div>
                            <p style={{ fontSize: '16px', fontWeight: '500' }}>Your lecturer confirms the final score</p>
                            <p style={{ marginTop: '2px', fontSize: '14px', color: 'var(--ivory-2)' }}>Not yet</p>
                          </div>
                        </li>
                      </ol>
                    )}
                  </li>
                )
              })}
            </ul>
          </section>
        )}

        {data && !hasExams && (
          <section aria-labelledby="empty-h" className="a-rise" style={{ animationDelay: '60ms', marginTop: '72px', maxWidth: '620px', display: 'flex', flexDirection: 'column', alignItems: 'flex-start' }}>
            <Disc color="var(--ivory-2)" size={26} />
            <h2 id="empty-h" style={{ marginTop: '20px', fontSize: '24px', fontWeight: '500', lineHeight: '1.3', letterSpacing: '-0.005em' }}>No exams yet</h2>
            <p style={{ marginTop: '10px', fontSize: '16.5px', lineHeight: '1.5', color: 'var(--ivory-2)' }}>
              When a lecturer adds you to an exam session, it shows up here with its time window. You can start it while the session is open.
            </p>
            <div style={{ marginTop: '28px', display: 'flex', alignItems: 'center', flexWrap: 'wrap', gap: '12px 18px', minHeight: '44px' }}>
              <button type="button" className="a-btn a-btn-secondary" aria-disabled={s.check === 'checking'} onClick={checkAgain} style={{ display: 'inline-flex', alignItems: 'center', gap: '10px', height: '44px', padding: '0 18px', borderRadius: '12px', border: '1px solid var(--night-edge)', background: 'transparent', color: 'var(--ivory)', fontSize: '15px', fontWeight: '500' }}>
                <svg className={s.check === 'checking' ? 'sh-spin' : ''} width="18" height="18" viewBox="0 0 24 24" aria-hidden="true" style={{ fill: 'none', stroke: 'currentColor', strokeWidth: '1.9', strokeLinecap: 'round', strokeLinejoin: 'round' }}>
                  <path d="M20 12a8 8 0 1 1-2.34-5.66" />
                  <path d="M20 4v4.5h-4.5" />
                </svg>
                {s.check === 'checking' ? 'Checking…' : 'Check again'}
              </button>
              <p aria-live="polite" style={{ fontSize: '14px', color: 'var(--ivory-2)' }}>
                {s.check === 'done' && (
                  <span className="a-just" style={{ display: 'inline-flex', alignItems: 'center', gap: '8px' }}>
                    <span aria-hidden="true" style={{ width: '6px', height: '6px', borderRadius: '50%', background: 'var(--jade)' }} />
                    Nothing new · checked just now
                  </span>
                )}
              </p>
            </div>
          </section>
        )}
        <SampleNote>Sample data: names, times and scores on this page are examples.</SampleNote>
      </main>
    </div>
  )
}
