// Shared HTTP client (FE-PLAT-02).
// Every service calls request(); with VITE_USE_MOCKS=true the same call is answered
// by src/mocks/server.js, so switching to the real API is one line in .env.local.

const BASE_URL = import.meta.env.VITE_API_BASE_URL ?? 'http://localhost:5080'
export const USE_MOCKS = import.meta.env.VITE_USE_MOCKS !== 'false'

const TOKEN_KEY = 'aives.token'

export const tokenStore = {
  get() {
    try { return localStorage.getItem(TOKEN_KEY) } catch { return null }
  },
  set(token) {
    try {
      if (token) localStorage.setItem(TOKEN_KEY, token)
      else localStorage.removeItem(TOKEN_KEY)
    } catch { /* storage blocked: the session lasts until reload */ }
  },
}

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

export async function request(method, path, { body, query } = {}) {
  const url = withQuery(path, query)

  if (USE_MOCKS) {
    const { handleMock } = await import('../mocks/server.js')
    return handleMock(method, url, body, tokenStore.get())
  }

  const headers = { Accept: 'application/json' }
  const token = tokenStore.get()
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

export const api = {
  get: (path, query) => request('GET', path, { query }),
  post: (path, body) => request('POST', path, { body }),
  put: (path, body) => request('PUT', path, { body }),
  patch: (path, body) => request('PATCH', path, { body }),
  del: (path) => request('DELETE', path),
}
