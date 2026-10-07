import { Fragment } from 'react'
import { Link, useParams } from 'react-router-dom'
import { paths } from '../../app/routes/paths.js'
import { reportingApi } from '../../api/services.js'
import { SampleNote } from '../../components/SampleNote.jsx'
import { StaffTopBar } from '../../components/TopBar.jsx'
import { useLoad } from '../../hooks/useLoad.js'
import { useMergeState } from '../../hooks/useMergeState.js'
import { useTimeouts } from '../../hooks/useTimeouts.js'
import { formatScore, formatTime, formatWindow } from '../../utils/format.js'
import { PENDING } from '../../utils/pending.js'
import { downloadGradeSheet } from './gradeSheet.js'
import './SessionResults.css'

const PER = 12
const ORDER = { w: 0, p: 1, c: 2, n: 3 }
const KIND = {
  w: { status: 'Waiting for review', statusInk: 'var(--gold-ink)', statusWeight: 500, dispW: 'inline', dispC: 'none', dispN: 'none', dispP: 'none', aiInk: 'var(--gold-ink)', finalInk: 'var(--ink-3)', finalWeight: 300, actionDisp: 'inline-flex', action: 'Review', actionCls: 'a-btn a-btn-secondary', actionBorder: '1px solid var(--edge)', actionBg: 'rgba(255,255,255,0.6)', actionInk: 'var(--night-indigo)' },
  c: { status: 'Confirmed', statusInk: 'var(--night-indigo)', statusWeight: 400, dispW: 'none', dispC: 'inline', dispN: 'none', dispP: 'none', aiInk: 'var(--gold-ink)', finalInk: 'var(--night-indigo)', finalWeight: 400, actionDisp: 'inline-flex', action: 'View', actionCls: 'a-btn a-btn-quiet', actionBorder: '0', actionBg: 'transparent', actionInk: 'var(--ink-2)' },
  n: { status: 'No attempt', statusInk: 'var(--ink-2)', statusWeight: 400, dispW: 'none', dispC: 'none', dispN: 'inline', dispP: 'none', aiInk: 'var(--ink-3)', finalInk: 'var(--ink-3)', finalWeight: 300, actionDisp: 'none', action: '', actionCls: '', actionBorder: '0', actionBg: 'transparent', actionInk: 'var(--ink-2)' },
  p: { status: 'Answering now', statusInk: 'var(--red-ink)', statusWeight: 500, dispW: 'none', dispC: 'none', dispN: 'none', dispP: 'inline', aiInk: 'var(--ink-3)', finalInk: 'var(--ink-3)', finalWeight: 300, actionDisp: 'none', action: '', actionCls: '', actionBorder: '0', actionBg: 'transparent', actionInk: 'var(--ink-2)' },
}
const PHASE = {
  w: { disc: 'none', stroke: 'var(--gold-edge)', cres: 'var(--lantern-gold)' },
  c: { disc: 'var(--night-indigo)', stroke: 'var(--night-indigo)', cres: 'none' },
  n: { disc: 'none', stroke: 'var(--ink-2)', cres: 'none' },
  p: { disc: 'none', stroke: 'var(--lantern-red)', cres: 'var(--lantern-red)' },
}
const kindOf = (row) => ({ PendingReview: 'w', Finalized: 'c', InProgress: 'p' })[row.status] ?? 'n'
const notReached = (row) => {
  const missing = []
  for (let i = row.reached + 1; i <= row.questionCount; i++) missing.push(i)
  if (!missing.length) return ''
  return missing.length === 1 ? `question ${missing[0]} not reached` : `questions ${missing.slice(0, -1).join(', ')} and ${missing[missing.length - 1]} not reached`
}

