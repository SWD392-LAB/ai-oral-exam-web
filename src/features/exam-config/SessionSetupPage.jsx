import { Fragment, useEffect } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { paths } from '../../app/routes/paths.js'
import { USE_MOCKS } from '../../api/client.js'
import { examConfigApi } from '../../api/services.js'
import { StaffTopBar } from '../../components/TopBar.jsx'
import { useLoad } from '../../hooks/useLoad.js'
import { useMergeState } from '../../hooks/useMergeState.js'
import { useTimeouts } from '../../hooks/useTimeouts.js'
import { atLeast } from '../../utils/async.js'
import { pad2 } from '../../utils/format.js'
import { PENDING } from '../../utils/pending.js'
import './SessionSetup.css'

const DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
const parseDate = (iso) => { const p = String(iso || '').split('-').map(Number); return p.length === 3 && p.every((n) => n > 0) ? p : null }
const parseTime = (t) => { const p = String(t || '').split(':').map(Number); return p.length >= 2 && !p.some(Number.isNaN) ? p : null }
const dayLabel = (p) => { const d = new Date(p[0], p[1] - 1, p[2]); return `${DAYS[d.getDay()]} ${p[2]} ${MONTHS[p[1] - 1]}` }
const durText = (m) => { const h = Math.floor(m / 60), r = m % 60; return [h ? `${h} ${h === 1 ? 'hour' : 'hours'}` : '', r ? `${r} min` : ''].filter(Boolean).join(' ') }
const fmtPts = (n) => (Math.round(n * 100) / 100).toString()
const isoDate = (d) => `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`
const isoTime = (d) => `${pad2(d.getHours())}:${pad2(d.getMinutes())}`
const toIso = (date, time) => { const d = parseDate(date), t = parseTime(time); return d && t ? new Date(d[0], d[1] - 1, d[2], t[0], t[1]).toISOString() : null }
// "Viva 3: Design patterns (SE1834)" -> title + class code
const splitName = (name) => { const m = name.trim().match(/^(.*?)\s*\(([^()]+)\)$/); return m ? { title: m[1], classCode: m[2] } : { title: name.trim(), classCode: null } }
const listNums = (ns) => (ns.length === 1 ? `Question ${ns[0]} has` : `Questions ${ns.slice(0, -1).join(', ')} and ${ns[ns.length - 1]} have`)

