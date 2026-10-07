import { Fragment, useEffect, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { paths } from '../../app/routes/paths.js'
import { scoreReviewApi } from '../../api/services.js'
import { SampleNote } from '../../components/SampleNote.jsx'
import { StaffTopBar } from '../../components/TopBar.jsx'
import { useMergeState } from '../../hooks/useMergeState.js'
import { useTimeouts } from '../../hooks/useTimeouts.js'
import { formatClock, formatScore, formatTime, minutesBetween } from '../../utils/format.js'
import { WAVE_BARS, wordTiming, waveBars } from '../../utils/playback.js'
import './ReviewAttempt.css'

const TURN_MS = 600
const TICK = 0.125

// score typed by the lecturer: 0..10 in steps of 0.25
const parseScore = (str) => {
  const t = String(str ?? '').trim()
  if (!/^\d{1,2}(\.\d{1,2})?$/.test(t)) return null
  const v = parseFloat(t)
  if (v < 0 || v > 10 || Math.abs(v * 4 - Math.round(v * 4)) > 1e-9) return null
  return v
}

const crescentGold = (size) => (
  <svg width={size} height={size} viewBox="0 0 16 16" aria-hidden="true" style={{ flex: 'none' }}>
    <circle cx="8" cy="8" r="6.25" style={{ fill: 'none', stroke: 'var(--gold-edge)', strokeWidth: '1.5' }} />
    <path d="M8 1.75a6.25 6.25 0 0 1 0 12.5a2.6 6.25 0 0 0 0-12.5z" style={{ fill: 'var(--lantern-gold)' }} />
  </svg>
)

function metaOf(a) {
  const total = a.questions.length
  const reached = a.questions.filter((q) => q.reached).length
  if (a.endReason === 'SessionClosed') return `Stopped at ${formatTime(a.endedAt)} when the session closed · ${reached} of ${total} questions answered`
  return `Attempt ended at ${formatTime(a.endedAt)} · ${minutesBetween(a.startedAt, a.endedAt)} min · ${reached} of ${total} questions answered`
}

export default function ReviewAttemptPage() {
  const { attemptId } = useParams()
  const navigate = useNavigate()
  const { later } = useTimeouts()
  const [data, setData] = useState(null)
  const [error, setError] = useState(null)
  const [s, setState] = useMergeState({ view: null, draft: '', comment: '', playId: null, playing: false, pos: {}, turning: false, out: null, turned: false })

  useEffect(() => {
    if (data?.id === attemptId) return
    scoreReviewApi.get(attemptId).then(setData).catch((e) => setError(e.message))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [attemptId])

  // the simulated playhead, 8 updates a second (the mock has no recordings; the real API sends audioUrl)
  useEffect(() => {
    if (!s.playing || !s.playId) return undefined
    const iv = setInterval(() => setState((p) => {
      const turn = turnById(data, p.playId)
      if (!turn) return { playing: false }
      const next = (p.pos[p.playId] ?? 0) + TICK
      return next >= turn.durationSeconds ? { playing: false, pos: { ...p.pos, [p.playId]: turn.durationSeconds } } : { pos: { ...p.pos, [p.playId]: next } }
    }), TICK * 1000)
    return () => clearInterval(iv)
  }, [s.playing, s.playId, data, setState])

  if (!data) {
    return (
      <div className="pg-reviewattempt" style={{ minHeight: '100vh', display: 'flex', flexDirection: 'column' }}>
        <StaffTopBar current="results" />
        <p role={error ? 'alert' : 'status'} style={{ padding: '56px 40px', fontSize: '15px', color: error ? 'var(--red-ink)' : 'var(--ink-2)' }}>{error ?? 'Loading the attempt…'}</p>
      </div>
    )
  }

  const toggle = (id, dur) => setState((p) => {
    if (p.playId === id && p.playing) return { playing: false }
    const pos = { ...p.pos }
    if ((pos[id] ?? 0) >= dur) pos[id] = 0
    return { playId: id, playing: true, pos }
  })
  const seek = (id, dur, v) => {
    const pp = Math.min(dur, Math.max(0, v))
    setState((p) => ({ playId: id, playing: pp < dur, pos: { ...p.pos, [id]: pp } }))
  }

  const confirm = async (score, comment) => {
    setError(null)
    try {
      const saved = await scoreReviewApi.confirm(data.id, score, comment)
      setData((d) => ({ ...d, ...saved }))
      setState({ view: 'confirmed', justConfirmed: true })
    } catch (e) {
      setError(e.message)
    }
  }

  // the lecturer's revolving lantern: the reviewed attempt swings away, the next one swings in
  const goNext = async (e) => {
    e?.preventDefault?.()
    if (!data.next || s.turning) return
    const nextData = await scoreReviewApi.get(data.next.id)
    try { window.scrollTo({ top: 0, behavior: 'instant' }) } catch { /* no window */ }
    setState({ turning: true, turned: true, out: { data, view: viewOf(data, s), draft: s.draft, comment: s.comment }, view: null, draft: '', comment: '', playId: null, playing: false, justConfirmed: false, justAdjusted: false })
    setData(nextData)
    navigate(paths.review(nextData.id))
    later(() => setState({ turning: false, out: null }), TURN_MS)
  }

  const face = (d, v, kind) => {
    const live = kind !== 'out'
    const pre = live ? '' : 'out-'
    const view = v.view
    const ok = view === 'confirmed'
    const aiTotal = d.aiTotal
    const draft = view === 'adjusting' ? v.draft : formatScore(aiTotal)
    const dv = parseScore(draft)
    const bad = view === 'adjusting' && dv === null
    let score = aiTotal
    if (view === 'adjusting') score = dv
    if (ok) score = d.review?.finalScore ?? aiTotal
    const delta = dv === null ? null : dv - aiTotal
    const aiText = formatScore(aiTotal)
    const pos = s.pos
    const limit = d.session.timeLimitSeconds
    const questions = d.questions.map((q, qi) => {
      let fuN = 0
      const turns = []
      q.turns.forEach((t, ti) => {
        turns.push({ isAsk: true, isAnswer: false, who: t.type === 'Main' ? 'AI examiner' : `AI follow-up ${++fuN}`, text: t.questionText })
        const id = `${d.id}-${qi}-${ti}`
        const dur = Math.max(1, t.durationSeconds)
        const p = pos[id] ?? 0
        const active = s.playId === id
        const playing = active && s.playing && live
        const started = live && (active || p > 0)
        const pct = p / dur
        const timing = wordTiming(t.answerText, dur)
        turns.push({
          isAsk: false, isAnswer: true, id,
          used: `${formatClock(dur)} of ${formatClock(limit)}`,
          dur, pos: p, durText: formatClock(dur), posText: formatClock(p),
          showPos: started, showHead: started, playing,
          btnLabel: playing ? 'Pause this answer' : 'Play this answer',
          headPct: (pct * 100).toFixed(2) + '%',
          bars: waveBars(qi * 3 + ti + 1).map((h, i) => ({ h: h + 'px', c: started && (i + 0.5) / WAVE_BARS <= pct ? 'var(--night-indigo)' : 'var(--line-strong)' })),
          words: timing.map((o, i) => {
            const cur = started && p >= o.s && p < o.e
            const c = !started ? 'var(--night-indigo)' : cur ? 'var(--red-ink)' : p >= o.e ? 'var(--night-indigo)' : 'var(--ink-3)'
            return { w: o.w, sp: i < timing.length - 1 ? ' ' : '', c, bg: cur ? 'rgba(232,69,44,0.10)' : 'transparent' }
          }),
        })
      })
      return { label: `Question ${qi + 1}`, ai: formatScore(q.ai.score), max: formatScore(q.maxScore), comment: q.ai.comment, hid: `${pre}q${qi + 1}-h`, turns }
    })
    const just = live && !!s.justConfirmed
    const next = d.next
    return {
      cls: kind === 'in' ? 'a-turn-in-s' : kind === 'out' ? 'a-turn-out-s' : '',
      pos: kind === 'out' ? 'absolute' : 'relative',
      pe: live ? 'auto' : 'none',
      hidden: live ? 'false' : 'true',
      rise: kind === 'rest' && !s.turned ? 'a-rise' : '',
      name: d.student.fullName, code: d.student.studentCode, meta: metaOf(d),
      back: `${d.session.title}${d.session.classCode ? ` (${d.session.classCode})` : ''}`, sessionId: d.session.id,
      aiText, questions,
      parts: d.questions.map((q, qi) => ({ label: `Q${qi + 1}`, v: formatScore(q.ai.score) })),
      finalId: pre + 'final-h', scoreId: pre + 'final-score', errId: pre + 'final-score-err', commentId: pre + 'final-comment',
      isPending: view === 'pending', isAdjusting: view === 'adjusting', isConfirmed: ok, notConfirmed: !ok,
      statusText: ok ? 'Confirmed' : 'Waiting for review',
      statusInk: ok ? 'var(--night-indigo)' : 'var(--gold-ink)',
      moonCls: just ? 'a-moon-fill' : '',
      insetCls: just ? 'a-settle' : '',
      riseCls: just ? 'a-rise' : '',
      paneCls: live && s.justAdjusted ? 'a-rise' : '',
      scoreCls: just ? 'a-pop' : view === 'adjusting' && live ? (s.flip ? 'a-tick-a' : 'a-tick-b') : '',
      finalState: ok ? 'confirmed' : view === 'adjusting' ? 'adjusting' : 'starts at the AI total',
      scoreText: score === null ? '–' : formatScore(score),
      deltaText: delta === null ? 'Not a valid score yet' : delta === 0 ? 'Same as the AI total' : `${delta > 0 ? '+' : '−'}${formatScore(Math.abs(delta))} from the AI total of ${aiText}`,
      draft, comment: view === 'adjusting' ? v.comment : d.review?.comment ?? '', bad,
      hasComment: ok && !!d.review?.comment?.trim(),
      confirmedAt: d.review?.confirmedAt ? formatTime(d.review.confirmedAt) : '',
      inputEdge: bad ? 'var(--ember-text)' : 'var(--night-edge)',
      hasNext: !!next,
      nextLabel: next ? `${next.fullName} · ${next.endReason === 'SessionClosed' ? 'stopped at' : 'ended'} ${formatTime(next.endedAt)}` : '',
      onDraft: (e) => setState((p) => ({ draft: e.target.value, flip: !p.flip })),
      onComment: (e) => setState({ comment: e.target.value }),
      adjust: () => setState((p) => ({ view: 'adjusting', draft: formatScore(aiTotal), comment: d.review?.comment ?? '', justConfirmed: false, justAdjusted: false, flip: !p.flip })),
      reset: () => setState({ view: 'pending', justAdjusted: true, justConfirmed: false }),
      confirmAi: () => confirm(aiTotal, ''),
      confirmDraft: () => { if (dv !== null) confirm(dv, v.comment) },
    }
  }

  const cur = { view: viewOf(data, s), draft: s.draft, comment: s.comment }
  const faces = s.turning && s.out ? [face(data, cur, 'in'), face(s.out.data, s.out, 'out')] : [face(data, cur, 'rest')]
  const now = faces[0]

  return (
    <div className="pg-reviewattempt" style={{ minHeight: '100vh', display: 'flex', flexDirection: 'column' }}>
      <StaffTopBar current="results" />
      <main className="a-gutter a-main" style={{ flex: '1', width: '100%', maxWidth: '1280px', margin: '0 auto', padding: '56px 40px 80px', display: 'flex', flexDirection: 'column', gap: '56px' }}>
        <div className="a-review-stage">
          {faces.map((f) => (
            <div key={f.finalId + f.cls + f.name} className={f.cls} aria-hidden={f.hidden} style={{ position: f.pos, top: '0', left: '0', right: '0', display: 'flex', flexDirection: 'column', gap: '56px', pointerEvents: f.pe }}>
              <div className={f.rise} style={{ display: 'flex', flexDirection: 'column', gap: '12px', animationDelay: '0ms' }}>
                <Link className="a-link" to={paths.sessionResults(f.sessionId)} style={{ alignSelf: 'flex-start', display: 'inline-flex', alignItems: 'center', gap: '6px', fontSize: '14px', color: 'var(--ink-2)' }}>
                  <svg width="16" height="16" viewBox="0 0 24 24" aria-hidden="true" style={{ flex: 'none', fill: 'none', stroke: 'currentColor', strokeWidth: '1.75', strokeLinecap: 'round', strokeLinejoin: 'round' }}>
                    <path d="M15 6l-6 6 6 6" />
                  </svg>
                  {f.back}
                </Link>
                <h1 className="a-title" style={{ fontFamily: 'Alegreya, Georgia, serif', fontWeight: '500', fontSize: '44px', lineHeight: '1.08', letterSpacing: '-0.012em', color: 'var(--night-indigo)' }}>
                  {f.name}
                </h1>
                <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', columnGap: '20px', rowGap: '6px', fontSize: '14.5px', color: 'var(--ink-2)' }}>
                  <span>{f.code}</span>
                  <span style={{ display: 'inline-flex', alignItems: 'center', gap: '9px', fontWeight: '500', color: f.statusInk }}>
                    {f.isConfirmed ? (
                      <svg width="14" height="14" viewBox="0 0 16 16" aria-hidden="true" style={{ flex: 'none' }}>
                        <circle cx="8" cy="8" r="6.25" style={{ fill: 'none', stroke: 'var(--night-indigo)', strokeWidth: '1.5' }} />
                        <circle className={f.moonCls} cx="8" cy="8" r="6.25" style={{ fill: 'var(--night-indigo)' }} />
                      </svg>
                    ) : crescentGold(14)}
                    {f.statusText}
                  </span>
                  <span>{f.meta}</span>
                </div>
              </div>
              <div className="a-grid-1-sm" style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1fr) 400px', columnGap: '72px', rowGap: '64px', alignItems: 'start' }}>
                <div className={f.rise} style={{ display: 'flex', flexDirection: 'column', gap: '64px', minWidth: '0', animationDelay: '60ms' }}>
                  {f.questions.map((q) => (
                    <article key={q.hid} aria-labelledby={q.hid} style={{ display: 'flex', flexDirection: 'column', gap: '28px', paddingTop: '28px', borderTop: '1px solid var(--line-strong)' }}>
                      <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'baseline', justifyContent: 'space-between', columnGap: '16px', rowGap: '6px' }}>
                        <h2 id={q.hid} style={{ fontSize: '15.5px', fontWeight: '500', color: 'var(--night-indigo)' }}>{q.label}</h2>
                        <span style={{ display: 'inline-flex', alignItems: 'center', gap: '8px', fontSize: '14px', color: 'var(--gold-ink)' }}>
                          {crescentGold(14)}
                          <span>
                            AI suggests{' '}
                            <span className="a-num" style={{ fontWeight: '500' }}>{q.ai}</span>
                            {' '}/{' '}{q.max}
                          </span>
                        </span>
                      </div>
                      {q.turns.map((t, ti) => (
                        <div key={ti} style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                          {t.isAsk && (
                            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                              <p style={{ fontSize: '14px', fontWeight: '500', color: 'var(--gold-ink)' }}>{t.who}</p>
                              <p style={{ fontFamily: 'Alegreya, Georgia, serif', fontWeight: '500', fontSize: '26px', lineHeight: '1.28', color: 'var(--night-indigo)', maxWidth: '34em', textWrap: 'balance' }}>{t.text}</p>
                            </div>
                          )}
                          {t.isAnswer && (
                            <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
                              <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'baseline', justifyContent: 'space-between', columnGap: '16px', rowGap: '4px' }}>
                                <p style={{ fontSize: '14px', fontWeight: '500', color: 'var(--night-indigo)' }}>
                                  Answer{' '}
                                  <span className="a-num" style={{ fontWeight: '400', fontSize: '13.5px', color: 'var(--ink-3)' }}>·{' '}{t.used}</span>
                                </p>
                                {t.showPos && (
                                  <span className="a-num a-rise" style={{ fontSize: '14px', color: 'var(--ink-2)', whiteSpace: 'nowrap' }}>
                                    <span style={{ color: 'var(--night-indigo)', fontWeight: '500' }}>{t.posText}</span>
                                    {' '}of{' '}{t.durText}
                                  </span>
                                )}
                              </div>
                              <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
                                <button type="button" className="a-btn a-btn-primary" aria-label={t.btnLabel} onClick={() => toggle(t.id, t.dur)} style={{ flex: 'none', width: '44px', height: '44px', padding: '0', borderRadius: '50%', border: '0', background: 'var(--night-indigo)', color: 'var(--ivory)', display: 'grid', placeItems: 'center', boxShadow: '0 8px 18px -10px rgba(15,22,48,0.55)' }}>
                                  {t.playing ? (
                                    <svg width="18" height="18" viewBox="0 0 24 24" aria-hidden="true" style={{ fill: 'currentColor' }}>
                                      <rect x="6.5" y="5" width="4" height="14" rx="1.2" />
                                      <rect x="13.5" y="5" width="4" height="14" rx="1.2" />
                                    </svg>
                                  ) : (
                                    <svg width="18" height="18" viewBox="0 0 24 24" aria-hidden="true" style={{ fill: 'currentColor' }}>
                                      <path d="M8 5.2v13.6a.8.8 0 0 0 1.2.7l10.6-6.8a.8.8 0 0 0 0-1.4L9.2 4.5A.8.8 0 0 0 8 5.2z" />
                                    </svg>
                                  )}
                                </button>
                                <div className="a-wave" style={{ position: 'relative', flex: '1', minWidth: '0', height: '44px', display: 'flex', alignItems: 'center', gap: '3px' }}>
                                  {t.bars.map((b, bi) => (
                                    <span key={bi} aria-hidden="true" style={{ flex: '1', minWidth: '2px', borderRadius: '2px', height: b.h, background: b.c, transition: 'background-color .2s ease-out' }} />
                                  ))}
                                  {t.showHead && (
                                    <span className="a-playhead" aria-hidden="true" style={{ position: 'absolute', inset: '0', transform: `translateX(${t.headPct})`, pointerEvents: 'none' }}>
                                      <span style={{ position: 'absolute', left: '0', top: '0', bottom: '0', width: '2px', marginLeft: '-1px', borderRadius: '2px', background: 'var(--lantern-red)' }} />
                                    </span>
                                  )}
                                  <input
                                    type="range" className="a-seek" min="0" max={t.dur} step="0.125" value={t.pos}
                                    onChange={(e) => seek(t.id, t.dur, Number(e.target.value))}
                                    onKeyDown={(e) => {
                                      const k = e.key === 'ArrowRight' || e.key === 'ArrowUp' ? 5 : e.key === 'ArrowLeft' || e.key === 'ArrowDown' ? -5 : 0
                                      if (!k) return
                                      e.preventDefault()
                                      seek(t.id, t.dur, t.pos + k)
                                    }}
                                    aria-label="Position in this answer" aria-valuetext={`${t.posText} of ${t.durText}`}
                                    style={{ position: 'absolute', inset: '0', width: '100%', height: '44px', margin: '0', opacity: '0', cursor: 'pointer' }}
                                  />
                                </div>
                              </div>
                              <p style={{ fontSize: '18px', lineHeight: '1.6', fontWeight: '400', maxWidth: '40em', color: 'var(--night-indigo)' }}>
                                {t.words.map((w, wi) => (
                                  <Fragment key={wi}>
                                    <span className="a-spoken" style={{ color: w.c, background: w.bg, borderRadius: '4px' }}>{w.w}</span>
                                    {w.sp}
                                  </Fragment>
                                ))}
                              </p>
                            </div>
                          )}
                        </div>
                      ))}
                      <div style={{ display: 'grid', gridTemplateColumns: '18px minmax(0, 1fr)', columnGap: '12px', rowGap: '4px', padding: '16px 18px', borderRadius: '12px', border: '1.5px dashed var(--gold-edge)', background: 'var(--ai-wash)' }}>
                        <svg width="18" height="18" viewBox="0 0 16 16" aria-hidden="true" style={{ marginTop: '2px' }}>
                          <circle cx="8" cy="8" r="6.25" style={{ fill: 'none', stroke: 'var(--gold-edge)', strokeWidth: '1.5' }} />
                          <path d="M8 1.75a6.25 6.25 0 0 1 0 12.5a2.6 6.25 0 0 0 0-12.5z" style={{ fill: 'var(--lantern-gold)' }} />
                        </svg>
                        <p style={{ fontSize: '14px', fontWeight: '500', color: 'var(--gold-ink)' }}>AI comment · read only</p>
                        <p style={{ gridColumn: '2', fontSize: '15px', lineHeight: '1.55', color: 'var(--ink-2)', maxWidth: '44em' }}>{q.comment}</p>
                      </div>
                    </article>
                  ))}
                </div>
                <aside aria-label="Score for this attempt" className={`a-score-col ${f.rise}`} style={{ position: 'sticky', top: '32px', alignSelf: 'start', display: 'flex', flexDirection: 'column', gap: '20px', minWidth: '0', animationDelay: '120ms' }}>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '16px', padding: '24px 24px 22px', borderRadius: '16px', border: '1.5px dashed var(--gold-edge)', background: 'var(--ai-wash)' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                      {crescentGold(20)}
                      <span style={{ fontSize: '15px', fontWeight: '500', color: 'var(--gold-ink)' }}>AI suggestions total</span>
                      <span style={{ marginLeft: 'auto', fontSize: '13px', color: 'var(--gold-ink)' }}>provisional</span>
                    </div>
                    <p className="a-num" style={{ display: 'flex', alignItems: 'baseline', gap: '8px', color: 'var(--gold-ink)' }}>
                      <span style={{ fontSize: '56px', fontWeight: '200', lineHeight: '1', letterSpacing: '-0.02em' }}>{f.aiText}</span>
                      <span style={{ fontSize: '18px', fontWeight: '300' }}>/ 10</span>
                    </p>
                    <ul className="a-num" style={{ display: 'grid', gridTemplateColumns: `repeat(${f.parts.length}, minmax(0, 1fr))`, gap: '8px', paddingTop: '14px', borderTop: '1px dashed rgba(168,126,0,0.45)', fontSize: '13px', color: 'var(--ink-2)' }}>
                      {f.parts.map((p) => (
                        <li key={p.label}>
                          {p.label}{' '}
                          <span style={{ color: 'var(--night-indigo)', fontWeight: '500' }}>{p.v}</span>
                        </li>
                      ))}
                    </ul>
                  </div>
                  <section aria-labelledby={f.finalId} className={`a-night ${f.insetCls}`} style={{ display: 'flex', flexDirection: 'column', gap: '18px', padding: '26px 24px 24px', borderRadius: '20px', backgroundColor: 'var(--night-indigo)', backgroundImage: 'radial-gradient(420px 260px at 100% 0%, var(--jade-wash), rgba(15,22,48,0) 70%)', color: 'var(--ivory)', boxShadow: '0 24px 48px -28px rgba(15,22,48,0.7)' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                      {f.isConfirmed ? (
                        <svg width="20" height="20" viewBox="0 0 16 16" aria-hidden="true" style={{ flex: 'none' }}>
                          <circle cx="8" cy="8" r="6.25" style={{ fill: 'none', stroke: 'var(--ivory)', strokeWidth: '1.5' }} />
                          <circle className={f.moonCls} cx="8" cy="8" r="6.25" style={{ fill: 'var(--ivory)' }} />
                        </svg>
                      ) : (
                        <svg width="20" height="20" viewBox="0 0 16 16" aria-hidden="true" style={{ flex: 'none' }}>
                          <circle cx="8" cy="8" r="6.25" style={{ fill: 'none', stroke: 'var(--ivory-2)', strokeWidth: '1.5' }} />
                        </svg>
                      )}
                      <h2 id={f.finalId} style={{ fontSize: '15px', fontWeight: '500', scrollMarginTop: '24px' }}>Final score</h2>
                      <span style={{ marginLeft: 'auto', fontSize: '13px', color: 'var(--ivory-2)' }}>{f.finalState}</span>
                    </div>
                    <p className="a-num" aria-live="polite" style={{ display: 'flex', alignItems: 'baseline', gap: '8px' }}>
                      <span key={f.scoreText + f.scoreCls} className={`a-score-xl ${f.scoreCls}`} style={{ fontSize: '72px', fontWeight: '200', lineHeight: '0.95', letterSpacing: '-0.02em' }}>{f.scoreText}</span>
                      <span style={{ fontSize: '18px', fontWeight: '300', color: 'var(--ivory-2)' }}>/ 10</span>
                    </p>
                    {f.isPending && (
                      <div className={f.paneCls} style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                        <button type="button" className="a-btn a-btn-primary" onClick={f.confirmAi} style={{ height: '52px', border: '0', borderRadius: '14px', background: 'var(--ivory)', color: 'var(--night-indigo)', fontSize: '16px', fontWeight: '500', boxShadow: '0 10px 28px -12px rgba(0,0,0,0.55)' }}>
                          Confirm final score
                        </button>
                        <button type="button" className="a-btn a-btn-secondary" onClick={f.adjust} style={{ height: '44px', borderRadius: '12px', border: '1px solid var(--night-edge)', background: 'transparent', color: 'var(--ivory)', fontSize: '15px', fontWeight: '500' }}>
                          Adjust final score
                        </button>
                      </div>
                    )}
                    {f.isAdjusting && (
                      <div className="a-rise" style={{ display: 'flex', flexDirection: 'column', gap: '18px' }}>
                        <p className="a-num" style={{ marginTop: '-8px', fontSize: '14px', color: 'var(--ivory-2)' }}>{f.deltaText}</p>
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                          <label htmlFor={f.scoreId} style={{ fontSize: '14px', fontWeight: '500' }}>Final score (0 to 10)</label>
                          <input id={f.scoreId} type="number" min="0" max="10" step="0.25" inputMode="decimal" value={f.draft} onChange={f.onDraft} aria-invalid={f.bad} aria-describedby={f.errId} className="a-num" style={{ width: '160px', height: '48px', padding: '0 14px', borderRadius: '12px', border: `1px solid ${f.inputEdge}`, background: 'var(--night-field)', fontSize: '18px', fontWeight: '400', color: 'var(--ivory)', caretColor: 'var(--ivory)', colorScheme: 'dark' }} />
                          {f.bad && (
                            <p id={f.errId} className="a-rise" style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '13.5px', color: 'var(--ember-text)' }}>
                              <svg width="18" height="18" viewBox="0 0 24 24" aria-hidden="true" style={{ flex: 'none', fill: 'none', stroke: 'currentColor', strokeWidth: '1.75', strokeLinecap: 'round', strokeLinejoin: 'round' }}>
                                <path d="M12 4 21 19.5H3z" />
                                <path d="M12 10v4.5" />
                                <path d="M12 17.2v.01" />
                              </svg>
                              Enter a score from 0 to 10, in steps of 0.25.
                            </p>
                          )}
                        </div>
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                          <label htmlFor={f.commentId} style={{ fontSize: '14px', fontWeight: '500' }}>Comment for the student (optional)</label>
                          <textarea id={f.commentId} rows="4" value={f.comment} onChange={f.onComment} style={{ width: '100%', padding: '12px 14px', borderRadius: '12px', border: '1px solid var(--night-edge)', background: 'var(--night-field)', fontSize: '15px', lineHeight: '1.5', color: 'var(--ivory)', caretColor: 'var(--ivory)', resize: 'vertical', colorScheme: 'dark' }} />
                        </div>
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                          <button type="button" className="a-btn a-btn-primary" onClick={f.confirmDraft} aria-disabled={f.bad} style={{ height: '52px', border: '0', borderRadius: '14px', background: 'var(--ivory)', color: 'var(--night-indigo)', fontSize: '16px', fontWeight: '500', boxShadow: '0 10px 28px -12px rgba(0,0,0,0.55)' }}>
                            Confirm final score
                          </button>
                          <button type="button" className="a-btn a-btn-quiet" onClick={f.reset} style={{ alignSelf: 'flex-start', height: '44px', padding: '0 14px', marginLeft: '-14px', border: '0', borderRadius: '10px', background: 'transparent', color: 'var(--ivory-2)', fontSize: '15px', fontWeight: '500' }}>
                            Go back to{' '}{f.aiText}
                          </button>
                        </div>
                      </div>
                    )}
                    {error && <p role="alert" style={{ fontSize: '14px', lineHeight: '1.5', color: 'var(--ember-text)' }}>{error}</p>}
                    {f.isConfirmed && (
                      <div className={f.riseCls} style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                        <p style={{ fontSize: '15px', fontWeight: '500' }}>Confirmed by you at {f.confirmedAt}</p>
                        <p style={{ fontSize: '14px', lineHeight: '1.5', color: 'var(--ivory-2)' }}>
                          The student can now open the report. This score counts in class statistics and the grade sheet.
                        </p>
                        {f.hasComment && (
                          <div style={{ display: 'flex', flexDirection: 'column', gap: '4px', marginTop: '6px', paddingTop: '14px', borderTop: '1px solid var(--night-line)' }}>
                            <p style={{ fontSize: '13.5px', color: 'var(--ivory-3)' }}>Your comment for the student</p>
                            <p style={{ fontSize: '14.5px', lineHeight: '1.5' }}>{f.comment}</p>
                          </div>
                        )}
                      </div>
                    )}
                  </section>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '10px', paddingTop: '4px' }}>
                    {f.hasNext ? (
                      <>
                        <p style={{ fontSize: '13.5px', color: 'var(--ink-3)' }}>Next attempt waiting for review</p>
                        {f.notConfirmed ? (
                          <Link className="a-link" to={paths.review(data.next?.id ?? '')} onClick={goNext} style={{ alignSelf: 'flex-start', display: 'inline-flex', alignItems: 'center', gap: '6px', fontSize: '15px', fontWeight: '500', color: 'var(--night-indigo)' }}>
                            {f.nextLabel}
                            <svg width="16" height="16" viewBox="0 0 24 24" aria-hidden="true" style={{ flex: 'none', fill: 'none', stroke: 'currentColor', strokeWidth: '1.75', strokeLinecap: 'round', strokeLinejoin: 'round' }}>
                              <path d="m9 6 6 6-6 6" />
                            </svg>
                          </Link>
                        ) : (
                          <Link to={paths.review(data.next?.id ?? '')} onClick={goNext} className="a-btn a-btn-primary a-rise" style={{ alignSelf: 'flex-start', height: '44px', padding: '0 20px', borderRadius: '12px', background: 'var(--night-indigo)', color: 'var(--ivory)', fontSize: '15px', fontWeight: '500', textDecoration: 'none', display: 'inline-flex', alignItems: 'center', gap: '10px', boxShadow: '0 8px 18px -10px rgba(15,22,48,0.55)' }}>
                            {f.nextLabel}
                            <svg width="18" height="18" viewBox="0 0 24 24" aria-hidden="true" style={{ flex: 'none', fill: 'none', stroke: 'currentColor', strokeWidth: '1.75', strokeLinecap: 'round', strokeLinejoin: 'round' }}>
                              <path d="M5 12h14" />
                              <path d="m13 6 6 6-6 6" />
                            </svg>
                          </Link>
                        )}
                      </>
                    ) : (
                      <>
                        <p style={{ fontSize: '13.5px', color: 'var(--ink-3)' }}>No other attempts are waiting for review</p>
                        <Link className="a-link" to={paths.sessionResults(f.sessionId)} style={{ alignSelf: 'flex-start', fontSize: '15px', fontWeight: '500', color: 'var(--night-indigo)' }}>
                          Back to the results
                        </Link>
                      </>
                    )}
                  </div>
                </aside>
              </div>
            </div>
          ))}
        </div>
        <SampleNote style={{ marginTop: '0', paddingTop: '0', fontSize: '13px', color: 'var(--ink-3)' }}>All names, times, recordings and scores on this page are sample data.</SampleNote>
      </main>
      <div className="a-only-sm a-night" style={{ position: 'fixed', left: '0', right: '0', bottom: '0', zIndex: '20', height: '64px', padding: '0 20px env(safe-area-inset-bottom)', background: 'var(--night-indigo)', color: 'var(--ivory)', display: 'flex', alignItems: 'center', gap: '12px', boxShadow: '0 -12px 28px -18px rgba(15,22,48,0.6)' }}>
        <span className="a-num" style={{ display: 'inline-flex', alignItems: 'center', gap: '6px', fontSize: '14px', color: 'var(--lantern-gold)', whiteSpace: 'nowrap' }}>
          <svg width="14" height="14" viewBox="0 0 16 16" aria-hidden="true" style={{ flex: 'none' }}>
            <circle cx="8" cy="8" r="6.25" style={{ fill: 'none', stroke: 'var(--lantern-gold)', strokeWidth: '1.5' }} />
            <path d="M8 1.75a6.25 6.25 0 0 1 0 12.5a2.6 6.25 0 0 0 0-12.5z" style={{ fill: 'var(--lantern-gold)' }} />
          </svg>
          AI{' '}{now.aiText}
        </span>
        {now.notConfirmed ? (
          <span className="a-num" style={{ fontSize: '20px', fontWeight: '300', lineHeight: '1', whiteSpace: 'nowrap' }}>Final{' '}{now.scoreText}</span>
        ) : (
          <span className="a-num" style={{ display: 'inline-flex', alignItems: 'center', gap: '6px', whiteSpace: 'nowrap' }}>
            <svg width="14" height="14" viewBox="0 0 16 16" aria-hidden="true" style={{ flex: 'none' }}>
              <circle cx="8" cy="8" r="6.25" style={{ fill: 'none', stroke: 'var(--ivory)', strokeWidth: '1.5' }} />
              <circle cx="8" cy="8" r="6.25" style={{ fill: 'var(--ivory)' }} />
            </svg>
            <span style={{ fontSize: '15px', fontWeight: '500' }}>Confirmed</span>
            <span style={{ fontSize: '20px', fontWeight: '300', lineHeight: '1' }}>{now.scoreText}</span>
          </span>
        )}
        <a href="#final-h" className="a-btn a-btn-secondary" style={{ marginLeft: 'auto', flex: 'none', height: '44px', padding: '0 14px', borderRadius: '12px', border: '1px solid var(--night-edge)', background: 'transparent', color: 'var(--ivory)', fontSize: '15px', fontWeight: '500', textDecoration: 'none', display: 'inline-flex', alignItems: 'center' }}>
          Review score
        </a>
      </div>
    </div>
  )
}

function viewOf(d, s) {
  if (s.view) return s.view
  return d.status === 'Finalized' ? 'confirmed' : 'pending'
}

function turnById(d, id) {
  if (!d || !id) return null
  const [, qi, ti] = id.split('-').slice(-3)
  return d.questions[Number(qi)]?.turns[Number(ti)] ?? null
}
