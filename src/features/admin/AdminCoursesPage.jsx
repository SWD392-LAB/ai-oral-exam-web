import { Fragment, useEffect } from 'react'
import { adminApi } from '../../api/services.js'
import { SampleNote } from '../../components/SampleNote.jsx'
import { StaffTopBar } from '../../components/TopBar.jsx'
import { useLoad } from '../../hooks/useLoad.js'
import { useMergeState } from '../../hooks/useMergeState.js'
import { useTimeouts } from '../../hooks/useTimeouts.js'
import { atLeast } from '../../utils/async.js'
import './AdminCourses.css'

const same = (a, b) => a.code === b.code && a.name === b.name && a.lects.join('|') === b.lects.join('|')

// Courses and the lecturers assigned to them; a lecturer opens only their assigned courses (F7)
export default function AdminCoursesPage() {
  const { data: courses, setData: setCourses } = useLoad(() => adminApi.courses(), [])
  const { data: users } = useLoad(() => adminApi.users(), [])
  const { later } = useTimeouts()
  const [s, set] = useMergeState({ sel: null, back: null, drafts: {}, added: null, picks: {}, errs: {}, removing: null, saving: false, savedJust: null, savedText: '', rowNew: null, flip: false, again: 0, turning: false, out: null })
  useEffect(() => { if (courses?.length && !s.sel) set({ sel: courses[0].id, back: courses[0].id }) }, [courses, s.sel, set])
  if (!courses || !users || !s.sel) {
    return (
      <div className="pg-admincourses" style={{ minHeight: '100vh', display: 'flex', flexDirection: 'column' }}>
        <StaffTopBar current="courses" />
      </div>
    )
  }
  const lecturers = users.filter((u) => u.role === 'Lecturer' && u.active)
  const person = (id) => users.find((u) => u.id === id)
  const saved = (id) => (id === 'new' ? { code: '', name: '', lects: [] } : (() => { const c = courses.find((x) => x.id === id); return { code: c.code, name: c.name, lects: c.lecturerIds, sessions: c.sessions } })())
  const draftOf = (st, id) => st.drafts[id] ?? { ...saved(id), lects: saved(id).lects.slice() }
  const go = (id) => {
    if (id === s.sel || s.turning) return
    const out = face(s.sel, true)
    const patch = { sel: id, turning: true, out, added: null, removing: null }
    if (id === 'new') { patch.back = s.sel; patch.drafts = { ...s.drafts, new: { code: '', name: '', lects: [] } }; patch.errs = { ...s.errs, new: {} } }
    set(patch)
    later(() => set({ turning: false, out: null }), 620)
  }
  const edit = (id, patch) => set((p) => ({ drafts: { ...p.drafts, [id]: { ...draftOf(p, id), ...patch } }, errs: { ...p.errs, [id]: {} }, savedJust: p.savedJust === id ? null : p.savedJust }))
  const assign = (id) => {
    const who = s.picks[id]
    if (!who) return
    const d = draftOf(s, id)
    if (d.lects.includes(who)) return
    set((p) => ({ drafts: { ...p.drafts, [id]: { ...d, lects: d.lects.concat(who) } }, picks: { ...p.picks, [id]: '' }, added: who, flip: !p.flip, savedJust: p.savedJust === id ? null : p.savedJust }))
  }
  const remove = (id, who) => {
    if (s.removing) return
    set({ removing: who })
    later(() => set((p) => {
      const d = draftOf(p, id)
      return { removing: null, added: p.added === who ? null : p.added, flip: !p.flip, drafts: { ...p.drafts, [id]: { ...d, lects: d.lects.filter((n) => n !== who) } }, savedJust: p.savedJust === id ? null : p.savedJust }
    }), 260)
  }
  const check = (id, d) => {
    const e = {}
    if (!d.code.trim()) e.code = 'Enter a course code.'
    else if (courses.some((c) => c.id !== id && c.code === d.code.trim())) e.code = `${d.code.trim()} already exists. Use another code.`
    if (!d.name.trim()) e.name = 'Enter a course name.'
    return e
  }
  const save = async (id) => {
    const d = draftOf(s, id)
    if (s.saving || same(d, saved(id))) return
    const e = check(id, d)
    if (e.code || e.name) { set((p) => ({ errs: { ...p.errs, [id]: e } })); return }
    set({ saving: true })
    try {
      const c = await atLeast(adminApi.updateCourse(id, { code: d.code.trim(), name: d.name.trim(), lecturerIds: d.lects }), 750)
      setCourses((list) => list.map((x) => (x.id === id ? c : x)))
      set((p) => { const drafts = { ...p.drafts }; delete drafts[id]; return { drafts, saving: false, savedJust: id, savedText: 'Saved just now', added: null, flip: !p.flip } })
    } catch (err) {
      set((p) => ({ saving: false, errs: { ...p.errs, [id]: { code: err.message } } }))
    }
  }
  const create = async () => {
    const d = draftOf(s, 'new')
    const e = check('new', d)
    if (e.code || e.name) { set((p) => ({ errs: { ...p.errs, new: e } })); return }
    try {
      const c = await adminApi.createCourse({ code: d.code.trim(), name: d.name.trim(), lecturerIds: d.lects })
      setCourses((list) => [...list, c])
      set((p) => { const drafts = { ...p.drafts }; delete drafts.new; return { sel: c.id, drafts, rowNew: c.id, savedJust: c.id, savedText: 'Created just now', added: null, flip: !p.flip } })
    } catch (err) {
      set((p) => ({ errs: { ...p.errs, new: { code: err.message } } }))
    }
  }
  const cancel = (id) => {
    if (id === 'new') { go(s.back || courses[0].id); return }
    if (same(draftOf(s, id), saved(id)) && !(s.errs[id] && (s.errs[id].code || s.errs[id].name))) return
    set((p) => { const drafts = { ...p.drafts }; delete drafts[id]; return { drafts, errs: { ...p.errs, [id]: {} }, added: null, again: p.again + 1 } })
  }
  function face(id, frozen) {
    const isNew = id === 'new'
    const sv = saved(id)
    const d = draftOf(s, id)
    const dirty = !isNew && !same(d, sv)
    const pick = s.picks[id] || ''
    const err = s.errs[id] || {}
    const label = isNew ? (d.code.trim() || 'this course') : sv.code
    const lects = d.lects.map((lid) => ({
      key: lid, name: person(lid)?.fullName ?? lid, email: person(lid)?.email ?? '',
      cls: s.removing === lid && s.sel === id && !frozen ? 'ac-out' : (s.added === lid && !frozen ? 'a-rise' : ''),
      just: s.added === lid && !frozen,
      aria: `Remove ${person(lid)?.fullName ?? lid} from ${label}`,
      remove: () => remove(id, lid),
    }))
    const n = lects.length
    return {
      key: id, isNew,
      cls: '', hidden: false, pos: 'relative', off: '0', pe: 'auto',
      heading: isNew ? 'New course' : `Edit ${sv.code}`,
      hasSub: !isNew, sub: isNew ? '' : `${sv.sessions} ${sv.sessions === 1 ? 'exam session' : 'exam sessions'} in this course`,
      bodyCls: !frozen && s.again ? (s.again % 2 ? 'ac-again-a' : 'ac-again-b') : '',
      code: d.code, name: d.name,
      setCode: (e) => edit(id, { code: e.target.value.toUpperCase().replace(/\s+/g, '') }),
      setName: (e) => edit(id, { name: e.target.value }),
      codeBad: !!err.code, codeErr: err.code || '', nameBad: !!err.name, nameErr: err.name || '',
      lects, has: (lid) => d.lects.includes(lid), none: n === 0, hasAny: n > 0,
      count: n === 0 ? '' : String(n), countCls: !frozen && s.added ? (s.flip ? 'a-tick-a' : 'a-tick-b') : '',
      noneText: isNew ? 'No lecturer yet. You can assign one now or later.' : `No lecturer is assigned, so nobody can set up exam sessions for ${sv.code}.`,
      noneInk: isNew ? 'var(--ink-3)' : 'var(--red-ink)', noneW: isNew ? 400 : 500, noneWarn: !isNew,
      assignLabel: n ? 'Assign another lecturer' : 'Assign a lecturer',
      pick, setPick: (e) => set((p) => ({ picks: { ...p.picks, [id]: e.target.value } })),
      assign: () => assign(id), assignDis: pick ? 'false' : 'true',
      primaryLabel: isNew ? 'Create course' : (s.saving ? 'Saving…' : 'Save changes'),
      labelCls: '',
      saving: !isNew && s.saving,
      primary: () => (isNew ? create() : save(id)),
      primaryDis: isNew ? 'false' : (!dirty || s.saving ? 'true' : 'false'),
      cancel: () => cancel(id), cancelDis: isNew ? 'false' : (dirty ? 'false' : 'true'),
      dirty: dirty && !s.saving,
      savedJust: !dirty && !s.saving && s.savedJust === id, savedText: s.savedText,
    }
  }
  const tick = s.flip ? 'a-tick-a' : 'a-tick-b'
  const rows = courses.map((c) => {
    const just = s.savedJust === c.id
    const names = c.lecturerIds.map((lid) => person(lid)?.fullName ?? lid)
    return {
      id: c.id, code: c.code, name: c.name,
      lectText: names.join(', '), has: names.length > 0, none: names.length === 0,
      sessions: c.sessions, sessWord: c.sessions === 1 ? 'session' : 'sessions',
      pressed: s.sel === c.id ? 'true' : 'false', nameW: s.sel === c.id ? 600 : 500,
      pick: () => go(c.id),
      liCls: s.rowNew === c.id ? 'a-rise' : '',
      just, justText: s.savedText === 'Created just now' ? 'created just now' : 'just now',
      tickCls: just ? tick : '',
    }
  })
  const idx = s.sel === 'new' ? courses.length : Math.max(0, courses.findIndex((c) => c.id === s.sel))
  const cur = face(s.sel, false)
  let faces = [cur]
  if (s.turning && s.out) faces = [{ ...s.out, cls: 'a-turn-out-s', hidden: true, pos: 'absolute', off: '10px', pe: 'none' }, { ...cur, cls: 'a-turn-in-s' }]
  const nd = draftOf(s, 'new')
  const missingN = courses.filter((c) => c.lecturerIds.length === 0).length
  const v = {
    total: courses.length, totalWord: courses.length === 1 ? 'course' : 'courses',
    missing: missingN > 0, missingN, allSet: missingN === 0,
    sumCls: s.savedJust ? tick : '',
    rows, faces, lecturers,
    hlY: `${idx * 100}%`, hlOp: 1,
    ghost: s.sel === 'new',
    ghostName: s.sel === 'new' && nd.name.trim() ? nd.name.trim() : 'New course',
    ghostLects: nd.lects.length ? nd.lects.map((lid) => person(lid)?.fullName ?? lid).join(', ') : 'None yet',
    panelLabel: cur.heading,
    newCourse: () => go('new'),
    newDis: s.sel === 'new' ? 'true' : 'false',
  }
  return (
    <div className="pg-admincourses" style={{ minHeight: "100vh", display: "flex", flexDirection: "column" }}>
      <StaffTopBar current="courses" />
      <main className="a-gutter" style={{ flex: "1", width: "100%", maxWidth: "1280px", margin: "0 auto", padding: "56px 40px 80px", display: "flex", flexDirection: "column", gap: "40px" }}>
        <div className="a-stack-sm a-rise" style={{ display: "flex", alignItems: "flex-end", justifyContent: "space-between", gap: "24px" }}>
          <div style={{ display: "flex", flexDirection: "column", gap: "10px", minWidth: "0" }}>
            <h1 className="a-title" style={{ fontFamily: "Alegreya, Georgia, serif", fontWeight: "500", fontSize: "44px", lineHeight: "1.08", letterSpacing: "-0.012em", color: "var(--night-indigo)" }}>
              Courses
            </h1>
            <p style={{ fontSize: "16.5px", color: "var(--ink-2)" }}>
              Lecturers can open only the courses they are assigned to.
            </p>
          </div>
          <button type="button" className="a-btn a-btn-secondary" onClick={v.newCourse} aria-disabled={v.newDis} style={{ flex: "none", height: "44px", padding: "0 18px", borderRadius: "12px", border: "1px solid var(--edge)", background: "rgba(255,255,255,0.6)", fontSize: "15px", fontWeight: "500", color: "var(--night-indigo)", display: "inline-flex", alignItems: "center", justifyContent: "center", gap: "10px" }}>
            <svg width="18" height="18" viewBox="0 0 24 24" aria-hidden="true" style={{ fill: "none", stroke: "currentColor", strokeWidth: "1.75", strokeLinecap: "round" }}>
              <path d="M12 5v14M5 12h14" />
            </svg>
            New course
          </button>
        </div>
        <div className="a-grid-1-sm" style={{ display: "grid", gridTemplateColumns: "minmax(0, 1fr) 380px", columnGap: "56px", rowGap: "48px", alignItems: "start" }}>
          <section aria-labelledby="list-h" className="a-rise" style={{ animationDelay: "60ms", minWidth: "0", display: "flex", flexDirection: "column", gap: "10px" }}>
            <h2 id="list-h" style={{ position: "absolute", width: "1px", height: "1px", overflow: "hidden", clip: "rect(0 0 0 0)", whiteSpace: "nowrap" }}>
              All courses
            </h2>
            <div className="a-hide-sm" aria-hidden="true" style={{ display: "grid", gridTemplateColumns: "minmax(0, 1fr) 230px 92px 20px", columnGap: "16px", padding: "0 20px 12px", boxShadow: "inset 0 -1px 0 var(--line-strong)", fontSize: "13.5px", fontWeight: "500", color: "var(--ink-3)" }}>
              <span>
                Course
              </span>
              <span>
                Lecturers
              </span>
              <span style={{ textAlign: "right" }}>
                Sessions
              </span>
              <span />
            </div>
            <div style={{ position: "relative" }}>
              <div className="ac-hl" aria-hidden="true" style={{ position: "absolute", top: "0", left: "0", right: "0", height: "88px", borderRadius: "14px", background: "rgba(123,196,196,0.16)", transform: `translateY(${v.hlY})`, opacity: v.hlOp }} />
              <ul style={{ position: "relative", display: "flex", flexDirection: "column" }}>
                {v.rows.map((c, c_i) => (
                  <Fragment key={c.key ?? c_i}>
                    <li className={c.liCls}>
                      <a href="#course-panel" className="ac-row" aria-current={c.pressed} onClick={c.pick} style={{ width: "100%", height: "88px", display: "grid", gridTemplateColumns: "minmax(0, 1fr) 230px 92px 20px", columnGap: "16px", alignItems: "center", padding: "0 20px", border: "0", borderRadius: "14px", background: "transparent", textAlign: "left", color: "var(--night-indigo)" }}>
                        <span style={{ display: "flex", flexDirection: "column", gap: "3px", minWidth: "0" }}>
                          <span style={{ fontSize: "15.5px", lineHeight: "1.35", fontWeight: c.nameW, color: "var(--night-indigo)" }}>
                            {c.name}
                          </span>
                          <span style={{ fontSize: "13.5px", lineHeight: "1.4", fontWeight: "500", color: "var(--jade-ink)" }}>
                            {c.code}
                          </span>
                        </span>
                        <span className="ac-lect" style={{ display: "flex", flexDirection: "column", alignItems: "flex-start", gap: "2px", minWidth: "0", fontSize: "14.5px", lineHeight: "1.4", color: "var(--ink-2)" }}>
                          {c.has && (
                            <>
                              <span className={c.tickCls}>
                                {c.lectText}
                              </span>
                            </>
                          )}
                          {c.none && (
                            <>
                              <span style={{ display: "inline-flex", alignItems: "center", gap: "8px", fontWeight: "500", color: "var(--red-ink)" }}>
                                <svg width="16" height="16" viewBox="0 0 24 24" aria-hidden="true" style={{ flex: "none", fill: "none", stroke: "currentColor", strokeWidth: "1.75", strokeLinecap: "round", strokeLinejoin: "round" }}>
                                  <path d="M12 4 21 19.5H3z" />
                                  <path d="M12 10v4.5" />
                                  <path d="M12 17.2v.01" />
                                </svg>
                                <span className={c.tickCls}>
                                  No lecturer yet
                                </span>
                              </span>
                            </>
                          )}
                          {c.just && (
                            <>
                              <span className="a-just" style={{ display: "inline-flex", alignItems: "center", gap: "6px", fontSize: "12.5px", fontWeight: "400", color: "var(--jade-ink)" }}>
                                <span aria-hidden="true" style={{ width: "6px", height: "6px", borderRadius: "50%", background: "var(--jade-ink)" }} />
                                {c.justText}
                              </span>
                            </>
                          )}
                        </span>
                        <span className="ac-sess a-num" style={{ justifySelf: "end", display: "inline-flex", alignItems: "baseline", gap: "6px", whiteSpace: "nowrap" }}>
                          <span style={{ fontSize: "20px", fontWeight: "300", lineHeight: "1.2", color: "var(--night-indigo)" }}>
                            {c.sessions}
                          </span>
                          <span style={{ fontSize: "13.5px", color: "var(--ink-3)" }}>
                            {c.sessWord}
                          </span>
                        </span>
                        <svg className="ac-chev" width="18" height="18" viewBox="0 0 24 24" aria-hidden="true" style={{ justifySelf: "end", opacity: "0", transform: "translateX(-6px)", fill: "none", stroke: "var(--night-indigo)", strokeWidth: "1.75", strokeLinecap: "round", strokeLinejoin: "round" }}>
                          <path d="m9 6 6 6-6 6" />
                        </svg>
                      </a>
                    </li>
                  </Fragment>
                ))}
                {v.ghost && (
                  <>
                    <li className="a-rise">
                      <div className="ac-row" style={{ cursor: "default", height: "88px", display: "grid", gridTemplateColumns: "minmax(0, 1fr) 230px 92px 20px", columnGap: "16px", alignItems: "center", padding: "0 20px", borderRadius: "14px" }}>
                        <span style={{ display: "flex", flexDirection: "column", gap: "3px", minWidth: "0" }}>
                          <span style={{ fontSize: "15.5px", lineHeight: "1.35", fontWeight: "500", color: "var(--night-indigo)" }}>
                            {v.ghostName}
                          </span>
                          <span style={{ display: "inline-flex", alignItems: "center", gap: "8px", fontSize: "13.5px", lineHeight: "1.4", color: "var(--ink-3)" }}>
                            <svg width="14" height="14" viewBox="0 0 16 16" aria-hidden="true" style={{ flex: "none" }}>
                              <circle cx="8" cy="8" r="6.25" style={{ fill: "none", stroke: "var(--ink-3)", strokeWidth: "1.5", strokeDasharray: "2.45 2.45" }} />
                            </svg>
                            Not created yet
                          </span>
                        </span>
                        <span className="ac-lect" style={{ fontSize: "14.5px", lineHeight: "1.4", color: "var(--ink-3)" }}>
                          {v.ghostLects}
                        </span>
                        <span className="ac-sess a-num" style={{ justifySelf: "end", fontSize: "20px", fontWeight: "300", lineHeight: "1.2", color: "var(--ink-3)" }}>
                          –
                        </span>
                        <span />
                      </div>
                    </li>
                  </>
                )}
              </ul>
            </div>
            <p aria-live="polite" style={{ display: "flex", flexWrap: "wrap", alignItems: "center", columnGap: "6px", rowGap: "4px", marginTop: "14px", padding: "0 20px", fontSize: "14px", color: "var(--ink-3)" }}>
              <svg width="16" height="16" viewBox="0 0 24 24" aria-hidden="true" style={{ flex: "none", fill: "none", stroke: "currentColor", strokeWidth: "1.75", strokeLinecap: "round", strokeLinejoin: "round" }}>
                <path d="M4 5.5A1.5 1.5 0 0 1 5.5 4H20v14H5.5A1.5 1.5 0 0 0 4 19.5z" />
                <path d="M4 19.5A1.5 1.5 0 0 0 5.5 21H20v-3" />
              </svg>
              <span>
                <span className={`a-num ${v.sumCls}`} style={{ fontWeight: "500", color: "var(--night-indigo)" }}>
                  {v.total}
                </span>
                {' '}{v.totalWord}
              </span>
              {v.missing && (
                <>
                  <span className="a-rise" style={{ fontWeight: "500", color: "var(--night-indigo)" }}>
                    ·{' '}
                    <span className={`a-num ${v.sumCls}`}>
                      {v.missingN}
                    </span>
                    {' '}without a lecturer
                  </span>
                </>
              )}
              {v.allSet && (
                <>
                  <span className="a-rise" style={{ color: "var(--jade-ink)" }}>
                    · every course has a lecturer
                  </span>
                </>
              )}
            </p>
          </section>
          <section id="course-panel" className="ac-panel a-rise" aria-label={v.panelLabel} style={{ animationDelay: "120ms", minWidth: "0", paddingLeft: "40px", borderLeft: "1px solid var(--line)" }}>
            <div className="a-turn-stage" style={{ position: "relative", margin: "-10px", padding: "10px" }}>
              {v.faces.map((f, f_i) => (
                <Fragment key={f.key ?? f_i}>
                  <div className={f.cls} aria-hidden={f.hidden} style={{ position: f.pos, top: f.off, left: f.off, right: f.off, pointerEvents: f.pe, display: "flex", flexDirection: "column", gap: "32px" }}>
                    <div style={{ display: "flex", flexDirection: "column", gap: "6px" }}>
                      <h2 style={{ marginTop: "-4px", fontSize: "24px", lineHeight: "1.3", fontWeight: "500", letterSpacing: "-0.005em", color: "var(--night-indigo)", overflowWrap: "anywhere" }}>
                        {f.heading}
                      </h2>
                      {f.hasSub && (
                        <>
                          <p style={{ fontSize: "14.5px", color: "var(--ink-3)" }}>
                            {f.sub}
                          </p>
                        </>
                      )}
                    </div>
                    <div className={f.bodyCls} style={{ display: "flex", flexDirection: "column", gap: "32px" }}>
                      <div style={{ display: "flex", flexDirection: "column", gap: "20px" }}>
                        <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
                          <label htmlFor={`code-${f.key}`} style={{ fontSize: "14px", fontWeight: "500", color: "var(--night-indigo)" }}>
                            Course code
                          </label>
                          <input id={`code-${f.key}`} type="text" className="a-field" value={f.code} onChange={f.setCode} placeholder="SWR302" autoComplete="off" spellCheck="false" aria-invalid={f.codeBad} aria-describedby={`code-err-${f.key}`} style={{ width: "180px", maxWidth: "100%", height: "44px", padding: "0 14px", borderRadius: "10px", border: "1px solid var(--edge)", background: "var(--field-white)", fontSize: "15px", fontWeight: "500", letterSpacing: "0.02em", color: "var(--night-indigo)" }} />
                          {f.codeBad && (
                            <>
                              <p id={`code-err-${f.key}`} className="a-rise" role="alert" style={{ display: "flex", alignItems: "center", gap: "8px", fontSize: "13.5px", color: "var(--red-ink)" }}>
                                <svg width="18" height="18" viewBox="0 0 24 24" aria-hidden="true" style={{ flex: "none", fill: "none", stroke: "currentColor", strokeWidth: "1.75", strokeLinecap: "round", strokeLinejoin: "round" }}>
                                  <path d="M12 4 21 19.5H3z" />
                                  <path d="M12 10v4.5" />
                                  <path d="M12 17.2v.01" />
                                </svg>
                                {f.codeErr}
                              </p>
                            </>
                          )}
                        </div>
                        <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
                          <label htmlFor={`name-${f.key}`} style={{ fontSize: "14px", fontWeight: "500", color: "var(--night-indigo)" }}>
                            Course name
                          </label>
                          <input id={`name-${f.key}`} type="text" className="a-field" value={f.name} onChange={f.setName} placeholder="Software Requirements" autoComplete="off" aria-invalid={f.nameBad} aria-describedby={`name-err-${f.key}`} style={{ width: "100%", height: "44px", padding: "0 14px", borderRadius: "10px", border: "1px solid var(--edge)", background: "var(--field-white)", fontSize: "15px", color: "var(--night-indigo)" }} />
                          {f.nameBad && (
                            <>
                              <p id={`name-err-${f.key}`} className="a-rise" role="alert" style={{ display: "flex", alignItems: "center", gap: "8px", fontSize: "13.5px", color: "var(--red-ink)" }}>
                                <svg width="18" height="18" viewBox="0 0 24 24" aria-hidden="true" style={{ flex: "none", fill: "none", stroke: "currentColor", strokeWidth: "1.75", strokeLinecap: "round", strokeLinejoin: "round" }}>
                                  <path d="M12 4 21 19.5H3z" />
                                  <path d="M12 10v4.5" />
                                  <path d="M12 17.2v.01" />
                                </svg>
                                {f.nameErr}
                              </p>
                            </>
                          )}
                        </div>
                      </div>
                      <div role="group" aria-labelledby={`lect-h-${f.key}`} style={{ display: "flex", flexDirection: "column", gap: "14px" }}>
                        <h3 id={`lect-h-${f.key}`} style={{ display: "flex", alignItems: "baseline", gap: "10px", fontSize: "14px", fontWeight: "500", color: "var(--night-indigo)" }}>
                          Assigned lecturers
                          <span className={`a-num ${f.countCls}`} style={{ fontSize: "13.5px", fontWeight: "400", color: "var(--ink-3)" }}>
                            {f.count}
                          </span>
                        </h3>
                        {f.hasAny && (
                          <>
                            <ul style={{ display: "flex", flexDirection: "column", boxShadow: "inset 0 1px 0 var(--line)" }}>
                              {f.lects.map((l, l_i) => (
                                <Fragment key={l.key ?? l_i}>
                                  <li className={l.cls} style={{ display: "flex", alignItems: "center", gap: "12px", padding: "12px 0", boxShadow: "inset 0 -1px 0 var(--line)" }}>
                                    <span style={{ flex: "1", minWidth: "0", display: "flex", flexDirection: "column", gap: "2px" }}>
                                      <span style={{ display: "flex", flexWrap: "wrap", alignItems: "center", columnGap: "12px", fontSize: "15.5px", lineHeight: "1.35", fontWeight: "500", color: "var(--night-indigo)" }}>
                                        {l.name}
                                        {l.just && (
                                          <>
                                            <span className="a-just" style={{ display: "inline-flex", alignItems: "center", gap: "6px", fontSize: "12.5px", fontWeight: "400", color: "var(--jade-ink)", whiteSpace: "nowrap" }}>
                                              <span aria-hidden="true" style={{ width: "6px", height: "6px", borderRadius: "50%", background: "var(--jade-ink)" }} />
                                              just now
                                            </span>
                                          </>
                                        )}
                                      </span>
                                      <span style={{ fontSize: "13.5px", lineHeight: "1.4", color: "var(--ink-3)", overflowWrap: "anywhere" }}>
                                        {l.email}
                                      </span>
                                    </span>
                                    <button type="button" className="a-btn a-btn-danger" onClick={l.remove} aria-label={l.aria} style={{ flex: "none", height: "36px", padding: "0 14px", borderRadius: "10px", border: "1px solid var(--red-ink)", background: "transparent", fontSize: "14px", fontWeight: "500", color: "var(--red-ink)" }}>
                                      Remove
                                    </button>
                                  </li>
                                </Fragment>
                              ))}
                            </ul>
                          </>
                        )}
                        {f.none && (
                          <>
                            <p className="a-rise" style={{ display: "flex", alignItems: "flex-start", gap: "8px", padding: "14px 0", boxShadow: "inset 0 1px 0 var(--line), inset 0 -1px 0 var(--line)", fontSize: "14.5px", lineHeight: "1.5", fontWeight: f.noneW, color: f.noneInk }}>
                              {f.noneWarn && (
                                <>
                                  <svg width="16" height="16" viewBox="0 0 24 24" aria-hidden="true" style={{ flex: "none", marginTop: "3px", fill: "none", stroke: "currentColor", strokeWidth: "1.75", strokeLinecap: "round", strokeLinejoin: "round" }}>
                                    <path d="M12 4 21 19.5H3z" />
                                    <path d="M12 10v4.5" />
                                    <path d="M12 17.2v.01" />
                                  </svg>
                                </>
                              )}
                              {f.noneText}
                            </p>
                          </>
                        )}
                        <div style={{ display: "flex", flexDirection: "column", gap: "8px", marginTop: "6px" }}>
                          <label htmlFor={`assign-${f.key}`} style={{ fontSize: "14px", fontWeight: "500", color: "var(--night-indigo)" }}>
                            {f.assignLabel}
                          </label>
                          <div style={{ display: "flex", gap: "10px" }}>
                            <div style={{ position: "relative", flex: "1", minWidth: "0" }}>
                              <select id={`assign-${f.key}`} className="a-field" value={f.pick} onChange={f.setPick} style={{ width: "100%", height: "44px", padding: "0 40px 0 14px", borderRadius: "10px", border: "1px solid var(--edge)", background: "var(--field-white)", fontSize: "15px", color: "var(--night-indigo)" }}>
                                <option value="">
                                  Choose a lecturer
                                </option>
                                {v.lecturers.map((l) => <option key={l.id} value={l.id} disabled={f.has(l.id)}>{l.fullName}</option>)}
                              </select>
                              <svg width="16" height="16" viewBox="0 0 24 24" aria-hidden="true" style={{ position: "absolute", right: "14px", top: "14px", pointerEvents: "none", fill: "none", stroke: "var(--ink-2)", strokeWidth: "2", strokeLinecap: "round", strokeLinejoin: "round" }}>
                                <path d="m6 9 6 6 6-6" />
                              </svg>
                            </div>
                            <button type="button" className="a-btn a-btn-secondary" onClick={f.assign} aria-disabled={f.assignDis} style={{ flex: "none", height: "44px", padding: "0 18px", borderRadius: "12px", border: "1px solid var(--edge)", background: "rgba(255,255,255,0.6)", fontSize: "15px", fontWeight: "500", color: "var(--night-indigo)" }}>
                              Assign
                            </button>
                          </div>
                        </div>
                      </div>
                    </div>
                    <div style={{ display: "flex", flexWrap: "wrap", alignItems: "center", gap: "12px 8px", paddingTop: "24px", borderTop: "1px solid var(--line)" }}>
                      <button type="button" className="a-btn a-btn-primary" onClick={f.primary} aria-disabled={f.primaryDis} style={{ height: "44px", padding: "0 20px", border: "0", borderRadius: "12px", background: "var(--night-indigo)", color: "var(--ivory)", fontSize: "15px", fontWeight: "500", boxShadow: "0 8px 18px -10px rgba(15,22,48,0.55)", display: "inline-flex", alignItems: "center", gap: "10px" }}>
                        {f.saving && (
                          <>
                            <svg width="16" height="16" viewBox="0 0 16 16" aria-hidden="true" style={{ flex: "none" }}>
                              <circle cx="8" cy="8" r="6.25" style={{ fill: "none", stroke: "var(--ivory)", strokeWidth: "1.5" }} />
                              <path className="a-rec" d="M8 1.75a6.25 6.25 0 0 1 0 12.5a2.6 6.25 0 0 0 0-12.5z" style={{ fill: "var(--ivory)" }} />
                            </svg>
                          </>
                        )}
                        <span className={f.labelCls}>
                          {f.primaryLabel}
                        </span>
                      </button>
                      <button type="button" className="a-btn a-btn-quiet" onClick={f.cancel} aria-disabled={f.cancelDis} style={{ height: "44px", padding: "0 14px", border: "0", borderRadius: "10px", background: "transparent", fontSize: "15px", fontWeight: "500", color: "var(--ink-2)" }}>
                        Cancel
                      </button>
                      <p aria-live="polite" style={{ flexBasis: "100%", minHeight: "20px", display: "flex", alignItems: "center", fontSize: "13.5px" }}>
                        {f.dirty && (
                          <>
                            <span className="a-rise" style={{ display: "inline-flex", alignItems: "center", gap: "8px", color: "var(--ink-3)" }}>
                              <svg width="14" height="14" viewBox="0 0 16 16" aria-hidden="true" style={{ flex: "none" }}>
                                <circle cx="8" cy="8" r="6.25" style={{ fill: "none", stroke: "var(--ink-3)", strokeWidth: "1.5", strokeDasharray: "2.45 2.45" }} />
                              </svg>
                              Unsaved changes
                            </span>
                          </>
                        )}
                        {f.savedJust && (
                          <>
                            <span className="a-just" style={{ display: "inline-flex", alignItems: "center", gap: "8px", color: "var(--jade-ink)" }}>
                              <svg width="14" height="14" viewBox="0 0 16 16" aria-hidden="true" style={{ flex: "none" }}>
                                <circle cx="8" cy="8" r="6.25" style={{ fill: "none", stroke: "var(--night-indigo)", strokeWidth: "1.5" }} />
                                <circle className="a-moon-fill" cx="8" cy="8" r="6.25" style={{ fill: "var(--night-indigo)" }} />
                              </svg>
                              {f.savedText}
                            </span>
                          </>
                        )}
                      </p>
                    </div>
                  </div>
                </Fragment>
              ))}
            </div>
          </section>
        </div>
        <SampleNote style={{ marginTop: '24px', paddingTop: '0', fontSize: '13px', color: 'var(--ink-3)' }}>All names, courses and counts on this page are sample data.</SampleNote>
      </main>
    </div>
  )
}
