import { Fragment, useEffect, useRef } from 'react'
import { Link } from 'react-router-dom'
import { paths } from '../../app/routes/paths.js'
import { examConfigApi } from '../../api/services.js'
import { SampleNote } from '../../components/SampleNote.jsx'
import { StaffTopBar } from '../../components/TopBar.jsx'
import { useLoad } from '../../hooks/useLoad.js'
import { useMergeState } from '../../hooks/useMergeState.js'
import { useTimeouts } from '../../hooks/useTimeouts.js'
import { formatWindow } from '../../utils/format.js'

// live counts are read again every few seconds while the page is open (polling, agreed with the team)
const POLL_MS = 8000
const GLOW = 'radial-gradient(420px 260px at 100% 0%, rgba(123,196,196,0.14), rgba(15,22,48,0) 70%)'
const LIGHT = { rowCls: 'a-row', rule: 'inset 0 -1px 0 var(--line)', bg: 'transparent', gap: '0 solid transparent', radL: '0', radR: '0', ink: 'var(--night-indigo)', ink2: 'var(--ink-2)', jade: 'var(--jade-ink)', justInk: 'var(--jade-ink)', btnBorder: '1px solid var(--edge)', btnBg: 'rgba(255,255,255,0.6)', btnInk: 'var(--night-indigo)', glow: 'none', cardCls: '', cardPad: '18px 0', cardMargin: '0', cardRad: '0', cardImg: 'none', cardShadow: 'inset 0 -1px 0 var(--line)' }
const NIGHT = { rowCls: 'a-night', rule: 'none', bg: 'var(--night-indigo)', gap: '12px solid transparent', radL: '20px 0 0 0', radR: '0 20px 0 0', ink: 'var(--ivory)', ink2: 'var(--ivory-2)', jade: 'var(--jade)', justInk: 'var(--jade)', btnBorder: '1px solid var(--night-edge)', btnBg: 'transparent', btnInk: 'var(--ivory)', glow: GLOW, cardCls: 'a-night', cardPad: '22px 20px 20px', cardMargin: '12px 0 14px', cardRad: '20px', cardImg: GLOW, cardShadow: '0 24px 48px -28px rgba(15,22,48,0.7)' }
const PHASE = {
  ai: { disc: 'none', stroke: 'var(--lantern-gold)', cres: 'var(--lantern-gold)' },
  live: { disc: 'none', stroke: 'var(--lantern-red)', cres: 'var(--lantern-red)' },
  idle: { disc: 'none', stroke: 'var(--ivory-2)', cres: 'none' },
}
const STATUS_INK = { Closed: 'var(--night-indigo)', Draft: 'var(--ink-3)', Published: 'var(--ink-2)' }

const actionOf = (x) => {
  if (x.phase === 'Draft') return { href: paths.sessionSetup(x.id), action: 'Continue setup' }
  if (x.phase === 'Published') return { href: paths.sessionStudents(x.id), action: 'View' }
  return { href: paths.sessionResults(x.id), action: 'Results' }
}

function Mark({ kind }) {
  if (kind === 'Open now') return (
    <svg width="14" height="14" viewBox="0 0 16 16" aria-hidden="true" style={{ flex: 'none' }}>
      <circle cx="8" cy="8" r="6.25" style={{ fill: 'none', stroke: 'var(--lantern-red)', strokeWidth: '1.5' }} />
      <path d="M8 1.75a6.25 6.25 0 0 1 0 12.5a2.6 6.25 0 0 0 0-12.5z" style={{ fill: 'var(--lantern-red)' }} />
    </svg>
  )
  if (kind === 'Published') return (
    <svg width="14" height="14" viewBox="0 0 16 16" aria-hidden="true" style={{ flex: 'none' }}>
      <circle cx="8" cy="8" r="6.25" style={{ fill: 'none', stroke: 'var(--ink-2)', strokeWidth: '1.5' }} />
    </svg>
  )
  if (kind === 'Closed') return (
    <svg width="14" height="14" viewBox="0 0 16 16" aria-hidden="true" style={{ flex: 'none' }}>
      <circle cx="8" cy="8" r="6.25" style={{ fill: 'none', stroke: 'var(--night-indigo)', strokeWidth: '1.5' }} />
      <circle cx="8" cy="8" r="6.25" style={{ fill: 'var(--night-indigo)' }} />
    </svg>
  )
  return (
    <svg width="14" height="14" viewBox="0 0 16 16" aria-hidden="true" style={{ flex: 'none' }}>
      <circle cx="8" cy="8" r="6.25" style={{ fill: 'none', stroke: 'var(--ink-3)', strokeWidth: '1.5', strokeDasharray: '2.45 2.45' }} />
    </svg>
  )
}

