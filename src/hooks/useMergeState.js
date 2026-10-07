import { useCallback, useState } from 'react'

// Object state with merge updates, the way the wireframe logic uses setState.
// setState accepts a partial object or a function (prev) => partial.
export function useMergeState(initial) {
  const [state, set] = useState(initial)
  const setState = useCallback((patch) => {
    set((prev) => ({ ...prev, ...(typeof patch === 'function' ? patch(prev) : patch) }))
  }, [])
  return [state, setState]
}
