import { Link } from 'react-router-dom'
import { paths } from '../../app/routes/paths.js'
import { USE_MOCKS } from '../../api/client.js'
import { accountApi } from '../../api/services.js'
import { StaffTopBar } from '../../components/TopBar.jsx'
import { useAuth } from '../auth/AuthContext.jsx'
import { useMergeState } from '../../hooks/useMergeState.js'
import { atLeast } from '../../utils/async.js'
import './AccountSettings.css'

// Account settings follow the signed-in role: students see Night (the wireframe), lecturers and
// administrators see the same page in Moonlight (.as-moon swaps the colour tokens) under their own bar.
export default function AccountSettingsPage() {
  const { user, setUser, signOut } = useAuth()
  const [s, setState] = useMergeState({ draft: null, save: 'idle', ticks: 0, setup: 'idle', resends: 0, g: 'idle', error: null })
  const staff = user.role !== 'Student'
  const saved = user.username
  const draft = s.draft ?? saved
  const bad = draft.trim() === ''
  const dirty = draft.trim() !== saved
  const google = user.googleLinked
  const g = google ? 'linked' : s.g
  const tick = s.ticks === 0 ? '' : s.ticks % 2 ? 'a-tick-a' : 'a-tick-b'
  const save = async () => {
    if (bad || !dirty || s.save === 'saving') return
    setState({ save: 'saving', error: null })
    try {
      const u = await atLeast(accountApi.changeUsername(draft.trim()), 650)
      setUser(u)
      setState((p) => ({ draft: null, save: 'saved', ticks: p.ticks + 1 }))
    } catch (e) {
      setState({ save: 'idle', error: e.message })
    }
  }
  const sendSetup = async () => {
    if (s.setup === 'sending') return
    if (s.setup === 'sent') {
      await accountApi.requestSetupLink().catch(() => null)
      setState((p) => ({ resends: p.resends + 1 }))
      return
    }
    setState({ setup: 'sending' })
    await atLeast(accountApi.requestSetupLink().catch(() => null), 700)
    setState({ setup: 'sent' })
  }
  // the real flow opens Google's window; the mock answers after a moment
  const linkGoogle = async () => {
    if (g !== 'idle') return
    setState({ g: 'waiting' })
    try {
      const u = await atLeast(accountApi.linkGoogle('mock-google-id-token'), 1600)
      setUser(u)
      setState({ g: 'linked', justLinked: true })
    } catch (e) {
      setState({ g: 'idle', error: e.message })
    }
  }
  const v = {
    savedName: saved,
    headCls: tick,
    roleLine: user.studentCode ?? user.role,
    idLine: user.accountName ? (user.studentCode ?? user.email) : user.email,
    heroName: bad ? saved : draft,
    heroColor: dirty || bad ? 'var(--ivory-3)' : 'var(--ivory)',
    heroCls: tick,
    draft,
    typed: (e) => setState({ draft: e.target.value, save: 'idle' }),
    bad,
    good: !bad,
    describedBy: bad ? 'e-username' : 'h-username',
    saveOff: bad || !dirty || s.save === 'saving',
    saveLabel: s.save === 'saving' ? 'Saving' : 'Save username',
    showDirty: dirty && !bad && s.save !== 'saving',
    showSaved: s.save === 'saved' && !dirty,
    save,
    hasPassword: user.hasPassword,
    noPassword: !user.hasPassword,
    setupIdle: s.setup !== 'sent',
    setupSent: s.setup === 'sent',
    sending: s.setup === 'sending',
    setupLabel: s.setup === 'sending' ? 'Sending' : s.setup === 'sent' ? 'Send it again' : 'Email me a setup link',
    resent: s.resends > 0,
    resentCls: s.resends % 2 ? 'a-tick-a' : 'a-tick-b',
    sendSetup,
    gIdle: g === 'idle',
    gWaiting: g === 'waiting',
    gLinked: g === 'linked',
    gCanLink: g !== 'linked',
    gJust: !!s.justLinked && g === 'linked',
    gLinkedCls: s.justLinked ? 'a-rise' : '',
    gMoonCls: s.justLinked ? 'a-moon-fill' : '',
    gLinkedLine: user.hasPassword ? 'You can now sign in with Google or your password.' : 'Google is how you sign in until you set a password.',
    gLabel: g === 'waiting' ? 'Waiting for Google' : 'Link Google account',
    linkGoogle,
  }
  return (
    <div className={`pg-accountsettings${staff ? ' as-moon' : ''}`} style={{ position: "relative", minHeight: "100vh", display: "flex", flexDirection: "column", overflow: "hidden" }}>
      {staff ? <StaffTopBar current="account" /> : (
      <header className="a-top a-gutter" style={{ position: "relative", zIndex: "2", height: "72px", padding: "0 64px", display: "flex", alignItems: "center", gap: "44px", borderBottom: "1px solid var(--night-line)" }}>
        <Link to={paths.studentHome} style={{ fontSize: "19px", fontWeight: "600", letterSpacing: "0.06em", color: "var(--ivory)", textDecoration: "none", lineHeight: "72px" }}>
          AIVES
        </Link>
        <nav className="a-top-nav" aria-label="Student" style={{ alignSelf: "stretch", display: "flex", gap: "30px", minWidth: "0" }}>
          <Link className="a-nav" to={paths.studentHome} style={{ display: "flex", alignItems: "center", height: "100%", fontSize: "15px", fontWeight: "400", color: "var(--ivory-2)", textDecoration: "none", whiteSpace: "nowrap" }}>
            My exams
          </Link>
          <Link className="a-nav" to={paths.account} aria-current="page" style={{ display: "flex", alignItems: "center", height: "100%", fontSize: "15px", fontWeight: "500", color: "var(--ivory)", textDecoration: "none", whiteSpace: "nowrap", boxShadow: "inset 0 -2px 0 var(--ivory)" }}>
            Account settings
          </Link>
        </nav>
        <div style={{ marginLeft: "auto", display: "flex", alignItems: "center", gap: "20px", whiteSpace: "nowrap", fontSize: "14px" }}>
          <span style={{ color: "var(--ivory-2)" }}>
            <span className={v.headCls} style={{ fontWeight: "500", color: "var(--ivory)" }}>
              {v.savedName}
            </span>
            <span className="a-hide-sm">
              {' '}·{' '}{v.roleLine}
            </span>
          </span>
          <Link className="a-link" to={paths.signIn} onClick={() => signOut()} style={{ color: "var(--ivory)" }}>
            Sign out
          </Link>
        </div>
      </header>
      )}
      <main className="a-gutter" style={{ position: "relative", zIndex: "1", width: "100%", maxWidth: "1248px", margin: "0 auto", padding: "72px 64px 96px" }}>
        <div style={{ display: "flex", flexDirection: "column", gap: "14px", paddingBottom: "56px" }}>
          <h1 className="a-display a-rise" style={{ fontFamily: "Alegreya, Georgia, serif", fontWeight: "500", fontSize: "52px", lineHeight: "1.08", letterSpacing: "-0.012em", overflowWrap: "anywhere", minHeight: "1.08em" }}>
            <span style={{ position: "absolute", width: "1px", height: "1px", overflow: "hidden", clip: "rect(0 0 0 0)", whiteSpace: "nowrap" }}>
              Account settings for{' '}
            </span>
            <span className={v.heroCls} style={{ color: v.heroColor, transition: "color .2s ease-out" }}>
              {v.heroName}
            </span>
          </h1>
          <p className="a-rise" style={{ display: "flex", flexWrap: "wrap", alignItems: "center", columnGap: "14px", rowGap: "6px", fontSize: "16.5px", lineHeight: "1.5", color: "var(--ivory-2)" }}>
            <span>
              Student account
            </span>
            <span aria-hidden="true" className="a-hide-sm" style={{ width: "4px", height: "4px", borderRadius: "50%", background: "var(--night-edge)" }} />
            <span style={{ overflowWrap: "anywhere" }}>
              {v.idLine}
            </span>
          </p>
        </div>
        <section aria-labelledby="h-profile" className="a-grid-1-sm a-rise" style={{ animationDelay: "60ms", display: "grid", gridTemplateColumns: "264px minmax(0, 1fr)", columnGap: "72px", rowGap: "20px", padding: "44px 0 52px", borderTop: "1px solid var(--night-line)" }}>
          <h2 id="h-profile" style={{ fontSize: "24px", fontWeight: "500", lineHeight: "1.3", letterSpacing: "-0.005em" }}>
            Profile
          </h2>
          <div style={{ display: "flex", flexDirection: "column", maxWidth: "560px" }}>
            <label htmlFor="f-username" style={{ fontSize: "14px", fontWeight: "500" }}>
              Username
            </label>
            <input id="f-username" className="a-field" type="text" autoComplete="nickname" value={v.draft} onChange={v.typed} aria-invalid={v.bad} aria-describedby={v.describedBy} style={{ marginTop: "8px", width: "100%", maxWidth: "440px", height: "48px", padding: "0 14px", borderRadius: "12px", border: "1px solid var(--night-edge)", background: "var(--night-field)", fontSize: "16px", fontWeight: "400", color: "var(--ivory)" }} />
            {v.bad && (
              <>
                <p id="e-username" className="a-rise" style={{ marginTop: "10px", display: "flex", alignItems: "center", gap: "8px", fontSize: "13.5px", lineHeight: "1.4", color: "var(--ember-text)" }}>
                  <svg width="18" height="18" viewBox="0 0 24 24" aria-hidden="true" style={{ flex: "none", fill: "none", stroke: "var(--ember-text)", strokeWidth: "1.75", strokeLinecap: "round", strokeLinejoin: "round" }}>
                    <path d="M12 4 21 19.5H3z" />
                    <path d="M12 10v4.5" />
                    <path d="M12 17.2v.01" />
                  </svg>
                  Type a username. It is the name lecturers see.
                </p>
              </>
            )}
            {v.good && (
              <>
                <p id="h-username" style={{ marginTop: "10px", fontSize: "13.5px", lineHeight: "1.4", color: "var(--ivory-3)" }}>
                  Other people can have the same username.
                </p>
              </>
            )}
            <div style={{ marginTop: "28px", display: "flex", flexWrap: "wrap", alignItems: "center", columnGap: "22px", rowGap: "14px" }}>
              <button type="button" className="a-btn a-btn-primary" onClick={v.save} aria-disabled={v.saveOff} style={{ height: "52px", minWidth: "164px", padding: "0 24px", display: "inline-flex", alignItems: "center", justifyContent: "center", gap: "10px", border: "0", borderRadius: "14px", background: "var(--ivory)", color: "var(--night-indigo)", fontSize: "16px", fontWeight: "500", boxShadow: "0 10px 28px -12px rgba(0,0,0,0.55)" }}>
                {v.saveLabel}
              </button>
              <div aria-live="polite" style={{ minHeight: "24px", display: "flex", alignItems: "center" }}>
                {v.showDirty && (
                  <>
                    <span className="a-rise" style={{ display: "inline-flex", alignItems: "center", gap: "9px", fontSize: "14.5px", color: "var(--ivory-2)" }}>
                      <svg width="14" height="14" viewBox="0 0 16 16" aria-hidden="true" style={{ flex: "none" }}>
                        <circle cx="8" cy="8" r="6.25" style={{ fill: "none", stroke: "var(--ivory-3)", strokeWidth: "1.5", strokeDasharray: "2.45 2.45" }} />
                      </svg>
                      Not saved yet
                    </span>
                  </>
                )}
                {v.showSaved && (
                  <>
                    <span style={{ display: "inline-flex", flexDirection: "column", alignItems: "flex-start", gap: "2px" }}>
                      <span className="a-rise" style={{ display: "inline-flex", alignItems: "flex-start", gap: "9px", fontSize: "14.5px", lineHeight: "1.4", fontWeight: "500", color: "var(--ivory)" }}>
                        <svg width="14" height="14" viewBox="0 0 16 16" aria-hidden="true" style={{ flex: "none", marginTop: "3px" }}>
                          <circle cx="8" cy="8" r="6.25" style={{ fill: "none", stroke: "var(--ivory)", strokeWidth: "1.5" }} />
                          <circle className="a-moon-fill" cx="8" cy="8" r="6.25" style={{ fill: "var(--ivory)" }} />
                        </svg>
                        <span>
                          Saved. Lecturers now see{' '}{v.savedName}.
                        </span>
                      </span>
                      <span className="a-just" style={{ animationDelay: "120ms", marginLeft: "23px", display: "flex", alignItems: "center", gap: "6px", fontSize: "12.5px", fontWeight: "400", color: "var(--jade)" }}>
                        <span aria-hidden="true" style={{ width: "6px", height: "6px", borderRadius: "50%", background: "var(--jade)" }} />
                        just now
                      </span>
                    </span>
                  </>
                )}
              </div>
            </div>
          </div>
        </section>
        <section aria-labelledby="h-signin" className="a-grid-1-sm a-rise" style={{ animationDelay: "60ms", display: "grid", gridTemplateColumns: "264px minmax(0, 1fr)", columnGap: "72px", rowGap: "12px", padding: "44px 0 40px", borderTop: "1px solid var(--night-line)" }}>
          <h2 id="h-signin" style={{ fontSize: "24px", fontWeight: "500", lineHeight: "1.3", letterSpacing: "-0.005em" }}>
            Signing in
          </h2>
          <dl style={{ display: "flex", flexDirection: "column", maxWidth: "760px" }}>
            <div className="a-grid-1-sm" style={{ display: "grid", gridTemplateColumns: "200px minmax(0, 1fr)", columnGap: "24px", rowGap: "6px", padding: "6px 0 22px" }}>
              <dt style={{ fontSize: "14px", fontWeight: "500", color: "var(--ivory-2)", paddingTop: "3px" }}>
                Email
              </dt>
              <dd style={{ display: "flex", flexWrap: "wrap", alignItems: "center", columnGap: "18px", rowGap: "6px" }}>
                <span style={{ fontSize: "16.5px", fontWeight: "400", overflowWrap: "anywhere" }}>
                  {user.email}
                </span>
                <span style={{ display: "inline-flex", alignItems: "center", gap: "9px", fontSize: "14.5px", color: "var(--ivory)" }}>
                  <svg width="14" height="14" viewBox="0 0 16 16" aria-hidden="true" style={{ flex: "none" }}>
                    <circle cx="8" cy="8" r="6.25" style={{ fill: "none", stroke: "var(--ivory)", strokeWidth: "1.5" }} />
                    <circle cx="8" cy="8" r="6.25" style={{ fill: "var(--ivory)" }} />
                  </svg>
                  Confirmed
                </span>
              </dd>
            </div>
            {v.hasPassword && (
              <>
                <div className="a-grid-1-sm" style={{ display: "grid", gridTemplateColumns: "200px minmax(0, 1fr)", columnGap: "24px", rowGap: "6px", padding: "22px 0", borderTop: "1px solid var(--night-line)" }}>
                  <dt style={{ fontSize: "14px", fontWeight: "500", color: "var(--ivory-2)", paddingTop: "3px" }}>
                    Account name
                  </dt>
                  <dd style={{ display: "flex", flexWrap: "wrap", alignItems: "center", columnGap: "18px", rowGap: "6px" }}>
                    <span style={{ fontSize: "16.5px", fontWeight: "400" }}>
                      {user.accountName}
                    </span>
                    <span style={{ display: "inline-flex", alignItems: "center", gap: "8px", fontSize: "13.5px", color: "var(--ivory-3)" }}>
                      <svg width="16" height="16" viewBox="0 0 24 24" aria-hidden="true" style={{ flex: "none", fill: "none", stroke: "currentColor", strokeWidth: "1.75", strokeLinecap: "round", strokeLinejoin: "round" }}>
                        <rect x="5" y="11" width="14" height="9" rx="2" />
                        <path d="M8 11V8a4 4 0 0 1 8 0v3" />
                      </svg>
                      Never changes
                    </span>
                  </dd>
                </div>
                <div className="a-grid-1-sm" style={{ display: "grid", gridTemplateColumns: "200px minmax(0, 1fr)", columnGap: "24px", rowGap: "6px", padding: "22px 0 6px", borderTop: "1px solid var(--night-line)" }}>
                  <dt style={{ fontSize: "14px", fontWeight: "500", color: "var(--ivory-2)", paddingTop: "3px" }}>
                    Password
                  </dt>
                  <dd style={{ display: "flex", flexWrap: "wrap", alignItems: "center", columnGap: "18px", rowGap: "10px" }}>
                    <span style={{ display: "inline-flex", alignItems: "center", gap: "9px", fontSize: "16.5px", fontWeight: "400" }}>
                      <svg width="14" height="14" viewBox="0 0 16 16" aria-hidden="true" style={{ flex: "none" }}>
                        <circle cx="8" cy="8" r="6.25" style={{ fill: "none", stroke: "var(--ivory)", strokeWidth: "1.5" }} />
                        <circle cx="8" cy="8" r="6.25" style={{ fill: "var(--ivory)" }} />
                      </svg>
                      Set
                    </span>
                    <Link className="a-link" to={paths.forgotPassword} style={{ fontSize: "14.5px", color: "var(--ivory-2)" }}>
                      Forgot it? Get a reset link
                    </Link>
                  </dd>
                </div>
              </>
            )}
            {v.noPassword && (
              <>
                <div className="a-grid-1-sm" style={{ display: "grid", gridTemplateColumns: "200px minmax(0, 1fr)", columnGap: "24px", rowGap: "6px", padding: "22px 0 6px", borderTop: "1px solid var(--night-line)" }}>
                  <dt style={{ fontSize: "14px", fontWeight: "500", color: "var(--ivory-2)", paddingTop: "3px" }}>
                    Account name and password
                  </dt>
                  <dd style={{ display: "flex", flexDirection: "column", alignItems: "flex-start", gap: "16px" }}>
                    {v.setupIdle && (
                      <>
                        <span style={{ display: "inline-flex", alignItems: "center", gap: "9px", fontSize: "16.5px", fontWeight: "400" }}>
                          <svg width="14" height="14" viewBox="0 0 16 16" aria-hidden="true" style={{ flex: "none" }}>
                            <circle cx="8" cy="8" r="6.25" style={{ fill: "none", stroke: "var(--ivory-2)", strokeWidth: "1.5" }} />
                          </svg>
                          Not set yet. You sign in with Google only.
                        </span>
                      </>
                    )}
                    {v.setupSent && (
                      <>
                        <div className="a-rise" style={{ display: "flex", flexDirection: "column", gap: "6px" }}>
                          <span style={{ display: "inline-flex", alignItems: "center", gap: "9px", fontSize: "16.5px", fontWeight: "400" }}>
                            <svg width="14" height="14" viewBox="0 0 16 16" aria-hidden="true" style={{ flex: "none" }}>
                              <circle cx="8" cy="8" r="6.25" style={{ fill: "none", stroke: "var(--lantern-red)", strokeWidth: "1.5" }} />
                              <path d="M8 1.75a6.25 6.25 0 0 1 0 12.5a2.6 6.25 0 0 0 0-12.5z" style={{ fill: "var(--lantern-red)" }} />
                            </svg>
                            Setup link sent to {user.email}
                          </span>
                          <span style={{ paddingLeft: "23px", fontSize: "14.5px", lineHeight: "1.5", color: "var(--ivory-2)", maxWidth: "34em" }}>
                            Open it to choose an account name and password. It works once and expires.
                          </span>
                        </div>
                      </>
                    )}
                    <div style={{ display: "flex", flexWrap: "wrap", alignItems: "center", gap: "14px" }}>
                      <button type="button" className="a-btn a-btn-secondary" onClick={v.sendSetup} aria-disabled={v.sending} style={{ height: "44px", padding: "0 18px", display: "inline-flex", alignItems: "center", gap: "10px", borderRadius: "12px", border: "1px solid var(--night-edge)", background: "transparent", color: "var(--ivory)", fontSize: "15px", fontWeight: "500" }}>
                        <svg width="18" height="18" viewBox="0 0 24 24" aria-hidden="true" style={{ flex: "none", fill: "none", stroke: "currentColor", strokeWidth: "1.75", strokeLinecap: "round", strokeLinejoin: "round" }}>
                          <rect x="3" y="5" width="18" height="14" rx="2" />
                          <path d="m3.5 6.5 8.5 6.5 8.5-6.5" />
                        </svg>
                        {v.setupLabel}
                      </button>
                      {v.resent && (
                        <>
                          <span className={v.resentCls} style={{ display: "flex", alignItems: "center", gap: "6px", fontSize: "12.5px", fontWeight: "400", color: "var(--jade)" }}>
                            <span aria-hidden="true" style={{ width: "6px", height: "6px", borderRadius: "50%", background: "var(--jade)" }} />
                            sent again just now
                          </span>
                        </>
                      )}
                    </div>
                  </dd>
                </div>
              </>
            )}
          </dl>
        </section>
        <section aria-labelledby="h-google" className="a-grid-1-sm a-rise" style={{ animationDelay: "120ms", display: "grid", gridTemplateColumns: "264px minmax(0, 1fr)", columnGap: "72px", rowGap: "20px", padding: "44px 0 8px", borderTop: "1px solid var(--night-line)" }}>
          <h2 id="h-google" style={{ fontSize: "24px", fontWeight: "500", lineHeight: "1.3", letterSpacing: "-0.005em" }}>
            Google
          </h2>
          <div aria-live="polite" style={{ display: "flex", flexDirection: "column", alignItems: "flex-start", gap: "16px", maxWidth: "640px" }}>
            {v.gIdle && (
              <>
                <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
                  <span style={{ display: "inline-flex", alignItems: "center", gap: "9px", fontSize: "16.5px", fontWeight: "400" }}>
                    <svg width="14" height="14" viewBox="0 0 16 16" aria-hidden="true" style={{ flex: "none" }}>
                      <circle cx="8" cy="8" r="6.25" style={{ fill: "none", stroke: "var(--ivory-2)", strokeWidth: "1.5" }} />
                    </svg>
                    Not linked
                  </span>
                  <span style={{ paddingLeft: "23px", fontSize: "14.5px", lineHeight: "1.5", color: "var(--ivory-2)" }}>
                    The Google account must use {user.email}.
                  </span>
                </div>
              </>
            )}
            {v.gWaiting && (
              <>
                <div className="a-rise" style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
                  <span style={{ display: "inline-flex", alignItems: "center", gap: "9px", fontSize: "16.5px", fontWeight: "400" }}>
                    <svg width="14" height="14" viewBox="0 0 16 16" aria-hidden="true" style={{ flex: "none" }}>
                      <circle cx="8" cy="8" r="6.25" style={{ fill: "none", stroke: "var(--lantern-red)", strokeWidth: "1.5" }} />
                      <path d="M8 1.75a6.25 6.25 0 0 1 0 12.5a2.6 6.25 0 0 0 0-12.5z" style={{ fill: "var(--lantern-red)" }} />
                    </svg>
                    Waiting for Google
                  </span>
                  <span style={{ paddingLeft: "23px", fontSize: "14.5px", lineHeight: "1.5", color: "var(--ivory-2)" }}>
                    Choose {user.email} in the Google window.
                  </span>
                </div>
              </>
            )}
            {v.gLinked && (
              <>
                <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
                  <span className={v.gLinkedCls} style={{ display: "inline-flex", alignItems: "center", gap: "9px", fontSize: "16.5px", fontWeight: "400" }}>
                    <svg width="14" height="14" viewBox="0 0 16 16" aria-hidden="true" style={{ flex: "none" }}>
                      <circle cx="8" cy="8" r="6.25" style={{ fill: "none", stroke: "var(--ivory)", strokeWidth: "1.5" }} />
                      <circle className={v.gMoonCls} cx="8" cy="8" r="6.25" style={{ fill: "var(--ivory)" }} />
                    </svg>
                    Linked to {user.email}
                  </span>
                  <span style={{ paddingLeft: "23px", fontSize: "14.5px", lineHeight: "1.5", color: "var(--ivory-2)" }}>
                    {v.gLinkedLine}
                  </span>
                  {v.gJust && (
                    <>
                      <span className="a-just" style={{ animationDelay: "160ms", paddingLeft: "23px", display: "flex", alignItems: "center", gap: "6px", fontSize: "12.5px", fontWeight: "400", color: "var(--jade)" }}>
                        <span aria-hidden="true" style={{ width: "6px", height: "6px", borderRadius: "50%", background: "var(--jade)" }} />
                        just now
                      </span>
                    </>
                  )}
                </div>
              </>
            )}
            {v.gCanLink && (
              <>
                <button type="button" className="a-btn a-btn-secondary" onClick={v.linkGoogle} aria-disabled={v.gWaiting} style={{ height: "44px", padding: "0 18px", display: "inline-flex", alignItems: "center", gap: "10px", borderRadius: "12px", border: "1px solid var(--night-edge)", background: "transparent", color: "var(--ivory)", fontSize: "15px", fontWeight: "500" }}>
                  <svg width="18" height="18" viewBox="0 0 24 24" aria-hidden="true" style={{ flex: "none", fill: "none", stroke: "currentColor", strokeWidth: "1.75", strokeLinecap: "round", strokeLinejoin: "round" }}>
                    <path d="M20 12.2h-7.5" />
                    <path d="M20 12.2A8 8 0 1 1 17.4 6.3" />
                  </svg>
                  {v.gLabel}
                </button>
              </>
            )}
          </div>
        </section>
      </main>
      {s.error && <p role="alert" className="a-gutter" style={{ position: "relative", zIndex: "1", padding: "0 64px", fontSize: "14px", color: "var(--ember-text)" }}>{s.error}</p>}
      {USE_MOCKS && (
        <footer className="a-gutter" style={{ position: "relative", zIndex: "1", padding: "20px 64px 28px", fontSize: "13.5px", lineHeight: "1.4", color: "var(--ivory-3)" }}>
          Sample data: the names and emails on this page are examples.
        </footer>
      )}
    </div>
  )
}