export default function SessionResultsPage() {
  const { sessionId } = useParams()
  const { data } = useLoad(() => reportingApi.results(sessionId), [sessionId], { pollMs: 10000 })
  const [s, setState] = useMergeState({ show: 'all', q: '', page: 0, flip: false, turned: false, exp: 'closed', rows: 0, closing: false, dl: false, file: null })
  const { later, clear } = useTimeouts()
  const session = data?.session
  const all = (data?.rows ?? []).map((r) => ({ ...r, k: kindOf(r) })).sort((x, y) => ORDER[x.k] - ORDER[y.k] || x.fullName.localeCompare(y.fullName))
  const total = all.length
  const count = (k) => all.filter((r) => r.k === k).length
  const nW = count('w'), nC = count('c'), nN = count('n'), nP = count('p')
  const ql = s.q.trim().toLowerCase()
  const match = (r) => (s.show === 'all' || r.k === s.show) && (!ql || `${r.fullName} ${r.studentCode}`.toLowerCase().includes(ql))
  const found = all.filter(match)
  const pageCount = Math.max(1, Math.ceil(found.length / PER))
  const page = Math.min(s.page, pageCount - 1)
  const vis = found.slice(page * PER, page * PER + PER)
  const anim = s.flip ? 'sr-in-a' : 'sr-in-b'
  const firstWaiting = all.find((r) => r.k === 'w')
  const slots = vis.map((r, i) => {
    const note = r.endReason === 'SessionClosed' && r.reached < r.questionCount ? `Stopped at ${formatTime(r.endedAt)} · ${notReached(r)}` : ''
    return {
      ...KIND[r.k], key: r.studentId, show: 'table-row', anim, delay: (s.turned ? 0 : 160) + i * 24 + 'ms',
      name: r.fullName, code: r.studentCode, note, noteDisp: note ? 'block' : 'none',
      ended: r.endedAt ? formatTime(r.endedAt) : '–', ai: r.aiTotal === null ? '–' : formatScore(r.aiTotal), final: r.finalScore === null ? '–' : formatScore(r.finalScore),
      actionLabel: `${KIND[r.k].action} ${r.fullName}`, href: r.attemptId ? paths.review(r.attemptId) : '#',
    }
  })
  const active = s.show !== 'all' || ql !== ''
  const from = found.length ? page * PER + 1 : 0, to = page * PER + vis.length
  const turn = (patch) => setState((p) => ({ page: 0, flip: !p.flip, turned: true, ...patch }))
  const pick = (k) => () => turn({ show: s.show === k ? 'all' : k })
  const exp = s.exp
  const open = exp !== 'closed'
  const close = () => { clear(); setState({ closing: true }); later(() => setState({ exp: 'closed', closing: false, rows: 0, dl: false }), 260) }
  const run = async () => {
    clear()
    setState({ exp: 'running', rows: 0, closing: false, dl: false })
    const file = await reportingApi.exportGradeSheet(sessionId).catch(() => null)
    const step = Math.max(1, Math.ceil(total / 16))
    const tickRow = (n) => {
      setState({ rows: n })
      if (n < total) later(() => tickRow(Math.min(total, n + step)), 200)
      else later(() => setState({ exp: 'done', file }), 450)
    }
    tickRow(0)
  }
  const shortName = session ? `${session.title.split(':')[0]}${session.classCode ? ` (${session.classCode})` : ''}` : ''
  const v = {
    moons: all.map((r, i) => ({ delay: 80 + i * 14 + 'ms', op: match(r) ? 1 : 0.22, ...PHASE[r.k] })),
    show: s.show, q: s.q,
    setShow: (e) => turn({ show: e.target.value }),
    setQ: (e) => setState({ q: e.target.value, page: 0 }),
    clear: () => { if (active) turn({ show: 'all', q: '' }) },
    filtered: active,
    pickW: pick('w'), pickC: pick('c'), pickN: pick('n'),
    pressW: s.show === 'w' ? 'true' : 'false', pressC: s.show === 'c' ? 'true' : 'false', pressN: s.show === 'n' ? 'true' : 'false',
    countText: found.length ? `${from}–${to} of ${found.length}${active ? ' matching' : ' · waiting for review first'}` : `0 of ${total}`,
    empty: !!data && found.length === 0,
    pagerDisplay: pageCount > 1 ? 'flex' : 'none',
    pageNo: page + 1, pageCount,
    prev: () => { if (page > 0) setState((p) => ({ page: page - 1, flip: !p.flip, turned: true })) },
    next: () => { if (page < pageCount - 1) setState((p) => ({ page: page + 1, flip: !p.flip, turned: true })) },
    prevDisabled: page > 0 ? 'false' : 'true',
    nextDisabled: page < pageCount - 1 ? 'false' : 'true',
    slots,
    exportMounted: open,
    exportExpanded: open ? 'true' : 'false',
    exportBtnBorder: open ? '1px solid var(--night-indigo)' : '1px solid var(--edge)',
    exportBtnBg: open ? 'var(--field-white)' : 'rgba(255,255,255,0.6)',
    toggleExport: () => { if (open) close(); else { clear(); setState({ exp: 'ready', closing: false, dl: false }) } },
    closeExport: close,
    startExport: run,
    panelCls: s.closing ? 'sr-close' : 'sr-open',
    expIsReady: exp === 'ready', expIsRunning: exp === 'running', expIsDone: exp === 'done', expNotDone: exp !== 'done',
    expTitle: exp === 'done' ? 'Grade sheet ready' : exp === 'running' ? 'Exporting the grade sheet' : 'Export the grade sheet',
    headCls: exp === 'done' ? 'a-rise' : '',
    expRows: s.rows,
    barScale: String(total ? s.rows / total : 0),
    download: () => { if (s.dl) return; downloadGradeSheet(s.file?.fileName ?? 'grade_sheet', data.rows); setState({ dl: true }) },
    downloaded: s.dl, notDownloaded: !s.dl,
    dlDisabled: s.dl ? 'true' : 'false',
    dlText: s.dl ? 'Downloaded' : 'Download',
    dlCls: s.dl ? 'a-rise' : '',
    title: session ? `${session.title}${session.classCode ? ` (${session.classCode})` : ''}` : '',
    phase: session?.phase, courseCode: session?.courseCode, when: session ? formatWindow(session.startAt, session.endAt) : '',
    nW, nC, nN, nP, total, taken: total - nN,
    firstWaiting: firstWaiting ? paths.review(firstWaiting.attemptId) : null,
    shortName,
  }
  return (
    <div className="pg-sessionresults" style={{ minHeight: "100vh", display: "flex", flexDirection: "column" }}>
      <StaffTopBar current="results" />
      <main className="a-gutter" style={{ flex: "1", width: "100%", maxWidth: "1280px", margin: "0 auto", padding: "56px 40px 80px", display: "flex", flexDirection: "column", gap: "40px" }}>
        <div className="a-rise a-stack-sm" style={{ display: "flex", alignItems: "flex-end", justifyContent: "space-between", gap: "24px" }}>
          <div style={{ display: "flex", flexDirection: "column", gap: "12px", minWidth: "0" }}>
            <Link className="a-link" to={paths.sessions} style={{ alignSelf: "flex-start", display: "inline-flex", alignItems: "center", gap: "6px", fontSize: "14px", color: "var(--ink-2)" }}>
              <svg width="16" height="16" viewBox="0 0 24 24" aria-hidden="true" style={{ flex: "none", fill: "none", stroke: "currentColor", strokeWidth: "1.75", strokeLinecap: "round", strokeLinejoin: "round" }}>
                <path d="M15 6l-6 6 6 6" />
              </svg>
              Exam sessions
            </Link>
            <h1 className="a-title" style={{ fontFamily: "Alegreya, Georgia, serif", fontWeight: "500", fontSize: "44px", lineHeight: "1.08", letterSpacing: "-0.012em", color: "var(--night-indigo)", textWrap: "balance" }}>
              {v.title}
            </h1>
            <div style={{ display: "flex", flexWrap: "wrap", alignItems: "center", columnGap: "20px", rowGap: "6px", fontSize: "14.5px", color: "var(--ink-2)" }}>
              <span style={{ display: "inline-flex", alignItems: "center", gap: "9px", fontWeight: "500", color: v.phase === 'Open now' ? "var(--red-ink)" : "var(--night-indigo)" }}>
                {v.phase === 'Open now' ? (
                  <svg width="14" height="14" viewBox="0 0 16 16" aria-hidden="true" style={{ flex: "none" }}>
                    <circle cx="8" cy="8" r="6.25" style={{ fill: "none", stroke: "var(--lantern-red)", strokeWidth: "1.5" }} />
                    <path d="M8 1.75a6.25 6.25 0 0 1 0 12.5a2.6 6.25 0 0 0 0-12.5z" style={{ fill: "var(--lantern-red)" }} />
                  </svg>
                ) : (
                  <svg width="14" height="14" viewBox="0 0 16 16" aria-hidden="true" style={{ flex: "none" }}>
                    <circle cx="8" cy="8" r="6.25" style={{ fill: "none", stroke: "var(--night-indigo)", strokeWidth: "1.5" }} />
                    <circle cx="8" cy="8" r="6.25" style={{ fill: "var(--night-indigo)" }} />
                  </svg>
                )}
                {v.phase}
              </span>
              <span style={{ color: "var(--jade-ink)", fontWeight: "500" }}>
                {v.courseCode}
              </span>
              <span>
                {v.when}
              </span>
            </div>
          </div>
          <div className="sr-actions" style={{ display: "flex", flexWrap: "wrap", gap: "12px", flex: "none" }}>
            <Link to={`${paths.statistics}?session=${sessionId}`} className="a-btn a-btn-secondary" style={{ height: "44px", padding: "0 18px", borderRadius: "12px", border: "1px solid var(--edge)", background: "rgba(255,255,255,0.6)", fontSize: "15px", fontWeight: "500", color: "var(--night-indigo)", textDecoration: "none", display: "inline-flex", alignItems: "center", justifyContent: "center", gap: "10px" }}>
              <svg width="18" height="18" viewBox="0 0 24 24" aria-hidden="true" style={{ flex: "none", fill: "none", stroke: "currentColor", strokeWidth: "1.75", strokeLinecap: "round", strokeLinejoin: "round" }}>
                <path d="M4 20h16" />
                <path d="M7 16v-4M12 16V7M17 16v-6" />
              </svg>
              Class statistics
            </Link>
            <button type="button" className="a-btn a-btn-secondary" onClick={v.toggleExport} aria-expanded={v.exportExpanded} aria-controls="export-panel" style={{ height: "44px", padding: "0 18px", borderRadius: "12px", border: v.exportBtnBorder, background: v.exportBtnBg, fontSize: "15px", fontWeight: "500", color: "var(--night-indigo)", display: "inline-flex", alignItems: "center", justifyContent: "center", gap: "10px" }}>
              <svg width="18" height="18" viewBox="0 0 24 24" aria-hidden="true" style={{ flex: "none", fill: "none", stroke: "currentColor", strokeWidth: "1.75", strokeLinecap: "round", strokeLinejoin: "round" }}>
                <path d="M12 4v11" />
                <path d="M7.5 10.5 12 15l4.5-4.5" />
                <path d="M4 15v4.5A1.5 1.5 0 0 0 5.5 21h13a1.5 1.5 0 0 0 1.5-1.5V15" />
              </svg>
              Export grade sheet
            </button>
          </div>
        </div>
        {v.exportMounted && (
          <>
            <section id="export-panel" aria-labelledby="export-h" className={`a-night ${v.panelCls}`} style={{ display: "flex", flexDirection: "column", gap: "22px", padding: "26px 24px 24px", borderRadius: "20px", backgroundColor: "var(--night-indigo)", backgroundImage: "radial-gradient(420px 260px at 100% 0%, var(--jade-wash), rgba(15,22,48,0) 70%)", color: "var(--ivory)", boxShadow: "0 24px 48px -28px rgba(15,22,48,0.7)" }}>
              <div style={{ display: "flex", flexWrap: "wrap", alignItems: "center", columnGap: "12px", rowGap: "6px" }}>
                {v.expIsDone && (
                  <>
                    <svg width="20" height="20" viewBox="0 0 16 16" aria-hidden="true" style={{ flex: "none" }}>
                      <circle cx="8" cy="8" r="6.25" style={{ fill: "none", stroke: "var(--ivory)", strokeWidth: "1.5" }} />
                      <circle className="a-moon-fill" cx="8" cy="8" r="6.25" style={{ fill: "var(--ivory)" }} />
                    </svg>
                  </>
                )}
                {v.expNotDone && (
                  <>
                    <svg width="20" height="20" viewBox="0 0 16 16" aria-hidden="true" style={{ flex: "none" }}>
                      <circle cx="8" cy="8" r="6.25" style={{ fill: "none", stroke: "var(--ivory-2)", strokeWidth: "1.5" }} />
                    </svg>
                  </>
                )}
                <h2 id="export-h" className={v.headCls} style={{ fontSize: "20px", lineHeight: "1.3", fontWeight: "500", letterSpacing: "-0.005em" }}>
                  {v.expTitle}
                </h2>
                <span style={{ marginLeft: "auto", fontSize: "13.5px", color: "var(--ivory-2)" }}>
                  School template · {PENDING.exportFormat}
                </span>
              </div>
              {v.expIsReady && (
                <>
                  <div className="a-wrap-sm" style={{ display: "flex", alignItems: "flex-end", justifyContent: "space-between", gap: "24px 40px" }}>
                    <ul style={{ display: "flex", flexDirection: "column", gap: "10px", fontSize: "15px", lineHeight: "1.4", color: "var(--ivory-2)" }}>
                      <li style={{ display: "flex", alignItems: "center", gap: "10px" }}>
                        <svg width="14" height="14" viewBox="0 0 16 16" aria-hidden="true" style={{ flex: "none" }}>
                          <circle cx="8" cy="8" r="6.25" style={{ fill: "none", stroke: "var(--ivory)", strokeWidth: "1.5" }} />
                          <circle cx="8" cy="8" r="6.25" style={{ fill: "var(--ivory)" }} />
                        </svg>
                        <span>
                          <span className="a-num" style={{ fontWeight: "500", color: "var(--ivory)" }}>
                            {v.nC}
                          </span>
                          {' '}confirmed scores go in as final
                        </span>
                      </li>
                      <li style={{ display: "flex", alignItems: "center", gap: "10px" }}>
                        <svg width="14" height="14" viewBox="0 0 16 16" aria-hidden="true" style={{ flex: "none" }}>
                          <circle cx="8" cy="8" r="6.25" style={{ fill: "none", stroke: "var(--lantern-gold)", strokeWidth: "1.5" }} />
                          <path d="M8 1.75a6.25 6.25 0 0 1 0 12.5a2.6 6.25 0 0 0 0-12.5z" style={{ fill: "var(--lantern-gold)" }} />
                        </svg>
                        <span>
                          <span className="a-num" style={{ fontWeight: "500", color: "var(--ivory)" }}>
                            {v.nW + v.nP}
                          </span>
                          {' '}attempts waiting for review go in as pending, with no score
                        </span>
                      </li>
                      <li style={{ display: "flex", alignItems: "center", gap: "10px" }}>
                        <svg width="14" height="14" viewBox="0 0 16 16" aria-hidden="true" style={{ flex: "none" }}>
                          <circle cx="8" cy="8" r="6.25" style={{ fill: "none", stroke: "var(--ivory-2)", strokeWidth: "1.5" }} />
                        </svg>
                        <span>
                          <span className="a-num" style={{ fontWeight: "500", color: "var(--ivory)" }}>
                            {v.nN}
                          </span>
                          {' '}students without an attempt are listed as no attempt
                        </span>
                      </li>
                    </ul>
                    <div className="sr-actions" style={{ display: "flex", flexWrap: "wrap", alignItems: "center", gap: "12px" }}>
                      <button type="button" className="a-btn a-btn-quiet" onClick={v.closeExport} style={{ height: "44px", padding: "0 14px", border: "0", borderRadius: "10px", background: "transparent", color: "var(--ivory-2)", fontSize: "15px", fontWeight: "500" }}>
                        Cancel
                      </button>
                      {v.firstWaiting && <Link to={v.firstWaiting} className="a-btn a-btn-secondary" style={{ height: "44px", padding: "0 18px", borderRadius: "12px", border: "1px solid var(--night-edge)", background: "transparent", color: "var(--ivory)", fontSize: "15px", fontWeight: "500", textDecoration: "none", display: "inline-flex", alignItems: "center", justifyContent: "center" }}>
                        Review the {v.nW} first
                      </Link>}
                      <button type="button" className="a-btn a-btn-primary" onClick={v.startExport} style={{ height: "52px", padding: "0 24px", border: "0", borderRadius: "14px", background: "var(--ivory)", color: "var(--night-indigo)", fontSize: "16px", fontWeight: "500", boxShadow: "0 10px 28px -12px rgba(0,0,0,0.55)", display: "inline-flex", alignItems: "center", justifyContent: "center", gap: "10px" }}>
                        <svg width="18" height="18" viewBox="0 0 24 24" aria-hidden="true" style={{ flex: "none", fill: "none", stroke: "currentColor", strokeWidth: "1.75", strokeLinecap: "round", strokeLinejoin: "round" }}>
                          <path d="M12 4v11" />
                          <path d="M7.5 10.5 12 15l4.5-4.5" />
                          <path d="M4 15v4.5A1.5 1.5 0 0 0 5.5 21h13a1.5 1.5 0 0 0 1.5-1.5V15" />
                        </svg>
                        Export now
                      </button>
                    </div>
                  </div>
                </>
              )}
              {v.expIsRunning && (
                <>
                  <div className="a-rise a-wrap-sm" style={{ display: "flex", alignItems: "center", gap: "20px 40px" }}>
                    <div style={{ flex: "1", minWidth: "0", display: "flex", flexDirection: "column", gap: "12px" }}>
                      <div role="progressbar" aria-label="Grade sheet rows written" aria-valuemin="0" aria-valuemax={v.total} aria-valuenow={v.expRows} style={{ position: "relative", height: "6px", borderRadius: "3px", background: "rgba(246,241,231,0.14)", overflow: "hidden" }}>
                        <div className="sr-bar" style={{ position: "absolute", inset: "0", borderRadius: "3px", background: "var(--ivory)", transform: `scaleX(${v.barScale})` }} />
                      </div>
                      <p className="a-num" aria-live="polite" style={{ fontSize: "15px", color: "var(--ivory-2)" }}>
                        Writing row{' '}
                        <span style={{ fontWeight: "500", color: "var(--ivory)" }}>
                          {v.expRows}
                        </span>
                        {' '}of {v.total}
                      </p>
                    </div>
                    <button type="button" className="a-btn a-btn-quiet" onClick={v.closeExport} style={{ height: "44px", padding: "0 14px", border: "0", borderRadius: "10px", background: "transparent", color: "var(--ivory-2)", fontSize: "15px", fontWeight: "500" }}>
                      Stop export
                    </button>
                  </div>
                </>
              )}
              {v.expIsDone && (
                <>
                  <div className="a-rise a-wrap-sm" style={{ display: "flex", alignItems: "flex-end", justifyContent: "space-between", gap: "24px 40px" }}>
                    <div style={{ display: "flex", flexDirection: "column", gap: "6px" }}>
                      <p style={{ fontSize: "16px", color: "var(--ivory)" }}>
                        {v.shortName} grade sheet · {v.total} rows
                      </p>
                      <p className="a-num" style={{ fontSize: "15px", color: "var(--ivory-2)" }}>
                        {v.nC} final scores · {v.nW + v.nP} pending · {v.nN} no attempt
                      </p>
                    </div>
                    <div className="sr-actions" style={{ display: "flex", flexWrap: "wrap", alignItems: "center", gap: "12px" }}>
                      <button type="button" className="a-btn a-btn-quiet" onClick={v.closeExport} style={{ height: "44px", padding: "0 14px", border: "0", borderRadius: "10px", background: "transparent", color: "var(--ivory-2)", fontSize: "15px", fontWeight: "500" }}>
                        Close
                      </button>
                      <button type="button" className="a-btn a-btn-primary" onClick={v.download} aria-disabled={v.dlDisabled} style={{ height: "52px", padding: "0 24px", border: "0", borderRadius: "14px", background: "var(--ivory)", color: "var(--night-indigo)", fontSize: "16px", fontWeight: "500", boxShadow: "0 10px 28px -12px rgba(0,0,0,0.55)", display: "inline-flex", alignItems: "center", justifyContent: "center", gap: "10px" }}>
                        {v.notDownloaded && (
                          <>
                            <svg width="18" height="18" viewBox="0 0 24 24" aria-hidden="true" style={{ flex: "none", fill: "none", stroke: "currentColor", strokeWidth: "1.75", strokeLinecap: "round", strokeLinejoin: "round" }}>
                              <path d="M12 4v11" />
                              <path d="M7.5 10.5 12 15l4.5-4.5" />
                              <path d="M4 15v4.5A1.5 1.5 0 0 0 5.5 21h13a1.5 1.5 0 0 0 1.5-1.5V15" />
                            </svg>
                          </>
                        )}
                        {v.downloaded && (
                          <>
                            <svg className="a-pop" width="18" height="18" viewBox="0 0 24 24" aria-hidden="true" style={{ flex: "none", fill: "none", stroke: "currentColor", strokeWidth: "2", strokeLinecap: "round", strokeLinejoin: "round" }}>
                              <path d="m5 12.5 4.5 4.5L19 7.5" />
                            </svg>
                          </>
                        )}
                        <span className={v.dlCls}>
                          {v.dlText}
                        </span>
                      </button>
                    </div>
                  </div>
                  {v.downloaded && (
                    <>
                      <p className="a-just" role="status" style={{ display: "flex", alignItems: "center", gap: "8px", fontSize: "14px", color: "var(--jade)" }}>
                        <span aria-hidden="true" style={{ width: "6px", height: "6px", borderRadius: "50%", background: "var(--jade)" }} />
                        Saved to your downloads just now
                      </p>
                    </>
                  )}
                </>
              )}
            </section>
          </>
        )}
        <section aria-labelledby="summary-h" className="a-rise" style={{ animationDelay: "60ms", display: "flex", flexDirection: "column", gap: "22px", paddingTop: "28px", borderTop: "1px solid var(--line)" }}>
          <h2 id="summary-h" className="a-num" style={{ fontSize: "16.5px", lineHeight: "1.4", fontWeight: "400", color: "var(--ink-2)" }}>
            <span style={{ fontSize: "20px", fontWeight: "400", color: "var(--night-indigo)" }}>
              {v.taken}
            </span>
            {' '}of {v.total} students took the exam
          </h2>
          <div aria-hidden="true" style={{ display: "flex", flexWrap: "wrap", gap: "8px" }}>
            {v.moons.map((m, m_i) => (
              <Fragment key={m.key ?? m_i}>
                <span className="a-pop" style={{ display: "inline-flex", animationDelay: m.delay }}>
                  <svg className="sr-dim" width="20" height="20" viewBox="0 0 16 16" style={{ flex: "none", opacity: m.op }}>
                    <circle cx="8" cy="8" r="6.25" style={{ fill: m.disc, stroke: m.stroke, strokeWidth: "1.5" }} />
                    <path d="M8 1.75a6.25 6.25 0 0 1 0 12.5a2.6 6.25 0 0 0 0-12.5z" style={{ fill: m.cres }} />
                  </svg>
                </span>
              </Fragment>
            ))}
          </div>
          <div className="a-stack-sm" style={{ display: "flex", flexWrap: "wrap", alignItems: "center", justifyContent: "space-between", gap: "16px 32px" }}>
            <div role="group" aria-label="Show students by status" style={{ display: "flex", flexWrap: "wrap", gap: "4px 8px", marginLeft: "-12px" }}>
              <button type="button" className="sr-legend" aria-pressed={v.pressW} onClick={v.pickW} style={{ height: "44px", padding: "0 12px", border: "0", borderRadius: "10px", background: "transparent", cursor: "pointer", display: "inline-flex", alignItems: "center", gap: "10px", fontSize: "15px", color: "var(--ink-2)" }}>
                <svg width="14" height="14" viewBox="0 0 16 16" aria-hidden="true" style={{ flex: "none" }}>
                  <circle cx="8" cy="8" r="6.25" style={{ fill: "none", stroke: "var(--gold-edge)", strokeWidth: "1.5" }} />
                  <path d="M8 1.75a6.25 6.25 0 0 1 0 12.5a2.6 6.25 0 0 0 0-12.5z" style={{ fill: "var(--lantern-gold)" }} />
                </svg>
                <span className="a-num" style={{ fontSize: "20px", fontWeight: "300", color: "var(--gold-ink)" }}>
                  {v.nW}
                </span>
                <span>
                  waiting for your review
                </span>
              </button>
              <button type="button" className="sr-legend" aria-pressed={v.pressC} onClick={v.pickC} style={{ height: "44px", padding: "0 12px", border: "0", borderRadius: "10px", background: "transparent", cursor: "pointer", display: "inline-flex", alignItems: "center", gap: "10px", fontSize: "15px", color: "var(--ink-2)" }}>
                <svg width="14" height="14" viewBox="0 0 16 16" aria-hidden="true" style={{ flex: "none" }}>
                  <circle cx="8" cy="8" r="6.25" style={{ fill: "none", stroke: "var(--night-indigo)", strokeWidth: "1.5" }} />
                  <circle cx="8" cy="8" r="6.25" style={{ fill: "var(--night-indigo)" }} />
                </svg>
                <span className="a-num" style={{ fontSize: "20px", fontWeight: "300", color: "var(--night-indigo)" }}>
                  {v.nC}
                </span>
                <span>
                  confirmed
                </span>
              </button>
              <button type="button" className="sr-legend" aria-pressed={v.pressN} onClick={v.pickN} style={{ height: "44px", padding: "0 12px", border: "0", borderRadius: "10px", background: "transparent", cursor: "pointer", display: "inline-flex", alignItems: "center", gap: "10px", fontSize: "15px", color: "var(--ink-2)" }}>
                <svg width="14" height="14" viewBox="0 0 16 16" aria-hidden="true" style={{ flex: "none" }}>
                  <circle cx="8" cy="8" r="6.25" style={{ fill: "none", stroke: "var(--ink-2)", strokeWidth: "1.5" }} />
                </svg>
                <span className="a-num" style={{ fontSize: "20px", fontWeight: "300", color: "var(--night-indigo)" }}>
                  {v.nN}
                </span>
                <span>
                  no attempt
                </span>
              </button>
            </div>
            {v.firstWaiting && <Link to={v.firstWaiting} className="a-btn a-btn-primary" style={{ height: "44px", padding: "0 20px", borderRadius: "12px", background: "var(--night-indigo)", color: "var(--ivory)", fontSize: "15px", fontWeight: "500", textDecoration: "none", display: "inline-flex", alignItems: "center", justifyContent: "center", gap: "10px", boxShadow: "0 8px 18px -10px rgba(15,22,48,0.55)" }}>
              Review the {v.nW} waiting
              <svg width="18" height="18" viewBox="0 0 24 24" aria-hidden="true" style={{ flex: "none", fill: "none", stroke: "currentColor", strokeWidth: "1.75", strokeLinecap: "round", strokeLinejoin: "round" }}>
                <path d="M5 12h14" />
                <path d="m13 6 6 6-6 6" />
              </svg>
            </Link>}
          </div>
        </section>
        <section aria-labelledby="list-h" style={{ display: "flex", flexDirection: "column", gap: "24px", marginTop: "24px" }}>
          <h2 id="list-h" style={{ position: "absolute", width: "1px", height: "1px", overflow: "hidden", clip: "rect(0 0 0 0)" }}>
            Results
          </h2>
          <div className="a-rise a-wrap-sm" style={{ animationDelay: "120ms", display: "flex", alignItems: "flex-end", gap: "16px" }}>
            <div className="a-full-sm" style={{ display: "flex", flexDirection: "column", gap: "8px", width: "240px" }}>
              <label htmlFor="f-show" style={{ fontSize: "14px", fontWeight: "500", color: "var(--night-indigo)" }}>
                Show
              </label>
              <div style={{ position: "relative" }}>
                <select id="f-show" className="a-field" value={v.show} onChange={v.setShow} style={{ width: "100%", height: "44px", padding: "0 40px 0 14px", borderRadius: "10px", border: "1px solid var(--edge)", background: "var(--field-white)", fontSize: "15px", color: "var(--night-indigo)" }}>
                  <option value="all">
                    All students
                  </option>
                  <option value="w">
                    Waiting for review
                  </option>
                  <option value="c">
                    Confirmed
                  </option>
                  <option value="n">
                    No attempt
                  </option>
                </select>
                <svg width="16" height="16" viewBox="0 0 24 24" aria-hidden="true" style={{ position: "absolute", right: "14px", top: "14px", pointerEvents: "none", fill: "none", stroke: "var(--ink-2)", strokeWidth: "2", strokeLinecap: "round", strokeLinejoin: "round" }}>
                  <path d="m6 9 6 6 6-6" />
                </svg>
              </div>
            </div>
            <div className="a-full-sm" style={{ display: "flex", flexDirection: "column", gap: "8px", width: "320px" }}>
              <label htmlFor="f-search" style={{ fontSize: "14px", fontWeight: "500", color: "var(--night-indigo)" }}>
                Search
              </label>
              <div style={{ position: "relative" }}>
                <svg width="18" height="18" viewBox="0 0 24 24" aria-hidden="true" style={{ position: "absolute", left: "13px", top: "13px", pointerEvents: "none", fill: "none", stroke: "var(--ink-3)", strokeWidth: "1.75", strokeLinecap: "round" }}>
                  <circle cx="11" cy="11" r="6.5" />
                  <path d="m16 16 4 4" />
                </svg>
                <input id="f-search" type="search" className="a-field" value={v.q} onChange={v.setQ} placeholder="Name or student code" autoComplete="off" style={{ width: "100%", height: "44px", padding: "0 14px 0 40px", borderRadius: "10px", border: "1px solid var(--edge)", background: "var(--field-white)", fontSize: "15px", color: "var(--night-indigo)" }} />
              </div>
            </div>
            {v.filtered && (
              <>
                <button type="button" className="a-btn a-btn-quiet a-rise" onClick={v.clear} style={{ height: "44px", padding: "0 14px", border: "0", borderRadius: "10px", background: "transparent", fontSize: "15px", fontWeight: "500", color: "var(--ink-2)" }}>
                  Clear filters
                </button>
              </>
            )}
            <p className="a-num" aria-live="polite" style={{ marginLeft: "auto", height: "44px", display: "flex", alignItems: "center", fontSize: "13.5px", color: "var(--ink-3)", whiteSpace: "nowrap" }}>
              {v.countText}
            </p>
          </div>
          <div style={{ overflowX: "auto", margin: "0 -12px", padding: "0 12px" }}>
            <table className="sr-tbl" style={{ width: "100%", textAlign: "left" }}>
              <thead>
                <tr style={{ boxShadow: "inset 0 -1px 0 var(--line-strong)" }}>
                  <th scope="col" style={{ padding: "0 16px 12px 0", fontSize: "13.5px", fontWeight: "500", color: "var(--ink-3)", whiteSpace: "nowrap" }}>
                    Student
                  </th>
                  <th scope="col" className="a-hide-sm" style={{ padding: "0 16px 12px 0", fontSize: "13.5px", fontWeight: "500", color: "var(--ink-3)", whiteSpace: "nowrap", width: "340px" }}>
                    Attempt
                  </th>
                  <th scope="col" className="a-hide-sm" style={{ padding: "0 16px 12px 0", fontSize: "13.5px", fontWeight: "500", color: "var(--ink-3)", whiteSpace: "nowrap", width: "90px" }}>
                    Ended
                  </th>
                  <th scope="col" className="sr-num" style={{ padding: "0 32px 12px 0", fontSize: "13.5px", fontWeight: "500", color: "var(--gold-ink)", whiteSpace: "nowrap", textAlign: "right", width: "190px" }}>
                    <span className="a-hide-sm">
                      AI suggestions total
                    </span>
                    <span className="sr-sm-only">
                      AI total
                    </span>
                  </th>
                  <th scope="col" className="a-hide-sm" style={{ padding: "0 32px 12px 0", fontSize: "13.5px", fontWeight: "500", color: "var(--ink-3)", whiteSpace: "nowrap", textAlign: "right", width: "130px" }}>
                    Final score
                  </th>
                  <th scope="col" style={{ padding: "0 0 12px 0", width: "110px" }}>
                    <span style={{ position: "absolute", width: "1px", height: "1px", overflow: "hidden", clip: "rect(0 0 0 0)" }}>
                      Action
                    </span>
                  </th>
                </tr>
              </thead>
              <tbody>
                {v.slots.map((r) => (
                  <tr key={r.key} className={`a-row ${r.anim}`} style={{ display: r.show, boxShadow: "inset 0 -1px 0 var(--line)", animationDelay: r.delay }}>
                    <td className="sr-c1" style={{ padding: "18px 16px 18px 0", verticalAlign: "top" }}>
                      <div style={{ fontSize: "15.5px", lineHeight: "1.35", fontWeight: "500", color: "var(--night-indigo)" }}>
                        {r.name}
                      </div>
                      <div style={{ marginTop: "3px", fontSize: "13.5px", lineHeight: "1.4", color: "var(--ink-3)" }}>
                        {r.code}
                      </div>
                      <div className="sr-sm-only" style={{ marginTop: "8px" }}>
                        <span style={{ display: "inline-flex", alignItems: "center", gap: "9px", fontSize: "14.5px", lineHeight: "1.35", whiteSpace: "normal", fontWeight: r.statusWeight, color: r.statusInk }}>
                          <svg width="14" height="14" viewBox="0 0 16 16" aria-hidden="true" style={{ flex: "none", display: r.dispW }}>
                            <circle cx="8" cy="8" r="6.25" style={{ fill: "none", stroke: "var(--gold-edge)", strokeWidth: "1.5" }} />
                            <path d="M8 1.75a6.25 6.25 0 0 1 0 12.5a2.6 6.25 0 0 0 0-12.5z" style={{ fill: "var(--lantern-gold)" }} />
                          </svg>
                          <svg width="14" height="14" viewBox="0 0 16 16" aria-hidden="true" style={{ flex: "none", display: r.dispC }}>
                            <circle cx="8" cy="8" r="6.25" style={{ fill: "none", stroke: "var(--night-indigo)", strokeWidth: "1.5" }} />
                            <circle cx="8" cy="8" r="6.25" style={{ fill: "var(--night-indigo)" }} />
                          </svg>
                          <svg width="14" height="14" viewBox="0 0 16 16" aria-hidden="true" style={{ flex: "none", display: r.dispN }}>
                            <circle cx="8" cy="8" r="6.25" style={{ fill: "none", stroke: "var(--ink-2)", strokeWidth: "1.5" }} />
                          </svg>
                          <svg width="14" height="14" viewBox="0 0 16 16" aria-hidden="true" style={{ flex: "none", display: r.dispP }}>
                            <circle cx="8" cy="8" r="6.25" style={{ fill: "none", stroke: "var(--lantern-red)", strokeWidth: "1.5" }} />
                            <path d="M8 1.75a6.25 6.25 0 0 1 0 12.5a2.6 6.25 0 0 0 0-12.5z" style={{ fill: "var(--lantern-red)" }} />
                          </svg>
                          {r.status}
                        </span>
                        <div style={{ display: r.noteDisp, marginTop: "4px", paddingLeft: "23px", fontSize: "13.5px", lineHeight: "1.4", color: "var(--ink-2)" }}>
                          {r.note}
                        </div>
                      </div>
                    </td>
                    <td className="a-hide-sm" style={{ padding: "18px 16px 18px 0", verticalAlign: "top" }}>
                      <span style={{ display: "inline-flex", alignItems: "center", gap: "9px", fontSize: "14.5px", lineHeight: "1.35", whiteSpace: "nowrap", fontWeight: r.statusWeight, color: r.statusInk }}>
                        <svg width="14" height="14" viewBox="0 0 16 16" aria-hidden="true" style={{ flex: "none", display: r.dispW }}>
                          <circle cx="8" cy="8" r="6.25" style={{ fill: "none", stroke: "var(--gold-edge)", strokeWidth: "1.5" }} />
                          <path d="M8 1.75a6.25 6.25 0 0 1 0 12.5a2.6 6.25 0 0 0 0-12.5z" style={{ fill: "var(--lantern-gold)" }} />
                        </svg>
                        <svg width="14" height="14" viewBox="0 0 16 16" aria-hidden="true" style={{ flex: "none", display: r.dispC }}>
                          <circle cx="8" cy="8" r="6.25" style={{ fill: "none", stroke: "var(--night-indigo)", strokeWidth: "1.5" }} />
                          <circle cx="8" cy="8" r="6.25" style={{ fill: "var(--night-indigo)" }} />
                        </svg>
                        <svg width="14" height="14" viewBox="0 0 16 16" aria-hidden="true" style={{ flex: "none", display: r.dispN }}>
                          <circle cx="8" cy="8" r="6.25" style={{ fill: "none", stroke: "var(--ink-2)", strokeWidth: "1.5" }} />
                        </svg>
                        <svg width="14" height="14" viewBox="0 0 16 16" aria-hidden="true" style={{ flex: "none", display: r.dispP }}>
                          <circle cx="8" cy="8" r="6.25" style={{ fill: "none", stroke: "var(--lantern-red)", strokeWidth: "1.5" }} />
                          <path d="M8 1.75a6.25 6.25 0 0 1 0 12.5a2.6 6.25 0 0 0 0-12.5z" style={{ fill: "var(--lantern-red)" }} />
                        </svg>
                        {r.status}
                      </span>
                      <div style={{ display: r.noteDisp, marginTop: "4px", paddingLeft: "23px", fontSize: "13.5px", lineHeight: "1.4", color: "var(--ink-2)", whiteSpace: "nowrap" }}>
                        {r.note}
                      </div>
                    </td>
                    <td className="a-num a-hide-sm" style={{ padding: "18px 16px 18px 0", verticalAlign: "top", fontSize: "14.5px", lineHeight: "1.35", color: "var(--ink-2)", whiteSpace: "nowrap" }}>
                      {r.ended}
                    </td>
                    <td className="a-num sr-num" style={{ padding: "14px 32px 14px 0", verticalAlign: "top", textAlign: "right", fontSize: "20px", fontWeight: "300", lineHeight: "1.2", color: r.aiInk }}>
                      {r.ai}
                    </td>
                    <td className="a-num a-hide-sm" style={{ padding: "14px 32px 14px 0", verticalAlign: "top", textAlign: "right", fontSize: "20px", fontWeight: r.finalWeight, lineHeight: "1.2", color: r.finalInk }}>
                      {r.final}
                    </td>
                    <td style={{ padding: "12px 0 12px 0", verticalAlign: "top", textAlign: "right", whiteSpace: "nowrap" }}>
                      <Link to={r.href} className={r.actionCls} aria-label={r.actionLabel} style={{ height: "36px", padding: "0 14px", borderRadius: "10px", border: r.actionBorder, background: r.actionBg, fontSize: "14px", fontWeight: "500", color: r.actionInk, textDecoration: "none", display: r.actionDisp, alignItems: "center", gap: "8px" }}>
                        {r.action}
                        <svg width="16" height="16" viewBox="0 0 24 24" aria-hidden="true" style={{ fill: "none", stroke: "currentColor", strokeWidth: "1.75", strokeLinecap: "round", strokeLinejoin: "round" }}>
                          <path d="M9 6l6 6-6 6" />
                        </svg>
                      </Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {v.empty && (
            <>
              <div className="a-rise" style={{ display: "flex", flexWrap: "wrap", alignItems: "center", gap: "8px 16px", padding: "4px 0 8px" }}>
                <p style={{ fontSize: "15px", color: "var(--ink-2)" }}>
                  No students match these filters.
                </p>
                <button type="button" className="a-btn a-btn-quiet" onClick={v.clear} style={{ height: "44px", padding: "0 14px", marginLeft: "-14px", border: "0", borderRadius: "10px", background: "transparent", fontSize: "15px", fontWeight: "500", color: "var(--night-indigo)" }}>
                  Clear filters
                </button>
              </div>
            </>
          )}
          <div style={{ display: "flex", flexWrap: "wrap", alignItems: "center", justifyContent: "space-between", gap: "12px 24px" }}>
            <p style={{ display: "flex", alignItems: "center", gap: "8px", fontSize: "14px", color: "var(--ink-3)" }}>
              <svg width="16" height="16" viewBox="0 0 24 24" aria-hidden="true" style={{ flex: "none", fill: "none", stroke: "currentColor", strokeWidth: "1.75", strokeLinecap: "round", strokeLinejoin: "round" }}>
                <circle cx="12" cy="12" r="8.5" />
                <path d="M12 7.5V12l3 2" />
              </svg>
              Questions not reached before the session closed count as 0.
            </p>
            <div style={{ display: v.pagerDisplay, alignItems: "center", gap: "12px" }}>
              <p className="a-num" style={{ fontSize: "13.5px", color: "var(--ink-3)", whiteSpace: "nowrap" }}>
                Page{' '}{v.pageNo}{' '}of{' '}{v.pageCount}
              </p>
              <button type="button" className="a-btn a-btn-secondary" onClick={v.prev} aria-disabled={v.prevDisabled} aria-label="Previous page" style={{ height: "36px", width: "44px", padding: "0", borderRadius: "10px", border: "1px solid var(--edge)", background: "rgba(255,255,255,0.6)", color: "var(--night-indigo)", display: "inline-flex", alignItems: "center", justifyContent: "center" }}>
                <svg width="16" height="16" viewBox="0 0 24 24" aria-hidden="true" style={{ fill: "none", stroke: "currentColor", strokeWidth: "1.75", strokeLinecap: "round", strokeLinejoin: "round" }}>
                  <path d="M15 6l-6 6 6 6" />
                </svg>
              </button>
              <button type="button" className="a-btn a-btn-secondary" onClick={v.next} aria-disabled={v.nextDisabled} aria-label="Next page" style={{ height: "36px", width: "44px", padding: "0", borderRadius: "10px", border: "1px solid var(--edge)", background: "rgba(255,255,255,0.6)", color: "var(--night-indigo)", display: "inline-flex", alignItems: "center", justifyContent: "center" }}>
                <svg width="16" height="16" viewBox="0 0 24 24" aria-hidden="true" style={{ fill: "none", stroke: "currentColor", strokeWidth: "1.75", strokeLinecap: "round", strokeLinejoin: "round" }}>
                  <path d="M9 6l6 6-6 6" />
                </svg>
              </button>
            </div>
          </div>
        </section>
        <SampleNote style={{ marginTop: '32px', paddingTop: '0', fontSize: '13px', color: 'var(--ink-3)' }}>All names, times and scores on this page are sample data.</SampleNote>
      </main>
    </div>
  )
}
