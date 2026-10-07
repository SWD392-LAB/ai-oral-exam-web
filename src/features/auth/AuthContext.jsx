import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react'
import { tokenStore } from '../../api/client.js'
import { authApi } from '../../api/services.js'

const AuthContext = createContext(null)

// Keeps the signed-in user across pages (FE-PLAT-03)
export function AuthProvider({ children }) {
  const [user, setUser] = useState(null)
  const [ready, setReady] = useState(!tokenStore.get())

  useEffect(() => {
    if (!tokenStore.get()) return
    authApi.me()
      .then(setUser)
      .catch(() => tokenStore.set(null))
      .finally(() => setReady(true))
  }, [])

  const accept = useCallback(({ accessToken, user: u }) => {
    tokenStore.set(accessToken)
    setUser(u)
    return u
  }, [])

  const signIn = useCallback((login, password) => authApi.login(login, password).then(accept), [accept])

  const signInWithGoogle = useCallback(async () => {
    const res = await authApi.google('mock-google-id-token')
    accept(res)
    return res
  }, [accept])

  const signOut = useCallback(async () => {
    try { await authApi.logout() } catch { /* the token is dropped either way */ }
    tokenStore.set(null)
    setUser(null)
  }, [])

  const value = useMemo(() => ({ user, ready, signIn, signInWithGoogle, signOut, setUser }), [user, ready, signIn, signInWithGoogle, signOut])
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

// eslint-disable-next-line react-refresh/only-export-components
export const useAuth = () => useContext(AuthContext)
