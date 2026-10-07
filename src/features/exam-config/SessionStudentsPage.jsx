import { Fragment } from 'react'
import { Link, useParams } from 'react-router-dom'
import { paths } from '../../app/routes/paths.js'
import { USE_MOCKS } from '../../api/client.js'
import { examConfigApi } from '../../api/services.js'
import { StaffTopBar } from '../../components/TopBar.jsx'
import { useLoad } from '../../hooks/useLoad.js'
import { useMergeState } from '../../hooks/useMergeState.js'
import { atLeast } from '../../utils/async.js'
import { formatDay, formatTime, formatWindow } from '../../utils/format.js'
import { PENDING } from '../../utils/pending.js'
import './SessionStudents.css'

const FIRST = 6
const split = (text, q) => {
  const i = q ? text.toLowerCase().indexOf(q) : -1
  return i < 0 ? [text, '', ''] : [text.slice(0, i), text.slice(i, i + q.length), text.slice(i + q.length)]
}
// one student per row: student code, name, email (a header row is skipped)
const parseRows = (text) => text.split(/\r?\n/).map((line, i) => {
  const [studentCode = '', name = '', email = ''] = line.split(/[,;\t]/).map((x) => x.replace(/^"|"$/g, '').trim())
  return { row: i + 1, studentCode, name, email }
}).filter((r) => (r.studentCode || r.email) && !/^student/i.test(r.studentCode))

