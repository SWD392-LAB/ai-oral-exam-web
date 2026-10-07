import { Fragment, useEffect } from 'react'
import { Link, useParams } from 'react-router-dom'
import { paths } from '../../app/routes/paths.js'
import { reportingApi } from '../../api/services.js'
import { SampleNote } from '../../components/SampleNote.jsx'
import { StudentTopBar } from '../../components/TopBar.jsx'
import { useLoad } from '../../hooks/useLoad.js'
import { useMergeState } from '../../hooks/useMergeState.js'
import { prefersReducedMotion } from '../../hooks/useNow.js'
import { useTimeouts } from '../../hooks/useTimeouts.js'
import { atLeast } from '../../utils/async.js'
import { formatClock, formatDay, formatLongDay, formatScore } from '../../utils/format.js'
import { WAVE_BARS, waveBars, wordTiming } from '../../utils/playback.js'
import './StudentReport.css'

const TICK = 8 // playhead updates per second (the mock has no recordings; the real API sends audioUrl)

// The student's report opens only after the lecturer confirms the final score (F6)
export default function StudentReportPage() {
  const { attemptId } = useParams()
  const { data: r, reload } = useLoad(() => reportingApi.myReport(attemptId), [attemptId])
  const [s, setState] = useMergeState({ q: 0, prevQ: 0, turning: false, key: null, pos: 0, playing: false, check: 'idle' })
  const { later, clear } = useTimeouts()
  const confirmed = r?.status === 'Finalized'
  const Q = confirmed ? r.questions : []

  // plays the first answer once, the way the wireframe opens the report
  useEffect(() => {
    if (!confirmed || prefersReducedMotion()) return undefined
    const t = setTimeout(() => setState((p) => (p.key ? {} : { key: '0-1', pos: 0, playing: true })), 1300)
    return () => clearTimeout(t)
  }, [confirmed, setState])

  const turnOf = (key) => { const [qi, ti] = key.split('-').map(Number); return Q[qi]?.turns[ti] }
  useEffect(() => {
    if (!s.playing || !s.key) return undefined
    const iv = setInterval(() => setState((p) => {
      const t = turnOf(p.key)
      if (!t) return { playing: false }
      const max = t.durationSeconds * TICK
      return p.pos + 1 >= max ? { pos: max, playing: false } : { pos: p.pos + 1 }
    }), 1000 / TICK)
    return () => clearInterval(iv)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [s.playing, s.key])

  const pick = (i) => {
    if (s.turning || i === s.q || i < 0 || i >= Q.length) return
    clear()
    setState({ prevQ: s.q, q: i, turning: true, playing: false, key: null, pos: 0 })
    later(() => setState({ turning: false }), 950)
  }
  const play = (key, from) => setState({ key, pos: from, playing: true })

  // a question's dialogue: each main question or follow-up, then the answer with its player
  const face = (qi, cls, live) => {
    const d = Q[qi]
    const turns = []
    let fu = 0
    d.turns.forEach((t, ti) => {
      if (t.type === 'FollowUp') turns.push({ isAI: true, isYou: false, label: `Follow-up ${++fu}`, text: t.questionText })
      const key = `${qi}-${ti}`
      const active = live && s.key === key
      const max = t.durationSeconds * TICK
      const pos = active ? s.pos : 0
      const playing = active && s.playing
      const frac = pos / max
      const timing = wordTiming(t.answerText, t.durationSeconds)
      const sec = pos / TICK
      const started = active && pos > 0 && pos < max
      const cur = timing.findIndex((o) => sec >= o.s && sec < o.e)
      turns.push({
        isAI: false, isYou: true, key, dur: `${t.durationSeconds} s`,
        words: timing.map((o, i) => ({
          w: o.w, sp: i < timing.length - 1 ? ' ' : '',
          c: !started ? 'var(--ivory)' : sec >= o.e ? 'var(--ivory)' : i === cur ? 'var(--ember-text)' : 'var(--ivory-3)',
          bg: started && i === cur ? 'rgba(232,69,44,0.14)' : 'rgba(232,69,44,0)',
        })),
        bars: waveBars(qi * 3 + ti + 1).map((h, i) => ({ h, c: active && (i + 0.5) / WAVE_BARS <= frac ? 'var(--ivory)' : 'rgba(246,241,231,0.22)' })),
        playing, paused: !playing,
        playLabel: playing ? 'Pause this answer' : 'Play this answer',
        seekLabel: `Position in your answer to question ${qi + 1}`,
        toggle: () => { if (playing) setState({ playing: false }); else play(key, active && pos < max ? pos : 0) },
        seek: (e) => setState({ key, pos: Math.min(max, Math.max(0, Number(e.target.value))), playing: true }),
        max, pos, pct: (frac * 100).toFixed(2), headO: active ? 1 : 0, dot: playing ? 'var(--lantern-red)' : 'rgba(246,241,231,0.22)',
        now: formatClock(sec), total: formatClock(t.durationSeconds), timeText: `${formatClock(sec)} of ${formatClock(t.durationSeconds)}`,
      })
    })
    return {
      cls, num: qi + 1, text: d.text, ai: formatScore(d.ai.score), max: formatScore(d.maxScore), comment: d.ai.comment,
      position: cls === 'a-turn-out' ? 'absolute' : 'relative', inset: cls === 'a-turn-out' ? '64px' : 'auto',
      prev: () => pick(qi - 1), next: () => pick(qi + 1),
      prevOff: qi === 0, nextOff: qi === Q.length - 1,
      notReached: !d.reached,
      turns,
    }
  }
  const faces = !confirmed ? [] : s.turning ? [face(s.prevQ, 'a-turn-out', false), face(s.q, 'a-turn-in', true)] : [face(s.q, '', true)]
  const nav = Q.map((d, i) => {
    const cur = i === s.q
    return {
      num: i + 1, ai: formatScore(d.ai.score), max: formatScore(d.maxScore), joint: i > 0, ac: cur ? 'step' : 'false',
      bg: cur ? 'rgba(246,241,231,0.06)' : 'rgba(246,241,231,0)',
      nodeBg: cur ? 'var(--lantern-gold)' : 'rgba(245,183,0,0)', nodeInk: cur ? 'var(--night-indigo)' : 'var(--ivory-2)',
      ring: cur ? 'var(--lantern-gold)' : 'var(--night-edge)',
      ink: cur ? 'var(--ivory)' : 'var(--ivory-2)', weight: cur ? 500 : 400,
      pick: () => pick(i),
    }
  })
  const checkAgain = async () => {
    if (s.check === 'checking') return
    setState({ check: 'checking' })
    await atLeast(reload(true), 1100)
    setState({ check: 'done' })
  }
  const v = {
    confirmed, pending: !!r && !confirmed,
    title: r?.session.title ?? '',
    course: r?.session.courseCode ?? '',
    taken: r ? `Taken ${formatLongDay(r.endedAt ?? r.startedAt)}` : '',
    nav, faces,
    voiceLight: s.playing && !s.turning ? 0.85 : 0,
    checking: s.check === 'checking',
    checkedNow: s.check === 'done',
    checkLabel: s.check === 'checking' ? 'Checking' : 'Check again',
    spinCls: s.check === 'checking' ? 'r-spin' : '',
    checkAgain,
    finalText: confirmed ? formatScore(r.review.finalScore) : '',
    reviewer: r?.review?.reviewerName ?? 'your lecturer',
    confirmedOn: r?.review?.confirmedAt ? formatDay(r.review.confirmedAt) : '',
    lecturerComment: r?.review?.comment ?? '',
    aiTotal: confirmed ? formatScore(r.aiTotal) : '',
    submittedOn: r?.endedAt ? formatDay(r.endedAt) : '',
  }
  return (
    <div className="pg-studentreport" style={{ position: "relative", minHeight: "100vh", display: "flex", flexDirection: "column", overflow: "hidden" }}>
      <StudentTopBar current="home" />
      <main className="a-gutter" style={{ position: "relative", zIndex: "1", flex: "1", width: "100%", maxWidth: "1440px", margin: "0 auto", padding: "40px 64px 72px" }}>
        <div className="a-rise">
          <Link className="a-link" to={paths.studentHome} style={{ display: "inline-flex", alignItems: "center", gap: "6px", minHeight: "44px", fontSize: "14px", color: "var(--ivory-2)" }}>
            <svg width="16" height="16" viewBox="0 0 24 24" aria-hidden="true" style={{ fill: "none", stroke: "currentColor", strokeWidth: "1.75", strokeLinecap: "round", strokeLinejoin: "round" }}>
              <path d="m15 18-6-6 6-6" />
            </svg>
            Back to my exams
          </Link>
          <h1 className="a-title" style={{ marginTop: "14px", fontFamily: "Alegreya, Georgia, serif", fontWeight: "500", fontSize: "44px", lineHeight: "1.08", letterSpacing: "-0.012em", textWrap: "balance" }}>
            {v.title}
          </h1>
          <p style={{ marginTop: "12px", display: "flex", flexWrap: "wrap", gap: "4px 12px", fontSize: "16.5px", color: "var(--ivory-2)" }}>
            <span style={{ color: "var(--jade)", fontWeight: "400" }}>
              {v.course}
            </span>
            <span>
              {v.taken}
            </span>
          </p>
        </div>
        {v.confirmed && (
          <>
            <section aria-labelledby="final-h" className="a-grid-1-sm a-rise" style={{ animationDelay: "60ms", marginTop: "56px", display: "grid", gridTemplateColumns: "minmax(260px, 340px) minmax(0, 1fr)", columnGap: "64px", rowGap: "40px", alignItems: "start" }}>
              <div>
                <div style={{ display: "flex", alignItems: "center", gap: "12px" }}>
                  <svg width="26" height="26" viewBox="0 0 16 16" aria-hidden="true" style={{ flex: "none" }}>
                    <circle cx="8" cy="8" r="6.25" style={{ fill: "none", stroke: "var(--ivory)", strokeWidth: "1.5" }} />
                    <circle className="a-moon-fill" cx="8" cy="8" r="6.25" style={{ fill: "var(--ivory)", animationDelay: "360ms" }} />
                  </svg>
                  <h2 id="final-h" style={{ fontSize: "15px", fontWeight: "500" }}>
                    Final score
                  </h2>
                  <span style={{ fontSize: "13.5px", color: "var(--ivory-2)" }}>
                    confirmed
                  </span>
                </div>
                <p className="a-num" style={{ marginTop: "18px", display: "flex", alignItems: "baseline", gap: "10px" }}>
                  <span className="a-score-xl a-pop" style={{ display: "inline-block", fontSize: "72px", fontWeight: "200", lineHeight: "0.95", letterSpacing: "-0.02em", transformOrigin: "20% 80%", animationDelay: "420ms" }}>
                    {v.finalText}
                  </span>
                  <span style={{ fontSize: "18px", fontWeight: "300", color: "var(--ivory-2)" }}>
                    / 10
                  </span>
                </p>
                <p style={{ marginTop: "18px", fontSize: "15px", color: "var(--ivory-2)" }}>
                  Confirmed by{' '}
                  <span style={{ color: "var(--ivory)", fontWeight: "400" }}>
                    {v.reviewer}
                  </span>
                  {' '}on {v.confirmedOn}
                </p>
              </div>
              <div className="r-split" style={{ paddingLeft: "56px", boxShadow: "inset 1px 0 0 var(--night-line)" }}>
                {v.lecturerComment && (
                <>
                <h3 style={{ fontSize: "14px", fontWeight: "500", color: "var(--ivory-2)" }}>
                  Comment from your lecturer
                </h3>
                <p style={{ marginTop: "14px", maxWidth: "34em", fontSize: "20px", lineHeight: "1.55", fontWeight: "300", textWrap: "pretty" }}>
                  {v.lecturerComment}
                </p>
                </>
                )}
                <p style={{ marginTop: "24px", display: "flex", alignItems: "flex-start", gap: "10px", maxWidth: "40em", fontSize: "15px", lineHeight: "1.5", color: "var(--ivory-2)" }}>
                  <svg width="14" height="14" viewBox="0 0 16 16" aria-hidden="true" style={{ flex: "none", marginTop: "4px" }}>
                    <circle cx="8" cy="8" r="6.25" style={{ fill: "none", stroke: "var(--lantern-gold)", strokeWidth: "1.5" }} />
                    <path d="M8 1.75a6.25 6.25 0 0 1 0 12.5a2.6 6.25 0 0 0 0-12.5z" style={{ fill: "var(--lantern-gold)" }} />
                  </svg>
                  <span>
                    The AI's suggestions below add up to{' '}
                    <span style={{ color: "var(--lantern-gold)", fontWeight: "500" }}>
                      {v.aiTotal}
                    </span>
                    . Your lecturer decides the final score.
                  </span>
                </p>
              </div>
            </section>
            <section aria-labelledby="qs-h" className="a-rise" style={{ marginTop: "88px", animationDelay: "120ms" }}>
              <h2 id="qs-h" style={{ fontSize: "24px", fontWeight: "500", lineHeight: "1.3", letterSpacing: "-0.005em" }}>
                Question by question
              </h2>
              <ol aria-label="Questions in this exam" className="r-qnav" style={{ marginTop: "24px", display: "flex", flexWrap: "wrap", alignItems: "center", rowGap: "8px" }}>
                {v.nav.map((n, n_i) => (
                  <Fragment key={n.key ?? n_i}>
                    {n.joint && (
                      <>
                        <li aria-hidden="true" className="a-hide-sm" style={{ width: "40px", height: "1px", margin: "0 14px", background: "rgba(246,241,231,0.22)" }} />
                      </>
                    )}
                    <li style={{ display: "flex" }}>
                      <button type="button" className="r-qbtn" onClick={n.pick} aria-current={n.ac} style={{ display: "flex", alignItems: "center", gap: "12px", minHeight: "52px", padding: "6px 14px 6px 6px", border: "0", borderRadius: "12px", background: n.bg, cursor: "pointer", textAlign: "left", transition: "background-color .2s ease-out" }}>
                        <span aria-hidden="true" style={{ flex: "none", width: "28px", height: "28px", borderRadius: "50%", display: "grid", placeItems: "center", fontSize: "13px", fontWeight: "600", background: n.nodeBg, color: n.nodeInk, boxShadow: `inset 0 0 0 1.5px ${n.ring}`, transition: "background-color .4s cubic-bezier(0.34,1.32,0.64,1), color .2s ease-out" }}>
                          {n.num}
                        </span>
                        <span style={{ display: "flex", flexDirection: "column", gap: "2px" }}>
                          <span style={{ fontSize: "15px", fontWeight: n.weight, color: n.ink, whiteSpace: "nowrap" }}>
                            Question{' '}{n.num}
                          </span>
                          <span className="a-num" style={{ fontSize: "13.5px", color: "var(--lantern-gold)", whiteSpace: "nowrap" }}>
                            AI{' '}{n.ai}{' '}/ {n.max}
                          </span>
                        </span>
                      </button>
                    </li>
                  </Fragment>
                ))}
              </ol>
              <div style={{ position: "relative", marginTop: "32px", paddingTop: "40px", borderTop: "1px solid var(--night-line)" }}>
                <div aria-hidden="true" style={{ position: "absolute", inset: "0", pointerEvents: "none", zIndex: "0", opacity: v.voiceLight, transition: "opacity .8s ease-out" }}>
                  <div className="a-light a-light-voice" style={{ left: "-260px", top: "120px", width: "980px", height: "760px", background: "radial-gradient(closest-side, rgba(245,170,20,0.34), rgba(232,69,44,0.26) 38%, rgba(232,69,44,0.08) 70%, rgba(232,69,44,0) 100%)" }} />
                </div>
                <div className="a-turn-stage" style={{ position: "relative", zIndex: "1", margin: "0 -64px", padding: "0 64px" }}>
                  {v.faces.map((f, f_i) => (
                    <Fragment key={f.key ?? f_i}>
                      <article className={`${f.cls} a-grid-1-sm`} aria-label={`Question ${f.num}`} style={{ position: f.position, top: "0", left: f.inset, right: f.inset, display: "grid", gridTemplateColumns: "minmax(0, 1fr) 352px", columnGap: "72px", rowGap: "40px", alignItems: "start" }}>
                        <div style={{ minWidth: "0" }}>
                          <p style={{ display: "flex", alignItems: "center", gap: "10px", fontSize: "14px", fontWeight: "500", color: "var(--ivory-2)" }}>
                            <svg width="18" height="18" viewBox="0 0 26 26" aria-hidden="true" style={{ flex: "none", fill: "none", stroke: "var(--lantern-gold)", strokeWidth: "1.9", strokeLinecap: "round", strokeLinejoin: "round" }}>
                              <path d="M4 10.2h3.6L12.4 6v14l-4.8-4.2H4z" />
                              <path d="M16.4 9.6a5 5 0 0 1 0 6.8" />
                              <path d="M19.4 6.8a9 9 0 0 1 0 12.4" />
                            </svg>
                            <span>
                              Question{' '}{f.num}, asked by AIVES
                            </span>
                          </p>
                          <h3 style={{ marginTop: "14px", maxWidth: "34em", fontFamily: "Alegreya, Georgia, serif", fontWeight: "500", fontSize: "26px", lineHeight: "1.28", textWrap: "balance" }}>
                            {f.text}
                          </h3>
                          <ol aria-label="Dialogue" style={{ marginTop: "36px", display: "flex", flexDirection: "column", gap: "32px" }}>
                            {f.turns.map((t, t_i) => (
                              <Fragment key={t.key ?? t_i}>
                                <li style={{ display: "flex", flexDirection: "column", gap: "12px" }}>
                                  {t.isAI && (
                                    <>
                                      <p style={{ display: "flex", alignItems: "center", gap: "10px", fontSize: "14px", fontWeight: "500", color: "var(--lantern-gold)" }}>
                                        <svg width="16" height="16" viewBox="0 0 26 26" aria-hidden="true" style={{ flex: "none", fill: "none", stroke: "currentColor", strokeWidth: "2", strokeLinecap: "round", strokeLinejoin: "round" }}>
                                          <path d="M4 10.2h3.6L12.4 6v14l-4.8-4.2H4z" />
                                          <path d="M16.4 9.6a5 5 0 0 1 0 6.8" />
                                        </svg>
                                        <span>
                                          {t.label}
                                        </span>
                                      </p>
                                      <p style={{ maxWidth: "34em", fontFamily: "Alegreya, Georgia, serif", fontWeight: "500", fontSize: "22px", lineHeight: "1.3" }}>
                                        {t.text}
                                      </p>
                                    </>
                                  )}
                                  {t.isYou && (
                                    <>
                                      <p style={{ display: "flex", alignItems: "center", gap: "10px", fontSize: "14px", fontWeight: "500", color: "var(--ivory-2)" }}>
                                        <span aria-hidden="true" style={{ width: "7px", height: "7px", borderRadius: "50%", background: t.dot, transition: "background-color .3s ease-out" }} />
                                        Your answer
                                        <span style={{ fontWeight: "400", color: "var(--ivory-3)" }}>
                                          {t.dur}
                                        </span>
                                      </p>
                                      <div style={{ display: "flex", alignItems: "center", gap: "16px", maxWidth: "760px" }}>
                                        <button type="button" className="a-btn a-btn-primary" onClick={t.toggle} aria-label={t.playLabel} style={{ flex: "none", width: "44px", height: "44px", padding: "0", display: "grid", placeItems: "center", border: "0", borderRadius: "50%", background: "var(--ivory)", color: "var(--night-indigo)", boxShadow: "0 10px 28px -12px rgba(0,0,0,0.55)" }}>
                                          {t.playing && (
                                            <>
                                              <svg className="a-pop" width="16" height="16" viewBox="0 0 16 16" aria-hidden="true">
                                                <rect x="3.5" y="2.5" width="3" height="11" rx="1" style={{ fill: "currentColor" }} />
                                                <rect x="9.5" y="2.5" width="3" height="11" rx="1" style={{ fill: "currentColor" }} />
                                              </svg>
                                            </>
                                          )}
                                          {t.paused && (
                                            <>
                                              <svg className="a-pop" width="16" height="16" viewBox="0 0 16 16" aria-hidden="true">
                                                <path d="M4.5 2.6v10.8L13.4 8z" style={{ fill: "currentColor" }} />
                                              </svg>
                                            </>
                                          )}
                                        </button>
                                        <div className="r-wave" style={{ position: "relative", flex: "1", minWidth: "0", height: "44px", display: "flex", alignItems: "center", gap: "3px" }}>
                                          {t.bars.map((b, b_i) => (
                                            <Fragment key={b.key ?? b_i}>
                                              <span aria-hidden="true" className="r-bar" style={{ flex: "1", minWidth: "2px", height: `${b.h}px`, borderRadius: "2px", background: b.c, transition: "background-color .25s ease-out" }} />
                                            </Fragment>
                                          ))}
                                          <div aria-hidden="true" className="a-playhead" style={{ position: "absolute", inset: "0", pointerEvents: "none", transform: `translateX(${t.pct}%)`, opacity: t.headO }}>
                                            <span style={{ position: "absolute", left: "-1px", top: "0", bottom: "0", width: "2px", borderRadius: "1px", background: "var(--lantern-red)" }} />
                                          </div>
                                          <input type="range" className="r-seek" min="0" max={t.max} step="1" value={t.pos} onChange={t.seek} aria-label={t.seekLabel} aria-valuetext={t.timeText} style={{ position: "absolute", inset: "0", width: "100%", height: "100%", margin: "0", opacity: "0", cursor: "pointer" }} />
                                        </div>
                                        <span className="a-num" style={{ flex: "none", minWidth: "92px", textAlign: "right", fontSize: "13.5px", color: "var(--ivory-2)", whiteSpace: "nowrap" }}>
                                          <span style={{ fontWeight: "500", color: "var(--ivory)" }}>
                                            {t.now}
                                          </span>
                                          {' '}of{' '}{t.total}
                                        </span>
                                      </div>
                                      <p style={{ maxWidth: "40em", fontSize: "18px", lineHeight: "1.6", fontWeight: "300" }}>
                                        {t.words.map((w, w_i) => (
                                          <Fragment key={w.key ?? w_i}>
                                            <span style={{ color: w.c, background: w.bg, borderRadius: "4px", boxShadow: `0 0 0 2px ${w.bg}`, transition: "color .2s ease-out, background-color .2s ease-out, box-shadow .2s ease-out" }}>
                                              {w.w}
                                            </span>
                                            {w.sp}
                                          </Fragment>
                                        ))}
                                      </p>
                                    </>
                                  )}
                                </li>
                              </Fragment>
                            ))}
                          </ol>
                        </div>
                        <aside aria-label={`AI suggestion for question ${f.num}`} style={{ display: "flex", flexDirection: "column", gap: "28px" }}>
                          <div style={{ display: "flex", flexDirection: "column", gap: "16px", padding: "24px 24px 22px", borderRadius: "16px", border: "1.5px dashed var(--lantern-gold)", background: "var(--ai-wash)" }}>
                            <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
                              <svg width="20" height="20" viewBox="0 0 16 16" aria-hidden="true" style={{ flex: "none" }}>
                                <circle cx="8" cy="8" r="6.25" style={{ fill: "none", stroke: "var(--lantern-gold)", strokeWidth: "1.5" }} />
                                <path d="M8 1.75a6.25 6.25 0 0 1 0 12.5a2.6 6.25 0 0 0 0-12.5z" style={{ fill: "var(--lantern-gold)" }} />
                              </svg>
                              <span style={{ fontSize: "15px", fontWeight: "500", color: "var(--lantern-gold)" }}>
                                AI suggests
                              </span>
                              <span style={{ marginLeft: "auto", fontSize: "13px", color: "var(--lantern-gold)" }}>
                                provisional
                              </span>
                            </div>
                            <p className="a-num" style={{ display: "flex", alignItems: "baseline", gap: "8px", color: "var(--lantern-gold)" }}>
                              <span style={{ fontSize: "56px", fontWeight: "200", lineHeight: "1", letterSpacing: "-0.02em" }}>
                                {f.ai}
                              </span>
                              <span style={{ fontSize: "18px", fontWeight: "300" }}>
                                / {f.max}
                              </span>
                            </p>
                            <div style={{ paddingTop: "16px", borderTop: "1px dashed rgba(245,183,0,0.4)" }}>
                              <p style={{ fontSize: "14px", fontWeight: "500", color: "var(--lantern-gold)" }}>
                                AI comment · read only
                              </p>
                              <p style={{ marginTop: "8px", fontSize: "15px", lineHeight: "1.55", color: "var(--ivory)" }}>
                                {f.comment}
                              </p>
                            </div>
                          </div>
                          <div style={{ display: "flex", gap: "10px" }}>
                            <button type="button" className="a-btn a-btn-secondary" onClick={f.prev} aria-disabled={f.prevOff} style={{ flex: "1", height: "44px", padding: "0 14px", display: "inline-flex", alignItems: "center", justifyContent: "center", gap: "8px", borderRadius: "12px", border: "1px solid var(--night-edge)", background: "transparent", fontSize: "15px", fontWeight: "500" }}>
                              <svg width="18" height="18" viewBox="0 0 24 24" aria-hidden="true" style={{ fill: "none", stroke: "currentColor", strokeWidth: "1.75", strokeLinecap: "round", strokeLinejoin: "round" }}>
                                <path d="m15 18-6-6 6-6" />
                              </svg>
                              Previous
                            </button>
                            <button type="button" className="a-btn a-btn-secondary" onClick={f.next} aria-disabled={f.nextOff} style={{ flex: "1", height: "44px", padding: "0 14px", display: "inline-flex", alignItems: "center", justifyContent: "center", gap: "8px", borderRadius: "12px", border: "1px solid var(--night-edge)", background: "transparent", fontSize: "15px", fontWeight: "500" }}>
                              Next question
                              <svg width="18" height="18" viewBox="0 0 24 24" aria-hidden="true" style={{ fill: "none", stroke: "currentColor", strokeWidth: "1.75", strokeLinecap: "round", strokeLinejoin: "round" }}>
                                <path d="m9 6 6 6-6 6" />
                              </svg>
                            </button>
                          </div>
                        </aside>
                      </article>
                    </Fragment>
                  ))}
                </div>
              </div>
            </section>
          </>
        )}
        {v.pending && (
          <>
            <section aria-labelledby="wait-h" style={{ marginTop: "64px", maxWidth: "760px" }}>
              <div className="a-rise" style={{ display: "grid", gridTemplateColumns: "26px minmax(0, 1fr)", columnGap: "14px", rowGap: "10px", animationDelay: "60ms" }}>
                <svg className="a-candle" width="26" height="26" viewBox="0 0 16 16" aria-hidden="true" style={{ marginTop: "3px" }}>
                  <circle cx="8" cy="8" r="6.25" style={{ fill: "none", stroke: "var(--lantern-gold)", strokeWidth: "1.5" }} />
                  <path d="M8 1.75a6.25 6.25 0 0 1 0 12.5a2.6 6.25 0 0 0 0-12.5z" style={{ fill: "var(--lantern-gold)" }} />
                </svg>
                <h2 id="wait-h" style={{ fontSize: "24px", fontWeight: "500", lineHeight: "1.3", letterSpacing: "-0.005em" }}>
                  Waiting for your lecturer
                </h2>
                <p style={{ gridColumn: "2", maxWidth: "36em", fontSize: "16.5px", lineHeight: "1.5", color: "var(--ivory-2)" }}>
                  Your lecturer has not confirmed your score yet. Your report, with the AI's comment on every question and the full dialogue, opens here once they do.
                </p>
              </div>
              <ol aria-label="What happens to your attempt" className="a-rise" style={{ marginTop: "48px", display: "flex", flexDirection: "column", animationDelay: "120ms" }}>
                <li style={{ display: "grid", gridTemplateColumns: "26px minmax(0, 1fr)", columnGap: "14px", paddingBottom: "28px", position: "relative" }}>
                  <span aria-hidden="true" style={{ position: "absolute", left: "12.5px", top: "30px", bottom: "4px", width: "1px", background: "rgba(246,241,231,0.22)" }} />
                  <svg width="20" height="20" viewBox="0 0 16 16" aria-hidden="true" style={{ margin: "2px 0 0 3px" }}>
                    <circle cx="8" cy="8" r="6.25" style={{ fill: "var(--ivory)", stroke: "var(--ivory)", strokeWidth: "1.5" }} />
                  </svg>
                  <div>
                    <p style={{ fontSize: "16px", fontWeight: "500" }}>
                      Exam submitted
                    </p>
                    <p style={{ marginTop: "2px", fontSize: "14px", color: "var(--ivory-2)" }}>
                      {v.submittedOn}
                    </p>
                  </div>
                </li>
                <li style={{ display: "grid", gridTemplateColumns: "26px minmax(0, 1fr)", columnGap: "14px", paddingBottom: "28px", position: "relative" }}>
                  <span aria-hidden="true" style={{ position: "absolute", left: "12.5px", top: "30px", bottom: "4px", width: "1px", background: "rgba(246,241,231,0.22)" }} />
                  <svg width="20" height="20" viewBox="0 0 16 16" aria-hidden="true" style={{ margin: "2px 0 0 3px" }}>
                    <circle cx="8" cy="8" r="6.25" style={{ fill: "none", stroke: "var(--lantern-gold)", strokeWidth: "1.5" }} />
                    <path d="M8 1.75a6.25 6.25 0 0 1 0 12.5a2.6 6.25 0 0 0 0-12.5z" style={{ fill: "var(--lantern-gold)" }} />
                  </svg>
                  <div>
                    <p style={{ fontSize: "16px", fontWeight: "500" }}>
                      The AI suggested a score for each question
                    </p>
                    <p style={{ marginTop: "2px", fontSize: "14px", color: "var(--ivory-2)" }}>
                      Suggestions only. You see them with your report.
                    </p>
                  </div>
                </li>
                <li aria-current="step" style={{ display: "grid", gridTemplateColumns: "26px minmax(0, 1fr)", columnGap: "14px" }}>
                  <svg width="20" height="20" viewBox="0 0 16 16" aria-hidden="true" style={{ margin: "2px 0 0 3px" }}>
                    <circle cx="8" cy="8" r="6.25" style={{ fill: "none", stroke: "var(--ivory-2)", strokeWidth: "1.5" }} />
                  </svg>
                  <div>
                    <p style={{ fontSize: "16px", fontWeight: "500" }}>
                      Your lecturer confirms the final score
                    </p>
                    <p style={{ marginTop: "2px", fontSize: "14px", color: "var(--ivory-2)" }}>
                      Not yet
                    </p>
                  </div>
                </li>
              </ol>
              <div className="a-rise a-wrap-sm" style={{ marginTop: "48px", display: "flex", alignItems: "center", gap: "16px", animationDelay: "120ms" }}>
                <Link to={paths.studentHome} className="a-btn a-btn-primary" style={{ height: "52px", padding: "0 24px", display: "inline-flex", alignItems: "center", borderRadius: "14px", background: "var(--ivory)", color: "var(--night-indigo)", fontSize: "16px", fontWeight: "500", textDecoration: "none", boxShadow: "0 10px 28px -12px rgba(0,0,0,0.55)" }}>
                  Back to my exams
                </Link>
                <button type="button" className="a-btn a-btn-secondary" onClick={v.checkAgain} aria-disabled={v.checking} style={{ height: "44px", padding: "0 18px", display: "inline-flex", alignItems: "center", gap: "10px", borderRadius: "12px", border: "1px solid var(--night-edge)", background: "transparent", fontSize: "15px", fontWeight: "500" }}>
                  <svg className={v.spinCls} width="18" height="18" viewBox="0 0 24 24" aria-hidden="true" style={{ fill: "none", stroke: "currentColor", strokeWidth: "1.75", strokeLinecap: "round", strokeLinejoin: "round" }}>
                    <path d="M20 12a8 8 0 1 1-2.34-5.66" />
                    <path d="M20 4v4.5h-4.5" />
                  </svg>
                  {v.checkLabel}
                </button>
                <p aria-live="polite" style={{ fontSize: "14px", color: "var(--ivory-2)" }}>
                  {v.checkedNow && (
                    <>
                      <span className="a-just" style={{ display: "inline-flex", alignItems: "center", gap: "8px" }}>
                        <span aria-hidden="true" style={{ width: "6px", height: "6px", borderRadius: "50%", background: "var(--jade)" }} />
                        Still waiting · checked just now
                      </span>
                    </>
                  )}
                </p>
              </div>
            </section>
          </>
        )}
        <SampleNote style={{ marginTop: '88px', paddingTop: '0' }}>Sample data: names, scores and times are examples.</SampleNote>
      </main>
    </div>
  )
}
