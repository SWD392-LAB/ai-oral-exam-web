import { useEffect, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import { paths } from '../../app/routes/paths.js'
import { examConfigApi } from '../../api/services.js'
import { StaffTopBar } from '../../components/TopBar.jsx'

// "New exam session" creates a draft and opens its setup; the draft can be finished later
export default function NewSessionPage() {
  const navigate = useNavigate()
  const started = useRef(false)
  useEffect(() => {
    if (started.current) return
    started.current = true
    examConfigApi.create({ title: '' })
      .then((s) => navigate(paths.sessionSetup(s.id), { replace: true }))
      .catch(() => navigate(paths.sessions, { replace: true }))
  }, [navigate])
  return (
    <div style={{ minHeight: '100vh', display: 'flex', flexDirection: 'column' }}>
      <StaffTopBar current="sessions" />
    </div>
  )
}
