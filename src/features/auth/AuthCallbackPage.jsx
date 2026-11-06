import { useEffect } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { useAuth as useOidc } from 'react-oidc-context'
import { homeFor, paths } from '../../app/routes/paths.js'
import { roleOf, decodeJwt } from './oidc.js'

// Keycloak sends the browser back here with ?code=...&state=...; react-oidc-context exchanges the
// code for tokens while isLoading is true. Outside RequireRole and GuestOnly on purpose: neither may
// redirect before the exchange has finished.
export default function AuthCallbackPage() {
  const { user, isLoading, error } = useOidc()
  const navigate = useNavigate()
  const signedIn = !isLoading && !error && !!user?.access_token

  useEffect(() => {
    if (isLoading) return
    if (signedIn) {
      const role = roleOf(decodeJwt(user.access_token))
      // a user without an AIVES role goes to Sign in, which explains it
      navigate(role ? (user.state?.from ?? homeFor(role)) : paths.signIn, { replace: true })
    } else if (!error) {
      navigate(paths.signIn, { replace: true }) // opened by hand, no code to exchange
    }
  }, [isLoading, signedIn, error, user, navigate])

  return (
    <main className="a-gutter" style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '0 64px' }}>
      {error ? (
        <section role="alert" style={{ maxWidth: '460px', display: 'flex', flexDirection: 'column', gap: '16px' }}>
          <h1 style={{ fontSize: '24px', fontWeight: '500', lineHeight: '1.3', letterSpacing: '-0.005em' }}>
            We could not finish signing you in
          </h1>
          <p style={{ fontSize: '16px', lineHeight: '1.5', color: 'var(--ivory-2)' }}>
            The sign-in did not complete. Go back and try again.
          </p>
          <Link to={paths.signIn} className="a-btn a-btn-primary" style={{ alignSelf: 'flex-start', height: '52px', display: 'inline-flex', alignItems: 'center', padding: '0 24px', borderRadius: '14px', background: 'var(--ivory)', color: 'var(--night-indigo)', fontSize: '16px', fontWeight: '500', textDecoration: 'none' }}>
            Back to sign in
          </Link>
        </section>
      ) : (
        <p role="status" style={{ fontSize: '16px', color: 'var(--ivory-2)' }}>Signing you in…</p>
      )}
    </main>
  )
}
