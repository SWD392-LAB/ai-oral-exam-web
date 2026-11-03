import { useEffect, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { paths } from '../../app/routes/paths.js'
import { USE_MOCKS } from '../../api/client.js'
import { examConfigApi, rubricApi, questionBankApi } from '../../api/services.js'
import { StaffTopBar } from '../../components/TopBar.jsx'
import { useLoad } from '../../hooks/useLoad.js'
import { useMergeState } from '../../hooks/useMergeState.js'
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
const isoDate = (d) => `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`
const isoTime = (d) => `${pad2(d.getHours())}:${pad2(d.getMinutes())}`
const toIso = (date, time) => { const d = parseDate(date), t = parseTime(time); return d && t ? new Date(d[0], d[1] - 1, d[2], t[0], t[1]).toISOString() : null }
// "Viva 3: Design patterns (SE1834)" -> title + class code
const splitName = (name) => { const m = name.trim().match(/^(.*?)\s*\(([^()]+)\)$/); return m ? { title: m[1], classCode: m[2] } : { title: name.trim(), classCode: null } }

// Step 1 of the exam session setup: details, time window, limits, questions, and Platform Rubric (F7)
export default function SessionSetupPage() {
  const { sessionId } = useParams()
  const navigate = useNavigate()
  const { data: courses } = useLoad(() => examConfigApi.myCourses(), [])
  const { data: d, setData } = useLoad(() => examConfigApi.get(sessionId), [sessionId])
  const { data: platformRubric } = useLoad(() => rubricApi.getPlatformRubric(), [])
  const [rubricModalOpen, setRubricModalOpen] = useState(false)
  const [bankModalOpen, setBankModalOpen] = useState(false)
  const [bankQuestions, setBankQuestions] = useState([])
  const [bankLoading, setBankLoading] = useState(false)
  const [bankSelectedIds, setBankSelectedIds] = useState([])
  const [bankAttaching, setBankAttaching] = useState(false)
  const [bankError, setBankError] = useState(null)
  const [s, setState] = useMergeState({
    form: null,
    draft: 'idle',
    importOpen: false,
    importState: 'idle',
    fileName: '',
    imported: 0,
    nudge: 0,
    winFlip: null,
    metFlip: null,
    error: null,
  })

  // the form starts from the stored session
  useEffect(() => {
    if (!d || s.form) return
    const st = d.startAt ? new Date(d.startAt) : null, en = d.endAt ? new Date(d.endAt) : null
    setState({
      form: {
        name: d.title ? `${d.title}${d.classCode ? ` (${d.classCode})` : ''}` : '',
        course: d.courseId,
        od: st ? isoDate(st) : '',
        ot: st ? isoTime(st) : '13:00',
        cd: en ? isoDate(en) : '',
        ct: en ? isoTime(en) : '15:00',
        limit: String(d.timeLimitSeconds),
        follow: String(d.maxFollowUps),
      },
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
  const followN = parseInt(f.follow, 10)
  const course = (courses ?? []).find((c) => c.id === f.course)

  const payload = () => {
    const { title, classCode } = splitName(f.name)
    return {
      title: title || 'Untitled session',
      classCode,
      courseId: f.course,
      startAt: winOk ? toIso(f.od, f.ot) : null,
      endAt: winOk ? toIso(f.cd, f.ct) : null,
      timeLimitSeconds: Math.max(10, parseInt(f.limit, 10) || 90),
      maxFollowUps: Math.max(0, parseInt(f.follow, 10) || 0),
    }
  }

  const saveDraft = async () => {
    if (s.draft === 'saving') return
    setState({ draft: 'saving', error: null })
    try {
      setData(await atLeast(examConfigApi.update(d.id, payload()), 650))
      setState({ draft: 'saved' })
    } catch (e) {
      setState({ draft: 'idle', error: e.message })
    }
  }

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
      setState({ importState: 'done', importOpen: false, imported: rows.length })
    } catch (err) {
      setState({ importState: 'idle', error: err.message })
    }
    input.value = ''
  }

  const questions = qs.map((q, i) => ({
    key: q.id,
    n: i + 1,
    text: q.text,
  }))

  const check = d.publishCheck ?? {}
  const c1 = Boolean(check.hasQuestion ?? (qs.length > 0))
  const c2 = true // Platform Rubric pinned by system
  const c3 = Boolean(check.hasStudent ?? (d.participants?.length > 0))
  const met = [c1, c2, c3].filter(Boolean).length
  const canPublish = met === 3 && winOk

  const nudgeParts = []
  if (!c1) nudgeParts.push('Import the question list.')
  if (!c3) nudgeParts.push('Add at least one student in step 2.')
  if (!winOk) nudgeParts.push('Set the time window in Session details.')

  const publish = async () => {
    if (!canPublish) {
      setState((p) => ({ nudge: p.nudge + 1 }))
      return
    }
    try {
      await examConfigApi.update(d.id, payload())
      await examConfigApi.publish(d.id)
      navigate(paths.sessionStudents(d.id))
    } catch (e) {
      setState({ error: e.message })
    }
  }

  const handleOpenBankModal = async () => {
    setBankModalOpen(true)
    setBankLoading(true)
    setBankError(null)
    setBankSelectedIds([])
    try {
      const cid = d.courseId || s.form?.course
      const items = await questionBankApi.list(cid, 'Approved')
      setBankQuestions(Array.isArray(items) ? items : [])
    } catch (err) {
      setBankError(err.message || 'Không thể tải câu hỏi từ ngân hàng.')
      setBankQuestions([])
    } finally {
      setBankLoading(false)
    }
  }

  const isQuestionInSession = (bankItem) => {
    return (d.questions || []).some(
      (sq) => (sq.text && sq.text.trim() === bankItem.content.trim()) || sq.id === bankItem.id
    )
  }

  const toggleSelectQuestion = (id) => {
    setBankSelectedIds((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]
    )
  }

  const handleSelectAllAvailable = (availableItems) => {
    const availableIds = availableItems.filter((q) => !isQuestionInSession(q)).map((q) => q.id)
    if (bankSelectedIds.length === availableIds.length) {
      setBankSelectedIds([])
    } else {
      setBankSelectedIds(availableIds)
    }
  }

  const handleAttachFromBank = async () => {
    if (bankSelectedIds.length === 0) return
    setBankAttaching(true)
    setBankError(null)
    try {
      await questionBankApi.attachToSession(sessionId, bankSelectedIds)
      const fresh = await examConfigApi.get(sessionId)
      setData(fresh)
      setBankModalOpen(false)
      setBankSelectedIds([])
    } catch (err) {
      setBankError(err.message || 'Không thể gán câu hỏi vào ca thi.')
    } finally {
      setBankAttaching(false)
    }
  }

  const on = (k, flip) => (e) => setState((p) => ({
    form: { ...p.form, [k]: e.target.value },
    ...(flip ? { winFlip: !p.winFlip } : {}),
  }))

  const nudgeCls = s.nudge === 0 ? '' : s.nudge % 2 ? 'ss-nudge-a' : 'ss-nudge-b'

  const v = {
    title: f.name.trim() || 'Untitled session',
    courseLine: course ? `${course.code} · ${course.name}` : '',
    f,
    on: {
      name: on('name'),
      course: on('course'),
      od: on('od', true),
      ot: on('ot', true),
      cd: on('cd', true),
      ct: on('ct', true),
      limit: on('limit'),
      follow: on('follow'),
    },
    winOk,
    winBad,
    winText,
    winDur: winOk ? durText(Math.round(mins)) : '',
    winCls: tick(s.winFlip),
    followText: followN === 0 ? 'AIVES asks none' : 'then AIVES moves on',
    draftBusy: s.draft === 'saving',
    draftLabel: s.draft === 'saving' ? 'Saving…' : 'Save draft',
    draftLabelCls: s.draft === 'saving' ? 'a-rise' : '',
    draftSaved: s.draft === 'saved',
    saveDraft,
    importOpen: s.importOpen,
    importReading: s.importState === 'reading',
    importDone: s.importState === 'done' && !s.importOpen,
    fileName: s.fileName,
    imported: s.imported,
    toggleImport: () => setState((p) => ({ importOpen: !p.importOpen, importState: p.importOpen ? p.importState : 'idle' })),
    pickFile,
    questions,
    qCount: qs.length,
    t: { date: 'date', num: 'number' },
    met,
    metCls: tick(s.metFlip),
    allMet: met === 3,
    notAllMet: met !== 3,
    c1,
    c2,
    c3,
    c1Cls: c1 ? '' : nudgeCls,
    c3Cls: c3 ? '' : nudgeCls,
    students: d.participants?.length ?? 0,
    nudged: s.nudge > 0,
    nudgeTextCls: s.nudge % 2 ? 'a-tick-a' : 'a-tick-b',
    nudgeText: nudgeParts.join(' '),
    canPublish,
    publish,
    studentsPath: paths.sessionStudents(d.id),
  }

  const criteriaList = platformRubric?.criteria ?? [
    { orderNo: 1, description: 'Kiến thức chuyên môn và độ chính xác của câu trả lời', maxPoints: 4.0 },
    { orderNo: 2, description: 'Khả năng phân tích, phản biện và trả lời câu hỏi xoáy', maxPoints: 3.5 },
    { orderNo: 3, description: 'Phong thái, cấu trúc trình bày và sự tự tin', maxPoints: 2.5 },
  ]
  const platformMaxScore = platformRubric?.maxScore ?? 10.0

  return (
    <div className="pg-sessionsetup" style={{ minHeight: '100vh', display: 'flex', flexDirection: 'column' }}>
      <StaffTopBar current="sessions" />
      <main className="a-gutter" style={{ flex: '1', width: '100%', maxWidth: '1280px', margin: '0 auto', padding: '48px 40px 80px', display: 'flex', flexDirection: 'column', gap: '40px' }}>
        <div className="a-rise" style={{ animationDelay: '0ms', display: 'flex', flexDirection: 'column', gap: '28px' }}>
          <div className="a-stack-sm" style={{ display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between', gap: '24px' }}>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '12px', minWidth: '0' }}>
              <Link className="a-link" to={paths.sessions} style={{ alignSelf: 'flex-start', display: 'inline-flex', alignItems: 'center', gap: '6px', fontSize: '14px', color: 'var(--ink-2)' }}>
                <svg width="16" height="16" viewBox="0 0 24 24" aria-hidden="true" style={{ fill: 'none', stroke: 'currentColor', strokeWidth: '1.75', strokeLinecap: 'round', strokeLinejoin: 'round' }}>
                  <path d="M15 6l-6 6 6 6" />
                </svg>
                Exam sessions
              </Link>
              <h1 className="a-title" style={{ fontFamily: 'Alegreya, Georgia, serif', fontWeight: '500', fontSize: '44px', lineHeight: '1.08', letterSpacing: '-0.012em', color: 'var(--night-indigo)', overflowWrap: 'anywhere' }}>
                {v.title}
              </h1>
              <p style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', columnGap: '16px', rowGap: '6px', fontSize: '14.5px', color: 'var(--ink-2)' }}>
                <span style={{ display: 'inline-flex', alignItems: 'center', gap: '9px', color: 'var(--ink-3)' }}>
                  <svg width="14" height="14" viewBox="0 0 16 16" aria-hidden="true" style={{ flex: 'none' }}>
                    <circle cx="8" cy="8" r="6.25" style={{ fill: 'none', stroke: 'var(--ink-3)', strokeWidth: '1.5', strokeDasharray: '2.45 2.45' }} />
                  </svg>
                  Draft
                </span>
                <span style={{ color: 'var(--jade-ink)', fontWeight: '500' }}>
                  {v.courseLine}
                </span>
                {s.error && <span role="alert" style={{ fontSize: '13.5px', color: 'var(--red-ink)' }}>{s.error}</span>}
                {v.draftSaved && (
                  <span className="a-just" style={{ display: 'inline-flex', alignItems: 'center', gap: '6px', fontSize: '13.5px', color: 'var(--jade-ink)' }}>
                    <span aria-hidden="true" style={{ width: '6px', height: '6px', borderRadius: '50%', background: 'var(--jade-ink)' }} />
                    Draft saved just now
                  </span>
                )}
              </p>
            </div>
            <button type="button" className="a-btn a-btn-secondary" onClick={v.saveDraft} aria-disabled={v.draftBusy} style={{ flex: 'none', height: '44px', padding: '0 18px', borderRadius: '12px', border: '1px solid var(--edge)', background: 'rgba(255,255,255,0.6)', fontSize: '15px', fontWeight: '500', color: 'var(--night-indigo)', display: 'inline-flex', alignItems: 'center', gap: '10px' }}>
              <svg width="18" height="18" viewBox="0 0 24 24" aria-hidden="true" style={{ fill: 'none', stroke: 'currentColor', strokeWidth: '1.75', strokeLinecap: 'round', strokeLinejoin: 'round' }}>
                <path d="M5 4.5h11l3.5 3.5v11.5H5z" />
                <path d="M8.5 4.5v4.5h6.5V4.5" />
                <path d="M8.5 19.5v-5h7v5" />
              </svg>
              <span className={v.draftLabelCls}>
                {v.draftLabel}
              </span>
            </button>
          </div>
          <ol aria-label="Setup steps" style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', columnGap: '20px', rowGap: '8px' }}>
            <li>
              <Link to={paths.sessionSetup(d.id)} aria-current="step" style={{ display: 'inline-flex', alignItems: 'center', gap: '12px', height: '44px', textDecoration: 'none', color: 'var(--night-indigo)' }}>
                <span aria-hidden="true" style={{ width: '28px', height: '28px', borderRadius: '50%', background: 'var(--night-indigo)', color: 'var(--ivory)', display: 'grid', placeItems: 'center', fontSize: '13.5px', fontWeight: '500' }}>
                  1
                </span>
                <span style={{ fontSize: '15px', fontWeight: '500' }}>
                  Details and questions
                </span>
              </Link>
            </li>
            <li style={{ display: 'flex', alignItems: 'center' }}>
              <span className="a-hide-sm" aria-hidden="true" style={{ display: 'block', width: '48px', height: '1px', margin: '0 16px 0 -4px', background: 'var(--line-strong)' }} />
              <Link className="ss-step" to={v.studentsPath} style={{ display: 'inline-flex', alignItems: 'center', gap: '12px', height: '44px', textDecoration: 'none' }}>
                <span className="ss-node" aria-hidden="true" style={{ width: '28px', height: '28px', borderRadius: '50%', border: '1px solid var(--edge)', color: 'var(--ink-2)', display: 'grid', placeItems: 'center', fontSize: '13.5px', fontWeight: '500', transition: 'border-color .18s ease-out, color .18s ease-out' }}>
                  2
                </span>
                <span className="ss-step-label" style={{ fontSize: '15px', fontWeight: '400', color: 'var(--ink-2)', transition: 'color .18s ease-out' }}>
                  Students
                </span>
              </Link>
            </li>
          </ol>
        </div>

        <div className="a-grid-1-sm ss-grid" style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1fr) 372px', columnGap: '72px', rowGap: '48px', alignItems: 'start' }}>
          <div className="a-rise" style={{ animationDelay: '60ms', gridColumn: '1', gridRow: '1', display: 'flex', flexDirection: 'column', gap: '72px', minWidth: '0' }}>
            <section aria-labelledby="details-h" style={{ display: 'flex', flexDirection: 'column', gap: '28px', paddingTop: '28px', borderTop: '1px solid var(--line)' }}>
              <h2 id="details-h" style={{ fontSize: "24px", lineHeight: "1.3", fontWeight: "500", letterSpacing: "-0.005em", color: "var(--night-indigo)" }}>
                Session details
              </h2>
              <div className="a-grid-1-sm" style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1.25fr) minmax(0, 1fr)', gap: '20px 24px' }}>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', minWidth: '0' }}>
                  <label htmlFor="f-name" style={{ fontSize: '14px', fontWeight: '500', color: 'var(--night-indigo)' }}>
                    Session name
                  </label>
                  <input id="f-name" type="text" className="a-field" value={v.f.name} onChange={v.on.name} placeholder="Viva 3: Design patterns (SE1834)" style={{ width: '100%', height: '44px', padding: '0 14px', borderRadius: '10px', border: '1px solid var(--edge)', background: 'var(--field-white)', fontSize: '15px', color: 'var(--night-indigo)' }} />
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', minWidth: '0' }}>
                  <label htmlFor="f-course" style={{ fontSize: '14px', fontWeight: '500', color: 'var(--night-indigo)' }}>
                    Course
                  </label>
                  <div style={{ position: 'relative' }}>
                    <select id="f-course" className="a-field" value={v.f.course} onChange={v.on.course} style={{ width: '100%', height: '44px', padding: '0 40px 0 14px', borderRadius: '10px', border: '1px solid var(--edge)', background: 'var(--field-white)', fontSize: '15px', color: 'var(--night-indigo)', textOverflow: 'ellipsis' }}>
                      {(courses ?? []).map((c) => <option key={c.id} value={c.id}>{c.code} · {c.name}</option>)}
                    </select>
                    <svg width="16" height="16" viewBox="0 0 24 24" aria-hidden="true" style={{ position: 'absolute', right: '14px', top: '14px', pointerEvents: 'none', fill: 'none', stroke: 'var(--ink-2)', strokeWidth: '2', strokeLinecap: 'round', strokeLinejoin: 'round' }}>
                      <path d="m6 9 6 6 6-6" />
                    </svg>
                  </div>
                </div>
              </div>
              <fieldset style={{ margin: '0', padding: '0', border: '0', minWidth: '0', display: 'flex', flexDirection: 'column', gap: '16px' }}>
                <legend style={{ padding: '0', marginBottom: '14px', fontSize: '14px', fontWeight: '500', color: 'var(--night-indigo)' }}>
                  Time window
                </legend>
                <div className="a-grid-1-sm" style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1fr) minmax(0, 1fr)', gap: '16px 24px' }}>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', minWidth: '0' }}>
                    <label htmlFor="f-od" style={{ fontSize: '13.5px', color: 'var(--ink-2)' }}>
                      Opens
                    </label>
                    <div style={{ display: 'flex', gap: '8px' }}>
                      <input id="f-od" type={v.t.date} className="a-field" value={v.f.od} onChange={v.on.od} style={{ flex: '1', minWidth: '0', height: '44px', padding: '0 12px', borderRadius: '10px', border: '1px solid var(--edge)', background: 'var(--field-white)', fontSize: '15px', color: 'var(--night-indigo)' }} />
                      <div style={{ position: 'relative', flex: 'none', width: '112px' }}>
                        <select id="f-ot" className="a-field a-num" aria-label="Opening time" value={v.f.ot} onChange={v.on.ot} style={{ width: '100%', height: '44px', padding: '0 34px 0 14px', borderRadius: '10px', border: '1px solid var(--edge)', background: 'var(--field-white)', fontSize: '15px', color: 'var(--night-indigo)' }}>
                          {['08:00', '09:00', '10:00', '11:00', '12:00', '13:00', '14:00', '15:00', '16:00', '17:00', '18:00', '19:00', '20:00'].map((time) => (
                            <option key={time} value={time}>{time}</option>
                          ))}
                        </select>
                        <svg width="16" height="16" viewBox="0 0 24 24" aria-hidden="true" style={{ position: 'absolute', right: '12px', top: '14px', pointerEvents: 'none', fill: 'none', stroke: 'var(--ink-2)', strokeWidth: '2', strokeLinecap: 'round', strokeLinejoin: 'round' }}>
                          <path d="m6 9 6 6 6-6" />
                        </svg>
                      </div>
                    </div>
                  </div>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', minWidth: '0' }}>
                    <label htmlFor="f-cd" style={{ fontSize: '13.5px', color: 'var(--ink-2)' }}>
                      Closes
                    </label>
                    <div style={{ display: 'flex', gap: '8px' }}>
                      <input id="f-cd" type={v.t.date} className="a-field" value={v.f.cd} onChange={v.on.cd} aria-invalid={v.winBad} style={{ flex: '1', minWidth: '0', height: '44px', padding: '0 12px', borderRadius: '10px', border: '1px solid var(--edge)', background: 'var(--field-white)', fontSize: '15px', color: 'var(--night-indigo)' }} />
                      <div style={{ position: 'relative', flex: 'none', width: '112px' }}>
                        <select id="f-ct" className="a-field a-num" aria-label="Closing time" value={v.f.ct} onChange={v.on.ct} aria-invalid={v.winBad} style={{ width: '100%', height: '44px', padding: '0 34px 0 14px', borderRadius: '10px', border: '1px solid var(--edge)', background: 'var(--field-white)', fontSize: '15px', color: 'var(--night-indigo)' }}>
                          {['09:00', '10:00', '11:00', '12:00', '13:00', '14:00', '15:00', '16:00', '17:00', '18:00', '19:00', '20:00', '21:00', '22:00'].map((time) => (
                            <option key={time} value={time}>{time}</option>
                          ))}
                        </select>
                        <svg width="16" height="16" viewBox="0 0 24 24" aria-hidden="true" style={{ position: 'absolute', right: '12px', top: '14px', pointerEvents: 'none', fill: 'none', stroke: 'var(--ink-2)', strokeWidth: '2', strokeLinecap: 'round', strokeLinejoin: 'round' }}>
                          <path d="m6 9 6 6 6-6" />
                        </svg>
                      </div>
                    </div>
                  </div>
                </div>
                {v.winOk && (
                  <p style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'baseline', columnGap: '14px', rowGap: '2px' }} aria-live="polite">
                    <span className={v.winCls} style={{ fontSize: '20px', fontWeight: '300', lineHeight: '1.2', color: 'var(--night-indigo)' }}>
                      {v.winText}
                    </span>
                    <span style={{ fontSize: '14.5px', color: 'var(--ink-2)' }}>
                      {v.winDur}
                    </span>
                  </p>
                )}
                {v.winBad && (
                  <p id="win-err" className="a-rise" role="alert" style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '13.5px', color: 'var(--red-ink)' }}>
                    <svg width="18" height="18" viewBox="0 0 24 24" aria-hidden="true" style={{ flex: 'none', fill: 'none', stroke: 'currentColor', strokeWidth: '1.75', strokeLinecap: 'round', strokeLinejoin: 'round' }}>
                      <path d="M12 4 21 19.5H3z" />
                      <path d="M12 10v4.5" />
                      <path d="M12 17.2v.01" />
                    </svg>
                    The session closes before it opens. Move the closing time later.
                  </p>
                )}
                <p style={{ display: 'flex', alignItems: 'flex-start', gap: '8px', fontSize: '14px', lineHeight: '1.5', color: 'var(--ink-3)' }}>
                  <svg width="16" height="16" viewBox="0 0 24 24" aria-hidden="true" style={{ flex: 'none', marginTop: '3px', fill: 'none', stroke: 'var(--jade-ink)', strokeWidth: '1.75', strokeLinecap: 'round', strokeLinejoin: 'round' }}>
                    <circle cx="12" cy="12" r="8.5" />
                    <path d="M12 7.5V12l3 2" />
                  </svg>
                  Each listed student starts once, inside the window. At closing time, attempts still running stop.
                </p>
              </fieldset>
              <div className="a-grid-1-sm" style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1fr) minmax(0, 1fr)', gap: '20px 24px' }}>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', minWidth: '0' }}>
                  <label htmlFor="f-limit" style={{ fontSize: '14px', fontWeight: '500', color: 'var(--night-indigo)' }}>
                    Time limit per answer
                  </label>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                    <input id="f-limit" type={v.t.num} inputMode="numeric" min="10" step="5" className="a-field a-num" value={v.f.limit} onChange={v.on.limit} style={{ flex: 'none', width: '104px', height: '44px', padding: '0 12px', borderRadius: '10px', border: '1px solid var(--edge)', background: 'var(--field-white)', fontSize: '20px', fontWeight: '300', color: 'var(--night-indigo)' }} />
                    <span style={{ fontSize: '14.5px', lineHeight: '1.35', color: 'var(--ink-2)' }}>
                      seconds, follow-ups included
                    </span>
                  </div>
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', minWidth: '0' }}>
                  <label htmlFor="f-follow" style={{ fontSize: '14px', fontWeight: '500', color: 'var(--night-indigo)' }}>
                    Maximum follow-ups per question
                  </label>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                    <input id="f-follow" type={v.t.num} inputMode="numeric" min="0" step="1" className="a-field a-num" value={v.f.follow} onChange={v.on.follow} style={{ flex: 'none', width: '104px', height: '44px', padding: '0 12px', borderRadius: '10px', border: '1px solid var(--edge)', background: 'var(--field-white)', fontSize: '20px', fontWeight: '300', color: 'var(--night-indigo)' }} />
                    <span style={{ fontSize: '14.5px', lineHeight: '1.35', color: 'var(--ink-2)' }}>
                      {v.followText}
                    </span>
                  </div>
                </div>
              </div>
            </section>

            {/* Questions Section with Platform Rubric reference */}
            <section aria-labelledby="questions-h" style={{ display: 'flex', flexDirection: 'column', gap: '16px', paddingTop: '28px', borderTop: '1px solid var(--line)' }}>
              <div className="a-stack-sm" style={{ display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between', gap: '16px 24px', paddingBottom: '12px' }}>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                  <h2 id="questions-h" style={{ fontSize: '24px', lineHeight: '1.3', fontWeight: '500', letterSpacing: '-0.005em', color: 'var(--night-indigo)' }}>
                    Questions
                  </h2>
                  <p style={{ fontSize: '14.5px', color: 'var(--ink-2)' }}>
                    {v.qCount} questions, asked in this order · Standard assessment applied
                  </p>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '12px', flexWrap: 'wrap' }}>
                  <button
                    type="button"
                    className="a-btn a-btn-secondary"
                    onClick={() => setRubricModalOpen(true)}
                    style={{ height: '44px', padding: '0 16px', borderRadius: '12px', border: '1px solid var(--jade-edge, rgba(14,159,110,0.4))', background: 'var(--jade-wash, rgba(14,159,110,0.06))', fontSize: '14.5px', fontWeight: '500', color: 'var(--jade-ink)', display: 'inline-flex', alignItems: 'center', gap: '8px' }}
                  >
                    <svg width="16" height="16" viewBox="0 0 24 24" aria-hidden="true" style={{ fill: 'none', stroke: 'currentColor', strokeWidth: '2', strokeLinecap: 'round', strokeLinejoin: 'round' }}>
                      <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
                    </svg>
                    Platform Rubric Standards ({platformMaxScore.toFixed(1)} pts)
                  </button>
                  <button
                    type="button"
                    className="a-btn a-btn-secondary"
                    onClick={handleOpenBankModal}
                    style={{ height: '44px', padding: '0 18px', borderRadius: '12px', border: '1px solid var(--edge)', background: 'rgba(255,255,255,0.6)', fontSize: '15px', fontWeight: '500', color: 'var(--night-indigo)', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: '8px' }}
                  >
                    <svg width="18" height="18" viewBox="0 0 24 24" aria-hidden="true" style={{ fill: 'none', stroke: 'currentColor', strokeWidth: '1.75', strokeLinecap: 'round', strokeLinejoin: 'round' }}>
                      <path d="M4 19.5v-15A2.5 2.5 0 0 1 6.5 2H20v20H6.5a2.5 2.5 0 0 1-2.5-2.5Z" />
                      <path d="M6 6h10" />
                      <path d="M6 10h10" />
                    </svg>
                    Add from Bank
                  </button>
                  <button type="button" className="a-btn a-btn-secondary" onClick={v.toggleImport} aria-expanded={v.importOpen} style={{ height: '44px', padding: '0 18px', borderRadius: '12px', border: '1px solid var(--edge)', background: 'rgba(255,255,255,0.6)', fontSize: '15px', fontWeight: '500', color: 'var(--night-indigo)', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: '10px' }}>
                    <svg width="18" height="18" viewBox="0 0 24 24" aria-hidden="true" style={{ fill: 'none', stroke: 'currentColor', strokeWidth: '1.75', strokeLinecap: 'round', strokeLinejoin: 'round' }}>
                      <path d="M12 15V4" />
                      <path d="M7.5 8.5 12 4l4.5 4.5" />
                      <path d="M5 19.5h14" />
                    </svg>
                    Import questions
                  </button>
                </div>
              </div>

              {/* Platform Rubric Banner */}
              <div className="ss-rubric-panel">
                <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                  <svg width="20" height="20" viewBox="0 0 24 24" aria-hidden="true" style={{ flex: 'none', fill: 'none', stroke: 'var(--jade-ink)', strokeWidth: '2', strokeLinecap: 'round', strokeLinejoin: 'round' }}>
                    <path d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" />
                  </svg>
                  <span style={{ fontSize: '14.5px', color: 'var(--night-indigo)', lineHeight: '1.4' }}>
                    <strong>Platform Rubric active:</strong> Evaluates all responses across 3 standard criteria (Total {platformMaxScore.toFixed(1)} points). No per-question rubric setup needed.
                  </span>
                </div>
                <button
                  type="button"
                  className="a-link"
                  onClick={() => setRubricModalOpen(true)}
                  style={{ flex: 'none', border: '0', background: 'transparent', padding: '0', fontSize: '14px', fontWeight: '500', color: 'var(--jade-ink)', cursor: 'pointer', textDecoration: 'underline' }}
                >
                  View criteria
                </button>
              </div>

              {v.importOpen && (
                <div className="ss-open" style={{ display: 'flex', flexDirection: 'column', gap: '14px', marginBottom: '16px', padding: '16px 20px', borderRadius: '12px', background: 'rgba(255,255,255,0.7)', border: '1px solid var(--edge)' }}>
                  <div className="a-wrap-sm" style={{ display: 'flex', alignItems: 'center', gap: '12px 16px' }}>
                    <label className="ss-file a-btn" style={{ position: 'relative', height: '44px', padding: '0 18px', borderRadius: '12px', border: '1px solid var(--edge)', background: 'var(--field-white)', fontSize: '15px', fontWeight: '500', color: 'var(--night-indigo)', display: 'inline-flex', alignItems: 'center', gap: '10px' }}>
                      <svg width="18" height="18" viewBox="0 0 24 24" aria-hidden="true" style={{ fill: 'none', stroke: 'currentColor', strokeWidth: '1.75', strokeLinecap: 'round', strokeLinejoin: 'round' }}>
                        <path d="M14 3.5H6.5v17h11V7z" />
                        <path d="M14 3.5V7h3.5" />
                      </svg>
                      Choose a file
                      <input type="file" accept=".txt,.csv" onChange={v.pickFile} style={{ position: 'absolute', inset: '0', width: '100%', height: '100%', opacity: '0', cursor: 'pointer' }} />
                    </label>
                    <span style={{ fontSize: '14.5px', color: 'var(--ink-2)' }}>
                      One question per row · {PENDING.questionFileFormat}
                    </span>
                    <button type="button" className="a-btn a-btn-quiet" onClick={v.toggleImport} style={{ marginLeft: 'auto', height: '44px', padding: '0 14px', border: '0', borderRadius: '10px', background: 'transparent', fontSize: '15px', fontWeight: '500', color: 'var(--ink-2)' }}>
                      Cancel
                    </button>
                  </div>
                  {v.importReading && (
                    <p className="a-rise" aria-live="polite" style={{ fontSize: '14.5px', color: 'var(--ink-2)' }}>
                      Reading {v.fileName}…
                    </p>
                  )}
                </div>
              )}

              {v.importDone && (
                <div className="a-just" style={{ display: 'flex', alignItems: 'center', gap: '6px', marginBottom: '8px', fontSize: '13.5px', color: 'var(--jade-ink)' }}>
                  <span aria-hidden="true" style={{ width: '6px', height: '6px', borderRadius: '50%', background: 'var(--jade-ink)' }} />
                  {v.imported} questions read from {v.fileName} just now
                </div>
              )}

              {/* Questions clean list: NO individual rubric inputs */}
              <ol aria-label="Questions" style={{ display: 'flex', flexDirection: 'column' }}>
                {v.questions.map((q) => (
                  <li key={q.key} style={{ display: 'flex', flexDirection: 'column', gap: '10px', padding: '22px 0 24px', borderTop: '1px solid var(--line)' }}>
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '12px' }}>
                      <span style={{ fontSize: '14px', fontWeight: '500', color: 'var(--ink-3)' }}>
                        Question {q.n}
                      </span>
                    </div>
                    <p className="ss-quote" style={{ fontFamily: 'Alegreya, Georgia, serif', fontWeight: '500', fontSize: '24px', lineHeight: '1.3', color: 'var(--night-indigo)', maxWidth: '38em', textWrap: 'pretty' }}>
                      {q.text}
                    </p>
                  </li>
                ))}
              </ol>
            </section>
          </div>

          {/* Footer action */}
          <div className="a-stack-sm a-rise ss-foot" style={{ animationDelay: '60ms', gridColumn: '1', gridRow: '2', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '16px 24px', paddingTop: '24px', borderTop: '1px solid var(--line)' }}>
            {USE_MOCKS ? <p style={{ fontSize: '13px', color: 'var(--ink-3)' }}>All names, dates and scores on this page are sample data.</p> : <span />}
            <Link to={v.studentsPath} className="a-btn a-btn-secondary" style={{ height: '44px', padding: '0 18px', borderRadius: '12px', border: '1px solid var(--edge)', background: 'rgba(255,255,255,0.6)', fontSize: '15px', fontWeight: '500', color: 'var(--night-indigo)', textDecoration: 'none', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: '10px' }}>
              Next: Students
              <svg width="18" height="18" viewBox="0 0 24 24" aria-hidden="true" style={{ fill: 'none', stroke: 'currentColor', strokeWidth: '1.75', strokeLinecap: 'round', strokeLinejoin: 'round' }}>
                <path d="M5 12h14" />
                <path d="m13 6 6 6-6 6" />
              </svg>
            </Link>
          </div>

          {/* Publish Checklist Aside */}
          <aside id="publish" className="ss-aside" aria-labelledby="ready-h" style={{ gridColumn: '2', gridRow: '1 / span 2', position: 'sticky', top: '24px', scrollMarginTop: '24px' }}>
            <div className="a-night a-rise" style={{ animationDelay: '120ms', display: 'flex', flexDirection: 'column', gap: '24px', padding: '26px 24px 24px', borderRadius: '20px', backgroundColor: 'var(--night-indigo)', backgroundImage: 'radial-gradient(420px 260px at 100% 0%, var(--jade-wash), rgba(15,22,48,0) 70%)', color: 'var(--ivory)', boxShadow: '0 24px 48px -28px rgba(15,22,48,0.7)' }}>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                <h2 id="ready-h" style={{ fontSize: '15px', fontWeight: '500', color: 'var(--ivory)' }}>
                  Ready to publish?
                </h2>
                <p className="a-num" style={{ display: 'flex', alignItems: 'baseline', gap: '10px' }} aria-live="polite">
                  <span style={{ fontSize: '72px', fontWeight: '200', lineHeight: '0.95', letterSpacing: '-0.02em', display: 'inline-block', minWidth: '0.6em' }}>
                    <span className={v.metCls}>
                      {v.met}
                    </span>
                  </span>
                  <span style={{ fontSize: '18px', fontWeight: '300', color: 'var(--ivory-2)' }}>
                    of 3 checks met
                  </span>
                </p>
              </div>

              <ul style={{ display: 'flex', flexDirection: 'column', gap: '18px', paddingTop: '20px', borderTop: '1px solid var(--night-line)' }}>
                {/* Check 1: Questions */}
                <li className={v.c1Cls} style={{ display: 'grid', gridTemplateColumns: '20px minmax(0, 1fr)', columnGap: '14px', rowGap: '2px' }}>
                  <span style={{ marginTop: '1px', display: 'flex' }}>
                    {v.c1 ? (
                      <svg width="20" height="20" viewBox="0 0 16 16" aria-hidden="true">
                        <circle cx="8" cy="8" r="6.25" style={{ fill: 'none', stroke: 'var(--ivory)', strokeWidth: '1.5' }} />
                        <circle cx="8" cy="8" r="6.25" style={{ fill: 'var(--ivory)' }} />
                      </svg>
                    ) : (
                      <svg width="20" height="20" viewBox="0 0 16 16" aria-hidden="true">
                        <circle cx="8" cy="8" r="6.25" style={{ fill: 'none', stroke: 'var(--ivory-2)', strokeWidth: '1.5' }} />
                      </svg>
                    )}
                  </span>
                  <span style={{ fontSize: '15px', fontWeight: '500' }}>At least one question</span>
                  <span style={{ gridColumn: '2', fontSize: '14px', color: 'var(--ivory-2)' }}>{v.c1 ? `${v.qCount} questions loaded` : 'No questions yet.'}</span>
                </li>

                {/* Check 2: Platform Rubric (Pinned) */}
                <li style={{ display: 'grid', gridTemplateColumns: '20px minmax(0, 1fr)', columnGap: '14px', rowGap: '2px' }}>
                  <span style={{ marginTop: '1px', display: 'flex' }}>
                    <svg width="20" height="20" viewBox="0 0 16 16" aria-hidden="true">
                      <circle cx="8" cy="8" r="6.25" style={{ fill: 'none', stroke: 'var(--ivory)', strokeWidth: '1.5' }} />
                      <circle cx="8" cy="8" r="6.25" style={{ fill: 'var(--ivory)' }} />
                    </svg>
                  </span>
                  <span style={{ fontSize: '15px', fontWeight: '500' }}>Platform Rubric (Pinned)</span>
                  <span style={{ gridColumn: '2', display: 'flex', alignItems: 'center', gap: '8px', fontSize: '14px', color: 'var(--ivory-2)' }}>
                    Standard {platformMaxScore.toFixed(1)} pts criteria
                    <button
                      type="button"
                      onClick={() => setRubricModalOpen(true)}
                      style={{ border: '0', background: 'transparent', padding: '0', color: 'var(--ivory)', fontSize: '13px', textDecoration: 'underline', cursor: 'pointer' }}
                    >
                      View
                    </button>
                  </span>
                </li>

                {/* Check 3: Students */}
                <li className={v.c3Cls} style={{ display: 'grid', gridTemplateColumns: '20px minmax(0, 1fr)', columnGap: '14px', rowGap: '2px' }}>
                  <span style={{ marginTop: '1px', display: 'flex' }}>
                    {v.c3 ? (
                      <svg width="20" height="20" viewBox="0 0 16 16" aria-hidden="true">
                        <circle cx="8" cy="8" r="6.25" style={{ fill: 'none', stroke: 'var(--ivory)', strokeWidth: '1.5' }} />
                        <circle cx="8" cy="8" r="6.25" style={{ fill: 'var(--ivory)' }} />
                      </svg>
                    ) : (
                      <svg width="20" height="20" viewBox="0 0 16 16" aria-hidden="true">
                        <circle cx="8" cy="8" r="6.25" style={{ fill: 'none', stroke: 'var(--ivory-2)', strokeWidth: '1.5' }} />
                      </svg>
                    )}
                  </span>
                  <span style={{ fontSize: '15px', fontWeight: '500' }}>At least one student</span>
                  <span style={{ gridColumn: '2', display: 'flex', flexWrap: 'wrap', alignItems: 'baseline', gap: '4px 10px', fontSize: '14px', color: 'var(--ivory-2)' }}>
                    {v.c3 ? `${v.students} students` : 'No students yet.'}
                    <Link className="a-link" to={v.studentsPath} style={{ fontWeight: '500', color: 'var(--ivory)' }}>
                      {v.c3 ? 'Change list' : 'Import list'}
                    </Link>
                  </span>
                </li>
              </ul>

              <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
                <button type="button" className="a-btn a-btn-primary" aria-disabled={!v.canPublish} aria-describedby="publish-why" onClick={v.publish} style={{ height: '52px', border: '0', borderRadius: '14px', background: 'var(--ivory)', color: 'var(--night-indigo)', fontSize: '16px', fontWeight: '500', boxShadow: '0 10px 28px -12px rgba(0,0,0,0.55)' }}>
                  Publish exam session
                </button>
                {v.nudged && (
                  <p id="publish-why" className={v.nudgeTextCls} role="alert" style={{ display: 'grid', gridTemplateColumns: '18px minmax(0, 1fr)', columnGap: '10px', padding: '12px 14px', borderRadius: '12px', background: 'var(--red-wash-night)', border: '1px solid rgba(255,106,79,0.4)', fontSize: '14px', lineHeight: '1.5', color: 'var(--ivory)' }}>
                    <svg width="18" height="18" viewBox="0 0 24 24" aria-hidden="true" style={{ marginTop: '1px', fill: 'none', stroke: 'var(--ember-text)', strokeWidth: '1.75', strokeLinecap: 'round', strokeLinejoin: 'round' }}>
                      <path d="M12 4 21 19.5H3z" />
                      <path d="M12 10v4.5" />
                      <path d="M12 17.2v.01" />
                    </svg>
                    <span>
                      <span style={{ fontWeight: '500', color: 'var(--ember-text)' }}>
                        Not yet.
                      </span>
                      {' '}{v.nudgeText}
                    </span>
                  </p>
                )}
                <p style={{ display: 'flex', alignItems: 'flex-start', gap: '8px', fontSize: '13.5px', lineHeight: '1.45', color: 'var(--ivory-2)' }}>
                  <svg width="16" height="16" viewBox="0 0 24 24" aria-hidden="true" style={{ flex: 'none', marginTop: '1px', fill: 'none', stroke: 'currentColor', strokeWidth: '1.75', strokeLinecap: 'round', strokeLinejoin: 'round' }}>
                    <rect x="5" y="11" width="14" height="9" rx="2" />
                    <path d="M8 11V8a4 4 0 0 1 8 0v3" />
                  </svg>
                  Publishing locks the questions and session configuration.
                </p>
              </div>
            </div>
          </aside>
        </div>
      </main>

      {/* Platform Rubric Modal */}
      {rubricModalOpen && (
        <div className="ss-modal-overlay" onClick={() => setRubricModalOpen(false)}>
          <div className="ss-modal-card" onClick={(e) => e.stopPropagation()}>
            <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: '16px' }}>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <span style={{ display: 'inline-flex', alignItems: 'center', gap: '6px', padding: '3px 10px', borderRadius: '100px', background: 'var(--jade-wash, rgba(14,159,110,0.1))', color: 'var(--jade-ink)', fontSize: '12.5px', fontWeight: '500' }}>
                    <span style={{ width: '6px', height: '6px', borderRadius: '50%', background: 'var(--jade-ink)' }} />
                    Active & Sealed · v{platformRubric?.versionNo ?? 1}
                  </span>
                </div>
                <h3 style={{ fontFamily: 'Alegreya, Georgia, serif', fontSize: '28px', fontWeight: '500', color: 'var(--night-indigo)', margin: 0 }}>
                  Platform Rubric Standards
                </h3>
                <p style={{ fontSize: '14.5px', color: 'var(--ink-2)', margin: 0 }}>
                  Standardized viva exam scoring criteria applied across all oral examination sessions.
                </p>
              </div>
              <button
                type="button"
                className="a-btn a-btn-quiet"
                onClick={() => setRubricModalOpen(false)}
                style={{ padding: '8px', borderRadius: '10px', color: 'var(--ink-2)' }}
                aria-label="Close modal"
              >
                <svg width="20" height="20" viewBox="0 0 24 24" aria-hidden="true" style={{ fill: 'none', stroke: 'currentColor', strokeWidth: '2', strokeLinecap: 'round', strokeLinejoin: 'round' }}>
                  <line x1="18" y1="6" x2="6" y2="18" />
                  <line x1="6" y1="6" x2="18" y2="18" />
                </svg>
              </button>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', paddingTop: '12px', borderTop: '1px solid var(--line)' }}>
              {criteriaList.map((c, idx) => (
                <div key={c.id ?? idx} className="ss-criterion-item">
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '4px', maxWidth: '420px' }}>
                    <span style={{ fontSize: '13px', fontWeight: '500', color: 'var(--ink-3)' }}>
                      Criterion {c.orderNo ?? (idx + 1)}
                    </span>
                    <span style={{ fontSize: '15px', color: 'var(--night-indigo)', lineHeight: '1.45' }}>
                      {c.description}
                    </span>
                  </div>
                  <div style={{ flex: 'none', display: 'flex', alignItems: 'baseline', gap: '4px' }}>
                    <span className="a-num" style={{ fontSize: '20px', fontWeight: '400', color: 'var(--night-indigo)' }}>
                      {Number(c.maxPoints).toFixed(1)}
                    </span>
                    <span style={{ fontSize: '13px', color: 'var(--ink-3)' }}>pts</span>
                  </div>
                </div>
              ))}
            </div>

            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '16px', paddingTop: '16px', borderTop: '1px solid var(--line)' }}>
              <div style={{ display: 'flex', alignItems: 'baseline', gap: '6px' }}>
                <span style={{ fontSize: '14.5px', color: 'var(--ink-2)' }}>Total standard scale:</span>
                <span className="a-num" style={{ fontSize: '22px', fontWeight: '500', color: 'var(--night-indigo)' }}>
                  {platformMaxScore.toFixed(1)}
                </span>
                <span style={{ fontSize: '13.5px', color: 'var(--ink-3)' }}>points</span>
              </div>
              <button
                type="button"
                className="a-btn a-btn-secondary"
                onClick={() => setRubricModalOpen(false)}
                style={{ height: '40px', padding: '0 20px', borderRadius: '10px', border: '1px solid var(--edge)', background: 'var(--field-white)', fontSize: '14.5px', fontWeight: '500', color: 'var(--night-indigo)' }}
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Import from Question Bank Modal */}
      {bankModalOpen && (
        <div className="ss-modal-overlay" onClick={() => !bankAttaching && setBankModalOpen(false)}>
          <div className="ss-modal-card ss-bank-modal" onClick={(e) => e.stopPropagation()}>
            <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: '16px' }}>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                <span style={{ fontSize: '12.5px', fontWeight: '500', color: 'var(--jade-ink)' }}>
                  {course ? `${course.code} · ${course.name}` : 'Course Question Bank'}
                </span>
                <h3 style={{ fontFamily: 'Alegreya, Georgia, serif', fontSize: '26px', fontWeight: '500', color: 'var(--night-indigo)', margin: 0 }}>
                  Import from Question Bank
                </h3>
                <p style={{ fontSize: '14px', color: 'var(--ink-2)', margin: 0 }}>
                  Chọn các câu hỏi đã được phê duyệt (Approved) để đưa vào ca thi.
                </p>
              </div>
              <button
                type="button"
                className="a-btn a-btn-quiet"
                onClick={() => setBankModalOpen(false)}
                disabled={bankAttaching}
                style={{ padding: '8px', borderRadius: '10px', color: 'var(--ink-2)' }}
                aria-label="Close modal"
              >
                <svg width="20" height="20" viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <line x1="18" y1="6" x2="6" y2="18" />
                  <line x1="6" y1="6" x2="18" y2="18" />
                </svg>
              </button>
            </div>

            {bankError && (
              <div style={{ padding: '10px 14px', borderRadius: '10px', background: 'var(--red-wash-day)', border: '1px solid rgba(232,69,44,0.3)', color: 'var(--red-ink)', fontSize: '13.5px' }}>
                {bankError}
              </div>
            )}

            {/* List and Toolbar */}
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '12px', paddingTop: '10px', borderTop: '1px solid var(--line)' }}>
              <button
                type="button"
                className="a-link"
                onClick={() => handleSelectAllAvailable(bankQuestions)}
                disabled={bankLoading || bankQuestions.length === 0}
                style={{ fontSize: '13.5px', color: 'var(--night-indigo)', fontWeight: '500', cursor: 'pointer', background: 'none', border: 'none' }}
              >
                {bankSelectedIds.length > 0 && bankSelectedIds.length === bankQuestions.filter((q) => !isQuestionInSession(q)).length
                  ? 'Deselect all'
                  : 'Select all available'}
              </button>
              <span style={{ fontSize: '13.5px', color: 'var(--ink-2)' }}>
                Đã chọn: <strong>{bankSelectedIds.length}</strong> câu hỏi
              </span>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '10px', maxHeight: '380px', overflowY: 'auto' }}>
              {bankLoading ? (
                <div style={{ padding: '40px 0', textAlign: 'center', color: 'var(--ink-2)', fontSize: '14.5px' }}>
                  Đang tải câu hỏi từ ngân hàng…
                </div>
              ) : bankQuestions.length === 0 ? (
                <div style={{ padding: '40px 0', textAlign: 'center', color: 'var(--ink-2)', fontSize: '14.5px' }}>
                  Ngân hàng môn học hiện chưa có câu hỏi nào ở trạng thái Approved.
                </div>
              ) : (
                bankQuestions.map((q) => {
                  const alreadyIn = isQuestionInSession(q)
                  const isChecked = bankSelectedIds.includes(q.id)

                  return (
                    <div
                      key={q.id}
                      className={`ss-bank-item ${alreadyIn ? 'ss-bank-disabled' : isChecked ? 'ss-bank-selected' : ''}`}
                      onClick={() => !alreadyIn && toggleSelectQuestion(q.id)}
                      style={{ cursor: alreadyIn ? 'not-allowed' : 'pointer' }}
                    >
                      <input
                        type="checkbox"
                        className="ss-bank-checkbox"
                        checked={isChecked || alreadyIn}
                        disabled={alreadyIn}
                        onChange={() => {}}
                        onClick={(e) => e.stopPropagation()}
                      />
                      <div style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', gap: '4px' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                          <span className="ss-bank-bloom">{q.bloom}</span>
                          <span style={{ fontSize: '13px', fontWeight: '600', color: 'var(--night-indigo)' }}>
                            {q.topic}
                          </span>
                          {alreadyIn && (
                            <span style={{ marginLeft: 'auto', fontSize: '12px', color: 'var(--ink-3)', fontWeight: '500', background: 'rgba(61,69,102,0.08)', padding: '2px 8px', borderRadius: '4px' }}>
                              Already in session
                            </span>
                          )}
                        </div>
                        <p style={{ fontSize: '14.5px', lineHeight: '1.45', color: 'var(--night-indigo)', margin: 0 }}>
                          {q.content}
                        </p>
                      </div>
                    </div>
                  )
                })
              )}
            </div>

            {/* Modal Footer */}
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'flex-end', gap: '12px', paddingTop: '16px', borderTop: '1px solid var(--line)' }}>
              <button
                type="button"
                className="a-btn a-btn-quiet"
                onClick={() => setBankModalOpen(false)}
                disabled={bankAttaching}
                style={{ height: '42px', padding: '0 18px', borderRadius: '10px', border: '1px solid var(--line-strong)', fontSize: '14.5px' }}
              >
                Cancel
              </button>
              <button
                type="button"
                className="a-btn a-btn-primary"
                onClick={handleAttachFromBank}
                disabled={bankAttaching || bankSelectedIds.length === 0}
                style={{
                  height: '42px',
                  padding: '0 24px',
                  borderRadius: '10px',
                  background: 'var(--night-indigo)',
                  color: 'var(--ivory)',
                  fontSize: '14.5px',
                  fontWeight: '500',
                  opacity: bankSelectedIds.length === 0 ? 0.6 : 1,
                  cursor: bankSelectedIds.length === 0 ? 'not-allowed' : 'pointer',
                }}
              >
                {bankAttaching ? 'Adding…' : `Add to Exam Session (${bankSelectedIds.length})`}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
