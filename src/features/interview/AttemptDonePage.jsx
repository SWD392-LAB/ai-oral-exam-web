import { Fragment, useEffect, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { paths } from '../../app/routes/paths.js'
import { interviewApi } from '../../api/services.js'
import { SampleNote } from '../../components/SampleNote.jsx'
import { StudentTopBar } from '../../components/TopBar.jsx'
import { useLoad } from '../../hooks/useLoad.js'
import { formatDay, formatTime, minutesBetween, plural } from '../../utils/format.js'

export default function AttemptDonePage() {
  const { attemptId } = useParams()
  const { data: a } = useLoad(() => interviewApi.get(attemptId), [attemptId])
  const [step, setStep] = useState(0)
  useEffect(() => {
    if (!a) return undefined
    const t = setTimeout(() => setStep(2), 560)
    return () => clearTimeout(t)
  }, [a])

  const stopped = a?.endReason === 'SessionClosed'
  const settled = step >= 2
  const total = a?.session.questionCount ?? 0
  const reached = (a?.answered ?? []).filter((q) => q.reached).length
  const last = stopped ? Math.max(1, reached) : total
  const nodes = Array.from({ length: total }, (_, i) => {
    const num = i + 1
    const isLast = num === last
    const after = num > last
    const done = num < last || (isLast && settled)
    const current = isLast && !settled
    const upcoming = after && !settled
    const missed = after && settled
    let note = 'Answered', noteC = 'var(--ivory-2)', noteCls = ''
    if (current) note = 'Answering'
    if (isLast && settled) noteCls = 'a-rise'
    if (upcoming) note = 'Not reached'
    if (missed) { note = 'Not reached, counts as 0'; noteC = 'var(--ember-text)'; noteCls = 'a-rise' }
    return { num, done, current, upcoming, missed, note, noteC, noteCls, markCls: isLast && settled ? 'a-pop' : '', lineO: num === total ? 0 : 1 }
  })
  const ended = a?.endedAt ?? a?.session.endAt
  const day = a ? formatDay(ended) : ''
  const when = ['Today', 'Yesterday'].includes(day) ? `${day.toLowerCase()} at ${formatTime(ended)}` : `${day} at ${formatTime(ended)}`
  const mins = a ? minutesBetween(a.startedAt, ended) : 0
  const v = {
    shown: !!a,
    finished: !!a && !stopped,
    stopped: !!a && stopped,
    voiceLight: step >= 1 ? 0 : 1,
    nodes,
    title: a?.session.title, course: a?.session.courseCode,
    finishedLine: `. Submitted ${when} after ${plural(mins, 'minute')}. You can close this page.`,
    stoppedLine: `. It closed at ${formatTime(a?.session.endAt ?? ended)}, so your attempt stopped there after ${plural(mins, 'minute')}. Everything you said up to then is saved.`,
    savedLine: stopped ? `Up to ${formatTime(a?.session.endAt ?? ended)}, when the session closed.` : `${day} at ${formatTime(ended)}.`,
    total,
  }
  return (
    <div className="pg-attemptdone" style={{ position: "relative", minHeight: "100vh", display: "flex", flexDirection: "column", overflow: "hidden" }}>
      {v.shown && (
        <>
          <div aria-hidden="true" style={{ position: "absolute", inset: "0", pointerEvents: "none", zIndex: "0", opacity: v.voiceLight, transition: "opacity 1.2s cubic-bezier(0.16,1,0.3,1)" }}>
            <div className="a-light a-light-voice" style={{ left: "calc(8% - 120px)", bottom: "-420px", width: "980px", height: "760px", background: "radial-gradient(closest-side, rgba(245,170,20,0.34), rgba(232,69,44,0.26) 38%, rgba(232,69,44,0.08) 70%, rgba(232,69,44,0) 100%)" }} />
          </div>
        </>
      )}
      <StudentTopBar current="home" />
      {v.shown && (
        <>
          <main className="a-gutter a-grid-1-sm" style={{ position: "relative", zIndex: "1", flex: "1", boxSizing: "border-box", width: "100%", maxWidth: "1440px", margin: "0 auto", display: "grid", gridTemplateColumns: "minmax(0, 1fr) 352px", alignContent: "start", columnGap: "72px", rowGap: "64px", padding: "88px 64px 56px" }}>
            <section aria-labelledby="done-h" style={{ display: "flex", flexDirection: "column", minWidth: "0" }}>
              {v.finished && (
                <>
                  <h1 id="done-h" className="a-display a-rise" style={{ fontFamily: "Alegreya, Georgia, serif", fontWeight: "500", fontSize: "52px", lineHeight: "1.08", letterSpacing: "-0.012em", maxWidth: "13em", textWrap: "balance", animationDelay: "0ms" }}>
                    Your answers are submitted
                  </h1>
                  <p className="a-rise" style={{ marginTop: "20px", maxWidth: "38em", fontSize: "16.5px", lineHeight: "1.5", color: "var(--ivory-2)", animationDelay: "0ms" }}>
                    <span style={{ fontWeight: "400", color: "var(--ivory)" }}>
                      {v.title}
                    </span>
                    {' '}
                    <span style={{ fontWeight: "400", color: "var(--jade)", letterSpacing: "0.02em" }}>
                      {v.course}
                    </span>
                    {v.finishedLine}
                  </p>
                </>
              )}
              {v.stopped && (
                <>
                  <h1 id="done-h" className="a-display a-rise" style={{ fontFamily: "Alegreya, Georgia, serif", fontWeight: "500", fontSize: "52px", lineHeight: "1.08", letterSpacing: "-0.012em", maxWidth: "13em", textWrap: "balance", animationDelay: "0ms" }}>
                    The session has closed
                  </h1>
                  <p className="a-rise" style={{ marginTop: "20px", maxWidth: "38em", fontSize: "16.5px", lineHeight: "1.5", color: "var(--ivory-2)", animationDelay: "0ms" }}>
                    <span style={{ fontWeight: "400", color: "var(--ivory)" }}>
                      {v.title}
                    </span>
                    {' '}
                    <span style={{ fontWeight: "400", color: "var(--jade)", letterSpacing: "0.02em" }}>
                      {v.course}
                    </span>
                    {v.stoppedLine}
                  </p>
                </>
              )}
              <ol aria-label={`Your attempt, ${v.total} questions`} className="a-rise" style={{ marginTop: "64px", maxWidth: "760px", display: "grid", gridTemplateColumns: `repeat(${v.total}, minmax(0, 1fr))`, animationDelay: "60ms" }}>
                {v.nodes.map((n, n_i) => (
                  <Fragment key={n.key ?? n_i}>
                    <li style={{ display: "flex", flexDirection: "column", gap: "14px", minWidth: "0" }}>
                      <div style={{ display: "flex", alignItems: "center", height: "26px" }}>
                        {n.done && (
                          <>
                            <span aria-hidden="true" className={n.markCls} style={{ flex: "none", width: "26px", height: "26px", borderRadius: "50%", background: "var(--ivory)", display: "grid", placeItems: "center" }}>
                              <svg width="14" height="14" viewBox="0 0 12 12" style={{ fill: "none", stroke: "var(--night-indigo)", strokeWidth: "2", strokeLinecap: "round", strokeLinejoin: "round" }}>
                                <path d="M2.5 6.3 5 8.6 9.6 3.6" />
                              </svg>
                            </span>
                          </>
                        )}
                        {n.current && (
                          <>
                            <span aria-hidden="true" style={{ flex: "none", width: "26px", height: "26px", borderRadius: "50%", background: "var(--lantern-gold)", color: "var(--night-indigo)", display: "grid", placeItems: "center", fontSize: "12.5px", fontWeight: "600" }}>
                              {n.num}
                            </span>
                          </>
                        )}
                        {n.upcoming && (
                          <>
                            <span aria-hidden="true" style={{ flex: "none", width: "26px", height: "26px", borderRadius: "50%", border: "1.5px solid var(--night-edge)", display: "grid", placeItems: "center", fontSize: "12.5px", fontWeight: "500", color: "var(--ivory-2)" }}>
                              {n.num}
                            </span>
                          </>
                        )}
                        {n.missed && (
                          <>
                            <span aria-hidden="true" className="a-pop" style={{ flex: "none", width: "26px", height: "26px", borderRadius: "50%", border: "1.5px dashed var(--ivory-3)", display: "grid", placeItems: "center", fontSize: "12.5px", fontWeight: "500", color: "var(--ivory-3)" }}>
                              {n.num}
                            </span>
                          </>
                        )}
                        <span aria-hidden="true" style={{ flex: "1", height: "1px", margin: "0 12px", background: "rgba(246,241,231,0.22)", opacity: n.lineO }} />
                      </div>
                      <div style={{ display: "flex", flexDirection: "column", gap: "3px", paddingRight: "12px" }}>
                        <span style={{ fontSize: "14px", fontWeight: "500", lineHeight: "1.3" }}>
                          Question{' '}{n.num}
                        </span>
                        <span className={n.noteCls} style={{ fontSize: "13.5px", lineHeight: "1.4", fontWeight: "400", color: n.noteC }}>
                          {n.note}
                        </span>
                      </div>
                    </li>
                  </Fragment>
                ))}
              </ol>
            </section>
            <aside aria-labelledby="next-h" className="a-rise" style={{ display: "flex", flexDirection: "column", paddingTop: "6px", animationDelay: "120ms" }}>
              <h2 id="next-h" style={{ fontSize: "24px", fontWeight: "500", lineHeight: "1.3", letterSpacing: "-0.005em" }}>
                What happens next
              </h2>
              <ol style={{ marginTop: "28px", display: "flex", flexDirection: "column" }}>
                <li style={{ position: "relative", display: "grid", gridTemplateColumns: "20px minmax(0, 1fr)", columnGap: "16px", paddingBottom: "26px" }}>
                  <span aria-hidden="true" style={{ position: "absolute", left: "9.5px", top: "26px", bottom: "4px", width: "1px", background: "rgba(246,241,231,0.22)" }} />
                  <svg width="20" height="20" viewBox="0 0 16 16" aria-hidden="true" style={{ marginTop: "1px" }}>
                    <circle cx="8" cy="8" r="6.25" style={{ fill: "none", stroke: "var(--ivory)", strokeWidth: "1.5" }} />
                    <circle className="a-moon-fill" cx="8" cy="8" r="6.25" style={{ fill: "var(--ivory)", animationDelay: "600ms" }} />
                  </svg>
                  <p style={{ fontSize: "16px", fontWeight: "400", lineHeight: "1.4" }}>
                    Your answers are saved
                  </p>
                  <p style={{ gridColumn: "2", marginTop: "4px", fontSize: "14.5px", lineHeight: "1.5", color: "var(--ivory-2)" }}>
                    {v.savedLine}
                  </p>
                </li>
                <li style={{ position: "relative", display: "grid", gridTemplateColumns: "20px minmax(0, 1fr)", columnGap: "16px", paddingBottom: "26px" }}>
                  <span aria-hidden="true" style={{ position: "absolute", left: "9.5px", top: "26px", bottom: "4px", width: "1px", background: "rgba(246,241,231,0.22)" }} />
                  <svg width="20" height="20" viewBox="0 0 16 16" aria-hidden="true" style={{ marginTop: "1px" }}>
                    <circle cx="8" cy="8" r="6.25" style={{ fill: "none", stroke: "var(--lantern-gold)", strokeWidth: "1.5" }} />
                    <path d="M8 1.75a6.25 6.25 0 0 1 0 12.5a2.6 6.25 0 0 0 0-12.5z" style={{ fill: "var(--lantern-gold)" }} />
                  </svg>
                  <p style={{ fontSize: "16px", fontWeight: "400", lineHeight: "1.4" }}>
                    AIVES suggests a score for each question
                  </p>
                  <p style={{ gridColumn: "2", marginTop: "4px", fontSize: "14.5px", lineHeight: "1.5", color: "var(--lantern-gold)" }}>
                    A suggestion only, not your grade.
                  </p>
                </li>
                <li style={{ position: "relative", display: "grid", gridTemplateColumns: "20px minmax(0, 1fr)", columnGap: "16px", paddingBottom: "26px" }}>
                  <span aria-hidden="true" style={{ position: "absolute", left: "9.5px", top: "26px", bottom: "4px", width: "1px", background: "rgba(246,241,231,0.22)" }} />
                  <svg width="20" height="20" viewBox="0 0 16 16" aria-hidden="true" style={{ marginTop: "1px" }}>
                    <circle cx="8" cy="8" r="6.25" style={{ fill: "none", stroke: "var(--ivory-2)", strokeWidth: "1.5" }} />
                  </svg>
                  <p style={{ fontSize: "16px", fontWeight: "400", lineHeight: "1.4" }}>
                    Your lecturer decides
                  </p>
                  <p style={{ gridColumn: "2", marginTop: "4px", fontSize: "14.5px", lineHeight: "1.5", color: "var(--ivory-2)" }}>
                    They read your answers, set your final score and confirm it.
                  </p>
                </li>
                <li style={{ position: "relative", display: "grid", gridTemplateColumns: "20px minmax(0, 1fr)", columnGap: "16px" }}>
                  <svg width="20" height="20" viewBox="0 0 16 16" aria-hidden="true" style={{ marginTop: "1px" }}>
                    <circle cx="8" cy="8" r="6.25" style={{ fill: "none", stroke: "var(--ivory-2)", strokeWidth: "1.5" }} />
                  </svg>
                  <p style={{ fontSize: "16px", fontWeight: "400", lineHeight: "1.4" }}>
                    Your report opens
                  </p>
                  <p style={{ gridColumn: "2", marginTop: "4px", fontSize: "14.5px", lineHeight: "1.5", color: "var(--ivory-2)" }}>
                    Until then it says it is waiting for your lecturer.
                  </p>
                </li>
              </ol>
              <Link to={paths.studentHome} className="a-btn a-btn-primary" style={{ marginTop: "40px", height: "52px", width: "100%", display: "inline-flex", alignItems: "center", justifyContent: "center", gap: "10px", border: "0", borderRadius: "14px", background: "var(--ivory)", color: "var(--night-indigo)", fontSize: "16px", fontWeight: "500", textDecoration: "none", boxShadow: "0 10px 28px -12px rgba(0,0,0,0.55)" }}>
                <svg width="18" height="18" viewBox="0 0 24 24" aria-hidden="true" style={{ fill: "none", stroke: "currentColor", strokeWidth: "1.75", strokeLinecap: "round", strokeLinejoin: "round" }}>
                  <path d="M19 12H5" />
                  <path d="m11 18-6-6 6-6" />
                </svg>
                Back to my exams
              </Link>
            </aside>
          </main>
          <footer className="a-gutter" style={{ position: "relative", zIndex: "1", boxSizing: "border-box", width: "100%", maxWidth: "1440px", margin: "0 auto", padding: "0 64px 32px", display: "flex", flexWrap: "wrap", alignItems: "center", justifyContent: "space-between", gap: "8px 24px" }}>
            <SampleNote style={{ marginTop: '0', paddingTop: '0' }}>Sample data: names, times and counts are not real.</SampleNote>
          </footer>
        </>
      )}
    </div>
  )
}
