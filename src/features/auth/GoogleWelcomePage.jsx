import { Fragment } from 'react'
import { Link } from 'react-router-dom'
import { paths } from '../../app/routes/paths.js'
import { USE_MOCKS } from '../../api/client.js'
import { accountApi } from '../../api/services.js'
import { useMergeState } from '../../hooks/useMergeState.js'
import { useTimeouts } from '../../hooks/useTimeouts.js'
import { atLeast } from '../../utils/async.js'
import { useAuth } from './AuthContext.jsx'
import './GoogleWelcome.css'

// First Google sign-in: the account exists; offer an account name and password by email link, or later
export default function GoogleWelcomePage() {
  const { user, signOut } = useAuth()
  const [s, setState] = useMergeState({ phase: 'ask', justSent: false, resent: 0 })
  const { later } = useTimeouts()
  const send = async () => {
    if (s.phase !== 'ask') return
    setState({ phase: 'sending' })
    await atLeast(accountApi.requestSetupLink().catch(() => null), 900)
    setState({ phase: 'turning', justSent: true })
    later(() => setState({ phase: 'sent' }), 950)
  }
  const resend = async () => {
    await accountApi.requestSetupLink().catch(() => null)
    setState((p) => ({ resent: p.resent + 1 }))
  }
  const busy = s.phase === 'sending'
  const askFace = (cls, delay) => ({ ask: true, sent: false, cls, delay, busy, idle: !busy, send, resend })
  const sentFace = (cls, delay) => ({
    ask: false, sent: true, cls, delay, busy: false, idle: true, send, resend,
    resent: s.resent > 0, resentCls: s.resent % 2 ? 'a-tick-a' : 'a-tick-b',
    resentText: s.resent > 1 ? `Sent again (${s.resent} times) · just now` : 'Sent again · just now',
  })
  let faces
  if (s.phase === 'ask' || s.phase === 'sending') faces = [askFace('a-rise', '60ms')]
  else if (s.phase === 'turning') faces = [askFace('a-turn-out', '0ms'), sentFace('a-turn-in', '0ms')]
  else faces = [sentFace('', '0ms')]
  const sentNow = s.phase === 'turning' || s.phase === 'sent'
  const v = { faces, rowIdle: !sentNow, rowSent: sentNow, justSent: s.justSent && sentNow }
  const email = user?.email ?? ''
  const username = user?.username ?? ''
  return (
    <div className="pg-googlewelcome" style={{ position: "relative", minHeight: "100vh", display: "flex", flexDirection: "column", overflow: "hidden" }}>
      <header className="a-top a-gutter" style={{ position: "relative", zIndex: "2", height: "72px", padding: "0 64px", display: "flex", alignItems: "center", gap: "44px", borderBottom: "1px solid var(--night-line)", animation: "aives-fade .5s ease-out both" }}>
        <Link to={paths.studentHome} style={{ fontSize: "19px", fontWeight: "600", letterSpacing: "0.06em", color: "var(--ivory)", textDecoration: "none", lineHeight: "72px" }}>
          AIVES
        </Link>
        <div style={{ marginLeft: "auto", display: "flex", alignItems: "center", gap: "20px", whiteSpace: "nowrap", fontSize: "14px" }}>
          <span className="a-hide-sm" style={{ color: "var(--ivory-2)" }}>
            {email}
          </span>
          <Link className="a-link" to={paths.signIn} onClick={() => signOut()} style={{ color: "var(--ivory)" }}>
            Sign out
          </Link>
        </div>
      </header>
      <main className="a-gutter gw-main" style={{ position: "relative", zIndex: "1", flex: "1", padding: "104px 64px 104px" }}>
        <div className="a-grid-1-sm" style={{ maxWidth: "1180px", margin: "0 auto", display: "grid", gridTemplateColumns: "minmax(0, 1fr) 380px", columnGap: "96px", rowGap: "72px", alignItems: "start" }}>
          <div style={{ display: "flex", flexDirection: "column", minWidth: "0" }}>
            <h1 className="a-display a-rise" style={{ fontFamily: "Alegreya, Georgia, serif", fontWeight: "500", fontSize: "52px", lineHeight: "1.08", letterSpacing: "-0.012em", maxWidth: "13em", textWrap: "balance" }}>
              Welcome to AIVES, {username}
            </h1>
            <p className="a-rise" style={{ marginTop: "20px", maxWidth: "34em", fontSize: "16.5px", lineHeight: "1.5", color: "var(--ivory-2)", animationDelay: "60ms" }}>
              We created your student account from your Google account.
            </p>
            <section aria-label="Sign-in choice" className="a-turn-stage gw-stage" style={{ margin: "52px -12px -12px -64px", padding: "12px 12px 12px 64px", display: "grid" }}>
              {v.faces.map((f, f_i) => (
                <Fragment key={f.key ?? f_i}>
                  <div className={f.cls} style={{ gridArea: "1 / 1", display: "flex", flexDirection: "column", padding: "32px 0 0", borderTop: "1px solid var(--night-line)", animationDelay: f.delay }}>
                    {f.ask && (
                      <>
                        <div style={{ display: "flex", flexDirection: "column" }}>
                          <h2 style={{ fontFamily: "Alegreya, Georgia, serif", fontWeight: "500", fontSize: "26px", lineHeight: "1.28", maxWidth: "22em", textWrap: "balance" }}>
                            Do you also want an account name and a password?
                          </h2>
                          <p style={{ marginTop: "12px", maxWidth: "34em", fontSize: "16px", lineHeight: "1.5", color: "var(--ivory-2)" }}>
                            With them you can sign in without Google. We email you a link that opens a form for both.
                          </p>
                          <div className="a-stack-sm" style={{ marginTop: "32px", display: "flex", flexWrap: "wrap", alignItems: "center", gap: "12px" }}>
                            <button type="button" className="a-btn a-btn-primary" aria-busy={f.busy} onClick={f.send} style={{ height: "52px", padding: "0 24px", display: "inline-flex", alignItems: "center", justifyContent: "center", gap: "10px", border: "0", borderRadius: "14px", background: "var(--ivory)", color: "var(--night-indigo)", fontSize: "16px", fontWeight: "500", boxShadow: "0 10px 28px -12px rgba(0,0,0,0.55)" }}>
                              <svg width="18" height="18" viewBox="0 0 24 24" aria-hidden="true" style={{ flex: "none", fill: "none", stroke: "currentColor", strokeWidth: "1.75", strokeLinecap: "round", strokeLinejoin: "round" }}>
                                <rect x="3" y="5.5" width="18" height="13" rx="2.5" />
                                <path d="m3.8 7 8.2 6 8.2-6" />
                              </svg>
                              {f.idle && (
                                <>
                                  <span>
                                    Yes, email me a setup link
                                  </span>
                                </>
                              )}
                              {f.busy && (
                                <>
                                  <span className="a-pop">
                                    Sending the link…
                                  </span>
                                </>
                              )}
                            </button>
                            <Link to={paths.studentHome} className="a-btn a-btn-secondary" style={{ height: "44px", padding: "0 18px", display: "inline-flex", alignItems: "center", justifyContent: "center", borderRadius: "12px", border: "1px solid var(--night-edge)", background: "transparent", color: "var(--ivory)", fontSize: "15px", fontWeight: "500", textDecoration: "none" }}>
                              Not now, use Google only
                            </Link>
                          </div>
                          <p style={{ marginTop: "20px", fontSize: "14px", lineHeight: "1.5", color: "var(--ivory-3)" }}>
                            You can create them later in{' '}
                            <Link className="a-link" to={paths.account} style={{ color: "var(--ivory-2)" }}>
                              Account settings
                            </Link>
                            .
                          </p>
                        </div>
                      </>
                    )}
                    {f.sent && (
                      <>
                        <div style={{ display: "flex", flexDirection: "column" }}>
                          <h2 style={{ display: "flex", alignItems: "center", gap: "12px", fontFamily: "Alegreya, Georgia, serif", fontWeight: "500", fontSize: "26px", lineHeight: "1.28" }}>
                            <svg width="20" height="20" viewBox="0 0 16 16" aria-hidden="true" style={{ flex: "none" }}>
                              <circle cx="8" cy="8" r="6.25" style={{ fill: "none", stroke: "var(--ivory)", strokeWidth: "1.5" }} />
                              <circle className="a-moon-fill" cx="8" cy="8" r="6.25" style={{ fill: "var(--ivory)" }} />
                            </svg>
                            Setup link sent
                          </h2>
                          <p style={{ marginTop: "12px", maxWidth: "34em", fontSize: "16px", lineHeight: "1.5", color: "var(--ivory-2)" }}>
                            Open the email we sent to{' '}
                            <span style={{ fontWeight: "400", color: "var(--ivory)" }}>
                              {email}
                            </span>
                            {' '}to choose your account name and password. Until then, keep signing in with Google.
                          </p>
                          <p style={{ marginTop: "8px", fontSize: "14px", lineHeight: "1.5", color: "var(--ivory-3)" }}>
                            The link works once and then expires.
                          </p>
                          <div className="a-stack-sm" style={{ marginTop: "32px", display: "flex", flexWrap: "wrap", alignItems: "center", gap: "12px" }}>
                            <Link to={paths.studentHome} className="a-btn a-btn-primary" style={{ height: "52px", padding: "0 24px", display: "inline-flex", alignItems: "center", justifyContent: "center", gap: "10px", borderRadius: "14px", background: "var(--ivory)", color: "var(--night-indigo)", fontSize: "16px", fontWeight: "500", textDecoration: "none", boxShadow: "0 10px 28px -12px rgba(0,0,0,0.55)" }}>
                              Go to my exams
                              <svg width="18" height="18" viewBox="0 0 24 24" aria-hidden="true" style={{ flex: "none", fill: "none", stroke: "currentColor", strokeWidth: "1.75", strokeLinecap: "round", strokeLinejoin: "round" }}>
                                <path d="M5 12h14" />
                                <path d="m13 6 6 6-6 6" />
                              </svg>
                            </Link>
                            <button type="button" className="a-btn a-btn-quiet" onClick={f.resend} style={{ height: "44px", padding: "0 14px", display: "inline-flex", alignItems: "center", justifyContent: "center", gap: "10px", border: "0", borderRadius: "10px", background: "transparent", color: "var(--ivory-2)", fontSize: "15px", fontWeight: "500" }}>
                              <svg width="18" height="18" viewBox="0 0 24 24" aria-hidden="true" style={{ flex: "none", fill: "none", stroke: "currentColor", strokeWidth: "1.75", strokeLinecap: "round", strokeLinejoin: "round" }}>
                                <path d="M20 11.5a8 8 0 1 1-2.6-5.9" />
                                <path d="M20 4.5v4.6h-4.6" />
                              </svg>
                              Send it again
                            </button>
                            {f.resent && (
                              <>
                                <span role="status" className={f.resentCls} style={{ display: "inline-flex", alignItems: "center", gap: "8px", fontSize: "13.5px", color: "var(--jade)" }}>
                                  <span aria-hidden="true" style={{ width: "6px", height: "6px", borderRadius: "50%", background: "var(--jade)" }} />
                                  {f.resentText}
                                </span>
                              </>
                            )}
                          </div>
                        </div>
                      </>
                    )}
                  </div>
                </Fragment>
              ))}
            </section>
          </div>
          <aside aria-labelledby="gw-account" className="a-rise" style={{ paddingTop: "10px", animationDelay: "120ms" }}>
            <h2 id="gw-account" style={{ fontSize: "15px", fontWeight: "500" }}>
              Your account
            </h2>
            <dl style={{ marginTop: "16px", borderTop: "1px solid var(--night-line)" }}>
              <div style={{ padding: "18px 0", borderBottom: "1px solid var(--night-line)", display: "grid", gridTemplateColumns: "minmax(0, 1fr) auto", columnGap: "16px", rowGap: "4px", alignItems: "baseline" }}>
                <dt style={{ gridColumn: "1 / -1", fontSize: "13.5px", lineHeight: "1.4", color: "var(--ivory-3)" }}>
                  Username
                </dt>
                <dd style={{ fontSize: "20px", lineHeight: "1.3", fontWeight: "300", overflowWrap: "anywhere" }}>
                  {username}
                </dd>
                <dd style={{ fontSize: "14px" }}>
                  <Link className="a-link" to={paths.account} style={{ color: "var(--ivory-2)" }}>
                    Change
                  </Link>
                </dd>
              </div>
              <div style={{ padding: "18px 0", borderBottom: "1px solid var(--night-line)", display: "grid", gridTemplateColumns: "minmax(0, 1fr) auto", columnGap: "16px", rowGap: "4px", alignItems: "baseline" }}>
                <dt style={{ gridColumn: "1 / -1", fontSize: "13.5px", lineHeight: "1.4", color: "var(--ivory-3)" }}>
                  Google
                </dt>
                <dd style={{ fontSize: "16px", lineHeight: "1.4", fontWeight: "400", overflowWrap: "anywhere" }}>
                  {email}
                </dd>
                <dd style={{ display: "inline-flex", alignItems: "center", gap: "9px", fontSize: "14.5px", whiteSpace: "nowrap" }}>
                  <svg width="14" height="14" viewBox="0 0 16 16" aria-hidden="true" style={{ flex: "none", alignSelf: "center" }}>
                    <circle cx="8" cy="8" r="6.25" style={{ fill: "none", stroke: "var(--ivory)", strokeWidth: "1.5" }} />
                    <circle className="a-moon-fill" cx="8" cy="8" r="6.25" style={{ fill: "var(--ivory)", animationDelay: "120ms" }} />
                  </svg>
                  Linked
                </dd>
              </div>
              <div style={{ padding: "18px 0", borderBottom: "1px solid var(--night-line)", display: "grid", gridTemplateColumns: "minmax(0, 1fr) auto", columnGap: "16px", rowGap: "4px", alignItems: "baseline" }}>
                <dt style={{ gridColumn: "1 / -1", fontSize: "13.5px", lineHeight: "1.4", color: "var(--ivory-3)" }}>
                  Account name and password
                </dt>
                <dd style={{ fontSize: "16px", lineHeight: "1.4", fontWeight: "400" }}>
                  {v.rowIdle && (
                    <>
                      <span style={{ color: "var(--ivory-2)" }}>
                        Google only for now
                      </span>
                    </>
                  )}
                  {v.rowSent && (
                    <>
                      <span className="a-rise" style={{ display: "inline-block" }}>
                        Setup link sent
                      </span>
                    </>
                  )}
                  {v.justSent && (
                    <>
                      <span className="a-just" style={{ marginTop: "4px", display: "flex", alignItems: "center", gap: "6px", fontSize: "12.5px", fontWeight: "400", color: "var(--jade)" }}>
                        <span aria-hidden="true" style={{ width: "6px", height: "6px", borderRadius: "50%", background: "var(--jade)" }} />
                        just now
                      </span>
                    </>
                  )}
                </dd>
                <dd style={{ display: "inline-flex", alignItems: "center", gap: "9px", fontSize: "14.5px", whiteSpace: "nowrap", color: "var(--ivory-2)" }}>
                  <svg width="14" height="14" viewBox="0 0 16 16" aria-hidden="true" style={{ flex: "none", alignSelf: "center" }}>
                    <circle cx="8" cy="8" r="6.25" style={{ fill: "none", stroke: "var(--ivory-2)", strokeWidth: "1.5" }} />
                  </svg>
                  Not set
                </dd>
              </div>
            </dl>
          </aside>
        </div>
      </main>
      {USE_MOCKS && (
        <footer className="a-gutter" style={{ position: "relative", zIndex: "1", padding: "20px 64px 28px", fontSize: "13.5px", color: "var(--ivory-3)" }}>
          Sample data: the names and emails on this page are examples.
        </footer>
      )}
    </div>
  )
}
