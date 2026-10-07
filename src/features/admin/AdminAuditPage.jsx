import { Fragment, useEffect } from 'react'
import { Link } from 'react-router-dom'
import { paths } from '../../app/routes/paths.js'
import { adminApi } from '../../api/services.js'
import { SampleNote } from '../../components/SampleNote.jsx'
import { StaffTopBar } from '../../components/TopBar.jsx'
import { useLoad } from '../../hooks/useLoad.js'
import { useMergeState } from '../../hooks/useMergeState.js'
import { useTimeouts } from '../../hooks/useTimeouts.js'
import { formatDay, formatLongDay, formatTime, pad2 } from '../../utils/format.js'
import './AdminAudit.css'

const POLL_MS = 8000
const HREF = { user: paths.adminUsers, course: paths.adminCourses, ai: paths.adminAi }
const isoDay = (d) => { const x = new Date(d); return `${x.getFullYear()}-${pad2(x.getMonth() + 1)}-${pad2(x.getDate())}` }
const daysAgo = (n) => { const d = new Date(); d.setDate(d.getDate() - n); return isoDay(d) }
const DEF = { from: daysAgo(8), to: isoDay(new Date()), who: 'all', act: 'all' }

// Important administrative actions, newest first; read again every few seconds (F7)
export default function AdminAuditPage() {
  const { data } = useLoad(() => adminApi.auditLog(), [], { pollMs: POLL_MS })
  const { later, clear } = useTimeouts()
  const [s, set] = useMergeState({ ...DEF, shown: null, pendingList: [], fresh: [], paused: false, toggled: false, flip: false, turning: false, outGroups: [], outH: 0 })

  // entries that arrive after the first read slide in; while paused they wait behind "Show it"
  useEffect(() => {
    if (!data) return
    set((p) => {
      if (!p.shown) return { shown: data }
      const known = new Set(p.shown.map((e) => e.id))
      const added = data.filter((e) => !known.has(e.id))
      if (!added.length) return {}
      if (p.paused) return { pendingList: added }
      return { shown: data, fresh: added.map((e) => e.id), flip: !p.flip }
    })
  }, [data, set])
  useEffect(() => {
    if (!s.fresh.length) return undefined
    const t = setTimeout(() => set({ fresh: [] }), 2800)
    return () => clearTimeout(t)
  }, [s.fresh, set])

  const all = s.shown ?? []
  const f = { from: s.from, to: s.to, who: s.who, act: s.act }
  const match = (ff) => all.filter((e) => {
    const day = isoDay(e.at)
    return day >= (ff.from || '') && day <= (ff.to || '9999-12-31') && (ff.who === 'all' || e.actor === ff.who) && (ff.act === 'all' || e.cat === ff.act)
  })
  const groups = (list, frozen) => {
    const out = []
    list.forEach((e) => {
      const key = isoDay(e.at)
      let g = out[out.length - 1]
      if (!g || g.key !== key) {
        const label = formatDay(e.at)
        g = { key, day: label, sub: label === 'Today' || label === 'Yesterday' ? formatLongDay(e.at).replace(/ \d{4}$/, '') : '', entries: [] }
        out.push(g)
      }
      const isNew = s.fresh.includes(e.id)
      g.entries.push({
        key: e.id, time: formatTime(e.at), action: e.action, details: e.details, target: e.target, who: e.actor,
        href: HREF[e.kind] ?? paths.adminAudit, isUser: e.kind === 'user', isCourse: e.kind === 'course', isAi: e.kind === 'ai',
        actionInk: 'var(--night-indigo)',
        rule: g.entries.length ? 'inset 0 1px 0 var(--line)' : 'none',
        wrapCls: !frozen && isNew ? 'au-arrive' : '',
        isNew,
      })
    })
    return out
  }
  const height = (gs) => {
    const phone = typeof window !== 'undefined' && window.innerWidth <= 760
    return gs.reduce((a, g) => a + (phone ? 46 : 0) + g.entries.length * (phone ? 132 : 82), 0)
  }
  const change = (patch) => {
    const before = groups(match(f), true)
    clear()
    set({ turning: true, outGroups: before, outH: height(before), ...patch })
    later(() => set({ turning: false, outGroups: [] }), 620)
  }
  const showNew = () => set((p) => ({ shown: data, fresh: p.pendingList.map((e) => e.id), pendingList: [], flip: !p.flip }))
  const list = match(f)
  const total = all.length
  const active = f.from !== DEF.from || f.to !== DEF.to || f.who !== DEF.who || f.act !== DEF.act
  const bad = !!(f.from && f.to && f.from > f.to)
  const paused = s.paused
  const nPending = s.pendingList.length
  const v = {
    dateType: 'date', from: f.from, to: f.to, who: f.who, act: f.act,
    actors: [...new Set(all.map((e) => e.actor))],
    setFrom: (e) => change({ from: e.target.value }),
    setTo: (e) => change({ to: e.target.value }),
    setWho: (e) => change({ who: e.target.value }),
    setAct: (e) => change({ act: e.target.value }),
    clear: () => { if (active) change({ ...DEF }) },
    clearDisabled: active ? 'false' : 'true',
    rangeBad: bad ? 'true' : 'false', rangeBadFlag: bad,
    countText: active ? `${list.length} of ${total} entries` : `${total} entries`,
    countCls: s.fresh.length ? (s.flip ? 'a-tick-a' : 'a-tick-b') : '',
    isLive: !paused, isPaused: paused,
    liveText: paused ? 'Updates paused' : 'Updating live',
    liveInk: paused ? 'var(--ink-2)' : 'var(--red-ink)', liveWeight: paused ? 400 : 500,
    liveCls: s.toggled ? (paused ? 'a-tick-a' : 'a-tick-b') : '',
    pausedAria: paused ? 'true' : 'false',
    pauseLabel: paused ? 'Resume updates' : 'Pause updates',
    togglePause: () => {
      if (paused) { set({ paused: false, toggled: true }); if (nPending) showNew() }
      else set({ paused: true, toggled: true })
    },
    pending: nPending > 0,
    pendingText: `${nPending} new ${nPending === 1 ? 'entry' : 'entries'} arrived while updates were paused.`,
    showNew,
    groups: groups(list, false), outGroups: s.turning ? s.outGroups : [],
    turning: s.turning,
    inCls: s.turning ? 'a-turn-in-s' : '',
    stageMin: s.turning ? `${s.outH}px` : '0px',
    stageTr: s.turning ? 'none' : 'min-height .6s cubic-bezier(0.25,1,0.5,1)',
    empty: !!s.shown && list.length === 0,
    colsDisplay: list.length ? 'grid' : 'none',
  }
  return (
    <div className="pg-adminaudit" style={{ minHeight: "100vh", display: "flex", flexDirection: "column" }}>
      <StaffTopBar current="audit" />
      <main className="a-gutter" style={{ flex: "1", width: "100%", maxWidth: "1280px", margin: "0 auto", padding: "56px 40px 80px", display: "flex", flexDirection: "column", gap: "28px" }}>
        <div className="a-rise a-stack-sm" style={{ display: "flex", alignItems: "flex-end", justifyContent: "space-between", gap: "24px" }}>
          <div style={{ display: "flex", flexDirection: "column", gap: "10px" }}>
            <h1 className="a-title" style={{ fontFamily: "Alegreya, Georgia, serif", fontWeight: "500", fontSize: "44px", lineHeight: "1.08", letterSpacing: "-0.012em", color: "var(--night-indigo)" }}>
              Audit log
            </h1>
            <p style={{ fontSize: "16.5px", color: "var(--ink-2)" }}>
              Important administrative actions, newest first.
            </p>
          </div>
          <div className="a-wrap-sm" style={{ display: "flex", alignItems: "center", gap: "18px" }}>
            <p aria-live="polite" style={{ display: "inline-flex", alignItems: "center", gap: "9px", fontSize: "14.5px", lineHeight: "1.35", fontWeight: v.liveWeight, color: v.liveInk, whiteSpace: "nowrap" }}>
              {v.isLive && (
                <>
                  <svg width="14" height="14" viewBox="0 0 16 16" aria-hidden="true" className="a-pop" style={{ flex: "none" }}>
                    <circle cx="8" cy="8" r="6.25" style={{ fill: "none", stroke: "var(--lantern-red)", strokeWidth: "1.5" }} />
                    <path className="a-rec" d="M8 1.75a6.25 6.25 0 0 1 0 12.5a2.6 6.25 0 0 0 0-12.5z" style={{ fill: "var(--lantern-red)" }} />
                  </svg>
                </>
              )}
              {v.isPaused && (
                <>
                  <svg width="14" height="14" viewBox="0 0 16 16" aria-hidden="true" className="a-pop" style={{ flex: "none" }}>
                    <circle cx="8" cy="8" r="6.25" style={{ fill: "none", stroke: "var(--ink-2)", strokeWidth: "1.5" }} />
                  </svg>
                </>
              )}
              <span className={v.liveCls}>
                {v.liveText}
              </span>
            </p>
            <button type="button" className="a-btn a-btn-secondary" aria-pressed={v.pausedAria} onClick={v.togglePause} style={{ height: "36px", padding: "0 14px", borderRadius: "10px", border: "1px solid var(--edge)", background: "rgba(255,255,255,0.6)", fontSize: "14px", fontWeight: "500", color: "var(--night-indigo)", display: "inline-flex", alignItems: "center", gap: "8px", whiteSpace: "nowrap" }}>
              {v.isLive && (
                <>
                  <svg width="16" height="16" viewBox="0 0 24 24" aria-hidden="true" style={{ flex: "none", fill: "none", stroke: "currentColor", strokeWidth: "1.75", strokeLinecap: "round", strokeLinejoin: "round" }}>
                    <path d="M9 5v14" />
                    <path d="M15 5v14" />
                  </svg>
                </>
              )}
              {v.isPaused && (
                <>
                  <svg width="16" height="16" viewBox="0 0 24 24" aria-hidden="true" style={{ flex: "none", fill: "none", stroke: "currentColor", strokeWidth: "1.75", strokeLinecap: "round", strokeLinejoin: "round" }}>
                    <path d="M7 4.5v15l12-7.5z" />
                  </svg>
                </>
              )}
              {v.pauseLabel}
            </button>
          </div>
        </div>
        <div className="a-rise" style={{ animationDelay: "60ms", display: "flex", flexDirection: "column", gap: "12px", marginTop: "12px" }}>
          <div className="a-wrap-sm" style={{ display: "flex", alignItems: "flex-end", gap: "16px" }}>
            <div className="a-full-sm" style={{ display: "flex", gap: "16px" }}>
              <div className="au-half" style={{ display: "flex", flexDirection: "column", gap: "8px", width: "180px" }}>
                <label htmlFor="f-from" style={{ fontSize: "14px", fontWeight: "500", color: "var(--night-indigo)" }}>
                  From
                </label>
                <input id="f-from" lang="en-GB" type={v.dateType} className="a-field" value={v.from} onChange={v.setFrom} style={{ width: "100%", height: "44px", padding: "0 12px 0 14px", borderRadius: "10px", border: "1px solid var(--edge)", background: "var(--field-white)", fontSize: "15px", color: "var(--night-indigo)" }} />
              </div>
              <div className="au-half" style={{ display: "flex", flexDirection: "column", gap: "8px", width: "180px" }}>
                <label htmlFor="f-to" style={{ fontSize: "14px", fontWeight: "500", color: "var(--night-indigo)" }}>
                  To
                </label>
                <input id="f-to" lang="en-GB" type={v.dateType} className="a-field" value={v.to} onChange={v.setTo} aria-invalid={v.rangeBad} aria-describedby="range-err" style={{ width: "100%", height: "44px", padding: "0 12px 0 14px", borderRadius: "10px", border: "1px solid var(--edge)", background: "var(--field-white)", fontSize: "15px", color: "var(--night-indigo)" }} />
              </div>
            </div>
            <div className="a-full-sm" style={{ display: "flex", flexDirection: "column", gap: "8px", width: "210px" }}>
              <label htmlFor="f-who" style={{ fontSize: "14px", fontWeight: "500", color: "var(--night-indigo)" }}>
                Done by
              </label>
              <div style={{ position: "relative" }}>
                <select id="f-who" className="a-field" value={v.who} onChange={v.setWho} style={{ width: "100%", height: "44px", padding: "0 40px 0 14px", borderRadius: "10px", border: "1px solid var(--edge)", background: "var(--field-white)", fontSize: "15px", color: "var(--night-indigo)" }}>
                  <option value="all">
                    All administrators
                  </option>
                  {v.actors.map((name) => <option key={name} value={name}>{name}</option>)}
                </select>
                <svg width="16" height="16" viewBox="0 0 24 24" aria-hidden="true" style={{ position: "absolute", right: "14px", top: "14px", pointerEvents: "none", fill: "none", stroke: "var(--ink-2)", strokeWidth: "2", strokeLinecap: "round", strokeLinejoin: "round" }}>
                  <path d="m6 9 6 6 6-6" />
                </svg>
              </div>
            </div>
            <div className="a-full-sm" style={{ display: "flex", flexDirection: "column", gap: "8px", width: "300px" }}>
              <label htmlFor="f-act" style={{ fontSize: "14px", fontWeight: "500", color: "var(--night-indigo)" }}>
                Action
              </label>
              <div style={{ position: "relative" }}>
                <select id="f-act" className="a-field" value={v.act} onChange={v.setAct} style={{ width: "100%", height: "44px", padding: "0 40px 0 14px", borderRadius: "10px", border: "1px solid var(--edge)", background: "var(--field-white)", fontSize: "15px", color: "var(--night-indigo)" }}>
                  <option value="all">
                    All actions
                  </option>
                  <option value="created">
                    Account created
                  </option>
                  <option value="role">
                    Role changed
                  </option>
                  <option value="deact">
                    Account deactivated
                  </option>
                  <option value="course">
                    Course created or edited
                  </option>
                  <option value="assign">
                    Lecturer assigned or removed
                  </option>
                  <option value="lang">
                    Speech language changed
                  </option>
                  <option value="ai">
                    AI provider changed
                  </option>
                </select>
                <svg width="16" height="16" viewBox="0 0 24 24" aria-hidden="true" style={{ position: "absolute", right: "14px", top: "14px", pointerEvents: "none", fill: "none", stroke: "var(--ink-2)", strokeWidth: "2", strokeLinecap: "round", strokeLinejoin: "round" }}>
                  <path d="m6 9 6 6 6-6" />
                </svg>
              </div>
            </div>
            <button type="button" className="a-btn a-btn-quiet" aria-disabled={v.clearDisabled} onClick={v.clear} style={{ height: "44px", padding: "0 14px", border: "0", borderRadius: "10px", background: "transparent", fontSize: "15px", fontWeight: "500", color: "var(--ink-2)", whiteSpace: "nowrap" }}>
              Clear filters
            </button>
            <p className="a-num" aria-live="polite" style={{ marginLeft: "auto", height: "44px", display: "flex", alignItems: "center", fontSize: "13.5px", color: "var(--ink-3)", whiteSpace: "nowrap" }}>
              <span className={v.countCls}>
                {v.countText}
              </span>
            </p>
          </div>
          {v.rangeBadFlag && (
            <>
              <p id="range-err" className="a-rise" role="alert" style={{ display: "flex", alignItems: "center", gap: "8px", fontSize: "13.5px", color: "var(--red-ink)" }}>
                <svg width="18" height="18" viewBox="0 0 24 24" aria-hidden="true" style={{ flex: "none", fill: "none", stroke: "currentColor", strokeWidth: "1.75", strokeLinecap: "round", strokeLinejoin: "round" }}>
                  <path d="M10.3 4.2 2.6 17.5A2 2 0 0 0 4.3 20.5h15.4a2 2 0 0 0 1.7-3L13.7 4.2a2 2 0 0 0-3.4 0z" />
                  <path d="M12 9.5v4" />
                  <path d="M12 17v.01" />
                </svg>
                The end date is before the start date.
              </p>
            </>
          )}
        </div>
        <div className="a-rise" style={{ animationDelay: "120ms", display: "flex", flexDirection: "column", gap: "16px" }}>
          {v.pending && (
            <>
              <div className="a-rise" role="status" style={{ display: "flex", flexWrap: "wrap", alignItems: "center", gap: "6px 14px", padding: "8px 8px 8px 16px", borderRadius: "12px", background: "var(--jade-wash)", border: "1px solid rgba(44,107,107,0.22)" }}>
                <svg width="18" height="18" viewBox="0 0 24 24" aria-hidden="true" style={{ flex: "none", fill: "none", stroke: "var(--jade-ink)", strokeWidth: "1.75", strokeLinecap: "round", strokeLinejoin: "round" }}>
                  <circle cx="12" cy="12" r="9" />
                  <path d="M12 11v5" />
                  <path d="M12 7.6v.01" />
                </svg>
                <p style={{ flex: "1 1 220px", fontSize: "14.5px", lineHeight: "1.5", color: "var(--night-indigo)" }}>
                  {v.pendingText}
                </p>
                <button type="button" className="a-btn a-btn-quiet" onClick={v.showNew} style={{ height: "36px", padding: "0 14px", border: "0", borderRadius: "10px", background: "transparent", fontSize: "14px", fontWeight: "500", color: "var(--night-indigo)", whiteSpace: "nowrap" }}>
                  Show it
                </button>
              </div>
            </>
          )}
          <div className="au-cols" aria-hidden="true" style={{ display: v.colsDisplay, gridTemplateColumns: "168px minmax(0, 1fr)", columnGap: "32px", fontSize: "13.5px", fontWeight: "500", color: "var(--ink-3)" }}>
            <span>
              Day
            </span>
            <div style={{ display: "grid", gridTemplateColumns: "84px minmax(0, 1.25fr) minmax(0, 1fr) 150px", columnGap: "24px" }}>
              <span>
                Time
              </span>
              <span>
                Action
              </span>
              <span>
                On
              </span>
              <span>
                Done by
              </span>
            </div>
          </div>
          <section aria-label="Log entries" className="a-turn-stage" style={{ position: "relative", margin: "0 -12px", padding: "0 12px", minHeight: v.stageMin, transition: v.stageTr }}>
            {v.turning && (
              <>
                <div className="a-turn-out-s" aria-hidden="true" style={{ position: "absolute", top: "0", left: "12px", right: "12px", pointerEvents: "none" }}>
                  {v.outGroups.map((g, g_i) => (
                    <Fragment key={g.key ?? g_i}>
                      <div className="au-day" style={{ display: "grid", gridTemplateColumns: "168px minmax(0, 1fr)", columnGap: "32px", boxShadow: "inset 0 1px 0 var(--line-strong)" }}>
                        <h2 className="au-dayh" style={{ display: "flex", flexDirection: "column", gap: "2px", paddingTop: "18px", fontSize: "15.5px", lineHeight: "1.35", fontWeight: "500", color: "var(--night-indigo)" }}>
                          {g.day}
                          <span style={{ fontSize: "13.5px", fontWeight: "400", color: "var(--ink-3)" }}>
                            {g.sub}
                          </span>
                        </h2>
                        <ol>
                          {g.entries.map((e, e_i) => (
                            <Fragment key={e.key ?? e_i}>
                              <li>
                                <div className="au-li" style={{ display: "grid", gridTemplateColumns: "84px minmax(0, 1.25fr) minmax(0, 1fr) 150px", columnGap: "24px", alignItems: "baseline", padding: "16px 0", boxShadow: e.rule }}>
                                  <span className="a-num" style={{ fontSize: "20px", fontWeight: "300", lineHeight: "1.2", color: "var(--night-indigo)" }}>
                                    {e.time}
                                  </span>
                                  <div style={{ minWidth: "0" }}>
                                    <p style={{ fontSize: "15.5px", lineHeight: "1.35", fontWeight: "500", color: e.actionInk }}>
                                      {e.action}
                                    </p>
                                    <p style={{ marginTop: "3px", fontSize: "14.5px", lineHeight: "1.45", color: "var(--ink-2)", overflowWrap: "anywhere" }}>
                                      {e.details}
                                    </p>
                                  </div>
                                  <span className="au-c" style={{ fontSize: "15px", color: "var(--night-indigo)" }}>
                                    {e.target}
                                  </span>
                                  <span className="au-c" style={{ fontSize: "14.5px", color: "var(--ink-2)" }}>
                                    {e.who}
                                  </span>
                                </div>
                              </li>
                            </Fragment>
                          ))}
                        </ol>
                      </div>
                    </Fragment>
                  ))}
                </div>
              </>
            )}
            <div className={v.inCls}>
              {v.groups.map((g, g_i) => (
                <Fragment key={g.key ?? g_i}>
                  <div className="au-day" style={{ display: "grid", gridTemplateColumns: "168px minmax(0, 1fr)", columnGap: "32px", boxShadow: "inset 0 1px 0 var(--line-strong)" }}>
                    <h2 className="au-dayh" style={{ display: "flex", flexDirection: "column", gap: "2px", paddingTop: "18px", fontSize: "15.5px", lineHeight: "1.35", fontWeight: "500", color: "var(--night-indigo)" }}>
                      {g.day}
                      <span style={{ fontSize: "13.5px", fontWeight: "400", color: "var(--ink-3)" }}>
                        {g.sub}
                      </span>
                    </h2>
                    <ol>
                      {g.entries.map((e, e_i) => (
                        <Fragment key={e.key ?? e_i}>
                          <li className={e.wrapCls} style={{ display: "grid", gridTemplateRows: "1fr" }}>
                            <div style={{ minWidth: "0" }}>
                              <div className="a-row au-li" style={{ display: "grid", gridTemplateColumns: "84px minmax(0, 1.25fr) minmax(0, 1fr) 150px", columnGap: "24px", alignItems: "baseline", padding: "16px 0", boxShadow: e.rule }}>
                                <div>
                                  <span className="a-num" style={{ display: "block", fontSize: "20px", fontWeight: "300", lineHeight: "1.2", color: "var(--night-indigo)" }}>
                                    {e.time}
                                  </span>
                                  {e.isNew && (
                                    <>
                                      <span className="a-just" style={{ marginTop: "4px", display: "flex", alignItems: "center", gap: "6px", fontSize: "12.5px", fontWeight: "400", color: "var(--jade-ink)" }}>
                                        <span aria-hidden="true" style={{ width: "6px", height: "6px", borderRadius: "50%", background: "var(--jade-ink)" }} />
                                        new
                                      </span>
                                    </>
                                  )}
                                </div>
                                <div style={{ minWidth: "0" }}>
                                  <p style={{ fontSize: "15.5px", lineHeight: "1.35", fontWeight: "500", color: e.actionInk }}>
                                    {e.action}
                                  </p>
                                  <p style={{ marginTop: "3px", fontSize: "14.5px", lineHeight: "1.45", color: "var(--ink-2)", overflowWrap: "anywhere" }}>
                                    {e.details}
                                  </p>
                                </div>
                                <span className="au-c" style={{ display: "flex", alignItems: "baseline", gap: "8px", minWidth: "0", fontSize: "15px", lineHeight: "1.35" }}>
                                  {e.isUser && (
                                    <>
                                      <svg width="16" height="16" viewBox="0 0 24 24" aria-hidden="true" style={{ flex: "none", alignSelf: "center", fill: "none", stroke: "var(--ink-3)", strokeWidth: "1.75", strokeLinecap: "round", strokeLinejoin: "round" }}>
                                        <circle cx="12" cy="8" r="4" />
                                        <path d="M4 21a8 8 0 0 1 16 0" />
                                      </svg>
                                    </>
                                  )}
                                  {e.isCourse && (
                                    <>
                                      <svg width="16" height="16" viewBox="0 0 24 24" aria-hidden="true" style={{ flex: "none", alignSelf: "center", fill: "none", stroke: "var(--ink-3)", strokeWidth: "1.75", strokeLinecap: "round", strokeLinejoin: "round" }}>
                                        <path d="M4 4.5A1.5 1.5 0 0 1 5.5 3H20v15H5.5A1.5 1.5 0 0 0 4 19.5z" />
                                        <path d="M4 19.5A1.5 1.5 0 0 0 5.5 21H20v-3" />
                                      </svg>
                                    </>
                                  )}
                                  {e.isAi && (
                                    <>
                                      <svg width="16" height="16" viewBox="0 0 24 24" aria-hidden="true" style={{ flex: "none", alignSelf: "center", fill: "none", stroke: "var(--ink-3)", strokeWidth: "1.75", strokeLinecap: "round", strokeLinejoin: "round" }}>
                                        <path d="M4 6h9M17 6h3M4 12h3M11 12h9M4 18h11M19 18h1" />
                                        <circle cx="15" cy="6" r="2" />
                                        <circle cx="9" cy="12" r="2" />
                                        <circle cx="17" cy="18" r="2" />
                                      </svg>
                                    </>
                                  )}
                                  <Link className="a-link" to={e.href} style={{ color: "var(--night-indigo)", minWidth: "0", overflowWrap: "anywhere" }}>
                                    {e.target}
                                  </Link>
                                </span>
                                <span className="au-c" style={{ fontSize: "14.5px", lineHeight: "1.35", color: "var(--ink-2)" }}>
                                  <span className="au-by">
                                    by{' '}
                                  </span>
                                  {e.who}
                                </span>
                              </div>
                            </div>
                          </li>
                        </Fragment>
                      ))}
                    </ol>
                  </div>
                </Fragment>
              ))}
              {v.empty && (
                <>
                  <div className="a-rise" style={{ display: "flex", flexWrap: "wrap", alignItems: "center", gap: "8px 16px", padding: "28px 0 12px", boxShadow: "inset 0 1px 0 var(--line-strong)" }}>
                    <p style={{ fontSize: "15px", color: "var(--ink-2)" }}>
                      No entries match these filters.
                    </p>
                    <button type="button" className="a-btn a-btn-quiet" onClick={v.clear} style={{ height: "44px", padding: "0 14px", marginLeft: "-14px", border: "0", borderRadius: "10px", background: "transparent", fontSize: "15px", fontWeight: "500", color: "var(--night-indigo)" }}>
                      Clear filters
                    </button>
                  </div>
                </>
              )}
            </div>
          </section>
          <p style={{ display: "flex", alignItems: "center", gap: "8px", paddingTop: "16px", boxShadow: "inset 0 1px 0 var(--line-strong)", fontSize: "14px", color: "var(--ink-3)" }}>
            <svg width="16" height="16" viewBox="0 0 24 24" aria-hidden="true" style={{ flex: "none", fill: "none", stroke: "currentColor", strokeWidth: "1.75", strokeLinecap: "round", strokeLinejoin: "round" }}>
              <rect x="5" y="11" width="14" height="9" rx="2" />
              <path d="M8 11V8a4 4 0 0 1 8 0v3" />
            </svg>
            API keys are never written to the log.
          </p>
        </div>
        <SampleNote style={{ marginTop: '32px', paddingTop: '0', fontSize: '13px', color: 'var(--ink-3)' }}>All names, times and entries on this page are sample data.</SampleNote>
      </main>
    </div>
  )
}
