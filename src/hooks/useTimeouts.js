import { useCallback, useEffect, useRef } from 'react'

// setTimeout that is cleared when the page unmounts; clear() drops every pending one.
export function useTimeouts() {
  const ids = useRef(new Set())
  useEffect(() => {
    const set = ids.current
    return () => { set.forEach(clearTimeout); set.clear() }
  }, [])
  const later = useCallback((fn, ms) => {
    const id = setTimeout(() => { ids.current.delete(id); fn() }, ms)
    ids.current.add(id)
    return id
  }, [])
  const clear = useCallback(() => { ids.current.forEach(clearTimeout); ids.current.clear() }, [])
  return { later, clear }
}
