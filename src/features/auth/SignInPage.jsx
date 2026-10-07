import { Fragment, useEffect, useState } from 'react'
import { Link, useLocation, useNavigate } from 'react-router-dom'
import { homeFor, paths } from '../../app/routes/paths.js'
import { useMergeState } from '../../hooks/useMergeState.js'
import { prefersReducedMotion } from '../../hooks/useNow.js'
import { useTimeouts } from '../../hooks/useTimeouts.js'
import { useAuth } from './AuthContext.jsx'
import './Main.css'

// The sample exam on the left plays the wireframe's timeline: a question read aloud,
// a spoken answer, a follow-up, then the loop turns back. Sample data.
const Q1 = 'When would you choose a modular monolith over microservices for a new product?'
const A1 = 'For a new product with a small team. One deployment is simpler, and the module boundaries let us split a service out later.'
const F1 = 'You said the boundaries let you split a service out later. What would make that split hard?'
const A2 = 'Shared tables. If two modules write to the same tables, we have to separate the data first.'
const PER = 170, WPS = 260, TD = 950
const q1w = Q1.split(' '), a1w = A1.split(' '), f1w = F1.split(' '), a2w = A2.split(' ')
const R1s = 300, R1e = R1s + q1w.length * PER
const A1s = R1e + 400, A1e = A1s + a1w.length * WPS
const T1s = A1e + 700, T1e = T1s + TD
const R2s = T1e + 150, R2e = R2s + f1w.length * PER
const A2s = R2e + 400, A2e = A2s + a2w.length * WPS
const T2s = A2e + 900, T2e = T2s + TD
const LOOP = T2e + 600

function face(kind, tm, rs, as, qws, aws, fresh) {
  const cur = fresh || tm < rs ? -1 : Math.min(qws.length, Math.floor((tm - rs) / PER))
  const reading = cur < qws.length
  const n = fresh || tm < as ? 0 : Math.min(aws.length, Math.floor((tm - as) / WPS) + 1)
  const rec = !reading && n < aws.length
  const saved = !reading && n >= aws.length
  const sec = rec ? Math.max(0, 90 - Math.floor(Math.max(0, tm - as) / 1000)) : 90
  const s = sec % 60
  return {
    cls: '',
    words: qws.map((w, i) => ({ w, sp: i < qws.length - 1 ? ' ' : '', cls: i < cur ? 'a-read' : '', c: i === cur ? 'var(--lantern-gold)' : 'var(--ivory)', o: cur >= 0 && i <= cur ? 1 : 0.5 })),
    tag: kind === 'q' ? 'Sample question' : 'Sample follow-up 1 of 2',
    about: kind === 'q' ? 'SWD392 Software Architecture and Design' : 'asked because your answer left a point open',
    reading, rec, saved,
    readText: kind === 'q' ? 'AIVES is reading the question' : 'AIVES asks a follow-up',
    savedText: 'Answer saved',
    m: Math.floor(sec / 60), tens: Math.floor(s / 10), ones: s % 10,
    tensCls: '', onesCls: rec ? (sec % 2 ? 'a-tick-a' : 'a-tick-b') : '',
    said: aws.slice(0, n).map((w, i) => ({ w, sp: ' ', c: n < aws.length && i >= n - 3 ? 'var(--ivory-3)' : 'var(--ivory)' })),
    empty: n === 0,
    emptyText: reading ? 'Your answer starts after the question.' : 'Your words appear here as you speak.',
  }
}

const NOTICE_OF = { invalid_credentials: 'wrong', account_deactivated: 'off', google_not_linked: 'google' }

