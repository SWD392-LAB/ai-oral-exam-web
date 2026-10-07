import { Link } from 'react-router-dom'
import { paths } from '../../app/routes/paths.js'
import { authApi } from '../../api/services.js'
import { USE_MOCKS } from '../../api/client.js'
import { useMergeState } from '../../hooks/useMergeState.js'
import { useTimeouts } from '../../hooks/useTimeouts.js'
import { PENDING } from '../../utils/pending.js'
import './Register.css'

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

export default function RegisterPage() {
  const [s, setState] = useMergeState({ phase: 'form', name: '', check: 'idle', email: '', pw: '', pw2: '', errs: {}, showPw: false, sentTo: '', suggestion: '', busy: false })
  const { later } = useTimeouts()
  const nameCheck = useTimeouts()

  // the account name is checked a moment after typing stops
  const typeName = (value) => {
    const n = value.trim()
    setState((p) => ({ name: value, check: n ? 'checking' : 'idle', errs: { ...p.errs, name: null } }))
    nameCheck.clear()
    if (!n) return
    nameCheck.later(() => {
      authApi.accountNameAvailability(n)
        .then((r) => setState((p) => (p.name.trim() === n ? { check: r.available ? 'free' : 'taken', suggestion: r.suggestion ?? '' } : {})))
        .catch(() => setState({ check: 'idle' }))
    }, 700)
  }
  const field = (key, value) => setState((p) => ({ [key]: value, errs: { ...p.errs, [key]: null } }))

  const submit = async () => {
    if (s.busy) return
    const n = s.name.trim()
    const em = s.email.trim()
    const e2 = {}
    if (!n) e2.name = 'Choose an account name.'
    if (!em) e2.email = 'Enter your email address.'
    else if (!EMAIL_RE.test(em)) e2.email = 'Check the address. It should look like name@example.com.'
    if (!s.pw) e2.pw = 'Enter a password.'
    if (!s.pw2) e2.pw2 = 'Type the password again.'
    else if (s.pw && s.pw2 !== s.pw) e2.pw2 = 'The two passwords do not match.'
    if (Object.keys(e2).length || s.check === 'taken') { setState({ errs: e2 }); return }
    setState({ busy: true })
    try {
      await authApi.register(n, em, s.pw)
      setState({ phase: 'turning', sentTo: em, errs: {}, busy: false })
      later(() => setState({ phase: 'sent' }), 950)
    } catch (err) {
      if (err.code === 'account_name_taken') setState({ check: 'taken', busy: false })
      else setState({ errs: { email: err.message }, busy: false })
    }
  }

  const turning = s.phase === 'turning'
  const errs = s.errs
  const name = s.name.trim()
  const v = {
    showForm: s.phase !== 'sent', showSent: s.phase !== 'form', turning,
    formCls: turning ? 'a-turn-out' : '', sentCls: turning ? 'a-turn-in' : '', formHidden: turning,
    name: s.name, email: s.email, pw: s.pw, pw2: s.pw2,
    shownName: name, suggestion: s.suggestion || `${name.toLowerCase()}.se18`,
    isChecking: !errs.name && s.check === 'checking',
    isFree: !errs.name && s.check === 'free',
    isTaken: !errs.name && s.check === 'taken',
    nameErr: errs.name || null,
    nameBad: !!errs.name || s.check === 'taken',
    emailErr: errs.email || null, emailBad: !!errs.email,
    pwErr: errs.pw || null, pwBad: !!errs.pw,
    pw2Err: errs.pw2 || null, pw2Bad: !!errs.pw2,
    showPw: s.showPw, pwType: s.showPw ? 'text' : 'password', slashO: s.showPw ? 1 : 0,
    pwToggleLabel: s.showPw ? 'Hide password' : 'Show password',
    sentTo: s.sentTo,
    onName: (e) => typeName(e.target.value),
    onEmail: (e) => field('email', e.target.value),
    onPw: (e) => field('pw', e.target.value),
    onPw2: (e) => field('pw2', e.target.value),
    useSuggestion: () => typeName(s.suggestion || `${name.toLowerCase()}.se18`),
    onFormSubmit: (e) => { e.preventDefault(); submit() },
    togglePw: () => setState((p) => ({ showPw: !p.showPw })),
    submit,
  }
  return (
    <div className="pg-register" style={{ position: "relative", minHeight: "100vh", display: "flex", flexDirection: "column", overflow: "hidden" }}>
      <header className="a-top a-gutter" style={{ position: "relative", zIndex: "2", height: "72px", padding: "0 64px", display: "flex", alignItems: "center", gap: "44px", borderBottom: "1px solid var(--night-line)" }}>
        <Link to={paths.signIn} aria-label="AIVES, go to sign in" style={{ fontSize: "19px", fontWeight: "600", letterSpacing: "0.06em", color: "var(--ivory)", textDecoration: "none", lineHeight: "72px" }}>
          AIVES
        </Link>
        <div style={{ marginLeft: "auto", display: "flex", alignItems: "center", gap: "16px", whiteSpace: "nowrap", fontSize: "14px" }}>
          <Link className="a-link" to={paths.signIn} style={{ fontSize: "14px", fontWeight: "400", color: "var(--ivory)" }}>
            Sign in
          </Link>
        </div>
      </header>
      <main className="a-turn-stage a-gutter r-main" style={{ position: "relative", zIndex: "1", flex: "1", width: "100%", maxWidth: "1440px", margin: "0 auto", display: "grid", alignItems: "start", padding: "88px 64px 72px" }}>
        {v.showForm && (
          <>
            <div className={v.formCls} aria-hidden={v.formHidden} style={{ gridArea: "1 / 1", minWidth: "0" }}>
              <div className="a-grid-1-sm" style={{ maxWidth: "none", display: "grid", gridTemplateColumns: "minmax(0, 1fr) 400px", columnGap: "88px", rowGap: "48px", alignItems: "start", padding: "0" }}>
                <div style={{ display: "flex", flexDirection: "column", minWidth: "0" }}>
                  <h1 className="a-display a-rise" style={{ animationDelay: "0ms", fontFamily: "Alegreya, Georgia, serif", fontWeight: "500", fontSize: "52px", lineHeight: "1.08", letterSpacing: "-0.012em", maxWidth: "9.5em", textWrap: "balance" }}>
                    Create your student account
                  </h1>
                  <p className="a-rise" style={{ animationDelay: "0ms", marginTop: "20px", maxWidth: "30em", fontSize: "16.5px", lineHeight: "1.5", color: "var(--ivory-2)" }}>
                    New accounts are student accounts. Lecturer and administrator accounts come from an administrator.
                  </p>
                  <ol aria-label="Steps to your account" className="a-rise a-wrap-sm" style={{ animationDelay: "0ms", marginTop: "48px", display: "flex", alignItems: "center", rowGap: "14px", columnGap: "0", fontSize: "15px" }}>
                    <li aria-current="step" style={{ display: "flex", alignItems: "center", gap: "10px", whiteSpace: "nowrap", marginRight: "16px" }}>
                      <svg width="20" height="20" viewBox="0 0 16 16" aria-hidden="true" style={{ flex: "none" }}>
                        <circle cx="8" cy="8" r="6.25" style={{ fill: "none", stroke: "var(--lantern-red)", strokeWidth: "1.5" }} />
                        <path d="M8 1.75a6.25 6.25 0 0 1 0 12.5a2.6 6.25 0 0 0 0-12.5z" style={{ fill: "var(--lantern-red)" }} />
                      </svg>
                      <span style={{ fontWeight: "500", color: "var(--ivory)" }}>
                        Your details
                      </span>
                    </li>
                    <li aria-hidden="true" className="a-hide-sm" style={{ width: "40px", height: "1px", margin: "0 16px 0 0", background: "rgba(246,241,231,0.22)" }} />
                    <li style={{ display: "flex", alignItems: "center", gap: "10px", whiteSpace: "nowrap", marginRight: "16px" }}>
                      <svg width="20" height="20" viewBox="0 0 16 16" aria-hidden="true" style={{ flex: "none" }}>
                        <circle cx="8" cy="8" r="6.25" style={{ fill: "none", stroke: "var(--ivory-2)", strokeWidth: "1.5" }} />
                      </svg>
                      <span style={{ color: "var(--ivory-2)" }}>
                        Confirm your email
                      </span>
                    </li>
                    <li aria-hidden="true" className="a-hide-sm" style={{ width: "40px", height: "1px", margin: "0 16px 0 0", background: "rgba(246,241,231,0.22)" }} />
                    <li style={{ display: "flex", alignItems: "center", gap: "10px", whiteSpace: "nowrap" }}>
                      <svg width="20" height="20" viewBox="0 0 16 16" aria-hidden="true" style={{ flex: "none" }}>
                        <circle cx="8" cy="8" r="6.25" style={{ fill: "none", stroke: "var(--ivory-2)", strokeWidth: "1.5" }} />
                      </svg>
                      <span style={{ color: "var(--ivory-2)" }}>
                        Sign in
                      </span>
                    </li>
                  </ol>
                </div>
                <form aria-label="Create account" onSubmit={v.onFormSubmit} className="a-rise" style={{ animationDelay: "60ms", display: "flex", flexDirection: "column", gap: "22px", minWidth: "0" }}>
                  <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", flexWrap: "wrap", columnGap: "12px", rowGap: "2px" }}>
                      <label htmlFor="r-name" style={{ fontSize: "14px", fontWeight: "500" }}>
                        Account name
                      </label>
                      <span style={{ fontSize: "13.5px", color: "var(--ivory-3)" }}>
                        You sign in with it. It never changes.
                      </span>
                    </div>
                    <input id="r-name" className="a-field" type="text" autoComplete="username" spellCheck="false" placeholder="minhanh.se18" value={v.name} onChange={v.onName} aria-invalid={v.nameBad} aria-describedby="r-name-status" style={{ width: "100%", height: "48px", padding: "0 14px", borderRadius: "12px", border: "1px solid var(--night-edge)", background: "var(--night-field)", fontSize: "16px", fontWeight: "400", color: "var(--ivory)" }} />
                    <p id="r-name-status" aria-live="polite" style={{ minHeight: "20px", display: "flex", alignItems: "center", gap: "8px", fontSize: "13.5px", lineHeight: "1.4" }}>
                      {v.isChecking && (
                        <>
                          <span aria-hidden="true" className="a-candle" style={{ flex: "none", width: "7px", height: "7px", margin: "0 4px", borderRadius: "50%", background: "var(--jade)" }} />
                          <span style={{ color: "var(--ivory-3)" }}>
                            Checking…
                          </span>
                        </>
                      )}
                      {v.isFree && (
                        <>
                          <svg className="a-pop" width="16" height="16" viewBox="0 0 24 24" aria-hidden="true" style={{ flex: "none", fill: "none", stroke: "var(--jade)", strokeWidth: "2", strokeLinecap: "round", strokeLinejoin: "round" }}>
                            <path d="M4.5 12.5 9.5 17.5 19.5 6.5" />
                          </svg>
                          <span className="a-rise" style={{ color: "var(--jade)" }}>
                            <span style={{ fontWeight: "500" }}>
                              {v.shownName}
                            </span>
                            {' '}is free
                          </span>
                        </>
                      )}
                      {v.isTaken && (
                        <>
                          <svg className="a-pop" width="18" height="18" viewBox="0 0 24 24" aria-hidden="true" style={{ flex: "none", fill: "none", stroke: "var(--ember-text)", strokeWidth: "1.75", strokeLinecap: "round", strokeLinejoin: "round" }}>
                            <path d="M12 4 21 19.5H3z" />
                            <path d="M12 10v4.5" />
                            <path d="M12 17.2v.01" />
                          </svg>
                          <span className="a-rise" style={{ color: "var(--ember-text)" }}>
                            <span style={{ fontWeight: "500" }}>
                              {v.shownName}
                            </span>
                            {' '}is taken.
                          </span>
                          <button type="button" className="a-link a-rise" onClick={v.useSuggestion} style={{ padding: "0", border: "0", background: "transparent", cursor: "pointer", fontSize: "13.5px", fontWeight: "500", color: "var(--ivory)" }}>
                            Use{' '}{v.suggestion}
                          </button>
                        </>
                      )}
                      {v.nameErr && (
                        <>
                          <svg className="a-pop" width="18" height="18" viewBox="0 0 24 24" aria-hidden="true" style={{ flex: "none", fill: "none", stroke: "var(--ember-text)", strokeWidth: "1.75", strokeLinecap: "round", strokeLinejoin: "round" }}>
                            <path d="M12 4 21 19.5H3z" />
                            <path d="M12 10v4.5" />
                            <path d="M12 17.2v.01" />
                          </svg>
                          <span className="a-rise" style={{ color: "var(--ember-text)" }}>
                            {v.nameErr}
                          </span>
                        </>
                      )}
                    </p>
                  </div>
                  <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
                    <label htmlFor="r-email" style={{ fontSize: "14px", fontWeight: "500" }}>
                      Email
                    </label>
                    <input id="r-email" className="a-field" type="email" autoComplete="email" spellCheck="false" placeholder="name@example.com" value={v.email} onChange={v.onEmail} aria-invalid={v.emailBad} aria-describedby="r-email-err" style={{ width: "100%", height: "48px", padding: "0 14px", borderRadius: "12px", border: "1px solid var(--night-edge)", background: "var(--night-field)", fontSize: "16px", fontWeight: "400", color: "var(--ivory)" }} />
                    {v.emailErr && (
                      <>
                        <p id="r-email-err" className="a-rise" style={{ display: "flex", alignItems: "center", gap: "8px", fontSize: "13.5px", lineHeight: "1.4", color: "var(--ember-text)" }}>
                          <svg width="18" height="18" viewBox="0 0 24 24" aria-hidden="true" style={{ flex: "none", fill: "none", stroke: "var(--ember-text)", strokeWidth: "1.75", strokeLinecap: "round", strokeLinejoin: "round" }}>
                            <path d="M12 4 21 19.5H3z" />
                            <path d="M12 10v4.5" />
                            <path d="M12 17.2v.01" />
                          </svg>
                          {v.emailErr}
                        </p>
                      </>
                    )}
                  </div>
                  <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
                    <label htmlFor="r-pw" style={{ fontSize: "14px", fontWeight: "500" }}>
                      Password
                    </label>
                    <div style={{ position: "relative" }}>
                      <input id="r-pw" className="a-field" type={v.pwType} autoComplete="new-password" value={v.pw} onChange={v.onPw} aria-invalid={v.pwBad} aria-describedby="r-pw-rules r-pw-err" style={{ width: "100%", height: "48px", padding: "0 56px 0 14px", borderRadius: "12px", border: "1px solid var(--night-edge)", background: "var(--night-field)", fontSize: "16px", fontWeight: "400", color: "var(--ivory)" }} />
                      <button type="button" className="a-btn a-btn-quiet" onClick={v.togglePw} aria-label={v.pwToggleLabel} aria-pressed={v.showPw} style={{ position: "absolute", right: "2px", top: "2px", width: "44px", height: "44px", display: "grid", placeItems: "center", padding: "0", border: "0", borderRadius: "10px", background: "transparent", color: "var(--ivory-2)" }}>
                        <svg width="18" height="18" viewBox="0 0 24 24" aria-hidden="true" style={{ fill: "none", stroke: "currentColor", strokeWidth: "1.75", strokeLinecap: "round", strokeLinejoin: "round" }}>
                          <path d="M2.5 12S6 5.5 12 5.5 21.5 12 21.5 12 18 18.5 12 18.5 2.5 12 2.5 12z" />
                          <circle cx="12" cy="12" r="3" />
                          <path d="M4 4l16 16" style={{ opacity: v.slashO, transition: "opacity .2s ease-out" }} />
                        </svg>
                      </button>
                    </div>
                    <p id="r-pw-rules" style={{ fontSize: "13.5px", lineHeight: "1.4", color: "var(--ivory-3)" }}>
                      {PENDING.passwordRules}
                    </p>
                    {v.pwErr && (
                      <>
                        <p id="r-pw-err" className="a-rise" style={{ display: "flex", alignItems: "center", gap: "8px", fontSize: "13.5px", lineHeight: "1.4", color: "var(--ember-text)" }}>
                          <svg width="18" height="18" viewBox="0 0 24 24" aria-hidden="true" style={{ flex: "none", fill: "none", stroke: "var(--ember-text)", strokeWidth: "1.75", strokeLinecap: "round", strokeLinejoin: "round" }}>
                            <path d="M12 4 21 19.5H3z" />
                            <path d="M12 10v4.5" />
                            <path d="M12 17.2v.01" />
                          </svg>
                          {v.pwErr}
                        </p>
                      </>
                    )}
                  </div>
                  <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
                    <label htmlFor="r-pw2" style={{ fontSize: "14px", fontWeight: "500" }}>
                      Type the password again
                    </label>
                    <input id="r-pw2" className="a-field" type={v.pwType} autoComplete="new-password" value={v.pw2} onChange={v.onPw2} aria-invalid={v.pw2Bad} aria-describedby="r-pw2-err" style={{ width: "100%", height: "48px", padding: "0 14px", borderRadius: "12px", border: "1px solid var(--night-edge)", background: "var(--night-field)", fontSize: "16px", fontWeight: "400", color: "var(--ivory)" }} />
                    {v.pw2Err && (
                      <>
                        <p id="r-pw2-err" className="a-rise" style={{ display: "flex", alignItems: "center", gap: "8px", fontSize: "13.5px", lineHeight: "1.4", color: "var(--ember-text)" }}>
                          <svg width="18" height="18" viewBox="0 0 24 24" aria-hidden="true" style={{ flex: "none", fill: "none", stroke: "var(--ember-text)", strokeWidth: "1.75", strokeLinecap: "round", strokeLinejoin: "round" }}>
                            <path d="M12 4 21 19.5H3z" />
                            <path d="M12 10v4.5" />
                            <path d="M12 17.2v.01" />
                          </svg>
                          {v.pw2Err}
                        </p>
                      </>
                    )}
                  </div>
                  <button type="button" className="a-btn a-btn-primary" onClick={v.submit} style={{ marginTop: "10px", width: "100%", height: "52px", padding: "0 24px", border: "0", borderRadius: "14px", background: "var(--ivory)", color: "var(--night-indigo)", fontSize: "16px", fontWeight: "500", boxShadow: "0 10px 28px -12px rgba(0,0,0,0.55)" }}>
                    Create account
                  </button>
                  <p className="a-rise" style={{ animationDelay: "120ms", paddingTop: "18px", borderTop: "1px solid var(--night-line)", fontSize: "15px", color: "var(--ivory-2)" }}>
                    Already have an account?{' '}
                    <Link className="a-link" to={paths.signIn} style={{ fontWeight: "500", color: "var(--ivory)" }}>
                      Sign in
                    </Link>
                  </p>
                </form>
              </div>
            </div>
          </>
        )}
        {v.showSent && (
          <>
            <div className={v.sentCls} style={{ gridArea: "1 / 1", minWidth: "0" }}>
              <div className="a-grid-1-sm" style={{ maxWidth: "none", display: "grid", gridTemplateColumns: "minmax(0, 1fr) 400px", columnGap: "88px", rowGap: "48px", alignItems: "start", padding: "0" }}>
                <div style={{ display: "flex", flexDirection: "column", minWidth: "0" }}>
                  <h1 className="a-display" style={{ fontFamily: "Alegreya, Georgia, serif", fontWeight: "500", fontSize: "52px", lineHeight: "1.08", letterSpacing: "-0.012em", maxWidth: "9.5em", textWrap: "balance" }}>
                    Check your email
                  </h1>
                  <p className="a-rise" style={{ animationDelay: "0ms", marginTop: "20px", maxWidth: "30em", fontSize: "16.5px", lineHeight: "1.5", color: "var(--ivory-2)" }}>
                    Your account is ready once you open the confirmation link.
                  </p>
                  <ol aria-label="Steps to your account" className="a-wrap-sm" style={{ marginTop: "48px", display: "flex", alignItems: "center", rowGap: "14px", columnGap: "0", fontSize: "15px" }}>
                    <li style={{ display: "flex", alignItems: "center", gap: "10px", whiteSpace: "nowrap", marginRight: "16px" }}>
                      <svg width="20" height="20" viewBox="0 0 16 16" aria-hidden="true" style={{ flex: "none" }}>
                        <circle cx="8" cy="8" r="6.25" style={{ fill: "none", stroke: "var(--ivory)", strokeWidth: "1.5" }} />
                        <circle className="a-moon-fill" cx="8" cy="8" r="6.25" style={{ fill: "var(--ivory)", animationDelay: "60ms" }} />
                      </svg>
                      <span style={{ color: "var(--ivory-2)" }}>
                        Your details
                      </span>
                      <span style={{ position: "absolute", width: "1px", height: "1px", overflow: "hidden", clip: "rect(0 0 0 0)" }}>
                        , done
                      </span>
                    </li>
                    <li aria-hidden="true" className="a-hide-sm" style={{ width: "40px", height: "1px", margin: "0 16px 0 0", background: "rgba(246,241,231,0.22)" }} />
                    <li aria-current="step" style={{ display: "flex", alignItems: "center", gap: "10px", whiteSpace: "nowrap", marginRight: "16px" }}>
                      <svg className="a-pop" width="20" height="20" viewBox="0 0 16 16" aria-hidden="true" style={{ flex: "none", animationDelay: "120ms" }}>
                        <circle cx="8" cy="8" r="6.25" style={{ fill: "none", stroke: "var(--lantern-red)", strokeWidth: "1.5" }} />
                        <path d="M8 1.75a6.25 6.25 0 0 1 0 12.5a2.6 6.25 0 0 0 0-12.5z" style={{ fill: "var(--lantern-red)" }} />
                      </svg>
                      <span style={{ fontWeight: "500", color: "var(--ivory)" }}>
                        Confirm your email
                      </span>
                    </li>
                    <li aria-hidden="true" className="a-hide-sm" style={{ width: "40px", height: "1px", margin: "0 16px 0 0", background: "rgba(246,241,231,0.22)" }} />
                    <li style={{ display: "flex", alignItems: "center", gap: "10px", whiteSpace: "nowrap" }}>
                      <svg width="20" height="20" viewBox="0 0 16 16" aria-hidden="true" style={{ flex: "none" }}>
                        <circle cx="8" cy="8" r="6.25" style={{ fill: "none", stroke: "var(--ivory-2)", strokeWidth: "1.5" }} />
                      </svg>
                      <span style={{ color: "var(--ivory-2)" }}>
                        Sign in
                      </span>
                    </li>
                  </ol>
                </div>
                <div role="status" style={{ display: "flex", flexDirection: "column", minWidth: "0" }}>
                  <p className="a-rise" style={{ animationDelay: "60ms", fontSize: "14px", fontWeight: "500", color: "var(--ivory-2)" }}>
                    We sent a confirmation link to
                  </p>
                  <p className="a-rise" style={{ animationDelay: "60ms", marginTop: "8px", fontSize: "26px", lineHeight: "1.28", fontWeight: "300", overflowWrap: "anywhere" }}>
                    {v.sentTo}
                  </p>
                  <div role="note" className="a-rise" style={{ animationDelay: "120ms", marginTop: "32px", display: "grid", gridTemplateColumns: "18px minmax(0, 1fr)", columnGap: "12px", padding: "14px 16px", borderRadius: "12px", background: "rgba(123,196,196,0.12)", border: "1px solid var(--night-line)" }}>
                    <svg width="18" height="18" viewBox="0 0 24 24" aria-hidden="true" style={{ marginTop: "2px", fill: "none", stroke: "var(--jade)", strokeWidth: "1.75", strokeLinecap: "round", strokeLinejoin: "round" }}>
                      <circle cx="12" cy="12" r="9" />
                      <path d="M12 11v5" />
                      <path d="M12 7.6v.01" />
                    </svg>
                    <p style={{ fontSize: "14.5px", lineHeight: "1.5", color: "var(--ivory)" }}>
                      The link works once and expires. If it expires, use{' '}
                      <Link className="a-link" to={paths.forgotPassword} style={{ fontWeight: "500", color: "var(--ivory)" }}>
                        Forgot password
                      </Link>
                      {' '}on the sign-in page: the link it sends also confirms your email.
                    </p>
                  </div>
                  <Link to={paths.signIn} className="a-btn a-btn-primary a-rise" style={{ animationDelay: "120ms", marginTop: "32px", width: "100%", height: "52px", padding: "0 24px", display: "flex", alignItems: "center", justifyContent: "center", border: "0", borderRadius: "14px", background: "var(--ivory)", color: "var(--night-indigo)", fontSize: "16px", fontWeight: "500", textDecoration: "none", boxShadow: "0 10px 28px -12px rgba(0,0,0,0.55)" }}>
                    Back to sign in
                  </Link>
                </div>
              </div>
            </div>
          </>
        )}
      </main>
      {USE_MOCKS && (
        <footer className="a-gutter" style={{ position: "relative", zIndex: "1", padding: "20px 64px 28px", fontSize: "13.5px", lineHeight: "1.4", color: "var(--ivory-3)" }}>
          Sample data: the names and emails on this page are examples.
        </footer>
      )}
    </div>
  )
}
