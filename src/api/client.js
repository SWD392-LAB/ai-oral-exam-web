// Shared HTTP client (FE-PLAT-02).
// Every service calls request(); with VITE_USE_MOCKS=true the same call is answered
// by src/mocks/server.js, so switching to the real API is one line in .env.local.
// The bearer token is the Keycloak access token kept by the UserManager (features/auth/oidc.js).
import { userManager } from '../features/auth/oidc.js'

const BASE_URL = import.meta.env.VITE_API_BASE_URL ?? 'http://localhost:5080'
export const USE_MOCKS = import.meta.env.VITE_USE_MOCKS !== 'false'

// Every API error has one shape: { code, message, traceId, details } (README, section 4).
export class ApiError extends Error {
  constructor({ code, message, traceId = null, details = null }, status = 0) {
    super(message)
    this.code = code
    this.traceId = traceId
    this.details = details
    this.status = status
  }
}

function withQuery(path, query) {
  if (!query) return path
  const qs = new URLSearchParams(Object.entries(query).filter(([, v]) => v !== undefined && v !== null && v !== ''))
  const s = qs.toString()
  return s ? `${path}?${s}` : path
}

// AuthContext registers what happens when the server stops accepting the token
let onSessionEnded = () => {}
export const setSessionEndedHandler = (fn) => { onSessionEnded = fn }

async function accessToken() {
  try { return (await userManager.getUser())?.access_token ?? null } catch { return null }
}

// Several requests can get a 401 together: they share one renewal
let renewing = null
const renew = () => {
  renewing ??= userManager.signinSilent().then((u) => u?.access_token ?? null).catch(() => null).finally(() => { renewing = null })
  return renewing
}

export async function request(method, path, options = {}) {
  const token = await accessToken()
  try {
    return await send(method, path, options, token)
  } catch (err) {
    // Sign-in failures carry no token: only a 401 on a request that had one means the session is over.
    if (err.status !== 401 || !token) throw err
    // The token may just have expired: renew with the refresh token and try once more.
    const fresh = await renew()
    if (fresh && fresh !== token) {
      try {
        return await send(method, path, options, fresh)
      } catch (err2) {
        if (err2.status !== 401) throw err2
      }
    }
    await userManager.removeUser().catch(() => {})
    onSessionEnded()
    throw err
  }
}

async function send(method, path, { body, query } = {}, token) {
  const url = withQuery(path, query)

  if (USE_MOCKS) {
    const { handleMock } = await import('../mocks/server.js')
    return handleMock(method, url, body, token)
  }

  const headers = { Accept: 'application/json' }
  if (token) headers.Authorization = `Bearer ${token}`
  const isForm = body instanceof FormData
  if (body !== undefined && !isForm) headers['Content-Type'] = 'application/json'

  let res
  try {
    res = await fetch(BASE_URL + url, {
      method,
      headers,
      body: body === undefined ? undefined : isForm ? body : JSON.stringify(body),
    })
  } catch {
    throw new ApiError({ code: 'network_error', message: 'AIVES could not reach the server. Check your connection and try again.' })
  }

  if (res.status === 204) return null
  const data = await res.json().catch(() => null)
  if (!res.ok) {
    throw new ApiError(data?.code ? data : { code: 'http_' + res.status, message: 'Something went wrong. Try again.' }, res.status)
  }
  return data
}

export async function download(path, defaultFileName = 'download.csv') {
  const token = await accessToken()
  let res
  try {
    res = await fetch(BASE_URL + path, {
      method: 'GET',
      headers: token ? { Authorization: `Bearer ${token}` } : {},
    })
  } catch {
    throw new ApiError({ code: 'network_error', message: 'Could not reach server.' })
  }
  if (!res.ok) {
    const err = await res.json().catch(() => null)
    throw new ApiError(err?.code ? err : { code: 'http_' + res.status, message: 'Export failed.' }, res.status)
  }
  const blob = await res.blob()
  let filename = defaultFileName
  const disposition = res.headers.get('content-disposition')
  if (disposition && disposition.includes('filename=')) {
    const match = disposition.match(/filename[^;=\n]*=((['"]).*?\2|[^;\n]*)/)
    if (match?.[1]) filename = match[1].replace(/['"]/g, '').trim()
  }
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  document.body.appendChild(a)
  a.click()
  a.remove()
  URL.revokeObjectURL(url)
  return { fileName: filename }
}

export const api = {
  get: (path, query) => request('GET', path, { query }),
  post: (path, body) => request('POST', path, { body }),
  put: (path, body) => request('PUT', path, { body }),
  patch: (path, body) => request('PATCH', path, { body }),
  del: (path) => request('DELETE', path),
  download: (path, defaultFileName) => download(path, defaultFileName),
}