export default function SignInPage() {
  const { signIn, signInWithGoogle } = useAuth()
  const navigate = useNavigate()
  const location = useLocation()
  const [s, setState] = useMergeState(() => (prefersReducedMotion() ? { t: R1e, paused: true } : { t: 0 }))
  const [form, setForm] = useState({ login: '', password: '' })
  const [notice, setNotice] = useState(null) // { kind, message }
  const [busy, setBusy] = useState(false)
  const { later, clear } = useTimeouts()

  useEffect(() => {
    const iv = setInterval(() => setState((p) => (p.paused || p.quiet ? {} : { t: ((p.t ?? 0) + 100) % LOOP })), 100)
    return () => clearInterval(iv)
  }, [setState])

  const goHome = (u) => navigate(location.state?.from ?? homeFor(u.role), { replace: true })

  const submit = async (e) => {
    e.preventDefault()
    if (busy) return
    if (!form.login.trim() || !form.password) { setNotice({ kind: 'wrong' }); return }
    setBusy(true)
    try {
      goHome(await signIn(form.login.trim(), form.password))
    } catch (err) {
      setNotice({ kind: NOTICE_OF[err.code] ?? 'other', message: err.message })
      setBusy(false)
    }
  }

  const google = async () => {
    if (busy) return
    setBusy(true)
    try {
      const res = await signInWithGoogle()
      if (res.firstSignIn) navigate(paths.welcome, { replace: true })
      else goHome(res.user)
    } catch (err) {
      setNotice({ kind: NOTICE_OF[err.code] ?? 'other', message: err.message })
      setBusy(false)
    }
  }

  // the sample dims while the form has focus, so it never competes with typing
  const hush = () => { clear(); setState({ quiet: true }) }
  const wake = () => { clear(); later(() => setState({ quiet: false }), 150) }

  const tm = s.t ?? 0
  const quiet = !!s.quiet
  const kind = notice?.kind ?? ''
  const pwShown = !!s.pw
  const q1 = (fresh) => face('q', tm, R1s, A1s, q1w, a1w, fresh)
  const f1 = (fresh) => face('f', tm, R2s, A2s, f1w, a2w, fresh)
  let faces, prevQ = ''
  const turning = (tm >= T1s && tm < T1e) || (tm >= T2s && tm < T2e)
  if (tm < T1s) faces = [q1(false)]
  else if (tm < T1e) { faces = [{ ...q1(false), cls: 'a-turn-out' }, { ...f1(true), cls: 'a-turn-in' }]; prevQ = Q1 }
  else if (tm < T2s) faces = [f1(false)]
  else if (tm < T2e) { faces = [{ ...f1(false), cls: 'a-turn-out' }, { ...q1(true), cls: 'a-turn-in' }]; prevQ = F1 }
  else faces = [q1(true)]
  const live = faces[faces.length - 1]
  const reading = !turning && live.reading && live.words.some((w) => w.o === 1)
  const rec = !turning && live.rec
  const k = quiet ? 0.3 : 1

  const v = {
    faces, turning, prevQ,
    aiLight: ((reading ? 1 : rec ? 0.12 : 0.3) * k).toFixed(2),
    voiceLight: ((rec ? 1 : 0) * k).toFixed(2),
    demoO: quiet ? 0.55 : 1,
    paused: !!s.paused,
    playing: !s.paused,
    pauseLabel: s.paused ? 'Play sample' : 'Pause sample',
    demoCls: s.paused ? 's-paused' : '',
    togglePause: () => setState((p) => ({ paused: !p.paused })),
    hush, wake,
    showWrong: kind === 'wrong',
    showDeactivated: kind === 'off',
    showGoogle: kind === 'google',
    showOther: kind === 'other',
    otherMessage: notice?.message,
    bad: kind === 'wrong',
    describedBy: kind ? 'signin-notice' : undefined,
    pwShown, pwHidden: !pwShown,
    pwType: pwShown ? 'text' : 'password',
    pwLabel: pwShown ? 'Hide password' : 'Show password',
    togglePw: () => setState((p) => ({ pw: !p.pw })),
  }
  return (
    <div className="pg-main" style={{ position: "relative", minHeight: "100vh", display: "flex", flexDirection: "column", overflow: "hidden" }}>
      <header className="a-top a-gutter" style={{ position: "relative", zIndex: "2", height: "72px", padding: "0 64px", display: "flex", alignItems: "center", gap: "18px", borderBottom: "1px solid var(--night-line)" }}>
        <span style={{ fontSize: "19px", fontWeight: "600", letterSpacing: "0.06em" }}>
          AIVES
        </span>
      </header>
      <main className="a-gutter s-grid" style={{ position: "relative", zIndex: "1", flex: "1", width: "100%", maxWidth: "1440px", margin: "0 auto", display: "grid", gridTemplateColumns: "minmax(0, 1fr) 400px", gridTemplateAreas: "'head form' 'demo form'", gridTemplateRows: "auto 1fr", alignContent: "stretch", minHeight: "calc(100vh - 72px)", columnGap: "88px", rowGap: "56px", padding: "88px 64px 72px" }}>
        <h1 className="a-display" style={{ gridArea: "head", maxWidth: "760px", fontFamily: "Alegreya, Georgia, serif", fontWeight: "500", fontSize: "52px", lineHeight: "1.08", letterSpacing: "-0.012em", textWrap: "balance" }}>
          Oral exams, asked aloud by AI and decided by your lecturer.
        </h1>
        <div className="s-form" onFocus={v.hush} onBlur={v.wake} style={{ gridArea: "form", alignSelf: "start", justifySelf: "end", width: "100%", maxWidth: "400px", display: "flex", flexDirection: "column", gap: "24px" }}>
          <h2 style={{ fontSize: "24px", fontWeight: "500", lineHeight: "1.3", letterSpacing: "-0.005em" }}>
            Sign in
          </h2>
          {v.showWrong && (
            <>
              <div id="signin-notice" role="alert" className="a-rise" style={{ display: "grid", gridTemplateColumns: "18px minmax(0, 1fr)", columnGap: "12px", padding: "14px 16px", borderRadius: "12px", background: "var(--red-wash-night)", border: "1px solid rgba(255,106,79,0.4)" }}>
                <svg width="18" height="18" viewBox="0 0 24 24" aria-hidden="true" style={{ marginTop: "2px", fill: "none", stroke: "var(--ember-text)", strokeWidth: "1.75", strokeLinecap: "round", strokeLinejoin: "round" }}>
                  <path d="M12 4 21 19.5H3z" />
                  <path d="M12 10v4.5" />
                  <path d="M12 17.2v.01" />
                </svg>
                <p style={{ fontSize: "14.5px", lineHeight: "1.5" }}>
                  <span style={{ fontWeight: "500", color: "var(--ember-text)" }}>
                    That account name, email or password is not right.
                  </span>
                  {' '}Check it and try again, or use Forgot password.
                </p>
              </div>
            </>
          )}
          {v.showOther && (
            <div id="signin-notice" role="alert" className="a-rise" style={{ display: "grid", gridTemplateColumns: "18px minmax(0, 1fr)", columnGap: "12px", padding: "14px 16px", borderRadius: "12px", background: "var(--red-wash-night)", border: "1px solid rgba(255,106,79,0.4)" }}>
              <svg width="18" height="18" viewBox="0 0 24 24" aria-hidden="true" style={{ marginTop: "2px", fill: "none", stroke: "var(--ember-text)", strokeWidth: "1.75", strokeLinecap: "round", strokeLinejoin: "round" }}>
                <path d="M12 4 21 19.5H3z" />
                <path d="M12 10v4.5" />
                <path d="M12 17.2v.01" />
              </svg>
              <p style={{ fontSize: "14.5px", lineHeight: "1.5" }}>
                <span style={{ fontWeight: "500", color: "var(--ember-text)" }}>{v.otherMessage}</span>
              </p>
            </div>
          )}
          {v.showDeactivated && (
            <>
              <div id="signin-notice" role="alert" className="a-rise" style={{ display: "grid", gridTemplateColumns: "18px minmax(0, 1fr)", columnGap: "12px", padding: "14px 16px", borderRadius: "12px", background: "var(--red-wash-night)", border: "1px solid rgba(255,106,79,0.4)" }}>
                <svg width="18" height="18" viewBox="0 0 24 24" aria-hidden="true" style={{ marginTop: "2px", fill: "none", stroke: "var(--ember-text)", strokeWidth: "1.75", strokeLinecap: "round", strokeLinejoin: "round" }}>
                  <circle cx="12" cy="12" r="8.5" />
                  <path d="M6 6l12 12" />
                </svg>
                <p style={{ fontSize: "14.5px", lineHeight: "1.5" }}>
                  <span style={{ fontWeight: "500", color: "var(--ember-text)" }}>
                    This account is deactivated.
                  </span>
                  {' '}Contact your administrator.
                </p>
              </div>
            </>
          )}
          {v.showGoogle && (
            <>
              <div id="signin-notice" role="status" className="a-rise" style={{ display: "grid", gridTemplateColumns: "18px minmax(0, 1fr)", columnGap: "12px", padding: "14px 16px", borderRadius: "12px", background: "rgba(123,196,196,0.12)", border: "1px solid var(--night-line)" }}>
                <svg width="18" height="18" viewBox="0 0 24 24" aria-hidden="true" style={{ marginTop: "2px", fill: "none", stroke: "var(--jade)", strokeWidth: "1.75", strokeLinecap: "round", strokeLinejoin: "round" }}>
                  <circle cx="12" cy="12" r="9" />
                  <path d="M12 11v5" />
                  <path d="M12 7.6v.01" />
                </svg>
                <p style={{ fontSize: "14.5px", lineHeight: "1.5" }}>
                  <span style={{ fontWeight: "500" }}>
                    This Google email belongs to an AIVES account that is not linked to Google.
                  </span>
                  {' '}Sign in with your password, then link Google in Account settings. No password yet? Use{' '}
                  <Link className="a-link" to={paths.forgotPassword} style={{ color: "var(--ivory)" }}>
                    Forgot password
                  </Link>
                  {' '}to get a setup link.
                </p>
              </div>
            </>
          )}
          <form onSubmit={submit} noValidate aria-label="Sign in with account name or email" style={{ display: "flex", flexDirection: "column", gap: "20px" }}>
            <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
              <label htmlFor="login-id" style={{ fontSize: "14px", fontWeight: "500" }}>
                Account name or email
              </label>
              <input id="login-id" className="a-field" type="text" value={form.login} onChange={(e) => setForm((f) => ({ ...f, login: e.target.value }))} autoComplete="username" placeholder="minhanh.se18" aria-invalid={v.bad} aria-describedby={v.describedBy} style={{ width: "100%", height: "48px", padding: "0 14px", borderRadius: "12px", border: "1px solid var(--night-edge)", background: "var(--night-field)", fontSize: "16px", fontWeight: "400", color: "var(--ivory)" }} />
            </div>
            <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", gap: "12px" }}>
                <label htmlFor="login-password" style={{ fontSize: "14px", fontWeight: "500" }}>
                  Password
                </label>
                <Link className="a-link" to={paths.forgotPassword} style={{ fontSize: "14px", fontWeight: "400", color: "var(--ivory-2)" }}>
                  Forgot password?
                </Link>
              </div>
              <div style={{ position: "relative" }}>
                <input id="login-password" className="a-field" type={v.pwType} value={form.password} onChange={(e) => setForm((f) => ({ ...f, password: e.target.value }))} autoComplete="current-password" aria-invalid={v.bad} aria-describedby={v.describedBy} style={{ width: "100%", height: "48px", padding: "0 52px 0 14px", borderRadius: "12px", border: "1px solid var(--night-edge)", background: "var(--night-field)", fontSize: "16px", fontWeight: "400", color: "var(--ivory)" }} />
                <button type="button" className="a-btn a-btn-quiet" aria-label={v.pwLabel} aria-pressed={v.pwShown} onClick={v.togglePw} style={{ position: "absolute", right: "2px", top: "2px", width: "44px", height: "44px", display: "grid", placeItems: "center", padding: "0", border: "0", borderRadius: "10px", background: "transparent", color: "var(--ivory-2)" }}>
                  {v.pwHidden && (
                    <>
                      <svg width="18" height="18" viewBox="0 0 24 24" aria-hidden="true" style={{ fill: "none", stroke: "currentColor", strokeWidth: "1.75", strokeLinecap: "round", strokeLinejoin: "round" }}>
                        <path d="M2.5 12S6 5.5 12 5.5 21.5 12 21.5 12 18 18.5 12 18.5 2.5 12 2.5 12z" />
                        <circle cx="12" cy="12" r="3" />
                      </svg>
                    </>
                  )}
                  {v.pwShown && (
                    <>
                      <svg width="18" height="18" viewBox="0 0 24 24" aria-hidden="true" style={{ fill: "none", stroke: "currentColor", strokeWidth: "1.75", strokeLinecap: "round", strokeLinejoin: "round" }}>
                        <path d="M10.6 5.6A9.6 9.6 0 0 1 12 5.5c6 0 9.5 6.5 9.5 6.5a17 17 0 0 1-2.6 3.4" />
                        <path d="M6.5 7.2C3.9 8.9 2.5 12 2.5 12S6 18.5 12 18.5c1.9 0 3.5-.6 4.9-1.5" />
                        <path d="M9.9 9.9a3 3 0 0 0 4.2 4.2" />
                        <path d="M3 3l18 18" />
                      </svg>
                    </>
                  )}
                </button>
              </div>
            </div>
            <button type="submit" className="a-btn a-btn-primary" aria-disabled={busy ? 'true' : undefined} aria-busy={busy} style={{ marginTop: "4px", height: "52px", display: "flex", alignItems: "center", justifyContent: "center", padding: "0 24px", border: "0", borderRadius: "14px", background: "var(--ivory)", color: "var(--night-indigo)", fontSize: "16px", fontWeight: "500", textDecoration: "none", boxShadow: "0 10px 28px -12px rgba(0,0,0,0.55)" }}>
              Sign in
            </button>
          </form>
          <div style={{ display: "flex", alignItems: "center", gap: "14px", fontSize: "13.5px", color: "var(--ivory-3)" }}>
            <span aria-hidden="true" style={{ flex: "1", height: "1px", background: "var(--night-line)" }} />
            <span>
              or
            </span>
            <span aria-hidden="true" style={{ flex: "1", height: "1px", background: "var(--night-line)" }} />
          </div>
          <button type="button" onClick={google} className="a-btn a-btn-secondary" aria-disabled={busy ? 'true' : undefined} style={{ height: "44px", display: "flex", alignItems: "center", justifyContent: "center", gap: "10px", padding: "0 18px", borderRadius: "12px", border: "1px solid var(--night-edge)", background: "transparent", color: "var(--ivory)", fontSize: "15px", fontWeight: "500", textDecoration: "none" }}>
            <svg width="18" height="18" viewBox="0 0 24 24" aria-hidden="true" style={{ fill: "none", stroke: "currentColor", strokeWidth: "1.75", strokeLinecap: "round", strokeLinejoin: "round" }}>
              <path d="M20 12.2h-7.6" />
              <path d="M20 12.2A8 8 0 1 1 17.5 6.3" />
            </svg>
            Continue with Google
          </button>
          <div style={{ display: "flex", flexDirection: "column", gap: "10px", paddingTop: "20px", borderTop: "1px solid var(--night-line)" }}>
            <p style={{ fontSize: "15px", lineHeight: "1.5", color: "var(--ivory-2)" }}>
              New to AIVES?{' '}
              <Link className="a-link" to={paths.register} style={{ fontWeight: "500", color: "var(--ivory)" }}>
                Create a student account
              </Link>
            </p>
            <p style={{ fontSize: "13.5px", lineHeight: "1.45", color: "var(--ivory-3)" }}>
              Lecturers and administrators get their account by email from an administrator.
            </p>
          </div>
        </div>
        <section aria-label="How an exam sounds, sample" className={v.demoCls} style={{ gridArea: "demo", position: "relative", alignSelf: "end", paddingBottom: "8px", opacity: v.demoO, transition: "opacity .4s ease-out" }}>
          <div aria-hidden="true" style={{ position: "absolute", inset: "0", pointerEvents: "none", zIndex: "0" }}>
            <div className="a-light" style={{ left: "calc(8% - 120px)", bottom: "-420px", width: "980px", height: "760px", opacity: v.voiceLight }}>
              <div className="a-light-voice" style={{ position: "absolute", inset: "0", borderRadius: "50%", background: "radial-gradient(closest-side, rgba(245,170,20,0.34), rgba(232,69,44,0.26) 38%, rgba(232,69,44,0.08) 70%, rgba(232,69,44,0) 100%)" }} />
            </div>
            <div className="a-light" style={{ left: "6%", top: "-170px", width: "760px", height: "420px", opacity: v.aiLight }}>
              <div className="a-light-ai" style={{ position: "absolute", inset: "0", borderRadius: "50%", background: "radial-gradient(closest-side, rgba(245,183,0,0.22), rgba(214,120,30,0.08) 55%, rgba(214,120,30,0) 100%)" }} />
            </div>
            {v.turning && (
              <>
                <div className="a-light a-flare" style={{ left: "-6%", top: "-170px", width: "900px", height: "560px", background: "radial-gradient(closest-side, rgba(245,183,0,0.30), rgba(220,120,36,0.16) 50%, rgba(220,120,36,0) 100%)" }} />
              </>
            )}
          </div>
          <p style={{ position: "absolute", width: "1px", height: "1px", overflow: "hidden", clipPath: "inset(50%)", whiteSpace: "nowrap" }}>
            Sample: AIVES reads a question aloud, you answer by voice, and your words appear as you speak.
          </p>
          <div className="a-turn-stage s-stage" aria-hidden="true" style={{ position: "relative", zIndex: "1", display: "grid", marginLeft: "-64px", padding: "12px 0 24px 64px" }}>
            {v.turning && (
              <>
                <div className="a-silhouette s-quote s-sil" aria-hidden="true" style={{ position: "absolute", left: "64px", top: "12px", maxWidth: "760px", fontFamily: "Alegreya, Georgia, serif", fontWeight: "500", fontSize: "26px", lineHeight: "1.28" }}>
                  {v.prevQ}
                </div>
              </>
            )}
            {v.faces.map((f, f_i) => (
              <Fragment key={f.key ?? f_i}>
                <div className={`s-face ${f.cls}`} style={{ gridArea: "1 / 1", display: "flex", flexDirection: "column", minWidth: "0" }}>
                  <p className="s-quote" style={{ maxWidth: "760px", minHeight: "67px", fontFamily: "Alegreya, Georgia, serif", fontWeight: "500", fontSize: "26px", lineHeight: "1.28", textWrap: "balance" }}>
                    {f.words.map((w, w_i) => (
                      <Fragment key={w.key ?? w_i}>
                        <span className={w.cls} style={{ color: w.c, opacity: w.o }}>
                          {w.w}
                        </span>
                        {w.sp}
                      </Fragment>
                    ))}
                  </p>
                  <p style={{ marginTop: "12px", fontSize: "14px", lineHeight: "1.4", color: "var(--jade)" }}>
                    <span style={{ fontWeight: "500" }}>
                      {f.tag}
                    </span>
                    {' '}·{' '}{f.about}
                  </p>
                  <div style={{ marginTop: "32px", display: "flex", flexWrap: "wrap", alignItems: "center", columnGap: "14px", rowGap: "4px", minHeight: "26px" }}>
                    {f.reading && (
                      <>
                        <span className="a-rise" style={{ display: "inline-flex", alignItems: "center", gap: "10px", fontSize: "15px", fontWeight: "500" }}>
                          <svg width="20" height="20" viewBox="0 0 26 26" aria-hidden="true" style={{ fill: "none", stroke: "var(--lantern-gold)", strokeWidth: "1.7", strokeLinecap: "round", strokeLinejoin: "round" }}>
                            <path d="M4 10.2h3.6L12.4 6v14l-4.8-4.2H4z" />
                            <path d="M16.4 9.6a5 5 0 0 1 0 6.8" />
                            <path d="M19.4 6.8a9 9 0 0 1 0 12.4" />
                          </svg>
                          {f.readText}
                        </span>
                      </>
                    )}
                    {f.rec && (
                      <>
                        <span className="a-rise" style={{ display: "inline-flex", alignItems: "center", gap: "10px", fontSize: "15px", fontWeight: "500" }}>
                          <svg width="20" height="20" viewBox="0 0 26 26" aria-hidden="true">
                            <circle cx="13" cy="13" r="10" style={{ fill: "none", stroke: "var(--lantern-red)", strokeWidth: "1.7" }} />
                            <circle className="a-rec" cx="13" cy="13" r="6.4" style={{ fill: "var(--lantern-red)" }} />
                          </svg>
                          Recording your answer
                        </span>
                        <span className="a-num a-rise" style={{ display: "inline-flex", alignItems: "baseline", paddingLeft: "14px", borderLeft: "1px solid var(--night-line)", fontSize: "14px", color: "var(--ivory-2)", whiteSpace: "nowrap" }}>
                          <span style={{ fontWeight: "500", color: "var(--ivory)", display: "inline-flex" }}>
                            <span style={{ display: "inline-block", width: "0.6em", textAlign: "center" }}>
                              {f.m}
                            </span>
                            <span style={{ display: "inline-block", width: "0.3em", textAlign: "center" }}>
                              :
                            </span>
                            <span style={{ display: "inline-block", width: "0.6em", textAlign: "center" }}>
                              <span className={f.tensCls}>
                                {f.tens}
                              </span>
                            </span>
                            <span style={{ display: "inline-block", width: "0.6em", textAlign: "center" }}>
                              <span className={f.onesCls}>
                                {f.ones}
                              </span>
                            </span>
                          </span>
                          {'\u00a0'}left of 1:30
                        </span>
                      </>
                    )}
                    {f.saved && (
                      <>
                        <span className="a-rise" style={{ display: "inline-flex", alignItems: "center", gap: "10px", fontSize: "15px", fontWeight: "500" }}>
                          <svg className="a-pop" width="20" height="20" viewBox="0 0 16 16" aria-hidden="true">
                            <circle cx="8" cy="8" r="6.25" style={{ fill: "none", stroke: "var(--ivory)", strokeWidth: "1.5" }} />
                            <circle className="a-moon-fill" cx="8" cy="8" r="6.25" style={{ fill: "var(--ivory)" }} />
                          </svg>
                          {f.savedText}
                        </span>
                      </>
                    )}
                  </div>
                  <p style={{ marginTop: "12px", maxWidth: "46em", minHeight: "60px", fontSize: "19px", lineHeight: "1.56" }}>
                    {f.said.map((s, s_i) => (
                      <Fragment key={s.key ?? s_i}>
                        <span className="a-word" style={{ color: s.c }}>
                          {s.w}
                        </span>
                        {s.sp}
                      </Fragment>
                    ))}
                    {f.empty && (
                      <>
                        <span style={{ color: "var(--ivory-3)" }}>
                          {f.emptyText}
                        </span>
                      </>
                    )}
                  </p>
                </div>
              </Fragment>
            ))}
          </div>
          <button type="button" className="a-btn a-btn-quiet" onClick={v.togglePause} style={{ position: "relative", zIndex: "1", marginTop: "4px", height: "44px", display: "inline-flex", alignItems: "center", gap: "10px", padding: "0 14px 0 0", border: "0", borderRadius: "10px", background: "transparent", color: "var(--ivory-2)", fontSize: "14px", fontWeight: "500" }}>
            {v.playing && (
              <>
                <svg width="16" height="16" viewBox="0 0 24 24" aria-hidden="true" style={{ fill: "none", stroke: "currentColor", strokeWidth: "1.75", strokeLinecap: "round", strokeLinejoin: "round" }}>
                  <path d="M8 5v14" />
                  <path d="M16 5v14" />
                </svg>
              </>
            )}
            {v.paused && (
              <>
                <svg width="16" height="16" viewBox="0 0 24 24" aria-hidden="true" style={{ fill: "none", stroke: "currentColor", strokeWidth: "1.75", strokeLinecap: "round", strokeLinejoin: "round" }}>
                  <path d="M7 4.5v15L19 12z" />
                </svg>
              </>
            )}
            {v.pauseLabel}
          </button>
        </section>
      </main>
    </div>
  )
}
