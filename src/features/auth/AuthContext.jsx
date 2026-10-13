import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react'
import { AuthProvider as OidcProvider, useAuth as useOidc } from 'react-oidc-context'
import { setSessionEndedHandler } from '../../api/client.js'
import { accountApi } from '../../api/services.js'
import { userFromOidc, userManager } from './oidc.js'

const AuthContext = createContext(null)

// Keeps the signed-in user across pages (FE-PLAT-03). Sign-in is Keycloak (OIDC); this provider
// turns the access token into the user object the screens read: { id, email, fullName, username, role }.
function AuthState({ children }) {
  const oidc = useOidc()
  // true after the server rejected the token, so Sign in can say why the user is there
  const [sessionEnded, setSessionEnded] = useState(false)
  // the username lives in the account, not in the token (Account settings can change it)
  const [username, setUsername] = useState(null)

  useEffect(() => {
    setSessionEndedHandler(() => setSessionEnded(true))
  }, [])

  const base = useMemo(() => userFromOidc(oidc.user), [oidc.user])
  const id = base?.id

  useEffect(() => {
    if (!id) return
    accountApi.get().then((a) => setUsername(a.username ?? null)).catch(() => {})
  }, [id])

  const user = useMemo(() => base && (username ? { ...base, username } : base), [base, username])
  const ready = !oidc.isLoading

  // rejects when Keycloak cannot be reached: the Sign in page says so
  const signIn = useCallback((from) => userManager.signinRedirect({ state: { from } }), [])

  const signOut = useCallback(async () => {
    setUsername(null)
    try {
      await userManager.signoutRedirect()
    } catch {
      // Keycloak is not reachable: end the session in this browser anyway
      await userManager.removeUser()
    }
  }, [])

  const value = useMemo(
    () => ({ user, ready, sessionEnded, signIn, signOut, setUsername, authError: oidc.error ?? null }),
    [user, ready, sessionEnded, signIn, signOut, oidc.error],
  )
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

export function AuthProvider({ children }) {
  return (
    <OidcProvider userManager={userManager}>
      <AuthState>{children}</AuthState>
    </OidcProvider>
  )
}

// eslint-disable-next-line react-refresh/only-export-components
export const useAuth = () => useContext(AuthContext)
