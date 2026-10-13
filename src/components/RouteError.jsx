import { useLayoutEffect } from 'react'
import { isRouteErrorResponse, Link, useRouteError } from 'react-router-dom'
import { useAuth } from '../features/auth/AuthContext.jsx'
import { homeFor, paths } from '../app/routes/paths.js'

// Shown by the router when a page crashes while rendering, and for addresses that match no page (404).
// Same layout as the "link no longer works" state of the email link page, on the Night ground.
export default function RouteError() {
  const error = useRouteError()
  const { user, ready } = useAuth()
  const missing = isRouteErrorResponse(error) && error.status === 404
  const home = user ? homeFor(user.role) : paths.signIn

  useLayoutEffect(() => {
    document.documentElement.dataset.theme = 'night'
  }, [])

  // wait until the saved session is checked, so the way home points to the right page
  if (!ready) return null
  return (
    <div style={{ position: "relative", minHeight: "100vh", display: "flex", flexDirection: "column", overflow: "hidden" }}>
      <header className="a-top a-gutter" style={{ position: "relative", zIndex: "2", height: "72px", padding: "0 64px", display: "flex", alignItems: "center", justifyContent: "space-between", gap: "24px", borderBottom: "1px solid var(--night-line)" }}>
        <Link to={home} style={{ fontSize: "19px", fontWeight: "600", letterSpacing: "0.06em", color: "var(--ivory)", textDecoration: "none", lineHeight: "72px" }}>
          AIVES
        </Link>
      </header>
      <main className="a-gutter" style={{ position: "relative", zIndex: "1", flex: "1", width: "100%", maxWidth: "1440px", margin: "0 auto", padding: "88px 64px 72px" }}>
        <section style={{ maxWidth: "580px", display: "flex", flexDirection: "column" }}>
          <h1 className="a-display a-rise" style={{ fontFamily: "Alegreya, Georgia, serif", fontWeight: "500", fontSize: "52px", lineHeight: "1.08", letterSpacing: "-0.012em", textWrap: "balance" }}>
            {missing ? 'This page does not exist' : 'Something went wrong on this page'}
          </h1>
          <p className="a-rise" style={{ marginTop: "22px", maxWidth: "32em", fontSize: "16.5px", lineHeight: "1.55", color: "var(--ivory-2)" }}>
            {missing
              ? 'The address may be mistyped, or the page has moved. Start again from your home page.'
              : 'AIVES ran into an error it did not expect. Reload the page to try again. If it keeps happening, tell your administrator what you were doing.'}
          </p>
          {!missing && import.meta.env.DEV && (
            <p className="a-rise" style={{ marginTop: "16px", fontSize: "13.5px", lineHeight: "1.45", color: "var(--ivory-3)", overflowWrap: "anywhere" }}>
              {String(error?.message ?? error)}
            </p>
          )}
          <div className="a-rise a-stack-sm" style={{ marginTop: "40px", display: "flex", alignItems: "center", gap: "12px", flexWrap: "wrap", animationDelay: "60ms" }}>
            {missing ? (
              <Link to={home} className="a-btn a-btn-primary" style={{ display: "inline-flex", alignItems: "center", justifyContent: "center", height: "52px", padding: "0 24px", borderRadius: "14px", background: "var(--ivory)", color: "var(--night-indigo)", fontSize: "16px", fontWeight: "500", textDecoration: "none", boxShadow: "0 10px 28px -12px rgba(0,0,0,0.55)" }}>
                {user ? 'Go to my home page' : 'Go to sign in'}
              </Link>
            ) : (
              <>
                <button type="button" onClick={() => window.location.reload()} className="a-btn a-btn-primary" style={{ display: "inline-flex", alignItems: "center", justifyContent: "center", height: "52px", padding: "0 24px", borderRadius: "14px", border: "none", background: "var(--ivory)", color: "var(--night-indigo)", fontSize: "16px", fontWeight: "500", cursor: "pointer", boxShadow: "0 10px 28px -12px rgba(0,0,0,0.55)" }}>
                  Reload page
                </button>
                <Link to={home} className="a-btn a-btn-quiet" style={{ display: "inline-flex", alignItems: "center", justifyContent: "center", height: "44px", padding: "0 14px", borderRadius: "10px", color: "var(--ivory-2)", fontSize: "15px", fontWeight: "500", textDecoration: "none" }}>
                  {user ? 'Go to my home page' : 'Go to sign in'}
                </Link>
              </>
            )}
          </div>
        </section>
      </main>
    </div>
  )
}
