import { Link } from 'react-router-dom'
import { paths } from '../../app/routes/paths.js'
import { USE_MOCKS } from '../../api/client.js'
import { authApi } from '../../api/services.js'
import { useMergeState } from '../../hooks/useMergeState.js'
import { useTimeouts } from '../../hooks/useTimeouts.js'
import { atLeast } from '../../utils/async.js'
import './ForgotPassword.css'

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/

// The answer is the same whether or not the email has an account (nobody can probe who is registered)
export default function ForgotPasswordPage() {
  const [s, setState] = useMergeState({ phase: 'form', email: '', tried: false, resend: 'idle', demoToken: null })
  const { later } = useTimeouts()
  // phases: form -> sending -> turning (lantern, .95 s) -> sent; sent -> back (lantern) -> form
  const { phase, email } = s
  const valid = EMAIL_RE.test(email.trim())
  const bad = s.tried && !valid && phase === 'form'
  const turning = phase === 'turning'
  const back = phase === 'back'
  const busy = phase === 'sending' || turning
  const send = async () => {
    if (phase !== 'form') return
    if (!valid) { setState({ tried: true }); return }
    setState({ phase: 'sending' })
    const res = await atLeast(authApi.forgotPassword(email.trim()).catch(() => null), 820)
    setState({ phase: 'turning', resend: 'idle', demoToken: res?.demoToken ?? null })
    later(() => setState({ phase: 'sent' }), 950)
  }
  const v = {
    showForm: phase !== 'sent',
    showSent: turning || back || phase === 'sent',
    showSentLink: phase === 'sent' && !!s.demoToken,
    demoLink: paths.emailLink(s.demoToken ?? ''),
    formCls: turning ? 'a-turn-out' : back ? 'a-turn-in' : '',
    sentCls: turning ? 'a-turn-in' : back ? 'a-turn-out' : '',
    formHidden: turning,
    sentHidden: back,
    email,
    typed: (e) => setState({ email: e.target.value }),
    keyed: (e) => { if (e.key === 'Enter') { e.preventDefault(); send() } },
    bad,
    errorText: email.trim() ? 'That does not look like an email. Check it, like name@example.com.' : 'Enter the email of your account, like name@example.com.',
    idle: !busy,
    sending: busy,
    sendLabel: busy ? 'Sending link' : 'Send link',
    send,
    sentTo: email.trim(),
    resending: s.resend === 'sending',
    resent: s.resend === 'done',
    resendLabel: s.resend === 'sending' ? 'Sending again' : 'Send again',
    resend: async () => {
      if (s.resend === 'sending' || phase !== 'sent') return
      setState({ resend: 'sending' })
      await authApi.forgotPassword(email.trim()).catch(() => null)
      later(() => setState({ resend: 'done' }), 400)
    },
    change: () => {
      if (phase !== 'sent') return
      setState({ phase: 'back', tried: false, resend: 'idle' })
      later(() => setState({ phase: 'form' }), 950)
    },
  }
  return (
    <div className="pg-forgotpassword" style={{ position: "relative", minHeight: "100vh", display: "flex", flexDirection: "column", overflow: "hidden" }}>
      <header className="a-top a-gutter" style={{ position: "relative", zIndex: "2", height: "72px", padding: "0 64px", display: "flex", alignItems: "center", gap: "24px", borderBottom: "1px solid var(--night-line)" }}>
        <Link to={paths.signIn} aria-label="AIVES, back to sign in" style={{ fontSize: "19px", fontWeight: "600", letterSpacing: "0.06em", color: "var(--ivory)", textDecoration: "none", lineHeight: "72px" }}>
          AIVES
        </Link>
        <Link className="a-link" to={paths.signIn} style={{ marginLeft: "auto", fontSize: "14px", fontWeight: "400", color: "var(--ivory)" }}>
          Sign in
        </Link>
      </header>
      <main className="a-gutter fp-main" style={{ position: "relative", zIndex: "1", flex: "1", width: "100%", maxWidth: "1440px", margin: "0 auto", padding: "88px 64px 72px", display: "grid", gridTemplateColumns: "minmax(0, 1fr) 400px", columnGap: "88px", alignItems: "start" }}>
        <div className="a-turn-stage fp-stage" style={{ gridColumn: "1 / -1", display: "grid", gridTemplateColumns: "subgrid", margin: "-12px -64px", padding: "12px 64px" }}>
          {v.showForm && (
            <>
              <section aria-labelledby="fp-title" aria-hidden={v.formHidden} className={v.formCls} style={{ gridArea: "1 / 1 / 2 / -1", minWidth: "0", display: "grid", gridTemplateColumns: "subgrid", rowGap: "40px", alignItems: "start" }}>
                <div style={{ minWidth: "0" }}>
                  <h1 id="fp-title" className="a-display a-rise" style={{ animationDelay: "0ms", fontFamily: "Alegreya, Georgia, serif", fontWeight: "500", fontSize: "52px", lineHeight: "1.08", letterSpacing: "-0.012em", textWrap: "balance" }}>
                    Forgot your password?
                  </h1>
                  <p className="a-rise" style={{ animationDelay: "60ms", marginTop: "20px", maxWidth: "34em", fontSize: "16.5px", lineHeight: "1.5", color: "var(--ivory-2)" }}>
                    Enter the email of your AIVES account. We will send it a link to get you back in.
                  </p>
                </div>
                <div style={{ minWidth: "0", display: "flex", flexDirection: "column" }}>
                  <div className="a-rise" style={{ animationDelay: "60ms", display: "flex", flexDirection: "column", gap: "12px" }}>
                    <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
                      <label htmlFor="fp-email" style={{ fontSize: "14px", fontWeight: "500", color: "var(--ivory)" }}>
                        Email
                      </label>
                      <input id="fp-email" className="a-field" type="email" autoComplete="email" placeholder="name@example.com" value={v.email} onChange={v.typed} onKeyDown={v.keyed} aria-invalid={v.bad} aria-describedby="fp-error" style={{ width: "100%", minWidth: "0", height: "52px", padding: "0 16px", borderRadius: "12px", border: "1px solid var(--night-edge)", background: "var(--night-field)", fontSize: "16px", fontWeight: "400", color: "var(--ivory)" }} />
                      {v.bad && (
                        <>
                          <p id="fp-error" className="a-rise" style={{ display: "flex", alignItems: "center", gap: "8px", fontSize: "13.5px", lineHeight: "1.4", color: "var(--ember-text)" }}>
                            <svg width="18" height="18" viewBox="0 0 24 24" aria-hidden="true" style={{ flex: "none", fill: "none", stroke: "currentColor", strokeWidth: "1.75", strokeLinecap: "round", strokeLinejoin: "round" }}>
                              <path d="M12 4 2.8 19.5h18.4z" />
                              <path d="M12 10v4" />
                              <path d="M12 16.8v.01" />
                            </svg>
                            <span>
                              {v.errorText}
                            </span>
                          </p>
                        </>
                      )}
                    </div>
                    <button type="button" className="a-btn a-btn-primary" onClick={v.send} aria-busy={v.sending} style={{ width: "100%", height: "52px", padding: "0 24px", display: "flex", alignItems: "center", justifyContent: "center", gap: "10px", border: "0", borderRadius: "14px", background: "var(--ivory)", color: "var(--night-indigo)", fontSize: "16px", fontWeight: "500", whiteSpace: "nowrap", boxShadow: "0 10px 28px -12px rgba(0,0,0,0.55)" }}>
                      {v.idle && (
                        <>
                          <svg width="18" height="18" viewBox="0 0 24 24" aria-hidden="true" style={{ flex: "none", fill: "none", stroke: "currentColor", strokeWidth: "1.75", strokeLinecap: "round", strokeLinejoin: "round" }}>
                            <path d="M21 3 10 14" />
                            <path d="m21 3-7 18-4-7-7-4z" />
                          </svg>
                        </>
                      )}
                      {v.sending && (
                        <>
                          <svg width="18" height="18" viewBox="0 0 16 16" aria-hidden="true" style={{ flex: "none" }}>
                            <circle cx="8" cy="8" r="6.25" style={{ fill: "none", stroke: "var(--night-indigo)", strokeWidth: "1.5" }} />
                            <circle className="a-moon-fill" cx="8" cy="8" r="6.25" style={{ fill: "var(--night-indigo)" }} />
                          </svg>
                        </>
                      )}
                      <span>
                        {v.sendLabel}
                      </span>
                    </button>
                  </div>
                  <p className="a-rise" style={{ animationDelay: "120ms", marginTop: "28px", paddingTop: "18px", borderTop: "1px solid var(--night-line)", fontSize: "14.5px", color: "var(--ivory-2)" }}>
                    No account yet?{' '}
                    <Link className="a-link" to={paths.register} style={{ color: "var(--ivory)", fontWeight: "500" }}>
                      Create a student account
                    </Link>
                  </p>
                </div>
              </section>
            </>
          )}
          {v.showSent && (
            <>
              <section aria-labelledby="fp-sent-title" aria-live="polite" aria-hidden={v.sentHidden} className={v.sentCls} style={{ gridArea: "1 / 1 / 2 / -1", minWidth: "0", display: "grid", gridTemplateColumns: "subgrid", alignItems: "start" }}>
                <div style={{ minWidth: "0", display: "flex", flexDirection: "column" }}>
                  <h1 id="fp-sent-title" className="a-display a-rise" style={{ animationDelay: "0ms", fontFamily: "Alegreya, Georgia, serif", fontWeight: "500", fontSize: "52px", lineHeight: "1.08", letterSpacing: "-0.012em" }}>
                    Check your email
                  </h1>
                  <div className="a-rise" style={{ animationDelay: "0ms", marginTop: "24px", display: "grid", gridTemplateColumns: "20px minmax(0, 1fr)", columnGap: "14px", rowGap: "2px" }}>
                    <svg width="20" height="20" viewBox="0 0 16 16" aria-hidden="true" style={{ gridRow: "span 2", marginTop: "2px" }}>
                      <circle cx="8" cy="8" r="6.25" style={{ fill: "none", stroke: "var(--ivory)", strokeWidth: "1.5" }} />
                      <circle className="a-moon-fill" cx="8" cy="8" r="6.25" style={{ fill: "var(--ivory)", animationDelay: "160ms" }} />
                    </svg>
                    <p style={{ fontSize: "15px", fontWeight: "500", lineHeight: "1.6", color: "var(--ivory)" }}>
                      Link sent
                    </p>
                    <p style={{ maxWidth: "34em", fontSize: "16.5px", lineHeight: "1.55", color: "var(--ivory-2)", overflowWrap: "anywhere" }}>
                      If an AIVES account uses{' '}
                      <span style={{ fontWeight: "500", color: "var(--ivory)" }}>
                        {v.sentTo}
                      </span>
                      , we have sent it a link.
                    </p>
                  </div>
                  <dl className="a-rise" style={{ animationDelay: "60ms", marginTop: "48px", maxWidth: "34em", display: "flex", flexDirection: "column" }}>
                    <div className="a-grid-1-sm" style={{ display: "grid", gridTemplateColumns: "220px minmax(0, 1fr)", columnGap: "28px", rowGap: "6px", padding: "20px 0", borderTop: "1px solid var(--night-line)" }}>
                      <dt style={{ fontSize: "15px", fontWeight: "500", color: "var(--ivory)" }}>
                        Your account has a password
                      </dt>
                      <dd style={{ fontSize: "16px", lineHeight: "1.5", color: "var(--ivory-2)" }}>
                        The link lets you choose a new password. Your account name stays the same.
                      </dd>
                    </div>
                    <div className="a-grid-1-sm" style={{ display: "grid", gridTemplateColumns: "220px minmax(0, 1fr)", columnGap: "28px", rowGap: "6px", padding: "20px 0", borderTop: "1px solid var(--night-line)", borderBottom: "1px solid var(--night-line)" }}>
                      <dt style={{ fontSize: "15px", fontWeight: "500", color: "var(--ivory)" }}>
                        No password yet
                      </dt>
                      <dd style={{ fontSize: "16px", lineHeight: "1.5", color: "var(--ivory-2)" }}>
                        The link lets you set an account name and a password.
                      </dd>
                    </div>
                  </dl>
                  <p className="a-rise" style={{ animationDelay: "60ms", marginTop: "20px", maxWidth: "34em", display: "flex", alignItems: "flex-start", gap: "10px", fontSize: "14.5px", lineHeight: "1.5", color: "var(--ivory)" }}>
                    <svg width="18" height="18" viewBox="0 0 24 24" aria-hidden="true" style={{ flex: "none", marginTop: "1px", fill: "none", stroke: "var(--jade)", strokeWidth: "1.75", strokeLinecap: "round", strokeLinejoin: "round" }}>
                      <circle cx="12" cy="12" r="9" />
                      <path d="M12 7v5l3 2" />
                    </svg>
                    <span>
                      The link works once and then expires. Opening it also confirms your email.
                    </span>
                  </p>
                  <div className="a-rise a-stack-sm" style={{ animationDelay: "120ms", marginTop: "48px", display: "flex", alignItems: "center", flexWrap: "wrap", gap: "12px" }}>
                    <Link to={paths.signIn} className="a-btn a-btn-primary" style={{ height: "52px", padding: "0 24px", display: "inline-flex", alignItems: "center", justifyContent: "center", gap: "10px", borderRadius: "14px", background: "var(--ivory)", color: "var(--night-indigo)", fontSize: "16px", fontWeight: "500", textDecoration: "none", boxShadow: "0 10px 28px -12px rgba(0,0,0,0.55)" }}>
                      <svg width="18" height="18" viewBox="0 0 24 24" aria-hidden="true" style={{ flex: "none", fill: "none", stroke: "currentColor", strokeWidth: "1.75", strokeLinecap: "round", strokeLinejoin: "round" }}>
                        <path d="M19 12H5" />
                        <path d="m11 18-6-6 6-6" />
                      </svg>
                      <span>
                        Back to sign in
                      </span>
                    </Link>
                    <button type="button" className="a-btn a-btn-secondary" onClick={v.resend} aria-busy={v.resending} style={{ height: "44px", padding: "0 18px", display: "inline-flex", alignItems: "center", justifyContent: "center", gap: "10px", borderRadius: "12px", border: "1px solid var(--night-edge)", background: "transparent", color: "var(--ivory)", fontSize: "15px", fontWeight: "500", whiteSpace: "nowrap" }}>
                      {v.resending && (
                        <>
                          <svg width="18" height="18" viewBox="0 0 16 16" aria-hidden="true" style={{ flex: "none" }}>
                            <circle cx="8" cy="8" r="6.25" style={{ fill: "none", stroke: "var(--ivory)", strokeWidth: "1.5" }} />
                            <circle className="a-moon-fill" cx="8" cy="8" r="6.25" style={{ fill: "var(--ivory)" }} />
                          </svg>
                        </>
                      )}
                      <span>
                        {v.resendLabel}
                      </span>
                    </button>
                    <button type="button" className="a-btn a-btn-quiet" onClick={v.change} style={{ height: "44px", padding: "0 14px", border: "0", borderRadius: "10px", background: "transparent", color: "var(--ivory-2)", fontSize: "15px", fontWeight: "500", whiteSpace: "nowrap" }}>
                      Use a different email
                    </button>
                  </div>
                  <div role="status" style={{ minHeight: "20px", marginTop: "14px" }}>
                    {v.resent && (
                      <>
                        <p className="a-just" style={{ display: "flex", alignItems: "center", gap: "8px", fontSize: "13.5px", color: "var(--jade)" }}>
                          <span aria-hidden="true" style={{ width: "6px", height: "6px", borderRadius: "50%", background: "var(--jade)" }} />
                          Sent again just now. Use the newest email.
                        </p>
                      </>
                    )}
                  </div>
                </div>
              </section>
            </>
          )}
        </div>
      </main>
      {USE_MOCKS && (
      <footer className="a-gutter" style={{ position: "relative", zIndex: "1", padding: "20px 64px 28px", display: "flex", flexWrap: "wrap", gap: "6px 20px", fontSize: "13.5px", lineHeight: "1.4", color: "var(--ivory-3)" }}>
        <span>
          Sample data: the names and emails on this page are examples.
        </span>
        {v.showSentLink && (
          <>
            <Link className="a-link" to={v.demoLink} style={{ color: "var(--ivory-2)" }}>
              Open the link from the email
            </Link>
          </>
        )}
      </footer>
      )}
    </div>
  )
}