function LiveCounts({ r, columnGap }) {
  return (
    <p className="a-num" style={{ display: 'flex', flexWrap: 'wrap', columnGap, rowGap: '6px', fontSize: '14px', lineHeight: '1.4', color: 'var(--ivory-2)' }}>
      <span style={{ display: 'inline-flex', alignItems: 'center', gap: '8px' }}>
        <svg width="14" height="14" viewBox="0 0 16 16" aria-hidden="true" style={{ flex: 'none' }}>
          <circle cx="8" cy="8" r="6.25" style={{ fill: 'none', stroke: 'var(--lantern-gold)', strokeWidth: '1.5' }} />
          <path d="M8 1.75a6.25 6.25 0 0 1 0 12.5a2.6 6.25 0 0 0 0-12.5z" style={{ fill: 'var(--lantern-gold)' }} />
        </svg>
        <span>
          <span key={r.nReview} className={r.reviewCls} style={{ fontWeight: '500', color: 'var(--ivory)' }}>{r.nReview}</span>
          {' '}waiting for review
        </span>
      </span>
      <span style={{ display: 'inline-flex', alignItems: 'center', gap: '8px' }}>
        <svg width="14" height="14" viewBox="0 0 16 16" aria-hidden="true" style={{ flex: 'none' }}>
          <circle cx="8" cy="8" r="6.25" style={{ fill: 'none', stroke: 'var(--lantern-red)', strokeWidth: '1.5' }} />
          <path d="M8 1.75a6.25 6.25 0 0 1 0 12.5a2.6 6.25 0 0 0 0-12.5z" style={{ fill: 'var(--lantern-red)' }} />
        </svg>
        <span>
          <span key={r.nLive} className={r.takenCls} style={{ fontWeight: '500', color: 'var(--ivory)' }}>{r.nLive}</span>
          {' '}answering now
        </span>
      </span>
      <span style={{ display: 'inline-flex', alignItems: 'center', gap: '8px' }}>
        <svg width="14" height="14" viewBox="0 0 16 16" aria-hidden="true" style={{ flex: 'none' }}>
          <circle cx="8" cy="8" r="6.25" style={{ fill: 'none', stroke: 'var(--ivory-2)', strokeWidth: '1.5' }} />
        </svg>
        <span>
          <span key={r.nIdle} className={r.takenCls} style={{ fontWeight: '500', color: 'var(--ivory)' }}>{r.nIdle}</span>
          {' '}not started
        </span>
      </span>
    </p>
  )
}

const Moons = ({ moons }) => (
  <div aria-hidden="true" style={{ display: 'flex', flexWrap: 'wrap', gap: '7px' }}>
    {moons.map((m, i) => (
      <span key={i} className={m.cls} style={{ display: 'inline-flex', marginLeft: m.gap }}>
        <svg className={m.rec} width="14" height="14" viewBox="0 0 16 16" style={{ flex: 'none', animationDelay: m.delay }}>
          <circle cx="8" cy="8" r="6.25" style={{ fill: m.disc, stroke: m.stroke, strokeWidth: '1.5', transition: 'stroke .4s ease-out' }} />
          <path d="M8 1.75a6.25 6.25 0 0 1 0 12.5a2.6 6.25 0 0 0 0-12.5z" style={{ fill: m.cres }} />
        </svg>
      </span>
    ))}
  </div>
)