// Step 2 of the setup: import the student list, see the skipped rows, publish (F7)
export default function SessionStudentsPage() {
  const { sessionId } = useParams()
  const { data: d, setData } = useLoad(() => examConfigApi.get(sessionId), [sessionId])
  const [s, setState] = useMergeState({ step: 'ready', busy: false, justPub: false, confirmFresh: false, q: '', showAll: false, expandFresh: false, countFlip: null, draft: 'idle', importOpen: false, importState: 'idle', fileName: '', importFlip: null, nudge: 0, error: null })
  if (!d) {
    return (
      <div className="pg-sessionstudents" style={{ minHeight: '100vh', display: 'flex', flexDirection: 'column' }}>
        <StaffTopBar current="sessions" />
      </div>
    )
  }
  const tick = (f) => (f === null ? '' : f ? 'a-tick-a' : 'a-tick-b')
  const draft = d.status === 'Draft'
  const q = s.q.trim().toLowerCase()
  const people = d.participants
  const n = people.length
  const matches = people.filter((p) => !q || p.fullName.toLowerCase().includes(q) || (p.studentCode ?? '').toLowerCase().includes(q) || p.email.toLowerCase().includes(q))
  const visible = q || s.showAll ? matches : matches.slice(0, FIRST)
  const rows = visible.map((p, i) => {
    const nm = split(p.fullName, q), c = split(p.studentCode ?? '', q)
    const revealed = s.expandFresh && !q && i >= FIRST
    return { key: p.userId, nA: nm[0], nB: nm[1], nC: nm[2], cA: c[0], cB: c[1], cC: c[2], email: p.email, cls: revealed ? 'a-rise' : '', delay: revealed ? Math.min((i - FIRST) * 22, 440) + 'ms' : '0ms' }
  })
  let countPre, countN, countPost
  if (q) { countPre = ''; countN = String(matches.length); countPost = ` of ${n} match` }
  else if (s.showAll || n <= FIRST) { countPre = 'Showing all '; countN = String(n); countPost = '' }
  else { countPre = 'Showing '; countN = String(FIRST); countPost = ` of ${n}` }

  const check = d.publishCheck
  const c1 = check.hasQuestion, c2 = check.hasQuestion && check.missingRubrics.length === 0, c3 = check.hasStudent
  const met = [c1, c2, c3].filter(Boolean).length
  const canPublish = met === 3 && check.hasWindow
  const missing = []
  if (!c1) missing.push('Import the question list in step 1.')
  if (c1 && !c2) missing.push('Write a rubric for every question in step 1.')
  if (!c3) missing.push('Import at least one student.')
  if (!check.hasWindow) missing.push('Set the time window in step 1.')
  const pickFile = async (e) => {
    const input = e.target
    const file = input.files && input.files[0]
    if (!file) return
    setState({ fileName: file.name, importState: 'reading', error: null })
    try {
      const next = await atLeast(examConfigApi.importParticipants(d.id, parseRows(await file.text())), 1100)
      setData(next)
      setState((p) => ({ importState: 'done', importOpen: false, importFlip: !p.importFlip }))
    } catch (err) {
      setState({ importState: 'idle', error: err.message })
    }
    input.value = ''
  }
  const publish = async () => {
    if (s.busy) return
    setState({ busy: true, error: null })
    try {
      setData(await atLeast(examConfigApi.publish(d.id), 700))
      setState({ busy: false, step: 'published', justPub: true, importOpen: false, draft: 'idle' })
    } catch (err) {
      setState({ busy: false, step: 'ready', error: err.message })
    }
  }
  const day = d.startAt ? formatDay(d.startAt) : ''
  const v = {
    isDraft: draft, isPublished: !draft,
    isReady: s.step === 'ready', isConfirm: s.step === 'confirm',
    statusText: draft ? 'Draft' : 'Published',
    statusInk: draft ? 'var(--ink-3)' : 'var(--ink-2)',
    statusCls: s.justPub ? 'a-rise' : '',
    ringCls: s.justPub ? 'st-ring' : '',
    readyCls: s.confirmFresh ? 'a-rise' : '',
    pubA: s.justPub ? 'a-rise' : '', pubB: s.justPub ? 'a-rise' : '', pubC: s.justPub ? 'a-rise' : '',
    pubWhen: s.justPub ? 'just now' : 'by you',
    busy: s.busy, busyCls: s.busy ? 'a-rise' : '',
    publishLabel: s.busy ? 'Publishing…' : 'Publish',
    askPublish: () => (canPublish ? setState({ step: 'confirm', confirmFresh: false }) : setState((p) => ({ nudge: p.nudge + 1 }))),
    cancel: () => { if (!s.busy) setState({ step: 'ready', confirmFresh: true }) },
    publish,
    draftBusy: s.draft === 'saving',
    draftLabel: s.draft === 'saving' ? 'Saving…' : 'Save draft',
    draftLabelCls: s.draft === 'saving' ? 'a-rise' : '',
    draftSaved: draft && s.draft === 'saved',
    // the list is saved as soon as it is imported; this confirms the draft is stored
    saveDraft: async () => { if (s.draft === 'saving') return; setState({ draft: 'saving' }); setData(await atLeast(examConfigApi.get(d.id), 650)); setState({ draft: 'saved' }) },
    importOpen: draft && s.importOpen,
    importReading: s.importState === 'reading',
    importDone: s.importState === 'done' && !s.importOpen,
    importTick: tick(s.importFlip),
    fileName: s.fileName,
    toggleImport: () => setState((p) => ({ importOpen: !p.importOpen, importState: p.importOpen ? p.importState : 'idle' })),
    pickFile,
    q: s.q,
    setQ: (e) => setState((p) => ({ q: e.target.value, countFlip: !p.countFlip, expandFresh: false })),
    clearQ: () => setState((p) => ({ q: '', countFlip: !p.countFlip })),
    rows,
    noMatch: !!q && matches.length === 0,
    countPre, countN, countPost, countCls: tick(s.countFlip),
    showToggle: !q && n > FIRST,
    showAll: s.showAll,
    toggleLabel: s.showAll ? 'Show fewer' : `Show all ${n}`,
    chevDeg: s.showAll ? '180deg' : '0deg',
    toggleAll: () => setState((p) => ({ showAll: !p.showAll, expandFresh: !p.showAll, countFlip: !p.countFlip })),
    title: `${d.title || 'Untitled session'}${d.classCode ? ` (${d.classCode})` : ''}`,
    courseLine: `${d.courseCode} · ${d.courseName}`,
    when: formatWindow(d.startAt, d.endAt),
    n, skipped: d.skippedRows, nSkipped: d.skippedRows.length,
    met, c1, c2, c3, qCount: d.questions.length, withRubric: d.questions.length - check.missingRubrics.length,
    canPublish, missingText: missing.join(' '), nudged: s.nudge > 0, nudgeTextCls: s.nudge % 2 ? 'a-tick-a' : 'a-tick-b',
    windowLong: d.startAt ? `${day} between ${formatTime(d.startAt)} and ${formatTime(d.endAt)}` : 'the time window',
    opensOn: day, opensAt: d.startAt ? formatTime(d.startAt) : '–', closesAt: d.endAt ? formatTime(d.endAt) : '',
    setupPath: paths.sessionSetup(d.id), studentsPath: paths.sessionStudents(d.id),
  }
  return (
    <div className="pg-sessionstudents" style={{ minHeight: "100vh", display: "flex", flexDirection: "column" }}>
      <StaffTopBar current="sessions" />
      <main className="a-gutter" style={{ flex: "1", width: "100%", maxWidth: "1280px", margin: "0 auto", padding: "48px 40px 80px", display: "flex", flexDirection: "column", gap: "40px" }}>
        <div className="a-rise" style={{ display: "flex", flexDirection: "column", gap: "28px" }}>
          <div className="a-stack-sm" style={{ display: "flex", alignItems: "flex-end", justifyContent: "space-between", gap: "24px" }}>
            <div style={{ display: "flex", flexDirection: "column", gap: "12px", minWidth: "0" }}>
              <Link className="a-link" to={paths.sessions} style={{ alignSelf: "flex-start", display: "inline-flex", alignItems: "center", gap: "6px", fontSize: "14px", color: "var(--ink-2)" }}>
                <svg width="16" height="16" viewBox="0 0 24 24" aria-hidden="true" style={{ fill: "none", stroke: "currentColor", strokeWidth: "1.75", strokeLinecap: "round", strokeLinejoin: "round" }}>
                  <path d="M15 6l-6 6 6 6" />
                </svg>
                Exam sessions
              </Link>
              <h1 className="a-title" style={{ fontFamily: "Alegreya, Georgia, serif", fontWeight: "500", fontSize: "44px", lineHeight: "1.08", letterSpacing: "-0.012em", color: "var(--night-indigo)", overflowWrap: "anywhere" }}>
                {v.title}
              </h1>
              <p style={{ display: "flex", flexWrap: "wrap", alignItems: "center", columnGap: "16px", rowGap: "6px", fontSize: "14.5px", color: "var(--ink-2)" }} aria-live="polite">
                <span style={{ display: "inline-flex", alignItems: "center", gap: "9px", color: v.statusInk }}>
                  {v.isPublished && (
                    <>
                      <svg width="14" height="14" viewBox="0 0 16 16" aria-hidden="true" style={{ flex: "none" }}>
                        <circle className={v.ringCls} cx="8" cy="8" r="6.25" style={{ fill: "none", stroke: "var(--ink-2)", strokeWidth: "1.5" }} />
                      </svg>
                    </>
                  )}
                  {v.isDraft && (
                    <>
                      <svg width="14" height="14" viewBox="0 0 16 16" aria-hidden="true" style={{ flex: "none" }}>
                        <circle cx="8" cy="8" r="6.25" style={{ fill: "none", stroke: "var(--ink-3)", strokeWidth: "1.5", strokeDasharray: "2.45 2.45" }} />
                      </svg>
                    </>
                  )}
                  <span className={v.statusCls}>
                    {v.statusText}
                  </span>
                </span>
                <span style={{ color: "var(--jade-ink)", fontWeight: "500" }}>
                  {v.courseLine}
                </span>
                <span>
                  {v.when}
                </span>
                {s.error && <span role="alert" style={{ fontSize: "13.5px", color: "var(--red-ink)" }}>{s.error}</span>}
        {v.draftSaved && (
                  <>
                    <span className="a-just" style={{ display: "inline-flex", alignItems: "center", gap: "6px", fontSize: "13.5px", color: "var(--jade-ink)" }}>
                      <span aria-hidden="true" style={{ width: "6px", height: "6px", borderRadius: "50%", background: "var(--jade-ink)" }} />
                      Draft saved just now
                    </span>
                  </>
                )}
              </p>
            </div>
            {v.isDraft && (
              <>
                <button type="button" className="a-btn a-btn-secondary" onClick={v.saveDraft} aria-disabled={v.draftBusy} style={{ flex: "none", height: "44px", padding: "0 18px", borderRadius: "12px", border: "1px solid var(--edge)", background: "rgba(255,255,255,0.6)", fontSize: "15px", fontWeight: "500", color: "var(--night-indigo)", display: "inline-flex", alignItems: "center", justifyContent: "center", gap: "10px" }}>
                  <svg width="18" height="18" viewBox="0 0 24 24" aria-hidden="true" style={{ fill: "none", stroke: "currentColor", strokeWidth: "1.75", strokeLinecap: "round", strokeLinejoin: "round" }}>
                    <path d="M5 4.5h11l3.5 3.5v11.5H5z" />
                    <path d="M8.5 4.5v4.5h6.5V4.5" />
                    <path d="M8.5 19.5v-5h7v5" />
                  </svg>
                  <span className={v.draftLabelCls}>
                    {v.draftLabel}
                  </span>
                </button>
              </>
            )}
          </div>
          <ol aria-label="Setup steps" style={{ display: "flex", flexWrap: "wrap", alignItems: "center", rowGap: "8px" }}>
            <li>
              <Link className="st-step" to={v.setupPath} style={{ display: "inline-flex", alignItems: "center", gap: "12px", height: "44px", textDecoration: "none", color: "var(--night-indigo)" }}>
                <span className="st-node" aria-hidden="true" style={{ width: "28px", height: "28px", borderRadius: "50%", border: "1px solid var(--ink-2)", color: "var(--night-indigo)", display: "grid", placeItems: "center", transition: "border-color .18s ease-out" }}>
                  <svg width="14" height="14" viewBox="0 0 24 24" style={{ fill: "none", stroke: "currentColor", strokeWidth: "2.2", strokeLinecap: "round", strokeLinejoin: "round" }}>
                    <path d="m5 12.5 4.5 4.5L19 7.5" />
                  </svg>
                </span>
                <span className="st-step-label" style={{ fontSize: "15px", fontWeight: "400", color: "var(--ink-2)", transition: "color .18s ease-out" }}>
                  Details and questions
                </span>
              </Link>
            </li>
            <li style={{ display: "flex", alignItems: "center" }}>
              <span className="st-conn" aria-hidden="true" style={{ display: "block", width: "48px", height: "1px", margin: "0 16px", background: "var(--night-indigo)" }} />
              <Link to={v.studentsPath} aria-current="step" style={{ display: "inline-flex", alignItems: "center", gap: "12px", height: "44px", textDecoration: "none", color: "var(--night-indigo)" }}>
                <span aria-hidden="true" style={{ width: "28px", height: "28px", borderRadius: "50%", background: "var(--night-indigo)", color: "var(--ivory)", display: "grid", placeItems: "center", fontSize: "13.5px", fontWeight: "500" }}>
                  2
                </span>
                <span style={{ fontSize: "15px", fontWeight: "500" }}>
                  Students
                </span>
              </Link>
            </li>
          </ol>
        </div>
        <div className="a-grid-1-sm" style={{ display: "grid", gridTemplateColumns: "minmax(0, 1fr) 372px", columnGap: "72px", rowGap: "56px", alignItems: "start" }}>
          <div className="a-rise" style={{ animationDelay: "60ms", display: "flex", flexDirection: "column", gap: "72px", minWidth: "0" }}>
            <section aria-labelledby="import-h" style={{ display: "flex", flexDirection: "column", gap: "24px", paddingTop: "28px", borderTop: "1px solid var(--line)" }}>
              <div className="a-stack-sm" style={{ display: "flex", alignItems: "flex-end", justifyContent: "space-between", gap: "16px 24px" }}>
                <div style={{ display: "flex", flexDirection: "column", gap: "6px", minWidth: "0" }}>
                  <h2 id="import-h" style={{ fontSize: "24px", lineHeight: "1.3", fontWeight: "500", letterSpacing: "-0.005em", color: "var(--night-indigo)" }}>
                    Import result
                  </h2>
                  <p style={{ fontSize: "14.5px", lineHeight: "1.45", color: "var(--ink-2)" }}>
                    Rows are matched to AIVES accounts by {PENDING.studentMatchKey}.
                  </p>
                </div>
                {v.isDraft && (
                  <>
                    <button type="button" className="a-btn a-btn-secondary" onClick={v.toggleImport} aria-expanded={v.importOpen} style={{ flex: "none", height: "44px", padding: "0 18px", borderRadius: "12px", border: "1px solid var(--edge)", background: "rgba(255,255,255,0.6)", fontSize: "15px", fontWeight: "500", color: "var(--night-indigo)", display: "inline-flex", alignItems: "center", justifyContent: "center", gap: "10px" }}>
                      <svg width="18" height="18" viewBox="0 0 24 24" aria-hidden="true" style={{ fill: "none", stroke: "currentColor", strokeWidth: "1.75", strokeLinecap: "round", strokeLinejoin: "round" }}>
                        <path d="M12 15V4" />
                        <path d="M7.5 8.5 12 4l4.5 4.5" />
                        <path d="M5 19.5h14" />
                      </svg>
                      Import student list
                    </button>
                  </>
                )}
              </div>
              {v.importOpen && (
                <>
                  <div className="st-open" style={{ display: "flex", flexDirection: "column", gap: "14px", padding: "4px 0 4px 20px", boxShadow: "inset 1px 0 0 var(--line-strong)" }}>
                    <div className="a-wrap-sm" style={{ display: "flex", alignItems: "center", gap: "12px 16px" }}>
                      <label className="st-file a-btn" style={{ position: "relative", height: "44px", padding: "0 18px", borderRadius: "12px", border: "1px solid var(--edge)", background: "rgba(255,255,255,0.6)", fontSize: "15px", fontWeight: "500", color: "var(--night-indigo)", display: "inline-flex", alignItems: "center", gap: "10px" }}>
                        <svg width="18" height="18" viewBox="0 0 24 24" aria-hidden="true" style={{ fill: "none", stroke: "currentColor", strokeWidth: "1.75", strokeLinecap: "round", strokeLinejoin: "round" }}>
                          <path d="M14 3.5H6.5v17h11V7z" />
                          <path d="M14 3.5V7h3.5" />
                        </svg>
                        Choose a file
                        <input type="file" accept=".csv,.txt" onChange={v.pickFile} style={{ position: "absolute", inset: "0", width: "100%", height: "100%", opacity: "0", cursor: "pointer" }} />
                      </label>
                      <span style={{ fontSize: "14.5px", color: "var(--ink-2)" }}>
                        One student per row · {PENDING.studentFileFormat}
                      </span>
                      <button type="button" className="a-btn a-btn-quiet" onClick={v.toggleImport} style={{ marginLeft: "auto", height: "44px", padding: "0 14px", border: "0", borderRadius: "10px", background: "transparent", fontSize: "15px", fontWeight: "500", color: "var(--ink-2)" }}>
                        Cancel
                      </button>
                    </div>
                    <p style={{ display: "flex", alignItems: "flex-start", gap: "8px", fontSize: "14px", lineHeight: "1.5", color: "var(--ink-3)" }}>
                      <svg width="16" height="16" viewBox="0 0 24 24" aria-hidden="true" style={{ flex: "none", marginTop: "3px", fill: "none", stroke: "var(--jade-ink)", strokeWidth: "1.75", strokeLinecap: "round", strokeLinejoin: "round" }}>
                        <circle cx="12" cy="12" r="9" />
                        <path d="M12 11v5" />
                        <path d="M12 7.6v.01" />
                      </svg>
                      A new file replaces the list below.
                    </p>
                    {v.importReading && (
                      <>
                        <p className="a-rise" aria-live="polite" style={{ fontSize: "14.5px", color: "var(--ink-2)" }}>
                          Reading{' '}{v.fileName}…
                        </p>
                      </>
                    )}
                  </div>
                </>
              )}
              <div style={{ display: "flex", flexDirection: "column", gap: "6px" }}>
                <p className="a-num" aria-live="polite" style={{ display: "flex", flexWrap: "wrap", alignItems: "baseline", columnGap: "28px", rowGap: "6px", fontSize: "16.5px", color: "var(--ink-2)" }}>
                  <span>
                    <span className={v.importTick} style={{ fontSize: "20px", fontWeight: "300", color: "var(--night-indigo)" }}>
                      {v.n}
                    </span>
                    {' '}students added
                  </span>
                  <span style={{ color: "var(--red-ink)" }}>
                    <span className={v.importTick} style={{ fontSize: "20px", fontWeight: "300" }}>
                      {v.nSkipped}
                    </span>
                    {' '}rows skipped
                  </span>
                </p>
                {v.importDone && (
                  <>
                    <div className="a-just" style={{ display: "flex", alignItems: "center", gap: "6px", fontSize: "12.5px", color: "var(--jade-ink)" }}>
                      <span aria-hidden="true" style={{ width: "6px", height: "6px", borderRadius: "50%", background: "var(--jade-ink)" }} />
                      read from{' '}{v.fileName}{' '}just now
                    </div>
                  </>
                )}
              </div>
              {v.nSkipped > 0 && (
              <div style={{ display: "flex", flexDirection: "column", gap: "14px" }}>
                <h3 style={{ display: "flex", alignItems: "center", gap: "10px", fontSize: "15px", fontWeight: "500", color: "var(--night-indigo)" }}>
                  <svg width="18" height="18" viewBox="0 0 24 24" aria-hidden="true" style={{ flex: "none", fill: "none", stroke: "var(--red-ink)", strokeWidth: "1.75", strokeLinecap: "round", strokeLinejoin: "round" }}>
                    <path d="M12 4 21 19.5H3z" />
                    <path d="M12 10v4.5" />
                    <path d="M12 17.2v.01" />
                  </svg>
                  Skipped rows
                </h3>
                <div style={{ overflowX: "auto", margin: "0 -12px", padding: "0 12px" }}>
                  <table className="st-skip" style={{ width: "100%", minWidth: "460px", textAlign: "left" }}>
                    <thead>
                      <tr style={{ boxShadow: "inset 0 -1px 0 var(--line-strong)" }}>
                        <th scope="col" style={{ padding: "0 24px 12px 0", width: "64px", fontSize: "13.5px", fontWeight: "500", color: "var(--ink-3)", textAlign: "right" }}>
                          Row
                        </th>
                        <th scope="col" style={{ padding: "0 16px 12px 0", fontSize: "13.5px", fontWeight: "500", color: "var(--ink-3)" }}>
                          In the file
                        </th>
                        <th scope="col" className="a-hide-sm" style={{ padding: "0 0 12px 0", fontSize: "13.5px", fontWeight: "500", color: "var(--ink-3)" }}>
                          Why it was skipped
                        </th>
                      </tr>
                    </thead>
                    <tbody>
                      {v.skipped.map((r) => (
                        <tr key={r.row} className="a-row" style={{ boxShadow: "inset 0 -1px 0 var(--line)" }}>
                          <td className="a-num" style={{ padding: "14px 24px 14px 0", verticalAlign: "top", textAlign: "right", fontSize: "20px", fontWeight: "300", lineHeight: "1.2", color: "var(--night-indigo)" }}>
                            {r.row}
                          </td>
                          <td style={{ padding: "16px 16px 16px 0", verticalAlign: "top", minWidth: "170px" }} className="st-skip-name">
                            <div style={{ fontSize: "15.5px", lineHeight: "1.35", fontWeight: "500", color: "var(--night-indigo)" }}>
                              {r.fullName}
                            </div>
                            <div style={{ marginTop: "3px", fontSize: "13.5px", color: "var(--ink-3)" }}>
                              {r.studentCode}
                            </div>
                            <div className="st-why-sm" style={{ display: "none", marginTop: "4px", fontSize: "13.5px", fontWeight: "400", color: "var(--red-ink)" }}>
                              {r.reason}
                            </div>
                          </td>
                          <td className="a-hide-sm" style={{ padding: "16px 0 16px 0", verticalAlign: "top", fontSize: "14.5px", color: "var(--red-ink)" }}>
                            {r.reason}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                <p style={{ display: "flex", alignItems: "flex-start", gap: "8px", fontSize: "14px", lineHeight: "1.5", color: "var(--ink-3)", maxWidth: "44em" }}>
                  <svg width="16" height="16" viewBox="0 0 24 24" aria-hidden="true" style={{ flex: "none", marginTop: "3px", fill: "none", stroke: "var(--jade-ink)", strokeWidth: "1.75", strokeLinecap: "round", strokeLinejoin: "round" }}>
                    <circle cx="12" cy="12" r="9" />
                    <path d="M12 11v5" />
                    <path d="M12 7.6v.01" />
                  </svg>
                  Ask these students to register, or ask an administrator to create their accounts, then import the list again.
                </p>
              </div>
              )}
            </section>
            <section aria-labelledby="list-h" style={{ display: "flex", flexDirection: "column", gap: "20px", paddingTop: "28px", borderTop: "1px solid var(--line)" }}>
              <div className="a-stack-sm" style={{ display: "flex", alignItems: "flex-end", justifyContent: "space-between", gap: "16px 24px" }}>
                <h2 id="list-h" style={{ fontSize: "24px", lineHeight: "1.3", fontWeight: "500", letterSpacing: "-0.005em", color: "var(--night-indigo)" }}>
                  {v.n} students can take this exam
                </h2>
              </div>
              <div className="a-wrap-sm" style={{ display: "flex", alignItems: "flex-end", gap: "16px" }}>
                <div className="a-full-sm" style={{ display: "flex", flexDirection: "column", gap: "8px", width: "340px" }}>
                  <label htmlFor="f-find" style={{ fontSize: "14px", fontWeight: "500", color: "var(--night-indigo)" }}>
                    Find a student
                  </label>
                  <div style={{ position: "relative" }}>
                    <svg width="18" height="18" viewBox="0 0 24 24" aria-hidden="true" style={{ position: "absolute", left: "13px", top: "13px", pointerEvents: "none", fill: "none", stroke: "var(--ink-3)", strokeWidth: "1.75", strokeLinecap: "round" }}>
                      <circle cx="11" cy="11" r="6.5" />
                      <path d="m16 16 4 4" />
                    </svg>
                    <input id="f-find" type="search" className="a-field st-search" value={v.q} onChange={v.setQ} placeholder="Name or student code" autoComplete="off" aria-controls="student-list" style={{ width: "100%", height: "44px", padding: "0 14px 0 40px", borderRadius: "10px", border: "1px solid var(--edge)", background: "var(--field-white)", fontSize: "15px", color: "var(--night-indigo)" }} />
                  </div>
                </div>
                <p className="a-num" aria-live="polite" style={{ marginLeft: "auto", height: "44px", display: "flex", alignItems: "center", whiteSpace: "pre", fontSize: "13.5px", color: "var(--ink-3)" }}>
                  {v.countPre}
                  <span className={v.countCls} style={{ fontWeight: "500", color: "var(--night-indigo)" }}>
                    {v.countN}
                  </span>
                  {v.countPost}
                </p>
              </div>
              <div>
                <div className="st-cols" aria-hidden="true" style={{ display: "grid", gridTemplateColumns: "minmax(0, 1.15fr) 120px minmax(0, 1.25fr)", columnGap: "24px", paddingBottom: "12px", boxShadow: "inset 0 -1px 0 var(--line-strong)", fontSize: "13.5px", fontWeight: "500", color: "var(--ink-3)" }}>
                  <span>
                    Name
                  </span>
                  <span>
                    Student code
                  </span>
                  <span>
                    Email
                  </span>
                </div>
                <ul id="student-list" aria-label="Students on this session">
                  {v.rows.map((s, s_i) => (
                    <Fragment key={s.key ?? s_i}>
                      <li className={`st-li ${s.cls}`} style={{ animationDelay: s.delay, display: "grid", gridTemplateColumns: "minmax(0, 1.15fr) 120px minmax(0, 1.25fr)", columnGap: "24px", alignItems: "baseline", padding: "15px 0", boxShadow: "inset 0 -1px 0 var(--line)" }}>
                        <span style={{ fontSize: "15.5px", lineHeight: "1.35", fontWeight: "500", color: "var(--night-indigo)", minWidth: "0" }}>
                          {s.nA}
                          <mark style={{ background: "var(--jade-select)", color: "inherit", borderRadius: "3px" }}>
                            {s.nB}
                          </mark>
                          {s.nC}
                        </span>
                        <span className="a-num" style={{ fontSize: "14.5px", color: "var(--ink-2)" }}>
                          {s.cA}
                          <mark style={{ background: "var(--jade-select)", color: "inherit", borderRadius: "3px" }}>
                            {s.cB}
                          </mark>
                          {s.cC}
                        </span>
                        <span className="st-li-mail" style={{ fontSize: "14.5px", color: "var(--ink-2)", overflowWrap: "anywhere", minWidth: "0" }}>
                          {s.email}
                        </span>
                      </li>
                    </Fragment>
                  ))}
                </ul>
                {v.noMatch && (
                  <>
                    <div className="a-rise" style={{ display: "flex", flexWrap: "wrap", alignItems: "center", gap: "8px 16px", padding: "22px 0", boxShadow: "inset 0 -1px 0 var(--line)" }}>
                      <p style={{ fontSize: "15px", color: "var(--ink-2)" }}>
                        No student on this list matches “{v.q}”.
                      </p>
                      <button type="button" className="a-btn a-btn-quiet" onClick={v.clearQ} style={{ height: "44px", padding: "0 14px", border: "0", borderRadius: "10px", background: "transparent", fontSize: "15px", fontWeight: "500", color: "var(--ink-2)" }}>
                        Clear search
                      </button>
                    </div>
                  </>
                )}
              </div>
              {v.showToggle && (
                <>
                  <button type="button" className="a-btn a-btn-secondary" onClick={v.toggleAll} aria-expanded={v.showAll} aria-controls="student-list" style={{ alignSelf: "flex-start", height: "44px", padding: "0 18px", borderRadius: "12px", border: "1px solid var(--edge)", background: "rgba(255,255,255,0.6)", fontSize: "15px", fontWeight: "500", color: "var(--night-indigo)", display: "inline-flex", alignItems: "center", gap: "10px" }}>
                    <svg width="18" height="18" viewBox="0 0 24 24" aria-hidden="true" style={{ transform: `rotate(${v.chevDeg})`, transition: "transform .4s cubic-bezier(0.34,1.32,0.64,1)", fill: "none", stroke: "currentColor", strokeWidth: "1.75", strokeLinecap: "round", strokeLinejoin: "round" }}>
                      <path d="m6 9 6 6 6-6" />
                    </svg>
                    {v.toggleLabel}
                  </button>
                </>
              )}
            </section>
          </div>
          <aside className="st-aside" aria-labelledby="ready-h" style={{ position: "sticky", top: "24px" }}>
            <div className="a-night a-rise" style={{ animationDelay: "120ms", display: "flex", flexDirection: "column", gap: "24px", padding: "26px 24px 24px", borderRadius: "20px", backgroundColor: "var(--night-indigo)", backgroundImage: "radial-gradient(420px 260px at 100% 0%, var(--jade-wash), rgba(15,22,48,0) 70%)", color: "var(--ivory)", boxShadow: "0 24px 48px -28px rgba(15,22,48,0.7)" }}>
              {v.isDraft && (
                <>
                  <div style={{ display: "flex", flexDirection: "column", gap: "24px" }}>
                    <div style={{ display: "flex", flexDirection: "column", gap: "10px" }}>
                      <h2 id="ready-h" style={{ fontSize: "15px", fontWeight: "500", color: "var(--ivory)" }}>
                        Ready to publish?
                      </h2>
                      <p className="a-num" style={{ display: "flex", alignItems: "baseline", gap: "10px" }}>
                        <span style={{ fontSize: "72px", fontWeight: "200", lineHeight: "0.95", letterSpacing: "-0.02em" }}>
                          3
                        </span>
                        <span style={{ fontSize: "18px", fontWeight: "300", color: "var(--ivory-2)" }}>
                          of 3 checks met
                        </span>
                      </p>
                    </div>
                    <ul style={{ display: "flex", flexDirection: "column", gap: "18px", paddingTop: "20px", borderTop: "1px solid var(--night-line)" }}>
                      <li style={{ display: "grid", gridTemplateColumns: "20px minmax(0, 1fr)", columnGap: "14px", rowGap: "2px" }}>
                        <span className="a-pop" style={{ animationDelay: "720ms", marginTop: "1px", display: "flex" }}>
                          {v.c1 ? (
                            <svg width="20" height="20" viewBox="0 0 16 16" aria-hidden="true">
                              <circle cx="8" cy="8" r="6.25" style={{ fill: "none", stroke: "var(--ivory)", strokeWidth: "1.5" }} />
                              <circle cx="8" cy="8" r="6.25" style={{ fill: "var(--ivory)" }} />
                            </svg>
                          ) : (
                            <svg width="20" height="20" viewBox="0 0 16 16" aria-hidden="true">
                              <circle cx="8" cy="8" r="6.25" style={{ fill: "none", stroke: "var(--ivory-2)", strokeWidth: "1.5" }} />
                            </svg>
                          )}
                        </span>
                        <span style={{ fontSize: "15px", fontWeight: "500" }}>
                          At least one question
                        </span>
                        <span style={{ gridColumn: "2", fontSize: "14px", color: "var(--ivory-2)" }}>
                          {v.qCount} questions
                        </span>
                      </li>
                      <li style={{ display: "grid", gridTemplateColumns: "20px minmax(0, 1fr)", columnGap: "14px", rowGap: "2px" }}>
                        <span className="a-pop" style={{ animationDelay: "800ms", marginTop: "1px", display: "flex" }}>
                          {v.c2 ? (
                            <svg width="20" height="20" viewBox="0 0 16 16" aria-hidden="true">
                              <circle cx="8" cy="8" r="6.25" style={{ fill: "none", stroke: "var(--ivory)", strokeWidth: "1.5" }} />
                              <circle cx="8" cy="8" r="6.25" style={{ fill: "var(--ivory)" }} />
                            </svg>
                          ) : (
                            <svg width="20" height="20" viewBox="0 0 16 16" aria-hidden="true">
                              <circle cx="8" cy="8" r="6.25" style={{ fill: "none", stroke: "var(--ivory-2)", strokeWidth: "1.5" }} />
                            </svg>
                          )}
                        </span>
                        <span style={{ fontSize: "15px", fontWeight: "500" }}>
                          A rubric for every question
                        </span>
                        <span style={{ gridColumn: "2", fontSize: "14px", color: "var(--ivory-2)" }}>
                          {v.withRubric} of {v.qCount} questions
                        </span>
                      </li>
                      <li style={{ display: "grid", gridTemplateColumns: "20px minmax(0, 1fr)", columnGap: "14px", rowGap: "2px" }}>
                        <span className="a-pop" style={{ animationDelay: "880ms", marginTop: "1px", display: "flex" }}>
                          {v.c3 ? (
                            <svg width="20" height="20" viewBox="0 0 16 16" aria-hidden="true">
                              <circle cx="8" cy="8" r="6.25" style={{ fill: "none", stroke: "var(--ivory)", strokeWidth: "1.5" }} />
                              <circle cx="8" cy="8" r="6.25" style={{ fill: "var(--ivory)" }} />
                            </svg>
                          ) : (
                            <svg width="20" height="20" viewBox="0 0 16 16" aria-hidden="true">
                              <circle cx="8" cy="8" r="6.25" style={{ fill: "none", stroke: "var(--ivory-2)", strokeWidth: "1.5" }} />
                            </svg>
                          )}
                        </span>
                        <span style={{ fontSize: "15px", fontWeight: "500" }}>
                          At least one student
                        </span>
                        <span style={{ gridColumn: "2", fontSize: "14px", color: "var(--ivory-2)" }}>
                          {v.n} students
                        </span>
                      </li>
                    </ul>
                    {v.isReady && (
                      <>
                        <div className={v.readyCls} style={{ display: "flex", flexDirection: "column", gap: "14px" }}>
                          <button type="button" className="a-btn a-btn-primary" onClick={v.askPublish} aria-expanded={false} aria-disabled={!v.canPublish} aria-describedby="publish-why" style={{ height: "52px", border: "0", borderRadius: "14px", background: "var(--ivory)", color: "var(--night-indigo)", fontSize: "16px", fontWeight: "500", boxShadow: "0 10px 28px -12px rgba(0,0,0,0.55)" }}>
                            Publish session
                          </button>
                          {v.nudged && (
                            <p id="publish-why" className={v.nudgeTextCls} role="alert" style={{ display: "grid", gridTemplateColumns: "18px minmax(0, 1fr)", columnGap: "10px", padding: "12px 14px", borderRadius: "12px", background: "var(--red-wash-night)", border: "1px solid rgba(255,106,79,0.4)", fontSize: "14px", lineHeight: "1.5" }}>
                              <svg width="18" height="18" viewBox="0 0 24 24" aria-hidden="true" style={{ marginTop: "1px", fill: "none", stroke: "var(--ember-text)", strokeWidth: "1.75", strokeLinecap: "round", strokeLinejoin: "round" }}>
                                <path d="M12 4 21 19.5H3z" />
                                <path d="M12 10v4.5" />
                                <path d="M12 17.2v.01" />
                              </svg>
                              <span><span style={{ fontWeight: "500", color: "var(--ember-text)" }}>Not yet.</span>{' '}{v.missingText}</span>
                            </p>
                          )}
                          <p style={{ display: "flex", alignItems: "flex-start", gap: "8px", fontSize: "13.5px", lineHeight: "1.45", color: "var(--ivory-2)" }}>
                            <svg width="16" height="16" viewBox="0 0 24 24" aria-hidden="true" style={{ flex: "none", marginTop: "1px", fill: "none", stroke: "currentColor", strokeWidth: "1.75", strokeLinecap: "round", strokeLinejoin: "round" }}>
                              <rect x="5" y="11" width="14" height="9" rx="2" />
                              <path d="M8 11V8a4 4 0 0 1 8 0v3" />
                            </svg>
                            Publishing locks the questions and rubrics.
                          </p>
                        </div>
                      </>
                    )}
                    {v.isConfirm && (
                      <>
                        <div className="st-open" role="group" aria-labelledby="confirm-h" style={{ display: "flex", flexDirection: "column", gap: "18px", paddingTop: "20px", borderTop: "1px solid var(--night-line)" }}>
                          <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
                            <h3 id="confirm-h" style={{ fontSize: "24px", lineHeight: "1.3", fontWeight: "500", letterSpacing: "-0.005em", color: "var(--ivory)" }}>
                              Publish now?
                            </h3>
                            <p style={{ fontSize: "15px", lineHeight: "1.55", fontWeight: "300", color: "var(--ivory-2)" }}>
                              The questions and rubrics will be locked. The {v.n} students can start on{' '}
                              <span style={{ fontWeight: "500", color: "var(--ivory)" }}>
                                {v.windowLong}
                              </span>
                              .
                            </p>
                          </div>
                          <div style={{ display: "flex", flexWrap: "wrap", gap: "10px" }}>
                            <button type="button" className="a-btn a-btn-primary" onClick={v.publish} aria-disabled={v.busy} style={{ flex: "1 1 140px", height: "52px", padding: "0 24px", border: "0", borderRadius: "14px", background: "var(--ivory)", color: "var(--night-indigo)", fontSize: "16px", fontWeight: "500", boxShadow: "0 10px 28px -12px rgba(0,0,0,0.55)", display: "inline-flex", alignItems: "center", justifyContent: "center", gap: "10px" }}>
                              {v.busy && (
                                <>
                                  <svg className="a-rec" width="14" height="14" viewBox="0 0 16 16" aria-hidden="true">
                                    <circle cx="8" cy="8" r="6.25" style={{ fill: "none", stroke: "var(--night-indigo)", strokeWidth: "1.5" }} />
                                    <path d="M8 1.75a6.25 6.25 0 0 1 0 12.5a2.6 6.25 0 0 0 0-12.5z" style={{ fill: "var(--night-indigo)" }} />
                                  </svg>
                                </>
                              )}
                              <span className={v.busyCls}>
                                {v.publishLabel}
                              </span>
                            </button>
                            <button type="button" className="a-btn a-btn-secondary" onClick={v.cancel} aria-disabled={v.busy} style={{ flex: "0 1 auto", height: "52px", padding: "0 20px", borderRadius: "14px", border: "1px solid var(--night-edge)", background: "transparent", color: "var(--ivory)", fontSize: "15px", fontWeight: "500" }}>
                              Not yet
                            </button>
                          </div>
                        </div>
                      </>
                    )}
                  </div>
                </>
              )}
              {v.isPublished && (
                <>
                  <div style={{ display: "flex", flexDirection: "column", gap: "24px" }} aria-live="polite">
                    <div className={v.pubA} style={{ display: "flex", alignItems: "center", gap: "10px" }}>
                      <svg width="20" height="20" viewBox="0 0 16 16" aria-hidden="true" style={{ flex: "none" }}>
                        <circle className={v.ringCls} cx="8" cy="8" r="6.25" style={{ fill: "none", stroke: "var(--ivory-2)", strokeWidth: "1.5" }} />
                      </svg>
                      <h2 id="ready-h" style={{ fontSize: "15px", fontWeight: "500", color: "var(--ivory)" }}>
                        Published
                      </h2>
                      <span style={{ marginLeft: "auto", fontSize: "13px", color: "var(--ivory-2)" }}>
                        {v.pubWhen}
                      </span>
                    </div>
                    <div className={v.pubB} style={{ animationDelay: "60ms", display: "flex", flexDirection: "column", gap: "8px" }}>
                      <p style={{ fontSize: "15px", color: "var(--ivory-2)" }}>
                        Opens on {v.opensOn} at
                      </p>
                      <p className="a-num" style={{ display: "flex", alignItems: "baseline", gap: "10px" }}>
                        <span className="a-score-xl" style={{ fontSize: "72px", fontWeight: "200", lineHeight: "0.95", letterSpacing: "-0.02em" }}>
                          {v.opensAt}
                        </span>
                        <span style={{ fontSize: "18px", fontWeight: "300", color: "var(--ivory-2)" }}>
                          to {v.closesAt}
                        </span>
                      </p>
                    </div>
                    <ul className={v.pubC} style={{ animationDelay: "120ms", display: "flex", flexDirection: "column", gap: "14px", paddingTop: "20px", borderTop: "1px solid var(--night-line)", fontSize: "14.5px", lineHeight: "1.5", fontWeight: "300" }}>
                      <li style={{ display: "grid", gridTemplateColumns: "18px minmax(0, 1fr)", columnGap: "12px" }}>
                        <svg width="18" height="18" viewBox="0 0 24 24" aria-hidden="true" style={{ marginTop: "2px", fill: "none", stroke: "var(--jade)", strokeWidth: "1.75", strokeLinecap: "round", strokeLinejoin: "round" }}>
                          <rect x="5" y="11" width="14" height="9" rx="2" />
                          <path d="M8 11V8a4 4 0 0 1 8 0v3" />
                        </svg>
                        <span>
                          Questions and rubrics are locked.
                        </span>
                      </li>
                      <li style={{ display: "grid", gridTemplateColumns: "18px minmax(0, 1fr)", columnGap: "12px" }}>
                        <svg width="18" height="18" viewBox="0 0 24 24" aria-hidden="true" style={{ marginTop: "2px", fill: "none", stroke: "var(--jade)", strokeWidth: "1.75", strokeLinecap: "round", strokeLinejoin: "round" }}>
                          <circle cx="9" cy="8.5" r="3.5" />
                          <path d="M2.5 20a6.5 6.5 0 0 1 13 0" />
                          <path d="M16 5.2a3.5 3.5 0 0 1 0 6.6" />
                          <path d="M18.5 14.5A6.5 6.5 0 0 1 21.5 20" />
                        </svg>
                        <span>
                          {v.n} students can start once each, inside the window.
                        </span>
                      </li>
                    </ul>
                    <Link to={paths.sessions} className={`a-btn a-btn-primary ${v.pubC}`} style={{ animationDelay: "180ms", height: "52px", padding: "0 24px", borderRadius: "14px", background: "var(--ivory)", color: "var(--night-indigo)", fontSize: "16px", fontWeight: "500", textDecoration: "none", display: "inline-flex", alignItems: "center", justifyContent: "center", gap: "10px", boxShadow: "0 10px 28px -12px rgba(0,0,0,0.55)" }}>
                      Back to exam sessions
                      <svg width="18" height="18" viewBox="0 0 24 24" aria-hidden="true" style={{ fill: "none", stroke: "currentColor", strokeWidth: "1.75", strokeLinecap: "round", strokeLinejoin: "round" }}>
                        <path d="M5 12h14" />
                        <path d="m13 6 6 6-6 6" />
                      </svg>
                    </Link>
                  </div>
                </>
              )}
            </div>
          </aside>
          <div className="a-stack-sm st-foot a-rise" style={{ gridColumn: "1", marginTop: "16px", animationDelay: "60ms", display: "flex", alignItems: "center", justifyContent: "space-between", gap: "16px 24px" }}>
            <Link to={v.setupPath} className="a-btn a-btn-secondary" style={{ height: "44px", padding: "0 18px", borderRadius: "12px", border: "1px solid var(--edge)", background: "rgba(255,255,255,0.6)", fontSize: "15px", fontWeight: "500", color: "var(--night-indigo)", textDecoration: "none", display: "inline-flex", alignItems: "center", justifyContent: "center", gap: "10px" }}>
              <svg width="18" height="18" viewBox="0 0 24 24" aria-hidden="true" style={{ fill: "none", stroke: "currentColor", strokeWidth: "1.75", strokeLinecap: "round", strokeLinejoin: "round" }}>
                <path d="M19 12H5" />
                <path d="m11 6-6 6 6 6" />
              </svg>
              Back: Details and questions
            </Link>
            {USE_MOCKS ? <p style={{ fontSize: "13px", color: "var(--ink-3)" }}>All names, dates and scores on this page are sample data.</p> : <span />}
          </div>
        </div>
      </main>
    </div>
  )
}
