import { Navigate, Outlet, useLocation } from 'react-router-dom'
import { useAuth } from '../../features/auth/AuthContext.jsx'
import { homeFor, paths } from './paths.js'

// Route guard (FE-PLAT-03): signed out goes to sign in, a wrong role goes to its own home.
export default function RequireRole({ roles }) {
  const { user, ready, sessionEnded } = useAuth()
  const location = useLocation()
  if (!ready) return null
  if (!user) return <Navigate to={paths.signIn} replace state={{ from: location.pathname + location.search, expired: sessionEnded }} />
  // signed in with Keycloak but no AIVES role in the token: Sign in explains it
  if (!user.role) return <Navigate to={paths.signIn} replace />
  if (roles && !roles.includes(user.role)) return <Navigate to={homeFor(user.role)} replace />
  return <Outlet />
}

// Signed-in users who open a signed-out page go to their home instead
export function GuestOnly() {
  const { user, ready } = useAuth()
  if (!ready) return null
  if (user?.role) return <Navigate to={homeFor(user.role)} replace />
  return <Outlet />
}
