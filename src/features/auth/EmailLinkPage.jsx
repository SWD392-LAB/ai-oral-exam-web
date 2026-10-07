import { Fragment, useEffect } from 'react'
import { Link, useParams } from 'react-router-dom'
import { paths } from '../../app/routes/paths.js'
import { USE_MOCKS } from '../../api/client.js'
import { authApi } from '../../api/services.js'
import { useMergeState } from '../../hooks/useMergeState.js'
import { useTimeouts } from '../../hooks/useTimeouts.js'
import { atLeast } from '../../utils/async.js'
import { PENDING } from '../../utils/pending.js'
import './EmailLink.css'

// One page for the three email links: account setup (name + password), password reset (password
// only, the account name never changes) and email verification. Every link works once and expires.
export default function EmailLinkPage() {
  const { token } = useParams()
  const { later } = useTimeouts()
  const [st, setState] = useMergeState({ link: null, mode: 'loading', name: '', pw: '', pw2: '', showPw: false, phase: 'form', takenName: null, saveError: null })

  useEffect(() => {
    authApi.readEmailLink(token)
      .then((link) => setState({ link, mode: link.purpose === 'PasswordReset' ? 'reset' : link.purpose === 'EmailVerification' ? 'verified' : 'setup', phase: link.purpose === 'EmailVerification' ? 'saved' : 'form' }))
      .catch(() => setState({ mode: 'expired' }))
  }, [token, setState])

  const { mode, link, name, pw, pw2, showPw, phase } = st
  const setupLike = mode === 'setup' && !!link?.needsAccountName
  const expired = mode === 'expired'
  const saved = phase === 'saved'
  const nameTaken = setupLike && !!st.takenName && name.trim() === st.takenName
  let match = 'none'
  if (pw2.length) match = pw2 === pw ? 'match' : (pw.startsWith(pw2) ? 'partial' : 'diff')
  const frac = match === 'match' ? 1 : 0
  const nameOk = !setupLike || (name.trim().length > 0 && !nameTaken)
  const canSave = nameOk && match === 'match' && phase === 'form'
  const edge = 'var(--night-edge)'
  const email = link?.email ?? ''
  const accountName = link?.accountName ?? name.trim()
  const doSave = async () => {
    if (!canSave) return
    setState({ phase: 'saving', saveError: null })
    try {
      const res = await atLeast(authApi.useEmailLink(token, setupLike ? { accountName: name.trim(), password: pw } : { password: pw }), 900)
      setState({ phase: 'leaving', link: { ...link, accountName: res.accountName } })
      later(() => setState({ phase: 'saved' }), 300)
    } catch (e) {
      if (e.code === 'account_name_taken') setState({ phase: 'form', takenName: name.trim() })
      else if (e.code === 'link_invalid') setState({ mode: 'expired' })
      else setState({ phase: 'form', saveError: e.message })
    }
  }
  const mk = (label, state, f) => ({ label, state, fillCls: f >= 1 ? 'a-moon-fill' : '', fillOp: f >= 1 ? 1 : 0, stroke: f >= 1 ? 'var(--ivory)' : 'var(--ivory-2)', color: f >= 1 ? 'var(--ivory)' : 'var(--ivory-2)', w: f >= 1 ? 400 : 300 })
  const pwState = match === 'match' ? '' : match === 'diff' ? ' · not the same yet' : ''
  const checks = mode === 'reset' || !setupLike
    ? [mk(`Account name stays ${link?.accountName ?? ''}`, '', 1), mk('New password typed twice', pwState, frac)]
    : [mk('Email confirmed', '', 1), mk(nameOk ? `Account name ${name.trim()}` : 'Account name chosen', nameTaken ? ' · already used' : '', nameOk ? 1 : 0), mk('Password typed twice', pwState, frac)]
  const savedRows = mode === 'verified'
    ? [{ k: 'Account name', v: link?.accountName ?? '', note: 'Cannot be changed later', delay: '0ms' }, { k: 'Email', v: email, note: 'Confirmed just now', delay: '60ms' }]
    : mode === 'reset'
      ? [{ k: 'Account name', v: link?.accountName ?? '', note: 'Unchanged', delay: '0ms' }, { k: 'Email', v: email, note: 'Confirmed', delay: '60ms' }, { k: 'Password', v: 'Changed just now', note: 'This link is now used', delay: '120ms' }]
      : [{ k: 'Account name', v: accountName, note: 'Cannot be changed later', delay: '0ms' }, { k: 'Email', v: email, note: 'Confirmed', delay: '60ms' }, { k: 'Password', v: 'Set just now', note: 'This link is now used', delay: '120ms' }]
  const v = {
    cols: expired ? 'minmax(0, 1fr)' : 'minmax(0, 1fr) 400px',
    isExpired: expired,
    isSetupLike: setupLike,
    showSetupIntro: mode === 'setup' && !saved,
    showResetIntro: mode === 'reset' && !saved,
    showSavedIntro: saved,
    showFacts: !expired && !saved && mode !== 'loading',
    checkLabel: 'Before you save',
    checks,
    onceLine: mode === 'reset' ? 'This link works once and only changes your password' : 'This link works once',
    savedTitle: mode === 'reset' ? 'Password changed' : mode === 'verified' ? 'Your email is confirmed' : 'Your account is ready',
    signInName: accountName,
    savedPwWords: mode === 'reset' ? 'your new password' : mode === 'verified' ? 'your password' : 'the password you just chose',
    showForm: !expired && !saved && mode !== 'loading',
    showSaved: saved,
    formLabel: mode === 'reset' ? 'New password' : 'Account name and password',
    name, pw, pw2, showPw, hidePw: !showPw,
    pwType: showPw ? 'text' : 'password',
    showLabel: showPw ? 'Hide passwords' : 'Show passwords',
    pwLabel: mode === 'reset' ? 'New password' : 'Password',
    pw2Label: mode === 'reset' ? 'Type the new password again' : 'Type the password again',
    nameTaken,
    nameBorder: edge, nameRing: 'none', pwBorder: edge, pwRing: 'none', pw2Border: edge, pw2Ring: 'none',
    isDiff: match === 'diff',
    showMoon: match === 'partial' || match === 'match',
    moonFillCls: match === 'match' ? 'a-moon-fill' : '',
    moonFillOp: match === 'match' ? 1 : 0,
    moonStroke: match === 'match' ? 'var(--ivory)' : 'var(--ivory-2)',
    matchColor: match === 'diff' ? 'var(--ember-text)' : match === 'match' ? 'var(--ivory)' : 'var(--ivory-2)',
    matchText: match === 'match' ? 'Passwords match' : match === 'partial' ? 'Not the same yet' : match === 'diff' ? 'The two passwords are different. Type it again.' : '',
    matchCls: match === 'match' ? 'a-rise' : '',
    saveOff: !canSave,
    isSaving: phase === 'saving' || phase === 'leaving',
    notSaving: !(phase === 'saving' || phase === 'leaving'),
    saveLabel: mode === 'reset' ? 'Save new password' : setupLike ? 'Save account name and password' : 'Save password',
    savedRows,
    onName: (e) => setState({ name: e.target.value }),
    onPw: (e) => setState({ pw: e.target.value }),
    onPw2: (e) => setState({ pw2: e.target.value }),
    submit: (e) => { e.preventDefault(); doSave() },
    toggleShow: () => setState((p) => ({ showPw: !p.showPw })),
    save: doSave,
  }
  return (
    <div className="pg-emaillink" style={{ position: "relative", minHeight: "100vh", display: "flex", flexDirection: "column", overflow: "hidden" }}>
      <header className="a-top a-gutter" style={{ position: "relative", zIndex: "2", height: "72px", padding: "0 64px", display: "flex", alignItems: "center", justifyContent: "space-between", gap: "24px", borderBottom: "1px solid var(--night-line)" }}>
        <Link to={paths.signIn} style={{ fontSize: "19px", fontWeight: "600", letterSpacing: "0.06em", color: "var(--ivory)", textDecoration: "none", lineHeight: "72px" }}>
          AIVES
        </Link>
        <Link className="a-link" to={paths.signIn} style={{ fontSize: "14px", fontWeight: "400", color: "var(--ivory)" }}>
          Sign in
        </Link>
      </header>
      <main className="a-gutter" style={{ position: "relative", zIndex: "1", flex: "1", width: "100%", maxWidth: "1440px", margin: "0 auto", padding: "88px 64px 72px" }}>
        <div className="a-grid-1-sm" style={{ display: "grid", gridTemplateColumns: v.cols, columnGap: "88px", rowGap: "56px", alignItems: "start" }}>
          <section aria-label="About this link" style={{ maxWidth: "580px", display: "flex", flexDirection: "column" }}>
            {v.showSetupIntro && (
              <>
                <div style={{ display: "flex", flexDirection: "column" }}>
                  <h1 className="a-display a-rise" style={{ fontFamily: "Alegreya, Georgia, serif", fontWeight: "500", fontSize: "52px", lineHeight: "1.08", letterSpacing: "-0.012em", textWrap: "balance" }}>
                    Set up your account
                  </h1>
                  <p className="a-rise" style={{ marginTop: "22px", maxWidth: "32em", fontSize: "16.5px", lineHeight: "1.55", color: "var(--ivory-2)" }}>
                    Choose an account name and a password for{' '}
                    <span style={{ fontWeight: "400", color: "var(--ivory)" }}>
                      {email}
                    </span>
                    . Then you can sign in with your account name or email and this password.
                  </p>
                </div>
              </>
            )}
            {v.showResetIntro && (
              <>
                <div style={{ display: "flex", flexDirection: "column" }}>
                  <h1 className="a-display a-rise" style={{ fontFamily: "Alegreya, Georgia, serif", fontWeight: "500", fontSize: "52px", lineHeight: "1.08", letterSpacing: "-0.012em", textWrap: "balance" }}>
                    Choose a new password
                  </h1>
                  <p className="a-rise" style={{ marginTop: "22px", maxWidth: "32em", fontSize: "16.5px", lineHeight: "1.55", color: "var(--ivory-2)" }}>
                    For the account{' '}
                    <span style={{ fontWeight: "400", color: "var(--ivory)" }}>
                      {link?.accountName}
                    </span>
                    {' '}({email}). Your account name stays the same.
                  </p>
                </div>
              </>
            )}
            {v.showSavedIntro && (
              <>
                <div style={{ display: "flex", flexDirection: "column" }}>
                  <h1 className="a-display a-rise" style={{ fontFamily: "Alegreya, Georgia, serif", fontWeight: "500", fontSize: "52px", lineHeight: "1.08", letterSpacing: "-0.012em", textWrap: "balance" }}>
                    {v.savedTitle}
                  </h1>
                  <p className="a-rise" style={{ marginTop: "22px", maxWidth: "32em", fontSize: "16.5px", lineHeight: "1.55", color: "var(--ivory-2)" }}>
                    Sign in with{' '}
                    <span style={{ fontWeight: "400", color: "var(--ivory)" }}>
                      {v.signInName}
                    </span>
                    {' '}or {email} and{' '}{v.savedPwWords}.
                  </p>
                </div>
              </>
            )}
            {v.showFacts && (
              <>
                <div className="a-rise" style={{ marginTop: "48px", paddingTop: "24px", borderTop: "1px solid var(--night-line)", display: "flex", flexDirection: "column", gap: "22px", animationDelay: "60ms" }}>
                  <ul aria-label={v.checkLabel} style={{ display: "flex", flexDirection: "column", gap: "16px" }}>
                    {v.checks.map((c, c_i) => (
                      <Fragment key={c.key ?? c_i}>
                        <li style={{ display: "grid", gridTemplateColumns: "20px minmax(0, 1fr)", columnGap: "14px", alignItems: "center" }}>
                          <svg width="20" height="20" viewBox="0 0 16 16" aria-hidden="true" style={{ flex: "none" }}>
                            <circle cx="8" cy="8" r="6.25" style={{ fill: "none", stroke: c.stroke, strokeWidth: "1.5", transition: "stroke .2s ease-out" }} />
                            <circle className={c.fillCls} cx="8" cy="8" r="6.25" style={{ fill: "var(--ivory)", opacity: c.fillOp }} />
                          </svg>
                          <span style={{ fontSize: "16px", lineHeight: "1.4", fontWeight: c.w, color: c.color, transition: "color .2s ease-out" }}>
                            {c.label}
                            <span style={{ fontWeight: "300", color: "var(--ivory-3)" }}>
                              {c.state}
                            </span>
                          </span>
                        </li>
                      </Fragment>
                    ))}
                  </ul>
                  <p style={{ display: "flex", alignItems: "center", gap: "10px", fontSize: "13.5px", lineHeight: "1.4", color: "var(--ivory-3)" }}>
                    <svg width="16" height="16" viewBox="0 0 20 20" aria-hidden="true" style={{ flex: "none", fill: "none", stroke: "var(--jade)", strokeWidth: "1.6", strokeLinecap: "round" }}>
                      <circle cx="10" cy="10" r="7.6" />
                      <path d="M10 5.6V10l2.9 1.9" />
                    </svg>
                    <span>
                      {v.onceLine}
                    </span>
                  </p>
                </div>
              </>
            )}
            {v.isExpired && (
              <>
                <div style={{ display: "flex", flexDirection: "column" }}>
                  <h1 className="a-display a-rise" style={{ fontFamily: "Alegreya, Georgia, serif", fontWeight: "500", fontSize: "52px", lineHeight: "1.08", letterSpacing: "-0.012em", textWrap: "balance" }}>
                    This link no longer works
                  </h1>
                  <p className="a-rise" style={{ marginTop: "22px", maxWidth: "32em", fontSize: "16.5px", lineHeight: "1.55", color: "var(--ivory-2)" }}>
                    It has expired or was already used. Ask for a new link from Forgot password; it works for every account, with or without a password.
                  </p>
                  <div className="a-rise a-stack-sm" style={{ marginTop: "40px", display: "flex", alignItems: "center", gap: "12px", flexWrap: "wrap", animationDelay: "60ms" }}>
                    <Link to={paths.forgotPassword} className="a-btn a-btn-primary" style={{ display: "inline-flex", alignItems: "center", justifyContent: "center", gap: "10px", height: "52px", padding: "0 24px", borderRadius: "14px", background: "var(--ivory)", color: "var(--night-indigo)", fontSize: "16px", fontWeight: "500", textDecoration: "none", boxShadow: "0 10px 28px -12px rgba(0,0,0,0.55)" }}>
                      <svg width="18" height="18" viewBox="0 0 24 24" aria-hidden="true" style={{ fill: "none", stroke: "currentColor", strokeWidth: "1.75", strokeLinecap: "round", strokeLinejoin: "round" }}>
                        <rect x="3" y="5.5" width="18" height="13" rx="2" />
                        <path d="m3.5 7 8.5 6 8.5-6" />
                      </svg>
                      Get a new link
                    </Link>
                    <Link to={paths.signIn} className="a-btn a-btn-quiet" style={{ display: "inline-flex", alignItems: "center", justifyContent: "center", height: "44px", padding: "0 14px", borderRadius: "10px", color: "var(--ivory-2)", fontSize: "15px", fontWeight: "500", textDecoration: "none" }}>
                      Back to sign in
                    </Link>
                  </div>
                </div>
              </>
            )}
          </section>
          {v.showForm && (
            <>
              <form className="a-rise" aria-label={v.formLabel} onSubmit={v.submit} noValidate={true} style={{ display: "flex", flexDirection: "column", gap: "28px", paddingTop: "6px", animationDelay: "60ms" }}>
                {v.isSetupLike && (
                  <>
                    <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
                      <label htmlFor="el-name" style={{ fontSize: "14px", fontWeight: "500" }}>
                        Account name
                      </label>
                      <input id="el-name" className="a-field" type="text" autoComplete="username" spellCheck="false" placeholder="minhanh.se18" value={v.name} onChange={v.onName} aria-invalid={v.nameTaken} aria-describedby="el-name-note" style={{ height: "48px", padding: "0 14px", borderRadius: "12px", border: `1px solid ${v.nameBorder}`, background: "var(--night-field)", fontSize: "16px", fontWeight: "400", color: "var(--ivory)", outline: v.nameRing, outlineOffset: "2px" }} />
                      <div id="el-name-note" style={{ display: "flex", flexDirection: "column", gap: "6px" }}>
                        {v.nameTaken && (
                          <>
                            <p className="a-rise" style={{ display: "flex", alignItems: "flex-start", gap: "8px", fontSize: "13.5px", lineHeight: "1.45", fontWeight: "400", color: "var(--ember-text)" }}>
                              <svg width="18" height="18" viewBox="0 0 24 24" aria-hidden="true" style={{ flex: "none", fill: "none", stroke: "var(--ember-text)", strokeWidth: "1.75", strokeLinecap: "round", strokeLinejoin: "round" }}>
                                <path d="M12 4 21 19.5H3z" />
                                <path d="M12 10v4.5" />
                                <path d="M12 17.2v.01" />
                              </svg>
                              <span>
                                {st.takenName} is already used. Try another account name.
                              </span>
                            </p>
                          </>
                        )}
                        <p style={{ fontSize: "13.5px", lineHeight: "1.4", color: "var(--ivory-3)" }}>
                          It cannot be changed later.
                        </p>
                      </div>
                    </div>
                  </>
                )}
                <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
                  <label htmlFor="el-pw" style={{ fontSize: "14px", fontWeight: "500" }}>
                    {v.pwLabel}
                  </label>
                  <div style={{ position: "relative" }}>
                    <input id="el-pw" className="a-field" type={v.pwType} autoComplete="new-password" value={v.pw} onChange={v.onPw} aria-describedby="el-pw-rules" style={{ width: "100%", height: "48px", padding: "0 52px 0 14px", borderRadius: "12px", border: `1px solid ${v.pwBorder}`, background: "var(--night-field)", fontSize: "16px", fontWeight: "400", color: "var(--ivory)", outline: v.pwRing, outlineOffset: "2px" }} />
                    <button type="button" className="a-btn a-btn-quiet" onClick={v.toggleShow} aria-label={v.showLabel} aria-pressed={v.showPw} aria-controls="el-pw el-pw2" style={{ position: "absolute", right: "4px", top: "2px", width: "44px", height: "44px", padding: "0", display: "grid", placeItems: "center", border: "0", borderRadius: "10px", background: "transparent", color: "var(--ivory-2)" }}>
                      {v.showPw && (
                        <>
                          <svg className="a-pop" width="18" height="18" viewBox="0 0 24 24" aria-hidden="true" style={{ fill: "none", stroke: "currentColor", strokeWidth: "1.75", strokeLinecap: "round", strokeLinejoin: "round" }}>
                            <path d="M3 3l18 18" />
                            <path d="M10.6 5.6A10 10 0 0 1 12 5.5c6 0 9.5 6.5 9.5 6.5a17 17 0 0 1-3 3.8" />
                            <path d="M6.6 6.7C3.9 8.4 2.5 12 2.5 12s3.5 6.5 9.5 6.5a9.6 9.6 0 0 0 4.4-1.1" />
                            <path d="M9.9 10a2.8 2.8 0 0 0 4 4" />
                          </svg>
                        </>
                      )}
                      {v.hidePw && (
                        <>
                          <svg className="a-pop" width="18" height="18" viewBox="0 0 24 24" aria-hidden="true" style={{ fill: "none", stroke: "currentColor", strokeWidth: "1.75", strokeLinecap: "round", strokeLinejoin: "round" }}>
                            <path d="M2.5 12s3.5-6.5 9.5-6.5 9.5 6.5 9.5 6.5-3.5 6.5-9.5 6.5S2.5 12 2.5 12z" />
                            <circle cx="12" cy="12" r="2.8" />
                          </svg>
                        </>
                      )}
                    </button>
                  </div>
                  <p id="el-pw-rules" style={{ fontSize: "13.5px", lineHeight: "1.4", color: "var(--ivory-3)" }}>
                    {PENDING.passwordRules}
                  </p>
                </div>
                <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
                  <label htmlFor="el-pw2" style={{ fontSize: "14px", fontWeight: "500" }}>
                    {v.pw2Label}
                  </label>
                  <input id="el-pw2" className="a-field" type={v.pwType} autoComplete="new-password" value={v.pw2} onChange={v.onPw2} aria-invalid={v.isDiff} aria-describedby="el-match" style={{ height: "48px", padding: "0 14px", borderRadius: "12px", border: `1px solid ${v.pw2Border}`, background: "var(--night-field)", fontSize: "16px", fontWeight: "400", color: "var(--ivory)", outline: v.pw2Ring, outlineOffset: "2px" }} />
                  <p id="el-match" aria-live="polite" style={{ minHeight: "22px", display: "flex", alignItems: "center", gap: "9px", fontSize: "13.5px", lineHeight: "1.4", fontWeight: "400", color: v.matchColor }}>
                    {v.showMoon && (
                      <>
                        <svg className="a-pop" width="14" height="14" viewBox="0 0 16 16" aria-hidden="true" style={{ flex: "none" }}>
                          <circle cx="8" cy="8" r="6.25" style={{ fill: "none", stroke: v.moonStroke, strokeWidth: "1.5", transition: "stroke .2s ease-out" }} />
                          <circle className={v.moonFillCls} cx="8" cy="8" r="6.25" style={{ fill: "var(--ivory)", opacity: v.moonFillOp }} />
                        </svg>
                      </>
                    )}
                    {v.isDiff && (
                      <>
                        <svg className="a-pop" width="18" height="18" viewBox="0 0 24 24" aria-hidden="true" style={{ flex: "none", margin: "0 1px", fill: "none", stroke: "var(--ember-text)", strokeWidth: "1.75", strokeLinecap: "round", strokeLinejoin: "round" }}>
                          <path d="M12 4 21 19.5H3z" />
                          <path d="M12 10v4.5" />
                          <path d="M12 17.2v.01" />
                        </svg>
                      </>
                    )}
                    <span className={v.matchCls}>
                      {v.matchText}
                    </span>
                  </p>
                </div>
                <div className="a-rise" style={{ display: "flex", flexDirection: "column", marginTop: "4px", animationDelay: "120ms" }}>
                  <button type="submit" className="a-btn a-btn-primary" aria-disabled={v.saveOff} style={{ width: "100%", height: "52px", padding: "0 24px", display: "inline-flex", alignItems: "center", justifyContent: "center", gap: "12px", border: "0", borderRadius: "14px", background: "var(--ivory)", color: "var(--night-indigo)", fontSize: "16px", fontWeight: "500", boxShadow: "0 10px 28px -12px rgba(0,0,0,0.55)" }}>
                    {v.isSaving && (
                      <>
                        <span className="a-rise" style={{ display: "inline-flex", alignItems: "center", gap: "12px" }}>
                          <span className="a-candle" aria-hidden="true" style={{ width: "8px", height: "8px", borderRadius: "50%", background: "var(--night-indigo)" }} />
                          Saving
                        </span>
                      </>
                    )}
                    {v.notSaving && (
                      <>
                        <span>
                          {v.saveLabel}
                        </span>
                      </>
                    )}
                  </button>
                </div>
              </form>
            </>
          )}
          {v.showSaved && (
            <>
              <section aria-label="Saved" role="status" style={{ display: "flex", flexDirection: "column", paddingTop: "6px" }}>
                <div className="a-rise" style={{ display: "flex", alignItems: "center", gap: "14px" }}>
                  <svg width="26" height="26" viewBox="0 0 16 16" aria-hidden="true" style={{ flex: "none" }}>
                    <circle cx="8" cy="8" r="6.25" style={{ fill: "none", stroke: "var(--ivory)", strokeWidth: "1.5" }} />
                    <circle className="a-moon-fill" cx="8" cy="8" r="6.25" style={{ fill: "var(--ivory)", animationDelay: "120ms" }} />
                  </svg>
                  <span style={{ fontSize: "24px", fontWeight: "500", lineHeight: "1.3", letterSpacing: "-0.005em" }}>
                    Saved
                  </span>
                  <span className="a-just" style={{ marginLeft: "auto", display: "flex", alignItems: "center", gap: "6px", fontSize: "12.5px", fontWeight: "400", color: "var(--jade)", animationDelay: "120ms" }}>
                    <span aria-hidden="true" style={{ width: "6px", height: "6px", borderRadius: "50%", background: "var(--jade)" }} />
                    just now
                  </span>
                </div>
                <dl style={{ marginTop: "28px", display: "flex", flexDirection: "column" }}>
                  {v.savedRows.map((r, r_i) => (
                    <Fragment key={r.key ?? r_i}>
                      <div className="a-rise a-grid-1-sm" style={{ display: "grid", gridTemplateColumns: "136px minmax(0, 1fr)", columnGap: "16px", rowGap: "4px", alignItems: "baseline", padding: "16px 0", borderTop: "1px solid var(--night-line)", animationDelay: r.delay }}>
                        <dt style={{ fontSize: "13.5px", fontWeight: "400", color: "var(--ivory-3)" }}>
                          {r.k}
                        </dt>
                        <dd style={{ display: "flex", flexDirection: "column", gap: "2px", minWidth: "0" }}>
                          <span style={{ fontSize: "16px", fontWeight: "400", color: "var(--ivory)", overflowWrap: "break-word" }}>
                            {r.v}
                          </span>
                          <span style={{ fontSize: "13.5px", color: "var(--ivory-3)" }}>
                            {r.note}
                          </span>
                        </dd>
                      </div>
                    </Fragment>
                  ))}
                </dl>
                <Link to={paths.signIn} className="a-btn a-btn-primary a-rise" style={{ marginTop: "32px", width: "100%", height: "52px", display: "inline-flex", alignItems: "center", justifyContent: "center", gap: "10px", borderRadius: "14px", background: "var(--ivory)", color: "var(--night-indigo)", fontSize: "16px", fontWeight: "500", textDecoration: "none", boxShadow: "0 10px 28px -12px rgba(0,0,0,0.55)", animationDelay: "120ms" }}>
                  Sign in
                  <svg width="18" height="18" viewBox="0 0 24 24" aria-hidden="true" style={{ fill: "none", stroke: "currentColor", strokeWidth: "1.75", strokeLinecap: "round", strokeLinejoin: "round" }}>
                    <path d="M5 12h14" />
                    <path d="m13 6 6 6-6 6" />
                  </svg>
                </Link>
              </section>
            </>
          )}
        </div>
      </main>
      {USE_MOCKS && (
        <footer className="a-gutter" style={{ position: "relative", zIndex: "1", padding: "20px 64px 28px", fontSize: "13.5px", lineHeight: "1.4", color: "var(--ivory-3)" }}>
          Sample data: the names and emails on this page are examples.
        </footer>
      )}
    </div>
  )
}