function SessionTable({ rows, v }) {
  const th = { padding: '0 16px 12px 0', fontSize: '13.5px', fontWeight: '500', color: 'var(--ink-3)', whiteSpace: 'nowrap' }
  return (
    <div className="a-hide-sm" style={{ overflowX: 'auto', paddingBottom: '4px' }}>
      <table style={{ width: '100%', minWidth: '1180px', textAlign: 'left', borderCollapse: 'separate', borderSpacing: '0' }}>
        <thead>
          <tr style={{ boxShadow: 'inset 0 -1px 0 var(--line-strong)' }}>
            <th scope="col" style={{ ...th, paddingLeft: '20px' }}>Session</th>
            <th scope="col" aria-sort={v.sortAria} style={{ padding: '0 16px 12px 0', width: '230px' }}>
              <button type="button" className="a-sort" onClick={v.flipSort} style={{ display: 'inline-flex', alignItems: 'center', gap: '6px', padding: '0', border: '0', background: 'none', fontSize: '13.5px', fontWeight: '500', color: 'var(--night-indigo)', whiteSpace: 'nowrap' }}>
                Time window
                <svg width="14" height="14" viewBox="0 0 24 24" aria-hidden="true" style={{ transform: `rotate(${v.arrowDeg})`, transition: 'transform .4s cubic-bezier(0.34,1.32,0.64,1)', fill: 'none', stroke: 'currentColor', strokeWidth: '2', strokeLinecap: 'round', strokeLinejoin: 'round' }}>
                  <path d="M12 5v14" />
                  <path d="m6 13 6 6 6-6" />
                </svg>
              </button>
            </th>
            <th scope="col" style={{ ...th, textAlign: 'right', width: '100px' }}>Students</th>
            <th scope="col" style={{ ...th, textAlign: 'right', width: '100px' }}>Taken</th>
            <th scope="col" style={{ ...th, textAlign: 'right', paddingRight: '28px', width: '124px' }}>To review</th>
            <th scope="col" style={{ ...th, width: '150px' }}>Status</th>
            <th scope="col" style={{ padding: '0 20px 12px 0', width: '170px' }}>
              <span style={{ position: 'absolute', width: '1px', height: '1px', overflow: 'hidden', clip: 'rect(0 0 0 0)' }}>Action</span>
            </th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <Fragment key={r.id}>
              <tr className={r.rowCls} style={{ boxShadow: r.rule }}>
                <td style={{ padding: '18px 16px 18px 20px', verticalAlign: 'top', minWidth: '300px', background: r.bg, borderTop: r.gap, borderRadius: r.radL, backgroundClip: 'padding-box' }}>
                  <div style={{ fontSize: '15.5px', lineHeight: '1.35', fontWeight: '500', color: r.ink }}>{r.name}</div>
                  <div style={{ marginTop: '3px', fontSize: '13.5px', lineHeight: '1.4', color: r.jade }}>{r.course}</div>
                </td>
                <td style={{ padding: '18px 16px 18px 0', verticalAlign: 'top', fontSize: '14.5px', lineHeight: '1.4', color: r.ink2, whiteSpace: 'nowrap', background: r.bg, borderTop: r.gap, backgroundClip: 'padding-box' }}>{r.when}</td>
                <td className="a-num" style={{ padding: '14px 16px 14px 0', verticalAlign: 'top', textAlign: 'right', fontSize: '20px', fontWeight: '300', lineHeight: '1.2', color: r.ink, background: r.bg, borderTop: r.gap, backgroundClip: 'padding-box' }}>{r.students}</td>
                <td className="a-num" style={{ padding: '14px 16px 14px 0', verticalAlign: 'top', textAlign: 'right', fontSize: '20px', fontWeight: '300', lineHeight: '1.2', color: r.ink, whiteSpace: 'nowrap', background: r.bg, borderTop: r.gap, backgroundClip: 'padding-box' }}>
                  <span key={r.taken} className={r.takenCls}>{r.taken}</span>
                  {r.takenJust && (
                    <div className="a-just" style={{ marginTop: '2px', display: 'flex', justifyContent: 'flex-end', alignItems: 'center', gap: '6px', fontSize: '12.5px', fontWeight: '400', color: r.justInk }}>
                      <span aria-hidden="true" style={{ width: '6px', height: '6px', borderRadius: '50%', background: r.justInk }} />
                      just now
                    </div>
                  )}
                </td>
                <td className="a-num" style={{ padding: '14px 28px 14px 0', verticalAlign: 'top', textAlign: 'right', fontSize: '20px', fontWeight: '300', lineHeight: '1.2', color: r.ink, whiteSpace: 'nowrap', backgroundColor: r.bg, backgroundImage: r.glow, backgroundSize: '420px 260px', backgroundRepeat: 'no-repeat', backgroundPosition: 'right -320px top 0', borderTop: r.gap, backgroundClip: 'padding-box' }}>
                  <span key={r.review} className={r.reviewCls}>{r.review}</span>
                  {r.reviewJust && (
                    <div className="a-just" style={{ marginTop: '2px', display: 'flex', justifyContent: 'flex-end', alignItems: 'center', gap: '6px', fontSize: '12.5px', fontWeight: '400', color: r.justInk }}>
                      <span aria-hidden="true" style={{ width: '6px', height: '6px', borderRadius: '50%', background: r.justInk }} />
                      just now
                    </div>
                  )}
                </td>
                <td style={{ padding: '18px 16px 18px 0', verticalAlign: 'top', whiteSpace: 'nowrap', backgroundColor: r.bg, backgroundImage: r.glow, backgroundSize: '420px 260px', backgroundRepeat: 'no-repeat', backgroundPosition: 'right -170px top 0', borderTop: r.gap, backgroundClip: 'padding-box' }}>
                  <span style={{ display: 'inline-flex', alignItems: 'center', gap: '9px', fontSize: '14.5px', lineHeight: '1.35', fontWeight: r.statusWeight, color: r.statusInk }}>
                    <Mark kind={r.status} />
                    {r.status}
                  </span>
                </td>
                <td style={{ padding: '12px 20px 12px 0', verticalAlign: 'top', textAlign: 'right', whiteSpace: 'nowrap', backgroundColor: r.bg, backgroundImage: r.glow, backgroundSize: '420px 260px', backgroundRepeat: 'no-repeat', backgroundPosition: 'right 0px top 0', borderTop: r.gap, borderRadius: r.radR, backgroundClip: 'padding-box' }}>
                  <Link to={r.href} className="a-btn a-btn-secondary" style={{ height: '36px', padding: '0 14px', borderRadius: '10px', border: r.btnBorder, background: r.btnBg, fontSize: '14px', fontWeight: '500', color: r.btnInk, textDecoration: 'none', display: 'inline-flex', alignItems: 'center' }}>
                    {r.action}
                  </Link>
                </td>
              </tr>
              {r.live && (
                <tr className="a-night">
                  <td colSpan="7" style={{ position: 'relative', padding: '0 20px 22px', backgroundColor: 'var(--night-indigo)', backgroundImage: 'radial-gradient(420px 260px at 100% -79px, var(--jade-wash), rgba(15,22,48,0) 70%)', borderRadius: '0 0 20px 20px', boxShadow: '0 24px 48px -28px rgba(15,22,48,0.7)', color: 'var(--ivory)' }}>
                    <span className="a-warm" aria-hidden="true" style={{ position: 'absolute', top: '0', right: '0', bottom: '0', left: '0', borderRadius: '0 0 20px 20px', pointerEvents: 'none', backgroundImage: 'radial-gradient(360px 160px at 30% 120%, rgba(232,69,44,0.18), rgba(232,69,44,0) 70%)', opacity: r.warm }} />
                    <div style={{ position: 'sticky', left: '20px', maxWidth: 'calc(100vw - 80px)', display: 'flex', flexWrap: 'wrap', alignItems: 'center', columnGap: '40px', rowGap: '14px', paddingTop: '16px', borderTop: '1px solid var(--night-line)' }}>
                      <Moons moons={r.moons} />
                      <LiveCounts r={r} columnGap="24px" />
                    </div>
                  </td>
                </tr>
              )}
            </Fragment>
          ))}
        </tbody>
      </table>
    </div>
  )
}

