import { Fragment, useEffect } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { paths } from '../../app/routes/paths.js'
import { examConfigApi, reportingApi } from '../../api/services.js'
import { SampleNote } from '../../components/SampleNote.jsx'
import { StaffTopBar } from '../../components/TopBar.jsx'
import { useLoad } from '../../hooks/useLoad.js'
import { useMergeState } from '../../hooks/useMergeState.js'
import { prefersReducedMotion } from '../../hooks/useNow.js'
import { useTimeouts } from '../../hooks/useTimeouts.js'
import { formatScore, formatTime, plural } from '../../utils/format.js'
import { PENDING } from '../../utils/pending.js'
import { downloadGradeSheet } from './gradeSheet.js'

const BAR = 220
const band = (i) => `${i} to ${i + 1}`

// Final scores (the lecturer's) make the distribution; the AI's per-question scores make the question list.
// Only attempts with a confirmed final score are counted (F6).
export default function ClassStatsPage() {
  const [params, setParams] = useSearchParams()
  const { data: sessions } = useLoad(() => examConfigApi.list(), [])
  const options = (sessions ?? []).filter((x) => x.phase === 'Closed' || x.phase === 'Open now')
  const key = params.get('session') ?? options.find((x) => x.phase === 'Closed')?.id ?? options[0]?.id
  const { data: d } = useLoad(() => (key ? reportingApi.statistics(key) : Promise.resolve(null)), [key])
  const [s, setState] = useMergeState({ grown: false, band: null, exp: 'idle', exN: 0, changed: false, flip: false, qchanged: false, qflip: false, bflip: false, order: 'hard' })
  const { later, clear } = useTimeouts()
  const rm = prefersReducedMotion()

  useEffect(() => {
    if (!d) return undefined
    const t = setTimeout(() => setState({ grown: true }), rm ? 0 : 280)
    return () => clearTimeout(t)
  }, [d, rm, setState])

  const go = (id) => {
    clear()
    setParams({ session: id })
    setState((p) => ({ band: null, exp: 'idle', changed: true, flip: !p.flip, qchanged: true, qflip: !p.qflip }))
  }
  const counts = d?.counts ?? Array(10).fill(0)
  const total = counts.reduce((a, c) => a + c, 0)
  const max = Math.max(1, ...counts)
  const sel = s.band
  const tick = s.flip ? 'a-tick-a' : 'a-tick-b'
  const dur = rm ? '0s' : '0.7s'
  const bins = counts.map((c, i) => {
    const h = s.grown ? Math.round((c / max) * BAR) : 0
    return {
      count: c, lo: String(i), last: i === 9,
      barT: `scaleY(${(h / BAR).toFixed(4)})`, liftT: `translateY(-${h}px)`,
      delay: (s.changed ? i * 30 : i * 50) + 'ms', labelOp: s.grown ? 1 : 0,
      op: sel === null || sel === i ? 1 : 0.32, pressed: sel === i ? 'true' : 'false',
      weight: sel === i ? 500 : 300, ink: c ? 'var(--ivory)' : 'var(--ivory-3)',
      tick: s.changed ? tick : '', aria: `Final score ${band(i)}: ${plural(c, 'student')}`,
      pick: () => { if (total) setState((p) => ({ band: sel === i ? null : i, bflip: !p.bflip })) },
    }
  })
  let insight = 'No confirmed scores yet', insightMeta = 'Scores appear here as you confirm attempts.', lowNote = ''
  if (total) {
    let best = 0, at = 0
    for (let i = 0; i <= 7; i++) { const w = counts[i] + counts[i + 1] + counts[i + 2]; if (w > best) { best = w; at = i } }
    insight = `Most final scores fall between ${at} and ${at + 3}`
    insightMeta = `${best} of the ${total} final scores you confirmed`
    const low = counts[0] + counts[1] + counts[2] + counts[3]
    lowNote = `${low === 0 ? 'No student' : low === 1 ? 'One student' : `${low} students`} scored below 4.`
  }
  const list = (d?.questions ?? []).slice().sort((a, b) => (s.order === 'hard' ? a.avg - b.avg : a.order - b.order))
  const qs = list.map((q, i) => ({
    key: q.order, n: `Question ${q.order}`, text: q.text, avg: q.avg.toFixed(1), max: formatScore(q.maxScore), good: q.good, of: total,
    fillT: `scaleX(${s.grown && total ? (q.good / total).toFixed(4) : 0})`,
    mDelay: (s.qchanged ? 0 : 420 + i * 70) + 'ms',
    cls: s.qchanged ? (s.qflip ? 'a-tick-a' : 'a-tick-b') : '',
    delay: i * 50 + 'ms',
  }))
  const orders = [['hard', 'Hardest first'], ['exam', 'Exam order']].map(([k, label]) => {
    const on = s.order === k
    return {
      key: k, label, pressed: on ? 'true' : 'false', disabled: total ? 'false' : 'true',
      cls: on ? 'a-btn-secondary' : 'a-btn-quiet',
      border: on ? '1px solid var(--night-indigo)' : '1px solid transparent',
      bg: on ? 'var(--field-white)' : 'transparent', ink: on ? 'var(--night-indigo)' : 'var(--ink-2)',
      pick: () => { if (total && !on) setState((p) => ({ order: k, qchanged: true, qflip: !p.qflip })) },
    }
  })
  const rows = d?.rows ?? 0
  const pending = rows - total
  const c = sel === null ? 0 : counts[sel]
  const exportNow = async () => {
    if (s.exp === 'running' || !key) return
    clear()
    setState({ exp: 'running', exN: 0 })
    const [file, results] = await Promise.all([reportingApi.exportGradeSheet(key), reportingApi.results(key)])
    const step = Math.max(1, Math.ceil(rows / 8))
    const fill = (n) => {
      setState({ exN: n })
      if (n < rows) later(() => fill(Math.min(rows, n + step)), 260)
      else later(() => { setState({ exp: 'done' }); downloadGradeSheet(file.fileName, results.rows) }, 320)
    }
    fill(0)
  }
  const isOpen = d?.session.phase === 'Open now'
  const v = {
    key: key ?? '', setSession: (e) => go(e.target.value),
    confirmed: total, waiting: d?.waiting ?? 0,
    hasWaiting: !isOpen && (d?.waiting ?? 0) > 0, isOpen, noneWaiting: !!d && !isOpen && d.waiting === 0,
    openUntil: d ? formatTime(d.session.endAt) : '',
    tickCls: s.changed ? tick : '',
    insight, insightMeta, lowNote, moonFill: total ? 'var(--ivory)' : 'transparent',
    hasScores: total > 0, noScores: !!d && total === 0,
    bandOff: sel === null, bandOn: sel !== null,
    bandLabel: sel === null ? '' : `Final score ${band(sel)}`,
    bandCount: c,
    bandUnit: (c === 1 ? 'student' : 'students') + (total ? ` · ${Math.round((c / total) * 100)}% of ${total}` : ''),
    bandTick: s.bflip ? 'a-tick-a' : 'a-tick-b',
    clearBand: () => setState({ band: null }),
    bins, dur,
    qHeading: s.order === 'hard' ? 'Questions, hardest first' : 'Questions in exam order',
    qs, orders,
    expBusy: s.exp === 'running' ? 'true' : 'false',
    expLabel: s.exp === 'running' ? 'Exporting…' : 'Export grade sheet',
    exportNow,
    expRunning: s.exp === 'running', expDone: s.exp === 'done',
    expN: s.exN, rows,
    expT: `scaleX(${rows ? (s.exN / rows).toFixed(4) : 0})`,
    expSummary: `${plural(total, 'confirmed score')}, ${pending ? `${pending} marked pending.` : 'none marked pending.'}`,
    dismiss: () => setState({ exp: 'idle' }),
    resultsPath: key ? paths.sessionResults(key) : paths.results,
  }
  return (
    <div className="pg-classstats" style={{ minHeight: "100vh", display: "flex", flexDirection: "column" }}>
      <StaffTopBar current="statistics" />
      <main className="a-gutter" style={{ flex: "1", width: "100%", maxWidth: "1280px", margin: "0 auto", padding: "56px 40px 80px", display: "flex", flexDirection: "column" }}>
        <div className="a-rise" style={{ display: "flex", flexDirection: "column", gap: "28px" }}>
          <div className="a-stack-sm" style={{ display: "flex", alignItems: "flex-end", justifyContent: "space-between", gap: "24px" }}>
            <h1 className="a-title" style={{ fontFamily: "Alegreya, Georgia, serif", fontWeight: "500", fontSize: "44px", lineHeight: "1.08", letterSpacing: "-0.012em", color: "var(--night-indigo)" }}>
              Class statistics
            </h1>
            <button type="button" className="a-btn a-btn-primary" aria-disabled={v.expBusy} onClick={v.exportNow} style={{ height: "44px", padding: "0 20px", border: "0", borderRadius: "12px", background: "var(--night-indigo)", color: "var(--ivory)", fontSize: "15px", fontWeight: "500", display: "inline-flex", alignItems: "center", justifyContent: "center", gap: "10px", whiteSpace: "nowrap", boxShadow: "0 8px 18px -10px rgba(15,22,48,0.55)" }}>
              <svg width="18" height="18" viewBox="0 0 24 24" aria-hidden="true" style={{ flex: "none", fill: "none", stroke: "currentColor", strokeWidth: "1.75", strokeLinecap: "round", strokeLinejoin: "round" }}>
                <path d="M12 4v11" />
                <path d="m7.5 10.5 4.5 4.5 4.5-4.5" />
                <path d="M4 15v4.5A1.5 1.5 0 0 0 5.5 21h13a1.5 1.5 0 0 0 1.5-1.5V15" />
              </svg>
              {v.expLabel}
            </button>
          </div>
          <div className="a-wrap-sm" style={{ display: "flex", alignItems: "flex-end", columnGap: "32px", rowGap: "16px" }}>
            <div className="a-full-sm" style={{ display: "flex", flexDirection: "column", gap: "8px", width: "400px", flex: "none" }}>
              <label htmlFor="f-session" style={{ fontSize: "14px", fontWeight: "500", color: "var(--night-indigo)" }}>
                Session
              </label>
              <div style={{ position: "relative" }}>
                <select id="f-session" className="a-field" value={v.key} onChange={v.setSession} style={{ width: "100%", height: "44px", padding: "0 40px 0 14px", borderRadius: "10px", border: "1px solid var(--edge)", background: "var(--field-white)", fontSize: "15px", color: "var(--night-indigo)" }}>
                  {options.map((x) => <option key={x.id} value={x.id}>{x.title}{x.classCode ? ` (${x.classCode})` : ''}</option>)}
                </select>
                <svg width="16" height="16" viewBox="0 0 24 24" aria-hidden="true" style={{ position: "absolute", right: "14px", top: "14px", pointerEvents: "none", fill: "none", stroke: "var(--ink-2)", strokeWidth: "2", strokeLinecap: "round", strokeLinejoin: "round" }}>
                  <path d="m6 9 6 6 6-6" />
                </svg>
              </div>
            </div>
            <p className="a-num" aria-live="polite" style={{ minHeight: "44px", display: "flex", flexWrap: "wrap", alignItems: "center", columnGap: "22px", rowGap: "6px", fontSize: "15px", lineHeight: "1.4", color: "var(--ink-2)" }}>
              <span style={{ display: "inline-flex", alignItems: "center", gap: "9px" }}>
                <svg width="14" height="14" viewBox="0 0 16 16" aria-hidden="true" style={{ flex: "none" }}>
                  <circle cx="8" cy="8" r="6.25" style={{ fill: "none", stroke: "var(--night-indigo)", strokeWidth: "1.5" }} />
                  <circle cx="8" cy="8" r="6.25" style={{ fill: "var(--night-indigo)" }} />
                </svg>
                <span>
                  Based on{' '}
                  <span className={v.tickCls} style={{ fontWeight: "500", color: "var(--night-indigo)" }}>
                    {v.confirmed}
                  </span>
                  {' '}confirmed attempts
                </span>
              </span>
              {v.hasWaiting && (
                <>
                  <span style={{ display: "inline-flex", alignItems: "center", gap: "9px" }}>
                    <svg width="14" height="14" viewBox="0 0 16 16" aria-hidden="true" style={{ flex: "none" }}>
                      <circle cx="8" cy="8" r="6.25" style={{ fill: "none", stroke: "var(--gold-edge)", strokeWidth: "1.5" }} />
                      <path d="M8 1.75a6.25 6.25 0 0 1 0 12.5a2.6 6.25 0 0 0 0-12.5z" style={{ fill: "var(--lantern-gold)" }} />
                    </svg>
                    <span>
                      <span style={{ fontWeight: "500", color: "var(--gold-ink)" }}>
                        {v.waiting}
                      </span>
                      {' '}waiting for review are not counted
                    </span>
                  </span>
                  <Link className="a-link" to={v.resultsPath} style={{ fontWeight: "500", color: "var(--night-indigo)" }}>
                    Open results
                  </Link>
                </>
              )}
              {v.isOpen && (
                <>
                  <span style={{ display: "inline-flex", alignItems: "center", gap: "9px", fontWeight: "500", color: "var(--red-ink)" }}>
                    <svg width="14" height="14" viewBox="0 0 16 16" aria-hidden="true" style={{ flex: "none" }}>
                      <circle cx="8" cy="8" r="6.25" style={{ fill: "none", stroke: "var(--lantern-red)", strokeWidth: "1.5" }} />
                      <path d="M8 1.75a6.25 6.25 0 0 1 0 12.5a2.6 6.25 0 0 0 0-12.5z" style={{ fill: "var(--lantern-red)" }} />
                    </svg>
                    Open now until {v.openUntil}
                  </span>
                  <Link className="a-link" to={v.resultsPath} style={{ fontWeight: "500", color: "var(--night-indigo)" }}>
                    Results so far
                  </Link>
                </>
              )}
              {v.noneWaiting && (
                <>
                  <span>
                    Nothing is waiting for review
                  </span>
                </>
              )}
            </p>
          </div>
          <div aria-live="polite">
            {v.expRunning && (
              <>
                <div className="a-rise a-wrap-sm" style={{ display: "flex", alignItems: "center", columnGap: "20px", rowGap: "10px" }}>
                  <p className="a-num" style={{ fontSize: "14.5px", color: "var(--ink-2)", whiteSpace: "nowrap" }}>
                    Filling the school template ·{' '}
                    <span style={{ fontWeight: "500", color: "var(--night-indigo)" }}>
                      {v.expN}
                    </span>
                    {' '}of{' '}{v.rows}{' '}rows
                  </p>
                  <div aria-hidden="true" className="a-full-sm" style={{ width: "320px", height: "4px", borderRadius: "2px", background: "var(--line)", overflow: "hidden" }}>
                    <div style={{ height: "100%", background: "var(--night-indigo)", transformOrigin: "0 50%", transform: v.expT, transition: "transform .26s linear" }} />
                  </div>
                </div>
              </>
            )}
            {v.expDone && (
              <>
                <div className="a-rise" style={{ display: "flex", alignItems: "flex-start", gap: "12px", maxWidth: "760px" }}>
                  <svg width="20" height="20" viewBox="0 0 16 16" aria-hidden="true" style={{ flex: "none", marginTop: "1px" }}>
                    <circle cx="8" cy="8" r="6.25" style={{ fill: "none", stroke: "var(--night-indigo)", strokeWidth: "1.5" }} />
                    <circle className="a-moon-fill" cx="8" cy="8" r="6.25" style={{ fill: "var(--night-indigo)" }} />
                  </svg>
                  <p style={{ flex: "1", minWidth: "0", fontSize: "14.5px", lineHeight: "1.5", color: "var(--ink-2)" }}>
                    <span style={{ fontWeight: "500", color: "var(--night-indigo)" }}>
                      Grade sheet exported
                    </span>
                    {' '}in the school template, {PENDING.exportFormat}.{' '}{v.expSummary}
                  </p>
                  <button type="button" className="a-btn a-btn-quiet" aria-label="Dismiss" onClick={v.dismiss} style={{ flex: "none", width: "36px", height: "36px", marginTop: "-8px", padding: "0", border: "0", borderRadius: "10px", background: "transparent", color: "var(--ink-2)", display: "inline-flex", alignItems: "center", justifyContent: "center" }}>
                    <svg width="18" height="18" viewBox="0 0 24 24" aria-hidden="true" style={{ fill: "none", stroke: "currentColor", strokeWidth: "1.75", strokeLinecap: "round" }}>
                      <path d="M6 6l12 12M18 6 6 18" />
                    </svg>
                  </button>
                </div>
              </>
            )}
          </div>
        </div>
        <section aria-labelledby="dist-h" className="a-night a-rise a-grid-1-sm" style={{ marginTop: "28px", display: "grid", gridTemplateColumns: "300px minmax(0, 1fr)", columnGap: "56px", rowGap: "36px", padding: "26px 24px 24px", borderRadius: "20px", backgroundColor: "var(--night-indigo)", backgroundImage: "radial-gradient(420px 260px at 100% 0%, var(--jade-wash), rgba(15,22,48,0) 70%)", color: "var(--ivory)", boxShadow: "0 24px 48px -28px rgba(15,22,48,0.7)", animationDelay: "60ms" }}>
          <div style={{ display: "flex", flexDirection: "column", paddingTop: "4px" }}>
            <h2 id="dist-h" className={v.tickCls} style={{ display: "block", fontSize: "24px", lineHeight: "1.3", fontWeight: "500", letterSpacing: "-0.005em", color: "var(--ivory)", textWrap: "balance" }}>
              {v.insight}
            </h2>
            <p className="a-num" style={{ marginTop: "10px", display: "flex", gap: "10px", alignItems: "center", fontSize: "16px", color: "var(--ivory-2)" }}>
              <svg width="20" height="20" viewBox="0 0 16 16" aria-hidden="true" style={{ flex: "none" }}>
                <circle cx="8" cy="8" r="6.25" style={{ fill: "none", stroke: "var(--ivory)", strokeWidth: "1.5" }} />
                <circle cx="8" cy="8" r="6.25" style={{ fill: v.moonFill }} />
              </svg>
              <span>
                {v.insightMeta}
              </span>
            </p>
            {v.hasScores && (
              <>
                <div style={{ marginTop: "28px" }}>
                  {v.bandOff && (
                    <>
                      <p className="a-num" style={{ fontSize: "15px", color: "var(--ivory-2)" }}>
                        {v.lowNote}
                      </p>
                    </>
                  )}
                  {v.bandOn && (
                    <>
                      <div className="a-rise" style={{ display: "flex", flexDirection: "column" }}>
                        <p style={{ fontSize: "14px", fontWeight: "500", color: "var(--ivory-2)" }}>
                          {v.bandLabel}
                        </p>
                        <p className="a-num" style={{ display: "flex", alignItems: "baseline", gap: "10px", marginTop: "6px" }}>
                          <span className={v.bandTick} style={{ fontSize: "56px", fontWeight: "200", lineHeight: "1", letterSpacing: "-0.02em", color: "var(--ivory)" }}>
                            {v.bandCount}
                          </span>
                          <span style={{ fontSize: "16px", color: "var(--ivory-2)" }}>
                            {v.bandUnit}
                          </span>
                        </p>
                        <button type="button" className="a-btn a-btn-quiet" onClick={v.clearBand} style={{ alignSelf: "flex-start", margin: "12px 0 0 -14px", height: "44px", padding: "0 14px", border: "0", borderRadius: "10px", background: "transparent", color: "var(--ivory-2)", fontSize: "15px", fontWeight: "500" }}>
                          Show all bands
                        </button>
                      </div>
                    </>
                  )}
                </div>
              </>
            )}
          </div>
          <figure style={{ display: "flex", flexDirection: "column", gap: "10px", minWidth: "0" }}>
            <div style={{ position: "relative", height: "280px", display: "grid", gridTemplateColumns: "repeat(10, minmax(0, 1fr))", boxShadow: "inset 0 -1px 0 var(--night-edge)" }}>
              {v.bins.map((b, b_i) => (
                <Fragment key={b.key ?? b_i}>
                  <button type="button" className="a-btn a-btn-quiet" aria-pressed={b.pressed} aria-label={b.aria} onClick={b.pick} style={{ position: "relative", height: "100%", minWidth: "0", padding: "0", border: "0", borderRadius: "12px 12px 0 0", background: "transparent", opacity: b.op, transition: "opacity .4s ease-out, background-color .18s ease-out" }}>
                    <span aria-hidden="true" style={{ position: "absolute", left: "16%", right: "16%", bottom: "0", height: "2px", borderRadius: "1px", background: "var(--night-edge)" }} />
                    <span aria-hidden="true" style={{ position: "absolute", left: "16%", right: "16%", bottom: "0", height: "220px", borderRadius: "8px 8px 0 0", background: "var(--ivory)", transformOrigin: "50% 100%", transform: b.barT, transition: `transform ${v.dur} cubic-bezier(0.16,1,0.3,1) ${b.delay}` }} />
                    <span aria-hidden="true" className="a-num" style={{ position: "absolute", left: "0", right: "0", bottom: "10px", textAlign: "center", fontSize: "20px", fontWeight: b.weight, lineHeight: "1.2", color: b.ink, transform: b.liftT, opacity: b.labelOp, transition: `transform ${v.dur} cubic-bezier(0.16,1,0.3,1) ${b.delay}, opacity .4s ease-out ${b.delay}` }}>
                      <span className={b.tick}>
                        {b.count}
                      </span>
                    </span>
                  </button>
                </Fragment>
              ))}
            </div>
            <div aria-hidden="true" className="a-num" style={{ display: "grid", gridTemplateColumns: "repeat(10, minmax(0, 1fr))", height: "20px", fontSize: "13.5px", color: "var(--ivory-2)" }}>
              {v.bins.map((b, b_i) => (
                <Fragment key={b.key ?? b_i}>
                  <span style={{ position: "relative" }}>
                    <span style={{ position: "absolute", left: "0", top: "0", transform: "translateX(-50%)" }}>
                      {b.lo}
                    </span>
                    {b.last && (
                      <>
                        <span style={{ position: "absolute", right: "0", top: "0", transform: "translateX(50%)" }}>
                          10
                        </span>
                      </>
                    )}
                  </span>
                </Fragment>
              ))}
            </div>
            <figcaption style={{ marginTop: "6px", display: "flex", flexWrap: "wrap", justifyContent: "space-between", gap: "6px 20px", fontSize: "13.5px", color: "var(--ivory-2)" }}>
              <span>
                Final score out of 10
              </span>
              <span>
                Bars count students in each band
              </span>
            </figcaption>
          </figure>
        </section>
        <section aria-labelledby="q-h" className="a-rise" style={{ marginTop: "80px", display: "flex", flexDirection: "column", animationDelay: "120ms" }}>
          <div className="a-stack-sm" style={{ display: "flex", alignItems: "flex-end", justifyContent: "space-between", gap: "20px" }}>
            <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
              <h2 id="q-h" style={{ fontSize: "24px", lineHeight: "1.3", fontWeight: "500", letterSpacing: "-0.005em", color: "var(--night-indigo)" }}>
                {v.qHeading}
              </h2>
              <p style={{ display: "flex", alignItems: "center", gap: "8px", fontSize: "15px", color: "var(--gold-ink)" }}>
                <svg width="14" height="14" viewBox="0 0 16 16" aria-hidden="true" style={{ flex: "none" }}>
                  <circle cx="8" cy="8" r="6.25" style={{ fill: "none", stroke: "var(--gold-edge)", strokeWidth: "1.5" }} />
                  <path d="M8 1.75a6.25 6.25 0 0 1 0 12.5a2.6 6.25 0 0 0 0-12.5z" style={{ fill: "var(--lantern-gold)" }} />
                </svg>
                From the AI's per-question scores
              </p>
            </div>
            <div role="group" aria-label="Order of questions" style={{ display: "inline-flex", gap: "6px" }}>
              {v.orders.map((o, o_i) => (
                <Fragment key={o.key ?? o_i}>
                  <button type="button" className={`a-btn ${o.cls}`} aria-pressed={o.pressed} aria-disabled={o.disabled} onClick={o.pick} style={{ height: "36px", padding: "0 14px", borderRadius: "10px", border: o.border, background: o.bg, color: o.ink, fontSize: "14px", fontWeight: "500", whiteSpace: "nowrap" }}>
                    {o.label}
                  </button>
                </Fragment>
              ))}
            </div>
          </div>
          {v.hasScores && (
            <>
              <ol style={{ marginTop: "24px", boxShadow: "inset 0 1px 0 var(--line-strong)" }}>
                {v.qs.map((q, q_i) => (
                  <Fragment key={q.key ?? q_i}>
                    <li className={`${q.cls} a-grid-1-sm`} style={{ display: "grid", gridTemplateColumns: "minmax(0, 1fr) auto", columnGap: "56px", rowGap: "18px", alignItems: "start", padding: "26px 0 28px", boxShadow: "inset 0 -1px 0 var(--line)", animationDelay: q.delay }}>
                      <div style={{ display: "flex", flexDirection: "column", gap: "8px", minWidth: "0" }}>
                        <p style={{ fontSize: "14px", fontWeight: "500", color: "var(--ink-2)" }}>
                          {q.n}
                        </p>
                        <p style={{ maxWidth: "34em", fontFamily: "Alegreya, Georgia, serif", fontSize: "26px", lineHeight: "1.28", fontWeight: "500", color: "var(--night-indigo)", textWrap: "balance" }}>
                          {q.text}
                        </p>
                      </div>
                      <div className="a-full-sm" style={{ width: "410px", display: "flex", flexWrap: "wrap", columnGap: "40px", rowGap: "16px", paddingTop: "2px" }}>
                        <div style={{ width: "130px", flex: "none", display: "flex", flexDirection: "column", gap: "6px" }}>
                          <p className="a-num" style={{ display: "flex", alignItems: "center", gap: "8px", color: "var(--gold-ink)" }}>
                            <svg width="14" height="14" viewBox="0 0 16 16" aria-hidden="true" style={{ flex: "none" }}>
                              <circle cx="8" cy="8" r="6.25" style={{ fill: "none", stroke: "var(--gold-edge)", strokeWidth: "1.5" }} />
                              <path d="M8 1.75a6.25 6.25 0 0 1 0 12.5a2.6 6.25 0 0 0 0-12.5z" style={{ fill: "var(--lantern-gold)" }} />
                            </svg>
                            <span>
                              <span style={{ fontSize: "20px", fontWeight: "300", lineHeight: "1.2" }}>
                                {q.avg}
                              </span>
                              <span style={{ fontSize: "14px" }}>
                                {' '}/ {q.max}
                              </span>
                            </span>
                          </p>
                          <p style={{ fontSize: "13.5px", color: "var(--gold-ink)" }}>
                            AI average
                          </p>
                        </div>
                        <div style={{ flex: "1 1 200px", minWidth: "180px", maxWidth: "240px", display: "flex", flexDirection: "column", gap: "6px" }}>
                          <p className="a-num" style={{ color: "var(--night-indigo)" }}>
                            <span style={{ fontSize: "20px", fontWeight: "300", lineHeight: "1.2" }}>
                              {q.good}
                            </span>
                            <span style={{ fontSize: "14px", color: "var(--ink-2)" }}>
                              {' '}of{' '}{q.of}{' '}good answers
                            </span>
                          </p>
                          <div aria-hidden="true" style={{ marginTop: "6px", height: "6px", borderRadius: "3px", background: "var(--line)", overflow: "hidden" }}>
                            <div style={{ height: "100%", borderRadius: "3px", background: "var(--ink-2)", transformOrigin: "0 50%", transform: q.fillT, transition: `transform ${v.dur} cubic-bezier(0.16,1,0.3,1) ${q.mDelay}` }} />
                          </div>
                        </div>
                      </div>
                    </li>
                  </Fragment>
                ))}
              </ol>
            </>
          )}
          {v.noScores && (
            <>
              <div className="a-rise" style={{ marginTop: "24px", padding: "28px 0", boxShadow: "inset 0 1px 0 var(--line-strong), inset 0 -1px 0 var(--line)", display: "flex", flexWrap: "wrap", alignItems: "center", gap: "8px 16px" }}>
                <p style={{ fontSize: "15px", color: "var(--ink-2)" }}>
                  Question averages appear once you confirm the first attempt of this session.
                </p>
                <Link className="a-link" to={v.resultsPath} style={{ fontSize: "15px", fontWeight: "500", color: "var(--night-indigo)" }}>
                  Go to results
                </Link>
              </div>
            </>
          )}
          <p style={{ marginTop: "20px", display: "flex", alignItems: "flex-start", gap: "8px", fontSize: "14px", lineHeight: "1.45", color: "var(--ink-3)" }}>
            <svg width="16" height="16" viewBox="0 0 24 24" aria-hidden="true" style={{ flex: "none", marginTop: "1px", fill: "none", stroke: "currentColor", strokeWidth: "1.75", strokeLinecap: "round", strokeLinejoin: "round" }}>
              <circle cx="12" cy="12" r="9" />
              <path d="M12 11v5" />
              <path d="M12 7.6v.01" />
            </svg>
            A good answer has an AI score of at least {PENDING.goodAnswerThreshold}. Final scores above are yours; question averages are the AI's.
          </p>
        </section>
        <SampleNote style={{ marginTop: '56px', paddingTop: '0', fontSize: '13px', color: 'var(--ink-3)' }}>All names, scores and counts on this page are sample data.</SampleNote>
      </main>
    </div>
  )
}
