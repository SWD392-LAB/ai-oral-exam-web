// Keycloak (OpenID Connect, Authorization Code + PKCE). One UserManager for the whole app:
// AuthContext hands it to react-oidc-context and api/client.js reads the access token from it.
// The signed-in user is kept by the library in sessionStorage (default), so it lasts for the tab.
import { UserManager } from 'oidc-client-ts'

const env = import.meta.env

// The mock sign-in kept its token here before Keycloak; drop it
try { localStorage.removeItem('aives.token') } catch { /* storage blocked */ }

export const OIDC_AUTHORITY = env.VITE_OIDC_AUTHORITY ?? 'http://localhost:8080/realms/aives'
const ORIGIN = window.location.origin

export const oidcSettings = {
  authority: OIDC_AUTHORITY,
  client_id: env.VITE_OIDC_CLIENT_ID ?? 'aives-web',
  redirect_uri: env.VITE_OIDC_REDIRECT_URI ?? `${ORIGIN}/auth/callback`,
  post_logout_redirect_uri: env.VITE_OIDC_POST_LOGOUT_REDIRECT_URI ?? `${ORIGIN}/sign-in`,
  response_type: 'code',
  scope: env.VITE_OIDC_SCOPE ?? 'openid profile email',
  // renews with the refresh token shortly before the access token (5 minutes) expires
  automaticSilentRenew: true,
}

export const userManager = new UserManager(oidcSettings)

// Account page of the realm (password, sessions): opened in a new tab
export const ACCOUNT_CONSOLE_URL = `${OIDC_AUTHORITY}/account/`

// Payload of a JWT (no signature check: the API verifies tokens, the browser only reads them)
export function decodeJwt(token) {
  try {
    const part = token.split('.')[1].replace(/-/g, '+').replace(/_/g, '/')
    const json = decodeURIComponent(atob(part).split('').map((c) => '%' + c.charCodeAt(0).toString(16).padStart(2, '0')).join(''))
    return JSON.parse(json)
  } catch {
    return {}
  }
}

// Highest first: a user with several roles gets the most powerful one
const ROLE_PRIORITY = ['Administrator', 'Lecturer', 'Student']

// Only the "role" claim counts (string or array, support realm_access.roles fallback)
export function roleOf(claims) {
  const roles = [].concat(claims?.role ?? [], claims?.realm_access?.roles ?? [])
  return ROLE_PRIORITY.find((r) => roles.includes(r)) ?? null
}

// The user object the screens read, built from the access token
export function userFromOidc(oidcUser) {
  if (!oidcUser?.access_token) return null
  const claims = decodeJwt(oidcUser.access_token)
  const profile = oidcUser.profile ?? {}
  const email = claims.email ?? profile.email ?? ''
  const fullName = claims.name ?? profile.name ?? email
  const username = claims.preferred_username ?? profile.preferred_username ?? fullName
  return { id: claims.sub ?? profile.sub, email, fullName, username, role: roleOf(claims) }
}
