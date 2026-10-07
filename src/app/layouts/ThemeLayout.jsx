import { useLayoutEffect } from 'react'
import { Outlet, useLocation } from 'react-router-dom'
import { useAuth } from '../../features/auth/AuthContext.jsx'

// Sets html[data-theme] so the ground, focus ring and selection follow the portal:
// Night for students and signed-out pages, Moonlight for lecturers and administrators.
// theme="role" picks it from the signed-in user (Account settings).
export default function ThemeLayout({ theme }) {
  const { user } = useAuth()
  const { pathname } = useLocation()
  const resolved = theme === 'role' ? (user?.role === 'Student' || !user ? 'night' : 'moonlight') : theme

  useLayoutEffect(() => {
    document.documentElement.dataset.theme = resolved
  }, [resolved])

  // every page opens at the top, the way a new page load would
  useLayoutEffect(() => {
    window.scrollTo(0, 0)
  }, [pathname])

  return <Outlet />
}