// Step 1 of the exam session setup: details, time window, limits, questions and rubrics (F7)
export default function SessionSetupPage() {
  const { sessionId } = useParams()
  const navigate = useNavigate()
  const { data: courses } = useLoad(() => examConfigApi.myCourses(), [])
  const { data: d, setData } = useLoad(() => examConfigApi.get(sessionId), [sessionId])
  const { later } = useTimeouts()
  const [s, setState] = useMergeState({ form: null, open: null, closing: null, saving: null, guides: {}, maxes: {}, err: null, errFlip: false, justQ: null, c2Just: false, metFlip: null, totalFlip: null, winFlip: null, draft: 'idle', importOpen: false, importState: 'idle', fileName: '', imported: 0, nudge: 0, error: null })

  // the form starts from the stored session
  useEffect(() => {
    if (!d || s.form) return
    const st = d.startAt ? new Date(d.startAt) : null, en = d.endAt ? new Date(d.endAt) : null
    setState({
      form: { name: d.title ? `${d.title}${d.classCode ? ` (${d.classCode})` : ''}` : '', course: d.courseId, od: st ? isoDate(st) : '', ot: st ? isoTime(st) : '13:00', cd: en ? isoDate(en) : '', ct: en ? isoTime(en) : '15:00', limit: String(d.timeLimitSeconds), follow: String(d.maxFollowUps) },
      guides: Object.fromEntries(d.questions.map((q) => [q.id, q.rubric?.criteria ?? ''])),
      maxes: Object.fromEntries(d.questions.map((q) => [q.id, String(q.rubric?.maxScore ?? 2.5)])),
    })
  }, [d, s.form, setState])

  if (!d || !s.form) {
    return (
      <div className="pg-sessionsetup" style={{ minHeight: '100vh', display: 'flex', flexDirection: 'column' }}>
        <StaffTopBar current="sessions" />
      </div>
    )
  }

  const f = s.form
  const tick = (x) => (x === null ? '' : x ? 'a-tick-a' : 'a-tick-b')
  const od = parseDate(f.od), cd = parseDate(f.cd), ot = parseTime(f.ot), ct = parseTime(f.ct)
  const complete = od && cd && ot && ct
  let mins = 0
  if (complete) mins = (new Date(cd[0], cd[1] - 1, cd[2], ct[0], ct[1]) - new Date(od[0], od[1] - 1, od[2], ot[0], ot[1])) / 60000
  const winBad = !!complete && mins <= 0
  const winOk = !!complete && mins > 0
  const sameDay = complete && f.od === f.cd
  const winText = winOk ? (sameDay
    ? `${dayLabel(od)}, ${pad2(ot[0])}:${pad2(ot[1])} to ${pad2(ct[0])}:${pad2(ct[1])}`
    : `${dayLabel(od)}, ${pad2(ot[0])}:${pad2(ot[1])} to ${dayLabel(cd)}, ${pad2(ct[0])}:${pad2(ct[1])}`) : ''
  const qs = d.questions
  const total = qs.reduce((a, q) => a + (parseFloat(s.maxes[q.id]) || 0), 0)
  const followN = parseInt(f.follow, 10)
  const course = (courses ?? []).find((c) => c.id === f.course)

  const payload = () => {
    const { title, classCode } = splitName(f.name)
    return { title: title || 'Untitled session', classCode, courseId: f.course, startAt: winOk ? toIso(f.od, f.ot) : null, endAt: winOk ? toIso(f.cd, f.ct) : null, timeLimitSeconds: Math.max(10, parseInt(f.limit, 10) || 90), maxFollowUps: Math.max(0, parseInt(f.follow, 10) || 0) }
  }
  const saveDraft = async () => {
    if (s.draft === 'saving') return
    setState({ draft: 'saving', error: null })
    try { setData(await atLeast(examConfigApi.update(d.id, payload()), 650)); setState({ draft: 'saved' }) } catch (e) { setState({ draft: 'idle', error: e.message }) }
  }
  const openEditor = (i) => {
    if (s.open === i) return
    setState({ open: i, closing: s.open, err: null, justQ: null })
    if (s.open !== null) later(() => setState({ closing: null }), 260)
  }
  const closeEditor = (i) => { setState({ open: null, closing: i, err: null }); later(() => setState({ closing: null }), 260) }
  const saveRubric = async (i) => {
    const q = qs[i]
    if (s.saving !== null) return
    if (!String(s.guides[q.id] || '').trim()) { setState((p) => ({ err: i, errFlip: !p.errFlip })); return }
    setState({ saving: i, err: null })
    try {
      const firstTime = !q.rubric
      const next = await atLeast(examConfigApi.saveRubric(d.id, q.id, s.guides[q.id].trim(), Number(s.maxes[q.id]) || 2.5), 520)
      setData(next)
      setState((p) => ({ saving: null, open: null, closing: i, justQ: i, c2Just: firstTime && next.publishCheck.missingRubrics.length === 0, metFlip: firstTime ? !p.metFlip : p.metFlip, nudge: 0 }))
      later(() => setState({ closing: null }), 260)
    } catch (e) {
      setState({ saving: null, error: e.message })
    }
  }
  // the question list: one question per row (the accepted format is still to be decided)
  const pickFile = async (e) => {
    const input = e.target
    const file = input.files && input.files[0]
    if (!file) return
    setState({ fileName: file.name, importState: 'reading', error: null })
    try {
      const text = await file.text()
      const rows = text.split(/\r?\n/).map((r) => r.replace(/^"|"$/g, '').trim()).filter(Boolean)
      const next = await atLeast(examConfigApi.importQuestions(d.id, rows), 1100)
      setData(next)
      setState((p) => ({ importState: 'done', importOpen: false, imported: rows.length, guides: { ...Object.fromEntries(next.questions.map((q) => [q.id, q.rubric?.criteria ?? ''])), ...p.guides }, maxes: { ...Object.fromEntries(next.questions.map((q) => [q.id, String(q.rubric?.maxScore ?? 2.5)])), ...p.maxes } }))
    } catch (err) {
      setState({ importState: 'idle', error: err.message })
    }
    input.value = ''
  }

  const questions = qs.map((q, i) => {
    const set = !!q.rubric
    const editing = s.open === i, closing = s.closing === i
    const busy = s.saving === i
    return {
      key: q.id, n: i + 1, text: q.text, set, missing: !set,
      statusCls: s.justQ === i ? 'a-rise' : '', moonCls: s.justQ === i ? 'a-moon-fill' : '',
      max: s.maxes[q.id] ?? '2.5',
      showEdit: !editing && !closing, editLabel: set ? 'Edit rubric' : 'Write rubric',
      just: s.justQ === i && !editing && !closing,
      panel: editing || closing, panelCls: closing ? 'ss-close' : 'ss-open',
      guide: s.guides[q.id] ?? '', placeholder: set ? '' : 'Full score names … Part score …',
      err: s.err === i, errCls: s.errFlip ? 'a-tick-a' : 'a-tick-b',
      busy, saveLabel: busy ? 'Saving…' : 'Save rubric',
      edit: () => openEditor(i), cancel: () => closeEditor(i), save: () => saveRubric(i),
      onMax: (e) => setState((p) => ({ maxes: { ...p.maxes, [q.id]: e.target.value }, totalFlip: !p.totalFlip })),
      onGuide: (e) => setState((p) => ({ guides: { ...p.guides, [q.id]: e.target.value }, ...(p.err === i && e.target.value.trim() ? { err: null } : {}) })),
    }
  })

  const check = d.publishCheck
  const missingNums = qs.map((q, i) => (!q.rubric ? i + 1 : null)).filter(Boolean)
  const c1 = check.hasQuestion, c2 = check.hasQuestion && missingNums.length === 0, c3 = check.hasStudent
  const met = [c1, c2, c3].filter(Boolean).length
  const canPublish = met === 3 && winOk
  const nudgeParts = []
  if (!c1) nudgeParts.push('Import the question list.')
  if (c1 && !c2) nudgeParts.push(`Write the rubric for question${missingNums.length > 1 ? 's' : ''} ${missingNums.join(', ')}.`)
  if (!c3) nudgeParts.push('Add at least one student in step 2.')
  if (!winOk) nudgeParts.push('Set the time window in Session details.')
  const publish = async () => {
    if (!canPublish) { setState((p) => ({ nudge: p.nudge + 1 })); return }
    try {
      await examConfigApi.update(d.id, payload())
      await examConfigApi.publish(d.id)
      navigate(paths.sessionStudents(d.id))
    } catch (e) {
      setState({ error: e.message })
    }
  }
  const on = (k, flip) => (e) => setState((p) => ({ form: { ...p.form, [k]: e.target.value }, ...(flip ? { winFlip: !p.winFlip } : {}) }))
  const nudgeCls = s.nudge === 0 ? '' : s.nudge % 2 ? 'ss-nudge-a' : 'ss-nudge-b'
  const v = {
    title: f.name.trim() || 'Untitled session',
    courseLine: course ? `${course.code} · ${course.name}` : '',
    f,
    on: { name: on('name'), course: on('course'), od: on('od', true), ot: on('ot', true), cd: on('cd', true), ct: on('ct', true), limit: on('limit'), follow: on('follow') },
    winOk, winBad, winText, winDur: winOk ? durText(Math.round(mins)) : '', winCls: tick(s.winFlip),
    followText: followN === 0 ? 'AIVES asks none' : 'then AIVES moves on',
    draftBusy: s.draft === 'saving', draftLabel: s.draft === 'saving' ? 'Saving…' : 'Save draft', draftLabelCls: s.draft === 'saving' ? 'a-rise' : '', draftSaved: s.draft === 'saved',
    saveDraft,
    total: fmtPts(total), totalCls: tick(s.totalFlip),
    importOpen: s.importOpen, importReading: s.importState === 'reading', importDone: s.importState === 'done' && !s.importOpen,
    fileName: s.fileName, imported: s.imported,
    toggleImport: () => setState((p) => ({ importOpen: !p.importOpen, importState: p.importOpen ? p.importState : 'idle' })),
    pickFile,
    questions, qCount: qs.length,
    t: { date: 'date', num: 'number' },
    met, metCls: tick(s.metFlip), allMet: met === 3, notAllMet: met !== 3,
    c1, c2, c3, c2Moon: s.c2Just ? 'a-moon-fill' : '', c2TextCls: s.c2Just ? 'a-rise' : '', c2Just: s.c2Just,
    c2Cls: c2 ? '' : nudgeCls, c3Cls: c3 ? '' : nudgeCls,
    missingText: missingNums.length ? `${listNums(missingNums)} no rubric.` : '',
    writeFirst: () => openEditor(missingNums[0] - 1), editorOpen: s.open !== null,
    students: d.participants.length,
    nudged: s.nudge > 0, nudgeTextCls: s.nudge % 2 ? 'a-tick-a' : 'a-tick-b', nudgeText: nudgeParts.join(' '),
    canPublish, publish,
    studentsPath: paths.sessionStudents(d.id),
  }
  return (
    <div className="pg-sessionsetup" style={{ minHeight: "100vh", display: "flex", flexDirection: "column" }}>
      <StaffTopBar current="sessions" />
      <main className="a-gutter" style={{ flex: "1", width: "100%", maxWidth: "1280px", margin: "0 auto", padding: "48px 40px 80px", display: "flex", flexDirection: "column", gap: "40px" }}>
        <div className="a-rise" style={{ animationDelay: "0ms", display: "flex", flexDirection: "column", gap: "28px" }}>
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
              <p style={{ display: "flex", flexWrap: "wrap", alignItems: "center", columnGap: "16px", rowGap: "6px", fontSize: "14.5px", color: "var(--ink-2)" }}>
                <span style={{ display: "inline-flex", alignItems: "center", gap: "9px", color: "var(--ink-3)" }}>
                  <svg width="14" height="14" viewBox="0 0 16 16" aria-hidden="true" style={{ flex: "none" }}>
                    <circle cx="8" cy="8" r="6.25" style={{ fill: "none", stroke: "var(--ink-3)", strokeWidth: "1.5", strokeDasharray: "2.45 2.45" }} />
                  </svg>
                  Draft
                </span>
                <span style={{ color: "var(--jade-ink)", fontWeight: "500" }}>
                  {v.courseLine}
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
            <button type="button" className="a-btn a-btn-secondary" onClick={v.saveDraft} aria-disabled={v.draftBusy} style={{ flex: "none", height: "44px", padding: "0 18px", borderRadius: "12px", border: "1px solid var(--edge)", background: "rgba(255,255,255,0.6)", fontSize: "15px", fontWeight: "500", color: "var(--night-indigo)", display: "inline-flex", alignItems: "center", gap: "10px" }}>
              <svg width="18" height="18" viewBox="0 0 24 24" aria-hidden="true" style={{ fill: "none", stroke: "currentColor", strokeWidth: "1.75", strokeLinecap: "round", strokeLinejoin: "round" }}>
                <path d="M5 4.5h11l3.5 3.5v11.5H5z" />
                <path d="M8.5 4.5v4.5h6.5V4.5" />
                <path d="M8.5 19.5v-5h7v5" />
              </svg>
              <span className={v.draftLabelCls}>
                {v.draftLabel}
              </span>
            </button>
          </div>
          <ol aria-label="Setup steps" style={{ display: "flex", flexWrap: "wrap", alignItems: "center", columnGap: "20px", rowGap: "8px" }}>
            <li>
              <Link to={paths.sessionSetup} aria-current="step" style={{ display: "inline-flex", alignItems: "center", gap: "12px", height: "44px", textDecoration: "none", color: "var(--night-indigo)" }}>
                <span aria-hidden="true" style={{ width: "28px", height: "28px", borderRadius: "50%", background: "var(--night-indigo)", color: "var(--ivory)", display: "grid", placeItems: "center", fontSize: "13.5px", fontWeight: "500" }}>
                  1
                </span>
                <span style={{ fontSize: "15px", fontWeight: "500" }}>
                  Details and questions
                </span>
              </Link>
            </li>
            <li style={{ display: "flex", alignItems: "center" }}>
              <span className="a-hide-sm" aria-hidden="true" style={{ display: "block", width: "48px", height: "1px", margin: "0 16px 0 -4px", background: "var(--line-strong)" }} />
              <Link className="ss-step" to={v.studentsPath} style={{ display: "inline-flex", alignItems: "center", gap: "12px", height: "44px", textDecoration: "none" }}>
                <span className="ss-node" aria-hidden="true" style={{ width: "28px", height: "28px", borderRadius: "50%", border: "1px solid var(--edge)", color: "var(--ink-2)", display: "grid", placeItems: "center", fontSize: "13.5px", fontWeight: "500", transition: "border-color .18s ease-out, color .18s ease-out" }}>
                  2
                </span>
                <span className="ss-step-label" style={{ fontSize: "15px", fontWeight: "400", color: "var(--ink-2)", transition: "color .18s ease-out" }}>
                  Students
                </span>
              </Link>
            </li>
          </ol>
          <a className="a-show-sm a-link" href="#publish" style={{ alignItems: "center", gap: "10px", alignSelf: "flex-start", minHeight: "44px", fontFamily: "Lexend, sans-serif", fontSize: "15px", fontWeight: "500", color: "var(--night-indigo)", textDecoration: "none" }}>
            {v.allMet && (
              <>
                <svg width="14" height="14" viewBox="0 0 16 16" aria-hidden="true" style={{ flex: "none" }}>
                  <circle cx="8" cy="8" r="6.25" style={{ fill: "var(--night-indigo)", stroke: "var(--night-indigo)", strokeWidth: "1.5" }} />
                </svg>
              </>
            )}
            {v.notAllMet && (
              <>
                <svg width="14" height="14" viewBox="0 0 16 16" aria-hidden="true" style={{ flex: "none" }}>
                  <circle cx="8" cy="8" r="6.25" style={{ fill: "none", stroke: "var(--night-indigo)", strokeWidth: "1.5" }} />
                </svg>
              </>
            )}
            <span>
              <span className={`a-num ${v.metCls}`} style={{ display: "inline-block" }}>
                {v.met}
              </span>
              {' '}of 3 checks met
            </span>
            <svg width="16" height="16" viewBox="0 0 24 24" aria-hidden="true" style={{ flex: "none", fill: "none", stroke: "currentColor", strokeWidth: "1.75", strokeLinecap: "round", strokeLinejoin: "round" }}>
              <path d="M12 5v14" />
              <path d="m6 13 6 6 6-6" />
            </svg>
          </a>
        </div>
        <div className="a-grid-1-sm ss-grid" style={{ display: "grid", gridTemplateColumns: "minmax(0, 1fr) 372px", columnGap: "72px", rowGap: "48px", alignItems: "start" }}>
          <div className="a-rise" style={{ animationDelay: "60ms", gridColumn: "1", gridRow: "1", display: "flex", flexDirection: "column", gap: "72px", minWidth: "0" }}>
            <section aria-labelledby="details-h" style={{ display: "flex", flexDirection: "column", gap: "28px", paddingTop: "28px", borderTop: "1px solid var(--line)" }}>
              <h2 id="details-h" style={{ fontSize: "24px", lineHeight: "1.3", fontWeight: "500", letterSpacing: "-0.005em", color: "var(--night-indigo)" }}>
                Session details
              </h2>
              <div className="a-grid-1-sm" style={{ display: "grid", gridTemplateColumns: "minmax(0, 1.25fr) minmax(0, 1fr)", gap: "20px 24px" }}>
                <div style={{ display: "flex", flexDirection: "column", gap: "8px", minWidth: "0" }}>
                  <label htmlFor="f-name" style={{ fontSize: "14px", fontWeight: "500", color: "var(--night-indigo)" }}>
                    Session name
                  </label>
                  <input id="f-name" type="text" className="a-field" value={v.f.name} onChange={v.on.name} placeholder="Viva 3: Design patterns (SE1834)" style={{ width: "100%", height: "44px", padding: "0 14px", borderRadius: "10px", border: "1px solid var(--edge)", background: "var(--field-white)", fontSize: "15px", color: "var(--night-indigo)" }} />
                </div>
                <div style={{ display: "flex", flexDirection: "column", gap: "8px", minWidth: "0" }}>
                  <label htmlFor="f-course" style={{ fontSize: "14px", fontWeight: "500", color: "var(--night-indigo)" }}>
                    Course
                  </label>
                  <div style={{ position: "relative" }}>
                    <select id="f-course" className="a-field" value={v.f.course} onChange={v.on.course} style={{ width: "100%", height: "44px", padding: "0 40px 0 14px", borderRadius: "10px", border: "1px solid var(--edge)", background: "var(--field-white)", fontSize: "15px", color: "var(--night-indigo)", textOverflow: "ellipsis" }}>
                      {(courses ?? []).map((c) => <option key={c.id} value={c.id}>{c.code} · {c.name}</option>)}
                    </select>
                    <svg width="16" height="16" viewBox="0 0 24 24" aria-hidden="true" style={{ position: "absolute", right: "14px", top: "14px", pointerEvents: "none", fill: "none", stroke: "var(--ink-2)", strokeWidth: "2", strokeLinecap: "round", strokeLinejoin: "round" }}>
                      <path d="m6 9 6 6 6-6" />
                    </svg>
                  </div>
                </div>
              </div>
              <fieldset style={{ margin: "0", padding: "0", border: "0", minWidth: "0", display: "flex", flexDirection: "column", gap: "16px" }}>
                <legend style={{ padding: "0", marginBottom: "14px", fontSize: "14px", fontWeight: "500", color: "var(--night-indigo)" }}>
                  Time window
                </legend>
                <div className="a-grid-1-sm" style={{ display: "grid", gridTemplateColumns: "minmax(0, 1fr) minmax(0, 1fr)", gap: "16px 24px" }}>
                  <div style={{ display: "flex", flexDirection: "column", gap: "8px", minWidth: "0" }}>
                    <label htmlFor="f-od" style={{ fontSize: "13.5px", color: "var(--ink-2)" }}>
                      Opens
                    </label>
                    <div style={{ display: "flex", gap: "8px" }}>
                      <input id="f-od" type={v.t.date} className="a-field" value={v.f.od} onChange={v.on.od} style={{ flex: "1", minWidth: "0", height: "44px", padding: "0 12px", borderRadius: "10px", border: "1px solid var(--edge)", background: "var(--field-white)", fontSize: "15px", color: "var(--night-indigo)" }} />
                      <div style={{ position: "relative", flex: "none", width: "112px" }}>
                        <select id="f-ot" className="a-field a-num" aria-label="Opening time" value={v.f.ot} onChange={v.on.ot} style={{ width: "100%", height: "44px", padding: "0 34px 0 14px", borderRadius: "10px", border: "1px solid var(--edge)", background: "var(--field-white)", fontSize: "15px", color: "var(--night-indigo)" }}>
                          <option value="00:00">
                            00:00
                          </option>
                          <option value="00:30">
                            00:30
                          </option>
                          <option value="01:00">
                            01:00
                          </option>
                          <option value="01:30">
                            01:30
                          </option>
                          <option value="02:00">
                            02:00
                          </option>
                          <option value="02:30">
                            02:30
                          </option>
                          <option value="03:00">
                            03:00
                          </option>
                          <option value="03:30">
                            03:30
                          </option>
                          <option value="04:00">
                            04:00
                          </option>
                          <option value="04:30">
                            04:30
                          </option>
                          <option value="05:00">
                            05:00
                          </option>
                          <option value="05:30">
                            05:30
                          </option>
                          <option value="06:00">
                            06:00
                          </option>
                          <option value="06:30">
                            06:30
                          </option>
                          <option value="07:00">
                            07:00
                          </option>
                          <option value="07:30">
                            07:30
                          </option>
                          <option value="08:00">
                            08:00
                          </option>
                          <option value="08:30">
                            08:30
                          </option>
                          <option value="09:00">
                            09:00
                          </option>
                          <option value="09:30">
                            09:30
                          </option>
                          <option value="10:00">
                            10:00
                          </option>
                          <option value="10:30">
                            10:30
                          </option>
                          <option value="11:00">
                            11:00
                          </option>
                          <option value="11:30">
                            11:30
                          </option>
                          <option value="12:00">
                            12:00
                          </option>
                          <option value="12:30">
                            12:30
                          </option>
                          <option value="13:00">
                            13:00
                          </option>
                          <option value="13:30">
                            13:30
                          </option>
                          <option value="14:00">
                            14:00
                          </option>
                          <option value="14:30">
                            14:30
                          </option>
                          <option value="15:00">
                            15:00
                          </option>
                          <option value="15:30">
                            15:30
                          </option>
                          <option value="16:00">
                            16:00
                          </option>
                          <option value="16:30">
                            16:30
                          </option>
                          <option value="17:00">
                            17:00
                          </option>
                          <option value="17:30">
                            17:30
                          </option>
                          <option value="18:00">
                            18:00
                          </option>
                          <option value="18:30">
                            18:30
                          </option>
                          <option value="19:00">
                            19:00
                          </option>
                          <option value="19:30">
                            19:30
                          </option>
                          <option value="20:00">
                            20:00
                          </option>
                          <option value="20:30">
                            20:30
                          </option>
                          <option value="21:00">
                            21:00
                          </option>
                          <option value="21:30">
                            21:30
                          </option>
                          <option value="22:00">
                            22:00
                          </option>
                          <option value="22:30">
                            22:30
                          </option>
                          <option value="23:00">
                            23:00
                          </option>
                          <option value="23:30">
                            23:30
                          </option>
                        </select>
                        <svg width="16" height="16" viewBox="0 0 24 24" aria-hidden="true" style={{ position: "absolute", right: "12px", top: "14px", pointerEvents: "none", fill: "none", stroke: "var(--ink-2)", strokeWidth: "2", strokeLinecap: "round", strokeLinejoin: "round" }}>
                          <path d="m6 9 6 6 6-6" />
                        </svg>
                      </div>
                    </div>
                  </div>
                  <div style={{ display: "flex", flexDirection: "column", gap: "8px", minWidth: "0" }}>
                    <label htmlFor="f-cd" style={{ fontSize: "13.5px", color: "var(--ink-2)" }}>
                      Closes
                    </label>
                    <div style={{ display: "flex", gap: "8px" }}>
                      <input id="f-cd" type={v.t.date} className="a-field" value={v.f.cd} onChange={v.on.cd} aria-invalid={v.winBad} aria-describedby="win-err" style={{ flex: "1", minWidth: "0", height: "44px", padding: "0 12px", borderRadius: "10px", border: "1px solid var(--edge)", background: "var(--field-white)", fontSize: "15px", color: "var(--night-indigo)" }} />
                      <div style={{ position: "relative", flex: "none", width: "112px" }}>
                        <select id="f-ct" className="a-field a-num" aria-label="Closing time" value={v.f.ct} onChange={v.on.ct} aria-invalid={v.winBad} aria-describedby="win-err" style={{ width: "100%", height: "44px", padding: "0 34px 0 14px", borderRadius: "10px", border: "1px solid var(--edge)", background: "var(--field-white)", fontSize: "15px", color: "var(--night-indigo)" }}>
                          <option value="00:00">
                            00:00
                          </option>
                          <option value="00:30">
                            00:30
                          </option>
                          <option value="01:00">
                            01:00
                          </option>
                          <option value="01:30">
                            01:30
                          </option>
                          <option value="02:00">
                            02:00
                          </option>
                          <option value="02:30">
                            02:30
                          </option>
                          <option value="03:00">
                            03:00
                          </option>
                          <option value="03:30">
                            03:30
                          </option>
                          <option value="04:00">
                            04:00
                          </option>
                          <option value="04:30">
                            04:30
                          </option>
                          <option value="05:00">
                            05:00
                          </option>
                          <option value="05:30">
                            05:30
                          </option>
                          <option value="06:00">
                            06:00
                          </option>
                          <option value="06:30">
                            06:30
                          </option>
                          <option value="07:00">
                            07:00
                          </option>
                          <option value="07:30">
                            07:30
                          </option>
                          <option value="08:00">
                            08:00
                          </option>
                          <option value="08:30">
                            08:30
                          </option>
                          <option value="09:00">
                            09:00
                          </option>
                          <option value="09:30">
                            09:30
                          </option>
                          <option value="10:00">
                            10:00
                          </option>
                          <option value="10:30">
                            10:30
                          </option>
                          <option value="11:00">
                            11:00
                          </option>
                          <option value="11:30">
                            11:30
                          </option>
                          <option value="12:00">
                            12:00
                          </option>
                          <option value="12:30">
                            12:30
                          </option>
                          <option value="13:00">
                            13:00
                          </option>
                          <option value="13:30">
                            13:30
                          </option>
                          <option value="14:00">
                            14:00
                          </option>
                          <option value="14:30">
                            14:30
                          </option>
                          <option value="15:00">
                            15:00
                          </option>
                          <option value="15:30">
                            15:30
                          </option>
                          <option value="16:00">
                            16:00
                          </option>
                          <option value="16:30">
                            16:30
                          </option>
                          <option value="17:00">
                            17:00
                          </option>
                          <option value="17:30">
                            17:30
                          </option>
                          <option value="18:00">
                            18:00
                          </option>
                          <option value="18:30">
                            18:30
                          </option>
                          <option value="19:00">
                            19:00
                          </option>
                          <option value="19:30">
                            19:30
                          </option>
                          <option value="20:00">
                            20:00
                          </option>
                          <option value="20:30">
                            20:30
                          </option>
                          <option value="21:00">
                            21:00
                          </option>
                          <option value="21:30">
                            21:30
                          </option>
                          <option value="22:00">
                            22:00
                          </option>
                          <option value="22:30">
                            22:30
                          </option>
                          <option value="23:00">
                            23:00
                          </option>
                          <option value="23:30">
                            23:30
                          </option>
                        </select>
                        <svg width="16" height="16" viewBox="0 0 24 24" aria-hidden="true" style={{ position: "absolute", right: "12px", top: "14px", pointerEvents: "none", fill: "none", stroke: "var(--ink-2)", strokeWidth: "2", strokeLinecap: "round", strokeLinejoin: "round" }}>
                          <path d="m6 9 6 6 6-6" />
                        </svg>
                      </div>
                    </div>
                  </div>
                </div>
                {v.winOk && (
                  <>
                    <p style={{ display: "flex", flexWrap: "wrap", alignItems: "baseline", columnGap: "14px", rowGap: "2px" }} aria-live="polite">
                      <span className={v.winCls} style={{ fontSize: "20px", fontWeight: "300", lineHeight: "1.2", color: "var(--night-indigo)" }}>
                        {v.winText}
                      </span>
                      <span style={{ fontSize: "14.5px", color: "var(--ink-2)" }}>
                        {v.winDur}
                      </span>
                    </p>
                  </>
                )}
                {v.winBad && (
                  <>
                    <p id="win-err" className="a-rise" role="alert" style={{ display: "flex", alignItems: "center", gap: "8px", fontSize: "13.5px", color: "var(--red-ink)" }}>
                      <svg width="18" height="18" viewBox="0 0 24 24" aria-hidden="true" style={{ flex: "none", fill: "none", stroke: "currentColor", strokeWidth: "1.75", strokeLinecap: "round", strokeLinejoin: "round" }}>
                        <path d="M12 4 21 19.5H3z" />
                        <path d="M12 10v4.5" />
                        <path d="M12 17.2v.01" />
                      </svg>
                      The session closes before it opens. Move the closing time later.
                    </p>
                  </>
                )}
                <p style={{ display: "flex", alignItems: "flex-start", gap: "8px", fontSize: "14px", lineHeight: "1.5", color: "var(--ink-3)" }}>
                  <svg width="16" height="16" viewBox="0 0 24 24" aria-hidden="true" style={{ flex: "none", marginTop: "3px", fill: "none", stroke: "var(--jade-ink)", strokeWidth: "1.75", strokeLinecap: "round", strokeLinejoin: "round" }}>
                    <circle cx="12" cy="12" r="8.5" />
                    <path d="M12 7.5V12l3 2" />
                  </svg>
                  Each listed student starts once, inside the window. At closing time, attempts still running stop.
                </p>
              </fieldset>
              <div className="a-grid-1-sm" style={{ display: "grid", gridTemplateColumns: "minmax(0, 1fr) minmax(0, 1fr)", gap: "20px 24px" }}>
                <div style={{ display: "flex", flexDirection: "column", gap: "8px", minWidth: "0" }}>
                  <label htmlFor="f-limit" style={{ fontSize: "14px", fontWeight: "500", color: "var(--night-indigo)" }}>
                    Time limit per answer
                  </label>
                  <div style={{ display: "flex", alignItems: "center", gap: "12px" }}>
                    <input id="f-limit" type={v.t.num} inputMode="numeric" min="10" step="5" className="a-field a-num" value={v.f.limit} onChange={v.on.limit} style={{ flex: "none", width: "104px", height: "44px", padding: "0 12px", borderRadius: "10px", border: "1px solid var(--edge)", background: "var(--field-white)", fontSize: "20px", fontWeight: "300", color: "var(--night-indigo)" }} />
                    <span style={{ fontSize: "14.5px", lineHeight: "1.35", color: "var(--ink-2)" }}>
                      seconds, follow-ups included
                    </span>
                  </div>
                </div>
                <div style={{ display: "flex", flexDirection: "column", gap: "8px", minWidth: "0" }}>
                  <label htmlFor="f-follow" style={{ fontSize: "14px", fontWeight: "500", color: "var(--night-indigo)" }}>
                    Maximum follow-ups per question
                  </label>
                  <div style={{ display: "flex", alignItems: "center", gap: "12px" }}>
                    <input id="f-follow" type={v.t.num} inputMode="numeric" min="0" step="1" className="a-field a-num" value={v.f.follow} onChange={v.on.follow} style={{ flex: "none", width: "104px", height: "44px", padding: "0 12px", borderRadius: "10px", border: "1px solid var(--edge)", background: "var(--field-white)", fontSize: "20px", fontWeight: "300", color: "var(--night-indigo)" }} />
                    <span style={{ fontSize: "14.5px", lineHeight: "1.35", color: "var(--ink-2)" }}>
                      {v.followText}
                    </span>
                  </div>
                </div>
              </div>
            </section>
            <section aria-labelledby="questions-h" style={{ display: "flex", flexDirection: "column", gap: "4px", paddingTop: "28px", borderTop: "1px solid var(--line)" }}>
              <div className="a-stack-sm" style={{ display: "flex", alignItems: "flex-end", justifyContent: "space-between", gap: "16px 24px", paddingBottom: "20px" }}>
                <div style={{ display: "flex", flexDirection: "column", gap: "6px" }}>
                  <h2 id="questions-h" style={{ fontSize: "24px", lineHeight: "1.3", fontWeight: "500", letterSpacing: "-0.005em", color: "var(--night-indigo)" }}>
                    Questions and rubrics
                  </h2>
                  <p style={{ fontSize: "14.5px", color: "var(--ink-2)" }}>
                    {v.qCount} questions, asked in this order ·{' '}
                    <span className={`a-num ${v.totalCls}`} style={{ color: "var(--night-indigo)", fontWeight: "500" }}>
                      {v.total}
                    </span>
                    {' '}points in all
                  </p>
                </div>
                <button type="button" className="a-btn a-btn-secondary" onClick={v.toggleImport} aria-expanded={v.importOpen} style={{ flex: "none", height: "44px", padding: "0 18px", borderRadius: "12px", border: "1px solid var(--edge)", background: "rgba(255,255,255,0.6)", fontSize: "15px", fontWeight: "500", color: "var(--night-indigo)", display: "inline-flex", alignItems: "center", justifyContent: "center", gap: "10px" }}>
                  <svg width="18" height="18" viewBox="0 0 24 24" aria-hidden="true" style={{ fill: "none", stroke: "currentColor", strokeWidth: "1.75", strokeLinecap: "round", strokeLinejoin: "round" }}>
                    <path d="M12 15V4" />
                    <path d="M7.5 8.5 12 4l4.5 4.5" />
                    <path d="M5 19.5h14" />
                  </svg>
                  Import question list
                </button>
              </div>
              {v.importOpen && (
                <>
                  <div className="ss-open" style={{ display: "flex", flexDirection: "column", gap: "14px", marginBottom: "24px", padding: "4px 0 4px 20px", boxShadow: "inset 1px 0 0 var(--line-strong)" }}>
                    <div className="a-wrap-sm" style={{ display: "flex", alignItems: "center", gap: "12px 16px" }}>
                      <label className="ss-file a-btn" style={{ position: "relative", height: "44px", padding: "0 18px", borderRadius: "12px", border: "1px solid var(--edge)", background: "rgba(255,255,255,0.6)", fontSize: "15px", fontWeight: "500", color: "var(--night-indigo)", display: "inline-flex", alignItems: "center", gap: "10px" }}>
                        <svg width="18" height="18" viewBox="0 0 24 24" aria-hidden="true" style={{ fill: "none", stroke: "currentColor", strokeWidth: "1.75", strokeLinecap: "round", strokeLinejoin: "round" }}>
                          <path d="M14 3.5H6.5v17h11V7z" />
                          <path d="M14 3.5V7h3.5" />
                        </svg>
                        Choose a file
                        <input type="file" accept=".txt,.csv" onChange={v.pickFile} style={{ position: "absolute", inset: "0", width: "100%", height: "100%", opacity: "0", cursor: "pointer" }} />
                      </label>
                      <span style={{ fontSize: "14.5px", color: "var(--ink-2)" }}>
                        One question per row · {PENDING.questionFileFormat}
                      </span>
                      <button type="button" className="a-btn a-btn-quiet" onClick={v.toggleImport} style={{ marginLeft: "auto", height: "44px", padding: "0 14px", border: "0", borderRadius: "10px", background: "transparent", fontSize: "15px", fontWeight: "500", color: "var(--ink-2)" }}>
                        Cancel
                      </button>
                    </div>
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
              {v.importDone && (
                <>
                  <div className="a-just" style={{ display: "flex", alignItems: "center", gap: "6px", marginBottom: "16px", fontSize: "13.5px", color: "var(--jade-ink)" }}>
                    <span aria-hidden="true" style={{ width: "6px", height: "6px", borderRadius: "50%", background: "var(--jade-ink)" }} />
                    {v.imported} questions read from{' '}{v.fileName}{' '}just now
                  </div>
                </>
              )}
              <ol aria-label="Questions" style={{ display: "flex", flexDirection: "column" }}>
                {v.questions.map((q, q_i) => (
                  <Fragment key={q.key ?? q_i}>
                    <li style={{ display: "flex", flexDirection: "column", gap: "14px", padding: "26px 0 28px", borderTop: "1px solid var(--line)" }}>
                      <div style={{ display: "flex", flexWrap: "wrap", alignItems: "center", justifyContent: "space-between", gap: "8px 16px" }}>
                        <span style={{ fontSize: "14px", fontWeight: "500", color: "var(--ink-2)" }}>
                          Question{' '}{q.n}
                        </span>
                        {q.set && (
                          <>
                            <span className={q.statusCls} style={{ display: "inline-flex", alignItems: "center", gap: "9px", fontSize: "14.5px", color: "var(--night-indigo)" }}>
                              <svg width="14" height="14" viewBox="0 0 16 16" aria-hidden="true" style={{ flex: "none" }}>
                                <circle cx="8" cy="8" r="6.25" style={{ fill: "none", stroke: "var(--night-indigo)", strokeWidth: "1.5" }} />
                                <circle className={q.moonCls} cx="8" cy="8" r="6.25" style={{ fill: "var(--night-indigo)" }} />
                              </svg>
                              <span>
                                Rubric set · max{' '}{q.max}{' '}points
                              </span>
                            </span>
                          </>
                        )}
                        {q.missing && (
                          <>
                            <span style={{ display: "inline-flex", alignItems: "center", gap: "8px", fontSize: "14.5px", fontWeight: "500", color: "var(--red-ink)" }}>
                              <svg width="16" height="16" viewBox="0 0 24 24" aria-hidden="true" style={{ flex: "none", fill: "none", stroke: "currentColor", strokeWidth: "1.75", strokeLinecap: "round", strokeLinejoin: "round" }}>
                                <path d="M12 4 21 19.5H3z" />
                                <path d="M12 10v4.5" />
                                <path d="M12 17.2v.01" />
                              </svg>
                              No rubric yet
                            </span>
                          </>
                        )}
                      </div>
                      <p className="ss-quote" style={{ fontFamily: "Alegreya, Georgia, serif", fontWeight: "500", fontSize: "26px", lineHeight: "1.28", color: "var(--night-indigo)", maxWidth: "30em", textWrap: "pretty" }}>
                        {q.text}
                      </p>
                      {q.showEdit && (
                        <>
                          <div style={{ display: "flex", alignItems: "center", gap: "16px", flexWrap: "wrap" }}>
                            <button type="button" className="a-btn a-btn-secondary" onClick={q.edit} style={{ height: "36px", padding: "0 14px", borderRadius: "10px", border: "1px solid var(--edge)", background: "rgba(255,255,255,0.6)", fontSize: "14px", fontWeight: "500", color: "var(--night-indigo)", display: "inline-flex", alignItems: "center", gap: "8px" }}>
                              <svg width="16" height="16" viewBox="0 0 24 24" aria-hidden="true" style={{ fill: "none", stroke: "currentColor", strokeWidth: "1.75", strokeLinecap: "round", strokeLinejoin: "round" }}>
                                <path d="M4.5 19.5h4l10-10a2.1 2.1 0 0 0-4-4l-10 10z" />
                                <path d="m13 7 4 4" />
                              </svg>
                              {q.editLabel}
                            </button>
                            {q.just && (
                              <>
                                <span className="a-just" style={{ display: "inline-flex", alignItems: "center", gap: "6px", fontSize: "12.5px", color: "var(--jade-ink)" }}>
                                  <span aria-hidden="true" style={{ width: "6px", height: "6px", borderRadius: "50%", background: "var(--jade-ink)" }} />
                                  rubric saved just now
                                </span>
                              </>
                            )}
                          </div>
                        </>
                      )}
                      {q.panel && (
                        <>
                          <div className={q.panelCls} style={{ display: "flex", flexDirection: "column", gap: "20px", marginTop: "6px", padding: "4px 0 4px 20px", boxShadow: "inset 1px 0 0 var(--line-strong)" }}>
                            <h3 style={{ fontSize: "15px", fontWeight: "500", color: "var(--night-indigo)" }}>
                              Rubric for question{' '}{q.n}
                            </h3>
                            <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
                              <label htmlFor={`max-${q.n}`} style={{ fontSize: "14px", fontWeight: "500", color: "var(--night-indigo)" }}>
                                Maximum score
                              </label>
                              <div style={{ display: "flex", alignItems: "center", gap: "12px" }}>
                                <input id={`max-${q.n}`} type={v.t.num} inputMode="decimal" min="0" step="0.25" className="a-field a-num" value={q.max} onChange={q.onMax} style={{ flex: "none", width: "104px", height: "44px", padding: "0 12px", borderRadius: "10px", border: "1px solid var(--edge)", background: "var(--field-white)", fontSize: "20px", fontWeight: "300", color: "var(--night-indigo)" }} />
                                <span style={{ fontSize: "14.5px", color: "var(--ink-2)" }}>
                                  points
                                </span>
                              </div>
                            </div>
                            <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
                              <label htmlFor={`guide-${q.n}`} style={{ fontSize: "14px", fontWeight: "500", color: "var(--night-indigo)" }}>
                                Scoring guide
                              </label>
                              <textarea id={`guide-${q.n}`} rows="4" className="a-field" value={q.guide} onChange={q.onGuide} aria-invalid={q.err} aria-describedby={`guide-err-${q.n}`} placeholder={q.placeholder} style={{ width: "100%", minHeight: "120px", padding: "12px 14px", borderRadius: "10px", border: "1px solid var(--edge)", background: "var(--field-white)", fontSize: "15px", lineHeight: "1.55", color: "var(--night-indigo)", resize: "vertical" }} />
                              {q.err && (
                                <>
                                  <p id={`guide-err-${q.n}`} className={q.errCls} role="alert" style={{ display: "flex", alignItems: "center", gap: "8px", fontSize: "13.5px", color: "var(--red-ink)" }}>
                                    <svg width="18" height="18" viewBox="0 0 24 24" aria-hidden="true" style={{ flex: "none", fill: "none", stroke: "currentColor", strokeWidth: "1.75", strokeLinecap: "round", strokeLinejoin: "round" }}>
                                      <path d="M12 4 21 19.5H3z" />
                                      <path d="M12 10v4.5" />
                                      <path d="M12 17.2v.01" />
                                    </svg>
                                    Write the scoring guide first. AIVES scores against it.
                                  </p>
                                </>
                              )}
                            </div>
                            <p style={{ display: "flex", alignItems: "flex-start", gap: "8px", fontSize: "14px", lineHeight: "1.5", color: "var(--gold-ink)" }}>
                              <svg width="14" height="14" viewBox="0 0 16 16" aria-hidden="true" style={{ flex: "none", marginTop: "3px" }}>
                                <circle cx="8" cy="8" r="6.25" style={{ fill: "none", stroke: "var(--gold-edge)", strokeWidth: "1.5" }} />
                                <path d="M8 1.75a6.25 6.25 0 0 1 0 12.5a2.6 6.25 0 0 0 0-12.5z" style={{ fill: "var(--lantern-gold)" }} />
                              </svg>
                              AIVES suggests a score and a comment from this guide. You confirm the final score.
                            </p>
                            <div style={{ display: "flex", flexWrap: "wrap", gap: "10px" }}>
                              <button type="button" className="a-btn a-btn-primary" onClick={q.save} aria-disabled={q.busy} style={{ height: "44px", padding: "0 20px", border: "0", borderRadius: "12px", background: "var(--night-indigo)", color: "var(--ivory)", fontSize: "15px", fontWeight: "500", boxShadow: "0 8px 18px -10px rgba(15,22,48,0.55)", display: "inline-flex", alignItems: "center", gap: "10px" }}>
                                {q.busy && (
                                  <>
                                    <svg className="a-rec" width="14" height="14" viewBox="0 0 16 16" aria-hidden="true">
                                      <circle cx="8" cy="8" r="6.25" style={{ fill: "none", stroke: "var(--ivory)", strokeWidth: "1.5" }} />
                                      <path d="M8 1.75a6.25 6.25 0 0 1 0 12.5a2.6 6.25 0 0 0 0-12.5z" style={{ fill: "var(--ivory)" }} />
                                    </svg>
                                  </>
                                )}
                                {q.saveLabel}
                              </button>
                              <button type="button" className="a-btn a-btn-quiet" onClick={q.cancel} style={{ height: "44px", padding: "0 14px", border: "0", borderRadius: "10px", background: "transparent", fontSize: "15px", fontWeight: "500", color: "var(--ink-2)" }}>
                                Cancel
                              </button>
                            </div>
                          </div>
                        </>
                      )}
                    </li>
                  </Fragment>
                ))}
              </ol>
            </section>
          </div>
          <div className="a-stack-sm a-rise ss-foot" style={{ animationDelay: "60ms", gridColumn: "1", gridRow: "2", display: "flex", alignItems: "center", justifyContent: "space-between", gap: "16px 24px", paddingTop: "24px", borderTop: "1px solid var(--line)" }}>
            {USE_MOCKS ? <p style={{ fontSize: "13px", color: "var(--ink-3)" }}>All names, dates and scores on this page are sample data.</p> : <span />}
            <Link to={v.studentsPath} className="a-btn a-btn-secondary" style={{ height: "44px", padding: "0 18px", borderRadius: "12px", border: "1px solid var(--edge)", background: "rgba(255,255,255,0.6)", fontSize: "15px", fontWeight: "500", color: "var(--night-indigo)", textDecoration: "none", display: "inline-flex", alignItems: "center", justifyContent: "center", gap: "10px" }}>
              Next: Students
              <svg width="18" height="18" viewBox="0 0 24 24" aria-hidden="true" style={{ fill: "none", stroke: "currentColor", strokeWidth: "1.75", strokeLinecap: "round", strokeLinejoin: "round" }}>
                <path d="M5 12h14" />
                <path d="m13 6 6 6-6 6" />
              </svg>
            </Link>
          </div>
          <aside id="publish" className="ss-aside" aria-labelledby="ready-h" style={{ gridColumn: "2", gridRow: "1 / span 2", position: "sticky", top: "24px", scrollMarginTop: "24px" }}>
            <div className="a-night a-rise" style={{ animationDelay: "120ms", display: "flex", flexDirection: "column", gap: "24px", padding: "26px 24px 24px", borderRadius: "20px", backgroundColor: "var(--night-indigo)", backgroundImage: "radial-gradient(420px 260px at 100% 0%, var(--jade-wash), rgba(15,22,48,0) 70%)", color: "var(--ivory)", boxShadow: "0 24px 48px -28px rgba(15,22,48,0.7)" }}>
              <div style={{ display: "flex", flexDirection: "column", gap: "10px" }}>
                <h2 id="ready-h" style={{ fontSize: "15px", fontWeight: "500", color: "var(--ivory)" }}>
                  Ready to publish?
                </h2>
                <p className="a-num" style={{ display: "flex", alignItems: "baseline", gap: "10px" }} aria-live="polite">
                  <span style={{ fontSize: "72px", fontWeight: "200", lineHeight: "0.95", letterSpacing: "-0.02em", display: "inline-block", minWidth: "0.6em" }}>
                    <span className={v.metCls}>
                      {v.met}
                    </span>
                  </span>
                  <span style={{ fontSize: "18px", fontWeight: "300", color: "var(--ivory-2)" }}>
                    of 3 checks met
                  </span>
                </p>
              </div>
              <ul style={{ display: "flex", flexDirection: "column", gap: "18px", paddingTop: "20px", borderTop: "1px solid var(--night-line)" }}>
                <li className="" style={{ display: "grid", gridTemplateColumns: "20px minmax(0, 1fr)", columnGap: "14px", rowGap: "2px" }}>
                  <span style={{ marginTop: "1px", display: "flex" }}>
                    {v.c1 ? (
                      <svg width="20" height="20" viewBox="0 0 16 16" aria-hidden="true">
                        <circle cx="8" cy="8" r="6.25" style={{ fill: "none", stroke: "var(--ivory)", strokeWidth: "1.5" }} />
                        <circle className={''} cx="8" cy="8" r="6.25" style={{ fill: "var(--ivory)" }} />
                      </svg>
                    ) : (
                      <svg width="20" height="20" viewBox="0 0 16 16" aria-hidden="true">
                        <circle cx="8" cy="8" r="6.25" style={{ fill: "none", stroke: "var(--ivory-2)", strokeWidth: "1.5" }} />
                      </svg>
                    )}
                  </span>
                  <span style={{ fontSize: "15px", fontWeight: "500" }}>At least one question</span>
                  <span style={{ gridColumn: "2", fontSize: "14px", color: "var(--ivory-2)" }}>{v.c1 ? `${v.qCount} questions` : 'No questions yet.'}</span>
                </li>
                <li className={v.c2Cls} style={{ display: "grid", gridTemplateColumns: "20px minmax(0, 1fr)", columnGap: "14px", rowGap: "2px" }}>
                  <span style={{ marginTop: "1px", display: "flex" }}>
                    {v.c2 ? (
                      <svg width="20" height="20" viewBox="0 0 16 16" aria-hidden="true">
                        <circle cx="8" cy="8" r="6.25" style={{ fill: "none", stroke: "var(--ivory)", strokeWidth: "1.5" }} />
                        <circle className={v.c2Moon} cx="8" cy="8" r="6.25" style={{ fill: "var(--ivory)" }} />
                      </svg>
                    ) : (
                      <svg width="20" height="20" viewBox="0 0 16 16" aria-hidden="true">
                        <circle cx="8" cy="8" r="6.25" style={{ fill: "none", stroke: "var(--ivory-2)", strokeWidth: "1.5" }} />
                      </svg>
                    )}
                  </span>
                  <span style={{ fontSize: "15px", fontWeight: "500" }}>A rubric for every question</span>
                  {v.c2 ? (
                    <span className={v.c2TextCls} style={{ gridColumn: "2", display: "flex", flexWrap: "wrap", alignItems: "center", gap: "4px 12px", fontSize: "14px", color: "var(--ivory-2)" }}>
                      {v.qCount} of {v.qCount} questions
                      {v.c2Just && (
                        <span className="a-just" style={{ display: "inline-flex", alignItems: "center", gap: "6px", fontSize: "12.5px", color: "var(--jade)" }}>
                          <span aria-hidden="true" style={{ width: "6px", height: "6px", borderRadius: "50%", background: "var(--jade)" }} />
                          just now
                        </span>
                      )}
                    </span>
                  ) : (
                    <span style={{ gridColumn: "2", display: "flex", flexWrap: "wrap", alignItems: "baseline", gap: "4px 10px", fontSize: "14px", color: "var(--ivory-2)" }}>
                      {v.c1 ? v.missingText : 'Questions come first.'}
                      {v.c1 && !v.editorOpen && (
                        <button type="button" className="a-link ss-linkbtn" onClick={v.writeFirst} style={{ padding: "0", border: "0", background: "none", fontSize: "14px", fontWeight: "500", color: "var(--ivory)" }}>
                          Write it
                        </button>
                      )}
                    </span>
                  )}
                </li>
                <li className={v.c3Cls} style={{ display: "grid", gridTemplateColumns: "20px minmax(0, 1fr)", columnGap: "14px", rowGap: "2px" }}>
                  <span style={{ marginTop: "1px", display: "flex" }}>
                    {v.c3 ? (
                      <svg width="20" height="20" viewBox="0 0 16 16" aria-hidden="true">
                        <circle cx="8" cy="8" r="6.25" style={{ fill: "none", stroke: "var(--ivory)", strokeWidth: "1.5" }} />
                        <circle className={''} cx="8" cy="8" r="6.25" style={{ fill: "var(--ivory)" }} />
                      </svg>
                    ) : (
                      <svg width="20" height="20" viewBox="0 0 16 16" aria-hidden="true">
                        <circle cx="8" cy="8" r="6.25" style={{ fill: "none", stroke: "var(--ivory-2)", strokeWidth: "1.5" }} />
                      </svg>
                    )}
                  </span>
                  <span style={{ fontSize: "15px", fontWeight: "500" }}>At least one student</span>
                  <span style={{ gridColumn: "2", display: "flex", flexWrap: "wrap", alignItems: "baseline", gap: "4px 10px", fontSize: "14px", color: "var(--ivory-2)" }}>
                    {v.c3 ? `${v.students} students` : 'No students yet.'}
                    <Link className="a-link" to={v.studentsPath} style={{ fontWeight: "500", color: "var(--ivory)" }}>
                      {v.c3 ? 'Change the list' : 'Import the list'}
                    </Link>
                  </span>
                </li>
              </ul>
              <div style={{ display: "flex", flexDirection: "column", gap: "14px" }}>
                <button type="button" className="a-btn a-btn-primary" aria-disabled={!v.canPublish} aria-describedby="publish-why" onClick={v.publish} style={{ height: "52px", border: "0", borderRadius: "14px", background: "var(--ivory)", color: "var(--night-indigo)", fontSize: "16px", fontWeight: "500", boxShadow: "0 10px 28px -12px rgba(0,0,0,0.55)" }}>
                  Publish session
                </button>
                {v.nudged && (
                  <>
                    <p id="publish-why" className={v.nudgeTextCls} role="alert" style={{ display: "grid", gridTemplateColumns: "18px minmax(0, 1fr)", columnGap: "10px", padding: "12px 14px", borderRadius: "12px", background: "var(--red-wash-night)", border: "1px solid rgba(255,106,79,0.4)", fontSize: "14px", lineHeight: "1.5", color: "var(--ivory)" }}>
                      <svg width="18" height="18" viewBox="0 0 24 24" aria-hidden="true" style={{ marginTop: "1px", fill: "none", stroke: "var(--ember-text)", strokeWidth: "1.75", strokeLinecap: "round", strokeLinejoin: "round" }}>
                        <path d="M12 4 21 19.5H3z" />
                        <path d="M12 10v4.5" />
                        <path d="M12 17.2v.01" />
                      </svg>
                      <span>
                        <span style={{ fontWeight: "500", color: "var(--ember-text)" }}>
                          Not yet.
                        </span>
                        {' '}{v.nudgeText}
                      </span>
                    </p>
                  </>
                )}
                <p style={{ display: "flex", alignItems: "flex-start", gap: "8px", fontSize: "13.5px", lineHeight: "1.45", color: "var(--ivory-2)" }}>
                  <svg width="16" height="16" viewBox="0 0 24 24" aria-hidden="true" style={{ flex: "none", marginTop: "1px", fill: "none", stroke: "currentColor", strokeWidth: "1.75", strokeLinecap: "round", strokeLinejoin: "round" }}>
                    <rect x="5" y="11" width="14" height="9" rx="2" />
                    <path d="M8 11V8a4 4 0 0 1 8 0v3" />
                  </svg>
                  Publishing locks the questions and rubrics.
                </p>
              </div>
            </div>
          </aside>
        </div>
      </main>
    </div>
  )
}
