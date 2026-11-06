import { useCallback, useEffect, useRef, useState } from 'react'

// Loads data from a service call: { data, error, loading, reload, setData }.
// pollMs re-reads quietly in the background (live counts on the lecturer pages).
export function useLoad(load, deps = [], { pollMs } = {}) {
  const [data, setData] = useState(null)
  const [error, setError] = useState(null)
  const [loading, setLoading] = useState(true)
  const loadRef = useRef(load)
  loadRef.current = load

  const reload = useCallback((quiet = false) => {
    if (!quiet) setLoading(true)
    return loadRef.current()
      .then((d) => { setData(d); setError(null); return d })
      .catch((e) => { setError(e) })
      .finally(() => setLoading(false))
  }, [])

  useEffect(() => {
    reload()
    if (!pollMs) return undefined
    const id = setInterval(() => reload(true), pollMs)
    return () => clearInterval(id)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps)

  return { data, error, loading, reload, setData }
}