function SessionCards({ rows }) {
  return (
    <ul className="a-show-sm" aria-label="Sessions" style={{ flexDirection: 'column', borderTop: '1px solid var(--line-strong)' }}>
      {rows.map((r) => (
        <li key={r.id} className={r.cardCls} style={{ position: 'relative', padding: r.cardPad, margin: r.cardMargin, borderRadius: r.cardRad, backgroundColor: r.bg, backgroundImage: r.cardImg, boxShadow: r.cardShadow }}>
          {r.live && <span className="a-warm" aria-hidden="true" style={{ position: 'absolute', top: '0', right: '0', bottom: '0', left: '0', borderRadius: '20px', pointerEvents: 'none', backgroundImage: 'radial-gradient(360px 160px at 30% 120%, rgba(232,69,44,0.18), rgba(232,69,44,0) 70%)', opacity: r.warm }} />}
          <div style={{ position: 'relative', display: 'flex', flexDirection: 'column' }}>
            <div style={{ fontSize: '15.5px', lineHeight: '1.35', fontWeight: '500', color: r.ink }}>{r.name}</div>
            <div style={{ marginTop: '3px', fontSize: '13.5px', lineHeight: '1.4', color: r.jade }}>{r.course}</div>
            <div style={{ marginTop: '8px', fontSize: '14.5px', lineHeight: '1.4', color: r.ink2 }}>{r.when}</div>
            <div className="a-num" style={{ marginTop: '8px', display: 'flex', flexWrap: 'wrap', alignItems: 'center', columnGap: '16px', rowGap: '4px', fontSize: '14.5px', lineHeight: '1.4' }}>
              <span style={{ display: 'inline-flex', alignItems: 'center', gap: '9px', fontWeight: r.statusWeight, color: r.statusInk }}>
                <Mark kind={r.status} />
                {r.status}
              </span>
              <span style={{ display: 'inline-flex', flexWrap: 'wrap', columnGap: '6px', color: r.ink2 }}>
                <span>{r.students}{' '}students</span>
                {r.hasCounts && (
                  <>
                    <span aria-hidden="true">·</span>
                    <span><span className={r.takenCls}>{r.taken}</span>{' '}taken</span>
                    <span aria-hidden="true">·</span>
                    <span><span className={r.reviewCls}>{r.review}</span>{' '}to review</span>
                  </>
                )}
              </span>
            </div>
            {r.live && (
              <div style={{ marginTop: '16px', paddingTop: '16px', borderTop: '1px solid var(--night-line)', display: 'flex', flexDirection: 'column', gap: '12px' }}>
                <Moons moons={r.moons} />
                <LiveCounts r={r} columnGap="20px" />
              </div>
            )}
            <Link to={r.href} className="a-btn a-btn-secondary" style={{ marginTop: '16px', width: '100%', height: '44px', padding: '0 16px', borderRadius: '12px', border: r.btnBorder, background: r.btnBg, fontSize: '15px', fontWeight: '500', color: r.btnInk, textDecoration: 'none', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              {r.action}
            </Link>
          </div>
        </li>
      ))}
    </ul>
  )
}

// mode="results" is the "Results and review" page: only sessions that have attempts (open now or closed)
export default function LecturerSessionsPage({ mode = 'sessions' }) {
  const results = mode === 'results'
  const { data } = useLoad(() => examConfigApi.list(), [], { pollMs: POLL_MS })
  const { data: courses } = useLoad(() => examConfigApi.myCourses(), [])
  const [s, setState] = useMergeState({ course: 'all', status: 'all', q: '', desc: true, turning: false, outRows: [], just: {}, flip: false })
  const { later, clear } = useTimeouts()
  const prev = useRef({})

  // compare live counts with the previous read: the changed number drops in and holds "just now"
  useEffect(() => {
    if (!data) return
    const just = {}
    for (const x of data) {
      const p = prev.current[x.id]
      if (p && x.taken > p.taken) just[x.id] = { what: 'taken', pop: x.toReview + x.answering - 1 }
      else if (p && x.toReview > p.toReview) just[x.id] = { what: 'review', pop: x.toReview - 1 }
      else if (s.just[x.id]) just[x.id] = { ...s.just[x.id], pop: null }
    }
    prev.current = Object.fromEntries(data.map((x) => [x.id, { taken: x.taken, toReview: x.toReview }]))
    setState((p) => ({ just, flip: !p.flip }))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [data])

  const build = (f, frozen) => {
    const q = f.q.trim().toLowerCase()
    const list = (data ?? []).filter((x) => (!results || x.phase === 'Open now' || x.phase === 'Closed') && (f.course === 'all' || x.courseCode === f.course) && (f.status === 'all' || x.phase === f.status) && (!q || `${x.title} ${x.classCode ?? ''} ${x.courseCode} ${x.courseName}`.toLowerCase().includes(q)))
    const dated = list.filter((x) => x.startAt).sort((a, b) => (f.desc ? new Date(b.startAt) - new Date(a.startAt) : new Date(a.startAt) - new Date(b.startAt)))
    const tick = s.flip ? 'a-tick-a' : 'a-tick-b'
    return dated.concat(list.filter((x) => !x.startAt)).map((x) => {
      const counts = x.phase === 'Closed' || x.phase === 'Open now'
      const base = {
        ...LIGHT, ...actionOf(x), id: x.id,
        name: `${x.title}${x.classCode ? ` (${x.classCode})` : ''}`,
        course: `${x.courseCode} · ${x.courseName}`,
        when: formatWindow(x.startAt, x.endAt),
        students: x.students, taken: counts ? x.taken : '–', review: counts ? x.toReview : '–',
        status: x.phase, statusWeight: 400, statusInk: STATUS_INK[x.phase] ?? 'var(--ink-2)', hasCounts: counts,
        takenCls: '', reviewCls: '', takenJust: false, reviewJust: false, live: false,
      }
      if (x.phase === 'Draft') base.ink = 'var(--ink-2)'
      if (x.phase !== 'Open now') return base
      const rev = x.toReview, live = x.answering, idle = Math.max(0, x.students - x.taken)
      const j = s.just[x.id]
      const moons = Array.from({ length: x.students }, (_, i) => {
        const ph = i < rev ? 'ai' : i < rev + live ? 'live' : 'idle'
        return { cls: !frozen && j?.pop === i ? 'a-pop' : '', gap: i > 0 && (i === rev || i === rev + live) ? '10px' : '0px', rec: ph === 'live' ? 'a-rec' : '', delay: ph === 'live' ? ((i - rev) * 0.12).toFixed(2) + 's' : '0s', ...PHASE[ph] }
      })
      return {
        ...base, ...NIGHT,
        review: rev, nReview: rev, nLive: live, nIdle: idle,
        takenCls: !frozen && j?.what === 'taken' ? tick : '', reviewCls: !frozen && j?.what === 'review' ? tick : '',
        takenJust: j?.what === 'taken', reviewJust: j?.what === 'review',
        live: true, warm: Math.min(1, live / 10).toFixed(2), statusWeight: 500, statusInk: 'var(--ember-text)', moons,
      }
    })
  }

  const f = { course: s.course, status: s.status, q: s.q, desc: s.desc }
  const rows = build(f, false)
  const active = f.course !== 'all' || f.status !== 'all' || f.q.trim() !== ''
  const total = (data ?? []).filter((x) => !results || x.phase === 'Open now' || x.phase === 'Closed').length
  // a filter change turns the list like a page: the old rows swing out as the new ones swing in
  const change = (patch) => {
    clear()
    setState({ turning: true, outRows: build(f, true), ...patch })
    later(() => setState({ turning: false, outRows: [] }), 620)
  }
  const h = (list) => 46 + list.reduce((a, r) => a + (r.live ? 170 : 86), 0)
  const v = {
    sortAria: f.desc ? 'descending' : 'ascending',
    arrowDeg: f.desc ? '0deg' : '180deg',
    flipSort: () => change({ desc: !f.desc }),
  }
  const clearFilters = () => { if (active) change({ course: 'all', status: 'all', q: '' }) }
  const codes = (courses ?? []).map((c) => c.code)

  return (
    <div className="pg-lecturersessions" style={{ minHeight: '100vh', display: 'flex', flexDirection: 'column' }}>
      <StaffTopBar current={results ? 'results' : 'sessions'} />
      <main className="a-gutter" style={{ flex: '1', width: '100%', maxWidth: '1280px', margin: '0 auto', padding: '56px 40px 80px', display: 'flex', flexDirection: 'column', gap: '28px' }}>
        <div className="a-stack-sm" style={{ display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between', gap: '24px' }}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
            <h1 className="a-title" style={{ fontFamily: 'Alegreya, Georgia, serif', fontWeight: '500', fontSize: '44px', lineHeight: '1.08', letterSpacing: '-0.012em', color: 'var(--night-indigo)' }}>
              {results ? 'Results and review' : 'Exam sessions'}
            </h1>
            {codes.length > 0 && (
              <p style={{ fontSize: '16.5px', color: 'var(--ink-2)' }}>
                Your courses{' '}
                {codes.map((c, i) => (
                  <Fragment key={c}>
                    {i > 0 && (i === codes.length - 1 ? ' and ' : ', ')}
                    <span style={{ color: 'var(--jade-ink)', fontWeight: '500' }}>{c}</span>
                  </Fragment>
                ))}
              </p>
            )}
          </div>
          {!results && <Link to={paths.newSession} className="a-btn a-btn-primary" style={{ height: '44px', padding: '0 20px', borderRadius: '12px', background: 'var(--night-indigo)', color: 'var(--ivory)', fontSize: '15px', fontWeight: '500', textDecoration: 'none', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: '10px', boxShadow: '0 8px 18px -10px rgba(15,22,48,0.55)' }}>
            <svg width="18" height="18" viewBox="0 0 24 24" aria-hidden="true" style={{ fill: 'none', stroke: 'currentColor', strokeWidth: '1.75', strokeLinecap: 'round' }}>
              <path d="M12 5v14M5 12h14" />
            </svg>
            New exam session
          </Link>}
        </div>
        <div className="a-wrap-sm" style={{ display: 'flex', alignItems: 'flex-end', gap: '16px', marginTop: '12px' }}>
          <div className="a-full-sm" style={{ display: 'flex', flexDirection: 'column', gap: '8px', width: '330px' }}>
            <label htmlFor="f-course" style={{ fontSize: '14px', fontWeight: '500', color: 'var(--night-indigo)' }}>Course</label>
            <div style={{ position: 'relative' }}>
              <select id="f-course" className="a-field" value={f.course} onChange={(e) => change({ course: e.target.value })} style={{ width: '100%', height: '44px', padding: '0 40px 0 14px', borderRadius: '10px', border: '1px solid var(--edge)', background: 'var(--field-white)', fontSize: '15px', color: 'var(--night-indigo)' }}>
                <option value="all">All my courses</option>
                {(courses ?? []).map((c) => <option key={c.id} value={c.code}>{c.code} · {c.name}</option>)}
              </select>
              <svg width="16" height="16" viewBox="0 0 24 24" aria-hidden="true" style={{ position: 'absolute', right: '14px', top: '14px', pointerEvents: 'none', fill: 'none', stroke: 'var(--ink-2)', strokeWidth: '2', strokeLinecap: 'round', strokeLinejoin: 'round' }}>
                <path d="m6 9 6 6 6-6" />
              </svg>
            </div>
          </div>
          <div className="a-full-sm" style={{ display: 'flex', flexDirection: 'column', gap: '8px', width: '190px' }}>
            <label htmlFor="f-status" style={{ fontSize: '14px', fontWeight: '500', color: 'var(--night-indigo)' }}>Status</label>
            <div style={{ position: 'relative' }}>
              <select id="f-status" className="a-field" value={f.status} onChange={(e) => change({ status: e.target.value })} style={{ width: '100%', height: '44px', padding: '0 40px 0 14px', borderRadius: '10px', border: '1px solid var(--edge)', background: 'var(--field-white)', fontSize: '15px', color: 'var(--night-indigo)' }}>
                <option value="all">All</option>
                <option value="Open now">Open now</option>
                {!results && <option value="Published">Published</option>}
                {!results && <option value="Draft">Draft</option>}
                <option value="Closed">Closed</option>
              </select>
              <svg width="16" height="16" viewBox="0 0 24 24" aria-hidden="true" style={{ position: 'absolute', right: '14px', top: '14px', pointerEvents: 'none', fill: 'none', stroke: 'var(--ink-2)', strokeWidth: '2', strokeLinecap: 'round', strokeLinejoin: 'round' }}>
                <path d="m6 9 6 6 6-6" />
              </svg>
            </div>
          </div>
          <div className="a-full-sm" style={{ display: 'flex', flexDirection: 'column', gap: '8px', width: '300px' }}>
            <label htmlFor="f-search" style={{ fontSize: '14px', fontWeight: '500', color: 'var(--night-indigo)' }}>Search</label>
            <div style={{ position: 'relative' }}>
              <svg width="18" height="18" viewBox="0 0 24 24" aria-hidden="true" style={{ position: 'absolute', left: '13px', top: '13px', pointerEvents: 'none', fill: 'none', stroke: 'var(--ink-3)', strokeWidth: '1.75', strokeLinecap: 'round' }}>
                <circle cx="11" cy="11" r="6.5" />
                <path d="m16 16 4 4" />
              </svg>
              <input id="f-search" type="search" className="a-field" value={f.q} onChange={(e) => setState({ q: e.target.value })} placeholder="Session or class" autoComplete="off" style={{ width: '100%', height: '44px', padding: '0 14px 0 40px', borderRadius: '10px', border: '1px solid var(--edge)', background: 'var(--field-white)', fontSize: '15px', color: 'var(--night-indigo)' }} />
            </div>
          </div>
          <button type="button" className="a-btn a-btn-quiet" aria-disabled={active ? 'false' : 'true'} onClick={clearFilters} style={{ height: '44px', padding: '0 14px', border: '0', borderRadius: '10px', background: 'transparent', fontSize: '15px', fontWeight: '500', color: 'var(--ink-2)' }}>
            Clear filters
          </button>
          <p className="a-num" aria-live="polite" style={{ marginLeft: 'auto', height: '44px', display: 'flex', alignItems: 'center', fontSize: '13.5px', color: 'var(--ink-3)', whiteSpace: 'nowrap' }}>
            {active ? `${rows.length} of ${total} sessions` : `${total} sessions`}
          </p>
        </div>
        <section aria-label="Sessions" className="a-turn-stage" style={{ position: 'relative', margin: '0 -20px', paddingBottom: '8px', minHeight: s.turning ? h(s.outRows) + 'px' : '0px', transition: s.turning ? 'none' : 'min-height .6s cubic-bezier(0.25,1,0.5,1)' }}>
          {s.turning && (
            <div className="a-turn-out-s" aria-hidden="true" style={{ position: 'absolute', top: '0', left: '0', right: '0', pointerEvents: 'none' }}>
              <SessionTable rows={s.outRows} v={v} />
              <SessionCards rows={s.outRows} />
            </div>
          )}
          <div key={s.turning ? 'in' : 'rest'} className={s.turning ? 'a-turn-in-s' : ''}>
            <SessionTable rows={rows} v={v} />
            <SessionCards rows={rows} />
            {data && rows.length === 0 && (
              <div className="a-rise" style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: '8px 16px', padding: '28px 20px 12px' }}>
                <p style={{ fontSize: '15px', color: 'var(--ink-2)' }}>{total ? 'No sessions match these filters.' : 'No exam sessions yet. Create one to start.'}</p>
                {total > 0 && (
                  <button type="button" className="a-btn a-btn-quiet" onClick={clearFilters} style={{ height: '44px', padding: '0 14px', marginLeft: '-14px', border: '0', borderRadius: '10px', background: 'transparent', fontSize: '15px', fontWeight: '500', color: 'var(--night-indigo)' }}>
                    Clear filters
                  </button>
                )}
              </div>
            )}
          </div>
        </section>
        <p style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '14px', color: 'var(--ink-3)' }}>
          <svg width="16" height="16" viewBox="0 0 24 24" aria-hidden="true" style={{ flex: 'none', fill: 'none', stroke: 'currentColor', strokeWidth: '1.75', strokeLinecap: 'round', strokeLinejoin: 'round' }}>
            <rect x="5" y="11" width="14" height="9" rx="2" />
            <path d="M8 11V8a4 4 0 0 1 8 0v3" />
          </svg>
          Published sessions lock their questions and rubrics.
        </p>
        <SampleNote style={{ marginTop: '32px', paddingTop: '0', fontSize: '13px', color: 'var(--ink-3)' }}>All names, times and counts on this page are sample data.</SampleNote>
      </main>
    </div>
  )
}
