// One place for every URL in the app, so pages never hard-code a route.
export const paths = {
  signIn: '/sign-in',
  register: '/register',
  forgotPassword: '/forgot-password',
  emailLink: (token = 'demo-setup') => `/email-link/${token}`,
  welcome: '/welcome',
  account: '/account',

  studentHome: '/student',
  lobby: (sessionId) => `/student/sessions/${sessionId}/lobby`,
  attempt: (attemptId) => `/student/attempts/${attemptId}`,
  attemptDone: (attemptId) => `/student/attempts/${attemptId}/done`,
  report: (attemptId) => `/student/attempts/${attemptId}/report`,

  sessions: '/lecturer/sessions',
  newSession: '/lecturer/sessions/new',
  sessionSetup: (sessionId) => `/lecturer/sessions/${sessionId}/setup`,
  sessionStudents: (sessionId) => `/lecturer/sessions/${sessionId}/students`,
  results: '/lecturer/results',
  sessionResults: (sessionId) => `/lecturer/sessions/${sessionId}/results`,
  review: (attemptId) => `/lecturer/attempts/${attemptId}/review`,
  statistics: '/lecturer/statistics',

  adminUsers: '/admin/users',
  adminCourses: '/admin/courses',
  adminAi: '/admin/ai',
  adminAudit: '/admin/audit',
}

export const homeFor = (role) =>
  ({ Student: paths.studentHome, Lecturer: paths.sessions, Administrator: paths.adminUsers })[role] ?? paths.signIn
