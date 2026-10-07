import { Link } from 'react-router-dom'
import { useAuth } from '../features/auth/AuthContext.jsx'
import { paths } from '../app/routes/paths.js'

// Top bars from DESIGN-SYSTEM section 10. There is never a side rail.

const navStyle = (current, night) => ({
  display: 'flex', alignItems: 'center', height: '100%', ...(night ? { minHeight: '44px' } : {}), fontSize: '15px',
  fontWeight: current ? '500' : '400',
  color: current ? (night ? 'var(--ivory)' : 'var(--night-indigo)') : night ? 'var(--ivory-2)' : 'var(--ink-2)',
  textDecoration: 'none', whiteSpace: 'nowrap',
  ...(current ? { boxShadow: `inset 0 -2px 0 ${night ? 'var(--ivory)' : 'var(--night-indigo)'}` } : {}),
})

function SignOut({ color }) {
  const { signOut } = useAuth()
  return (
    <Link className="a-link" to={paths.signIn} onClick={() => signOut()} style={{ color }}>
      Sign out
    </Link>
  )
}

const LECTURER_NAV = [
  ['sessions', paths.sessions, 'Exam sessions', 'Sessions'],
  ['results', paths.results, 'Results and review', 'Results'],
  ['statistics', paths.statistics, 'Class statistics', 'Statistics'],
  ['account', paths.account, 'Account settings', 'Account'],
]
const ADMIN_NAV = [
  ['users', paths.adminUsers, 'Users'],
  ['courses', paths.adminCourses, 'Courses'],
  ['ai', paths.adminAi, 'AI and speech'],
  ['audit', paths.adminAudit, 'Audit log'],
  ['account', paths.account, 'Account settings'],
]

// Moonlight bar for lecturers and administrators
export function StaffTopBar({ current, style }) {
  const { user } = useAuth()
  const admin = user?.role === 'Administrator'
  return (
    <header className="a-top a-gutter" style={{ height: '64px', padding: '0 40px', display: 'flex', alignItems: 'center', gap: '44px', borderBottom: '1px solid var(--line)', background: 'var(--moonlight-bar)', ...style }}>
      <Link to={admin ? paths.adminUsers : paths.sessions} style={{ fontSize: '19px', fontWeight: '600', letterSpacing: '0.06em', color: 'var(--night-indigo)', textDecoration: 'none', lineHeight: '64px' }}>
        AIVES
      </Link>
      <nav className="a-top-nav" aria-label={admin ? 'Administrator' : 'Lecturer'} style={{ alignSelf: 'stretch', display: 'flex', gap: '30px', minWidth: '0' }}>
        {admin
          ? ADMIN_NAV.map(([key, to, label]) => (
              <Link key={key} className="a-nav" to={to} aria-current={key === current ? 'page' : undefined} style={navStyle(key === current)}>
                {label}
              </Link>
            ))
          : LECTURER_NAV.map(([key, to, label, short]) => (
              <Link key={key} className="a-nav" to={to} aria-current={key === current ? 'page' : undefined} style={navStyle(key === current)}>
                <span className="a-hide-sm">{label}</span>
                <span className="a-nav-short">{short}</span>
              </Link>
            ))}
      </nav>
      <div style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: '20px', whiteSpace: 'nowrap', fontSize: '14px' }}>
        <span style={{ color: 'var(--ink-2)' }}>
          <span style={{ fontWeight: '500', color: 'var(--night-indigo)' }}>{user?.fullName}</span>
          <span className="a-hide-sm">{' '}· {user?.role}</span>
        </span>
        <SignOut color="var(--night-indigo)" />
      </div>
    </header>
  )
}

// Night bar for student pages outside the exam
export function StudentTopBar({ current, style }) {
  const { user } = useAuth()
  return (
    <header className="a-top a-gutter" style={{ position: 'relative', zIndex: '2', height: '72px', padding: '0 64px', display: 'flex', alignItems: 'center', gap: '44px', borderBottom: '1px solid var(--night-line)', ...style }}>
      <Link to={paths.studentHome} style={{ fontSize: '19px', fontWeight: '600', letterSpacing: '0.06em', color: 'var(--ivory)', textDecoration: 'none', lineHeight: '72px' }}>
        AIVES
      </Link>
      <nav className="a-top-nav" aria-label="Student" style={{ alignSelf: 'stretch', display: 'flex', gap: '30px', minWidth: '0' }}>
        <Link className="a-nav" to={paths.studentHome} aria-current={current === 'home' ? 'page' : undefined} style={navStyle(current === 'home', true)}>
          My exams
        </Link>
        <Link className="a-nav" to={paths.account} aria-current={current === 'account' ? 'page' : undefined} style={navStyle(current === 'account', true)}>
          Account settings
        </Link>
      </nav>
      <div style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: '20px', whiteSpace: 'nowrap', fontSize: '14px' }}>
        <span style={{ color: 'var(--ivory-2)' }}>
          <span style={{ fontWeight: '500', color: 'var(--ivory)' }}>{user?.fullName}</span>
          {user?.studentCode && <span className="a-hide-sm">{' '}· {user.studentCode}</span>}
        </span>
        <SignOut color="var(--ivory)" />
      </div>
    </header>
  )
}
